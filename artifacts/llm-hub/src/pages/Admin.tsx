import { useState, useEffect, useCallback } from "react";
import { Shield, CheckCircle2, Circle, AlertCircle, Clock, ChevronDown, ChevronRight, Wrench, Rocket, Bug, Lightbulb, Users, Activity, RefreshCw, Loader2, ShieldCheck, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@workspace/replit-auth-web";

const API = import.meta.env.VITE_API_URL || "";

type Status = "done" | "partial" | "todo" | "idea";
type Priority = "critical" | "high" | "medium" | "low";

interface LogItem {
  title: string;
  status: Status;
  priority: Priority;
  details: string;
  category: string;
  children?: LogItem[];
}

const statusConfig: Record<Status, { label: string; color: string; icon: any }> = {
  done: { label: "Complete", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  partial: { label: "In Progress", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: Clock },
  todo: { label: "To Do", color: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: Circle },
  idea: { label: "Idea", color: "text-purple-400 bg-purple-500/10 border-purple-500/20", icon: Lightbulb },
};

const priorityColors: Record<Priority, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  low: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};

const PROJECT_LOG: LogItem[] = [
  {
    title: "Core Infrastructure",
    status: "done",
    priority: "critical",
    category: "infrastructure",
    details: "Full-stack monorepo with Express API, React+Vite frontend, Drizzle ORM, pnpm workspace",
    children: [
      { title: "Express API server with typed routes", status: "done", priority: "critical", category: "backend", details: "All API routes typed with Zod schemas, Orval codegen for client hooks" },
      { title: "React + Vite frontend with Tailwind + shadcn/ui", status: "done", priority: "critical", category: "frontend", details: "Dark theme, glass-panel design, responsive layout" },
      { title: "PostgreSQL database (Replit)", status: "done", priority: "critical", category: "database", details: "Drizzle ORM, conversations, messages, documents, agents tables" },
      { title: "VPS PostgreSQL database", status: "done", priority: "critical", category: "database", details: "72.60.167.64:5432 with SSL/TLS — training_sources, brain_sources, brain_chunks, model_benchmarks, backup_snapshots" },
      { title: "Production build pipeline", status: "done", priority: "high", category: "devops", details: "esbuild for server, Vite for frontend, pnpm build script" },
    ],
  },
  {
    title: "LLM Management",
    status: "done",
    priority: "critical",
    category: "core",
    details: "Full Ollama server management — connect, pull/delete models, health monitoring",
    children: [
      { title: "Server connection & health check", status: "done", priority: "critical", category: "core", details: "Auto-polling every 15s, version detection, running model tracking" },
      { title: "Model management (pull/delete)", status: "done", priority: "high", category: "core", details: "Pull new models from registry, delete unused models" },
      { title: "Multi-model chat interface", status: "done", priority: "critical", category: "core", details: "Conversation management, model selection, message history" },
      { title: "Message rating system (1-5 stars)", status: "done", priority: "medium", category: "core", details: "Rate assistant responses, stored in DB for feedback loop" },
      { title: "Local sandbox (test models directly)", status: "done", priority: "medium", category: "core", details: "Quick model testing without creating a conversation" },
    ],
  },
  {
    title: "Chat & RAG",
    status: "done",
    priority: "critical",
    category: "chat",
    details: "Chat with RAG context injection from Knowledge Base and Project Brain",
    children: [
      { title: "Knowledge Base RAG toggle", status: "done", priority: "high", category: "chat", details: "Toggle to inject document chunks as context into LLM prompts" },
      { title: "Project Brain RAG toggle", status: "done", priority: "high", category: "chat", details: "Toggle to inject brain chunks from indexed Notion/Drive docs" },
      { title: "TF-IDF relevance scoring", status: "done", priority: "medium", category: "chat", details: "Upgraded from keyword matching to TF-IDF with stop words, coverage bonus" },
      { title: "Streaming responses (SSE)", status: "done", priority: "high", category: "chat", details: "Real-time token streaming via SSE endpoint" },
      { title: "Conversation export (Markdown/HTML)", status: "done", priority: "medium", category: "chat", details: "Export chat history as Markdown or HTML via download buttons" },
      { title: "Semantic vector embeddings (pgvector)", status: "done", priority: "high", category: "chat", details: "28,178 RAG chunks with pgvector embeddings, nomic-embed-text semantic re-embedding" },
    ],
  },
  {
    title: "Deep Research Engine",
    status: "done",
    priority: "high",
    category: "research",
    details: "Multi-model research with Deep (local) and Extensive (cloud) modes",
    children: [
      { title: "Multi-model parallel research", status: "done", priority: "high", category: "research", details: "Fan out queries to all Ollama models + cloud models in parallel" },
      { title: "AI synthesis of results", status: "done", priority: "high", category: "research", details: "GPT synthesizes all model responses into unified report" },
      { title: "Session save/load", status: "done", priority: "medium", category: "research", details: "Save research sessions, browse history, restore sessions" },
      { title: "Research export (Markdown/HTML)", status: "done", priority: "medium", category: "research", details: "Export research reports as Markdown or HTML" },
      { title: "Source citations", status: "done", priority: "medium", category: "research", details: "Model attribution and citation tracking in results" },
    ],
  },
  {
    title: "Agent Orchestration",
    status: "done",
    priority: "high",
    category: "agents",
    details: "Agent fleet management with delegation, inter-agent messaging, multi-step workflows",
    children: [
      { title: "Agent CRUD (create/edit/delete)", status: "done", priority: "high", category: "agents", details: "Full agent management with categories, system prompts, emoji" },
      { title: "Fleet management dashboard", status: "done", priority: "high", category: "agents", details: "Agent cards, category filtering, bulk operations" },
      { title: "Agent-to-agent delegation", status: "done", priority: "high", category: "agents", details: "Agents can delegate subtasks to other specialized agents with chain tracking" },
      { title: "Inter-agent messaging", status: "done", priority: "high", category: "agents", details: "Request/response message bus between agents with status tracking" },
      { title: "Real tool execution", status: "done", priority: "high", category: "agents", details: "DuckDuckGo web search, Node.js code execution, HTTP API calls" },
      { title: "Multi-step agent workflows", status: "done", priority: "high", category: "agents", details: "LLM plans multi-step workflows, chains tool calls" },
    ],
  },
  {
    title: "Security & Auth",
    status: "done",
    priority: "critical",
    category: "security",
    details: "Authentication, authorization, rate limiting, SSL/TLS, per-user scoping",
    children: [
      { title: "User authentication (Replit Auth)", status: "done", priority: "critical", category: "security", details: "OpenID Connect with PKCE — login, sessions, user identification" },
      { title: "Per-user data scoping", status: "done", priority: "critical", category: "security", details: "Conversations scoped to authenticated user via userId column" },
      { title: "Admin vs regular user roles", status: "done", priority: "high", category: "security", details: "Role-based nav visibility, admin user management dashboard, requireAdmin middleware" },
      { title: "Rate limiting on API endpoints", status: "done", priority: "high", category: "security", details: "Per-user sliding window: LLM 30/min, research 10/min, training 60/min with metrics" },
      { title: "SSL/TLS for VPS PostgreSQL", status: "done", priority: "high", category: "security", details: "Full SSL config with CA cert, client cert/key, reject unauthorized" },
    ],
  },
  {
    title: "Training Pipeline",
    status: "done",
    priority: "high",
    category: "training",
    details: "10-tab training dashboard with unified overview",
    children: [
      { title: "Unified Overview dashboard", status: "done", priority: "high", category: "training", details: "Cross-source stats: Brain, Local, RAG, VPS data" },
      { title: "ENT Training Pipeline", status: "done", priority: "medium", category: "training", details: "10 otolaryngology modules, PubMed + ClinicalTrials + PMC data" },
      { title: "Hedge Fund Training Pipeline", status: "done", priority: "medium", category: "training", details: "SEC EDGAR, OpenAlex Finance, FRED Macro, synthetic scenarios" },
      { title: "Auto-Collector (Gmail, Drive, Chat)", status: "done", priority: "medium", category: "training", details: "Automated training data collection with 30min scheduler" },
    ],
  },
  {
    title: "Analytics & Monitoring",
    status: "done",
    priority: "medium",
    category: "analytics",
    details: "Usage analytics, system monitoring, rate limit metrics, notifications",
    children: [
      { title: "Analytics dashboard", status: "done", priority: "medium", category: "analytics", details: "Usage charts, model breakdown, rating distribution" },
      { title: "System Monitor", status: "done", priority: "medium", category: "analytics", details: "Health metrics, model inventory, DB stats, knowledge categories" },
      { title: "Rate limit monitoring", status: "done", priority: "medium", category: "analytics", details: "Per-endpoint metrics: request counts, rejection rate, unique users" },
      { title: "Real-time notifications (SSE)", status: "done", priority: "medium", category: "analytics", details: "Bell icon with notification dropdown" },
    ],
  },
];

function countByStatus(items: LogItem[]): Record<Status, number> {
  const counts: Record<Status, number> = { done: 0, partial: 0, todo: 0, idea: 0 };
  for (const item of items) {
    counts[item.status]++;
    if (item.children) {
      const childCounts = countByStatus(item.children);
      for (const s of Object.keys(childCounts) as Status[]) counts[s] += childCounts[s];
    }
  }
  return counts;
}

function LogItemRow({ item, depth = 0 }: { item: LogItem; depth?: number }) {
  const [expanded, setExpanded] = useState(item.status !== "done");
  const cfg = statusConfig[item.status];
  const Icon = cfg.icon;
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer border-b border-white/5",
          depth > 0 && "pl-10"
        )}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 mt-0.5 shrink-0">
          {hasChildren && (
            expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
          <Icon className={cn("w-4 h-4", cfg.color.split(" ")[0])} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">{item.title}</span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", cfg.color)}>
              {cfg.label}
            </span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", priorityColors[item.priority])}>
              {item.priority}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{item.details}</p>
        </div>
      </div>
      {expanded && hasChildren && (
        <div>
          {item.children!.map((child, i) => (
            <LogItemRow key={i} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface UserRecord {
  id: string;
  username: string;
  email: string | null;
  role: string;
  profileImageUrl: string | null;
  createdAt: string;
}

interface RateLimitEndpoint {
  endpoint: string;
  totalRequests: number;
  rejectedRequests: number;
  uniqueUsers: number;
  lastHit: string;
  acceptRate: string;
}

interface RateLimitData {
  activeWindows: number;
  totalRequests: number;
  totalRejected: number;
  overallAcceptRate: string;
  endpoints: RateLimitEndpoint[];
}

function UserManagementPanel() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/auth/users`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    setUpdating(userId);
    try {
      const res = await fetch(`${API}/api/auth/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      }
    } catch {}
    setUpdating(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <div className="text-2xl font-bold text-white">{users.length}</div>
          <div className="text-xs text-muted-foreground">Total Users</div>
        </div>
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <div className="text-2xl font-bold text-amber-400">{users.filter(u => u.role === "admin").length}</div>
          <div className="text-xs text-muted-foreground">Admins</div>
        </div>
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <div className="text-2xl font-bold text-blue-400">{users.filter(u => u.role === "user").length}</div>
          <div className="text-xs text-muted-foreground">Regular Users</div>
        </div>
        <div className="glass-panel rounded-xl border border-white/5 p-4 flex items-center justify-center">
          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/30 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-white/10 text-xs font-medium text-muted-foreground">
          <div>Avatar</div>
          <div>Username</div>
          <div>Role</div>
          <div>Joined</div>
          <div>Actions</div>
        </div>
        {users.map(user => (
          <div key={user.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 border-b border-white/5 items-center hover:bg-white/[0.02]">
            <div>
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="" className="w-8 h-8 rounded-full border border-white/20" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-white">{user.username || user.id}</div>
              {user.email && <div className="text-xs text-muted-foreground">{user.email}</div>}
            </div>
            <div>
              <span className={cn(
                "text-xs px-2 py-1 rounded-full font-medium border",
                user.role === "admin"
                  ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                  : "text-blue-400 bg-blue-500/10 border-blue-500/20"
              )}>
                {user.role === "admin" ? "Admin" : "User"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(user.createdAt).toLocaleDateString()}
            </div>
            <div>
              <button
                onClick={() => toggleRole(user.id, user.role)}
                disabled={updating === user.id}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition border",
                  user.role === "admin"
                    ? "text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20"
                    : "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20",
                  "disabled:opacity-50"
                )}
              >
                {updating === user.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <UserCog className="w-3 h-3" />
                )}
                {user.role === "admin" ? "Demote" : "Promote"}
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No users found. Sign in to create your account.</div>
        )}
      </div>
    </div>
  );
}

function RateLimitPanel() {
  const [data, setData] = useState<RateLimitData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/monitor/rate-limits`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 10000); return () => clearInterval(iv); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return <div className="text-center text-muted-foreground py-8">Failed to load rate limit data</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <div className="text-2xl font-bold text-white">{data.totalRequests.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total Requests</div>
        </div>
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <div className="text-2xl font-bold text-red-400">{data.totalRejected.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Rejected (429)</div>
        </div>
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <div className="text-2xl font-bold text-emerald-400">{data.overallAcceptRate}</div>
          <div className="text-xs text-muted-foreground">Accept Rate</div>
        </div>
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <div className="text-2xl font-bold text-blue-400">{data.activeWindows}</div>
          <div className="text-xs text-muted-foreground">Active Windows</div>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Per-Endpoint Metrics
          </h3>
        </div>
        {data.endpoints.length > 0 ? (
          <div className="divide-y divide-white/5">
            {data.endpoints.map((ep) => (
              <div key={ep.endpoint} className="px-4 py-3 hover:bg-white/[0.02]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-mono text-white">{ep.endpoint}</span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    ep.rejectedRequests > 0 ? "text-red-400 bg-red-500/10" : "text-emerald-400 bg-emerald-500/10"
                  )}>
                    {ep.acceptRate} accepted
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{ep.totalRequests} requests</span>
                  <span>{ep.rejectedRequests} rejected</span>
                  <span>{ep.uniqueUsers} users</span>
                  <span>Last: {new Date(ep.lastHit).toLocaleTimeString()}</span>
                </div>
                <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all"
                    style={{ width: ep.acceptRate }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No rate-limited requests yet. Metrics appear as endpoints receive traffic.
          </div>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"users" | "rate-limits" | "roadmap">("users");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");

  const counts = countByStatus(PROJECT_LOG);
  const total = counts.done + counts.partial + counts.todo + counts.idea;
  const completionPct = total > 0 ? Math.round((counts.done / total) * 100) : 0;

  const categories = Array.from(new Set(PROJECT_LOG.map(i => i.category)));

  const matchesFilters = (item: LogItem): boolean => {
    const statusMatch = filter === "all" || item.status === filter || item.children?.some(c => c.status === filter);
    const catMatch = categoryFilter === "all" || item.category === categoryFilter;
    const prioMatch = priorityFilter === "all" || item.priority === priorityFilter || item.children?.some(c => c.priority === priorityFilter);
    return !!statusMatch && catMatch && !!prioMatch;
  };

  const filtered = PROJECT_LOG.filter(matchesFilters);


  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">User management, rate limiting, and project status</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-white/10 pb-1">
        {[
          { key: "users" as const, label: "User Management", icon: Users },
          { key: "rate-limits" as const, label: "Rate Limits", icon: Activity },
          { key: "roadmap" as const, label: "Project Roadmap", icon: Rocket },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium transition-all border-b-2",
              tab === t.key
                ? "text-primary border-primary bg-primary/5"
                : "text-muted-foreground border-transparent hover:text-white"
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UserManagementPanel />}
      {tab === "rate-limits" && <RateLimitPanel />}
      {tab === "roadmap" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="glass-panel rounded-xl border border-white/5 p-4 text-center">
              <div className="text-2xl font-bold text-white">{completionPct}%</div>
              <div className="text-xs text-muted-foreground">Overall</div>
              <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full" style={{ width: `${completionPct}%` }} />
              </div>
            </div>
            {(["done", "partial", "todo", "idea"] as Status[]).map(s => {
              const c = statusConfig[s];
              const Ic = c.icon;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(filter === s ? "all" : s)}
                  className={cn(
                    "glass-panel rounded-xl border p-4 text-center transition-all",
                    filter === s ? "border-white/20 bg-white/5" : "border-white/5 hover:border-white/10"
                  )}
                >
                  <Ic className={cn("w-5 h-5 mx-auto mb-1", c.color.split(" ")[0])} />
                  <div className="text-xl font-bold text-white">{counts[s]}</div>
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-14">Priority:</span>
              <button
                onClick={() => setPriorityFilter("all")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-all border",
                  priorityFilter === "all" ? "bg-primary/20 text-primary border-primary/30" : "bg-black/30 text-muted-foreground border-white/5 hover:border-white/10"
                )}
              >
                All
              </button>
              {(["critical", "high", "medium", "low"] as Priority[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(priorityFilter === p ? "all" : p)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-all border capitalize",
                    priorityFilter === p ? priorityColors[p] : "bg-black/30 text-muted-foreground border-white/5 hover:border-white/10"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-14">Category:</span>
              <button
                onClick={() => setCategoryFilter("all")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-all border",
                  categoryFilter === "all" ? "bg-primary/20 text-primary border-primary/30" : "bg-black/30 text-muted-foreground border-white/5 hover:border-white/10"
                )}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(categoryFilter === cat ? "all" : cat)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-all border capitalize",
                    categoryFilter === cat ? "bg-primary/20 text-primary border-primary/30" : "bg-black/30 text-muted-foreground border-white/5 hover:border-white/10"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
            {filtered.map((item, i) => (
              <LogItemRow key={i} item={item} />
            ))}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No items match the current filter</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
