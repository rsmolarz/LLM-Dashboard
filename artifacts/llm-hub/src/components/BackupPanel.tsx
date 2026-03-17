import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  Server,
  HardDrive,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

export default function BackupPanel() {
  const [running, setRunning] = useState(false);

  const { data: status, refetch } = useQuery({
    queryKey: ["/api/backup/status"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/backup/status`);
      return res.json();
    },
    refetchInterval: running ? 3000 : 30000,
  });

  const { data: vpsHistory } = useQuery({
    queryKey: ["/api/backup/vps-history"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/backup/vps-history`);
      return res.json();
    },
  });

  const runBackup = useCallback(async (type: "full" | "db-only" | "models-only") => {
    setRunning(true);
    try {
      await fetch(`${API_BASE}/backup/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      setTimeout(() => {
        refetch();
        setRunning(false);
      }, 5000);
    } catch {
      setRunning(false);
    }
  }, [refetch]);

  const lastBackup = status?.lastBackup;
  const history = status?.history || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-400" />
            Backup System
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Snapshot databases, model inventory, and training data
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => runBackup("full")}
          disabled={running || status?.isRunning}
          className="p-4 rounded-xl border border-green-500/20 bg-green-500/5 hover:bg-green-500/10 transition-all text-left disabled:opacity-50"
        >
          <div className="flex items-center gap-2 mb-2">
            {running ? (
              <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
            ) : (
              <Play className="w-4 h-4 text-green-400" />
            )}
            <span className="font-medium text-white text-sm">Full Backup</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Replit DB + VPS DB + Ollama models + Training data
          </p>
        </button>

        <button
          onClick={() => runBackup("db-only")}
          disabled={running || status?.isRunning}
          className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-all text-left disabled:opacity-50"
        >
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="font-medium text-white text-sm">Database Only</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Snapshot both Replit and VPS databases
          </p>
        </button>

        <button
          onClick={() => runBackup("models-only")}
          disabled={running || status?.isRunning}
          className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-all text-left disabled:opacity-50"
        >
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-purple-400" />
            <span className="font-medium text-white text-sm">Models Only</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Inventory all Ollama models on VPS
          </p>
        </button>
      </div>

      {lastBackup && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Last Backup</h4>
            <div className="flex items-center gap-2">
              {lastBackup.status === "complete" ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : lastBackup.status === "running" ? (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span className={cn(
                "text-xs font-medium",
                lastBackup.status === "complete" ? "text-green-400" :
                lastBackup.status === "running" ? "text-cyan-400" : "text-red-400"
              )}>
                {lastBackup.status}
              </span>
              {lastBackup.durationMs && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {(lastBackup.durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {lastBackup.components?.replitDb && (
              <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-medium text-white">Replit DB</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {lastBackup.components.replitDb.tables} tables, {lastBackup.components.replitDb.totalRows} rows
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {lastBackup.components.replitDb.sizeEstimate}
                </p>
              </div>
            )}

            {lastBackup.components?.vpsDb && (
              <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <HardDrive className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs font-medium text-white">VPS DB</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {lastBackup.components.vpsDb.tables} tables, {lastBackup.components.vpsDb.totalRows} rows
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {lastBackup.components.vpsDb.sizeEstimate}
                </p>
              </div>
            )}

            {lastBackup.components?.ollamaModels && (
              <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Server className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs font-medium text-white">Ollama Models</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {lastBackup.components.ollamaModels.models?.length || 0} models
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {lastBackup.components.ollamaModels.totalSizeGb}GB total
                </p>
              </div>
            )}

            {lastBackup.components?.trainingData && (
              <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileText className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-medium text-white">Training Data</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {lastBackup.components.trainingData.datasets} datasets
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {lastBackup.components.trainingData.totalRecords} records
                </p>
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            {new Date(lastBackup.timestamp).toLocaleString()}
          </p>
        </div>
      )}

      {history.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-white mb-3">Backup History</h4>
          <div className="space-y-2">
            {history.slice(1, 6).map((b: any) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div className="flex items-center gap-3">
                  {b.status === "complete" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <div>
                    <p className="text-xs font-medium text-white">{b.type} backup</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(b.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                {b.durationMs && (
                  <span className="text-[10px] text-muted-foreground">
                    {(b.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(vpsHistory?.length ?? 0) > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-white mb-3">VPS Backup Records</h4>
          <div className="space-y-2">
            {(vpsHistory || []).slice(0, 5).map((b: any) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-xs font-medium text-white">{b.backup_id}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Replit: {b.replit_tables}t/{b.replit_rows}r | VPS: {b.vps_tables}t/{b.vps_rows}r | Models: {b.ollama_size_gb}GB
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(b.backup_timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
