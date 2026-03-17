import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Activity, Server, Database, HardDrive, Brain, Clock,
  RefreshCw, CheckCircle2, XCircle, AlertCircle, Loader2,
  Mail, FolderOpen, MessageSquare, Globe, BookOpen,
  Cpu, Zap, Timer, TrendingUp, Play, Pause, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface DashboardData {
  timestamp: string;
  uptime: string;
  collector: {
    enabled: boolean;
    isRunning: boolean;
    intervalMinutes: number;
    lastRunAt: string | null;
    totalRuns: number;
    totalCollected: number;
    serverStartedAt: string;
    nextRunInSeconds: number | null;
    recentRuns: Array<{
      id: string;
      startedAt: string;
      completedAt: string | null;
      status: string;
      results: {
        gmail: number;
        drive: number;
        conversations: number;
        discovery: number;
        knowledgeBase: number;
        processed: number;
        errors: string[];
      };
    }>;
    sources: Record<string, boolean>;
  };
  ollama: {
    online: boolean;
    url: string;
    models: Array<{
      name: string;
      sizeGb: number;
      family: string;
      parameterSize: string;
      quantization: string;
    }>;
    totalModels: number;
    totalSizeGb: number;
    runningModels: Array<{ name: string; expiresAt: string }>;
  };
  replitDb: {
    tables: number;
    totalRows: number;
    sizeMb: number;
    tableStats: Record<string, number>;
    error?: string;
  };
  vpsDb: {
    connected: boolean;
    tables: number;
    totalRows: number;
    sizeMb: number;
    tableStats: Record<string, number>;
    lastBackup: { backup_id: string; backup_timestamp: string; status: string; duration_ms: number } | null;
    trainingSources: Record<string, number>;
    error?: string;
  };
  knowledgeBase: {
    totalDocuments: number;
    totalChunks: number;
    categories: Array<{ category: string; documents: number; chunks: number }>;
    error?: string;
  };
  chat: {
    conversations: number;
    messages: number;
  };
}

