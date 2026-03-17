import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vpsDatabaseConfigTable, chatMessagesTable, conversationsTable } from "@workspace/db/schema";
import { eq, desc, asc, isNotNull, sql } from "drizzle-orm";

const router: IRouter = Router();

interface BenchmarkResult {
  id: string;
  model: string;
  timestamp: string;
  scores: {
    category: string;
    question: string;
    score: number;
    responseTime: number;
    response: string;
  }[];
  averageScore: number;
  averageResponseTime: number;
}

interface ModelUpdateCheck {
  model: string;
  currentDigest: string;
  latestAvailable: boolean;
  checkedAt: string;
}

let benchmarkHistory: BenchmarkResult[] = [];
let updateChecks: ModelUpdateCheck[] = [];
let syntheticDataLog: Array<{ timestamp: string; model: string; category: string; pairsGenerated: number; provider: string }> = [];
let feedbackLog: Array<{ timestamp: string; highRated: number; lowRated: number; improvementAreas: string[] }> = [];
let evolutionSchedulerRunning = false;
let evolutionInterval: ReturnType<typeof setInterval> | null = null;
let lastEvolutionRun: string | null = null;

const BENCHMARK_QUESTIONS: Array<{ category: string; question: string; expectedTopics: string[] }> = [
  { category: "reasoning", question: "A farmer has 17 sheep. All but 9 die. How many sheep are left?", expectedTopics: ["9", "nine"] },
  { category: "reasoning", question: "If it takes 5 machines 5 minutes to make 5 widgets, how long does it take 100 machines to make 100 widgets?", expectedTopics: ["5 minutes", "five minutes"] },
  { category: "coding", question: "Write a Python function to check if a string is a palindrome. Include error handling.", expectedTopics: ["def", "reverse", "return", "lower"] },
  { category: "coding", question: "Explain the difference between a stack and a queue with examples.", expectedTopics: ["LIFO", "FIFO", "push", "pop", "enqueue", "dequeue"] },
  { category: "medical", question: "What are the key findings on a Type B tympanogram and what conditions does it suggest?", expectedTopics: ["flat", "middle ear", "effusion", "compliance", "otitis"] },
  { category: "medical", question: "Describe the Weber and Rinne test interpretation for sensorineural hearing loss.", expectedTopics: ["lateralize", "bone conduction", "air conduction", "negative"] },
  { category: "general", question: "Explain quantum computing in simple terms that a high school student would understand.", expectedTopics: ["qubit", "superposition", "classical", "computer"] },
  { category: "general", question: "What are the main causes of inflation and how do central banks typically respond?", expectedTopics: ["demand", "supply", "interest rate", "monetary"] },
  { category: "analysis", question: "A company's revenue grew 20% year-over-year but profit margins declined from 15% to 10%. What might explain this and what would you recommend?", expectedTopics: ["cost", "expense", "margin", "growth", "efficiency"] },
  { category: "analysis", question: "Compare the advantages and disadvantages of microservices vs monolithic architecture.", expectedTopics: ["scale", "deploy", "complexity", "latency", "maintain"] },
];

async function getOllamaUrl(): Promise<string> {
  try {
    const { llmConfigTable } = await import("@workspace/db/schema");
    const [config] = await db.select().from(llmConfigTable).limit(1);
    if (config?.serverUrl) return config.serverUrl;
  } catch {}
  return "http://72.60.167.64:11434";
}

