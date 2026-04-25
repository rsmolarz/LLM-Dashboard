import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Terminal, RefreshCw, Play, Search, Copy, Loader2,
  Trash2, History, X, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useSelectedProject } from "@/hooks/useSelectedProject";
import { PanelLoadError } from "@/components/workbench/PanelLoadError";
import {
  SandboxBlockedNotice,
  SandboxContainedNotice,
  parseSandboxContainment,
  type ShellScope,
  type SandboxContainmentNotice,
} from "@/components/workbench/SandboxNotices";
import { ScratchQuotaBar, parseScratchQuota, broadcastScratchQuota, type ScratchQuota } from "@/components/workbench/ScratchQuotaBar";
import { useAuth } from "@workspace/replit-auth-web";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export type ShellPanelVariant = "default" | "claude";

type ShellEntry = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timestamp: number;
  // OS-level sandbox containment — surfaces when nsjail (or the
  // platform sandbox) refuses a write that escapes the project
  // boundary (e.g. EROFS / EACCES on a system path).
  sandboxContained?: SandboxContainmentNotice;
  // Logical sandbox refusal — surfaces when the server's per-user
  // scratch resolver refuses a write through a host symlink or other
  // path-containment escape, and returns a user-facing reason
  // instead of opaque stderr.
  sandboxBlocked?: string;
  // Sub-case of sandboxBlocked: the per-user scratch quota is full,
  // so the notice swaps in the one-click "free space" affordance
  // (open the Scratch panel / clear scratch) instead of the generic
  // path-containment guidance. Only surfaced when the host page
  // opts in via `surfaceQuotaExceeded`.
  quotaExceeded?: boolean;
  scope?: ShellScope;
};

type ShellMutationResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      exitCode: number;
      sandboxContained?: SandboxContainmentNotice;
      sandboxBlocked?: string;
      quotaExceeded?: boolean;
      scope?: ShellScope;
      quota?: ScratchQuota;
    }
  | { ok: false; error: { message: string; code: string }; quota?: ScratchQuota };

// One row in the persisted shell history list, as returned by
// GET /api/workbench/shell-history. The History sidebar renders these
// directly and uses `id` to call the per-entry DELETE endpoint.
type ShellHistoryEntry = { id: number; command: string; createdAt: string };

// Compact "5m ago" / "2d ago" label so the sidebar list stays narrow.
// Falls through to a date for anything older than a week.
function formatRelativeTimestamp(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const deltaMs = Date.now() - t;
  if (deltaMs < 0) return "just now";
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  try {
    return new Date(t).toLocaleDateString();
  } catch {
    return "";
  }
}

// Variant-specific styling. The two host pages (Workbench and
// ClaudeWorkbench) have slightly different chrome — the standard
// workbench uses Catppuccin surface tokens while the Claude workbench
// leans on translucent white overlays. We absorb that difference here
// so the rest of the component stays variant-agnostic.
type VariantStyles = {
  toolbarBtn: string;
  historyBtnActive: string;
  historyBtnInactive: string;
  toolbarBtnHover: string;
  sidebarEntryHover: string;
  emptyText: string;
};

const VARIANT_STYLES: Record<ShellPanelVariant, VariantStyles> = {
  default: {
    toolbarBtn: "hover:bg-[#313244] text-[#6c7086]",
    historyBtnActive: "text-[#89b4fa] bg-[#313244]",
    historyBtnInactive: "text-[#6c7086]",
    toolbarBtnHover: "hover:bg-[#313244]",
    sidebarEntryHover: "hover:bg-[#313244]",
    emptyText: "text-[#585b70]",
  },
  claude: {
    toolbarBtn: "hover:bg-white/5 text-white/40",
    historyBtnActive: "text-[#89b4fa] bg-white/10",
    historyBtnInactive: "text-white/40",
    toolbarBtnHover: "hover:bg-white/5",
    sidebarEntryHover: "hover:bg-white/10",
    emptyText: "text-[#6c7086]",
  },
};

