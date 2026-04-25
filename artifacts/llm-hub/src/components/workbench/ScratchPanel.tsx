import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HardDrive, RefreshCw, Trash2, Folder, File as FileIcon, Link as LinkIcon, ChevronLeft, AlertTriangle, Loader2 } from "lucide-react";
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
 */
export function ScratchPanel() {
  const queryClient = useQueryClient();
  const [currentPath, setCurrentPath] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingClear, setPendingClear] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery<ScratchListResponse, PanelQueryError>({
    queryKey: ["workbench-scratch", currentPath],
    queryFn: async () => {
      let res: Response;
      try {
        const qs = currentPath ? `?path=${encodeURIComponent(currentPath)}` : "";
        res = await fetch(`/api/workbench/scratch${qs}`, { credentials: "include" });
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
      const res = await fetch(`/api/workbench/scratch?path=${encodeURIComponent(relPath)}`, {
        method: "DELETE",
        credentials: "include",
      });
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
      queryClient.invalidateQueries({ queryKey: ["workbench-scratch"] });
    },
    onError: (err: Error) => {
      setActionError(err.message);
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/workbench/scratch/clear`, {
        method: "POST",
        credentials: "include",
      });
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
  const realEntries = entries.filter(e => !e.isSymlink);
  const symlinkEntries = entries.filter(e => e.isSymlink);

  const onEnter = (entry: ScratchEntry) => {
    if (entry.type !== "directory" || entry.isSymlink) return;
    setCurrentPath(joinPath(currentPath, entry.name));
  };

  const onUp = () => {
    setCurrentPath(parentPath(currentPath));
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2 min-w-0">
          <HardDrive className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs text-[#cdd6f4] font-mono">Scratch</span>
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
            title="Wipe every file you've created in scratch (workspace mirror entries are kept)"
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
          {overQuota && (
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
            {[1, 2, 3].map(i => (
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
                  Your files ({realEntries.length})
                </h4>
                <div className="space-y-0.5">
                  {realEntries.map(entry => (
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
                  These point back to the shared project files and don't count against your quota.
                </div>
                <div className="space-y-0.5">
                  {symlinkEntries.map(entry => (
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
    </div>
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
