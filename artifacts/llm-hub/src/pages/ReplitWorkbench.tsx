import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Cloud, ExternalLink, GitBranch, Loader2, RefreshCw, Send, Bot, User, Trash2, AlertTriangle, Folder, FileText, ChevronRight, Download, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import ProjectSidebar from "@/components/workbench/ProjectSidebar";
import { FileEditCard, type FileEdit } from "@/components/workbench/FileEditCard";
import { FileEditSummary } from "@/components/workbench/FileEditSummary";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useSelectedProject, projectDescriptorFromSidebar, type SelectedProject } from "@/hooks/useSelectedProject";
import { useAuth } from "@workspace/replit-auth-web";

type Mode = "iframe" | "edit";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface CloneInfo {
  exists: boolean;
  localPath: string | null;
  lastFetchedAt: number | null;
  ageMs: number | null;
  stale: boolean;
  dirty: boolean;
  dirtyFiles: string[];
  branch: string | null;
}

interface ReapplyResult {
  reappliedFiles: string[];
  conflicts: string[];
  stashKept: boolean;
  stashRef: string | null;
  reapplyError: string | null;
}

interface CloneStatus {
  localPath: string | null;
  cloned: boolean;
  loading: boolean;
  error: string | null;
  info: CloneInfo | null;
  lastPullSummary: string | null;
  pullPending: boolean;
  lastReapply: ReapplyResult | null;
}

const AUTO_PULL_ATTEMPTS = new Set<string>();
const AUTO_PULL_ATTEMPTS_MAX = 200;
function rememberAutoPullAttempt(key: string) {
  if (AUTO_PULL_ATTEMPTS.size >= AUTO_PULL_ATTEMPTS_MAX) {
    const oldest = AUTO_PULL_ATTEMPTS.values().next().value;
    if (oldest !== undefined) AUTO_PULL_ATTEMPTS.delete(oldest);
  }
  AUTO_PULL_ATTEMPTS.add(key);
}

function formatAge(ms: number | null): string {
  if (ms === null || ms < 0) return "unknown";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

interface ListEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
}

function ReplitIframe({ project }: { project: SelectedProject }) {
  const url = project.url || `https://replit.com/@${project.path}`;
  const [iframeError, setIframeError] = useState(false);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e]">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <Cloud className="h-3.5 w-3.5 text-[#89b4fa]" />
        <span className="text-xs text-[#cdd6f4] font-mono">{url}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-[10px] text-[#89b4fa] hover:underline"
        >
          Open in new tab <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex-1 relative">
        {iframeError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#a6adc8] text-sm gap-3 p-6">
            <AlertTriangle className="h-8 w-8 text-[#fab387]" />
            <p className="font-medium text-[#cdd6f4]">Replit blocks embedding in iframes.</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#89b4fa]/80 text-xs font-medium flex items-center gap-1"
            >
              Open this Repl <ExternalLink className="h-3 w-3" />
            </a>
            <p className="text-[10px] text-[#6c7086] max-w-md text-center">
              Replit doesn't expose a public Agent API, so we can't proxy chats. Use the
              "Pull files for editing" mode to clone the project locally and edit with our AI.
            </p>
          </div>
        ) : (
          <iframe
            src={url}
            title={project.name || project.path}
            className="absolute inset-0 w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            onError={() => setIframeError(true)}
          />
        )}
      </div>
    </div>
  );
}

