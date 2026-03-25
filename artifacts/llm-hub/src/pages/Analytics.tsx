import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, MessageSquare, Star, Database, Brain, Activity, RefreshCw, Clock, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend } from "recharts";

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

const CHART_COLORS = ["#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1", "#14b8a6"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-white/10 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-white font-medium">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const r = await fetch(api("/analytics/overview"));
      setData(await r.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return <div className="p-6 text-red-400">Failed to load analytics</div>;

  const ratingData = [5, 4, 3, 2, 1].map(r => ({
    rating: `${r}★`,
    count: data.ratingDistribution[String(r)] || 0,
  }));

  const pieData = data.modelUsage.slice(0, 8).map((m, i) => ({
    name: m.model,
    value: m.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const benchmarksByModel: Record<string, { model: string; category: string; score: number }[]> = {};
  if (data.vpsStats?.benchmarks) {
    for (const b of data.vpsStats.benchmarks) {
      if (!benchmarksByModel[b.model]) benchmarksByModel[b.model] = [];
      benchmarksByModel[b.model].push(b);
    }
  }

  const benchmarkChartData = Object.entries(benchmarksByModel).flatMap(([model, benches]) =>
    benches.slice(0, 6).map(b => ({ model: model.split(":")[0], category: b.category, score: b.score }))
  );

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground">Usage metrics and performance insights</p>
          </div>
        </div>
        <button
          onClick={() => fetchData(true)}
          className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
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
            Messages Over Time (30 days)
          </h3>
          {data.dailyMessages.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.dailyMessages.slice(-30)}>
                <defs>
                  <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" name="Messages" stroke="#06b6d4" fill="url(#msgGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No message data yet</div>
          )}
        </div>

        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            Model Usage Distribution
          </h3>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {pieData.map((m, i) => (
                  <div key={m.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.fill }} />
                    <span className="text-muted-foreground truncate flex-1">{m.name}</span>
                    <span className="text-white font-medium">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">No model usage data</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            Message Ratings
          </h3>
          <div className="text-center mb-3">
            <div className="text-3xl font-bold text-white">{data.averageRating?.toFixed(1) ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{data.totalRated} rated messages</div>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={ratingData} layout="vertical">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="rating" tick={{ fontSize: 11, fill: "#facc15" }} width={35} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Ratings" fill="#facc15" radius={[0, 4, 4, 0]} barSize={14} fillOpacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-green-400" />
            VPS Training Data
          </h3>
          {data.vpsStats ? (
            <div className="space-y-3">
              <MetricRow label="Training Sources" value={data.vpsStats.trainingSources} />
              <MetricRow label="Brain Chunks" value={data.vpsStats.brainChunks} />
              <MetricRow label="Backups" value={data.vpsStats.backups} />
              {data.vpsStats.brainSources.map((bs) => (
                <MetricRow key={bs.status} label={`Brain (${bs.status})`} value={Number(bs.count)} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">VPS unavailable</div>
          )}
        </div>

        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Model Benchmarks
          </h3>
          {benchmarkChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={benchmarkChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="category" tick={{ fontSize: 8, fill: "#888" }} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} domain={[0, 100]} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="score" name="Score" fill="#06b6d4" radius={[2, 2, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
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
          <div className="text-xl font-bold text-white">{value.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-white font-medium">{typeof value === "number" ? value.toLocaleString() : value}</span>
    </div>
  );
}