async function getVpsClient() {
  const [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);
  if (!config?.password || !config?.host) return null;
  const connectionString = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}${config.sslEnabled ? "?sslmode=require" : ""}`;
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  return client;
}

async function scoreResponse(response: string, expectedTopics: string[]): Promise<number> {
  const lower = response.toLowerCase();
  let score = 0;
  const topicHits = expectedTopics.filter(t => lower.includes(t.toLowerCase())).length;
  score += (topicHits / expectedTopics.length) * 40;
  const wordCount = response.split(/\s+/).length;
  if (wordCount > 20 && wordCount < 1000) score += 20;
  else if (wordCount >= 10) score += 10;
  if (response.includes("\n") || response.includes("1.") || response.includes("- ")) score += 10;
  if (wordCount > 50) score += 10;
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 5);
  if (sentences.length >= 3) score += 10;
  if (!lower.includes("i don't know") && !lower.includes("i cannot") && !lower.includes("i'm not sure")) score += 10;
  return Math.min(100, Math.round(score));
}

router.post("/model-evolution/benchmark", async (req, res): Promise<void> => {
  const { model, categories } = req.body || {};
  if (!model) {
    res.status(400).json({ error: "model is required" });
    return;
  }

  const ollamaUrl = await getOllamaUrl();
  const filterCategories = categories ? (categories as string[]) : null;
  const questions = filterCategories
    ? BENCHMARK_QUESTIONS.filter(q => filterCategories.includes(q.category))
    : BENCHMARK_QUESTIONS;

  const result: BenchmarkResult = {
    id: `bench-${Date.now()}`,
    model,
    timestamp: new Date().toISOString(),
    scores: [],
    averageScore: 0,
    averageResponseTime: 0,
  };

  for (const q of questions) {
    try {
      const start = Date.now();
      const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: q.question }],
          stream: false,
          options: { temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!ollamaRes.ok) {
        result.scores.push({ category: q.category, question: q.question, score: 0, responseTime: Date.now() - start, response: "Error: model unavailable" });
        continue;
      }

      const data = await ollamaRes.json() as { message?: { content?: string } };
      const response = data.message?.content ?? "";
      const responseTime = Date.now() - start;
      const score = await scoreResponse(response, q.expectedTopics);

      result.scores.push({ category: q.category, question: q.question, score, responseTime, response: response.slice(0, 500) });
    } catch (err: any) {
      result.scores.push({ category: q.category, question: q.question, score: 0, responseTime: 0, response: `Error: ${err?.message}` });
    }
  }

  result.averageScore = Math.round(result.scores.reduce((s, r) => s + r.score, 0) / result.scores.length);
  result.averageResponseTime = Math.round(result.scores.reduce((s, r) => s + r.responseTime, 0) / result.scores.length);
  benchmarkHistory.unshift(result);
  if (benchmarkHistory.length > 50) benchmarkHistory = benchmarkHistory.slice(0, 50);

  let vpsClient: any = null;
  try {
    vpsClient = await getVpsClient();
    if (vpsClient) {
      await vpsClient.query(
        `CREATE TABLE IF NOT EXISTS model_benchmarks (
          id SERIAL PRIMARY KEY,
          benchmark_id TEXT NOT NULL,
          model TEXT NOT NULL,
          average_score REAL NOT NULL,
          average_response_time REAL NOT NULL,
          scores JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )`
      );
      await vpsClient.query(
        `INSERT INTO model_benchmarks (benchmark_id, model, average_score, average_response_time, scores)
         VALUES ($1, $2, $3, $4, $5)`,
        [result.id, model, result.averageScore, result.averageResponseTime, JSON.stringify(result.scores)]
      );
    }
  } catch {} finally {
    if (vpsClient) try { await vpsClient.end(); } catch {}
  }

  res.json(result);
});

router.get("/model-evolution/benchmark-history", async (req, res): Promise<void> => {
  const model = req.query.model as string | undefined;
  let vpsClient: any = null;
  try {
    vpsClient = await getVpsClient();
    if (vpsClient) {
      const query = model
        ? { text: "SELECT * FROM model_benchmarks WHERE model = $1 ORDER BY created_at DESC LIMIT 20", values: [model] }
        : { text: "SELECT * FROM model_benchmarks ORDER BY created_at DESC LIMIT 50", values: [] };
      const result = await vpsClient.query(query);
      res.json(result.rows);
      return;
    }
  } catch {} finally {
    if (vpsClient) try { await vpsClient.end(); } catch {}
  }
  const filtered = model ? benchmarkHistory.filter(b => b.model === model) : benchmarkHistory;
  res.json(filtered);
});

router.post("/model-evolution/check-updates", async (_req, res): Promise<void> => {
  const ollamaUrl = await getOllamaUrl();
  const checks: ModelUpdateCheck[] = [];

  try {
    const tagsRes = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!tagsRes.ok) throw new Error("Ollama unavailable");
    const tagsData = await tagsRes.json() as { models?: Array<{ name: string; digest: string; details?: any }> };

    for (const model of (tagsData.models || [])) {
      try {
        const showRes = await fetch(`${ollamaUrl}/api/show`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: model.name }),
          signal: AbortSignal.timeout(10000),
        });
        const showData = await showRes.json() as { digest?: string };

        checks.push({
          model: model.name,
          currentDigest: (showData.digest || model.digest || "").slice(0, 12),
          latestAvailable: true,
          checkedAt: new Date().toISOString(),
        });
      } catch {
        checks.push({
          model: model.name,
          currentDigest: (model.digest || "").slice(0, 12),
          latestAvailable: false,
          checkedAt: new Date().toISOString(),
        });
      }
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to check updates" });
    return;
  }

  updateChecks = checks;
  res.json({ models: checks, checkedAt: new Date().toISOString() });
});

router.post("/model-evolution/pull-update", async (req, res): Promise<void> => {
  const { model } = req.body || {};
  if (!model) {
    res.status(400).json({ error: "model is required" });
    return;
  }

  const ollamaUrl = await getOllamaUrl();
  try {
    const pullRes = await fetch(`${ollamaUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: false }),
      signal: AbortSignal.timeout(600000),
    });

    if (!pullRes.ok) throw new Error(`Pull failed: ${pullRes.status}`);
    const data = await pullRes.json();
    res.json({ success: true, model, status: (data as any).status || "success" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Pull failed" });
  }
});

