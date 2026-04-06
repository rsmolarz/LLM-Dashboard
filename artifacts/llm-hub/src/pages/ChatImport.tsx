import { useState, useEffect, useCallback } from "react";
import JSZip from "jszip";
import {
  Upload, FileJson, FileText, Loader2, Check, X, ChevronDown, ChevronUp,
  MessageSquare, Trash2, Eye, AlertCircle, Bot, User, RefreshCw,
  Download, Search, CheckCircle2, Info, Clock, Hash, Archive,
} from "lucide-react";

const API = import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";

interface ImportPreview {
  format: string;
  totalConversations: number;
  totalMessages: number;
  preview: {
    title: string;
    model: string;
    source: string;
    messageCount: number;
    createdAt: string | null;
    firstMessage: string;
    lastMessage: string;
  }[];
}

interface ImportedConversation {
  id: number;
  title: string;
  model: string;
  source: string;
  filename: string;
  createdAt: string;
  messageCount: number;
}

interface ViewMessage {
  id: number;
  role: string;
  content: string;
  createdAt: string;
}

const SOURCE_COLORS: Record<string, string> = {
  chatgpt: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  claude: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  gemini: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  markdown: "text-gray-400 bg-gray-500/10 border-gray-500/20",
  json: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  imported: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};

const SOURCE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  markdown: "Text/Markdown",
  json: "JSON",
};

const CHUNK_SIZE_BYTES = 2 * 1024 * 1024;

function splitJsonIntoChunks(content: string, filename: string): { content: string; filename: string }[] {
  try {
    const data = JSON.parse(content);
    if (!Array.isArray(data) || data.length <= 1) {
      return [{ content, filename }];
    }

    const chunks: { content: string; filename: string }[] = [];
    let currentBatch: any[] = [];
    let currentSize = 0;

    for (const item of data) {
      const itemStr = JSON.stringify(item);
      if (currentBatch.length > 0 && currentSize + itemStr.length > CHUNK_SIZE_BYTES) {
        chunks.push({
          content: JSON.stringify(currentBatch),
          filename,
        });
        currentBatch = [];
        currentSize = 0;
      }
      currentBatch.push(item);
      currentSize += itemStr.length;
    }

    if (currentBatch.length > 0) {
      chunks.push({
        content: JSON.stringify(currentBatch),
        filename,
      });
    }

    return chunks.length > 0 ? chunks : [{ content, filename }];
  } catch {
    return [{ content, filename }];
  }
}

