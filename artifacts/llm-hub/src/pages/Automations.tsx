import { useState, useEffect } from "react";
import { Clock, Play, Pause, Trash2, Plus, Zap, RefreshCw } from "lucide-react";

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

const BASE = import.meta.env.BASE_URL || "/";
const api = (path: string) => `${BASE}api${path}`;

const AUTOMATION_TYPES = [
  { value: "research", label: "Research", desc: "Run deep research on a topic" },
  { value: "training", label: "Training", desc: "Trigger training data collection" },
  { value: "agent-task", label: "Agent Task", desc: "Run an agent task" },
  { value: "backup", label: "Backup", desc: "Create system backup" },
  { value: "benchmark", label: "Benchmark", desc: "Run model benchmarks" },
];

const SCHEDULE_PRESETS = [
  "every 30 mins",
  "every 1 hour",
  "every 6 hours",
  "every 12 hours",
  "every 1 day",
];

export default function Automations() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", type: "research", schedule: "every 1 hour" });
  const [loading, setLoading] = useState(true);

  const fetchAutomations = () => {
    fetch(api("/automations"))
      .then((r) => r.json())
      .then((d) => setAutomations(d.automations || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAutomations(); }, []);

  const createAutomation = async () => {
    if (!form.name) return;
    await fetch(api("/automations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    setForm({ name: "", type: "research", schedule: "every 1 hour" });
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
  };

  const deleteAutomation = async (id: string) => {
    await fetch(api(`/automations/${id}`), { method: "DELETE" });
    fetchAutomations();
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Workflow Automations</h1>
            <p className="text-sm text-muted-foreground">Schedule recurring tasks and workflows</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          New Automation
        </button>
      </div>

      {showCreate && (
        <div className="glass-panel rounded-xl border border-white/10 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Create Automation</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My automation..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                {AUTOMATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Schedule</label>
              <select
                value={form.schedule}
                onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                {SCHEDULE_PRESETS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-white">Cancel</button>
            <button onClick={createAutomation} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600">Create</button>
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
            <div key={auto.id} className="glass-panel rounded-xl border border-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${auto.enabled ? "bg-green-500 animate-pulse" : "bg-gray-500"}`} />
                  <div>
                    <div className="text-sm font-medium text-white">{auto.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span className="px-2 py-0.5 bg-white/5 rounded-full">{auto.type}</span>
                      <Clock className="w-3 h-3" />
                      <span>{auto.schedule}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right text-xs text-muted-foreground mr-3 hidden md:block">
                    <div>Runs: {auto.runCount}</div>
                    <div>Last: {formatTime(auto.lastRun)}</div>
                  </div>
                  <button onClick={() => runNow(auto)} className="p-2 rounded-lg hover:bg-white/5 text-blue-400" title="Run now">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleEnabled(auto)} className="p-2 rounded-lg hover:bg-white/5" title={auto.enabled ? "Pause" : "Resume"}>
                    {auto.enabled ? <Pause className="w-4 h-4 text-yellow-400" /> : <Play className="w-4 h-4 text-green-400" />}
                  </button>
                  <button onClick={() => deleteAutomation(auto.id)} className="p-2 rounded-lg hover:bg-white/5 text-red-400" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