router.post("/model-evolution/generate-synthetic", async (req, res): Promise<void> => {
  const { category = "general", count = 10, provider = "openai", targetModel } = req.body || {};

  const topics: Record<string, string[]> = {
    general: ["current events analysis", "scientific concepts", "historical parallels", "ethical dilemmas", "creative writing"],
    medical: ["audiogram interpretation", "differential diagnosis", "treatment protocols", "surgical decision-making", "patient communication"],
    coding: ["algorithm design", "system architecture", "debugging strategies", "code review", "performance optimization"],
    finance: ["market analysis", "risk assessment", "portfolio strategy", "regulatory compliance", "valuation methods"],
    reasoning: ["logical puzzles", "mathematical word problems", "causal reasoning", "analogical thinking", "probabilistic thinking"],
  };

  const categoryTopics = topics[category] || topics.general;
  const pairs: Array<{ instruction: string; response: string; category: string; quality: number }> = [];

  try {
    let baseUrl: string;
    let apiKey: string;
    let modelName: string;

    if (provider === "anthropic") {
      baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "";
      apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "";
      modelName = "claude-sonnet-4-6";
    } else {
      baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "";
      apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
      modelName = "gpt-5.2";
    }

    if (!baseUrl || !apiKey) {
      res.status(500).json({ error: `${provider} AI integration not configured` });
      return;
    }

    for (let i = 0; i < Math.min(count, 20); i++) {
      const topic = categoryTopics[i % categoryTopics.length];
      const prompt = `Generate a high-quality training example for a ${category} AI assistant. 
Topic area: ${topic}
${targetModel ? `Target model: ${targetModel}` : ""}

Create a realistic, detailed question that a professional would ask, and provide an expert-level response.

Return ONLY valid JSON with this exact format:
{"instruction": "the question", "response": "the detailed answer", "difficulty": "intermediate or advanced"}`;

      try {
        if (provider === "anthropic") {
          const anthropicRes = await fetch(`${baseUrl}/v1/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: modelName,
              max_tokens: 2000,
              messages: [{ role: "user", content: prompt }],
            }),
            signal: AbortSignal.timeout(60000),
          });

          if (!anthropicRes.ok) continue;
          const data = await anthropicRes.json() as { content?: Array<{ text?: string }> };
          const text = data.content?.[0]?.text ?? "";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) continue;
          const parsed = JSON.parse(jsonMatch[0]);
          pairs.push({ instruction: parsed.instruction, response: parsed.response, category, quality: 5 });
        } else {
          const openaiRes = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: modelName,
              messages: [{ role: "user", content: prompt }],
              max_completion_tokens: 2000,
            }),
            signal: AbortSignal.timeout(60000),
          });

          if (!openaiRes.ok) continue;
          const data = await openaiRes.json() as { choices?: Array<{ message?: { content?: string } }> };
          const text = data.choices?.[0]?.message?.content ?? "";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) continue;
          const parsed = JSON.parse(jsonMatch[0]);
          pairs.push({ instruction: parsed.instruction, response: parsed.response, category, quality: 5 });
        }
      } catch {}
    }

    let vpsClient: any = null;
    try {
      vpsClient = await getVpsClient();
      if (vpsClient) {
        for (const pair of pairs) {
          await vpsClient.query(
            `INSERT INTO training_sources (source_type, source_id, title, sender, content, content_preview, metadata, status, quality)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (source_type, source_id) DO NOTHING`,
            [
              "synthetic",
              `synth-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              `[Synthetic] ${pair.instruction.slice(0, 80)}`,
              provider,
              JSON.stringify(pair),
              pair.instruction.slice(0, 500),
              JSON.stringify({ category, provider, generatedAt: new Date().toISOString(), targetModel }),
              "reviewed",
              pair.quality,
            ]
          );
        }
      }
    } catch {} finally {
      if (vpsClient) try { await vpsClient.end(); } catch {}
    }

    syntheticDataLog.unshift({ timestamp: new Date().toISOString(), model: targetModel || "all", category, pairsGenerated: pairs.length, provider });
    if (syntheticDataLog.length > 50) syntheticDataLog = syntheticDataLog.slice(0, 50);

    res.json({ success: true, pairsGenerated: pairs.length, category, provider, pairs });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Synthetic data generation failed" });
  }
});

