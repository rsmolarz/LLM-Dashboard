import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Plus, Trash2, Loader2, Settings, MessageSquare, Activity,
  Play, Square, Edit2, Copy, Download, Wifi, WifiOff, Search,
  BarChart3, ChevronRight, X, Send, Terminal, Users, Zap, Shield,
  Code, Mail, Globe, FileText, Clock
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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type View = "fleet" | "create" | "detail" | "settings" | "setup";

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

export default function Agents() {
  const [view, setView] = useState<View>("fleet");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const queryClient = useQueryClient();
  const { data: agents = [], isLoading } = useListAgents();
  const { data: stats } = useGetOpenclawStats();
  const { data: gatewayStatus } = useGetGatewayStatus({ query: { refetchInterval: 15000 } });

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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Total Agents", value: stats.totalAgents, icon: Users, color: "text-blue-400" },
              { label: "Active", value: stats.activeAgents, icon: Zap, color: "text-emerald-400" },
              { label: "Idle", value: stats.idleAgents, icon: Clock, color: "text-amber-400" },
              { label: "Messages", value: stats.totalMessages, icon: MessageSquare, color: "text-purple-400" },
              { label: "Tasks Done", value: stats.totalTasksCompleted, icon: Activity, color: "text-cyan-400" },
            ].map((stat) => (
              <div key={stat.label} className="glass-panel rounded-xl border border-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <stat.icon className={cn("w-4 h-4", stat.color)} />
                  <span className="text-2xl font-bold text-white">{stat.value}</span>
                </div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
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

  const handleSubmit = async () => {
    if (!form.agentId || !form.name) return;
    await createAgent.mutateAsync({ data: form });
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
  const [detailTab, setDetailTab] = useState<"chat" | "logs" | "config">("chat");

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

    try {
      const res = await chatMutation.mutateAsync({
        agentId,
        data: { message: msg },
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
        {(["chat", "logs", "config"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setDetailTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-all border-b-2 -mb-[1px]",
              detailTab === tab
                ? "text-primary border-primary"
                : "text-muted-foreground border-transparent hover:text-white"
            )}
          >
            {tab === "chat" ? "Chat" : tab === "logs" ? "Activity Log" : "Configuration"}
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
              placeholder="ws://72.60.167.64:18789"
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
