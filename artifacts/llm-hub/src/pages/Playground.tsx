import { useState } from "react";
import { Terminal, Play, Copy, Check, Loader2, Clock, ChevronDown, ChevronRight } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  category: string;
  params?: { name: string; type: string; required?: boolean; default?: string }[];
  body?: { name: string; type: string; required?: boolean; default?: string }[];
}

const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/llm/status", description: "Get Ollama LLM server status", category: "LLM" },
  { method: "GET", path: "/llm/models", description: "List available LLM models", category: "LLM" },
  { method: "GET", path: "/chat/conversations", description: "List all conversations", category: "Chat" },
  { method: "POST", path: "/chat/conversations", description: "Create new conversation", category: "Chat", body: [{ name: "title", type: "string", required: true }, { name: "model", type: "string", required: true, default: "llama3.1:latest" }] },
  { method: "GET", path: "/prompts", description: "List all prompts", category: "Prompts" },
  { method: "GET", path: "/prompts/categories", description: "Get prompt categories", category: "Prompts" },
  { method: "GET", path: "/model-compare/history", description: "Get comparison history", category: "Compare" },
  { method: "GET", path: "/memory", description: "Get all memory entries", category: "Memory" },
  { method: "GET", path: "/memory/context", description: "Get context summary from memory", category: "Memory" },
  { method: "POST", path: "/memory", description: "Store a memory entry", category: "Memory", body: [{ name: "key", type: "string", required: true }, { name: "value", type: "string", required: true }, { name: "category", type: "string", default: "fact" }] },
  { method: "GET", path: "/costs/summary", description: "Get cost summary (24h/7d/30d)", category: "Costs" },
  { method: "GET", path: "/costs/by-model", description: "Get costs broken down by model", category: "Costs" },
  { method: "GET", path: "/costs/by-day", description: "Get daily cost data", category: "Costs" },
  { method: "GET", path: "/costs/by-source", description: "Get costs by source", category: "Costs" },
  { method: "GET", path: "/costs/model-prices", description: "Get model pricing info", category: "Costs" },
  { method: "GET", path: "/team/tasks", description: "List team tasks", category: "Team" },
  { method: "GET", path: "/team/members", description: "List team members", category: "Team" },
  { method: "GET", path: "/team/activity", description: "Get team activity feed", category: "Team" },
  { method: "GET", path: "/reports/sections", description: "Get available report sections", category: "Reports" },
  { method: "GET", path: "/reports/schedules", description: "List report schedules", category: "Reports" },
  { method: "GET", path: "/automations", description: "List automations", category: "Automations" },
  { method: "GET", path: "/automations/history", description: "Get automation run history", category: "Automations" },
  { method: "GET", path: "/agentflow/status", description: "Get AgentFlow connection status", category: "AgentFlow" },
  { method: "GET", path: "/agentflow/agents", description: "List AgentFlow agents", category: "AgentFlow" },
  { method: "GET", path: "/agentflow/workflows", description: "List AgentFlow workflows", category: "AgentFlow" },
  { method: "GET", path: "/agentflow/templates", description: "List AgentFlow templates", category: "AgentFlow" },
  { method: "GET", path: "/health-check/status", description: "Get health status of services", category: "System" },
  { method: "GET", path: "/health-check/history", description: "Get health check history", category: "System" },
  { method: "GET", path: "/analytics/stats", description: "Get analytics stats", category: "Analytics" },
  { method: "GET", path: "/evaluation/categories", description: "Get benchmark categories", category: "Evaluation" },
  { method: "GET", path: "/evaluation/history", description: "Get benchmark history", category: "Evaluation" },
];

