import { useState, useEffect, useCallback } from "react";
import {
  Wand2, Play, Trash2, Loader2, Plus, Download, RefreshCw,
  ThumbsUp, ThumbsDown, BookOpen, Target, Trophy, Brain,
  Sparkles, ArrowRight, CheckCircle2, XCircle, BarChart3,
  Zap, Bot, Layers, Eye, ChevronRight, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(text);
  }
  if (res.status === 204) return null;
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    running: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    completed: "bg-green-500/20 text-green-400 border-green-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs border", colors[status] || "bg-white/10 text-white/60 border-white/20")}>
      {status}
    </span>
  );
}

export function FineTuningPipelineTab() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", baseModel: "llama3.2:latest", outputModel: "", systemPrompt: "", datasetFilter: "" });
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api("/training-pipeline/fine-tuning/jobs");
      setJobs(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleCreate = async () => {
    if (!form.name || !form.baseModel || !form.outputModel) return;
    setCreating(true);
    try {
      await api("/training-pipeline/fine-tuning/create", { method: "POST", body: JSON.stringify(form) });
      setShowCreate(false);
      setForm({ name: "", baseModel: "llama3.2:latest", outputModel: "", systemPrompt: "", datasetFilter: "" });
      fetchJobs();
    } catch {}
    setCreating(false);
  };

  const handleRun = async (id: number) => {
    setRunningId(id);
    try {
      await api(`/training-pipeline/fine-tuning/${id}/run`, { method: "POST" });
      fetchJobs();
    } catch {}
    setRunningId(null);
  };

  const handleDelete = async (id: number) => {
    await api(`/training-pipeline/fine-tuning/${id}`, { method: "DELETE" });
    fetchJobs();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" /> Fine-Tuning Pipeline
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Create custom models using Ollama Modelfiles with your training data</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchJobs}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="w-4 h-4 mr-1" /> New Job</Button>
        </div>
      </div>

      {showCreate && (
        <div className="glass-panel rounded-xl border border-white/10 p-6 space-y-4">
          <h4 className="font-semibold text-white">Create Fine-Tuning Job</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Job Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ent-specialist-v1" className="bg-black/40 border-white/10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Base Model</label>
              <Input value={form.baseModel} onChange={(e) => setForm({ ...form, baseModel: e.target.value })} placeholder="llama3.2:latest" className="bg-black/40 border-white/10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Output Model Name</label>
              <Input value={form.outputModel} onChange={(e) => setForm({ ...form, outputModel: e.target.value })} placeholder="ent-specialist:latest" className="bg-black/40 border-white/10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Dataset Filter (category)</label>
              <Input value={form.datasetFilter} onChange={(e) => setForm({ ...form, datasetFilter: e.target.value })} placeholder="Leave empty for all data" className="bg-black/40 border-white/10" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">System Prompt</label>
            <textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} placeholder="You are an ENT medical specialist..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white h-20 resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Create Job
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Wand2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No fine-tuning jobs yet. Create one to build a custom model.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="glass-panel rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Wand2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{job.name}</p>
                    <p className="text-xs text-muted-foreground">{job.baseModel} → {job.outputModel} | {job.samplesCount} samples</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={job.status} />
                  {job.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => handleRun(job.id)} disabled={runningId === job.id}>
                      {runningId === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(job.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                </div>
              </div>
              {job.errorMessage && <p className="text-xs text-red-400 mt-2">{job.errorMessage}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RlhfFeedbackTab() {
  const [pairs, setPairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [collectResult, setCollectResult] = useState<string | null>(null);

  const fetchPairs = useCallback(async () => {
    try {
      const data = await api("/training-pipeline/rlhf/pairs");
      setPairs(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPairs(); }, [fetchPairs]);

  const handleCollect = async () => {
    setCollecting(true);
    setCollectResult(null);
    try {
      const res = await api("/training-pipeline/rlhf/collect-from-ratings", { method: "POST" });
      setCollectResult(res.message);
      fetchPairs();
    } catch (e: any) { setCollectResult(`Error: ${e.message}`); }
    setCollecting(false);
  };

  const handleGenerateContrasts = async () => {
    setGenerating(true);
    try {
      const res = await api("/training-pipeline/rlhf/generate-contrasts", { method: "POST" });
      setCollectResult(`Filled ${res.filled} of ${res.total} incomplete pairs`);
      fetchPairs();
    } catch {}
    setGenerating(false);
  };

  const handleExportDpo = async () => {
    try {
      const data = await api("/training-pipeline/rlhf/export-dpo", { method: "POST" });
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `dpo-dataset-${data.count}-pairs.json`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleDelete = async (id: number) => {
    await api(`/training-pipeline/rlhf/${id}`, { method: "DELETE" });
    fetchPairs();
  };

  const completePairs = pairs.filter((p) => !p.chosenResponse.includes("[placeholder") && !p.rejectedResponse.includes("[placeholder"));
  const incompletePairs = pairs.filter((p) => p.chosenResponse.includes("[placeholder") || p.rejectedResponse.includes("[placeholder"));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <ThumbsUp className="w-5 h-5 text-green-400" /> RLHF Feedback Loop
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Collect preference pairs from chat ratings to build DPO training datasets</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchPairs}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl border border-white/10 p-4 text-center">
          <p className="text-2xl font-bold text-white">{pairs.length}</p>
          <p className="text-xs text-muted-foreground">Total Pairs</p>
        </div>
        <div className="glass-panel rounded-xl border border-green-500/20 p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{completePairs.length}</p>
          <p className="text-xs text-muted-foreground">Complete</p>
        </div>
        <div className="glass-panel rounded-xl border border-yellow-500/20 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{incompletePairs.length}</p>
          <p className="text-xs text-muted-foreground">Need Contrasts</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={handleCollect} disabled={collecting}>
          {collecting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />} Collect from Ratings
        </Button>
        <Button size="sm" variant="outline" onClick={handleGenerateContrasts} disabled={generating || incompletePairs.length === 0}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />} Generate Contrasts
        </Button>
        <Button size="sm" variant="outline" onClick={handleExportDpo} disabled={completePairs.length === 0}>
          <Download className="w-4 h-4 mr-1" /> Export DPO Dataset
        </Button>
      </div>

      {collectResult && <p className="text-sm text-primary">{collectResult}</p>}

      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
      ) : pairs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ThumbsUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No RLHF pairs yet. Rate messages in Chat (thumbs up/down) then collect here.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {pairs.slice(0, 50).map((pair) => (
            <div key={pair.id} className="glass-panel rounded-xl border border-white/10 p-4 space-y-2">
              <div className="flex justify-between items-start">
                <p className="text-sm font-medium text-white">{pair.prompt.slice(0, 100)}...</p>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(pair.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                  <p className="text-[10px] text-green-400 mb-1 flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> Chosen</p>
                  <p className="text-xs text-white/70">{pair.chosenResponse.slice(0, 120)}...</p>
                </div>
                <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                  <p className="text-[10px] text-red-400 mb-1 flex items-center gap-1"><ThumbsDown className="w-3 h-3" /> Rejected</p>
                  <p className="text-xs text-white/70">{pair.rejectedResponse.slice(0, 120)}...</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Source: {pair.source}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DistillationTab() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", teacherModel: "llava:13b", studentModel: "llama3.2:latest", category: "general" });
  const [promptsText, setPromptsText] = useState("");
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api("/training-pipeline/distillation/jobs");
      setJobs(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleCreate = async () => {
    const prompts = promptsText.split("\n").map((p) => p.trim()).filter(Boolean);
    if (!form.name || !form.teacherModel || !form.studentModel || prompts.length === 0) return;
    setCreating(true);
    try {
      await api("/training-pipeline/distillation/create", {
        method: "POST",
        body: JSON.stringify({ ...form, prompts }),
      });
      setShowCreate(false);
      setForm({ name: "", teacherModel: "llava:13b", studentModel: "llama3.2:latest", category: "general" });
      setPromptsText("");
      fetchJobs();
    } catch {}
    setCreating(false);
  };

  const handleRun = async (id: number) => {
    const prompts = promptsText.split("\n").map((p) => p.trim()).filter(Boolean);
    if (prompts.length === 0) {
      const job = jobs.find((j) => j.id === id);
      if (!job) return;
    }
    setRunningId(id);
    try {
      await api(`/training-pipeline/distillation/${id}/run`, {
        method: "POST",
        body: JSON.stringify({ prompts: prompts.length > 0 ? prompts : ["Explain this topic in detail."] }),
      });
      fetchJobs();
    } catch {}
    setRunningId(null);
  };

  const handleDelete = async (id: number) => {
    await api(`/training-pipeline/distillation/${id}`, { method: "DELETE" });
    fetchJobs();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-400" /> Knowledge Distillation
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Use stronger models to generate training data for smaller models</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchJobs}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="w-4 h-4 mr-1" /> New Job</Button>
        </div>
      </div>

      {showCreate && (
        <div className="glass-panel rounded-xl border border-white/10 p-6 space-y-4">
          <h4 className="font-semibold text-white">Create Distillation Job</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Job Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="meditron-to-llama-ent" className="bg-black/40 border-white/10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="ent-medical" className="bg-black/40 border-white/10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Teacher Model (stronger)</label>
              <Input value={form.teacherModel} onChange={(e) => setForm({ ...form, teacherModel: e.target.value })} placeholder="meditron:7b" className="bg-black/40 border-white/10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Student Model (to train)</label>
              <Input value={form.studentModel} onChange={(e) => setForm({ ...form, studentModel: e.target.value })} placeholder="llama3.2:latest" className="bg-black/40 border-white/10" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Prompts (one per line)</label>
            <textarea value={promptsText} onChange={(e) => setPromptsText(e.target.value)} placeholder="What are the signs of acute otitis media?\nDescribe endoscopic sinus surgery techniques..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white h-32 resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Create
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No distillation jobs yet. Use a stronger model to teach a smaller one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="glass-panel rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Layers className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{job.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.teacherModel} <ArrowRight className="w-3 h-3 inline" /> {job.studentModel} | {job.pairsGenerated}/{job.promptsCount} pairs
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={job.status} />
                  {job.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => handleRun(job.id)} disabled={runningId === job.id}>
                      {runningId === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(job.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FewShotLibrariesTab() {
  const [libraries, setLibraries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "general" });
  const [selectedLib, setSelectedLib] = useState<number | null>(null);
  const [examples, setExamples] = useState<any[]>([]);
  const [exForm, setExForm] = useState({ userMessage: "", assistantResponse: "", keywords: "", priority: 5 });
  const [matchQuery, setMatchQuery] = useState("");
  const [matchResults, setMatchResults] = useState<any[] | null>(null);
  const [matching, setMatching] = useState(false);

  const fetchLibraries = useCallback(async () => {
    try {
      const data = await api("/training-pipeline/few-shot/libraries");
      setLibraries(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchLibraries(); }, [fetchLibraries]);

  const fetchExamples = async (id: number) => {
    const data = await api(`/training-pipeline/few-shot/libraries/${id}/examples`);
    setExamples(data);
  };

  const handleSelectLib = async (id: number) => {
    setSelectedLib(id === selectedLib ? null : id);
    if (id !== selectedLib) await fetchExamples(id);
  };

  const handleCreateLib = async () => {
    if (!form.name) return;
    await api("/training-pipeline/few-shot/libraries", { method: "POST", body: JSON.stringify(form) });
    setShowCreate(false);
    setForm({ name: "", description: "", category: "general" });
    fetchLibraries();
  };

  const handleDeleteLib = async (id: number) => {
    await api(`/training-pipeline/few-shot/libraries/${id}`, { method: "DELETE" });
    if (selectedLib === id) { setSelectedLib(null); setExamples([]); }
    fetchLibraries();
  };

  const handleAddExample = async () => {
    if (!selectedLib || !exForm.userMessage || !exForm.assistantResponse) return;
    await api(`/training-pipeline/few-shot/libraries/${selectedLib}/examples`, { method: "POST", body: JSON.stringify(exForm) });
    setExForm({ userMessage: "", assistantResponse: "", keywords: "", priority: 5 });
    fetchExamples(selectedLib);
    fetchLibraries();
  };

  const handleDeleteExample = async (id: number) => {
    await api(`/training-pipeline/few-shot/examples/${id}`, { method: "DELETE" });
    if (selectedLib) fetchExamples(selectedLib);
    fetchLibraries();
  };

  const handleMatch = async () => {
    if (!matchQuery.trim()) return;
    setMatching(true);
    try {
      const data = await api("/training-pipeline/few-shot/match", { method: "POST", body: JSON.stringify({ query: matchQuery }) });
      setMatchResults(data.examples);
    } catch {}
    setMatching(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" /> Few-Shot Prompt Libraries
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Curated examples auto-injected based on what users ask about</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchLibraries}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="w-4 h-4 mr-1" /> New Library</Button>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-white/10 p-4 space-y-2">
        <p className="text-xs text-muted-foreground">Test example matching</p>
        <div className="flex gap-2">
          <Input value={matchQuery} onChange={(e) => setMatchQuery(e.target.value)} placeholder="Type a query to find matching examples..."
            className="bg-black/40 border-white/10" onKeyDown={(e) => e.key === "Enter" && handleMatch()} />
          <Button size="sm" onClick={handleMatch} disabled={matching}>
            {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
          </Button>
        </div>
        {matchResults && (
          <div className="space-y-2 mt-2">
            {matchResults.length === 0 ? <p className="text-xs text-muted-foreground">No matching examples found</p> : (
              matchResults.map((ex, i) => (
                <div key={i} className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs">
                  <p className="text-blue-400">Score: {Math.round(ex.score * 100) / 100} | Library: {ex.libraryName}</p>
                  <p className="text-white/70 mt-1"><strong>Q:</strong> {ex.userMessage.slice(0, 100)}</p>
                  <p className="text-white/50"><strong>A:</strong> {ex.assistantResponse.slice(0, 100)}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="glass-panel rounded-xl border border-white/10 p-4 space-y-3">
          <h4 className="font-semibold text-white text-sm">Create Library</h4>
          <div className="grid grid-cols-3 gap-3">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Library name" className="bg-black/40 border-white/10" />
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="bg-black/40 border-white/10" />
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="bg-black/40 border-white/10" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateLib}><Plus className="w-4 h-4 mr-1" /> Create</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
      ) : libraries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No libraries yet. Create one and add examples for structured prompting.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {libraries.map((lib) => (
            <div key={lib.id} className="glass-panel rounded-xl border border-white/10">
              <div className="p-4 cursor-pointer flex items-center justify-between" onClick={() => handleSelectLib(lib.id)}>
                <div className="flex items-center gap-3">
                  {selectedLib === lib.id ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  <div>
                    <p className="font-medium text-white">{lib.name}</p>
                    <p className="text-xs text-muted-foreground">{lib.description} | {lib.examplesCount} examples | {lib.category}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteLib(lib.id); }}><Trash2 className="w-3 h-3 text-red-400" /></Button>
              </div>
              {selectedLib === lib.id && (
                <div className="border-t border-white/5 p-4 space-y-3">
                  <div className="space-y-2">
                    {examples.map((ex) => (
                      <div key={ex.id} className="p-3 rounded-lg bg-black/20 border border-white/5 flex justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/80"><strong>User:</strong> {ex.userMessage.slice(0, 100)}</p>
                          <p className="text-xs text-white/50 mt-1"><strong>Assistant:</strong> {ex.assistantResponse.slice(0, 100)}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">Keywords: {ex.keywords || "none"} | Priority: {ex.priority}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteExample(ex.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <p className="text-xs text-muted-foreground">Add Example</p>
                    <Input value={exForm.userMessage} onChange={(e) => setExForm({ ...exForm, userMessage: e.target.value })} placeholder="User question..." className="bg-black/40 border-white/10 text-sm" />
                    <textarea value={exForm.assistantResponse} onChange={(e) => setExForm({ ...exForm, assistantResponse: e.target.value })} placeholder="Ideal assistant response..."
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white h-16 resize-none" />
                    <div className="flex gap-2">
                      <Input value={exForm.keywords} onChange={(e) => setExForm({ ...exForm, keywords: e.target.value })} placeholder="Keywords (comma-separated)" className="bg-black/40 border-white/10 text-sm flex-1" />
                      <Input type="number" value={exForm.priority} onChange={(e) => setExForm({ ...exForm, priority: parseInt(e.target.value) || 5 })} className="bg-black/40 border-white/10 text-sm w-20" />
                      <Button size="sm" onClick={handleAddExample}><Plus className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EvalBenchmarkTab() {
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "general" });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [selectedBm, setSelectedBm] = useState<number | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [genTopic, setGenTopic] = useState("");
  const [genCount, setGenCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [runModel, setRunModel] = useState("llama3.2:latest");
  const [runningId, setRunningId] = useState<number | null>(null);
  const [runResults, setRunResults] = useState<any>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [bms, lb] = await Promise.all([
        api("/training-pipeline/eval/benchmarks"),
        api("/training-pipeline/eval/leaderboard"),
      ]);
      setBenchmarks(bms);
      setLeaderboard(lb);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchQuestions = async (id: number) => {
    const data = await api(`/training-pipeline/eval/benchmarks/${id}/questions`);
    setQuestions(data);
  };

  const handleSelectBm = async (id: number) => {
    setSelectedBm(id === selectedBm ? null : id);
    setRunResults(null);
    if (id !== selectedBm) await fetchQuestions(id);
  };

  const handleCreateBm = async () => {
    if (!form.name) return;
    await api("/training-pipeline/eval/benchmarks", { method: "POST", body: JSON.stringify(form) });
    setShowCreate(false);
    setForm({ name: "", description: "", category: "general" });
    fetchAll();
  };

  const handleDeleteBm = async (id: number) => {
    await api(`/training-pipeline/eval/benchmarks/${id}`, { method: "DELETE" });
    if (selectedBm === id) { setSelectedBm(null); setQuestions([]); }
    fetchAll();
  };

  const handleGenQuestions = async () => {
    if (!selectedBm || !genTopic) return;
    setGenerating(true);
    try {
      await api(`/training-pipeline/eval/benchmarks/${selectedBm}/generate-questions`, {
        method: "POST",
        body: JSON.stringify({ topic: genTopic, count: genCount }),
      });
      fetchQuestions(selectedBm);
      fetchAll();
      setGenTopic("");
    } catch {}
    setGenerating(false);
  };

  const handleRunBenchmark = async (bmId: number) => {
    setRunningId(bmId);
    setRunResults(null);
    try {
      const result = await api(`/training-pipeline/eval/benchmarks/${bmId}/run`, {
        method: "POST",
        body: JSON.stringify({ model: runModel }),
      });
      setRunResults(result);
      fetchAll();
    } catch {}
    setRunningId(null);
  };

  const handleViewResults = async (runId: number) => {
    const data = await api(`/training-pipeline/eval/runs/${runId}/results`);
    setRunResults(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" /> Evaluation & Benchmarking
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Test your models against question sets and track accuracy over time</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchAll}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="w-4 h-4 mr-1" /> New Benchmark</Button>
        </div>
      </div>

      {leaderboard.length > 0 && (
        <div className="glass-panel rounded-xl border border-yellow-500/20 p-4">
          <h4 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2"><Trophy className="w-4 h-4" /> Model Leaderboard</h4>
          <div className="space-y-2">
            {leaderboard.map((entry, i) => (
              <div key={entry.model} className="flex items-center gap-3 p-2 rounded-lg bg-black/20">
                <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  i === 0 ? "bg-yellow-500/20 text-yellow-400" : i === 1 ? "bg-gray-400/20 text-gray-300" : "bg-orange-500/20 text-orange-400"
                )}>{i + 1}</span>
                <span className="text-sm text-white flex-1 font-mono">{entry.model}</span>
                <span className="text-sm text-green-400 font-bold">{Math.round(entry.avgScore * 100)}%</span>
                <span className="text-xs text-muted-foreground">{Math.round(entry.avgLatency)}ms avg</span>
                <span className="text-xs text-muted-foreground">{entry.runs} runs</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Model to evaluate:</label>
        <Input value={runModel} onChange={(e) => setRunModel(e.target.value)} className="bg-black/40 border-white/10 w-48 text-sm" />
      </div>

      {showCreate && (
        <div className="glass-panel rounded-xl border border-white/10 p-4 space-y-3">
          <h4 className="font-semibold text-white text-sm">Create Benchmark</h4>
          <div className="grid grid-cols-3 gap-3">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Benchmark name" className="bg-black/40 border-white/10" />
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="bg-black/40 border-white/10" />
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="bg-black/40 border-white/10" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateBm}><Plus className="w-4 h-4 mr-1" /> Create</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
      ) : benchmarks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No benchmarks yet. Create one and add test questions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {benchmarks.map((bm) => (
            <div key={bm.id} className="glass-panel rounded-xl border border-white/10">
              <div className="p-4 cursor-pointer flex items-center justify-between" onClick={() => handleSelectBm(bm.id)}>
                <div className="flex items-center gap-3">
                  {selectedBm === bm.id ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  <div>
                    <p className="font-medium text-white">{bm.name}</p>
                    <p className="text-xs text-muted-foreground">{bm.description} | {bm.questionsCount} questions | {bm.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleRunBenchmark(bm.id); }} disabled={runningId === bm.id || bm.questionsCount === 0}>
                    {runningId === bm.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />} Run
                  </Button>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteBm(bm.id); }}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                </div>
              </div>
              {selectedBm === bm.id && (
                <div className="border-t border-white/5 p-4 space-y-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Generate questions about:</label>
                      <Input value={genTopic} onChange={(e) => setGenTopic(e.target.value)} placeholder="e.g. ENT anatomy, otitis media..." className="bg-black/40 border-white/10 text-sm" />
                    </div>
                    <Input type="number" value={genCount} onChange={(e) => setGenCount(parseInt(e.target.value) || 10)} className="bg-black/40 border-white/10 text-sm w-20" />
                    <Button size="sm" onClick={handleGenQuestions} disabled={generating}>
                      {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />} Generate
                    </Button>
                  </div>

                  {questions.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {questions.map((q) => (
                        <div key={q.id} className="p-2 rounded-lg bg-black/20 border border-white/5 text-xs">
                          <p className="text-white/80"><strong>Q:</strong> {q.question}</p>
                          <p className="text-white/50 mt-1"><strong>A:</strong> {q.expectedAnswer.slice(0, 150)}</p>
                          <p className="text-muted-foreground mt-0.5">{q.difficulty} | {q.category}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {bm.recentRuns?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-semibold">Recent Runs</p>
                      {bm.recentRuns.map((run: any) => (
                        <div key={run.id} className="flex items-center gap-3 p-2 rounded-lg bg-black/20 text-xs cursor-pointer hover:bg-white/5" onClick={() => handleViewResults(run.id)}>
                          <span className="font-mono text-white">{run.model}</span>
                          <StatusBadge status={run.status} />
                          {run.avgScore !== null && <span className="text-green-400 font-bold">{Math.round(run.avgScore * 100)}%</span>}
                          {run.avgLatencyMs !== null && <span className="text-muted-foreground">{Math.round(run.avgLatencyMs)}ms</span>}
                          <span className="text-muted-foreground">{run.completedQuestions}/{run.totalQuestions}</span>
                          <Eye className="w-3 h-3 text-primary ml-auto" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {runResults && (
        <div className="glass-panel rounded-xl border border-primary/20 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-primary flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Run Results</h4>
          {runResults.results ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {runResults.results.map((r: any) => (
                <div key={r.id} className="p-2 rounded-lg bg-black/20 border border-white/5 text-xs">
                  <div className="flex justify-between items-start">
                    <p className="text-white/80 flex-1"><strong>Q:</strong> {r.question}</p>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", r.score >= 0.7 ? "text-green-400" : r.score >= 0.4 ? "text-yellow-400" : "text-red-400")}>
                      {Math.round(r.score * 100)}%
                    </span>
                  </div>
                  <p className="text-white/50 mt-1"><strong>Expected:</strong> {r.expectedAnswer.slice(0, 100)}</p>
                  <p className="text-primary/60 mt-1"><strong>Model:</strong> {r.modelAnswer.slice(0, 100)}</p>
                  <p className="text-muted-foreground mt-0.5">{r.latencyMs}ms</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-green-400 font-bold text-lg">{Math.round((runResults.avgScore || 0) * 100)}% accuracy</p>
              <p className="text-xs text-muted-foreground">{runResults.model} | {runResults.completedQuestions}/{runResults.totalQuestions} questions | {runResults.avgLatencyMs}ms avg</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