function FileTree({ project, status }: { project: SelectedProject; status: CloneStatus }) {
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [openFile, setOpenFile] = useState<{ path: string; content: string; size: number; truncated: boolean } | null>(null);

  const load = useCallback(async (p: string) => {
    if (!status.localPath) return;
    setLoading(true);
    try {
      const res = await fetch("/api/project-context/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ project, subPath: p }),
      });
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [project, status.localPath]);

  useEffect(() => { if (status.localPath) load(path); }, [path, status.localPath, load]);

  const goUp = () => {
    if (path === "." || path === "") return;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    setPath(parts.length ? parts.join("/") : ".");
  };

  const openFileAt = async (filePath: string) => {
    try {
      const res = await fetch("/api/project-context/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ project, filePath }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOpenFile({ path: filePath, content: data.content, size: data.size, truncated: data.truncated });
    } catch (e: any) {
      setOpenFile({ path: filePath, content: `Error: ${e.message}`, size: 0, truncated: false });
    }
  };

  if (!status.localPath) {
    return <div className="p-4 text-xs text-[#6c7086]">Clone the project first to browse its files.</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e]">
      <div className="flex items-center gap-2 px-2 py-1 bg-[#181825] border-b border-[#313244] text-[11px] font-mono">
        <button onClick={goUp} className="px-1.5 py-0.5 rounded hover:bg-[#313244] text-[#a6adc8]" disabled={path === "." || path === ""}>..</button>
        <span className="text-[#cdd6f4] truncate">{path}</span>
        <button onClick={() => load(path)} className="ml-auto p-1 rounded hover:bg-[#313244] text-[#6c7086]"><RefreshCw className="h-3 w-3" /></button>
      </div>
      <div className="flex-1 flex min-h-0">
        <div className="w-1/2 border-r border-[#313244] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[#6c7086] text-xs"><Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading…</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-[10px] text-[#6c7086]">Empty</div>
          ) : (
            entries.map((e) => (
              <button
                key={e.name}
                onClick={() => {
                  if (e.type === "directory") setPath(path === "." ? e.name : `${path}/${e.name}`);
                  else openFileAt(path === "." ? e.name : `${path}/${e.name}`);
                }}
                className="w-full text-left px-2 py-1 text-[11px] font-mono hover:bg-[#313244] flex items-center gap-1.5"
              >
                {e.type === "directory" ? <Folder className="h-3 w-3 text-[#fab387]" /> : <FileText className="h-3 w-3 text-[#89b4fa]" />}
                <span className="text-[#cdd6f4]">{e.name}</span>
                {e.type === "directory" && <ChevronRight className="h-3 w-3 text-[#6c7086] ml-auto" />}
                {e.size !== undefined && <span className="ml-auto text-[#6c7086]">{e.size}B</span>}
              </button>
            ))
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {openFile ? (
            <div className="flex flex-col h-full">
              <div className="px-2 py-1 bg-[#181825] border-b border-[#313244] text-[10px] text-[#a6adc8] font-mono">
                {openFile.path} — {openFile.size}B {openFile.truncated && "(truncated)"}
              </div>
              <pre className="flex-1 p-2 text-[10px] font-mono text-[#cdd6f4] overflow-auto whitespace-pre">{openFile.content}</pre>
            </div>
          ) : (
            <div className="p-4 text-xs text-[#6c7086]">Click a file to preview it.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CloneAndChat({ project }: { project: SelectedProject }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<CloneStatus>({ localPath: null, cloned: false, loading: false, error: null, info: null, lastPullSummary: null, pullPending: false, lastReapply: null });
  const [dirtyPrompt, setDirtyPrompt] = useState<{ files: string[]; message: string } | null>(null);
  const [messages, setMessages] = usePersistedState<ChatMessage[]>(`replit-wb-chat-${project.path}`, []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolEvents, setToolEvents] = useState<{ name: string; summary: string; error?: boolean }[]>([]);
  const [fileEdits, setFileEdits] = useState<FileEdit[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      setFileEdits(prev => prev.map(e => e.editId === editId ? { ...e, undoing: false, undone: true } : e));
    } catch (err: any) {
      setFileEdits(prev => prev.map(e => e.editId === editId ? { ...e, undoing: false, undoError: err.message } : e));
    }
  }, []);

  const [fileUndoPending, setFileUndoPending] = useState<string | null>(null);
  const [fileUndoError, setFileUndoError] = useState<{ path: string; message: string } | null>(null);

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

  const handleUndoLastForFile = useCallback(async (filePath: string) => {
    setFileUndoPending(filePath);
    setFileUndoError(null);
    try {
      const res = await fetch("/api/workbench/undo-last-file-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filePath, project }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const undoneId: string | undefined = data.editId;
      if (undoneId) {
        setFileEdits(prev => prev.map(e => e.editId === undoneId ? { ...e, undone: true, undoing: false } : e));
      } else {
        const latestId = latestEditIdByPath.get(filePath);
        if (latestId) {
          setFileEdits(prev => prev.map(e => e.editId === latestId ? { ...e, undone: true, undoing: false } : e));
        }
      }
    } catch (err: any) {
      setFileUndoError({ path: filePath, message: err.message || "Undo failed" });
    } finally {
      setFileUndoPending(null);
    }
  }, [project, latestEditIdByPath]);

  const refreshInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/project-context/clone-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ project }),
      });
      if (!res.ok) return;
      const info: CloneInfo = await res.json();
      setStatus(s => ({ ...s, info, localPath: info.exists ? info.localPath : s.localPath }));
    } catch {}
  }, [project]);

  const ensureClone = useCallback(async () => {
    setStatus(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/project-context/ensure-clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ project }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStatus(s => ({ ...s, localPath: data.localPath, cloned: data.cloned, loading: false, error: null, info: data.info ?? s.info, lastPullSummary: data.cloned ? "Cloned fresh copy." : null }));
    } catch (e: any) {
      setStatus(s => ({ ...s, loading: false, error: e.message }));
    }
  }, [project]);

  const pullLatest = useCallback(async (opts: { discardLocal?: boolean; stashAndReapply?: boolean; auto?: boolean } = {}) => {
    const { discardLocal = false, stashAndReapply = false } = opts;
    setStatus(s => ({ ...s, pullPending: true, error: null, lastReapply: null }));
    setDirtyPrompt(null);
    try {
      const res = await fetch("/api/project-context/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ project, discardLocal, stashAndReapply }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.code === "DIRTY_WORKING_TREE") {
        setDirtyPrompt({ files: data.dirtyFiles || [], message: data.error || "Local changes would be overwritten." });
        setStatus(s => ({ ...s, pullPending: false }));
        return;
      }
      if (data.code === "PULL_FAILED_AFTER_STASH") {
        setStatus(s => ({
          ...s,
          pullPending: false,
          error: data.error || "Pull failed after stashing local changes.",
          lastReapply: {
            reappliedFiles: data.stashKept ? [] : (data.stashedFiles || []),
            conflicts: [],
            stashKept: !!data.stashKept,
            stashRef: data.stashRef || null,
            reapplyError: data.error || null,
          },
        }));
        return;
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const prefix = opts.auto ? "Auto-pull — " : "";
      let summary: string;
      if (data.stashed) {
        const reCount = data.reappliedFiles?.length || 0;
        const cfCount = data.conflicts?.length || 0;
        const parts: string[] = [];
        parts.push(data.pulled ? `${prefix}Pulled ${data.changedFiles?.length || 0} changed file(s)` : `${prefix}Already up to date`);
        parts.push(`re-applied ${reCount} stashed file(s)`);
        if (cfCount > 0) parts.push(`${cfCount} conflict(s)`);
        if (data.stashKept) parts.push(`stash kept as ${data.stashRef}`);
        summary = parts.join(" · ") + ".";
      } else {
        summary = data.pulled
          ? `${prefix}Pulled ${data.changedFiles?.length || 0} changed file(s)${data.discardedDirty ? " (discarded local edits)" : ""}.`
          : `${prefix}Already up to date.`;
      }
      const lastReapply: ReapplyResult | null = data.stashed
        ? {
            reappliedFiles: data.reappliedFiles || [],
            conflicts: data.conflicts || [],
            stashKept: !!data.stashKept,
            stashRef: data.stashRef || null,
            reapplyError: data.reapplyError || null,
          }
        : null;
      setStatus(s => ({
        ...s,
        pullPending: false,
        info: data.info || s.info,
        localPath: data.localPath || s.localPath,
        lastPullSummary: summary,
        lastReapply,
      }));
    } catch (e: any) {
      const prefix = opts.auto ? "Auto-pull failed: " : "";
      setStatus(s => ({ ...s, pullPending: false, error: `${prefix}${e.message}` }));
    }
  }, [project]);

  useEffect(() => {
    setStatus({ localPath: null, cloned: false, loading: false, error: null, info: null, lastPullSummary: null, pullPending: false, lastReapply: null });
    setDirtyPrompt(null);
    setMessages([]);
    setToolEvents([]);
    setFileEdits([]);
    refreshInfo();
  }, [project.path, setMessages, refreshInfo]);

  useEffect(() => {
    const info = status.info;
    if (!info || !info.exists || !info.stale || info.dirty) return;
    if (!user) return;
    if (status.loading || status.pullPending) return;
    if (info.lastFetchedAt === null) return;
    const key = `${project.path}:${info.lastFetchedAt}`;
    if (AUTO_PULL_ATTEMPTS.has(key)) return;
    const t = setTimeout(() => {
      rememberAutoPullAttempt(key);
      pullLatest({ auto: true });
    }, 400);
    return () => clearTimeout(t);
  }, [status.info, status.loading, status.pullPending, user, project.path, pullLatest]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || streaming) return;
    const prompt = input.trim();
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: prompt };
    const assistantMsg: ChatMessage = { role: "assistant", content: "", streaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    setToolEvents([]);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const conversationHistory = messages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/workbench/code-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt, messages: conversationHistory, project }),
        signal: ac.signal,
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
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
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "chunk") {
                setMessages(prev => { const u = [...prev]; const l = u[u.length - 1]; if (l?.streaming) u[u.length - 1] = { ...l, content: l.content + evt.content }; return u; });
                setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 30);
              } else if (evt.type === "tool_start") {
                setToolEvents(p => [...p, { name: evt.name, summary: "running…" }]);
              } else if (evt.type === "tool_result") {
                setToolEvents(p => { const u = [...p]; for (let i = u.length - 1; i >= 0; i--) { if (u[i].name === evt.name && u[i].summary === "running…") { u[i] = { name: evt.name, summary: evt.summary }; return u; } } return [...u, { name: evt.name, summary: evt.summary }]; });
              } else if (evt.type === "tool_error") {
                setToolEvents(p => [...p, { name: evt.name, summary: evt.error, error: true }]);
              } else if (evt.type === "file_edit") {
                setFileEdits(p => [...p, {
                  editId: evt.editId,
                  path: evt.path,
                  diff: evt.diff,
                  isNew: !!evt.isNew,
                  added: evt.added || 0,
                  removed: evt.removed || 0,
                  previousBytes: evt.previousBytes || 0,
                  newBytes: evt.newBytes || 0,
                  truncated: !!evt.truncated,
                  undoDisabled: !!evt.undoDisabled,
                  undoSkipReason: evt.undoSkipReason,
                }]);
                setToolEvents(p => [...p, { name: evt.name || "write_file", summary: evt.summary || `wrote ${evt.path}` }]);
              } else if (evt.type === "project") {
                if (evt.localPath) setStatus(s => ({ ...s, localPath: evt.localPath, cloned: evt.cloned }));
                setToolEvents(p => [...p, { name: "project", summary: `loaded ${evt.origin}${evt.cloned ? " (fresh clone)" : ""}` }]);
              } else if (evt.type === "done") {
                setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
              } else if (evt.type === "error") {
                setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, content: m.content + `\nError: ${evt.content}` } : m));
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, content: `Error: ${e.message}` } : m));
      }
    } finally {
      setStreaming(false);
      setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
      abortRef.current = null;
    }
  }, [input, streaming, messages, project, setMessages]);

  const cloned = !!status.localPath || !!status.info?.exists;
  const info = status.info;
  const busy = status.loading || status.pullPending;

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e]">
      <div className="px-3 py-2 bg-[#181825] border-b border-[#313244] flex items-center gap-3 flex-wrap">
        <GitBranch className="h-3.5 w-3.5 text-[#a6e3a1]" />
        <span className="text-xs text-[#cdd6f4] font-mono">{project.name || project.path}</span>
        {cloned ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#a6e3a1]/15 text-[#a6e3a1] border border-[#a6e3a1]/30">
            cloned{status.localPath ? ` · ${status.localPath.split("/").slice(-3).join("/")}` : ""}
          </span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fab387]/15 text-[#fab387] border border-[#fab387]/30">not cloned</span>
        )}
        {cloned && info?.lastFetchedAt && (
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1",
              info.stale
                ? "bg-[#fab387]/15 text-[#fab387] border-[#fab387]/30"
                : "bg-[#313244] text-[#a6adc8] border-[#313244]"
            )}
            title={new Date(info.lastFetchedAt).toLocaleString()}
          >
            <Clock className="h-3 w-3" />
            updated {formatAge(info.ageMs)}
          </span>
        )}
        {cloned && info?.dirty && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f9e2af]/15 text-[#f9e2af] border border-[#f9e2af]/30" title={info.dirtyFiles.join("\n")}>
            {info.dirtyFiles.length} local edit(s)
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {cloned ? (
            <>
              <button
                onClick={() => pullLatest()}
                disabled={busy || !user}
                className="px-2 py-1 rounded text-[11px] bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#89b4fa]/80 flex items-center gap-1 disabled:opacity-50"
                title={!user ? "Sign in required" : "git fetch && reset --hard FETCH_HEAD"}
              >
                {status.pullPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                Pull latest
              </button>
              <button
                onClick={refreshInfo}
                disabled={busy}
                className="p-1 rounded text-[11px] text-[#a6adc8] hover:text-[#cdd6f4] hover:bg-[#313244] disabled:opacity-50"
                title="Re-check freshness"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </>
          ) : (
            <button
              onClick={ensureClone}
              disabled={busy || !user}
              className="px-2 py-1 rounded text-[11px] bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#89b4fa]/80 flex items-center gap-1 disabled:opacity-50"
              title={!user ? "Sign in required" : "Clone repository"}
            >
              {status.loading && <Loader2 className="h-3 w-3 animate-spin" />}
              Pull files for editing
            </button>
          )}
        </div>
      </div>
      {cloned && info?.stale && !status.pullPending && !dirtyPrompt && (
        <div className="px-3 py-1.5 bg-[#fab387]/10 border-b border-[#fab387]/30 text-[11px] text-[#fab387] flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>Local clone hasn't been refreshed in {formatAge(info.ageMs)}. It may be out of date with the upstream Repl.</span>
          <button
            onClick={() => pullLatest()}
            disabled={busy || !user}
            className="ml-auto px-2 py-0.5 rounded bg-[#fab387] text-[#1e1e2e] hover:bg-[#fab387]/80 disabled:opacity-50"
          >
            Pull now
          </button>
        </div>
      )}
      {dirtyPrompt && (
        <div className="px-3 py-2 bg-[#f9e2af]/10 border-b border-[#f9e2af]/30 text-[11px] text-[#f9e2af] flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">Pull blocked — uncommitted local changes detected.</div>
              <div className="text-[10px] text-[#f9e2af]/80 mt-0.5">{dirtyPrompt.message}</div>
              {dirtyPrompt.files.length > 0 && (
                <ul className="mt-1 ml-3 list-disc text-[10px] font-mono text-[#cdd6f4] max-h-20 overflow-y-auto">
                  {dirtyPrompt.files.slice(0, 12).map(f => <li key={f}>{f}</li>)}
                  {dirtyPrompt.files.length > 12 && <li className="list-none italic">…and {dirtyPrompt.files.length - 12} more</li>}
                </ul>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <button
              onClick={() => pullLatest({ stashAndReapply: true })}
              disabled={status.pullPending}
              className="px-2 py-0.5 rounded bg-[#a6e3a1] text-[#1e1e2e] hover:bg-[#a6e3a1]/80 text-[11px] disabled:opacity-50"
              title="git stash, pull latest, then re-apply your edits (with conflict markers if needed)"
            >
              Stash, pull, then re-apply
            </button>
            <button
              onClick={() => pullLatest({ discardLocal: true })}
              disabled={status.pullPending}
              className="px-2 py-0.5 rounded bg-[#f38ba8] text-[#1e1e2e] hover:bg-[#f38ba8]/80 text-[11px] disabled:opacity-50"
            >
              Discard local & pull
            </button>
            <button
              onClick={() => setDirtyPrompt(null)}
              className="px-2 py-0.5 rounded bg-[#313244] text-[#cdd6f4] hover:bg-[#313244]/70 text-[11px]"
            >
              Keep local edits
            </button>
          </div>
        </div>
      )}
      {status.lastReapply && !dirtyPrompt && (
        <div
          className={cn(
            "px-3 py-2 border-b text-[11px] flex flex-col gap-1.5",
            status.lastReapply.conflicts.length > 0 || status.lastReapply.stashKept
              ? "bg-[#f9e2af]/10 border-[#f9e2af]/30 text-[#f9e2af]"
              : "bg-[#a6e3a1]/10 border-[#a6e3a1]/30 text-[#a6e3a1]"
          )}
        >
          <div className="flex items-start gap-2">
            {status.lastReapply.conflicts.length > 0 || status.lastReapply.stashKept ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            ) : (
              <GitBranch className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                {status.lastReapply.conflicts.length > 0
                  ? `Re-applied with ${status.lastReapply.conflicts.length} conflict(s)`
                  : status.lastReapply.stashKept
                  ? "Pull failed — local edits kept in stash"
                  : "Local edits re-applied successfully"}
              </div>
              {status.lastReapply.reapplyError && (
                <div className="text-[10px] mt-0.5 opacity-80 font-mono break-all">
                  {status.lastReapply.reapplyError}
                </div>
              )}
              {status.lastReapply.reappliedFiles.length > 0 && (
                <div className="mt-1">
                  <div className="text-[10px] opacity-80">Re-applied files ({status.lastReapply.reappliedFiles.length}):</div>
                  <ul className="ml-3 list-disc text-[10px] font-mono text-[#cdd6f4] max-h-20 overflow-y-auto">
                    {status.lastReapply.reappliedFiles.slice(0, 12).map(f => <li key={`r-${f}`}>{f}</li>)}
                    {status.lastReapply.reappliedFiles.length > 12 && (
                      <li className="list-none italic">…and {status.lastReapply.reappliedFiles.length - 12} more</li>
                    )}
                  </ul>
                </div>
              )}
              {status.lastReapply.conflicts.length > 0 && (
                <div className="mt-1">
                  <div className="text-[10px] opacity-80">Conflicts (resolve <code>{`<<<<<<<`}</code> markers in these files):</div>
                  <ul className="ml-3 list-disc text-[10px] font-mono text-[#f38ba8] max-h-20 overflow-y-auto">
                    {status.lastReapply.conflicts.slice(0, 12).map(f => <li key={`c-${f}`}>{f}</li>)}
                    {status.lastReapply.conflicts.length > 12 && (
                      <li className="list-none italic">…and {status.lastReapply.conflicts.length - 12} more</li>
                    )}
                  </ul>
                </div>
              )}
              {status.lastReapply.stashKept && status.lastReapply.stashRef && (
                <div className="mt-1 text-[10px] opacity-90">
                  Stash kept as <code className="font-mono">{status.lastReapply.stashRef}</code>. Recover from the workbench shell with{" "}
                  <code className="font-mono">git stash show -p {status.lastReapply.stashRef}</code> or{" "}
                  <code className="font-mono">git stash pop {status.lastReapply.stashRef}</code>.
                </div>
              )}
            </div>
            <button
              onClick={() => setStatus(s => ({ ...s, lastReapply: null }))}
              className="p-1 rounded hover:bg-[#313244]/50 shrink-0"
              title="Dismiss"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
      {status.lastPullSummary && !dirtyPrompt && !status.error && (
        <div className="px-3 py-1 bg-[#a6e3a1]/10 border-b border-[#a6e3a1]/30 text-[11px] text-[#a6e3a1]">
          {status.lastPullSummary}
        </div>
      )}
      {status.error && (
        <div className="px-3 py-1.5 bg-[#f38ba8]/10 border-b border-[#f38ba8]/30 text-[11px] text-[#f38ba8]">
          {status.error}
        </div>
      )}
      <div className="flex-1 flex min-h-0">
        <div className="w-1/2 border-r border-[#313244] flex flex-col min-h-0">
          <FileTree project={project} status={status} />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {toolEvents.length > 0 && (
            <div className="px-3 py-1 bg-[#11111b] border-b border-[#313244] flex flex-wrap gap-1">
              {toolEvents.slice(-6).map((t, i) => (
                <span key={i} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${t.error ? "bg-[#f38ba8]/15 text-[#f38ba8]" : "bg-[#313244] text-[#a6adc8]"}`}>
                  {t.name}: {t.summary}
                </span>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <Bot className="h-8 w-8 mx-auto text-[#89b4fa]" />
                <p className="text-[#cdd6f4] text-sm">Chat with Claude scoped to this Replit project.</p>
                <p className="text-[#6c7086] text-xs">{status.localPath ? "Edits land in the local clone." : "Pull files first to enable editing."}</p>
              </div>
            )}
            {fileEdits.length > 0 && (
              <div className="space-y-1">
                <FileEditSummary
                  edits={fileEdits}
                  onUndoLast={handleUndoLastForFile}
                  pendingPath={fileUndoPending}
                  errorPath={fileUndoError?.path}
                  errorMessage={fileUndoError?.message}
                />
                {fileEdits.map((e, i) => (
                  <FileEditCard
                    key={e.editId ?? `no-undo-${i}`}
                    edit={e}
                    onUndo={handleUndo}
                    isLatestForFile={!!e.editId && latestEditIdByPath.get(e.path) === e.editId}
                  />
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "assistant" && <div className="h-5 w-5 rounded-full bg-[#89b4fa]/20 flex items-center justify-center shrink-0 mt-0.5"><Bot className="h-3 w-3 text-[#89b4fa]" /></div>}
                <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-xs", m.role === "user" ? "bg-[#89b4fa]/10 text-[#cdd6f4] border border-[#89b4fa]/20" : "bg-[#181825] text-[#cdd6f4] border border-[#313244]")}>
                  <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed">{m.content}</pre>
                  {m.streaming && <span className="inline-block w-1.5 h-3.5 bg-[#89b4fa] animate-pulse ml-0.5 align-middle" />}
                </div>
                {m.role === "user" && <div className="h-5 w-5 rounded-full bg-[#a6e3a1]/20 flex items-center justify-center shrink-0 mt-0.5"><User className="h-3 w-3 text-[#a6e3a1]" /></div>}
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-[#313244] bg-[#181825] flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              placeholder={user ? "Ask Claude about this Repl…" : "Sign in to chat with Claude"}
              disabled={streaming || !user}
              className="flex-1 min-h-[36px] max-h-[120px] text-xs font-mono bg-[#1e1e2e] border border-[#313244] text-[#cdd6f4] placeholder:text-[#585b70] rounded-lg px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-[#89b4fa]/50"
            />
            <button
              onClick={() => setMessages([])}
              className="p-2 rounded text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244]"
              title="Clear chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || streaming || !user}
              className="h-9 px-3 rounded-lg bg-[#89b4fa] hover:bg-[#89b4fa]/80 text-[#1e1e2e] flex items-center justify-center disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReplitWorkbench() {
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("rw-sidebar-collapsed", false);
  const [mode, setMode] = usePersistedState<Mode>("rw-mode", "edit");
  const { project, setProject } = useSelectedProject();

  const replitProject = project && project.origin === "replit" ? project : null;

  const handleSelectProject = (p: any) => {
    setProject(projectDescriptorFromSidebar(p));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#1e1e2e]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#313244] bg-[#181825]">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded bg-gradient-to-br from-[#89b4fa] to-[#74c7ec] flex items-center justify-center">
            <Cloud className="h-3.5 w-3.5 text-[#1e1e2e]" />
          </div>
          <h1 className="text-base font-semibold tracking-tight text-[#cdd6f4]">Replit Workbench</h1>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#313244] text-[#6c7086]">Repls</span>
          {replitProject && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#313244] text-[#cdd6f4] font-mono">
              {replitProject.name || replitProject.path}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-[#11111b] rounded-lg p-0.5 border border-[#313244]">
          <button
            onClick={() => setMode("iframe")}
            className={cn("px-3 py-1 rounded text-xs", mode === "iframe" ? "bg-[#89b4fa] text-[#1e1e2e]" : "text-[#a6adc8] hover:text-[#cdd6f4]")}
          >
            Iframe
          </button>
          <button
            onClick={() => setMode("edit")}
            className={cn("px-3 py-1 rounded text-xs", mode === "edit" ? "bg-[#89b4fa] text-[#1e1e2e]" : "text-[#a6adc8] hover:text-[#cdd6f4]")}
          >
            Pull files & edit
          </button>
        </div>
      </div>

      <div className="bg-[#fab387]/10 border-b border-[#fab387]/30 px-4 py-1.5 text-[11px] text-[#fab387] flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Replit Agent has no public API, so we can't proxy chats with it. The
          iframe view embeds the Repl URL directly. To edit a Repl from here, switch to
          "Pull files & edit" — we git-clone the project into a local cache and let our
          Claude tool-use loop edit the clone.
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        <ProjectSidebar
          onSelectProject={handleSelectProject}
          selectedProjectPath={replitProject?.path || null}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <div className="flex-1 min-h-0 min-w-0">
          {!replitProject ? (
            <div className="h-full flex flex-col items-center justify-center text-[#6c7086] text-sm gap-3 p-6">
              <Cloud className="h-10 w-10 text-[#89b4fa] opacity-50" />
              <p>Pick a Replit project from the sidebar.</p>
              <p className="text-[11px] text-[#585b70]">Tip: filter the sidebar to "replit" to see only Repls.</p>
            </div>
          ) : mode === "iframe" ? (
            <ReplitIframe project={replitProject} />
          ) : (
            <CloneAndChat project={replitProject} />
          )}
        </div>
      </div>
    </div>
  );
}
