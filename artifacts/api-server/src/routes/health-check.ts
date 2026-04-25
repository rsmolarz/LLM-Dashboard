import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vpsDatabaseConfigTable } from "@workspace/db/schema";
import { sandboxHelpers, type OsSandboxKind } from "../lib/command-sandbox";

const router: IRouter = Router();

interface SandboxStatus {
  posture: "kernel-jail" | "fallback";
  osIsolation: { kind: OsSandboxKind; bin: string } | null;
}

interface HealthRecord {
  timestamp: string;
  ollama: { status: "up" | "down"; latency: number; models?: number };
  vpsDb: { status: "up" | "down"; latency: number };
  localDb: { status: "up" | "down"; latency: number };
  sandbox: SandboxStatus;
}

const healthHistory: HealthRecord[] = [];
const MAX_HISTORY = 100;
let lastAlert: string | null = null;
const sseClients: Set<any> = new Set();

/**
 * Tracks whether we've already broadcast the boot-time "sandbox dropped to
 * fallback" alert. The OS-level helper detection in command-sandbox runs once
 * at module load, so the posture cannot change while the process is alive —
 * this flag exists purely to make the alert idempotent across the boot-time
 * call and any subsequent passes through `runHealthCheck`. A fresh process
 * that boots back into the kernel-jail posture simply never emits the alert,
 * which is how recovery surfaces to ops (no alert ⇒ healthy).
 */
let sandboxDegradedAlerted = false;

function getSandboxStatus(): SandboxStatus {
  const os = sandboxHelpers.osIsolation;
  return {
    posture: os ? "kernel-jail" : "fallback",
    osIsolation: os ? { kind: os.kind, bin: os.bin } : null,
  };
}

/**
 * Emit an alert when production has booted without a kernel-enforced
 * Workbench sandbox helper (bwrap/firejail/nsjail). This is the case the
 * Monitor admin panel was added to surface — a host migration that strips
 * bubblewrap or disables unprivileged user namespaces silently demotes the
 * shell to the path-validation-only fallback. Without a push alert the
 * regression is invisible until somebody manually loads the Monitor page.
 *
 * Behaviour:
 *  - In production (NODE_ENV=production), if `sandboxHelpers.osIsolation`
 *    is null, broadcast a `sandbox_degraded` event on the health SSE
 *    stream exactly once per process. The event mirrors the structure of
 *    the existing `health_alert` payload so any subscriber that already
 *    knows how to render service-down alerts can render this one too.
 *  - Outside production we never alert — local dev hosts routinely lack
 *    bwrap/firejail/nsjail and that's expected, not a regression.
 *  - Recovery is implicit: detection runs at module load, so a later
 *    restart that finds a working helper simply never emits the alert,
 *    and no `lastAlert` recovery message is required. We DO clear
 *    `sandboxDegradedAlerted` on the kernel-jail path so that if
 *    something synthesises the alert in tests and then restores the
 *    helper, the flag matches the live posture.
 */
export function notifySandboxPosture(): void {
  const isProd = process.env.NODE_ENV === "production";
  const sandbox = getSandboxStatus();

  if (sandbox.posture === "kernel-jail") {
    sandboxDegradedAlerted = false;
    return;
  }

  if (!isProd) return;
  if (sandboxDegradedAlerted) return;

  sandboxDegradedAlerted = true;
  broadcastAlert({
    type: "sandbox_degraded",
    severity: "warning",
    message:
      "Workbench shell sandbox dropped to the path-validation fallback " +
      "(no working bwrap/firejail/nsjail helper detected at boot). " +
      "Install `bubblewrap` and ensure unprivileged user namespaces are " +
      "enabled on the host to restore the kernel-enforced jail.",
    sandbox,
    timestamp: new Date().toISOString(),
  });
}

/** Test-only hook to reset the once-per-process latch. */
export function _resetSandboxAlertForTests(): void {
  sandboxDegradedAlerted = false;
}

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

  // The OS sandbox helper is detected once at command-sandbox module load,
  // so this is a cheap read of a cached value (no syscall per check). We
  // include it in every record so the SSE / status / history endpoints all
  // reflect the same posture the boot-time alert reports on.
  const sandbox = getSandboxStatus();

  // Idempotent: re-run the boot-time alert check on every health pass so a
  // late SSE subscriber that connects after boot still has the alert
  // delivered (broadcastAlert only writes to currently-attached clients,
  // not a replay buffer). The `sandboxDegradedAlerted` latch ensures we
  // don't spam a re-broadcast every minute — the second call is a no-op.
  notifySandboxPosture();

  const record: HealthRecord = {
    timestamp: new Date().toISOString(),
    ollama,
    vpsDb,
    localDb,
    sandbox,
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
  // Sandbox posture rolls into "degraded" in production: a fallback host is
  // a real ops regression even if every backing service is otherwise up.
  // Outside production we don't penalise dev hosts that lack bwrap.
  const sandboxDegraded =
    process.env.NODE_ENV === "production" && record.sandbox.posture === "fallback";
  res.json({
    status: allUp && !sandboxDegraded ? "healthy" : "degraded",
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
  // Replay current sandbox posture so a Monitor page that opens after the
  // boot-time alert was broadcast still sees the degraded state without
  // having to wait for the next 60s health check tick to re-fire it.
  const sandbox = getSandboxStatus();
  if (
    sandbox.posture === "fallback" &&
    process.env.NODE_ENV === "production"
  ) {
    res.write(
      `data: ${JSON.stringify({
        type: "sandbox_degraded",
        severity: "warning",
        replay: true,
        message:
          "Workbench shell sandbox is currently running on the path-validation fallback.",
        sandbox,
        timestamp: new Date().toISOString(),
      })}\n\n`,
    );
  }
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

startHealthMonitor(60000);

export default router;
