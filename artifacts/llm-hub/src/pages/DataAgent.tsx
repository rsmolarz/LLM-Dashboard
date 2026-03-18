import { useState, useEffect } from "react";
import { Database, Plus, Play, Trash2, Loader2, RefreshCw, CheckCircle, XCircle, Clock, BarChart3 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

type Tab = "dashboard" | "sources" | "jobs" | "datasets";

export default function DataAgent() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
          <Database className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Database Training Agent</h1>
          <p className="text-gray-400 text-sm">Scrape, generate, and manage LLM training data across all domains</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {([
          { id: "dashboard" as Tab, label: "Dashboard", icon: BarChart3 },
          { id: "sources" as Tab, label: "Data Sources", icon: Database },
          { id: "jobs" as Tab, label: "Jobs", icon: Play },
          { id: "datasets" as Tab, label: "Datasets", icon: CheckCircle },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${tab === t.id ? "bg-orange-500/20 border border-orange-500/50 text-orange-300" : "bg-gray-800/50 border border-gray-700 hover:border-gray-600 text-gray-400"}`}>
            <t.icon className="w-4 h-4" />
            <span className="text-sm">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "sources" && <SourcesTab />}
        {tab === "jobs" && <JobsTab />}
        {tab === "datasets" && <DatasetsTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/data-agent/dashboard`).then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-orange-400" /></div>;

  const stats = data || { totalSources: 0, totalJobs: 0, totalDatasets: 0, domainStats: {} };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Training Data Overview</h2>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Sources" value={stats.totalSources || 0} color="text-blue-400" />
        <StatCard label="Total Jobs" value={stats.totalJobs || 0} color="text-orange-400" />
        <StatCard label="Completed" value={stats.completedJobs || 0} color="text-green-400" />
        <StatCard label="Datasets" value={stats.totalDatasets || 0} color="text-purple-400" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {["otolaryngology", "social_media", "hedge_fund"].map(domain => {
          const d = stats.domainStats?.[domain] || { sources: 0, jobs: 0, datasets: 0, totalRecords: 0 };
          const colors: Record<string, string> = { otolaryngology: "from-red-500 to-pink-600", social_media: "from-purple-500 to-pink-600", hedge_fund: "from-green-500 to-emerald-600" };
          const labels: Record<string, string> = { otolaryngology: "ENT Clinical", social_media: "Social Media", hedge_fund: "Hedge Fund" };
          return (
            <div key={domain} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className={`text-sm font-bold bg-gradient-to-r ${colors[domain]} bg-clip-text text-transparent`}>{labels[domain]}</div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="text-center"><span className="text-xs text-gray-400 block">Sources</span><span className="text-white font-medium">{d.sources}</span></div>
                <div className="text-center"><span className="text-xs text-gray-400 block">Jobs</span><span className="text-white font-medium">{d.jobs}</span></div>
                <div className="text-center"><span className="text-xs text-gray-400 block">Datasets</span><span className="text-white font-medium">{d.datasets}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-center">
      <span className="text-xs text-gray-400 block">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
    </div>
  );
}

function SourcesTab() {
  const [sources, setSources] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", sourceType: "textbook", domain: "otolaryngology", url: "", config: "{}" });

  const load = async () => { const r = await fetch(`${API}/data-agent/sources`); setSources(await r.json()); };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.name) return;
    await fetch(`${API}/data-agent/sources`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", sourceType: "textbook", domain: "otolaryngology", url: "", config: "{}" });
    load();
  };

  const remove = async (id: number) => { await fetch(`${API}/data-agent/sources/${id}`, { method: "DELETE" }); load(); };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Data Sources</h2>
      <div className="grid grid-cols-5 gap-2">
        <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Source name"
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <select value={form.sourceType} onChange={e => setForm(p => ({ ...p, sourceType: e.target.value }))}
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["textbook", "paper", "website", "api", "database", "manual"].map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value }))}
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["otolaryngology", "social_media", "hedge_fund"].map(d => <option key={d}>{d}</option>)}
        </select>
        <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="URL (optional)"
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <button onClick={add} className="px-3 py-2 rounded bg-orange-600 text-white text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> Add</button>
      </div>

      {sources.length > 0 ? (
        <div className="space-y-2">{sources.map((s: any) => (
          <div key={s.id} className="p-3 bg-gray-800/50 rounded border border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded ${s.domain === "otolaryngology" ? "bg-red-500/20 text-red-400" : s.domain === "social_media" ? "bg-purple-500/20 text-purple-400" : "bg-green-500/20 text-green-400"}`}>{s.domain}</span>
              <span className="text-white text-sm font-medium">{s.name}</span>
              <span className="text-gray-500 text-xs">{s.sourceType}</span>
              {s.url && <span className="text-gray-500 text-xs truncate max-w-[200px]">{s.url}</span>}
            </div>
            <button onClick={() => remove(s.id)} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}</div>
      ) : (
        <div className="text-center text-gray-500 py-12"><Database className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No data sources configured yet</p></div>
      )}
    </div>
  );
}

