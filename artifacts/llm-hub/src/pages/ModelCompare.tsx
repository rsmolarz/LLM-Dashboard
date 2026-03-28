import { useState, useEffect } from "react";
import { GitCompareArrows, Play, Star, Loader2, Clock, Zap, History } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface CompareResponse {
  model: string;
  content: string;
  tokensUsed: number;
  latencyMs: number;
  rating: number | null;
}

interface CompareResult {
  id: string;
  prompt: string;
  responses: CompareResponse[];
  createdAt: number;
}

export default function ModelCompare() {
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [history, setHistory] = useState<CompareResult[]>([]);
  const [tab, setTab] = useState<"compare" | "history">("compare");

  useEffect(() => {
    fetch(`${API}/llm/status`).then(r => r.json()).then(d => {
      if (d.models) {
        const names = d.models.map((m: any) => m.name || m);
        setModels(names);
        if (names.length >= 2) setSelected(names.slice(0, 2));
      }
    }).catch(() => {});
    fetch(`${API}/model-compare/history`).then(r => r.json()).then(setHistory).catch(() => {});
  }, []);

  const toggleModel = (m: string) => {
    setSelected(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const runCompare = async () => {
    if (!prompt.trim() || selected.length < 2) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch(`${API}/model-compare/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, models: selected }),
      });
      const data = await r.json();
      setResult(data);
      setHistory(prev => [data, ...prev]);
    } catch {}
    setRunning(false);
  };

  const rateResponse = async (cmpId: string, model: string, rating: number) => {
    await fetch(`${API}/model-compare/${cmpId}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, rating }),
    });
    if (result && result.id === cmpId) {
      setResult({ ...result, responses: result.responses.map(r => r.model === model ? { ...r, rating } : r) });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <GitCompareArrows className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Model Compare</h1>
            <p className="text-xs text-muted-foreground">Side-by-side model responses</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab("compare")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === "compare" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-muted-foreground hover:text-white bg-white/5"}`}>
            <GitCompareArrows className="w-3.5 h-3.5 inline mr-1" />Compare
          </button>
          <button onClick={() => setTab("history")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === "history" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-muted-foreground hover:text-white bg-white/5"}`}>
            <History className="w-3.5 h-3.5 inline mr-1" />History ({history.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {tab === "compare" && (
          <>
            <div className="glass-panel rounded-xl p-4 border border-white/5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Select Models ({selected.length} selected)</h3>
              <div className="flex flex-wrap gap-2">
                {models.map(m => (
                  <button key={m} onClick={() => toggleModel(m)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selected.includes(m) ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-white/5 text-muted-foreground border border-white/10 hover:border-white/20"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-xl p-4 border border-white/5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Prompt</h3>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter your prompt to compare across models..." rows={4} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-500/50 resize-none" />
              <button onClick={runCompare} disabled={running || !prompt.trim() || selected.length < 2} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 text-white text-xs font-medium hover:bg-cyan-600 disabled:opacity-50">
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {running ? "Comparing..." : "Run Comparison"}
              </button>
            </div>

            {result && <ResponseGrid result={result} onRate={rateResponse} />}
          </>
        )}

        {tab === "history" && (
          history.length === 0 ? (
            <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
              <History className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-white mb-1">No Comparisons Yet</h3>
              <p className="text-xs text-muted-foreground">Run a comparison to see results here.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {history.map(h => (
                <div key={h.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</span>
                    <span className="text-xs text-white font-medium ml-2 line-clamp-1 flex-1">{h.prompt}</span>
                  </div>
                  <ResponseGrid result={h} onRate={rateResponse} />
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function ResponseGrid({ result, onRate }: { result: CompareResult; onRate: (id: string, model: string, rating: number) => void }) {
  const fastest = Math.min(...result.responses.map(r => r.latencyMs));

  return (
    <div className={`grid gap-4 ${result.responses.length === 2 ? "grid-cols-1 md:grid-cols-2" : result.responses.length === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"}`}>
      {result.responses.map(r => (
        <div key={r.model} className={`glass-panel rounded-xl p-4 border ${r.latencyMs === fastest ? "border-cyan-500/30" : "border-white/5"}`}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">{r.model}</h4>
            {r.latencyMs === fastest && <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">Fastest</span>}
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />{(r.latencyMs / 1000).toFixed(1)}s
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Zap className="w-3 h-3" />{r.tokensUsed} tokens
            </div>
          </div>
          <div className="text-xs text-white/80 bg-white/5 rounded-lg p-3 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono">{r.content}</div>
          <div className="flex items-center gap-1 mt-3">
            <span className="text-[10px] text-muted-foreground mr-1">Rate:</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => onRate(result.id, r.model, n)} className="p-0.5">
                <Star className={`w-3.5 h-3.5 ${r.rating && n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground hover:text-amber-300"}`} />
              </button>
            ))}
            {r.rating && <span className="text-[10px] text-amber-300 ml-1">{r.rating}/5</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
