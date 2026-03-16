import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vpsDatabaseConfigTable } from "@workspace/db/schema";

const router: IRouter = Router();

async function getVpsClient() {
  const [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);
  if (!config || !config.password || !config.isActive) {
    return null;
  }
  const connectionString = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}${config.sslEnabled ? "?sslmode=require" : ""}`;
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  return client;
}

router.post("/vps-training/init", async (_req, res): Promise<void> => {
  let client;
  try {
    client = await getVpsClient();
    if (!client) {
      res.status(400).json({ success: false, error: "VPS database not configured or not active" });
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS training_sources (
        id SERIAL PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        sender TEXT DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        content_preview TEXT DEFAULT '',
        metadata JSONB DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'collected',
        quality INTEGER DEFAULT 0,
        collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        UNIQUE(source_type, source_id)
      );

      CREATE TABLE IF NOT EXISTS training_datasets (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        format TEXT NOT NULL DEFAULT 'openai',
        source_filter TEXT DEFAULT '',
        min_quality INTEGER DEFAULT 0,
        entry_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_training_sources_type ON training_sources(source_type);
      CREATE INDEX IF NOT EXISTS idx_training_sources_status ON training_sources(status);
      CREATE INDEX IF NOT EXISTS idx_training_sources_quality ON training_sources(quality);
    `);

    await client.end();
    res.json({ success: true, message: "VPS training tables initialized successfully" });
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    res.status(500).json({ success: false, error: err?.message || "Failed to initialize tables" });
  }
});

const VALID_STATUSES = ["collected", "reviewed", "processed", "rejected"];
const VALID_SOURCE_TYPES = ["gmail", "drive", "web", "manual"];
const VALID_EXPORT_FORMATS = ["openai", "alpaca", "raw"];

