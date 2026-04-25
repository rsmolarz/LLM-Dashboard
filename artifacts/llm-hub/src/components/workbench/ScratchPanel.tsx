import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { HardDrive, RefreshCw, Trash2, Folder, File as FileIcon, Link as LinkIcon, ChevronLeft, AlertTriangle, Loader2, Users, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelLoadError, PanelQueryError, asPanelQueryError } from "./PanelLoadError";

type ScratchEntry = {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  sizeBytes: number;
  mtime: number;
  isSymlink: boolean;
  symlinkTarget?: string;
};

type ScratchListResponse = {
  path: string;
  entries: ScratchEntry[];
  quota: { usedBytes: number; capBytes: number; remainingBytes: number };
};

type AdminUsageEntry = {
  userIdHash: string;
  usedBytes: number;
  mtimeMs: number;
  overThreshold: boolean;
};

type AdminUsageResponse = {
  totalBytes: number;
  hostCapBytes: number;
  userCapBytes: number;
  overThresholdPct: number;
  users: AdminUsageEntry[];
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatRelativeTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const secs = Math.round(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function joinPath(parent: string, name: string): string {
  if (!parent) return name;
  return `${parent.replace(/\/+$/, "")}/${name}`;
}

function parentPath(p: string): string {
  if (!p) return "";
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return "";
  return p.slice(0, idx);
}

/**
 * "Manage scratch dir" panel for the Workbench. Surfaces the per-user
 * scratch dir contents (created by the shell + git endpoints), the
 * current quota, and lets the user delete individual entries or wipe
 * the whole scratch back to the symlink-only baseline. This is the
 * UI-side fix for the chicken-and-egg "shell refuses to run because
 * scratch is full, but the only way to clear scratch is to run
 * shell" problem.
 *
 * Admins also get an "All users" toggle that swaps the panel into a
 * cross-user mode: it lists every per-user scratch dir on the host
 * (size + last-active), and clicking one drills into the same
 * list/delete/clear UX as the per-user mode but pointed at that
 * user's scratch via the `/api/admin/scratch?userIdHash=...`
 * endpoints. Non-admins never see the toggle and the admin queries
 * are never issued for them.
 */
export function ScratchPanel() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  // Admin "All users" toggle. Defaults off so admins still see their
  // own scratch by default; flipping on shows the host overview and
  // lets them drill into other users.
  const [adminMode, setAdminMode] = useState<boolean>(false);
  // Hash of the user the admin is currently inspecting (when in
  // adminMode). null means "show the overview list, not a specific
  // user's contents".
  const [adminTargetHash, setAdminTargetHash] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2 min-w-0">
          <HardDrive className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs text-[#cdd6f4] font-mono">Scratch</span>
          {adminMode && (
            <span className="text-[10px] uppercase tracking-wide text-amber-300 font-mono px-1 rounded bg-amber-500/10 border border-amber-500/30">
              Admin
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button
              className={cn(
                "px-2 py-0.5 text-[10px] rounded border inline-flex items-center gap-1",
                adminMode
                  ? "border-amber-500/50 text-amber-300 bg-amber-500/10"
                  : "border-[#313244] text-[#a6adc8] hover:bg-[#313244]"
              )}
              onClick={() => {
                setAdminMode((v) => !v);
                setAdminTargetHash(null);
                queryClient.invalidateQueries({ queryKey: ["workbench-scratch"] });
                queryClient.invalidateQueries({ queryKey: ["admin-scratch-overview"] });
                queryClient.invalidateQueries({ queryKey: ["admin-scratch-user"] });
              }}
              title="Switch between your own scratch and the host-wide admin view"
            >
              {adminMode ? (
                <>
                  <UserIcon className="h-3 w-3" /> My scratch
                </>
              ) : (
                <>
                  <Users className="h-3 w-3" /> All users
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {adminMode ? (
        adminTargetHash ? (
          <UserScratchView
            mode="admin"
            targetHash={adminTargetHash}
            onBackToOverview={() => setAdminTargetHash(null)}
          />
        ) : (
          <AdminOverview onPickUser={(hash) => setAdminTargetHash(hash)} />
        )
      ) : (
        <UserScratchView mode="self" />
      )}
    </div>
  );
}

/**
 * Admin-only overview: hits `GET /api/admin/scratch` (no params) and
 * shows the per-user breakdown. Each row is a button that drills into
 * that user's scratch dir.
 */
function AdminOverview({ onPickUser }: { onPickUser: (hash: string) => void }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery<AdminUsageResponse, PanelQueryError>({
    queryKey: ["admin-scratch-overview"],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`/api/admin/scratch`, { credentials: "include" });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        throw new PanelQueryError(reason, "NETWORK_ERROR");
      }
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof body?.error === "string" ? body.error : `Failed to load admin scratch overview (HTTP ${res.status})`;
        const code = typeof body?.code === "string" ? body.code : `HTTP_${res.status}`;
        throw new PanelQueryError(reason, code);
      }
      return body as AdminUsageResponse;
    },
    retry: false,
  });
  const queryError = asPanelQueryError(error);
  const users = data?.users ?? [];

  return (
    <>
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-[#313244] bg-[#181825]">
        <button
          className="p-1 rounded hover:bg-[#313244] text-[#6c7086]"
          onClick={() => refetch()}
          title="Refresh"
          disabled={isFetching}
        >
          <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
        </button>
      </div>

      {data && (
        <div className="px-3 py-2 border-b border-[#313244] bg-[#181825] text-[11px] text-[#a6adc8]">
          <div>
            Host total: <span className="font-mono text-[#cdd6f4]">{formatBytes(data.totalBytes)}</span>
            {" of "}
            <span className="font-mono text-[#cdd6f4]">{formatBytes(data.hostCapBytes)}</span>
            {" cap • per-user cap "}
            <span className="font-mono text-[#cdd6f4]">{formatBytes(data.userCapBytes)}</span>
          </div>
          <div className="text-[10px] text-[#6c7086] mt-0.5">
            Each row is identified by a hashed user id (the raw user id is never exposed here).
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 w-full bg-[#313244] rounded animate-pulse" />
            ))}
          </div>
        ) : queryError ? (
          <PanelLoadError
            what="admin scratch overview"
            message={queryError.message}
            code={queryError.code}
            onRetry={() => refetch()}
          />
        ) : users.length === 0 ? (
          <div className="text-center text-[#585b70] text-xs py-6">
            No per-user scratch dirs on this host yet.
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {users.map((u) => (
              <button
                key={u.userIdHash}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-left hover:bg-[#313244]"
                onClick={() => onPickUser(u.userIdHash)}
                title={`Inspect ${u.userIdHash}`}
              >
                <UserIcon className="h-3 w-3 text-blue-400 shrink-0" />
                <span className="font-mono truncate text-[#cdd6f4]">{u.userIdHash}</span>
                <span className={cn(
                  "ml-auto text-[10px] tabular-nums font-mono shrink-0",
                  u.overThreshold ? "text-yellow-400" : "text-[#a6adc8]",
                )}>
                  {formatBytes(u.usedBytes)}
                </span>
                <span className="text-[10px] text-[#6c7086] tabular-nums w-16 text-right shrink-0">
                  {formatRelativeTime(u.mtimeMs)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Renders the list/delete/clear UX against either the caller's own
 * scratch dir (`mode="self"`) or another user's scratch dir keyed by
 * `targetHash` (`mode="admin"`). Shares one component so the two
 * views stay visually consistent and bug fixes don't have to be
 * applied twice.
 */
function UserScratchView({
  mode,
  targetHash,
  onBackToOverview,
}: {
  mode: "self" | "admin";
  targetHash?: string;
  onBackToOverview?: () => void;
}) {
  const queryClient = useQueryClient();
  const [currentPath, setCurrentPath] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingClear, setPendingClear] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isAdminMode = mode === "admin";
  const adminQuery = isAdminMode && targetHash
    ? `userIdHash=${encodeURIComponent(targetHash)}`
    : "";
  const listUrl = isAdminMode
    ? `/api/admin/scratch?${adminQuery}${currentPath ? `&path=${encodeURIComponent(currentPath)}` : ""}`
    : `/api/workbench/scratch${currentPath ? `?path=${encodeURIComponent(currentPath)}` : ""}`;
  const queryKey = isAdminMode
    ? (["admin-scratch-user", targetHash, currentPath] as const)
    : (["workbench-scratch", currentPath] as const);

  const { data, isLoading, error, refetch, isFetching } = useQuery<ScratchListResponse, PanelQueryError>({
    queryKey,
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(listUrl, { credentials: "include" });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        throw new PanelQueryError(reason, "NETWORK_ERROR");
      }
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof body?.error === "string" ? body.error : `Failed to load scratch dir (HTTP ${res.status})`;
        const code = typeof body?.code === "string" ? body.code : `HTTP_${res.status}`;
        throw new PanelQueryError(reason, code);
      }
      return body as ScratchListResponse;
    },
    retry: false,
  });

  const queryError = asPanelQueryError(error);

  const deleteMutation = useMutation({
    mutationFn: async (relPath: string) => {
      const url = isAdminMode
        ? `/api/admin/scratch?${adminQuery}&path=${encodeURIComponent(relPath)}`
        : `/api/workbench/scratch?path=${encodeURIComponent(relPath)}`;
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof body?.error === "string" ? body.error : `Delete failed (HTTP ${res.status})`;
        throw new Error(reason);
      }
      return body;
    },
    onSuccess: () => {
      setPendingDelete(null);
      setActionError(null);
      // Invalidate both per-user and admin caches — an admin who
      // deleted from the admin view should still see fresh data
      // when they switch back to "My scratch", and vice versa.
      queryClient.invalidateQueries({ queryKey: ["workbench-scratch"] });
      queryClient.invalidateQueries({ queryKey: ["admin-scratch-user"] });
      queryClient.invalidateQueries({ queryKey: ["admin-scratch-overview"] });
    },
    onError: (err: Error) => {
      setActionError(err.message);
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const url = isAdminMode
        ? `/api/admin/scratch/clear?${adminQuery}`
        : `/api/workbench/scratch/clear`;
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof body?.error === "string" ? body.error : `Clear failed (HTTP ${res.status})`;
        throw new Error(reason);
      }
      return body;
    },
    onSuccess: () => {
      setPendingClear(false);
      setActionError(null);
      // Drop back to root after wipe — the path the user was viewing
      // may no longer exist if they cleared from inside a subdir.
      setCurrentPath("");
      queryClient.invalidateQueries({ queryKey: ["workbench-scratch"] });
      queryClient.invalidateQueries({ queryKey: ["admin-scratch-user"] });
      queryClient.invalidateQueries({ queryKey: ["admin-scratch-overview"] });
    },
    onError: (err: Error) => {
      setActionError(err.message);
    },
  });

  const quota = data?.quota;
  const usedPct = quota && quota.capBytes > 0
    ? Math.min(100, Math.round((quota.usedBytes / quota.capBytes) * 100))
    : 0;
  const overQuota = !!quota && quota.usedBytes >= quota.capBytes;

  const entries = data?.entries ?? [];
  const realEntries = entries.filter((e) => !e.isSymlink);
  const symlinkEntries = entries.filter((e) => e.isSymlink);

  const onEnter = (entry: ScratchEntry) => {
    if (entry.type !== "directory" || entry.isSymlink) return;
    setCurrentPath(joinPath(currentPath, entry.name));
  };

  const onUp = () => {
    setCurrentPath(parentPath(currentPath));
  };

  return (
    <>
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2 min-w-0">
          {isAdminMode && onBackToOverview && (
            <button
              className="p-0.5 rounded hover:bg-[#313244] text-[#a6adc8]"
              onClick={onBackToOverview}
              title="Back to all users"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          )}
          {isAdminMode && targetHash && (
            <span className="text-[10px] text-amber-300 font-mono truncate" title={targetHash}>
              {targetHash}
            </span>
          )}
          <span className="text-[10px] text-[#6c7086] font-mono truncate">
            /{currentPath || ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086]"
            onClick={() => refetch()}
            title="Refresh"
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </button>
          <button
            className={cn(
              "px-2 py-0.5 text-[10px] rounded border",
              pendingClear
                ? "border-red-500/50 text-red-300 bg-red-500/10"
                : "border-[#313244] text-[#a6adc8] hover:bg-[#313244]"
            )}
            onClick={() => {
              if (pendingClear) {
                clearMutation.mutate();
              } else {
                setPendingClear(true);
                setActionError(null);
              }
            }}
            disabled={clearMutation.isPending}
            title={
              isAdminMode
                ? "Wipe every file this user created in scratch (workspace mirror entries are kept)"
                : "Wipe every file you've created in scratch (workspace mirror entries are kept)"
            }
          >
            {clearMutation.isPending ? (
              <span className="inline-flex items-center gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" /> Clearing…</span>
            ) : pendingClear ? (
              "Confirm clear all"
            ) : (
              "Clear scratch"
            )}
          </button>
          {pendingClear && !clearMutation.isPending && (
            <button
              className="px-1.5 py-0.5 text-[10px] rounded text-[#6c7086] hover:bg-[#313244]"
              onClick={() => setPendingClear(false)}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {quota && (
        <div className="px-3 py-2 border-b border-[#313244] bg-[#181825]">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-[#a6adc8]">
              {formatBytes(quota.usedBytes)} of {formatBytes(quota.capBytes)} used
            </span>
            <span className={cn(
              "font-mono",
              overQuota ? "text-red-400" : usedPct >= 80 ? "text-yellow-400" : "text-[#6c7086]"
            )}>
              {usedPct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded bg-[#313244] overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                overQuota ? "bg-red-500" : usedPct >= 80 ? "bg-yellow-500" : "bg-blue-500"
              )}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          {overQuota && !isAdminMode && (
            <div className="mt-2 text-[11px] text-red-300 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Scratch is full. Shell and git commands are blocked until you free space.
                Delete entries below or use "Clear scratch" to wipe everything you created.
              </span>
            </div>
          )}
        </div>
      )}

      {actionError && (
        <div className="px-3 py-1.5 border-b border-[#313244] bg-red-500/10 text-red-300 text-[11px] flex items-start gap-2">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button
            className="text-[10px] text-red-300/80 hover:text-red-300"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 w-full bg-[#313244] rounded animate-pulse" />
            ))}
          </div>
        ) : queryError ? (
          <PanelLoadError
            what="scratch dir"
            message={queryError.message}
            code={queryError.code}
            onRetry={() => refetch()}
          />
        ) : (
          <div className="p-2 space-y-2">
            {currentPath && (
              <button
                className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs text-[#a6adc8] hover:bg-[#313244]"
                onClick={onUp}
              >
                <ChevronLeft className="h-3 w-3" />
                <span>Up to {parentPath(currentPath) || "/"}</span>
              </button>
            )}

            {realEntries.length === 0 && symlinkEntries.length === 0 && (
              <div className="text-center text-[#585b70] text-xs py-6">
                Nothing here yet.
              </div>
            )}

            {realEntries.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-wide text-[#6c7086] mb-1 px-1">
                  {isAdminMode ? "User files" : "Your files"} ({realEntries.length})
                </h4>
                <div className="space-y-0.5">
                  {realEntries.map((entry) => (
                    <ScratchRow
                      key={entry.name}
                      entry={entry}
                      currentPath={currentPath}
                      onEnter={() => onEnter(entry)}
                      pendingDelete={pendingDelete === joinPath(currentPath, entry.name)}
                      onRequestDelete={() => {
                        setActionError(null);
                        setPendingDelete(joinPath(currentPath, entry.name));
                      }}
                      onConfirmDelete={() => deleteMutation.mutate(joinPath(currentPath, entry.name))}
                      onCancelDelete={() => setPendingDelete(null)}
                      isDeleting={deleteMutation.isPending && pendingDelete === joinPath(currentPath, entry.name)}
                    />
                  ))}
                </div>
              </div>
            )}

            {symlinkEntries.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-wide text-[#6c7086] mb-1 px-1 mt-3">
                  Workspace mirror ({symlinkEntries.length})
                </h4>
                <div className="text-[10px] text-[#585b70] px-1 mb-1">
                  These point back to the shared project files and don't count against the quota.
                </div>
                <div className="space-y-0.5">
                  {symlinkEntries.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[#6c7086]"
                    >
                      <LinkIcon className="h-3 w-3 shrink-0" />
                      <span className="font-mono truncate flex-1">{entry.name}</span>
                      <span className="text-[10px] text-[#585b70] truncate">
                        → {entry.symlinkTarget || ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function ScratchRow({
  entry,
  currentPath,
  onEnter,
  pendingDelete,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  isDeleting,
}: {
  entry: ScratchEntry;
  currentPath: string;
  onEnter: () => void;
  pendingDelete: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  isDeleting: boolean;
}) {
  const Icon = entry.type === "directory" ? Folder : FileIcon;
  const navigable = entry.type === "directory" && !entry.isSymlink;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
        pendingDelete ? "bg-red-500/10" : "hover:bg-[#313244]"
      )}
    >
      {navigable ? (
        <button
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
          onClick={onEnter}
        >
          <Icon className="h-3 w-3 text-blue-400 shrink-0" />
          <span className="font-mono truncate text-[#cdd6f4]">{entry.name}</span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Icon className={cn("h-3 w-3 shrink-0", entry.type === "directory" ? "text-blue-400" : "text-[#a6adc8]")} />
          <span className="font-mono truncate text-[#cdd6f4]">{entry.name}</span>
        </div>
      )}
      <span className="text-[10px] text-[#6c7086] tabular-nums">
        {formatBytes(entry.sizeBytes)}
      </span>
      {pendingDelete ? (
        <div className="flex items-center gap-1 ml-1">
          <button
            className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
            onClick={onConfirmDelete}
            disabled={isDeleting}
            title={`Delete ${joinPath(currentPath, entry.name)}`}
          >
            {isDeleting ? (
              <span className="inline-flex items-center gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" /> Deleting…</span>
            ) : (
              "Confirm"
            )}
          </button>
          <button
            className="px-1.5 py-0.5 text-[10px] rounded text-[#6c7086] hover:bg-[#313244]"
            onClick={onCancelDelete}
            disabled={isDeleting}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="p-1 rounded hover:bg-red-500/20 text-[#6c7086] hover:text-red-300"
          onClick={onRequestDelete}
          title={`Delete ${entry.name}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default ScratchPanel;
