import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Plus, Play, Trash2, Loader2, RefreshCw, Settings, MessageSquare, BarChart3, GitBranch, Cloud, HardDrive, Send, Zap, Trophy, Volume2, Bot, Square, Headphones } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

type Tab = "dashboard" | "providers" | "chat" | "benchmark" | "flows" | "cloud_providers" | "local_providers" | "conversations";

export default function VoiceAgent() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Mic className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Voice Agent Hub</h1>
          <p className="text-muted-foreground text-sm">Compare cloud & local voice AI — OpenAI TTS/STT, Ollama, and more</p>
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
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${tab === t.id ? "bg-violet-500/20 border border-violet-500/50 text-violet-300" : "glass-panel border border-white/10 hover:border-white/20 text-muted-foreground"}`}>
            <t.icon className="w-4 h-4" />
            <span className="text-sm">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="glass-panel rounded-xl border border-white/10 p-6">
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

  const stats = data || { totalProviders: 0, cloudProviders: 0, localProviders: 0, totalConversations: 0, avgResponseTime: 0, totalBenchmarks: 0, totalFlows: 0, providers: [], audioAvailable: false };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Voice Agent Dashboard</h2>
        <div className="flex items-center gap-3">
          {stats.audioAvailable && (
            <span className="text-xs px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-full text-green-400 flex items-center gap-1.5">
              <Headphones className="w-3 h-3" /> OpenAI Audio Active
            </span>
          )}
          <button onClick={() => {
            fetch(`${API}/voice-agent/providers/init-all`, { method: "POST" }).then(r => r.json()).then(() => window.location.reload());
          }} className="px-4 py-2 bg-violet-500/20 border border-violet-500/50 rounded-lg text-violet-300 text-sm hover:bg-violet-500/30 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Initialize All Providers
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Providers", value: stats.totalProviders, color: "violet" },
          { label: "Cloud Services", value: stats.cloudProviders, color: "blue" },
          { label: "Local Engines", value: stats.localProviders, color: "green" },
          { label: "Conversations", value: stats.totalConversations, color: "amber" },
        ].map(s => (
          <div key={s.label} className="glass-panel rounded-xl border border-white/10 p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-bold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl border border-white/10 p-4">
          <div className="text-xs text-muted-foreground">Avg Response Time</div>
          <div className="text-xl font-bold mt-1">{stats.avgResponseTime}ms</div>
        </div>
        <div className="glass-panel rounded-xl border border-white/10 p-4">
          <div className="text-xs text-muted-foreground">Benchmarks Run</div>
          <div className="text-xl font-bold mt-1">{stats.totalBenchmarks}</div>
        </div>
        <div className="glass-panel rounded-xl border border-white/10 p-4">
          <div className="text-xs text-muted-foreground">Dialog Flows</div>
          <div className="text-xl font-bold mt-1">{stats.totalFlows}</div>
        </div>
      </div>

      {stats.providers?.length > 0 && (
        <div>
          <h3 className="font-medium mb-3">Configured Providers</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {stats.providers.map((p: any) => (
              <div key={p.id} className="glass-panel rounded-lg border border-white/10 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{p.name}</span>
                  <span className={`w-2 h-2 rounded-full ${p.status === "active" ? "bg-green-500" : "bg-gray-500"}`} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{p.category} · {p.model}</div>
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
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ endpoint: "", apiKey: "", model: "" });

  const load = () => {
    setLoading(true);
    fetch(`${API}/voice-agent/providers`).then(r => r.json())
      .then(p => setProviders(filter === "all" ? p : p.filter((x: any) => x.category === filter)))
      .catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {filter === "all" ? "All" : filter === "cloud" ? "Cloud" : "Local"} Providers ({providers.length})
        </h2>
        <button onClick={load} className="p-2 hover:bg-white/5 rounded-lg"><RefreshCw className="w-4 h-4 text-muted-foreground" /></button>
      </div>

      {providers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Settings className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No providers found. Click "Initialize All Providers" on the Dashboard tab.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {providers.map((p: any) => {
            const caps = (() => { try { return JSON.parse(p.capabilities || "[]"); } catch { return []; } })();
            return (
              <div key={p.id} className="glass-panel rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${p.status === "active" ? "bg-green-500" : p.hasApiKey ? "bg-yellow-500" : "bg-gray-500"}`} />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span className="px-2 py-0.5 bg-white/5 rounded-full">{p.category}</span>
                        <span>{p.model}</span>
                        {p.provider === "openai_voice" && <span className="text-green-400">✓ Live</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.provider !== "openai_voice" && p.provider !== "ollama_local" && (
                      <button onClick={() => { setEditingId(p.id); setEditForm({ endpoint: p.endpoint || "", apiKey: "", model: p.model || "" }); }}
                        className="p-2 hover:bg-white/5 rounded-lg"><Settings className="w-4 h-4 text-muted-foreground" /></button>
                    )}
                    <button onClick={() => { fetch(`${API}/voice-agent/providers/${p.id}`, { method: "DELETE" }).then(() => load()); }}
                      className="p-2 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>

                {caps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {caps.map((c: string) => (
                      <span key={c} className="text-xs px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-300">{c}</span>
                    ))}
                  </div>
                )}

                {editingId === p.id && (
                  <div className="mt-3 p-3 bg-white/5 rounded-lg space-y-2">
                    <input value={editForm.endpoint} onChange={e => setEditForm({ ...editForm, endpoint: e.target.value })} placeholder="API Endpoint URL" className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm" />
                    <input value={editForm.apiKey} onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })} placeholder="API Key" type="password" className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm" />
                    <input value={editForm.model} onChange={e => setEditForm({ ...editForm, model: e.target.value })} placeholder="Model ID" className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm" />
                    <div className="flex gap-2">
                      <button onClick={() => {
                        fetch(`${API}/voice-agent/providers/${p.id}`, {
                          method: "PUT", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...editForm, status: "active" }),
                        }).then(() => { setEditingId(null); load(); });
                      }} className="px-3 py-1.5 bg-violet-500/20 border border-violet-500/50 rounded-lg text-violet-300 text-sm">Save & Activate</button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-white/5 rounded-lg text-muted-foreground text-sm">Cancel</button>
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

