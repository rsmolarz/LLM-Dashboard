import { useState, useEffect } from "react";
import { Trophy, Play, Loader2, Clock, Zap, BarChart3, Star, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const API = import.meta.env.VITE_API_URL || "";

interface BenchmarkResult {
  id: string;
  model: string;
  category: string;
  prompt: string;
  response: string;
  latencyMs: number;
  tokenCount: number;
  score: number | null;
  timestamp: string;
}

interface RunSummary {
  model: string;
  category: string;
  results: BenchmarkResult[];
  summary: {
    totalPrompts: number;
    completed: number;
    failed: number;
    avgLatencyMs: number;
    avgTokens: number;
    tokensPerSec: string;
  };
}

interface HistoryModel {
  model: string;
  runs: number;
  avgLatency: number;
  avgScore: number | null;
  categories: string[];
  lastRun: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-white/10 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-white font-medium">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

export default function Evaluation() {
  const [categories, setCategories] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("general");
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);
  const [history, setHistory] = useState<HistoryModel[]>([]);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/evaluation/categories`).then(r => r.json()).then(d => {
      setCategories(d.categories);
    }).catch(() => {});

    fetch(`${API}/api/llm/models`).then(r => r.json()).then(d => {
      const modelNames = (d.models || d || []).map((m: any) => m.name || m);
      setModels(modelNames);
      if (modelNames.length > 0) setSelectedModel(modelNames[0]);
    }).catch(() => {});

    fetchHistory();
  }, []);

  const fetchHistory = () => {
    fetch(`${API}/api/evaluation/history`).then(r => r.json()).then(d => {
      setHistory(d.models || []);
    }).catch(() => {});
  };

  const runBenchmark = async () => {
    if (!selectedModel || running) return;
    setRunning(true);
    setLastRun(null);
    try {
      const res = await fetch(`${API}/api/evaluation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel, category: selectedCategory }),
      });
      const data = await res.json();
      setLastRun(data);
      fetchHistory();
    } catch (e: any) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  const scoreResult = async (id: string, score: number) => {
    await fetch(`${API}/api/evaluation/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, score }),
    });
    if (lastRun) {
      setLastRun({
        ...lastRun,
        results: lastRun.results.map(r => r.id === id ? { ...r, score } : r),
      });
    }
    fetchHistory();
  };

  const chartData = history.map(h => ({
    model: h.model.length > 12 ? h.model.slice(0, 12) + "..." : h.model,
    "Avg Latency (ms)": Math.round(h.avgLatency),
    "Runs": h.runs,
  }));

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Model Evaluation</h1>
          <p className="text-sm text-muted-foreground">Benchmark and compare LLM model performance</p>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Run Benchmark</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground mb-1 block">Model</label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="w-full text-sm py-2 px-3 rounded-lg bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground mb-1 block">Category</label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full text-sm py-2 px-3 rounded-lg bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {categories.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <button
            onClick={runBenchmark}
            disabled={running || !selectedModel}
            className="px-6 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white font-medium text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Running..." : "Run Benchmark"}
          </button>
        </div>
      </div>

      {lastRun && (
        <div className="glass-panel rounded-xl border border-white/5 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Results: {lastRun.model} — {lastRun.category}
            </h3>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{lastRun.summary.avgLatencyMs}ms avg</span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{lastRun.summary.tokensPerSec} tok/s</span>
              <span>{lastRun.summary.completed}/{lastRun.summary.totalPrompts} completed</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-white/5">
              <div className="text-xl font-bold text-white">{lastRun.summary.avgLatencyMs}</div>
              <div className="text-[10px] text-muted-foreground">Avg Latency (ms)</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-white/5">
              <div className="text-xl font-bold text-cyan-400">{lastRun.summary.tokensPerSec}</div>
              <div className="text-[10px] text-muted-foreground">Tokens/sec</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-white/5">
              <div className="text-xl font-bold text-green-400">{lastRun.summary.completed}</div>
              <div className="text-[10px] text-muted-foreground">Completed</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-white/5">
              <div className="text-xl font-bold text-white">{lastRun.summary.avgTokens}</div>
              <div className="text-[10px] text-muted-foreground">Avg Tokens</div>
            </div>
          </div>

          <div className="space-y-2">
            {lastRun.results.map((r) => (
              <div key={r.id} className="rounded-lg border border-white/5 bg-white/[0.02]">
                <button
                  onClick={() => setExpandedResult(expandedResult === r.id ? null : r.id)}
                  className="w-full flex items-center justify-between p-3 text-left"
                >
                  <div className="flex-1">
                    <p className="text-xs text-white truncate pr-4">{r.prompt}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span>{r.latencyMs}ms</span>
                      <span>{r.tokenCount} tokens</span>
                      {r.score != null && <span className="text-amber-400">{r.score}/10</span>}
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedResult === r.id ? "rotate-180" : ""}`} />
                </button>
                {expandedResult === r.id && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="p-3 rounded-lg bg-white/5 text-xs text-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {r.response}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Score:</span>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                        <button
                          key={s}
                          onClick={() => scoreResult(r.id, s)}
                          className={`w-6 h-6 rounded text-[10px] font-medium transition-colors ${
                            r.score === s ? "bg-amber-500 text-white" : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-panel rounded-xl border border-white/5 p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Model Comparison
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="model" tick={{ fontSize: 10, fill: "#888" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Avg Latency (ms)" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel rounded-xl border border-white/5 p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" />
              Benchmark History
            </h3>
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.model} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <div>
                    <div className="text-xs text-white font-medium">{h.model}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {h.runs} runs · {h.categories.join(", ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-cyan-400">{Math.round(h.avgLatency)}ms</div>
                    {h.avgScore != null && <div className="text-[10px] text-amber-400">{h.avgScore.toFixed(1)}/10</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
