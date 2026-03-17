import { Router, type IRouter } from "express";
import { pushNotification } from "./notifications";

const router: IRouter = Router();

interface AutomationRun {
  id: string;
  automationId: string;
  runNumber: number;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "success" | "error";
  result: string | null;
  durationMs: number | null;
}

interface Automation {
  id: string;
  name: string;
  type: "research" | "training" | "agent-task" | "backup" | "benchmark";
  config: Record<string, any>;
  schedule: string;
  enabled: boolean;
  lastRun: number | null;
  nextRun: number | null;
  runCount: number;
  createdAt: number;
}

const automations: Automation[] = [];
const timers: Map<string, ReturnType<typeof setInterval>> = new Map();
const executionHistory: AutomationRun[] = [];
let autoCounter = 0;

function parseScheduleMs(schedule: string): number | null {
  const match = schedule.match(/^every\s+(\d+)\s*(min|hour|day)s?$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "min") return value * 60 * 1000;
  if (unit === "hour") return value * 60 * 60 * 1000;
  if (unit === "day") return value * 24 * 60 * 60 * 1000;
  return null;
}

async function executeAutomationAction(auto: Automation): Promise<string> {
  const API_BASE = `http://localhost:${process.env.PORT || 3000}/api`;

  switch (auto.type) {
    case "backup": {
      const res = await fetch(`${API_BASE}/backup/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: auto.config.target || "all" }),
      });
      const data = await res.json() as any;
      return `Backup export completed: ${data.filename || "unknown"} (${data.sizeHuman || "?"})`;
    }

    case "research": {
      const prompt = auto.config.prompt || "Summarize recent AI developments";
      const res = await fetch(`${API_BASE}/research/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: auto.config.mode || "deep" }),
      });
      if (!res.ok) throw new Error(`Research failed: ${res.status}`);
      return `Research task started for: "${prompt.slice(0, 80)}"`;
    }

    case "training": {
      const res = await fetch(`${API_BASE}/auto-collector/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json() as any;
      return `Auto-collector run completed: ${data.message || "done"}`;
    }

    case "benchmark": {
      const res = await fetch(`${API_BASE}/model-evolution/benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          models: auto.config.models || [],
          prompt: auto.config.prompt || "Explain the concept of machine learning in simple terms.",
        }),
      });
      const data = await res.json() as any;
      return `Benchmark completed: ${data.results?.length || 0} models tested`;
    }

    case "agent-task": {
      const res = await fetch(`${API_BASE}/openclaw/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: auto.config.title || auto.name,
          description: auto.config.description || "Automated task",
          priority: auto.config.priority || "medium",
          category: auto.config.category || "general",
        }),
      });
      const data = await res.json() as any;
      return `Agent task created: ${data.title || auto.name} (ID: ${data.id || "?"})`;
    }

    default:
      return `Unknown automation type: ${auto.type}`;
  }
}

async function runAutomation(auto: Automation) {
  const startTime = Date.now();
  const run: AutomationRun = {
    id: `run-${Date.now()}`,
    automationId: auto.id,
    runNumber: auto.runCount + 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    result: null,
    durationMs: null,
  };
  executionHistory.push(run);
  if (executionHistory.length > 200) executionHistory.shift();

  auto.lastRun = Date.now();
  auto.runCount++;

  try {
    const result = await executeAutomationAction(auto);
    run.status = "success";
    run.result = result;
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - startTime;
    pushNotification("success", `Automation completed: ${auto.name}`, result);
  } catch (err: any) {
    run.status = "error";
    run.result = err?.message || "Unknown error";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - startTime;
    pushNotification("error", `Automation failed: ${auto.name}`, run.result!);
  }
}

function scheduleAutomation(auto: Automation) {
  const existing = timers.get(auto.id);
  if (existing) clearInterval(existing);

  const ms = parseScheduleMs(auto.schedule);
  if (!ms || !auto.enabled) return;

  auto.nextRun = Date.now() + ms;

  const timer = setInterval(async () => {
    auto.nextRun = Date.now() + ms;
    await runAutomation(auto);
  }, ms);

  timers.set(auto.id, timer);
}

router.get("/automations", (_req, res): void => {
  res.json({ automations });
});

router.get("/automations/history", (_req, res): void => {
  res.json({ history: executionHistory.slice().reverse() });
});

router.post("/automations", (req, res): void => {
  const { name, type, config, schedule, enabled } = req.body;
  if (!name || !type || !schedule) {
    res.status(400).json({ error: "name, type, and schedule are required" });
    return;
  }

  const ms = parseScheduleMs(schedule);
  if (!ms) {
    res.status(400).json({ error: "Invalid schedule format. Use: every N min/hour/day" });
    return;
  }

  const auto: Automation = {
    id: `auto-${++autoCounter}`,
    name,
    type,
    config: config || {},
    schedule,
    enabled: enabled !== false,
    lastRun: null,
    nextRun: null,
    runCount: 0,
    createdAt: Date.now(),
  };

  automations.push(auto);
  if (auto.enabled) scheduleAutomation(auto);
  pushNotification("success", "Automation created", `${name} scheduled: ${schedule}`);
  res.json({ automation: auto });
});

router.patch("/automations/:id", (req, res): void => {
  const auto = automations.find((a) => a.id === req.params.id);
  if (!auto) { res.status(404).json({ error: "Not found" }); return; }

  if (req.body.name) auto.name = req.body.name;
  if (req.body.schedule) auto.schedule = req.body.schedule;
  if (req.body.config) auto.config = req.body.config;
  if (typeof req.body.enabled === "boolean") {
    auto.enabled = req.body.enabled;
    if (auto.enabled) scheduleAutomation(auto);
    else {
      const t = timers.get(auto.id);
      if (t) { clearInterval(t); timers.delete(auto.id); }
      auto.nextRun = null;
    }
  }
  res.json({ automation: auto });
});

router.delete("/automations/:id", (req, res): void => {
  const idx = automations.findIndex((a) => a.id === req.params.id);
  if (idx < 0) { res.status(404).json({ error: "Not found" }); return; }
  const t = timers.get(automations[idx].id);
  if (t) { clearInterval(t); timers.delete(automations[idx].id); }
  automations.splice(idx, 1);
  res.json({ success: true });
});

router.post("/automations/:id/run", async (req, res): Promise<void> => {
  const auto = automations.find((a) => a.id === req.params.id);
  if (!auto) { res.status(404).json({ error: "Not found" }); return; }
  await runAutomation(auto);
  res.json({ success: true, automation: auto });
});

export default router;
