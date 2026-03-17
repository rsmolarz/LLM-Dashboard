import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, MessageSquare, Star, Database, Brain, Activity } from "lucide-react";

interface AnalyticsData {
  conversations: number;
  messages: number;
  documents: number;
  chunks: number;
  modelUsage: { model: string; count: number }[];
  dailyMessages: { date: string; count: number }[];
  ratingDistribution: Record<string, number>;
  averageRating: number | null;
  totalRated: number;
  vpsStats: {
    trainingSources: number;
    benchmarks: { model: string; category: string; score: number; created_at: string }[];
    brainSources: { count: string; status: string }[];
    brainChunks: number;
    backups: number;
  } | null;
}

const BASE = import.meta.env.BASE_URL || "/";
const api = (path: string) => `${BASE}api${path}`;

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(api("/analytics/overview"))
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return <div className="p-6 text-red-400">Failed to load analytics</div>;

  const maxDaily = data.dailyMessages.length > 0 ? Math.max(...data.dailyMessages.map((d) => d.count)) : 1;
  const maxModelCount = data.modelUsage.length > 0 ? Math.max(...data.modelUsage.map((m) => m.count)) : 1;

  const benchmarksByModel: Record<string, { model: string; category: string; score: number }[]> = {};
  if (data.vpsStats?.benchmarks) {
    for (const b of data.vpsStats.benchmarks) {
      if (!benchmarksByModel[b.model]) benchmarksByModel[b.model] = [];
      benchmarksByModel[b.model].push(b);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics Dashboard</h1>
          <p className="text-sm text-muted-foreground">Usage metrics and performance insights</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={MessageSquare} label="Conversations" value={data.conversations} color="from-blue-500 to-cyan-500" />
        <StatCard icon={Activity} label="Messages" value={data.messages} color="from-purple-500 to-pink-500" />
        <StatCard icon={Database} label="RAG Documents" value={data.documents} color="from-green-500 to-emerald-500" />
        <StatCard icon={Brain} label="RAG Chunks" value={data.chunks} color="from-orange-500 to-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            Messages Over Time
          </h3>
          {data.dailyMessages.length > 0 ? (
            <div className="flex items-end gap-1 h-40">
              {data.dailyMessages.slice(-30).map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="hidden group-hover:block absolute -top-8 bg-black/80 text-xs text-white px-2 py-1 rounded whitespace-nowrap z-10">
                    {d.date}: {d.count}
                  </div>
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-blue-500 to-cyan-400 min-h-[2px] transition-all"
                    style={{ height: `${(d.count / maxDaily) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No message data yet</div>
          )}
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{data.dailyMessages[0]?.date || ""}</span>
            <span>{data.dailyMessages[data.dailyMessages.length - 1]?.date || ""}</span>
          </div>
        </div>

        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            Model Usage
          </h3>
          <div className="space-y-2">
            {data.modelUsage.slice(0, 8).map((m) => (
              <div key={m.model} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-32 truncate">{m.model}</span>
                <div className="flex-1 bg-white/5 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${(m.count / maxModelCount) * 100}%` }}
                  >
                    <span className="text-[10px] text-white font-medium">{m.count}</span>
                  </div>
                </div>
              </div>
            ))}
            {data.modelUsage.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">No model usage data</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            Message Ratings
          </h3>
          <div className="text-center mb-3">
            <div className="text-3xl font-bold text-white">{data.averageRating ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{data.totalRated} rated messages</div>
          </div>
          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((r) => {
              const count = data.ratingDistribution[String(r)] || 0;
              const pct = data.totalRated > 0 ? (count / data.totalRated) * 100 : 0;
              return (
                <div key={r} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right text-yellow-400">{r}</span>
                  <Star className="w-3 h-3 text-yellow-400" />
                  <div className="flex-1 bg-white/5 rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-yellow-500/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-green-400" />
            VPS Training Data
          </h3>
          {data.vpsStats ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Training Sources</span>
                <span className="text-white font-medium">{data.vpsStats.trainingSources}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Brain Chunks</span>
                <span className="text-white font-medium">{data.vpsStats.brainChunks}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Backups</span>
                <span className="text-white font-medium">{data.vpsStats.backups}</span>
              </div>
              {data.vpsStats.brainSources.map((bs) => (
                <div key={bs.status} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Brain ({bs.status})</span>
                  <span className="text-white font-medium">{bs.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">VPS unavailable</div>
          )}
        </div>

        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Model Benchmarks
          </h3>
          {Object.keys(benchmarksByModel).length > 0 ? (
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {Object.entries(benchmarksByModel).map(([model, benches]) => (
                <div key={model}>
                  <div className="text-xs font-medium text-white mb-1">{model}</div>
                  <div className="flex flex-wrap gap-1">
                    {benches.slice(0, 5).map((b, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">
                        {b.category}: {b.score}%
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">No benchmark data</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="glass-panel rounded-xl border border-white/5 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-xl font-bold text-white">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}
