import { Router } from "express";

const router = Router();

interface AgentLog {
  id: string;
  agent: string;
  action: string;
  details: string;
  level: "info" | "warn" | "error" | "success";
  timestamp: string;
}

const agentLogs: AgentLog[] = [];
let logIdCounter = 1;

const agentRegistry: Record<string, {
  name: string;
  type: string;
  status: "online" | "offline" | "idle" | "processing" | "error";
  lastActivity: string;
  signalsGenerated: number;
  uptime: number;
  version: string;
}> = {
  "market-inefficiency": {
    name: "Market Inefficiency Agent",
    type: "signal-generator",
    status: "online",
    lastActivity: new Date().toISOString(),
    signalsGenerated: 0,
    uptime: 0,
    version: "2.1.0",
  },
  "distressed-asset": {
    name: "Distressed Asset Scanner",
    type: "scanner",
    status: "online",
    lastActivity: new Date().toISOString(),
    signalsGenerated: 0,
    uptime: 0,
    version: "1.4.0",
  },
  "spread-arbitrage": {
    name: "Spread Arbitrage Agent",
    type: "arbitrage",
    status: "idle",
    lastActivity: new Date().toISOString(),
    signalsGenerated: 0,
    uptime: 0,
    version: "1.2.0",
  },
  "sentiment-analyzer": {
    name: "Sentiment Analysis Agent",
    type: "nlp",
    status: "online",
    lastActivity: new Date().toISOString(),
    signalsGenerated: 0,
    uptime: 0,
    version: "3.0.1",
  },
  "volatility-monitor": {
    name: "Volatility Monitor",
    type: "risk",
    status: "online",
    lastActivity: new Date().toISOString(),
    signalsGenerated: 0,
    uptime: 0,
    version: "1.1.0",
  },
  "code-guardian": {
    name: "Code Guardian",
    type: "security",
    status: "online",
    lastActivity: new Date().toISOString(),
    signalsGenerated: 0,
    uptime: 0,
    version: "1.0.0",
  },
};

function addLog(agent: string, action: string, details: string, level: AgentLog["level"] = "info") {
  agentLogs.push({
    id: `log_${logIdCounter++}`,
    agent,
    action,
    details,
    level,
    timestamp: new Date().toISOString(),
  });
  if (agentLogs.length > 500) agentLogs.splice(0, agentLogs.length - 500);

  if (agentRegistry[agent]) {
    agentRegistry[agent].lastActivity = new Date().toISOString();
    agentRegistry[agent].uptime = process.uptime();
  }
}

addLog("market-inefficiency", "startup", "Agent initialized and scanning markets", "success");
addLog("distressed-asset", "startup", "Scanner initialized, monitoring SEC filings", "success");
addLog("sentiment-analyzer", "startup", "NLP pipeline loaded, processing news feeds", "success");
addLog("volatility-monitor", "startup", "Risk monitoring active across all exchanges", "success");
addLog("code-guardian", "startup", "Security monitoring initialized", "success");

router.get("/agents/status", (_req, res) => {
  const agents = Object.entries(agentRegistry).map(([id, agent]) => ({
    id,
    ...agent,
    uptime: process.uptime(),
  }));

  const online = agents.filter(a => a.status === "online" || a.status === "processing").length;
  const total = agents.length;

  res.json({
    agents,
    summary: {
      total,
      online,
      offline: agents.filter(a => a.status === "offline").length,
      idle: agents.filter(a => a.status === "idle").length,
      error: agents.filter(a => a.status === "error").length,
      healthScore: parseFloat((online / total * 100).toFixed(1)),
    },
  });
});

router.get("/agents/logs", (req, res) => {
  let filtered = [...agentLogs];

  const { agent, level, limit, offset } = req.query;

  if (agent) filtered = filtered.filter(l => l.agent === agent);
  if (level) filtered = filtered.filter(l => l.level === level);

  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = filtered.length;
  const off = Number(offset) || 0;
  const lim = Math.min(Number(limit) || 50, 200);
  filtered = filtered.slice(off, off + lim);

  res.json({ logs: filtered, total });
});

export { addLog, agentRegistry };
export default router;
