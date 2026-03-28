import { Router } from "express";
import { db, promptsTable } from "@workspace/db";
import { eq, ilike, or, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/rateLimiter";

const router = Router();

const CATEGORIES = ["Development", "Research", "Analytics", "Writing", "Medical", "Finance", "Marketing", "Education", "Creative", "General"];

const SEED_PROMPTS = [
  {
    title: "Code Review Expert",
    content: "You are a senior software engineer conducting a thorough code review. Analyze the following code for:\n1. Bugs and potential issues\n2. Performance concerns\n3. Security vulnerabilities\n4. Code style and best practices\n5. Suggestions for improvement\n\nProvide specific, actionable feedback with code examples where applicable.",
    category: "Development",
    tags: ["code-review", "engineering", "quality"],
    isFavorite: true,
    usageCount: 24,
    createdBy: "system",
  },
  {
    title: "Research Synthesizer",
    content: "Analyze the following research topic and provide a comprehensive synthesis:\n1. Key findings and themes\n2. Conflicting viewpoints\n3. Gaps in current research\n4. Practical implications\n5. Suggestions for further investigation\n\nCite sources where possible and maintain academic rigor.",
    category: "Research",
    tags: ["research", "analysis", "academic"],
    isFavorite: false,
    usageCount: 18,
    createdBy: "system",
  },
  {
    title: "Data Analysis Assistant",
    content: "You are a data analyst. Given the following dataset or description:\n1. Identify key patterns and trends\n2. Calculate relevant statistics\n3. Suggest visualizations\n4. Highlight anomalies or outliers\n5. Provide actionable insights\n\nPresent findings in a clear, structured format.",
    category: "Analytics",
    tags: ["data", "analytics", "statistics"],
    isFavorite: true,
    usageCount: 31,
    createdBy: "system",
  },
  {
    title: "Technical Documentation Writer",
    content: "Write clear, comprehensive technical documentation for the following:\n- Include an overview/introduction\n- Document all parameters, inputs, and outputs\n- Provide usage examples\n- Add troubleshooting tips\n- Follow standard documentation conventions\n\nUse markdown formatting for readability.",
    category: "Writing",
    tags: ["documentation", "technical-writing", "markdown"],
    isFavorite: false,
    usageCount: 12,
    createdBy: "system",
  },
  {
    title: "Medical Literature Review",
    content: "Conduct a systematic review of the medical literature on the following topic:\n1. Summarize key studies and their methodologies\n2. Assess evidence quality (RCTs, meta-analyses, case studies)\n3. Compare treatment outcomes\n4. Note contraindications and side effects\n5. Provide evidence-based recommendations\n\nUse medical terminology appropriately and cite sources.",
    category: "Medical",
    tags: ["medical", "literature-review", "clinical"],
    isFavorite: true,
    usageCount: 9,
    createdBy: "system",
  },
  {
    title: "Financial Analysis Report",
    content: "Perform a detailed financial analysis:\n1. Key financial metrics and ratios\n2. Revenue and cost trends\n3. Risk assessment\n4. Competitive positioning\n5. Forward-looking projections\n6. Investment recommendations\n\nUse quantitative data where available and clearly state assumptions.",
    category: "Finance",
    tags: ["finance", "analysis", "investment"],
    isFavorite: false,
    usageCount: 15,
    createdBy: "system",
  },
];

async function seedPrompts() {
  const existing = await db.select({ id: promptsTable.id }).from(promptsTable).limit(1);
  if (existing.length > 0) return;
  for (const p of SEED_PROMPTS) {
    await db.insert(promptsTable).values({
      title: p.title,
      content: p.content,
      category: p.category,
      tags: p.tags,
      isFavorite: p.isFavorite,
      usageCount: p.usageCount,
      createdBy: p.createdBy,
    });
  }
  console.log("[prompts] Seeded 6 default prompts");
}

seedPrompts().catch(err => console.error("[prompts] Seed error:", err.message));

router.get("/prompts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(promptsTable).orderBy(desc(promptsTable.updatedAt));
  res.json(rows);
});

router.get("/prompts/categories", (_req, res): void => {
  res.json(CATEGORIES);
});

router.post("/prompts", requireAuth, async (req, res): Promise<void> => {
  const { title, content, category, tags } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: "Title and content are required" });
    return;
  }
  const [prompt] = await db.insert(promptsTable).values({
    title,
    content,
    category: category || "General",
    tags: tags || [],
    createdBy: (req as any).user?.username || "anonymous",
  }).returning();
  res.json(prompt);
});

router.patch("/prompts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const updates: Record<string, any> = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.content !== undefined) updates.content = req.body.content;
  if (req.body.category !== undefined) updates.category = req.body.category;
  if (req.body.tags !== undefined) updates.tags = req.body.tags;
  if (req.body.isFavorite !== undefined) updates.isFavorite = req.body.isFavorite;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const [updated] = await db.update(promptsTable).set(updates).where(eq(promptsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Prompt not found" }); return; }
  res.json(updated);
});

router.post("/prompts/:id/use", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [updated] = await db.update(promptsTable)
    .set({ usageCount: sql`${promptsTable.usageCount} + 1` })
    .where(eq(promptsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Prompt not found" }); return; }
  res.json(updated);
});

router.delete("/prompts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [deleted] = await db.delete(promptsTable).where(eq(promptsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Prompt not found" }); return; }
  res.json({ success: true });
});

export default router;
