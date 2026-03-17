import { useState, useEffect, useCallback } from "react";
import {
  Brain, FolderOpen, FileText, Search, Loader2, Plus, Trash2,
  RefreshCw, CheckCircle2, AlertCircle, Database, BookOpen,
  Upload, ChevronRight, Globe, Zap, ExternalLink, ArrowRight, StickyNote
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface BrainSource {
  id: string;
  type: "drive" | "notion" | "manual";
  name: string;
  external_id: string;
  mime_type?: string;
  chunks: number;
  training_pairs: number;
  status: "pending" | "indexed" | "processing" | "error";
  last_synced?: string;
  error?: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size: string;
  isFolder: boolean;
}

interface BrainStats {
  sourcesByType: { count: string; type: string }[];
  totalSources: number;
  totalChunks: number;
  totalPairs: number;
  indexedSources: number;
}

type SubTab = "sources" | "drive" | "notion" | "manual" | "pairs";

export default function ProjectBrainPanel() {
  const [subTab, setSubTab] = useState<SubTab>("sources");
  const [sources, setSources] = useState<BrainSource[]>([]);
  const [stats, setStats] = useState<BrainStats | null>(null);
  const [loading, setLoading] = useState(false);

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveQuery, setDriveQuery] = useState("");
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveFolderPath, setDriveFolderPath] = useState<{ id: string; name: string }[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [addingFiles, setAddingFiles] = useState<Set<string>>(new Set());

  const [notionUrl, setNotionUrl] = useState("");
  const [notionTitle, setNotionTitle] = useState("");
  const [notionContent, setNotionContent] = useState("");
  const [notionAdding, setNotionAdding] = useState(false);

  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualAdding, setManualAdding] = useState(false);

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processAllRunning, setProcessAllRunning] = useState(false);
  const [selectedModel, setSelectedModel] = useState("qwen2.5:7b");
  const [models, setModels] = useState<string[]>([]);

  const [expandedPairs, setExpandedPairs] = useState<string | null>(null);
  const [pairsData, setPairsData] = useState<any[]>([]);
  const [exportedPairs, setExportedPairs] = useState<any[] | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/project-brain/sources`);
      const data = await res.json();
      if (data.success) setSources(data.sources);
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/project-brain/stats`);
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch {}
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/llm-config`);
      const data = await res.json();
      if (data.models) setModels(data.models.map((m: any) => m.name));
    } catch {}
  }, []);

  useEffect(() => {
    fetchSources();
    fetchStats();
    fetchModels();
  }, [fetchSources, fetchStats, fetchModels]);

  const browseDrive = async (query?: string, folderId?: string | null) => {
    setDriveLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/project-brain/browse-drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query || driveQuery, folderId }),
      });
      const data = await res.json();
      if (data.success) setDriveFiles(data.files);
    } catch {} finally {
      setDriveLoading(false);
    }
  };

  const openDriveFolder = (folderId: string, folderName: string) => {
    setDriveFolderId(folderId);
    setDriveFolderPath((p) => [...p, { id: folderId, name: folderName }]);
    browseDrive("", folderId);
  };

  const goBackDrive = (index: number) => {
    if (index < 0) {
      setDriveFolderId(null);
      setDriveFolderPath([]);
      browseDrive("", null);
    } else {
      const newPath = driveFolderPath.slice(0, index + 1);
      setDriveFolderPath(newPath);
      setDriveFolderId(newPath[newPath.length - 1].id);
      browseDrive("", newPath[newPath.length - 1].id);
    }
  };

  const addDriveFile = async (file: DriveFile) => {
    if (file.isFolder) {
      setAddingFiles((s) => new Set(s).add(file.id));
      try {
        const res = await fetch(`${API_BASE}/api/project-brain/add-drive-folder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: file.id, folderName: file.name }),
        });
        const data = await res.json();
        if (data.success) {
          fetchSources();
          fetchStats();
        }
      } catch {} finally {
        setAddingFiles((s) => { const n = new Set(s); n.delete(file.id); return n; });
      }
    } else {
      setAddingFiles((s) => new Set(s).add(file.id));
      try {
        const res = await fetch(`${API_BASE}/api/project-brain/add-drive-file`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: file.id, fileName: file.name, mimeType: file.mimeType }),
        });
        const data = await res.json();
        if (data.success) {
          fetchSources();
          fetchStats();
        }
      } catch {} finally {
        setAddingFiles((s) => { const n = new Set(s); n.delete(file.id); return n; });
      }
    }
  };

  const addNotionPage = async () => {
    const pageId = notionUrl.replace(/.*notion\.so\//, "").replace(/[-?#].*/g, "").replace(/[^a-f0-9]/gi, "");
    if (!pageId && !notionContent.trim()) return;
    setNotionAdding(true);
    try {
      const res = await fetch(`${API_BASE}/api/project-brain/add-notion-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: pageId || `manual-notion-${Date.now()}`,
          title: notionTitle || notionUrl || "Notion Page",
          content: notionContent,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotionUrl("");
        setNotionTitle("");
        setNotionContent("");
        fetchSources();
        fetchStats();
      }
    } catch {} finally {
      setNotionAdding(false);
    }
  };

  const addManualSource = async () => {
    if (!manualTitle.trim() || !manualContent.trim()) return;
    setManualAdding(true);
    try {
      const res = await fetch(`${API_BASE}/api/project-brain/add-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: manualTitle, content: manualContent }),
      });
      const data = await res.json();
      if (data.success) {
        setManualTitle("");
        setManualContent("");
        fetchSources();
        fetchStats();
      }
    } catch {} finally {
      setManualAdding(false);
    }
  };

  const processSource = async (sourceId: string) => {
    setProcessingId(sourceId);
    try {
      const res = await fetch(`${API_BASE}/api/project-brain/process-source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, model: selectedModel }),
      });
      await res.json();
      fetchSources();
      fetchStats();
    } catch {} finally {
      setProcessingId(null);
    }
  };

  const processAll = async () => {
    setProcessAllRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/project-brain/process-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      await res.json();
      fetchSources();
      fetchStats();
    } catch {} finally {
      setProcessAllRunning(false);
    }
  };

  const deleteSource = async (sourceId: string) => {
    try {
      await fetch(`${API_BASE}/api/project-brain/source/${sourceId}`, { method: "DELETE" });
      fetchSources();
      fetchStats();
    } catch {}
  };

  const viewPairs = async (sourceId: string) => {
    if (expandedPairs === sourceId) {
      setExpandedPairs(null);
      return;
    }
    setExpandedPairs(sourceId);
    try {
      const res = await fetch(`${API_BASE}/api/project-brain/training-pairs/${sourceId}`);
      const data = await res.json();
      if (data.success) setPairsData(data.pairs);
    } catch {}
  };

  const exportAllPairs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/project-brain/export-pairs`, { method: "POST" });
      const data = await res.json();
      if (data.success) setExportedPairs(data.pairs);
    } catch {}
  };

  const pendingCount = sources.filter((s) => s.status === "pending").length;

  const subTabs = [
    { id: "sources" as SubTab, label: "My Sources", icon: <Database className="w-4 h-4" /> },
    { id: "drive" as SubTab, label: "Google Drive", icon: <FolderOpen className="w-4 h-4" /> },
    { id: "notion" as SubTab, label: "Notion", icon: <StickyNote className="w-4 h-4" /> },
    { id: "manual" as SubTab, label: "Manual Input", icon: <FileText className="w-4 h-4" /> },
    { id: "pairs" as SubTab, label: "Training Pairs", icon: <BookOpen className="w-4 h-4" /> },
  ];

  const statusBadge = (status: string) => {
    switch (status) {
      case "indexed": return <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">Indexed</span>;
      case "processing": return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Processing</span>;
      case "pending": return <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">Pending</span>;
      case "error": return <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">Error</span>;
      default: return null;
    }
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case "drive": return <span className="px-2 py-0.5 bg-blue-600/20 text-blue-300 rounded text-xs">Drive</span>;
      case "notion": return <span className="px-2 py-0.5 bg-purple-600/20 text-purple-300 rounded text-xs">Notion</span>;
      case "manual": return <span className="px-2 py-0.5 bg-gray-600/20 text-gray-300 rounded text-xs">Manual</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            Project Brain
          </h3>
          <p className="text-muted-foreground mt-1">
            Feed your projects into local LLMs — import from Google Drive, Notion, or paste directly. Auto-generates training data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            {models.map((m) => (
              <option key={m} value={m} className="bg-gray-900">{m}</option>
            ))}
          </select>
          {pendingCount > 0 && (
            <Button
              onClick={processAll}
              disabled={processAllRunning}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {processAllRunning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
              Process All ({pendingCount})
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Sources</p>
          <p className="text-2xl font-bold text-white">{stats?.totalSources || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats?.sourcesByType.map((s) => `${s.count} ${s.type}`).join(", ") || "None yet"}
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Indexed</p>
          <p className="text-2xl font-bold text-emerald-400">{stats?.indexedSources || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Fully processed</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Knowledge Chunks</p>
          <p className="text-2xl font-bold text-blue-400">{stats?.totalChunks || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">RAG-ready pieces</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Training Pairs</p>
          <p className="text-2xl font-bold text-purple-400">{stats?.totalPairs || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Q&A for fine-tuning</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-white/10 pb-2">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setSubTab(tab.id);
              if (tab.id === "drive" && driveFiles.length === 0) browseDrive("", null);
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all",
              subTab === tab.id
                ? "bg-purple-600/20 text-purple-400 border border-purple-500/30"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {subTab === "sources" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-white">Indexed Sources ({sources.length})</h4>
            <Button variant="outline" size="sm" onClick={() => { fetchSources(); fetchStats(); }}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>
          {sources.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg">No sources yet</p>
              <p className="text-sm mt-1">Add files from Google Drive, Notion, or paste content manually</p>
            </div>
          ) : (
            sources.map((source) => (
              <div key={source.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {typeBadge(source.type)}
                      {statusBadge(source.status)}
                      {source.status === "error" && source.error && (
                        <span className="text-xs text-red-400 truncate max-w-[200px]" title={source.error}>{source.error}</span>
                      )}
                    </div>
                    <p className="text-white font-medium truncate">{source.name}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>{source.chunks} chunks</span>
                      <span>{source.training_pairs} pairs</span>
                      {source.last_synced && (
                        <span>Synced: {new Date(source.last_synced).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {source.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => processSource(source.id)}
                        disabled={processingId === source.id}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {processingId === source.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      </Button>
                    )}
                    {source.status === "indexed" && source.training_pairs > 0 && (
                      <Button size="sm" variant="outline" onClick={() => viewPairs(source.id)}>
                        <BookOpen className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-red-400" onClick={() => deleteSource(source.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {expandedPairs === source.id && pairsData.length > 0 && (
                  <div className="mt-4 border-t border-white/10 pt-4 space-y-3">
                    {pairsData.slice(0, 10).map((pair: any, idx: number) => (
                      <div key={pair.id || idx} className="bg-black/30 rounded-lg p-3">
                        <p className="text-xs text-cyan-400 font-medium mb-1">Q: {pair.instruction}</p>
                        <p className="text-xs text-gray-300">{pair.response.slice(0, 300)}{pair.response.length > 300 ? "..." : ""}</p>
                      </div>
                    ))}
                    {pairsData.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center">...and {pairsData.length - 10} more pairs</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {subTab === "drive" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && browseDrive()}
                placeholder="Search your Google Drive files..."
                className="pl-10"
              />
            </div>
            <Button onClick={() => browseDrive()} disabled={driveLoading}>
              {driveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {driveFolderPath.length > 0 && (
            <div className="flex items-center gap-1 text-sm">
              <button onClick={() => goBackDrive(-1)} className="text-cyan-400 hover:underline">My Drive</button>
              {driveFolderPath.map((p, i) => (
                <span key={p.id} className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <button onClick={() => goBackDrive(i)} className="text-cyan-400 hover:underline">{p.name}</button>
                </span>
              ))}
            </div>
          )}

          {driveFiles.length === 0 && !driveLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Search or browse your Google Drive to find files</p>
            </div>
          ) : (
            <div className="space-y-2">
              {driveFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {file.isFolder ? (
                      <FolderOpen className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                    ) : (
                      <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      {file.isFolder ? (
                        <button onClick={() => openDriveFolder(file.id, file.name)} className="text-white font-medium truncate hover:text-cyan-400 text-left block">
                          {file.name}
                        </button>
                      ) : (
                        <p className="text-white font-medium truncate">{file.name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {file.mimeType?.split(".").pop() || "file"} • {new Date(file.modifiedTime).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addDriveFile(file)}
                    disabled={addingFiles.has(file.id)}
                    className="bg-cyan-600 hover:bg-cyan-700 flex-shrink-0"
                  >
                    {addingFiles.has(file.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-1" />
                        {file.isFolder ? "Add All" : "Add"}
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === "notion" && (
        <div className="space-y-4">
          <div>
            <h4 className="text-lg font-semibold text-white mb-2">Import from Notion</h4>
            <p className="text-sm text-muted-foreground">Paste a Notion page URL or copy-paste the page content directly. The system will chunk the content and generate training pairs.</p>
          </div>
          <Input
            value={notionTitle}
            onChange={(e) => setNotionTitle(e.target.value)}
            placeholder="Page title (e.g., 'ENT Procedure Notes', 'Project Roadmap')"
          />
          <Input
            value={notionUrl}
            onChange={(e) => setNotionUrl(e.target.value)}
            placeholder="Notion page URL (optional) — e.g., https://notion.so/your-page-id"
          />
          <textarea
            value={notionContent}
            onChange={(e) => setNotionContent(e.target.value)}
            placeholder="Paste your Notion page content here... Copy the text from your Notion page and paste it to create training data from it."
            className="w-full h-48 bg-white/5 border border-white/10 rounded-xl p-4 text-white text-sm resize-none focus:ring-2 focus:ring-purple-500/50 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{notionContent.length} characters</p>
            <Button
              onClick={addNotionPage}
              disabled={notionAdding || (!notionContent.trim())}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {notionAdding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Notion Page
            </Button>
          </div>
        </div>
      )}

      {subTab === "manual" && (
        <div className="space-y-4">
          <div>
            <h4 className="text-lg font-semibold text-white mb-2">Add Custom Knowledge</h4>
            <p className="text-sm text-muted-foreground">Paste project documentation, notes, specifications, or any text you want your LLM to learn from.</p>
          </div>
          <Input
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Source title (e.g., 'API Documentation', 'Project Spec')"
          />
          <textarea
            value={manualContent}
            onChange={(e) => setManualContent(e.target.value)}
            placeholder="Paste your content here... documentation, code, notes, specs, anything the LLM should know about your project."
            className="w-full h-64 bg-white/5 border border-white/10 rounded-xl p-4 text-white text-sm resize-none focus:ring-2 focus:ring-purple-500/50 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{manualContent.length} characters</p>
            <Button
              onClick={addManualSource}
              disabled={manualAdding || !manualTitle.trim() || !manualContent.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {manualAdding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Source
            </Button>
          </div>
        </div>
      )}

      {subTab === "pairs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-white">Generated Training Pairs</h4>
              <p className="text-sm text-muted-foreground">All Q&A pairs generated from your indexed sources</p>
            </div>
            <Button onClick={exportAllPairs} variant="outline">
              <Upload className="w-4 h-4 mr-2" /> Export All
            </Button>
          </div>
          {exportedPairs !== null ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white">{exportedPairs.length} total training pairs</p>
                <Button size="sm" variant="outline" onClick={() => setExportedPairs(null)}>Close</Button>
              </div>
              <div className="max-h-[500px] overflow-y-auto space-y-2">
                {exportedPairs.map((pair: any, idx: number) => (
                  <div key={idx} className="bg-black/30 rounded-lg p-3 border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      {typeBadge(pair.source_type)}
                      <span className="text-xs text-muted-foreground truncate">{pair.source_name}</span>
                    </div>
                    <p className="text-xs text-cyan-400 font-medium mb-1">Q: {pair.instruction}</p>
                    <p className="text-xs text-gray-300">{pair.response.slice(0, 200)}{pair.response.length > 200 ? "..." : ""}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Click "Export All" to view all generated training pairs</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
