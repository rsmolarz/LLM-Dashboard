import { Router, type IRouter } from "express";
import { driveProxyJson, driveProxyText } from "./google-clients";
import { Client } from "pg";

const router: IRouter = Router();

const VPS_DB_CONFIG = {
  host: process.env.VPS_DB_HOST,
  port: parseInt(process.env.VPS_DB_PORT || "5432"),
  database: process.env.VPS_DB_NAME,
  user: process.env.VPS_DB_USER,
  password: process.env.VPS_DB_PASSWORD,
  ssl: false,
  connectionTimeoutMillis: 10000,
};

const OLLAMA_BASE = process.env.VPS_OLLAMA_URL || "http://localhost:11434";

interface BrainSource {
  id: string;
  type: "drive" | "notion" | "manual";
  name: string;
  external_id: string;
  mime_type?: string;
  content?: string;
  chunks: number;
  training_pairs: number;
  status: "pending" | "indexed" | "processing" | "error";
  last_synced?: string;
  error?: string;
}

async function ensureBrainTable() {
  const client = new Client(VPS_DB_CONFIG);
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS brain_sources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        external_id TEXT NOT NULL,
        mime_type TEXT,
        content TEXT,
        chunks INTEGER DEFAULT 0,
        training_pairs INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        last_synced TIMESTAMPTZ,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(type, external_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS brain_chunks (
        id SERIAL PRIMARY KEY,
        source_id TEXT REFERENCES brain_sources(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS brain_training_pairs (
        id SERIAL PRIMARY KEY,
        source_id TEXT REFERENCES brain_sources(id) ON DELETE CASCADE,
        instruction TEXT NOT NULL,
        response TEXT NOT NULL,
        category TEXT DEFAULT 'project',
        quality TEXT DEFAULT 'high',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_sources (
        id SERIAL PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        title TEXT,
        sender TEXT,
        content TEXT,
        content_preview TEXT,
        metadata JSONB,
        status TEXT DEFAULT 'pending',
        quality INTEGER DEFAULT 3,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(source_type, source_id)
      )
    `);
  } finally {
    await client.end();
  }
}

let tableEnsured = false;
async function ensureOnce() {
  if (!tableEnsured) {
    await ensureBrainTable();
    tableEnsured = true;
  }
}

function chunkText(text: string, maxChunkSize: number = 1500): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += para + "\n\n";
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

router.get("/project-brain/sources", async (_req, res): Promise<void> => {
  try {
    await ensureOnce();
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      const result = await client.query(
        "SELECT id, type, name, external_id, mime_type, chunks, training_pairs, status, last_synced, error FROM brain_sources ORDER BY created_at DESC"
      );
      res.json({ success: true, sources: result.rows });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/project-brain/stats", async (_req, res): Promise<void> => {
  try {
    await ensureOnce();
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      const sources = await client.query("SELECT COUNT(*) as count, type FROM brain_sources GROUP BY type");
      const totalChunks = await client.query("SELECT COALESCE(SUM(chunks), 0) as total FROM brain_sources");
      const totalPairs = await client.query("SELECT COALESCE(SUM(training_pairs), 0) as total FROM brain_sources");
      const indexed = await client.query("SELECT COUNT(*) as count FROM brain_sources WHERE status = 'indexed'");
      res.json({
        success: true,
        stats: {
          sourcesByType: sources.rows,
          totalSources: sources.rows.reduce((s: number, r: any) => s + parseInt(r.count), 0),
          totalChunks: parseInt(totalChunks.rows[0].total),
          totalPairs: parseInt(totalPairs.rows[0].total),
          indexedSources: parseInt(indexed.rows[0].count),
        },
      });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/project-brain/browse-drive", async (req, res): Promise<void> => {
  try {
    const { query, folderId, pageToken } = req.body;
    let endpoint = "/drive/v3/files?fields=nextPageToken,files(id,name,mimeType,modifiedTime,size,parents)&pageSize=30&orderBy=modifiedTime desc";

    const qParts: string[] = ["trashed=false"];
    if (folderId) {
      qParts.push(`'${folderId}' in parents`);
    }
    if (query) {
      qParts.push(`(name contains '${query}' or fullText contains '${query}')`);
    }
    endpoint += `&q=${encodeURIComponent(qParts.join(" and "))}`;
    if (pageToken) endpoint += `&pageToken=${pageToken}`;

    const data = (await driveProxyJson(endpoint)) as any;
    res.json({
      success: true,
      files: (data.files || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size,
        isFolder: f.mimeType === "application/vnd.google-apps.folder",
      })),
      nextPageToken: data.nextPageToken,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/project-brain/add-drive-file", async (req, res): Promise<void> => {
  try {
    await ensureOnce();
    const { fileId, fileName, mimeType } = req.body;
    if (!fileId || !fileName) {
      res.status(400).json({ success: false, error: "fileId and fileName required" });
      return;
    }

    let content = "";
    try {
      if (mimeType?.includes("google-apps.document")) {
        content = await driveProxyText(`/drive/v3/files/${fileId}/export?mimeType=text/plain`);
      } else if (mimeType?.includes("google-apps.spreadsheet")) {
        content = await driveProxyText(`/drive/v3/files/${fileId}/export?mimeType=text/csv`);
      } else if (mimeType?.includes("google-apps.presentation")) {
        content = await driveProxyText(`/drive/v3/files/${fileId}/export?mimeType=text/plain`);
      } else {
        content = await driveProxyText(`/drive/v3/files/${fileId}?alt=media`);
      }
    } catch (e: any) {
      content = `[Could not extract content: ${e.message}]`;
    }

    const sourceId = `drive-${fileId}`;
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      await client.query(
        `INSERT INTO brain_sources (id, type, name, external_id, mime_type, content, status, last_synced)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (type, external_id) DO UPDATE SET
           name = EXCLUDED.name, content = EXCLUDED.content, status = 'pending', last_synced = NOW()`,
        [sourceId, "drive", fileName, fileId, mimeType || "unknown", content, "pending"]
      );
      res.json({ success: true, sourceId, contentLength: content.length });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/project-brain/add-drive-folder", async (req, res): Promise<void> => {
  try {
    await ensureOnce();
    const { folderId, folderName } = req.body;
    if (!folderId) {
      res.status(400).json({ success: false, error: "folderId required" });
      return;
    }

    const allFiles: any[] = [];
    let pageToken: string | undefined;
    do {
      let endpoint = `/drive/v3/files?fields=nextPageToken,files(id,name,mimeType,size)&pageSize=100&q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}`;
      if (pageToken) endpoint += `&pageToken=${pageToken}`;
      const data = (await driveProxyJson(endpoint)) as any;
      allFiles.push(...(data.files || []));
      pageToken = data.nextPageToken;
    } while (pageToken && allFiles.length < 200);

    const textFiles = allFiles.filter(
      (f: any) =>
        f.mimeType?.includes("document") ||
        f.mimeType?.includes("spreadsheet") ||
        f.mimeType?.includes("presentation") ||
        f.mimeType?.includes("text/") ||
        f.mimeType?.includes("json") ||
        f.mimeType?.includes("pdf") ||
        f.name?.match(/\.(txt|md|csv|json|yaml|yml|py|js|ts|html|css)$/i)
    );

    let added = 0;
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      for (const file of textFiles.slice(0, 50)) {
        let content = "";
        try {
          if (file.mimeType?.includes("google-apps.document")) {
            content = await driveProxyText(`/drive/v3/files/${file.id}/export?mimeType=text/plain`);
          } else if (file.mimeType?.includes("google-apps.spreadsheet")) {
            content = await driveProxyText(`/drive/v3/files/${file.id}/export?mimeType=text/csv`);
          } else if (file.mimeType?.includes("google-apps.presentation")) {
            content = await driveProxyText(`/drive/v3/files/${file.id}/export?mimeType=text/plain`);
          } else {
            content = await driveProxyText(`/drive/v3/files/${file.id}?alt=media`);
          }
        } catch {
          content = "[Content extraction failed]";
        }

        const sourceId = `drive-${file.id}`;
        await client.query(
          `INSERT INTO brain_sources (id, type, name, external_id, mime_type, content, status, last_synced)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (type, external_id) DO UPDATE SET
             name = EXCLUDED.name, content = EXCLUDED.content, status = 'pending', last_synced = NOW()`,
          [sourceId, "drive", `[${folderName || "Folder"}] ${file.name}`, file.id, file.mimeType, content, "pending"]
        );
        added++;
      }
    } finally {
      await client.end();
    }

    res.json({ success: true, totalInFolder: allFiles.length, textFilesFound: textFiles.length, added });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/project-brain/search-notion", async (req, res): Promise<void> => {
  try {
    const { query } = req.body;
    if (!query) {
      res.status(400).json({ success: false, error: "query required" });
      return;
    }
    res.json({
      success: true,
      results: [],
      message: "Notion search is handled via workspace integration. Use 'Add by URL' to import Notion pages directly.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/project-brain/add-notion-page", async (req, res): Promise<void> => {
  try {
    await ensureOnce();
    const { pageId, title, content } = req.body;
    if (!pageId || !content) {
      res.status(400).json({ success: false, error: "pageId and content required" });
      return;
    }

    const sourceId = `notion-${pageId.replace(/-/g, "")}`;
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      await client.query(
        `INSERT INTO brain_sources (id, type, name, external_id, mime_type, content, status, last_synced)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (type, external_id) DO UPDATE SET
           name = EXCLUDED.name, content = EXCLUDED.content, status = 'pending', last_synced = NOW()`,
        [sourceId, "notion", title || "Notion Page", pageId, "text/markdown", content, "pending"]
      );
      res.json({ success: true, sourceId, contentLength: content.length });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/project-brain/add-manual", async (req, res): Promise<void> => {
  try {
    await ensureOnce();
    const { title, content } = req.body;
    if (!title || !content) {
      res.status(400).json({ success: false, error: "title and content required" });
      return;
    }

    const sourceId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      await client.query(
        `INSERT INTO brain_sources (id, type, name, external_id, mime_type, content, status, last_synced)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [sourceId, "manual", title, sourceId, "text/plain", content, "pending"]
      );
      res.json({ success: true, sourceId });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/project-brain/process-source", async (req, res): Promise<void> => {
  try {
    const { sourceId, model } = req.body;
    if (!sourceId) {
      res.status(400).json({ success: false, error: "sourceId required" });
      return;
    }

    const selectedModel = model || "qwen2.5:7b";
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();

      const srcResult = await client.query("SELECT * FROM brain_sources WHERE id = $1", [sourceId]);
      if (srcResult.rows.length === 0) {
        res.status(404).json({ success: false, error: "Source not found" });
        return;
      }

      const source = srcResult.rows[0];
      if (!source.content || source.content.length < 20) {
        await client.query("UPDATE brain_sources SET status = 'error', error = 'Content too short to process' WHERE id = $1", [sourceId]);
        res.status(400).json({ success: false, error: "Content too short to process" });
        return;
      }

      await client.query("UPDATE brain_sources SET status = 'processing' WHERE id = $1", [sourceId]);

      await client.query("DELETE FROM brain_chunks WHERE source_id = $1", [sourceId]);
      await client.query("DELETE FROM brain_training_pairs WHERE source_id = $1", [sourceId]);

      const chunks = chunkText(source.content);

      for (let i = 0; i < chunks.length; i++) {
        let summary = "";
        try {
          const summaryRes = await fetch(`${OLLAMA_BASE}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: selectedModel,
              prompt: `Summarize the following text in 1-2 sentences. Be concise and capture the key information:\n\n${chunks[i].slice(0, 2000)}`,
              stream: false,
              options: { num_predict: 150 },
            }),
          });
          if (summaryRes.ok) {
            const d = (await summaryRes.json()) as any;
            summary = d.response || "";
          }
        } catch {}

        await client.query(
          "INSERT INTO brain_chunks (source_id, chunk_index, content, summary) VALUES ($1, $2, $3, $4)",
          [sourceId, i, chunks[i], summary]
        );
      }

      let pairsGenerated = 0;
      const pairChunks = chunks.slice(0, 10);
      for (const chunk of pairChunks) {
        if (chunk.length < 50) continue;
        try {
          const pairRes = await fetch(`${OLLAMA_BASE}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: selectedModel,
              prompt: `Based on the following text, generate exactly 3 question-answer pairs that would help an AI learn from this content. Format each pair as:
Q: [question]
A: [detailed answer]

Text:
${chunk.slice(0, 2000)}

Generate 3 Q&A pairs:`,
              stream: false,
              options: { num_predict: 1000 },
            }),
          });

          if (pairRes.ok) {
            const d = (await pairRes.json()) as any;
            const text = d.response || "";
            const qaPairs = text.split(/Q:\s*/i).filter((s: string) => s.trim());
            for (const qa of qaPairs) {
              const parts = qa.split(/A:\s*/i);
              if (parts.length >= 2) {
                const instruction = parts[0].trim();
                const response = parts.slice(1).join("A: ").trim();
                if (instruction.length > 10 && response.length > 20) {
                  await client.query(
                    "INSERT INTO brain_training_pairs (source_id, instruction, response) VALUES ($1, $2, $3)",
                    [sourceId, instruction, response]
                  );
                  pairsGenerated++;
                }
              }
            }
          }
        } catch {}
      }

      await client.query(
        "UPDATE brain_sources SET status = 'indexed', chunks = $1, training_pairs = $2, last_synced = NOW(), error = NULL WHERE id = $3",
        [chunks.length, pairsGenerated, sourceId]
      );

      await client.query(
        `INSERT INTO training_sources (source_type, source_id, title, sender, content, content_preview, metadata, status, quality)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (source_type, source_id) DO UPDATE SET
           content = EXCLUDED.content, content_preview = EXCLUDED.content_preview, status = 'approved'`,
        [
          "brain",
          sourceId,
          `[Project Brain] ${source.name}`,
          source.type,
          source.content.slice(0, 50000),
          source.content.slice(0, 500),
          JSON.stringify({ chunks: chunks.length, pairs: pairsGenerated, sourceType: source.type }),
          "approved",
          5,
        ]
      );

      res.json({ success: true, chunks: chunks.length, trainingPairs: pairsGenerated });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    const client2 = new Client(VPS_DB_CONFIG);
    try {
      await client2.connect();
      await client2.query("UPDATE brain_sources SET status = 'error', error = $1 WHERE id = $2", [err.message, req.body.sourceId]);
    } catch {} finally {
      await client2.end();
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/project-brain/process-all", async (req, res): Promise<void> => {
  try {
    const { model } = req.body;
    const selectedModel = model || "qwen2.5:7b";
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      const pending = await client.query("SELECT id FROM brain_sources WHERE status = 'pending' ORDER BY created_at");

      let processed = 0;
      let errors = 0;
      for (const row of pending.rows) {
        try {
          await client.query("UPDATE brain_sources SET status = 'processing' WHERE id = $1", [row.id]);

          const srcResult = await client.query("SELECT * FROM brain_sources WHERE id = $1", [row.id]);
          const source = srcResult.rows[0];
          if (!source?.content || source.content.length < 20) {
            await client.query("UPDATE brain_sources SET status = 'error', error = 'Content too short' WHERE id = $1", [row.id]);
            errors++;
            continue;
          }

          await client.query("DELETE FROM brain_chunks WHERE source_id = $1", [row.id]);
          await client.query("DELETE FROM brain_training_pairs WHERE source_id = $1", [row.id]);

          const chunks = chunkText(source.content);
          for (let i = 0; i < chunks.length; i++) {
            await client.query(
              "INSERT INTO brain_chunks (source_id, chunk_index, content) VALUES ($1, $2, $3)",
              [row.id, i, chunks[i]]
            );
          }

          let pairsGenerated = 0;
          for (const chunk of chunks.slice(0, 5)) {
            if (chunk.length < 50) continue;
            try {
              const pairRes = await fetch(`${OLLAMA_BASE}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: selectedModel,
                  prompt: `Based on the following text, generate 2 question-answer pairs. Format:
Q: [question]
A: [answer]

Text: ${chunk.slice(0, 1500)}

Generate 2 pairs:`,
                  stream: false,
                  options: { num_predict: 600 },
                }),
              });
              if (pairRes.ok) {
                const d = (await pairRes.json()) as any;
                const qaPairs = (d.response || "").split(/Q:\s*/i).filter((s: string) => s.trim());
                for (const qa of qaPairs) {
                  const parts = qa.split(/A:\s*/i);
                  if (parts.length >= 2 && parts[0].trim().length > 10 && parts[1].trim().length > 20) {
                    await client.query(
                      "INSERT INTO brain_training_pairs (source_id, instruction, response) VALUES ($1, $2, $3)",
                      [row.id, parts[0].trim(), parts.slice(1).join("A: ").trim()]
                    );
                    pairsGenerated++;
                  }
                }
              }
            } catch {}
          }

          await client.query(
            "UPDATE brain_sources SET status = 'indexed', chunks = $1, training_pairs = $2, last_synced = NOW(), error = NULL WHERE id = $3",
            [chunks.length, pairsGenerated, row.id]
          );

          await client.query(
            `INSERT INTO training_sources (source_type, source_id, title, sender, content, content_preview, metadata, status, quality)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (source_type, source_id) DO UPDATE SET content = EXCLUDED.content, status = 'approved'`,
            ["brain", row.id, `[Project Brain] ${source.name}`, source.type, source.content.slice(0, 50000),
             source.content.slice(0, 500), JSON.stringify({ chunks: chunks.length, pairs: pairsGenerated }),
             "approved", 5]
          );

          processed++;
        } catch (e: any) {
          await client.query("UPDATE brain_sources SET status = 'error', error = $1 WHERE id = $2", [e.message, row.id]);
          errors++;
        }
      }

      res.json({ success: true, processed, errors, total: pending.rows.length });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/project-brain/training-pairs/:sourceId", async (req, res): Promise<void> => {
  try {
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      const result = await client.query(
        "SELECT id, instruction, response, category, quality FROM brain_training_pairs WHERE source_id = $1 ORDER BY id",
        [req.params.sourceId]
      );
      res.json({ success: true, pairs: result.rows });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/project-brain/source/:sourceId", async (req, res): Promise<void> => {
  try {
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      await client.query("DELETE FROM brain_sources WHERE id = $1", [req.params.sourceId]);
      res.json({ success: true });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/project-brain/export-pairs", async (_req, res): Promise<void> => {
  try {
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();
      const result = await client.query(
        `SELECT bp.instruction, bp.response, bp.category, bs.name as source_name, bs.type as source_type
         FROM brain_training_pairs bp
         JOIN brain_sources bs ON bs.id = bp.source_id
         WHERE bs.status = 'indexed'
         ORDER BY bp.id`
      );
      res.json({ success: true, pairs: result.rows, total: result.rows.length });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/project-brain/unified-stats", async (_req, res): Promise<void> => {
  try {
    const client = new Client(VPS_DB_CONFIG);
    try {
      await client.connect();

      const brainSources = await client.query(`SELECT COUNT(*) as count FROM brain_sources WHERE status = 'indexed'`);
      const brainChunks = await client.query(`SELECT COUNT(*) as count FROM brain_chunks`);
      const brainPairs = await client.query(`SELECT COUNT(*) as count FROM brain_training_pairs`);

      let trainingSources = { rows: [{ count: 0 }] };
      try {
        trainingSources = await client.query(`SELECT COUNT(*) as count FROM training_sources`);
      } catch {}

      let benchmarks = { rows: [{ count: 0 }] };
      try {
        benchmarks = await client.query(`SELECT COUNT(*) as count FROM model_benchmarks`);
      } catch {}

      let backups = { rows: [{ count: 0 }] };
      try {
        backups = await client.query(`SELECT COUNT(*) as count FROM backup_snapshots`);
      } catch {}

      const brainByType = await client.query(
        `SELECT bs.type, COUNT(bc.id) as chunks, COUNT(DISTINCT bs.id) as sources
         FROM brain_sources bs
         LEFT JOIN brain_chunks bc ON bc.source_id = bs.id
         WHERE bs.status = 'indexed'
         GROUP BY bs.type`
      );

      res.json({
        success: true,
        stats: {
          brain: {
            indexedSources: parseInt(brainSources.rows[0].count),
            totalChunks: parseInt(brainChunks.rows[0].count),
            trainingPairs: parseInt(brainPairs.rows[0].count),
            byType: brainByType.rows,
          },
          vps: {
            trainingSources: parseInt(trainingSources.rows[0].count),
            benchmarks: parseInt(benchmarks.rows[0].count),
            backups: parseInt(backups.rows[0].count),
          },
        },
      });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.json({
      success: false,
      error: err.message,
      stats: {
        brain: { indexedSources: 0, totalChunks: 0, trainingPairs: 0, byType: [] },
        vps: { trainingSources: 0, benchmarks: 0, backups: 0 },
      },
    });
  }
});

export default router;
