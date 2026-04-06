import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Server, Cpu, HardDrive, Loader2, RefreshCw, Trash2, Download,
  Play, CheckCircle2, XCircle, AlertCircle, MemoryStick, Clock,
  Package, ChevronDown, ChevronUp, Plus, X, Power, PowerOff,
  Activity, Gauge, Sparkles, Zap, Star, Code2, MessageSquare,
  FileText, Search, Brain, PenTool, Languages, Image, Stethoscope,
} from "lucide-react";
import {
  useListModels,
  useListRunningModels,
  useGetLlmConfig,
  useGetLlmStatus,
  usePullModel,
  useDeleteModel,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface VpsStatus {
  online: boolean;
  cpu: number | null;
  memory: { totalRam: number; totalVram: number; modelCount: number } | null;
  latencyMs: number | null;
  error: string | null;
}

function useVpsStatus(intervalMs = 10000) {
  const [data, setData] = useState<VpsStatus | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/vps-status");
      if (!res.ok) {
        setData({ online: false, cpu: null, memory: null, latencyMs: null, error: `HTTP ${res.status}` });
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setData({ online: false, cpu: null, memory: null, latencyMs: null, error: "Fetch failed" });
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [poll, intervalMs]);

  return { vps: data, refreshVps: poll };
}

function CpuGauge({ value }: { value: number }) {
  const color = value > 70 ? "text-red-400" : value > 40 ? "text-amber-400" : "text-emerald-400";
  const bgColor = value > 70 ? "bg-red-500" : value > 40 ? "bg-amber-500" : "bg-emerald-500";
  const barWidth = Math.max(2, Math.min(100, value));

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Gauge className={cn("w-3.5 h-3.5 flex-shrink-0", color)} />
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700 ease-out", bgColor)}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
      <span className={cn("text-xs font-bold tabular-nums flex-shrink-0", color)}>{value}%</span>
    </div>
  );
}

const TASK_TYPES = [
  { id: "coding", label: "Coding", icon: Code2, desc: "Code generation, debugging, refactoring", families: ["qwen2", "qwen2.5", "codellama", "deepseek", "starcoder", "codegemma", "granite-code"], keywords: ["code", "coder", "starcoder", "deepseek-coder", "codellama", "codegemma", "granite-code"], minParams: 3 },
  { id: "chat", label: "General Chat", icon: MessageSquare, desc: "Conversation, Q&A, general assistance", families: ["llama", "gemma", "qwen2", "qwen2.5", "mistral", "phi", "vicuna", "openchat", "neural-chat"], keywords: ["chat", "instruct"], minParams: 1 },
  { id: "creative", label: "Creative Writing", icon: PenTool, desc: "Stories, poetry, creative content", families: ["llama", "mistral", "mixtral", "command-r", "yi"], keywords: ["creative", "writer", "story"], minParams: 7 },
  { id: "analysis", label: "Data Analysis", icon: Search, desc: "Reasoning, logic, data interpretation", families: ["qwen2", "qwen2.5", "mixtral", "command-r", "deepseek", "phi"], keywords: ["analyst", "reason"], minParams: 7 },
  { id: "summarization", label: "Summarization", icon: FileText, desc: "Condensing long documents", families: ["llama", "mistral", "gemma", "phi", "qwen2"], keywords: ["summary", "summariz"], minParams: 1 },
  { id: "translation", label: "Translation", icon: Languages, desc: "Multi-language translation tasks", families: ["qwen2", "qwen2.5", "aya", "gemma", "llama", "mistral"], keywords: ["translate", "multilingual", "aya"], minParams: 3 },
  { id: "vision", label: "Vision / Image", icon: Image, desc: "Image understanding and description", families: ["llava", "bakllava", "moondream", "llama3.2-vision"], keywords: ["llava", "vision", "moondream", "bakllava"], minParams: 1 },
  { id: "reasoning", label: "Deep Reasoning", icon: Brain, desc: "Complex multi-step reasoning", families: ["qwen2.5", "mixtral", "command-r", "deepseek", "phi"], keywords: ["reason", "think", "math"], minParams: 14 },
  { id: "medical", label: "Medical / Clinical", icon: Stethoscope, desc: "Health questions, symptoms, diagnosis, clinical reasoning", families: ["meditron", "medllama", "med"], keywords: ["meditron", "medical", "med", "clinical", "health"], minParams: 1 },
] as const;

