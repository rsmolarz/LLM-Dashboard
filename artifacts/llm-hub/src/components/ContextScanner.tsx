import { useState } from "react";
import {
  useScanGmail,
  useScanGmailMessage,
  useScanDrive,
  useScanDriveContent,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Mail, HardDrive, Loader2, Search, ChevronDown, ChevronUp,
  FileText, ExternalLink, Clock, User, AlertCircle, X
} from "lucide-react";

type ScanTab = "gmail" | "drive";

export default function ContextScanner() {
  const [activeTab, setActiveTab] = useState<ScanTab>("gmail");
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(20);

  const scanGmail = useScanGmail();
  const scanDrive = useScanDrive();

  const [gmailResults, setGmailResults] = useState<any>(null);
  const [driveResults, setDriveResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const isScanning = scanGmail.isPending || scanDrive.isPending;

  const handleScan = () => {
    setError(null);
    if (activeTab === "gmail") {
      scanGmail.mutate(
        { data: { query: query || undefined, maxResults } },
        {
          onSuccess: (data: any) => setGmailResults(data),
          onError: (err: any) => setError(err?.message || "Gmail scan failed"),
        }
      );
    } else {
      scanDrive.mutate(
        { data: { query: query || undefined, maxResults } },
        {
          onSuccess: (data: any) => setDriveResults(data),
          onError: (err: any) => setError(err?.message || "Drive scan failed"),
        }
      );
    }
  };

  return (
    <div className="bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border border-cyan-500/20 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
          <Search className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h4 className="font-semibold text-white flex items-center gap-2">
            Context Scanner
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              Gmail + Drive
            </span>
          </h4>
          <p className="text-xs text-muted-foreground">
            Search your Gmail and Google Drive to find relevant context for discovery
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {(["gmail", "drive"] as ScanTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
              activeTab === tab
                ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
                : "bg-black/20 border-white/10 text-muted-foreground hover:border-white/20"
            )}
          >
            {tab === "gmail" ? <Mail className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
            {tab === "gmail" ? "Gmail" : "Google Drive"}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            activeTab === "gmail"
              ? "Search emails... (e.g. 'database API dataset')"
              : "Search files... (e.g. 'research report data')"
          }
          className="flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleScan()}
        />
        <select
          value={maxResults}
          onChange={(e) => setMaxResults(Number(e.target.value))}
          className="bg-[#18181B] border border-white/10 rounded-lg px-2 py-2 text-xs text-white w-20"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={30}>30</option>
          <option value={50}>50</option>
        </select>
        <Button
          onClick={handleScan}
          disabled={isScanning}
          className="gap-1.5 bg-cyan-600 hover:bg-cyan-700"
        >
          {isScanning ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
          ) : (
            <><Search className="w-4 h-4" /> Scan</>
          )}
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === "gmail" && gmailResults && (
        <GmailResults data={gmailResults} />
      )}

      {activeTab === "drive" && driveResults && (
        <DriveResults data={driveResults} />
      )}
    </div>
  );
}

function GmailResults({ data }: { data: any }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const getMessage = useScanGmailMessage();
  const [messageBody, setMessageBody] = useState<Record<string, string>>({});

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!messageBody[id]) {
      getMessage.mutate(
        { data: { messageId: id } },
        {
          onSuccess: (res: any) => {
            setMessageBody((prev) => ({ ...prev, [id]: res.body }));
          },
        }
      );
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Found <span className="text-white font-medium">{data.total}</span> emails matching "{data.query}"
      </p>
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
        {data.results?.map((msg: any) => (
          <div
            key={msg.id}
            className="bg-black/30 rounded-lg border border-white/5 hover:border-white/15 transition-all"
          >
            <button
              onClick={() => handleExpand(msg.id)}
              className="w-full text-left p-3 flex items-start gap-3"
            >
              <Mail className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{msg.subject}</p>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="w-2.5 h-2.5" /> {msg.from}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {msg.date}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{msg.snippet}</p>
              </div>
              {expandedId === msg.id ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
            {expandedId === msg.id && (
              <div className="px-3 pb-3 border-t border-white/5 pt-2">
                {getMessage.isPending && !messageBody[msg.id] ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                    <span className="text-xs text-muted-foreground">Loading message...</span>
                  </div>
                ) : messageBody[msg.id] ? (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto font-mono">
                    {messageBody[msg.id]}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground/50">No content available</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DriveResults({ data }: { data: any }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const getContent = useScanDriveContent();
  const [fileContent, setFileContent] = useState<Record<string, string | null>>({});

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (fileContent[id] === undefined) {
      getContent.mutate(
        { data: { fileId: id } },
        {
          onSuccess: (res: any) => {
            setFileContent((prev) => ({ ...prev, [id]: res.content || res.message || null }));
          },
          onError: () => {
            setFileContent((prev) => ({ ...prev, [id]: null }));
          },
        }
      );
    }
  };

  const mimeIcons: Record<string, string> = {
    "application/vnd.google-apps.document": "Doc",
    "application/vnd.google-apps.spreadsheet": "Sheet",
    "application/vnd.google-apps.presentation": "Slides",
    "application/pdf": "PDF",
    "text/plain": "Text",
    "application/json": "JSON",
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Found <span className="text-white font-medium">{data.total}</span> files matching "{data.query}"
      </p>
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
        {data.results?.map((file: any) => (
          <div
            key={file.id}
            className="bg-black/30 rounded-lg border border-white/5 hover:border-white/15 transition-all"
          >
            <button
              onClick={() => handleExpand(file.id)}
              className="w-full text-left p-3 flex items-start gap-3"
            >
              <FileText className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white truncate">{file.name}</p>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
                    {mimeIcons[file.mimeType] || file.mimeType?.split("/").pop() || "File"}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="w-2.5 h-2.5" /> {file.owner}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {new Date(file.modifiedTime).toLocaleDateString()}
                  </span>
                  {file.size && <span>{(file.size / 1024).toFixed(1)} KB</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {file.webViewLink && (
                  <a
                    href={file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                    title="Open in Google Drive"
                  >
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                )}
                {expandedId === file.id ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </button>
            {expandedId === file.id && (
              <div className="px-3 pb-3 border-t border-white/5 pt-2">
                {getContent.isPending && fileContent[file.id] === undefined ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                    <span className="text-xs text-muted-foreground">Loading content...</span>
                  </div>
                ) : fileContent[file.id] ? (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto font-mono">
                    {fileContent[file.id]}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground/50">Content preview not available for this file type</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
