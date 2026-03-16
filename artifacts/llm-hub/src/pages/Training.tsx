import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Brain, Database, BookOpen, Wand2, Plus, Trash2, Loader2, 
  Download, Upload, Star, Play, CheckCircle2, FileText,
  Search, BarChart3, Sparkles, Rocket, ChevronRight
} from "lucide-react";
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
  useListModels,
  useListConversations,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "profiles" | "data" | "knowledge" | "finetune";

export default function Training() {
  const [activeTab, setActiveTab] = useState<Tab>("profiles");

  const tabs: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: "profiles", label: "Model Profiles", icon: <Brain className="w-4 h-4" />, desc: "Custom model configurations" },
    { id: "data", label: "Training Data", icon: <Database className="w-4 h-4" />, desc: "Collect & manage datasets" },
    { id: "knowledge", label: "Knowledge Base", icon: <BookOpen className="w-4 h-4" />, desc: "RAG document store" },
    { id: "finetune", label: "Fine-tuning", icon: <Wand2 className="w-4 h-4" />, desc: "Train your models" },
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            {activeTab === "finetune" && <FineTuningTab />}
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
        const blob = new Blob([data as string], { type: "application/jsonl" });
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

function KnowledgeBaseTab() {
  const queryClient = useQueryClient();
  const { data: documents = [], isLoading } = useListDocuments();
  const { data: ragStats } = useGetRagStats();
  const createDoc = useCreateDocument();
  const deleteDoc = useDeleteDocument();
  const searchDocs = useSearchDocuments();

  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: "", content: "", category: "general" });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const handleUpload = () => {
    createDoc.mutate({ data: uploadForm }, {
      onSuccess: () => {
        setShowUpload(false);
        setUploadForm({ title: "", content: "", category: "general" });
        queryClient.invalidateQueries({ queryKey: ["/api/rag/documents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/rag/stats"] });
      }
    });
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
        <Button onClick={() => setShowUpload(!showUpload)} className="gap-2">
          <Upload className="w-4 h-4" /> Add Document
        </Button>
      </div>

      {ragStats && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Documents" value={ragStats.totalDocuments} icon={<FileText className="w-4 h-4" />} />
          <StatCard label="Chunks" value={ragStats.totalChunks} icon={<Database className="w-4 h-4" />} />
          <StatCard label="Categories" value={Object.keys(ragStats.byCategory).length} icon={<BarChart3 className="w-4 h-4" />} />
        </div>
      )}

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

      {showUpload && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
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
            <Button variant="outline" onClick={() => setShowUpload(false)} className="border-white/10">Cancel</Button>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : documents.length === 0 ? (
        <div className="bg-card/30 border border-white/5 rounded-2xl p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">No documents yet. Add content to build your knowledge base.</p>
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
                onClick={() => deleteDoc.mutate({ id: doc.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rag/documents"] }); queryClient.invalidateQueries({ queryKey: ["/api/rag/stats"] }); } })}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-all shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
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
