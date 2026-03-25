import { Router } from "express";
import { db, pool } from "@workspace/db";
import { entEmbeddingsTable, entKnowledgeSourcesTable } from "@workspace/db/schema";
import { eq, sql, desc, count } from "drizzle-orm";

const router = Router();

const EMBEDDING_DIM = 384;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (!text || text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.min(overlap, words.length));
      current = overlapWords.join(" ") + " " + sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function simpleEmbedding(text: string): number[] {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1);
  const vec = new Array(EMBEDDING_DIM).fill(0);

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % EMBEDDING_DIM;
    vec[idx] += 1;

    const idx2 = Math.abs((hash * 31 + 7) | 0) % EMBEDDING_DIM;
    vec[idx2] += 0.5;

    const idx3 = Math.abs((hash * 17 + 13) | 0) % EMBEDDING_DIM;
    vec[idx3] += 0.3;
  }

  const mag = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0)) || 1;
  return vec.map((v: number) => v / mag);
}

async function generateOllamaEmbedding(text: string, serverUrl: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${serverUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { embedding?: number[] };
    return data.embedding || null;
  } catch {
    return null;
  }
}

async function getServerUrl(): Promise<string | null> {
  try {
    const result = await db.execute(sql`SELECT server_url, port FROM llm_config LIMIT 1`);
    const rows = result.rows as any[];
    if (rows.length > 0) {
      const { server_url, port } = rows[0];
      try {
        const parsed = new URL(server_url);
        if (!parsed.port && port) {
          parsed.port = String(port);
        }
        return parsed.origin;
      } catch {
        return `${server_url}:${port}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function getEmbedding(text: string): Promise<{ vector: number[]; model: string; dim: number }> {
  const serverUrl = await getServerUrl();
  if (serverUrl) {
    const ollamaVec = await generateOllamaEmbedding(text, serverUrl);
    if (ollamaVec) {
      if (ollamaVec.length === EMBEDDING_DIM) {
        return { vector: ollamaVec, model: "nomic-embed-text", dim: ollamaVec.length };
      }
      const resized = new Array(EMBEDDING_DIM).fill(0);
      for (let i = 0; i < EMBEDDING_DIM; i++) {
        const srcIdx = Math.floor((i / EMBEDDING_DIM) * ollamaVec.length);
        resized[i] = ollamaVec[srcIdx];
      }
      const mag = Math.sqrt(resized.reduce((s: number, v: number) => s + v * v, 0)) || 1;
      return { vector: resized.map((v: number) => v / mag), model: "nomic-embed-text-resized", dim: EMBEDDING_DIM };
    }
  }

  return { vector: simpleEmbedding(text), model: "keyword-hash", dim: EMBEDDING_DIM };
}

async function storeEmbedding(
  sourceType: string,
  sourceRef: string,
  title: string,
  content: string,
  chunkIndex: number,
  embedding: { vector: number[]; model: string; dim: number },
  sourceId?: number,
  metadata?: string
) {
  const vecStr = `[${embedding.vector.join(",")}]`;

  await pool.query(
    `INSERT INTO ent_embeddings (source_type, source_ref, title, content, chunk_index, embedding_model, embedding_dim, embedding, source_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10, NOW())
     ON CONFLICT DO NOTHING`,
    [sourceType, sourceRef, title, content, chunkIndex, embedding.model, embedding.dim, vecStr, sourceId || null, metadata || null]
  );
}

export async function searchVectorKnowledge(query: string, maxResults = 5): Promise<{ title: string; content: string; score: number; sourceType: string; sourceRef: string }[]> {
  const embedding = await getEmbedding(query);
  const vecStr = `[${embedding.vector.join(",")}]`;

  const result = await pool.query(
    `SELECT title, content, source_type, source_ref,
            1 - (embedding <=> $1::vector) as similarity
     FROM ent_embeddings
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vecStr, maxResults]
  );

  return result.rows.map((r: any) => ({
    title: r.title || "",
    content: r.content || "",
    score: parseFloat(r.similarity) || 0,
    sourceType: r.source_type || "",
    sourceRef: r.source_ref || "",
  }));
}

router.get("/rag-pipeline/status", async (_req, res) => {
  try {
    const totalResult = await pool.query("SELECT COUNT(*) as total FROM ent_embeddings");
    const withVecResult = await pool.query("SELECT COUNT(*) as total FROM ent_embeddings WHERE embedding IS NOT NULL");
    const sourceBreakdown = await pool.query(
      "SELECT source_type, COUNT(*) as cnt FROM ent_embeddings GROUP BY source_type ORDER BY cnt DESC"
    );
    const sources = await db.select().from(entKnowledgeSourcesTable).orderBy(desc(entKnowledgeSourcesTable.createdAt));

    const serverUrl = await getServerUrl();
    let ollamaEmbeddingAvailable = false;
    if (serverUrl) {
      try {
        const testRes = await fetch(`${serverUrl}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "nomic-embed-text", prompt: "test" }),
          signal: AbortSignal.timeout(5000),
        });
        ollamaEmbeddingAvailable = testRes.ok;
      } catch {}
    }

    res.json({
      totalChunks: parseInt(totalResult.rows[0].total),
      chunksWithEmbeddings: parseInt(withVecResult.rows[0].total),
      sourceBreakdown: sourceBreakdown.rows,
      sources,
      embeddingModel: ollamaEmbeddingAvailable ? "nomic-embed-text (Ollama)" : "keyword-hash (fallback)",
      embeddingDim: EMBEDDING_DIM,
      ollamaEmbeddingAvailable,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/rag-pipeline/ingest/pubmed", async (req, res) => {
  try {
    const batchLimit = parseInt(req.body?.batchLimit) || 5000;
    const articlesRes = await pool.query(
      "SELECT id, input_text, output_text, source, category, quality FROM training_data WHERE source LIKE '%pubmed%' OR source LIKE '%PubMed%' OR category LIKE '%ent%' LIMIT $1",
      [batchLimit]
    );

    if (articlesRes.rows.length === 0) {
      res.json({ ingested: 0, message: "No PubMed training data found in database. Run PubMed collector first." });
      return;
    }

    let [source] = await db.select().from(entKnowledgeSourcesTable).where(eq(entKnowledgeSourcesTable.name, "pubmed-training-data"));
    if (!source) {
      const [created] = await db.insert(entKnowledgeSourcesTable).values({
        name: "pubmed-training-data",
        sourceType: "pubmed",
        status: "ingesting",
      }).returning();
      source = created;
    } else {
      await db.update(entKnowledgeSourcesTable).set({ status: "ingesting" }).where(eq(entKnowledgeSourcesTable.id, source.id));
    }

    let ingested = 0;
    let skipped = 0;

    for (const row of articlesRes.rows) {
      const text = `${row.input_text || ""}\n\n${row.output_text || ""}`.trim();
      if (!text || text.length < 20) { skipped++; continue; }

      const existing = await pool.query(
        "SELECT id FROM ent_embeddings WHERE source_type = 'pubmed' AND source_ref = $1 LIMIT 1",
        [String(row.id)]
      );
      if (existing.rows.length > 0) { skipped++; continue; }

      const chunks = chunkText(text);
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i]);
        await storeEmbedding(
          "pubmed",
          String(row.id),
          (row.input_text || "").substring(0, 200),
          chunks[i],
          i,
          embedding,
          source.id,
          JSON.stringify({ category: row.category, quality: row.quality })
        );
        ingested++;
      }
    }

    await db.update(entKnowledgeSourcesTable).set({
      status: "completed",
      totalChunks: ingested,
      totalDocuments: articlesRes.rows.length - skipped,
      lastIngestedAt: new Date(),
    }).where(eq(entKnowledgeSourcesTable.id, source.id));

    res.json({ ingested, skipped, total: articlesRes.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/rag-pipeline/ingest/knowledge", async (_req, res) => {
  try {
    const knowledgeRes = await pool.query(
      "SELECT id, content FROM document_chunks WHERE content IS NOT NULL AND LENGTH(content) > 20 LIMIT 5000"
    );

    let [source] = await db.select().from(entKnowledgeSourcesTable).where(eq(entKnowledgeSourcesTable.name, "knowledge-base"));
    if (!source) {
      const [created] = await db.insert(entKnowledgeSourcesTable).values({
        name: "knowledge-base",
        sourceType: "knowledge-base",
        status: "ingesting",
      }).returning();
      source = created;
    } else {
      await db.update(entKnowledgeSourcesTable).set({ status: "ingesting" }).where(eq(entKnowledgeSourcesTable.id, source.id));
    }

    let ingested = 0;
    let skipped = 0;

    for (const row of knowledgeRes.rows) {
      const existing = await pool.query(
        "SELECT id FROM ent_embeddings WHERE source_type = 'knowledge-base' AND source_ref = $1 LIMIT 1",
        [String(row.id)]
      );
      if (existing.rows.length > 0) { skipped++; continue; }

      const chunks = chunkText(row.content);
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i]);
        await storeEmbedding(
          "knowledge-base",
          String(row.id),
          row.content.substring(0, 200),
          chunks[i],
          i,
          embedding,
          source.id
        );
        ingested++;
      }
    }

    await db.update(entKnowledgeSourcesTable).set({
      status: "completed",
      totalChunks: ingested,
      totalDocuments: knowledgeRes.rows.length - skipped,
      lastIngestedAt: new Date(),
    }).where(eq(entKnowledgeSourcesTable.id, source.id));

    res.json({ ingested, skipped, total: knowledgeRes.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/rag-pipeline/ingest/ent-training", async (_req, res) => {
  try {
    let [source] = await db.select().from(entKnowledgeSourcesTable).where(eq(entKnowledgeSourcesTable.name, "ent-training-knowledge"));
    if (!source) {
      const [created] = await db.insert(entKnowledgeSourcesTable).values({
        name: "ent-training-knowledge",
        sourceType: "ent-training",
        status: "ingesting",
      }).returning();
      source = created;
    } else {
      await db.update(entKnowledgeSourcesTable).set({ status: "ingesting" }).where(eq(entKnowledgeSourcesTable.id, source.id));
    }

    const { ENDOSCOPY_TRAINING_KNOWLEDGE } = await import("./ent-endoscopy-datasets");

    let ingested = 0;
    let skipped = 0;

    for (const item of ENDOSCOPY_TRAINING_KNOWLEDGE) {
      const itemTitle = (item as any).title || (item as any).topic || "Untitled";
      const itemCategory = (item as any).category || "ent";
      const itemDifficulty = (item as any).difficulty || "";
      const text = `Topic: ${itemTitle}\nCategory: ${itemCategory}${itemDifficulty ? `\nDifficulty: ${itemDifficulty}` : ""}\n\n${item.content}`;
      const ref = `ent-knowledge-${itemTitle.substring(0, 50).replace(/\s+/g, "-").toLowerCase()}`;

      const existing = await pool.query(
        "SELECT id FROM ent_embeddings WHERE source_type = 'ent-training' AND source_ref = $1 LIMIT 1",
        [ref]
      );
      if (existing.rows.length > 0) { skipped++; continue; }

      const chunks = chunkText(text);
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i]);
        await storeEmbedding(
          "ent-training",
          ref,
          itemTitle,
          chunks[i],
          i,
          embedding,
          source.id,
          JSON.stringify({ category: itemCategory, difficulty: itemDifficulty })
        );
        ingested++;
      }
    }

    await db.update(entKnowledgeSourcesTable).set({
      status: "completed",
      totalChunks: ingested,
      totalDocuments: ENDOSCOPY_TRAINING_KNOWLEDGE.length - skipped,
      lastIngestedAt: new Date(),
    }).where(eq(entKnowledgeSourcesTable.id, source.id));

    res.json({ ingested, skipped, total: ENDOSCOPY_TRAINING_KNOWLEDGE.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/rag-pipeline/ingest/custom", async (req, res) => {
  try {
    const { title, content, sourceType, sourceRef } = req.body;
    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const chunks = chunkText(content);
    let ingested = 0;

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await getEmbedding(chunks[i]);
      await storeEmbedding(
        sourceType || "custom",
        sourceRef || `custom-${Date.now()}`,
        title || "Custom Document",
        chunks[i],
        i,
        embedding
      );
      ingested++;
    }

    res.json({ ingested, chunks: chunks.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/rag-pipeline/search", async (req, res) => {
  try {
    const { query, maxResults = 5, minScore = 0.1 } = req.body;
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    const results = await searchVectorKnowledge(query, maxResults);
    const filtered = results.filter(r => r.score >= minScore);

    res.json({
      query,
      results: filtered,
      totalFound: filtered.length,
      embeddingModel: (await getEmbedding("test")).model,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/rag-pipeline/clear", async (req, res) => {
  try {
    const { sourceType } = req.body || {};
    if (sourceType) {
      await pool.query("DELETE FROM ent_embeddings WHERE source_type = $1", [sourceType]);
      await db.delete(entKnowledgeSourcesTable).where(eq(entKnowledgeSourcesTable.sourceType, sourceType));
    } else {
      await pool.query("DELETE FROM ent_embeddings");
      await db.delete(entKnowledgeSourcesTable);
    }
    res.json({ cleared: true, sourceType: sourceType || "all" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
