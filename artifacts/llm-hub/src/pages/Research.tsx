import { useState, useRef, useCallback, useEffect } from "react";
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
  Save,
  History,
  MessageSquare,
  Send,
  Trash2,
  Quote,
  X,
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

interface ResearchSession {
  id: string;
  prompt: string;
  mode: string;
  synthesis: string;
  modelCount: number;
  createdAt: string;
  followUps: Array<{ question: string; answer: string; timestamp: string }>;
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
  const [showSessions, setShowSessions] = useState(false);
  const [activeSession, setActiveSession] = useState<ResearchSession | null>(null);
  const [followUpQ, setFollowUpQ] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const { data: modelsInfo } = useQuery({
    queryKey: ["/api/research/models"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/research/models`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ["/api/research/sessions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/research/sessions`);
      const data = await res.json();
      return data.sessions || [];
    },
    refetchInterval: 10000,
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
    setActiveSession(null);

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
                    ? { ...m, response: event.response, durationMs: event.durationMs, status: "complete" as const }
                    : m
                ),
              }));
            } else if (event.type === "model_error") {
              setResearch((prev) => ({
                ...prev,
                models: prev.models.map((m) =>
                  m.model === event.model
                    ? { ...m, error: event.error, durationMs: event.durationMs, status: "error" as const }
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

  const saveSession = async () => {
    if (!research.synthesis || !research.prompt) return;
    try {
      const res = await fetch(`${API_BASE}/research/save-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: research.prompt,
          mode: research.mode,
          synthesis: research.synthesis,
          modelCount: research.models.length,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveSession(data.session);
        setSavedMsg("Session saved!");
        setTimeout(() => setSavedMsg(""), 2000);
        refetchSessions();
      }
    } catch {}
  };

  const askFollowUp = async () => {
    if (!activeSession || !followUpQ.trim()) return;
    setFollowUpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/research/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSession.id,
          question: followUpQ,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveSession((s) =>
          s
            ? {
                ...s,
                followUps: [
                  ...s.followUps,
                  { question: followUpQ, answer: data.answer, timestamp: new Date().toISOString() },
                ],
              }
            : s
        );
        setFollowUpQ("");
        refetchSessions();
      }
    } catch {}
    setFollowUpLoading(false);
  };

  const deleteSession = async (id: string) => {
    await fetch(`${API_BASE}/research/sessions/${id}`, { method: "DELETE" });
    if (activeSession?.id === id) setActiveSession(null);
    refetchSessions();
  };

  const loadSession = (session: ResearchSession) => {
    setActiveSession(session);
    setPrompt(session.prompt);
    setMode(session.mode as "deep" | "extensive");
    setResearch({
      status: "complete",
      mode: session.mode as "deep" | "extensive",
      prompt: session.prompt,
      models: [],
      synthesis: session.synthesis,
    });
    setShowSessions(false);
  };

  const extractCitations = (text: string) => {
    const parts: Array<{ type: "text" | "citation"; content: string }> = [];
    const regex = /\[([^\]]+)\]/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      parts.push({ type: "citation", content: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push({ type: "text", content: text.slice(lastIndex) });
    }
    return parts;
  };

  const ollamaCount = modelsInfo?.ollama?.length ?? 0;
  const totalExtensive = ollamaCount + (modelsInfo?.cloudAvailable?.openai ? 1 : 0) + (modelsInfo?.cloudAvailable?.anthropic ? 1 : 0);

  return (
    <div className="flex h-full overflow-hidden">
      {showSessions && (
        <div className="w-72 border-r border-white/10 bg-black/30 overflow-y-auto shrink-0">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Saved Sessions
            </h3>
            <button onClick={() => setShowSessions(false)} className="text-muted-foreground hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          {(sessions as ResearchSession[]).length === 0 ? (
            <div className="p-6 text-center">
              <History className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No saved sessions yet</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {(sessions as ResearchSession[]).map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "p-3 rounded-lg cursor-pointer transition-all group",
                    activeSession?.id === s.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-white/5 border border-transparent"
                  )}
                  onClick={() => loadSession(s)}
                >
                  <p className="text-xs text-white line-clamp-2 mb-1">{s.prompt}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded",
                        s.mode === "extensive" ? "bg-purple-500/20 text-purple-400" : "bg-cyan-500/20 text-cyan-400"
                      )}>
                        {s.mode}
                      </span>
                      <span>{s.followUps?.length || 0} follow-ups</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-display font-bold text-white mb-2">
                Deep Research
              </h1>
              <p className="text-muted-foreground text-sm">
                Fan out your prompt across multiple AI models for comprehensive, multi-perspective analysis.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSessions(!showSessions)}
                className="text-muted-foreground hover:text-white gap-1.5"
              >
                <History className="w-4 h-4" />
                Sessions ({(sessions as ResearchSession[]).length})
              </Button>
            </div>
          </div>

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

            {research.models.length > 0 && (
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
            )}

            {(research.status === "synthesizing" || research.synthesis) && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-400" />
                    <h2 className="text-lg font-semibold text-white">
                      Synthesized Analysis
                    </h2>
                    {research.status === "synthesizing" && (
                      <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                    )}
                  </div>
                  {research.status === "complete" && research.synthesis && (
                    <div className="flex items-center gap-2">
                      {savedMsg && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {savedMsg}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={saveSession}
                        className="text-muted-foreground hover:text-white gap-1.5 text-xs"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save Session
                      </Button>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5">
                  {research.synthesis ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <div className="whitespace-pre-wrap text-sm text-gray-200 font-sans leading-relaxed">
                        {extractCitations(research.synthesis).map((part, i) =>
                          part.type === "citation" ? (
                            <span
                              key={i}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium mx-0.5"
                            >
                              <Quote className="w-2.5 h-2.5" />
                              {part.content}
                            </span>
                          ) : (
                            <span key={i}>{part.content}</span>
                          )
                        )}
                      </div>
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

            {activeSession && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-semibold text-white">Follow-up Questions</h2>
                  <span className="text-xs text-muted-foreground">
                    ({activeSession.followUps?.length || 0} asked)
                  </span>
                </div>

                {activeSession.followUps?.length > 0 && (
                  <div className="space-y-3">
                    {activeSession.followUps.map((fu, i) => (
                      <div key={i} className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                        <div className="flex items-start gap-2 mb-2">
                          <MessageSquare className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                          <p className="text-sm font-medium text-blue-300">{fu.question}</p>
                        </div>
                        <div className="ml-5.5 pl-4 border-l border-blue-500/20">
                          <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">
                            {fu.answer}
                          </pre>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2 ml-5.5">
                          {new Date(fu.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    value={followUpQ}
                    onChange={(e) => setFollowUpQ(e.target.value)}
                    placeholder="Ask a follow-up question about this research..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-blue-500/50"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        askFollowUp();
                      }
                    }}
                  />
                  <Button
                    onClick={askFollowUp}
                    disabled={followUpLoading || !followUpQ.trim()}
                    className="gap-1.5"
                  >
                    {followUpLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Ask
                  </Button>
                </div>
              </div>
            )}

            {research.status === "complete" && research.models.length > 0 && (
              <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Quote className="w-4 h-4" />
                  Source Models Referenced
                </h3>
                <div className="flex flex-wrap gap-2">
                  {research.models
                    .filter((m) => m.status === "complete")
                    .map((m) => (
                      <div
                        key={m.model}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10"
                      >
                        {m.provider === "ollama" ? (
                          <Server className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <Cloud className="w-3 h-3 text-purple-400" />
                        )}
                        <span className="text-xs text-white">{m.model}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {(m.durationMs / 1000).toFixed(1)}s
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          · {m.response.length.toLocaleString()} chars
                        </span>
                      </div>
                    ))}
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

              {(sessions as ResearchSession[]).length > 0 && (
                <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-xs text-muted-foreground mb-2">
                    You have {(sessions as ResearchSession[]).length} saved research session(s)
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowSessions(true)}
                    className="gap-1.5 text-xs"
                  >
                    <History className="w-3.5 h-3.5" />
                    View Sessions
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
