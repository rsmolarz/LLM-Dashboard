import { useState } from "react";
import {
  useListVpsTrainingSources,
  useGetVpsTrainingStats,
  useInitVpsTraining,
  useUpdateVpsTrainingSource,
  useDeleteVpsTrainingSource,
  useExportVpsTrainingData,
  useGetVpsTrainingSource,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Database, Loader2, CheckCircle2, Trash2, Download,
  RefreshCw, Star, BarChart3, Mail, HardDrive, Globe,
  ChevronDown, ChevronUp, AlertCircle, Zap, Eye,
  Filter, ArrowUpDown, FileText, Settings
} from "lucide-react";
import AutoCollector from "./AutoCollector";

type SourceFilter = "all" | "gmail" | "drive" | "web" | "manual";
type StatusFilter = "all" | "collected" | "reviewed" | "processed" | "rejected";

export default function VpsTrainingDashboard() {
  const queryClient = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const initTables = useInitVpsTraining();
  const updateSource = useUpdateVpsTrainingSource();
  const deleteSource = useDeleteVpsTrainingSource();
  const exportData = useExportVpsTrainingData();

  const queryParams: any = {};
  if (sourceFilter !== "all") queryParams.source_type = sourceFilter;
  if (statusFilter !== "all") queryParams.status = statusFilter;

  const { data: sourcesData, isLoading: sourcesLoading, error: sourcesError } = useListVpsTrainingSources(queryParams, {
    query: { refetchInterval: 30000 } as any
  });
  const { data: stats } = useGetVpsTrainingStats({
    query: { refetchInterval: 30000 } as any
  });

  const [initDone, setInitDone] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/vps-training") });
  };

  const handleInit = () => {
    initTables.mutate({} as any, {
      onSuccess: () => {
        setInitDone(true);
        invalidateAll();
      }
    });
  };

  const handleUpdateStatus = (id: number, status: string) => {
    updateSource.mutate({ id, data: { status } }, {
      onSuccess: () => invalidateAll(),
    });
  };

  const handleUpdateQuality = (id: number, quality: number) => {
    updateSource.mutate({ id, data: { quality } }, {
      onSuccess: () => invalidateAll(),
    });
  };

  const handleDelete = (id: number) => {
    deleteSource.mutate({ id }, {
      onSuccess: () => invalidateAll(),
    });
  };

  const handleExport = (format: "openai" | "alpaca" | "raw") => {
    exportData.mutate({ data: { format, minQuality: 0 } }, {
      onSuccess: (data) => {
        const blob = new Blob([data as unknown as string], { type: "application/jsonl" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vps-training-${format}.jsonl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });
  };

  const needsInit = sourcesError && !initDone;

  const sourceTypeIcon = (type: string) => {
    switch (type) {
      case "gmail": return <Mail className="w-3.5 h-3.5 text-red-400" />;
      case "drive": return <HardDrive className="w-3.5 h-3.5 text-blue-400" />;
      case "web": return <Globe className="w-3.5 h-3.5 text-green-400" />;
      default: return <FileText className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "collected": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "reviewed": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "processed": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "rejected": return "bg-red-500/10 text-red-400 border-red-500/20";
      default: return "bg-white/5 text-muted-foreground border-white/10";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            VPS Training Data
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Remote DB
            </span>
          </h3>
          <p className="text-sm text-muted-foreground">Collected content from Gmail, Drive, and web — stored on your VPS for training</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleInit}
            disabled={initTables.isPending}
            className="gap-1.5 text-xs border-white/10"
          >
            {initTables.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings className="w-3.5 h-3.5" />}
            Init Tables
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/vps-training"] })}
            className="gap-1.5 text-xs border-white/10"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
        <AutoCollector />
      </div>

      {initDone && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-400">VPS training tables initialized successfully!</span>
        </div>
      )}

      {needsInit && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <p className="text-sm text-amber-400 font-medium">Training tables not found on VPS</p>
          </div>
          <p className="text-xs text-muted-foreground">Click "Init Tables" above to create the training_sources and training_datasets tables on your VPS database.</p>
        </div>
      )}

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Sources" value={stats.total} icon={<Database className="w-4 h-4" />} />
          <StatCard label="Gmail" value={stats.byType?.gmail || 0} icon={<Mail className="w-4 h-4 text-red-400" />} />
          <StatCard label="Drive" value={stats.byType?.drive || 0} icon={<HardDrive className="w-4 h-4 text-blue-400" />} />
          <StatCard label="Processed" value={stats.byStatus?.processed || 0} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
          <StatCard label="Avg Quality" value={stats.avgQuality?.toFixed(1) || "0"} icon={<Star className="w-4 h-4 text-yellow-400" />} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-4">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Filter className="w-4 h-4 text-purple-400" /> Filters
          </h4>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Source Type</p>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "gmail", "drive", "web", "manual"] as SourceFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setSourceFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      sourceFilter === f
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "bg-black/20 border-white/10 text-muted-foreground hover:border-white/20"
                    )}
                  >
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "collected", "reviewed", "processed", "rejected"] as StatusFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      statusFilter === f
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "bg-black/20 border-white/10 text-muted-foreground hover:border-white/20"
                    )}
                  >
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-4">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-400" /> Export Training Data
          </h4>
          <p className="text-xs text-muted-foreground">Export processed training data from your VPS</p>
          <div className="space-y-2">
            {[
              { format: "openai", label: "OpenAI Format", desc: "ChatML JSONL for fine-tuning" },
              { format: "alpaca", label: "Alpaca Format", desc: "instruction/input/output pairs" },
              { format: "raw", label: "Raw Export", desc: "Full source data as JSONL" },
            ].map((f: { format: "openai" | "alpaca" | "raw"; label: string; desc: string }) => (
              <button
                key={f.format}
                onClick={() => handleExport(f.format)}
                disabled={!stats?.total}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-left disabled:opacity-40"
              >
                <div>
                  <p className="text-sm text-white">{f.label}</p>
                  <p className="text-[10px] text-muted-foreground">{f.desc}</p>
                </div>
                <Download className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {sourcesLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !sourcesData?.sources?.length ? (
        <div className="bg-card/30 border border-white/5 rounded-2xl p-12 text-center">
          <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">No training sources yet. Use the Context Scanner to scan Gmail & Drive, then save results to VPS.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">
              Sources ({sourcesData.total})
            </h4>
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {sourcesData.sources.map((source: any) => (
              <SourceCard
                key={source.id}
                source={source}
                expanded={expandedId === source.id}
                onToggle={() => setExpandedId(expandedId === source.id ? null : source.id)}
                onUpdateStatus={handleUpdateStatus}
                onUpdateQuality={handleUpdateQuality}
                onDelete={handleDelete}
                sourceTypeIcon={sourceTypeIcon}
                statusColor={statusColor}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceCard({
  source,
  expanded,
  onToggle,
  onUpdateStatus,
  onUpdateQuality,
  onDelete,
  sourceTypeIcon,
  statusColor,
}: {
  source: any;
  expanded: boolean;
  onToggle: () => void;
  onUpdateStatus: (id: number, status: string) => void;
  onUpdateQuality: (id: number, quality: number) => void;
  onDelete: (id: number) => void;
  sourceTypeIcon: (type: string) => React.ReactNode;
  statusColor: (status: string) => string;
}) {
  const { data: fullSource } = useGetVpsTrainingSource(source.id, {
    query: { enabled: expanded } as any
  });

  return (
    <div className="bg-card/50 border border-white/10 rounded-xl hover:border-white/20 transition-all">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        <div className="mt-0.5">{sourceTypeIcon(source.source_type)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-white truncate">{source.title}</p>
            <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-medium border", statusColor(source.status))}>
              {source.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {source.sender && <span>{source.sender}</span>}
            <span>{new Date(source.collected_at).toLocaleDateString()}</span>
            <span className="uppercase bg-white/5 px-1.5 py-0.5 rounded">{source.source_type}</span>
            {source.quality > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" /> {source.quality}
              </span>
            )}
          </div>
          {source.content_preview && (
            <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2">{source.content_preview}</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
          {fullSource?.content ? (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto font-mono bg-black/30 rounded-lg p-3">
              {fullSource.content}
            </pre>
          ) : (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Loading content...</span>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Status:</span>
            {["collected", "reviewed", "processed", "rejected"].map(s => (
              <button
                key={s}
                onClick={() => onUpdateStatus(source.id, s)}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-medium border transition-all",
                  source.status === s
                    ? statusColor(s)
                    : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Quality:</span>
            {[1, 2, 3, 4, 5].map(q => (
              <button
                key={q}
                onClick={() => onUpdateQuality(source.id, q)}
                className="p-0.5"
              >
                <Star className={cn(
                  "w-4 h-4 transition-colors",
                  q <= (source.quality || 0)
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-gray-600 hover:text-yellow-400/50"
                )} />
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(source.id)}
              className="text-xs text-red-400 border-red-500/20 hover:bg-red-500/10"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="bg-card/50 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
