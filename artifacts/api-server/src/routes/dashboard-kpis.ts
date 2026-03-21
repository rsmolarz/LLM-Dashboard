import { Router } from "express";
import { signals } from "./signals";

const router = Router();

const pnlHistory: { date: string; pnl: number; cumulative: number; trades: number }[] = [];

router.get("/dashboard/kpis", (_req, res) => {
  const executed = signals.filter(s => s.status === "executed" && s.pnl !== undefined);
  const active = signals.filter(s => s.status === "active");

  const totalPnl = executed.reduce((sum, s) => sum + (s.pnl || 0), 0);
  const wins = executed.filter(s => (s.pnl || 0) > 0);
  const losses = executed.filter(s => (s.pnl || 0) < 0);
  const winRate = executed.length > 0 ? parseFloat((wins.length / executed.length * 100).toFixed(1)) : 0;

  const avgWin = wins.length > 0 ? wins.reduce((s, w) => s + (w.pnl || 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, l) => s + (l.pnl || 0), 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : 0;

  const pnlValues = executed.map(s => s.pnl || 0);
  const mean = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;
  const variance = pnlValues.length > 1
    ? pnlValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (pnlValues.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? parseFloat((mean / stdDev * Math.sqrt(252)).toFixed(2)) : 0;

  const downsideValues = pnlValues.filter(v => v < 0);
  const downsideVariance = downsideValues.length > 1
    ? downsideValues.reduce((sum, v) => sum + v * v, 0) / downsideValues.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideDev > 0 ? parseFloat((mean / downsideDev * Math.sqrt(252)).toFixed(2)) : 0;

  let maxDrawdown = 0;
  let peak = 0;
  let cumPnl = 0;
  for (const val of pnlValues) {
    cumPnl += val;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  res.json({
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    winRate,
    totalTrades: executed.length,
    activeSignals: active.length,
    profitFactor,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    bestTrade: pnlValues.length > 0 ? Math.max(...pnlValues) : 0,
    worstTrade: pnlValues.length > 0 ? Math.min(...pnlValues) : 0,
    totalSignals: signals.length,
  });
});

router.get("/dashboard/pnl-series", (_req, res) => {
  const executed = signals
    .filter(s => s.status === "executed" && s.executedAt)
    .sort((a, b) => new Date(a.executedAt!).getTime() - new Date(b.executedAt!).getTime());

  let cumulative = 0;
  const series: { date: string; pnl: number; cumulative: number; trade: string }[] = [];

  for (const s of executed) {
    cumulative += s.pnl || 0;
    series.push({
      date: s.executedAt!,
      pnl: s.pnl || 0,
      cumulative: parseFloat(cumulative.toFixed(2)),
      trade: `${s.type} ${s.asset}`,
    });
  }

  if (pnlHistory.length > 0) {
    res.json({ series: pnlHistory, source: "historical" });
    return;
  }

  res.json({ series, source: "live" });
});

router.get("/dashboard/decisions", (_req, res) => {
  const decisions = {
    TRADE: signals.filter(s => s.type === "BUY" || s.type === "SELL").length,
    WATCH: signals.filter(s => s.type === "WATCH").length,
    HOLD: signals.filter(s => s.type === "HOLD").length,
    IGNORE: signals.filter(s => s.status === "cancelled" || s.status === "expired").length,
  };

  const total = Object.values(decisions).reduce((a, b) => a + b, 0) || 1;

  res.json({
    decisions,
    percentages: {
      TRADE: parseFloat((decisions.TRADE / total * 100).toFixed(1)),
      WATCH: parseFloat((decisions.WATCH / total * 100).toFixed(1)),
      HOLD: parseFloat((decisions.HOLD / total * 100).toFixed(1)),
      IGNORE: parseFloat((decisions.IGNORE / total * 100).toFixed(1)),
    },
    total,
  });
});

router.get("/dashboard/spread-distribution", (_req, res) => {
  const spreads = signals.filter(s => s.spread !== undefined).map(s => s.spread!);

  if (spreads.length === 0) {
    res.json({ buckets: [], mean: 0, median: 0, stdDev: 0 });
    return;
  }

  const sorted = [...spreads].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const bucketCount = 10;
  const bucketSize = (max - min) / bucketCount || 1;

  const buckets: { range: string; count: number; from: number; to: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const from = parseFloat((min + i * bucketSize).toFixed(4));
    const to = parseFloat((min + (i + 1) * bucketSize).toFixed(4));
    buckets.push({
      range: `${from}-${to}`,
      from,
      to,
      count: spreads.filter(s => s >= from && (i === bucketCount - 1 ? s <= to : s < to)).length,
    });
  }

  const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const variance = spreads.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / spreads.length;

  res.json({
    buckets,
    mean: parseFloat(mean.toFixed(4)),
    median: parseFloat(median.toFixed(4)),
    stdDev: parseFloat(Math.sqrt(variance).toFixed(4)),
    count: spreads.length,
  });
});

router.get("/dashboard/exchange-performance", (_req, res) => {
  const exchanges = [...new Set(signals.map(s => s.exchange))];

  const performance = exchanges.map(exchange => {
    const exSignals = signals.filter(s => s.exchange === exchange);
    const executed = exSignals.filter(s => s.status === "executed");
    const wins = executed.filter(s => (s.pnl || 0) > 0);
    const totalPnl = executed.reduce((sum, s) => sum + (s.pnl || 0), 0);
    const avgConfidence = exSignals.length > 0
      ? exSignals.reduce((sum, s) => sum + s.confidence, 0) / exSignals.length
      : 0;

    return {
      exchange,
      totalSignals: exSignals.length,
      executedTrades: executed.length,
      winRate: executed.length > 0 ? parseFloat((wins.length / executed.length * 100).toFixed(1)) : 0,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      avgConfidence: parseFloat(avgConfidence.toFixed(2)),
    };
  });

  res.json({ exchanges: performance });
});

export default router;
