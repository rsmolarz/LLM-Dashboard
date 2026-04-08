import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot, FolderOpen, FileCode2, ChevronRight, ChevronDown, Server, Play,
  Settings, Loader2, Terminal, Cpu, Zap, Code2, Workflow, Brain,
  Shield, MessageSquare, Globe, Layers, RefreshCw, Info, Copy, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = import.meta.env.VITE_API_URL || "/api";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
  children?: FileNode[];
}

interface AgentInfo {
  name: string;
  version: string;
  description: string;
  pythonFiles: number;
  features: string[];
}

function useAgentTree() {
  return useQuery<FileNode[]>({
    queryKey: ["claw-agent-tree"],
    queryFn: async () => {
      const res = await fetch(`${API}/claw-agent/tree`);
      const data = await res.json();
      return data.tree || [];
    },
  });
}

function useAgentInfo() {
  return useQuery<AgentInfo>({
    queryKey: ["claw-agent-info"],
    queryFn: async () => {
      const res = await fetch(`${API}/claw-agent/info`);
      return res.json();
    },
  });
}

function useFileContent(path: string | null) {
  return useQuery<{ content: string; extension: string }>({
    queryKey: ["claw-agent-file", path],
    queryFn: async () => {
      const res = await fetch(`${API}/claw-agent/file?path=${encodeURIComponent(path!)}`);
      return res.json();
    },
    enabled: !!path,
  });
}

