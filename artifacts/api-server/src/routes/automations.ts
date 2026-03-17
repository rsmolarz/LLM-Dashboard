import { Router, type IRouter } from "express";
import { pushNotification } from "./notifications";

const router: IRouter = Router();

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

function scheduleAutomation(auto: Automation) {
  const existing = timers.get(auto.id);
  if (existing) clearInterval(existing);

  const ms = parseScheduleMs(auto.schedule);
  if (!ms || !auto.enabled) return;

  auto.nextRun = Date.now() + ms;

  const timer = setInterval(() => {
    auto.lastRun = Date.now();
    auto.runCount++;
    auto.nextRun = Date.now() + ms;
    pushNotification("info", `Automation ran: ${auto.name}`, `Type: ${auto.type}, Run #${auto.runCount}`);
  }, ms);

  timers.set(auto.id, timer);
}

router.get("/automations", (_req, res): void => {
  res.json({ automations });
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

router.post("/automations/:id/run", (req, res): void => {
  const auto = automations.find((a) => a.id === req.params.id);
  if (!auto) { res.status(404).json({ error: "Not found" }); return; }
  auto.lastRun = Date.now();
  auto.runCount++;
  pushNotification("info", `Manual run: ${auto.name}`, `Type: ${auto.type}, Run #${auto.runCount}`);
  res.json({ success: true, automation: auto });
});

export default router;