export default function Playground() {
  const [selectedEp, setSelectedEp] = useState<Endpoint | null>(null);
  const [bodyFields, setBodyFields] = useState<Record<string, string>>({});
  const [response, setResponse] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["LLM", "Chat"]));

  const categories = Array.from(new Set(ENDPOINTS.map(e => e.category)));

  const selectEndpoint = (ep: Endpoint) => {
    setSelectedEp(ep);
    setResponse(null);
    setStatusCode(null);
    setLatency(null);
    const defaults: Record<string, string> = {};
    (ep.body || []).forEach(b => { if (b.default) defaults[b.name] = b.default; });
    setBodyFields(defaults);
  };

  const runRequest = async () => {
    if (!selectedEp) return;
    setLoading(true);
    const start = Date.now();
    try {
      const opts: RequestInit = { method: selectedEp.method, headers: { "Content-Type": "application/json" } };
      if (selectedEp.method !== "GET" && Object.keys(bodyFields).length > 0) {
        opts.body = JSON.stringify(bodyFields);
      }
      const r = await fetch(`${API_BASE}${selectedEp.path}`, opts);
      setStatusCode(r.status);
      const text = await r.text();
      try { setResponse(JSON.stringify(JSON.parse(text), null, 2)); } catch { setResponse(text); }
    } catch (e: any) {
      setResponse(`Error: ${e.message}`);
      setStatusCode(0);
    }
    setLatency(Date.now() - start);
    setLoading(false);
  };

  const copyResponse = () => {
    if (response) { navigator.clipboard.writeText(response); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const methodColor = (m: string) => {
    if (m === "GET") return "text-green-400 bg-green-500/10";
    if (m === "POST") return "text-blue-400 bg-blue-500/10";
    if (m === "PATCH") return "text-amber-400 bg-amber-500/10";
    return "text-red-400 bg-red-500/10";
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
          <Terminal className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">API Playground</h1>
          <p className="text-xs text-muted-foreground">Test any platform endpoint interactively</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-r border-white/5 overflow-y-auto p-3 space-y-1">
          {categories.map(cat => (
            <div key={cat}>
              <button onClick={() => toggleCat(cat)} className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-white hover:bg-white/5 rounded-lg">
                {expandedCats.has(cat) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {cat}
                <span className="text-[10px] text-muted-foreground ml-auto">{ENDPOINTS.filter(e => e.category === cat).length}</span>
              </button>
              {expandedCats.has(cat) && ENDPOINTS.filter(e => e.category === cat).map(ep => (
                <button key={ep.method + ep.path} onClick={() => selectEndpoint(ep)} className={`flex items-center gap-2 w-full px-3 py-1.5 text-[11px] rounded-lg transition-colors ${selectedEp?.path === ep.path && selectedEp?.method === ep.method ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}>
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${methodColor(ep.method)}`}>{ep.method}</span>
                  <span className="truncate font-mono">{ep.path}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedEp ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Terminal className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">Select an Endpoint</h3>
                <p className="text-xs text-muted-foreground">Choose an API endpoint from the sidebar to test it.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-white/5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded ${methodColor(selectedEp.method)}`}>{selectedEp.method}</span>
                  <span className="text-sm font-mono text-white">{selectedEp.path}</span>
                </div>
                <p className="text-xs text-muted-foreground">{selectedEp.description}</p>

                {selectedEp.body && selectedEp.body.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-white">Request Body</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {selectedEp.body.map(b => (
                        <div key={b.name}>
                          <label className="text-[10px] text-muted-foreground mb-1 block">
                            {b.name} {b.required && <span className="text-red-400">*</span>}
                            <span className="ml-1 text-[9px] opacity-50">({b.type})</span>
                          </label>
                          <input value={bodyFields[b.name] || ""} onChange={e => setBodyFields({ ...bodyFields, [b.name]: e.target.value })} placeholder={b.default || b.name} className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white font-mono focus:outline-none focus:border-pink-500/50" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={runRequest} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pink-500 text-white text-xs font-medium hover:bg-pink-600 disabled:opacity-50">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Send Request
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {response !== null && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusCode && statusCode >= 200 && statusCode < 300 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>{statusCode}</span>
                        {latency !== null && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{latency}ms</span>}
                      </div>
                      <button onClick={copyResponse} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-white bg-white/5">
                        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <pre className="p-4 rounded-xl bg-black/30 border border-white/5 text-xs text-white font-mono overflow-x-auto whitespace-pre-wrap max-h-[500px] overflow-y-auto">{response}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
