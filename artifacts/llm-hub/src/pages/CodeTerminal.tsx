import { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal, Send, Loader2, Code2, Play, Square, Trash2, Copy, Check,
  FolderOpen, FileCode, ChevronRight, Bot, User, RefreshCw, Settings,
  ChevronDown, Zap, File, Folder, ArrowLeft, Save, Plus, X, Search,
  MessageSquare, PanelLeftClose, PanelLeft, Sparkles, Globe, Server,
  FileText, Cpu, DollarSign, GitBranch, Package, ExternalLink,
} from "lucide-react";

const API = import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  path: string;
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  modified: boolean;
  language: string;
}

interface OllamaModel { id: string; name: string; size: number; source: "ollama"; }
interface OpenRouterModel { id: string; name: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; source: "openrouter"; }
interface ProjectEntry { name: string; path: string; source: string; hasPackageJson: boolean; isGit: boolean; description: string; }

function getLanguage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", java: "java",
    html: "html", css: "css", scss: "scss", json: "json",
    md: "markdown", sql: "sql", sh: "bash", bash: "bash",
    yml: "yaml", yaml: "yaml", toml: "toml", xml: "xml",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    rb: "ruby", php: "php", swift: "swift", kt: "kotlin",
    dockerfile: "dockerfile", makefile: "makefile",
  };
  return map[ext] || "text";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${(bytes / 1073741824).toFixed(1)}GB`;
}

const CODE_SYSTEM_PROMPT = `You are an expert software engineer and AI coding agent. You help users write, debug, refactor, and improve code. You have access to a file system and terminal.

When the user asks you to:
- CREATE or EDIT files: Provide the full file content in a code block with the file path as the language identifier, like:
\`\`\`path/to/file.ts
// full file content here
\`\`\`
- RUN commands: Provide commands in a bash code block:
\`\`\`bash
command here
\`\`\`
- EXPLAIN code: Give clear, concise explanations with relevant code snippets.

Be precise, avoid unnecessary commentary, and always provide complete, working code. When modifying existing files, show the entire updated file content unless the file is very large — in that case, show the specific section to change with clear markers.`;

const CURATED_OR_MODELS = [
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-haiku",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-2.5-pro-preview",
  "google/gemini-2.5-flash-preview",
  "deepseek/deepseek-chat-v3-0324",
  "deepseek/deepseek-r1",
  "meta-llama/llama-4-maverick",
  "qwen/qwen3-235b-a22b",
  "mistralai/codestral-2501",
];

