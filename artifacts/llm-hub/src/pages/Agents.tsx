import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Plus, Trash2, Loader2, Settings, MessageSquare, Activity,
  Play, Square, Edit2, Copy, Download, Wifi, WifiOff, Search,
  BarChart3, ChevronRight, X, Send, Terminal, Users, Zap, Shield,
  Code, Mail, Globe, FileText, Clock, Brain, ListTodo, Route,
  CheckCircle2, AlertCircle, ArrowUpCircle, Tag, Filter
} from "lucide-react";
import {
  useListAgents,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useChatWithAgent,
  useGetAgentLogs,
  useGetOpenclawStats,
  useGetGatewayStatus,
  useGetOpenclawConfig,
  useUpdateOpenclawConfig,
  useGetOpenclawSetupScript,
  useListAgentMemories,
  useAddAgentMemory,
  useDeleteAgentMemory,
  useListAgentTasks,
  useCreateAgentTask,
  useUpdateAgentTask,
  useCompleteAgentTask,
  useRouteTask,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type View = "fleet" | "create" | "detail" | "settings" | "setup" | "tasks" | "messages";

const CATEGORIES = [
  { id: "general", label: "General", icon: Bot, color: "text-blue-400" },
  { id: "research", label: "Research", icon: Search, color: "text-purple-400" },
  { id: "customer-service", label: "Customer Service", icon: MessageSquare, color: "text-green-400" },
  { id: "code", label: "Code & Dev", icon: Code, color: "text-orange-400" },
  { id: "business", label: "Business Ops", icon: Mail, color: "text-cyan-400" },
  { id: "content", label: "Content", icon: FileText, color: "text-pink-400" },
  { id: "security", label: "Security", icon: Shield, color: "text-red-400" },
];

const EMOJI_OPTIONS = ["🤖", "🦞", "🧠", "🔬", "💼", "🛡️", "📝", "🎯", "🔧", "📊", "🌐", "⚡", "🎨", "📡", "🦾"];

const TOOL_PRESETS = [
  { id: "web_search", label: "Web Search", icon: Globe, desc: "Search the internet for information" },
  { id: "code_exec", label: "Code Execution", icon: Code, desc: "Run code snippets in a sandbox" },
  { id: "file_read", label: "File Reader", icon: FileText, desc: "Read and parse files" },
  { id: "email_send", label: "Email", icon: Mail, desc: "Send emails via Gmail" },
  { id: "db_query", label: "Database", icon: Terminal, desc: "Query PostgreSQL databases" },
  { id: "api_call", label: "API Caller", icon: Globe, desc: "Make HTTP API requests" },
  { id: "summarize", label: "Summarizer", icon: Brain, desc: "Summarize long documents" },
  { id: "translate", label: "Translator", icon: Globe, desc: "Translate between languages" },
];

export default function Agents() {
  const [view, setView] = useState<View>("fleet");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const queryClient = useQueryClient();
  const { data: agents = [], isLoading } = useListAgents();
  const { data: stats } = useGetOpenclawStats();
  const { data: gatewayStatus } = useGetGatewayStatus({ query: { refetchInterval: 15000 } as any });

  const filteredAgents = agents.filter((a: any) => {
    const matchSearch = !searchFilter || 
      a.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      a.agentId.toLowerCase().includes(searchFilter.toLowerCase());
    const matchCategory = categoryFilter === "all" || a.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1">Agent Fleet</h2>
            <p className="text-muted-foreground">
              Manage your AI agents powered by OpenClaw
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-black/40 border border-white/5">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                gatewayStatus?.online 
                  ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                  : "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
              )} />
              <span className={gatewayStatus?.online ? "text-emerald-400" : "text-amber-400"}>
                {gatewayStatus?.online ? "Gateway Online" : "Gateway Offline"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("messages")}
              className="text-muted-foreground hover:text-white"
              title="Agent Messages"
            >
              <Route className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("tasks")}
              className="text-muted-foreground hover:text-white"
            >
              <ListTodo className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("settings")}
              className="text-muted-foreground hover:text-white"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("setup")}
              className="text-muted-foreground hover:text-white"
            >
              <Terminal className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setView("create")}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Agent
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: "Total Agents", value: stats.totalAgents, icon: Users, color: "text-blue-400" },
              { label: "Active", value: stats.activeAgents, icon: Zap, color: "text-emerald-400" },
              { label: "Idle", value: stats.idleAgents, icon: Clock, color: "text-amber-400" },
              { label: "Messages", value: stats.totalMessages, icon: MessageSquare, color: "text-purple-400" },
              { label: "Tasks Done", value: stats.totalTasksCompleted, icon: Activity, color: "text-cyan-400" },
              { label: "Total Tasks", value: (stats as any).totalTasks ?? 0, icon: ListTodo, color: "text-indigo-400" },
              { label: "Pending", value: (stats as any).pendingTasks ?? 0, icon: AlertCircle, color: "text-orange-400" },
              { label: "Memories", value: (stats as any).totalMemories ?? 0, icon: Brain, color: "text-pink-400" },
            ].map((stat) => (
              <div key={stat.label} className="glass-panel rounded-xl border border-white/5 p-3">
                <div className="flex items-center justify-between mb-1">
                  <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                  <span className="text-xl font-bold text-white">{stat.value}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {view === "fleet" && (
            <motion.div
              key="fleet"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <FleetView
                agents={filteredAgents}
                isLoading={isLoading}
                searchFilter={searchFilter}
                onSearchChange={setSearchFilter}
                categoryFilter={categoryFilter}
                onCategoryChange={setCategoryFilter}
                onSelect={(id) => { setSelectedAgentId(id); setView("detail"); }}
                onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/openclaw/agents"] })}
              />
            </motion.div>
          )}
          {view === "create" && (
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <CreateAgentView onBack={() => setView("fleet")} />
            </motion.div>
          )}
          {view === "detail" && selectedAgentId && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <AgentDetailView agentId={selectedAgentId} onBack={() => setView("fleet")} />
            </motion.div>
          )}
          {view === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <SettingsView onBack={() => setView("fleet")} />
            </motion.div>
          )}
          {view === "setup" && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <SetupView onBack={() => setView("fleet")} />
            </motion.div>
          )}
          {view === "tasks" && (
            <motion.div
              key="tasks"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <TasksView agents={agents as any[]} onBack={() => setView("fleet")} />
            </motion.div>
          )}
          {view === "messages" && (
            <motion.div
              key="messages"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <MessagesView agents={agents as any[]} onBack={() => setView("fleet")} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FleetView({
  agents, isLoading, searchFilter, onSearchChange, categoryFilter, onCategoryChange, onSelect, onRefresh,
}: {
  agents: any[];
  isLoading: boolean;
  searchFilter: string;
  onSearchChange: (v: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 bg-black/40 border-white/10"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => onCategoryChange("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              categoryFilter === "all" ? "bg-primary/20 text-primary border border-primary/30" : "bg-black/30 text-muted-foreground border border-white/5 hover:border-white/10"
            )}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                categoryFilter === cat.id ? "bg-primary/20 text-primary border border-primary/30" : "bg-black/30 text-muted-foreground border border-white/5 hover:border-white/10"
              )}
            >
              <cat.icon className="w-3 h-3" />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-20">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground mb-2">No agents yet</p>
          <p className="text-sm text-muted-foreground/70">Create your first agent to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent: any) => {
            const category = CATEGORIES.find((c) => c.id === agent.category);
            return (
              <motion.div
                key={agent.id}
                whileHover={{ scale: 1.01 }}
                onClick={() => onSelect(agent.agentId)}
                className="glass-panel rounded-xl border border-white/5 p-5 cursor-pointer hover:border-white/10 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{agent.emoji}</div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-primary transition-colors">
                        {agent.name}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">{agent.agentId}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium",
                    agent.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
                    agent.status === "error" ? "bg-red-500/20 text-red-400" :
                    "bg-amber-500/20 text-amber-400"
                  )}>
                    {agent.status}
                  </div>
                </div>

                {agent.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{agent.description}</p>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    {category && (
                      <span className={cn("flex items-center gap-1", category.color)}>
                        <category.icon className="w-3 h-3" />
                        {category.label}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {agent.totalMessages}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateAgentView({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const createAgent = useCreateAgent();

  const [form, setForm] = useState({
    agentId: "",
    name: "",
    description: "",
    emoji: "🤖",
    model: "llama3.2:latest",
    systemPrompt: "",
    category: "general",
    channels: "",
    temperature: 0.7,
    maxTokens: 4096,
  });
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!form.agentId || !form.name) return;
    const toolsPrompt = selectedTools.size > 0
      ? `\n\nYou have access to the following tools: ${Array.from(selectedTools).map(id => {
          const t = TOOL_PRESETS.find(p => p.id === id);
          return t ? `${t.label} (${t.desc})` : id;
        }).join(", ")}. Use them when appropriate to complete tasks.`
      : "";
    const finalData = {
      ...form,
      systemPrompt: form.systemPrompt + toolsPrompt,
      description: form.description + (selectedTools.size > 0 ? ` [Tools: ${Array.from(selectedTools).join(", ")}]` : ""),
    };
    await createAgent.mutateAsync({ data: finalData });
    queryClient.invalidateQueries({ queryKey: ["/api/openclaw/agents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/openclaw/stats"] });
    onBack();
  };

  const autoGenerateId = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <X className="w-4 h-4 mr-1" /> Back
        </Button>
        <h3 className="text-xl font-bold text-white">Create New Agent</h3>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 p-6 space-y-5">
        <div className="flex gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Emoji</label>
            <div className="flex flex-wrap gap-1.5 max-w-[200px]">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setForm({ ...form, emoji: e })}
                  className={cn(
                    "w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all",
                    form.emoji === e ? "bg-primary/20 ring-1 ring-primary" : "bg-black/30 hover:bg-black/50"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, agentId: autoGenerateId(e.target.value) })}
                placeholder="Research Assistant"
                className="mt-1 bg-black/40 border-white/10"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Agent ID</label>
              <Input
                value={form.agentId}
                onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                placeholder="research-assistant"
                className="mt-1 bg-black/40 border-white/10 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Description</label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What does this agent do?"
            className="mt-1 bg-black/40 border-white/10"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Category</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setForm({ ...form, category: cat.id })}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
                  form.category === cat.id
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-black/30 text-muted-foreground border border-white/5 hover:border-white/10"
                )}
              >
                <cat.icon className="w-4 h-4" />
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">System Prompt</label>
          <textarea
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            placeholder="You are a helpful research assistant specializing in..."
            rows={4}
            className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Model</label>
            <Input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="mt-1 bg-black/40 border-white/10"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Channels</label>
            <Input
              value={form.channels}
              onChange={(e) => setForm({ ...form, channels: e.target.value })}
              placeholder="telegram, slack"
              className="mt-1 bg-black/40 border-white/10"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Agent Tools</label>
          <p className="text-[10px] text-muted-foreground mb-2">Select capabilities this agent can use</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {TOOL_PRESETS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => toggleTool(tool.id)}
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg text-xs transition-all border text-left",
                  selectedTools.has(tool.id)
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-black/30 text-muted-foreground border-white/5 hover:border-white/10"
                )}
              >
                <tool.icon className="w-3.5 h-3.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{tool.label}</p>
                  <p className="text-[9px] opacity-60 truncate">{tool.desc}</p>
                </div>
              </button>
            ))}
          </div>
          {selectedTools.size > 0 && (
            <p className="text-[10px] text-primary mt-1.5">{selectedTools.size} tool(s) selected</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Temperature: {form.temperature}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
              className="w-full mt-2 accent-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Max Tokens</label>
            <Input
              type="number"
              value={form.maxTokens}
              onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 4096 })}
              className="mt-1 bg-black/40 border-white/10"
            />
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!form.agentId || !form.name || createAgent.isPending}
          className="w-full bg-primary hover:bg-primary/90"
        >
          {createAgent.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          Create Agent
        </Button>
      </div>
    </div>
  );
}

