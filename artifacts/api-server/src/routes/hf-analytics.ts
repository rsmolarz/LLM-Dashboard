import { Router } from "express";
import { signals } from "./signals";

const router = Router();

router.get("/hf/overview", (_req, res) => {
  const active = signals.filter(s => s.status === "active");
  const executed = signals.filter(s => s.status === "executed");
  const totalPnl = executed.reduce((sum, s) => sum + (s.pnl || 0), 0);
  const uniqueAgents = [...new Set(signals.map(s => s.agent))];
  const uniqueAssets = [...new Set(signals.map(s => s.asset))];
  const uniqueExchanges = [...new Set(signals.map(s => s.exchange))];

  const byType: Record<string, number> = {};
  signals.forEach(s => { byType[s.type] = (byType[s.type] || 0) + 1; });

  const recentSignals = signals
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  res.json({
    totalSignals: signals.length,
    activeSignals: active.length,
    executedTrades: executed.length,
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    agentCount: uniqueAgents.length,
    assetCoverage: uniqueAssets.length,
    exchangeCount: uniqueExchanges.length,
    signalsByType: byType,
    systemUptime: process.uptime(),
    recentSignals,
  });
});

router.get("/hf/risk-metrics", (_req, res) => {
  const executed = signals.filter(s => s.status === "executed");
  const pnlValues = executed.map(s => s.pnl || 0);

  const mean = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;
  const variance = pnlValues.length > 1
    ? pnlValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (pnlValues.length - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? parseFloat((mean / stdDev * Math.sqrt(252)).toFixed(3)) : 0;

  const downsideVals = pnlValues.filter(v => v < 0);
  const downsideVar = downsideVals.length > 0
    ? downsideVals.reduce((sum, v) => sum + v * v, 0) / downsideVals.length : 0;
  const sortino = Math.sqrt(downsideVar) > 0
    ? parseFloat((mean / Math.sqrt(downsideVar) * Math.sqrt(252)).toFixed(3)) : 0;

  const sorted = [...pnlValues].sort((a, b) => a - b);
  const varIndex = Math.floor(sorted.length * 0.05);
  const var95 = sorted.length > 0 ? sorted[varIndex] || sorted[0] : 0;
  const cvar95 = sorted.length > 0
    ? parseFloat((sorted.slice(0, Math.max(varIndex, 1)).reduce((a, b) => a + b, 0) / Math.max(varIndex, 1)).toFixed(2))
    : 0;

  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let peak = 0;
  let cumPnl = 0;
  const initialCapital = 1000000;
  for (const val of pnlValues) {
    cumPnl += val;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDrawdown) maxDrawdown = dd;
    const ddPct = peak > 0 ? dd / (initialCapital + peak) * 100 : 0;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
  }

  const calmarRatio = maxDrawdown > 0 ? parseFloat((mean * 252 / maxDrawdown).toFixed(3)) : 0;

  const wins = pnlValues.filter(v => v > 0);
  const losses = pnlValues.filter(v => v < 0);
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 1;
  const kellyPct = wins.length > 0 && avgLoss > 0
    ? parseFloat(((wins.length / pnlValues.length) - (losses.length / pnlValues.length) / (avgWin / avgLoss)).toFixed(3))
    : 0;

  res.json({
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    calmarRatio,
    var95: parseFloat(var95.toFixed(2)),
    cvar95,
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
    volatility: parseFloat((stdDev * Math.sqrt(252)).toFixed(3)),
    kellyFraction: kellyPct,
    totalTrades: executed.length,
    winRate: pnlValues.length > 0 ? parseFloat((wins.length / pnlValues.length * 100).toFixed(1)) : 0,
  });
});

router.get("/hf/performance-attribution", (req, res) => {
  const windowDays = Number(req.query.window) || 30;
  const now = Date.now();
  const windowMs = windowDays * 86400000;

  const inWindow = signals.filter(s => {
    const t = new Date(s.createdAt).getTime();
    return now - t <= windowMs;
  });

  const byAgent: Record<string, { signals: number; pnl: number; wins: number; executed: number }> = {};
  const byExchange: Record<string, { signals: number; pnl: number; wins: number; executed: number }> = {};
  const byAsset: Record<string, { signals: number; pnl: number }> = {};

  for (const s of inWindow) {
    if (!byAgent[s.agent]) byAgent[s.agent] = { signals: 0, pnl: 0, wins: 0, executed: 0 };
    byAgent[s.agent].signals++;
    if (s.status === "executed") {
      byAgent[s.agent].executed++;
      byAgent[s.agent].pnl += s.pnl || 0;
      if ((s.pnl || 0) > 0) byAgent[s.agent].wins++;
    }

    if (!byExchange[s.exchange]) byExchange[s.exchange] = { signals: 0, pnl: 0, wins: 0, executed: 0 };
    byExchange[s.exchange].signals++;
    if (s.status === "executed") {
      byExchange[s.exchange].executed++;
      byExchange[s.exchange].pnl += s.pnl || 0;
      if ((s.pnl || 0) > 0) byExchange[s.exchange].wins++;
    }

    if (!byAsset[s.asset]) byAsset[s.asset] = { signals: 0, pnl: 0 };
    byAsset[s.asset].signals++;
    byAsset[s.asset].pnl += s.pnl || 0;
  }

  res.json({
    windowDays,
    totalInWindow: inWindow.length,
    agentAttribution: Object.entries(byAgent).map(([agent, data]) => ({
      agent,
      ...data,
      winRate: data.executed > 0 ? parseFloat((data.wins / data.executed * 100).toFixed(1)) : 0,
      pnl: parseFloat(data.pnl.toFixed(2)),
    })),
    exchangeAttribution: Object.entries(byExchange).map(([exchange, data]) => ({
      exchange,
      ...data,
      winRate: data.executed > 0 ? parseFloat((data.wins / data.executed * 100).toFixed(1)) : 0,
      pnl: parseFloat(data.pnl.toFixed(2)),
    })),
    topAssets: Object.entries(byAsset)
      .sort((a, b) => b[1].signals - a[1].signals)
      .slice(0, 10)
      .map(([asset, data]) => ({ asset, ...data, pnl: parseFloat(data.pnl.toFixed(2)) })),
  });
});

