import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Terminal, FolderTree, Eye, GitBranch, Database, Shield,
  Key, Activity, ChevronRight, ChevronDown, File, Folder,
  RefreshCw, Play, Search, Copy, Loader2, Server,
  Clock, HardDrive, Cpu, AlertTriangle,
  CheckCircle2, XCircle, FileCode, GitCommit, Trash2,
  Sparkles, Send, Square, User, Bot, Code2,
  ChevronUp, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ProjectManager, { UploadArea } from "@/components/workbench/ProjectManager";
import { FolderPlus, Upload } from "lucide-react";
import { usePersistedState } from "@/hooks/usePersistedState";

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

type ShellEntry = { command: string; stdout: string; stderr: string; exitCode: number; timestamp: number };
type FileItem = { name: string; type: "file" | "directory"; path: string; size?: number };

function ShellPanel() {
  const [input, setInput] = useState("");
  const [history, setHistory] = usePersistedState<ShellEntry[]>("wb-shell-history", []);
  const [cmdHistory, setCmdHistory] = usePersistedState<string[]>("wb-shell-cmds", []);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const shellMutation = useMutation({
    mutationFn: async (command: string) => {
      const res = await fetch(`/api/workbench/shell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        credentials: "include",
      });
      return res.json();
    },
    onSuccess: (data, command) => {
      setHistory(h => [...h, { command, ...data, timestamp: Date.now() }]);
      setCmdHistory(h => [command, ...h.slice(0, 49)]);
      setHistoryIndex(-1);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (input.trim() === "clear") { setHistory([]); setInput(""); return; }
    shellMutation.mutate(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex < cmdHistory.length - 1) {
        const newIdx = historyIndex + 1;
        setHistoryIndex(newIdx);
        setInput(cmdHistory[newIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setInput(cmdHistory[newIdx]);
      } else {
        setHistoryIndex(-1);
        setInput("");
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-green-400" />
          <span className="text-xs text-[#cdd6f4] font-mono">Shell</span>
        </div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => setHistory([])}>
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2" ref={scrollRef}>
        <div className="font-mono text-xs space-y-1">
          {history.length === 0 && (
            <div className="text-[#585b70] py-4 text-center">Type a command to get started. Use arrow keys for history.</div>
          )}
          {history.map((entry, i) => (
            <div key={i} className="mb-2">
              <div className="flex items-center gap-1">
                <span className="text-green-400">$</span>
                <span className="text-[#cdd6f4]">{entry.command}</span>
              </div>
              {entry.stdout && <pre className="text-[#a6adc8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stdout}</pre>}
              {entry.stderr && <pre className="text-[#f38ba8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stderr}</pre>}
            </div>
          ))}
          {shellMutation.isPending && (
            <div className="flex items-center gap-2 text-[#89b4fa]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Running...</span>
            </div>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-1 px-2 py-1.5 border-t border-[#313244] bg-[#181825]">
        <span className="text-green-400 font-mono text-xs">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-[#cdd6f4] font-mono text-xs outline-none placeholder:text-[#585b70]"
          placeholder="Enter command..."
          disabled={shellMutation.isPending}
          autoFocus
        />
      </form>
    </div>
  );
}

function FileExplorerPanel() {
  const [currentPath, setCurrentPath] = usePersistedState("wb-file-path", ".");
  const [selectedFile, setSelectedFile] = usePersistedState<string | null>("wb-file-selected", null);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["workbench-files", currentPath],
    queryFn: async () => {
      const res = await fetch(`/api/workbench/files?path=${encodeURIComponent(currentPath)}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: fileContent, isLoading: contentLoading } = useQuery<any>({
    queryKey: ["workbench-file-content", selectedFile],
    queryFn: async () => {
      const res = await fetch(`/api/workbench/file-content?path=${encodeURIComponent(selectedFile!)}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!selectedFile,
  });

  const items: FileItem[] = data?.items || [];
  const breadcrumbs = currentPath === "." ? ["root"] : ["root", ...currentPath.split("/").filter(Boolean)];

  const handleClick = (item: FileItem) => {
    if (item.type === "directory") {
      setCurrentPath(item.path || item.name);
      setSelectedFile(null);
    } else {
      setSelectedFile(item.path);
    }
  };

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (["ts", "tsx", "js", "jsx"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#89b4fa]" />;
    if (["json", "yaml", "yml", "toml"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#f9e2af]" />;
    if (["py"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#a6e3a1]" />;
    if (["css", "scss"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#f5c2e7]" />;
    return <File className="h-3.5 w-3.5 text-[#6c7086]" />;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-1 text-xs text-[#6c7086] overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <button
                className="hover:text-[#cdd6f4] transition-colors"
                onClick={() => {
                  if (i === 0) setCurrentPath(".");
                  else setCurrentPath(breadcrumbs.slice(1, i + 1).join("/"));
                  setSelectedFile(null);
                }}
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4]" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-1/3 border-r border-[#313244] overflow-y-auto">
          <div className="p-1">
            {currentPath !== "." && (
              <button
                className="w-full text-left px-2 py-1 text-xs hover:bg-[#313244] rounded flex items-center gap-1.5"
                onClick={() => {
                  const parts = currentPath.split("/");
                  parts.pop();
                  setCurrentPath(parts.length ? parts.join("/") : ".");
                  setSelectedFile(null);
                }}
              >
                <Folder className="h-3.5 w-3.5 text-yellow-500" />
                <span className="text-[#6c7086]">..</span>
              </button>
            )}
            {isLoading ? (
              <div className="p-2 space-y-1">{[1,2,3,4].map(i => <div key={i} className="h-5 w-full bg-[#313244] rounded animate-pulse" />)}</div>
            ) : (
              items.map(item => (
                <button
                  key={item.path}
                  className={cn(
                    "w-full text-left px-2 py-1 text-xs hover:bg-[#313244] rounded flex items-center gap-1.5",
                    selectedFile === item.path && "bg-[#45475a]"
                  )}
                  onClick={() => handleClick(item)}
                >
                  {item.type === "directory" ? <Folder className="h-3.5 w-3.5 text-yellow-500" /> : getFileIcon(item.name)}
                  <span className="truncate flex-1 text-[#cdd6f4]">{item.name}</span>
                  {item.size !== undefined && <span className="text-[10px] text-[#585b70]">{formatBytes(item.size)}</span>}
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {selectedFile ? (
            contentLoading ? (
              <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-4 bg-[#313244] rounded animate-pulse" style={{ width: `${70 - i * 15}%` }} />)}</div>
            ) : fileContent?.error ? (
              <div className="p-4 text-sm text-red-400">{fileContent.error}</div>
            ) : (
              <div className="relative">
                <div className="flex items-center justify-between px-3 py-1 bg-[#313244] border-b border-[#313244] sticky top-0">
                  <span className="text-xs font-mono text-[#6c7086]">{selectedFile}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#585b70]">{formatBytes(fileContent?.size || 0)}</span>
                    <button className="p-0.5 rounded hover:bg-[#45475a]" onClick={() => navigator.clipboard.writeText(fileContent?.content || "")}>
                      <Copy className="h-3 w-3 text-[#6c7086]" />
                    </button>
                  </div>
                </div>
                <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all text-[#cdd6f4] select-text cursor-text">{fileContent?.content}</pre>
              </div>
            )
          ) : (
            <div className="p-8 text-center text-sm text-[#585b70]">
              <FileCode className="h-8 w-8 mx-auto mb-2 text-[#45475a]" />
              Select a file to view its contents
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GitPanel() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["workbench-git-status"],
    queryFn: async () => {
      const res = await fetch(`/api/workbench/git-status`, { credentials: "include" });
      return res.json();
    },
  });

  const gitMutation = useMutation({
    mutationFn: async (command: string) => {
      const res = await fetch(`/api/workbench/git`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        credentials: "include",
      });
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-orange-400" />
          <span className="text-xs font-medium text-[#cdd6f4]">Git</span>
          {data?.currentBranch && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#313244] text-[#a6adc8]">{data.currentBranch}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button className="px-2 py-0.5 text-[10px] rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => gitMutation.mutate("git pull")} disabled={gitMutation.isPending}>Pull</button>
          <button className="px-2 py-0.5 text-[10px] rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => gitMutation.mutate("git fetch")} disabled={gitMutation.isPending}>Fetch</button>
          <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-6 w-full bg-[#313244] rounded animate-pulse" />)}</div>
        ) : data?.error ? (
          <div className="p-4 text-sm text-red-400">{data.error}</div>
        ) : (
          <div className="p-2 space-y-3">
            {data?.changes?.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-[#6c7086] mb-1 px-1">Changes ({data.changes.length})</h4>
                <div className="space-y-0.5">
                  {data.changes.map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 px-1 py-0.5 rounded text-xs hover:bg-[#313244]">
                      <span className={cn(
                        "text-[9px] px-1 rounded border",
                        c.status === "M" ? "text-yellow-500 border-yellow-500/30" :
                        c.status === "A" || c.status === "??" ? "text-green-500 border-green-500/30" :
                        c.status === "D" ? "text-red-500 border-red-500/30" : "text-[#6c7086] border-[#313244]"
                      )}>{c.status}</span>
                      <span className="truncate font-mono text-[11px] text-[#a6adc8]">{c.file}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data?.changes?.length === 0 && (
              <div className="text-xs text-center text-[#585b70] py-2">Working tree clean</div>
            )}
            <div className="h-px bg-[#313244]" />
            <div>
              <h4 className="text-xs font-medium text-[#6c7086] mb-1 px-1">Recent Commits</h4>
              <div className="space-y-0.5">
                {data?.commits?.slice(0, 15).map((c: any, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 px-1 py-1 rounded text-xs hover:bg-[#313244]">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentActivityPanel() {
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "agent" | "manual">("all");
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["workbench-agent-activity"],
    queryFn: async () => {
      const res = await fetch(`/api/workbench/agent-activity`, { credentials: "include" });
      return res.json();
    },
  });

  const entries = (data?.entries || []).filter((e: any) => {
    if (filter === "agent") return e.isAgent;
    if (filter === "manual") return !e.isAgent;
    return true;
  });

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch { return iso; }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium text-[#cdd6f4]">Agent Activity</span>
          {data?.stats && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#313244] text-[#6c7086]">
              {data.stats.agentCommits} agent / {data.stats.totalCommits} total
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(["all", "agent", "manual"] as const).map(f => (
            <button
              key={f}
              className={cn("text-[10px] px-1.5 py-0.5 rounded capitalize", filter === f ? "bg-primary text-white" : "text-[#6c7086] hover:bg-[#313244]")}
              onClick={() => setFilter(f)}
            >{f}</button>
          ))}
          <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
        </div>
      </div>
      {data?.stats && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#313244] bg-[#181825]">
          <div className="flex items-center gap-1">
            <Bot className="h-3 w-3 text-purple-400" />
            <span className="text-[10px] text-[#6c7086]">{data.stats.agentCommits} agent</span>
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3 text-blue-400" />
            <span className="text-[10px] text-[#6c7086]">{data.stats.manualCommits} manual</span>
          </div>
          <div className="flex items-center gap-1">
            <FileCode className="h-3 w-3 text-green-400" />
            <span className="text-[10px] text-[#6c7086]">{data.stats.filesChanged} files</span>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 w-full bg-[#313244] rounded animate-pulse" />)}</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-sm text-center text-[#585b70]">No activity found</div>
        ) : (
          <div className="p-1">
            {entries.map((entry: any) => {
              const expanded = expandedCommit === entry.hash;
              return (
                <div key={entry.hash} className="border-b border-[#313244] last:border-0">
                  <button
                    className="w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-[#313244] transition-colors"
                    onClick={() => setExpandedCommit(expanded ? null : entry.hash)}
                  >
                    <div className="mt-0.5 shrink-0">
                      {entry.isAgent ? <Bot className="h-3.5 w-3.5 text-purple-400" /> : <User className="h-3.5 w-3.5 text-blue-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug truncate text-[#cdd6f4]">{entry.message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-[#585b70] font-mono">{entry.hash?.substring(0, 7)}</span>
                        <span className="text-[10px] text-[#585b70]">{formatDate(entry.date)}</span>
                        {entry.files.length > 0 && <span className="text-[10px] text-[#585b70]">{entry.files.length} file{entry.files.length !== 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    {entry.files.length > 0 && (
                      <div className="shrink-0 mt-0.5">
                        {expanded ? <ChevronDown className="h-3 w-3 text-[#585b70]" /> : <ChevronRight className="h-3 w-3 text-[#585b70]" />}
                      </div>
                    )}
                  </button>
                  {expanded && entry.files.length > 0 && (
                    <div className="pl-7 pr-2 pb-2 space-y-0.5">
                      {entry.files.map((f: any, fi: number) => (
                        <div key={fi} className="flex items-center gap-1.5 text-[11px]">
                          <span className={cn(
                            "text-[9px] px-1 rounded border",
                            f.status === "A" ? "text-green-500 border-green-500/30" :
                            f.status === "M" ? "text-yellow-500 border-yellow-500/30" :
                            f.status === "D" ? "text-red-500 border-red-500/30" : "text-[#6c7086] border-[#313244]"
                          )}>{f.status === "A" ? "added" : f.status === "M" ? "modified" : f.status === "D" ? "deleted" : f.status}</span>
                          <span className="font-mono truncate text-[#6c7086]">{f.file}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DatabasePanel() {
  const [query, setQuery] = usePersistedState("wb-db-query", "SELECT schemaname, relname as table_name, n_live_tup as row_count FROM pg_stat_user_tables ORDER BY n_live_tup DESC");
  const [results, setResults] = useState<any>(null);

  const queryMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`/api/workbench/db-query?q=${encodeURIComponent(q)}`, { credentials: "include" });
      return res.json();
    },
    onSuccess: (data) => setResults(data),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-xs font-medium text-[#cdd6f4]">Database Explorer</span>
        </div>
      </div>
      <div className="p-2 border-b border-[#313244] space-y-1.5">
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-lg border border-[#313244] bg-[#1e1e2e] px-3 py-2 font-mono text-xs text-[#cdd6f4] placeholder:text-[#585b70] focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-y min-h-[60px]"
          placeholder="SELECT * FROM ..."
        />
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium disabled:opacity-50"
            onClick={() => queryMutation.mutate(query)}
            disabled={queryMutation.isPending || !query.trim()}
          >
            {queryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Run Query
          </button>
          {results && <span className="text-[10px] text-[#6c7086]">{results.rowCount} rows returned</span>}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {results?.error ? (
          <div className="p-3 text-xs text-red-400">{results.error}</div>
        ) : results?.rows?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#313244] sticky top-0">
                <tr>
                  {results.fields.map((f: string) => (
                    <th key={f} className="px-2 py-1.5 text-left font-medium text-[#6c7086] border-b border-[#313244]">{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-[#313244] border-b border-[#313244]/50">
                    {results.fields.map((f: string) => (
                      <td key={f} className="px-2 py-1 font-mono text-[11px] max-w-[200px] truncate text-[#a6adc8]">{String(row[f] ?? "NULL")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : results ? (
          <div className="p-4 text-center text-xs text-[#585b70]">No results</div>
        ) : (
          <div className="p-8 text-center text-sm text-[#585b70]">
            <Database className="h-8 w-8 mx-auto mb-2 text-[#45475a]" />
            Run a query to see results
          </div>
        )}
      </div>
    </div>
  );
}

function EnvPanel() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["workbench-env"],
    queryFn: async () => {
      const res = await fetch(`/api/workbench/env`, { credentials: "include" });
      return res.json();
    },
  });

  const vars = (data?.variables || []).filter((v: any) =>
    !search || v.key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Key className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium text-[#cdd6f4]">Environment ({data?.count || 0})</span>
        </div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
      </div>
      <div className="px-2 py-1.5 border-b border-[#313244]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#585b70]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-7 text-xs pl-7 rounded border border-[#313244] bg-[#1e1e2e] text-[#cdd6f4] placeholder:text-[#585b70] focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            placeholder="Filter variables..."
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-1">{[1,2,3,4].map(i => <div key={i} className="h-5 w-full bg-[#313244] rounded animate-pulse" />)}</div>
        ) : (
          <div className="p-1">
            {vars.map((v: any) => (
              <div key={v.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#313244] text-xs">
                <span className="font-mono font-medium text-[11px] min-w-0 shrink-0 text-[#cdd6f4]">{v.key}</span>
                <span className="text-[#585b70]">=</span>
                <span className={cn("font-mono text-[11px] truncate", v.sensitive ? "text-yellow-500" : "text-[#6c7086]")}>{v.value}</span>
                {v.sensitive && <Key className="h-3 w-3 text-yellow-500 shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessPanel() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["workbench-process-info"],
    queryFn: async () => {
      const res = await fetch(`/api/workbench/process-info`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 10000,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-[#cdd6f4]">Process Info</span>
        </div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => refetch()}><RefreshCw className="h-3 w-3" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 w-full bg-[#313244] rounded animate-pulse" />)}</div>
        ) : data ? (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Clock, label: "Uptime", value: formatUptime(data.uptime) },
                { icon: Server, label: "Node", value: data.nodeVersion },
                { icon: Cpu, label: "CPUs", value: data.cpus },
                { icon: HardDrive, label: "Free Mem", value: formatBytes(data.freeMemory || 0) },
                { icon: HardDrive, label: "Heap Used", value: formatBytes(data.memoryUsage?.heapUsed || 0) },
                { icon: HardDrive, label: "RSS", value: formatBytes(data.memoryUsage?.rss || 0) },
              ].map((item, i) => (
                <div key={i} className="p-2 rounded bg-[#313244]">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#6c7086] mb-0.5">
                    <item.icon className="h-3 w-3" /> {item.label}
                  </div>
                  <div className="text-sm font-semibold text-[#cdd6f4]">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="h-px bg-[#313244]" />
            <div className="space-y-1 text-xs">
              {[
                ["Platform", `${data.platform} (${data.arch})`],
                ["PID", data.pid],
                ["Hostname", data.hostname],
                ["Load Avg", data.loadAvg?.map((l: number) => l.toFixed(2)).join(", ")],
                ["Total Memory", formatBytes(data.totalMemory || 0)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[#6c7086]">{label}</span>
                  <span className="font-mono text-[#a6adc8] truncate ml-2">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  streaming?: boolean;
};

function CodeChatPanel() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = usePersistedState<ChatMessage[]>("wb-chat-messages", []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, []);

  const handleStop = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsStreaming(false);
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
      const conversationHistory = messages.filter(m => !m.streaming).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`/api/workbench/code-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, messages: conversationHistory }),
        signal: controller.signal,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
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
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk") {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.streaming) {
                    updated[updated.length - 1] = { ...last, content: last.content + data.content };
                  }
                  return updated;
                });
                scrollToBottom();
              } else if (data.type === "done") {
                setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
              } else if (data.type === "error") {
                setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, content: m.content + `\n\nError: ${data.content}` } : m));
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, content: `Error: ${err.message}` } : m));
    } finally {
      setIsStreaming(false);
      setAbortController(null);
      setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
      scrollToBottom();
    }
  }, [input, isStreaming, messages, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-xs text-[#cdd6f4] font-mono">Code Assistant</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-500/30 text-violet-400">Claude</span>
        </div>
        <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4]" onClick={() => setMessages([])}>
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3" ref={scrollRef}>
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-3">
              <div className="flex justify-center">
                <div className="h-10 w-10 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-violet-400" />
                </div>
              </div>
              <div>
                <p className="text-[#cdd6f4] text-sm font-medium">Code Assistant</p>
                <p className="text-[#6c7086] text-xs mt-1">Ask about code, debug issues, or get help writing new features.</p>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                {[
                  "Explain the project structure",
                  "Find and fix bugs in the API",
                  "Add error handling to routes",
                  "Write tests for a module",
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
                    className="text-[10px] px-2 py-1 rounded-full border border-[#313244] text-[#6c7086] hover:text-[#cdd6f4] hover:border-violet-500/30 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && (
                <div className="h-5 w-5 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3 w-3 text-violet-400" />
                </div>
              )}
              <div className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-xs",
                msg.role === "user"
                  ? "bg-blue-600/20 text-[#cdd6f4] border border-blue-500/20"
                  : "bg-[#181825] text-[#cdd6f4] border border-[#313244]"
              )}>
                <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed select-text cursor-text">{msg.content}</pre>
                {msg.streaming && (
                  <span className="inline-block w-1.5 h-3.5 bg-violet-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
              {msg.role === "user" && (
                <div className="h-5 w-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3 w-3 text-blue-400" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-2 border-t border-[#313244] bg-[#181825]">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about code... (Enter to send, Shift+Enter for newline)"
            className="flex-1 min-h-[36px] max-h-[120px] text-xs font-mono bg-[#1e1e2e] border border-[#313244] text-[#cdd6f4] placeholder:text-[#585b70] rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="h-9 px-3 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center justify-center"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="h-9 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface SSHAIMessage {
  role: "user" | "assistant";
  content: string;
  commands?: { command: string; stdout?: string; stderr?: string; exitCode?: number; error?: string }[];
  streaming?: boolean;
}

function SSHPanel() {
  const [host, setHost] = useState(() => localStorage.getItem("ssh-host") || "");
  const [port, setPort] = useState(() => localStorage.getItem("ssh-port") || "22");
  const [username, setUsername] = useState(() => localStorage.getItem("ssh-username") || "");
  const [authType, setAuthType] = useState<"password" | "key">(() => (localStorage.getItem("ssh-auth-type") as any) || "password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState(() => localStorage.getItem("ssh-private-key") || "");
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = usePersistedState<{ command: string; stdout?: string; stderr?: string; exitCode?: number; error?: string; timestamp: number }[]>("wb-ssh-history", []);
  const [cmdHistory, setCmdHistory] = usePersistedState<string[]>("wb-ssh-cmds", []);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showConfig, setShowConfig] = useState(true);
  const [mode, setMode] = usePersistedState<"terminal" | "ai" | "files">("wb-ssh-mode", "terminal");
  const [aiMessages, setAiMessages] = usePersistedState<SSHAIMessage[]>("wb-ssh-ai-messages", []);
  const [aiInput, setAiInput] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiAbort, setAiAbort] = useState<AbortController | null>(null);
  const [remotePath, setRemotePath] = usePersistedState("wb-ssh-remote-path", "/");
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

  const sshCredentials = () => ({
    host, port: parseInt(port), username,
    ...(authType === "password" ? { password } : { privateKey }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/workbench/ssh/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sshCredentials()),
        credentials: "include",
      });
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
      const res = await fetch(`/api/workbench/ssh/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sshCredentials(), command }),
        credentials: "include",
      });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (input.trim() === "clear") { setHistory([]); setInput(""); return; }
    execMutation.mutate(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex < cmdHistory.length - 1) {
        const idx = historyIndex + 1;
        setHistoryIndex(idx);
        setInput(cmdHistory[idx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const idx = historyIndex - 1;
        setHistoryIndex(idx);
        setInput(cmdHistory[idx]);
      } else { setHistoryIndex(-1); setInput(""); }
    }
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

  const handleAISubmit = useCallback(async () => {
    if (!aiInput.trim() || aiStreaming) return;
    const prompt = aiInput.trim();
    setAiInput("");

    const userMsg: SSHAIMessage = { role: "user", content: prompt };
    const assistantMsg: SSHAIMessage = { role: "assistant", content: "", commands: [], streaming: true };
    setAiMessages(prev => [...prev, userMsg, assistantMsg]);
    setAiStreaming(true);

    const controller = new AbortController();
    setAiAbort(controller);

    try {
      const convHistory = aiMessages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`/api/workbench/ssh/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sshBodyBase(), prompt, messages: convHistory }),
        signal: controller.signal,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
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
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "text") {
                setAiMessages(prev => {
                  const msgs = [...prev];
                  const last = msgs[msgs.length - 1];
                  if (last?.streaming) msgs[msgs.length - 1] = { ...last, content: last.content + evt.content };
                  return msgs;
                });
              } else if (evt.type === "command") {
                setAiMessages(prev => {
                  const msgs = [...prev];
                  const last = msgs[msgs.length - 1];
                  if (last?.streaming) {
                    const cmds = [...(last.commands || []), { command: evt.command }];
                    msgs[msgs.length - 1] = { ...last, commands: cmds };
                  }
                  return msgs;
                });
              } else if (evt.type === "command_result") {
                setAiMessages(prev => {
                  const msgs = [...prev];
                  const last = msgs[msgs.length - 1];
                  if (last?.streaming && last.commands) {
                    const cmds = [...last.commands];
                    const idx = cmds.findIndex(c => c.command === evt.command && !c.stdout && !c.stderr && !c.error);
                    if (idx >= 0) cmds[idx] = { ...cmds[idx], stdout: evt.stdout, stderr: evt.stderr, exitCode: evt.exitCode };
                    msgs[msgs.length - 1] = { ...last, commands: cmds };
                  }
                  return msgs;
                });
              } else if (evt.type === "command_error") {
                setAiMessages(prev => {
                  const msgs = [...prev];
                  const last = msgs[msgs.length - 1];
                  if (last?.streaming && last.commands) {
                    const cmds = [...last.commands];
                    const idx = cmds.length - 1;
                    if (idx >= 0) cmds[idx] = { ...cmds[idx], error: evt.error };
                    msgs[msgs.length - 1] = { ...last, commands: cmds };
                  }
                  return msgs;
                });
              } else if (evt.type === "done" || evt.type === "error") {
                if (evt.type === "error") {
                  setAiMessages(prev => {
                    const msgs = [...prev];
                    const last = msgs[msgs.length - 1];
                    if (last?.streaming) msgs[msgs.length - 1] = { ...last, content: last.content + "\n\nError: " + evt.content };
                    return msgs;
                  });
                }
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setAiMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last?.streaming) msgs[msgs.length - 1] = { ...last, content: last.content + "\n\nError: " + err.message };
          return msgs;
        });
      }
    } finally {
      setAiMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
      setAiStreaming(false);
      setAiAbort(null);
    }
  }, [aiInput, aiStreaming, aiMessages, host, port, username, authType, password, privateKey]);

  useEffect(() => {
    if (aiScrollRef.current) aiScrollRef.current.scrollTo({ top: aiScrollRef.current.scrollHeight });
  }, [aiMessages]);

  const inputClass = "w-full h-7 text-xs px-2 rounded border border-[#313244] bg-[#181825] text-[#cdd6f4] outline-none focus:ring-1 focus:ring-[#cba6f7] placeholder:text-[#585b70] font-mono";

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Server className="h-3.5 w-3.5 text-[#fab387]" />
          <span className="text-xs text-[#cdd6f4] font-mono">SSH</span>
          {connected && (
            <>
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#a6e3a1]/30 text-[#a6e3a1]">
                {username}@{host}
              </span>
              <div className="flex items-center gap-0.5 ml-1 bg-[#313244] rounded p-0.5">
                <button
                  className={cn("text-[9px] px-1.5 py-0.5 rounded transition-colors", mode === "terminal" ? "bg-[#fab387] text-[#1e1e2e]" : "text-[#6c7086] hover:text-[#cdd6f4]")}
                  onClick={() => setMode("terminal")}
                >Terminal</button>
                <button
                  className={cn("text-[9px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5", mode === "ai" ? "bg-[#cba6f7] text-[#1e1e2e]" : "text-[#6c7086] hover:text-[#cdd6f4]")}
                  onClick={() => setMode("ai")}
                ><Sparkles className="h-2.5 w-2.5" />AI</button>
                <button
                  className={cn("text-[9px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5", mode === "files" ? "bg-[#89b4fa] text-[#1e1e2e]" : "text-[#6c7086] hover:text-[#cdd6f4]")}
                  onClick={() => setMode("files")}
                ><FolderTree className="h-2.5 w-2.5" />Files</button>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4]"
            onClick={() => setShowConfig(!showConfig)}
            title="Connection settings"
          >
            <Key className="h-3 w-3" />
          </button>
          {connected && (
            <button
              className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#f38ba8]"
              onClick={() => { setConnected(false); setShowConfig(true); setHistory([]); }}
              title="Disconnect"
            >
              <XCircle className="h-3 w-3" />
            </button>
          )}
          <button className="p-1 rounded hover:bg-[#313244] text-[#6c7086]" onClick={() => { setHistory([]); setAiMessages([]); }}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="p-3 border-b border-[#313244] bg-[#181825]/50 space-y-2">
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <div>
              <label className="text-[10px] text-[#6c7086] block mb-0.5">Host</label>
              <input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.100" className={inputClass} />
            </div>
            <div>
              <label className="text-[10px] text-[#6c7086] block mb-0.5">Port</label>
              <input value={port} onChange={e => setPort(e.target.value)} placeholder="22" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[#6c7086] block mb-0.5">Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="root" className={inputClass} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[#6c7086]">Auth:</label>
            <button
              className={cn("text-[10px] px-2 py-0.5 rounded border", authType === "password" ? "border-[#cba6f7] text-[#cba6f7] bg-[#cba6f7]/10" : "border-[#313244] text-[#6c7086]")}
              onClick={() => setAuthType("password")}
            >Password</button>
            <button
              className={cn("text-[10px] px-2 py-0.5 rounded border", authType === "key" ? "border-[#cba6f7] text-[#cba6f7] bg-[#cba6f7]/10" : "border-[#313244] text-[#6c7086]")}
              onClick={() => setAuthType("key")}
            >Private Key</button>
          </div>
          {authType === "password" ? (
            <div>
              <label className="text-[10px] text-[#6c7086] block mb-0.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
            </div>
          ) : (
            <div>
              <label className="text-[10px] text-[#6c7086] block mb-0.5">Private Key (paste PEM)</label>
              <textarea
                value={privateKey}
                onChange={e => setPrivateKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                className="w-full h-16 text-[10px] px-2 py-1 rounded border border-[#313244] bg-[#181825] text-[#cdd6f4] outline-none focus:ring-1 focus:ring-[#cba6f7] placeholder:text-[#585b70] font-mono resize-none"
              />
            </div>
          )}
          <button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !host || !username}
            className="w-full h-7 text-xs rounded bg-[#fab387] hover:bg-[#fab387]/80 text-[#1e1e2e] font-medium disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {testMutation.isPending ? <><Loader2 className="h-3 w-3 animate-spin" /> Connecting...</> : <><Server className="h-3 w-3" /> Connect</>}
          </button>
          {testMutation.isError && (
            <div className="text-[10px] text-[#f38ba8] bg-[#f38ba8]/10 rounded px-2 py-1 border border-[#f38ba8]/20">
              {(testMutation.error as Error).message}
            </div>
          )}
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
                  <div className="flex items-center gap-1">
                    <span className="text-[#fab387]">{username || "$"}@{host || "vps"} $</span>
                    <span className="text-[#cdd6f4] select-text cursor-text">{entry.command}</span>
                  </div>
                  {entry.stdout && <pre className="text-[#a6adc8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stdout}</pre>}
                  {entry.stderr && <pre className="text-[#f38ba8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">{entry.stderr}</pre>}
                  {entry.error && <pre className="text-[#f38ba8] whitespace-pre-wrap break-all ml-3 mt-0.5 select-text cursor-text">Error: {entry.error}</pre>}
                  {entry.exitCode !== undefined && entry.exitCode !== 0 && (
                    <span className="text-[10px] text-[#f9e2af] ml-3">exit code: {entry.exitCode}</span>
                  )}
                </div>
              ))}
              {execMutation.isPending && (
                <div className="flex items-center gap-2 text-[#89b4fa]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Running on remote...</span>
                </div>
              )}
            </div>
          </div>
          {connected && (
            <form onSubmit={handleSubmit} className="flex items-center gap-1 px-2 py-1.5 border-t border-[#313244] bg-[#181825]">
              <span className="text-[#fab387] font-mono text-xs shrink-0">{username}@{host} $</span>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-[#cdd6f4] font-mono text-xs outline-none placeholder:text-[#585b70]"
                placeholder="Enter command to run on VPS..."
                disabled={execMutation.isPending}
                autoFocus
              />
            </form>
          )}
        </>
      )}

      {mode === "ai" && (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={aiScrollRef}>
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
                    {msg.content && (
                      <div className="text-[#cdd6f4] select-text cursor-text whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    )}
                    {msg.commands && msg.commands.map((cmd, j) => (
                      <div key={j} className="bg-[#181825] rounded border border-[#313244] overflow-hidden">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#313244]/50 border-b border-[#313244]">
                          <Terminal className="h-3 w-3 text-[#fab387]" />
                          <code className="text-[10px] text-[#fab387] select-text cursor-text">{cmd.command}</code>
                          {cmd.exitCode !== undefined && cmd.exitCode !== 0 && (
                            <span className="text-[9px] text-[#f38ba8] ml-auto">exit {cmd.exitCode}</span>
                          )}
                          {cmd.exitCode === 0 && (
                            <span className="text-[9px] text-[#a6e3a1] ml-auto">ok</span>
                          )}
                          {cmd.exitCode === undefined && !cmd.error && (
                            <Loader2 className="h-2.5 w-2.5 animate-spin text-[#89b4fa] ml-auto" />
                          )}
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
              <div className="flex items-end gap-1.5">
                <textarea
                  ref={aiInputRef}
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAISubmit(); } }}
                  className="flex-1 bg-[#1e1e2e] text-[#cdd6f4] text-xs rounded border border-[#313244] px-2 py-1.5 outline-none focus:ring-1 focus:ring-[#cba6f7] placeholder:text-[#585b70] resize-none min-h-[28px] max-h-[80px]"
                  placeholder="Ask AI to run commands on your server..."
                  rows={1}
                  disabled={aiStreaming}
                />
                {aiStreaming ? (
                  <button onClick={() => aiAbort?.abort()} className="p-1.5 rounded bg-[#f38ba8] text-[#1e1e2e] hover:bg-[#f38ba8]/80">
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button onClick={handleAISubmit} disabled={!aiInput.trim()} className="p-1.5 rounded bg-[#cba6f7] text-[#1e1e2e] hover:bg-[#cba6f7]/80 disabled:opacity-40">
                    <Send className="h-3.5 w-3.5" />
                  </button>
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
  { id: "code-chat", label: "Code Chat", icon: Sparkles, component: CodeChatPanel },
  { id: "shell", label: "Shell", icon: Terminal, component: ShellPanel },
  { id: "ssh", label: "SSH", icon: Server, component: SSHPanel },
  { id: "upload", label: "Upload", icon: Upload, component: () => <div className="p-3 h-full overflow-auto"><UploadArea catppuccin={true} /></div> },
  { id: "files", label: "Files", icon: FolderTree, component: FileExplorerPanel },
  { id: "git", label: "Git", icon: GitBranch, component: GitPanel },
  { id: "activity", label: "Activity", icon: Bot, component: AgentActivityPanel },
  { id: "database", label: "Database", icon: Database, component: DatabasePanel },
  { id: "env", label: "Env Vars", icon: Key, component: EnvPanel },
  { id: "process", label: "Process", icon: Activity, component: ProcessPanel },
  { id: "projects", label: "Projects", icon: FolderPlus, component: () => <ProjectManager catppuccin={true} /> },
] as const;

type PanelId = typeof PANELS[number]["id"];

function WBPanelSelector({ value, onChange }: { value: PanelId; onChange: (v: PanelId) => void }) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {PANELS.map(p => {
        const Icon = p.icon;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors",
              value === p.id ? "bg-primary text-white" : "text-[#6c7086] hover:bg-[#313244] hover:text-[#a6adc8]"
            )}
          >
            <Icon className="h-3 w-3" />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function WBPersistentPanelSlot({ activeId }: { activeId: PanelId }) {
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

export default function Workbench() {
  const [leftPanel, setLeftPanel] = usePersistedState<PanelId>("wb-left-panel", "code-chat");
  const [rightPanel, setRightPanel] = usePersistedState<PanelId>("wb-right-panel", "files");
  const [bottomPanel, setBottomPanel] = usePersistedState<PanelId>("wb-bottom-panel", "shell");
  const [bottomRightPanel, setBottomRightPanel] = usePersistedState<PanelId>("wb-bottom-right-panel", "git");
  const [showBottom, setShowBottom] = usePersistedState("wb-show-bottom", false);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#1e1e2e]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#313244] bg-[#181825]">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Code2 className="h-3.5 w-3.5 text-white" />
          </div>
          <h1 className="text-base font-semibold tracking-tight text-white">Coding Workbench</h1>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#313244] text-[#6c7086]">IDE</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
              showBottom ? "bg-primary text-white" : "border border-[#313244] text-[#a6adc8] hover:bg-[#313244]"
            )}
            onClick={() => setShowBottom(!showBottom)}
          >
            {showBottom ? "Hide Bottom" : "Show Bottom"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className={cn("flex min-h-0", showBottom ? "h-[55%]" : "flex-1")}>
            <div className="flex-1 flex flex-col border-r border-[#313244] min-w-0">
              <div className="px-2 py-1 border-b border-[#313244] bg-[#181825]">
                <WBPanelSelector value={leftPanel} onChange={setLeftPanel} />
              </div>
              <WBPersistentPanelSlot activeId={leftPanel} />
            </div>
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-2 py-1 border-b border-[#313244] bg-[#181825]">
                <WBPanelSelector value={rightPanel} onChange={setRightPanel} />
              </div>
              <WBPersistentPanelSlot activeId={rightPanel} />
            </div>
          </div>

          {showBottom && (
            <>
              <div className="h-px bg-[#313244]" />
              <div className="h-[45%] flex min-h-0">
                <div className="flex-1 flex flex-col border-r border-[#313244] min-w-0">
                  <div className="px-2 py-1 border-b border-[#313244] bg-[#181825]">
                    <WBPanelSelector value={bottomPanel} onChange={setBottomPanel} />
                  </div>
                  <WBPersistentPanelSlot activeId={bottomPanel} />
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="px-2 py-1 border-b border-[#313244] bg-[#181825]">
                    <WBPanelSelector value={bottomRightPanel} onChange={setBottomRightPanel} />
                  </div>
                  <WBPersistentPanelSlot activeId={bottomRightPanel} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
