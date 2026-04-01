import { useState, useEffect, useCallback } from "react";
import {
  Chrome, Download, Key, Copy, Check, ExternalLink, Puzzle,
  Server, Shield, BarChart3, Zap, Globe, Settings, ArrowRight,
  MonitorSmartphone, Loader2, Plus, RefreshCw, Star, MessageSquare,
  Sparkles, Router, Cpu
} from "lucide-react";

const API = import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  active: boolean;
  createdAt: string;
}

interface VpsModel {
  name: string;
  size: number;
  parameterSize?: string | null;
  family?: string | null;
}

const COMPATIBLE_EXTENSIONS = [
  {
    name: "Chatbox",
    desc: "Full-featured AI client with conversation history, model switching, and streaming. Best for OpenRouter models (Claude, GPT, Gemini). Available as extension and desktop app.",
    chrome: "https://chromewebstore.google.com/detail/chatbox/kdnahhmjfhbinoidjdhcbhpnbjjknmcm",
    firefox: null,
    recommended: true,
    mode: "openai" as const,
  },
  {
    name: "Page Assist",
    desc: "Built for Ollama. Reads web pages, sidebar + popup modes. Best for connecting directly to your VPS. Auto-detects models.",
    chrome: "https://chromewebstore.google.com/detail/page-assist/jfgfiigpkhlkbnfnbobbkinehhfdhndo",
    firefox: "https://addons.mozilla.org/en-US/firefox/addon/page-assist/",
    recommended: true,
    mode: "ollama" as const,
  },
  {
    name: "Smart Sidebar",
    desc: "AI sidebar supporting ChatGPT, Claude, and custom OpenAI-compatible endpoints. Set your Base URL and API key in settings.",
    chrome: "https://chromewebstore.google.com/detail/smart-sidebar/eiacnkgginjlofehicmaecaifcmbelf",
    firefox: null,
    recommended: false,
    mode: "openai" as const,
  },
  {
    name: "LLM-X",
    desc: "Open-source browser extension built specifically for self-hosted LLMs. Supports OpenAI-compatible connections.",
    chrome: "https://chromewebstore.google.com/detail/llm-x/pimhfannlnodahkaiajlbpnmagjdmhoe",
    firefox: "https://addons.mozilla.org/en-US/firefox/addon/llm-x/",
    recommended: false,
    mode: "openai" as const,
  },
];

