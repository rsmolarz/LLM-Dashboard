import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vpsDatabaseConfigTable } from "@workspace/db/schema";

const router: IRouter = Router();

interface HealthRecord {
  timestamp: string;
  ollama: { status: "up" | "down"; latency: number; models?: number };
  vpsDb: { status: "up" | "down"; latency: number };
  localDb: { status: "up" | "down"; latency: number };
}

const healthHistory: HealthRecord[] = [];
const MAX_HISTORY = 100;
let lastAlert: string | null = null;
const sseClients: Set<any> = new Set();

async function checkOllama(): Promise<{ status: "up" | "down"; latency: number; models?: number }> {
  const start = Date.now();
  try {
    const { llmConfigTable } = await import("@workspace/db/schema");
    const [config] = await db.select().from(llmConfigTable).limit(1);
    const url = config?.serverUrl || process.env.VPS_OLLAMA_URL || "http://72.60.167.64:11434";
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("not ok");
    const data = await res.json();
    return { status: "up", latency: Date.now() - start, models: data.models?.length || 0 };
  } catch {
    return { status: "down", latency: Date.now() - start };
  }
}

async function checkVpsDb(): Promise<{ status: "up" | "down"; latency: number }> {
  const start = Date.now();
  try {
    const [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);
    if (!config?.password || !config?.host) return { status: "down", latency: 0 };
    const connStr = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}${config.sslEnabled ? "?sslmode=require" : ""}`;
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: connStr, connectionTimeoutMillis: 8000 });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return { status: "up", latency: Date.now() - start };
  } catch {
    return { status: "down", latency: Date.now() - start };
  }
}

async function checkLocalDb(): Promise<{ status: "up" | "down"; latency: number }> {
  const start = Date.now();
  try {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    return { status: "up", latency: Date.now() - start };
  } catch {
    return { status: "down", latency: Date.now() - start };
  }
}

async function runHealthCheck(): Promise<HealthRecord> {
  const [ollama, vpsDb, localDb] = await Promise.all([
    checkOllama(),
    checkVpsDb(),
    checkLocalDb(),
  ]);

  const record: HealthRecord = {
    timestamp: new Date().toISOString(),
    ollama,
    vpsDb,
    localDb,
  };

  healthHistory.push(record);
  if (healthHistory.length > MAX_HISTORY) healthHistory.shift();

  const downServices = [];
  if (ollama.status === "down") downServices.push("Ollama");
  if (vpsDb.status === "down") downServices.push("VPS Database");
  if (localDb.status === "down") downServices.push("Local Database");

  if (downServices.length > 0) {
    const alertMsg = `Services down: ${downServices.join(", ")}`;
    if (alertMsg !== lastAlert) {
      lastAlert = alertMsg;
      broadcastAlert({
        type: "health_alert",
        message: alertMsg,
        services: downServices,
        timestamp: record.timestamp,
      });
    }
  } else {
    if (lastAlert) {
      broadcastAlert({
        type: "health_recovered",
        message: "All services are back online",
        timestamp: record.timestamp,
      });
      lastAlert = null;
    }
  }

  return record;
}

function broadcastAlert(data: any) {
  for (const client of sseClients) {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

let healthInterval: NodeJS.Timeout | null = null;

function startHealthMonitor(intervalMs = 60000) {
  if (healthInterval) clearInterval(healthInterval);
  runHealthCheck();
  healthInterval = setInterval(() => runHealthCheck(), intervalMs);
  console.log(`[health-monitor] Started. Checking every ${intervalMs / 1000}s`);
}

router.get("/health/status", async (_req, res) => {
  const record = await runHealthCheck();
  const allUp = record.ollama.status === "up" && record.vpsDb.status === "up" && record.localDb.status === "up";
  res.json({
    status: allUp ? "healthy" : "degraded",
    ...record,
  });
});

router.get("/health/history", (_req, res) => {
  res.json({
    records: healthHistory.slice(-50),
    total: healthHistory.length,
  });
});

router.get("/health/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

startHealthMonitor(60000);

export default router;
