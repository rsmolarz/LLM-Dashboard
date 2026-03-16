import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Play, Square, RefreshCw, Loader2, Clock, Mail, HardDrive,
  MessageSquare, Globe, BookOpen, Zap, Settings, ChevronDown,
  ChevronUp, AlertCircle, CheckCircle2, Brain, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface CollectorStatus {
  enabled: boolean;
  isRunning: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  totalRuns: number;
  totalCollected: number;
  config: any;
}

interface RunRecord {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  results: {
    gmail: number;
    drive: number;
    conversations: number;
    discovery: number;
    knowledgeBase: number;
    processed: number;
    errors: string[];
  };
}

export default function AutoCollector() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CollectorStatus | null>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intervalInput, setIntervalInput] = useState("30");
  const [customQueries, setCustomQueries] = useState({
    gmail: "",
    drive: "",
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auto-collector/status`);
      const data = await res.json();
      setStatus(data);
      setIntervalInput(String(data.intervalMinutes));
      if (data.config?.sources?.gmail?.queries) {
        setCustomQueries(prev => ({
          ...prev,
          gmail: data.config.sources.gmail.queries.join("\n"),
        }));
      }
      if (data.config?.sources?.drive?.queries) {
        setCustomQueries(prev => ({
          ...prev,
          drive: data.config.sources.drive.queries.join("\n"),
        }));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auto-collector/history`);
      const data = await res.json();
      setHistory(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchHistory();
    const interval = setInterval(() => {
      fetchStatus();
      fetchHistory();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchHistory]);

  const handleStart = async () => {
    setActionLoading("start");
    try {
      await fetch(`${API_BASE}/auto-collector/start`, { method: "POST" });
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async () => {
    setActionLoading("stop");
    try {
      await fetch(`${API_BASE}/auto-collector/stop`, { method: "POST" });
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunNow = async (source?: string) => {
    setActionLoading(source || "all");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auto-collector/run-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source ? { source } : {}),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Run failed");
      } else {
        await fetchStatus();
        await fetchHistory();
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/vps-training") });
      }
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleProcess = async () => {
    setActionLoading("process");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auto-collector/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 10 }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Processing failed");
      else {
        await fetchStatus();
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/vps-training") });
      }
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveConfig = async () => {
    setActionLoading("config");
    try {
      const gmailQueries = customQueries.gmail.split("\n").map(q => q.trim()).filter(Boolean);
      const driveQueries = customQueries.drive.split("\n").map(q => q.trim()).filter(Boolean);

      await fetch(`${API_BASE}/auto-collector/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intervalMinutes: parseInt(intervalInput) || 30,
          sources: {
            gmail: { queries: gmailQueries.length > 0 ? gmailQueries : undefined },
            drive: { queries: driveQueries.length > 0 ? driveQueries : undefined },
          },
        }),
      });
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSource = async (source: string, currentEnabled: boolean) => {
    try {
      await fetch(`${API_BASE}/auto-collector/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: { [source]: { enabled: !currentEnabled } },
        }),
      });
      await fetchStatus();
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  const totalThisSession = history.reduce((sum, r) =>
    sum + r.results.gmail + r.results.drive + r.results.conversations + r.results.discovery + r.results.knowledgeBase, 0);

  const sourceItems = [
    { key: "gmail", label: "Gmail", icon: Mail, color: "text-red-400", enabled: status?.config?.sources?.gmail?.enabled },
    { key: "drive", label: "Drive", icon: HardDrive, color: "text-blue-400", enabled: status?.config?.sources?.drive?.enabled },
    { key: "conversations", label: "Chat History", icon: MessageSquare, color: "text-green-400", enabled: status?.config?.sources?.conversations?.enabled },
    { key: "discovery", label: "Discovery Agent", icon: Globe, color: "text-purple-400", enabled: status?.config?.sources?.discovery?.enabled },
    { key: "knowledgeBase", label: "Knowledge Base", icon: BookOpen, color: "text-yellow-400", enabled: status?.config?.sources?.knowledgeBase?.enabled },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30">
            <Zap className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              Auto-Collector Engine
              {status?.isRunning && (
                <span className="flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Running
                </span>
              )}
              {status?.enabled && !status?.isRunning && (
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  Scheduled
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-400">
              Automatically collects training data from all sources
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status?.enabled ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleStop}
              disabled={actionLoading === "stop"}
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
            >
              {actionLoading === "stop" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Square className="w-3 h-3 mr-1" />}
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleStart}
              disabled={!!actionLoading}
              className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500"
            >
              {actionLoading === "start" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
              Start Auto-Collect
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRunNow()}
            disabled={!!actionLoading}
            className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
          >
            {actionLoading === "all" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Run All Now
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400">×</button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-2xl font-bold text-white">{status?.totalCollected || 0}</div>
          <div className="text-xs text-gray-400">Total Collected</div>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-2xl font-bold text-cyan-400">{status?.totalRuns || 0}</div>
          <div className="text-xs text-gray-400">Total Runs</div>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-2xl font-bold text-purple-400">{status?.intervalMinutes || 30}m</div>
          <div className="text-xs text-gray-400">Interval</div>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-sm font-medium text-white truncate">
            {status?.lastRunAt ? new Date(status.lastRunAt).toLocaleTimeString() : "Never"}
          </div>
          <div className="text-xs text-gray-400">Last Run</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          Collection Sources
        </div>
        <div className="grid grid-cols-5 gap-2">
          {sourceItems.map((src) => (
            <div
              key={src.key}
              className={cn(
                "p-3 rounded-lg border transition-all",
                src.enabled
                  ? "bg-white/5 border-white/20"
                  : "bg-white/[0.02] border-white/5 opacity-50"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <src.icon className={cn("w-4 h-4", src.color)} />
                <button
                  onClick={() => handleToggleSource(src.key, !!src.enabled)}
                  className={cn(
                    "w-8 h-4 rounded-full transition-all relative",
                    src.enabled ? "bg-cyan-500" : "bg-gray-600"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                    src.enabled ? "right-0.5" : "left-0.5"
                  )} />
                </button>
              </div>
              <div className="text-xs font-medium text-white">{src.label}</div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full mt-2 h-6 text-[10px] text-gray-400 hover:text-cyan-400"
                onClick={() => handleRunNow(src.key)}
                disabled={!!actionLoading}
              >
                {actionLoading === src.key ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  "Run Now"
                )}
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleProcess}
          disabled={!!actionLoading}
          className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
        >
          {actionLoading === "process" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Brain className="w-3 h-3 mr-1" />}
          LLM Process (Auto-Rate & Generate Q&A)
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowConfig(!showConfig)}
          className="text-gray-400 hover:text-white"
        >
          <Settings className="w-3 h-3 mr-1" />
          Configure
          {showConfig ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
          className="text-gray-400 hover:text-white"
        >
          <Clock className="w-3 h-3 mr-1" />
          History ({history.length})
          {showHistory ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
        </Button>
      </div>

      {showConfig && (
        <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-4">
          <div className="text-sm font-medium text-gray-300">Collection Configuration</div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Interval (minutes)</label>
              <Input
                type="number"
                value={intervalInput}
                onChange={(e) => setIntervalInput(e.target.value)}
                min={5}
                max={1440}
                className="bg-white/5 border-white/10 text-white h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Gmail Search Queries (one per line)</label>
            <textarea
              value={customQueries.gmail}
              onChange={(e) => setCustomQueries(prev => ({ ...prev, gmail: e.target.value }))}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-md text-white text-sm p-2 resize-none focus:outline-none focus:border-cyan-500/50"
              placeholder="database OR dataset OR API&#10;machine learning OR AI&#10;project update OR deliverable"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Drive Search Queries (one per line)</label>
            <textarea
              value={customQueries.drive}
              onChange={(e) => setCustomQueries(prev => ({ ...prev, drive: e.target.value }))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-md text-white text-sm p-2 resize-none focus:outline-none focus:border-cyan-500/50"
              placeholder="training data&#10;project documentation&#10;research notes"
            />
          </div>

          <Button
            size="sm"
            onClick={handleSaveConfig}
            disabled={actionLoading === "config"}
            className="bg-cyan-600 hover:bg-cyan-500"
          >
            {actionLoading === "config" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Save Configuration
          </Button>
        </div>
      )}

      {showHistory && (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {history.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-4">No runs yet</div>
          ) : (
            history.map((run) => {
              const total = run.results.gmail + run.results.drive + run.results.conversations +
                run.results.discovery + run.results.knowledgeBase;
              return (
                <div key={run.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {run.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : run.status === "running" ? (
                        <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                      <span className="text-sm text-white">
                        {new Date(run.startedAt).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-cyan-400">+{total} items</span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400">
                    {run.results.gmail > 0 && <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-red-400" /> {run.results.gmail}</span>}
                    {run.results.drive > 0 && <span className="flex items-center gap-1"><HardDrive className="w-3 h-3 text-blue-400" /> {run.results.drive}</span>}
                    {run.results.conversations > 0 && <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-green-400" /> {run.results.conversations}</span>}
                    {run.results.discovery > 0 && <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-purple-400" /> {run.results.discovery}</span>}
                    {run.results.knowledgeBase > 0 && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3 text-yellow-400" /> {run.results.knowledgeBase}</span>}
                    {run.results.processed > 0 && <span className="flex items-center gap-1"><Brain className="w-3 h-3 text-cyan-400" /> {run.results.processed} processed</span>}
                  </div>
                  {run.results.errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-400/80 max-h-20 overflow-y-auto">
                      {run.results.errors.slice(0, 3).map((e, i) => (
                        <div key={i} className="truncate">⚠ {e}</div>
                      ))}
                      {run.results.errors.length > 3 && (
                        <div className="text-gray-500">+{run.results.errors.length - 3} more errors</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