router.post("/model-evolution/harvest-feedback", async (_req, res): Promise<void> => {
  try {
    const ratedMessages = await db
      .select({
        messageId: chatMessagesTable.id,
        conversationId: chatMessagesTable.conversationId,
        role: chatMessagesTable.role,
        content: chatMessagesTable.content,
        rating: chatMessagesTable.rating,
        createdAt: chatMessagesTable.createdAt,
      })
      .from(chatMessagesTable)
      .where(isNotNull(chatMessagesTable.rating))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(200);

    const highRated: Array<{ instruction: string; response: string; model: string; rating: number }> = [];
    const lowRated: Array<{ instruction: string; response: string; model: string; rating: number; improvementNeeded: string }> = [];

    for (const msg of ratedMessages) {
      if (msg.role !== "assistant" || msg.rating === null) continue;

      const prevMessages = await db
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.conversationId, msg.conversationId))
        .orderBy(asc(chatMessagesTable.createdAt));

      const msgIndex = prevMessages.findIndex(m => m.id === msg.messageId);
      if (msgIndex <= 0) continue;

      const userMsg = prevMessages[msgIndex - 1];
      if (userMsg.role !== "user") continue;

      const conv = await db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, msg.conversationId))
        .limit(1);

      const model = conv[0]?.model || "unknown";

      if (msg.rating >= 4) {
        highRated.push({
          instruction: userMsg.content,
          response: msg.content,
          model,
          rating: msg.rating,
        });
      } else if (msg.rating <= 2) {
        const topics = userMsg.content.toLowerCase();
        let area = "general";
        if (topics.includes("code") || topics.includes("program") || topics.includes("function")) area = "coding";
        else if (topics.includes("medical") || topics.includes("patient") || topics.includes("diagnosis")) area = "medical";
        else if (topics.includes("math") || topics.includes("calculate") || topics.includes("logic")) area = "reasoning";

        lowRated.push({
          instruction: userMsg.content,
          response: msg.content,
          model,
          rating: msg.rating,
          improvementNeeded: area,
        });
      }
    }

    let vpsClient: any = null;
    try {
      vpsClient = await getVpsClient();
      if (vpsClient) {
        for (const pair of highRated) {
          await vpsClient.query(
            `INSERT INTO training_sources (source_type, source_id, title, sender, content, content_preview, metadata, status, quality)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (source_type, source_id) DO NOTHING`,
            [
              "feedback",
              `feedback-high-${pair.model}-${Buffer.from(pair.instruction.slice(0, 100)).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40)}`,
              `[High Rating] ${pair.instruction.slice(0, 80)}`,
              pair.model,
              JSON.stringify({ instruction: pair.instruction, response: pair.response }),
              pair.instruction.slice(0, 500),
              JSON.stringify({ rating: pair.rating, model: pair.model, type: "positive", harvestedAt: new Date().toISOString() }),
              "reviewed",
              5,
            ]
          );
        }

        for (const pair of lowRated) {
          await vpsClient.query(
            `INSERT INTO training_sources (source_type, source_id, title, sender, content, content_preview, metadata, status, quality)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (source_type, source_id) DO NOTHING`,
            [
              "feedback",
              `feedback-low-${pair.model}-${Buffer.from(pair.instruction.slice(0, 100)).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40)}`,
              `[Needs Improvement] ${pair.instruction.slice(0, 80)}`,
              pair.model,
              JSON.stringify({ instruction: pair.instruction, response: pair.response, improvementNeeded: pair.improvementNeeded }),
              pair.instruction.slice(0, 500),
              JSON.stringify({ rating: pair.rating, model: pair.model, type: "negative", area: pair.improvementNeeded, harvestedAt: new Date().toISOString() }),
              "needs_improvement",
              pair.rating,
            ]
          );
        }
      }
    } catch {} finally {
      if (vpsClient) try { await vpsClient.end(); } catch {}
    }

    const improvementAreas = [...new Set(lowRated.map(l => l.improvementNeeded))];
    feedbackLog.unshift({ timestamp: new Date().toISOString(), highRated: highRated.length, lowRated: lowRated.length, improvementAreas });
    if (feedbackLog.length > 50) feedbackLog = feedbackLog.slice(0, 50);

    res.json({
      success: true,
      highRated: highRated.length,
      lowRated: lowRated.length,
      improvementAreas,
      total: highRated.length + lowRated.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Feedback harvesting failed" });
  }
});

