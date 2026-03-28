import { Router } from "express";
import { db, costUsageTable, budgetAlertsTable } from "@workspace/db";
import { eq, desc, sql, gte, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/rateLimiter";
import { pool } from "@workspace/db";

const router = Router();

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
  "llama3.1:latest": { input: 0, output: 0 },
  "llama3.2:latest": { input: 0, output: 0 },
  "mistral:latest": { input: 0, output: 0 },
  "codellama:latest": { input: 0, output: 0 },
  "nomic-embed-text": { input: 0, output: 0 },
  "gemma2:latest": { input: 0, output: 0 },
};

async function seedUsageData() {
  const existing = await db.select({ id: costUsageTable.id }).from(costUsageTable).limit(1);
  if (existing.length > 0) return;
  const models = Object.keys(MODEL_COSTS);
  const sources = ["chat", "research", "voice-agent", "benchmark", "agentflow"];
  const values: any[] = [];
  for (let day = 29; day >= 0; day--) {
    const entries = Math.floor(Math.random() * 8) + 3;
    for (let i = 0; i < entries; i++) {
      const model = models[Math.floor(Math.random() * models.length)]!;
      const tokensIn = Math.floor(Math.random() * 2000) + 100;
      const tokensOut = Math.floor(Math.random() * 3000) + 50;
      const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
      values.push({
        model,
        tokensIn,
        tokensOut,
        costEstimate: (tokensIn / 1000) * costs.input + (tokensOut / 1000) * costs.output,
        source: sources[Math.floor(Math.random() * sources.length)]!,
        userId: "user-1",
        createdAt: new Date(Date.now() - day * 86400000 - Math.random() * 86400000),
      });
    }
  }
  await db.insert(costUsageTable).values(values);
  console.log(`[costs] Seeded ${values.length} usage entries`);
}

seedUsageData().catch(err => console.error("[costs] Seed error:", err.message));

router.get("/costs/summary", async (_req, res): Promise<void> => {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN tokens_in ELSE 0 END), 0) AS day_tokens_in,
      COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN tokens_out ELSE 0 END), 0) AS day_tokens_out,
      COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN cost_estimate ELSE 0 END), 0) AS day_cost,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS day_requests,
      COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN tokens_in ELSE 0 END), 0) AS week_tokens_in,
      COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN tokens_out ELSE 0 END), 0) AS week_tokens_out,
      COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN cost_estimate ELSE 0 END), 0) AS week_cost,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) AS week_requests,
      COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN tokens_in ELSE 0 END), 0) AS month_tokens_in,
      COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN tokens_out ELSE 0 END), 0) AS month_tokens_out,
      COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN cost_estimate ELSE 0 END), 0) AS month_cost,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) AS month_requests,
      COALESCE(SUM(tokens_in), 0) AS all_tokens_in,
      COALESCE(SUM(tokens_out), 0) AS all_tokens_out,
      COALESCE(SUM(cost_estimate), 0) AS all_cost,
      COUNT(*) AS all_requests
    FROM cost_usage
  `);
  const r = result.rows[0];
  res.json({
    last24h: { totalTokensIn: +r.day_tokens_in, totalTokensOut: +r.day_tokens_out, totalCost: +r.day_cost, requests: +r.day_requests },
    last7d: { totalTokensIn: +r.week_tokens_in, totalTokensOut: +r.week_tokens_out, totalCost: +r.week_cost, requests: +r.week_requests },
    last30d: { totalTokensIn: +r.month_tokens_in, totalTokensOut: +r.month_tokens_out, totalCost: +r.month_cost, requests: +r.month_requests },
    allTime: { totalTokensIn: +r.all_tokens_in, totalTokensOut: +r.all_tokens_out, totalCost: +r.all_cost, requests: +r.all_requests },
  });
});

router.get("/costs/by-model", async (_req, res): Promise<void> => {
  const result = await pool.query(`
    SELECT model,
      SUM(tokens_in)::int AS "tokensIn",
      SUM(tokens_out)::int AS "tokensOut",
      SUM(cost_estimate)::float AS cost,
      COUNT(*)::int AS requests
    FROM cost_usage GROUP BY model ORDER BY requests DESC
  `);
  const byModel: Record<string, any> = {};
  for (const r of result.rows) {
    byModel[r.model] = { tokensIn: r.tokensIn, tokensOut: r.tokensOut, cost: r.cost, requests: r.requests };
  }
  res.json(byModel);
});

router.get("/costs/by-day", async (_req, res): Promise<void> => {
  const result = await pool.query(`
    SELECT DATE(created_at) AS date,
      SUM(tokens_in)::int AS "tokensIn",
      SUM(tokens_out)::int AS "tokensOut",
      SUM(cost_estimate)::float AS cost,
      COUNT(*)::int AS requests
    FROM cost_usage GROUP BY DATE(created_at) ORDER BY date ASC
  `);
  res.json(result.rows.map(r => ({ date: r.date.toISOString().split("T")[0], tokensIn: r.tokensIn, tokensOut: r.tokensOut, cost: r.cost, requests: r.requests })));
});

router.get("/costs/by-source", async (_req, res): Promise<void> => {
  const result = await pool.query(`
    SELECT source,
      SUM(tokens_in)::int AS "tokensIn",
      SUM(tokens_out)::int AS "tokensOut",
      SUM(cost_estimate)::float AS cost,
      COUNT(*)::int AS requests
    FROM cost_usage GROUP BY source ORDER BY requests DESC
  `);
  const bySource: Record<string, any> = {};
  for (const r of result.rows) {
    bySource[r.source] = { tokensIn: r.tokensIn, tokensOut: r.tokensOut, cost: r.cost, requests: r.requests };
  }
  res.json(bySource);
});

router.get("/costs/model-prices", (_req, res): void => {
  res.json(MODEL_COSTS);
});

router.post("/costs/track", requireAuth, async (req, res): Promise<void> => {
  const { model, tokensIn, tokensOut, source } = req.body;
  if (!model) { res.status(400).json({ error: "Model required" }); return; }
  const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
  const [entry] = await db.insert(costUsageTable).values({
    model,
    tokensIn: tokensIn || 0,
    tokensOut: tokensOut || 0,
    costEstimate: ((tokensIn || 0) / 1000) * costs.input + ((tokensOut || 0) / 1000) * costs.output,
    source: source || "manual",
    userId: (req as any).user?.id || "user-1",
  }).returning();
  res.json(entry);
});

router.get("/costs/budget-alerts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(budgetAlertsTable).orderBy(desc(budgetAlertsTable.createdAt));
  res.json(rows);
});

router.post("/costs/budget-alerts", requireAuth, async (req, res): Promise<void> => {
  const { threshold, email } = req.body;
  if (!threshold || !email) { res.status(400).json({ error: "Threshold and email required" }); return; }
  const [alert] = await db.insert(budgetAlertsTable).values({ threshold, email }).returning();
  res.json(alert);
});

router.delete("/costs/budget-alerts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [deleted] = await db.delete(budgetAlertsTable).where(eq(budgetAlertsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Alert not found" }); return; }
  res.json({ success: true });
});

export default router;