router.get("/hf/signal-intelligence", (_req, res) => {
  const agentSignals: Record<string, number[]> = {};
  const executed = signals.filter(s => s.status === "executed");

  for (const s of signals) {
    if (!agentSignals[s.agent]) agentSignals[s.agent] = [];
    agentSignals[s.agent].push(s.confidence);
  }

  const falsePositives = executed.filter(s => s.confidence > 0.7 && (s.pnl || 0) < 0);
  const truePositives = executed.filter(s => s.confidence > 0.7 && (s.pnl || 0) > 0);
  const fpRate = (falsePositives.length + truePositives.length) > 0
    ? parseFloat((falsePositives.length / (falsePositives.length + truePositives.length) * 100).toFixed(1))
    : 0;

  const confidences = signals.map(s => s.confidence);
  const meanConf = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  const confVariance = confidences.length > 1
    ? confidences.reduce((sum, v) => sum + Math.pow(v - meanConf, 2), 0) / confidences.length : 0;
  const snr = confVariance > 0 ? parseFloat((meanConf / Math.sqrt(confVariance)).toFixed(2)) : 0;

  const consensusScores: Record<string, number> = {};
  const assetSignals: Record<string, Signal[]> = {};
  for (const s of signals.filter(s => s.status === "active")) {
    if (!assetSignals[s.asset]) assetSignals[s.asset] = [];
    assetSignals[s.asset].push(s);
  }
  for (const [asset, sigs] of Object.entries(assetSignals)) {
    const buyWeight = sigs.filter(s => s.type === "BUY").reduce((sum, s) => sum + s.confidence, 0);
    const sellWeight = sigs.filter(s => s.type === "SELL").reduce((sum, s) => sum + s.confidence, 0);
    consensusScores[asset] = parseFloat(((buyWeight - sellWeight) / sigs.length).toFixed(3));
  }

  res.json({
    consensusScores,
    falsePositiveRate: fpRate,
    signalToNoiseRatio: snr,
    avgConfidence: parseFloat(meanConf.toFixed(3)),
    highConfidenceSignals: signals.filter(s => s.confidence >= 0.8).length,
    lowConfidenceSignals: signals.filter(s => s.confidence < 0.4).length,
    agentReliability: Object.entries(agentSignals).map(([agent, confs]) => ({
      agent,
      avgConfidence: parseFloat((confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3)),
      signalCount: confs.length,
    })),
  });
});

interface Signal {
  id: string;
  agent: string;
  type: string;
  asset: string;
  exchange: string;
  confidence: number;
  severity: string;
  spread?: number;
  pnl?: number;
  status: string;
  createdAt: string;
  executedAt?: string;
}

router.get("/hf/market-regime", (_req, res) => {
  const recent = signals
    .filter(s => Date.now() - new Date(s.createdAt).getTime() < 7 * 86400000)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const buyCount = recent.filter(s => s.type === "BUY").length;
  const sellCount = recent.filter(s => s.type === "SELL").length;
  const total = recent.length || 1;

  const bullBearRatio = parseFloat(((buyCount - sellCount) / total).toFixed(3));
  let regime: "strongly_bullish" | "bullish" | "neutral" | "bearish" | "strongly_bearish" = "neutral";
  if (bullBearRatio > 0.4) regime = "strongly_bullish";
  else if (bullBearRatio > 0.15) regime = "bullish";
  else if (bullBearRatio < -0.4) regime = "strongly_bearish";
  else if (bullBearRatio < -0.15) regime = "bearish";

  const confidences = recent.map(s => s.confidence);
  const avgConf = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  const confVariance = confidences.length > 1
    ? confidences.reduce((sum, v) => sum + Math.pow(v - avgConf, 2), 0) / confidences.length : 0;
  const volatilityIndex = parseFloat((Math.sqrt(confVariance) * 100).toFixed(1));

  const criticalCount = recent.filter(s => s.severity === "critical").length;
  const highCount = recent.filter(s => s.severity === "high").length;
  const stressIndex = parseFloat(((criticalCount * 3 + highCount * 2) / total * 100).toFixed(1));

  res.json({
    regime,
    bullBearRatio,
    volatilityIndex,
    stressIndex,
    recentSignalCount: recent.length,
    buySignals: buyCount,
    sellSignals: sellCount,
    avgConfidence: parseFloat(avgConf.toFixed(3)),
    severityBreakdown: {
      critical: criticalCount,
      high: highCount,
      medium: recent.filter(s => s.severity === "medium").length,
      low: recent.filter(s => s.severity === "low").length,
    },
  });
});