const TASK_QUERY_MAP: Record<string, string[]> = {
  coding: ["code", "coding", "python", "javascript", "typescript", "java", "rust", "go", "c++", "program", "debug", "refactor", "function", "api", "script", "developer", "software", "algorithm", "sql", "html", "css", "react", "backend", "frontend", "bug", "compile"],
  chat: ["chat", "talk", "convers", "question", "answer", "help", "assist", "general", "ask", "explain", "tell me"],
  creative: ["write", "story", "poem", "creative", "fiction", "novel", "essay", "blog", "article", "copywriting", "narrative", "character", "plot", "screenplay", "lyrics"],
  analysis: ["analy", "data", "interpret", "evaluat", "assess", "review", "compare", "metric", "statistic", "insight", "trend", "report", "research", "examine"],
  summarization: ["summar", "condense", "brief", "tldr", "shorten", "digest", "overview", "recap", "key points", "extract"],
  translation: ["translat", "language", "spanish", "french", "german", "chinese", "japanese", "korean", "arabic", "portuguese", "italian", "hindi", "russian", "convert language", "foreign"],
  vision: ["image", "picture", "photo", "visual", "see", "look at", "describe image", "ocr", "screenshot", "diagram", "chart image"],
  reasoning: ["reason", "logic", "math", "calcul", "solve", "proof", "theorem", "complex", "step by step", "think through", "deduc", "infer", "puzzle", "strategy"],
  medical: ["medical", "health", "clinical", "symptom", "diagnosis", "diagnos", "patient", "doctor", "disease", "treatment", "therapy", "pharma", "drug", "medicine", "patholog", "anatomy", "surgery", "nurse", "hospital", "ent", "otolaryngolog", "cardio", "neuro", "oncolog", "pediatr", "radiol"],
};

function matchTaskFromQuery(query: string): string | null {
  if (!query.trim()) return null;
  const lower = query.toLowerCase();
  let bestId: string | null = null;
  let bestCount = 0;
  for (const [taskId, keywords] of Object.entries(TASK_QUERY_MAP)) {
    const count = keywords.filter(kw => lower.includes(kw)).length;
    if (count > bestCount) {
      bestCount = count;
      bestId = taskId;
    }
  }
  return bestId;
}

const MODEL_TASK_AFFINITIES: Record<string, string[]> = {
  "llama3.2": ["chat", "creative", "summarization"],
  "llama3.1": ["chat", "creative", "summarization", "analysis"],
  "llama3": ["chat", "creative", "summarization"],
  "llama2": ["chat", "creative"],
  "mistral": ["chat", "creative", "summarization", "analysis"],
  "mixtral": ["analysis", "reasoning", "creative", "coding"],
  "qwen2.5": ["coding", "analysis", "reasoning", "translation"],
  "qwen2": ["coding", "analysis", "translation"],
  "deepseek-coder": ["coding"],
  "deepseek": ["coding", "reasoning"],
  "codellama": ["coding"],
  "codegemma": ["coding"],
  "starcoder": ["coding"],
  "granite-code": ["coding"],
  "gemma": ["chat", "summarization", "translation"],
  "phi": ["chat", "analysis", "summarization", "reasoning"],
  "llava": ["vision"],
  "bakllava": ["vision"],
  "moondream": ["vision"],
  "command-r": ["analysis", "reasoning", "creative"],
  "aya": ["translation", "chat"],
  "yi": ["creative", "chat"],
  "vicuna": ["chat"],
  "openchat": ["chat"],
  "neural-chat": ["chat"],
  "meditron": ["medical"],
  "medllama": ["medical"],
  "med42": ["medical"],
  "biomistral": ["medical"],
};

