import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, Zap, RefreshCw, Play, Pause, Loader2,
  CheckCircle2, XCircle, AlertCircle, BarChart3,
  Brain, Cpu, Download, Sparkles, ThumbsUp, ThumbsDown,
  Timer, Target, FlaskConical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface EvolutionStatus {
  schedulerRunning: boolean;
  lastRun: string | null;
  benchmarkHistory: Array<{
    id: string;
    model: string;
    timestamp: string;
    averageScore: number;
    averageResponseTime: number;
  }>;
  syntheticDataLog: Array<{
    timestamp: string;
    model: string;
    category: string;
    pairsGenerated: number;
    provider: string;
  }>;
  feedbackLog: Array<{
    timestamp: string;
    highRated: number;
    lowRated: number;
    improvementAreas: string[];
  }>;
  updateChecks: Array<{
    model: string;
    currentDigest: string;
    latestAvailable: boolean;
    checkedAt: string;
  }>;
  vpsStats: {
    syntheticPairs: number;
    feedbackPairs: number;
    totalBenchmarks: number;
    recentBenchmarks: Array<{ model: string; average_score: number; created_at: string }>;
  };
}

interface BenchmarkResult {
  id: string;
  model: string;
  timestamp: string;
  scores: Array<{
    category: string;
    question: string;
    score: number;
    responseTime: number;
    response: string;
  }>;
  averageScore: number;
  averageResponseTime: number;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ModelEvolutionPanel() {
  const [status, setStatus] = useState<EvolutionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"benchmark" | "synthetic" | "feedback" | "updates">("benchmark");
  const [benchmarkModel, setBenchmarkModel] = useState("qwen2.5:7b");
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [syntheticCategory, setSyntheticCategory] = useState("general");
  const [syntheticProvider, setSyntheticProvider] = useState("openai");
  const [syntheticCount, setSyntheticCount] = useState(5);
  const [syntheticRunning, setSyntheticRunning] = useState(false);
  const [feedbackRunning, setFeedbackRunning] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<any>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [schedulerToggling, setSchedulerToggling] = useState(false);
  const [models, setModels] = useState<string[]>([]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/model-evolution/status`);
      if (res.ok) setStatus(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/llm/models`);
      if (res.ok) {
        const data = await res.json();
        setModels((data.models || data || []).map((m: any) => m.name || m));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchModels();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchModels]);

