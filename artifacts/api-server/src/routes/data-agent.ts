import { Router } from "express";
import type { IRouter, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  trainingDataSourcesTable, trainingDataJobsTable, trainingDatasetsTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { llmConfigTable } from "@workspace/db/schema";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) { next(); }

async function getServerUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  return config?.serverUrl || null;
}

async function queryOllama(serverUrl: string, model: string, prompt: string): Promise<string> {
  const resp = await fetch(`${serverUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!resp.ok) throw new Error(`Ollama returned ${resp.status}: ${await resp.text().catch(() => "unknown")}`);
  const data = await resp.json() as any;
  return data.response || "";
}

router.get("/data-agent/sources", async (_req, res): Promise<void> => {
  const rows = await db.select().from(trainingDataSourcesTable).orderBy(desc(trainingDataSourcesTable.createdAt));
  res.json(rows);
});

router.post("/data-agent/sources", requireAuth, async (req, res): Promise<void> => {
  const { name, domain, sourceType, url, config, schedule } = req.body;
  if (!name || !domain || !sourceType) {
    res.status(400).json({ error: "name, domain, and sourceType required" }); return;
  }
  const [row] = await db.insert(trainingDataSourcesTable).values({
    name, domain, sourceType, url: url || null,
    config: JSON.stringify(config || {}),
    schedule: schedule || "daily",
  }).returning();
  res.json(row);
});

router.put("/data-agent/sources/:id", requireAuth, async (req, res): Promise<void> => {
  const { name, url, config, schedule, status } = req.body;
  const updates: any = {};
  if (name) updates.name = name;
  if (url !== undefined) updates.url = url;
  if (config) updates.config = JSON.stringify(config);
  if (schedule) updates.schedule = schedule;
  if (status) updates.status = status;
  const [row] = await db.update(trainingDataSourcesTable)
    .set(updates)
    .where(eq(trainingDataSourcesTable.id, parseInt(req.params.id)))
    .returning();
  res.json(row);
});

router.delete("/data-agent/sources/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(trainingDataSourcesTable).where(eq(trainingDataSourcesTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

router.get("/data-agent/jobs", async (_req, res): Promise<void> => {
  const rows = await db.select().from(trainingDataJobsTable).orderBy(desc(trainingDataJobsTable.createdAt)).limit(100);
  res.json(rows);
});

router.post("/data-agent/jobs/run", requireAuth, async (req, res): Promise<void> => {
  const { sourceId, domain, jobType, model } = req.body;
  if (!domain || !jobType) { res.status(400).json({ error: "domain and jobType required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "qwen2.5:7b";

  const domainPrompts: Record<string, string> = {
    otolaryngology: `Generate 10 high-quality training data samples for fine-tuning an ENT medical AI model.

Each sample should be a question-answer pair covering:
- Common ENT conditions (otitis media, sinusitis, tonsillitis, hearing loss, vertigo, vocal cord disorders)
- Diagnostic approaches, treatment protocols, surgical techniques
- Patient education scenarios

Format: JSON array of {"instruction": "...", "input": "...", "output": "..."} objects.
Make responses detailed, clinically accurate, and suitable for medical AI training.`,

    social_media: `Generate 10 high-quality training data samples for fine-tuning a social media content AI model.

Each sample should be a question-answer pair covering:
- Content creation for medical professionals on social media
- Engagement optimization, hashtag strategies, content calendars
- Brand voice consistency, viral content patterns
- Platform-specific best practices (Instagram, TikTok, YouTube, LinkedIn)

Format: JSON array of {"instruction": "...", "input": "...", "output": "..."} objects.
Make responses actionable and based on real social media marketing strategies.`,

    hedge_fund: `Generate 10 high-quality training data samples for fine-tuning a financial analysis AI model.

Each sample should be a question-answer pair covering:
- Stock analysis (fundamental + technical), portfolio management
- Options strategies, risk assessment, market sentiment
- Healthcare/biotech sector focus, earnings analysis
- Trading psychology, macro economics

Format: JSON array of {"instruction": "...", "input": "...", "output": "..."} objects.
Make responses quantitative and based on real financial analysis frameworks.`,
  };

  const prompt = domainPrompts[domain] || domainPrompts.otolaryngology;

  const [job] = await db.insert(trainingDataJobsTable).values({
    sourceId: sourceId || null, domain, jobType,
    status: "running", model: useModel,
    startedAt: new Date(),
  }).returning();

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let samples: any[] = [];
    try {
      const arrayMatch = response.match(/\[[\s\S]*\]/);
      if (arrayMatch) samples = JSON.parse(arrayMatch[0]);
    } catch {
      samples = [{ instruction: "training sample", input: "", output: response }];
    }

    const [updated] = await db.update(trainingDataJobsTable).set({
      status: "completed",
      recordsCollected: samples.length,
      recordsProcessed: samples.length,
      outputPath: `/training-data/${domain}/${job.id}.jsonl`,
      aiSummary: `Generated ${samples.length} training samples for ${domain}`,
      completedAt: new Date(),
    }).where(eq(trainingDataJobsTable.id, job.id)).returning();

    res.json({ ...updated, samples });
  } catch (e: any) {
    await db.update(trainingDataJobsTable).set({
      status: "failed", errorLog: e.message, completedAt: new Date(),
    }).where(eq(trainingDataJobsTable.id, job.id));
    res.status(500).json({ error: e.message });
  }
});

router.get("/data-agent/datasets", async (_req, res): Promise<void> => {
  const rows = await db.select().from(trainingDatasetsTable).orderBy(desc(trainingDatasetsTable.createdAt));
  res.json(rows);
});

router.post("/data-agent/datasets", requireAuth, async (req, res): Promise<void> => {
  const { name, domain, format, totalSamples, sampleData, metadata } = req.body;
  if (!name || !domain) { res.status(400).json({ error: "name and domain required" }); return; }
  const [row] = await db.insert(trainingDatasetsTable).values({
    name, domain, format: format || "jsonl",
    totalSamples: totalSamples || 0,
    sampleData: sampleData || null,
    metadata: metadata ? JSON.stringify(metadata) : null,
  }).returning();
  res.json(row);
});

router.post("/data-agent/datasets/:id/quality", requireAuth, async (req, res): Promise<void> => {
  const [dataset] = await db.select().from(trainingDatasetsTable).where(eq(trainingDatasetsTable.id, parseInt(req.params.id)));
  if (!dataset) { res.status(404).json({ error: "Dataset not found" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }

  const prompt = `Evaluate the quality of this training dataset:

Name: ${dataset.name}
Domain: ${dataset.domain}
Format: ${dataset.format}
Total Samples: ${dataset.totalSamples}
${dataset.sampleData ? `Sample Data: ${dataset.sampleData.substring(0, 1000)}` : ""}

Score the dataset 0.0-1.0 on:
1. Relevance to domain
2. Data quality and completeness
3. Format consistency
4. Diversity of examples
5. Overall readiness for fine-tuning

Respond in JSON: { "qualityScore": 0.0-1.0, "strengths": ["..."], "weaknesses": ["..."], "recommendations": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, "qwen2.5:7b", prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { qualityScore: 0.5, feedback: response }; }

    await db.update(trainingDatasetsTable).set({
      qualityScore: parsed.qualityScore || null,
      status: parsed.qualityScore >= 0.7 ? "ready" : "needs_improvement",
    }).where(eq(trainingDatasetsTable.id, dataset.id));
    res.json(parsed);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/data-agent/datasets/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(trainingDatasetsTable).where(eq(trainingDatasetsTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

router.get("/data-agent/dashboard", async (_req, res): Promise<void> => {
  const [sources, jobs, datasets] = await Promise.all([
    db.select().from(trainingDataSourcesTable),
    db.select().from(trainingDataJobsTable).orderBy(desc(trainingDataJobsTable.createdAt)).limit(20),
    db.select().from(trainingDatasetsTable),
  ]);

  const domainStats = {
    otolaryngology: {
      sources: sources.filter(s => s.domain === "otolaryngology").length,
      jobs: jobs.filter(j => j.domain === "otolaryngology").length,
      datasets: datasets.filter(d => d.domain === "otolaryngology").length,
      totalRecords: jobs.filter(j => j.domain === "otolaryngology").reduce((s, j) => s + j.recordsCollected, 0),
    },
    social_media: {
      sources: sources.filter(s => s.domain === "social_media").length,
      jobs: jobs.filter(j => j.domain === "social_media").length,
      datasets: datasets.filter(d => d.domain === "social_media").length,
      totalRecords: jobs.filter(j => j.domain === "social_media").reduce((s, j) => s + j.recordsCollected, 0),
    },
    hedge_fund: {
      sources: sources.filter(s => s.domain === "hedge_fund").length,
      jobs: jobs.filter(j => j.domain === "hedge_fund").length,
      datasets: datasets.filter(d => d.domain === "hedge_fund").length,
      totalRecords: jobs.filter(j => j.domain === "hedge_fund").reduce((s, j) => s + j.recordsCollected, 0),
    },
  };

  res.json({
    totalSources: sources.length,
    activeSources: sources.filter(s => s.status === "active").length,
    totalJobs: jobs.length,
    completedJobs: jobs.filter(j => j.status === "completed").length,
    totalDatasets: datasets.length,
    readyDatasets: datasets.filter(d => d.status === "ready").length,
    domainStats,
    recentJobs: jobs.slice(0, 10),
  });
});

export default router;