export default function CodeTerminal() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState("qwen2.5-coder:7b");
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModel[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(CODE_SYSTEM_PROMPT);
  const [temperature, setTemperature] = useState(0.3);
  const [showFileExplorer, setShowFileExplorer] = useState(true);
  const [currentPath, setCurrentPath] = useState(".");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<Array<{ id: string; type: string; content: string }>>([]);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [layout, setLayout] = useState<"agent" | "editor" | "split">("split");
  const [showSources, setShowSources] = useState(false);
  const [gitUrl, setGitUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<{ success: boolean; message: string } | null>(null);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/code-terminal/models`)
      .then(r => r.json())
      .then(data => {
        const ollama = data.ollama || [];
        const or = data.openrouter || [];
        setOllamaModels(ollama);
        setOpenrouterModels(or);
        const codeModelPriority = [
          "qwen3-coder", "qwen2.5-coder", "deepseek-coder-v2", "deepseek-coder",
          "codellama", "starcoder2", "codegemma",
        ];
        const codeModel = codeModelPriority.reduce<string | null>((found, prefix) => {
          if (found) return found;
          const matches = ollama.filter((m: any) => m.id.startsWith(prefix));
          if (matches.length > 0) {
            matches.sort((a: any, b: any) => (b.size || 0) - (a.size || 0));
            return matches[0].id;
          }
          return null;
        }, null);
        if (codeModel) {
          setModel(codeModel);
        } else if (ollama.length > 0) {
          const anyCode = ollama.find((m: any) => /coder|code/i.test(m.id));
          if (anyCode) setModel(anyCode.id);
          else setModel(ollama.find((m: any) => !m.id.includes("embed"))?.id || ollama[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadFiles(currentPath); }, [currentPath]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { terminalEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [terminalLines]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const loadFiles = useCallback(async (dirPath: string) => {
    setLoadingFiles(true);
    try {
      const res = await fetch(`${API}/api/code-terminal/list-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = await res.json();
      setFiles(data.files || []);
    } catch {}
    setLoadingFiles(false);
  }, []);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`${API}/api/code-terminal/projects`);
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {}
    setLoadingProjects(false);
  }, []);

  const cloneRepo = async () => {
    if (!gitUrl.trim() || cloning) return;
    setCloning(true);
    setCloneResult(null);
    try {
      const res = await fetch(`${API}/api/code-terminal/clone-repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: gitUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCloneResult({ success: true, message: `${data.action === "pulled" ? "Updated" : "Cloned"} to ${data.path}` });
        setCurrentPath(data.path);
        setGitUrl("");
        loadProjects();
      } else {
        setCloneResult({ success: false, message: data.error || "Clone failed" });
      }
    } catch (err: any) {
      setCloneResult({ success: false, message: err.message });
    }
    setCloning(false);
  };

  const openFile = useCallback(async (filePath: string, fileName: string) => {
    const existing = openTabs.find(t => t.path === filePath);
    if (existing) { setActiveTab(filePath); return; }
    try {
      const res = await fetch(`${API}/api/code-terminal/read-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });
      const data = await res.json();
      if (data.error) return;
      const tab: OpenTab = { path: filePath, name: fileName, content: data.content, modified: false, language: getLanguage(fileName) };
      setOpenTabs(prev => [...prev, tab]);
      setActiveTab(filePath);
      setLayout(prev => prev === "agent" ? "split" : prev);
    } catch {}
  }, [openTabs]);

  const closeTab = useCallback((path: string) => {
    setOpenTabs(prev => prev.filter(t => t.path !== path));
    if (activeTab === path) {
      setActiveTab(openTabs.length > 1 ? openTabs.find(t => t.path !== path)?.path || null : null);
    }
  }, [activeTab, openTabs]);

  const saveFile = useCallback(async (path: string) => {
    const tab = openTabs.find(t => t.path === path);
    if (!tab) return;
    try {
      await fetch(`${API}/api/code-terminal/write-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: tab.content }),
      });
      setOpenTabs(prev => prev.map(t => t.path === path ? { ...t, modified: false } : t));
    } catch {}
  }, [openTabs]);

  const updateTabContent = useCallback((path: string, content: string) => {
    setOpenTabs(prev => prev.map(t => t.path === path ? { ...t, content, modified: true } : t));
  }, []);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: input.trim(), timestamp: Date.now() };
    let contextMessages = [...messages, userMsg];
    const currentTab = openTabs.find(t => t.path === activeTab);
    let systemContent = systemPrompt;
    if (currentTab) {
      systemContent += `\n\nCurrently open file: ${currentTab.path}\n\`\`\`${currentTab.language}\n${currentTab.content.slice(0, 8000)}\n\`\`\``;
    }
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    const assistantMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: "", timestamp: Date.now() };
    setMessages(prev => [...prev, assistantMsg]);
    setStreaming(true);
    const abortController = new AbortController();
    abortRef.current = abortController;
    try {
      const chatMessages = [
        { role: "system", content: systemContent },
        ...contextMessages.map(m => ({ role: m.role, content: m.content })),
      ];
      const res = await fetch(`${API}/api/code-terminal/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: chatMessages, stream: true, temperature }),
        signal: abortController.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const data = JSON.parse(payload);
            if (data.content) {
              fullContent += data.content;
              setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullContent } : m));
            }
            if (data.error) {
              fullContent += `\nError: ${data.error}`;
              setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullContent } : m));
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: m.content || `Error: ${err.message}` } : m));
      }
    }
    setStreaming(false);
    abortRef.current = null;
  };

  const runCommand = async (cmd?: string) => {
    const command = cmd || terminalInput.trim();
    if (!command || terminalRunning) return;
    if (!cmd) {
      setTerminalHistory(prev => [...prev, command]);
      setHistoryIndex(-1);
      setTerminalInput("");
    }
    setTerminalLines(prev => [...prev, { id: `in-${Date.now()}`, type: "input", content: command }]);
    setTerminalRunning(true);
    try {
      const res = await fetch(`${API}/api/code-terminal/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (data.stdout) setTerminalLines(prev => [...prev, { id: `out-${Date.now()}`, type: "output", content: data.stdout }]);
      if (data.stderr) setTerminalLines(prev => [...prev, { id: `err-${Date.now()}`, type: "error", content: data.stderr }]);
      if (data.error) setTerminalLines(prev => [...prev, { id: `err-${Date.now()}`, type: "error", content: data.error }]);
    } catch (err: any) {
      setTerminalLines(prev => [...prev, { id: `err-${Date.now()}`, type: "error", content: err.message }]);
    }
    setTerminalRunning(false);
  };

  const applyCodeBlock = async (code: string, lang: string) => {
    if (lang === "bash" || lang === "sh" || lang === "shell") {
      setShowTerminal(true);
      await runCommand(code);
      return;
    }
    if (lang.includes("/") || lang.includes(".")) {
      const path = lang;
      const name = path.split("/").pop() || path;
      const existing = openTabs.find(t => t.path === path);
      if (existing) { updateTabContent(path, code); setActiveTab(path); }
      else {
        setOpenTabs(prev => [...prev, { path, name, content: code, modified: true, language: getLanguage(name) }]);
        setActiveTab(path);
      }
      setLayout(prev => prev === "agent" ? "split" : prev);
      return;
    }
    navigator.clipboard.writeText(code);
    setCopiedId(`apply-${Date.now()}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderMessageContent = (content: string, msgId: string) => {
    const parts = content.split(/(```[\w.\/\-]*\n[\s\S]*?```)/g);
    return parts.map((part, i) => {
      const codeMatch = part.match(/```([\w.\/\-]*)\n([\s\S]*?)```/);
      if (codeMatch) {
        const lang = codeMatch[1] || "text";
        const code = codeMatch[2].trim();
        const blockId = `${msgId}-code-${i}`;
        const isFile = lang.includes("/") || lang.includes(".");
        const isBash = ["bash", "sh", "shell"].includes(lang);
        return (
          <div key={i} className="my-2 rounded-lg overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/10">
              <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                {isFile && <FileCode className="w-3 h-3 text-blue-400" />}
                {isBash && <Terminal className="w-3 h-3 text-emerald-400" />}
                {lang}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => applyCodeBlock(code, lang)}
                  className="px-2 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-1 transition-all">
                  {isFile ? <><Save className="w-2.5 h-2.5" /> Apply</> :
                   isBash ? <><Play className="w-2.5 h-2.5" /> Run</> :
                   <><Copy className="w-2.5 h-2.5" /> Copy</>}
                </button>
                <button onClick={() => copyText(code, blockId)}
                  className="p-1 rounded hover:bg-white/10 transition-all" title="Copy">
                  {copiedId === blockId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                </button>
              </div>
            </div>
            <pre className="p-3 text-[11px] font-mono text-gray-300 overflow-x-auto bg-black/40 whitespace-pre max-h-[400px] overflow-y-auto">{code}</pre>
          </div>
        );
      }
      return part ? <span key={i} className="whitespace-pre-wrap">{part}</span> : null;
    });
  };

  const filteredOllamaModels = ollamaModels.filter(m =>
    !modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );
  const filteredORModels = modelSearch
    ? openrouterModels.filter(m => m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase())).slice(0, 30)
    : openrouterModels.filter(m => CURATED_OR_MODELS.includes(m.id));

  const navigateUp = () => {
    if (currentPath === "." || currentPath === "/") return;
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.length > 0 ? parts.join("/") : ".");
  };

  const activeTabData = openTabs.find(t => t.path === activeTab);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0a0a0f]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#0d0d14] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">Code Agent</h1>
            <p className="text-[10px] text-muted-foreground">AI coding assistant with file access & terminal</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={modelDropdownRef}>
            <button onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:border-white/20 text-xs text-white transition-all max-w-[280px]">
              {model.includes("/") ? (
                <Globe className="w-3 h-3 text-violet-400 flex-shrink-0" />
              ) : (
                <Server className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              )}
              <span className="truncate">{model}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            </button>

            {showModelDropdown && (
              <div className="absolute right-0 top-full mt-1 w-[380px] bg-[#12121a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-2 border-b border-white/[0.06]">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={modelSearch} onChange={e => setModelSearch(e.target.value)}
                      placeholder="Search models..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-violet-500/50"
                      autoFocus />
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {filteredOllamaModels.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-emerald-400 flex items-center gap-1.5 bg-emerald-500/[0.03]">
                        <Server className="w-3 h-3" /> VPS Models (Free)
                      </div>
                      {filteredOllamaModels.map(m => (
                        <button key={m.id} onClick={() => { setModel(m.id); setShowModelDropdown(false); setModelSearch(""); }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/[0.04] transition-all ${model === m.id ? "bg-emerald-500/[0.06]" : ""}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <Cpu className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            <span className="text-xs text-white truncate">{m.id}</span>
                          </div>
                          <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-2">{formatSize(m.size)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredORModels.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-violet-400 flex items-center gap-1.5 bg-violet-500/[0.03] border-t border-white/[0.04]">
                        <Globe className="w-3 h-3" /> OpenRouter Models
                      </div>
                      {filteredORModels.map(m => {
                        const cost = m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1000000 : 0;
                        return (
                          <button key={m.id} onClick={() => { setModel(m.id); setShowModelDropdown(false); setModelSearch(""); }}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/[0.04] transition-all ${model === m.id ? "bg-violet-500/[0.06]" : ""}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <Globe className="w-3 h-3 text-violet-400 flex-shrink-0" />
                              <span className="text-xs text-white block truncate">{m.id}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {cost > 0 ? (
                                <span className="text-[9px] text-amber-400 flex items-center gap-0.5">
                                  <DollarSign className="w-2.5 h-2.5" />{cost.toFixed(2)}/M
                                </span>
                              ) : (
                                <span className="text-[9px] text-emerald-400">free</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {!modelSearch && (
                        <button onClick={() => { const searchInput = modelDropdownRef.current?.querySelector('input'); if (searchInput) (searchInput as HTMLInputElement).focus(); }}
                          className="w-full text-center py-2 text-[10px] text-violet-400 hover:bg-white/[0.03] transition-all">
                          Type to search all {openrouterModels.length} models...
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => { setShowSources(!showSources); if (!showSources) loadProjects(); }}
            className={`p-1.5 rounded-lg transition-all ${showSources ? "bg-violet-500/10 text-violet-400 border border-violet-500/30" : "hover:bg-white/5 text-muted-foreground hover:text-white"}`}
            title="Import sources (GitHub / Projects)">
            <GitBranch className="w-3.5 h-3.5" />
          </button>

          <button onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg transition-all ${showSettings ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground hover:text-white"}`}>
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button onClick={() => setShowFileExplorer(!showFileExplorer)}
            className={`p-1.5 rounded-lg transition-all ${showFileExplorer ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground hover:text-white"}`}
            title="Toggle file explorer">
            {showFileExplorer ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
            <button onClick={() => setLayout("agent")}
              className={`p-1.5 transition-all ${layout === "agent" ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground"}`}
              title="Chat only">
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setLayout("split")}
              className={`p-1.5 transition-all ${layout === "split" ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground"}`}
              title="Split view">
              <Code2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setLayout("editor")}
              className={`p-1.5 transition-all ${layout === "editor" ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground"}`}
              title="Editor only">
              <FileCode className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showSources && (
        <div className="border-b border-white/[0.06] bg-[#0c0c14] flex-shrink-0">
          <div className="flex">
            <div className="flex-1 p-4 border-r border-white/[0.06]">
              <div className="flex items-center gap-2 mb-3">
                <GitBranch className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-semibold text-white">Clone from GitHub</span>
              </div>
              <div className="flex gap-2">
                <input value={gitUrl} onChange={e => setGitUrl(e.target.value)}
                  placeholder="https://github.com/user/repo"
                  onKeyDown={e => { if (e.key === "Enter") cloneRepo(); }}
                  className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-muted-foreground/40 focus:outline-none focus:border-violet-500/50 font-mono" />
                <button onClick={cloneRepo} disabled={cloning || !gitUrl.trim()}
                  className="px-4 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-medium hover:bg-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5">
                  {cloning ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitBranch className="w-3 h-3" />}
                  {cloning ? "Cloning..." : "Clone"}
                </button>
              </div>
              {cloneResult && (
                <div className={`mt-2 text-[11px] px-3 py-1.5 rounded-lg ${cloneResult.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {cloneResult.message}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-2">Supports GitHub, GitLab, Bitbucket. Repos clone into projects/ folder. Re-cloning pulls latest changes.</p>
            </div>

            <div className="flex-1 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-white">Workspace Projects</span>
                </div>
                <button onClick={loadProjects} className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-white">
                  <RefreshCw className={`w-3 h-3 ${loadingProjects ? "animate-spin" : ""}`} />
                </button>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {loadingProjects ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                ) : projects.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/50 py-2">No projects found. Clone a repo or check workspace.</p>
                ) : projects.map(p => (
                  <button key={p.path}
                    onClick={() => { setCurrentPath(p.path); setShowFileExplorer(true); setShowSources(false); }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all group">
                    <div className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                      {p.isGit ? <GitBranch className="w-3.5 h-3.5 text-orange-400" /> : <Package className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-white font-medium truncate">{p.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground/60">{p.source}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 truncate block">{p.path}</span>
                    </div>
                    <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-white/50 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="px-4 py-3 border-b border-white/[0.06] bg-[#0d0d14] space-y-2 flex-shrink-0">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">System Prompt</label>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={3}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white resize-none focus:outline-none focus:border-violet-500/50 font-mono" />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Temperature</label>
              <input type="number" value={temperature} onChange={e => setTemperature(Number(e.target.value))}
                min={0} max={2} step={0.1}
                className="ml-2 w-16 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white focus:outline-none" />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {showFileExplorer && (
          <div className="w-60 border-r border-white/[0.06] bg-[#0b0b12] flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1">
                <FolderOpen className="w-3 h-3" /> Explorer
              </span>
              <div className="flex items-center gap-1">
                {currentPath !== "." && (
                  <button onClick={navigateUp} className="p-0.5 rounded hover:bg-white/5 text-muted-foreground hover:text-white">
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => loadFiles(currentPath)} className="p-0.5 rounded hover:bg-white/5 text-muted-foreground hover:text-white">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="px-3 py-1 text-[9px] text-muted-foreground/60 font-mono truncate border-b border-white/[0.03]">
              {currentPath === "." ? "/" : `/${currentPath}`}
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {loadingFiles ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : files.map(f => (
                <button key={f.name}
                  onClick={() => { if (f.isDirectory) { setCurrentPath(f.path); } else { openFile(f.path, f.name); } }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/[0.04] transition-all group text-[12px] ${
                    activeTab === f.path ? "bg-violet-500/[0.08] text-white" : "text-gray-400"
                  }`}>
                  {f.isDirectory ? (
                    <Folder className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  ) : (
                    <File className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                  )}
                  <span className="truncate flex-1">{f.name}</span>
                  {!f.isDirectory && f.size > 0 && (
                    <span className="text-[9px] text-muted-foreground/50 flex-shrink-0 opacity-0 group-hover:opacity-100">{formatSize(f.size)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {(layout === "agent" || layout === "split") && (
          <div className={`flex flex-col ${layout === "split" ? "w-[45%]" : "flex-1"} border-r border-white/[0.06] min-h-0`}>
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-[#0b0b12] flex-shrink-0">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
                <Bot className="w-3 h-3 text-violet-400" /> Agent
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground/70">
                  {model.includes("/") ? model.split("/").pop() : model}
                </span>
              </span>
              <button onClick={() => setMessages([])} className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-white transition-all" title="Clear chat">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center space-y-4 max-w-md">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-white/[0.06] flex items-center justify-center mx-auto">
                      <Sparkles className="w-8 h-8 text-violet-400/50" />
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium mb-1">Code Agent</p>
                      <p className="text-xs text-muted-foreground">Ask me to write, edit, debug, or explain code. I can see your open files and run commands.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        "Create a REST API with Express",
                        "Debug the error in the open file",
                        "Add input validation",
                        "Write unit tests",
                      ].map((s, i) => (
                        <button key={i} onClick={() => setInput(s)}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-muted-foreground hover:text-white hover:bg-white/[0.06] hover:border-white/10 transition-all">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-violet-400" />
                    </div>
                  )}
                  <div className={`rounded-xl px-4 py-3 text-[13px] leading-relaxed max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-violet-500/10 text-white border border-violet-500/20"
                      : "bg-white/[0.02] text-gray-300 border border-white/[0.06]"
                  }`}>
                    {msg.role === "assistant" ? renderMessageContent(msg.content, msg.id) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                    {streaming && msg.role === "assistant" && msg === messages[messages.length - 1] && (
                      <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse ml-0.5 rounded-sm" />
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-cyan-400" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-white/[0.06] flex-shrink-0">
              {activeTab && (
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <FileCode className="w-3 h-3 text-violet-400" />
                  <span className="text-[10px] text-muted-foreground">Context: {activeTab}</span>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Ask the agent to write code, fix bugs, create files..."
                  rows={3}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-violet-500/40" />
                {streaming ? (
                  <button onClick={() => { abortRef.current?.abort(); setStreaming(false); }}
                    className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
                    <Square className="w-5 h-5" />
                  </button>
                ) : (
                  <button onClick={sendMessage} disabled={!input.trim()}
                    className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <Send className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {(layout === "editor" || layout === "split") && (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="flex items-center border-b border-white/[0.06] bg-[#0b0b12] flex-shrink-0 overflow-x-auto">
              {openTabs.map(tab => (
                <div key={tab.path}
                  className={`flex items-center gap-1.5 px-3 py-2 border-r border-white/[0.04] cursor-pointer transition-all min-w-0 group ${
                    activeTab === tab.path ? "bg-[#0d0d14] text-white" : "text-muted-foreground hover:text-white hover:bg-white/[0.02]"
                  }`}
                  onClick={() => setActiveTab(tab.path)}>
                  <FileCode className="w-3 h-3 flex-shrink-0" />
                  <span className="text-[11px] truncate max-w-[140px]">{tab.name}</span>
                  {tab.modified && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                  <button onClick={e => { e.stopPropagation(); closeTab(tab.path); }}
                    className="p-0.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {openTabs.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground/50 italic">No files open — select from explorer</div>
              )}
            </div>

            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {activeTabData ? (
                <>
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04] bg-[#0c0c14] flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground font-mono truncate">{activeTabData.path}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-muted-foreground/50">{activeTabData.language}</span>
                      {activeTabData.modified && (
                        <button onClick={() => saveFile(activeTabData.path)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                          <Save className="w-2.5 h-2.5" /> Save
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden relative min-h-0">
                    <textarea
                      value={activeTabData.content}
                      onChange={e => updateTabContent(activeTabData.path, e.target.value)}
                      onKeyDown={e => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveFile(activeTabData.path); }
                        if (e.key === "Tab") {
                          e.preventDefault();
                          const target = e.target as HTMLTextAreaElement;
                          const start = target.selectionStart;
                          const end = target.selectionEnd;
                          const value = target.value;
                          const newValue = value.substring(0, start) + "  " + value.substring(end);
                          updateTabContent(activeTabData.path, newValue);
                          setTimeout(() => { target.selectionStart = target.selectionEnd = start + 2; }, 0);
                        }
                      }}
                      spellCheck={false}
                      className="absolute inset-0 w-full h-full bg-transparent text-[13px] font-mono text-gray-300 p-4 resize-none focus:outline-none leading-6 tab-size-2"
                      style={{ tabSize: 2 }} />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <FileText className="w-12 h-12 text-muted-foreground/20 mx-auto" />
                    <p className="text-sm text-muted-foreground/40">Open a file from the explorer</p>
                  </div>
                </div>
              )}

              {showTerminal && (
                <div className="h-[220px] border-t border-white/[0.06] bg-[#08080e] flex flex-col flex-shrink-0">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04] flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-emerald-400" /> Terminal
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setTerminalLines([])} className="p-0.5 rounded hover:bg-white/5 text-muted-foreground hover:text-white" title="Clear">
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                      <button onClick={() => setShowTerminal(false)} className="p-0.5 rounded hover:bg-white/5 text-muted-foreground hover:text-white" title="Hide terminal">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[12px] space-y-0.5">
                    {terminalLines.map(line => (
                      <div key={line.id} className={
                        line.type === "input" ? "text-cyan-300" :
                        line.type === "error" ? "text-red-400" :
                        line.type === "system" ? "text-muted-foreground italic" :
                        "text-gray-400"
                      }>
                        {line.type === "input" && <span className="text-emerald-400 mr-1">$</span>}
                        <span className="whitespace-pre-wrap">{line.content}</span>
                      </div>
                    ))}
                    {terminalRunning && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" /> Running...
                      </div>
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                  <div className="px-3 py-2 border-t border-white/[0.04] flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 text-xs font-mono">$</span>
                      <input ref={terminalInputRef} value={terminalInput}
                        onChange={e => setTerminalInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); runCommand(); }
                          else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            if (terminalHistory.length > 0) {
                              const newIndex = historyIndex === -1 ? terminalHistory.length - 1 : Math.max(0, historyIndex - 1);
                              setHistoryIndex(newIndex);
                              setTerminalInput(terminalHistory[newIndex]);
                            }
                          } else if (e.key === "ArrowDown") {
                            e.preventDefault();
                            if (historyIndex >= 0) {
                              const newIndex = historyIndex + 1;
                              if (newIndex >= terminalHistory.length) { setHistoryIndex(-1); setTerminalInput(""); }
                              else { setHistoryIndex(newIndex); setTerminalInput(terminalHistory[newIndex]); }
                            }
                          }
                        }}
                        placeholder="Enter command..."
                        disabled={terminalRunning}
                        className="flex-1 bg-transparent text-[12px] text-white font-mono placeholder:text-muted-foreground/30 focus:outline-none disabled:opacity-50" />
                    </div>
                  </div>
                </div>
              )}

              {!showTerminal && (
                <button onClick={() => setShowTerminal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border-t border-white/[0.06] text-[10px] text-muted-foreground hover:text-white hover:bg-white/[0.02] transition-all flex-shrink-0">
                  <Terminal className="w-3 h-3" /> Show Terminal
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