  const runBenchmark = async () => {
    setBenchmarkRunning(true);
    setBenchmarkResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/model-evolution/benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: benchmarkModel }),
      });
      if (res.ok) {
        const data = await res.json();
        setBenchmarkResult(data);
        fetchStatus();
      }
    } catch {} finally {
      setBenchmarkRunning(false);
    }
  };

  const generateSynthetic = async () => {
    setSyntheticRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/model-evolution/generate-synthetic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: syntheticCategory, count: syntheticCount, provider: syntheticProvider }),
      });
      if (res.ok) fetchStatus();
    } catch {} finally {
      setSyntheticRunning(false);
    }
  };

  const harvestFeedback = async () => {
    setFeedbackRunning(true);
    setFeedbackResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/model-evolution/harvest-feedback`, { method: "POST" });
      if (res.ok) {
        setFeedbackResult(await res.json());
        fetchStatus();
      }
    } catch {} finally {
      setFeedbackRunning(false);
    }
  };

  const checkUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const res = await fetch(`${API_BASE}/api/model-evolution/check-updates`, { method: "POST" });
      if (res.ok) fetchStatus();
    } catch {} finally {
      setCheckingUpdates(false);
    }
  };

  const pullUpdate = async (model: string) => {
    setPullingModel(model);
    try {
      await fetch(`${API_BASE}/api/model-evolution/pull-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      fetchStatus();
    } catch {} finally {
      setPullingModel(null);
    }
  };

  const toggleScheduler = async () => {
    setSchedulerToggling(true);
    try {
      const endpoint = status?.schedulerRunning ? "stop-scheduler" : "start-scheduler";
      await fetch(`${API_BASE}/api/model-evolution/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalHours: 6 }),
      });
      fetchStatus();
    } catch {} finally {
      setSchedulerToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const tabs = [
    { id: "benchmark" as const, label: "Benchmarks", icon: BarChart3 },
    { id: "synthetic" as const, label: "Synthetic Data", icon: Sparkles },
    { id: "feedback" as const, label: "Feedback Loop", icon: ThumbsUp },
    { id: "updates" as const, label: "Model Updates", icon: Download },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-white">Model Evolution Engine</h3>
          <span className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
            status?.schedulerRunning
              ? "bg-green-500/20 text-green-400 border-green-500/30"
              : "bg-white/5 text-muted-foreground border-white/10"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", status?.schedulerRunning ? "bg-green-500 animate-pulse" : "bg-gray-500")} />
            {status?.schedulerRunning ? "Auto-Evolving" : "Manual"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={status?.schedulerRunning ? "destructive" : "default"}
            size="sm"
            onClick={toggleScheduler}
            disabled={schedulerToggling}
            className="gap-1.5 text-xs"
          >
            {schedulerToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
              status?.schedulerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {status?.schedulerRunning ? "Stop Auto" : "Start Auto (6h)"}
          </Button>
        </div>
      </div>

      {status?.vpsStats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Benchmarks Run</p>
            <p className="text-lg font-bold text-white">{status.vpsStats.totalBenchmarks}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Synthetic Pairs</p>
            <p className="text-lg font-bold text-white">{status.vpsStats.syntheticPairs}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Feedback Pairs</p>
            <p className="text-lg font-bold text-white">{status.vpsStats.feedbackPairs}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Last Auto-Run</p>
            <p className="text-lg font-bold text-white">{formatTimeAgo(status.lastRun)}</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-white/10 pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-medium transition-colors",
              activeTab === tab.id ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "benchmark" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={benchmarkModel}
              onChange={e => setBenchmarkModel(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white flex-1"
            >
              {models.map(m => <option key={m} value={m}>{m}</option>)}
              {models.length === 0 && <option value="qwen2.5:7b">qwen2.5:7b</option>}
            </select>
            <Button onClick={runBenchmark} disabled={benchmarkRunning} className="gap-1.5">
              {benchmarkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
              {benchmarkRunning ? "Testing..." : "Run Benchmark"}
            </Button>
          </div>

          {benchmarkRunning && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Running 10 test questions across reasoning, coding, medical, general, and analysis categories...
              </div>
            </div>
          )}

          {benchmarkResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 bg-white/5 rounded-lg p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Overall Score</p>
                  <p className={cn("text-3xl font-bold", benchmarkResult.averageScore >= 70 ? "text-green-400" : benchmarkResult.averageScore >= 40 ? "text-yellow-400" : "text-red-400")}>
                    {benchmarkResult.averageScore}/100
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Response Time</p>
                  <p className="text-xl font-bold text-white">{(benchmarkResult.averageResponseTime / 1000).toFixed(1)}s</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Model</p>
                  <p className="text-sm font-medium text-white">{benchmarkResult.model}</p>
                </div>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {benchmarkResult.scores.map((s, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-primary uppercase">{s.category}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Timer className="w-3 h-3" />{(s.responseTime / 1000).toFixed(1)}s</span>
                        <span className={cn("text-sm font-bold", s.score >= 70 ? "text-green-400" : s.score >= 40 ? "text-yellow-400" : "text-red-400")}>
                          {s.score}/100
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-white mb-1">{s.question}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.response}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {status?.vpsStats?.recentBenchmarks && status.vpsStats.recentBenchmarks.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Benchmark History</p>
              <div className="space-y-1">
                {status.vpsStats.recentBenchmarks.map((b, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-xs">
                    <span className="text-white">{b.model}</span>
                    <div className="flex items-center gap-3">
                      <span className={cn("font-bold", b.average_score >= 70 ? "text-green-400" : b.average_score >= 40 ? "text-yellow-400" : "text-red-400")}>
                        {Math.round(b.average_score)}/100
                      </span>
                      <span className="text-muted-foreground">{formatTimeAgo(b.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "synthetic" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate high-quality training data using cloud AI models (GPT/Claude) to teach your local models new skills.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <select
                value={syntheticCategory}
                onChange={e => setSyntheticCategory(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="general">General Knowledge</option>
                <option value="medical">Medical / ENT</option>
                <option value="coding">Coding</option>
                <option value="finance">Finance</option>
                <option value="reasoning">Reasoning</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
              <select
                value={syntheticProvider}
                onChange={e => setSyntheticProvider(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="openai">OpenAI (GPT-5.2)</option>
                <option value="anthropic">Anthropic (Claude)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Count</label>
              <select
                value={syntheticCount}
                onChange={e => setSyntheticCount(parseInt(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                {[3, 5, 10, 15, 20].map(n => <option key={n} value={n}>{n} pairs</option>)}
              </select>
            </div>
          </div>

          <Button onClick={generateSynthetic} disabled={syntheticRunning} className="gap-1.5">
            {syntheticRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {syntheticRunning ? "Generating..." : "Generate Training Data"}
          </Button>

          {status?.syntheticDataLog && status.syntheticDataLog.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Generation History</p>
              <div className="space-y-1">
                {status.syntheticDataLog.map((log, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-yellow-400" />
                      <span className="text-white">{log.category}</span>
                      <span className="text-muted-foreground">via {log.provider}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-green-400 font-medium">{log.pairsGenerated} pairs</span>
                      <span className="text-muted-foreground">{formatTimeAgo(log.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "feedback" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Harvest rated chat conversations to create training data. High-rated responses become examples to learn from.
            Low-rated responses identify areas needing improvement.
          </p>

          <Button onClick={harvestFeedback} disabled={feedbackRunning} className="gap-1.5">
            {feedbackRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
            {feedbackRunning ? "Harvesting..." : "Harvest Feedback"}
          </Button>

          {feedbackResult && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <p className="text-xs text-green-400">High-Rated Pairs</p>
                <p className="text-2xl font-bold text-green-400">{feedbackResult.highRated}</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-xs text-red-400">Needs Improvement</p>
                <p className="text-2xl font-bold text-red-400">{feedbackResult.lowRated}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Improvement Areas</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {feedbackResult.improvementAreas.length > 0
                    ? feedbackResult.improvementAreas.map((a: string) => (
                        <span key={a} className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">{a}</span>
                      ))
                    : <span className="text-xs text-muted-foreground">None detected</span>
                  }
                </div>
              </div>
            </div>
          )}

          {status?.feedbackLog && status.feedbackLog.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Feedback History</p>
              <div className="space-y-1">
                {status.feedbackLog.map((log, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-3">
                      <ThumbsUp className="w-3 h-3 text-green-400" />
                      <span className="text-green-400">{log.highRated} good</span>
                      <ThumbsDown className="w-3 h-3 text-red-400" />
                      <span className="text-red-400">{log.lowRated} weak</span>
                    </div>
                    <span className="text-muted-foreground">{formatTimeAgo(log.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "updates" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Check for newer versions of installed models and pull updates to keep models current.
          </p>

          <Button onClick={checkUpdates} disabled={checkingUpdates} className="gap-1.5">
            {checkingUpdates ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {checkingUpdates ? "Checking..." : "Check for Updates"}
          </Button>

          {status?.updateChecks && status.updateChecks.length > 0 && (
            <div className="space-y-2">
              {status.updateChecks.map((check) => (
                <div key={check.model} className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    <div>
                      <p className="text-sm font-medium text-white">{check.model}</p>
                      <p className="text-xs text-muted-foreground">Digest: {check.currentDigest}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pullUpdate(check.model)}
                    disabled={pullingModel === check.model}
                    className="gap-1.5 text-xs"
                  >
                    {pullingModel === check.model ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {pullingModel === check.model ? "Pulling..." : "Pull Latest"}
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Last checked: {formatTimeAgo(status.updateChecks[0]?.checkedAt)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
