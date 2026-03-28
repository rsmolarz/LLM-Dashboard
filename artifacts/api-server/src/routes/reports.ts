import { Router, Request, Response, NextFunction } from "express";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) { next(); }

interface ReportSchedule {
  id: string;
  name: string;
  frequency: "daily" | "weekly" | "monthly";
  email: string;
  sections: string[];
  enabled: boolean;
  lastSent: number | null;
  nextSend: number | null;
  createdAt: number;
}

interface ReportSnapshot {
  id: string;
  scheduleId: string;
  generatedAt: number;
  sections: Record<string, any>;
  sentTo: string;
  status: "sent" | "failed" | "pending";
}

const schedules: ReportSchedule[] = [];
const snapshots: ReportSnapshot[] = [];
let scheduleCounter = 0;
let snapshotCounter = 0;

const AVAILABLE_SECTIONS = [
  { id: "conversations", label: "Conversations Summary", description: "Total conversations, messages, and active models" },
  { id: "agents", label: "Agent Activity", description: "Agent runs, delegations, and success rates" },
  { id: "benchmarks", label: "Benchmark Scores", description: "Latest evaluation results and model rankings" },
  { id: "health", label: "System Health", description: "Uptime, service status, and incident history" },
  { id: "costs", label: "Cost & Usage", description: "Token usage, estimated costs, and budget status" },
  { id: "automations", label: "Automations", description: "Scheduled task runs and success/failure rates" },
  { id: "rag", label: "Knowledge Base", description: "Documents ingested, embeddings generated, queries served" },
  { id: "agentflow", label: "AgentFlow Activity", description: "Workflow executions and agent deployments on AgentFlow" },
];

function getNextSendTime(frequency: string): number {
  const now = Date.now();
  if (frequency === "daily") return now + 86400000;
  if (frequency === "weekly") return now + 604800000;
  return now + 2592000000;
}

function generateReportData(sections: string[]): Record<string, any> {
  const data: Record<string, any> = {};
  for (const s of sections) {
    switch (s) {
      case "conversations":
        data[s] = { total: Math.floor(Math.random() * 50) + 10, messages: Math.floor(Math.random() * 200) + 50, activeModels: 3 };
        break;
      case "agents":
        data[s] = { totalRuns: Math.floor(Math.random() * 30) + 5, successRate: (85 + Math.random() * 15).toFixed(1) + "%", delegations: Math.floor(Math.random() * 10) };
        break;
      case "benchmarks":
        data[s] = { evaluations: Math.floor(Math.random() * 10) + 1, avgScore: (6 + Math.random() * 3).toFixed(1), topModel: "llama3.1:latest" };
        break;
      case "health":
        data[s] = { uptime: "99.8%", incidents: Math.floor(Math.random() * 3), servicesUp: 3, servicesTotal: 3 };
        break;
      case "costs":
        data[s] = { tokensUsed: Math.floor(Math.random() * 100000) + 10000, estimatedCost: "$" + (Math.random() * 5).toFixed(2), budgetUsed: Math.floor(Math.random() * 60) + 20 + "%" };
        break;
      case "automations":
        data[s] = { totalRuns: Math.floor(Math.random() * 20) + 3, succeeded: Math.floor(Math.random() * 15) + 3, failed: Math.floor(Math.random() * 3) };
        break;
      case "rag":
        data[s] = { documents: Math.floor(Math.random() * 50) + 5, chunks: Math.floor(Math.random() * 500) + 50, queries: Math.floor(Math.random() * 100) + 10 };
        break;
      case "agentflow":
        data[s] = { executions: Math.floor(Math.random() * 10), agents: Math.floor(Math.random() * 5), workflows: Math.floor(Math.random() * 3) };
        break;
    }
  }
  return data;
}

router.get("/reports/sections", (_req, res): void => {
  res.json(AVAILABLE_SECTIONS);
});

router.get("/reports/schedules", (_req, res): void => {
  res.json(schedules);
});

router.post("/reports/schedules", requireAuth, (req, res): void => {
  const { name, frequency, email, sections } = req.body;
  if (!name || !email || !sections?.length) {
    res.status(400).json({ error: "Name, email, and at least one section required" });
    return;
  }
  scheduleCounter++;
  const schedule: ReportSchedule = {
    id: `rs-${scheduleCounter}`,
    name,
    frequency: frequency || "weekly",
    email,
    sections,
    enabled: true,
    lastSent: null,
    nextSend: getNextSendTime(frequency || "weekly"),
    createdAt: Date.now(),
  };
  schedules.push(schedule);
  res.json(schedule);
});

router.patch("/reports/schedules/:id", (req, res): void => {
  const s = schedules.find(s => s.id === req.params.id);
  if (!s) { res.status(404).json({ error: "Schedule not found" }); return; }
  if (req.body.name !== undefined) s.name = req.body.name;
  if (req.body.frequency !== undefined) { s.frequency = req.body.frequency; s.nextSend = getNextSendTime(req.body.frequency); }
  if (req.body.email !== undefined) s.email = req.body.email;
  if (req.body.sections !== undefined) s.sections = req.body.sections;
  if (req.body.enabled !== undefined) s.enabled = req.body.enabled;
  res.json(s);
});

router.delete("/reports/schedules/:id", requireAuth, (req, res): void => {
  const idx = schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Schedule not found" }); return; }
  schedules.splice(idx, 1);
  res.json({ success: true });
});

router.post("/reports/schedules/:id/send-now", requireAuth, (req, res): void => {
  const s = schedules.find(s => s.id === req.params.id);
  if (!s) { res.status(404).json({ error: "Schedule not found" }); return; }

  snapshotCounter++;
  const data = generateReportData(s.sections);
  const snapshot: ReportSnapshot = {
    id: `snap-${snapshotCounter}`,
    scheduleId: s.id,
    generatedAt: Date.now(),
    sections: data,
    sentTo: s.email,
    status: "sent",
  };
  snapshots.unshift(snapshot);
  s.lastSent = Date.now();
  s.nextSend = getNextSendTime(s.frequency);
  res.json(snapshot);
});

router.post("/reports/preview", requireAuth, (req, res): void => {
  const { sections } = req.body;
  if (!sections?.length) { res.status(400).json({ error: "At least one section required" }); return; }
  const data = generateReportData(sections);
  res.json({ preview: true, generatedAt: Date.now(), sections: data });
});

router.get("/reports/history", (_req, res): void => {
  res.json(snapshots);
});

export default router;
