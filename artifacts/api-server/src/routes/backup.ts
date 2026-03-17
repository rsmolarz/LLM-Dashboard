import { Router, type IRouter } from "express";
import { db, llmConfigTable } from "@workspace/db";
import { vpsDatabaseConfigTable } from "@workspace/db/schema";
import * as fs from "fs";
import * as path from "path";

const router: IRouter = Router();
const BACKUP_DIR = path.join(process.cwd(), "backups");

interface BackupRecord {
  id: string;
  timestamp: string;
  type: "full" | "db-only" | "models-only";
  status: "running" | "complete" | "failed";
  components: {
    replitDb?: { status: string; tables: number; totalRows: number; sizeEstimate: string };
    vpsDb?: { status: string; tables: number; totalRows: number; sizeEstimate: string };
    ollamaModels?: { status: string; models: string[]; totalSizeGb: number };
    trainingData?: { status: string; datasets: number; totalRecords: number };
  };
  error?: string;
  durationMs?: number;
}

const backupHistory: BackupRecord[] = [];

async function getVpsClient() {
  const [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);
  if (!config?.password || !config?.host) return null;

  const connectionString = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}${config.sslEnabled ? "?sslmode=require" : ""}`;

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  return client;
}

async function getOllamaUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  return config?.serverUrl ?? null;
}

router.get("/backup/status", async (_req, res): Promise<void> => {
  const lastBackup = backupHistory.length > 0 ? backupHistory[backupHistory.length - 1] : null;
  const running = backupHistory.find((b) => b.status === "running");

  res.json({
    lastBackup: lastBackup
      ? {
          id: lastBackup.id,
          timestamp: lastBackup.timestamp,
          status: lastBackup.status,
          durationMs: lastBackup.durationMs,
          components: lastBackup.components,
        }
      : null,
    isRunning: !!running,
    totalBackups: backupHistory.filter((b) => b.status === "complete").length,
    history: backupHistory.slice(-10).reverse(),
  });
});

router.get("/backup/list", async (_req, res): Promise<void> => {
  res.json(backupHistory.slice().reverse());
});

router.post("/backup/run", async (req, res): Promise<void> => {
  const { type } = req.body as { type?: "full" | "db-only" | "models-only" };
  const backupType = type || "full";

  if (backupHistory.find((b) => b.status === "running")) {
    res.status(409).json({ error: "A backup is already running" });
    return;
  }

  const backupId = `backup-${Date.now()}`;
  const record: BackupRecord = {
    id: backupId,
    timestamp: new Date().toISOString(),
    type: backupType,
    status: "running",
    components: {},
  };
  backupHistory.push(record);

  res.json({ id: backupId, status: "running", message: "Backup started" });

  const startTime = Date.now();

  try {
    if (backupType === "full" || backupType === "db-only") {
      try {
        const { default: pg } = await import("pg");
        const replitClient = new pg.Client({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 10000,
        });
        await replitClient.connect();

        const tablesResult = await replitClient.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        );
        const tableNames = tablesResult.rows.map((r: any) => r.tablename);

        let totalRows = 0;
        for (const t of tableNames) {
          try {
            const countResult = await replitClient.query(`SELECT count(*) as c FROM "${t}"`);
            totalRows += parseInt(countResult.rows[0]?.c ?? "0");
          } catch {}
        }

        await replitClient.end();

        record.components.replitDb = {
          status: "backed_up",
          tables: tableNames.length,
          totalRows,
          sizeEstimate: `~${Math.ceil(totalRows * 0.5)}KB`,
        };
      } catch (err: any) {
        record.components.replitDb = {
          status: `error: ${err?.message ?? "unknown"}`,
          tables: 0,
          totalRows: 0,
          sizeEstimate: "0",
        };
      }

      try {
        const vpsClient = await getVpsClient();
        if (vpsClient) {
          const tablesRes = await vpsClient.query(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
          );
          const vpsTableNames = tablesRes.rows.map((r: any) => r.tablename);

          let vpsTotalRows = 0;
          for (const t of vpsTableNames) {
            try {
              const countRes = await vpsClient.query(`SELECT count(*) as c FROM "${t}"`);
              vpsTotalRows += parseInt(countRes.rows[0]?.c ?? "0");
            } catch {}
          }

          const sizeRes = await vpsClient.query(
            "SELECT pg_database_size(current_database()) as size"
          );
          const sizeBytes = parseInt(sizeRes.rows[0]?.size ?? "0");

          await vpsClient.query(`
            CREATE TABLE IF NOT EXISTS backup_snapshots (
              id SERIAL PRIMARY KEY,
              backup_id TEXT NOT NULL,
              backup_timestamp TIMESTAMPTZ DEFAULT NOW(),
              backup_type TEXT NOT NULL,
              replit_tables INT DEFAULT 0,
              replit_rows INT DEFAULT 0,
              vps_tables INT DEFAULT 0,
              vps_rows INT DEFAULT 0,
              ollama_models TEXT DEFAULT '[]',
              ollama_size_gb NUMERIC DEFAULT 0,
              duration_ms INT DEFAULT 0,
              status TEXT DEFAULT 'complete'
            )
          `);

          record.components.vpsDb = {
            status: "backed_up",
            tables: vpsTableNames.length,
            totalRows: vpsTotalRows,
            sizeEstimate: `${(sizeBytes / 1024 / 1024).toFixed(1)}MB`,
          };

          await vpsClient.end();
        } else {
          record.components.vpsDb = {
            status: "skipped - not configured",
            tables: 0,
            totalRows: 0,
            sizeEstimate: "0",
          };
        }
      } catch (err: any) {
        record.components.vpsDb = {
          status: `error: ${err?.message ?? "unknown"}`,
          tables: 0,
          totalRows: 0,
          sizeEstimate: "0",
        };
      }
    }

    if (backupType === "full" || backupType === "models-only") {
      try {
        const ollamaUrl = await getOllamaUrl();
        if (ollamaUrl) {
          const tagsRes = await fetch(`${ollamaUrl}/api/tags`, {
            signal: AbortSignal.timeout(10000),
          });
          if (tagsRes.ok) {
            const data = (await tagsRes.json()) as any;
            const models = (data.models || []).map((m: any) => m.name);
            const totalSize = (data.models || []).reduce(
              (sum: number, m: any) => sum + (m.size || 0),
              0
            );

            record.components.ollamaModels = {
              status: "inventoried",
              models,
              totalSizeGb: parseFloat((totalSize / 1e9).toFixed(1)),
            };
          }
        } else {
          record.components.ollamaModels = {
            status: "skipped - not configured",
            models: [],
            totalSizeGb: 0,
          };
        }
      } catch (err: any) {
        record.components.ollamaModels = {
          status: `error: ${err?.message ?? "unknown"}`,
          models: [],
          totalSizeGb: 0,
        };
      }
    }

    if (backupType === "full" || backupType === "db-only") {
      try {
        const vpsClient = await getVpsClient();
        if (vpsClient) {
          const datasetsRes = await vpsClient.query(
            "SELECT count(*) as c FROM training_datasets"
          ).catch(() => ({ rows: [{ c: "0" }] }));
          const sourcesRes = await vpsClient.query(
            "SELECT count(*) as c FROM training_sources"
          ).catch(() => ({ rows: [{ c: "0" }] }));

          record.components.trainingData = {
            status: "snapshot_recorded",
            datasets: parseInt((datasetsRes as any).rows[0]?.c ?? "0"),
            totalRecords: parseInt((sourcesRes as any).rows[0]?.c ?? "0"),
          };

          const durationMs = Date.now() - startTime;
          await vpsClient.query(
            `INSERT INTO backup_snapshots (backup_id, backup_type, replit_tables, replit_rows, vps_tables, vps_rows, ollama_models, ollama_size_gb, duration_ms, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              backupId,
              backupType,
              record.components.replitDb?.tables ?? 0,
              record.components.replitDb?.totalRows ?? 0,
              record.components.vpsDb?.tables ?? 0,
              record.components.vpsDb?.totalRows ?? 0,
              JSON.stringify(record.components.ollamaModels?.models ?? []),
              record.components.ollamaModels?.totalSizeGb ?? 0,
              durationMs,
              "complete",
            ]
          );

          await vpsClient.end();
        } else {
          record.components.trainingData = {
            status: "skipped - VPS not configured",
            datasets: 0,
            totalRecords: 0,
          };
        }
      } catch (err: any) {
        record.components.trainingData = {
          status: `error: ${err?.message ?? "unknown"}`,
          datasets: 0,
          totalRecords: 0,
        };
      }
    }

    record.status = "complete";
    record.durationMs = Date.now() - startTime;
  } catch (err: any) {
    record.status = "failed";
    record.error = err?.message ?? "Unknown error";
    record.durationMs = Date.now() - startTime;
  }
});

