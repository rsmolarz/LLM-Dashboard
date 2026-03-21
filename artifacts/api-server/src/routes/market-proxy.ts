import { Router } from "express";

const router = Router();
const MARKET_BASE = process.env.MARKET_AGENTS_URL || "https://marketinefficiencyagents.com";
const API_KEY = process.env.ALPHA_FACTORY_API_KEY || "";

async function proxyGet(path: string, timeout = 15000): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

    const res = await fetch(`${MARKET_BASE}${path}`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(t);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { error: `Upstream ${res.status}: ${text.slice(0, 200)}`, status: res.status };
    }
    return await res.json();
  } catch (e: any) {
    clearTimeout(t);
    return { error: e.message || "Upstream unreachable", offline: true };
  }
}

router.get("/market/health", async (_req, res) => {
  const result = await proxyGet("/api/health");
  if (result.error) {
    res.json({
      status: "degraded",
      upstream: MARKET_BASE,
      error: result.error,
      localTime: new Date().toISOString(),
    });
    return;
  }
  res.json({ status: "connected", upstream: MARKET_BASE, ...result, localTime: new Date().toISOString() });
});

router.get("/market/signals", async (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.agent) qs.set("agent", req.query.agent as string);
  if (req.query.severity) qs.set("severity", req.query.severity as string);
  const path = `/api/signals${qs.toString() ? "?" + qs.toString() : ""}`;
  const result = await proxyGet(path);
  if (result.error && result.offline) {
    res.json({ signals: [], error: result.error, source: "upstream_offline" });
    return;
  }

  const signals = Array.isArray(result) ? result : result.signals || result.data || [];
  res.json({
    signals,
    total: signals.length,
    source: MARKET_BASE,
    fetchedAt: new Date().toISOString(),
  });
});

router.get("/market/kpis", async (_req, res) => {
  const signalsResult = await proxyGet("/api/signals");
  const signals = Array.isArray(signalsResult) ? signalsResult : signalsResult.signals || signalsResult.data || [];

  if (!Array.isArray(signals) || signals.length === 0) {
    res.json({
      totalSignals: 0,
      avgConfidence: 0,
      severityBreakdown: {},
      agentCount: 0,
      source: "computed",
    });
    return;
  }

  const confidences = signals
    .map((s: any) => s.confidence || s.score || 0)
    .filter((c: number) => c > 0);
  const avgConfidence = confidences.length > 0
    ? parseFloat((confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length).toFixed(3))
    : 0;

  const severityBreakdown: Record<string, number> = {};
  signals.forEach((s: any) => {
    const sev = s.severity || "unknown";
    severityBreakdown[sev] = (severityBreakdown[sev] || 0) + 1;
  });

  const agents = [...new Set(signals.map((s: any) => s.agent || s.agent_name || "unknown"))];

  res.json({
    totalSignals: signals.length,
    avgConfidence,
    severityBreakdown,
    agentCount: agents.length,
    agents,
    source: "computed_from_live",
    fetchedAt: new Date().toISOString(),
  });
});

router.get("/market/agent-breakdown", async (_req, res) => {
  const signalsResult = await proxyGet("/api/signals");
  const signals = Array.isArray(signalsResult) ? signalsResult : signalsResult.signals || signalsResult.data || [];

  const breakdown: Record<string, { count: number; avgConfidence: number; confidences: number[] }> = {};
  for (const s of signals) {
    const agent = s.agent || s.agent_name || "unknown";
    if (!breakdown[agent]) breakdown[agent] = { count: 0, avgConfidence: 0, confidences: [] };
    breakdown[agent].count++;
    breakdown[agent].confidences.push(s.confidence || s.score || 0);
  }

  const agents = Object.entries(breakdown).map(([agent, data]) => ({
    agent,
    signalCount: data.count,
    avgConfidence: data.confidences.length > 0
      ? parseFloat((data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length).toFixed(3))
      : 0,
  }));

  res.json({ agents, fetchedAt: new Date().toISOString() });
});

router.get("/market/confidence-distribution", async (_req, res) => {
  const signalsResult = await proxyGet("/api/signals");
  const signals = Array.isArray(signalsResult) ? signalsResult : signalsResult.signals || signalsResult.data || [];

  const confidences = signals.map((s: any) => s.confidence || s.score || 0);
  const buckets = [
    { range: "0.0-0.2", min: 0, max: 0.2, count: 0 },
    { range: "0.2-0.4", min: 0.2, max: 0.4, count: 0 },
    { range: "0.4-0.6", min: 0.4, max: 0.6, count: 0 },
    { range: "0.6-0.8", min: 0.6, max: 0.8, count: 0 },
    { range: "0.8-1.0", min: 0.8, max: 1.0, count: 0 },
  ];

  for (const c of confidences) {
    for (const b of buckets) {
      if (c >= b.min && c < b.max) { b.count++; break; }
      if (b.max === 1.0 && c >= 1.0) { b.count++; break; }
    }
  }

  res.json({ distribution: buckets.map(b => ({ range: b.range, count: b.count })), total: confidences.length });
});

router.get("/market/timeline", async (req, res) => {
  const signalsResult = await proxyGet("/api/signals");
  const signals = Array.isArray(signalsResult) ? signalsResult : signalsResult.signals || signalsResult.data || [];

  const timeline: Record<string, Record<string, number>> = {};
  for (const s of signals) {
    const date = (s.timestamp || s.created_at || s.createdAt || new Date().toISOString()).slice(0, 10);
    const sev = s.severity || "unknown";
    if (!timeline[date]) timeline[date] = {};
    timeline[date][sev] = (timeline[date][sev] || 0) + 1;
  }

  const series = Object.entries(timeline)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sevs]) => ({ date, ...sevs, total: Object.values(sevs).reduce((a, b) => a + b, 0) }));

  res.json({ timeline: series });
});

router.get("/market/deep-analytics", async (_req, res) => {
  const signalsResult = await proxyGet("/api/signals");
  const signals = Array.isArray(signalsResult) ? signalsResult : signalsResult.signals || signalsResult.data || [];

  const highConf = signals.filter((s: any) => (s.confidence || s.score || 0) >= 0.7);
  const criticalSignals = signals.filter((s: any) => s.severity === "critical" || s.severity === "high");

  const agentPerformance: Record<string, { signals: number; highConf: number; critical: number }> = {};
  for (const s of signals) {
    const agent = s.agent || s.agent_name || "unknown";
    if (!agentPerformance[agent]) agentPerformance[agent] = { signals: 0, highConf: 0, critical: 0 };
    agentPerformance[agent].signals++;
    if ((s.confidence || 0) >= 0.7) agentPerformance[agent].highConf++;
    if (s.severity === "critical" || s.severity === "high") agentPerformance[agent].critical++;
  }

  res.json({
    totalSignals: signals.length,
    highConfidenceSignals: highConf.length,
    criticalSignals: criticalSignals.length,
    agentPerformance: Object.entries(agentPerformance).map(([agent, data]) => ({ agent, ...data })),
    technicalIndicators: {
      signalDensity: signals.length > 0 ? parseFloat((signals.length / 24).toFixed(2)) : 0,
      qualityScore: highConf.length > 0 ? parseFloat((highConf.length / signals.length * 100).toFixed(1)) : 0,
    },
    fetchedAt: new Date().toISOString(),
  });
});

export default router;