function AgentDetailView({ agentId, onBack }: { agentId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data: agents = [] } = useListAgents();
  const agent = (agents as any[]).find((a: any) => a.agentId === agentId);
  const { data: logs = [] } = useGetAgentLogs(agentId, { limit: 20 });
  const deleteAgent = useDeleteAgent();
  const updateAgent = useUpdateAgent();
  const chatMutation = useChatWithAgent();

  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<"chat" | "logs" | "config" | "memory">("chat");

  if (!agent) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Agent not found</p>
        <Button variant="ghost" className="mt-4" onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  const handleSendChat = async () => {
    if (!chatMessage.trim()) return;
    const msg = chatMessage.trim();
    setChatMessage("");
    setChatHistory((h) => [...h, { role: "user", content: msg }]);

    const priorHistory = chatHistory
      .filter((m) => m.role === "user" || m.role === "assistant");

    try {
      const res = await chatMutation.mutateAsync({
        agentId,
        data: { message: msg, conversationHistory: priorHistory },
      });
      setChatHistory((h) => [...h, { role: "assistant", content: (res as any).response }]);
      queryClient.invalidateQueries({ queryKey: ["/api/openclaw/agents"] });
    } catch {
      setChatHistory((h) => [...h, { role: "assistant", content: "Error: Failed to get response" }]);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    await deleteAgent.mutateAsync({ agentId });
    queryClient.invalidateQueries({ queryKey: ["/api/openclaw/agents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/openclaw/stats"] });
    onBack();
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    await updateAgent.mutateAsync({ agentId, data: editForm });
    queryClient.invalidateQueries({ queryKey: ["/api/openclaw/agents"] });
    setEditing(false);
    setEditForm(null);
  };

  const category = CATEGORIES.find((c) => c.id === agent.category);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <X className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="text-4xl">{agent.emoji}</div>
            <div>
              <h3 className="text-2xl font-bold text-white">{agent.name}</h3>
              <p className="text-sm text-muted-foreground font-mono">{agent.agentId}</p>
              {agent.description && (
                <p className="text-sm text-muted-foreground mt-1">{agent.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "px-3 py-1 rounded-full text-xs font-medium",
              agent.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
              agent.status === "error" ? "bg-red-500/20 text-red-400" :
              "bg-amber-500/20 text-amber-400"
            )}>
              {agent.status}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setEditing(true); setEditForm({ name: agent.name, description: agent.description, systemPrompt: agent.systemPrompt, temperature: agent.temperature, maxTokens: agent.maxTokens, model: agent.model, category: agent.category, emoji: agent.emoji }); }}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-400 hover:text-red-300">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-5">
          {[
            { label: "Messages", value: agent.totalMessages, icon: MessageSquare },
            { label: "Tasks Done", value: agent.tasksCompleted, icon: Activity },
            { label: "Model", value: agent.model, icon: Bot },
            { label: "Category", value: category?.label ?? agent.category, icon: category?.icon ?? Bot },
          ].map((s) => (
            <div key={s.label} className="bg-black/30 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <s.icon className="w-3 h-3" />
                {s.label}
              </div>
              <p className="text-white font-medium text-sm truncate">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {editing && editForm && (
        <div className="glass-panel rounded-xl border border-primary/20 p-6 space-y-4">
          <h4 className="font-semibold text-white">Edit Agent</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Name</label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1 bg-black/40 border-white/10" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Model</label>
              <Input value={editForm.model} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} className="mt-1 bg-black/40 border-white/10" />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Description</label>
            <Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="mt-1 bg-black/40 border-white/10" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">System Prompt</label>
            <textarea
              value={editForm.systemPrompt}
              onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })}
              rows={3}
              className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSaveEdit} disabled={updateAgent.isPending} className="bg-primary hover:bg-primary/90">
              {updateAgent.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
            <Button variant="ghost" onClick={() => { setEditing(false); setEditForm(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-white/5 pb-0">
        {(["chat", "memory", "logs", "config"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setDetailTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-all border-b-2 -mb-[1px] flex items-center gap-1.5",
              detailTab === tab
                ? "text-primary border-primary"
                : "text-muted-foreground border-transparent hover:text-white"
            )}
          >
            {tab === "chat" && <><MessageSquare className="w-3.5 h-3.5" /> Chat</>}
            {tab === "memory" && <><Brain className="w-3.5 h-3.5" /> Memory</>}
            {tab === "logs" && <><Activity className="w-3.5 h-3.5" /> Activity</>}
            {tab === "config" && <><Settings className="w-3.5 h-3.5" /> Config</>}
          </button>
        ))}
      </div>

      {detailTab === "chat" && (
        <div className="glass-panel rounded-xl border border-white/5 p-4 space-y-4">
          <div className="min-h-[300px] max-h-[400px] overflow-y-auto space-y-3 p-2">
            {chatHistory.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Send a message to chat with this agent
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[80%] rounded-xl px-4 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-primary/20 text-white"
                      : "bg-black/40 text-white border border-white/5"
                  )}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-black/40 border border-white/5 rounded-xl px-4 py-2.5">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChat()}
              className="bg-black/40 border-white/10"
            />
            <Button onClick={handleSendChat} disabled={chatMutation.isPending || !chatMessage.trim()} className="bg-primary hover:bg-primary/90">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {detailTab === "logs" && (
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          {(logs as any[]).length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No activity logs yet</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {(logs as any[]).map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-black/20">
                  <div className={cn(
                    "w-2 h-2 rounded-full mt-1.5 shrink-0",
                    log.level === "error" ? "bg-red-500" :
                    log.level === "warn" ? "bg-amber-500" :
                    "bg-emerald-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{log.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {detailTab === "memory" && (
        <AgentMemoryTab agentId={agentId} />
      )}

      {detailTab === "config" && (
        <div className="glass-panel rounded-xl border border-white/5 p-4">
          <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap bg-black/30 rounded-lg p-4">
{JSON.stringify({
  agentId: agent.agentId,
  name: agent.name,
  model: agent.model,
  category: agent.category,
  temperature: agent.temperature,
  maxTokens: agent.maxTokens,
  channels: agent.channels || "(none)",
  systemPrompt: agent.systemPrompt || "(none)",
  status: agent.status,
  totalMessages: agent.totalMessages,
  tasksCompleted: agent.tasksCompleted,
  createdAt: agent.createdAt,
}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function SettingsView({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetOpenclawConfig();
  const updateConfig = useUpdateOpenclawConfig();

  const [form, setForm] = useState({
    gatewayUrl: "",
    httpUrl: "",
    authToken: "",
  });
  const [initialized, setInitialized] = useState(false);

  if (config && !initialized) {
    setForm({
      gatewayUrl: (config as any).gatewayUrl || "",
      httpUrl: (config as any).httpUrl || "",
      authToken: (config as any).authToken || "",
    });
    setInitialized(true);
  }

  const handleSave = async () => {
    await updateConfig.mutateAsync({ data: form });
    queryClient.invalidateQueries({ queryKey: ["/api/openclaw/config"] });
    queryClient.invalidateQueries({ queryKey: ["/api/openclaw/gateway/status"] });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <X className="w-4 h-4 mr-1" /> Back
        </Button>
        <h3 className="text-xl font-bold text-white">Gateway Settings</h3>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : (
        <div className="glass-panel rounded-xl border border-white/5 p-6 space-y-5">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Gateway WebSocket URL</label>
            <Input
              value={form.gatewayUrl}
              onChange={(e) => setForm({ ...form, gatewayUrl: e.target.value })}
              placeholder="wss://72.60.167.64:18789"
              className="mt-1 bg-black/40 border-white/10 font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Gateway HTTP URL</label>
            <Input
              value={form.httpUrl}
              onChange={(e) => setForm({ ...form, httpUrl: e.target.value })}
              placeholder="http://72.60.167.64:18789"
              className="mt-1 bg-black/40 border-white/10 font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Auth Token</label>
            <Input
              type="password"
              value={form.authToken}
              onChange={(e) => setForm({ ...form, authToken: e.target.value })}
              placeholder="Your gateway bearer token"
              className="mt-1 bg-black/40 border-white/10 font-mono text-sm"
            />
          </div>
          <Button onClick={handleSave} disabled={updateConfig.isPending} className="w-full bg-primary hover:bg-primary/90">
            {updateConfig.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2" />}
            Save Gateway Configuration
          </Button>
        </div>
      )}
    </div>
  );
}

function SetupView({ onBack }: { onBack: () => void }) {
  const { data: script, isLoading } = useGetOpenclawSetupScript();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (script) {
      navigator.clipboard.writeText(script as string);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!script) return;
    const blob = new Blob([script as string], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "openclaw-setup.sh";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <X className="w-4 h-4 mr-1" /> Back
        </Button>
        <h3 className="text-xl font-bold text-white">VPS Setup Script</h3>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Run this script on your VPS to install and configure OpenClaw Gateway.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="w-4 h-4 mr-1" />
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-1" />
              Download
            </Button>
          </div>
        </div>

        <div className="bg-black/50 rounded-lg p-4 border border-white/5 max-h-[500px] overflow-auto">
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" />
          ) : (
            <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap">
              {script as string}
            </pre>
          )}
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-amber-400 mb-2">Quick Start</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>SSH into your VPS: <code className="text-amber-400">ssh root@72.60.167.64</code></li>
            <li>Run the setup script</li>
            <li>Copy the gateway URL and token shown at the end</li>
            <li>Paste them into Gateway Settings above</li>
            <li>Open port 18789 in your firewall if needed</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function AgentMemoryTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const { data: memories = [], isLoading } = useListAgentMemories(agentId);
  const addMemory = useAddAgentMemory();
  const deleteMemory = useDeleteAgentMemory();

  const [showAdd, setShowAdd] = useState(false);
  const [memForm, setMemForm] = useState({ content: "", memoryType: "fact", importance: 5 });
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filteredMemories = typeFilter === "all"
    ? (memories as any[])
    : (memories as any[]).filter((m: any) => m.memoryType === typeFilter);

  const handleAdd = async () => {
    if (!memForm.content.trim()) return;
    await addMemory.mutateAsync({
      agentId,
      data: {
        content: memForm.content,
        memoryType: memForm.memoryType as any,
        importance: memForm.importance,
        source: "manual",
      },
    });
    queryClient.invalidateQueries({ queryKey: [`/api/openclaw/agents/${agentId}/memories`] });
    setMemForm({ content: "", memoryType: "fact", importance: 5 });
    setShowAdd(false);
  };

  const handleDelete = async (memoryId: number) => {
    await deleteMemory.mutateAsync({ agentId, memoryId });
    queryClient.invalidateQueries({ queryKey: [`/api/openclaw/agents/${agentId}/memories`] });
  };

  const typeColors: Record<string, string> = {
    fact: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    summary: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    preference: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };

  return (
    <div className="glass-panel rounded-xl border border-white/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Brain className="w-4 h-4 text-pink-400" />
            Agent Memory
          </h4>
          <span className="text-xs text-muted-foreground">
            {(memories as any[]).length} memories
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {["all", "fact", "summary", "preference"].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "px-2.5 py-1 rounded text-[10px] font-medium transition-all border",
                  typeFilter === t
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-black/30 text-muted-foreground border-white/5 hover:border-white/10"
                )}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="bg-primary/20 text-primary hover:bg-primary/30 h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-black/30 rounded-lg border border-white/10 p-4 space-y-3">
          <textarea
            value={memForm.content}
            onChange={(e) => setMemForm({ ...memForm, content: e.target.value })}
            placeholder="Enter memory content..."
            rows={2}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center gap-3">
            <select
              value={memForm.memoryType}
              onChange={(e) => setMemForm({ ...memForm, memoryType: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="fact">Fact</option>
              <option value="summary">Summary</option>
              <option value="preference">Preference</option>
            </select>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Importance:</span>
              <input
                type="range"
                min={1}
                max={10}
                value={memForm.importance}
                onChange={(e) => setMemForm({ ...memForm, importance: Number(e.target.value) })}
                className="w-20 accent-primary"
              />
              <span className="text-white font-medium w-4">{memForm.importance}</span>
            </div>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} className="h-7 text-xs">Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={addMemory.isPending || !memForm.content.trim()} className="bg-primary hover:bg-primary/90 h-7 text-xs">
              {addMemory.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
      ) : filteredMemories.length === 0 ? (
        <div className="text-center py-8">
          <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">No memories stored yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Memories are auto-extracted from chats or added manually</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredMemories.map((mem: any) => (
            <div key={mem.id} className="group flex items-start gap-3 bg-black/20 rounded-lg px-3 py-2.5 hover:bg-black/30 transition-all">
              <div className={cn("px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 mt-0.5", typeColors[mem.memoryType] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30")}>
                {mem.memoryType}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{mem.content}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ArrowUpCircle className="w-2.5 h-2.5" />
                    {mem.importance}/10
                  </span>
                  <span>{mem.source}</span>
                  <span>{new Date(mem.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(mem.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-white/5 pt-3">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" />
          Memories are automatically injected as context when chatting with this agent
        </p>
      </div>
    </div>
  );
}

const PRIORITY_CONFIG = {
  urgent: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertCircle },
  high: { color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: ArrowUpCircle },
  medium: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Activity },
  low: { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Clock },
};

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
  pending: { color: "bg-amber-500/20 text-amber-400", icon: Clock },
  "in-progress": { color: "bg-blue-500/20 text-blue-400", icon: Play },
  completed: { color: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle2 },
  failed: { color: "bg-red-500/20 text-red-400", icon: AlertCircle },
};

function TasksView({ agents, onBack }: { agents: any[]; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showRoute, setShowRoute] = useState(false);

  const { data: tasks = [], isLoading } = useListAgentTasks(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const createTask = useCreateAgentTask();
  const updateTask = useUpdateAgentTask();
  const completeTask = useCompleteAgentTask();
  const routeTask = useRouteTask();

  const [taskForm, setTaskForm] = useState({
    title: "", description: "", assignedAgentId: "", priority: "medium", category: "general",
  });
  const [routeForm, setRouteForm] = useState({
    title: "", description: "", category: "general", priority: "medium",
  });
  const [executingTaskId, setExecutingTaskId] = useState<number | null>(null);
  const [executionResult, setExecutionResult] = useState<{ taskId: number; steps: any[]; result?: string; error?: string } | null>(null);

  const BASE = import.meta.env.BASE_URL || "/";
  const executeTask = async (taskId: number) => {
    setExecutingTaskId(taskId);
    setExecutionResult(null);
    try {
      const res = await fetch(`${BASE}api/openclaw/execute-task/${taskId}`, { method: "POST" });
      const data = await res.json();
      setExecutionResult({ taskId, steps: data.steps || [], result: data.result, error: data.error });
      invalidateTasks();
    } catch (err: any) {
      setExecutionResult({ taskId, steps: [], error: err.message });
    } finally {
      setExecutingTaskId(null);
    }
  };

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/openclaw/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/openclaw/stats"] });
  };

  const handleCreate = async () => {
    if (!taskForm.title.trim()) return;
    await createTask.mutateAsync({
      data: {
        title: taskForm.title,
        description: taskForm.description,
        assignedAgentId: taskForm.assignedAgentId || undefined,
        priority: taskForm.priority as any,
        category: taskForm.category,
      },
    });
    invalidateTasks();
    setTaskForm({ title: "", description: "", assignedAgentId: "", priority: "medium", category: "general" });
    setShowCreate(false);
  };

  const handleComplete = async (taskId: number) => {
    await completeTask.mutateAsync({ taskId, data: { result: "Completed via dashboard" } });
    invalidateTasks();
  };

  const handleStatusChange = async (taskId: number, status: string) => {
    await updateTask.mutateAsync({ taskId, data: { status: status as any } });
    invalidateTasks();
  };

  const [routeResult, setRouteResult] = useState<any>(null);

  const handleRoute = async () => {
    if (!routeForm.title.trim()) return;
    const result = await routeTask.mutateAsync({
      data: {
        title: routeForm.title,
        description: routeForm.description,
        category: routeForm.category,
        priority: routeForm.priority as any,
      },
    });
    setRouteResult(result);
    invalidateTasks();
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return "Unassigned";
    const agent = agents.find((a) => a.agentId === agentId);
    return agent ? `${agent.emoji} ${agent.name}` : agentId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <X className="w-4 h-4 mr-1" /> Back
          </Button>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-indigo-400" />
            Task Orchestration
          </h3>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => { setShowRoute(!showRoute); setShowCreate(false); }}
            className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/20"
          >
            <Route className="w-3.5 h-3.5 mr-1.5" />
            Auto-Route
          </Button>
          <Button
            size="sm"
            onClick={() => { setShowCreate(!showCreate); setShowRoute(false); }}
            className="bg-primary/20 text-primary hover:bg-primary/30"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Task
          </Button>
        </div>
      </div>

      {showRoute && (
        <div className="glass-panel rounded-xl border border-purple-500/20 p-5 space-y-4">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Route className="w-4 h-4 text-purple-400" />
            Smart Task Router
          </h4>
          <p className="text-xs text-muted-foreground">
            Describe a task and let the system automatically assign it to the best-suited agent based on category, workload, and capabilities.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={routeForm.title}
              onChange={(e) => setRouteForm({ ...routeForm, title: e.target.value })}
              placeholder="Task title..."
              className="bg-black/40 border-white/10"
            />
            <select
              value={routeForm.category}
              onChange={(e) => setRouteForm({ ...routeForm, category: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <textarea
            value={routeForm.description}
            onChange={(e) => setRouteForm({ ...routeForm, description: e.target.value })}
            placeholder="Describe what needs to be done..."
            rows={2}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center gap-3">
            <select
              value={routeForm.priority}
              onChange={(e) => setRouteForm({ ...routeForm, priority: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent</option>
            </select>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => { setShowRoute(false); setRouteResult(null); }}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleRoute}
              disabled={routeTask.isPending || !routeForm.title.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {routeTask.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Route className="w-3.5 h-3.5 mr-1.5" />}
              Route Task
            </Button>
          </div>

          {routeResult && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 mt-2">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-white">Task Routed Successfully</span>
              </div>
              <p className="text-xs text-muted-foreground">{routeResult.reason}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-white">{routeResult.assignedAgent?.emoji} {routeResult.assignedAgent?.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono">({routeResult.assignedAgent?.agentId})</span>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <div className="glass-panel rounded-xl border border-primary/20 p-5 space-y-4">
          <h4 className="font-semibold text-white">Create New Task</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder="Task title..."
              className="bg-black/40 border-white/10"
            />
            <select
              value={taskForm.assignedAgentId}
              onChange={(e) => setTaskForm({ ...taskForm, assignedAgentId: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Unassigned</option>
              {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.emoji} {a.name}</option>)}
            </select>
          </div>
          <textarea
            value={taskForm.description}
            onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
            placeholder="Task description..."
            rows={2}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center gap-3">
            <select
              value={taskForm.priority}
              onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <select
              value={taskForm.category}
              onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={createTask.isPending || !taskForm.title.trim()} className="bg-primary hover:bg-primary/90">
              {createTask.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Create Task
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {["all", "pending", "in-progress", "completed", "failed"].map((s) => {
          const cfg = s !== "all" ? STATUS_CONFIG[s] : null;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                statusFilter === s ? "bg-primary/20 text-primary border border-primary/30" : "bg-black/30 text-muted-foreground border border-white/5 hover:border-white/10"
              )}
            >
              {cfg && <cfg.icon className="w-3 h-3" />}
              {s === "all" ? "All Tasks" : s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : (tasks as any[]).length === 0 ? (
        <div className="text-center py-12">
          <ListTodo className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground">No tasks found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Create a task or use Auto-Route to assign tasks to agents</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(tasks as any[]).map((task: any) => {
            const prioConfig = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
            const statConfig = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;

            return (
              <div key={task.id} className="glass-panel rounded-xl border border-white/5 p-4 hover:border-white/10 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-white truncate">{task.title}</h4>
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium border", prioConfig.color)}>
                        {task.priority}
                      </span>
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", statConfig.color)}>
                        {task.status}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-1.5">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Bot className="w-2.5 h-2.5" />
                        {getAgentName(task.assignedAgentId)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" />
                        {task.category}
                      </span>
                      <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                      {task.completedAt && (
                        <span className="text-emerald-400">
                          Completed {new Date(task.completedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(task.status === "pending" || task.status === "in-progress") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => executeTask(task.id)}
                        disabled={executingTaskId === task.id}
                        className="h-7 text-[10px] text-cyan-400 hover:text-cyan-300"
                      >
                        {executingTaskId === task.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3 mr-1" />
                        )}
                        Execute
                      </Button>
                    )}
                    {task.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStatusChange(task.id, "in-progress")}
                        className="h-7 text-[10px] text-blue-400 hover:text-blue-300"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Start
                      </Button>
                    )}
                    {(task.status === "pending" || task.status === "in-progress") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleComplete(task.id)}
                        className="h-7 text-[10px] text-emerald-400 hover:text-emerald-300"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Complete
                      </Button>
                    )}
                  </div>
                </div>
                {executionResult && executionResult.taskId === task.id && (
                  <div className="mt-3 space-y-2">
                    {executionResult.steps.map((step: any, i: number) => (
                      <div key={i} className={cn(
                        "flex items-start gap-2 px-3 py-2 rounded-lg text-xs border",
                        step.type === "thinking" ? "bg-blue-500/10 border-blue-500/20 text-blue-300" :
                        step.type === "tool" ? "bg-purple-500/10 border-purple-500/20 text-purple-300" :
                        step.type === "execution" ? "bg-white/5 border-white/10 text-white" :
                        step.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-300" :
                        "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                      )}>
                        <span className="font-mono text-[10px] text-muted-foreground mt-0.5">#{step.step}</span>
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] uppercase font-medium">{step.type}</span>
                        <p className="flex-1 whitespace-pre-wrap">{step.content}</p>
                      </div>
                    ))}
                  </div>
                )}
                {task.result && !executionResult?.taskId && (
                  <div className="mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    <p className="text-xs text-emerald-400">{task.result}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MessagesView({ agents, onBack }: { agents: any[]; onBack: () => void }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateForm, setDelegateForm] = useState({ fromAgent: "", toAgent: "", title: "", description: "" });
  const [delegating, setDelegating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [delegationChain, setDelegationChain] = useState<any>(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch("/api/agents/messages/all");
      if (res.ok) setMessages(await res.json());
    } catch {}
    setLoading(false);
  };

  const fetchDelegationChain = async (taskId: number) => {
    try {
      const res = await fetch(`/api/agents/delegation-chain/${taskId}`);
      if (res.ok) {
        const data = await res.json();
        setDelegationChain(data);
        setSelectedTask(taskId);
      }
    } catch {}
  };

  const handleDelegate = async () => {
    if (!delegateForm.fromAgent || !delegateForm.toAgent || !delegateForm.title) return;
    setDelegating(true);
    try {
      const res = await fetch(`/api/agents/${delegateForm.fromAgent}/delegate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAgentId: delegateForm.toAgent,
          title: delegateForm.title,
          description: delegateForm.description,
        }),
      });
      if (res.ok) {
        setDelegateOpen(false);
        setDelegateForm({ fromAgent: "", toAgent: "", title: "", description: "" });
        fetchMessages();
      }
    } catch {}
    setDelegating(false);
  };

  useEffect(() => { fetchMessages(); }, []);

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a: any) => a.agentId === agentId);
    return agent ? `${agent.emoji || "🤖"} ${agent.name}` : agentId;
  };

  const messageTypeColors: Record<string, string> = {
    delegation: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    request: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    response: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    notification: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronRight className="w-4 h-4 rotate-180" />
          </Button>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Route className="w-5 h-5 text-purple-400" />
            Agent Communication Hub
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchMessages}>
            <Activity className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => setDelegateOpen(!delegateOpen)}
            className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30"
            size="sm"
          >
            <Send className="w-4 h-4 mr-1.5" />
            Delegate Task
          </Button>
        </div>
      </div>

      {delegateOpen && (
        <div className="glass-panel rounded-xl border border-purple-500/20 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-purple-400">New Delegation</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">From Agent</label>
              <select
                value={delegateForm.fromAgent}
                onChange={e => setDelegateForm(f => ({ ...f, fromAgent: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm"
              >
                <option value="">Select source agent...</option>
                {agents.map((a: any) => (
                  <option key={a.agentId} value={a.agentId}>{a.emoji} {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To Agent</label>
              <select
                value={delegateForm.toAgent}
                onChange={e => setDelegateForm(f => ({ ...f, toAgent: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm"
              >
                <option value="">Select target agent...</option>
                {agents.filter((a: any) => a.agentId !== delegateForm.fromAgent).map((a: any) => (
                  <option key={a.agentId} value={a.agentId}>{a.emoji} {a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <Input
            placeholder="Task title"
            value={delegateForm.title}
            onChange={e => setDelegateForm(f => ({ ...f, title: e.target.value }))}
            className="bg-black/40 border-white/10"
          />
          <Input
            placeholder="Description (optional)"
            value={delegateForm.description}
            onChange={e => setDelegateForm(f => ({ ...f, description: e.target.value }))}
            className="bg-black/40 border-white/10"
          />
          <div className="flex gap-2">
            <Button onClick={handleDelegate} disabled={delegating} className="bg-purple-600 hover:bg-purple-700" size="sm">
              {delegating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
              Delegate
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDelegateOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {selectedTask && delegationChain && (
        <div className="glass-panel rounded-xl border border-cyan-500/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
              <Route className="w-4 h-4" /> Delegation Chain — Task #{selectedTask}
            </h4>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedTask(null); setDelegationChain(null); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {delegationChain.chain.map((task: any, i: number) => (
              <div key={task.id} className="flex items-center gap-2">
                <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 min-w-[120px]">
                  <div className="text-xs font-medium text-white">{task.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {getAgentName(task.assignedAgentId)} • {task.status}
                  </div>
                </div>
                {i < delegationChain.chain.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-cyan-400 shrink-0" />
                )}
              </div>
            ))}
          </div>
          {delegationChain.subtasks.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Subtasks:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {delegationChain.subtasks.map((st: any) => (
                  <div key={st.id} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-xs font-medium text-white">{st.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {getAgentName(st.assignedAgentId)} • {st.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : messages.length === 0 ? (
        <div className="glass-panel rounded-xl border border-white/5 p-12 text-center">
          <Route className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-1">No Agent Messages Yet</h3>
          <p className="text-sm text-muted-foreground">
            Use the "Delegate Task" button to have agents communicate and delegate work to each other.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg: any) => (
            <div key={msg.id} className="glass-panel rounded-xl border border-white/5 p-4 hover:bg-white/[0.02] transition">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="font-medium text-white">{getAgentName(msg.fromAgentId)}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium text-white">{getAgentName(msg.toAgentId)}</span>
                  </div>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium border", messageTypeColors[msg.messageType] || "text-gray-400 bg-gray-500/10 border-gray-500/20")}>
                    {msg.messageType}
                  </span>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium border",
                    msg.status === "responded" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                    msg.status === "pending" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                    "text-gray-400 bg-gray-500/10 border-gray-500/20"
                  )}>
                    {msg.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {msg.taskId && (
                    <button
                      onClick={() => fetchDelegationChain(msg.taskId)}
                      className="text-[10px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition"
                    >
                      View Chain
                    </button>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              {msg.subject && <div className="text-sm font-medium text-white mt-2">{msg.subject}</div>}
              <p className="text-xs text-muted-foreground mt-1">{msg.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
