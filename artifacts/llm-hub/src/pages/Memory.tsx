import { useState, useEffect, useCallback } from "react";
import { BrainCircuit, Plus, Search, Trash2, Edit2, Check, X, Loader2, Sparkles, Eye } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  category: string;
  source: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessed: number | null;
}

export default function Memory() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ key: "", value: "", category: "fact", source: "user", confidence: "1.0" });
  const [saving, setSaving] = useState(false);
  const [contextView, setContextView] = useState<string | null>(null);
  const [tab, setTab] = useState<"entries" | "context">("entries");

  const fetchAll = useCallback(async () => {
    try {
      const [mem, cat] = await Promise.all([
        fetch(`${API}/memory`).then(r => r.json()),
        fetch(`${API}/memory/categories`).then(r => r.json()),
      ]);
      setMemories(mem);
      setCategories(cat);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadContext = async () => {
    const r = await fetch(`${API}/memory/context`);
    const d = await r.json();
    setContextView(d.context);
    setTab("context");
  };

  const filtered = memories.filter(m => {
    if (search && !m.key.toLowerCase().includes(search.toLowerCase()) && !m.value.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat && m.category !== filterCat) return false;
    return true;
  });

  const handleSave = async () => {
    if (!form.key.trim() || !form.value.trim()) return;
    setSaving(true);
    const body = { ...form, confidence: parseFloat(form.confidence) || 1.0 };
    if (editId) {
      await fetch(`${API}/memory/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`${API}/memory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowCreate(false); setEditId(null);
    setForm({ key: "", value: "", category: "fact", source: "user", confidence: "1.0" });
    setSaving(false);
    fetchAll();
  };

  const deleteMemory = async (id: string) => {
    await fetch(`${API}/memory/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const startEdit = (m: MemoryEntry) => {
    setEditId(m.id);
    setForm({ key: m.key, value: m.value, category: m.category, source: m.source, confidence: m.confidence.toString() });
    setShowCreate(true);
    setTab("entries");
  };

  const catColor = (cat: string) => {
    const colors: Record<string, string> = {
      preference: "bg-blue-500/10 text-blue-400",
      fact: "bg-green-500/10 text-green-400",
      context: "bg-violet-500/10 text-violet-400",
      instruction: "bg-amber-500/10 text-amber-400",
      persona: "bg-pink-500/10 text-pink-400",
    };
    return colors[cat] || "bg-white/10 text-white";
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Memory</h1>
            <p className="text-xs text-muted-foreground">{memories.length} facts stored for long-term context</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab("entries")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === "entries" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-muted-foreground bg-white/5"}`}>Entries</button>
          <button onClick={loadContext} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ${tab === "context" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-muted-foreground bg-white/5"}`}>
            <Eye className="w-3.5 h-3.5" />Context View
          </button>
          <button onClick={() => { setShowCreate(true); setEditId(null); setForm({ key: "", value: "", category: "fact", source: "user", confidence: "1.0" }); setTab("entries"); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-xs text-indigo-300 hover:bg-indigo-500/30">
            <Plus className="w-3.5 h-3.5" />Add Memory
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {tab === "context" && contextView !== null && (
          <div className="glass-panel rounded-xl p-4 border border-indigo-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Active Context (Top 10 by usage)</h3>
            </div>
            <pre className="text-xs text-white/80 font-mono whitespace-pre-wrap bg-black/30 rounded-lg p-4">{contextView}</pre>
            <p className="text-[10px] text-muted-foreground mt-2">This context string is injected into LLM system prompts for personalized responses.</p>
          </div>
        )}

        {tab === "entries" && (
          <>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search memories..." className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50" />
              </div>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {showCreate && (
              <div className="glass-panel rounded-xl p-4 border border-indigo-500/20 space-y-3">
                <h3 className="text-sm font-semibold text-white">{editId ? "Edit Memory" : "New Memory"}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} placeholder="Key (e.g. preferred_language)" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono focus:outline-none focus:border-indigo-500/50" />
                  <div className="grid grid-cols-3 gap-2">
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                      <option value="user">User</option>
                      <option value="inferred">Inferred</option>
                      <option value="system">System</option>
                    </select>
                    <input value={form.confidence} onChange={e => setForm({ ...form, confidence: e.target.value })} placeholder="1.0" type="number" min="0" max="1" step="0.1" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none" />
                  </div>
                </div>
                <textarea value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="Value..." rows={3} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50 resize-none" />
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving || !form.key.trim() || !form.value.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 disabled:opacity-50">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}{editId ? "Save" : "Create"}
                  </button>
                  <button onClick={() => { setShowCreate(false); setEditId(null); }} className="px-4 py-2 rounded-lg bg-white/5 text-xs text-muted-foreground hover:text-white"><X className="w-3.5 h-3.5 inline mr-1" />Cancel</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {filtered.map(m => (
                <div key={m.id} className="glass-panel rounded-xl p-4 border border-white/5 hover:border-indigo-500/20 transition-colors group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-mono font-semibold text-white">{m.key}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${catColor(m.category)}`}>{m.category}</span>
                        <span className="text-[10px] text-muted-foreground">{m.source}</span>
                      </div>
                      <p className="text-xs text-white/80">{m.value}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <span>Confidence: {(m.confidence * 100).toFixed(0)}%</span>
                        <span>Accessed: {m.accessCount}x</span>
                        <span>Updated: {new Date(m.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(m)} className="p-1.5 rounded hover:bg-white/10"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => deleteMemory(m.id)} className="p-1.5 rounded hover:bg-white/10"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                  <div className="w-full h-1 rounded-full bg-white/5 mt-3">
                    <div className="h-full rounded-full bg-indigo-500/50" style={{ width: `${m.confidence * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
