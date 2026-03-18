import { useState } from "react";
import { Calendar, Edit3, Zap, BarChart3, Mic2, Loader2, Plus, Trash2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

type Tab = "calendar" | "posts" | "hooks" | "analytics" | "voice";

const TABS: { id: Tab; label: string; icon: any; desc: string }[] = [
  { id: "calendar", label: "Content Calendar", icon: Calendar, desc: "Plan your content" },
  { id: "posts", label: "Post Generator", icon: Edit3, desc: "Write viral posts" },
  { id: "hooks", label: "Viral Hooks", icon: Zap, desc: "Hook analyzer" },
  { id: "analytics", label: "Analytics", icon: BarChart3, desc: "Track performance" },
  { id: "voice", label: "Brand Voice", icon: Mic2, desc: "Define your voice" },
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
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">Content Calendar</h2><p className="text-gray-400 text-sm">AI-generated weekly content plan</p></div>
      </div>
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
              {item.hashtags && <p className="text-cyan-400 text-[10px] mt-2">{typeof item.hashtags === "string" ? item.hashtags : JSON.parse(item.hashtags || "[]").join(" ")}</p>}
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
  const [posts, setPosts] = useState<any[]>([]);

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

  const loadPosts = async () => {
    const r = await fetch(`${API}/social/posts`);
    setPosts(await r.json());
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Social Media Post Generator</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select value={platform} onChange={e => setPlatform(e.target.value)} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["Instagram", "TikTok", "YouTube", "Twitter/X", "LinkedIn"].map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={contentType} onChange={e => setContentType(e.target.value)} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["post", "reel script", "carousel", "story", "thread"].map(t => <option key={t}>{t}</option>)}
        </select>
        <button onClick={loadPosts} className="px-3 py-2 rounded bg-gray-700 text-gray-300 text-sm">View All Posts</button>
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
          {result.hashtags && (
            <p className="text-cyan-400 text-xs">{typeof result.hashtags === "string" ? JSON.parse(result.hashtags).join(" ") : result.hashtags}</p>
          )}
          {result.engagementScore && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Engagement Potential:</span>
              <div className="flex-1 h-2 bg-gray-700 rounded-full"><div className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${(result.engagementScore || 0) * 100}%` }} /></div>
              <span className="text-xs text-purple-400">{((result.engagementScore || 0) * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
      )}

      {posts.length > 0 && (
        <div className="space-y-2">{posts.slice(0, 8).map((p: any) => (
          <div key={p.id} className="p-3 bg-gray-800/50 rounded border border-gray-700">
            <div className="flex justify-between"><span className="text-white text-sm">{p.topic}</span><span className="text-xs text-purple-400">{p.platform}</span></div>
            <p className="text-gray-400 text-xs mt-1 truncate">{p.content?.substring(0, 100)}</p>
          </div>
        ))}</div>
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
      <p className="text-gray-400 text-sm">AI analyzes trending topics and generates scroll-stopping hooks</p>
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
            <div className="p-3 bg-gray-800/50 rounded border border-gray-700 text-center">
              <span className="text-xs text-gray-400 block">Trending</span>
              <span className="text-xl font-bold text-purple-400">{((result.parsed.trendingScore || 0) * 100).toFixed(0)}%</span>
            </div>
            <div className="p-3 bg-gray-800/50 rounded border border-gray-700 text-center">
              <span className="text-xs text-gray-400 block">Med. Accuracy</span>
              <span className="text-xl font-bold text-green-400">{((result.parsed.medicalAccuracy || 0) * 100).toFixed(0)}%</span>
            </div>
            <div className="p-3 bg-gray-800/50 rounded border border-gray-700 text-center">
              <span className="text-xs text-gray-400 block">Engagement</span>
              <span className="text-xl font-bold text-pink-400">{((result.parsed.engagementPotential || 0) * 100).toFixed(0)}%</span>
            </div>
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
  const [loading, setLoading] = useState(false);

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

  const getInsights = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/social/analytics/insights`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await r.json();
      alert(data.insights || "No insights available yet.");
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">Social Media Analytics</h2><p className="text-gray-400 text-sm">Track and analyze engagement metrics</p></div>
        <div className="flex gap-2">
          <button onClick={loadMetrics} className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm">Refresh</button>
          <button onClick={getInsights} disabled={loading} className="px-3 py-1.5 rounded bg-purple-600 text-white text-sm flex items-center gap-1">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} AI Insights
          </button>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <select value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["Instagram", "TikTok", "YouTube", "Twitter/X"].map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={form.metric} onChange={e => setForm(p => ({ ...p, metric: e.target.value }))} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["followers", "likes", "comments", "shares", "views", "impressions", "engagement_rate"].map(m => <option key={m}>{m}</option>)}
        </select>
        <input value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} type="number" placeholder="Value"
          className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        <select value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))} className="p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {["daily", "weekly", "monthly"].map(p => <option key={p}>{p}</option>)}
        </select>
        <button onClick={track} className="px-3 py-2 rounded bg-purple-600 text-white text-sm"><Plus className="w-4 h-4" /></button>
      </div>
      {metrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
  const [testContent, setTestContent] = useState("");
  const [voices, setVoices] = useState<any[]>([]);
  const [scoreResult, setScoreResult] = useState<any>(null);

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

  const scoreContent = async (voiceId: number) => {
    if (!testContent) return;
    const r = await fetch(`${API}/social/brand-voice/${voiceId}/score`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: testContent }),
    });
    setScoreResult(await r.json());
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
          <button onClick={create} className="px-4 py-2 rounded bg-purple-600 text-white text-sm"><Plus className="w-4 h-4 inline mr-1" />Create Voice</button>
          <button onClick={loadVoices} className="ml-2 px-4 py-2 rounded bg-gray-700 text-gray-300 text-sm">Load Voices</button>
        </div>
        <div className="space-y-3">
          <textarea value={testContent} onChange={e => setTestContent(e.target.value)} rows={3} placeholder="Paste content to score for brand consistency..."
            className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
          {voices.length > 0 && (
            <div className="flex gap-2 flex-wrap">{voices.map((v: any) => (
              <button key={v.id} onClick={() => scoreContent(v.id)} className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm hover:bg-purple-600/50">
                Score vs "{v.name}"
              </button>
            ))}</div>
          )}
          {scoreResult && (
            <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-gray-400">Consistency:</span>
                <span className="text-lg font-bold text-purple-400">{((scoreResult.score || 0) * 100).toFixed(0)}%</span>
              </div>
              <p className="text-gray-300 text-sm">{scoreResult.feedback}</p>
            </div>
          )}
        </div>
      </div>
      {voices.length > 0 && (
        <div className="space-y-2">{voices.map((v: any) => (
          <div key={v.id} className="p-3 bg-gray-800/50 rounded border border-gray-700 flex justify-between items-center">
            <div><span className="text-white font-medium">{v.name}</span><p className="text-gray-400 text-xs mt-0.5">{v.guidelines?.substring(0, 80)}</p></div>
          </div>
        ))}</div>
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

      <div className="grid grid-cols-5 gap-2 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`p-3 rounded-lg text-center transition-all ${tab === t.id ? "bg-purple-500/20 border border-purple-500/50" : "bg-gray-800/50 border border-gray-700 hover:border-gray-600"}`}>
            <t.icon className={`w-5 h-5 mx-auto mb-1 ${tab === t.id ? "text-purple-400" : "text-gray-400"}`} />
            <span className={`text-xs block ${tab === t.id ? "text-purple-300" : "text-gray-400"}`}>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        {tab === "calendar" && <ContentCalendarTab />}
        {tab === "posts" && <PostGeneratorTab />}
        {tab === "hooks" && <ViralHooksTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "voice" && <BrandVoiceTab />}
      </div>
    </div>
  );
}