export default function ChatImport() {
  const [tab, setTab] = useState<"import" | "history">("import");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileChunks, setFileChunks] = useState<{ content: string; filename: string }[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [imported, setImported] = useState<ImportedConversation[]>([]);
  const [loadingImported, setLoadingImported] = useState(false);
  const [viewConversation, setViewConversation] = useState<ImportedConversation | null>(null);
  const [viewMessages, setViewMessages] = useState<ViewMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPreview, setExpandedPreview] = useState<number | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number; phase: string } | null>(null);

  const loadImported = useCallback(async () => {
    setLoadingImported(true);
    try {
      const res = await fetch(`${API}/api/chat-import/imported`);
      const data = await res.json();
      setImported(data.conversations || []);
    } catch (err: any) {
      console.error("Failed to load imported conversations:", err);
    }
    setLoadingImported(false);
  }, []);

  useEffect(() => { loadImported(); }, [loadImported]);

  const extractTextFromZip = useCallback(async (file: File): Promise<{ content: string; filename: string }[]> => {
    const MAX_ENTRIES = 500;
    const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

    const zip = await JSZip.loadAsync(file);
    const textExtensions = /\.(json|txt|text|md|markdown|csv|jsonl)$/i;
    const preferredFiles = /conversations\.json$/i;
    const results: { content: string; filename: string; preferred: boolean }[] = [];

    const entries = Object.entries(zip.files).filter(([, e]) => !e.dir);
    if (entries.length > MAX_ENTRIES) {
      throw new Error(`ZIP contains too many files (${entries.length}). Maximum ${MAX_ENTRIES} entries allowed.`);
    }

    let totalBytes = 0;
    for (const [path, entry] of entries) {
      if (!textExtensions.test(path)) continue;
      if (entry._data && (entry as any)._data.uncompressedSize > MAX_ENTRY_BYTES) continue;
      try {
        const text = await entry.async("string");
        if (text.length > MAX_ENTRY_BYTES) continue;
        totalBytes += text.length;
        if (totalBytes > MAX_TOTAL_BYTES) {
          throw new Error("ZIP contents exceed maximum total size limit (100MB uncompressed).");
        }
        if (text.trim().length > 0) {
          const name = path.split("/").pop() || path;
          results.push({ content: text, filename: name, preferred: preferredFiles.test(name) });
        }
      } catch (err: any) {
        if (err.message?.includes("exceed")) throw err;
      }
    }

    const preferred = results.filter(r => r.preferred);
    if (preferred.length > 0) return preferred;
    return results;
  }, []);

  const [chunkConvCounts, setChunkConvCounts] = useState<number[]>([]);

  const parseChunks = useCallback(async (chunks: { content: string; filename: string }[]): Promise<ImportPreview> => {
    const aggregated: ImportPreview = { format: "", totalConversations: 0, totalMessages: 0, preview: [] };
    const counts: number[] = [];

    for (let i = 0; i < chunks.length; i++) {
      setChunkProgress({ current: i + 1, total: chunks.length, phase: "Analyzing" });
      const res = await fetch(`${API}/api/chat-import/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: chunks[i].content, filename: chunks[i].filename }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to parse chunk ${i + 1}`);

      if (i === 0) aggregated.format = data.format;
      aggregated.totalConversations += data.totalConversations;
      aggregated.totalMessages += data.totalMessages;
      aggregated.preview.push(...data.preview);
      counts.push(data.totalConversations);
    }

    setChunkConvCounts(counts);
    setChunkProgress(null);
    return aggregated;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setPreview(null);
    setImportResult(null);
    setUploading(true);
    setChunkProgress(null);

    try {
      const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";

      let rawContent: string;
      let rawFilename: string;

      if (isZip) {
        setChunkProgress({ current: 0, total: 0, phase: "Extracting ZIP" });
        const extracted = await extractTextFromZip(file);
        if (extracted.length === 0) {
          throw new Error("No readable text or JSON files found in the ZIP archive. The ZIP may only contain images or binary files.");
        }

        const jsonFiles = extracted.filter(f => f.filename.toLowerCase().endsWith(".json"));
        const primary = jsonFiles.length > 0 ? jsonFiles : extracted;

        if (primary.length === 1) {
          rawContent = primary[0].content;
          rawFilename = primary[0].filename;
        } else {
          const allParsed: any[] = [];
          let allJson = true;
          for (const f of primary) {
            try {
              const parsed = JSON.parse(f.content);
              if (Array.isArray(parsed)) {
                allParsed.push(...parsed);
              } else {
                allParsed.push(parsed);
              }
            } catch {
              allJson = false;
            }
          }
          if (allJson && allParsed.length > 0) {
            rawContent = JSON.stringify(allParsed);
            rawFilename = file.name.replace(/\.zip$/i, ".json");
          } else {
            rawContent = primary.map(f => f.content).join("\n\n---\n\n");
            rawFilename = file.name.replace(/\.zip$/i, ".md");
          }
        }
      } else {
        rawContent = await file.text();
        rawFilename = file.name;
      }

      const chunks = splitJsonIntoChunks(rawContent, rawFilename);
      setFileChunks(chunks);
      setFileName(rawFilename);

      const data = await parseChunks(chunks);

      setPreview(data);
      setSelectedIndices(data.preview.map((_: any, i: number) => i));
    } catch (err: any) {
      setError(err.message);
    }
    setUploading(false);
    setChunkProgress(null);
  }, [extractTextFromZip, parseChunks]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const doImport = async () => {
    if (fileChunks.length === 0 || !fileName || selectedIndices.length === 0) return;
    setImporting(true);
    setError("");

    try {
      let totalImportedConversations = 0;
      let totalImportedMessages = 0;
      let totalSkipped = 0;
      let detectedFormat = "";
      let globalOffset = 0;

      for (let i = 0; i < fileChunks.length; i++) {
        setChunkProgress({ current: i + 1, total: fileChunks.length, phase: "Importing" });

        const convCount = chunkConvCounts[i] ?? 1;

        const chunkSelectedIndices = selectedIndices
          .filter(idx => idx >= globalOffset && idx < globalOffset + convCount)
          .map(idx => idx - globalOffset);

        globalOffset += convCount;

        if (chunkSelectedIndices.length === 0) continue;

        const res = await fetch(`${API}/api/chat-import/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: fileChunks[i].content,
            filename: fileChunks[i].filename,
            selectedIndices: chunkSelectedIndices,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Import failed on batch ${i + 1}`);

        totalImportedConversations += data.importedConversations || 0;
        totalImportedMessages += data.importedMessages || 0;
        totalSkipped += data.skippedConversations || 0;
        if (!detectedFormat) detectedFormat = data.format;
      }

      setImportResult({
        success: true,
        format: detectedFormat,
        importedConversations: totalImportedConversations,
        importedMessages: totalImportedMessages,
        skippedConversations: totalSkipped,
      });
      loadImported();
    } catch (err: any) {
      setError(err.message);
    }
    setImporting(false);
    setChunkProgress(null);
  };

  const viewChat = async (conv: ImportedConversation) => {
    setViewConversation(conv);
    setLoadingMessages(true);
    try {
      const res = await fetch(`${API}/api/chat-import/imported/${conv.id}/messages`);
      const data = await res.json();
      setViewMessages(data.messages || []);
    } catch (err: any) {
      console.error("Failed to load messages:", err);
      setError("Failed to load conversation messages");
    }
    setLoadingMessages(false);
  };

  const deleteChat = async (id: number) => {
    try {
      await fetch(`${API}/api/chat-import/imported/${id}`, { method: "DELETE" });
      setImported(prev => prev.filter(c => c.id !== id));
      if (viewConversation?.id === id) {
        setViewConversation(null);
        setViewMessages([]);
      }
    } catch (err: any) {
      console.error("Failed to delete conversation:", err);
      setError("Failed to delete conversation");
    }
  };

  const resetImport = () => {
    setPreview(null);
    setFileChunks([]);
    setFileName("");
    setSelectedIndices([]);
    setImportResult(null);
    setError("");
    setChunkProgress(null);
    setChunkConvCounts([]);
  };

  const toggleSelection = (index: number) => {
    setSelectedIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const filteredImported = imported.filter(c =>
    !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.source.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Download className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">Chat Import</h1>
            <p className="text-[10px] text-muted-foreground">Import conversations from ChatGPT, Claude, Gemini & more</p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
          <button onClick={() => setTab("import")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "import" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}>
            <Upload className="w-3 h-3 inline mr-1" /> Import
          </button>
          <button onClick={() => setTab("history")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "history" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}>
            <MessageSquare className="w-3 h-3 inline mr-1" /> History ({imported.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "import" && (
          <div className="max-w-3xl mx-auto space-y-4">
            {!preview && !importResult && (
              <>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
                    dragOver ? "border-blue-500 bg-blue-500/5" : "border-white/10 hover:border-white/20 bg-white/[0.02]"
                  }`}
                  onClick={() => document.getElementById("chat-import-file")?.click()}>
                  <input id="chat-import-file" type="file" accept=".json,.md,.txt,.text,.zip,.jsonl,.csv,.markdown" className="hidden" onChange={handleFileInput} />
                  {uploading ? (
                    <div className="space-y-3">
                      <Loader2 className="w-10 h-10 mx-auto text-blue-400 animate-spin" />
                      <p className="text-sm text-white">
                        {chunkProgress?.phase === "Extracting ZIP" ? "Extracting ZIP archive..." :
                         chunkProgress && chunkProgress.total > 1
                           ? `${chunkProgress.phase} batch ${chunkProgress.current} of ${chunkProgress.total}...`
                           : "Parsing file..."}
                      </p>
                      {chunkProgress && chunkProgress.total > 1 && (
                        <div className="w-48 mx-auto">
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.round((chunkProgress.current / chunkProgress.total) * 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {Math.round((chunkProgress.current / chunkProgress.total) * 100)}% complete
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-white mb-1">Drop your chat export file here</p>
                      <p className="text-[11px] text-muted-foreground">Supports ZIP archives, JSON, Markdown, and Text files up to 20MB</p>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-emerald-400">G</span>
                      </div>
                      <span className="text-xs font-medium text-white">ChatGPT</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Settings &rarr; Data controls &rarr; Export data. Upload the ZIP directly or extract and upload <code className="text-white/60 bg-white/5 px-1 rounded">conversations.json</code>.
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-amber-400">C</span>
                      </div>
                      <span className="text-xs font-medium text-white">Claude</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Settings &rarr; Account &rarr; Export Data. Upload the ZIP directly or extract and upload <code className="text-white/60 bg-white/5 px-1 rounded">conversations.json</code>.
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-400">G</span>
                      </div>
                      <span className="text-xs font-medium text-white">Gemini</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Use Google Takeout &rarr; select Gemini Apps. Download and upload the conversation JSON files.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] text-muted-foreground space-y-1">
                      <p><strong className="text-white/80">Also supports:</strong> Plain text and markdown files with User/Assistant dialogue format. Copy-paste conversations from any source into a .txt or .md file.</p>
                      <p><strong className="text-white/80">Format:</strong> Use prefixes like <code className="bg-white/5 px-1 rounded">User:</code> / <code className="bg-white/5 px-1 rounded">Assistant:</code> or <code className="bg-white/5 px-1 rounded">Human:</code> / <code className="bg-white/5 px-1 rounded">AI:</code> to mark speakers.</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-red-400 font-medium">Error</p>
                  <p className="text-[11px] text-red-400/80">{error}</p>
                </div>
              </div>
            )}

            {preview && !importResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold uppercase ${SOURCE_COLORS[preview.format] || SOURCE_COLORS.json}`}>
                      {SOURCE_LABELS[preview.format] || preview.format}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="text-white font-medium">{preview.totalConversations}</span> conversations,{" "}
                      <span className="text-white font-medium">{preview.totalMessages}</span> messages
                    </div>
                  </div>
                  <button onClick={resetImport} className="text-[10px] text-muted-foreground hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-all">
                    <X className="w-3 h-3 inline mr-1" /> Cancel
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setSelectedIndices(preview.preview.map((_, i) => i))}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-muted-foreground hover:text-white transition-all">
                    Select All
                  </button>
                  <button onClick={() => setSelectedIndices([])}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-muted-foreground hover:text-white transition-all">
                    Deselect All
                  </button>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {selectedIndices.length} of {preview.totalConversations} selected
                  </span>
                </div>

                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {preview.preview.map((conv, i) => (
                    <div key={i} className={`rounded-lg border transition-all ${
                      selectedIndices.includes(i)
                        ? "bg-blue-500/[0.04] border-blue-500/20"
                        : "bg-white/[0.01] border-white/[0.06]"
                    }`}>
                      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                        onClick={() => toggleSelection(i)}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                          selectedIndices.includes(i)
                            ? "bg-blue-500 border-blue-500"
                            : "border-white/20"
                        }`}>
                          {selectedIndices.includes(i) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-white truncate block">{conv.title}</span>
                          <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Hash className="w-2.5 h-2.5" />{conv.messageCount} msgs</span>
                            <span>{conv.model}</span>
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setExpandedPreview(expandedPreview === i ? null : i); }}
                          className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-white transition-all">
                          {expandedPreview === i ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                      {expandedPreview === i && (
                        <div className="px-3 pb-2 space-y-1.5 border-t border-white/[0.04] pt-2">
                          <div className="rounded-lg bg-white/[0.02] p-2">
                            <p className="text-[9px] text-muted-foreground mb-0.5">First message:</p>
                            <p className="text-[11px] text-gray-400 line-clamp-3">{conv.firstMessage}</p>
                          </div>
                          <div className="rounded-lg bg-white/[0.02] p-2">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Last message:</p>
                            <p className="text-[11px] text-gray-400 line-clamp-3">{conv.lastMessage}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {fileChunks.length > 1 && !importing && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/[0.04] border border-blue-500/10">
                      <Archive className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      <p className="text-[10px] text-blue-300">
                        Large file detected — will be processed in {fileChunks.length} batches automatically
                      </p>
                    </div>
                  )}
                  {importing && chunkProgress && chunkProgress.total > 1 && (
                    <div className="px-3 py-2 rounded-lg bg-blue-500/[0.04] border border-blue-500/10 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-blue-300">{chunkProgress.phase} batch {chunkProgress.current} of {chunkProgress.total}</span>
                        <span className="text-muted-foreground">{Math.round((chunkProgress.current / chunkProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((chunkProgress.current / chunkProgress.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <button onClick={doImport}
                    disabled={importing || selectedIndices.length === 0}
                    className="w-full py-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 font-medium text-sm hover:bg-blue-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                    {importing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Importing {selectedIndices.length} conversations...</>
                    ) : (
                      <><Download className="w-4 h-4" /> Import {selectedIndices.length} Conversations</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {importResult && (
              <div className="rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20 p-6 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-white">Import Complete</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    <span className="text-emerald-400 font-medium">{importResult.importedConversations}</span> conversations with{" "}
                    <span className="text-emerald-400 font-medium">{importResult.importedMessages}</span> messages imported successfully
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <button onClick={resetImport}
                    className="px-4 py-1.5 rounded-lg bg-white/5 text-xs text-white hover:bg-white/10 transition-all">
                    Import More
                  </button>
                  <button onClick={() => setTab("history")}
                    className="px-4 py-1.5 rounded-lg bg-blue-500/10 text-xs text-blue-400 hover:bg-blue-500/20 transition-all">
                    View History
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="max-w-5xl mx-auto">
            {viewConversation ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setViewConversation(null); setViewMessages([]); }}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-all">
                    <X className="w-4 h-4" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-medium text-white truncate">{viewConversation.title}</h2>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className={`px-1.5 py-0.5 rounded border ${SOURCE_COLORS[viewConversation.source] || SOURCE_COLORS.json}`}>
                        {viewConversation.source}
                      </span>
                      <span>{viewConversation.messageCount} messages</span>
                      <span>{viewConversation.model}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : viewMessages.map(msg => (
                    <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                      {msg.role !== "user" && (
                        <div className="w-6 h-6 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5 text-violet-400" />
                        </div>
                      )}
                      <div className={`rounded-xl px-3 py-2 text-xs max-w-[80%] ${
                        msg.role === "user"
                          ? "bg-blue-500/10 text-white border border-blue-500/20"
                          : "bg-white/[0.02] text-gray-300 border border-white/[0.06]"
                      }`}>
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      </div>
                      {msg.role === "user" && (
                        <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <User className="w-3.5 h-3.5 text-cyan-400" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search imported conversations..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder:text-muted-foreground/40 focus:outline-none focus:border-blue-500/40" />
                  </div>
                  <button onClick={loadImported}
                    className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-white transition-all">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {loadingImported ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredImported.length === 0 ? (
                  <div className="text-center py-16 space-y-2">
                    <MessageSquare className="w-10 h-10 text-muted-foreground/20 mx-auto" />
                    <p className="text-xs text-muted-foreground">
                      {imported.length === 0
                        ? "No imported conversations yet. Upload a chat export to get started."
                        : "No conversations match your search."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredImported.map(conv => (
                      <div key={conv.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 hover:bg-white/[0.03] transition-all group">
                        <div className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase flex-shrink-0 ${SOURCE_COLORS[conv.source] || SOURCE_COLORS.json}`}>
                          {conv.source}
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => viewChat(conv)}>
                          <p className="text-xs text-white truncate">{conv.title.replace(/^\[\w+\]\s*/, "")}</p>
                          <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Hash className="w-2.5 h-2.5" />{conv.messageCount} msgs</span>
                            <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(conv.createdAt).toLocaleDateString()}</span>
                            <span>{conv.model}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => viewChat(conv)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white" title="View">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteChat(conv.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