router.get("/model-evolution/status", async (_req, res): Promise<void> => {
  let vpsStats: any = {};
  let vpsClient: any = null;
  try {
    vpsClient = await getVpsClient();
    if (vpsClient) {
      const synthCount = await vpsClient.query(
        "SELECT count(*) as c FROM training_sources WHERE source_type = 'synthetic'"
      ).catch(() => ({ rows: [{ c: 0 }] }));

      const feedbackCount = await vpsClient.query(
        "SELECT count(*) as c FROM training_sources WHERE source_type = 'feedback'"
      ).catch(() => ({ rows: [{ c: 0 }] }));

      const benchCount = await vpsClient.query(
        "SELECT count(*) as c FROM model_benchmarks"
      ).catch(() => ({ rows: [{ c: 0 }] }));

      const recentBench = await vpsClient.query(
        "SELECT model, average_score, created_at FROM model_benchmarks ORDER BY created_at DESC LIMIT 10"
      ).catch(() => ({ rows: [] }));

      vpsStats = {
        syntheticPairs: parseInt(synthCount.rows[0]?.c ?? "0"),
        feedbackPairs: parseInt(feedbackCount.rows[0]?.c ?? "0"),
        totalBenchmarks: parseInt(benchCount.rows[0]?.c ?? "0"),
        recentBenchmarks: recentBench.rows,
      };
    }
  } catch {} finally {
    if (vpsClient) try { await vpsClient.end(); } catch {}
  }

  res.json({
    schedulerRunning: evolutionSchedulerRunning,
    lastRun: lastEvolutionRun,
    benchmarkHistory: benchmarkHistory.slice(0, 10).map(b => ({
      id: b.id,
      model: b.model,
      timestamp: b.timestamp,
      averageScore: b.averageScore,
      averageResponseTime: b.averageResponseTime,
    })),
    syntheticDataLog: syntheticDataLog.slice(0, 10),
    feedbackLog: feedbackLog.slice(0, 10),
    updateChecks,
    vpsStats,
  });
});