function StatusBadge({ status, label }: { status: "online" | "offline" | "running" | "stopped"; label: string }) {
  const colors = {
    online: "bg-green-500/20 text-green-400 border-green-500/30",
    running: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    offline: "bg-red-500/20 text-red-400 border-red-500/30",
    stopped: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  const dots = {
    online: "bg-green-500",
    running: "bg-blue-500",
    offline: "bg-red-500",
    stopped: "bg-yellow-500",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", colors[status])}>
      <span className={cn("w-1.5 h-1.5 rounded-full", dots[status], (status === "online" || status === "running") && "animate-pulse")} />
      {label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="glass-panel rounded-xl p-4 border border-white/5">
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center bg-white/5", color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatUptime(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours < 1) return `${mins}m`;
  if (hours < 24) return `${hours}h ${mins}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default function Monitor() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [toggling, setToggling] = useState(false);

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/monitor/dashboard`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
      setError(null);
      if (json.collector?.nextRunInSeconds != null) {
        setCountdown(json.collector.nextRunInSeconds);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to fetch dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(() => fetchDashboard(), 30000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(c => (c !== null && c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const toggleCollector = async () => {
    if (!data) return;
    setToggling(true);
    try {
      const endpoint = data.collector.enabled ? "stop" : "start";
      await fetch(`${API_BASE}/api/auto-collector/${endpoint}`, { method: "POST" });
      await fetchDashboard();
    } finally {
      setToggling(false);
    }
  };

  const runCollectorNow = async () => {
    try {
      await fetch(`${API_BASE}/api/auto-collector/run-now`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      setTimeout(() => fetchDashboard(), 2000);
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-400">{error}</p>
          <Button onClick={() => fetchDashboard()} className="mt-4">Retry</Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totalTrainingSources = Object.values(data.vpsDb.trainingSources || {}).reduce((s, v) => s + v, 0);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-primary" />
            System Monitor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Server uptime: {formatUptime(data.uptime)} &middot; Last refresh: {formatTimeAgo(data.timestamp)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDashboard(true)}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard icon={Server} label="VPS Models" value={data.ollama.totalModels} sub={`${data.ollama.totalSizeGb} GB`} color="text-blue-400" />
        <StatCard icon={Cpu} label="Running Models" value={data.ollama.runningModels.length} sub={data.ollama.online ? "Ollama Online" : "Offline"} color="text-green-400" />
        <StatCard icon={Database} label="Replit DB" value={`${data.replitDb.totalRows} rows`} sub={`${data.replitDb.tables} tables, ${data.replitDb.sizeMb} MB`} color="text-violet-400" />
        <StatCard icon={HardDrive} label="VPS DB" value={`${data.vpsDb.totalRows} rows`} sub={`${data.vpsDb.tables} tables, ${data.vpsDb.sizeMb} MB`} color="text-orange-400" />
        <StatCard icon={Brain} label="Knowledge Base" value={`${data.knowledgeBase.totalChunks} chunks`} sub={`${data.knowledgeBase.totalDocuments} documents`} color="text-pink-400" />
        <StatCard icon={MessageSquare} label="Chat History" value={data.chat.conversations} sub={`${data.chat.messages} messages`} color="text-cyan-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 glass-panel rounded-xl border border-white/5 p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-white">Auto-Collector</h2>
              <StatusBadge
                status={data.collector.isRunning ? "running" : data.collector.enabled ? "online" : "stopped"}
                label={data.collector.isRunning ? "Collecting..." : data.collector.enabled ? "Active" : "Stopped"}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={runCollectorNow}
                disabled={data.collector.isRunning}
                className="gap-1.5 text-xs"
              >
                <Zap className="w-3.5 h-3.5" />
                Run Now
              </Button>
              <Button
                variant={data.collector.enabled ? "destructive" : "default"}
                size="sm"
                onClick={toggleCollector}
                disabled={toggling}
                className="gap-1.5 text-xs"
              >
                {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                  data.collector.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {data.collector.enabled ? "Stop" : "Start"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Total Runs</p>
              <p className="text-lg font-bold text-white">{data.collector.totalRuns}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Items Collected</p>
              <p className="text-lg font-bold text-white">{data.collector.totalCollected}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Last Run</p>
              <p className="text-lg font-bold text-white">{formatTimeAgo(data.collector.lastRunAt)}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Next Run</p>
              <p className="text-lg font-bold text-white">
                {countdown !== null && countdown > 0 ? formatDuration(countdown) : data.collector.enabled ? "Soon" : "—"}
              </p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Active Sources</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.collector.sources).map(([key, enabled]) => {
                const icons: Record<string, any> = { gmail: Mail, drive: FolderOpen, conversations: MessageSquare, discovery: Globe, knowledgeBase: BookOpen };
                const Icon = icons[key] || Activity;
                return (
                  <span key={key} className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border",
                    enabled ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-white/5 text-muted-foreground border-white/10"
                  )}>
                    <Icon className="w-3 h-3" />
                    {key}
                  </span>
                );
              })}
            </div>
          </div>

          {data.collector.recentRuns.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Recent Runs</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {data.collector.recentRuns.map((run) => {
                  const total = run.results.gmail + run.results.drive + run.results.conversations + run.results.discovery + run.results.knowledgeBase;
                  return (
                    <div key={run.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        {run.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> :
                         run.status === "running" ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" /> :
                         <XCircle className="w-3.5 h-3.5 text-red-400" />}
                        <span className="text-muted-foreground">{formatTimeAgo(run.startedAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        {run.results.gmail > 0 && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{run.results.gmail}</span>}
                        {run.results.drive > 0 && <span className="flex items-center gap-1"><FolderOpen className="w-3 h-3" />{run.results.drive}</span>}
                        {run.results.conversations > 0 && <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{run.results.conversations}</span>}
                        {run.results.processed > 0 && <span className="flex items-center gap-1"><Brain className="w-3 h-3" />{run.results.processed}</span>}
                        <span className="font-medium text-white">{total} items</span>
                        {run.results.errors.length > 0 && (
                          <span className="text-yellow-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{run.results.errors.length}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-xl border border-white/5 p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <Server className="w-5 h-5 text-blue-400" />
            <h2 className="font-semibold text-white">VPS Ollama</h2>
            <StatusBadge status={data.ollama.online ? "online" : "offline"} label={data.ollama.online ? "Online" : "Offline"} />
          </div>

          {data.ollama.online ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Size</span>
                <span className="text-white font-medium">{data.ollama.totalSizeGb} GB</span>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Installed Models</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {data.ollama.models.map((m) => {
                    const isRunning = data.ollama.runningModels.some(r => r.name === m.name);
                    return (
                      <div key={m.name} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                          <span className="text-white font-medium">{m.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          {m.parameterSize && <span>{m.parameterSize}</span>}
                          <span>{m.sizeGb}GB</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {data.ollama.runningModels.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Currently Loaded</p>
                  {data.ollama.runningModels.map((m) => (
                    <div key={m.name} className="text-xs text-green-400 flex items-center gap-1">
                      <Cpu className="w-3 h-3" /> {m.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-400">VPS Unreachable</p>
              <p className="text-xs text-muted-foreground mt-1">{data.ollama.url || "Not configured"}</p>
            </div>
          )}
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-xl border border-white/5 p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <Brain className="w-5 h-5 text-pink-400" />
            <h2 className="font-semibold text-white">Knowledge Base</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Documents</span>
              <span className="text-white font-bold">{data.knowledgeBase.totalDocuments}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">RAG Chunks</span>
              <span className="text-white font-bold">{data.knowledgeBase.totalChunks}</span>
            </div>
            {data.knowledgeBase.categories.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Categories</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {data.knowledgeBase.categories.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 text-xs">
                      <span className="text-white truncate max-w-[60%]">{cat.category}</span>
                      <span className="text-muted-foreground">{cat.documents} docs, {cat.chunks} chunks</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-panel rounded-xl border border-white/5 p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <Database className="w-5 h-5 text-violet-400" />
            <h2 className="font-semibold text-white">Replit Database</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Size</span>
              <span className="text-white font-bold">{data.replitDb.sizeMb} MB</span>
            </div>
            {Object.keys(data.replitDb.tableStats).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Tables ({data.replitDb.tables})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {Object.entries(data.replitDb.tableStats)
                    .sort((a, b) => b[1] - a[1])
                    .map(([table, rows]) => (
                      <div key={table} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-white truncate max-w-[60%]">{table}</span>
                        <span className="text-muted-foreground">{rows} rows</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-panel rounded-xl border border-white/5 p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="w-5 h-5 text-orange-400" />
            <h2 className="font-semibold text-white">VPS Database</h2>
            <StatusBadge status={data.vpsDb.connected ? "online" : "offline"} label={data.vpsDb.connected ? "Connected" : "Disconnected"} />
          </div>
          {data.vpsDb.connected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Size</span>
                <span className="text-white font-bold">{data.vpsDb.sizeMb} MB</span>
              </div>

              {Object.keys(data.vpsDb.trainingSources || {}).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Training Sources ({totalTrainingSources})</p>
                  <div className="space-y-1">
                    {Object.entries(data.vpsDb.trainingSources).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-white">{status}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.vpsDb.lastBackup && (
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Last Backup</p>
                  <p className="text-sm text-white">{formatTimeAgo(data.vpsDb.lastBackup.backup_timestamp)}</p>
                  <p className="text-xs text-muted-foreground">{data.vpsDb.lastBackup.duration_ms}ms &middot; {data.vpsDb.lastBackup.status}</p>
                </div>
              )}

              {Object.keys(data.vpsDb.tableStats || {}).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Tables ({data.vpsDb.tables})</p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {Object.entries(data.vpsDb.tableStats)
                      .sort((a, b) => b[1] - a[1])
                      .map(([table, rows]) => (
                        <div key={table} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 text-xs">
                          <span className="text-white truncate max-w-[60%]">{table}</span>
                          <span className="text-muted-foreground">{rows} rows</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-400">Not Connected</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
