import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vpsDatabaseConfigTable, documentsTable, conversationsTable, chatMessagesTable } from "@workspace/db/schema";
import { getCollectorState } from "./auto-collector";
import { sql, count } from "drizzle-orm";
import { getRateLimitMetrics, getActiveWindows, requireAdmin } from "../middlewares/rateLimiter";
import { sandboxHelpers } from "../lib/command-sandbox";

const router: IRouter = Router();

router.use("/monitor", requireAdmin);

/**
 * Snapshot of the OS-level sandbox posture detected at module load.
 *
 * `posture` is the at-a-glance summary ops cares about:
 *   - "kernel-jail": one of bwrap/firejail/nsjail passed the boot probe and
 *     is being prepended to every Workbench/git spawn, so writes outside
 *     the per-project cwd hit a private mount namespace (or fail with
 *     EROFS). This is the strong jail.
 *   - "fallback": no helper passed the probe (e.g. host kernel blocks
 *     unprivileged user namespaces). The Workbench shell is still gated
 *     by the path-validation layer, but there is no kernel-enforced
 *     filesystem isolation. Production should never be in this state.
 *
 * `osIsolation`, `setpriv`, and `prlimit` mirror the same values the
 * boot log emits, so this endpoint is a faithful at-a-moment view of
 * what the server is actually serving traffic with — no need to dig
 * through Replit deploy logs or restart the process.
 */
function getSandboxPosture() {
  const os = sandboxHelpers.osIsolation;
  return {
    posture: os ? "kernel-jail" : "fallback",
    osIsolation: os
      ? { kind: os.kind, bin: os.bin }
      : null,
    setpriv: sandboxHelpers.setpriv,
    prlimit: sandboxHelpers.prlimit,
  } as const;
}