function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.current = mr;
      mr.start();
      setRecording(true);
      setAudioBlob(null);
    } catch (e) {
      console.error("Microphone access denied:", e);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  }, []);

  return { recording, audioBlob, startRecording, stopRecording, clearAudio: () => setAudioBlob(null) };
}

function AudioPlayer({ base64, mimeType = "audio/mpeg" }: { base64: string; mimeType?: string }) {
  const audioUrl = `data:${mimeType};base64,${base64}`;
  return (
    <audio controls className="h-8 w-full max-w-xs mt-2">
      <source src={audioUrl} type={mimeType} />
    </audio>
  );
}

function TTSButton({ text }: { text: string }) {
  const [loading, setLoading] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);

  const speak = async () => {
    if (loading || !text) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/voice-agent/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 4000), voice: "alloy", format: "mp3" }),
      });
      if (!r.ok) throw new Error("TTS failed");
      const blob = await r.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const b64 = (reader.result as string).split(",")[1];
        setAudioBase64(b64);
      };
      reader.readAsDataURL(blob);
    } catch { }
    setLoading(false);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button onClick={speak} disabled={loading} className="p-1 hover:bg-violet-500/20 rounded text-violet-400 disabled:opacity-50" title="Listen">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
      </button>
      {audioBase64 && <AudioPlayer base64={audioBase64} />}
    </div>
  );
}

