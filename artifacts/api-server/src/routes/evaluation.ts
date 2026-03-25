import { Router } from "express";
import { db } from "@workspace/db";
import { vpsDatabaseConfigTable } from "@workspace/db/schema";

const router = Router();

interface BenchmarkResult {
  id: string;
  model: string;
  category: string;
  prompt: string;
  response: string;
  latencyMs: number;
  tokenCount: number;
  score: number | null;
  timestamp: string;
}

const benchmarkHistory: BenchmarkResult[] = [];

const BENCHMARK_PROMPTS: Record<string, { prompt: string; maxTokens: number }[]> = {
  "general": [
    { prompt: "Explain quantum computing in simple terms.", maxTokens: 300 },
    { prompt: "Write a short poem about artificial intelligence.", maxTokens: 200 },
    { prompt: "What are the three laws of thermodynamics?", maxTokens: 300 },
  ],
  "coding": [
    { prompt: "Write a Python function that implements binary search.", maxTokens: 400 },
    { prompt: "Explain the difference between a stack and a queue with examples.", maxTokens: 300 },
    { prompt: "Write a SQL query to find the second highest salary from an employees table.", maxTokens: 200 },
  ],
  "reasoning": [
    { prompt: "If a train leaves station A at 9am going 60mph and another leaves station B (100 miles away) at 10am going 80mph toward station A, when do they meet?", maxTokens: 300 },
    { prompt: "A bat and ball cost $1.10. The bat costs $1 more than the ball. How much does the ball cost? Explain your reasoning.", maxTokens: 200 },
    { prompt: "There are 12 coins, one is counterfeit and lighter. Using a balance scale, what is the minimum weighings needed to find it?", maxTokens: 300 },
  ],
  "medical": [
    { prompt: "Describe the differential diagnosis for a patient presenting with unilateral hearing loss and tinnitus.", maxTokens: 400 },
    { prompt: "What are the key anatomical landmarks during a functional endoscopic sinus surgery (FESS)?", maxTokens: 400 },
    { prompt: "Explain the Epley maneuver and when it is indicated.", maxTokens: 300 },
  ],
  "finance": [
    { prompt: "Explain the Black-Scholes model and its key assumptions.", maxTokens: 400 },
    { prompt: "What is the difference between alpha and beta in portfolio management?", maxTokens: 300 },
    { prompt: "Describe three common quantitative trading strategies.", maxTokens: 400 },
  ],
};

async function getOllamaUrl(): Promise<string> {
  try {
    const { llmConfigTable } = await import("@workspace/db/schema");
    const [config] = await db.select().from(llmConfigTable).limit(1);
    return config?.serverUrl || process.env.VPS_OLLAMA_URL || "http://72.60.167.64:11434";
  } catch {
    return "http://72.60.167.64:11434";
  }
}

async function runPrompt(url: string, model: string, prompt: string, maxTokens: number): Promise<{ response: string; latencyMs: number; tokenCount: number }> {
  const start = Date.now();
  const res = await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { num_predict: maxTokens },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return {
    response: data.response || "",
    latencyMs: Date.now() - start,
    tokenCount: data.eval_count || data.response?.split(/\s+/).length || 0,
  };
}

router.get("/evaluation/categories", (_req, res) => {
  res.json({
    categories: Object.keys(BENCHMARK_PROMPTS),
    promptCounts: Object.fromEntries(
      Object.entries(BENCHMARK_PROMPTS).map(([k, v]) => [k, v.length])
    ),
  });
});

router.post("/evaluation/run", async (req, res): Promise<void> => {
  const { model, category = "general" } = req.body || {};
  if (!model) { res.status(400).json({ error: "model is required" }); return; }

  const prompts = BENCHMARK_PROMPTS[category];
  if (!prompts) { res.status(400).json({ error: `Unknown category: ${category}` }); return; }

  const url = await getOllamaUrl();
  const results: BenchmarkResult[] = [];

  for (const p of prompts) {
    try {
      const result = await runPrompt(url, model, p.prompt, p.maxTokens);
      const entry: BenchmarkResult = {
        id: `bench-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        model,
        category,
        prompt: p.prompt,
        response: result.response,
        latencyMs: result.latencyMs,
        tokenCount: result.tokenCount,
        score: null,
        timestamp: new Date().toISOString(),
      };
      results.push(entry);
      benchmarkHistory.push(entry);
    } catch (e: any) {
      results.push({
        id: `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        model,
        category,
        prompt: p.prompt,
        response: `Error: ${e.message}`,
        latencyMs: 0,
        tokenCount: 0,
        score: null,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (benchmarkHistory.length > 500) benchmarkHistory.splice(0, benchmarkHistory.length - 500);

  const avgLatency = results.filter(r => r.latencyMs > 0).reduce((s, r) => s + r.latencyMs, 0) / (results.filter(r => r.latencyMs > 0).length || 1);
  const avgTokens = results.filter(r => r.tokenCount > 0).reduce((s, r) => s + r.tokenCount, 0) / (results.filter(r => r.tokenCount > 0).length || 1);
  const tokensPerSec = avgLatency > 0 ? (avgTokens / (avgLatency / 1000)).toFixed(1) : "0";

  res.json({
    model,
    category,
    results,
    summary: {
      totalPrompts: prompts.length,
      completed: results.filter(r => r.latencyMs > 0).length,
      failed: results.filter(r => r.latencyMs === 0).length,
      avgLatencyMs: Math.round(avgLatency),
      avgTokens: Math.round(avgTokens),
      tokensPerSec,
    },
  });
});

router.post("/evaluation/score", (req, res) => {
  const { id, score } = req.body || {};
  if (!id || score == null) { res.status(400).json({ error: "id and score required" }); return; }
  const entry = benchmarkHistory.find(b => b.id === id);
  if (!entry) { res.status(404).json({ error: "Benchmark not found" }); return; }
  entry.score = Math.max(0, Math.min(10, Number(score)));
  res.json({ id, score: entry.score });
});

router.get("/evaluation/history", (_req, res) => {
  const grouped: Record<string, {
    model: string;
    runs: number;
    avgLatency: number;
    avgScore: number | null;
    categories: string[];
    lastRun: string;
  }> = {};

  const scoredCounts: Record<string, number> = {};
  for (const b of benchmarkHistory) {
    if (!grouped[b.model]) {
      grouped[b.model] = { model: b.model, runs: 0, avgLatency: 0, avgScore: null, categories: [], lastRun: b.timestamp };
      scoredCounts[b.model] = 0;
    }
    const g = grouped[b.model];
    g.runs++;
    g.avgLatency = ((g.avgLatency * (g.runs - 1)) + b.latencyMs) / g.runs;
    if (b.score != null) {
      const sc = scoredCounts[b.model];
      g.avgScore = sc > 0 && g.avgScore != null ? ((g.avgScore * sc) + b.score) / (sc + 1) : b.score;
      scoredCounts[b.model] = sc + 1;
    }
    if (!g.categories.includes(b.category)) g.categories.push(b.category);
    if (b.timestamp > g.lastRun) g.lastRun = b.timestamp;
  }

  res.json({
    models: Object.values(grouped),
    totalBenchmarks: benchmarkHistory.length,
    recentResults: benchmarkHistory.slice(-20).reverse(),
  });
});

export default router;
