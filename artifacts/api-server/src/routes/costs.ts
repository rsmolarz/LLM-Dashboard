import { Router, Request, Response, NextFunction } from "express";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) { next(); }

interface UsageEntry {
  id: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costEstimate: number;
  timestamp: number;
  source: string;
  userId: string;
}

interface BudgetAlert {
  id: string;
  threshold: number;
  email: string;
  triggered: boolean;
  createdAt: number;
}

const usageLog: UsageEntry[] = [];
const budgetAlerts: BudgetAlert[] = [];
let usageCounter = 0;
let alertCounter = 0;

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

function seedUsageData() {
  if (usageLog.length > 0) return;
  const models = Object.keys(MODEL_COSTS);
  const sources = ["chat", "research", "voice-agent", "benchmark", "agentflow"];
  for (let day = 29; day >= 0; day--) {
    const entries = Math.floor(Math.random() * 8) + 3;
    for (let i = 0; i < entries; i++) {
      usageCounter++;
      const model = models[Math.floor(Math.random() * models.length)];
      const tokensIn = Math.floor(Math.random() * 2000) + 100;
      const tokensOut = Math.floor(Math.random() * 3000) + 50;
      const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
      usageLog.push({
        id: `u-${usageCounter}`,
        model,
        tokensIn,
        tokensOut,
        costEstimate: (tokensIn / 1000) * costs.input + (tokensOut / 1000) * costs.output,
        timestamp: Date.now() - day * 86400000 - Math.random() * 86400000,
        source: sources[Math.floor(Math.random() * sources.length)],
        userId: "user-1",
      });
    }
  }
}

seedUsageData();

router.get("/costs/summary", (_req, res): void => {
  const now = Date.now();
  const last24h = usageLog.filter(e => now - e.timestamp < 86400000);
  const last7d = usageLog.filter(e => now - e.timestamp < 604800000);
  const last30d = usageLog.filter(e => now - e.timestamp < 2592000000);

  const sum = (entries: UsageEntry[]) => ({
    totalTokensIn: entries.reduce((s, e) => s + e.tokensIn, 0),
    totalTokensOut: entries.reduce((s, e) => s + e.tokensOut, 0),
    totalCost: entries.reduce((s, e) => s + e.costEstimate, 0),
    requests: entries.length,
  });

  res.json({
    last24h: sum(last24h),
    last7d: sum(last7d),
    last30d: sum(last30d),
    allTime: sum(usageLog),
  });
});

router.get("/costs/by-model", (_req, res): void => {
  const byModel: Record<string, { tokensIn: number; tokensOut: number; cost: number; requests: number }> = {};
  for (const e of usageLog) {
    if (!byModel[e.model]) byModel[e.model] = { tokensIn: 0, tokensOut: 0, cost: 0, requests: 0 };
    byModel[e.model].tokensIn += e.tokensIn;
    byModel[e.model].tokensOut += e.tokensOut;
    byModel[e.model].cost += e.costEstimate;
    byModel[e.model].requests++;
  }
  res.json(byModel);
});

router.get("/costs/by-day", (_req, res): void => {
  const byDay: Record<string, { tokensIn: number; tokensOut: number; cost: number; requests: number }> = {};
  for (const e of usageLog) {
    const day = new Date(e.timestamp).toISOString().split("T")[0];
    if (!byDay[day]) byDay[day] = { tokensIn: 0, tokensOut: 0, cost: 0, requests: 0 };
    byDay[day].tokensIn += e.tokensIn;
    byDay[day].tokensOut += e.tokensOut;
    byDay[day].cost += e.costEstimate;
    byDay[day].requests++;
  }
  const sorted = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date, ...data }));
  res.json(sorted);
});

router.get("/costs/by-source", (_req, res): void => {
  const bySource: Record<string, { tokensIn: number; tokensOut: number; cost: number; requests: number }> = {};
  for (const e of usageLog) {
    if (!bySource[e.source]) bySource[e.source] = { tokensIn: 0, tokensOut: 0, cost: 0, requests: 0 };
    bySource[e.source].tokensIn += e.tokensIn;
    bySource[e.source].tokensOut += e.tokensOut;
    bySource[e.source].cost += e.costEstimate;
    bySource[e.source].requests++;
  }
  res.json(bySource);
});

router.get("/costs/model-prices", (_req, res): void => {
  res.json(MODEL_COSTS);
});

router.post("/costs/track", requireAuth, (req, res): void => {
  const { model, tokensIn, tokensOut, source } = req.body;
  if (!model) { res.status(400).json({ error: "Model required" }); return; }
  usageCounter++;
  const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
  const entry: UsageEntry = {
    id: `u-${usageCounter}`,
    model,
    tokensIn: tokensIn || 0,
    tokensOut: tokensOut || 0,
    costEstimate: ((tokensIn || 0) / 1000) * costs.input + ((tokensOut || 0) / 1000) * costs.output,
    timestamp: Date.now(),
    source: source || "manual",
    userId: (req as any).user?.id || "user-1",
  };
  usageLog.push(entry);
  res.json(entry);
});

router.get("/costs/budget-alerts", (_req, res): void => {
  res.json(budgetAlerts);
});

router.post("/costs/budget-alerts", requireAuth, (req, res): void => {
  const { threshold, email } = req.body;
  if (!threshold || !email) { res.status(400).json({ error: "Threshold and email required" }); return; }
  alertCounter++;
  const alert: BudgetAlert = {
    id: `ba-${alertCounter}`,
    threshold,
    email,
    triggered: false,
    createdAt: Date.now(),
  };
  budgetAlerts.push(alert);
  res.json(alert);
});

router.delete("/costs/budget-alerts/:id", requireAuth, (req, res): void => {
  const idx = budgetAlerts.findIndex(a => a.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Alert not found" }); return; }
  budgetAlerts.splice(idx, 1);
  res.json({ success: true });
});

export default router;
