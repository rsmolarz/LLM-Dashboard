import { useState, useEffect, useCallback } from "react";
import { Beaker, Database, FlaskConical, BookOpen, Cpu, Play, RefreshCw, CheckCircle, AlertCircle, Loader2, ChevronRight, Zap, Globe, FileText, Download } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface SourceStat {
  count: number;
  avgQuality: string | number;
}

interface Stats {
  totalSamples: number;
  bySource: Record<string, SourceStat>;
  byCategory: Record<string, number>;
  pipeline: {
    pmcArticles: number;
    pmcSamples: number;
    clinicalTrials: number;
    ctSamples: number;
    openAlexWorks: number;
    oaSamples: number;
    injectionJobs: number;
    lastRunAt: string | null;
  };
  vpsModels: Array<{ name: string; size: number; modified: string }>;
}

interface InjectionResult {
  success?: boolean;
  modelName?: string;
  baseModel?: string;
  samplesUsed?: number;
  messagesInjected?: number;
  error?: string;
}

const SOURCE_COLORS: Record<string, string> = {
  pubmed: "text-green-400 bg-green-400/10 border-green-400/20",
  pmc_fulltext: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  clinicaltrials: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  openalex: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  vps_training: "text-red-400 bg-red-400/10 border-red-400/20",
};

const SOURCE_LABELS: Record<string, string> = {
  pubmed: "PubMed Abstracts",
  pmc_fulltext: "PMC Full-Text",
  clinicaltrials: "ClinicalTrials.gov",
  openalex: "OpenAlex",
  vps_training: "VPS Training",
};

const SOURCE_ICONS: Record<string, typeof BookOpen> = {
  pubmed: BookOpen,
  pmc_fulltext: FileText,
  clinicaltrials: FlaskConical,
  openalex: Globe,
  vps_training: Cpu,
};