router.post("/model-evolution/start-scheduler", async (req, res): Promise<void> => {
  if (evolutionSchedulerRunning) {
    res.json({ success: true, message: "Already running" });
    return;
  }

  const rawHours = parseInt(req.body?.intervalHours);
  const intervalHours = (!rawHours || rawHours < 1 || rawHours > 168) ? 6 : rawHours;
  evolutionSchedulerRunning = true;

  async function runEvolutionCycle() {
    lastEvolutionRun = new Date().toISOString();
    console.log("[model-evolution] Starting evolution cycle");

    try {
      const ollamaUrl = await getOllamaUrl();
      const tagsRes = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
      if (tagsRes.ok) {
        const tags = await tagsRes.json() as { models?: Array<{ name: string }> };
        const models = (tags.models || []).map(m => m.name);

        if (models.length > 0) {
          const testModel = models[0];
          console.log(`[model-evolution] Benchmarking ${testModel}`);

          const benchResult: BenchmarkResult = {
            id: `auto-bench-${Date.now()}`,
            model: testModel,
            timestamp: new Date().toISOString(),
            scores: [],
            averageScore: 0,
            averageResponseTime: 0,
          };

          const sampleQuestions = BENCHMARK_QUESTIONS.slice(0, 4);
          for (const q of sampleQuestions) {
            try {
              const start = Date.now();
              const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: testModel, messages: [{ role: "user", content: q.question }], stream: false, options: { temperature: 0.3 } }),
                signal: AbortSignal.timeout(120000),
              });
              if (!ollamaRes.ok) continue;
              const data = await ollamaRes.json() as { message?: { content?: string } };
              const response = data.message?.content ?? "";
              const score = await scoreResponse(response, q.expectedTopics);
              benchResult.scores.push({ category: q.category, question: q.question, score, responseTime: Date.now() - start, response: response.slice(0, 300) });
            } catch {}
          }

          if (benchResult.scores.length > 0) {
            benchResult.averageScore = Math.round(benchResult.scores.reduce((s, r) => s + r.score, 0) / benchResult.scores.length);
            benchResult.averageResponseTime = Math.round(benchResult.scores.reduce((s, r) => s + r.responseTime, 0) / benchResult.scores.length);
            benchmarkHistory.unshift(benchResult);
            if (benchmarkHistory.length > 50) benchmarkHistory = benchmarkHistory.slice(0, 50);

            let vpsClient: any = null;
            try {
              vpsClient = await getVpsClient();
              if (vpsClient) {
                await vpsClient.query(
                  `INSERT INTO model_benchmarks (benchmark_id, model, average_score, average_response_time, scores) VALUES ($1, $2, $3, $4, $5)`,
                  [benchResult.id, testModel, benchResult.averageScore, benchResult.averageResponseTime, JSON.stringify(benchResult.scores)]
                );
              }
            } catch {} finally {
              if (vpsClient) try { await vpsClient.end(); } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.error("[model-evolution] Evolution cycle error:", err);
    }

    console.log("[model-evolution] Evolution cycle complete");
  }

  if (evolutionInterval) clearInterval(evolutionInterval);
  evolutionInterval = setInterval(() => {
    runEvolutionCycle().catch(console.error);
  }, intervalHours * 60 * 60 * 1000);

  runEvolutionCycle().catch(console.error);

  res.json({ success: true, message: `Evolution scheduler started. Running every ${intervalHours} hours.`, intervalHours });
});

router.post("/model-evolution/stop-scheduler", async (_req, res): Promise<void> => {
  evolutionSchedulerRunning = false;
  if (evolutionInterval) {
    clearInterval(evolutionInterval);
    evolutionInterval = null;
  }
  res.json({ success: true, message: "Evolution scheduler stopped" });
});

export default router;
