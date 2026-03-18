import { useState, useEffect } from "react";
import { Mic, Plus, Play, Trash2, Loader2, RefreshCw, Settings, MessageSquare, BarChart3, GitBranch, Cloud, HardDrive, Send, Zap, Trophy, Volume2, Bot } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

type Tab = "dashboard" | "providers" | "chat" | "benchmark" | "flows" | "cloud_providers" | "local_providers" | "conversations";

export default function VoiceAgent() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Mic className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Voice Agent Hub</h1>
          <p className="text-gray-400 text-sm">Compare cloud & local voice AI — Amazon Lex, ElevenLabs, OpenAI, Rasa, DeepPavlov, OpenVoice, Mycroft & Local LLM</p>
        </div>
      </div>

      <div className="overflow-x-auto pb-2 flex gap-2 mb-6">
        {([
          { id: "dashboard" as Tab, label: "Dashboard", icon: BarChart3 },
          { id: "providers" as Tab, label: "All Providers", icon: Settings },
          { id: "cloud_providers" as Tab, label: "Cloud Services", icon: Cloud },
          { id: "local_providers" as Tab, label: "Local Engines", icon: HardDrive },
          { id: "chat" as Tab, label: "Voice Chat", icon: MessageSquare },
          { id: "conversations" as Tab, label: "History", icon: Volume2 },
          { id: "benchmark" as Tab, label: "Benchmark", icon: Trophy },
          { id: "flows" as Tab, label: "Dialog Flows", icon: GitBranch },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${tab === t.id ? "bg-violet-500/20 border border-violet-500/50 text-violet-300" : "bg-gray-800/50 border border-gray-700 hover:border-gray-600 text-gray-400"}`}>
            <t.icon className="w-4 h-4" />
            <span className="text-sm">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "providers" && <ProvidersTab filter="all" />}
        {tab === "cloud_providers" && <ProvidersTab filter="cloud" />}
        {tab === "local_providers" && <ProvidersTab filter="local" />}
        {tab === "chat" && <ChatTab />}
        {tab === "conversations" && <ConversationsTab />}
        {tab === "benchmark" && <BenchmarkTab />}
        {tab === "flows" && <FlowsTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/voice-agent/dashboard`).then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>;

  const stats = data || { totalProviders: 0, cloudProviders: 0, localProviders: 0, totalConversations: 0, avgResponseTime: 0, totalBenchmarks: 0, totalFlows: 0, providers: [] };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Voice Agent Dashboard</h2>
        <button onClick={() => {
          fetch(`${API}/voice-agent/providers/init-all`, { method: "POST" }).then(r => r.json()).then(() => window.location.reload());
        }} className="px-4 py-2 bg-violet-500/20 border border-violet-500/50 rounded-lg text-violet-300 text-sm hover:bg-violet-500/30 flex items-center gap-2">
          <Zap className="w-4 h-4" /> Initialize All Providers
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Providers", value: stats.totalProviders, color: "violet" },
          { label: "Cloud Services", value: stats.cloudProviders, color: "blue" },
          { label: "Local Engines", value: stats.localProviders, color: "green" },
          { label: "Conversations", value: stats.totalConversations, color: "amber" },
        ].map(s => (
          <div key={s.label} className="p-4 bg-gray-800/40 rounded-xl border border-gray-700">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-sm text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700">
          <div className="text-lg font-bold">{stats.avgResponseTime}ms</div>
          <div className="text-sm text-gray-400">Avg Response Time</div>
        </div>
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700">
          <div className="text-lg font-bold">{stats.totalBenchmarks}</div>
          <div className="text-sm text-gray-400">Benchmarks Run</div>
        </div>
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700">
          <div className="text-lg font-bold">{stats.totalFlows}</div>
          <div className="text-sm text-gray-400">Dialog Flows</div>
        </div>
      </div>

      {stats.providers?.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Configured Providers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.providers.map((p: any) => (
              <div key={p.id} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${p.category === "cloud" ? "bg-blue-500/20" : "bg-green-500/20"}`}>
                  {p.category === "cloud" ? <Cloud className="w-4 h-4 text-blue-400" /> : <HardDrive className="w-4 h-4 text-green-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.model || p.provider}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-600/30 text-gray-400"}`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.recentConversations?.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Recent Conversations</h3>
          <div className="space-y-2">
            {stats.recentConversations.map((c: any) => (
              <div key={c.id} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-violet-400">{c.providerName}</span>
                  <span className="text-xs text-gray-500">{c.responseTimeMs}ms</span>
                </div>
                <div className="text-sm text-gray-300 truncate">Q: {c.userMessage}</div>
                <div className="text-xs text-gray-500 truncate mt-1">A: {c.agentResponse?.slice(0, 120)}...</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProvidersTab({ filter }: { filter: "all" | "cloud" | "local" }) {
  const [providers, setProviders] = useState<any[]>([]);
  const [registry, setRegistry] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/voice-agent/providers`).then(r => r.json()),
      fetch(`${API}/voice-agent/registry`).then(r => r.json()),
    ]).then(([p, r]) => {
      setProviders(p);
      setRegistry(r);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>;

  const filtered = filter === "all" ? providers : providers.filter(p => p.category === filter);
  const filteredRegistry = filter === "all" ? registry : registry.filter(r => r.category === filter);

  const titles: Record<string, string> = { all: "All Voice Providers", cloud: "Cloud Voice Services", local: "Local Voice Engines" };
  const descriptions: Record<string, string> = {
    all: "Manage all cloud and local voice AI providers",
    cloud: "Amazon Lex, ElevenLabs, OpenAI Voice, Google Dialogflow, Azure Speech, IBM Watson",
    local: "Rasa, DeepPavlov, OpenVoice, Mycroft, Local LLM (Ollama), Coqui TTS",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{titles[filter]}</h2>
          <p className="text-sm text-gray-400 mt-1">{descriptions[filter]}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => {
            fetch(`${API}/voice-agent/providers/init-all`, { method: "POST" }).then(() => load());
          }} className="px-3 py-2 bg-violet-500/20 border border-violet-500/50 rounded-lg text-violet-300 text-sm hover:bg-violet-500/30 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Init All
          </button>
          <button onClick={load} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 text-sm hover:bg-gray-700 flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Bot className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No providers configured yet</p>
          <p className="text-sm text-gray-500 mt-1">Click "Init All" to set up all {filter === "all" ? "" : filter} providers</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p: any) => {
            const caps = (() => { try { return JSON.parse(p.capabilities || "[]"); } catch { return []; } })();
            const regInfo = filteredRegistry.find((r: any) => r.provider === p.provider);

            return (
              <div key={p.id} className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.category === "cloud" ? "bg-blue-500/20" : "bg-green-500/20"}`}>
                      {p.category === "cloud" ? <Cloud className="w-5 h-5 text-blue-400" /> : <HardDrive className="w-5 h-5 text-green-400" />}
                    </div>
                    <div>
                      <h3 className="font-semibold">{p.name}</h3>
                      <div className="text-xs text-gray-500">{p.model || p.provider} · {p.category}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-600/30 text-gray-400"}`}>
                      {p.status}
                    </span>
                    <button onClick={() => {
                      if (editingId === p.id) { setEditingId(null); } else { setEditingId(p.id); setEditForm({ endpoint: p.endpoint || "", apiKey: p.apiKey || "", model: p.model || "" }); }
                    }} className="p-1.5 hover:bg-gray-700 rounded-lg"><Settings className="w-4 h-4 text-gray-400" /></button>
                    <button onClick={() => { fetch(`${API}/voice-agent/providers/${p.id}`, { method: "DELETE" }).then(() => load()); }} className="p-1.5 hover:bg-red-500/20 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {caps.map((c: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-gray-700/50 rounded-full text-gray-300">{c}</span>
                  ))}
                </div>

                {p.endpoint && <div className="text-xs text-gray-500 mb-1">Endpoint: {p.endpoint}</div>}
                {p.latencyMs && <div className="text-xs text-gray-500">Latency: {p.latencyMs}ms</div>}
                {p.qualityScore && <div className="text-xs text-gray-500">Quality: {(p.qualityScore * 100).toFixed(0)}%</div>}

                {editingId === p.id && (
                  <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
                    <input value={editForm.endpoint} onChange={e => setEditForm({ ...editForm, endpoint: e.target.value })} placeholder="API Endpoint URL" className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
                    <input value={editForm.apiKey} onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })} placeholder="API Key" type="password" className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
                    <input value={editForm.model} onChange={e => setEditForm({ ...editForm, model: e.target.value })} placeholder="Model ID" className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
                    <div className="flex gap-2">
                      <button onClick={() => {
                        fetch(`${API}/voice-agent/providers/${p.id}`, {
                          method: "PUT", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...editForm, status: "active" }),
                        }).then(() => { setEditingId(null); load(); });
                      }} className="px-3 py-1.5 bg-violet-500/20 border border-violet-500/50 rounded-lg text-violet-300 text-sm">Save & Activate</button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-700 rounded-lg text-gray-300 text-sm">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChatTab() {
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("ollama_local");
  const [selectedModel, setSelectedModel] = useState<string>("qwen2.5:7b");
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`${API}/voice-agent/providers`).then(r => r.json()).then(p => setProviders(p)).catch(() => {});
    fetch(`${API}/voice-agent/conversations`).then(r => r.json()).then(c => setConversations(c)).catch(() => {});
  }, []);

  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/voice-agent/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerName: selectedProvider, message, model: selectedModel }),
      });
      const data = await r.json();
      setConversations(prev => [data, ...prev]);
      setMessage("");
    } catch { }
    setSending(false);
  };

  const ollamaModels = ["qwen2.5:7b", "deepseek-r1:8b", "meditron:7b", "mistral:latest", "llama3.2:latest", "llava:13b"];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Voice Agent Chat</h2>
      <p className="text-sm text-gray-400">Test voice agents with text input — responses are generated by the selected provider. Local LLM uses your Ollama server.</p>

      <div className="flex gap-3 flex-wrap">
        <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm">
          <option value="ollama_local">Local LLM (Ollama)</option>
          {providers.filter(p => p.provider !== "ollama_local").map(p => (
            <option key={p.id} value={p.provider}>{p.name}</option>
          ))}
        </select>
        {selectedProvider === "ollama_local" && (
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm">
            {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      <div className="flex gap-2">
        <input value={message} onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Type a message to the voice agent..."
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm focus:border-violet-500 focus:outline-none" />
        <button onClick={send} disabled={sending || !message.trim()}
          className="px-6 py-3 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 rounded-xl text-white text-sm flex items-center gap-2">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </div>

      <div className="space-y-3">
        {conversations.map((c: any) => (
          <div key={c.id} className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-violet-400">{c.providerName}</span>
                {c.intentDetected && <span className="text-xs px-2 py-0.5 bg-gray-700/50 rounded-full text-gray-300">{c.intentDetected}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{c.responseTimeMs}ms</span>
                {c.confidence > 0 && <span>{(c.confidence * 100).toFixed(0)}% conf</span>}
              </div>
            </div>
            <div className="text-sm text-gray-300 mb-2 bg-gray-700/30 rounded-lg p-3">
              <span className="text-gray-500">You:</span> {c.userMessage}
            </div>
            <div className="text-sm text-gray-200 bg-gray-800/50 rounded-lg p-3">
              <span className="text-violet-400">Agent:</span> {c.agentResponse}
            </div>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No conversations yet. Send a message to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationsTab() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/voice-agent/conversations`).then(r => r.json()).then(setConversations).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>;

  const grouped = conversations.reduce((acc: any, c: any) => {
    const key = c.providerName || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Conversation History</h2>
      {Object.entries(grouped).map(([provider, convos]: any) => (
        <div key={provider}>
          <h3 className="font-medium text-violet-400 mb-2">{provider} ({convos.length})</h3>
          <div className="space-y-2">
            {convos.map((c: any) => (
              <div key={c.id} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{c.responseTimeMs}ms</span>
                  <span>{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <div className="text-sm text-gray-300">Q: {c.userMessage}</div>
                <div className="text-sm text-gray-400 mt-1 truncate">A: {c.agentResponse?.slice(0, 200)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {conversations.length === 0 && <p className="text-gray-500 text-center py-8">No conversation history yet.</p>}
    </div>
  );
}

function BenchmarkTab() {
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [name, setName] = useState("");
  const [prompts, setPrompts] = useState("Hello, how are you?\nWhat is the weather like today?\nTell me a joke.\nExplain artificial intelligence in one sentence.\nWhat time is it?");

  const load = () => {
    setLoading(true);
    fetch(`${API}/voice-agent/benchmarks`).then(r => r.json()).then(setBenchmarks).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const runBenchmark = async () => {
    if (!name.trim() || running) return;
    setRunning(true);
    try {
      const testPrompts = prompts.split("\n").filter(p => p.trim());
      const r = await fetch(`${API}/voice-agent/benchmark`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, testPrompts }),
      });
      const data = await r.json();
      setBenchmarks(prev => [data, ...prev]);
      setName("");
    } catch { }
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Provider Benchmark</h2>
      <p className="text-sm text-gray-400">Compare response times and quality across all configured voice providers. Local LLM gets real Ollama responses; others are simulated until API keys are configured.</p>

      <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700 space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Benchmark name (e.g., 'Q1 Voice Comparison')" className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
        <textarea value={prompts} onChange={e => setPrompts(e.target.value)} rows={5} placeholder="Test prompts (one per line)" className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm resize-none" />
        <button onClick={runBenchmark} disabled={running || !name.trim()}
          className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-white text-sm flex items-center gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Running Benchmark..." : "Run Benchmark"}
        </button>
      </div>

      {loading ? <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto" /> : benchmarks.map(b => {
        const winners = (() => { try { return JSON.parse(b.winners || "[]"); } catch { return []; } })();
        const results = (() => { try { return JSON.parse(b.results || "{}"); } catch { return {}; } })();

        return (
          <div key={b.id} className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">{b.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${b.status === "completed" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{b.status}</span>
              </div>
              <span className="text-xs text-gray-500">{new Date(b.createdAt).toLocaleString()}</span>
            </div>

            {winners.length > 0 && (
              <div className="mb-3">
                <h4 className="text-sm font-medium mb-2 text-gray-300">Rankings (by avg response time)</h4>
                <div className="space-y-1">
                  {winners.map((w: any, i: number) => (
                    <div key={w.name} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-500"}`}>
                          #{i + 1}
                        </span>
                        <span className="text-sm">{w.name}</span>
                        {i === 0 && <Trophy className="w-4 h-4 text-yellow-400" />}
                      </div>
                      <span className="text-sm text-gray-400">{w.avgTime}ms avg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(results).length > 0 && (
              <details className="mt-2">
                <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">View detailed results</summary>
                <div className="mt-2 space-y-2">
                  {Object.entries(results).map(([provider, resp]: any) => (
                    <div key={provider} className="p-2 bg-gray-800/30 rounded-lg">
                      <div className="text-sm font-medium text-violet-400 mb-1">{provider}</div>
                      {resp.map((r: any, i: number) => (
                        <div key={i} className="text-xs text-gray-400 mb-1">
                          <span className="text-gray-500">"{r.prompt}"</span> → {r.response?.slice(0, 100)}... <span className="text-gray-600">({r.timeMs}ms)</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlowsTab() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`${API}/voice-agent/flows`).then(r => r.json()).then(setFlows).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createFlow = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await fetch(`${API}/voice-agent/flows`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      setName("");
      setDescription("");
      load();
    } catch { }
    setCreating(false);
  };

  const generateFlow = async (id: number) => {
    try {
      await fetch(`${API}/voice-agent/flows/${id}/generate`, { method: "POST" });
      load();
    } catch { }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Dialog Flows</h2>
      <p className="text-sm text-gray-400">Design conversational dialog flows with AI-generated nodes and edges. Uses the local LLM to generate flow structures.</p>

      <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700 space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Flow name (e.g., 'Customer Support IVR')" className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Describe the conversation flow purpose..." className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm resize-none" />
        <button onClick={createFlow} disabled={creating || !name.trim()}
          className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-white text-sm flex items-center gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create Flow
        </button>
      </div>

      {loading ? <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto" /> : flows.map(f => {
        const nodes = (() => { try { return JSON.parse(f.nodes || "[]"); } catch { return []; } })();
        const edges = (() => { try { return JSON.parse(f.edges || "[]"); } catch { return []; } })();

        return (
          <div key={f.id} className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold">{f.name}</h3>
                {f.description && <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${f.status === "generated" ? "bg-green-500/20 text-green-400" : "bg-gray-600/30 text-gray-400"}`}>{f.status}</span>
                <button onClick={() => generateFlow(f.id)} className="p-1.5 hover:bg-violet-500/20 rounded-lg" title="Generate with AI">
                  <Zap className="w-4 h-4 text-violet-400" />
                </button>
                <button onClick={() => { fetch(`${API}/voice-agent/flows/${f.id}`, { method: "DELETE" }).then(() => load()); }}
                  className="p-1.5 hover:bg-red-500/20 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>

            {nodes.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-xs text-gray-500 mb-1">{nodes.length} nodes · {edges.length} edges</div>
                <div className="flex flex-wrap gap-2">
                  {nodes.slice(0, 8).map((n: any, i: number) => (
                    <div key={i} className="px-2 py-1 bg-gray-700/50 rounded-lg text-xs">
                      <span className="text-violet-400">{n.type || "node"}</span>: {n.content?.slice(0, 40) || n.id || `Node ${i}`}
                    </div>
                  ))}
                  {nodes.length > 8 && <span className="text-xs text-gray-500">+{nodes.length - 8} more</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {!loading && flows.length === 0 && <p className="text-gray-500 text-center py-8">No dialog flows created yet.</p>}
    </div>
  );
}