export default function TrainingPipeline() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState<Record<string, boolean>>({});
  const [injecting, setInjecting] = useState(false);
  const [injectionResult, setInjectionResult] = useState<InjectionResult | null>(null);
  const [selectedModel, setSelectedModel] = useState("meditron:7b");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sampleLimit, setSampleLimit] = useState(50);
  const [exportCategory, setExportCategory] = useState("");
  const [exportSource, setExportSource] = useState("");
  const [exportMinQuality, setExportMinQuality] = useState(1);
  const [showExportOptions, setShowExportOptions] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${API}/api/advanced-training/stats`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const runCollector = async (type: string) => {
    setCollecting(prev => ({ ...prev, [type]: true }));
    try {
      await fetch(`${API}/api/advanced-training/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPerQuery: 10 }),
      });
      setTimeout(fetchStats, 3000);
    } catch (e) {
      console.error(`Collection error (${type}):`, e);
    } finally {
      setTimeout(() => setCollecting(prev => ({ ...prev, [type]: false })), 5000);
    }
  };

  const runAllCollectors = async () => {
    setCollecting({ all: true });
    try {
      await fetch(`${API}/api/advanced-training/collect-all`, { method: "POST" });
      setTimeout(fetchStats, 5000);
    } catch (e) {
      console.error("Full pipeline error:", e);
    } finally {
      setTimeout(() => setCollecting({}), 30000);
    }
  };

  const injectToModel = async () => {
    setInjecting(true);
    setInjectionResult(null);
    try {
      const res = await fetch(`${API}/api/advanced-training/inject-to-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          category: selectedCategory || undefined,
          limit: sampleLimit,
        }),
      });
      const data = await res.json();
      setInjectionResult(data);
      fetchStats();
    } catch (e: any) {
      setInjectionResult({ error: e.message });
    } finally {
      setInjecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalSamples = stats?.totalSamples || 0;
  const sources = stats?.bySource || {};
  const categories = stats?.byCategory || {};
  const vpsModels = stats?.vpsModels || [];
  const pipeline = stats?.pipeline;
  const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const maxCategoryCount = sortedCategories[0]?.[1] || 1;

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Beaker className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Training Pipeline</h1>
            <p className="text-sm text-muted-foreground">Multi-source ENT training data collection and model injection</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchStats}
            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setShowExportOptions(prev => !prev)}
            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm flex items-center gap-1.5 transition-all"
          >
            <Download className="w-4 h-4" /> Export Training Data
          </button>
          <button
            onClick={runAllCollectors}
            disabled={!!collecting.all}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {collecting.all ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Run All Pipelines
          </button>
        </div>
      </div>

      {showExportOptions && (
        <div className="glass-panel rounded-xl p-4 border border-emerald-500/30 bg-emerald-500/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-emerald-400" />
              <h3 className="text-white font-semibold text-sm">Export Training Data as JSONL</h3>
            </div>
            <span className="text-xs text-muted-foreground">Standard format for LLM fine-tuning (OpenAI, Ollama, Hugging Face)</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">Filter by Category</label>
              <select
                value={exportCategory}
                onChange={e => setExportCategory(e.target.value)}
                className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
              >
                <option value="">All Categories</option>
                {sortedCategories.map(([cat]) => (
                  <option key={cat} value={cat}>{cat.replace(/_/g, " ")} ({categories[cat]})</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">Filter by Source</label>
              <select
                value={exportSource}
                onChange={e => setExportSource(e.target.value)}
                className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
              >
                <option value="">All Sources</option>
                {Object.entries(sources).map(([src, data]) => (
                  <option key={src} value={src}>{SOURCE_LABELS[src] || src} ({data.count})</option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground block mb-1">Min Quality</label>
              <select
                value={exportMinQuality}
                onChange={e => setExportMinQuality(Number(e.target.value))}
                className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
              >
                {[1, 2, 3, 4, 5].map(q => (
                  <option key={q} value={q}>{q}+ stars</option>
                ))}
              </select>
            </div>
            <div className="pt-4">
              <a
                href={`${API}/api/advanced-training/export-jsonl?${new URLSearchParams({
                  ...(exportCategory && { category: exportCategory }),
                  ...(exportSource && { source: exportSource }),
                  ...(exportMinQuality > 1 && { minQuality: String(exportMinQuality) }),
                }).toString()}`}
                download
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-medium flex items-center gap-2 transition-all whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Download .jsonl
              </a>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Each line contains a JSON object with <code className="text-emerald-400">messages</code> (system/user/assistant) and <code className="text-emerald-400">metadata</code> (source, category, quality).
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" /> Total Samples
          </div>
          <div className="text-3xl font-bold text-white">{totalSamples.toLocaleString()}</div>
        </div>
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Data Sources
          </div>
          <div className="text-3xl font-bold text-white">{Object.keys(sources).length}</div>
        </div>
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Beaker className="w-3.5 h-3.5" /> Categories
          </div>
          <div className="text-3xl font-bold text-white">{Object.keys(categories).length}</div>
        </div>
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" /> VPS Models
          </div>
          <div className="text-3xl font-bold text-white">{vpsModels.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-xl p-5 border border-white/5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" /> Data Sources
          </h2>
          <div className="space-y-3">
            {Object.entries(SOURCE_LABELS).map(([key, label]) => {
              const stat = sources[key];
              const count = stat?.count || 0;
              const colorClass = SOURCE_COLORS[key] || "text-gray-400 bg-gray-400/10 border-gray-400/20";
              const Icon = SOURCE_ICONS[key] || Database;
              const isCollecting = collecting[key] || collecting.all;

              return (
                <div key={key} className={`flex items-center justify-between p-3 rounded-lg border ${colorClass}`}>
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    <div>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs opacity-70">
                        {count} samples{stat?.avgQuality ? ` · Avg quality: ${Number(stat.avgQuality).toFixed(1)}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{count.toLocaleString()}</span>
                    {key !== "vps_training" && key !== "pubmed" && (
                      <button
                        onClick={() => runCollector(
                          key === "pmc_fulltext" ? "pmc-collect" :
                          key === "clinicaltrials" ? "clinicaltrials-collect" :
                          "openalex-collect"
                        )}
                        disabled={!!isCollecting}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-all disabled:opacity-50"
                        title={`Collect from ${label}`}
                      >
                        {isCollecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-white/5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Beaker className="w-5 h-5 text-primary" /> Samples by Category
          </h2>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
            {sortedCategories.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground min-w-[130px] truncate">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-white/5 text-xs">{cat.replace(/_/g, " ")}</span>
                </span>
                <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
                    style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-white min-w-[40px] text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-xl p-5 border border-white/5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" /> Model Injection
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Create fine-tuned model variants on your VPS using the collected training data.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Target Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {vpsModels.map(m => (
                  <option key={m.name} value={m.name} className="bg-gray-900">
                    {m.name} ({(m.size / 1e9).toFixed(1)}GB)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category Filter (optional)</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="" className="bg-gray-900">All Categories</option>
                {sortedCategories.map(([cat]) => (
                  <option key={cat} value={cat} className="bg-gray-900">{cat.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Sample Limit</label>
              <input
                type="number"
                value={sampleLimit}
                onChange={(e) => setSampleLimit(Number(e.target.value))}
                min={10}
                max={200}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <button
              onClick={injectToModel}
              disabled={injecting || vpsModels.length === 0}
              className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {injecting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating Model Variant...</>
              ) : (
                <><ChevronRight className="w-4 h-4" /> Inject Training Data</>
              )}
            </button>

            {injectionResult && (
              <div className={`p-3 rounded-lg border ${injectionResult.success ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                {injectionResult.success ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <div className="font-medium">Model Created: {injectionResult.modelName}</div>
                      <div className="text-xs opacity-70 mt-1">
                        Base: {injectionResult.baseModel} · {injectionResult.samplesUsed} samples · {injectionResult.messagesInjected} messages injected
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">{injectionResult.error}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-white/5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" /> VPS Models
          </h2>
          {vpsModels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">VPS unreachable or no models found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {vpsModels.map((m) => (
                <div key={m.name} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-white">{m.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(m.size / 1e9).toFixed(1)}GB · Modified: {m.modified?.split("T")[0] || "N/A"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedModel(m.name)}
                    className={`text-xs px-2 py-1 rounded ${selectedModel === m.name ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground hover:text-white"}`}
                  >
                    {selectedModel === m.name ? "Selected" : "Select"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {pipeline?.lastRunAt && (
            <div className="mt-4 pt-3 border-t border-white/5">
              <div className="text-xs text-muted-foreground">
                Last pipeline run: {new Date(pipeline.lastRunAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