async function getVpsClient() {
  const [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);
  if (!config?.password || !config?.host) return null;
  const connectionString = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}${config.sslEnabled ? "?sslmode=require" : ""}`;
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  return client;
}

async function getOllamaStatus() {
  try {
    const { llmConfigTable } = await import("@workspace/db/schema");
    const [config] = await db.select().from(llmConfigTable).limit(1);
    const url = config?.serverUrl || process.env.VPS_OLLAMA_URL || "http://localhost:11434";

    const tagsResponse = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!tagsResponse.ok) throw new Error("Ollama not responding");
    const tagsRes = await tagsResponse.json();

    let psRes = null;
    try {
      const psResponse = await fetch(`${url}/api/ps`, { signal: AbortSignal.timeout(5000) });
      if (psResponse.ok) psRes = await psResponse.json();
    } catch {}

    const models = (tagsRes?.models || []).map((m: any) => ({
      name: m.name,
      size: m.size,
      sizeGb: parseFloat((m.size / 1e9).toFixed(1)),
      modified: m.modified_at,
      family: m.details?.family,
      parameterSize: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
    }));

    const running = (psRes?.models || []).map((m: any) => ({
      name: m.name,
      sizeVram: m.size_vram,
      expiresAt: m.expires_at,
    }));

    return {
      online: true,
      url,
      models,
      totalModels: models.length,
      totalSizeGb: parseFloat(models.reduce((s: number, m: any) => s + m.sizeGb, 0).toFixed(1)),
      runningModels: running,
    };
  } catch {
    return { online: false, url: "", models: [], totalModels: 0, totalSizeGb: 0, runningModels: [] };
  }
}

async function getReplitDbStats() {
  let client: any = null;
  try {
    const { default: pg } = await import("pg");
    client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
    await client.connect();

    const tablesResult = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    const tableNames = tablesResult.rows.map((r: any) => r.tablename);

    const tableStats: Record<string, number> = {};
    let totalRows = 0;
    for (const t of tableNames) {
      try {
        const countResult = await client.query(`SELECT count(*) as c FROM "${t}"`);
        const c = parseInt(countResult.rows[0]?.c ?? "0");
        tableStats[t] = c;
        totalRows += c;
      } catch {}
    }

    const sizeResult = await client.query("SELECT pg_database_size(current_database()) as size");
    const sizeBytes = parseInt(sizeResult.rows[0]?.size ?? "0");

    return { tables: tableNames.length, totalRows, sizeBytes, sizeMb: parseFloat((sizeBytes / 1e6).toFixed(1)), tableStats };
  } catch (err: any) {
    return { tables: 0, totalRows: 0, sizeBytes: 0, sizeMb: 0, tableStats: {}, error: err?.message };
  } finally {
    if (client) try { await client.end(); } catch {}
  }
}

async function getVpsDbStats() {
  let client: any = null;
  try {
    client = await getVpsClient();
    if (!client) return { connected: false, tables: 0, totalRows: 0, sizeMb: 0 };

    const tablesResult = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    const tableNames = tablesResult.rows.map((r: any) => r.tablename);

    const tableStats: Record<string, number> = {};
    let totalRows = 0;
    for (const t of tableNames) {
      try {
        const countResult = await client.query(`SELECT count(*) as c FROM "${t}"`);
        const c = parseInt(countResult.rows[0]?.c ?? "0");
        tableStats[t] = c;
        totalRows += c;
      } catch {}
    }

    const sizeResult = await client.query("SELECT pg_database_size(current_database()) as size");
    const sizeBytes = parseInt(sizeResult.rows[0]?.size ?? "0");

    const lastBackup = await client.query(
      "SELECT backup_id, backup_timestamp, status, duration_ms FROM backup_snapshots ORDER BY backup_timestamp DESC LIMIT 1"
    ).catch(() => ({ rows: [] }));

    const trainingSources = await client.query(
      "SELECT status, count(*) as c FROM training_sources GROUP BY status"
    ).catch(() => ({ rows: [] }));

    return {
      connected: true,
      tables: tableNames.length,
      totalRows,
      sizeBytes,
      sizeMb: parseFloat((sizeBytes / 1e6).toFixed(1)),
      tableStats,
      lastBackup: lastBackup.rows[0] || null,
      trainingSources: trainingSources.rows.reduce((acc: Record<string, number>, r: any) => {
        acc[r.status] = parseInt(r.c);
        return acc;
      }, {}),
    };
  } catch (err: any) {
    return { connected: false, tables: 0, totalRows: 0, sizeMb: 0, error: err?.message };
  } finally {
    if (client) try { await client.end(); } catch {}
  }
}

async function getKnowledgeBaseStats() {
  try {
    const docs = await db.select({
      count: count(),
    }).from(documentsTable);

    const categories = await db.execute(sql`
      SELECT category, count(*) as c, sum(chunks_count) as chunks
      FROM documents
      GROUP BY category
      ORDER BY c DESC
    `);

    const totalDocs = docs[0]?.count ?? 0;
    const catRows = (categories as any).rows || categories;
    const totalChunks = catRows.reduce((s: number, r: any) => s + parseInt(r.chunks || "0"), 0);

    return {
      totalDocuments: totalDocs,
      totalChunks,
      categories: catRows.map((r: any) => ({
        category: r.category,
        documents: parseInt(r.c),
        chunks: parseInt(r.chunks || "0"),
      })),
    };
  } catch (err: any) {
    return { totalDocuments: 0, totalChunks: 0, categories: [], error: err?.message };
  }
}

async function getChatStats() {
  try {
    const convCount = await db.select({ count: count() }).from(conversationsTable);
    const msgCount = await db.select({ count: count() }).from(chatMessagesTable);
    return {
      conversations: convCount[0]?.count ?? 0,
      messages: msgCount[0]?.count ?? 0,
    };
  } catch {
    return { conversations: 0, messages: 0 };
  }
}

router.get("/monitor/dashboard", async (_req, res): Promise<void> => {
  try {
    const [collector, ollama, replitDb, vpsDb, knowledgeBase, chat] = await Promise.all([
      Promise.resolve(getCollectorState()),
      getOllamaStatus(),
      getReplitDbStats(),
      getVpsDbStats(),
      getKnowledgeBaseStats(),
      getChatStats(),
    ]);

    const nextRunIn = collector.enabled && collector.lastRunAt
      ? Math.max(0, collector.intervalMinutes * 60 - Math.floor((Date.now() - new Date(collector.lastRunAt).getTime()) / 1000))
      : null;

    res.json({
      timestamp: new Date().toISOString(),
      uptime: collector.serverStartedAt,
      collector: {
        ...collector,
        nextRunInSeconds: nextRunIn,
      },
      ollama,
      replitDb,
      vpsDb,
      knowledgeBase,
      chat,
      sandbox: getSandboxPosture(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Dashboard fetch failed" });
  }
});

/**
 * Admin-only at-a-glance view of the Workbench shell sandbox posture.
 *
 * Returns the same data the boot-time `[sandbox] OS-level isolation: ...`
 * log emits, so ops can confirm the running process is using the
 * kernel-enforced jail (bwrap/firejail/nsjail) rather than the
 * path-validation-only fallback — without restarting the server or
 * reading Replit deploy logs.
 */
router.get("/monitor/sandbox", (_req, res): void => {
  res.json(getSandboxPosture());
});

router.get("/monitor/rate-limits", async (_req, res): Promise<void> => {
  try {
    const metrics = getRateLimitMetrics();
    const activeWindows = getActiveWindows();
    const totalRequests = metrics.reduce((s, m) => s + m.totalRequests, 0);
    const totalRejected = metrics.reduce((s, m) => s + m.rejectedRequests, 0);

    res.json({
      activeWindows,
      totalRequests,
      totalRejected,
      overallAcceptRate: totalRequests > 0
        ? ((1 - totalRejected / totalRequests) * 100).toFixed(1) + "%"
        : "100%",
      endpoints: metrics,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Rate limit metrics failed" });
  }
});

export default router;