const OPENROUTER_MODELS = [
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", tier: "premium" },
  { id: "openai/gpt-5.4", label: "GPT-5.4", tier: "premium" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", tier: "premium" },
  { id: "anthropic/claude-haiku-3.5", label: "Claude Haiku 3.5", tier: "fast" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", tier: "fast" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3", tier: "free" },
  { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout", tier: "budget" },
  { id: "mistralai/mistral-small-2603", label: "Mistral Small", tier: "budget" },
];

export default function BrowserExtension() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [vpsModels, setVpsModels] = useState<VpsModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const apiEndpoint = `${baseUrl}/api/v1`;
  const ollamaEndpoint = `${baseUrl}/api/ollama`;
  const vpsOllamaUrl = "http://72.60.167.64:11434";

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/platform-api/keys`);
      const data = await res.json();
      setKeys((data.keys || []).filter((k: ApiKeyItem) => k.active));
    } catch {}
    setLoading(false);
  }, []);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await fetch(`${API}/api/llm/models`);
      const data = await res.json();
      const list = (data.models || data || []).map((m: any) => ({
        name: m.name || m.id,
        size: m.size || 0,
        parameterSize: m.parameterSize || null,
        family: m.family || null,
      }));
      setVpsModels(list);
    } catch {}
    setModelsLoading(false);
  }, []);

  useEffect(() => { fetchKeys(); fetchModels(); }, [fetchKeys, fetchModels]);

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
        body: JSON.stringify({ name: "Browser Extension", rateLimit: 60 }),
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
    { icon: Sparkles, label: "OpenRouter Models", desc: "Access Claude, GPT, Gemini, Llama & 300+ models via OpenRouter" },
    { icon: Server, label: "VPS Models (Free)", desc: "12 self-hosted models on your VPS — zero API costs" },
    { icon: Shield, label: "HIPAA Audit Logging", desc: "Every request logged with user, timestamp, and PHI flags" },
    { icon: BarChart3, label: "Usage Analytics", desc: "Track tokens, requests, and costs per API key" },
    { icon: Zap, label: "Rate Limiting", desc: "Per-key rate limits protect your VPS from overload" },
    { icon: Key, label: "Key Management", desc: "Create, revoke, and monitor API keys from the dashboard" },
  ];

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Puzzle className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Browser Extension</h1>
          <p className="text-sm text-muted-foreground">Connect browser AI extensions to 360+ models via OpenRouter & your VPS</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-white/5 p-6 bg-gradient-to-r from-orange-500/[0.03] to-purple-500/[0.03]">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MonitorSmartphone className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">How It Works</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your LLM Hub connects browser extensions to <span className="text-white font-medium">two sources of AI models</span>:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/[0.03] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Router className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">OpenRouter (350+ models)</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Claude, GPT, Gemini, Llama, DeepSeek, Mistral & more. Billed to your Replit credits — no separate API key needed.</p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-300">Your VPS (12 models, free)</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Self-hosted Ollama models run on your own hardware. Completely free, private, and HIPAA-compliant.</p>
              </div>
            </div>
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
              <h3 className="text-base font-semibold text-white">Install a Compatible Extension</h3>
            </div>
            <div className="ml-11 space-y-3">
              <p className="text-sm text-muted-foreground">
                Choose an extension based on what you need:
              </p>
              <div className="space-y-2">
                {COMPATIBLE_EXTENSIONS.map((ext) => (
                  <div key={ext.name} className={`rounded-lg border p-3 ${ext.recommended ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-white/5 bg-white/[0.01]"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ext.recommended ? "bg-emerald-500/10" : "bg-white/5"}`}>
                        <Puzzle className={`w-4 h-4 ${ext.recommended ? "text-emerald-400" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white">{ext.name}</span>
                          {ext.recommended && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5" /> Recommended
                            </span>
                          )}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${ext.mode === "ollama" ? "bg-cyan-500/10 text-cyan-400" : "bg-purple-500/10 text-purple-400"}`}>
                            {ext.mode === "ollama" ? "Ollama Protocol" : "OpenAI Protocol"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{ext.desc}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <a href={ext.chrome} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-[11px] text-white">
                            <Chrome className="w-3 h-3 text-blue-400" /> Chrome <ExternalLink className="w-2.5 h-2.5 text-muted-foreground" />
                          </a>
                          {ext.firefox && (
                            <a href={ext.firefox} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-[11px] text-white">
                              <Globe className="w-3 h-3 text-orange-400" /> Firefox <ExternalLink className="w-2.5 h-2.5 text-muted-foreground" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {step === 1 && (
                <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-all mt-2">
                  I've installed one <ArrowRight className="w-3 h-3" />
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
              <p className="text-sm text-muted-foreground">Create a dedicated API key for the browser extension (needed for OpenAI-protocol extensions):</p>

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
              <h3 className="text-base font-semibold text-white">Configure Your Extension</h3>
            </div>
            <div className="ml-11 space-y-4">
              <p className="text-sm text-muted-foreground">Choose your connection method based on your extension:</p>

              <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Router className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-purple-300">Option A: OpenAI-Compatible (Chatbox, Smart Sidebar, LLM-X)</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Access all 360+ models (OpenRouter + VPS). Use an OpenRouter model name like <code className="text-purple-300">anthropic/claude-sonnet-4.6</code> or a VPS model like <code className="text-emerald-300">qwen2.5:14b</code>.</p>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Base URL</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-purple-500/20 text-cyan-300 text-sm font-mono">{apiEndpoint}</code>
                      <button onClick={() => copyText(apiEndpoint, "openai-url")} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all flex-shrink-0">
                        {copiedId === "openai-url" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">API Key</label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-white/10">
                      <span className="text-sm text-amber-300 font-mono">ent_your_api_key_here</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">(from Step 2)</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Per-extension setup</div>
                  <div><span className="text-purple-400 font-medium">Chatbox:</span> Settings → AI Model Provider → "OpenAI API Compatible" → paste Base URL + API key. Type model name (e.g. <code className="text-purple-300 text-[10px]">anthropic/claude-sonnet-4.6</code>).</div>
                  <div><span className="text-purple-400 font-medium">Smart Sidebar:</span> Settings → Custom Provider → enter Base URL + API key.</div>
                  <div><span className="text-purple-400 font-medium">LLM-X:</span> Add Connection → "OpenAI" type → set Host URL + API key.</div>
                </div>
              </div>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-semibold text-cyan-300">Option B: Direct Ollama (Page Assist)</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Connect Page Assist directly to your VPS. Only VPS models (free), no API key needed.</p>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.02] px-3 py-2 text-[10px] text-amber-400/80">
                  <span className="font-medium">Note:</span> Direct VPS mode bypasses Platform API controls (audit logging, rate limiting, usage tracking). For full compliance and analytics, use Option A instead.
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Ollama URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-cyan-500/20 text-cyan-300 text-sm font-mono">{vpsOllamaUrl}</code>
                    <button onClick={() => copyText(vpsOllamaUrl, "ollama-url")} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all flex-shrink-0">
                      {copiedId === "ollama-url" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white" />}
                    </button>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1">Paste into Page Assist → Settings → Ollama URL. Click Retry. Models auto-detect. No API key needed.</p>
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
            <div className="ml-11 space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick a model in your extension. For OpenAI-protocol extensions, type the full model name.
              </p>

              <div className="rounded-lg border border-purple-500/15 bg-purple-500/[0.02] p-3">
                <div className="text-[11px] text-purple-400 uppercase tracking-wider font-medium mb-2">Top OpenRouter Models (type these in your extension)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {OPENROUTER_MODELS.map(m => (
                    <button key={m.id} onClick={() => copyText(m.id, `or-${m.id}`)}
                      className="group flex items-center justify-between px-2.5 py-1.5 rounded border border-white/5 bg-white/[0.02] hover:bg-white/5 transition-all text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-white font-medium">{m.label}</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                          m.tier === "premium" ? "bg-purple-500/15 text-purple-400" :
                          m.tier === "fast" ? "bg-blue-500/15 text-blue-400" :
                          m.tier === "free" ? "bg-emerald-500/15 text-emerald-400" :
                          "bg-white/10 text-muted-foreground"
                        }`}>{m.tier}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <code className="text-[9px] text-muted-foreground font-mono">{m.id}</code>
                        {copiedId === `or-${m.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50 text-muted-foreground" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] text-emerald-400 uppercase tracking-wider font-medium">VPS Models (free, self-hosted)</div>
                  <button onClick={fetchModels} className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-white transition-all" title="Refresh">
                    <RefreshCw className={`w-3 h-3 ${modelsLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
                {modelsLoading && vpsModels.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading models from VPS...
                  </div>
                ) : vpsModels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {vpsModels.map(m => {
                      const isCode = /coder|codellama|starcoder|codegemma/i.test(m.name);
                      const sizeGb = m.size > 0 ? `${(m.size / (1024**3)).toFixed(1)}GB` : "";
                      return (
                        <button key={m.name} onClick={() => copyText(m.name, `model-${m.name}`)}
                          className={`group px-2 py-1 rounded border text-[10px] font-mono transition-all flex items-center gap-1 ${isCode ? "bg-emerald-500/[0.05] border-emerald-500/15 text-emerald-300 hover:bg-emerald-500/10" : "bg-white/[0.03] border-white/5 text-white hover:bg-white/5"}`}>
                          {m.name}
                          {sizeGb && <span className="text-[8px] text-muted-foreground/50">{sizeGb}</span>}
                          {copiedId === `model-${m.name}` ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-50" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">Could not fetch models. Check that your VPS is online.</p>
                )}
              </div>

              {step === 4 && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.03] p-3 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm text-emerald-400 font-medium">You're all set! Chat with 360+ models from any browser tab.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Quick Reference</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Platform API (OpenAI mode)</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1.5 rounded bg-black/40 text-cyan-300 text-xs font-mono truncate">{apiEndpoint}</code>
              <button onClick={() => copyText(apiEndpoint, "ref-url")} className="p-1.5 rounded bg-white/5 hover:bg-white/10 transition-all">
                {copiedId === "ref-url" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-white" />}
              </button>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">VPS Ollama (Page Assist)</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1.5 rounded bg-black/40 text-cyan-300 text-xs font-mono truncate">{vpsOllamaUrl}</code>
              <button onClick={() => copyText(vpsOllamaUrl, "ref-ollama")} className="p-1.5 rounded bg-white/5 hover:bg-white/10 transition-all">
                {copiedId === "ref-ollama" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-white" />}
              </button>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Active API Keys</div>
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <span className="text-sm text-white font-medium">{keys.length} key{keys.length !== 1 ? "s" : ""}</span>
                  <a href="/platform-api" className="text-[10px] text-orange-400 hover:underline">Manage</a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