function TreeNode({ node, depth, selectedPath, onSelect }: {
  node: FileNode; depth: number; selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "directory";
  const isSelected = node.path === selectedPath;

  if (isDir) {
    return (
      <div>
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 w-full text-left px-2 py-1 hover:bg-white/[0.04] rounded text-[11px] transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}>
          {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground/50" /> : <ChevronRight className="w-3 h-3 text-muted-foreground/50" />}
          <FolderOpen className="w-3.5 h-3.5 text-amber-400/70" />
          <span className="text-muted-foreground font-medium">{node.name}</span>
          {node.children && <span className="text-[9px] text-muted-foreground/30 ml-auto">{node.children.length}</span>}
        </button>
        {expanded && node.children?.map(child => (
          <TreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  const iconColor = node.extension === ".py" ? "text-blue-400" : node.extension === ".md" ? "text-emerald-400" : node.extension === ".toml" ? "text-amber-400" : "text-muted-foreground/50";

  return (
    <button onClick={() => onSelect(node.path)}
      className={cn(
        "flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-[11px] transition-colors",
        isSelected ? "bg-amber-500/10 text-amber-400" : "hover:bg-white/[0.04] text-muted-foreground"
      )}
      style={{ paddingLeft: `${depth * 16 + 20}px` }}>
      <FileCode2 className={cn("w-3.5 h-3.5 flex-shrink-0", iconColor)} />
      <span className="truncate">{node.name}</span>
      {node.size && <span className="text-[9px] text-muted-foreground/30 ml-auto flex-shrink-0">{(node.size / 1024).toFixed(1)}k</span>}
    </button>
  );
}

function CodeViewer({ content, extension, filePath }: { content: string; extension: string; filePath: string }) {
  const [copied, setCopied] = useState(false);
  const lines = content.split("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-medium text-white">{filePath}</span>
          <span className="text-[9px] text-muted-foreground/40">{lines.length} lines</span>
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-white hover:bg-white/[0.06] transition-colors">
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-3 py-0 text-right text-muted-foreground/20 select-none border-r border-white/[0.04] w-12 align-top">{i + 1}</td>
                <td className="px-3 py-0 text-muted-foreground whitespace-pre-wrap break-all">{line || " "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FEATURE_ICONS: Record<string, any> = {
  "Interactive Chat Mode": MessageSquare,
  "Streaming Output": Zap,
  "Plugin Runtime": Layers,
  "Nested Agent Delegation": Bot,
  "Cost Tracking & Budgets": Cpu,
  "Context Compaction": Brain,
  "Ollama Support": Globe,
  "MCP Transport": Server,
  "Task & Plan Runtime": Workflow,
  "Workflow Runtime": Code2,
};

type TabId = "overview" | "source" | "config";

export default function ClawAgent() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { data: tree, isLoading: treeLoading } = useAgentTree();
  const { data: info, isLoading: infoLoading } = useAgentInfo();
  const { data: fileData, isLoading: fileLoading } = useFileContent(selectedFile);

  const [configModel, setConfigModel] = useState("llama3.2:latest");
  const [configBaseUrl, setConfigBaseUrl] = useState("http://72.60.167.64:11434/v1");
  const [configTemp, setConfigTemp] = useState("0.0");
  const [configStream, setConfigStream] = useState(true);
  const [configAllowWrite, setConfigAllowWrite] = useState(false);
  const [configAllowShell, setConfigAllowShell] = useState(false);

  const pyFileCount = useMemo(() => {
    if (!tree) return 0;
    let count = 0;
    function walk(nodes: FileNode[]) {
      for (const n of nodes) {
        if (n.type === "file" && n.extension === ".py") count++;
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
    return count;
  }, [tree]);

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: Info },
    { id: "source", label: "Source Browser", icon: FileCode2 },
    { id: "config", label: "Configuration", icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              Claw Code Agent
              {info && <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">v{info.version}</span>}
            </h1>
            <p className="text-[11px] text-muted-foreground">{info?.description || "Python reimplementation of Claude Code agent architecture"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-[10px] font-semibold text-blue-400 border border-blue-500/20">
            Python 3.10+
          </span>
          <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
            Zero Dependencies
          </span>
          <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
            {pyFileCount || info?.pythonFiles || "?"} Python Files
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 px-6 py-2 border-b border-white/[0.06]">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                activeTab === tab.id
                  ? "bg-violet-500/15 border border-violet-500/25 text-violet-400"
                  : "text-muted-foreground hover:text-white hover:bg-white/[0.04]"
              )}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "overview" && (
          <div className="h-full overflow-y-auto p-6 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Terminal className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-semibold text-white">Architecture</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Full reimplementation of the Claude Code agent in pure Python. Uses OpenAI-compatible API servers (Ollama, vLLM, LiteLLM, OpenRouter) for inference.
                  Includes prompt assembly, context building, slash commands, tool calling, session persistence, and local model execution.
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">Ollama Integration</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Works out of the box with Ollama's OpenAI-compatible API. Point the base URL to your Ollama VPS at
                  <code className="text-amber-400 text-[10px] mx-1">http://72.60.167.64:11434/v1</code>
                  and select any loaded model.
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-semibold text-white">Permissions</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Fine-grained permission controls: file write, shell commands, destructive operations.
                  Budget limits for tokens, cost, tool calls, and session turns. Hook and policy runtime for trust management.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-white">Key Features</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(info?.features || []).map(feature => {
                  const Icon = FEATURE_ICONS[feature] || Zap;
                  return (
                    <div key={feature} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <Icon className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{feature}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Code2 className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-white">Quick Start (VPS)</span>
              </div>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/30 border border-white/[0.04]">
                  <span className="text-emerald-400">$</span>
                  <span className="text-muted-foreground">cd claw-code-agent && pip install -e .</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/30 border border-white/[0.04]">
                  <span className="text-emerald-400">$</span>
                  <span className="text-muted-foreground">claw-code-agent agent --base-url http://72.60.167.64:11434/v1 --model llama3.2:latest "explain this code"</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/30 border border-white/[0.04]">
                  <span className="text-emerald-400">$</span>
                  <span className="text-muted-foreground">claw-code-agent agent-chat --base-url http://72.60.167.64:11434/v1 --model deepseek-r1:8b --stream</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "source" && (
          <div className="flex h-full">
            <div className="w-72 border-r border-white/[0.06] overflow-y-auto py-2 flex-shrink-0">
              {treeLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : tree && tree.length > 0 ? (
                tree.map(node => (
                  <TreeNode key={node.path} node={node} depth={0} selectedPath={selectedFile} onSelect={(p) => setSelectedFile(p)} />
                ))
              ) : (
                <p className="text-[11px] text-muted-foreground/40 text-center py-8">No files found</p>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              {selectedFile ? (
                fileLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : fileData?.content ? (
                  <CodeViewer content={fileData.content} extension={fileData.extension} filePath={selectedFile} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
                    Failed to load file
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/30">
                  <FileCode2 className="w-10 h-10" />
                  <p className="text-sm">Select a file to view its source code</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "config" && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Server className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-semibold text-white">Model Configuration</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Model</label>
                    <input value={configModel} onChange={e => setConfigModel(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-muted-foreground/30 outline-none focus:border-violet-500/40"
                      placeholder="e.g. llama3.2:latest" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Base URL (OpenAI-compatible)</label>
                    <input value={configBaseUrl} onChange={e => setConfigBaseUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-muted-foreground/30 outline-none focus:border-violet-500/40"
                      placeholder="http://72.60.167.64:11434/v1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Temperature</label>
                      <input value={configTemp} onChange={e => setConfigTemp(e.target.value)} type="number" step="0.1" min="0" max="2"
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-violet-500/40" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground font-medium mb-1 block">API Key</label>
                      <input defaultValue="local-token"
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-violet-500/40"
                        placeholder="local-token" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-white">Permissions & Runtime</span>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-xs text-white font-medium">Streaming Output</span>
                      <p className="text-[10px] text-muted-foreground">Token-by-token streaming responses</p>
                    </div>
                    <div className={cn("w-9 h-5 rounded-full transition-colors relative cursor-pointer", configStream ? "bg-violet-500" : "bg-white/10")}
                      onClick={() => setConfigStream(!configStream)}>
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", configStream ? "translate-x-4" : "translate-x-0.5")} />
                    </div>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-xs text-white font-medium">Allow File Write</span>
                      <p className="text-[10px] text-muted-foreground">Let the agent write and modify files</p>
                    </div>
                    <div className={cn("w-9 h-5 rounded-full transition-colors relative cursor-pointer", configAllowWrite ? "bg-emerald-500" : "bg-white/10")}
                      onClick={() => setConfigAllowWrite(!configAllowWrite)}>
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", configAllowWrite ? "translate-x-4" : "translate-x-0.5")} />
                    </div>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-xs text-white font-medium">Allow Shell Commands</span>
                      <p className="text-[10px] text-muted-foreground">Let the agent execute shell commands</p>
                    </div>
                    <div className={cn("w-9 h-5 rounded-full transition-colors relative cursor-pointer", configAllowShell ? "bg-amber-500" : "bg-white/10")}
                      onClick={() => setConfigAllowShell(!configAllowShell)}>
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", configAllowShell ? "translate-x-4" : "translate-x-0.5")} />
                    </div>
                  </label>
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Generated Command</span>
                </div>
                <div className="px-4 py-3 rounded-lg bg-black/40 border border-white/[0.06] font-mono text-[11px] text-muted-foreground leading-relaxed break-all">
                  <span className="text-emerald-400">claw-code-agent</span>{" "}
                  <span className="text-blue-400">agent-chat</span>{" "}
                  --base-url {configBaseUrl}{" "}
                  --model {configModel}{" "}
                  --temperature {configTemp}
                  {configStream ? " --stream" : ""}
                  {configAllowWrite ? " --allow-write" : ""}
                  {configAllowShell ? " --allow-shell" : ""}
                </div>
                <p className="text-[10px] text-muted-foreground/50">
                  Run this command on your VPS to start the agent. The agent will connect to your Ollama instance and begin an interactive session.
                </p>
              </div>

              <div className="rounded-xl bg-violet-500/[0.05] border border-violet-500/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-semibold text-violet-400">VPS Setup Instructions</span>
                </div>
                <ol className="space-y-1.5 text-[11px] text-muted-foreground list-decimal list-inside">
                  <li>SSH into your VPS: <code className="text-amber-400">ssh root@72.60.167.64</code></li>
                  <li>Clone or copy the claw-code-agent directory to your VPS</li>
                  <li>Install: <code className="text-amber-400">cd claw-code-agent && pip install -e .</code></li>
                  <li>Ensure Ollama is running: <code className="text-amber-400">ollama serve</code></li>
                  <li>Run the generated command above to start the agent</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
