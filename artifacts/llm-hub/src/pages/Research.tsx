import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Zap,
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Brain,
  Server,
  Cloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModelResult {
  model: string;
  provider: string;
  response: string;
  durationMs: number;
  error?: string;
  status: "pending" | "running" | "complete" | "error";
}

interface ResearchState {
  status: "idle" | "running" | "synthesizing" | "complete";
  mode: "deep" | "extensive";
  prompt: string;
  models: ModelResult[];
  synthesis: string;
}

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

export default function Research() {
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [mode, setMode] = useState<"deep" | "extensive">("deep");
  const [research, setResearch] = useState<ResearchState>({
    status: "idle",
    mode: "deep",
    prompt: "",
    models: [],
    synthesis: "",
  });
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const { data: modelsInfo } = useQuery({
    queryKey: ["/api/research/models"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/research/models`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const toggleModel = useCallback((model: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }, []);

  const runResearch = useCallback(async () => {
    if (!prompt.trim()) return;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setResearch({
      status: "running",
      mode,
      prompt,
      models: [],
      synthesis: "",
    });
    setExpandedModels(new Set());

    try {
      const res = await fetch(`${API_BASE}/research/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode,
          ...(systemPrompt.trim() ? { systemPrompt } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        setResearch((prev) => ({ ...prev, status: "complete", synthesis: "Request failed." }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
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
            const event = JSON.parse(line.slice(6));

            if (event.type === "model_start") {
              setResearch((prev) => ({
                ...prev,
                models: [
                  ...prev.models,
                  {
                    model: event.model,
                    provider: event.provider,
                    response: "",
                    durationMs: 0,
                    status: "running",
                  },
                ],
              }));
            } else if (event.type === "model_complete") {
              setResearch((prev) => ({
                ...prev,
                models: prev.models.map((m) =>
                  m.model === event.model
                    ? {
                        ...m,
                        response: event.response,
                        durationMs: event.durationMs,
                        status: "complete" as const,
                      }
                    : m
                ),
              }));
            } else if (event.type === "model_error") {
              setResearch((prev) => ({
                ...prev,
                models: prev.models.map((m) =>
                  m.model === event.model
                    ? {
                        ...m,
                        error: event.error,
                        durationMs: event.durationMs,
                        status: "error" as const,
                      }
                    : m
                ),
              }));
            } else if (event.type === "synthesis_start") {
              setResearch((prev) => ({ ...prev, status: "synthesizing" }));
            } else if (event.type === "synthesis_complete") {
              setResearch((prev) => ({
                ...prev,
                synthesis: event.synthesis,
                status: "complete",
              }));
            } else if (event.type === "done") {
              setResearch((prev) => ({ ...prev, status: "complete" }));
            }
          } catch {
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setResearch((prev) => ({
          ...prev,
          status: "complete",
          synthesis: `Error: ${err?.message ?? "Unknown error"}`,
        }));
      }
    }
  }, [prompt, mode, systemPrompt]);

  const cancelResearch = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setResearch((prev) => ({ ...prev, status: "complete" }));
  }, []);

  const ollamaCount = modelsInfo?.ollama?.length ?? 0;
  const totalExtensive = ollamaCount + (modelsInfo?.cloudAvailable?.openai ? 1 : 0) + (modelsInfo?.cloudAvailable?.anthropic ? 1 : 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-3xl font-display font-bold text-white mb-2">
          Deep Research
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          Fan out your prompt across multiple AI models for comprehensive, multi-perspective analysis.
        </p>

        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setMode("deep")}
            className={cn(
              "flex-1 p-4 rounded-xl border transition-all text-left",
              mode === "deep"
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-white text-sm">Deep Research</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {ollamaCount} local models in parallel
            </p>
          </button>

          <button
            onClick={() => setMode("extensive")}
            className={cn(
              "flex-1 p-4 rounded-xl border transition-all text-left",
              mode === "extensive"
                ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-white text-sm">Extensive Research</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {totalExtensive} models (local + Claude + GPT)
            </p>
          </button>
        </div>

        <div className="space-y-2 mb-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your research prompt... (e.g., 'Analyze the current state of mRNA vaccine technology for ENT conditions')"
            className="w-full h-28 p-4 rounded-xl bg-black/40 border border-white/10 text-white placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/50 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                runResearch();
              }
            }}
          />

          <button
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            className="text-xs text-muted-foreground hover:text-white flex items-center gap-1 transition-colors"
          >
            {showSystemPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            System prompt (optional)
          </button>

          {showSystemPrompt && (
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Optional system prompt to guide all models..."
              className="w-full h-16 p-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/50 text-xs"
            />
          )}

          <div className="flex items-center gap-3">
            {research.status === "running" || research.status === "synthesizing" ? (
              <Button onClick={cancelResearch} variant="destructive" className="gap-2">
                <XCircle className="w-4 h-4" />
                Cancel
              </Button>
            ) : (
              <Button
                onClick={runResearch}
                disabled={!prompt.trim()}
                className="gap-2"
                variant={mode === "extensive" ? "glow" : "default"}
              >
                {mode === "deep" ? (
                  <Zap className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {mode === "deep" ? "Run Deep Research" : "Run Extensive Research"}
              </Button>
            )}

            <span className="text-xs text-muted-foreground">
              {mode === "deep"
                ? `Querying ${ollamaCount} local models`
                : `Querying ${totalExtensive} models across local + cloud`}
              {" "}· Ctrl+Enter to run
            </span>
          </div>
        </div>
      </div>

      {research.status !== "idle" && (
        <div className="flex-1 p-6 pt-2 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-semibold text-white">Model Responses</h2>
            {research.status === "running" && (
              <span className="flex items-center gap-1 text-xs text-cyan-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Querying models...
              </span>
            )}
            {research.status === "synthesizing" && (
              <span className="flex items-center gap-1 text-xs text-purple-400">
                <Brain className="w-3 h-3 animate-pulse" />
                Synthesizing results...
              </span>
            )}
            {research.status === "complete" && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="w-3 h-3" />
                Complete
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {research.models.map((model) => (
              <div
                key={model.model}
                className={cn(
                  "rounded-xl border p-3 transition-all cursor-pointer",
                  model.status === "running"
                    ? "border-cyan-500/30 bg-cyan-500/5"
                    : model.status === "error"
                    ? "border-red-500/30 bg-red-500/5"
                    : model.status === "complete"
                    ? "border-white/10 bg-white/5"
                    : "border-white/5 bg-white/[0.02]"
                )}
                onClick={() => model.status === "complete" && toggleModel(model.model)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {model.provider === "ollama" ? (
                      <Server className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5 text-purple-400" />
                    )}
                    <span className="text-sm font-medium text-white truncate">
                      {model.model}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {model.status === "running" && (
                      <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    )}
                    {model.status === "complete" && (
                      <>
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {(model.durationMs / 1000).toFixed(1)}s
                        </span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      </>
                    )}
                    {model.status === "error" && (
                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </div>
                </div>

                {model.status === "running" && (
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-cyan-500/50 rounded-full animate-pulse w-2/3" />
                  </div>
                )}

                {model.status === "error" && (
                  <p className="text-xs text-red-400 mt-1">{model.error}</p>
                )}

                {model.status === "complete" && model.response && (
                  <>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {model.response.slice(0, 150)}...
                    </p>
                    {expandedModels.has(model.model) && (
                      <div className="mt-2 p-3 rounded-lg bg-black/40 border border-white/5 max-h-64 overflow-y-auto">
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                          {model.response}
                        </pre>
                      </div>
                    )}
                    <button className="text-xs text-primary mt-1 hover:underline">
                      {expandedModels.has(model.model)
                        ? "Collapse"
                        : "Expand full response"}
                    </button>
                  </>
                )}

                <div className="mt-1">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full",
                      model.provider === "ollama"
                        ? "bg-cyan-500/10 text-cyan-400"
                        : model.provider === "openai"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-purple-500/10 text-purple-400"
                    )}
                  >
                    {model.provider}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {(research.status === "synthesizing" || research.synthesis) && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                <h2 className="text-lg font-semibold text-white">
                  Synthesized Analysis
                </h2>
                {research.status === "synthesizing" && (
                  <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                )}
              </div>
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5">
                {research.synthesis ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-gray-200 font-sans leading-relaxed">
                      {research.synthesis}
                    </pre>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-yellow-400/70">
                    <Brain className="w-4 h-4 animate-pulse" />
                    Analyzing and cross-referencing all model responses...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {research.status === "idle" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              Multi-Model Research Engine
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Enter a research prompt above. Your question will be sent to{" "}
              {mode === "deep"
                ? `all ${ollamaCount} local Ollama models`
                : `${totalExtensive} models (local + cloud)`}{" "}
              simultaneously. Results are synthesized into a comprehensive analysis
              highlighting agreements, unique insights, and contradictions.
            </p>
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <Zap className="w-4 h-4 text-cyan-400 mb-1" />
                <p className="text-xs font-medium text-white">Deep Research</p>
                <p className="text-[10px] text-muted-foreground">
                  Local models only. Free. Good for quick multi-perspective analysis.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <Globe className="w-4 h-4 text-purple-400 mb-1" />
                <p className="text-xs font-medium text-white">Extensive Research</p>
                <p className="text-[10px] text-muted-foreground">
                  Local + Claude + GPT. Uses credits. Maximum coverage and quality.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