type ShellHistorySidebarProps = {
  entries: ShellHistoryEntry[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  filter: string;
  onFilterChange: (v: string) => void;
  onRefresh: () => void;
  onClose: () => void;
  onRun: (cmd: string) => void;
  onCopy: (entry: ShellHistoryEntry) => void;
  onDelete: (entry: ShellHistoryEntry) => void;
  copiedId: number | null;
  styles: VariantStyles;
};

// Persistent shell history browser. Renders inside the shell panel as
// a left-side sidebar so the user can keep an eye on the live
// transcript while picking a past command to re-run. The component is
// purely presentational — all data + state lives in `ShellPanel`.
function ShellHistorySidebar({
  entries,
  totalCount,
  loading,
  error,
  filter,
  onFilterChange,
  onRefresh,
  onClose,
  onRun,
  onCopy,
  onDelete,
  copiedId,
  styles,
}: ShellHistorySidebarProps) {
  return (
    <div
      className="w-72 shrink-0 flex flex-col border-r border-[#313244] bg-[#11111b]"
      data-testid="shell-history-sidebar"
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-1.5 text-[11px] text-[#cdd6f4]">
          <History className="h-3 w-3 text-[#89b4fa]" />
          <span className="font-mono">History</span>
          <span className="text-[#6c7086]">({totalCount})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className={cn("p-1 rounded", styles.toolbarBtn)}
            onClick={onRefresh}
            title="Refresh history"
            data-testid="shell-history-refresh"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
          <button
            className={cn("p-1 rounded", styles.toolbarBtn)}
            onClick={onClose}
            title="Close history"
            data-testid="shell-history-close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="px-2 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-[#1e1e2e] border border-[#313244]">
          <Search className="h-3 w-3 text-[#6c7086]" />
          <input
            value={filter}
            onChange={e => onFilterChange(e.target.value)}
            placeholder="Filter commands..."
            className="flex-1 bg-transparent text-[11px] text-[#cdd6f4] font-mono outline-none placeholder:text-[#585b70]"
            data-testid="shell-history-filter"
          />
          {filter && (
            <button
              onClick={() => onFilterChange("")}
              className="text-[#6c7086] hover:text-[#cdd6f4]"
              title="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto" data-testid="shell-history-list">
        {error && (
          <div className="m-2 p-2 rounded text-[11px] bg-[#1e1e2e] border border-[#f38ba8]/40 text-[#f38ba8]">
            {error}
          </div>
        )}
        {loading && totalCount === 0 && !error && (
          <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-[#6c7086]">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Loading...</span>
          </div>
        )}
        {!loading && totalCount === 0 && !error && (
          <div className="px-3 py-6 text-center text-[11px] text-[#6c7086]">
            No saved commands yet. Run something in the shell and it will appear here.
          </div>
        )}
        {totalCount > 0 && entries.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-[#6c7086]">
            No commands match &quot;{filter}&quot;.
          </div>
        )}
        {entries.map(entry => (
          <div
            key={entry.id}
            className="group px-2 py-1.5 border-b border-[#313244]/50 hover:bg-[#1e1e2e]"
            data-testid="shell-history-entry"
          >
            <div className="flex items-start justify-between gap-1">
              <button
                className="flex-1 min-w-0 text-left font-mono text-[11px] text-[#cdd6f4] hover:text-[#a6e3a1] truncate"
                onClick={() => onRun(entry.command)}
                title={`Re-run: ${entry.command}`}
                data-testid="shell-history-rerun"
              >
                {entry.command}
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  className={cn("p-0.5 rounded text-[#a6e3a1]", styles.sidebarEntryHover)}
                  onClick={() => onRun(entry.command)}
                  title="Re-run this command"
                >
                  <Play className="h-3 w-3" />
                </button>
                <button
                  className={cn("p-0.5 rounded text-[#89b4fa]", styles.sidebarEntryHover)}
                  onClick={() => onCopy(entry)}
                  title="Copy to clipboard"
                  data-testid="shell-history-copy"
                >
                  {copiedId === entry.id ? (
                    <Check className="h-3 w-3 text-[#a6e3a1]" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                <button
                  className={cn("p-0.5 rounded text-[#f38ba8]", styles.sidebarEntryHover)}
                  onClick={() => onDelete(entry)}
                  title="Delete this entry"
                  data-testid="shell-history-delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="text-[10px] text-[#6c7086] font-mono mt-0.5">
              {formatRelativeTimestamp(entry.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export type ShellPanelProps = {
  // localStorage namespace prefix. Use "wb" for the standard workbench
  // and "cw" for the Claude workbench so the two surfaces keep
  // independent transcripts and up-arrow caches per-tab.
  storagePrefix: string;
  // When true, the response's `quotaExceeded` flag is parsed, stored
  // on each transcript entry, and forwarded to `SandboxBlockedNotice`
  // so the user sees the quota-aware affordance. Off by default —
  // the Claude workbench currently opts out.
  surfaceQuotaExceeded?: boolean;
  // Visual variant — toggles between the Catppuccin chrome used by
  // the standard workbench and the translucent-white chrome used by
  // the Claude workbench.
  variant?: ShellPanelVariant;
};

export function ShellPanel({
  storagePrefix,
  surfaceQuotaExceeded = false,
  variant = "default",
}: ShellPanelProps) {
  const styles = VARIANT_STYLES[variant];
  const [input, setInput] = useState("");
  const [history, setHistory] = usePersistedState<ShellEntry[]>(`${storagePrefix}-shell-history`, []);
  // `cmdHistory[0]` is the *most recent* command. The localStorage copy
  // is kept around as an instant cache so the up-arrow works before the
  // server hydrate completes (and as a fallback when the server call
  // fails, e.g. signed out).
  const [cmdHistory, setCmdHistory] = usePersistedState<string[]>(`${storagePrefix}-shell-cmds`, []);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [shellError, setShellError] = useState<{ command: string; message: string; code: string | null } | null>(null);
  // Reverse-i-search state, mirroring bash's Ctrl-R. `matchIndex` walks
  // older as the user keeps pressing Ctrl-R.
  const [search, setSearch] = useState<{ query: string; matchIndex: number } | null>(null);
  const [quota, setQuota] = useState<ScratchQuota | null>(null);
  // Persisted history sidebar state. We hold the full server-returned
  // entries (with id + timestamp) so the sidebar can show "5m ago" and
  // call the per-entry DELETE endpoint. `historyEntries === null` means
  // we haven't tried to load yet; `[]` means the user really has no
  // saved history.
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<ShellHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState("");
  const [copiedHistoryId, setCopiedHistoryId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { project } = useSelectedProject();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  // Track the previous auth state so we can distinguish a real
  // anonymous -> authenticated flip (re-fetch) from the initial settle
  // (still re-fetch, but only once) and from sign-out (clear).
  const prevAuthRef = useRef<boolean | null>(null);

  // Loads (or reloads) the persisted shell history. Used both on mount
  // (to hydrate up-arrow / Ctrl-R) and whenever the user opens the
  // History sidebar — the latter ensures a freshly-signed-in user, or
  // a user who ran commands in another tab, gets a fresh list.
  const loadHistory = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) {
      setHistoryLoading(true);
      setHistoryLoadError(null);
    }
    try {
      const res = await fetch(`/api/workbench/shell-history?limit=500`, { credentials: "include" });
      if (!res.ok) {
        if (!opts.silent) {
          setHistoryLoadError(
            res.status === 401
              ? "Sign in to view your saved shell history."
              : `Couldn't load history (HTTP ${res.status}).`,
          );
        }
        return;
      }
      const body = await res.json().catch(() => null);
      if (!body || !Array.isArray(body.history)) {
        if (!opts.silent) setHistoryLoadError("Couldn't load history (unexpected response).");
        return;
      }
      const entries: ShellHistoryEntry[] = body.history
        .map((h: any) => ({
          id: typeof h?.id === "number" ? h.id : NaN,
          command: typeof h?.command === "string" ? h.command : "",
          createdAt: typeof h?.createdAt === "string" ? h.createdAt : "",
        }))
        .filter((e: ShellHistoryEntry) => Number.isFinite(e.id) && e.command.length > 0);
      setHistoryEntries(entries);
      const cmds = entries.map(e => e.command);
      // Mirror the existing hydrate behaviour: only overwrite the local
      // cache when we actually have entries, so an unauthenticated user
      // (or transient empty response) doesn't wipe the fallback.
      if (cmds.length > 0) setCmdHistory(cmds);
    } catch (err: any) {
      if (!opts.silent) {
        setHistoryLoadError(err?.message || "Couldn't load history.");
      }
    } finally {
      if (!opts.silent) setHistoryLoading(false);
    }
  }, [setCmdHistory]);

  // Hydrate shell history from the server on mount AND whenever auth
  // flips so a user who signs in mid-session sees their saved up-arrow
  // / Ctrl-R history (and the History sidebar) without a page refresh.
  // We delegate to `loadHistory` so the sidebar entries and the local
  // cmd cache stay in sync.
  useEffect(() => {
    if (authLoading) return;
    const prev = prevAuthRef.current;
    prevAuthRef.current = isAuthenticated;

    // Sign-out: clear the in-memory + localStorage view, plus the
    // History sidebar entries, so the next signed-in user on this
    // browser doesn't accidentally see the previous user's commands or
    // transcript.
    if (prev === true && !isAuthenticated) {
      setCmdHistory([]);
      setHistory([]);
      setHistoryIndex(-1);
      setSearch(null);
      setShellError(null);
      setHistoryEntries(null);
      setHistoryLoadError(null);
      return;
    }

    void loadHistory({ silent: true });
  // setCmdHistory/setHistory are stable setters from usePersistedState
  // (and React's setState contract); excluding them keeps this effect
  // tied to the auth transition, not state churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading, loadHistory]);

  const shellMutation = useMutation<ShellMutationResult, Error, string>({
    mutationFn: async (command: string): Promise<ShellMutationResult> => {
      let res: Response;
      try {
        res = await fetch(`/api/workbench/shell`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, ...(project ? { project } : {}) }),
          credentials: "include",
        });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        return { ok: false, error: { message: reason, code: "NETWORK_ERROR" } };
      }
      const body: Record<string, unknown> = await res.json().catch(() => ({}));
      const bodyError = typeof body.error === "string" ? body.error : null;
      const bodyCode = typeof body.code === "string" ? body.code : null;
      const bodyQuota = parseScratchQuota(body.quota);
      if (!res.ok || bodyError) {
        const message = bodyError ?? `Shell request failed (HTTP ${res.status})`;
        const code = bodyCode ?? (res.status === 401 ? "AUTH_REQUIRED" : `HTTP_${res.status}`);
        return { ok: false, error: { message, code }, ...(bodyQuota ? { quota: bodyQuota } : {}) };
      }
      return {
        ok: true,
        stdout: typeof body.stdout === "string" ? body.stdout : "",
        stderr: typeof body.stderr === "string" ? body.stderr : "",
        exitCode: typeof body.exitCode === "number" ? body.exitCode : 0,
        ...(parseSandboxContainment(body.sandboxContained)
          ? { sandboxContained: parseSandboxContainment(body.sandboxContained) }
          : {}),
        sandboxBlocked: typeof body.sandboxBlocked === "string" ? body.sandboxBlocked : undefined,
        ...(surfaceQuotaExceeded ? { quotaExceeded: body.quotaExceeded === true } : {}),
        scope: (body.scope && typeof body.scope === "object") ? (body.scope as ShellScope) : undefined,
        ...(bodyQuota ? { quota: bodyQuota } : {}),
      };
    },
    onSuccess: (data, command) => {
      // Mirror the server-side dedup so a chain of repeated commands
      // doesn't bury the rest of the user's recent history in the
      // local cache either.
      setCmdHistory(h => (h[0] === command ? h : [command, ...h].slice(0, 500)));
      setHistoryIndex(-1);
      // Always refresh the quota indicator if the server reported one,
      // even on failure responses (the over-quota rejection itself
      // carries `quota` so users see exactly *why* they're blocked).
      // Also broadcast so the top-bar badge updates immediately rather
      // than waiting for its next poll.
      if (data.quota) {
        setQuota(data.quota);
        broadcastScratchQuota(data.quota);
      }
      // Refresh the History sidebar's list in the background so newly
      // run commands appear there without forcing the user to click
      // refresh. We swallow errors — the sidebar will fall back to its
      // existing list and the user can refresh manually.
      void loadHistory({ silent: true });
      if (!data.ok) {
        setShellError({ command, message: data.error.message, code: data.error.code || null });
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
        return;
      }
      setShellError(null);
      setHistory(h => [...h, {
        command,
        stdout: data.stdout,
        stderr: data.stderr,
        exitCode: data.exitCode,
        timestamp: Date.now(),
        ...(data.sandboxContained ? { sandboxContained: data.sandboxContained } : {}),
        sandboxBlocked: data.sandboxBlocked,
        ...(surfaceQuotaExceeded ? { quotaExceeded: data.quotaExceeded } : {}),
        scope: data.scope,
      }]);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    },
  });

  // Walk through `cmdHistory` newest -> oldest looking for substring
  // matches. We re-compute on every keystroke; capping cmdHistory at
  // 500 entries keeps this trivial.
  const searchMatches = useMemo(() => {
    if (!search || !search.query) return [];
    const q = search.query.toLowerCase();
    return cmdHistory.filter(c => c.toLowerCase().includes(q));
  }, [search, cmdHistory]);
  const currentMatch = search && searchMatches.length > 0
    ? searchMatches[Math.min(search.matchIndex, searchMatches.length - 1)]
    : null;

  const runCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    if (trimmed === "clear") { setHistory([]); setInput(""); setSearch(null); return; }
    shellMutation.mutate(trimmed);
    setInput("");
    setSearch(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In Ctrl-R search mode, Enter accepts the highlighted match.
    runCommand(currentMatch ?? input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      if (search) {
        setSearch(s => (s ? { ...s, matchIndex: s.matchIndex + 1 } : s));
      } else {
        setSearch({ query: "", matchIndex: 0 });
      }
      return;
    }
    if (search) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSearch(null);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (currentMatch) { setInput(currentMatch); setSearch(null); }
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setSearch(s => {
          if (!s) return s;
          const next = s.matchIndex + (e.key === "ArrowUp" ? 1 : -1);
          return { ...s, matchIndex: Math.max(0, next) };
        });
        return;
      }
      // Regular character input is captured by the controlled value
      // below — we just need to skip the up/down history walk that
      // would otherwise fight with reverse-search.
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex < cmdHistory.length - 1) {
        const newIdx = historyIndex + 1;
        setHistoryIndex(newIdx);
        setInput(cmdHistory[newIdx] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setInput(cmdHistory[newIdx] || "");
      } else {
        setHistoryIndex(-1);
        setInput("");
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (search) {
      setSearch({ query: val, matchIndex: 0 });
    } else {
      setInput(val);
    }
  };

  // Wipes the on-screen transcript AND the persisted command history
  // (server + local cache) so a user can scrub their shell trail before
  // handing the laptop off.
  const clearAll = async () => {
    setHistory([]);
    setCmdHistory([]);
    setHistoryEntries([]);
    setHistoryIndex(-1);
    setSearch(null);
    try {
      await fetch(`/api/workbench/shell-history`, { method: "DELETE", credentials: "include" });
    } catch {}
  };

  // Re-runs a command from the History sidebar. Closes the sidebar so
  // the user can immediately see the transcript output.
  const runFromHistory = (cmd: string) => {
    setShowHistorySidebar(false);
    setInput("");
    setSearch(null);
    runCommand(cmd);
  };

  // Copies a command to the user's clipboard with a brief "copied!"
  // confirmation. Falls back to a no-op if clipboard isn't available
  // (e.g. insecure context) — the user can still copy manually.
  const copyHistoryCommand = async (entry: ShellHistoryEntry) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(entry.command);
        setCopiedHistoryId(entry.id);
        setTimeout(() => setCopiedHistoryId(curr => (curr === entry.id ? null : curr)), 1200);
      }
    } catch {}
  };

  // Removes one row from the persisted history. We optimistically pull
  // it out of the local list so the sidebar feels snappy, then on
  // failure we re-add it and surface the error inline.
  const deleteHistoryEntry = async (entry: ShellHistoryEntry) => {
    setHistoryEntries(prev => (prev ? prev.filter(e => e.id !== entry.id) : prev));
    setCmdHistory(prev => {
      // Remove the first matching command from the up-arrow cache so
      // the user doesn't get a "ghost" deleted command in cycling.
      const idx = prev.indexOf(entry.command);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
    try {
      const res = await fetch(`/api/workbench/shell-history/${entry.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 404) {
        // 404 is fine — the row was already gone (e.g. concurrent
        // delete from another tab) and our optimistic update already
        // matches reality. Anything else, surface and reload.
        setHistoryLoadError(`Couldn't delete entry (HTTP ${res.status}).`);
        void loadHistory({ silent: true });
      }
    } catch (err: any) {
      setHistoryLoadError(err?.message || "Couldn't delete entry.");
      void loadHistory({ silent: true });
    }
  };

  const visibleHistoryEntries = useMemo(() => {
    if (!historyEntries) return [];
    const q = historyFilter.trim().toLowerCase();
    if (!q) return historyEntries;
    return historyEntries.filter(e => e.command.toLowerCase().includes(q));
  }, [historyEntries, historyFilter]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-green-400" />
          <span className="text-xs text-[#cdd6f4] font-mono">Shell</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className={cn(
              "p-1 rounded",
              styles.toolbarBtnHover,
              showHistorySidebar ? styles.historyBtnActive : styles.historyBtnInactive,
            )}
            onClick={() => {
              setShowHistorySidebar(s => {
                const next = !s;
                if (next) {
                  // Always refresh on open so the user sees the latest
                  // saved commands (including ones from other tabs or
                  // sessions where they signed in).
                  void loadHistory();
                }
                return next;
              });
            }}
            title="Browse and re-run saved shell commands"
            data-testid="shell-history-toggle"
          >
            <History className="h-3 w-3" />
          </button>
          <button
            className={cn("p-1 rounded", styles.toolbarBtn)}
            onClick={clearAll}
            title="Clear transcript and saved command history"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {showHistorySidebar && (
          <ShellHistorySidebar
            entries={visibleHistoryEntries}
            totalCount={historyEntries?.length ?? 0}
            loading={historyLoading}
            error={historyLoadError}
            filter={historyFilter}
            onFilterChange={setHistoryFilter}
            onRefresh={() => loadHistory()}
            onClose={() => setShowHistorySidebar(false)}
            onRun={runFromHistory}
            onCopy={copyHistoryCommand}
            onDelete={deleteHistoryEntry}
            copiedId={copiedHistoryId}
            styles={styles}
          />
        )}
        <div className="flex-1 min-w-0 overflow-y-auto p-2" ref={scrollRef}>
          <div className="font-mono text-xs space-y-1">
            {history.length === 0 && (
              <div className={cn("py-4 text-center", styles.emptyText)}>
                Type a command to get started. Use arrow keys for history, Ctrl+R to search.
              </div>
            )}
            {history.map((entry, i) => (
              <div key={i} className="mb-2">
                <div className="flex items-center gap-1">
                  <span className="text-green-400">$</span>
                  <span className="text-[#cdd6f4]">{entry.command}</span>
                </div>
                {entry.stdout && <pre className="text-[#a6adc8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stdout}</pre>}
                {entry.sandboxBlocked ? (
                  <SandboxBlockedNotice
                    reason={entry.sandboxBlocked}
                    scope={entry.scope}
                    hasProject={Boolean(project)}
                    {...(surfaceQuotaExceeded ? { quotaExceeded: entry.quotaExceeded } : {})}
                  />
                ) : (
                  entry.stderr && <pre className="text-[#f38ba8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stderr}</pre>
                )}
                {entry.sandboxContained && (
                  <SandboxContainedNotice notice={entry.sandboxContained} />
                )}
              </div>
            ))}
            {shellMutation.isPending && (
              <div className="flex items-center gap-2 text-[#89b4fa]">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Running...</span>
              </div>
            )}
            {shellError && !shellMutation.isPending && (
              <div className="mt-2">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-green-400">$</span>
                  <span className="text-[#cdd6f4]">{shellError.command}</span>
                </div>
                <PanelLoadError
                  what="shell command"
                  message={shellError.message}
                  code={shellError.code}
                  onRetry={() => shellMutation.mutate(shellError.command)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {search && (
        <div
          className="px-2 py-1 text-[11px] font-mono bg-[#181825] border-t border-[#313244] flex items-center gap-2"
          data-testid="shell-reverse-search"
        >
          <span className="text-[#f9e2af]">(reverse-i-search)`{search.query}':</span>
          {currentMatch ? (
            <span className="text-[#cdd6f4] truncate flex-1">{currentMatch}</span>
          ) : (
            <span className="text-[#6c7086] flex-1">no match</span>
          )}
          <span className="text-[#585b70] hidden sm:inline">Enter run · Ctrl-R older · Esc cancel</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-1 px-2 py-1.5 border-t border-[#313244] bg-[#181825]">
        <span className="text-green-400 font-mono text-xs">$</span>
        <input
          ref={inputRef}
          value={search ? search.query : input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-[#cdd6f4] font-mono text-xs outline-none placeholder:text-[#585b70]"
          placeholder={search ? "Search history..." : "Enter command..."}
          disabled={shellMutation.isPending}
          autoFocus
        />
      </form>
      <ScratchQuotaBar
        apiBase={API_BASE}
        quota={quota}
        onCopyClear={(cmd) => setInput(cmd)}
      />
    </div>
  );
}

export default ShellPanel;