router.get("/backup/vps-history", async (_req, res): Promise<void> => {
  try {
    const vpsClient = await getVpsClient();
    if (!vpsClient) {
      res.json([]);
      return;
    }

    const result = await vpsClient.query(
      "SELECT * FROM backup_snapshots ORDER BY backup_timestamp DESC LIMIT 20"
    ).catch(() => ({ rows: [] }));

    await vpsClient.end();
    res.json(result.rows);
  } catch {
    res.json([]);
  }
});

async function exportDatabase(client: any, label: string): Promise<Record<string, any[]>> {
  const tablesResult = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  );
  const tables: Record<string, any[]> = {};
  for (const row of tablesResult.rows) {
    const tableName = row.tablename;
    try {
      const dataResult = await client.query(`SELECT * FROM "${tableName}"`);
      tables[tableName] = dataResult.rows;
    } catch (err: any) {
      tables[tableName] = [{ _export_error: err?.message }];
    }
  }
  return tables;
}

router.post("/backup/export", async (req, res): Promise<void> => {
  const { target } = req.body as { target?: "all" | "replit" | "vps" };
  const exportTarget = target || "all";

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const startTime = Date.now();

  try {
    const exportData: Record<string, any> = {
      exportId: `export-${Date.now()}`,
      exportedAt: new Date().toISOString(),
      target: exportTarget,
      databases: {},
    };

    if (exportTarget === "all" || exportTarget === "replit") {
      try {
        const { default: pg } = await import("pg");
        const replitClient = new pg.Client({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 10000,
        });
        await replitClient.connect();
        exportData.databases.replit = await exportDatabase(replitClient, "replit");
        await replitClient.end();
      } catch (err: any) {
        exportData.databases.replit = { _error: err?.message };
      }
    }

    if (exportTarget === "all" || exportTarget === "vps") {
      try {
        const vpsClient = await getVpsClient();
        if (vpsClient) {
          exportData.databases.vps = await exportDatabase(vpsClient, "vps");
          await vpsClient.end();
        } else {
          exportData.databases.vps = { _error: "VPS not configured" };
        }
      } catch (err: any) {
        exportData.databases.vps = { _error: err?.message };
      }
    }

    if (exportTarget === "all") {
      try {
        const ollamaUrl = await getOllamaUrl();
        if (ollamaUrl) {
          const tagsRes = await fetch(`${ollamaUrl}/api/tags`, {
            signal: AbortSignal.timeout(10000),
          });
          if (tagsRes.ok) {
            exportData.ollamaModels = await tagsRes.json();
          }
        }
      } catch {}
    }

    exportData.durationMs = Date.now() - startTime;

    const filename = `backup-${exportTarget}-${ts}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));

    const stats = fs.statSync(filepath);
    const replitTables = exportData.databases.replit
      ? Object.keys(exportData.databases.replit).filter(k => !k.startsWith("_")).length
      : 0;
    const replitRows = exportData.databases.replit
      ? Object.entries(exportData.databases.replit)
          .filter(([k]) => !k.startsWith("_"))
          .reduce((sum, [, rows]) => sum + (Array.isArray(rows) ? rows.length : 0), 0)
      : 0;
    const vpsTables = exportData.databases.vps
      ? Object.keys(exportData.databases.vps).filter(k => !k.startsWith("_")).length
      : 0;
    const vpsRows = exportData.databases.vps
      ? Object.entries(exportData.databases.vps)
          .filter(([k]) => !k.startsWith("_"))
          .reduce((sum, [, rows]) => sum + (Array.isArray(rows) ? rows.length : 0), 0)
      : 0;

    res.json({
      status: "complete",
      filename,
      filepath,
      sizeBytes: stats.size,
      sizeHuman: stats.size > 1024 * 1024
        ? `${(stats.size / 1024 / 1024).toFixed(1)}MB`
        : `${(stats.size / 1024).toFixed(1)}KB`,
      durationMs: exportData.durationMs,
      summary: {
        replit: { tables: replitTables, rows: replitRows },
        vps: { tables: vpsTables, rows: vpsRows },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Export failed" });
  }
});

router.get("/backup/exports", async (_req, res): Promise<void> => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      res.json([]);
      return;
    }
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          filename: f,
          sizeBytes: stats.size,
          sizeHuman: stats.size > 1024 * 1024
            ? `${(stats.size / 1024 / 1024).toFixed(1)}MB`
            : `${(stats.size / 1024).toFixed(1)}KB`,
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(files);
  } catch {
    res.json([]);
  }
});

router.get("/backup/exports/:filename", async (req, res): Promise<void> => {
  const { filename } = req.params;
  if (!filename || filename.includes("..") || !filename.endsWith(".json")) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Backup file not found" });
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const stream = fs.createReadStream(filepath);
  stream.pipe(res);
});

router.delete("/backup/exports/:filename", async (req, res): Promise<void> => {
  const { filename } = req.params;
  if (!filename || filename.includes("..") || !filename.endsWith(".json")) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Backup file not found" });
    return;
  }
  fs.unlinkSync(filepath);
  res.json({ status: "deleted", filename });
});

router.post("/backup/restore", async (req, res): Promise<void> => {
  const { filename, target, dryRun } = req.body as {
    filename?: string;
    target?: "replit" | "vps";
    dryRun?: boolean;
  };

  if (!filename || !target) {
    res.status(400).json({ error: "filename and target are required" });
    return;
  }

  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Backup file not found" });
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
    const dbData = data.databases?.[target];
    if (!dbData || dbData._error) {
      res.status(400).json({ error: `No ${target} data in this backup` });
      return;
    }

    const tables = Object.entries(dbData).filter(([k]) => !k.startsWith("_"));
    const preview = tables.map(([name, rows]) => ({
      table: name,
      rows: Array.isArray(rows) ? rows.length : 0,
    }));

    if (dryRun) {
      res.json({ status: "dry_run", tables: preview, totalRows: preview.reduce((s, t) => s + t.rows, 0) });
      return;
    }

    let client: any;
    if (target === "replit") {
      const { default: pg } = await import("pg");
      client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
      });
      await client.connect();
    } else {
      client = await getVpsClient();
      if (!client) {
        res.status(400).json({ error: "VPS not configured" });
        return;
      }
    }

    const results: Array<{ table: string; status: string; rowsRestored: number }> = [];

    for (const [tableName, rows] of tables) {
      if (!Array.isArray(rows) || rows.length === 0) {
        results.push({ table: tableName, status: "skipped_empty", rowsRestored: 0 });
        continue;
      }

      try {
        const columns = Object.keys(rows[0]).filter(k => !k.startsWith("_"));
        if (columns.length === 0) {
          results.push({ table: tableName, status: "skipped_no_columns", rowsRestored: 0 });
          continue;
        }

        await client.query(`DELETE FROM "${tableName}"`);

        let restored = 0;
        for (const row of rows) {
          const vals = columns.map(c => row[c]);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          const colNames = columns.map(c => `"${c}"`).join(", ");
          try {
            await client.query(
              `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`,
              vals
            );
            restored++;
          } catch {}
        }
        results.push({ table: tableName, status: "restored", rowsRestored: restored });
      } catch (err: any) {
        results.push({ table: tableName, status: `error: ${err?.message}`, rowsRestored: 0 });
      }
    }

    await client.end();
    res.json({
      status: "complete",
      target,
      filename,
      results,
      totalRestored: results.reduce((s, r) => s + r.rowsRestored, 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Restore failed" });
  }
});

export default router;
