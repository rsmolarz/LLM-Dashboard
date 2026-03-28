import { Router } from "express";

const router = Router();

const OLLAMA_HOST = "http://72.60.167.64:11434";

interface CompareResult {
  id: string;
  prompt: string;
  responses: {
    model: string;
    content: string;
    tokensUsed: number;
    latencyMs: number;
    rating: number | null;
  }[];
  createdAt: number;
}

const compareHistory: CompareResult[] = [];
let compareCounter = 0;

router.post("/model-compare/run", async (req, res): Promise<void> => {
  const { prompt, models } = req.body;
  if (!prompt || !models || !Array.isArray(models) || models.length < 2) {
    res.status(400).json({ error: "Prompt and at least 2 models required" });
    return;
  }

  compareCounter++;
  const id = `cmp-${compareCounter}`;

  const responses = await Promise.all(
    models.map(async (model: string) => {
      const start = Date.now();
      try {
        const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            stream: false,
          }),
        });
        const data = await r.json();
        const latencyMs = Date.now() - start;
        return {
          model,
          content: data.message?.content || "No response",
          tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          latencyMs,
          rating: null as number | null,
        };
      } catch (e: any) {
        return {
          model,
          content: `Error: ${e.message || "Failed to get response"}`,
          tokensUsed: 0,
          latencyMs: Date.now() - start,
          rating: null as number | null,
        };
      }
    })
  );

  const result: CompareResult = { id, prompt, responses, createdAt: Date.now() };
  compareHistory.unshift(result);
  if (compareHistory.length > 50) compareHistory.pop();
  res.json(result);
});

router.post("/model-compare/:id/rate", (req, res): void => {
  const { model, rating } = req.body;
  const cmp = compareHistory.find(c => c.id === req.params.id);
  if (!cmp) { res.status(404).json({ error: "Comparison not found" }); return; }
  const resp = cmp.responses.find(r => r.model === model);
  if (!resp) { res.status(404).json({ error: "Model not found in comparison" }); return; }
  resp.rating = rating;
  res.json(cmp);
});

router.get("/model-compare/history", (_req, res): void => {
  res.json(compareHistory);
});

export default router;
