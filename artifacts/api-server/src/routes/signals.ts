import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

interface Signal {
  id: string;
  agent: string;
  type: "BUY" | "SELL" | "HOLD" | "WATCH";
  asset: string;
  exchange: string;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  spread?: number;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  reasoning: string;
  status: "active" | "executed" | "expired" | "cancelled";
  pnl?: number;
  createdAt: string;
  executedAt?: string;
}

const signals: Signal[] = [];
let signalIdCounter = 1;

function generateId(): string {
  return `sig_${Date.now()}_${signalIdCounter++}`;
}

router.get("/signals", (req, res) => {
  let filtered = [...signals];

  const { agent, type, status, severity, exchange, asset, limit, offset } = req.query;

  if (agent) filtered = filtered.filter(s => s.agent === agent);
  if (type) filtered = filtered.filter(s => s.type === type);
  if (status) filtered = filtered.filter(s => s.status === status);
  if (severity) filtered = filtered.filter(s => s.severity === severity);
  if (exchange) filtered = filtered.filter(s => s.exchange === exchange);
  if (asset) filtered = filtered.filter(s => s.asset.toLowerCase().includes((asset as string).toLowerCase()));

  const total = filtered.length;
  const off = Number(offset) || 0;
  const lim = Math.min(Number(limit) || 50, 200);
  filtered = filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  filtered = filtered.slice(off, off + lim);

  const activeCount = signals.filter(s => s.status === "active").length;
  const executedCount = signals.filter(s => s.status === "executed").length;
  const avgConfidence = signals.length > 0
    ? parseFloat((signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length).toFixed(2))
    : 0;

  res.json({
    signals: filtered,
    total,
    activeCount,
    executedCount,
    avgConfidence,
    agents: [...new Set(signals.map(s => s.agent))],
    exchanges: [...new Set(signals.map(s => s.exchange))],
  });
});

router.post("/signals", (req, res) => {
  const { agent, type, asset, exchange, confidence, severity, spread, entryPrice, targetPrice, stopLoss, reasoning } = req.body;

  if (!agent || !type || !asset || !reasoning) {
    res.status(400).json({ error: "agent, type, asset, and reasoning are required" });
    return;
  }

  const signal: Signal = {
    id: generateId(),
    agent: agent || "manual",
    type: type || "WATCH",
    asset,
    exchange: exchange || "unknown",
    confidence: Math.min(Math.max(Number(confidence) || 0.5, 0), 1),
    severity: severity || "medium",
    spread,
    entryPrice,
    targetPrice,
    stopLoss,
    reasoning,
    status: "active",
    createdAt: new Date().toISOString(),
  };

  signals.push(signal);

  res.json({ signal, message: "Signal created" });
});

export { signals };
export default router;
