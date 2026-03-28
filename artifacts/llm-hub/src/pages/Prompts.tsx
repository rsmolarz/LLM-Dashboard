import { useState, useEffect, useCallback } from "react";
import { BookOpen, Plus, Star, Copy, Search, Tag, Trash2, Edit2, Check, X, Loader2, RefreshCw } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface Prompt {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isFavorite: boolean;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

export default function Prompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterFav, setFilterFav] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "General", tags: "" });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [pr, cat] = await Promise.all([
        fetch(`${API}/prompts`).then(r => r.json()),
        fetch(`${API}/prompts/categories`).then(r => r.json()),
      ]);
      setPrompts(pr);
      setCategories(cat);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = prompts.filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.content.toLowerCase().includes(search.toLowerCase()) && !p.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))) return false;
    if (filterCat && p.category !== filterCat) return false;
    if (filterFav && !p.isFavorite) return false;
    return true;
  });

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    const body = { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) };
    if (editId) {
      await fetch(`${API}/prompts/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`${API}/prompts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowCreate(false);
    setEditId(null);
    setForm({ title: "", content: "", category: "General", tags: "" });
    setSaving(false);
    fetchAll();
  };

  const toggleFav = async (p: Prompt) => {
    await fetch(`${API}/prompts/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFavorite: !p.isFavorite }) });
    fetchAll();
  };

  const deletePrompt = async (id: string) => {
    await fetch(`${API}/prompts/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const copyPrompt = (p: Prompt) => {
    navigator.clipboard.writeText(p.content);
    setCopied(p.id);
    fetch(`${API}/prompts/${p.id}/use`, { method: "POST" });
    setTimeout(() => setCopied(null), 2000);
  };

  const startEdit = (p: Prompt) => {
    setEditId(p.id);
    setForm({ title: p.title, content: p.content, category: p.category, tags: p.tags.join(", ") });
    setShowCreate(true);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Prompt Library</h1>
            <p className="text-xs text-muted-foreground">{prompts.length} prompts saved</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchAll()} className="p-2 rounded-lg bg-white/5 text-muted-foreground hover:text-white"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => { setShowCreate(true); setEditId(null); setForm({ title: "", content: "", category: "General", tags: "" }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-xs text-amber-300 hover:bg-amber-500/30 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            New Prompt
          </button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-3 border-b border-white/5 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prompts..." className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500/50" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => setFilterFav(!filterFav)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filterFav ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-white/5 text-muted-foreground border border-white/10"}`}>
          <Star className={`w-3.5 h-3.5 ${filterFav ? "fill-amber-300" : ""}`} />
          Favorites
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {showCreate && (
          <div className="glass-panel rounded-xl p-4 border border-amber-500/20 space-y-3">
            <h3 className="text-sm font-semibold text-white">{editId ? "Edit Prompt" : "New Prompt"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Prompt title" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma separated)" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500/50" />
            </div>
            <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Prompt content..." rows={5} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none font-mono" />
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.content.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editId ? "Save" : "Create"}
              </button>
              <button onClick={() => { setShowCreate(false); setEditId(null); }} className="px-4 py-2 rounded-lg bg-white/5 text-xs text-muted-foreground hover:text-white"><X className="w-3.5 h-3.5 inline mr-1" />Cancel</button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-white mb-1">No Prompts Found</h3>
            <p className="text-xs text-muted-foreground">{search || filterCat || filterFav ? "Try adjusting your filters." : "Create your first prompt to get started."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(p => (
              <div key={p.id} className="glass-panel rounded-xl p-4 border border-white/5 hover:border-amber-500/20 transition-colors group">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-white">{p.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">{p.category}</span>
                      <span className="text-[10px] text-muted-foreground">Used {p.usageCount}x</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggleFav(p)} className="p-1.5 rounded hover:bg-white/10">
                      <Star className={`w-3.5 h-3.5 ${p.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                    </button>
                    <button onClick={() => copyPrompt(p)} className="p-1.5 rounded hover:bg-white/10">
                      {copied === p.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                    <button onClick={() => startEdit(p)} className="p-1.5 rounded hover:bg-white/10">
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => deletePrompt(p.id)} className="p-1.5 rounded hover:bg-white/10">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 font-mono bg-white/5 rounded-lg p-2 mt-2">{p.content}</p>
                {p.tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {p.tags.map(tag => (
                      <span key={tag} className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                        <Tag className="w-2.5 h-2.5" />{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
