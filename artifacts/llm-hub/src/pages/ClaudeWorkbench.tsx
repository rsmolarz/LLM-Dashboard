import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Terminal, FolderTree, Eye, GitBranch, Database, Shield,
  Key, Activity, ChevronRight, ChevronDown, File, Folder,
  RefreshCw, Play, Search, Copy, Loader2, Server,
  Clock, HardDrive, Cpu, AlertTriangle,
  CheckCircle2, XCircle, FileCode, GitCommit, Trash2,
  Sparkles, Send, Square, User, Bot, ExternalLink,
  Globe, Lock, Code2, PanelLeftClose, PanelLeft,
  Puzzle, Power, Zap, Brain, ChevronUp, Bug, ChevronLeft,
  History, X, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ProjectManager, { UploadArea } from "@/components/workbench/ProjectManager";
import ProjectSidebar from "@/components/workbench/ProjectSidebar";
import { FileEditCard, type FileEdit } from "@/components/workbench/FileEditCard";
import { FileEditSummary } from "@/components/workbench/FileEditSummary";
import { FolderPlus, Upload, Paperclip } from "lucide-react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useSelectedProject, projectDescriptorFromSidebar } from "@/hooks/useSelectedProject";
import { ProjectContextHeader } from "@/components/workbench/ProjectContextHeader";
import { WorkbenchErrorView } from "@/components/workbench/WorkbenchErrorView";
import { PanelLoadError, PanelQueryError, asPanelQueryError } from "@/components/workbench/PanelLoadError";
import {
  PrivacyBadge,
  ScratchModeBanner,
  SandboxBlockedNotice,
  SandboxContainedNotice,
  parseSandboxContainment,
  type EntryPrivacy,
  type ShellScope,
  type FileScope,
  type SandboxContainmentNotice,
} from "@/components/workbench/SandboxNotices";
import { ScratchQuotaBar, ScratchQuotaBadge, parseScratchQuota, broadcastScratchQuota, type ScratchQuota } from "@/components/workbench/ScratchQuotaBar";
import { ScratchPanel } from "@/components/workbench/ScratchPanel";
import { useAuth } from "@workspace/replit-auth-web";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

type ShellEntry = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timestamp: number;
  sandboxContained?: SandboxContainmentNotice;
  // Logical sandbox refusal — surfaces when the server's per-user
  // scratch resolver refuses a write through a host symlink or other
  // path-containment escape, and returns a user-facing reason
  // instead of opaque stderr.
  sandboxBlocked?: string;
  scope?: ShellScope;
};
type FileItem = {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  // Present only when the server resolves a per-user scratch dir
  // (authenticated, host mode). "shared" = host-workspace symlink
  // mirrored into scratch (read-only here; writes are sandboxed).
  // "private" = a file/dir the user created in their scratch.
  privacy?: EntryPrivacy;
};
type ChatMessage = { role: "user" | "assistant"; content: string; timestamp: number; streaming?: boolean; model?: string; tokens?: number; errorCode?: string };

type ShellMutationResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      exitCode: number;
      sandboxContained?: SandboxContainmentNotice;
      sandboxBlocked?: string;
      scope?: ShellScope;
      quota?: ScratchQuota;
    }
  | { ok: false; error: { message: string; code: string }; quota?: ScratchQuota };

// One row in the persisted shell history list, as returned by
// GET /api/workbench/shell-history. The History sidebar renders these
// directly and uses `id` to call the per-entry DELETE endpoint.
type CWShellHistoryEntry = { id: number; command: string; createdAt: string };

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

type CWShellHistorySidebarProps = {
  entries: CWShellHistoryEntry[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  filter: string;
  onFilterChange: (v: string) => void;
  onRefresh: () => void;
  onClose: () => void;
  onRun: (cmd: string) => void;
  onCopy: (entry: CWShellHistoryEntry) => void;
  onDelete: (entry: CWShellHistoryEntry) => void;
  copiedId: number | null;
};

// Persistent shell history browser. Renders inside the shell panel as
// a left-side sidebar so the user can keep an eye on the live
// transcript while picking a past command to re-run. Purely
// presentational — all data + state lives in `ShellPanel`.
function CWShellHistorySidebar({
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
}: CWShellHistorySidebarProps) {
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
            className="p-1 rounded hover:bg-white/5 text-white/40"
            onClick={onRefresh}
            title="Refresh history"
            data-testid="shell-history-refresh"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
          <button
            className="p-1 rounded hover:bg-white/5 text-white/40"
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
                  className="p-0.5 rounded hover:bg-white/10 text-[#a6e3a1]"
                  onClick={() => onRun(entry.command)}
                  title="Re-run this command"
                >
                  <Play className="h-3 w-3" />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-white/10 text-[#89b4fa]"
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
                  className="p-0.5 rounded hover:bg-white/10 text-[#f38ba8]"
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

export function ShellPanel() {
  const [input, setInput] = useState("");
  const [history, setHistory] = usePersistedState<ShellEntry[]>("cw-shell-history", []);
  // `cmdHistory[0]` is the *most recent* command. The localStorage copy
  // is kept around as an instant cache so the up-arrow works before the
  // server hydrate completes (and as a fallback when the server call
  // fails, e.g. signed out).
  const [cmdHistory, setCmdHistory] = usePersistedState<string[]>("cw-shell-cmds", []);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [shellError, setShellError] = useState<{ command: string; message: string; code: string | null } | null>(null);
  // Reverse-i-search state, mirroring bash's Ctrl-R. `matchIndex` walks
  // older as the user keeps pressing Ctrl-R.
  const [search, setSearch] = useState<{ query: string; matchIndex: number } | null>(null);
  const [quota, setQuota] = useState<ScratchQuota | null>(null);
  // Persisted history sidebar state. See ShellPanel in Workbench.tsx
  // for the long-form rationale; we duplicate the bookkeeping here so
  // the Claude workbench has the same browse-and-re-run affordance.
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<CWShellHistoryEntry[] | null>(null);
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
  // and whenever the user opens the History sidebar so a freshly
  // signed-in user / cross-tab activity is reflected.
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
      const entries: CWShellHistoryEntry[] = body.history
        .map((h: any) => ({
          id: typeof h?.id === "number" ? h.id : NaN,
          command: typeof h?.command === "string" ? h.command : "",
          createdAt: typeof h?.createdAt === "string" ? h.createdAt : "",
        }))
        .filter((e: CWShellHistoryEntry) => Number.isFinite(e.id) && e.command.length > 0);
      setHistoryEntries(entries);
      const cmds = entries.map(e => e.command);
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
        res = await fetch(`/api/workbench/shell`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, ...(project ? { project } : {}) }), credentials: "include" });
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
      // Surface the freshest quota snapshot the server included,
      // even when the request failed (the over-quota rejection
      // itself carries `quota`).
      if (data.quota) {
        setQuota(data.quota);
        broadcastScratchQuota(data.quota);
      }
      // Refresh the History sidebar's list in the background so newly
      // run commands appear there without forcing the user to click
      // refresh.
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
        scope: data.scope,
      }]);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    },
  });

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
      if (e.key === "Escape") { e.preventDefault(); setSearch(null); return; }
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
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex < cmdHistory.length - 1) { const n = historyIndex + 1; setHistoryIndex(n); setInput(cmdHistory[n] || ""); }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) { const n = historyIndex - 1; setHistoryIndex(n); setInput(cmdHistory[n] || ""); }
      else { setHistoryIndex(-1); setInput(""); }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (search) setSearch({ query: val, matchIndex: 0 });
    else setInput(val);
  };

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

  const copyHistoryCommand = async (entry: CWShellHistoryEntry) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(entry.command);
        setCopiedHistoryId(entry.id);
        setTimeout(() => setCopiedHistoryId(curr => (curr === entry.id ? null : curr)), 1200);
      }
    } catch {}
  };

  // Removes one row from the persisted history. Optimistic — on
  // failure we surface the error inline and reload the list to get
  // back in sync with the server.
  const deleteHistoryEntry = async (entry: CWShellHistoryEntry) => {
    setHistoryEntries(prev => (prev ? prev.filter(e => e.id !== entry.id) : prev));
    setCmdHistory(prev => {
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
              "p-1 rounded hover:bg-white/5",
              showHistorySidebar ? "text-[#89b4fa] bg-white/10" : "text-white/40",
            )}
            onClick={() => {
              setShowHistorySidebar(s => {
                const next = !s;
                if (next) void loadHistory();
                return next;
              });
            }}
            title="Browse and re-run saved shell commands"
            data-testid="shell-history-toggle"
          >
            <History className="h-3 w-3" />
          </button>
          <button
            className="p-1 rounded hover:bg-white/5 text-white/40"
            onClick={clearAll}
            title="Clear transcript and saved command history"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {showHistorySidebar && (
          <CWShellHistorySidebar
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
          />
        )}
        <div className="flex-1 min-w-0 overflow-y-auto p-2" ref={scrollRef}>
          <div className="font-mono text-xs space-y-1">
            {history.length === 0 && <div className="text-[#6c7086] py-4 text-center">Type a command to get started. Use arrow keys for history, Ctrl+R to search.</div>}
            {history.map((entry, i) => (
              <div key={i} className="mb-2">
                <div className="flex items-center gap-1"><span className="text-green-400">$</span><span className="text-[#cdd6f4]">{entry.command}</span></div>
                {entry.stdout && <pre className="text-[#a6adc8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stdout}</pre>}
                {entry.sandboxBlocked ? (
                  <SandboxBlockedNotice
                    reason={entry.sandboxBlocked}
                    scope={entry.scope}
                    hasProject={Boolean(project)}
                  />
                ) : (
                  entry.stderr && <pre className="text-[#f38ba8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stderr}</pre>
                )}
                {entry.sandboxContained && <SandboxContainedNotice notice={entry.sandboxContained} />}
              </div>
            ))}
            {shellMutation.isPending && <div className="flex items-center gap-2 text-[#89b4fa]"><Loader2 className="h-3 w-3 animate-spin" /><span>Running...</span></div>}
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
        onCleared={(q) => setQuota(q)}
      />
    </div>
  );
}

