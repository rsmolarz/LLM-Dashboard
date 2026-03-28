import { Router, Request, Response, NextFunction } from "express";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) { next(); }

interface Prompt {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isFavorite: boolean;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

const prompts: Prompt[] = [
  {
    id: "p-1",
    title: "Code Review Expert",
    content: "You are a senior software engineer conducting a thorough code review. Analyze the following code for:\n1. Bugs and potential issues\n2. Performance concerns\n3. Security vulnerabilities\n4. Code style and best practices\n5. Suggestions for improvement\n\nProvide specific, actionable feedback with code examples where applicable.",
    category: "Development",
    tags: ["code-review", "engineering", "quality"],
    isFavorite: true,
    usageCount: 24,
    createdAt: Date.now() - 86400000 * 14,
    updatedAt: Date.now() - 86400000 * 2,
    createdBy: "system",
  },
  {
    id: "p-2",
    title: "Research Synthesizer",
    content: "Analyze the following research topic and provide a comprehensive synthesis:\n1. Key findings and themes\n2. Conflicting viewpoints\n3. Gaps in current research\n4. Practical implications\n5. Suggestions for further investigation\n\nCite sources where possible and maintain academic rigor.",
    category: "Research",
    tags: ["research", "analysis", "academic"],
    isFavorite: false,
    usageCount: 18,
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000 * 5,
    createdBy: "system",
  },
  {
    id: "p-3",
    title: "Data Analysis Assistant",
    content: "You are a data analyst. Given the following dataset or description:\n1. Identify key patterns and trends\n2. Calculate relevant statistics\n3. Suggest visualizations\n4. Highlight anomalies or outliers\n5. Provide actionable insights\n\nPresent findings in a clear, structured format.",
    category: "Analytics",
    tags: ["data", "analytics", "statistics"],
    isFavorite: true,
    usageCount: 31,
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 1,
    createdBy: "system",
  },
  {
    id: "p-4",
    title: "Technical Documentation Writer",
    content: "Write clear, comprehensive technical documentation for the following:\n- Include an overview/introduction\n- Document all parameters, inputs, and outputs\n- Provide usage examples\n- Add troubleshooting tips\n- Follow standard documentation conventions\n\nUse markdown formatting for readability.",
    category: "Writing",
    tags: ["documentation", "technical-writing", "markdown"],
    isFavorite: false,
    usageCount: 12,
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 3,
    createdBy: "system",
  },
  {
    id: "p-5",
    title: "Medical Literature Review",
    content: "Conduct a systematic review of the medical literature on the following topic:\n1. Summarize key studies and their methodologies\n2. Assess evidence quality (RCTs, meta-analyses, case studies)\n3. Compare treatment outcomes\n4. Note contraindications and side effects\n5. Provide evidence-based recommendations\n\nUse medical terminology appropriately and cite sources.",
    category: "Medical",
    tags: ["medical", "literature-review", "clinical"],
    isFavorite: true,
    usageCount: 9,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 1,
    createdBy: "system",
  },
  {
    id: "p-6",
    title: "Financial Analysis Report",
    content: "Perform a detailed financial analysis:\n1. Key financial metrics and ratios\n2. Revenue and cost trends\n3. Risk assessment\n4. Competitive positioning\n5. Forward-looking projections\n6. Investment recommendations\n\nUse quantitative data where available and clearly state assumptions.",
    category: "Finance",
    tags: ["finance", "analysis", "investment"],
    isFavorite: false,
    usageCount: 15,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now(),
    createdBy: "system",
  },
];

let promptCounter = prompts.length;

const CATEGORIES = ["Development", "Research", "Analytics", "Writing", "Medical", "Finance", "Marketing", "Education", "Creative", "General"];

router.get("/prompts", (_req, res): void => {
  res.json(prompts);
});

router.get("/prompts/categories", (_req, res): void => {
  res.json(CATEGORIES);
});

router.post("/prompts", requireAuth, (req, res): void => {
  const { title, content, category, tags } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: "Title and content are required" });
    return;
  }
  promptCounter++;
  const prompt: Prompt = {
    id: `p-${promptCounter}`,
    title,
    content,
    category: category || "General",
    tags: tags || [],
    isFavorite: false,
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: (req as any).user?.username || "anonymous",
  };
  prompts.push(prompt);
  res.json(prompt);
});

router.patch("/prompts/:id", (req, res): void => {
  const p = prompts.find(p => p.id === req.params.id);
  if (!p) { res.status(404).json({ error: "Prompt not found" }); return; }
  if (req.body.title !== undefined) p.title = req.body.title;
  if (req.body.content !== undefined) p.content = req.body.content;
  if (req.body.category !== undefined) p.category = req.body.category;
  if (req.body.tags !== undefined) p.tags = req.body.tags;
  if (req.body.isFavorite !== undefined) p.isFavorite = req.body.isFavorite;
  p.updatedAt = Date.now();
  res.json(p);
});

router.post("/prompts/:id/use", requireAuth, (req, res): void => {
  const p = prompts.find(p => p.id === req.params.id);
  if (!p) { res.status(404).json({ error: "Prompt not found" }); return; }
  p.usageCount++;
  p.updatedAt = Date.now();
  res.json(p);
});

router.delete("/prompts/:id", requireAuth, (req, res): void => {
  const idx = prompts.findIndex(p => p.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Prompt not found" }); return; }
  prompts.splice(idx, 1);
  res.json({ success: true });
});

export default router;
