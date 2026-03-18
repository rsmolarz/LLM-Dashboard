import { useState } from "react";
import { Calendar, Edit3, Zap, BarChart3, Mic2, Loader2, Plus, Trash2, Hash, Eye, TrendingUp, Type, Film, Users } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

type Tab = "calendar" | "posts" | "hooks" | "analytics" | "voice" | "hashtags" | "competitors" | "engagement" | "captions" | "reels" | "personas";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "calendar", label: "Content Calendar", icon: Calendar },
  { id: "posts", label: "Post Generator", icon: Edit3 },
  { id: "hooks", label: "Viral Hooks", icon: Zap },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "voice", label: "Brand Voice", icon: Mic2 },
  { id: "hashtags", label: "Hashtag Strategy", icon: Hash },
  { id: "competitors", label: "Competitor Analysis", icon: Eye },
  { id: "engagement", label: "Engagement Predictor", icon: TrendingUp },
  { id: "captions", label: "Caption Writer", icon: Type },
  { id: "reels", label: "Reel Scripts", icon: Film },
  { id: "personas", label: "Audience Personas", icon: Users },
];

function ContentCalendarTab() {
  const [platform, setPlatform] = useState("Instagram");
  const [niche, setNiche] = useState("ENT doctor / medical education / finance");
  const [loading, setLoading] = useState(false);
  const [calendar, setCalendar] = useState<any[]>([]);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/social/calendar/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, niche, postsPerWeek: 7 }),
      });
      const data = await r.json();
      setCalendar(data.calendar || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-white">Content Calendar</h2><p className="text-gray-400 text-sm">AI-generated weekly content plan</p></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-sm text-gray-400">Platform</label>
          <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
            {["Instagram", "TikTok", "YouTube", "Twitter/X", "LinkedIn"].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-sm text-gray-400">Niche / Focus</label>
          <input value={niche} onChange={e => setNiche(e.target.value)} className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        </div>
      </div>
      <button onClick={generate} disabled={loading}
        className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium disabled:opacity-50 flex items-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} Generate Week
      </button>
      {calendar.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {calendar.map((item: any, i: number) => (
            <div key={i} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">{item.contentType}</span>
                <span className="text-xs text-gray-500">{item.scheduledDate}</span>
              </div>
              <h4 className="text-white text-sm font-medium">{item.topic}</h4>
              <p className="text-gray-400 text-xs mt-1">{item.content?.substring(0, 120)}...</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostGeneratorTab() {
  const [platform, setPlatform] = useState("Instagram");
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState("post");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/social/posts/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, topic, contentType }),
      });
      setResult(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Social Media Post Generator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select value={platform} onChange={e => setPlatform(e.target.value)} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["Instagram", "TikTok", "YouTube", "Twitter/X", "LinkedIn"].map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={contentType} onChange={e => setContentType(e.target.value)} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["post", "reel script", "carousel", "story", "thread"].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={2} placeholder="What should this post be about?"
        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
      <button onClick={generate} disabled={loading || !topic}
        className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium disabled:opacity-50 flex items-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />} Generate Post
      </button>
      {result && (
        <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700 space-y-3">
          {result.hooks && <p className="text-purple-400 font-medium text-sm">Hook: {result.hooks}</p>}
          <p className="text-gray-300 text-sm whitespace-pre-wrap">{result.content}</p>
          {result.engagementScore && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Engagement:</span>
              <div className="flex-1 h-2 bg-gray-700 rounded-full"><div className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${(result.engagementScore || 0) * 100}%` }} /></div>
              <span className="text-xs text-purple-400">{((result.engagementScore || 0) * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ViralHooksTab() {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const analyze = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/social/hooks/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, platform }),
      });
      setResult(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Viral Hook Analyzer</h2>
      <div className="flex gap-3">
        <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Enter topic or trend..."
          className="flex-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <select value={platform} onChange={e => setPlatform(e.target.value)} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["Instagram", "TikTok", "YouTube", "Twitter/X"].map(p => <option key={p}>{p}</option>)}
        </select>
        <button onClick={analyze} disabled={loading || !topic}
          className="px-4 py-2 rounded bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analyze"}
        </button>
      </div>
      {result?.parsed && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[["Trending", result.parsed.trendingScore, "text-purple-400"], ["Med. Accuracy", result.parsed.medicalAccuracy, "text-green-400"], ["Engagement", result.parsed.engagementPotential, "text-pink-400"]].map(([label, val, color]) => (
              <div key={label as string} className="p-3 bg-gray-800/50 rounded border border-gray-700 text-center">
                <span className="text-xs text-gray-400 block">{label as string}</span>
                <span className={`text-xl font-bold ${color}`}>{(((val as number) || 0) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {(result.parsed.hooks || []).map((h: any, i: number) => (
              <div key={i} className="p-3 bg-gray-800/50 rounded border border-gray-700">
                <p className="text-white text-sm font-medium">"{h.hook || h}"</p>
                {h.style && <span className="text-xs text-purple-400 mt-1 block">Style: {h.style}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const [form, setForm] = useState({ platform: "Instagram", metric: "followers", value: "", period: "daily" });
  const [metrics, setMetrics] = useState<any[]>([]);

  const track = async () => {
    if (!form.value) return;
    await fetch(`${API}/social/analytics/track`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, value: parseFloat(form.value) }),
    });
    loadMetrics();
  };

  const loadMetrics = async () => {
    const r = await fetch(`${API}/social/analytics`);
    setMetrics(await r.json());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">Social Media Analytics</h2></div>
        <button onClick={loadMetrics} className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm">Refresh</button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <select value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["Instagram", "TikTok", "YouTube", "Twitter/X"].map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={form.metric} onChange={e => setForm(p => ({ ...p, metric: e.target.value }))} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["followers", "likes", "comments", "shares", "views", "engagement_rate"].map(m => <option key={m}>{m}</option>)}
        </select>
        <input value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} type="number" placeholder="Value"
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <select value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["daily", "weekly", "monthly"].map(p => <option key={p}>{p}</option>)}
        </select>
        <button onClick={track} className="px-3 py-2 rounded bg-purple-600 text-white text-sm"><Plus className="w-4 h-4" /></button>
      </div>
      {metrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {metrics.slice(0, 12).map((m: any) => (
            <div key={m.id} className="p-3 bg-gray-800/50 rounded border border-gray-700">
              <div className="flex justify-between"><span className="text-gray-400 text-xs">{m.platform}</span><span className="text-gray-500 text-xs">{m.period}</span></div>
              <p className="text-white font-medium">{m.metric}: <span className="text-purple-400">{m.value}</span></p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandVoiceTab() {
  const [name, setName] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [voices, setVoices] = useState<any[]>([]);

  const create = async () => {
    if (!name) return;
    await fetch(`${API}/social/brand-voice`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, guidelines, toneAttributes: ["professional", "approachable", "educational"] }),
    });
    loadVoices();
    setName(""); setGuidelines("");
  };

  const loadVoices = async () => {
    const r = await fetch(`${API}/social/brand-voice`);
    setVoices(await r.json());
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Brand Voice Trainer</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Brand voice name"
            className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
          <textarea value={guidelines} onChange={e => setGuidelines(e.target.value)} rows={4} placeholder="Describe your brand voice guidelines..."
            className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
          <div className="flex gap-2">
            <button onClick={create} className="px-4 py-2 rounded bg-purple-600 text-white text-sm"><Plus className="w-4 h-4 inline mr-1" />Create</button>
            <button onClick={loadVoices} className="px-4 py-2 rounded bg-gray-700 text-gray-300 text-sm">Load</button>
          </div>
        </div>
        <div className="space-y-2">
          {voices.map((v: any) => (
            <div key={v.id} className="p-3 bg-gray-800/50 rounded border border-gray-700">
              <span className="text-white font-medium">{v.name}</span>
              <p className="text-gray-400 text-xs mt-0.5">{v.guidelines?.substring(0, 80)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SimpleGenTab({ title, desc, endpoint, fields, resultKey }: { title: string; desc: string; endpoint: string; fields: { key: string; label: string; type?: string; options?: string[] }[]; resultKey: string }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      setResult(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="text-gray-400 text-sm">{desc}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-sm text-gray-400">{f.label}</label>
            {f.options ? (
              <select value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
                <option value="">Select...</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} rows={3}
                className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
            ) : (
              <input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
            )}
          </div>
        ))}
      </div>
      <button onClick={generate} disabled={loading}
        className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium disabled:opacity-50 flex items-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Generate
      </button>
      {result && (
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <pre className="text-gray-300 text-sm whitespace-pre-wrap">{result[resultKey] || result.caption || result.script || result.contentStrategy || JSON.stringify(result.parsed || result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default function Social() {
  const [tab, setTab] = useState<Tab>("calendar");

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Social Media AI</h1>
          <p className="text-gray-400 text-sm">AI-powered content creation and analytics for medical influencers</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all ${tab === t.id ? "bg-purple-500/20 border border-purple-500/50 text-purple-300" : "bg-gray-800/50 border border-gray-700 hover:border-gray-600 text-gray-400"}`}>
            <t.icon className="w-4 h-4" />
            <span className="text-xs">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        {tab === "calendar" && <ContentCalendarTab />}
        {tab === "posts" && <PostGeneratorTab />}
        {tab === "hooks" && <ViralHooksTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "voice" && <BrandVoiceTab />}
        {tab === "hashtags" && <SimpleGenTab title="Hashtag Strategy Generator" desc="AI-optimized hashtag tiers for maximum reach"
          endpoint="/social/hashtag-strategy/generate"
          fields={[
            { key: "niche", label: "Niche / Topic" },
            { key: "platform", label: "Platform", options: ["Instagram", "TikTok", "YouTube", "Twitter/X", "LinkedIn"] },
          ]} resultKey="reachEstimate" />}
        {tab === "competitors" && <SimpleGenTab title="Competitor Analysis" desc="AI-powered competitor content strategy analysis"
          endpoint="/social/competitor-analysis/analyze"
          fields={[
            { key: "competitorHandle", label: "Competitor Handle (@username)" },
            { key: "platform", label: "Platform", options: ["Instagram", "TikTok", "YouTube", "Twitter/X", "LinkedIn"] },
          ]} resultKey="contentStrategy" />}
        {tab === "engagement" && <SimpleGenTab title="Engagement Predictor" desc="Predict likes, comments, shares, and viral probability"
          endpoint="/social/engagement-predictor/predict"
          fields={[
            { key: "content", label: "Post Content", type: "textarea" },
            { key: "platform", label: "Platform", options: ["Instagram", "TikTok", "YouTube", "Twitter/X", "LinkedIn"] },
            { key: "postType", label: "Post Type", options: ["image", "video", "carousel", "text", "reel", "story"] },
          ]} resultKey="suggestions" />}
        {tab === "captions" && <SimpleGenTab title="Caption Writer" desc="AI-generated captions with hashtags and CTAs"
          endpoint="/social/captions/generate"
          fields={[
            { key: "imageDescription", label: "Image/Content Description", type: "textarea" },
            { key: "platform", label: "Platform", options: ["Instagram", "TikTok", "YouTube", "Twitter/X", "LinkedIn"] },
            { key: "tone", label: "Tone", options: ["professional", "casual", "educational", "humorous", "inspirational", "storytelling"] },
          ]} resultKey="caption" />}
        {tab === "reels" && <SimpleGenTab title="Reel / Short-form Script Generator" desc="AI-written scripts with visual cues and hooks"
          endpoint="/social/reel-scripts/generate"
          fields={[
            { key: "topic", label: "Video Topic" },
            { key: "platform", label: "Platform", options: ["Instagram Reels", "TikTok", "YouTube Shorts"] },
            { key: "duration", label: "Duration", options: ["15s", "30s", "60s", "90s"] },
          ]} resultKey="script" />}
        {tab === "personas" && <SimpleGenTab title="Audience Persona Builder" desc="AI-generated detailed audience personas"
          endpoint="/social/audience-personas/generate"
          fields={[
            { key: "niche", label: "Niche Focus (e.g., medical education + lifestyle)" },
          ]} resultKey="demographics" />}
      </div>
    </div>
  );
}
