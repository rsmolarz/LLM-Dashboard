import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Stethoscope,
  Upload,
  Loader2,
  CheckCircle2,
  BookOpen,
  Sparkles,
  Brain,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

const CATEGORY_LABELS: Record<string, string> = {
  "ent-audiometry": "Audiometry & Hearing",
  "ent-endoscopy": "Endoscopy & Scopes",
  "ent-otoscopy": "Otoscopy & Ear Exam",
  "ent-vestibular": "Vestibular & Balance",
  "ent-procedures": "Surgical Procedures",
  "ent-pediatric": "Pediatric ENT",
  "ent-oncology": "Head & Neck Oncology",
};

export default function EntTrainingPanel() {
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [genCategory, setGenCategory] = useState("");
  const [genCount, setGenCount] = useState(10);
  const [generatedPairs, setGeneratedPairs] = useState<any>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const { data: knowledge, refetch } = useQuery({
    queryKey: ["/api/ent-training/knowledge"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/ent-training/knowledge`);
      return res.json();
    },
  });

  const ingestAll = useCallback(async () => {
    setIngesting(true);
    setIngestResult(null);
    try {
      const res = await fetch(`${API_BASE}/ent-training/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setIngestResult(data);
      refetch();
    } catch (err: any) {
      setIngestResult({ error: err?.message });
    } finally {
      setIngesting(false);
    }
  }, [refetch]);

  const ingestTopic = useCallback(async (title: string) => {
    setIngesting(true);
    try {
      const res = await fetch(`${API_BASE}/ent-training/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics: [title] }),
      });
      await res.json();
      refetch();
    } catch {} finally {
      setIngesting(false);
    }
  }, [refetch]);

  const generatePairs = useCallback(async () => {
    setGenerating(true);
    setGeneratedPairs(null);
    setGenError(null);
    try {
      const res = await fetch(`${API_BASE}/ent-training/generate-pairs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: genCategory || undefined,
          count: genCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setGeneratedPairs(data);
    } catch (err: any) {
      setGenError(err?.message ?? "Unknown error");
    } finally {
      setGenerating(false);
    }
  }, [genCategory, genCount]);

  const topics = knowledge?.topics || [];
  const loaded = topics.filter((t: any) => t.alreadyLoaded).length;
  const total = topics.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-cyan-400" />
            ENT Training Pipeline
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Load otolaryngology knowledge into RAG and generate fine-tuning data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {loaded}/{total} topics loaded
          </span>
          <Button
            onClick={ingestAll}
            disabled={ingesting || loaded === total}
            size="sm"
            className="gap-2"
          >
            {ingesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : loaded === total ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {loaded === total ? "All Loaded" : "Load All ENT Knowledge"}
          </Button>
        </div>
      </div>

      {ingestResult && !ingestResult.error && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-sm">
          <div className="flex items-center gap-2 text-green-400 font-medium mb-1">
            <CheckCircle2 className="w-4 h-4" />
            Ingestion Complete
          </div>
          <p className="text-green-300/80 text-xs">
            {ingestResult.ingested} topics ingested, {ingestResult.totalChunks} chunks created,{" "}
            {ingestResult.skipped} skipped (already loaded)
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {topics.map((topic: any) => (
          <div
            key={topic.title}
            className={cn(
              "p-4 rounded-xl border transition-all",
              topic.alreadyLoaded
                ? "border-green-500/20 bg-green-500/5"
                : "border-white/10 bg-white/5"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-white truncate">
                  {topic.title}
                </span>
              </div>
              {topic.alreadyLoaded ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
              ) : (
                <button
                  onClick={() => ingestTopic(topic.title)}
                  disabled={ingesting}
                  className="text-[10px] px-2 py-1 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-all shrink-0"
                >
                  Load
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">
                {CATEGORY_LABELS[topic.category] || topic.category}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {(topic.contentLength / 1000).toFixed(1)}k chars
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-yellow-400" />
          <h4 className="text-sm font-semibold text-white">Generate Fine-Tuning Q&A Pairs</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Uses the Meditron medical model to generate clinically relevant question-answer pairs from loaded ENT knowledge.
          These can be exported for fine-tuning.
        </p>

        <div className="flex items-center gap-3">
          <select
            value={genCategory}
            onChange={(e) => setGenCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none"
          >
            <option value="">All ENT categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <select
            value={genCount}
            onChange={(e) => setGenCount(Number(e.target.value))}
            className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none"
          >
            <option value={5}>5 pairs</option>
            <option value={10}>10 pairs</option>
            <option value={20}>20 pairs</option>
            <option value={30}>30 pairs</option>
            <option value={50}>50 pairs</option>
          </select>

          <Button
            onClick={generatePairs}
            disabled={generating || loaded === 0}
            size="sm"
            className="gap-2"
            variant="glow"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Brain className="w-3.5 h-3.5" />
            )}
            {generating ? "Generating..." : "Generate Pairs"}
          </Button>
        </div>

        {loaded === 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <AlertCircle className="w-3.5 h-3.5" />
            Load ENT knowledge first before generating training pairs.
          </div>
        )}

        {genError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {genError}
          </div>
        )}

        {generatedPairs?.pairs?.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-green-400 font-medium">
                {generatedPairs.pairs.length} Q&A pairs generated via {generatedPairs.model}
              </p>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {generatedPairs.pairs.map((pair: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-black/40 border border-white/5">
                  <p className="text-xs font-medium text-cyan-300 mb-1">
                    Q: {pair.instruction}
                  </p>
                  <p className="text-xs text-gray-300 line-clamp-3">
                    A: {pair.output}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
