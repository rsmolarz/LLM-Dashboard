import { useState, useEffect, useCallback } from "react";
import { DollarSign, Loader2, RefreshCw, TrendingUp, AlertTriangle, Plus, Trash2, BarChart3, PieChart } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart as RPieChart, Pie, Cell, Legend } from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

const CHART_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6", "#06b6d4", "#ef4444", "#84cc16"];

export default function Costs() {
  const [summary, setSummary] = useState<any>(null);
  const [byModel, setByModel] = useState<Record<string, any>>({});
  const [byDay, setByDay] = useState<any[]>([]);
  const [bySource, setBySource] = useState<Record<string, any>>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "models" | "trends" | "alerts">("overview");
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [alertForm, setAlertForm] = useState({ threshold: "", email: "" });

  const fetchAll = useCallback(async () => {
    try {
      const [s, m, d, src, a] = await Promise.all([
        fetch(`${API}/costs/summary`).then(r => r.json()),
        fetch(`${API}/costs/by-model`).then(r => r.json()),
        fetch(`${API}/costs/by-day`).then(r => r.json()),
        fetch(`${API}/costs/by-source`).then(r => r.json()),
        fetch(`${API}/costs/budget-alerts`).then(r => r.json()),
      ]);
      setSummary(s);
      setByModel(m);
      setByDay(d);
      setBySource(src);
      setAlerts(a);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addAlert = async () => {
    if (!alertForm.threshold || !alertForm.email) return;
    await fetch(`${API}/costs/budget-alerts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threshold: parseFloat(alertForm.threshold), email: alertForm.email }) });
    setShowAddAlert(false);
    setAlertForm({ threshold: "", email: "" });
    fetchAll();
  };

  const deleteAlert = async (id: string) => {
    await fetch(`${API}/costs/budget-alerts/${id}`, { method: "DELETE" });
    fetchAll();
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const modelPieData = Object.entries(byModel).map(([name, d]: [string, any]) => ({ name, value: d.requests }));
  const sourceData = Object.entries(bySource).map(([name, d]: [string, any]) => ({ name, tokens: d.tokensIn + d.tokensOut, cost: d.cost, requests: d.requests }));

  const tabs: { id: typeof tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: DollarSign },
    { id: "models", label: "By Model", icon: PieChart },
    { id: "trends", label: "Trends", icon: TrendingUp },
    { id: "alerts", label: "Budget Alerts", icon: AlertTriangle },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Cost & Usage</h1>
            <p className="text-xs text-muted-foreground">Token usage and spending analytics</p>
          </div>
        </div>
        <button onClick={() => fetchAll()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-muted-foreground hover:text-white">
          <RefreshCw className="w-3.5 h-3.5" />Refresh
        </button>
      </div>

      <div className="px-4 md:px-6 py-2 border-b border-white/5 flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${tab === t.id ? "bg-green-500/20 text-green-300 border border-green-500/30" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {tab === "overview" && summary && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Last 24h", data: summary.last24h, color: "emerald" },
                { label: "Last 7 Days", data: summary.last7d, color: "cyan" },
                { label: "Last 30 Days", data: summary.last30d, color: "violet" },
                { label: "All Time", data: summary.allTime, color: "amber" },
              ].map(p => (
                <div key={p.label} className="glass-panel rounded-xl p-4 border border-white/5">
                  <div className="text-[10px] text-muted-foreground mb-1">{p.label}</div>
                  <div className="text-lg font-bold text-white">${p.data.totalCost.toFixed(4)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{(p.data.totalTokensIn + p.data.totalTokensOut).toLocaleString()} tokens</div>
                  <div className="text-[10px] text-muted-foreground">{p.data.requests} requests</div>
                </div>
              ))}
            </div>

            <div className="glass-panel rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-green-400" />Usage by Source
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#888', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }} />
                    <Bar dataKey="requests" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {tab === "models" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-panel rounded-xl p-4 border border-white/5">
                <h3 className="text-sm font-semibold text-white mb-3">Request Distribution</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RPieChart>
                      <Pie data={modelPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {modelPieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                    </RPieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="glass-panel rounded-xl p-4 border border-white/5">
                <h3 className="text-sm font-semibold text-white mb-3">Model Breakdown</h3>
                <div className="space-y-2">
                  {Object.entries(byModel).map(([model, d]: [string, any]) => (
                    <div key={model} className="flex items-center justify-between py-2 border-b border-white/5">
                      <div>
                        <div className="text-xs font-medium text-white">{model}</div>
                        <div className="text-[10px] text-muted-foreground">{d.requests} requests</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-white">${d.cost.toFixed(4)}</div>
                        <div className="text-[10px] text-muted-foreground">{(d.tokensIn + d.tokensOut).toLocaleString()} tokens</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "trends" && (
          <div className="glass-panel rounded-xl p-4 border border-white/5">
            <h3 className="text-sm font-semibold text-white mb-3">Daily Token Usage (30 Days)</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fill: '#888', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="tokensIn" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} name="Input Tokens" />
                  <Area type="monotone" dataKey="tokensOut" stackId="1" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.3} name="Output Tokens" />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === "alerts" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Budget Alerts</h2>
              <button onClick={() => setShowAddAlert(!showAddAlert)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-xs text-green-300 hover:bg-green-500/30">
                <Plus className="w-3.5 h-3.5" />Add Alert
              </button>
            </div>

            {showAddAlert && (
              <div className="glass-panel rounded-xl p-4 border border-green-500/20 flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground block mb-1">Cost Threshold ($)</label>
                  <input value={alertForm.threshold} onChange={e => setAlertForm({ ...alertForm, threshold: e.target.value })} type="number" step="0.01" placeholder="5.00" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground block mb-1">Email</label>
                  <input value={alertForm.email} onChange={e => setAlertForm({ ...alertForm, email: e.target.value })} placeholder="you@example.com" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
                </div>
                <button onClick={addAlert} className="px-4 py-2 rounded-lg bg-green-500 text-white text-xs font-medium">Create</button>
              </div>
            )}

            {alerts.length === 0 ? (
              <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
                <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No Budget Alerts</h3>
                <p className="text-xs text-muted-foreground">Set up alerts to get notified when costs exceed your threshold.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((a: any) => (
                  <div key={a.id} className="glass-panel rounded-xl p-4 border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-white font-medium">Alert at ${a.threshold.toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground">Notify: {a.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${a.triggered ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                        {a.triggered ? "Triggered" : "Active"}
                      </span>
                      <button onClick={() => deleteAlert(a.id)} className="p-1.5 rounded hover:bg-white/10"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
