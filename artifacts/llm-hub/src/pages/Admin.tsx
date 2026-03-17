import { useState } from "react";
import { Shield, CheckCircle2, Circle, AlertCircle, Clock, ChevronDown, ChevronRight, Wrench, Rocket, Bug, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

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
      { title: "VPS PostgreSQL database", status: "done", priority: "critical", category: "database", details: "72.60.167.64:5432 — training_sources, brain_sources, brain_chunks, model_benchmarks, backup_snapshots" },
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
      { title: "Streaming responses (SSE)", status: "done", priority: "high", category: "chat", details: "Real-time token streaming via SSE endpoint, tokens appear as they are generated" },
      { title: "Conversation export (JSON/Markdown)", status: "todo", priority: "low", category: "chat", details: "Export chat history for backup or sharing" },
      { title: "Vector embeddings for semantic search", status: "todo", priority: "high", category: "chat", details: "Replace TF-IDF with proper vector embeddings (e.g. sentence-transformers) for true semantic similarity" },
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
      { title: "Follow-up questions", status: "done", priority: "medium", category: "research", details: "Ask follow-up questions within research context" },
      { title: "Source citations", status: "done", priority: "medium", category: "research", details: "Model attribution and citation tracking in results" },
      { title: "Persistent sessions (database)", status: "done", priority: "medium", category: "research", details: "Research sessions and follow-ups stored in PostgreSQL, survive restarts" },
      { title: "Research export (PDF/Markdown)", status: "todo", priority: "low", category: "research", details: "Export research reports for sharing" },
    ],
  },
  {
    title: "Vision Studio",
    status: "done",
    priority: "medium",
    category: "vision",
    details: "Image generation (GPT-Image-1) and vision analysis (llava:13b)",
    children: [
      { title: "Image generation with GPT-Image-1", status: "done", priority: "medium", category: "vision", details: "Text-to-image with domain presets" },
      { title: "Vision analysis with llava:13b", status: "done", priority: "medium", category: "vision", details: "Upload image, get AI analysis with domain context" },
      { title: "Domain presets (Medical, Finance, etc.)", status: "done", priority: "low", category: "vision", details: "Pre-configured prompts for different analysis domains" },
    ],
  },
  {
    title: "Agent Orchestration",
    status: "done",
    priority: "high",
    category: "agents",
    details: "Agent fleet management with OpenClaw gateway integration, real tool execution, multi-step workflows",
    children: [
      { title: "Agent CRUD (create/edit/delete)", status: "done", priority: "high", category: "agents", details: "Full agent management with categories, system prompts, emoji" },
      { title: "Fleet management dashboard", status: "done", priority: "high", category: "agents", details: "Agent cards, category filtering, bulk operations" },
      { title: "Task creation & routing", status: "done", priority: "high", category: "agents", details: "Create tasks, auto-route to best agent based on category/workload" },
      { title: "Tool definitions (8 presets)", status: "done", priority: "medium", category: "agents", details: "Web search, code exec, file reader, email, database, API, summarizer, translator" },
      { title: "Agent task execution via LLM", status: "done", priority: "high", category: "agents", details: "Execute tasks through Ollama with step-by-step logs" },
      { title: "Agent memories", status: "done", priority: "medium", category: "agents", details: "Store and retrieve agent-specific memories" },
      { title: "Real tool execution", status: "done", priority: "high", category: "agents", details: "Tools actually execute: DuckDuckGo web search, Node.js code execution, HTTP API calls, LLM summarization" },
      { title: "Multi-step agent workflows", status: "done", priority: "high", category: "agents", details: "LLM plans multi-step workflows, chains tool calls (search → code → summarize → respond)" },
      { title: "Agent-to-agent communication", status: "idea", priority: "medium", category: "agents", details: "Let agents delegate subtasks to other agents" },
      { title: "Agent performance metrics", status: "done", priority: "medium", category: "agents", details: "Per-agent metrics API: success rate, avg response time, task counts, error tracking" },
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
      { title: "Model Profiles", status: "done", priority: "medium", category: "training", details: "Named model configurations with deployment tracking" },
      { title: "Knowledge Base / RAG documents", status: "done", priority: "high", category: "training", details: "13 documents, 140 chunks across categories" },
      { title: "ENT Training Pipeline", status: "done", priority: "medium", category: "training", details: "10 otolaryngology modules, 137 RAG chunks, Meditron fine-tuning" },
      { title: "VPS Training Sources", status: "done", priority: "high", category: "training", details: "60 sources from auto-collector and manual input" },
      { title: "Fine-tuning interface", status: "partial", priority: "high", category: "training", details: "UI exists but actual Ollama fine-tuning (modelfile create) needs testing and polish" },
      { title: "Model Evolution Engine", status: "done", priority: "medium", category: "training", details: "Benchmarks, synthetic data gen, feedback loop, model updates" },
      { title: "Backup system", status: "done", priority: "medium", category: "training", details: "Metadata snapshots + full JSON data export/restore for both DBs, model inventory, training data" },
      { title: "Project Brain indexer", status: "done", priority: "high", category: "training", details: "Notion/Drive document indexing, chunking, Q&A pair generation" },
      { title: "Actual Ollama fine-tuning execution", status: "todo", priority: "high", category: "training", details: "Run modelfile-based fine-tuning on VPS from the dashboard" },
    ],
  },
  {
    title: "Auto-Collector",
    status: "done",
    priority: "medium",
    category: "collector",
    details: "Automated training data collection from Gmail, Drive, chat history",
    children: [
      { title: "Gmail scanning", status: "done", priority: "medium", category: "collector", details: "Scan recent emails for training content" },
      { title: "Google Drive scanning", status: "done", priority: "medium", category: "collector", details: "Index Drive documents for training" },
      { title: "Chat conversation harvesting", status: "done", priority: "medium", category: "collector", details: "Extract Q&A pairs from chat history" },
      { title: "LLM enrichment (summaries, categories)", status: "done", priority: "medium", category: "collector", details: "Auto-process collected items via Ollama" },
      { title: "Scheduler (every 30 min)", status: "done", priority: "medium", category: "collector", details: "Auto-starts 15s after boot, runs every 30 min" },
    ],
  },
  {
    title: "Analytics & Monitoring",
    status: "done",
    priority: "medium",
    category: "analytics",
    details: "Usage analytics, system monitoring, real-time notifications",
    children: [
      { title: "Analytics dashboard", status: "done", priority: "medium", category: "analytics", details: "Usage charts, model breakdown, rating distribution, VPS stats" },
      { title: "System Monitor", status: "done", priority: "medium", category: "analytics", details: "Health metrics, model inventory, DB stats, knowledge categories" },
      { title: "Real-time notifications (SSE)", status: "done", priority: "medium", category: "analytics", details: "Bell icon with notification dropdown, auto-updates via server-sent events" },
      { title: "Usage tracking per user", status: "todo", priority: "medium", category: "analytics", details: "Needs auth first — track usage and costs per user" },
      { title: "Model cost estimation", status: "idea", priority: "low", category: "analytics", details: "Estimate compute costs based on token usage per model" },
    ],
  },
  {
    title: "Workflow Automations",
    status: "done",
    priority: "medium",
    category: "automations",
    details: "Scheduled recurring tasks that execute real actions — research, training, backups, benchmarks, agent tasks",
    children: [
      { title: "Create/manage automations", status: "done", priority: "medium", category: "automations", details: "CRUD with schedule presets (30min, 1hr, 6hr, 12hr, 1day)" },
      { title: "Enable/disable/manual run", status: "done", priority: "medium", category: "automations", details: "Toggle automations, trigger manual runs" },
      { title: "Real action execution", status: "done", priority: "high", category: "automations", details: "Automations trigger real actions: backup exports, research runs, auto-collector, benchmarks, agent tasks" },
      { title: "Execution history & logs", status: "done", priority: "medium", category: "automations", details: "Full execution history with timing, status, results per run" },
    ],
  },
  {
    title: "UI / UX",
    status: "done",
    priority: "medium",
    category: "ui",
    details: "Dark theme, glass-panel design, responsive mobile layout",
    children: [
      { title: "Dark theme with glass panels", status: "done", priority: "medium", category: "ui", details: "Consistent dark UI across all pages" },
      { title: "Mobile responsive navigation", status: "done", priority: "medium", category: "ui", details: "Hamburger menu, responsive grids, touch-friendly" },
      { title: "Notification bell in header", status: "done", priority: "medium", category: "ui", details: "Unread count badge, dropdown list" },
      { title: "Keyboard shortcuts", status: "todo", priority: "low", category: "ui", details: "Quick navigation, search, common actions via keyboard" },
      { title: "Dark/Light theme toggle", status: "idea", priority: "low", category: "ui", details: "Some users may prefer light mode" },
    ],
  },
  {
    title: "Security & Auth",
    status: "done",
    priority: "critical",
    category: "security",
    details: "Authentication, authorization, per-user scoping, credentials secured",
    children: [
      { title: "User authentication (Replit Auth)", status: "done", priority: "critical", category: "security", details: "OpenID Connect with PKCE — login, sessions, user identification via Replit Auth" },
      { title: "Per-user data scoping", status: "done", priority: "critical", category: "security", details: "Conversations scoped to authenticated user via userId column" },
      { title: "Admin vs regular user roles", status: "todo", priority: "high", category: "security", details: "Admin access to training, model management; users get chat/research" },
      { title: "Move VPS DB credentials to env vars", status: "done", priority: "critical", category: "security", details: "All VPS credentials moved to Replit environment secrets" },
      { title: "Rate limiting on API endpoints", status: "todo", priority: "high", category: "security", details: "Prevent abuse of LLM endpoints" },
      { title: "SSL/TLS for VPS PostgreSQL", status: "todo", priority: "high", category: "security", details: "Currently using ssl:false — enable TLS for encrypted DB connections" },
    ],
  },
  {
    title: "Deployment & DevOps",
    status: "partial",
    priority: "high",
    category: "devops",
    details: "Production deployment and operational concerns",
    children: [
      { title: "Production build working", status: "done", priority: "critical", category: "devops", details: "esbuild + Vite build passes, autoscale deployment configured" },
      { title: "Publish to .replit.app", status: "partial", priority: "high", category: "devops", details: "Configured and ready — needs user to click Publish" },
      { title: "Health check endpoint", status: "done", priority: "medium", category: "devops", details: "/api/health returns server status" },
      { title: "Error monitoring / logging", status: "todo", priority: "high", category: "devops", details: "Structured logging, error tracking, alerting" },
      { title: "Database migrations strategy", status: "todo", priority: "medium", category: "devops", details: "Drizzle push works for dev, need migration strategy for prod" },
      { title: "Backup automation for production", status: "todo", priority: "medium", category: "devops", details: "Automated daily backups with retention policy" },
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
          {!hasChildren && <div className="w-3" />}
          <Icon className={cn("w-4 h-4", cfg.color.split(" ")[0])} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm font-medium", item.status === "done" ? "text-muted-foreground" : "text-white")}>
              {item.title}
            </span>
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

export default function Admin() {
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
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Admin — Project Status Log</h1>
          <p className="text-sm text-muted-foreground">Complete feature tracker and roadmap</p>
        </div>
      </div>

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

      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Rocket className="w-4 h-4 text-orange-400" />
          Top Priority Next Steps
        </h3>
        <div className="space-y-2">
          {[
            { icon: Shield, color: "text-orange-400", title: "Admin vs regular user roles", detail: "Differentiate admin access (training, model management) from regular user access (chat, research)" },
            { icon: Wrench, color: "text-orange-400", title: "Rate limiting on API endpoints", detail: "Prevent abuse of LLM endpoints with per-user rate limits" },
            { icon: Lightbulb, color: "text-blue-400", title: "Vector embeddings for semantic RAG", detail: "TF-IDF is decent but proper embeddings would dramatically improve context retrieval" },
            { icon: Wrench, color: "text-orange-400", title: "SSL/TLS for VPS PostgreSQL", detail: "Enable encrypted database connections to the VPS" },
            { icon: Lightbulb, color: "text-blue-400", title: "Agent-to-agent communication", detail: "Let agents delegate subtasks to other specialized agents" },
            { icon: Lightbulb, color: "text-blue-400", title: "Conversation & research export", detail: "Export chat history and research reports as PDF/Markdown for sharing" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
              <item.icon className={cn("w-4 h-4 mt-0.5 shrink-0", item.color)} />
              <div>
                <div className="text-xs font-medium text-white">{item.title}</div>
                <div className="text-[10px] text-muted-foreground">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