function ChatTab() {
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("ollama_local");
  const [selectedModel, setSelectedModel] = useState<string>("qwen2.5:7b");
  const [selectedVoice, setSelectedVoice] = useState<string>("alloy");
  const [enableTts, setEnableTts] = useState(false);
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const { recording, audioBlob, startRecording, stopRecording, clearAudio } = useAudioRecorder();

  useEffect(() => {
    fetch(`${API}/voice-agent/providers`).then(r => r.json()).then(p => setProviders(p)).catch(() => {});
    fetch(`${API}/voice-agent/conversations`).then(r => r.json()).then(c => setConversations(c)).catch(() => {});
  }, []);

  useEffect(() => {
    if (audioBlob && !transcribing) {
      if (selectedProvider === "openai_voice" && enableTts) {
        handleVoiceChat(audioBlob);
      } else {
        transcribeAudio(audioBlob);
      }
    }
  }, [audioBlob]);

  const handleVoiceChat = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const r = await fetch(`${API}/voice-agent/voice-chat?voice=${selectedVoice}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (!r.ok) throw new Error("Voice chat failed");
      const data = await r.json();
      setConversations(prev => [{
        id: data.conversationId,
        providerName: "openai_voice",
        userMessage: data.transcript || "[voice input]",
        agentResponse: data.transcript,
        audioBase64: data.audioBase64,
        responseTimeMs: 0,
        intentDetected: "voice-chat",
        confidence: 1.0,
      }, ...prev]);
    } catch (e) {
      console.error("Voice chat failed:", e);
    }
    setTranscribing(false);
    clearAudio();
  };

  const transcribeAudio = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const r = await fetch(`${API}/voice-agent/stt`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (!r.ok) throw new Error("STT failed");
      const data = await r.json();
      if (data.transcript) {
        setMessage(prev => prev ? prev + " " + data.transcript : data.transcript);
      }
    } catch (e) {
      console.error("Transcription failed:", e);
    }
    setTranscribing(false);
    clearAudio();
  };

  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/voice-agent/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: selectedProvider,
          message,
          model: selectedModel,
          voice: selectedVoice,
          includeTts: enableTts,
        }),
      });
      const data = await r.json();
      setConversations(prev => [data, ...prev]);
      setMessage("");
    } catch { }
    setSending(false);
  };

  const ollamaModels = ["qwen2.5:7b", "deepseek-r1:8b", "meditron:7b", "mistral:latest", "llama3.2:latest", "llava:13b"];
  const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Voice Agent Chat</h2>
      <p className="text-sm text-muted-foreground">
        Chat with voice agents using text or microphone. OpenAI Voice and Local LLM (Ollama) provide live responses.
        {enableTts && " TTS is enabled — responses will include audio playback."}
      </p>

      <div className="flex gap-3 flex-wrap items-center">
        <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm">
          <option value="ollama_local">Local LLM (Ollama)</option>
          <option value="openai_voice">OpenAI Voice</option>
          {providers.filter(p => p.provider !== "ollama_local" && p.provider !== "openai_voice").map(p => (
            <option key={p.id} value={p.provider}>{p.name}</option>
          ))}
        </select>
        {selectedProvider === "ollama_local" && (
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm">
            {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm">
          {voices.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={enableTts} onChange={e => setEnableTts(e.target.checked)}
            className="rounded border-white/20" />
          Auto TTS
        </label>
      </div>

      <div className="flex gap-2">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing}
          className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 transition-all ${
            recording
              ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
              : transcribing
              ? "bg-yellow-500/20 border border-yellow-500/50 text-yellow-300"
              : "bg-violet-500/20 border border-violet-500/50 text-violet-300 hover:bg-violet-500/30"
          }`}
          title={recording ? "Stop recording" : "Start recording"}
        >
          {recording ? <Square className="w-4 h-4" /> : transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          {recording ? "Stop" : transcribing ? "Transcribing..." : "Record"}
        </button>
        <input value={message} onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Type or record a message..."
          className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:border-violet-500 focus:outline-none" />
        <button onClick={send} disabled={sending || !message.trim()}
          className="px-6 py-3 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 rounded-xl text-white text-sm flex items-center gap-2">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </div>

      <div className="space-y-3">
        {conversations.map((c: any) => (
          <div key={c.id} className="p-4 glass-panel rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-violet-400">{c.providerName}</span>
                {c.intentDetected && <span className="text-xs px-2 py-0.5 bg-white/5 rounded-full text-muted-foreground">{c.intentDetected}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{c.responseTimeMs}ms</span>
                {c.confidence > 0 && <span>{(c.confidence * 100).toFixed(0)}% conf</span>}
              </div>
            </div>
            <div className="text-sm mb-2 bg-white/5 rounded-lg p-3">
              <span className="text-muted-foreground">You:</span> {c.userMessage}
            </div>
            <div className="text-sm bg-white/5 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div><span className="text-violet-400">Agent:</span> {c.agentResponse}</div>
                {c.agentResponse && !c.agentResponse.startsWith("[") && !c.agentResponse.startsWith("Error") && (
                  <TTSButton text={c.agentResponse} />
                )}
              </div>
              {c.audioBase64 && <AudioPlayer base64={c.audioBase64} />}
            </div>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No conversations yet. Type a message or use the microphone to get started.</p>
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
              <div key={c.id} className="p-3 glass-panel rounded-lg border border-white/10">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{c.responseTimeMs}ms</span>
                  <span>{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <div className="text-sm">Q: {c.userMessage}</div>
                <div className="text-sm text-muted-foreground mt-1 truncate">A: {c.agentResponse?.slice(0, 200)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {conversations.length === 0 && <p className="text-muted-foreground text-center py-8">No conversation history yet.</p>}
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
      <p className="text-sm text-muted-foreground">Compare response times across all configured voice providers. OpenAI Voice and Local LLM get real responses.</p>

      <div className="p-4 glass-panel rounded-xl border border-white/10 space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Benchmark name (e.g., 'Q1 Voice Comparison')" className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm" />
        <textarea value={prompts} onChange={e => setPrompts(e.target.value)} rows={5} placeholder="Test prompts (one per line)" className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm resize-none" />
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
          <div key={b.id} className="p-4 glass-panel rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">{b.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${b.status === "completed" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{b.status}</span>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</span>
            </div>

            {winners.length > 0 && (
              <div className="mb-3">
                <h4 className="text-sm font-medium mb-2">Rankings (by avg response time)</h4>
                <div className="space-y-1">
                  {winners.map((w: any, i: number) => (
                    <div key={w.name} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                          #{i + 1}
                        </span>
                        <span className="text-sm">{w.name}</span>
                        {i === 0 && <Trophy className="w-4 h-4 text-yellow-400" />}
                      </div>
                      <span className="text-sm text-muted-foreground">{w.avgTime}ms avg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(results).length > 0 && (
              <details className="mt-2">
                <summary className="text-sm text-muted-foreground cursor-pointer hover:text-white">View detailed results</summary>
                <div className="mt-2 space-y-2">
                  {Object.entries(results).map(([provider, resp]: any) => (
                    <div key={provider} className="p-2 bg-white/5 rounded-lg">
                      <div className="text-sm font-medium text-violet-400 mb-1">{provider}</div>
                      {resp.map((r: any, i: number) => (
                        <div key={i} className="text-xs text-muted-foreground mb-1">
                          <span className="opacity-70">"{r.prompt}"</span> → {r.response?.slice(0, 100)}... <span className="opacity-50">({r.timeMs}ms)</span>
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
      <p className="text-sm text-muted-foreground">Design conversational dialog flows with AI-generated nodes and edges. Uses the local LLM to generate flow structures.</p>

      <div className="p-4 glass-panel rounded-xl border border-white/10 space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Flow name (e.g., 'Customer Support IVR')" className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm" />
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Describe the conversation flow purpose..." className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm resize-none" />
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
          <div key={f.id} className="p-4 glass-panel rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold">{f.name}</h3>
                {f.description && <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${f.status === "generated" ? "bg-green-500/20 text-green-400" : "bg-white/5 text-muted-foreground"}`}>{f.status}</span>
                <button onClick={() => generateFlow(f.id)} className="p-1.5 hover:bg-violet-500/20 rounded-lg" title="Generate with AI">
                  <Zap className="w-4 h-4 text-violet-400" />
                </button>
                <button onClick={() => { fetch(`${API}/voice-agent/flows/${f.id}`, { method: "DELETE" }).then(() => load()); }}
                  className="p-1.5 hover:bg-red-500/20 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>

            {nodes.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-xs text-muted-foreground mb-1">{nodes.length} nodes · {edges.length} edges</div>
                <div className="flex flex-wrap gap-2">
                  {nodes.slice(0, 8).map((n: any, i: number) => (
                    <div key={i} className="px-2 py-1 bg-white/5 rounded-lg text-xs">
                      <span className="text-violet-400">{n.type || "node"}</span>: {n.content?.slice(0, 40) || n.id || `Node ${i}`}
                    </div>
                  ))}
                  {nodes.length > 8 && <span className="text-xs text-muted-foreground">+{nodes.length - 8} more</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {!loading && flows.length === 0 && <p className="text-muted-foreground text-center py-8">No dialog flows created yet.</p>}
    </div>
  );
}