function JobsTab() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [domain, setDomain] = useState("otolaryngology");
  const [count, setCount] = useState("50");
  const [loading, setLoading] = useState(false);

  const load = async () => { const r = await fetch(`${API}/data-agent/jobs`); setJobs(await r.json()); };
  useEffect(() => { load(); }, []);

  const run = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/data-agent/jobs/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, jobType: "generate", count: parseInt(count) }),
      });
      setTimeout(load, 2000);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-400" />;
    if (status === "running") return <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />;
    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Training Data Jobs</h2>
        <button onClick={load} className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
      </div>

      <div className="flex gap-3">
        <select value={domain} onChange={e => setDomain(e.target.value)}
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["otolaryngology", "social_media", "hedge_fund"].map(d => <option key={d}>{d}</option>)}
        </select>
        <input value={count} onChange={e => setCount(e.target.value)} type="number" placeholder="Count"
          className="w-24 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <button onClick={run} disabled={loading}
          className="px-5 py-2 rounded bg-gradient-to-r from-orange-500 to-amber-600 text-white text-sm disabled:opacity-50 flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run Generation Job
        </button>
      </div>

      {jobs.length > 0 ? (
        <div className="space-y-2">{jobs.map((j: any) => (
          <div key={j.id} className="p-3 bg-gray-800/50 rounded border border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-3">
              {statusIcon(j.status)}
              <span className={`text-xs px-2 py-0.5 rounded ${j.domain === "otolaryngology" ? "bg-red-500/20 text-red-400" : j.domain === "social_media" ? "bg-purple-500/20 text-purple-400" : "bg-green-500/20 text-green-400"}`}>{j.domain}</span>
              <span className="text-white text-sm">{j.jobType}</span>
              <span className="text-gray-400 text-xs">{j.recordsCollected || 0} records</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs ${j.status === "completed" ? "text-green-400" : j.status === "failed" ? "text-red-400" : "text-orange-400"}`}>{j.status}</span>
              <span className="text-gray-500 text-xs">{j.createdAt ? new Date(j.createdAt).toLocaleString() : ""}</span>
            </div>
          </div>
        ))}</div>
      ) : (
        <div className="text-center text-gray-500 py-12"><Play className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No jobs run yet. Start a generation job above.</p></div>
      )}
    </div>
  );
}

function DatasetsTab() {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [scoring, setScoring] = useState(false);

  const load = async () => { const r = await fetch(`${API}/data-agent/datasets`); setDatasets(await r.json()); };
  useEffect(() => { load(); }, []);

  const scoreAll = async () => {
    setScoring(true);
    for (const d of datasets) {
      try {
        await fetch(`${API}/data-agent/datasets/${d.id}/quality`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      } catch (e) { console.error(e); }
    }
    load();
    setScoring(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Training Datasets</h2>
        <div className="flex gap-2">
          <button onClick={scoreAll} disabled={scoring || !datasets.length}
            className="px-3 py-1.5 rounded bg-orange-600 text-white text-sm disabled:opacity-50 flex items-center gap-1">
            {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Score All
          </button>
          <button onClick={load} className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm">Refresh</button>
        </div>
      </div>

      {datasets.length > 0 ? (
        <div className="space-y-2">{datasets.map((d: any) => (
          <div key={d.id} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-white font-medium">{d.name}</span>
                <div className="flex gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${d.domain === "otolaryngology" ? "bg-red-500/20 text-red-400" : d.domain === "social_media" ? "bg-purple-500/20 text-purple-400" : "bg-green-500/20 text-green-400"}`}>{d.domain}</span>
                  <span className="text-gray-500 text-xs">{d.format}</span>
                  <span className="text-gray-500 text-xs">{d.totalSamples || 0} records</span>
                </div>
              </div>
              {d.qualityScore !== null && d.qualityScore !== undefined && (
                <div className="text-right">
                  <span className="text-xs text-gray-400 block">Quality</span>
                  <span className={`text-lg font-bold ${d.qualityScore >= 0.8 ? "text-green-400" : d.qualityScore >= 0.5 ? "text-yellow-400" : "text-red-400"}`}>
                    {(d.qualityScore * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}</div>
      ) : (
        <div className="text-center text-gray-500 py-12"><Database className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No datasets created yet. Run a generation job first.</p></div>
      )}
    </div>
  );
}
