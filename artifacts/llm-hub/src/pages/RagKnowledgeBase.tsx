import { useState, useEffect, useCallback } from "react";
import {
  Database, Search, Loader2, RefreshCw, BookOpen, Brain, Stethoscope,
  FileText, Trash2, Plus, CheckCircle, XCircle, Activity, Zap, Upload
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface RagStatus {
  totalChunks: number;
  chunksWithEmbeddings: number;
  sourceBreakdown: { source_type: string; cnt: string }[];
  sources: { id: number; name: string; sourceType: string; totalChunks: number; totalDocuments: number; status: string; lastIngestedAt: string | null }[];
  embeddingModel: string;
  embeddingDim: number;
  ollamaEmbeddingAvailable: boolean;
}

interface SearchResult {
  title: string;
  content: string;
  score: number;
  sourceType: string;
  sourceRef: string;
}

export default function RagKnowledgeBase() {
  const [status, setStatus] = useState<RagStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ type: string; ingested: number; skipped: number; total: number } | null>(null);
  const [tab, setTab] = useState<"overview" | "search" | "ingest">("overview");
  const [customTitle, setCustomTitle] = useState("");
  const [customContent, setCustomContent] = useState("");
  const [customIngesting, setCustomIngesting] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/rag-pipeline/status`);
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error("Failed to fetch RAG status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const ingest = async (type: "pubmed" | "knowledge" | "ent-training") => {
    setIngesting(type);
    setIngestResult(null);
    try {
      const res = await fetch(`${API}/api/rag-pipeline/ingest/${type}`, { method: "POST" });
      const data = await res.json();
      setIngestResult({ type, ...data });
      fetchStatus();
    } catch (e: any) {
      setIngestResult({ type, ingested: 0, skipped: 0, total: 0 });
    } finally {
      setIngesting(null);
    }
  };

  const ingestCustom = async () => {
    if (!customContent.trim()) return;
    setCustomIngesting(true);
    try {
      await fetch(`${API}/api/rag-pipeline/ingest/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: customTitle, content: customContent }),
      });
      setCustomTitle("");
      setCustomContent("");
      fetchStatus();
    } catch {} finally {
      setCustomIngesting(false);
    }
  };

  const search = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API}/api/rag-pipeline/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, maxResults: 8 }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const clearSource = async (sourceType?: string) => {
    setClearing(sourceType || "all");
    try {
      await fetch(`${API}/api/rag-pipeline/clear`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType }),
      });
      fetchStatus();
    } catch {} finally {
      setClearing(null);
    }
  };

  const sourceIcon = (type: string) => {
    switch (type) {
      case "pubmed": return <BookOpen className="w-4 h-4" />;
      case "ent-training": return <Stethoscope className="w-4 h-4" />;
      case "knowledge-base": return <Brain className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const sourceColor = (type: string) => {
    switch (type) {
      case "pubmed": return "text-blue-400";
      case "ent-training": return "text-emerald-400";
      case "knowledge-base": return "text-purple-400";
      default: return "text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            RAG Knowledge Base
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Vector-powered retrieval augmented generation with pgvector
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Chunks"
          value={status?.totalChunks || 0}
          icon={<Database className="w-5 h-5 text-violet-400" />}
        />
        <StatCard
          label="With Embeddings"
          value={status?.chunksWithEmbeddings || 0}
          icon={<Brain className="w-5 h-5 text-purple-400" />}
        />
        <StatCard
          label="Embedding Model"
          value={status?.embeddingModel || "None"}
          icon={<Activity className="w-5 h-5 text-blue-400" />}
          isText
        />
        <StatCard
          label="Ollama Embeddings"
          value={status?.ollamaEmbeddingAvailable ? "Available" : "Fallback Mode"}
          icon={status?.ollamaEmbeddingAvailable ?
            <CheckCircle className="w-5 h-5 text-green-400" /> :
            <XCircle className="w-5 h-5 text-yellow-400" />
          }
          isText
          valueColor={status?.ollamaEmbeddingAvailable ? "text-green-400" : "text-yellow-400"}
        />
      </div>

      <div className="flex gap-2 border-b border-white/10 pb-0">
        {(["overview", "search", "ingest"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === t ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-white"}`}
          >
            {t === "overview" ? "Knowledge Sources" : t === "search" ? "Test Search" : "Ingest Data"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {(status?.sourceBreakdown || []).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {status?.sourceBreakdown.map(sb => (
                <div key={sb.source_type} className="glass-panel rounded-xl p-4 border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={sourceColor(sb.source_type)}>{sourceIcon(sb.source_type)}</span>
                      <span className="text-white font-medium capitalize">{sb.source_type.replace(/-/g, " ")}</span>
                    </div>
                    <button
                      onClick={() => clearSource(sb.source_type)}
                      disabled={clearing === sb.source_type}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition"
                    >
                      {clearing === sb.source_type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="text-2xl font-bold text-white">{parseInt(sb.cnt).toLocaleString()}</div>
                  <div className="text-xs text-gray-500 mt-1">embedded chunks</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-panel rounded-xl p-12 border border-white/5 text-center">
              <Database className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">No Knowledge Ingested Yet</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Head to the Ingest Data tab to add PubMed articles, ENT training knowledge, or custom documents to your vector knowledge base.
              </p>
              <button
                onClick={() => setTab("ingest")}
                className="mt-4 px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-sm transition"
              >
                Start Ingesting
              </button>
            </div>
          )}

          {(status?.sources || []).length > 0 && (
            <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <h3 className="text-sm font-medium text-gray-300">Ingestion History</h3>
              </div>
              <div className="divide-y divide-white/5">
                {status?.sources.map(s => (
                  <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={sourceColor(s.sourceType)}>{sourceIcon(s.sourceType)}</span>
                      <div>
                        <div className="text-sm text-white">{s.name}</div>
                        <div className="text-xs text-gray-500">{s.totalDocuments} docs, {s.totalChunks} chunks</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${s.status === "completed" ? "bg-green-500/20 text-green-400" : s.status === "ingesting" ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-500/20 text-gray-400"}`}>
                        {s.status}
                      </span>
                      {s.lastIngestedAt && (
                        <span className="text-xs text-gray-500">{new Date(s.lastIngestedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "search" && (
        <div className="space-y-4">
          <div className="glass-panel rounded-xl p-4 border border-white/5">
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && search()}
                placeholder="Search the knowledge base..."
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={search}
                disabled={searching || !searchQuery.trim()}
                className="px-5 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/80 disabled:opacity-50 transition flex items-center gap-2"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3">
              {searchResults.map((r, i) => (
                <div key={i} className="glass-panel rounded-xl p-4 border border-white/5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={sourceColor(r.sourceType)}>{sourceIcon(r.sourceType)}</span>
                      <span className="text-sm font-medium text-white">{r.title?.substring(0, 100) || "Untitled"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 capitalize">{r.sourceType}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${r.score > 0.5 ? "bg-green-500/20 text-green-400" : r.score > 0.2 ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-500/20 text-gray-400"}`}>
                        {(r.score * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{r.content?.substring(0, 500)}</p>
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !searching && (
            <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
              <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No results found. Try a different query or ingest more data.</p>
            </div>
          )}
        </div>
      )}

      {tab === "ingest" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <IngestCard
              title="PubMed Articles"
              description="Ingest cached PubMed ENT training data into the vector store"
              icon={<BookOpen className="w-6 h-6 text-blue-400" />}
              loading={ingesting === "pubmed"}
              onClick={() => ingest("pubmed")}
            />
            <IngestCard
              title="Knowledge Base"
              description="Ingest existing document chunks from the knowledge base"
              icon={<Brain className="w-6 h-6 text-purple-400" />}
              loading={ingesting === "knowledge"}
              onClick={() => ingest("knowledge")}
            />
            <IngestCard
              title="ENT Training"
              description="Ingest ENT endoscopy training knowledge into vectors"
              icon={<Stethoscope className="w-6 h-6 text-emerald-400" />}
              loading={ingesting === "ent-training"}
              onClick={() => ingest("ent-training")}
            />
          </div>

          {ingestResult && (
            <div className="glass-panel rounded-xl p-4 border border-green-500/20 bg-green-500/5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-400">Ingestion Complete</span>
              </div>
              <p className="text-sm text-gray-300">
                Ingested <span className="text-white font-medium">{ingestResult.ingested}</span> chunks from {ingestResult.total} items (skipped {ingestResult.skipped})
              </p>
            </div>
          )}

          <div className="glass-panel rounded-xl p-4 border border-white/5">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4" /> Add Custom Document
            </h3>
            <input
              type="text"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="Document title"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 mb-3"
            />
            <textarea
              value={customContent}
              onChange={e => setCustomContent(e.target.value)}
              placeholder="Paste document content here..."
              rows={6}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 resize-y"
            />
            <button
              onClick={ingestCustom}
              disabled={customIngesting || !customContent.trim()}
              className="mt-3 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition flex items-center gap-2"
            >
              {customIngesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add to Knowledge Base
            </button>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => clearSource()}
              disabled={clearing === "all"}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm transition flex items-center gap-2"
            >
              {clearing === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Clear All Embeddings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, isText, valueColor }: { label: string; value: number | string; icon: React.ReactNode; isText?: boolean; valueColor?: string }) {
  return (
    <div className="glass-panel rounded-xl p-4 border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        {icon}
      </div>
      <div className={`${isText ? "text-sm" : "text-2xl"} font-bold ${valueColor || "text-white"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function IngestCard({ title, description, icon, loading, onClick }: { title: string; description: string; icon: React.ReactNode; loading: boolean; onClick: () => void }) {
  return (
    <div className="glass-panel rounded-xl p-5 border border-white/5 hover:border-primary/20 transition">
      <div className="mb-3">{icon}</div>
      <h3 className="text-white font-medium mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-4">{description}</p>
      <button
        onClick={onClick}
        disabled={loading}
        className="w-full px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium disabled:opacity-50 transition flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        {loading ? "Ingesting..." : "Start Ingestion"}
      </button>
    </div>
  );
}
