import { useState, useEffect, useCallback } from "react";
import {
  Key, Plus, Trash2, Copy, Check, Loader2, RefreshCw, Shield, Eye, EyeOff,
  Activity, Zap, Server, Clock, ToggleLeft, ToggleRight, Code, ExternalLink,
  AlertCircle
} from "lucide-react";

const API = import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string;
  rateLimit: number;
  totalRequests: number;
  totalTokens: number;
  active: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface Usage {
  totalRequests: number;
  totalTokens: number;
  activeKeys: number;
  totalKeys: number;
  modelsCount: number;
  serverOnline: boolean;
}

export default function PlatformApi() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(60);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"keys" | "docs" | "usage">("keys");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const keysRes = await fetch(`${API}/api/platform-api/keys`).then(r => r.json());
      setKeys(keysRes.keys || []);
    } catch {}
    setLoading(false);
    try {
      const usageRes = await fetch(`${API}/api/platform-api/usage`).then(r => r.json());
      setUsage(usageRes);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const resp = await fetch(`${API}/api/platform-api/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), rateLimit: newKeyRateLimit }),
      });
      const data = await resp.json();
      if (data.key?.fullKey) {
        setRevealedKey(data.key.fullKey);
      }
      setNewKeyName("");
      setShowCreateForm(false);
      await fetchData();
    } catch {}
    setCreating(false);
  };

  const toggleKey = async (id: string, active: boolean) => {
    setTogglingId(id);
    try {
      await fetch(`${API}/api/platform-api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      await fetchData();
    } catch {}
    setTogglingId(null);
  };

  const deleteKey = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`${API}/api/platform-api/keys/${id}`, { method: "DELETE" });
      await fetchData();
    } catch {}
    setDeletingId(null);
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Key className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Platform API</h1>
            <p className="text-sm text-muted-foreground">OpenAI-compatible API for your LLM models</p>
          </div>
        </div>
        <button onClick={fetchData} className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm flex items-center gap-1.5 transition-all">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {usage && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="glass-panel rounded-xl p-3 border border-white/5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Key className="w-3 h-3" /> Active Keys</div>
            <div className="text-2xl font-bold text-white mt-1">{usage.activeKeys}</div>
          </div>
          <div className="glass-panel rounded-xl p-3 border border-white/5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> Total Requests</div>
            <div className="text-2xl font-bold text-white mt-1">{usage.totalRequests.toLocaleString()}</div>
          </div>
          <div className="glass-panel rounded-xl p-3 border border-white/5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> Total Tokens</div>
            <div className="text-2xl font-bold text-white mt-1">{usage.totalTokens.toLocaleString()}</div>
          </div>
          <div className="glass-panel rounded-xl p-3 border border-white/5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Server className="w-3 h-3" /> Models</div>
            <div className="text-2xl font-bold text-white mt-1">{usage.modelsCount}</div>
          </div>
          <div className="glass-panel rounded-xl p-3 border border-white/5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Shield className="w-3 h-3" /> Server</div>
            <div className={`text-2xl font-bold mt-1 ${usage.serverOnline ? "text-emerald-400" : "text-red-400"}`}>{usage.serverOnline ? "Online" : "Offline"}</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1">
        {[
          { key: "keys" as const, label: "API Keys", icon: Key },
          { key: "docs" as const, label: "Documentation", icon: Code },
          { key: "usage" as const, label: "Usage", icon: Activity },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${tab === t.key ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "keys" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">API Keys</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 text-xs font-medium transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Create Key
            </button>
          </div>

          {showCreateForm && (
            <div className="glass-panel rounded-xl border border-indigo-500/20 p-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Key Name</label>
                <input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., ENT Clinical Platform"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder:text-muted-foreground/50 focus:border-indigo-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Rate Limit (requests/minute)</label>
                <input
                  type="number"
                  value={newKeyRateLimit}
                  onChange={(e) => setNewKeyRateLimit(Number(e.target.value))}
                  min={1}
                  className="w-32 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:border-indigo-500/50 focus:outline-none"
                />
              </div>
              <button
                onClick={createKey}
                disabled={creating || !newKeyName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                Generate API Key
              </button>
            </div>
          )}

          {revealedKey && (
            <div className="glass-panel rounded-xl border border-amber-500/30 p-4 bg-amber-500/[0.03] space-y-2">
              <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
                <AlertCircle className="w-4 h-4" /> Save this key now — it won't be shown again
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 text-emerald-300 text-xs font-mono break-all">{revealedKey}</code>
                <button
                  onClick={() => copyText(revealedKey, "new-key")}
                  className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
                >
                  {copiedId === "new-key" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white" />}
                </button>
              </div>
              <button onClick={() => setRevealedKey(null)} className="text-[10px] text-muted-foreground hover:text-white transition-all">Dismiss</button>
            </div>
          )}

          {keys.length === 0 ? (
            <div className="glass-panel rounded-xl border border-white/5 p-8 text-center">
              <Key className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <div className="text-sm text-muted-foreground">No API keys yet. Create one to get started.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div key={k.id} className={`glass-panel rounded-xl border p-4 ${k.active ? "border-white/5" : "border-red-500/10 bg-red-500/[0.02]"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.active ? "bg-indigo-500/10" : "bg-red-500/10"}`}>
                        <Key className={`w-4 h-4 ${k.active ? "text-indigo-400" : "text-red-400"}`} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{k.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{k.keyPrefix}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleKey(k.id, k.active)}
                        disabled={togglingId === k.id}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
                        title={k.active ? "Deactivate" : "Activate"}
                      >
                        {k.active ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-gray-500" />}
                      </button>
                      <button
                        onClick={() => deleteKey(k.id)}
                        disabled={deletingId === k.id}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all"
                        title="Delete"
                      >
                        {deletingId === k.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {k.totalRequests.toLocaleString()} requests</span>
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {k.totalTokens.toLocaleString()} tokens</span>
                    <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {k.rateLimit}/min</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never used"}</span>
                    <span className={`px-1.5 py-0.5 rounded ${k.active ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>{k.active ? "Active" : "Disabled"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "docs" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Code className="w-5 h-5 text-cyan-400" /> API Documentation
          </h2>
          <p className="text-xs text-muted-foreground">OpenAI-compatible API. Use any OpenAI SDK or library by pointing it at your base URL.</p>

          <div className="glass-panel rounded-xl border border-white/5 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Base URL</h3>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 text-cyan-300 text-xs font-mono">{baseUrl}/api/v1</code>
              <button onClick={() => copyText(`${baseUrl}/api/v1`, "base-url")} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
                {copiedId === "base-url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-white" />}
              </button>
            </div>
          </div>

          <div className="glass-panel rounded-xl border border-white/5 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Authentication</h3>
            <p className="text-xs text-muted-foreground">Include your API key in the Authorization header:</p>
            <code className="block px-3 py-2 rounded-lg bg-black/40 text-amber-300 text-xs font-mono">Authorization: Bearer ent_your_api_key_here</code>
          </div>

          <div className="glass-panel rounded-xl border border-white/5 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Endpoints</h3>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">GET</span>
                  <code className="text-xs text-white font-mono">/v1/models</code>
                </div>
                <p className="text-xs text-muted-foreground mb-2">List all available models on the VPS.</p>
                <div className="bg-black/40 rounded-lg p-3 text-xs font-mono text-gray-300 whitespace-pre">{`curl ${baseUrl}/api/v1/models \\
  -H "Authorization: Bearer ent_xxx"`}</div>
              </div>

              <div className="border-t border-white/5 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">POST</span>
                  <code className="text-xs text-white font-mono">/v1/chat/completions</code>
                </div>
                <p className="text-xs text-muted-foreground mb-2">Send a chat completion request. Supports streaming.</p>
                <div className="bg-black/40 rounded-lg p-3 text-xs font-mono text-gray-300 whitespace-pre overflow-x-auto">{`curl ${baseUrl}/api/v1/chat/completions \\
  -H "Authorization: Bearer ent_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "meditron-7b-ent-trained:latest",
    "messages": [
      {"role": "system", "content": "You are an ENT specialist AI."},
      {"role": "user", "content": "What are the signs of vocal cord nodules?"}
    ],
    "temperature": 0.7,
    "stream": false
  }'`}</div>
              </div>

              <div className="border-t border-white/5 pt-4">
                <h4 className="text-xs font-semibold text-white mb-2">Python (OpenAI SDK)</h4>
                <div className="bg-black/40 rounded-lg p-3 text-xs font-mono text-gray-300 whitespace-pre overflow-x-auto">{`from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/api/v1",
    api_key="ent_your_key_here"
)

response = client.chat.completions.create(
    model="meditron-7b-ent-trained:latest",
    messages=[
        {"role": "system", "content": "You are an ENT specialist AI."},
        {"role": "user", "content": "Differential diagnosis for hoarseness"}
    ]
)

print(response.choices[0].message.content)`}</div>
              </div>

              <div className="border-t border-white/5 pt-4">
                <h4 className="text-xs font-semibold text-white mb-2">JavaScript / TypeScript</h4>
                <div className="bg-black/40 rounded-lg p-3 text-xs font-mono text-gray-300 whitespace-pre overflow-x-auto">{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}/api/v1",
  apiKey: "ent_your_key_here",
});

const completion = await client.chat.completions.create({
  model: "meditron-7b-ent-trained:latest",
  messages: [
    { role: "system", content: "You are an ENT specialist AI." },
    { role: "user", content: "Explain laryngeal stroboscopy" }
  ],
});

console.log(completion.choices[0].message.content);`}</div>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-xl border border-white/5 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Available Models</h3>
            <p className="text-xs text-muted-foreground">Your VPS currently serves these models:</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {["meditron-7b-ent-trained:latest", "qwen2.5:14b", "llava:13b", "deepseek-coder:6.7b", "deepseek-r1:8b", "meditron:7b", "mistral:latest", "llama3.2:latest", "qwen2.5:7b", "codellama:7b"].map(m => (
                <div key={m} className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[10px] font-mono text-white">{m}</div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-xl border border-white/5 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white">Request Parameters</h3>
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/10">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Parameter</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Type</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["model", "string", "Model name (required)"],
                    ["messages", "array", "Chat messages array (required)"],
                    ["temperature", "number", "Sampling temperature (0-2, default 0.7)"],
                    ["max_tokens", "number", "Max tokens to generate"],
                    ["stream", "boolean", "Enable SSE streaming (default false)"],
                    ["top_p", "number", "Nucleus sampling (0-1)"],
                    ["frequency_penalty", "number", "Frequency penalty (0-2)"],
                    ["presence_penalty", "number", "Presence penalty (0-2)"],
                  ].map(([param, type, desc]) => (
                    <tr key={param} className="border-b border-white/5">
                      <td className="px-3 py-2 font-mono text-cyan-300">{param}</td>
                      <td className="px-3 py-2 text-muted-foreground">{type}</td>
                      <td className="px-3 py-2 text-white/70">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "usage" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" /> Usage by Key
          </h2>

          {keys.length === 0 ? (
            <div className="glass-panel rounded-xl border border-white/5 p-8 text-center text-sm text-muted-foreground">No keys created yet.</div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/10">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Key Name</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Requests</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Tokens</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Rate Limit</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Last Used</th>
                    <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => (
                    <tr key={k.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{k.name}</div>
                        <div className="text-muted-foreground font-mono text-[10px]">{k.keyPrefix}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-white">{k.totalRequests.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-white">{k.totalTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{k.rateLimit}/min</td>
                      <td className="px-4 py-3 text-muted-foreground">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${k.active ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
                          {k.active ? "Active" : "Disabled"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
