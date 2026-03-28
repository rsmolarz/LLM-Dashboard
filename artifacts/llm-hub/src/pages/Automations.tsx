import { useState, useEffect } from "react";
import { Clock, Play, Pause, Trash2, Plus, Zap, RefreshCw, CheckCircle, XCircle, Timer, ChevronDown, ChevronUp, History, Settings } from "lucide-react";

interface Automation {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  schedule: string;
  enabled: boolean;
  lastRun: number | null;
  nextRun: number | null;
  runCount: number;
  createdAt: number;
}

interface AutomationRun {
  id: string;
  automationId: string;
  runNumber: number;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "success" | "error";
  result: string | null;
  durationMs: number | null;
}

const BASE = import.meta.env.BASE_URL || "/";
const api = (path: string) => `${BASE}api${path}`;

const AUTOMATION_TYPES = [
  { value: "research", label: "Research", desc: "Run deep research on a topic", icon: "🔬" },
  { value: "training", label: "Training", desc: "Trigger training data collection", icon: "🧠" },
  { value: "agent-task", label: "Agent Task", desc: "Run an agent task", icon: "🤖" },
  { value: "backup", label: "Backup", desc: "Create system backup", icon: "💾" },
  { value: "benchmark", label: "Benchmark", desc: "Run model benchmarks", icon: "📊" },
];

const SCHEDULE_PRESETS = [
  "every 5 mins",
  "every 15 mins",
  "every 30 mins",
  "every 1 hour",
  "every 6 hours",
  "every 12 hours",
  "every 1 day",
];

function useCountdown(targetMs: number | null) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!targetMs) { setRemaining(""); return; }
    const update = () => {
      const diff = targetMs - Date.now();
      if (diff <= 0) { setRemaining("Now"); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (mins > 60) {
        const hrs = Math.floor(mins / 60);
        setRemaining(`${hrs}h ${mins % 60}m`);
      } else {
        setRemaining(`${mins}m ${secs}s`);
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetMs]);
  return remaining;
}