router.get("/vps-training/sources", async (req, res): Promise<void> => {
  let client;
  try {
    client = await getVpsClient();
    if (!client) {
      res.status(400).json({ error: "VPS database not configured or not active" });
      return;
    }

    const sourceType = req.query.source_type as string | undefined;
    const status = req.query.status as string | undefined;
    if (sourceType && !VALID_SOURCE_TYPES.includes(sourceType)) {
      res.status(400).json({ error: `Invalid source_type. Must be one of: ${VALID_SOURCE_TYPES.join(", ")}` });
      return;
    }
    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
      return;
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    let where = "WHERE 1=1";
    const params: any[] = [];
    let paramIdx = 1;

    if (sourceType) {
      where += ` AND source_type = $${paramIdx++}`;
      params.push(sourceType);
    }
    if (status) {
      where += ` AND status = $${paramIdx++}`;
      params.push(status);
    }

    const countResult = await client.query(`SELECT COUNT(*) as total FROM training_sources ${where}`, params);
    const total = parseInt(countResult.rows[0].total);

    const result = await client.query(
      `SELECT id, source_type, source_id, title, sender, content_preview, status, quality, collected_at, processed_at, metadata
       FROM training_sources ${where}
       ORDER BY collected_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    await client.end();
    res.json({ sources: result.rows, total, limit, offset });
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    res.status(500).json({ error: err?.message || "Failed to fetch sources" });
  }
});

router.get("/vps-training/sources/:id", async (req, res): Promise<void> => {
  let client;
  try {
    client = await getVpsClient();
    if (!client) {
      res.status(400).json({ error: "VPS database not configured or not active" });
      return;
    }

    const result = await client.query(
      "SELECT * FROM training_sources WHERE id = $1",
      [parseInt(req.params.id)]
    );

    await client.end();

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    res.status(500).json({ error: err?.message || "Failed to fetch source" });
  }
});

router.post("/vps-training/sources", async (req, res): Promise<void> => {
  let client;
  try {
    client = await getVpsClient();
    if (!client) {
      res.status(400).json({ error: "VPS database not configured or not active" });
      return;
    }

    const items = Array.isArray(req.body) ? req.body : [req.body];
    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      try {
        await client.query(
          `INSERT INTO training_sources (source_type, source_id, title, sender, content, content_preview, metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (source_type, source_id) DO UPDATE SET
             content = EXCLUDED.content,
             content_preview = EXCLUDED.content_preview,
             metadata = EXCLUDED.metadata,
             collected_at = NOW()`,
          [
            item.source_type,
            item.source_id,
            item.title || "",
            item.sender || "",
            item.content || "",
            (item.content || "").slice(0, 500),
            JSON.stringify(item.metadata || {}),
            item.status || "collected",
          ]
        );
        inserted++;
      } catch {
        skipped++;
      }
    }

    await client.end();
    res.json({ success: true, inserted, skipped, total: items.length });
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    res.status(500).json({ error: err?.message || "Failed to save sources" });
  }
});

router.put("/vps-training/sources/:id", async (req, res): Promise<void> => {
  let client;
  try {
    client = await getVpsClient();
    if (!client) {
      res.status(400).json({ error: "VPS database not configured or not active" });
      return;
    }

    const { status, quality } = req.body;
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
      return;
    }
    if (quality !== undefined && (typeof quality !== "number" || quality < 0 || quality > 5)) {
      res.status(400).json({ error: "Quality must be a number between 0 and 5" });
      return;
    }
    const sets: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (status !== undefined) {
      sets.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (quality !== undefined) {
      sets.push(`quality = $${paramIdx++}`);
      params.push(quality);
    }
    if (status === "processed") {
      sets.push(`processed_at = NOW()`);
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    params.push(parseInt(req.params.id));
    const result = await client.query(
      `UPDATE training_sources SET ${sets.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    await client.end();

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    res.status(500).json({ error: err?.message || "Failed to update source" });
  }
});

router.delete("/vps-training/sources/:id", async (req, res): Promise<void> => {
  let client;
  try {
    client = await getVpsClient();
    if (!client) {
      res.status(400).json({ error: "VPS database not configured or not active" });
      return;
    }

    const result = await client.query("DELETE FROM training_sources WHERE id = $1 RETURNING id", [parseInt(req.params.id)]);
    await client.end();

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    res.sendStatus(204);
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    res.status(500).json({ error: err?.message || "Failed to delete source" });
  }
});

router.get("/vps-training/stats", async (_req, res): Promise<void> => {
  let client;
  try {
    client = await getVpsClient();
    if (!client) {
      res.status(400).json({ error: "VPS database not configured or not active" });
      return;
    }

    const totalResult = await client.query("SELECT COUNT(*) as total FROM training_sources");
    const byTypeResult = await client.query(
      "SELECT source_type, COUNT(*) as count FROM training_sources GROUP BY source_type ORDER BY count DESC"
    );
    const byStatusResult = await client.query(
      "SELECT status, COUNT(*) as count FROM training_sources GROUP BY status ORDER BY count DESC"
    );
    const avgQualityResult = await client.query(
      "SELECT COALESCE(AVG(quality), 0) as avg_quality FROM training_sources WHERE quality > 0"
    );
    const recentResult = await client.query(
      "SELECT collected_at FROM training_sources ORDER BY collected_at DESC LIMIT 1"
    );

    await client.end();

    const byType: Record<string, number> = {};
    for (const row of byTypeResult.rows) byType[row.source_type] = parseInt(row.count);
    const byStatus: Record<string, number> = {};
    for (const row of byStatusResult.rows) byStatus[row.status] = parseInt(row.count);

    res.json({
      total: parseInt(totalResult.rows[0].total),
      byType,
      byStatus,
      avgQuality: parseFloat(avgQualityResult.rows[0].avg_quality),
      lastCollected: recentResult.rows[0]?.collected_at || null,
    });
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    res.status(500).json({ error: err?.message || "Failed to fetch stats" });
  }
});

router.post("/vps-training/export", async (req, res): Promise<void> => {
  let client;
  try {
    client = await getVpsClient();
    if (!client) {
      res.status(400).json({ error: "VPS database not configured or not active" });
      return;
    }

    const { format = "openai", minQuality = 0, sourceType } = req.body;
    if (!VALID_EXPORT_FORMATS.includes(format)) {
      res.status(400).json({ error: `Invalid format. Must be one of: ${VALID_EXPORT_FORMATS.join(", ")}` });
      return;
    }

    let where = "WHERE status = 'processed'";
    const params: any[] = [];
    let paramIdx = 1;

    if (minQuality > 0) {
      where += ` AND quality >= $${paramIdx++}`;
      params.push(minQuality);
    }
    if (sourceType) {
      where += ` AND source_type = $${paramIdx++}`;
      params.push(sourceType);
    }

    const result = await client.query(`SELECT * FROM training_sources ${where} ORDER BY collected_at`, params);
    await client.end();

    let output: string;

    if (format === "alpaca") {
      output = result.rows.map((d: any) =>
        JSON.stringify({
          instruction: `Analyze this ${d.source_type} content from "${d.title}"`,
          input: d.content,
          output: `This is a ${d.source_type} item titled "${d.title}" from ${d.sender || "unknown source"}. ${d.content_preview}`,
        })
      ).join("\n");
    } else if (format === "raw") {
      output = result.rows.map((d: any) =>
        JSON.stringify({
          source_type: d.source_type,
          title: d.title,
          sender: d.sender,
          content: d.content,
          metadata: d.metadata,
          collected_at: d.collected_at,
        })
      ).join("\n");
    } else {
      output = result.rows.map((d: any) =>
        JSON.stringify({
          messages: [
            { role: "system", content: `You are analyzing ${d.source_type} content.` },
            { role: "user", content: `Summarize this ${d.source_type}: "${d.title}"\n\n${d.content}` },
            { role: "assistant", content: `This is a ${d.source_type} from ${d.sender || "unknown"}. ${d.content_preview}` },
          ],
        })
      ).join("\n");
    }

    res.setHeader("Content-Type", "application/jsonl");
    res.setHeader("Content-Disposition", `attachment; filename=vps-training-${format}.jsonl`);
    res.send(output);
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    res.status(500).json({ error: err?.message || "Failed to export" });
  }
});

export default router;