router.get("/hf/execution-analytics", (_req, res) => {
  const executed = signals.filter(s => s.status === "executed");

  const slippageEstimates = executed
    .filter(s => s.entryPrice && s.targetPrice)
    .map(s => {
      const expected = Math.abs((s.targetPrice! - s.entryPrice!) / s.entryPrice! * 100);
      const actual = s.pnl || 0;
      return { asset: s.asset, expectedPct: expected, actualPnl: actual };
    });

  const avgSlippage = slippageEstimates.length > 0
    ? parseFloat((slippageEstimates.reduce((sum, s) => sum + s.expectedPct, 0) / slippageEstimates.length).toFixed(3))
    : 0;

  const fillRate = signals.length > 0
    ? parseFloat((executed.length / signals.length * 100).toFixed(1))
    : 0;

  const pnlValues = executed.map(s => s.pnl || 0);
  const totalCosts = parseFloat((executed.length * 0.001 * 10000).toFixed(2));

  const pnlDist: { range: string; count: number }[] = [];
  if (pnlValues.length > 0) {
    const ranges = [
      { range: "< -1000", fn: (v: number) => v < -1000 },
      { range: "-1000 to -100", fn: (v: number) => v >= -1000 && v < -100 },
      { range: "-100 to 0", fn: (v: number) => v >= -100 && v < 0 },
      { range: "0 to 100", fn: (v: number) => v >= 0 && v < 100 },
      { range: "100 to 1000", fn: (v: number) => v >= 100 && v < 1000 },
      { range: "> 1000", fn: (v: number) => v >= 1000 },
    ];
    for (const r of ranges) {
      pnlDist.push({ range: r.range, count: pnlValues.filter(r.fn).length });
    }
  }

  res.json({
    avgSlippage,
    fillRate,
    estimatedCosts: totalCosts,
    executedTrades: executed.length,
    pnlDistribution: pnlDist,
    avgExecutionTime: "< 50ms",
    slippageSamples: slippageEstimates.slice(0, 10),
  });
});

router.get("/hf/agent-intelligence", (_req, res) => {
  const agents = [...new Set(signals.map(s => s.agent))];

  const agentConfidences: Record<string, number[]> = {};
  for (const s of signals) {
    if (!agentConfidences[s.agent]) agentConfidences[s.agent] = [];
    agentConfidences[s.agent].push(s.confidence);
  }

  const correlationMatrix: Record<string, Record<string, number>> = {};
  for (const a1 of agents) {
    correlationMatrix[a1] = {};
    for (const a2 of agents) {
      if (a1 === a2) {
        correlationMatrix[a1][a2] = 1;
        continue;
      }
      const shared = [...new Set(signals.filter(s => s.agent === a1).map(s => s.asset))]
        .filter(asset => signals.some(s => s.agent === a2 && s.asset === asset));
      correlationMatrix[a1][a2] = shared.length > 0
        ? parseFloat((shared.length / Math.max(
            signals.filter(s => s.agent === a1).length,
            signals.filter(s => s.agent === a2).length,
            1
          )).toFixed(3))
        : 0;
    }
  }

  const allActiveConfs = signals.filter(s => s.status === "active").map(s => s.confidence);
  const ensembleConfidence = allActiveConfs.length > 0
    ? parseFloat((allActiveConfs.reduce((a, b) => a + b, 0) / allActiveConfs.length).toFixed(3))
    : 0;

  const agentMetrics = agents.map(agent => {
    const agentSigs = signals.filter(s => s.agent === agent);
    const exec = agentSigs.filter(s => s.status === "executed");
    const wins = exec.filter(s => (s.pnl || 0) > 0);
    const totalPnl = exec.reduce((sum, s) => sum + (s.pnl || 0), 0);
    const confs = agentConfidences[agent] || [];
    return {
      agent,
      totalSignals: agentSigs.length,
      executedTrades: exec.length,
      winRate: exec.length > 0 ? parseFloat((wins.length / exec.length * 100).toFixed(1)) : 0,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      avgConfidence: confs.length > 0 ? parseFloat((confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3)) : 0,
      reliability: exec.length > 0
        ? parseFloat((wins.length / exec.length).toFixed(3))
        : 0,
    };
  });

  res.json({
    correlationMatrix,
    ensembleConfidence,
    agentMetrics,
    agentCount: agents.length,
  });
});

export default router;
