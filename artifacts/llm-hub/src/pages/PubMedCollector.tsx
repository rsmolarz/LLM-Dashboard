import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  Search,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  FileText,
  Microscope,
  RefreshCw,
  Zap,
  BarChart3,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  Power,
  PowerOff,
  FlaskConical,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface CollectionRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  queryType: string;
  articlesFound: number;
  articlesStored: number;
  samplesGenerated: number;
  errors: string[];
}

interface PubMedStatus {
  autoCollectEnabled: boolean;
  currentRun: CollectionRun | null;
  totalArticlesCached: number;
  runHistory: CollectionRun[];
  meshQueries: number;
  keywordQueries: number;
}

interface PubMedStats {
  totalSamples: number;
  byCategory: Record<string, number>;
  recentSamples: any[];
  totalArticlesCached: number;
}

interface ArticleSummary {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  pubDate: string;
  category: string;
  hasAbstract: boolean;
  abstractLength?: number;
  abstractPreview?: string;
  meshTerms: string[];
  keywords?: string[];
  doi: string;
}

interface ArticlesResponse {
  total: number;
  totalFiltered: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: Record<string, number>;
  years: string[];
  articles: ArticleSummary[];
}

const CATEGORY_COLORS: Record<string, string> = {
  ai_ent: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  laryngology: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  otology: "bg-green-500/20 text-green-300 border-green-500/30",
  rhinology: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  head_neck_oncology: "bg-red-500/20 text-red-300 border-red-500/30",
  sleep_medicine: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  dysphagia: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  thyroid: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  pharyngology: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  endoscopy: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  general_ent: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

export default function PubMedCollector() {
  const [status, setStatus] = useState<PubMedStatus | null>(null);
  const [stats, setStats] = useState<PubMedStats | null>(null);
  const [articlesData, setArticlesData] = useState<ArticlesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [customQuery, setCustomQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ArticleSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "articles" | "search" | "history">("overview");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [queryType, setQueryType] = useState<"both" | "mesh" | "keyword">("both");
  const [maxPerQuery, setMaxPerQuery] = useState(10);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [autoInterval, setAutoInterval] = useState(120);
  const [articleSearch, setArticleSearch] = useState("");
  const [articlePage, setArticlePage] = useState(1);
  const [articlePageSize, setArticlePageSize] = useState(20);
  const [articleCategoryFilter, setArticleCategoryFilter] = useState("");
  const [articleYearFilter, setArticleYearFilter] = useState("");
  const [articleSortBy, setArticleSortBy] = useState("date");
  const [articleSortDir, setArticleSortDir] = useState("desc");
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/pubmed-ent/status`);
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/pubmed-ent/stats`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  const fetchArticles = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(articlePage),
        pageSize: String(articlePageSize),
        sortBy: articleSortBy,
        sortDir: articleSortDir,
        ...(articleSearch && { search: articleSearch }),
        ...(articleCategoryFilter && { category: articleCategoryFilter }),
        ...(articleYearFilter && { year: articleYearFilter }),
      });
      const res = await fetch(`${API_BASE}/pubmed-ent/articles?${params}`);
      if (res.ok) {
        const data: ArticlesResponse = await res.json();
        setArticlesData(data);
      }
    } catch {}
  }, [articlePage, articlePageSize, articleSearch, articleCategoryFilter, articleYearFilter, articleSortBy, articleSortDir]);

  useEffect(() => {
    fetchStatus();
    fetchStats();
    fetchArticles();
    const interval = setInterval(() => {
      fetchStatus();
      fetchStats();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchStats, fetchArticles]);

  const startCollection = async () => {
    setCollecting(true);
    try {
      await fetch(`${API_BASE}/pubmed-ent/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryType, maxPerQuery }),
      });
      setTimeout(() => {
        fetchStatus();
        setCollecting(false);
      }, 2000);
      const pollInterval = setInterval(async () => {
        const res = await fetch(`${API_BASE}/pubmed-ent/status`);
        if (res.ok) {
          const s = await res.json();
          setStatus(s);
          if (!s.currentRun) {
            clearInterval(pollInterval);
            fetchStats();
            fetchArticles();
          }
        }
      }, 5000);
    } catch {
      setCollecting(false);
    }
  };

  const searchCustom = async () => {
    if (!customQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/pubmed-ent/search-custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: customQuery, maxResults: 20 }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.articles);
      }
    } catch {}
    setSearching(false);
  };

  const generateSamples = async (pmid: string) => {
    setGeneratingFor(pmid);
    try {
      const res = await fetch(`${API_BASE}/pubmed-ent/generate-samples/${pmid}`, {
        method: "POST",
      });
      if (res.ok) {
        fetchStats();
      }
    } catch {}
    setGeneratingFor(null);
  };

  const toggleAutoCollect = async () => {
    try {
      const res = await fetch(`${API_BASE}/pubmed-ent/auto-collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: !status?.autoCollectEnabled,
          intervalMinutes: autoInterval,
        }),
      });
      if (res.ok) fetchStatus();
    } catch {}
  };

  const isRunning = !!status?.currentRun;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            PubMed ENT Collector
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Automated otolaryngology literature collection and training data generation from NCBI PubMed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAutoCollect}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border",
              status?.autoCollectEnabled
                ? "bg-green-500/20 border-green-500/30 text-green-300 hover:bg-green-500/30"
                : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
            )}
          >
            {status?.autoCollectEnabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
            Auto-Collect {status?.autoCollectEnabled ? "ON" : "OFF"}
          </button>
          <button
            onClick={startCollection}
            disabled={isRunning || collecting}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
              isRunning || collecting
                ? "bg-white/5 text-muted-foreground cursor-not-allowed"
                : "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:shadow-green-500/20"
            )}
          >
            {isRunning || collecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isRunning ? "Collecting..." : "Run Collection"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <FileText className="w-3.5 h-3.5" />
            Articles Cached
          </div>
          <div className="text-2xl font-bold text-white">{status?.totalArticlesCached || 0}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Database className="w-3.5 h-3.5" />
            Training Samples
          </div>
          <div className="text-2xl font-bold text-green-400">{stats?.totalSamples || 0}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Microscope className="w-3.5 h-3.5" />
            MeSH Queries
          </div>
          <div className="text-2xl font-bold text-blue-400">{status?.meshQueries || 0}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Search className="w-3.5 h-3.5" />
            Keyword Queries
          </div>
          <div className="text-2xl font-bold text-purple-400">{status?.keywordQueries || 0}</div>
        </div>
      </div>

      {isRunning && status?.currentRun && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
            <div>
              <h3 className="text-sm font-semibold text-green-300">Collection In Progress</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Type: {status.currentRun.queryType} | Found: {status.currentRun.articlesFound} articles | Stored: {status.currentRun.articlesStored} new | Samples: {status.currentRun.samplesGenerated}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-white/10 pb-1">
        {(["overview", "articles", "search", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 rounded-t-lg text-sm font-medium transition-all",
              activeTab === tab
                ? "bg-white/10 text-white border-b-2 border-primary"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-green-400" />
                Samples by Category
              </h3>
              {stats?.byCategory && Object.keys(stats.byCategory).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(stats.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <div key={cat} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn("px-2 py-0.5 rounded-md text-[10px] border", CATEGORY_COLORS[cat] || CATEGORY_COLORS.general_ent)}>
                            {cat.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-green-500/60"
                              style={{ width: `${Math.min(100, (count / (stats.totalSamples || 1)) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No samples yet — run a collection to start
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Collection Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Query Type</label>
                  <div className="flex gap-2">
                    {(["both", "mesh", "keyword"] as const).map((qt) => (
                      <button
                        key={qt}
                        onClick={() => setQueryType(qt)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                          queryType === qt
                            ? "bg-primary/20 border-primary/30 text-primary"
                            : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                        )}
                      >
                        {qt === "both" ? "MeSH + Keywords" : qt === "mesh" ? "MeSH Only" : "Keywords Only"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Results Per Query</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxPerQuery}
                    onChange={(e) => setMaxPerQuery(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Auto-Collect Interval (minutes)</label>
                  <input
                    type="number"
                    min={30}
                    max={1440}
                    value={autoInterval}
                    onChange={(e) => setAutoInterval(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            </div>
          </div>

          {stats?.recentSamples && stats.recentSamples.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Recent Training Samples
              </h3>
              <div className="space-y-2">
                {stats.recentSamples.slice(0, 5).map((sample: any) => (
                  <div key={sample.id} className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-white line-clamp-2 flex-1">{sample.inputText}</p>
                      <span className={cn("px-2 py-0.5 rounded-md text-[10px] border shrink-0", CATEGORY_COLORS[sample.category] || CATEGORY_COLORS.general_ent)}>
                        {sample.category?.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(sample.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "articles" && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={articleSearch}
                onChange={(e) => { setArticleSearch(e.target.value); setArticlePage(1); }}
                placeholder="Search by title, author, journal, abstract, or PMID..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={articleCategoryFilter}
                onChange={(e) => { setArticleCategoryFilter(e.target.value); setArticlePage(1); }}
                className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:outline-none"
              >
                <option value="">All Categories</option>
                {Object.entries(articlesData?.categories || {}).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                  <option key={cat} value={cat}>{cat.replace(/_/g, " ")} ({count})</option>
                ))}
              </select>
              <select
                value={articleYearFilter}
                onChange={(e) => { setArticleYearFilter(e.target.value); setArticlePage(1); }}
                className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:outline-none"
              >
                <option value="">All Years</option>
                {(articlesData?.years || []).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <select
                value={articlePageSize}
                onChange={(e) => { setArticlePageSize(Number(e.target.value)); setArticlePage(1); }}
                className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:outline-none"
              >
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>{n} per page</option>
                ))}
              </select>
              <button
                onClick={fetchArticles}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-white hover:bg-white/5 transition-all border border-white/10"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {articlesData ? `Showing ${((articlesData.page - 1) * articlesData.pageSize) + 1}–${Math.min(articlesData.page * articlesData.pageSize, articlesData.totalFiltered)} of ${articlesData.totalFiltered} articles` : "Loading..."}
              {articlesData && articlesData.totalFiltered < articlesData.total && ` (filtered from ${articlesData.total})`}
            </span>
            <div className="flex items-center gap-1">
              <span className="mr-1">Sort:</span>
              {[
                { key: "date", label: "Date" },
                { key: "title", label: "Title" },
                { key: "journal", label: "Journal" },
                { key: "category", label: "Category" },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    if (articleSortBy === s.key) {
                      setArticleSortDir(articleSortDir === "desc" ? "asc" : "desc");
                    } else {
                      setArticleSortBy(s.key);
                      setArticleSortDir("desc");
                    }
                    setArticlePage(1);
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] transition-all",
                    articleSortBy === s.key ? "bg-primary/20 text-primary" : "hover:bg-white/5"
                  )}
                >
                  {s.label} {articleSortBy === s.key && (articleSortDir === "desc" ? "↓" : "↑")}
                </button>
              ))}
            </div>
          </div>

          {!articlesData || articlesData.articles.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">{articleSearch || articleCategoryFilter || articleYearFilter ? "No articles match your filters" : "No articles collected yet"}</p>
              <p className="text-muted-foreground text-xs mt-1">{articleSearch || articleCategoryFilter || articleYearFilter ? "Try adjusting your search or filters" : "Run a collection to fetch PubMed articles"}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/10">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-[40%]">Title</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Journal</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-20">Year</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Category</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {articlesData.articles.map((article) => (
                    <>
                      <tr
                        key={article.pmid}
                        onClick={() => setExpandedArticle(expandedArticle === article.pmid ? null : article.pmid)}
                        className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-all"
                      >
                        <td className="px-4 py-3">
                          <div className="text-white text-xs font-medium line-clamp-2">{article.title}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{article.authors}</div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">{article.journal}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-muted-foreground">{article.pubDate?.slice(0, 4)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("px-2 py-0.5 rounded-md text-[10px] border whitespace-nowrap", CATEGORY_COLORS[article.category] || CATEGORY_COLORS.general_ent)}>
                            {article.category.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-white hover:bg-white/5"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              onClick={(e) => { e.stopPropagation(); generateSamples(article.pmid); }}
                              disabled={generatingFor === article.pmid}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50"
                            >
                              {generatingFor === article.pmid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedArticle === article.pmid && (
                        <tr key={`${article.pmid}-detail`} className="bg-white/[0.02]">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="space-y-2">
                              {article.abstractPreview && (
                                <div>
                                  <div className="text-[10px] font-medium text-muted-foreground mb-1">Abstract Preview</div>
                                  <p className="text-xs text-gray-300 leading-relaxed">{article.abstractPreview}</p>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                {article.meshTerms.map((t) => (
                                  <span key={t} className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-muted-foreground">{t}</span>
                                ))}
                                {article.keywords?.map((k) => (
                                  <span key={k} className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-[10px] text-cyan-300">{k}</span>
                                ))}
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                <span>PMID: {article.pmid}</span>
                                {article.doi && <span>DOI: {article.doi}</span>}
                                {article.hasAbstract && <span className="text-green-400">{article.abstractLength} chars</span>}
                                <span>{article.pubDate}</span>
                                <span className="lg:hidden">{article.journal}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {articlesData && articlesData.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setArticlePage(Math.max(1, articlePage - 1))}
                disabled={articlePage <= 1}
                className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(7, articlesData.totalPages) }, (_, i) => {
                  let pageNum: number;
                  const total = articlesData.totalPages;
                  if (total <= 7) {
                    pageNum = i + 1;
                  } else if (articlePage <= 4) {
                    pageNum = i + 1;
                  } else if (articlePage >= total - 3) {
                    pageNum = total - 6 + i;
                  } else {
                    pageNum = articlePage - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setArticlePage(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-xs transition-all",
                        articlePage === pageNum ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:bg-white/5"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setArticlePage(Math.min(articlesData.totalPages, articlePage + 1))}
                disabled={articlePage >= articlesData.totalPages}
                className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "search" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Custom PubMed Search</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchCustom()}
                placeholder='e.g., "vocal cord paralysis" AND "machine learning"'
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={searchCustom}
                disabled={searching || !customQuery.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 disabled:opacity-50"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Supports PubMed/NCBI query syntax: MeSH terms, boolean operators (AND, OR, NOT), field tags ([MeSH Terms], [All Fields], [Title])
            </p>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{searchResults.length} results found</p>
              {searchResults.map((article) => (
                <div key={article.pmid} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-white line-clamp-2">{article.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{article.authors}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{article.journal}</span>
                        <span>{article.pubDate}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className={cn("px-2 py-0.5 rounded-md text-[10px] border", CATEGORY_COLORS[article.category] || CATEGORY_COLORS.general_ent)}>
                          {article.category.replace(/_/g, " ")}
                        </span>
                        {article.meshTerms?.slice(0, 3).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-muted-foreground">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <a
                        href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-muted-foreground hover:text-white hover:bg-white/5"
                      >
                        <ExternalLink className="w-3 h-3" />
                        PMID {article.pmid}
                      </a>
                      <button
                        onClick={() => generateSamples(article.pmid)}
                        disabled={generatingFor === article.pmid}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50"
                      >
                        {generatingFor === article.pmid ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                        Generate Samples
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-3">
          {status?.runHistory && status.runHistory.length > 0 ? (
            status.runHistory.map((run) => (
              <div key={run.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                >
                  <div className="flex items-center gap-3">
                    {run.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : run.status === "failed" ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    <div>
                      <p className="text-sm text-white font-medium">
                        {run.queryType.toUpperCase()} Collection
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(run.startedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-xs">
                      <p className="text-white">{run.articlesFound} found / {run.samplesGenerated} samples</p>
                      <p className="text-muted-foreground">{run.articlesStored} new articles</p>
                    </div>
                    {expandedRun === run.id ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {expandedRun === run.id && run.errors.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      {run.errors.length} error(s)
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {run.errors.map((err, i) => (
                        <p key={i} className="text-[10px] text-red-300/70 font-mono bg-red-500/5 rounded px-2 py-1">
                          {err}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-16">
              <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">No collection history yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
