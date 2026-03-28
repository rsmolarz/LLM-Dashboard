import { Router } from "express";
import { db, memoryEntriesTable } from "@workspace/db";
import { eq, ilike, or, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/rateLimiter";

const router = Router();

const CATEGORIES = ["preference", "fact", "context", "instruction", "persona"];

const SEED_MEMORIES = [
  { key: "preferred_model", value: "llama3.1:latest", category: "preference", source: "user", confidence: 1.0, accessCount: 15 },
  { key: "coding_language", value: "TypeScript with React for frontend, Node.js/Express for backend", category: "preference", source: "inferred", confidence: 0.9, accessCount: 8 },
  { key: "project_context", value: "Building LLM Hub - a full AI agent orchestration platform with Ollama backend on VPS 72.60.167.64", category: "context", source: "inferred", confidence: 0.95, accessCount: 22 },
  { key: "communication_style", value: "Prefers concise, technical responses with code examples. No emojis.", category: "preference", source: "inferred", confidence: 0.85, accessCount: 5 },
  { key: "ollama_version", value: "v0.18.0 with stream:true required. 12 models available including nomic-embed-text", category: "fact", source: "system", confidence: 1.0, accessCount: 10 },
];

async function seedMemories() {
  const existing = await db.select({ id: memoryEntriesTable.id }).from(memoryEntriesTable).limit(1);
  if (existing.length > 0) return;
  for (const m of SEED_MEMORIES) {
    await db.insert(memoryEntriesTable).values(m);
  }
  console.log("[memory] Seeded 5 default memory entries");
}

seedMemories().catch(err => console.error("[memory] Seed error:", err.message));

router.get("/memory", async (_req, res): Promise<void> => {
  const rows = await db.select().from(memoryEntriesTable).orderBy(desc(memoryEntriesTable.updatedAt));
  res.json(rows);
});

router.get("/memory/categories", (_req, res): void => {
  res.json(CATEGORIES);
});

router.get("/memory/search", async (req, res): Promise<void> => {
  const q = (req.query.q as string || "").toLowerCase();
  if (!q) {
    const rows = await db.select().from(memoryEntriesTable).orderBy(desc(memoryEntriesTable.updatedAt));
    res.json(rows);
    return;
  }
  const pattern = `%${q}%`;
  const rows = await db.select().from(memoryEntriesTable).where(
    or(
      ilike(memoryEntriesTable.key, pattern),
      ilike(memoryEntriesTable.value, pattern),
      ilike(memoryEntriesTable.category, pattern),
    )
  ).orderBy(desc(memoryEntriesTable.updatedAt));
  res.json(rows);
});

router.post("/memory", requireAuth, async (req, res): Promise<void> => {
  const { key, value, category, source, confidence } = req.body;
  if (!key || !value) {
    res.status(400).json({ error: "Key and value are required" });
    return;
  }
  const [existing] = await db.select().from(memoryEntriesTable).where(eq(memoryEntriesTable.key, key));
  if (existing) {
    const updates: Record<string, any> = { value };
    if (category) updates.category = category;
    if (source) updates.source = source;
    if (confidence !== undefined) updates.confidence = confidence;
    const [updated] = await db.update(memoryEntriesTable).set(updates).where(eq(memoryEntriesTable.key, key)).returning();
    res.json(updated);
    return;
  }
  const [entry] = await db.insert(memoryEntriesTable).values({
    key,
    value,
    category: category || "fact",
    source: source || "user",
    confidence: confidence ?? 1.0,
  }).returning();
  res.json(entry);
});

router.patch("/memory/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const updates: Record<string, any> = {};
  if (req.body.key !== undefined) updates.key = req.body.key;
  if (req.body.value !== undefined) updates.value = req.body.value;
  if (req.body.category !== undefined) updates.category = req.body.category;
  if (req.body.confidence !== undefined) updates.confidence = req.body.confidence;
  const [updated] = await db.update(memoryEntriesTable).set(updates).where(eq(memoryEntriesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Memory not found" }); return; }
  res.json(updated);
});

router.delete("/memory/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [deleted] = await db.delete(memoryEntriesTable).where(eq(memoryEntriesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Memory not found" }); return; }
  res.json({ success: true });
});

router.get("/memory/context", async (_req, res): Promise<void> => {
  const rows = await db.select().from(memoryEntriesTable).orderBy(desc(memoryEntriesTable.accessCount)).limit(10);
  const contextString = rows
    .map(m => `[${m.category}] ${m.key}: ${m.value}`)
    .join("\n");
  res.json({ context: contextString, entries: rows.length });
});

export default router;
