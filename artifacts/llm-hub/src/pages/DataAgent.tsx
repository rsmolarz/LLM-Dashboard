import { useState, useEffect } from "react";
import { Database, Plus, Play, Trash2, Loader2, RefreshCw, CheckCircle, XCircle, Clock, BarChart3, Zap, Settings, Upload, HardDrive, FileText } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

type Tab = "dashboard" | "sources" | "jobs" | "datasets" | "continuous";

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

      <div className="overflow-x-auto pb-2 flex gap-2 mb-6">
        {([
          { id: "dashboard" as Tab, label: "Dashboard", icon: BarChart3 },
          { id: "continuous" as Tab, label: "Continuous Training", icon: Zap },
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
        {tab === "continuous" && <ContinuousTrainingTab />}
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

function ContinuousTrainingTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [configForm, setConfigForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`${API}/auto-collector/training-status`).then(r => r.json()).then(d => {
      setData(d);
      if (!configForm) setConfigForm({
        enabled: d.scheduler.enabled,
        intervalMinutes: d.scheduler.intervalMinutes,
        samplesPerRun: d.scheduler.samplesPerRun,
        model: d.scheduler.model,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, []);

  const triggerRun = async () => {
    setTriggering(true);
    try { await fetch(`${API}/auto-collector/training-run`, { method: "POST" }); setTimeout(load, 3000); } catch {}
    setTriggering(false);
  };

  const saveConfig = async () => {
    if (!configForm) return;
    setSaving(true);
    try {
      await fetch(`${API}/auto-collector/training-config`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configForm),
      });
      load();
    } catch {}
    setSaving(false);
  };

  if (loading && !data) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-orange-400" /></div>;

  const s = data?.scheduler || {};
  const stats = data?.stats || {};
  const domainStats = data?.domainStats || {};
  const recentRuns = data?.recentRuns || [];
  const datasets = data?.datasets || [];

  const domainLabels: Record<string, string> = { otolaryngology: "ENT Clinical", social_media: "Social Media", hedge_fund: "Hedge Fund" };
  const domainColors: Record<string, string> = { otolaryngology: "red", social_media: "purple", hedge_fund: "green" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Continuous Training Pipeline</h2>
          <p className="text-sm text-gray-400 mt-1">Automatically generates training data across all domains on a schedule</p>
        </div>
        <div className="flex gap-2">
          <button onClick={triggerRun} disabled={triggering || s.isRunning}
            className="px-4 py-2 bg-orange-500/20 border border-orange-500/50 rounded-lg text-orange-300 text-sm hover:bg-orange-500/30 flex items-center gap-2 disabled:opacity-50">
            {triggering || s.isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {s.isRunning ? "Running..." : "Run Now"}
          </button>
          <button onClick={load} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 text-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${s.enabled ? (s.isRunning ? "bg-orange-400 animate-pulse" : "bg-green-400") : "bg-gray-500"}`} />
            <span className="text-sm text-gray-400">Status</span>
          </div>
          <div className="text-lg font-bold">{s.isRunning ? "Running" : s.enabled ? "Active" : "Paused"}</div>
        </div>
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700">
          <span className="text-sm text-gray-400 block">Stored Samples</span>
          <div className="text-2xl font-bold text-orange-400">{stats.totalStoredSamples || 0}</div>
          <div className="text-xs text-gray-500 mt-1">{stats.totalSamplesGenerated || 0} generated</div>
        </div>
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700">
          <span className="text-sm text-gray-400 block">Completed Jobs</span>
          <div className="text-2xl font-bold text-green-400">{stats.completedJobs || 0}</div>
        </div>
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700">
          <span className="text-sm text-gray-400 block">Every</span>
          <div className="text-lg font-bold">{s.intervalMinutes || 60} min</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(domainStats).map(([domain, d]: any) => (
          <div key={domain} className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
            <div className={`text-sm font-bold text-${domainColors[domain] || "gray"}-400 mb-3`}>{domainLabels[domain] || domain}</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div><span className="text-xs text-gray-500 block">Jobs</span><span className="text-white font-medium">{d.jobs}</span></div>
              <div><span className="text-xs text-gray-500 block">Samples</span><span className="text-white font-medium">{d.samples}</span></div>
              <div><span className="text-xs text-gray-500 block">Stored</span><span className="text-green-400 font-medium">{d.storedSamples}</span></div>
              <div><span className="text-xs text-gray-500 block">Dataset</span><span className="text-white font-medium">{d.datasetSize}</span></div>
            </div>
          </div>
        ))}
      </div>

      <DriveImportSection onImportComplete={load} />

      <StoredSamplesSection />

      {datasets.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-gray-300">Growing Datasets</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {datasets.map((d: any) => (
              <div key={d.id} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700">
                <div className="text-sm font-medium text-white">{d.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded bg-${domainColors[d.domain] || "gray"}-500/20 text-${domainColors[d.domain] || "gray"}-400`}>{domainLabels[d.domain] || d.domain}</span>
                  <span className="text-xs text-gray-500">{d.totalSamples} samples</span>
                  <span className="text-xs text-gray-600">{d.format}</span>
                </div>
                {d.qualityScore != null && (
                  <div className="mt-1 text-xs"><span className="text-gray-500">Quality: </span><span className={d.qualityScore >= 0.8 ? "text-green-400" : "text-yellow-400"}>{(d.qualityScore * 100).toFixed(0)}%</span></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {configForm && (
        <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Settings className="w-4 h-4 text-gray-400" /> Scheduler Settings</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Enabled</label>
              <select value={String(configForm.enabled)} onChange={e => setConfigForm({ ...configForm, enabled: e.target.value === "true" })}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-sm">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Interval (min)</label>
              <input type="number" value={configForm.intervalMinutes} onChange={e => setConfigForm({ ...configForm, intervalMinutes: parseInt(e.target.value) || 60 })}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-sm" min="15" max="1440" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Samples/Run</label>
              <input type="number" value={configForm.samplesPerRun} onChange={e => setConfigForm({ ...configForm, samplesPerRun: parseInt(e.target.value) || 10 })}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-sm" min="1" max="50" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Model</label>
              <select value={configForm.model} onChange={e => setConfigForm({ ...configForm, model: e.target.value })}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-sm">
                {["qwen2.5:7b", "deepseek-r1:8b", "meditron:7b", "mistral:latest", "llama3.2:latest"].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <button onClick={saveConfig} disabled={saving}
            className="mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg text-white text-sm flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Save Settings
          </button>
        </div>
      )}

      {recentRuns.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-gray-300">Recent Runs</h3>
          <div className="space-y-2">
            {recentRuns.map((r: any) => (
              <div key={r.id} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {r.status === "completed" ? <CheckCircle className="w-4 h-4 text-green-400" /> : r.status === "running" ? <Loader2 className="w-4 h-4 text-orange-400 animate-spin" /> : <XCircle className="w-4 h-4 text-red-400" />}
                    <span className="text-sm text-white">{r.status}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(r.startedAt).toLocaleString()}
                    {r.completedAt && ` — ${Math.round((new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s`}
                  </div>
                </div>
                {Object.keys(r.results || {}).length > 0 && (
                  <div className="flex gap-3">
                    {Object.entries(r.results).map(([domain, res]: any) => (
                      <div key={domain} className="text-xs">
                        <span className="text-gray-500">{domainLabels[domain] || domain}: </span>
                        <span className={res.error ? "text-red-400" : "text-green-400"}>{res.samples} samples</span>
                        {res.error && <span className="text-red-400 ml-1">({res.error})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {s.lastRunAt && (
        <div className="text-xs text-gray-500 text-center">
          Last run: {new Date(s.lastRunAt).toLocaleString()} · Next run in ~{s.intervalMinutes} minutes · Model: {s.model}
        </div>
      )}
    </div>
  );
}

function DriveImportSection({ onImportComplete }: { onImportComplete: () => void }) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [maxFiles, setMaxFiles] = useState(10);

  const runImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const resp = await fetch(`${API}/auto-collector/drive-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderQuery: query || undefined, maxFiles }),
      });
      const data = await resp.json();
      setResult(data);
      onImportComplete();
    } catch (e: any) {
      setResult({ error: e.message });
    }
    setImporting(false);
  };

  return (
    <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Upload className="w-4 h-4 text-blue-400" /> Google Drive ENT Book Import
      </h3>
      <p className="text-xs text-gray-400 mb-3">Scan Google Drive for ENT/medical books and generate training Q&A pairs from their content.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="md:col-span-2">
          <label className="text-xs text-gray-500 block mb-1">Search Query (optional)</label>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="ENT OR otolaryngology OR medical..."
            className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-sm text-white placeholder-gray-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Max Files</label>
          <input type="number" value={maxFiles} onChange={e => setMaxFiles(parseInt(e.target.value) || 10)}
            className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-sm text-white" min="1" max="50" />
        </div>
      </div>
      <button onClick={runImport} disabled={importing}
        className="px-4 py-2 bg-blue-500/20 border border-blue-500/50 rounded-lg text-blue-300 text-sm hover:bg-blue-500/30 flex items-center gap-2 disabled:opacity-50">
        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
        {importing ? "Importing..." : "Import from Drive"}
      </button>
      {result && (
        <div className="mt-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
          {result.error ? (
            <div className="text-red-400 text-sm">{result.error}</div>
          ) : (
            <div>
              <div className="text-sm text-white mb-2">
                Scanned {result.filesScanned} files · Generated {result.totalSamplesGenerated} training samples
              </div>
              {result.results?.map((r: any, i: number) => (
                <div key={i} className="text-xs py-1 flex items-center gap-2">
                  <FileText className="w-3 h-3 text-gray-400" />
                  <span className="text-gray-300">{r.file}</span>
                  <span className={r.samplesGenerated > 0 ? "text-green-400" : "text-gray-500"}>
                    {r.samplesGenerated} samples
                  </span>
                  {r.error && <span className="text-red-400">({r.error})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StoredSamplesSection() {
  const [samples, setSamples] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("");

  const load = (d?: string) => {
    setLoading(true);
    const q = d !== undefined ? d : domain;
    const url = q ? `${API}/auto-collector/training-samples?domain=${q}&limit=20` : `${API}/auto-collector/training-samples?limit=20`;
    fetch(url).then(r => r.json()).then(data => {
      setSamples(data.samples || []);
      setTotal(data.total || 0);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const domainLabels: Record<string, string> = { otolaryngology: "ENT", social_media: "Social", hedge_fund: "Finance" };

  return (
    <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Database className="w-4 h-4 text-green-400" /> Stored Training Samples ({total})
        </h3>
        <div className="flex gap-2">
          <select value={domain} onChange={e => { setDomain(e.target.value); load(e.target.value); }}
            className="p-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white">
            <option value="">All Domains</option>
            <option value="otolaryngology">ENT Clinical</option>
            <option value="social_media">Social Media</option>
            <option value="hedge_fund">Hedge Fund</option>
          </select>
          <button onClick={() => load()} className="p-1.5 bg-gray-800 border border-gray-700 rounded text-gray-300">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-green-400" /></div>
      ) : samples.length === 0 ? (
        <div className="text-center text-gray-500 py-4 text-sm">No stored samples yet</div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {samples.map((s: any) => (
            <div key={s.id} className="p-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{domainLabels[s.category] || s.category}</span>
                <span className="text-xs text-gray-500">{s.source}</span>
                <span className="text-xs text-gray-600">{new Date(s.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-sm text-blue-300 font-medium mb-1">{(s.inputText || "").substring(0, 120)}{s.inputText?.length > 120 ? "..." : ""}</div>
              <div className="text-xs text-gray-400">{(s.outputText || "").substring(0, 200)}{s.outputText?.length > 200 ? "..." : ""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
