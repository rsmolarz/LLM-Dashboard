import { useState, useEffect, useCallback } from "react";
import { Workflow, Bot, Play, Clock, CheckCircle, XCircle, ExternalLink, Plus, LayoutTemplate, Database, Settings, RefreshCw, Loader2, ArrowRight, Zap, Activity } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface AgentFlowStatus {
  connected: boolean;
  url: string;
  agents: number;
  workflows: number;
  executions: number;
  templates: number;
  error?: string;
}

interface AFAgent {
  id: string;
  name: string;
  role?: string;
  model?: string;
  provider?: string;
  status?: string;
  tools?: string[];
  description?: string;
}

interface AFWorkflow {
  id: string;
  name: string;
  description?: string;
  status?: string;
  nodes?: any[];
  edges?: any[];
  createdAt?: string;
}

interface AFExecution {
  id: string;
  workflowId?: string;
  workflowName?: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  tokensUsed?: number;
  cost?: number;
}

interface AFTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  preview?: Record<string, any>;
  popularity: number;
}

type Tab = "overview" | "agents" | "workflows" | "executions" | "templates" | "knowledge" | "settings";

export default function AgentFlow() {
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<AgentFlowStatus | null>(null);
  const [agents, setAgents] = useState<AFAgent[]>([]);
  const [workflows, setWorkflows] = useState<AFWorkflow[]>([]);
  const [executions, setExecutions] = useState<AFExecution[]>([]);
  const [templates, setTemplates] = useState<AFTemplate[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", role: "", model: "gpt-4o", provider: "openai", description: "" });
  const [newWorkflow, setNewWorkflow] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, agentsRes, workflowsRes, execRes, templatesRes, kbRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE}/agentflow/status`).then(r => r.json()),
        fetch(`${API_BASE}/agentflow/agents`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/agentflow/workflows`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/agentflow/executions`).then(r => r.json()).catch(() => ({ items: [] })),
        fetch(`${API_BASE}/agentflow/templates`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/agentflow/knowledge-bases`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/agentflow/settings`).then(r => r.json()).catch(() => ({})),
      ]);
      setStatus(statusRes);
      setAgents(Array.isArray(agentsRes) ? agentsRes : []);
      setWorkflows(Array.isArray(workflowsRes) ? workflowsRes : []);
      setExecutions(Array.isArray(execRes?.items) ? execRes.items : Array.isArray(execRes) ? execRes : []);
      setTemplates(Array.isArray(templatesRes) ? templatesRes : []);
      setKnowledgeBases(Array.isArray(kbRes) ? kbRes : []);
      setSettings(settingsRes || {});
    } catch {
      setStatus({ connected: false, url: "", agents: 0, workflows: 0, executions: 0, templates: 0, error: "Network error" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const [actionError, setActionError] = useState<string | null>(null);

  const createAgent = async () => {
    if (!newAgent.name.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const r = await fetch(`${API_BASE}/agentflow/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAgent),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      setShowCreateAgent(false);
      setNewAgent({ name: "", role: "", model: "gpt-4o", provider: "openai", description: "" });
      fetchAll();
    } catch (e: any) {
      setActionError(e.message || "Failed to create agent");
    }
    setCreating(false);
  };

  const createWorkflow = async () => {
    if (!newWorkflow.name.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const r = await fetch(`${API_BASE}/agentflow/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWorkflow),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      setShowCreateWorkflow(false);
      setNewWorkflow({ name: "", description: "" });
      fetchAll();
    } catch (e: any) {
      setActionError(e.message || "Failed to create workflow");
    }
    setCreating(false);
  };

  const executeWorkflow = async (id: string) => {
    setActionError(null);
    try {
      const r = await fetch(`${API_BASE}/agentflow/workflows/${id}/execute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      fetchAll();
    } catch (e: any) {
      setActionError(e.message || "Failed to execute workflow");
    }
  };

  const applyTemplate = async (id: string) => {
    setActionError(null);
    try {
      const r = await fetch(`${API_BASE}/agentflow/templates/${id}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      fetchAll();
    } catch (e: any) {
      setActionError(e.message || "Failed to apply template");
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "agents", label: "Agents", icon: Bot },
    { id: "workflows", label: "Workflows", icon: Workflow },
    { id: "executions", label: "Executions", icon: Clock },
    { id: "templates", label: "Templates", icon: LayoutTemplate },
    { id: "knowledge", label: "Knowledge", icon: Database },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Workflow className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AgentFlow</h1>
            <p className="text-xs text-muted-foreground">AI Agent Management Platform</p>
          </div>
          <div className={`ml-3 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold ${status?.connected ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${status?.connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            {status?.connected ? "Connected" : "Disconnected"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-white hover:bg-white/10 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <a href="https://omni-agent-core.replit.app" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-xs text-violet-300 hover:bg-violet-500/30 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
            Open Platform
          </a>
        </div>
      </div>

      <div className="px-4 md:px-6 py-2 border-b border-white/5 flex gap-1 overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {actionError && (
          <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="ml-2 hover:text-white">✕</button>
          </div>
        )}
        {tab === "overview" && <OverviewTab status={status} agents={agents} workflows={workflows} executions={executions} templates={templates} />}
        {tab === "agents" && (
          <AgentsTab agents={agents} showCreate={showCreateAgent} setShowCreate={setShowCreateAgent} newAgent={newAgent} setNewAgent={setNewAgent} creating={creating} createAgent={createAgent} />
        )}
        {tab === "workflows" && (
          <WorkflowsTab workflows={workflows} showCreate={showCreateWorkflow} setShowCreate={setShowCreateWorkflow} newWorkflow={newWorkflow} setNewWorkflow={setNewWorkflow} creating={creating} createWorkflow={createWorkflow} executeWorkflow={executeWorkflow} />
        )}
        {tab === "executions" && <ExecutionsTab executions={executions} />}
        {tab === "templates" && <TemplatesTab templates={templates} applyTemplate={applyTemplate} />}
        {tab === "knowledge" && <KnowledgeTab knowledgeBases={knowledgeBases} />}
        {tab === "settings" && <SettingsTab settings={settings} />}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="glass-panel rounded-xl p-4 border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function OverviewTab({ status, agents, workflows, executions, templates }: { status: AgentFlowStatus | null; agents: AFAgent[]; workflows: AFWorkflow[]; executions: AFExecution[]; templates: AFTemplate[] }) {
  const successRate = executions.length > 0 ? Math.round((executions.filter(e => e.status === "completed").length / executions.length) * 100) : 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Agents" value={status?.agents ?? agents.length} icon={Bot} color="bg-blue-500/20" />
        <StatCard label="Workflows" value={status?.workflows ?? workflows.length} icon={Workflow} color="bg-violet-500/20" />
        <StatCard label="Executions" value={status?.executions ?? executions.length} icon={Clock} color="bg-amber-500/20" />
        <StatCard label="Templates" value={status?.templates ?? templates.length} icon={LayoutTemplate} color="bg-green-500/20" />
      </div>

      {!status?.connected && (
        <div className="glass-panel rounded-xl p-4 border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-1">
            <XCircle className="w-4 h-4" />
            Connection Error
          </div>
          <p className="text-xs text-muted-foreground">{status?.error || "Unable to connect to AgentFlow platform."}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-400" />
            Recent Agents
          </h3>
          {agents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No agents created yet. Use the Agents tab or visit AgentFlow to create one.</p>
          ) : (
            <div className="space-y-2">
              {agents.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5">
                  <div>
                    <div className="text-sm font-medium text-white">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground">{a.role || a.model || "No role"}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.status === "active" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>
                    {a.status || "idle"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-violet-400" />
            Recent Workflows
          </h3>
          {workflows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No workflows created yet. Build a pipeline in the Workflows tab.</p>
          ) : (
            <div className="space-y-2">
              {workflows.slice(0, 5).map(w => (
                <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5">
                  <div>
                    <div className="text-sm font-medium text-white">{w.name}</div>
                    <div className="text-[10px] text-muted-foreground">{w.description || "No description"}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${w.status === "active" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>
                    {w.status || "draft"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-xl p-4 border border-white/5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          Latest Executions
        </h3>
        {executions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No executions yet. Run a workflow to see results here.</p>
        ) : (
          <div className="space-y-2">
            {executions.slice(0, 8).map(e => (
              <div key={e.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5">
                <div className="flex items-center gap-2">
                  {e.status === "completed" ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : e.status === "failed" ? <XCircle className="w-3.5 h-3.5 text-red-400" /> : <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                  <div>
                    <div className="text-xs font-medium text-white">{e.workflowName || e.workflowId || e.id}</div>
                    <div className="text-[10px] text-muted-foreground">{e.startedAt ? new Date(e.startedAt).toLocaleString() : ""}</div>
                  </div>
                </div>
                <div className="text-right">
                  {e.duration != null && <div className="text-[10px] text-muted-foreground">{(e.duration / 1000).toFixed(1)}s</div>}
                  {e.tokensUsed != null && <div className="text-[10px] text-muted-foreground">{e.tokensUsed.toLocaleString()} tokens</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-xl p-4 border border-white/5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          Quick Start Templates
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {templates.slice(0, 6).map(t => (
            <div key={t.id} className="p-3 rounded-lg bg-white/5 border border-white/5 hover:border-violet-500/30 transition-colors">
              <div className="text-sm font-medium text-white mb-1">{t.name}</div>
              <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">{t.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {t.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] bg-violet-500/10 text-violet-300">{tag}</span>
                  ))}
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{t.category}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function AgentsTab({ agents, showCreate, setShowCreate, newAgent, setNewAgent, creating, createAgent }: any) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">AI Agents</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-xs text-blue-300 hover:bg-blue-500/30 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          New Agent
        </button>
      </div>

      {showCreate && (
        <div className="glass-panel rounded-xl p-4 border border-blue-500/20 space-y-3">
          <h3 className="text-sm font-semibold text-white">Create Agent</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Name</label>
              <input value={newAgent.name} onChange={e => setNewAgent({ ...newAgent, name: e.target.value })} placeholder="My Agent" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Role</label>
              <input value={newAgent.role} onChange={e => setNewAgent({ ...newAgent, role: e.target.value })} placeholder="Data Analyst" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Provider</label>
              <select value={newAgent.provider} onChange={e => setNewAgent({ ...newAgent, provider: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google AI</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Model</label>
              <input value={newAgent.model} onChange={e => setNewAgent({ ...newAgent, model: e.target.value })} placeholder="gpt-4o" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Description</label>
            <textarea value={newAgent.description} onChange={e => setNewAgent({ ...newAgent, description: e.target.value })} placeholder="Describe what this agent does..." rows={2} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50 resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={createAgent} disabled={creating || !newAgent.name.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-white/5 text-xs text-muted-foreground hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">No Agents Yet</h3>
          <p className="text-xs text-muted-foreground mb-3">Create your first AI agent to start building automated workflows.</p>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-xs text-blue-300 hover:bg-blue-500/30 transition-colors">
            Create Your First Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a: AFAgent) => (
            <div key={a.id} className="glass-panel rounded-xl p-4 border border-white/5 hover:border-blue-500/20 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.status === "active" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>
                  {a.status || "idle"}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white">{a.name}</h4>
              <p className="text-[10px] text-muted-foreground mt-1">{a.role || a.description || "No description"}</p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{a.provider || "openai"}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{a.model || "gpt-4o"}</span>
              </div>
              {a.tools && a.tools.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {a.tools.map(tool => (
                    <span key={tool} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300">{tool}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function WorkflowsTab({ workflows, showCreate, setShowCreate, newWorkflow, setNewWorkflow, creating, createWorkflow, executeWorkflow }: any) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Workflows</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-xs text-violet-300 hover:bg-violet-500/30 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          New Workflow
        </button>
      </div>

      {showCreate && (
        <div className="glass-panel rounded-xl p-4 border border-violet-500/20 space-y-3">
          <h3 className="text-sm font-semibold text-white">Create Workflow</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Name</label>
              <input value={newWorkflow.name} onChange={e => setNewWorkflow({ ...newWorkflow, name: e.target.value })} placeholder="Research Pipeline" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Description</label>
              <input value={newWorkflow.description} onChange={e => setNewWorkflow({ ...newWorkflow, description: e.target.value })} placeholder="Automated research pipeline" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500/50" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createWorkflow} disabled={creating || !newWorkflow.name.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors disabled:opacity-50">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-white/5 text-xs text-muted-foreground hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {workflows.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
          <Workflow className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">No Workflows Yet</h3>
          <p className="text-xs text-muted-foreground mb-3">Build a visual pipeline connecting triggers, agents, and outputs.</p>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-xs text-violet-300 hover:bg-violet-500/30 transition-colors">
            Create Workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.map((w: AFWorkflow) => (
            <div key={w.id} className="glass-panel rounded-xl p-4 border border-white/5 hover:border-violet-500/20 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Workflow className="w-4 h-4 text-violet-400" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${w.status === "active" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>
                    {w.status || "draft"}
                  </span>
                  <button onClick={() => executeWorkflow(w.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/20 text-green-300 text-[10px] hover:bg-green-500/30 transition-colors">
                    <Play className="w-3 h-3" />
                    Run
                  </button>
                </div>
              </div>
              <h4 className="text-sm font-semibold text-white">{w.name}</h4>
              <p className="text-[10px] text-muted-foreground mt-1">{w.description || "No description"}</p>
              {w.nodes && <div className="text-[10px] text-muted-foreground mt-2">{w.nodes.length} nodes</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ExecutionsTab({ executions }: { executions: AFExecution[] }) {
  return (
    <>
      <h2 className="text-lg font-bold text-white">Execution History</h2>
      {executions.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
          <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">No Executions</h3>
          <p className="text-xs text-muted-foreground">Run a workflow to see execution logs here.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5 text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Workflow</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Started</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Duration</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Tokens</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Cost</th>
              </tr>
            </thead>
            <tbody>
              {executions.map(e => (
                <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1.5 ${e.status === "completed" ? "text-green-400" : e.status === "failed" ? "text-red-400" : "text-amber-400"}`}>
                      {e.status === "completed" ? <CheckCircle className="w-3.5 h-3.5" /> : e.status === "failed" ? <XCircle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{e.workflowName || e.workflowId || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{e.startedAt ? new Date(e.startedAt).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{e.duration != null ? `${(e.duration / 1000).toFixed(1)}s` : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{e.tokensUsed?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{e.cost != null ? `$${e.cost.toFixed(4)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TemplatesTab({ templates, applyTemplate }: { templates: AFTemplate[]; applyTemplate: (id: string) => void }) {
  const categories = Array.from(new Set(templates.map(t => t.category)));

  return (
    <>
      <h2 className="text-lg font-bold text-white">Templates</h2>
      <p className="text-xs text-muted-foreground -mt-4">Pre-built agent and workflow templates. Apply with one click.</p>
      {categories.map(cat => (
        <div key={cat}>
          <h3 className="text-sm font-semibold text-white capitalize mb-3">{cat}s</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.filter(t => t.category === cat).map(t => (
              <div key={t.id} className="glass-panel rounded-xl p-4 border border-white/5 hover:border-violet-500/20 transition-colors flex flex-col">
                <h4 className="text-sm font-semibold text-white mb-1">{t.name}</h4>
                <p className="text-[10px] text-muted-foreground flex-1 mb-3">{t.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 flex-wrap">
                    {t.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] bg-violet-500/10 text-violet-300">{tag}</span>
                    ))}
                  </div>
                  <button onClick={() => applyTemplate(t.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300 text-[10px] hover:bg-violet-500/30 transition-colors">
                    <ArrowRight className="w-3 h-3" />
                    Apply
                  </button>
                </div>
                {t.preview && Object.keys(t.preview).length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {t.preview.model && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{t.preview.model}</span>}
                    {t.preview.provider && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{t.preview.provider}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function KnowledgeTab({ knowledgeBases }: { knowledgeBases: any[] }) {
  return (
    <>
      <h2 className="text-lg font-bold text-white">Knowledge Bases</h2>
      {knowledgeBases.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
          <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">No Knowledge Bases</h3>
          <p className="text-xs text-muted-foreground mb-3">Create a vector database on AgentFlow to give your agents access to your documents via RAG.</p>
          <a href="https://omni-agent-core.replit.app/knowledge-bases" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-xs text-violet-300 hover:bg-violet-500/30 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
            Create on AgentFlow
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {knowledgeBases.map((kb: any) => (
            <div key={kb.id} className="glass-panel rounded-xl p-4 border border-white/5">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center mb-3">
                <Database className="w-4 h-4 text-green-400" />
              </div>
              <h4 className="text-sm font-semibold text-white">{kb.name}</h4>
              <p className="text-[10px] text-muted-foreground mt-1">{kb.description || "No description"}</p>
              {kb.documentCount != null && <div className="text-[10px] text-muted-foreground mt-2">{kb.documentCount} documents</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SettingsTab({ settings }: { settings: Record<string, any> }) {
  return (
    <>
      <h2 className="text-lg font-bold text-white">Platform Settings</h2>
      <div className="glass-panel rounded-xl p-4 border border-white/5">
        <h3 className="text-sm font-semibold text-white mb-3">Connection Info</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-xs text-muted-foreground">Platform URL</span>
            <a href="https://omni-agent-core.replit.app" target="_blank" rel="noopener noreferrer" className="text-xs text-violet-300 hover:text-violet-200 flex items-center gap-1">
              omni-agent-core.replit.app <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-xs text-muted-foreground">API Endpoint</span>
            <span className="text-xs text-white font-mono">https://omni-agent-core.replit.app/api</span>
          </div>
        </div>
      </div>

      {Object.keys(settings).length > 0 && (
        <div className="glass-panel rounded-xl p-4 border border-white/5">
          <h3 className="text-sm font-semibold text-white mb-3">Remote Settings</h3>
          <div className="space-y-2">
            {Object.entries(settings).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-xs text-muted-foreground">{key}</span>
                <span className="text-xs text-white">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-panel rounded-xl p-4 border border-white/5">
        <h3 className="text-sm font-semibold text-white mb-2">Integration Notes</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>LLM Hub proxies all requests through its API server to AgentFlow.</li>
          <li>Agents created here appear in AgentFlow and vice versa.</li>
          <li>Use the Workflows tab to build and execute pipelines.</li>
          <li>For advanced features (visual builder, drag-and-drop), open AgentFlow directly.</li>
        </ul>
      </div>
    </>
  );
}
