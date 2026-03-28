import { useState, useEffect, useCallback } from "react";
import { FileText, Plus, Mail, Clock, Play, Trash2, Eye, Loader2, Check, X, ToggleLeft, ToggleRight } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface Section { id: string; label: string; description: string; }
interface Schedule { id: string; name: string; frequency: string; email: string; sections: string[]; enabled: boolean; lastSent: number | null; nextSend: number | null; createdAt: number; }
interface Snapshot { id: string; scheduleId: string; generatedAt: number; sections: Record<string, any>; sentTo: string; status: string; }

export default function Reports() {
  const [sections, setSections] = useState<Section[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", frequency: "weekly", email: "", sections: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [tab, setTab] = useState<"schedules" | "history" | "preview">("schedules");

  const fetchAll = useCallback(async () => {
    try {
      const [sec, sch, snap] = await Promise.all([
        fetch(`${API}/reports/sections`).then(r => r.json()),
        fetch(`${API}/reports/schedules`).then(r => r.json()),
        fetch(`${API}/reports/history`).then(r => r.json()),
      ]);
      setSections(sec);
      setSchedules(sch);
      setSnapshots(snap);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createSchedule = async () => {
    if (!form.name.trim() || !form.email.trim() || form.sections.length === 0) return;
    setSaving(true);
    await fetch(`${API}/reports/schedules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowCreate(false);
    setForm({ name: "", frequency: "weekly", email: "", sections: [] });
    setSaving(false);
    fetchAll();
  };

  const toggleEnabled = async (s: Schedule) => {
    await fetch(`${API}/reports/schedules/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !s.enabled }) });
    fetchAll();
  };

  const sendNow = async (id: string) => {
    await fetch(`${API}/reports/schedules/${id}/send-now`, { method: "POST" });
    fetchAll();
  };

  const deleteSchedule = async (id: string) => {
    await fetch(`${API}/reports/schedules/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const generatePreview = async () => {
    if (form.sections.length === 0) return;
    const r = await fetch(`${API}/reports/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections: form.sections }) });
    const data = await r.json();
    setPreview(data);
    setTab("preview");
  };

  const toggleSection = (id: string) => {
    setForm(f => ({ ...f, sections: f.sections.includes(id) ? f.sections.filter(s => s !== id) : [...f.sections, id] }));
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Reports & Digests</h1>
            <p className="text-xs text-muted-foreground">Scheduled email summaries of platform activity</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(["schedules", "history", "preview"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${tab === t ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-muted-foreground hover:text-white bg-white/5"}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {tab === "schedules" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Report Schedules</h2>
              <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/30">
                <Plus className="w-3.5 h-3.5" />New Schedule
              </button>
            </div>

            {showCreate && (
              <div className="glass-panel rounded-xl p-4 border border-emerald-500/20 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Report name" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
                  <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email address" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Include Sections:</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {sections.map(s => (
                      <button key={s.id} onClick={() => toggleSection(s.id)} className={`p-2 rounded-lg text-left text-xs transition-colors ${form.sections.includes(s.id) ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-white/5 text-muted-foreground border border-white/10"}`}>
                        <div className="font-medium">{s.label}</div>
                        <div className="text-[9px] mt-0.5 opacity-70">{s.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={createSchedule} disabled={saving || !form.name.trim() || !form.email.trim() || form.sections.length === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Create
                  </button>
                  <button onClick={generatePreview} disabled={form.sections.length === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 text-xs text-muted-foreground hover:text-white disabled:opacity-50">
                    <Eye className="w-3.5 h-3.5" />Preview
                  </button>
                  <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-white/5 text-xs text-muted-foreground hover:text-white"><X className="w-3.5 h-3.5 inline mr-1" />Cancel</button>
                </div>
              </div>
            )}

            {schedules.length === 0 ? (
              <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
                <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No Report Schedules</h3>
                <p className="text-xs text-muted-foreground">Create a schedule to receive automated email digests of platform activity.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => (
                  <div key={s.id} className="glass-panel rounded-xl p-4 border border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleEnabled(s)}>
                          {s.enabled ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                        </button>
                        <div>
                          <h4 className="text-sm font-semibold text-white">{s.name}</h4>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span className="capitalize">{s.frequency}</span>
                            <span>to {s.email}</span>
                            <span>{s.sections.length} sections</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.nextSend && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Next: {new Date(s.nextSend).toLocaleDateString()}</span>}
                        <button onClick={() => sendNow(s.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] hover:bg-emerald-500/30"><Play className="w-3 h-3" />Send Now</button>
                        <button onClick={() => deleteSchedule(s.id)} className="p-1.5 rounded hover:bg-white/10"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "history" && (
          <>
            <h2 className="text-lg font-bold text-white">Sent Reports</h2>
            {snapshots.length === 0 ? (
              <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No Reports Sent</h3>
                <p className="text-xs text-muted-foreground">Reports will appear here after being generated.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshots.map(s => (
                  <div key={s.id} className="glass-panel rounded-xl p-4 border border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium text-white">{new Date(s.generatedAt).toLocaleString()}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">To: {s.sentTo}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.status === "sent" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>{s.status}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(s.sections).map(([key, val]) => (
                        <div key={key} className="p-2 rounded-lg bg-white/5">
                          <div className="text-[10px] text-muted-foreground capitalize mb-1">{key}</div>
                          {typeof val === "object" && Object.entries(val as any).map(([k, v]) => (
                            <div key={k} className="text-[10px] text-white flex justify-between">
                              <span className="text-muted-foreground">{k}:</span>
                              <span>{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "preview" && (
          <>
            <h2 className="text-lg font-bold text-white">Report Preview</h2>
            {!preview ? (
              <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
                <Eye className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No Preview</h3>
                <p className="text-xs text-muted-foreground">Select sections and click Preview to see a sample report.</p>
              </div>
            ) : (
              <div className="glass-panel rounded-xl p-4 border border-emerald-500/20">
                <div className="text-xs text-muted-foreground mb-3">Generated: {new Date(preview.generatedAt).toLocaleString()}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(preview.sections).map(([key, val]) => (
                    <div key={key} className="p-3 rounded-lg bg-white/5 border border-white/5">
                      <div className="text-xs font-semibold text-white capitalize mb-2">{key}</div>
                      {typeof val === "object" && Object.entries(val as any).map(([k, v]) => (
                        <div key={k} className="text-xs flex justify-between py-0.5">
                          <span className="text-muted-foreground">{k}:</span>
                          <span className="text-white font-medium">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
