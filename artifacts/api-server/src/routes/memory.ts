import { Router, Request, Response, NextFunction } from "express";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) { next(); }

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  category: string;
  source: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessed: number | null;
}

const memories: MemoryEntry[] = [
  {
    id: "m-1",
    key: "preferred_model",
    value: "llama3.1:latest",
    category: "preference",
    source: "user",
    confidence: 1.0,
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000,
    accessCount: 15,
    lastAccessed: Date.now() - 3600000,
  },
  {
    id: "m-2",
    key: "coding_language",
    value: "TypeScript with React for frontend, Node.js/Express for backend",
    category: "preference",
    source: "inferred",
    confidence: 0.9,
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 2,
    accessCount: 8,
    lastAccessed: Date.now() - 7200000,
  },
  {
    id: "m-3",
    key: "project_context",
    value: "Building LLM Hub - a full AI agent orchestration platform with Ollama backend on VPS 72.60.167.64",
    category: "context",
    source: "inferred",
    confidence: 0.95,
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now(),
    accessCount: 22,
    lastAccessed: Date.now() - 1800000,
  },
  {
    id: "m-4",
    key: "communication_style",
    value: "Prefers concise, technical responses with code examples. No emojis.",
    category: "preference",
    source: "inferred",
    confidence: 0.85,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000,
    accessCount: 5,
    lastAccessed: Date.now() - 14400000,
  },
  {
    id: "m-5",
    key: "ollama_version",
    value: "v0.18.0 with stream:true required. 12 models available including nomic-embed-text",
    category: "fact",
    source: "system",
    confidence: 1.0,
    createdAt: Date.now() - 86400000 * 14,
    updatedAt: Date.now() - 86400000 * 2,
    accessCount: 10,
    lastAccessed: Date.now() - 3600000,
  },
];

let memoryCounter = memories.length;

const CATEGORIES = ["preference", "fact", "context", "instruction", "persona"];

router.get("/memory", (_req, res): void => {
  res.json(memories);
});

router.get("/memory/categories", (_req, res): void => {
  res.json(CATEGORIES);
});

router.get("/memory/search", (req, res): void => {
  const q = (req.query.q as string || "").toLowerCase();
  if (!q) { res.json(memories); return; }
  const results = memories.filter(m =>
    m.key.toLowerCase().includes(q) ||
    m.value.toLowerCase().includes(q) ||
    m.category.toLowerCase().includes(q)
  );
  res.json(results);
});

router.post("/memory", requireAuth, (req, res): void => {
  const { key, value, category, source, confidence } = req.body;
  if (!key || !value) {
    res.status(400).json({ error: "Key and value are required" });
    return;
  }
  const existing = memories.find(m => m.key === key);
  if (existing) {
    existing.value = value;
    if (category) existing.category = category;
    if (source) existing.source = source;
    if (confidence !== undefined) existing.confidence = confidence;
    existing.updatedAt = Date.now();
    res.json(existing);
    return;
  }
  memoryCounter++;
  const entry: MemoryEntry = {
    id: `m-${memoryCounter}`,
    key,
    value,
    category: category || "fact",
    source: source || "user",
    confidence: confidence ?? 1.0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    accessCount: 0,
    lastAccessed: null,
  };
  memories.push(entry);
  res.json(entry);
});

router.patch("/memory/:id", (req, res): void => {
  const m = memories.find(m => m.id === req.params.id);
  if (!m) { res.status(404).json({ error: "Memory not found" }); return; }
  if (req.body.key !== undefined) m.key = req.body.key;
  if (req.body.value !== undefined) m.value = req.body.value;
  if (req.body.category !== undefined) m.category = req.body.category;
  if (req.body.confidence !== undefined) m.confidence = req.body.confidence;
  m.updatedAt = Date.now();
  res.json(m);
});

router.delete("/memory/:id", requireAuth, (req, res): void => {
  const idx = memories.findIndex(m => m.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Memory not found" }); return; }
  memories.splice(idx, 1);
  res.json({ success: true });
});

router.get("/memory/context", (_req, res): void => {
  const sorted = [...memories].sort((a, b) => b.accessCount - a.accessCount);
  const contextString = sorted
    .slice(0, 10)
    .map(m => `[${m.category}] ${m.key}: ${m.value}`)
    .join("\n");
  res.json({ context: contextString, entries: sorted.slice(0, 10).length });
});

export default router;
