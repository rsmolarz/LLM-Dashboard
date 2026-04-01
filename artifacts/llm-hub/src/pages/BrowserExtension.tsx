import { useState, useEffect, useCallback } from "react";
import {
  Chrome, Download, Key, Copy, Check, ExternalLink, Puzzle,
  Server, Shield, BarChart3, Zap, Globe, Settings, ArrowRight,
  MonitorSmartphone, Loader2, Plus, RefreshCw
} from "lucide-react";

const API = import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  active: boolean;
  createdAt: string;
}

export default function BrowserExtension() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const apiEndpoint = `${baseUrl}/api/v1`;

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/platform-api/keys`);
      const data = await res.json();
      setKeys((data.keys || []).filter((k: ApiKeyItem) => k.active));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const createKey = async () => {
    setCreating(true);
    try {
      const resp = await fetch(`${API}/api/platform-api/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "LLM-X Browser Extension", rateLimit: 60 }),
      });
      const data = await resp.json();
      if (data.key?.fullKey) {
        setRevealedKey(data.key.fullKey);
        setStep(2);
      }
      await fetchKeys();
    } catch {}
    setCreating(false);
  };

  const features = [
    { icon: Shield, label: "HIPAA Audit Logging", desc: "Every request logged with user, timestamp, and PHI flags" },
    { icon: BarChart3, label: "Usage Analytics", desc: "Track tokens, requests, and costs per API key" },
    { icon: Zap, label: "Rate Limiting", desc: "Per-key rate limits protect your VPS from overload" },
    { icon: Server, label: "Self-Hosted", desc: "All processing on your Ollama VPS — zero external API costs" },
    { icon: Key, label: "Key Management", desc: "Create, revoke, and monitor API keys from the dashboard" },
    { icon: Globe, label: "Access Anywhere", desc: "Use the extension from any network via your published URL" },
  ];

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Puzzle className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Browser Extension</h1>
          <p className="text-sm text-muted-foreground">Connect LLM-X to your self-hosted models via the Platform API</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-white/5 p-6 bg-gradient-to-r from-orange-500/[0.03] to-amber-500/[0.03]">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MonitorSmartphone className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">How It Works</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              LLM-X is an open-source browser extension that provides a chat interface for LLMs.
              By connecting it to your <span className="text-white font-medium">Platform API</span>, it
              routes all requests through your LLM Hub to your self-hosted Ollama server.
              This means <span className="text-emerald-400 font-medium">no OpenAI costs</span> — you're
              using the OpenAI-compatible protocol, but everything runs on your own VPS hardware.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {features.map((f, i) => (
          <div key={i} className="glass-panel rounded-xl border border-white/5 p-4">
            <f.icon className="w-5 h-5 text-orange-400 mb-2" />
            <div className="text-sm font-medium text-white">{f.label}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{f.desc}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-orange-400" /> Setup Guide
        </h2>

        <div className="space-y-4">
          <div className={`glass-panel rounded-xl border p-5 transition-all ${step === 1 ? "border-orange-500/30 bg-orange-500/[0.03]" : "border-white/5"}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${step === 1 ? "bg-orange-500 text-white" : "bg-white/10 text-muted-foreground"}`}>1</div>
              <h3 className="text-base font-semibold text-white">Install LLM-X Extension</h3>
            </div>
            <div className="ml-11 space-y-3">
              <p className="text-sm text-muted-foreground">Download and install the LLM-X browser extension:</p>
              <div className="flex flex-wrap gap-2">
                <a href="https://chromewebstore.google.com/detail/llm-x/pimhfannlnodahkaiajlbpnmagjdmhoe" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm text-white">
                  <Chrome className="w-4 h-4 text-blue-400" /> Chrome Web Store <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
                <a href="https://addons.mozilla.org/en-US/firefox/addon/llm-x/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm text-white">
                  <Globe className="w-4 h-4 text-orange-400" /> Firefox Add-ons <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
                <a href="https://github.com/mrdjohnson/llm-x" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm text-white">
                  <Download className="w-4 h-4 text-gray-400" /> GitHub Source <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              </div>
              {step === 1 && (
                <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-all mt-2">
                  I've installed it <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className={`glass-panel rounded-xl border p-5 transition-all ${step === 2 ? "border-orange-500/30 bg-orange-500/[0.03]" : "border-white/5"}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${step === 2 ? "bg-orange-500 text-white" : "bg-white/10 text-muted-foreground"}`}>2</div>
              <h3 className="text-base font-semibold text-white">Generate an API Key</h3>
            </div>
            <div className="ml-11 space-y-3">
              <p className="text-sm text-muted-foreground">Create a dedicated API key for the browser extension:</p>

              {revealedKey ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.03] p-3">
                    <div className="flex items-center gap-2 text-xs text-amber-400 font-medium mb-2">
                      <Shield className="w-3.5 h-3.5" /> Copy this key now — it won't be shown again
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 text-emerald-300 text-xs font-mono break-all select-all">{revealedKey}</code>
                      <button onClick={() => copyText(revealedKey, "new-key")} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all flex-shrink-0">
                        {copiedId === "new-key" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white" />}
                      </button>
                    </div>
                  </div>
                  <button onClick={() => { setRevealedKey(null); setStep(3); }} className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-all">
                    I've copied it <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button onClick={createKey} disabled={creating}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600/20 border border-orange-500/30 text-orange-400 text-sm font-medium hover:bg-orange-600/30 disabled:opacity-40 transition-all">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Generate Extension Key
                  </button>
                  {keys.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">or use an existing key from <a href="/platform-api" className="text-orange-400 hover:underline">Platform API</a></span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={`glass-panel rounded-xl border p-5 transition-all ${step === 3 ? "border-orange-500/30 bg-orange-500/[0.03]" : "border-white/5"}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${step === 3 ? "bg-orange-500 text-white" : "bg-white/10 text-muted-foreground"}`}>3</div>
              <h3 className="text-base font-semibold text-white">Configure LLM-X Connection</h3>
            </div>
            <div className="ml-11 space-y-4">
              <p className="text-sm text-muted-foreground">Open LLM-X and add a new <span className="text-white">OpenAI</span> connection with these settings:</p>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Connection Type</label>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-black/40 border border-white/10">
                    <span className="text-sm text-white font-medium">OpenAI</span>
                    <span className="text-[10px] text-muted-foreground">(OpenAI-compatible — routes to your Ollama server)</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Host / Base URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-cyan-300 text-sm font-mono">{apiEndpoint}</code>
                    <button onClick={() => copyText(apiEndpoint, "base-url")} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all flex-shrink-0">
                      {copiedId === "base-url" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">API Key</label>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-black/40 border border-white/10">
                    <span className="text-sm text-amber-300 font-mono">ent_your_api_key_here</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">(paste the key from Step 2)</span>
                  </div>
                </div>
              </div>

              {step === 3 && (
                <button onClick={() => setStep(4)} className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-all">
                  I've configured it <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className={`glass-panel rounded-xl border p-5 transition-all ${step === 4 ? "border-orange-500/30 bg-orange-500/[0.03]" : "border-white/5"}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${step === 4 ? "bg-orange-500 text-white" : "bg-white/10 text-muted-foreground"}`}>4</div>
              <h3 className="text-base font-semibold text-white">Select a Model & Start Chatting</h3>
            </div>
            <div className="ml-11 space-y-3">
              <p className="text-sm text-muted-foreground">
                In LLM-X, click the model selector and choose from your available Ollama models. 
                The extension will fetch the model list from your VPS automatically.
              </p>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Available Models on Your VPS</div>
                <div className="flex flex-wrap gap-1.5">
                  {["llama3.2:latest", "qwen2.5:14b", "qwen2.5:7b", "deepseek-r1:8b", "mistral:latest", "llava:13b", "codellama:7b", "meditron:7b", "deepseek-coder:6.7b", "meditron-7b-ent-trained:latest", "nomic-embed-text:latest", "mxbai-embed-large:latest"].map(m => (
                    <span key={m} className="px-2 py-1 rounded bg-white/[0.03] border border-white/5 text-[10px] font-mono text-white">{m}</span>
                  ))}
                </div>
              </div>
              {step === 4 && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.03] p-3 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm text-emerald-400 font-medium">You're all set! Start chatting with your self-hosted models from any browser tab.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Quick Reference</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Platform API Endpoint</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1.5 rounded bg-black/40 text-cyan-300 text-xs font-mono truncate">{apiEndpoint}</code>
              <button onClick={() => copyText(apiEndpoint, "ref-url")} className="p-1.5 rounded bg-white/5 hover:bg-white/10 transition-all">
                {copiedId === "ref-url" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-white" />}
              </button>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Active API Keys</div>
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              ) : (
                <span className="text-sm text-white font-medium">{keys.length} key{keys.length !== 1 ? "s" : ""}</span>
              )}
              <a href="/platform-api" className="text-[11px] text-orange-400 hover:underline">Manage keys →</a>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Alternative: Python / TypeScript SDK</h3>
        <p className="text-xs text-muted-foreground">You can also use the OpenAI SDK directly in your code:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-muted-foreground font-medium mb-1">Python</div>
            <pre className="bg-black/40 rounded-lg p-3 text-xs font-mono text-gray-300 whitespace-pre overflow-x-auto">{`from openai import OpenAI

client = OpenAI(
    base_url="${apiEndpoint}",
    api_key="ent_your_key"
)

r = client.chat.completions.create(
    model="llama3.2:latest",
    messages=[{"role": "user",
      "content": "Hello"}]
)
print(r.choices[0].message.content)`}</pre>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-medium mb-1">TypeScript</div>
            <pre className="bg-black/40 rounded-lg p-3 text-xs font-mono text-gray-300 whitespace-pre overflow-x-auto">{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiEndpoint}",
  apiKey: "ent_your_key",
});

const r = await client.chat
  .completions.create({
    model: "llama3.2:latest",
    messages: [{ role: "user",
      content: "Hello" }],
});
console.log(r.choices[0]
  .message.content);`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}