function scoreModel(model: any, task: typeof TASK_TYPES[number]): number {
  const name = (model.name || "").toLowerCase();
  const family = (model.family || "").toLowerCase();
  const paramStr = model.parameterSize || "";
  const paramNum = parseFloat(paramStr) || 0;
  let score = 0;

  for (const [modelKey, tasks] of Object.entries(MODEL_TASK_AFFINITIES)) {
    if (name.includes(modelKey) && tasks.includes(task.id)) {
      score += 60;
      break;
    }
  }

  if (task.keywords.some(kw => name.includes(kw))) score += 50;
  if (task.families.some(f => family.includes(f) || name.includes(f))) score += 30;
  if (paramNum >= task.minParams) score += 10;
  if (paramNum >= 13) score += 5;
  const quantLevel = (model.quantizationLevel || "").toUpperCase();
  if (quantLevel.includes("Q6") || quantLevel.includes("Q8") || quantLevel.includes("F16")) score += 5;
  else if (quantLevel.includes("Q4")) score += 2;

  return score;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export default function LlmManager() {
  const queryClient = useQueryClient();
  const { data: status } = useGetLlmStatus({ query: { refetchInterval: 10000 } as any });
  const { data: config } = useGetLlmConfig();
  const { data: models = [], isLoading: modelsLoading } = useListModels({
    query: { refetchInterval: 20000 } as any,
  });
  const { data: runningModels = [], isLoading: runningLoading } = useListRunningModels({
    query: { refetchInterval: 10000 } as any,
  });
  const pullModel = usePullModel();
  const deleteModel = useDeleteModel();
  const { vps, refreshVps } = useVpsStatus(10000);

  const [pullInput, setPullInput] = useState("");
  const [showPullInput, setShowPullInput] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [unloadingAll, setUnloadingAll] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");

  const modelsArr: any[] = Array.isArray(models) ? models : [];
  const runningArr: any[] = Array.isArray(runningModels) ? runningModels : [];
  const runningNames = new Set(runningArr.map((m: any) => m.name));

  const isOnline = !!(status as any)?.online;
  const serverUrl = (config as any)?.serverUrl || "Not configured";

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/llm/models"] });
    queryClient.invalidateQueries({ queryKey: ["/api/llm/models/running"] });
    queryClient.invalidateQueries({ queryKey: ["/api/llm/status"] });
    refreshVps();
  };

  const handlePull = async () => {
    if (!pullInput.trim()) return;
    setPulling(true);
    setPullStatus(null);
    try {
      const modelName = pullInput.trim();
      await pullModel.mutateAsync({ data: { name: modelName } });
      setPullStatus({ type: "success", message: `Successfully pulled ${modelName}` });
      setPullInput("");
      setShowPullInput(false);
      refreshAll();
    } catch (err: any) {
      setPullStatus({ type: "error", message: err.message || "Pull failed" });
    }
    setPulling(false);
  };

  const handleLoadUnload = async (name: string, unload: boolean) => {
    setLoadingModel(name);
    try {
      const res = await fetch("/api/llm/models/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, keep_alive: unload ? 0 : "5m" }),
      });
      const data = await res.json();
      if (data.success) {
        setPullStatus({ type: "success", message: data.message });
        refreshAll();
      } else {
        setPullStatus({ type: "error", message: data.message || "Operation failed" });
      }
    } catch (err: any) {
      setPullStatus({ type: "error", message: err.message || "Operation failed" });
    }
    setLoadingModel(null);
  };

  const handleDelete = async (name: string) => {
    setDeletingModel(name);
    try {
      await deleteModel.mutateAsync({ name });
      refreshAll();
    } catch (err: any) {
      setPullStatus({ type: "error", message: `Failed to delete ${name}: ${err.message}` });
    }
    setDeletingModel(null);
  };

  const handleUnloadAll = async () => {
    if (runningArr.length === 0) return;
    setUnloadingAll(true);
    const results: string[] = [];
    for (const rm of runningArr) {
      try {
        const res = await fetch("/api/llm/models/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: rm.name, keep_alive: 0 }),
        });
        const data = await res.json();
        if (!data.success) results.push(`${rm.name}: ${data.message}`);
      } catch (err: any) {
        results.push(`${rm.name}: ${err.message}`);
      }
    }
    if (results.length > 0) {
      setPullStatus({ type: "error", message: `Some models failed to unload: ${results.join("; ")}` });
    } else {
      setPullStatus({ type: "success", message: `Unloaded ${runningArr.length} model${runningArr.length > 1 ? "s" : ""} from memory` });
    }
    refreshAll();
    setUnloadingAll(false);
  };

  const resolvedTask = useMemo(() => {
    if (selectedTask) return selectedTask;
    return matchTaskFromQuery(committedQuery);
  }, [selectedTask, committedQuery]);

  const handleRecommend = () => {
    setSelectedTask(null);
    setCommittedQuery(taskQuery);
  };

  const advisorResults = useMemo(() => {
    if (!resolvedTask || modelsArr.length === 0) return [];
    const task = TASK_TYPES.find(t => t.id === resolvedTask);
    if (!task) return [];
    return modelsArr
      .map((m: any) => ({ model: m, score: scoreModel(m, task) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [resolvedTask, modelsArr]);

  const totalSize = modelsArr.reduce((sum: number, m: any) => sum + (m.size || 0), 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Server className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">LLM Manager</h1>
            <p className="text-[10px] text-muted-foreground">Manage Ollama models on your VPS</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {runningArr.length > 0 && (
            <button onClick={handleUnloadAll} disabled={unloadingAll}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-medium bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {unloadingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <PowerOff className="w-3 h-3" />}
              {unloadingAll ? "Unloading..." : `Unload All (${runningArr.length})`}
            </button>
          )}
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-medium",
            isOnline
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              : "text-red-400 bg-red-500/10 border-red-500/20"
          )}>
            {isOnline ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {isOnline ? "Online" : "Offline"}
          </div>
          <button onClick={refreshAll}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Package className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Models</span>
            </div>
            <p className="text-xl font-bold text-white">{modelsArr.length}</p>
          </div>
          <div className={cn(
            "rounded-xl border p-3",
            runningArr.length > 1
              ? "bg-amber-500/[0.04] border-amber-500/20"
              : "bg-white/[0.02] border-white/[0.06]"
          )}>
            <div className="flex items-center gap-2 mb-1.5">
              <Play className={cn("w-3.5 h-3.5", runningArr.length > 1 ? "text-amber-400" : "text-emerald-400")} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Loaded</span>
              {runningArr.length > 1 && (
                <span className="flex items-center gap-1 ml-auto px-1.5 py-0.5 rounded bg-amber-500/15 text-[8px] font-semibold text-amber-400 uppercase">
                  <AlertCircle className="w-2.5 h-2.5" />
                  High CPU Risk
                </span>
              )}
            </div>
            <p className={cn("text-xl font-bold", runningArr.length > 1 ? "text-amber-400" : "text-white")}>{runningArr.length}</p>
          </div>
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Disk Usage</span>
            </div>
            <p className="text-xl font-bold text-white">{formatBytes(totalSize)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">CPU Usage</span>
              {vps && vps.latencyMs !== null && (
                <span className="text-[8px] text-muted-foreground/50 ml-auto">{vps.latencyMs}ms</span>
              )}
            </div>
            {vps === null ? (
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Polling...</span>
              </div>
            ) : vps.cpu !== null ? (
              <CpuGauge value={vps.cpu} />
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">Best Model for Task</h2>
            {(selectedTask || committedQuery) && (
              <button onClick={() => { setSelectedTask(null); setTaskQuery(""); setCommittedQuery(""); }} className="ml-auto text-muted-foreground hover:text-white transition-all">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
            <input
              value={taskQuery}
              onChange={e => { setTaskQuery(e.target.value); }}
              onKeyDown={e => { if (e.key === "Enter" && taskQuery.trim()) handleRecommend(); }}
              placeholder='Describe your task (e.g. "write Python code", "summarize a document")'
              className="flex-1 bg-transparent text-sm text-white placeholder:text-muted-foreground/30 outline-none"
            />
            {resolvedTask && !selectedTask && committedQuery && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-amber-500/15 text-[8px] font-semibold text-amber-400 uppercase">
                {TASK_TYPES.find(t => t.id === resolvedTask)?.label}
              </span>
            )}
            <button onClick={handleRecommend} disabled={!taskQuery.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[10px] font-semibold hover:bg-amber-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0">
              <Sparkles className="w-3 h-3" />
              Recommend
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TASK_TYPES.map(task => {
              const Icon = task.icon;
              const active = selectedTask === task.id || (!selectedTask && resolvedTask === task.id && !!committedQuery);
              return (
                <button key={task.id} onClick={() => { setSelectedTask(selectedTask === task.id ? null : task.id); setTaskQuery(""); setCommittedQuery(""); }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all",
                    active
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                      : "bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:text-white hover:border-white/[0.12]"
                  )}>
                  <Icon className="w-3 h-3" />
                  {task.label}
                </button>
              );
            })}
          </div>
          {resolvedTask && (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
              <p className="text-[10px] text-muted-foreground">
                {TASK_TYPES.find(t => t.id === resolvedTask)?.desc}
              </p>
              {advisorResults.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">No models installed to evaluate.</p>
              ) : (
                <div className="space-y-1.5">
                  {advisorResults.map((r, idx) => {
                    const isTop = idx === 0 && r.score > 0;
                    const isLoaded = runningNames.has(r.model.name);
                    return (
                      <div key={r.model.name} className={cn(
                        "flex items-center gap-3 rounded-lg p-2 border transition-all",
                        isTop
                          ? "bg-amber-500/[0.05] border-amber-500/20"
                          : "bg-white/[0.01] border-white/[0.04]"
                      )}>
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0",
                          isTop ? "bg-amber-500/20 text-amber-400" : "bg-white/[0.06] text-muted-foreground"
                        )}>
                          {isTop ? <Star className="w-2.5 h-2.5" /> : idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-xs font-medium truncate", isTop ? "text-amber-400" : "text-white")}>
                              {r.model.name}
                            </span>
                            {isTop && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-[8px] font-semibold text-amber-400 uppercase flex-shrink-0">
                                Best Pick
                              </span>
                            )}
                            {isLoaded && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-[8px] font-semibold text-emerald-400 uppercase flex-shrink-0">
                                Loaded
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                            <span>{formatBytes(r.model.size || 0)}</span>
                            {r.model.parameterSize && <span>{r.model.parameterSize}</span>}
                            {r.model.family && <span className="text-white/30">{r.model.family}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="flex items-center gap-1">
                            <Zap className={cn("w-3 h-3", r.score >= 50 ? "text-amber-400" : r.score >= 20 ? "text-blue-400" : "text-muted-foreground/40")} />
                            <span className={cn("text-[10px] font-bold tabular-nums", r.score >= 50 ? "text-amber-400" : r.score >= 20 ? "text-blue-400" : "text-muted-foreground/40")}>
                              {r.score}
                            </span>
                          </div>
                          {!isLoaded && (
                            <button onClick={() => handleLoadUnload(r.model.name, false)}
                              disabled={loadingModel === r.model.name}
                              title="Load into memory"
                              className="p-1 rounded-lg hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400 transition-all disabled:opacity-30">
                              {loadingModel === r.model.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {pullStatus && (
          <div className={cn(
            "rounded-xl border p-3 flex items-start gap-2",
            pullStatus.type === "success"
              ? "bg-emerald-500/[0.04] border-emerald-500/20"
              : "bg-red-500/[0.04] border-red-500/20"
          )}>
            {pullStatus.type === "success"
              ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
            <div className="flex-1">
              <p className={cn("text-xs", pullStatus.type === "success" ? "text-emerald-400" : "text-red-400")}>
                {pullStatus.message}
              </p>
            </div>
            <button onClick={() => setPullStatus(null)} className="text-muted-foreground hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {runningArr.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider">Active in Memory</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {runningArr.map((rm: any) => (
                <div key={rm.name} className="rounded-xl bg-emerald-500/[0.03] border border-emerald-500/15 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">{rm.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-[9px] font-semibold text-emerald-400 uppercase">
                      Loaded
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MemoryStick className="w-3 h-3" /> RAM: {formatBytes(rm.size || 0)}
                    </span>
                    {rm.sizeVram > 0 && (
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> VRAM: {formatBytes(rm.sizeVram)}
                      </span>
                    )}
                    {rm.expiresAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> TTL: {timeUntil(rm.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-violet-400" />
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider">All Models</h2>
            </div>
            <button onClick={() => setShowPullInput(!showPullInput)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-400 font-medium hover:bg-violet-500/20 transition-all">
              {showPullInput ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {showPullInput ? "Cancel" : "Pull Model"}
            </button>
          </div>

          {showPullInput && (
            <div className="flex items-center gap-2 rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
              <input
                value={pullInput}
                onChange={e => setPullInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handlePull()}
                placeholder="Model name (e.g., llama3, mistral, deepseek-coder)"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-muted-foreground/40 outline-none"
                autoFocus
                disabled={pulling}
              />
              <button onClick={handlePull} disabled={pulling || !pullInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-400 text-xs font-medium hover:bg-violet-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                {pulling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                {pulling ? "Pulling..." : "Pull"}
              </button>
            </div>
          )}

          {modelsLoading || runningLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : modelsArr.length === 0 ? (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-8 text-center">
              <Package className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-white mb-1">No models installed</p>
              <p className="text-[11px] text-muted-foreground">
                {isOnline
                  ? "Pull a model to get started (e.g., llama3, mistral)"
                  : "Connect to your Ollama server first via the Dashboard"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {modelsArr.map((model: any) => {
                const isRunning = runningNames.has(model.name);
                const isExpanded = expandedModel === model.name;
                const isDeleting = deletingModel === model.name;

                return (
                  <div key={model.name}
                    className={cn(
                      "rounded-xl border transition-all",
                      isRunning
                        ? "bg-emerald-500/[0.02] border-emerald-500/15"
                        : "bg-white/[0.01] border-white/[0.06] hover:border-white/[0.1]"
                    )}>
                    <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                      onClick={() => setExpandedModel(isExpanded ? null : model.name)}>
                      <div className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        isRunning ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-white/20"
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">{model.name}</span>
                          {isRunning && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-[8px] font-semibold text-emerald-400 uppercase flex-shrink-0">
                              In Memory
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-2.5 h-2.5" /> {formatBytes(model.size || 0)}
                          </span>
                          {model.parameterSize && (
                            <span className="flex items-center gap-1">
                              <Cpu className="w-2.5 h-2.5" /> {model.parameterSize}
                            </span>
                          )}
                          {model.family && (
                            <span className="text-white/40">{model.family}</span>
                          )}
                          {model.quantizationLevel && (
                            <span className="text-white/30">{model.quantizationLevel}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isRunning ? (
                          <button onClick={e => { e.stopPropagation(); handleLoadUnload(model.name, true); }}
                            disabled={loadingModel === model.name}
                            title="Unload from memory"
                            className="p-1.5 rounded-lg hover:bg-orange-500/10 text-muted-foreground hover:text-orange-400 transition-all disabled:opacity-30">
                            {loadingModel === model.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PowerOff className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); handleLoadUnload(model.name, false); }}
                            disabled={loadingModel === model.name}
                            title="Load into memory"
                            className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400 transition-all disabled:opacity-30">
                            {loadingModel === model.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); handleDelete(model.name); }}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all disabled:opacity-30">
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-white/[0.04] space-y-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="rounded-lg bg-white/[0.02] p-2">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Size</p>
                            <p className="text-xs text-white font-medium">{formatBytes(model.size || 0)}</p>
                          </div>
                          <div className="rounded-lg bg-white/[0.02] p-2">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Parameters</p>
                            <p className="text-xs text-white font-medium">{model.parameterSize || "—"}</p>
                          </div>
                          <div className="rounded-lg bg-white/[0.02] p-2">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Family</p>
                            <p className="text-xs text-white font-medium">{model.family || "—"}</p>
                          </div>
                          <div className="rounded-lg bg-white/[0.02] p-2">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Quantization</p>
                            <p className="text-xs text-white font-medium">{model.quantizationLevel || "—"}</p>
                          </div>
                        </div>
                        {model.digest && (
                          <div className="rounded-lg bg-white/[0.02] p-2">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Digest</p>
                            <p className="text-[10px] text-white/60 font-mono break-all">{model.digest}</p>
                          </div>
                        )}
                        {model.modifiedAt && (
                          <p className="text-[10px] text-muted-foreground">
                            Last modified: {new Date(model.modifiedAt).toLocaleString()}
                          </p>
                        )}
                        {isRunning && (() => {
                          const rm = runningArr.find((r: any) => r.name === model.name);
                          if (!rm) return null;
                          return (
                            <div className="rounded-lg bg-emerald-500/[0.04] border border-emerald-500/10 p-2">
                              <p className="text-[9px] text-emerald-400 font-medium mb-1">Runtime Info</p>
                              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                                <span>RAM: {formatBytes(rm.size || 0)}</span>
                                {rm.sizeVram > 0 && <span>VRAM: {formatBytes(rm.sizeVram)}</span>}
                                {rm.expiresAt && <span>Unloads in: {timeUntil(rm.expiresAt)}</span>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
