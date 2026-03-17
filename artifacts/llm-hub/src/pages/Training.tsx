import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Brain, Database, BookOpen, Wand2, Plus, Trash2, Loader2, 
  Download, Upload, Star, Play, CheckCircle2, FileText,
  Search, BarChart3, Sparkles, Rocket, ChevronRight, Globe,
  Link, Package, AlertCircle, ExternalLink, Layers, Bot,
  Zap, Eye, XCircle, RefreshCw, ThumbsUp, ThumbsDown,
  Stethoscope, Shield
} from "lucide-react";
import ContextScanner from "@/components/ContextScanner";
import VpsTrainingDashboard from "@/components/VpsTrainingDashboard";
import BackupPanel from "@/components/BackupPanel";
import EntTrainingPanel from "@/components/EntTrainingPanel";
import ModelEvolutionPanel from "@/components/ModelEvolutionPanel";
import {
  useListModelProfiles,
  useCreateModelProfile,
  useUpdateModelProfile,
  useDeleteModelProfile,
  useDeployModelProfile,
  useListTrainingData,
  useAddTrainingData,
  useDeleteTrainingData,
  useExportTrainingData,
  useGetTrainingStats,
  useCollectFromConversation,
  useListDocuments,
  useCreateDocument,
  useDeleteDocument,
  useSearchDocuments,
  useGetRagStats,
  useFetchUrl,
  useBulkImportDocuments,
  useListDiscoveredSources,
  useRunDiscovery,
  useUpdateDiscoveredSource,
  useDeleteDiscoveredSource,
  useGetDiscoveryStats,
  useListModels,
  useListConversations,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "profiles" | "data" | "knowledge" | "finetune" | "vps-training" | "ent-training" | "backup" | "evolution";

export default function Training() {
  const [activeTab, setActiveTab] = useState<Tab>("profiles");

  const tabs: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: "profiles", label: "Model Profiles", icon: <Brain className="w-4 h-4" />, desc: "Custom model configurations" },
    { id: "data", label: "Training Data", icon: <Database className="w-4 h-4" />, desc: "Collect & manage datasets" },
    { id: "knowledge", label: "Knowledge Base", icon: <BookOpen className="w-4 h-4" />, desc: "RAG document store" },
    { id: "ent-training", label: "ENT Training", icon: <Stethoscope className="w-4 h-4" />, desc: "Otolaryngology AI training" },
    { id: "vps-training", label: "VPS Training", icon: <Layers className="w-4 h-4" />, desc: "Remote training data" },
    { id: "finetune", label: "Fine-tuning", icon: <Wand2 className="w-4 h-4" />, desc: "Train your models" },
    { id: "backup", label: "Backup", icon: <Shield className="w-4 h-4" />, desc: "System backup & recovery" },
    { id: "evolution", label: "Model Evolution", icon: <Rocket className="w-4 h-4" />, desc: "Continuous LLM improvement" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Training & Customization</h2>
          <p className="text-muted-foreground max-w-2xl">
            Build custom model profiles, collect training data from conversations, manage your knowledge base for RAG, and fine-tune models.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-start p-4 rounded-xl border transition-all duration-200 text-left",
                activeTab === tab.id
                  ? "bg-primary/10 border-primary/30 shadow-lg shadow-primary/5"
                  : "bg-card/50 border-white/10 hover:bg-white/5"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center mb-2",
                activeTab === tab.id ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
              )}>
                {tab.icon}
              </div>
              <p className={cn("text-sm font-medium", activeTab === tab.id ? "text-white" : "text-muted-foreground")}>{tab.label}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{tab.desc}</p>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "profiles" && <ModelProfilesTab />}
            {activeTab === "data" && <TrainingDataTab />}
            {activeTab === "knowledge" && <KnowledgeBaseTab />}
            {activeTab === "vps-training" && <VpsTrainingDashboard />}
            {activeTab === "ent-training" && <EntTrainingPanel />}
            {activeTab === "finetune" && <FineTuningTab />}
            {activeTab === "backup" && <BackupPanel />}
            {activeTab === "evolution" && <ModelEvolutionPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ModelProfilesTab() {
  const queryClient = useQueryClient();
  const { data: profiles = [], isLoading } = useListModelProfiles();
  const { data: models = [] } = useListModels();
  const createProfile = useCreateModelProfile();
  const deleteProfile = useDeleteModelProfile();
  const deployProfile = useDeployModelProfile();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    baseModel: "llama3.2:latest",
    systemPrompt: "",
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    contextLength: 4096,
    repeatPenalty: 1.1,
  });

  const handleCreate = () => {
    createProfile.mutate({ data: form }, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ name: "", baseModel: "llama3.2:latest", systemPrompt: "", temperature: 0.7, topP: 0.9, topK: 40, contextLength: 4096, repeatPenalty: 1.1 });
        queryClient.invalidateQueries({ queryKey: ["/api/model-profiles"] });
      }
    });
  };

  const handleDeploy = (id: number) => {
    deployProfile.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/model-profiles"] });
        queryClient.invalidateQueries({ queryKey: ["/api/llm/models"] });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Model Profiles</h3>
          <p className="text-sm text-muted-foreground">Create custom model configurations with system prompts and deploy them to Ollama</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="w-4 h-4" /> New Profile
        </Button>
      </div>

      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="bg-card/50 border border-white/10 rounded-2xl p-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Profile Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Code Assistant" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Base Model</label>
              <select
                value={form.baseModel}
                onChange={(e) => setForm({ ...form, baseModel: e.target.value })}
                className="w-full bg-[#18181B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                {models.length > 0 ? models.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                )) : <option value="llama3.2:latest">llama3.2:latest</option>}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">System Prompt</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="You are a helpful coding assistant..."
              className="w-full bg-[#18181B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-h-[100px] resize-y"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Temperature</label>
              <Input type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0.7 })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Top P</label>
              <Input type="number" step="0.1" min="0" max="1" value={form.topP} onChange={(e) => setForm({ ...form, topP: parseFloat(e.target.value) || 0.9 })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Top K</label>
              <Input type="number" min="1" value={form.topK} onChange={(e) => setForm({ ...form, topK: parseInt(e.target.value) || 40 })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Context Length</label>
              <Input type="number" min="512" value={form.contextLength} onChange={(e) => setForm({ ...form, contextLength: parseInt(e.target.value) || 4096 })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Repeat Penalty</label>
              <Input type="number" step="0.1" min="1" max="2" value={form.repeatPenalty} onChange={(e) => setForm({ ...form, repeatPenalty: parseFloat(e.target.value) || 1.1 })} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleCreate} disabled={!form.name.trim() || createProfile.isPending}>
              {createProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Profile"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="border-white/10">Cancel</Button>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : profiles.length === 0 ? (
        <div className="bg-card/30 border border-white/5 rounded-2xl p-12 text-center">
          <Brain className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">No profiles yet. Create one to customize model behavior.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="bg-card/50 border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-white">{profile.name}</h4>
                  <p className="text-xs text-muted-foreground">Base: {profile.baseModel}</p>
                </div>
                <div className="flex items-center gap-1">
                  {profile.deployed === "true" && (
                    <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">Deployed</span>
                  )}
                </div>
              </div>

              {profile.systemPrompt && (
                <div className="bg-black/30 rounded-lg p-3 mb-3 max-h-20 overflow-hidden">
                  <p className="text-xs text-muted-foreground line-clamp-3">{profile.systemPrompt}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground mb-4">
                <span className="bg-white/5 px-2 py-1 rounded">temp: {profile.temperature}</span>
                <span className="bg-white/5 px-2 py-1 rounded">topP: {profile.topP}</span>
                <span className="bg-white/5 px-2 py-1 rounded">topK: {profile.topK}</span>
                <span className="bg-white/5 px-2 py-1 rounded">ctx: {profile.contextLength}</span>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleDeploy(profile.id)}
                  disabled={deployProfile.isPending}
                  className="gap-1 text-xs flex-1"
                >
                  {deployProfile.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                  Deploy to Ollama
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteProfile.mutate({ id: profile.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/model-profiles"] }) })}
                  className="border-white/10 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingDataTab() {
  const queryClient = useQueryClient();
  const { data: entries = [], isLoading } = useListTrainingData();
  const { data: stats } = useGetTrainingStats();
  const { data: conversations = [] } = useListConversations();
  const addEntry = useAddTrainingData();
  const deleteEntry = useDeleteTrainingData();
  const exportData = useExportTrainingData();
  const collectData = useCollectFromConversation();

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ inputText: "", outputText: "", systemPrompt: "", category: "general", quality: 4 });
  const [collectConvId, setCollectConvId] = useState<number | null>(null);

  const handleAdd = () => {
    addEntry.mutate({ data: addForm }, {
      onSuccess: () => {
        setShowAddForm(false);
        setAddForm({ inputText: "", outputText: "", systemPrompt: "", category: "general", quality: 4 });
        queryClient.invalidateQueries({ queryKey: ["/api/training/data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/training/stats"] });
      }
    });
  };

  const handleCollect = (convId: number) => {
    collectData.mutate({ data: { conversationId: convId, minRating: 0 } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/training/data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/training/stats"] });
      }
    });
  };

  const handleExport = (format: string) => {
    exportData.mutate({ data: { format, minQuality: 0 } }, {
      onSuccess: (data) => {
        const blob = new Blob([data as unknown as string], { type: "application/jsonl" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `training-data-${format}.jsonl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Training Data</h3>
          <p className="text-sm text-muted-foreground">Collect, rate, and export training pairs for fine-tuning</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddForm(!showAddForm)} className="gap-2 border-white/10">
            <Plus className="w-4 h-4" /> Add Manually
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Entries" value={stats.totalEntries} icon={<Database className="w-4 h-4" />} />
          <StatCard label="Avg Quality" value={stats.avgQuality.toFixed(1)} icon={<Star className="w-4 h-4" />} />
          <StatCard label="Categories" value={Object.keys(stats.byCategory).length} icon={<BarChart3 className="w-4 h-4" />} />
          <StatCard label="High Quality (4+)" value={Object.entries(stats.byQuality).filter(([k]) => parseInt(k) >= 4).reduce((sum, [, v]) => sum + v, 0)} icon={<CheckCircle2 className="w-4 h-4" />} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-4">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" /> Collect from Conversations
          </h4>
          <p className="text-xs text-muted-foreground">Extract user/assistant pairs from your chat history</p>
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">No conversations yet. Chat first to generate data.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {conversations.map((conv) => (
                <div key={conv.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <div className="overflow-hidden">
                    <p className="text-sm text-white truncate">{conv.title}</p>
                    <p className="text-[10px] text-muted-foreground">{conv.model}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCollect(conv.id)}
                    disabled={collectData.isPending}
                    className="text-xs border-white/10 shrink-0"
                  >
                    {collectData.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Collect"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-4">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-400" /> Export Dataset
          </h4>
          <p className="text-xs text-muted-foreground">Export your training data in standard formats for fine-tuning</p>
          <div className="space-y-2">
            {[
              { format: "openai", label: "OpenAI Format", desc: "ChatML JSONL format" },
              { format: "alpaca", label: "Alpaca Format", desc: "instruction/input/output" },
              { format: "sharegpt", label: "ShareGPT Format", desc: "For Axolotl/Unsloth" },
            ].map((f) => (
              <button
                key={f.format}
                onClick={() => handleExport(f.format)}
                disabled={!entries.length}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-left disabled:opacity-40"
              >
                <div>
                  <p className="text-sm text-white">{f.label}</p>
                  <p className="text-[10px] text-muted-foreground">{f.desc}</p>
                </div>
                <Download className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="bg-card/50 border border-white/10 rounded-2xl p-6 space-y-4"
        >
          <h4 className="font-semibold text-white">Add Training Pair</h4>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">System Prompt (optional)</label>
            <Input value={addForm.systemPrompt} onChange={(e) => setAddForm({ ...addForm, systemPrompt: e.target.value })} placeholder="You are a helpful assistant..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">User Input</label>
              <textarea
                value={addForm.inputText}
                onChange={(e) => setAddForm({ ...addForm, inputText: e.target.value })}
                placeholder="What is machine learning?"
                className="w-full bg-[#18181B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-h-[80px] resize-y"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Expected Output</label>
              <textarea
                value={addForm.outputText}
                onChange={(e) => setAddForm({ ...addForm, outputText: e.target.value })}
                placeholder="Machine learning is a subset of AI..."
                className="w-full bg-[#18181B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-h-[80px] resize-y"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Category</label>
              <Input value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Quality (1-5)</label>
              <Input type="number" min="1" max="5" value={addForm.quality} onChange={(e) => setAddForm({ ...addForm, quality: parseInt(e.target.value) || 3 })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={!addForm.inputText.trim() || !addForm.outputText.trim() || addEntry.isPending}>
              {addEntry.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Entry"}
            </Button>
            <Button variant="outline" onClick={() => setShowAddForm(false)} className="border-white/10">Cancel</Button>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : entries.length === 0 ? (
        <div className="bg-card/30 border border-white/5 rounded-2xl p-12 text-center">
          <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">No training data yet. Collect from conversations or add manually.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Recent Entries ({entries.length})</h4>
          {entries.slice(-20).reverse().map((entry) => (
            <div key={entry.id} className="bg-card/50 border border-white/10 rounded-xl p-4 group hover:border-white/20 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">{entry.category}</span>
                    <span className="text-[10px] bg-white/5 text-muted-foreground px-2 py-0.5 rounded">{entry.source}</span>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn("w-2.5 h-2.5", i < entry.quality ? "text-yellow-400 fill-yellow-400" : "text-gray-600")} />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-blue-400 mb-1 truncate"><span className="text-muted-foreground">User:</span> {entry.inputText}</p>
                  <p className="text-xs text-green-400 truncate"><span className="text-muted-foreground">Assistant:</span> {entry.outputText}</p>
                </div>
                <button
                  onClick={() => deleteEntry.mutate({ id: entry.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/training/data"] }); queryClient.invalidateQueries({ queryKey: ["/api/training/stats"] }); } })}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-all shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EXAMPLE_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "market-data", label: "Market Data" },
  { id: "medical", label: "Medical / ENT" },
  { id: "hedge-fund", label: "Hedge Funds" },
  { id: "alt-data", label: "Alternative Data" },
  { id: "influencer", label: "Influencer" },
  { id: "research", label: "Research" },
  { id: "code", label: "Code & Dev" },
  { id: "security", label: "Security" },
  { id: "business", label: "Business" },
];

const EXAMPLE_KNOWLEDGE_BASES = [
  { title: "SEC EDGAR Filings", url: "https://www.sec.gov/edgar/searchedgar/companysearch", category: "market-data", description: "10-K, 10-Q, S-1 filings, insider trades — detect valuation mispricing" },
  { title: "FinancialModelingPrep API", url: "https://site.financialmodelingprep.com/developer/docs", category: "market-data", description: "Financial statements, earnings transcripts, analyst estimates, insider trading" },
  { title: "Alpha Vantage", url: "https://www.alphavantage.co/documentation/", category: "market-data", description: "Macro indicators, FX, commodities, equities data API" },
  { title: "FRED - Federal Reserve Data", url: "https://fred.stlouisfed.org/docs/api/fred/", category: "market-data", description: "Inflation, unemployment, rates, GDP, liquidity indicators — critical for macro agents" },
  { title: "Reddit WallStreetBets Dataset", url: "https://huggingface.co/datasets/lewtun/reddit_wallstreetbets", category: "market-data", description: "Retail sentiment, meme stock detection, narrative shifts" },
  { title: "Financial PhraseBank", url: "https://huggingface.co/datasets/financial_phrasebank", category: "market-data", description: "Sentiment-labeled financial text for NLP training" },
  { title: "ClinicalTrials.gov", url: "https://clinicaltrials.gov/data-api/about-api", category: "market-data", description: "Track new drugs, surgical innovations, biotech startups" },

  { title: "PubMed - Otolaryngology", url: "https://pubmed.ncbi.nlm.nih.gov/?term=otolaryngology", category: "medical", description: "ENT clinical studies, treatment outcomes, surgical techniques" },
  { title: "PubMed Central (Full-Text)", url: "https://www.ncbi.nlm.nih.gov/pmc/tools/openftlist/", category: "medical", description: "Full-text medical articles — surgical techniques, case studies, imaging" },
  { title: "AAO-HNS Clinical Guidelines", url: "https://www.entnet.org/quality-practice/quality-products/clinical-practice-guidelines/", category: "medical", description: "Sinusitis, tonsillectomy, otitis media, Bell's palsy guidelines" },
  { title: "NICE Clinical Guidelines", url: "https://www.nice.org.uk/guidance", category: "medical", description: "Head & neck cancer, sleep apnea, hearing loss decision frameworks" },
  { title: "UMLS - Medical Ontology", url: "https://www.nlm.nih.gov/research/umls/", category: "medical", description: "Disease relationships, drug interactions, symptoms — clinical decision engine" },
  { title: "Olfactory Receptor Database", url: "https://senselab.med.yale.edu/ordb/", category: "medical", description: "Anosmia research, COVID smell loss, neurodegenerative detection" },
  { title: "Saarbruecken Voice Database", url: "https://stimmdb.coli.uni-saarland.de/", category: "medical", description: "Vocal cord pathology, dysphonia samples — voice disorder detection" },
  { title: "Cancer Imaging Archive", url: "https://www.cancerimagingarchive.net/", category: "medical", description: "Head & neck CT/MRI datasets, annotated imaging for ENT AI" },
  { title: "PubMed - Biomedical Literature", url: "https://pubmed.ncbi.nlm.nih.gov/", category: "medical", description: "Biomedical research — biotech investments, emerging therapies" },

  { title: "Preqin - Fund Intelligence", url: "https://www.preqin.com/", category: "hedge-fund", description: "Hedge fund performance, investor allocations, LP/family office tracking" },
  { title: "Hedge Fund Research (HFR)", url: "https://www.hedgefundresearch.com/", category: "hedge-fund", description: "5,600+ hedge funds, performance data, macro strategy benchmarking" },
  { title: "Eurekahedge", url: "https://www.eurekahedge.com/", category: "hedge-fund", description: "Hedge fund indices, macro strategies, fund flows — strong in Asia" },
  { title: "BarclayHedge", url: "https://www.barclayhedge.com/", category: "hedge-fund", description: "CTAs and systematic trading fund data" },
  { title: "With Intelligence", url: "https://www.withintelligence.com/", category: "hedge-fund", description: "Fund manager data, allocators, institutional relationships" },

  { title: "Exabel - Alt Data Platform", url: "https://www.exabel.com/", category: "alt-data", description: "Aggregates alternative datasets into usable trading signals" },
  { title: "ExtractAlpha", url: "https://extractalpha.com/", category: "alt-data", description: "Marketplace for hedge-fund alternative data signals" },
  { title: "ImportYeti - Supply Chain", url: "https://www.importyeti.com/", category: "alt-data", description: "Supply chain/shipping data — detect disruptions, production changes" },

  { title: "HypeAuditor", url: "https://hypeauditor.com/", category: "influencer", description: "Influencer authenticity, fake followers, engagement rates, demographics" },
  { title: "Upfluence", url: "https://www.upfluence.com/", category: "influencer", description: "Enterprise influencer CRM — discovery, outreach, affiliate tracking" },
  { title: "Modash", url: "https://www.modash.io/", category: "influencer", description: "250M+ creators, audience analytics, contact info" },
  { title: "Collabstr", url: "https://collabstr.com/", category: "influencer", description: "Creator marketplace for influencer partnerships" },
  { title: "Influencers.club API", url: "https://influencers.club/", category: "influencer", description: "340M+ social profiles across dozens of platforms" },

  { title: "HuggingFace Datasets", url: "https://huggingface.co/datasets", category: "research", description: "The #1 go-to — thousands of curated ML datasets" },
  { title: "HuggingFace Transformers", url: "https://huggingface.co/docs/transformers/index", category: "research", description: "NLP model library documentation" },
  { title: "arXiv Research Papers", url: "https://arxiv.org/", category: "research", description: "Cutting-edge AI, biotech, materials science research" },
  { title: "Semantic Scholar API", url: "https://api.semanticscholar.org/", category: "research", description: "Largest research corpus — cross-disciplinary search" },
  { title: "The Pile (EleutherAI)", url: "https://pile.eleuther.ai/", category: "research", description: "825GB diverse text dataset used by GPT/LLaMA" },
  { title: "Common Crawl", url: "https://commoncrawl.org/", category: "research", description: "Massive web crawl data — the foundation of modern LLMs" },
  { title: "LangChain Documentation", url: "https://python.langchain.com/docs/get_started/introduction", category: "research", description: "LLM application framework docs" },

  { title: "Python Official Docs", url: "https://docs.python.org/3/tutorial/index.html", category: "code", description: "Python 3 tutorial — great for code agents" },
  { title: "MDN JavaScript Guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", category: "code", description: "JavaScript fundamentals from Mozilla" },
  { title: "React Documentation", url: "https://react.dev/learn", category: "code", description: "Official React learning docs" },
  { title: "OpenAI API Reference", url: "https://platform.openai.com/docs/api-reference", category: "code", description: "OpenAI API docs for AI integration agents" },
  { title: "Kubernetes Docs", url: "https://kubernetes.io/docs/concepts/overview/", category: "code", description: "Container orchestration concepts" },
  { title: "PostgreSQL Documentation", url: "https://www.postgresql.org/docs/current/tutorial.html", category: "code", description: "PostgreSQL database tutorial" },
  { title: "Unstructured.io", url: "https://docs.unstructured.io/", category: "code", description: "Parse PDFs, docs, HTML — essential data processing tool" },

  { title: "OWASP Top 10", url: "https://owasp.org/www-project-top-ten/", category: "security", description: "Top 10 web application security risks" },

  { title: "AWS Well-Architected", url: "https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html", category: "business", description: "Cloud architecture best practices" },
  { title: "Stripe API Reference", url: "https://stripe.com/docs/api", category: "business", description: "Payment processing API docs" },
  { title: "Google Web Fundamentals", url: "https://developers.google.com/web/fundamentals", category: "business", description: "Web performance, accessibility, and best practices" },
];

function KnowledgeBaseTab() {
  const queryClient = useQueryClient();
  const { data: documents = [], isLoading } = useListDocuments();
  const { data: ragStats } = useGetRagStats();
  const createDoc = useCreateDocument();
  const deleteDoc = useDeleteDocument();
  const searchDocs = useSearchDocuments();
  const fetchUrl = useFetchUrl();
  const bulkImport = useBulkImportDocuments();

  const [activePanel, setActivePanel] = useState<"none" | "upload" | "url" | "bulk" | "examples">("none");
  const [exampleFilter, setExampleFilter] = useState("all");
  const [uploadForm, setUploadForm] = useState({ title: "", content: "", category: "general" });
  const [urlForm, setUrlForm] = useState({ url: "", category: "general" });
  const [fetchedContent, setFetchedContent] = useState<any>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkCategory, setBulkCategory] = useState("general");
  const [importResult, setImportResult] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const invalidateRag = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rag/documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rag/stats"] });
  };

  const handleUpload = () => {
    createDoc.mutate({ data: uploadForm }, {
      onSuccess: () => {
        setActivePanel("none");
        setUploadForm({ title: "", content: "", category: "general" });
        invalidateRag();
      }
    });
  };

  const handleFetchUrl = () => {
    if (!urlForm.url.trim()) return;
    setFetchedContent(null);
    fetchUrl.mutate({ data: { url: urlForm.url } }, {
      onSuccess: (data: any) => {
        setFetchedContent(data);
      }
    });
  };

  const handleSaveFetched = () => {
    if (!fetchedContent) return;
    createDoc.mutate({
      data: {
        title: fetchedContent.title,
        content: fetchedContent.content,
        category: urlForm.category,
      }
    }, {
      onSuccess: () => {
        setFetchedContent(null);
        setUrlForm({ url: "", category: "general" });
        setActivePanel("none");
        invalidateRag();
      }
    });
  };

  const handleBulkImport = () => {
    const lines = bulkText.split("\n").filter((l: string) => l.trim());
    const docs: Array<{ title: string; content: string; category: string }> = [];

    let currentTitle = "";
    let currentContent = "";

    for (const line of lines) {
      if (line.startsWith("## ") || line.startsWith("# ")) {
        if (currentTitle && currentContent.trim()) {
          docs.push({ title: currentTitle, content: currentContent.trim(), category: bulkCategory });
        }
        currentTitle = line.replace(/^#+\s*/, "").trim();
        currentContent = "";
      } else if (line.startsWith("---") && currentTitle) {
        if (currentContent.trim()) {
          docs.push({ title: currentTitle, content: currentContent.trim(), category: bulkCategory });
        }
        currentTitle = "";
        currentContent = "";
      } else {
        currentContent += line + "\n";
      }
    }

    if (currentTitle && currentContent.trim()) {
      docs.push({ title: currentTitle, content: currentContent.trim(), category: bulkCategory });
    }

    if (docs.length === 0 && bulkText.trim()) {
      docs.push({ title: "Bulk Import", content: bulkText.trim(), category: bulkCategory });
    }

    if (docs.length === 0) return;

    bulkImport.mutate({ data: { documents: docs } }, {
      onSuccess: (data: any) => {
        setImportResult(data);
        invalidateRag();
      },
      onError: () => {
        setImportResult({ total: docs.length, succeeded: 0, failed: docs.length, results: [], error: "Failed to import documents. Check that you have 50 or fewer documents." });
      }
    });
  };

  const handleImportExample = (example: typeof EXAMPLE_KNOWLEDGE_BASES[0]) => {
    setUrlForm({ url: example.url, category: example.category });
    setActivePanel("url");
    setFetchedContent(null);
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    searchDocs.mutate({ data: { query: searchQuery, maxResults: 5 } }, {
      onSuccess: (data) => {
        setSearchResults(data as any[]);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Knowledge Base (RAG)</h3>
          <p className="text-sm text-muted-foreground">Upload documents to give your models contextual knowledge</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActivePanel(activePanel === "examples" ? "none" : "examples")}
            className={cn("gap-1.5 border-white/10", activePanel === "examples" && "bg-primary/20 border-primary/30 text-primary")}
          >
            <Sparkles className="w-3.5 h-3.5" /> Examples
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActivePanel(activePanel === "url" ? "none" : "url")}
            className={cn("gap-1.5 border-white/10", activePanel === "url" && "bg-primary/20 border-primary/30 text-primary")}
          >
            <Globe className="w-3.5 h-3.5" /> From URL
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActivePanel(activePanel === "bulk" ? "none" : "bulk")}
            className={cn("gap-1.5 border-white/10", activePanel === "bulk" && "bg-primary/20 border-primary/30 text-primary")}
          >
            <Layers className="w-3.5 h-3.5" /> Bulk Import
          </Button>
          <Button onClick={() => setActivePanel(activePanel === "upload" ? "none" : "upload")} className="gap-2" size="sm">
            <Upload className="w-3.5 h-3.5" /> Add Document
          </Button>
        </div>
      </div>

      {ragStats && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Documents" value={ragStats.totalDocuments} icon={<FileText className="w-4 h-4" />} />
          <StatCard label="Chunks" value={ragStats.totalChunks} icon={<Database className="w-4 h-4" />} />
          <StatCard label="Categories" value={Object.keys(ragStats.byCategory).length} icon={<BarChart3 className="w-4 h-4" />} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {activePanel === "examples" && (
          <motion.div
            key="examples"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-4"
          >
            <div>
              <h4 className="font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> Example Knowledge Bases
                <span className="text-xs font-normal text-muted-foreground ml-1">({EXAMPLE_KNOWLEDGE_BASES.length} sources)</span>
              </h4>
              <p className="text-xs text-muted-foreground mt-1">Click any source to pre-fill the URL import form, then fetch and review before saving</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setExampleFilter(cat.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border",
                    exampleFilter === cat.id
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-black/20 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                  )}
                >
                  {cat.label}
                  <span className="ml-1 opacity-60">
                    {cat.id === "all"
                      ? EXAMPLE_KNOWLEDGE_BASES.length
                      : EXAMPLE_KNOWLEDGE_BASES.filter((e) => e.category === cat.id).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
              {EXAMPLE_KNOWLEDGE_BASES.filter((e) => exampleFilter === "all" || e.category === exampleFilter).map((example) => (
                <button
                  key={example.url}
                  onClick={() => handleImportExample(example)}
                  className="text-left bg-black/30 rounded-xl p-3.5 border border-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white group-hover:text-primary transition-colors truncate">{example.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{example.description}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                      {example.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground/60">
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span className="truncate">{example.url}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {activePanel === "url" && (
          <motion.div
            key="url"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-4"
          >
            <h4 className="font-semibold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" /> Import from URL
            </h4>
            <p className="text-xs text-muted-foreground">Fetch content from any web page. HTML will be cleaned and converted to plain text.</p>
            <div className="flex gap-2">
              <Input
                value={urlForm.url}
                onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                placeholder="https://docs.example.com/guide"
                className="flex-1 font-mono text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") handleFetchUrl(); }}
              />
              <Input
                value={urlForm.category}
                onChange={(e) => setUrlForm({ ...urlForm, category: e.target.value })}
                placeholder="Category"
                className="w-32"
              />
              <Button onClick={handleFetchUrl} disabled={fetchUrl.isPending || !urlForm.url.trim()}>
                {fetchUrl.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Link className="w-4 h-4 mr-1.5" /> Fetch</>}
              </Button>
            </div>

            {fetchUrl.isError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-400">Failed to fetch URL. Make sure the URL is accessible and try again.</p>
              </div>
            )}

            {fetchedContent && (
              <div className="space-y-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-emerald-400">{fetchedContent.title}</p>
                    <span className="text-[10px] text-muted-foreground">{(fetchedContent.contentLength / 1000).toFixed(1)}k chars</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">{fetchedContent.content.slice(0, 300)}...</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveFetched} disabled={createDoc.isPending} className="gap-1.5">
                    {createDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-3.5 h-3.5" /> Save to Knowledge Base</>}
                  </Button>
                  <Button variant="outline" onClick={() => setFetchedContent(null)} className="border-white/10">Discard</Button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activePanel === "bulk" && (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-4"
          >
            <h4 className="font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" /> Bulk Import
            </h4>
            <p className="text-xs text-muted-foreground">
              Paste multiple documents separated by markdown headers (## Title) or horizontal rules (---). Each section becomes a separate document.
            </p>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-muted-foreground">Category:</label>
              <Input
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                placeholder="general"
                className="w-32"
              />
            </div>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"## First Document Title\nContent for the first document...\n\n## Second Document Title\nContent for the second document...\n\n---\n\n## Third Document\nMore content here..."}
              className="w-full bg-[#18181B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-h-[200px] resize-y font-mono"
            />
            <div className="flex items-center gap-3">
              <Button onClick={handleBulkImport} disabled={bulkImport.isPending || !bulkText.trim()} className="gap-1.5">
                {bulkImport.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Package className="w-3.5 h-3.5" /> Import All</>}
              </Button>
              <Button variant="outline" onClick={() => { setActivePanel("none"); setBulkText(""); setImportResult(null); }} className="border-white/10">Cancel</Button>
            </div>

            {importResult && (
              <div className={cn(
                "rounded-lg p-3 border",
                (importResult.failed > 0 || importResult.error) ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"
              )}>
                <p className="text-sm font-medium text-white mb-1">
                  {importResult.error ? importResult.error : `Import Complete: ${importResult.succeeded}/${importResult.total} documents imported`}
                </p>
                <div className="space-y-1">
                  {importResult.results?.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.status === "success" ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                      )}
                      <span className={r.status === "success" ? "text-emerald-400" : "text-red-400"}>
                        {r.title} {r.status === "success" ? `(${r.chunksCount} chunks)` : `- ${r.error}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activePanel === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-card/50 border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <h4 className="font-semibold text-white">Add Document</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Title</label>
                <Input value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} placeholder="Document title" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Category</label>
                <Input value={uploadForm.category} onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })} placeholder="general" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Content</label>
              <textarea
                value={uploadForm.content}
                onChange={(e) => setUploadForm({ ...uploadForm, content: e.target.value })}
                placeholder="Paste your document content here... It will be automatically chunked for retrieval."
                className="w-full bg-[#18181B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-h-[200px] resize-y"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={!uploadForm.title.trim() || !uploadForm.content.trim() || createDoc.isPending}>
                {createDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Upload & Chunk"}
              </Button>
              <Button variant="outline" onClick={() => setActivePanel("none")} className="border-white/10">Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-3">
        <h4 className="font-semibold text-white flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" /> Search Knowledge Base
        </h4>
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your documents..."
            className="flex-1"
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          />
          <Button onClick={handleSearch} disabled={searchDocs.isPending || !searchQuery.trim()}>
            {searchDocs.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
          </Button>
        </div>
        {searchResults.length > 0 && (
          <div className="space-y-2 mt-3">
            {searchResults.map((r: any, i: number) => (
              <div key={i} className="bg-black/30 rounded-lg p-3 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-primary">{r.documentTitle}</p>
                  <span className="text-[10px] text-muted-foreground">{(r.relevance * 100).toFixed(0)}% match</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{r.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : documents.length === 0 ? (
        <div className="bg-card/30 border border-white/5 rounded-2xl p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">No documents yet. Add content to build your knowledge base.</p>
          <p className="text-xs text-muted-foreground/60 mt-2">Try the Examples button above for curated knowledge sources</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-card/50 border border-white/10 rounded-xl p-4 flex items-center justify-between group hover:border-white/20 transition-all">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">{doc.title}</p>
                  <p className="text-[10px] text-muted-foreground">{doc.chunksCount} chunks · {doc.category}</p>
                </div>
              </div>
              <button
                onClick={() => deleteDoc.mutate({ id: doc.id }, { onSuccess: () => invalidateRag() })}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-all shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <DiscoveryAgentPanel />

      <ContextScanner />
    </div>
  );
}

function DiscoveryAgentPanel() {
  const queryClient = useQueryClient();
  const { data: sources = [], isLoading } = useListDiscoveredSources();
  const { data: stats } = useGetDiscoveryStats();
  const runDiscovery = useRunDiscovery();
  const updateSource = useUpdateDiscoveredSource();
  const deleteSource = useDeleteDiscoveredSource();
  const fetchUrl = useFetchUrl();
  const createDoc = useCreateDocument();

  const [discoveryCategory, setDiscoveryCategory] = useState("all");
  const [customPrompt, setCustomPrompt] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [lastResult, setLastResult] = useState<any>(null);
  const [importingId, setImportingId] = useState<number | null>(null);

  const invalidateDiscovery = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rag/discovery/sources"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rag/discovery/stats"] });
  };

  const invalidateRag = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rag/documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rag/stats"] });
  };

  const handleRunDiscovery = () => {
    setLastResult(null);
    const body: any = {};
    if (discoveryCategory !== "all") body.category = discoveryCategory;
    if (customPrompt.trim()) body.customPrompt = customPrompt.trim();

    runDiscovery.mutate({ data: body }, {
      onSuccess: (data: any) => {
        setLastResult(data);
        invalidateDiscovery();
      },
      onError: () => {
        setLastResult({ error: true });
      }
    });
  };

  const handleApprove = (id: number) => {
    updateSource.mutate({ id, data: { status: "approved" as const } }, { onSuccess: () => invalidateDiscovery() });
  };

  const handleReject = (id: number) => {
    updateSource.mutate({ id, data: { status: "rejected" as const } }, { onSuccess: () => invalidateDiscovery() });
  };

  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async (source: any) => {
    setImportingId(source.id);
    setImportError(null);
    try {
      const fetched: any = await fetchUrl.mutateAsync({ data: { url: source.url } });

      await createDoc.mutateAsync({
        data: {
          title: source.title,
          content: fetched.content,
          category: source.category,
        }
      });

      await updateSource.mutateAsync({ id: source.id, data: { status: "imported" as const } });
      invalidateDiscovery();
      invalidateRag();
    } catch (err: any) {
      setImportError(`Failed to import "${source.title}": ${err?.message || "Could not fetch or save content"}`);
    } finally {
      setImportingId(null);
    }
  };

  const handleDelete = (id: number) => {
    deleteSource.mutate({ id }, { onSuccess: () => invalidateDiscovery() });
  };

  const filteredSources = sources.filter((s: any) =>
    statusFilter === "all" ? true : s.status === statusFilter
  );

  const statusColors: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    rejected: "bg-red-500/20 text-red-400 border-red-500/30",
    imported: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  return (
    <div className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-purple-500/20 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h4 className="font-semibold text-white flex items-center gap-2">
              Discovery Agent
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">AI-Powered</span>
            </h4>
            <p className="text-xs text-muted-foreground">Continuously finds new databases and knowledge sources using your LLM</p>
          </div>
        </div>
        {stats && (
          <div className="flex gap-3 text-xs">
            <span className="text-muted-foreground">Total: <span className="text-white font-medium">{stats.total}</span></span>
            <span className="text-amber-400">Pending: {stats.pending}</span>
            <span className="text-emerald-400">Approved: {stats.approved}</span>
            <span className="text-blue-400">Imported: {stats.imported}</span>
          </div>
        )}
      </div>

      <div className="bg-black/30 rounded-xl p-4 space-y-3 border border-white/5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-white">Run Discovery</span>
        </div>
        <div className="flex gap-2">
          <select
            value={discoveryCategory}
            onChange={(e) => setDiscoveryCategory(e.target.value)}
            className="bg-[#18181B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white w-40"
          >
            <option value="all">Random Category</option>
            {EXAMPLE_CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
          <Input
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Custom search prompt (optional)..."
            className="flex-1"
          />
          <Button
            onClick={handleRunDiscovery}
            disabled={runDiscovery.isPending}
            className="gap-1.5 bg-purple-600 hover:bg-purple-700"
          >
            {runDiscovery.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Discovering...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Discover</>
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          The agent uses your Ollama LLM to research and find relevant databases, APIs, and data sources. Results are saved for your review.
        </p>
      </div>

      {runDiscovery.isPending && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 flex items-center gap-3">
          <div className="relative">
            <Bot className="w-6 h-6 text-purple-400" />
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-medium text-purple-300">Discovery Agent is searching...</p>
            <p className="text-[10px] text-muted-foreground">This may take up to 2 minutes depending on your Ollama server speed</p>
          </div>
        </div>
      )}

      {lastResult && !lastResult.error && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <p className="text-sm font-medium text-emerald-400 mb-1">
            Found {lastResult.discovered} new sources in "{lastResult.category}"
            {lastResult.skipped > 0 && <span className="text-muted-foreground"> · {lastResult.skipped} skipped</span>}
          </p>
          {lastResult.sources?.map((s: any) => (
            <p key={s.id} className="text-xs text-muted-foreground">+ {s.title}</p>
          ))}
        </div>
      )}

      {lastResult?.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-400">Discovery failed. Make sure your Ollama server is running and accessible.</p>
        </div>
      )}

      {importError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{importError}</p>
          </div>
          <button onClick={() => setImportError(null)} className="text-red-400 hover:text-red-300 shrink-0">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {["pending", "approved", "imported", "rejected", "all"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border capitalize",
                statusFilter === status
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-black/20 border-white/10 text-muted-foreground hover:border-white/20"
              )}
            >
              {status}
              <span className="ml-1 opacity-60">
                {status === "all"
                  ? sources.length
                  : sources.filter((s: any) => s.status === status).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : filteredSources.length === 0 ? (
        <div className="bg-black/20 rounded-xl p-8 text-center border border-white/5">
          <Bot className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No {statusFilter !== "all" ? statusFilter : ""} discovered sources yet</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Click "Discover" above to find new databases</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {filteredSources.map((source: any) => (
            <div
              key={source.id}
              className="bg-black/30 rounded-xl p-4 border border-white/5 hover:border-white/15 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-white truncate">{source.title}</p>
                    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-medium border shrink-0", statusColors[source.status] || statusColors.pending)}>
                      {source.status}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                      {source.category}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{source.description}</p>
                  {source.reasoning && (
                    <p className="text-[10px] text-purple-400/70 mt-1 line-clamp-1 italic">{source.reasoning}</p>
                  )}
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50">
                    <ExternalLink className="w-2.5 h-2.5" />
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary truncate">{source.url}</a>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {source.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleApprove(source.id)}
                        className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded-md transition-all"
                        title="Approve"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleReject(source.id)}
                        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-all"
                        title="Reject"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {(source.status === "pending" || source.status === "approved") && (
                    <button
                      onClick={() => handleImport(source)}
                      disabled={importingId === source.id}
                      className="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded-md transition-all"
                      title="Fetch & Import to KB"
                    >
                      {importingId === source.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(source.id)}
                    className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-all"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FineTuningTab() {
  const { data: stats } = useGetTrainingStats();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white">Fine-tuning Pipeline</h3>
        <p className="text-sm text-muted-foreground">Train your models on custom data using LoRA/QLoRA</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StepCard
          number={1}
          title="Collect Data"
          desc="Build your training dataset from conversations and manual entries. Rate responses to filter quality."
          status={stats && stats.totalEntries > 0 ? "complete" : "pending"}
          stat={stats ? `${stats.totalEntries} entries collected` : "0 entries"}
        />
        <StepCard
          number={2}
          title="Export Dataset"
          desc="Export in Alpaca, ShareGPT, or OpenAI format. Use the Training Data tab to download JSONL files."
          status={stats && stats.totalEntries >= 50 ? "ready" : "waiting"}
          stat={stats && stats.totalEntries >= 50 ? "Ready to export" : `Need ${Math.max(0, 50 - (stats?.totalEntries ?? 0))} more entries`}
        />
        <StepCard
          number={3}
          title="Fine-tune on GPU"
          desc="Use your exported dataset with Unsloth, Axolotl, or the Hugging Face Trainer on a cloud GPU."
          status="waiting"
          stat="Requires GPU instance"
        />
      </div>

      <div className="bg-card/50 border border-white/10 rounded-2xl p-6 space-y-5">
        <h4 className="text-lg font-semibold text-white flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-purple-400" /> Fine-tuning Guide
        </h4>

        <div className="space-y-4">
          <GuideSection
            title="Option 1: Unsloth (Recommended)"
            steps={[
              "pip install unsloth",
              "Export your data in ShareGPT format from Training Data tab",
              "Use the Unsloth fine-tuning notebook on Google Colab (free T4 GPU)",
              "Upload your JSONL file and run training (~30 min for 1000 entries)",
              "Export as GGUF and import to Ollama: ollama create mymodel -f Modelfile",
            ]}
          />

          <GuideSection
            title="Option 2: Axolotl"
            steps={[
              "pip install axolotl",
              "Export your data in ShareGPT format",
              "Configure axolotl YAML for LoRA training",
              "Run: accelerate launch -m axolotl.cli.train config.yml",
              "Convert to GGUF and load into Ollama",
            ]}
          />

          <GuideSection
            title="Option 3: Cloud GPU Providers"
            steps={[
              "RunPod: $0.39/hr for RTX 4090, great for LoRA training",
              "Lambda Cloud: $1.10/hr for A10G, good for larger models",
              "Google Colab Pro: $10/month, includes T4/A100 access",
              "Vast.ai: Cheapest option, community GPUs from $0.15/hr",
            ]}
          />

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <p className="text-sm text-primary font-medium mb-2">Deploying your fine-tuned model to Ollama:</p>
            <div className="bg-black/60 rounded-lg p-3 font-mono text-xs text-green-400 space-y-1">
              <p># Create a Modelfile</p>
              <p>FROM ./your-finetuned-model.gguf</p>
              <p>SYSTEM "Your system prompt here"</p>
              <p>PARAMETER temperature 0.7</p>
              <p></p>
              <p># Build and push to Ollama</p>
              <p>ollama create my-custom-model -f Modelfile</p>
              <p></p>
              <p># Verify it works</p>
              <p>ollama run my-custom-model "Hello!"</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="bg-card/50 border border-white/10 rounded-xl p-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-primary shrink-0">{icon}</div>
      <div>
        <p className="text-lg font-bold text-white">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function StepCard({ number, title, desc, status, stat }: { number: number; title: string; desc: string; status: string; stat: string }) {
  return (
    <div className={cn(
      "bg-card/50 border rounded-2xl p-5 space-y-3",
      status === "complete" ? "border-green-500/20" : status === "ready" ? "border-primary/20" : "border-white/10"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
          status === "complete" ? "bg-green-500/20 text-green-400" :
          status === "ready" ? "bg-primary/20 text-primary" :
          "bg-white/5 text-muted-foreground"
        )}>
          {status === "complete" ? <CheckCircle2 className="w-4 h-4" /> : number}
        </div>
        <h4 className="font-semibold text-white">{title}</h4>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
      <p className={cn(
        "text-xs font-medium",
        status === "complete" ? "text-green-400" : status === "ready" ? "text-primary" : "text-muted-foreground"
      )}>{stat}</p>
    </div>
  );
}

function GuideSection({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-2">
      <h5 className="text-sm font-semibold text-white">{title}</h5>
      <ol className="space-y-1">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-primary shrink-0">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