function FileExplorerPanel() {
  const [currentPath, setCurrentPath] = usePersistedState("cw-file-path", ".");
  const [selectedFile, setSelectedFile] = usePersistedState<string | null>("cw-file-selected", null);
  const { project } = useSelectedProject();
  const projectKey = project ? JSON.stringify(project) : "";
  const projectQuery = project ? `&project=${encodeURIComponent(JSON.stringify(project))}` : "";

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["cw-files", currentPath, projectKey],
    queryFn: async () => { const res = await fetch(`/api/workbench/files?path=${encodeURIComponent(currentPath)}${projectQuery}`, { credentials: "include" }); return res.json(); },
  });

  const { data: fileContent, isLoading: contentLoading, refetch: refetchContent } = useQuery<any>({
    queryKey: ["cw-file-content", selectedFile, projectKey],
    queryFn: async () => { const res = await fetch(`/api/workbench/file-content?path=${encodeURIComponent(selectedFile!)}${projectQuery}`, { credentials: "include" }); return res.json(); },
    enabled: !!selectedFile,
  });

  useEffect(() => {
    if (fileContent?.code === "NOT_FOUND" && selectedFile) {
      refetch();
    }
  }, [fileContent?.code, selectedFile, refetch]);

  const items: FileItem[] = data?.items || [];
  const fileScope: FileScope = (data?.scope && typeof data.scope === "object") ? data.scope : {};
  const breadcrumbs = currentPath === "." ? ["root"] : ["root", ...currentPath.split("/").filter(Boolean)];

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (["ts", "tsx", "js", "jsx"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#89b4fa]" />;
    if (["json", "yaml", "yml", "toml"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#f9e2af]" />;
    if (["py"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#a6e3a1]" />;
    return <File className="h-3.5 w-3.5 text-[#6c7086]" />;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-1 text-xs text-[#6c7086] overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <button className="hover:text-[#cdd6f4]" onClick={() => { setCurrentPath(i === 0 ? "." : breadcrumbs.slice(1, i + 1).join("/")); setSelectedFile(null); }}>{crumb}</button>
            </span>
          ))}
        </div>
        <button className="p-1 rounded hover:bg-white/5 text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-1/3 border-r border-[#313244] overflow-y-auto">
          <div className="p-1">
            <ScratchModeBanner scope={fileScope} />
            {currentPath !== "." && (
              <button className="w-full text-left px-2 py-1 text-xs hover:bg-[#313244] rounded flex items-center gap-1.5"
                onClick={() => { const parts = currentPath.split("/"); parts.pop(); setCurrentPath(parts.length ? parts.join("/") : "."); setSelectedFile(null); }}>
                <Folder className="h-3.5 w-3.5 text-[#fab387]" /><span className="text-[#6c7086]">..</span>
              </button>
            )}
            {isLoading ? <div className="p-2 space-y-1">{[1,2,3,4].map(i => <div key={i} className="h-5 w-full bg-[#313244] rounded animate-pulse" />)}</div> :
              data?.error || data?.code ? (
                <WorkbenchErrorView
                  payload={{ error: data.error, code: data.code, size: data.size }}
                  context="files"
                  onRetry={() => refetch()}
                />
              ) :
              items.map(item => (
                <button key={item.path} className={cn("w-full text-left px-2 py-1 text-xs hover:bg-[#313244] rounded flex items-center gap-1.5", selectedFile === item.path && "bg-[#313244]")}
                  onClick={() => item.type === "directory" ? (setCurrentPath(item.path), setSelectedFile(null)) : setSelectedFile(item.path)}>
                  {item.type === "directory" ? <Folder className="h-3.5 w-3.5 text-[#fab387]" /> : getFileIcon(item.name)}
                  <span className="truncate flex-1 text-[#cdd6f4]">{item.name}</span>
                  <PrivacyBadge privacy={item.privacy} />
                  {item.size !== undefined && <span className="text-[10px] text-[#585b70]">{formatBytes(item.size)}</span>}
                </button>
              ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {selectedFile ? (contentLoading ? <div className="p-4"><Loader2 className="h-4 w-4 animate-spin text-[#6c7086]" /></div> :
            fileContent?.error || fileContent?.code ? (
              <WorkbenchErrorView
                payload={{ error: fileContent.error, code: fileContent.code, size: fileContent.size }}
                context="content"
                onRetry={() => refetchContent()}
                onClear={() => setSelectedFile(null)}
                downloadHref={selectedFile ? `/api/workbench/file-download?path=${encodeURIComponent(selectedFile)}${projectQuery}` : undefined}
              />
            ) :
            <div className="relative">
              <div className="flex items-center justify-between px-3 py-1 bg-[#181825] border-b border-[#313244] sticky top-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-mono text-[#6c7086] truncate">{selectedFile}</span>
                  <PrivacyBadge privacy={fileContent?.scope?.privacy as EntryPrivacy | undefined} />
                </div>
                <button className="p-0.5 rounded hover:bg-[#313244]" onClick={() => navigator.clipboard.writeText(fileContent?.content || "")}>
                  <Copy className="h-3 w-3 text-[#6c7086]" />
                </button>
              </div>
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all text-[#cdd6f4] select-text cursor-text">{fileContent?.content}</pre>
            </div>
          ) : <div className="p-8 text-center text-sm text-[#585b70]"><FileCode className="h-8 w-8 mx-auto mb-2 opacity-30" />Select a file</div>}
        </div>
      </div>
    </div>
  );
}

function PreviewPanel() {
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = usePersistedState("cw-preview-url", `https://${window.location.host}`);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[#313244]">
        <Eye className="h-3.5 w-3.5 text-[#6c7086]" />
        <form className="flex-1 flex gap-1" onSubmit={e => { e.preventDefault(); if (url) setCurrentUrl(url); }}>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder={currentUrl}
            className="flex-1 h-7 text-xs font-mono px-2 rounded border border-[#313244] bg-[#1e1e2e] text-[#cdd6f4] placeholder:text-[#585b70] outline-none focus:ring-1 focus:ring-[#cba6f7]" />
          <button type="submit" className="h-7 px-2 rounded border border-[#313244] hover:bg-[#313244]"><Play className="h-3 w-3 text-[#cdd6f4]" /></button>
        </form>
        <button className="h-7 px-2 rounded border border-[#313244] hover:bg-[#313244]" onClick={() => setCurrentUrl(currentUrl + "?" + Date.now())}><RefreshCw className="h-3 w-3 text-[#cdd6f4]" /></button>
      </div>
      <div className="flex-1"><iframe src={currentUrl} className="w-full h-full border-0" title="Preview" /></div>
    </div>
  );
}

function GitPanel() {
  const { data, isLoading, error, refetch } = useQuery<any, PanelQueryError>({
    queryKey: ["wb-git-status"],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`/api/workbench/git-status`, { credentials: "include" });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        throw new PanelQueryError(reason, "NETWORK_ERROR");
      }
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof body?.error === "string"
          ? body.error
          : `Failed to load git status (HTTP ${res.status})`;
        const code = typeof body?.code === "string" ? body.code : `HTTP_${res.status}`;
        throw new PanelQueryError(reason, code);
      }
      return body;
    },
    retry: false,
  });
  const queryError = asPanelQueryError(error);
  const dataError = (data as { error?: string; code?: string } | undefined) ?? undefined;
  const errorMessage = queryError?.message ?? dataError?.error ?? null;
  const errorCode = queryError?.code ?? dataError?.code ?? null;

  const gitMutation = useMutation({
    mutationFn: async (command: string) => { const res = await fetch(`/api/workbench/git`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command }), credentials: "include" }); return res.json(); },
    onSuccess: () => refetch(),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-[#fab387]" />
          <span className="text-xs font-medium text-[#cdd6f4]">Git</span>
          {data?.currentBranch && <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#313244] text-[#a6adc8]">{data.currentBranch}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button className="px-2 py-0.5 text-[10px] rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => gitMutation.mutate("git pull")} disabled={gitMutation.isPending}>Pull</button>
          <button className="px-2 py-0.5 text-[10px] rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => gitMutation.mutate("git fetch")} disabled={gitMutation.isPending}>Fetch</button>
          <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-6 w-full bg-[#313244] rounded animate-pulse" />)}</div> :
        errorMessage ? (
          <PanelLoadError what="git status" message={errorMessage} code={errorCode} onRetry={() => refetch()} />
        ) :
        <div className="p-2 space-y-3">
          {data?.changes?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[#6c7086] mb-1 px-1">Changes ({data.changes.length})</h4>
              {data.changes.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5 px-1 py-0.5 text-xs hover:bg-[#313244] rounded">
                  <span className={cn("text-[9px] px-1 rounded border",
                    c.status === "M" ? "text-[#f9e2af] border-[#f9e2af]/30" :
                    c.status === "A" || c.status === "??" ? "text-[#a6e3a1] border-[#a6e3a1]/30" :
                    c.status === "D" ? "text-[#f38ba8] border-[#f38ba8]/30" : "text-[#6c7086] border-[#313244]"
                  )}>{c.status}</span>
                  <span className="truncate font-mono text-[11px] text-[#a6adc8]">{c.file}</span>
                </div>
              ))}
            </div>
          )}
          {data?.changes?.length === 0 && <div className="text-xs text-center text-[#585b70] py-2">Working tree clean</div>}
          <div className="h-px bg-[#313244]" />
          <div>
            <h4 className="text-xs font-medium text-[#6c7086] mb-1 px-1">Recent Commits</h4>
            {data?.commits?.slice(0, 15).map((c: any, i: number) => (
              <div key={i} className="flex items-start gap-1.5 px-1 py-1 text-xs hover:bg-[#313244] rounded">
                <GitCommit className="h-3 w-3 mt-0.5 text-[#585b70] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-[#a6adc8]">{c.message}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#585b70] font-mono">{c.hash?.substring(0, 7)}</span>
                    <span className="text-[10px] text-[#585b70]">{c.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>}
      </div>
    </div>
  );
}

function AgentActivityPanel() {
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery<any, PanelQueryError>({
    queryKey: ["wb-agent-activity"],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`/api/workbench/agent-activity`, { credentials: "include" });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        throw new PanelQueryError(reason, "NETWORK_ERROR");
      }
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof body?.error === "string"
          ? body.error
          : `Failed to load agent activity (HTTP ${res.status})`;
        const code = typeof body?.code === "string" ? body.code : `HTTP_${res.status}`;
        throw new PanelQueryError(reason, code);
      }
      return body;
    },
    retry: false,
  });
  const queryError = asPanelQueryError(error);
  const dataError = (data as { error?: string; code?: string } | undefined) ?? undefined;
  const errorMessage = queryError?.message ?? dataError?.error ?? null;
  const errorCode = queryError?.code ?? dataError?.code ?? null;

  const entries = data?.entries || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-[#cba6f7]" />
          <span className="text-xs font-medium text-[#cdd6f4]">Agent Activity</span>
          {data?.stats && <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#313244] text-[#6c7086]">{data.stats.agentCommits} agent / {data.stats.totalCommits} total</span>}
        </div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 w-full bg-[#313244] rounded animate-pulse" />)}</div> :
        errorMessage ? (
          <PanelLoadError what="agent activity" message={errorMessage} code={errorCode} onRetry={() => refetch()} />
        ) :
        entries.length === 0 ? <div className="p-4 text-sm text-center text-[#585b70]">No activity found</div> :
        <div className="p-1">{entries.map((entry: any) => {
          const expanded = expandedCommit === entry.hash;
          return (
            <div key={entry.hash} className="border-b border-[#313244] last:border-0">
              <button className="w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-[#313244]" onClick={() => setExpandedCommit(expanded ? null : entry.hash)}>
                <div className="mt-0.5 shrink-0">{entry.isAgent ? <Bot className="h-3.5 w-3.5 text-[#cba6f7]" /> : <User className="h-3.5 w-3.5 text-[#89b4fa]" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate text-[#cdd6f4]">{entry.message}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[#585b70] font-mono">{entry.hash?.substring(0, 7)}</span>
                    <span className="text-[10px] text-[#585b70]">{entry.files.length} files</span>
                  </div>
                </div>
                {entry.files.length > 0 && <div className="shrink-0 mt-0.5">{expanded ? <ChevronDown className="h-3 w-3 text-[#585b70]" /> : <ChevronRight className="h-3 w-3 text-[#585b70]" />}</div>}
              </button>
              {expanded && entry.files.length > 0 && (
                <div className="pl-7 pr-2 pb-2 space-y-0.5">{entry.files.map((f: any, fi: number) => (
                  <div key={fi} className="flex items-center gap-1.5 text-[11px]">
                    <span className={cn("text-[9px] px-1 rounded border",
                      f.status === "A" ? "text-[#a6e3a1] border-[#a6e3a1]/30" :
                      f.status === "M" ? "text-[#f9e2af] border-[#f9e2af]/30" :
                      f.status === "D" ? "text-[#f38ba8] border-[#f38ba8]/30" : "text-[#6c7086] border-[#313244]"
                    )}>{f.status}</span>
                    <span className="font-mono truncate text-[#6c7086]">{f.file}</span>
                  </div>
                ))}</div>
              )}
            </div>
          );
        })}</div>}
      </div>
    </div>
  );
}

function DatabasePanel() {
  const [query, setQuery] = usePersistedState("cw-db-query", "SELECT schemaname, relname as table_name, n_live_tup as row_count FROM pg_stat_user_tables ORDER BY n_live_tup DESC");
  const [results, setResults] = useState<any>(null);

  const queryMutation = useMutation({
    mutationFn: async (q: string) => {
      let res: Response;
      try {
        res = await fetch(`/api/workbench/db-query?q=${encodeURIComponent(q)}`, { credentials: "include" });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        return { error: reason, code: "NETWORK_ERROR", rows: [], fields: [], rowCount: 0 };
      }
      const body: Record<string, unknown> = await res.json().catch(() => ({}));
      const bodyError = typeof body.error === "string" ? body.error : null;
      const bodyCode = typeof body.code === "string" ? body.code : null;
      if (!res.ok || bodyError) {
        return {
          error: bodyError ?? `Query failed (HTTP ${res.status})`,
          code: bodyCode ?? (res.status === 401 ? "AUTH_REQUIRED" : `HTTP_${res.status}`),
          rows: [],
          fields: [],
          rowCount: 0,
        };
      }
      return body;
    },
    onSuccess: (data) => setResults(data),
    onError: (err: any) => setResults({ error: err?.message || "Query failed", code: "UNKNOWN", rows: [], fields: [], rowCount: 0 }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#313244]">
        <Database className="h-3.5 w-3.5 text-[#89b4fa]" />
        <span className="text-xs font-medium text-[#cdd6f4]">Database</span>
      </div>
      <div className="p-2 border-b border-[#313244] space-y-1.5">
        <textarea value={query} onChange={e => setQuery(e.target.value)}
          className="w-full rounded-lg border border-[#313244] bg-[#1e1e2e] px-3 py-2 font-mono text-xs text-[#cdd6f4] placeholder:text-[#585b70] focus:outline-none focus:ring-1 focus:ring-[#cba6f7] resize-y min-h-[60px]" />
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#cba6f7] hover:bg-[#b4befe] text-[#1e1e2e] text-xs font-medium disabled:opacity-50"
            onClick={() => queryMutation.mutate(query)} disabled={queryMutation.isPending || !query.trim()}>
            {queryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run
          </button>
          {results && <span className="text-[10px] text-[#6c7086]">{results.rowCount} rows</span>}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {results?.error ? (
          <PanelLoadError
            what="query results"
            message={results.error}
            code={results.code || null}
            onRetry={() => queryMutation.mutate(query)}
          />
        ) :
         results?.rows?.length > 0 ? (
          <table className="w-full text-xs">
            <thead className="bg-[#181825] sticky top-0"><tr>{results.fields.map((f: string) => (
              <th key={f} className="px-2 py-1.5 text-left font-medium text-[#6c7086] border-b border-[#313244]">{f}</th>
            ))}</tr></thead>
            <tbody>{results.rows.map((row: any, i: number) => (
              <tr key={i} className="hover:bg-[#313244] border-b border-[#313244]/50">{results.fields.map((f: string) => (
                <td key={f} className="px-2 py-1 font-mono text-[11px] max-w-[200px] truncate text-[#a6adc8]">{String(row[f] ?? "NULL")}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        ) : <div className="p-8 text-center text-sm text-[#585b70]"><Database className="h-8 w-8 mx-auto mb-2 opacity-20" />Run a query</div>}
      </div>
    </div>
  );
}

function SecurityPanel() {
  const [scanText, setScanText] = useState("");
  const { data: report, isLoading, refetch } = useQuery<any>({
    queryKey: ["wb-security-report"],
    queryFn: async () => { const res = await fetch(`/api/workbench/security-report`, { credentials: "include" }); return res.json(); },
  });

  const scanMutation = useMutation({
    mutationFn: async (text: string) => { const res = await fetch(`/api/workbench/security-scan-text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), credentials: "include" }); return res.json(); },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-[#f38ba8]" />
          <span className="text-xs font-medium text-[#cdd6f4]">Security Scanner</span>
          {report?.summary && (
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded border",
              report.summary.critical > 0 ? "border-[#f38ba8]/30 text-[#f38ba8]" :
              report.summary.warning > 0 ? "border-[#f9e2af]/30 text-[#f9e2af]" : "border-[#a6e3a1]/30 text-[#a6e3a1]"
            )}>{report.summary.total} findings</span>
          )}
        </div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
      </div>
      <div className="p-2 border-b border-[#313244] space-y-1.5">
        <div className="flex gap-1">
          <input value={scanText} onChange={e => setScanText(e.target.value)} placeholder="Paste text to scan for secrets..."
            className="flex-1 h-7 text-xs px-2 rounded border border-[#313244] bg-[#1e1e2e] text-[#cdd6f4] placeholder:text-[#585b70] outline-none" />
          <button className="h-7 px-2 rounded bg-[#f38ba8] hover:bg-[#eba0ac] text-[#1e1e2e] text-xs font-medium disabled:opacity-50"
            onClick={() => scanMutation.mutate(scanText)} disabled={scanMutation.isPending || !scanText.trim()}>
            {scanMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          </button>
        </div>
        {scanMutation.data && (
          <div className="text-xs p-2 rounded bg-[#181825] border border-[#313244]">
            {scanMutation.data.findings?.length > 0 ? (
              <div className="space-y-1">{scanMutation.data.findings.map((f: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={cn("text-[9px] px-1 rounded", f.severity === "critical" ? "bg-[#f38ba8]/20 text-[#f38ba8]" : "bg-[#89b4fa]/20 text-[#89b4fa]")}>{f.severity}</span>
                  <span className="text-[#a6adc8]">{f.type} ({f.count})</span>
                </div>
              ))}</div>
            ) : <span className="text-[#a6e3a1]">No secrets found</span>}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <div className="p-3"><Loader2 className="h-4 w-4 animate-spin text-[#6c7086]" /></div> :
         report?.findings?.length > 0 ? (
          <div className="p-2 space-y-1">{report.findings.map((f: any, i: number) => (
            <div key={i} className={cn("p-2 rounded border text-xs",
              f.severity === "critical" ? "border-[#f38ba8]/30 bg-[#f38ba8]/5" :
              f.severity === "warning" ? "border-[#f9e2af]/30 bg-[#f9e2af]/5" : "border-[#313244] bg-[#181825]"
            )}>
              <div className="flex items-center gap-2 mb-0.5">
                {f.severity === "critical" ? <XCircle className="h-3 w-3 text-[#f38ba8]" /> :
                 f.severity === "warning" ? <AlertTriangle className="h-3 w-3 text-[#f9e2af]" /> :
                 <CheckCircle2 className="h-3 w-3 text-[#89b4fa]" />}
                <span className="font-medium text-[#cdd6f4]">{f.title}</span>
                <span className="text-[9px] px-1 rounded bg-[#313244] text-[#6c7086]">{f.category}</span>
              </div>
              <p className="text-[#a6adc8] text-[11px] ml-5">{f.detail}</p>
            </div>
          ))}</div>
        ) : <div className="p-4 text-center text-sm text-[#585b70]">No findings</div>}
      </div>
    </div>
  );
}

function EnvPanel() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch } = useQuery<any, PanelQueryError>({
    queryKey: ["wb-env"],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`/api/workbench/env`, { credentials: "include" });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        throw new PanelQueryError(reason, "NETWORK_ERROR");
      }
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof body?.error === "string"
          ? body.error
          : `Failed to load environment variables (HTTP ${res.status})`;
        const code = typeof body?.code === "string"
          ? body.code
          : res.status === 401 ? "AUTH_REQUIRED" : `HTTP_${res.status}`;
        throw new PanelQueryError(reason, code);
      }
      return body;
    },
    retry: false,
  });
  const queryError = asPanelQueryError(error);
  const dataError = (data as { error?: string; code?: string } | undefined) ?? undefined;
  const errorMessage = queryError?.message ?? dataError?.error ?? null;
  const errorCode = queryError?.code ?? dataError?.code ?? null;

  const vars = (data?.variables || []).filter((v: any) => !search || v.key.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2"><Key className="h-3.5 w-3.5 text-[#cba6f7]" /><span className="text-xs font-medium text-[#cdd6f4]">Environment ({data?.count || 0})</span></div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
      </div>
      <div className="px-2 py-1.5 border-b border-[#313244]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#585b70]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-7 text-xs pl-7 rounded border border-[#313244] bg-[#1e1e2e] text-[#cdd6f4] placeholder:text-[#585b70] outline-none" placeholder="Filter..." />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {isLoading ? <div className="p-3 space-y-1">{[1,2,3].map(i => <div key={i} className="h-5 w-full bg-[#313244] rounded animate-pulse" />)}</div> :
         errorMessage ? <PanelLoadError what="environment variables" message={errorMessage} code={errorCode} onRetry={() => refetch()} /> :
         vars.map((v: any) => (
          <div key={v.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#313244] text-xs">
            <span className="font-mono font-medium text-[11px] shrink-0 text-[#cdd6f4]">{v.key}</span>
            <span className="text-[#585b70]">=</span>
            <span className={cn("font-mono text-[11px] truncate", v.sensitive ? "text-[#f9e2af]" : "text-[#6c7086]")}>{v.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessPanel() {
  const { data, isLoading, error, refetch } = useQuery<any, PanelQueryError>({
    queryKey: ["wb-process-info"],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`/api/workbench/process-info`, { credentials: "include" });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        throw new PanelQueryError(reason, "NETWORK_ERROR");
      }
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof body?.error === "string"
          ? body.error
          : `Failed to load process info (HTTP ${res.status})`;
        const code = typeof body?.code === "string"
          ? body.code
          : res.status === 401 ? "AUTH_REQUIRED" : `HTTP_${res.status}`;
        throw new PanelQueryError(reason, code);
      }
      return body;
    },
    retry: false,
    refetchInterval: 10000,
  });
  const queryError = asPanelQueryError(error);
  const dataError = (data as { error?: string; code?: string } | undefined) ?? undefined;
  const errorMessage = queryError?.message ?? dataError?.error ?? null;
  const errorCode = queryError?.code ?? dataError?.code ?? null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-[#a6e3a1]" /><span className="text-xs font-medium text-[#cdd6f4]">Process Info</span></div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <div className="p-3"><Loader2 className="h-4 w-4 animate-spin text-[#6c7086]" /></div> :
         errorMessage ? <PanelLoadError what="process info" message={errorMessage} code={errorCode} onRetry={() => refetch()} /> :
         data ? (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Clock, label: "Uptime", value: formatUptime(data.uptime), color: "text-[#a6e3a1]" },
                { icon: Server, label: "Node", value: data.nodeVersion, color: "text-[#89b4fa]" },
                { icon: Cpu, label: "CPUs", value: data.cpus, color: "text-[#f9e2af]" },
                { icon: HardDrive, label: "Free Mem", value: formatBytes(data.freeMemory || 0), color: "text-[#cba6f7]" },
                { icon: HardDrive, label: "Heap", value: formatBytes(data.memoryUsage?.heapUsed || 0), color: "text-[#fab387]" },
                { icon: HardDrive, label: "RSS", value: formatBytes(data.memoryUsage?.rss || 0), color: "text-[#f38ba8]" },
              ].map((item, i) => (
                <div key={i} className="p-2 rounded bg-[#181825] border border-[#313244]">
                  <div className={cn("flex items-center gap-1.5 text-[10px] mb-0.5", item.color)}><item.icon className="h-3 w-3" /> {item.label}</div>
                  <div className="text-sm font-semibold text-[#cdd6f4]">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SkillsPanel() {
  const [search, setSearch] = useState("");
  const { data: skills = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["wb-skills"],
    queryFn: async () => { const res = await fetch(`/api/workbench/skills`, { credentials: "include" }); return res.json(); },
  });

  const filtered = skills.filter((s: any) => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.description?.toLowerCase().includes(search.toLowerCase()));

  const categories = Array.from(new Set(skills.map((s: any) => s.category).filter(Boolean))).sort();
  const [catFilter, setCatFilter] = useState("all");
  const items = filtered.filter((s: any) => catFilter === "all" || s.category === catFilter);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Puzzle className="h-3.5 w-3.5 text-[#cba6f7]" />
          <span className="text-xs font-medium text-[#cdd6f4]">Skills</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#313244] text-[#a6adc8]">{skills.length}</span>
        </div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
      </div>
      <div className="px-2 py-1.5 border-b border-[#313244] space-y-1.5">
        <div className="flex gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#585b70]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search skills..."
              className="w-full h-6 text-[10px] pl-7 rounded border border-[#313244] bg-[#1e1e2e] text-[#cdd6f4] placeholder:text-[#585b70] outline-none" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="h-6 text-[10px] px-1.5 rounded border border-[#313244] bg-[#1e1e2e] text-[#cdd6f4]">
            <option value="all">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <div className="p-3"><Loader2 className="h-4 w-4 animate-spin text-[#6c7086]" /></div> :
         items.length === 0 ? <div className="p-4 text-center text-sm text-[#585b70]">No skills found</div> :
         <div className="p-1 space-y-0.5">{items.map((s: any) => (
           <div key={s.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-[#313244]">
             <Puzzle className="h-3.5 w-3.5 text-[#cba6f7] mt-0.5 shrink-0" />
             <div className="min-w-0 flex-1">
               <div className="flex items-center gap-1.5">
                 <span className="text-xs font-medium text-[#cdd6f4]">{s.name}</span>
                 <span className="text-[8px] px-1 rounded bg-[#313244] text-[#6c7086]">{s.category}</span>
               </div>
               {s.description && <p className="text-[10px] text-[#6c7086] truncate mt-0.5">{s.description}</p>}
             </div>
             <span className={cn("text-[8px] px-1 rounded", s.enabled ? "bg-[#a6e3a1]/20 text-[#a6e3a1]" : "bg-[#f38ba8]/20 text-[#f38ba8]")}>{s.enabled ? "active" : "off"}</span>
           </div>
         ))}</div>}
      </div>
    </div>
  );
}

function ClaudeCodePanel() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = usePersistedState<ChatMessage[]>("cw-claude-messages", []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [toolEvents, setToolEvents] = useState<{ name: string; summary: string; error?: boolean }[]>([]);
  const [fileEdits, setFileEdits] = usePersistedState<FileEdit[]>("cw-claude-file-edits", []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { project: selectedProject } = useSelectedProject();

  useEffect(() => {
    setFileEdits(prev => {
      if (!prev.some(e => e.undoing || e.undoError)) return prev;
      return prev.map(e => ({ ...e, undoing: false, undoError: null }));
    });
  }, []);

  const handleUndo = useCallback(async (editId: string) => {
    setFileEdits(prev => prev.map(e => e.editId === editId ? { ...e, undoing: true, undoError: null } : e));
    try {
      const res = await fetch("/api/workbench/undo-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ editId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFileEdits(prev => prev.map(e => e.editId === editId ? { ...e, undoing: false, undone: true, canRedo: true, undoneAt: Date.now(), redoError: null } : e));
    } catch (err: any) {
      setFileEdits(prev => prev.map(e => e.editId === editId ? { ...e, undoing: false, undoError: err.message } : e));
    }
  }, []);

  const [fileUndoPending, setFileUndoPending] = useState<string | null>(null);
  const [fileUndoError, setFileUndoError] = useState<{ path: string; message: string } | null>(null);
  const [fileRedoPending, setFileRedoPending] = useState<string | null>(null);
  const [fileRedoError, setFileRedoError] = useState<{ path: string; message: string } | null>(null);

  const latestEditIdByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = fileEdits.length - 1; i >= 0; i--) {
      const e = fileEdits[i];
      if (!e.undone && e.editId && !map.has(e.path)) {
        map.set(e.path, e.editId);
      }
    }
    return map;
  }, [fileEdits]);

  // Top of the per-file redo stack — most recently undone redoable edit.
  const topRedoEditIdByPath = useMemo(() => {
    const map = new Map<string, { editId: string; undoneAt: number }>();
    for (const e of fileEdits) {
      if (!e.undone || !e.canRedo || !e.editId || !e.undoneAt) continue;
      const prev = map.get(e.path);
      if (!prev || e.undoneAt > prev.undoneAt) {
        map.set(e.path, { editId: e.editId, undoneAt: e.undoneAt });
      }
    }
    const out = new Map<string, string>();
    for (const [p, v] of map) out.set(p, v.editId);
    return out;
  }, [fileEdits]);

  const [fileUndoAction, setFileUndoAction] = useState<"undo" | "revert" | null>(null);

  const handleUndoLastForFile = useCallback(async (filePath: string) => {
    setFileUndoPending(filePath);
    setFileUndoAction("undo");
    setFileUndoError(null);
    try {
      const res = await fetch("/api/workbench/undo-last-file-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filePath, project: selectedProject || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const undoneId: string | undefined = data.editId;
      const stamp = Date.now();
      if (undoneId) {
        setFileEdits(prev => prev.map(e => e.editId === undoneId ? { ...e, undone: true, undoing: false, canRedo: true, undoneAt: stamp, redoError: null } : e));
      } else {
        const latestId = latestEditIdByPath.get(filePath);
        if (latestId) {
          setFileEdits(prev => prev.map(e => e.editId === latestId ? { ...e, undone: true, undoing: false, canRedo: true, undoneAt: stamp, redoError: null } : e));
        }
      }
    } catch (err: any) {
      setFileUndoError({ path: filePath, message: err.message || "Undo failed" });
    } finally {
      setFileUndoPending(null);
      setFileUndoAction(null);
    }
  }, [selectedProject, latestEditIdByPath]);

  const handleRedo = useCallback(async (editId: string) => {
    setFileEdits(prev => prev.map(e => e.editId === editId ? { ...e, redoing: true, redoError: null } : e));
    try {
      const res = await fetch("/api/workbench/redo-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ editId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFileEdits(prev => prev.map(e => e.editId === editId ? { ...e, redoing: false, undone: false, canRedo: false, undoneAt: undefined, undoError: null } : e));
    } catch (err: any) {
      setFileEdits(prev => prev.map(e => e.editId === editId ? { ...e, redoing: false, redoError: err.message } : e));
    }
  }, []);

  const handleRedoLastForFile = useCallback(async (filePath: string) => {
    setFileRedoPending(filePath);
    setFileRedoError(null);
    try {
      const res = await fetch("/api/workbench/redo-last-file-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filePath, project: selectedProject || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const redoneId: string | undefined = data.editId;
      if (redoneId) {
        setFileEdits(prev => prev.map(e => e.editId === redoneId ? { ...e, redoing: false, undone: false, canRedo: false, undoneAt: undefined, undoError: null } : e));
      } else {
        const topId = topRedoEditIdByPath.get(filePath);
        if (topId) {
          setFileEdits(prev => prev.map(e => e.editId === topId ? { ...e, redoing: false, undone: false, canRedo: false, undoneAt: undefined, undoError: null } : e));
        }
      }
    } catch (err: any) {
      setFileRedoError({ path: filePath, message: err.message || "Redo failed" });
    } finally {
      setFileRedoPending(null);
    }
  }, [selectedProject, topRedoEditIdByPath]);

  const handleRevertAllForFile = useCallback(async (filePath: string) => {
    setFileUndoPending(filePath);
    setFileUndoAction("revert");
    setFileUndoError(null);
    try {
      const res = await fetch("/api/workbench/revert-all-file-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filePath, project: selectedProject || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const undoneIds: string[] = Array.isArray(data.undoneEditIds) ? data.undoneEditIds : [];
      if (undoneIds.length > 0) {
        const undoneSet = new Set(undoneIds);
        setFileEdits(prev => prev.map(e => (e.editId && undoneSet.has(e.editId)) ? { ...e, undone: true, undoing: false } : e));
      } else {
        setFileEdits(prev => prev.map(e => e.path === filePath ? { ...e, undone: true, undoing: false } : e));
      }
    } catch (err: any) {
      setFileUndoError({ path: filePath, message: err.message || "Revert failed" });
    } finally {
      setFileUndoPending(null);
      setFileUndoAction(null);
    }
  }, [selectedProject]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, []);

  const handleStop = useCallback(() => {
    if (abortController) {
      abortController.abort(); setAbortController(null); setIsStreaming(false);
      setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, content: m.content + "\n\n[Stopped]" } : m));
    }
  }, [abortController]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const prompt = input.trim();
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: prompt, timestamp: Date.now() };
    const assistantMsg: ChatMessage = { role: "assistant", content: "", timestamp: Date.now(), streaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    scrollToBottom();
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const conversationHistory = messages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }));
      setToolEvents([]);
      setFileEdits([]);
      const res = await fetch(`/api/workbench/code-chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, messages: conversationHistory, project: selectedProject || undefined, writeMode: !!selectedProject }),
        signal: controller.signal, credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) { throw new Error("Sign in required to use file/shell tools on the selected project."); }
        const err = await res.json().catch(() => ({ error: "Failed" }));
        if (err?.code === "AI_NOT_CONFIGURED") {
          const aiErr: any = new Error(
            "AI chat isn't configured. Add the AI_INTEGRATIONS_ANTHROPIC_API_KEY and AI_INTEGRATIONS_ANTHROPIC_BASE_URL secrets in the Env Vars panel, then try again.",
          );
          aiErr.code = "AI_NOT_CONFIGURED";
          throw aiErr;
        }
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n"); buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk") { setMessages(prev => { const u = [...prev]; const l = u[u.length-1]; if (l?.streaming) u[u.length-1] = { ...l, content: l.content + data.content }; return u; }); scrollToBottom(); }
              else if (data.type === "done") { setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m)); }
              else if (data.type === "error") { setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, content: m.content + `\nError: ${data.content}` } : m)); }
              else if (data.type === "tool_start") { setToolEvents(p => [...p, { name: data.name, summary: "running…" }]); }
              else if (data.type === "tool_result") { setToolEvents(p => { const u = [...p]; for (let i = u.length - 1; i >= 0; i--) { if (u[i].name === data.name && u[i].summary === "running…") { u[i] = { name: data.name, summary: data.summary }; return u; } } return [...u, { name: data.name, summary: data.summary }]; }); }
              else if (data.type === "tool_error") { setToolEvents(p => [...p, { name: data.name, summary: data.error, error: true }]); }
              else if (data.type === "file_edit") {
                setFileEdits(p => {
                  // Server cleared the redo stack for this path on a new
                  // write — mirror that here so stale redo affordances vanish.
                  const cleared = p.map(e => (
                    e.path === data.path && e.canRedo
                      ? { ...e, canRedo: false, undoneAt: undefined, redoError: null }
                      : e
                  ));
                  return [...cleared, {
                    editId: data.editId,
                    path: data.path,
                    diff: data.diff,
                    isNew: !!data.isNew,
                    added: data.added || 0,
                    removed: data.removed || 0,
                    previousBytes: data.previousBytes || 0,
                    newBytes: data.newBytes || 0,
                    truncated: !!data.truncated,
                    undoDisabled: !!data.undoDisabled,
                    undoSkipReason: data.undoSkipReason,
                  }];
                });
                setToolEvents(p => [...p, { name: data.name || "write_file", summary: data.summary || `wrote ${data.path}` }]);
              }
              else if (data.type === "project") { setToolEvents(p => [...p, { name: "project", summary: `loaded ${data.origin} project${data.cloned ? " (fresh clone)" : ""}` }]); }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      const errorCode: string | undefined = err?.code;
      setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, content: `Error: ${err.message}`, errorCode } : m));
    } finally { setIsStreaming(false); setAbortController(null); setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m)); scrollToBottom(); }
  }, [input, isStreaming, messages, scrollToBottom]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[#fab387]" />
          <span className="text-xs text-[#cdd6f4] font-mono">Claude Code</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#fab387]/30 text-[#fab387]">Sonnet</span>
        </div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => { setMessages([]); setFileEdits([]); }}><Trash2 className="h-3 w-3" /></button>
      </div>
      {selectedProject && (
        <div className="px-3 py-1 bg-[#11111b] border-b border-[#313244] text-[10px] text-[#6c7086] font-mono flex items-center gap-2">
          <span className="text-[#fab387]">●</span>
          <span>scoped to <span className="text-[#cdd6f4]">{selectedProject.origin}</span>:{selectedProject.name || selectedProject.path}</span>
        </div>
      )}
      {toolEvents.length > 0 && (
        <div className="px-3 py-1 bg-[#11111b] border-b border-[#313244] flex flex-wrap gap-1">
          {toolEvents.slice(-6).map((t, i) => (
            <span key={i} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${t.error ? "bg-[#f38ba8]/15 text-[#f38ba8]" : "bg-[#313244] text-[#a6adc8]"}`}>
              {t.name}: {t.summary}
            </span>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3" ref={scrollRef}>
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-3">
              <div className="flex justify-center"><div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#fab387] to-[#f9e2af] flex items-center justify-center"><Sparkles className="h-6 w-6 text-[#1e1e2e]" /></div></div>
              <div><p className="text-[#cdd6f4] text-sm font-medium">Claude Code</p><p className="text-[#6c7086] text-xs mt-1">{selectedProject ? `Edits land directly in ${selectedProject.name || selectedProject.path}.` : "Pick a project from the sidebar to enable file editing."}</p></div>
              <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                {["Refactor this module", "Find security issues", "Write unit tests", "Explain architecture"].map(s => (
                  <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                    className="text-[10px] px-2 py-1 rounded-full border border-[#313244] text-[#6c7086] hover:text-[#cdd6f4] hover:border-[#fab387]/30">{s}</button>
                ))}
              </div>
            </div>
          )}
          {fileEdits.length > 0 && (
            <div className="space-y-1">
              <FileEditSummary
                edits={fileEdits}
                onUndoLast={handleUndoLastForFile}
                onRedoLast={handleRedoLastForFile}
                onRevertAll={handleRevertAllForFile}
                pendingPath={fileUndoPending}
                pendingAction={fileUndoAction}
                errorPath={fileUndoError?.path}
                errorMessage={fileUndoError?.message}
                redoPendingPath={fileRedoPending}
                redoErrorPath={fileRedoError?.path}
                redoErrorMessage={fileRedoError?.message}
              />
              {fileEdits.map((e, i) => (
                <FileEditCard
                  key={e.editId ?? `no-undo-${i}`}
                  edit={e}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  isLatestForFile={!!e.editId && latestEditIdByPath.get(e.path) === e.editId}
                  isTopOfRedoForFile={!!e.editId && topRedoEditIdByPath.get(e.path) === e.editId}
                />
              ))}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && <div className="h-5 w-5 rounded-full bg-[#fab387]/20 flex items-center justify-center shrink-0 mt-0.5"><Bot className="h-3 w-3 text-[#fab387]" /></div>}
              <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-xs",
                msg.role === "user" ? "bg-[#89b4fa]/10 text-[#cdd6f4] border border-[#89b4fa]/20" : "bg-[#181825] text-[#cdd6f4] border border-[#313244]"
              )}>
                <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed select-text cursor-text">{msg.content}</pre>
                {msg.streaming && <span className="inline-block w-1.5 h-3.5 bg-[#fab387] animate-pulse ml-0.5 align-middle" />}
                {msg.errorCode === "AI_NOT_CONFIGURED" && (
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("workbench:open-panel", {
                          detail: { side: "right", panel: "env" },
                        }),
                      );
                    }}
                    className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[#f9e2af]/15 text-[#f9e2af] hover:bg-[#f9e2af]/25 border border-[#f9e2af]/25"
                  >
                    Open Env Vars panel
                  </button>
                )}
              </div>
              {msg.role === "user" && <div className="h-5 w-5 rounded-full bg-[#89b4fa]/20 flex items-center justify-center shrink-0 mt-0.5"><User className="h-3 w-3 text-[#89b4fa]" /></div>}
            </div>
          ))}
        </div>
      </div>
      <div className="p-2 border-t border-[#313244] bg-[#181825]">
        <div className="flex items-end gap-2">
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Ask Claude Code... (Enter to send)"
            className="flex-1 min-h-[36px] max-h-[120px] text-xs font-mono bg-[#1e1e2e] border border-[#313244] text-[#cdd6f4] placeholder:text-[#585b70] rounded-lg px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-[#fab387]/50"
            disabled={isStreaming} />
          {isStreaming ? (
            <button onClick={handleStop} className="h-9 px-3 rounded-lg text-[#f38ba8] hover:bg-[#f38ba8]/10 flex items-center justify-center"><Square className="h-3.5 w-3.5" /></button>
          ) : (
            <button onClick={handleSubmit} disabled={!input.trim()} className="h-9 px-3 rounded-lg bg-[#fab387] hover:bg-[#f9e2af] text-[#1e1e2e] flex items-center justify-center disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function AIRouterPanel() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = usePersistedState<ChatMessage[]>("cw-router-messages", []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [routingMode, setRoutingMode] = usePersistedState<string>("cw-routing-mode", "auto");
  const [manualModel, setManualModel] = usePersistedState<string>("cw-manual-model", "");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: config } = useQuery<any>({
    queryKey: ["wb-router-config"],
    queryFn: async () => { const res = await fetch(`/api/workbench/router-config`, { credentials: "include" }); return res.json(); },
  });

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const prompt = input.trim();
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: prompt, timestamp: Date.now() };
    const assistantMsg: ChatMessage = { role: "assistant", content: "", timestamp: Date.now(), streaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    scrollToBottom();
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const body: Record<string, any> = { prompt, mode: routingMode, stream: true };
      if (routingMode === "manual" && manualModel) body.model = manualModel;
      const conversationHistory = messages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }));
      body.messages = conversationHistory;

      const res = await fetch(`/api/workbench/route-prompt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal, credentials: "include",
      });
      if (!res.ok) {
        // Parse the structured `{ error, code, upstreamStatus }` body the
        // workbench AI routes return — without this, a 502 would surface
        // as an opaque "HTTP 502" toast instead of the actionable upstream
        // error message. Mirrors the /code-chat panel's contract.
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (err?.code === "AI_NOT_CONFIGURED") {
          const aiErr: any = new Error(
            "AI router isn't configured. Add the AI_INTEGRATIONS_ANTHROPIC_API_KEY and AI_INTEGRATIONS_ANTHROPIC_BASE_URL secrets in the Env Vars panel, then try again.",
          );
          aiErr.code = "AI_NOT_CONFIGURED";
          throw aiErr;
        }
        const aiErr: any = new Error(err?.error || `HTTP ${res.status}`);
        if (err?.code) aiErr.code = err.code;
        throw aiErr;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n"); buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk") { setMessages(prev => { const u = [...prev]; const l = u[u.length-1]; if (l?.streaming) u[u.length-1] = { ...l, content: l.content + data.content, model: data.model }; return u; }); scrollToBottom(); }
              else if (data.type === "model_selected") { setMessages(prev => { const u = [...prev]; const l = u[u.length-1]; if (l?.streaming) u[u.length-1] = { ...l, model: data.model }; return u; }); }
              else if (data.type === "done") { setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, tokens: data.tokens } : m)); }
              else if (data.type === "error") { setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, content: m.content + `\nError: ${data.content}` } : m)); }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      const errorCode: string | undefined = err?.code;
      setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, content: `Error: ${err.message}`, errorCode } : m));
    } finally { setIsStreaming(false); setAbortController(null); setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m)); scrollToBottom(); }
  }, [input, isStreaming, routingMode, manualModel, messages, scrollToBottom]);

  const availableModels = config?.models?.filter((m: any) => m.available) || [];
  const modelColors: Record<string, string> = { "claude-sonnet-4-6": "text-[#fab387]", "claude-opus-4-6": "text-[#cba6f7]", "claude-haiku-4-5": "text-[#a6e3a1]" };

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-[#f9e2af]" />
          <span className="text-xs text-[#cdd6f4] font-mono">AI Router</span>
          {availableModels.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#a6e3a1]/30 text-[#a6e3a1]">{availableModels.length} models</span>}
        </div>
        <div className="flex items-center gap-1">
          {(["auto", "manual"] as const).map(m => (
            <button key={m} onClick={() => setRoutingMode(m)}
              className={cn("text-[10px] px-1.5 py-0.5 rounded capitalize", routingMode === m ? "bg-[#f9e2af] text-[#1e1e2e]" : "text-[#6c7086] hover:bg-[#313244]")}>{m}</button>
          ))}
        </div>
      </div>
      {routingMode === "manual" && (
        <div className="px-2 py-1 border-b border-[#313244] bg-[#181825]">
          <select value={manualModel} onChange={e => setManualModel(e.target.value)}
            className="w-full h-6 text-[10px] rounded border border-[#313244] bg-[#1e1e2e] text-[#cdd6f4] outline-none">
            <option value="">Auto-select</option>
            {availableModels.map((m: any) => <option key={m.id} value={m.id}>{m.name} ({m.speed}, {m.cost})</option>)}
          </select>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3" ref={scrollRef}>
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <Zap className="h-8 w-8 mx-auto text-[#f9e2af]/30" />
              <p className="text-sm text-[#cdd6f4]">AI Router</p>
              <p className="text-xs text-[#6c7086]">Auto-routes to the best Claude model for your task.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && <div className="h-5 w-5 rounded-full bg-[#f9e2af]/20 flex items-center justify-center shrink-0 mt-0.5"><Zap className="h-3 w-3 text-[#f9e2af]" /></div>}
              <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-xs",
                msg.role === "user" ? "bg-[#89b4fa]/10 border border-[#89b4fa]/20" : "bg-[#181825] border border-[#313244]"
              )}>
                {msg.model && <div className="flex items-center gap-1 mb-1">
                  <span className={cn("text-[9px] font-mono", modelColors[msg.model] || "text-[#6c7086]")}>{msg.model}</span>
                  {msg.tokens && <span className="text-[9px] text-[#585b70]">{msg.tokens} tokens</span>}
                </div>}
                <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed text-[#cdd6f4] select-text cursor-text">{msg.content}</pre>
                {msg.streaming && <span className="inline-block w-1.5 h-3.5 bg-[#f9e2af] animate-pulse ml-0.5 align-middle" />}
                {msg.errorCode === "AI_NOT_CONFIGURED" && (
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("workbench:open-panel", {
                          detail: { side: "right", panel: "env" },
                        }),
                      );
                    }}
                    className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[#f9e2af]/15 text-[#f9e2af] hover:bg-[#f9e2af]/25 border border-[#f9e2af]/25"
                  >
                    Open Env Vars panel
                  </button>
                )}
              </div>
              {msg.role === "user" && <div className="h-5 w-5 rounded-full bg-[#89b4fa]/20 flex items-center justify-center shrink-0 mt-0.5"><User className="h-3 w-3 text-[#89b4fa]" /></div>}
            </div>
          ))}
        </div>
      </div>
      <div className="p-2 border-t border-[#313244] bg-[#181825]">
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Route a prompt... (Enter to send)"
            className="flex-1 min-h-[36px] max-h-[120px] text-xs font-mono bg-[#1e1e2e] border border-[#313244] text-[#cdd6f4] placeholder:text-[#585b70] rounded-lg px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-[#f9e2af]/50"
            disabled={isStreaming} />
          {isStreaming ? (
            <button onClick={() => { abortController?.abort(); setAbortController(null); setIsStreaming(false); setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m)); }}
              className="h-9 px-3 rounded-lg text-[#f38ba8] hover:bg-[#f38ba8]/10"><Square className="h-3.5 w-3.5" /></button>
          ) : (
            <button onClick={handleSubmit} disabled={!input.trim()} className="h-9 px-3 rounded-lg bg-[#f9e2af] hover:bg-[#f9e2af]/80 text-[#1e1e2e] disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function CodeReviewPanel() {
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/workbench/code-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectSlug: "llm-hub" }), credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.code === "AI_NOT_CONFIGURED") {
          const aiErr: any = new Error(
            "AI code review isn't configured. Add the AI_INTEGRATIONS_ANTHROPIC_API_KEY and AI_INTEGRATIONS_ANTHROPIC_BASE_URL secrets in the Env Vars panel, then retry.",
          );
          aiErr.code = "AI_NOT_CONFIGURED";
          throw aiErr;
        }
        throw new Error(body?.error || `Code review failed (HTTP ${res.status})`);
      }
      return body;
    },
  });

  useEffect(() => { reviewMutation.mutate(); }, []);

  const review = reviewMutation.data?.review;
  const meta = reviewMutation.data?.meta;

  const gradeColor = (g: string) => {
    if (g === "A") return "text-[#a6e3a1] border-[#a6e3a1]/40 bg-[#a6e3a1]/10";
    if (g === "B") return "text-[#89b4fa] border-[#89b4fa]/40 bg-[#89b4fa]/10";
    if (g === "C") return "text-[#f9e2af] border-[#f9e2af]/40 bg-[#f9e2af]/10";
    return "text-[#f38ba8] border-[#f38ba8]/40 bg-[#f38ba8]/10";
  };

  const filteredIssues = (review?.issues || []).filter((i: any) => filterSeverity === "all" || i.severity === filterSeverity);

  if (reviewMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-[#cba6f7]" />
        <div className="text-center"><p className="text-sm font-medium text-[#cba6f7]">Reviewing codebase...</p><p className="text-xs text-[#6c7086] mt-1">Scanning files, analyzing patterns</p></div>
      </div>
    );
  }

  if (!review) {
    const errObj = reviewMutation.error as (Error & { code?: string }) | null;
    const errMsg = errObj?.message || "Review failed";
    const isMisconfigured = errObj?.code === "AI_NOT_CONFIGURED";
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <XCircle className="h-6 w-6 text-[#f38ba8]" />
        <p className="text-sm text-[#f38ba8] text-center">{errMsg}</p>
        {isMisconfigured && (
          <button
            type="button"
            className="px-3 py-1 text-xs rounded bg-[#f9e2af]/15 text-[#f9e2af] hover:bg-[#f9e2af]/25 border border-[#f9e2af]/25"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("workbench:open-panel", {
                  detail: { side: "right", panel: "env" },
                }),
              )
            }
          >
            Open Env Vars panel
          </button>
        )}
        <button className="px-3 py-1 text-xs rounded bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a]" onClick={() => reviewMutation.mutate()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-[#cba6f7]" />
          <span className="text-xs font-medium text-[#cdd6f4]">Code Review</span>
          {review.overallGrade && <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-bold", gradeColor(review.overallGrade))}>Grade: {review.overallGrade}</span>}
        </div>
        <div className="flex items-center gap-1">
          {meta?.filesScanned && <span className="text-[10px] text-[#6c7086]">{meta.filesScanned} files</span>}
          <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => reviewMutation.mutate()}><RefreshCw className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {review.overallSummary && <div className="p-2 rounded bg-[#181825] border border-[#313244]"><p className="text-xs text-[#a6adc8] leading-relaxed">{review.overallSummary}</p></div>}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded bg-[#181825] border border-[#313244] text-center">
            <Shield className="h-4 w-4 mx-auto mb-1 text-[#89dceb]" />
            <p className="text-lg font-bold text-[#89dceb]">{review.securityAudit?.score || "--"}/10</p>
            <p className="text-[9px] text-[#6c7086]">Security</p>
          </div>
          <div className="p-2 rounded bg-[#181825] border border-[#313244] text-center">
            <Bug className="h-4 w-4 mx-auto mb-1 text-[#f38ba8]" />
            <p className="text-lg font-bold text-[#f38ba8]">{(review.issues || []).filter((i: any) => i.severity === "critical").length}</p>
            <p className="text-[9px] text-[#6c7086]">Critical</p>
          </div>
          <div className="p-2 rounded bg-[#181825] border border-[#313244] text-center">
            <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-[#f9e2af]" />
            <p className="text-lg font-bold text-[#f9e2af]">{(review.issues || []).filter((i: any) => i.severity === "warning").length}</p>
            <p className="text-[9px] text-[#6c7086]">Warnings</p>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#a6adc8]">Issues ({filteredIssues.length})</span>
            <div className="flex gap-1">
              {["all", "critical", "warning", "info"].map(s => (
                <button key={s} onClick={() => setFilterSeverity(s)}
                  className={cn("text-[9px] px-1.5 py-0.5 rounded capitalize", filterSeverity === s ? "bg-[#cba6f7] text-[#1e1e2e]" : "text-[#6c7086] hover:bg-[#313244]")}>{s}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">{filteredIssues.map((issue: any, idx: number) => (
            <div key={idx} className={cn("p-2 rounded border text-xs",
              issue.severity === "critical" ? "border-[#f38ba8]/30 bg-[#f38ba8]/5" :
              issue.severity === "warning" ? "border-[#f9e2af]/30 bg-[#f9e2af]/5" : "border-[#313244] bg-[#181825]"
            )}>
              <div className="flex items-center gap-2">
                {issue.severity === "critical" ? <XCircle className="h-3 w-3 text-[#f38ba8]" /> :
                 issue.severity === "warning" ? <AlertTriangle className="h-3 w-3 text-[#f9e2af]" /> :
                 <CheckCircle2 className="h-3 w-3 text-[#89b4fa]" />}
                <span className="font-medium text-[#cdd6f4]">{issue.title}</span>
                {issue.category && <span className="text-[8px] px-1 rounded bg-[#313244] text-[#6c7086]">{issue.category}</span>}
              </div>
              {issue.file && <div className="flex items-center gap-1 mt-1 ml-5"><FileCode className="h-2.5 w-2.5 text-[#6c7086]" /><span className="text-[9px] text-[#6c7086] font-mono">{issue.file}</span></div>}
              {issue.detail && <p className="text-[10px] text-[#a6adc8] mt-1 ml-5">{issue.detail}</p>}
              {issue.suggestion && <div className="mt-1 ml-5 p-1.5 rounded bg-[#1e1e2e] border border-[#313244]"><p className="text-[9px] text-[#a6e3a1] font-mono">{issue.suggestion}</p></div>}
            </div>
          ))}</div>
        </div>
      </div>
    </div>
  );
}

interface CWSSHAIMessage {
  role: "user" | "assistant";
  content: string;
  commands?: { command: string; stdout?: string; stderr?: string; exitCode?: number; error?: string }[];
  streaming?: boolean;
}

function CWSSHPanel() {
  const [host, setHost] = useState(() => localStorage.getItem("ssh-host") || "");
  const [port, setPort] = useState(() => localStorage.getItem("ssh-port") || "22");
  const [username, setUsername] = useState(() => localStorage.getItem("ssh-username") || "");
  const [authType, setAuthType] = useState<"password" | "key">(() => (localStorage.getItem("ssh-auth-type") as any) || "password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState(() => localStorage.getItem("ssh-private-key") || "");
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = usePersistedState<{ command: string; stdout?: string; stderr?: string; exitCode?: number; error?: string; timestamp: number }[]>("cw-ssh-history", []);
  const [cmdHistory, setCmdHistory] = usePersistedState<string[]>("cw-ssh-cmds", []);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showConfig, setShowConfig] = useState(true);
  const [mode, setMode] = usePersistedState<"terminal" | "ai" | "files">("cw-ssh-mode", "terminal");
  const [aiMessages, setAiMessages] = usePersistedState<CWSSHAIMessage[]>("cw-ssh-ai-messages", []);
  const [aiInput, setAiInput] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiAbort, setAiAbort] = useState<AbortController | null>(null);
  const [aiModel, setAiModel] = usePersistedState("cw-ssh-ai-model", "auto");
  const [aiAvailableModels, setAiAvailableModels] = useState<{ id: string; label: string; provider: string }[]>([]);
  const [aiDragOver, setAiDragOver] = useState(false);
  const [aiUploading, setAiUploading] = useState(false);
  const [aiAttachedFiles, setAiAttachedFiles] = useState<{ name: string; remotePath: string; size: number }[]>([]);
  const [aiIncludeProjectContext, setAiIncludeProjectContext] = usePersistedState("cw-ssh-ai-include-ctx", true);
  const { project: sshSelectedProject } = useSelectedProject();
  const [remotePath, setRemotePath] = usePersistedState("cw-ssh-remote-path", "/");
  const [remoteFiles, setRemoteFiles] = useState<{ name: string; type: string; size: number; modified: number }[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<{ name: string; type: string; size?: number; path: string }[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localPath, setLocalPath] = useState("projects");
  const [transferring, setTransferring] = useState<string | null>(null);
  const [transferResult, setTransferResult] = useState<{ file: string; success: boolean; error?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aiScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (host) localStorage.setItem("ssh-host", host);
    if (port) localStorage.setItem("ssh-port", port);
    if (username) localStorage.setItem("ssh-username", username);
    localStorage.setItem("ssh-auth-type", authType);
    if (privateKey) localStorage.setItem("ssh-private-key", privateKey);
  }, [host, port, username, authType, privateKey]);

  useEffect(() => {
    (async () => {
      try {
        const [statusRes, configRes] = await Promise.all([
          fetch("/api/llm/status", { credentials: "include" }),
          fetch("/api/llm/config", { credentials: "include" }),
        ]);
        const status = await statusRes.json();
        const config = await configRes.json();
        const models: { id: string; label: string; provider: string }[] = [
          { id: "auto", label: "Auto (best available)", provider: "auto" },
        ];
        if (status.openrouterAvailable) {
          models.push({ id: "openrouter/google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "cloud" });
          models.push({ id: "openrouter/deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", provider: "cloud" });
          models.push({ id: "openrouter/meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "cloud" });
        }
        if (status.anthropicAvailable) {
          models.push({ id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "cloud" });
        }
        if (status.online && config.serverUrl) {
          try {
            const tagsRes = await fetch("/api/llm/models", { credentials: "include" });
            const tagsData = await tagsRes.json();
            const ollamaModels = tagsData.models || tagsData || [];
            for (const m of ollamaModels) {
              const name = m.name || m.model;
              if (name) models.push({ id: `ollama/${name}`, label: `${name} (local)`, provider: "ollama" });
            }
          } catch {}
        }
        setAiAvailableModels(models);
      } catch {}
    })();
  }, []);

  const sshCreds = () => ({
    host, port: parseInt(port), username,
    ...(authType === "password" ? { password } : { privateKey }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/workbench/ssh/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sshCreds()), credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Connection failed"); }
      return res.json();
    },
    onSuccess: () => {
      setConnected(true);
      setShowConfig(false);
      setHistory(h => [...h, { command: "# Connected to " + host, stdout: `SSH connection established to ${username}@${host}:${port}`, timestamp: Date.now() }]);
    },
  });

  const execMutation = useMutation({
    mutationFn: async (command: string) => {
      const res = await fetch(`/api/workbench/ssh/exec`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sshCreds(), command }), credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Command failed"); }
      return res.json();
    },
    onSuccess: (data, command) => {
      setHistory(h => [...h, { command, ...data, timestamp: Date.now() }]);
      setCmdHistory(h => [command, ...h.slice(0, 49)]);
      setHistoryIndex(-1);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    },
    onError: (err, command) => {
      setHistory(h => [...h, { command, error: (err as Error).message, timestamp: Date.now() }]);
    },
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!input.trim()) return; if (input.trim() === "clear") { setHistory([]); setInput(""); return; } execMutation.mutate(input.trim()); setInput(""); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); if (historyIndex < cmdHistory.length - 1) { const idx = historyIndex + 1; setHistoryIndex(idx); setInput(cmdHistory[idx]); } }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (historyIndex > 0) { const idx = historyIndex - 1; setHistoryIndex(idx); setInput(cmdHistory[idx]); } else { setHistoryIndex(-1); setInput(""); } }
  };

  const sshBodyBase = () => ({
    host, port: parseInt(port), username,
    ...(authType === "password" ? { password } : { privateKey }),
  });

  const loadRemoteFiles = useCallback(async (p?: string) => {
    const targetPath = p ?? remotePath;
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const res = await fetch(`/api/workbench/ssh/list-remote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sshBodyBase(), path: targetPath }),
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to list remote files"); }
      const data = await res.json();
      setRemoteFiles(data.entries || []);
      if (p !== undefined) setRemotePath(p);
    } catch (err: any) {
      setRemoteError(err.message);
      setRemoteFiles([]);
    } finally {
      setRemoteLoading(false);
    }
  }, [remotePath, host, port, username, authType, password, privateKey]);

  const loadLocalFiles = useCallback(async (browsePath?: string) => {
    const p = browsePath ?? localPath;
    setLocalLoading(true);
    try {
      const res = await fetch(`/api/workbench/files?path=${encodeURIComponent(p)}`, { credentials: "include" });
      const data = await res.json();
      setLocalFiles((data.items || []).map((item: any) => ({
        name: item.name,
        type: item.type,
        size: item.size,
        path: item.path,
      })));
      if (browsePath !== undefined) setLocalPath(browsePath);
    } catch {
      setLocalFiles([]);
    } finally {
      setLocalLoading(false);
    }
  }, [localPath]);

  const transferToRemote = useCallback(async (localPath: string, fileName: string) => {
    setTransferring(fileName);
    setTransferResult(null);
    try {
      const remoteTarget = remotePath === "/" ? `/${fileName}` : `${remotePath}/${fileName}`;
      const res = await fetch(`/api/workbench/ssh/upload-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sshBodyBase(), localPath, remotePath: remoteTarget }),
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Transfer failed"); }
      setTransferResult({ file: fileName, success: true });
      loadRemoteFiles();
    } catch (err: any) {
      setTransferResult({ file: fileName, success: false, error: err.message });
    } finally {
      setTransferring(null);
    }
  }, [remotePath, host, port, username, authType, password, privateKey, loadRemoteFiles]);

  useEffect(() => {
    if (mode === "files" && connected) {
      loadRemoteFiles();
      loadLocalFiles();
    }
  }, [mode, connected]);

  const aiFileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setAiUploading(true);
    try {
      const formData = new FormData();
      formData.append("path", "attached_assets");
      for (const file of files) {
        formData.append("files", file);
      }
      const res = await fetch(`/api/workbench/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        const uploaded = (data.files || []).map((f: any) => ({
          name: f.name,
          remotePath: f.path || f.extractedTo || f.name,
          size: f.size || 0,
        }));
        if (uploaded.length > 0) {
          setAiAttachedFiles(prev => [...prev, ...uploaded]);
          const fileList = (data.files || []).map((f: any) => {
            if (f.type === "zip") return `${f.name} (zip, ${f.fileCount} files extracted)`;
            return `${f.name} (${formatBytes(f.size || 0)})`;
          }).join(", ");
          setAiMessages(prev => [...prev, { role: "user", content: `Attached ${uploaded.length} file${uploaded.length > 1 ? "s" : ""}: ${fileList}` }]);
        }
      }
    } catch {}
    setAiUploading(false);
  }, []);

  const handleAIDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAiDragOver(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  }, [uploadFiles]);

  const handleAIFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFiles(Array.from(files));
    }
    if (aiFileInputRef.current) aiFileInputRef.current.value = "";
  }, [uploadFiles]);

  const handleAISubmit = useCallback(async () => {
    if (!aiInput.trim() || aiStreaming) return;
    let prompt = aiInput.trim();
    if (aiAttachedFiles.length > 0) {
      const fileContext = aiAttachedFiles.map(f => `${f.name} at ${f.remotePath}`).join(", ");
      prompt += `\n\n[Attached files: ${fileContext}]`;
      setAiAttachedFiles([]);
    }
    setAiInput("");
    const userMsg: CWSSHAIMessage = { role: "user", content: prompt };
    const assistantMsg: CWSSHAIMessage = { role: "assistant", content: "", commands: [], streaming: true };
    setAiMessages(prev => [...prev, userMsg, assistantMsg]);
    setAiStreaming(true);
    const controller = new AbortController();
    setAiAbort(controller);
    try {
      const convHistory = aiMessages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`/api/workbench/ssh/ai-chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sshBodyBase(), prompt, messages: convHistory, modelOverride: aiModel !== "auto" ? aiModel : undefined, project: sshSelectedProject || undefined, includeProjectContext: aiIncludeProjectContext }),
        signal: controller.signal, credentials: "include",
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || `HTTP ${res.status}`); }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "text") {
                setAiMessages(prev => { const msgs = [...prev]; const last = msgs[msgs.length - 1]; if (last?.streaming) msgs[msgs.length - 1] = { ...last, content: last.content + evt.content }; return msgs; });
              } else if (evt.type === "command") {
                setAiMessages(prev => { const msgs = [...prev]; const last = msgs[msgs.length - 1]; if (last?.streaming) { const cmds = [...(last.commands || []), { command: evt.command }]; msgs[msgs.length - 1] = { ...last, commands: cmds }; } return msgs; });
              } else if (evt.type === "command_result") {
                setAiMessages(prev => { const msgs = [...prev]; const last = msgs[msgs.length - 1]; if (last?.streaming && last.commands) { const cmds = [...last.commands]; const idx = cmds.findIndex(c => c.command === evt.command && !c.stdout && !c.stderr && !c.error); if (idx >= 0) cmds[idx] = { ...cmds[idx], stdout: evt.stdout, stderr: evt.stderr, exitCode: evt.exitCode }; msgs[msgs.length - 1] = { ...last, commands: cmds }; } return msgs; });
              } else if (evt.type === "command_error") {
                setAiMessages(prev => { const msgs = [...prev]; const last = msgs[msgs.length - 1]; if (last?.streaming && last.commands) { const cmds = [...last.commands]; const idx = cmds.length - 1; if (idx >= 0) cmds[idx] = { ...cmds[idx], error: evt.error }; msgs[msgs.length - 1] = { ...last, commands: cmds }; } return msgs; });
              } else if (evt.type === "error") {
                setAiMessages(prev => { const msgs = [...prev]; const last = msgs[msgs.length - 1]; if (last?.streaming) msgs[msgs.length - 1] = { ...last, content: last.content + "\n\nError: " + evt.content }; return msgs; });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setAiMessages(prev => { const msgs = [...prev]; const last = msgs[msgs.length - 1]; if (last?.streaming) msgs[msgs.length - 1] = { ...last, content: last.content + "\n\nError: " + err.message }; return msgs; });
      }
    } finally {
      setAiMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
      setAiStreaming(false);
      setAiAbort(null);
    }
  }, [aiInput, aiStreaming, aiMessages, host, port, username, authType, password, privateKey, aiModel, sshSelectedProject, aiIncludeProjectContext, aiAttachedFiles]);

  useEffect(() => {
    if (aiScrollRef.current) aiScrollRef.current.scrollTo({ top: aiScrollRef.current.scrollHeight });
  }, [aiMessages]);

  const ic = "w-full h-7 text-xs px-2 rounded border border-[#313244] bg-[#181825] text-[#cdd6f4] outline-none focus:ring-1 focus:ring-[#cba6f7] placeholder:text-[#585b70] font-mono";

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Server className="h-3.5 w-3.5 text-[#fab387]" />
          <span className="text-xs text-[#cdd6f4] font-mono">SSH</span>
          {connected && (
            <>
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#a6e3a1]/30 text-[#a6e3a1]">{username}@{host}</span>
              <div className="flex items-center gap-0.5 ml-1 bg-[#313244] rounded p-0.5">
                <button className={cn("text-[9px] px-1.5 py-0.5 rounded transition-colors", mode === "terminal" ? "bg-[#fab387] text-[#1e1e2e]" : "text-[#6c7086] hover:text-[#cdd6f4]")} onClick={() => setMode("terminal")}>Terminal</button>
                <button className={cn("text-[9px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5", mode === "ai" ? "bg-[#cba6f7] text-[#1e1e2e]" : "text-[#6c7086] hover:text-[#cdd6f4]")} onClick={() => setMode("ai")}><Sparkles className="h-2.5 w-2.5" />AI</button>
                <button className={cn("text-[9px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5", mode === "files" ? "bg-[#89b4fa] text-[#1e1e2e]" : "text-[#6c7086] hover:text-[#cdd6f4]")} onClick={() => setMode("files")}><FolderTree className="h-2.5 w-2.5" />Files</button>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4]" onClick={() => setShowConfig(!showConfig)} title="Settings"><Key className="h-3 w-3" /></button>
          {connected && <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#f38ba8]" onClick={() => { setConnected(false); setShowConfig(true); setHistory([]); }}><XCircle className="h-3 w-3" /></button>}
          <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => { setHistory([]); setAiMessages([]); }}><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {showConfig && (
        <div className="p-3 border-b border-[#313244] bg-[#181825]/50 space-y-2">
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <div><label className="text-[10px] text-[#6c7086] block mb-0.5">Host</label><input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.100" className={ic} /></div>
            <div><label className="text-[10px] text-[#6c7086] block mb-0.5">Port</label><input value={port} onChange={e => setPort(e.target.value)} placeholder="22" className={ic} /></div>
          </div>
          <div><label className="text-[10px] text-[#6c7086] block mb-0.5">Username</label><input value={username} onChange={e => setUsername(e.target.value)} placeholder="root" className={ic} /></div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[#6c7086]">Auth:</label>
            <button className={cn("text-[10px] px-2 py-0.5 rounded border", authType === "password" ? "border-[#cba6f7] text-[#cba6f7] bg-[#cba6f7]/10" : "border-[#313244] text-[#6c7086]")} onClick={() => setAuthType("password")}>Password</button>
            <button className={cn("text-[10px] px-2 py-0.5 rounded border", authType === "key" ? "border-[#cba6f7] text-[#cba6f7] bg-[#cba6f7]/10" : "border-[#313244] text-[#6c7086]")} onClick={() => setAuthType("key")}>Private Key</button>
          </div>
          {authType === "password" ? (
            <div><label className="text-[10px] text-[#6c7086] block mb-0.5">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={ic} /></div>
          ) : (
            <div><label className="text-[10px] text-[#6c7086] block mb-0.5">Private Key (paste PEM)</label>
              <textarea value={privateKey} onChange={e => setPrivateKey(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                className="w-full h-16 text-[10px] px-2 py-1 rounded border border-[#313244] bg-[#181825] text-[#cdd6f4] outline-none focus:ring-1 focus:ring-[#cba6f7] placeholder:text-[#585b70] font-mono resize-none" />
            </div>
          )}
          <button onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !host || !username}
            className="w-full h-7 text-xs rounded bg-[#fab387] hover:bg-[#fab387]/80 text-[#1e1e2e] font-medium disabled:opacity-40 flex items-center justify-center gap-1.5">
            {testMutation.isPending ? <><Loader2 className="h-3 w-3 animate-spin" /> Connecting...</> : <><Server className="h-3 w-3" /> Connect</>}
          </button>
          {testMutation.isError && <div className="text-[10px] text-[#f38ba8] bg-[#f38ba8]/10 rounded px-2 py-1 border border-[#f38ba8]/20">{(testMutation.error as Error).message}</div>}
        </div>
      )}

      {mode === "terminal" && (
        <>
          <div className="flex-1 overflow-y-auto p-2" ref={scrollRef}>
            <div className="font-mono text-xs space-y-1">
              {!connected && history.length === 0 && (
                <div className="text-[#585b70] py-4 text-center">
                  <Server className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  Configure your VPS connection above to get started.
                  <br /><span className="text-[10px]">Run commands, deploy code, manage services remotely.</span>
                </div>
              )}
              {history.map((entry, i) => (
                <div key={i} className="mb-2">
                  <div className="flex items-center gap-1"><span className="text-[#fab387]">{username || "$"}@{host || "vps"} $</span><span className="text-[#cdd6f4] select-text cursor-text">{entry.command}</span></div>
                  {entry.stdout && <pre className="text-[#a6adc8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stdout}</pre>}
                  {entry.stderr && <pre className="text-[#f38ba8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stderr}</pre>}
                  {entry.error && <pre className="text-[#f38ba8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">Error: {entry.error}</pre>}
                  {entry.exitCode !== undefined && entry.exitCode !== 0 && <span className="text-[10px] text-[#f9e2af] ml-3">exit code: {entry.exitCode}</span>}
                </div>
              ))}
              {execMutation.isPending && <div className="flex items-center gap-2 text-[#89b4fa]"><Loader2 className="h-3 w-3 animate-spin" /><span>Running on remote...</span></div>}
            </div>
          </div>
          {connected && (
            <form onSubmit={handleSubmit} className="flex items-center gap-1 px-2 py-1.5 border-t border-[#313244] bg-[#181825]">
              <span className="text-[#fab387] font-mono text-xs shrink-0">{username}@{host} $</span>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-[#cdd6f4] font-mono text-xs outline-none placeholder:text-[#585b70]"
                placeholder="Enter command to run on VPS..." disabled={execMutation.isPending} autoFocus />
            </form>
          )}
        </>
      )}

      {mode === "ai" && (
        <>
          <div
            className={cn("flex-1 overflow-y-auto p-3 space-y-3 relative transition-colors", aiDragOver && "bg-[#cba6f7]/10 ring-2 ring-[#cba6f7]/40 ring-inset rounded")}
            ref={aiScrollRef}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setAiDragOver(true); }}
            onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setAiDragOver(true); }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setAiDragOver(false); }}
            onDrop={connected ? handleAIDrop : e => { e.preventDefault(); setAiDragOver(false); }}
          >
            {aiDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e2e]/80 z-10 rounded pointer-events-none">
                <div className="text-center">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-[#cba6f7]" />
                  <div className="text-xs text-[#cba6f7] font-medium">Drop files to attach</div>
                  <div className="text-[10px] text-[#6c7086]">Files will be available as context for AI</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-2">
              <select
                value={aiModel}
                onChange={e => setAiModel(e.target.value)}
                className="flex-1 bg-[#181825] text-[#cdd6f4] text-[10px] rounded border border-[#313244] px-2 py-1 outline-none focus:ring-1 focus:ring-[#cba6f7]"
                disabled={aiStreaming}
              >
                {aiAvailableModels.length === 0 && <option value="auto">Loading models...</option>}
                {aiAvailableModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.provider === "cloud" ? "☁️ " : m.provider === "ollama" ? "🖥️ " : "⚡ "}{m.label}
                  </option>
                ))}
              </select>
              {aiMessages.length > 0 && (
                <button
                  className="text-[10px] px-2 py-1 rounded bg-[#313244] text-[#f38ba8] hover:bg-[#45475a] transition-colors whitespace-nowrap"
                  onClick={() => { setAiMessages([]); }}
                >
                  Clear
                </button>
              )}
            </div>
            {aiMessages.length === 0 && (
              <div className="text-[#585b70] py-4 text-center">
                <Sparkles className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <span className="text-xs">AI Server Assistant</span>
                <br /><span className="text-[10px]">Ask me to check services, debug issues, deploy code, manage files — I'll run the commands for you.</span>
              </div>
            )}
            {aiMessages.map((msg, i) => (
              <div key={i} className={cn("text-xs", msg.role === "user" ? "flex justify-end" : "")}>
                {msg.role === "user" ? (
                  <div className="bg-[#cba6f7]/15 border border-[#cba6f7]/20 rounded-lg px-3 py-2 max-w-[85%] text-[#cdd6f4] select-text cursor-text whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <div className="space-y-2">
                    {msg.content && <div className="text-[#cdd6f4] select-text cursor-text whitespace-pre-wrap leading-relaxed">{msg.content}</div>}
                    {msg.commands && msg.commands.map((cmd, j) => (
                      <div key={j} className="bg-[#181825] rounded border border-[#313244] overflow-hidden">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#313244]/50 border-b border-[#313244]">
                          <Terminal className="h-3 w-3 text-[#fab387]" />
                          <code className="text-[10px] text-[#fab387] select-text cursor-text">{cmd.command}</code>
                          {cmd.exitCode !== undefined && cmd.exitCode !== 0 && <span className="text-[9px] text-[#f38ba8] ml-auto">exit {cmd.exitCode}</span>}
                          {cmd.exitCode === 0 && <span className="text-[9px] text-[#a6e3a1] ml-auto">ok</span>}
                          {cmd.exitCode === undefined && !cmd.error && <Loader2 className="h-2.5 w-2.5 animate-spin text-[#89b4fa] ml-auto" />}
                        </div>
                        {cmd.stdout && <pre className="text-[10px] text-[#a6adc8] p-2 whitespace-pre-wrap break-all select-text cursor-text max-h-40 overflow-y-auto">{cmd.stdout}</pre>}
                        {cmd.stderr && <pre className="text-[10px] text-[#f38ba8] p-2 whitespace-pre-wrap break-all select-text cursor-text max-h-40 overflow-y-auto">{cmd.stderr}</pre>}
                        {cmd.error && <pre className="text-[10px] text-[#f38ba8] p-2 select-text cursor-text">{cmd.error}</pre>}
                      </div>
                    ))}
                    {msg.streaming && (
                      <div className="flex items-center gap-1.5 text-[#89b4fa]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-[10px]">Thinking...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {connected && (
            <div className="border-t border-[#313244] bg-[#181825] p-2">
              {aiUploading && (
                <div className="flex items-center gap-1.5 text-[#89b4fa] text-[10px] mb-1.5 px-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Uploading files...</span>
                </div>
              )}
              {aiAttachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5 px-1">
                  {aiAttachedFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-[#313244] text-[#cba6f7] px-1.5 py-0.5 rounded">
                      <File className="h-2.5 w-2.5" />
                      {f.name}
                      <button onClick={() => setAiAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="hover:text-[#f38ba8]">
                        <XCircle className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="file"
                ref={aiFileInputRef}
                onChange={handleAIFileSelect}
                multiple
                className="hidden"
              />
              <div className="flex items-end gap-1.5">
                <button
                  onClick={() => aiFileInputRef.current?.click()}
                  disabled={aiUploading || aiStreaming}
                  className="p-1.5 rounded text-[#6c7086] hover:text-[#cba6f7] hover:bg-[#313244] disabled:opacity-40 transition-colors"
                  title="Attach files"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <textarea
                  ref={aiInputRef}
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAISubmit(); } }}
                  className="flex-1 bg-[#1e1e2e] text-[#cdd6f4] text-xs rounded border border-[#313244] px-2 py-1.5 outline-none focus:ring-1 focus:ring-[#cba6f7] placeholder:text-[#585b70] resize-none min-h-[28px] max-h-[80px]"
                  placeholder={aiAttachedFiles.length > 0 ? "Ask about the uploaded files..." : sshSelectedProject && aiIncludeProjectContext ? `Ask AI (project ctx: ${sshSelectedProject.name || sshSelectedProject.path})…` : "Ask AI to run commands, or attach files..."}
                  rows={1}
                  disabled={aiStreaming}
                />
                {sshSelectedProject && (
                  <button
                    onClick={() => setAiIncludeProjectContext(v => !v)}
                    className={cn(
                      "px-1.5 py-1 rounded text-[10px] font-mono border transition-colors",
                      aiIncludeProjectContext
                        ? "bg-[#cba6f7]/20 text-[#cba6f7] border-[#cba6f7]/40"
                        : "text-[#6c7086] border-[#313244] hover:text-[#cdd6f4]"
                    )}
                    title={aiIncludeProjectContext ? "Project context enabled — click to disable" : "Project context disabled — click to enable"}
                  >
                    ctx
                  </button>
                )}
                {aiStreaming ? (
                  <button onClick={() => aiAbort?.abort()} className="p-1.5 rounded bg-[#f38ba8] text-[#1e1e2e] hover:bg-[#f38ba8]/80"><XCircle className="h-3.5 w-3.5" /></button>
                ) : (
                  <button onClick={handleAISubmit} disabled={!aiInput.trim()} className="p-1.5 rounded bg-[#cba6f7] text-[#1e1e2e] hover:bg-[#cba6f7]/80 disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {mode === "files" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {!connected ? (
            <div className="text-[#585b70] py-8 text-center">
              <FolderTree className="h-6 w-6 mx-auto mb-2 opacity-40" />
              <span className="text-xs">Connect to your VPS to browse files</span>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="border-b border-[#313244] bg-[#181825]/50 px-3 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-[#6c7086] overflow-x-auto min-w-0">
                  <Server className="h-3 w-3 text-[#fab387] shrink-0" />
                  <span className="text-[#a6adc8] font-medium shrink-0">Remote:</span>
                  {remotePath.split("/").filter(Boolean).length === 0 ? (
                    <span className="text-[#cdd6f4]">/</span>
                  ) : (
                    <>
                      <button className="hover:text-[#cdd6f4] transition-colors" onClick={() => loadRemoteFiles("/")}>/</button>
                      {remotePath.split("/").filter(Boolean).map((seg, i, arr) => (
                        <span key={i} className="flex items-center gap-0.5">
                          <ChevronRight className="h-2.5 w-2.5" />
                          <button
                            className="hover:text-[#cdd6f4] transition-colors"
                            onClick={() => loadRemoteFiles("/" + arr.slice(0, i + 1).join("/"))}
                          >{seg}</button>
                        </span>
                      ))}
                    </>
                  )}
                </div>
                <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] shrink-0" onClick={() => loadRemoteFiles()}>
                  <RefreshCw className={cn("h-3 w-3", remoteLoading && "animate-spin")} />
                </button>
              </div>

              <div className="flex flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto border-r border-[#313244]">
                  <div className="px-2 py-1 bg-[#313244]/30 border-b border-[#313244]">
                    <span className="text-[9px] font-semibold text-[#a6adc8] uppercase tracking-wider">Remote Server</span>
                  </div>
                  {remoteLoading ? (
                    <div className="p-3 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-[#89b4fa]" />
                    </div>
                  ) : remoteError ? (
                    <div className="p-2 text-[10px] text-[#f38ba8]">{remoteError}</div>
                  ) : (
                    <div className="p-1">
                      {remotePath !== "/" && (
                        <button
                          className="w-full text-left px-2 py-1 text-xs hover:bg-[#313244] rounded flex items-center gap-1.5"
                          onClick={() => {
                            const parts = remotePath.split("/").filter(Boolean);
                            parts.pop();
                            loadRemoteFiles("/" + parts.join("/") || "/");
                          }}
                        >
                          <Folder className="h-3.5 w-3.5 text-[#f9e2af]" />
                          <span className="text-[#6c7086]">..</span>
                        </button>
                      )}
                      {remoteFiles.map(f => (
                        <button
                          key={f.name}
                          className="w-full text-left px-2 py-1 text-xs hover:bg-[#313244] rounded flex items-center gap-1.5"
                          onClick={() => {
                            if (f.type === "directory") {
                              loadRemoteFiles(remotePath === "/" ? `/${f.name}` : `${remotePath}/${f.name}`);
                            }
                          }}
                        >
                          {f.type === "directory" ? (
                            <Folder className="h-3.5 w-3.5 text-[#f9e2af]" />
                          ) : (
                            <File className="h-3.5 w-3.5 text-[#6c7086]" />
                          )}
                          <span className="truncate flex-1 text-[#cdd6f4]">{f.name}</span>
                          {f.type !== "directory" && f.size !== undefined && (
                            <span className="text-[9px] text-[#585b70] shrink-0">{formatBytes(f.size)}</span>
                          )}
                        </button>
                      ))}
                      {remoteFiles.length === 0 && !remoteLoading && (
                        <div className="text-[10px] text-[#585b70] p-2 text-center">Empty directory</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto">
                  <div className="px-2 py-1 bg-[#313244]/30 border-b border-[#313244] flex items-center justify-between">
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <span className="text-[9px] font-semibold text-[#a6adc8] uppercase tracking-wider shrink-0">Local</span>
                      <span className="text-[9px] text-[#585b70] truncate">{localPath}/</span>
                    </div>
                    <button className="p-0.5 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4]" onClick={() => loadLocalFiles()}>
                      <RefreshCw className={cn("h-2.5 w-2.5", localLoading && "animate-spin")} />
                    </button>
                  </div>
                  {localLoading ? (
                    <div className="p-3 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-[#89b4fa]" />
                    </div>
                  ) : localFiles.length === 0 ? (
                    <div className="text-[10px] text-[#585b70] p-3 text-center">
                      No files in {localPath}/
                      <br />Upload files via the Upload tab
                    </div>
                  ) : (
                    <div className="p-1">
                      {localPath !== "projects" && (
                        <button
                          className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-[#313244] rounded w-full text-left text-[#6c7086] hover:text-[#cdd6f4]"
                          onClick={() => {
                            const parent = localPath.includes("/") ? localPath.substring(0, localPath.lastIndexOf("/")) : "projects";
                            loadLocalFiles(parent || "projects");
                          }}
                        >
                          <ChevronLeft className="h-3 w-3 shrink-0" />
                          <span>..</span>
                        </button>
                      )}
                      {localFiles.map(f => (
                        <div key={f.path} className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-[#313244] rounded group">
                          {f.type === "directory" ? (
                            <button
                              className="flex items-center gap-1 min-w-0 flex-1 text-left"
                              onClick={() => loadLocalFiles(f.path)}
                            >
                              <Folder className="h-3.5 w-3.5 text-[#f9e2af] shrink-0" />
                              <span className="truncate flex-1 text-[#cdd6f4]">{f.name}</span>
                            </button>
                          ) : (
                            <>
                              <File className="h-3.5 w-3.5 text-[#6c7086] shrink-0" />
                              <span className="truncate flex-1 text-[#cdd6f4]">{f.name}</span>
                              {f.size !== undefined && (
                                <span className="text-[9px] text-[#585b70] shrink-0">{formatBytes(f.size)}</span>
                              )}
                              <button
                                className="p-0.5 rounded hover:bg-[#89b4fa]/20 text-[#6c7086] hover:text-[#89b4fa] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                title={`Transfer to ${remotePath}`}
                                disabled={!!transferring}
                                onClick={() => transferToRemote(f.path, f.name)}
                              >
                                {transferring === f.name ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-[#89b4fa]" />
                                ) : (
                                  <Upload className="h-3 w-3" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {transferResult && (
                <div className={cn(
                  "px-3 py-1.5 border-t text-[10px] flex items-center gap-1.5",
                  transferResult.success
                    ? "border-[#a6e3a1]/20 bg-[#a6e3a1]/5 text-[#a6e3a1]"
                    : "border-[#f38ba8]/20 bg-[#f38ba8]/5 text-[#f38ba8]"
                )}>
                  {transferResult.success ? (
                    <><CheckCircle2 className="h-3 w-3" /> Transferred {transferResult.file} to {remotePath}</>
                  ) : (
                    <><XCircle className="h-3 w-3" /> Failed: {transferResult.error}</>
                  )}
                  <button className="ml-auto p-0.5 hover:bg-[#313244] rounded" onClick={() => setTransferResult(null)}>
                    <XCircle className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PANELS = [
  { id: "claude", label: "Claude Code", icon: Sparkles, component: ClaudeCodePanel },
  { id: "router", label: "AI Router", icon: Zap, component: AIRouterPanel },
  { id: "shell", label: "Shell", icon: Terminal, component: ShellPanel },
  { id: "scratch", label: "Scratch", icon: HardDrive, component: ScratchPanel },
  { id: "ssh", label: "SSH", icon: Server, component: CWSSHPanel },
  { id: "upload", label: "Upload", icon: Upload, component: () => <div className="p-3 h-full overflow-auto"><UploadArea catppuccin={true} /></div> },
  { id: "files", label: "Files", icon: FolderTree, component: FileExplorerPanel },
  { id: "preview", label: "Preview", icon: Eye, component: PreviewPanel },
  { id: "git", label: "Git", icon: GitBranch, component: GitPanel },
  { id: "activity", label: "Activity", icon: Bot, component: AgentActivityPanel },
  { id: "database", label: "Database", icon: Database, component: DatabasePanel },
  { id: "security", label: "Security", icon: Shield, component: SecurityPanel },
  { id: "skills", label: "Skills", icon: Puzzle, component: SkillsPanel },
  { id: "review", label: "Review", icon: Brain, component: CodeReviewPanel },
  { id: "env", label: "Env Vars", icon: Key, component: EnvPanel },
  { id: "process", label: "Process", icon: Activity, component: ProcessPanel },
  { id: "projects", label: "Projects", icon: FolderPlus, component: () => <ProjectManager catppuccin={true} /> },
] as const;

type PanelId = typeof PANELS[number]["id"];

function CWPanelSelector({ value, onChange }: { value: PanelId; onChange: (v: PanelId) => void }) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {PANELS.map(p => {
        const Icon = p.icon;
        return (
          <button key={p.id} onClick={() => onChange(p.id)}
            className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors",
              value === p.id ? "bg-[#fab387] text-[#1e1e2e]" : "text-[#6c7086] hover:bg-[#313244] hover:text-[#cdd6f4]"
            )}>
            <Icon className="h-3 w-3" />{p.label}
          </button>
        );
      })}
    </div>
  );
}

function CWPersistentPanelSlot({ activeId }: { activeId: PanelId }) {
  const [mounted, setMounted] = useState<Set<PanelId>>(new Set([activeId]));
  useEffect(() => { setMounted(prev => { if (prev.has(activeId)) return prev; const next = new Set(prev); next.add(activeId); return next; }); }, [activeId]);
  return (
    <div className="relative flex-1 min-h-0">
      {PANELS.filter(p => mounted.has(p.id)).map(p => {
        const Component = p.component;
        return (
          <div key={p.id} className={cn("absolute inset-0 overflow-hidden", p.id === activeId ? "z-10 visible" : "z-0 invisible")}>
            <Component />
          </div>
        );
      })}
    </div>
  );
}

export default function ClaudeWorkbench() {
  const [leftPanel, setLeftPanel] = usePersistedState<PanelId>("cw-left-panel", "claude");
  const [rightPanel, setRightPanel] = usePersistedState<PanelId>("cw-right-panel", "files");
  const [bottomPanel, setBottomPanel] = usePersistedState<PanelId>("cw-bottom-panel", "shell");
  const [bottomRightPanel, setBottomRightPanel] = usePersistedState<PanelId>("cw-bottom-right-panel", "git");
  const [showBottom, setShowBottom] = usePersistedState("cw-show-bottom", false);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("cw-sidebar-collapsed", false);
  const { project: sharedProject, setProject: setSharedProject } = useSelectedProject();
  const selectedProjectPath = sharedProject?.path || null;
  const [cloneStatus, setCloneStatus] = useState<{ state: "idle" | "pending" | "cloned" | "error" | "auth"; localPath?: string; error?: string }>({ state: "idle" });

  // Cross-panel deep-link: nested panels (e.g. the chat's "AI not
  // configured" error) ask the layout to switch a panel slot via this
  // event so the chat doesn't need to know which slot the env panel
  // currently occupies.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ side?: string; panel?: string }>).detail || {};
      const panel = detail.panel as PanelId | undefined;
      if (!panel) return;
      const side = detail.side;
      if (side === "left") setLeftPanel(panel);
      else if (side === "bottom") setBottomPanel(panel);
      else if (side === "bottom-right") setBottomRightPanel(panel);
      else setRightPanel(panel);
    };
    window.addEventListener("workbench:open-panel", handler);
    return () => window.removeEventListener("workbench:open-panel", handler);
  }, [setLeftPanel, setRightPanel, setBottomPanel, setBottomRightPanel]);

  useEffect(() => {
    if (!sharedProject || sharedProject.origin !== "replit") { setCloneStatus({ state: "idle" }); return; }
    let cancelled = false;
    setCloneStatus({ state: "pending" });
    fetch("/api/project-context/ensure-clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: sharedProject }),
      credentials: "include",
    })
      .then(async r => {
        if (cancelled) return;
        if (r.status === 401) { setCloneStatus({ state: "auth" }); return; }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setCloneStatus({ state: "error", error: j.error || `HTTP ${r.status}` }); return; }
        setCloneStatus({ state: "cloned", localPath: j.localPath });
      })
      .catch(err => { if (!cancelled) setCloneStatus({ state: "error", error: err?.message }); });
    return () => { cancelled = true; };
  }, [sharedProject?.origin, sharedProject?.path, sharedProject?.url]);

  const handleSelectProject = (project: any) => {
    setSharedProject(projectDescriptorFromSidebar(project));
  };

  // Top-bar scratch badge focuses the shell panel so users land on the
  // full ScratchQuotaBar (with the clear-cmd affordance) when they
  // click. We avoid rearranging panels if shell is already mounted
  // somewhere; otherwise we route it into the bottom-left slot and
  // force the bottom row open.
  const focusShellPanel = () => {
    if (leftPanel === "shell" || rightPanel === "shell") return;
    if (showBottom && (bottomPanel === "shell" || bottomRightPanel === "shell")) return;
    setBottomPanel("shell");
    setShowBottom(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#313244] bg-[#1e1e2e]/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded bg-gradient-to-br from-[#fab387] to-[#f9e2af] flex items-center justify-center">
            <Terminal className="h-3.5 w-3.5 text-[#1e1e2e]" />
          </div>
          <h1 className="text-base font-semibold tracking-tight text-[#cdd6f4]">Claude Workbench</h1>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#313244] text-[#6c7086]">IDE</span>
          {sharedProject && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#313244] text-[#cdd6f4] font-mono">
              {sharedProject.origin}: {sharedProject.name || sharedProject.path}
            </span>
          )}
          {sharedProject?.origin === "replit" && (
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded font-mono border",
                cloneStatus.state === "cloned" && "border-[#a6e3a1]/40 text-[#a6e3a1] bg-[#a6e3a1]/10",
                cloneStatus.state === "pending" && "border-[#89b4fa]/40 text-[#89b4fa] bg-[#89b4fa]/10",
                cloneStatus.state === "error" && "border-[#f38ba8]/40 text-[#f38ba8] bg-[#f38ba8]/10",
                cloneStatus.state === "auth" && "border-[#f9e2af]/40 text-[#f9e2af] bg-[#f9e2af]/10",
                cloneStatus.state === "idle" && "border-[#313244] text-[#6c7086]"
              )}
              title={cloneStatus.localPath || cloneStatus.error || ""}
            >
              {cloneStatus.state === "cloned" && `cloned → ${cloneStatus.localPath?.split("/").slice(-2).join("/") || "local"}`}
              {cloneStatus.state === "pending" && "cloning…"}
              {cloneStatus.state === "error" && "clone failed"}
              {cloneStatus.state === "auth" && "sign in to clone"}
              {cloneStatus.state === "idle" && "not cloned"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ScratchQuotaBadge apiBase={API_BASE} onFocusShell={focusShellPanel} />
          <button className={cn("px-3 py-1 rounded-lg text-xs font-medium transition-colors",
              showBottom ? "bg-[#fab387] text-[#1e1e2e]" : "border border-[#313244] text-[#a6adc8] hover:bg-[#313244]"
            )} onClick={() => setShowBottom(!showBottom)}>
            {showBottom ? "Hide Bottom" : "Show Bottom"}
          </button>
        </div>
      </div>

      <ProjectContextHeader compact />

      <div className="flex-1 flex min-h-0">
        <ProjectSidebar
          onSelectProject={handleSelectProject}
          selectedProjectPath={selectedProjectPath}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className={cn("flex min-h-0", showBottom ? "h-[55%]" : "flex-1")}>
            <div className="flex-1 flex flex-col border-r border-[#313244] min-w-0">
              <div className="px-2 py-1 border-b border-[#313244] bg-[#181825]">
                <CWPanelSelector value={leftPanel} onChange={setLeftPanel} />
              </div>
              <CWPersistentPanelSlot activeId={leftPanel} />
            </div>
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-2 py-1 border-b border-[#313244] bg-[#181825]">
                <CWPanelSelector value={rightPanel} onChange={setRightPanel} />
              </div>
              <CWPersistentPanelSlot activeId={rightPanel} />
            </div>
          </div>

          {showBottom && (
            <>
              <div className="h-px bg-[#313244]" />
              <div className="h-[45%] flex min-h-0">
                <div className="flex-1 flex flex-col border-r border-[#313244] min-w-0">
                  <div className="px-2 py-1 border-b border-[#313244] bg-[#181825]">
                    <CWPanelSelector value={bottomPanel} onChange={setBottomPanel} />
                  </div>
                  <CWPersistentPanelSlot activeId={bottomPanel} />
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="px-2 py-1 border-b border-[#313244] bg-[#181825]">
                    <CWPanelSelector value={bottomRightPanel} onChange={setBottomRightPanel} />
                  </div>
                  <CWPersistentPanelSlot activeId={bottomRightPanel} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
