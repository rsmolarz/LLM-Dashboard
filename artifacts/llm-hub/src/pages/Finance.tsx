import { useState, useEffect } from "react";
import { TrendingUp, Briefcase, BarChart3, Brain, BookOpen, DollarSign, Loader2, Plus, Trash2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

type Tab = "screener" | "portfolio" | "sentiment" | "journal" | "earnings" | "performance";

const TABS: { id: Tab; label: string; icon: any; desc: string }[] = [
  { id: "screener", label: "Stock Screener", icon: TrendingUp, desc: "AI stock analysis" },
  { id: "portfolio", label: "Portfolio", icon: Briefcase, desc: "Holdings & risk" },
  { id: "sentiment", label: "Sentiment", icon: Brain, desc: "Market sentiment" },
  { id: "journal", label: "Trade Journal", icon: BookOpen, desc: "Log trades" },
  { id: "earnings", label: "Earnings", icon: DollarSign, desc: "Earnings analysis" },
  { id: "performance", label: "AI Tracker", icon: BarChart3, desc: "Model accuracy" },
];

function StockScreenerTab() {
  const [ticker, setTicker] = useState("");
  const [sector, setSector] = useState("healthcare");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const analyze = async () => {
    if (!ticker) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/finance/screener/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, sector }),
      });
      setResult(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadHistory = async () => {
    const r = await fetch(`${API}/finance/screener`);
    setHistory(await r.json());
  };

  const signalColor = (s: string) => {
    if (s?.includes("BUY")) return "text-green-400";
    if (s?.includes("SELL")) return "text-red-400";
    return "text-yellow-400";
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">AI Stock Screener</h2>
      <p className="text-gray-400 text-sm">AI-powered fundamental and technical analysis using DeepSeek</p>
      <div className="flex gap-3">
        <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="TICKER (e.g., ISRG)"
          className="flex-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm uppercase" />
        <select value={sector} onChange={e => setSector(e.target.value)} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["healthcare", "biotech", "pharma", "medtech", "tech", "fintech", "energy"].map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={analyze} disabled={loading || !ticker}
          className="px-5 py-2 rounded bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm disabled:opacity-50 flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />} Analyze
        </button>
        <button onClick={loadHistory} className="px-3 py-2 rounded bg-gray-700 text-gray-300 text-sm">History</button>
      </div>

      {result?.parsed && (
        <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-lg">{result.ticker} {result.parsed.companyName && `- ${result.parsed.companyName}`}</h3>
            <span className={`text-xl font-bold ${signalColor(result.aiSignal)}`}>{result.aiSignal}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {result.parsed.fundamentals && (
              <div className="p-3 bg-gray-700/50 rounded">
                <span className="text-xs text-gray-400 block mb-1">Fundamentals</span>
                {Object.entries(result.parsed.fundamentals).map(([k, v]: any) => (
                  <div key={k} className="flex justify-between text-xs"><span className="text-gray-400">{k}:</span><span className="text-white">{v}</span></div>
                ))}
              </div>
            )}
            {result.parsed.technicals && (
              <div className="p-3 bg-gray-700/50 rounded">
                <span className="text-xs text-gray-400 block mb-1">Technicals</span>
                {Object.entries(result.parsed.technicals).map(([k, v]: any) => (
                  <div key={k} className="flex justify-between text-xs"><span className="text-gray-400">{k}:</span><span className="text-white">{v}</span></div>
                ))}
              </div>
            )}
          </div>
          {result.parsed.catalysts && <div><span className="text-xs text-gray-400">Catalysts:</span><ul className="list-disc list-inside text-sm text-green-400 mt-1">{result.parsed.catalysts.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul></div>}
          {result.parsed.risks && <div><span className="text-xs text-gray-400">Risks:</span><ul className="list-disc list-inside text-sm text-red-400 mt-1">{result.parsed.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></div>}
          {result.confidenceScore && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">AI Confidence:</span>
              <div className="flex-1 h-2 bg-gray-700 rounded-full"><div className="h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500" style={{ width: `${(result.confidenceScore || 0) * 100}%` }} /></div>
              <span className="text-xs text-green-400">{((result.confidenceScore || 0) * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">{history.slice(0, 8).map((h: any) => (
          <div key={h.id} className="p-3 bg-gray-800/50 rounded border border-gray-700 flex justify-between items-center">
            <div><span className="text-white font-medium">{h.ticker}</span><span className="text-gray-500 text-xs ml-2">{h.sector}</span></div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${signalColor(h.aiSignal)}`}>{h.aiSignal}</span>
              <span className="text-xs text-gray-500">{new Date(h.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

function PortfolioTab() {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [form, setForm] = useState({ ticker: "", shares: "", avgCost: "", currentPrice: "", sector: "healthcare" });
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const r = await fetch(`${API}/finance/portfolio`);
    setHoldings(await r.json());
  };

  const add = async () => {
    if (!form.ticker || !form.shares) return;
    await fetch(`${API}/finance/portfolio`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: form.ticker, shares: parseFloat(form.shares), avgCost: parseFloat(form.avgCost) || 0, currentPrice: parseFloat(form.currentPrice) || null, sector: form.sector }),
    });
    setForm({ ticker: "", shares: "", avgCost: "", currentPrice: "", sector: "healthcare" });
    load();
  };

  const remove = async (id: number) => {
    await fetch(`${API}/finance/portfolio/${id}`, { method: "DELETE" });
    load();
  };

  const analyze = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/finance/portfolio/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setAnalysis(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalValue = holdings.reduce((s, h) => s + (h.currentPrice || h.avgCost) * h.shares, 0);
  const totalPnl = holdings.reduce((s, h) => s + (h.currentPrice ? (h.currentPrice - h.avgCost) * h.shares : 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">Portfolio Manager</h2><p className="text-gray-400 text-sm">Track holdings and get AI risk analysis</p></div>
        <button onClick={analyze} disabled={loading || !holdings.length}
          className="px-4 py-2 rounded bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm disabled:opacity-50 flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />} AI Analysis
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-center">
          <span className="text-xs text-gray-400 block">Total Value</span>
          <span className="text-2xl font-bold text-white">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-center">
          <span className="text-xs text-gray-400 block">Total P&L</span>
          <span className={`text-2xl font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-center">
          <span className="text-xs text-gray-400 block">Holdings</span>
          <span className="text-2xl font-bold text-white">{holdings.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2">
        <input value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} placeholder="TICKER"
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm uppercase" />
        <input value={form.shares} onChange={e => setForm(p => ({ ...p, shares: e.target.value }))} placeholder="Shares" type="number"
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <input value={form.avgCost} onChange={e => setForm(p => ({ ...p, avgCost: e.target.value }))} placeholder="Avg Cost" type="number"
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <input value={form.currentPrice} onChange={e => setForm(p => ({ ...p, currentPrice: e.target.value }))} placeholder="Current $" type="number"
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <select value={form.sector} onChange={e => setForm(p => ({ ...p, sector: e.target.value }))} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["healthcare", "biotech", "pharma", "tech", "fintech", "energy"].map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={add} className="px-3 py-2 rounded bg-green-600 text-white text-sm"><Plus className="w-4 h-4" /></button>
      </div>

      {holdings.length > 0 && (
        <div className="space-y-1">
          {holdings.map((h: any) => {
            const pnl = h.currentPrice ? (h.currentPrice - h.avgCost) * h.shares : 0;
            const pnlPct = h.avgCost > 0 && h.currentPrice ? ((h.currentPrice - h.avgCost) / h.avgCost * 100) : 0;
            return (
              <div key={h.id} className="p-3 bg-gray-800/50 rounded border border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-white font-medium w-16">{h.ticker}</span>
                  <span className="text-gray-400 text-xs">{h.shares} shares</span>
                  <span className="text-gray-400 text-xs">@ ${h.avgCost}</span>
                  {h.currentPrice && <span className="text-white text-xs">${h.currentPrice}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {pnl >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                  </span>
                  <button onClick={() => remove(h.id)} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {analysis?.parsed && (
        <div className="bg-gray-800/50 rounded-lg p-5 border border-green-500/30 space-y-3">
          <h3 className="text-white font-semibold">AI Portfolio Analysis</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-2 bg-gray-700/50 rounded text-center"><span className="text-xs text-gray-400 block">Risk Score</span><span className="text-lg font-bold text-yellow-400">{analysis.parsed.riskScore}/10</span></div>
            <div className="p-2 bg-gray-700/50 rounded text-center"><span className="text-xs text-gray-400 block">Sharpe Ratio</span><span className="text-lg font-bold text-green-400">{analysis.parsed.sharpeRatio}</span></div>
            <div className="p-2 bg-gray-700/50 rounded text-center"><span className="text-xs text-gray-400 block">Diversification</span><span className="text-lg font-bold text-cyan-400">{((analysis.parsed.diversificationScore || 0) * 100).toFixed(0)}%</span></div>
          </div>
          {analysis.parsed.recommendations && (
            <ul className="list-disc list-inside text-sm text-gray-300">{analysis.parsed.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}

function SentimentTab() {
  const [topic, setTopic] = useState("");
  const [source, setSource] = useState("general market news");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const analyze = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/finance/sentiment/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, source }),
      });
      setResult(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Market Sentiment AI</h2>
      <div className="flex gap-3">
        <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic (e.g., healthcare earnings, FDA approvals)"
          className="flex-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <input value={source} onChange={e => setSource(e.target.value)} placeholder="Source context"
          className="w-48 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <button onClick={analyze} disabled={loading || !topic}
          className="px-4 py-2 rounded bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analyze"}
        </button>
      </div>
      {result?.parsed && (
        <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700 space-y-3">
          <div className="flex items-center gap-4">
            <span className={`text-2xl font-bold ${result.parsed.sentiment === "bullish" ? "text-green-400" : result.parsed.sentiment === "bearish" ? "text-red-400" : "text-yellow-400"}`}>
              {result.parsed.sentiment?.toUpperCase()}
            </span>
            <span className="text-gray-400">Score: {result.parsed.score}</span>
          </div>
          <p className="text-gray-300 text-sm">{result.parsed.summary || result.summary}</p>
          {result.parsed.tradingImplications && <p className="text-green-400 text-sm">Trading: {result.parsed.tradingImplications}</p>}
        </div>
      )}
    </div>
  );
}

function TradeJournalTab() {
  const [trades, setTrades] = useState<any[]>([]);
  const [form, setForm] = useState({ ticker: "", action: "BUY", shares: "", price: "", reasoning: "", emotionalState: "neutral" });
  const [loading, setLoading] = useState(false);

  const load = async () => { const r = await fetch(`${API}/finance/journal`); setTrades(await r.json()); };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.ticker || !form.shares || !form.price) return;
    await fetch(`${API}/finance/journal`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, shares: parseFloat(form.shares), price: parseFloat(form.price) }),
    });
    setForm({ ticker: "", action: "BUY", shares: "", price: "", reasoning: "", emotionalState: "neutral" });
    load();
  };

  const analyzeTrade = async (id: number) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/finance/journal/${id}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await r.json();
      alert(data.analysis || JSON.stringify(data));
      load();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Trade Journal AI</h2>
      <div className="grid grid-cols-6 gap-2">
        <input value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} placeholder="TICKER" className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm uppercase" />
        <select value={form.action} onChange={e => setForm(p => ({ ...p, action: e.target.value }))} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["BUY", "SELL", "SHORT", "COVER"].map(a => <option key={a}>{a}</option>)}
        </select>
        <input value={form.shares} onChange={e => setForm(p => ({ ...p, shares: e.target.value }))} placeholder="Shares" type="number" className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <input value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="Price" type="number" className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <select value={form.emotionalState} onChange={e => setForm(p => ({ ...p, emotionalState: e.target.value }))} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["neutral", "confident", "fearful", "greedy", "anxious", "excited"].map(e => <option key={e}>{e}</option>)}
        </select>
        <button onClick={add} className="px-3 py-2 rounded bg-green-600 text-white text-sm"><Plus className="w-4 h-4" /></button>
      </div>
      <textarea value={form.reasoning} onChange={e => setForm(p => ({ ...p, reasoning: e.target.value }))} rows={2} placeholder="Why did you make this trade?"
        className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />

      {trades.length > 0 && (
        <div className="space-y-2">{trades.map((t: any) => (
          <div key={t.id} className="p-3 bg-gray-800/50 rounded border border-gray-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium px-2 py-0.5 rounded ${t.action === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{t.action}</span>
                <span className="text-white font-medium">{t.ticker}</span>
                <span className="text-gray-400 text-xs">{t.shares} @ ${t.price}</span>
                {t.emotionalState && <span className="text-xs text-gray-500">{t.emotionalState}</span>}
              </div>
              <button onClick={() => analyzeTrade(t.id)} disabled={loading} className="px-3 py-1 rounded bg-gray-700 text-gray-300 text-xs hover:bg-green-600/50">
                <Brain className="w-3 h-3 inline mr-1" />Analyze
              </button>
            </div>
            {t.reasoning && <p className="text-gray-400 text-xs mt-1">{t.reasoning}</p>}
            {t.aiAnalysis && <p className="text-green-400/80 text-xs mt-1 border-t border-gray-700 pt-1">{t.aiAnalysis.substring(0, 200)}</p>}
          </div>
        ))}</div>
      )}
    </div>
  );
}

function EarningsTab() {
  const [ticker, setTicker] = useState("");
  const [quarter, setQuarter] = useState("Q1 2026");
  const [keyMetrics, setKeyMetrics] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const analyze = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/finance/earnings/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, quarter, keyMetrics }),
      });
      setResult(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Earnings Call Analyzer</h2>
      <div className="grid grid-cols-3 gap-3">
        <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="TICKER" className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm uppercase" />
        <input value={quarter} onChange={e => setQuarter(e.target.value)} placeholder="Quarter (e.g., Q1 2026)" className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <button onClick={analyze} disabled={loading || !ticker}
          className="px-4 py-2 rounded bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm disabled:opacity-50 flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />} Analyze
        </button>
      </div>
      <textarea value={keyMetrics} onChange={e => setKeyMetrics(e.target.value)} rows={3} placeholder="Key metrics or earnings call highlights (optional)..."
        className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
      {result && (
        <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold">{result.ticker} - {result.quarter}</span>
            <span className={`px-2 py-0.5 rounded text-xs ${result.sentiment === "positive" ? "bg-green-500/20 text-green-400" : result.sentiment === "negative" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>{result.sentiment}</span>
          </div>
          <p className="text-gray-300 text-sm">{result.aiSummary}</p>
          {result.guidanceAnalysis && <p className="text-cyan-400 text-sm">Guidance: {result.guidanceAnalysis}</p>}
          {result.healthcareInsights && <p className="text-green-400 text-sm">Healthcare: {result.healthcareInsights}</p>}
        </div>
      )}
    </div>
  );
}

function PerformanceTab() {
  const [tracking, setTracking] = useState<any[]>([]);
  const load = async () => { const r = await fetch(`${API}/finance/ai-performance`); setTracking(await r.json()); };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">AI Model Performance Tracker</h2><p className="text-gray-400 text-sm">Track accuracy of AI predictions across all domains</p></div>
        <button onClick={load} className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm">Refresh</button>
      </div>
      {tracking.length > 0 ? (
        <div className="space-y-2">{tracking.map((t: any) => (
          <div key={t.id} className="p-3 bg-gray-800/50 rounded border border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded ${t.domain === "finance" ? "bg-green-500/20 text-green-400" : t.domain === "clinical" ? "bg-red-500/20 text-red-400" : "bg-purple-500/20 text-purple-400"}`}>{t.domain}</span>
              <span className="text-white text-sm">{t.feature}</span>
              <span className="text-gray-400 text-xs">{t.model}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-cyan-400 text-sm">{t.prediction}</span>
              {t.accuracy !== null && <span className="text-green-400 text-xs">{(t.accuracy * 100).toFixed(0)}% accurate</span>}
              <span className="text-gray-500 text-xs">{new Date(t.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}</div>
      ) : (
        <div className="text-center text-gray-500 py-12">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No AI predictions tracked yet. Use Stock Screener, Sentiment, or Clinical tools to generate predictions.</p>
        </div>
      )}
    </div>
  );
}

export default function Finance() {
  const [tab, setTab] = useState<Tab>("screener");
  const [dashboard, setDashboard] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/finance/dashboard`).then(r => r.json()).then(setDashboard).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Hedge Fund AI</h1>
          <p className="text-gray-400 text-sm">AI-powered investment analysis and portfolio management</p>
        </div>
        {dashboard?.portfolio && (
          <div className="ml-auto flex gap-4">
            <div className="text-right"><span className="text-xs text-gray-400 block">Portfolio</span><span className="text-white font-medium">${dashboard.portfolio.totalValue?.toLocaleString()}</span></div>
            <div className="text-right"><span className="text-xs text-gray-400 block">P&L</span><span className={`font-medium ${dashboard.portfolio.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>${dashboard.portfolio.totalPnl?.toLocaleString()}</span></div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-6 gap-2 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`p-3 rounded-lg text-center transition-all ${tab === t.id ? "bg-green-500/20 border border-green-500/50" : "bg-gray-800/50 border border-gray-700 hover:border-gray-600"}`}>
            <t.icon className={`w-5 h-5 mx-auto mb-1 ${tab === t.id ? "text-green-400" : "text-gray-400"}`} />
            <span className={`text-xs block ${tab === t.id ? "text-green-300" : "text-gray-400"}`}>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        {tab === "screener" && <StockScreenerTab />}
        {tab === "portfolio" && <PortfolioTab />}
        {tab === "sentiment" && <SentimentTab />}
        {tab === "journal" && <TradeJournalTab />}
        {tab === "earnings" && <EarningsTab />}
        {tab === "performance" && <PerformanceTab />}
      </div>
    </div>
  );
}