function ConfigForm({ type, config, onChange }: { type: string; config: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  switch (type) {
    case "research":
      return (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground block">Research Prompt</label>
          <textarea value={config.prompt || ""} onChange={e => onChange({ ...config, prompt: e.target.value })}
            placeholder="Summarize recent AI developments" rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/30 resize-none" />
          <label className="text-xs text-muted-foreground block">Mode</label>
          <select value={config.mode || "deep"} onChange={e => onChange({ ...config, mode: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
            <option value="deep">Deep (Local Models)</option>
            <option value="extensive">Extensive (Multi-Provider)</option>
          </select>
        </div>
      );
    case "training":
      return (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground block">Training Domain</label>
          <select value={config.domain || "general"} onChange={e => onChange({ ...config, domain: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
            <option value="general">General</option>
            <option value="ent">ENT Medical</option>
            <option value="finance">Hedge Fund / Finance</option>
            <option value="social">Social Media</option>
          </select>
        </div>
      );
    case "agent-task":
      return (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground block">Task Title</label>
          <input value={config.title || ""} onChange={e => onChange({ ...config, title: e.target.value })}
            placeholder="Automated task title"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/30" />
          <label className="text-xs text-muted-foreground block">Description</label>
          <textarea value={config.description || ""} onChange={e => onChange({ ...config, description: e.target.value })}
            placeholder="Task description..." rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/30 resize-none" />
          <label className="text-xs text-muted-foreground block">Priority</label>
          <select value={config.priority || "medium"} onChange={e => onChange({ ...config, priority: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      );
    case "backup":
      return (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground block">Backup Target</label>
          <select value={config.target || "all"} onChange={e => onChange({ ...config, target: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
            <option value="all">All Data</option>
            <option value="database">Database Only</option>
            <option value="models">Models & Config</option>
          </select>
        </div>
      );
    case "benchmark":
      return (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground block">Benchmark Prompt</label>
          <input value={config.prompt || ""} onChange={e => onChange({ ...config, prompt: e.target.value })}
            placeholder="Explain machine learning in simple terms"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/30" />
        </div>
      );
    default:
      return null;
  }
}

function AutomationCard({ auto, onToggle, onRun, onDelete, onRefresh }: {
  auto: Automation; onToggle: () => void; onRun: () => void; onDelete: () => void; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const countdown = useCountdown(auto.enabled ? auto.nextRun : null);
  const typeInfo = AUTOMATION_TYPES.find(t => t.value === auto.type);

  const formatTime = (ts: number | null) => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${auto.enabled ? "bg-green-500 animate-pulse" : "bg-gray-500"}`} />
            <div className="flex items-center gap-2">
              <span className="text-lg">{typeInfo?.icon || "⚡"}</span>
              <div>
                <div className="text-sm font-medium">{auto.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <span className="px-2 py-0.5 bg-white/5 rounded-full">{auto.type}</span>
                  <Clock className="w-3 h-3" />
                  <span>{auto.schedule}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {auto.enabled && countdown && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full">
                <Timer className="w-3 h-3" />
                {countdown}
              </div>
            )}
            <div className="text-right text-xs text-muted-foreground mr-2 hidden md:block">
              <div>Runs: {auto.runCount}</div>
              <div>Last: {formatTime(auto.lastRun)}</div>
            </div>
            <button onClick={onRun} className="p-2 rounded-lg hover:bg-white/5 text-blue-400" title="Run now">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onToggle} className="p-2 rounded-lg hover:bg-white/5" title={auto.enabled ? "Pause" : "Resume"}>
              {auto.enabled ? <Pause className="w-4 h-4 text-yellow-400" /> : <Play className="w-4 h-4 text-green-400" />}
            </button>
            <button onClick={() => setExpanded(!expanded)} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground" title="Details">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button onClick={onDelete} className="p-2 rounded-lg hover:bg-white/5 text-red-400" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="md:hidden mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span>Runs: {auto.runCount}</span>
          <span>Last: {formatTime(auto.lastRun)}</span>
          {auto.enabled && countdown && (
            <span className="flex items-center gap-1 text-amber-400">
              <Timer className="w-3 h-3" /> {countdown}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 p-4 bg-white/[0.02]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Settings className="w-3 h-3" /> Configuration
              </h4>
              {Object.keys(auto.config).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(auto.config).map(([key, val]) => (
                    <div key={key} className="text-xs">
                      <span className="text-muted-foreground">{key}:</span>{" "}
                      <span>{typeof val === "string" ? val.slice(0, 100) : JSON.stringify(val)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No custom configuration</p>
              )}
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Schedule Info</h4>
              <div className="space-y-1 text-xs">
                <div><span className="text-muted-foreground">Created:</span> {new Date(auto.createdAt).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Next Run:</span> {auto.nextRun ? new Date(auto.nextRun).toLocaleString() : "Not scheduled"}</div>
                <div><span className="text-muted-foreground">Status:</span> {auto.enabled ? "Active" : "Paused"}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Automations() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [history, setHistory] = useState<AutomationRun[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState({ name: "", type: "research", schedule: "every 1 hour", config: {} as Record<string, any> });
  const [loading, setLoading] = useState(true);

  const fetchAutomations = () => {
    fetch(api("/automations"))
      .then((r) => r.json())
      .then((d) => setAutomations(d.automations || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchHistory = () => {
    fetch(api("/automations/history"))
      .then((r) => r.json())
      .then((d) => setHistory(d.history || []))
      .catch(console.error);
  };

  useEffect(() => { fetchAutomations(); fetchHistory(); }, []);

  useEffect(() => {
    const interval = setInterval(() => { fetchAutomations(); fetchHistory(); }, 15000);
    return () => clearInterval(interval);
  }, []);

  const createAutomation = async () => {
    if (!form.name) return;
    await fetch(api("/automations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    setForm({ name: "", type: "research", schedule: "every 1 hour", config: {} });
    fetchAutomations();
  };

  const toggleEnabled = async (auto: Automation) => {
    await fetch(api(`/automations/${auto.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !auto.enabled }),
    });
    fetchAutomations();
  };

  const runNow = async (auto: Automation) => {
    await fetch(api(`/automations/${auto.id}/run`), { method: "POST" });
    fetchAutomations();
    setTimeout(fetchHistory, 2000);
  };

  const deleteAutomation = async (id: string) => {
    await fetch(api(`/automations/${id}`), { method: "DELETE" });
    fetchAutomations();
  };

  const successCount = history.filter(h => h.status === "success").length;
  const errorCount = history.filter(h => h.status === "error").length;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Workflow Automations</h1>
            <p className="text-sm text-muted-foreground">Schedule and monitor recurring tasks</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${showHistory ? "bg-blue-500/20 border border-blue-500/50 text-blue-300" : "glass-panel border border-white/10 text-muted-foreground hover:text-white"}`}
          >
            <History className="w-4 h-4" />
            History
            {history.length > 0 && <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded-full">{history.length}</span>}
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            New Automation
          </button>
        </div>
      </div>

      {automations.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass-panel rounded-xl border border-white/5 p-3 text-center">
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="text-xl font-bold text-green-400">{automations.filter(a => a.enabled).length}</div>
          </div>
          <div className="glass-panel rounded-xl border border-white/5 p-3 text-center">
            <div className="text-xs text-muted-foreground">Total Runs</div>
            <div className="text-xl font-bold">{automations.reduce((s, a) => s + a.runCount, 0)}</div>
          </div>
          <div className="glass-panel rounded-xl border border-white/5 p-3 text-center">
            <div className="text-xs text-muted-foreground">Succeeded</div>
            <div className="text-xl font-bold text-green-400">{successCount}</div>
          </div>
          <div className="glass-panel rounded-xl border border-white/5 p-3 text-center">
            <div className="text-xs text-muted-foreground">Failed</div>
            <div className="text-xl font-bold text-red-400">{errorCount}</div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="glass-panel rounded-xl border border-white/10 p-5 space-y-4">
          <h3 className="text-sm font-semibold">Create Automation</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My automation..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/30"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value, config: {} })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
              >
                {AUTOMATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label} — {t.desc}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Schedule</label>
              <select
                value={form.schedule}
                onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
              >
                {SCHEDULE_PRESETS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <ConfigForm type={form.type} config={form.config} onChange={(c) => setForm({ ...form, config: c })} />

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-white">Cancel</button>
            <button onClick={createAutomation} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600">Create</button>
          </div>
        </div>
      )}

      {showHistory && history.length > 0 && (
        <div className="glass-panel rounded-xl border border-white/10 p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4" /> Execution History
            <span className="text-xs text-muted-foreground">({history.length} runs)</span>
          </h3>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {history.slice(0, 20).map(run => {
              const auto = automations.find(a => a.id === run.automationId);
              return (
                <div key={run.id} className="flex items-center gap-3 p-2.5 bg-white/[0.03] rounded-lg">
                  {run.status === "success" ? (
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  ) : run.status === "error" ? (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{auto?.name || run.automationId}</div>
                    <div className="text-xs text-muted-foreground truncate">{run.result || "Running..."}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">{new Date(run.startedAt).toLocaleTimeString()}</div>
                    {run.durationMs != null && <div className="text-xs text-muted-foreground">{run.durationMs}ms</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : automations.length === 0 ? (
        <div className="glass-panel rounded-xl border border-white/5 p-12 text-center">
          <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No automations yet. Create one to schedule recurring tasks.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((auto) => (
            <AutomationCard
              key={auto.id}
              auto={auto}
              onToggle={() => toggleEnabled(auto)}
              onRun={() => runNow(auto)}
              onDelete={() => deleteAutomation(auto.id)}
              onRefresh={fetchAutomations}
            />
          ))}
        </div>
      )}
    </div>
  );
}
