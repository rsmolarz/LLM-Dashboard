import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, llmConfigTable } from "@workspace/db";
import { rateLimiter } from "../middlewares/rateLimiter";

const router: IRouter = Router();

router.use("/research", rateLimiter(10, 60000));

async function getOllamaUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  return config?.serverUrl ?? null;
}

async function getOllamaModels(serverUrl: string): Promise<string[]> {
  const res = await fetch(`${serverUrl}/api/tags`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  return (data.models || []).map((m: any) => m.name);
}

async function queryOllama(
  serverUrl: string,
  model: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${serverUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama ${model} failed: ${text}`);
  }

  const data = (await res.json()) as any;
  return data.message?.content ?? "";
}

async function queryOpenAI(prompt: string, systemPrompt?: string): Promise<string> {
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages,
  });

  return response.choices[0]?.message?.content ?? "";
}

async function queryAnthropic(prompt: string, systemPrompt?: string): Promise<string> {
  const { anthropic } = await import("@workspace/integrations-anthropic-ai");
  const messages: Array<{ role: "user"; content: string }> = [
    { role: "user", content: prompt },
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages,
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

router.get("/research/models", async (_req, res): Promise<void> => {
  const serverUrl = await getOllamaUrl();
  const ollamaModels = serverUrl ? await getOllamaModels(serverUrl) : [];

  const hasOpenAI = !!(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  );
  const hasAnthropic = !!(
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY
  );

  res.json({
    ollama: ollamaModels,
    cloudAvailable: {
      openai: hasOpenAI,
      anthropic: hasAnthropic,
    },
    modes: {
      deep: {
        available: ollamaModels.length >= 2,
        modelCount: ollamaModels.length,
        description: "Run prompt through all local Ollama models in parallel",
      },
      extensive: {
        available: ollamaModels.length >= 1 && (hasOpenAI || hasAnthropic),
        modelCount:
          ollamaModels.length + (hasOpenAI ? 1 : 0) + (hasAnthropic ? 1 : 0),
        description:
          "Run through all local models + Claude and GPT for maximum coverage",
      },
    },
  });
});

router.post("/research/run", async (req, res): Promise<void> => {
  const { prompt, mode, systemPrompt } = req.body as {
    prompt?: string;
    mode?: "deep" | "extensive";
    systemPrompt?: string;
  };

  if (!prompt || !prompt.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const researchMode = mode || "deep";
  const serverUrl = await getOllamaUrl();

  if (!serverUrl) {
    res.status(503).json({ error: "Ollama server not configured" });
    return;
  }

  const ollamaModels = await getOllamaModels(serverUrl);

  if (ollamaModels.length === 0) {
    res.status(503).json({ error: "No Ollama models available" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const modelResults: Array<{
    model: string;
    provider: string;
    response: string;
    durationMs: number;
    error?: string;
  }> = [];

  sendEvent({
    type: "start",
    mode: researchMode,
    prompt,
    totalModels:
      researchMode === "extensive"
        ? ollamaModels.length + 2
        : ollamaModels.length,
  });

  const ollamaPromises = ollamaModels.map(async (model) => {
    sendEvent({ type: "model_start", model, provider: "ollama" });
    const start = Date.now();
    try {
      const response = await queryOllama(serverUrl, model, prompt, systemPrompt);
      const duration = Date.now() - start;
      const result = {
        model,
        provider: "ollama",
        response,
        durationMs: duration,
      };
      modelResults.push(result);
      sendEvent({
        type: "model_complete",
        model,
        provider: "ollama",
        response,
        durationMs: duration,
      });
    } catch (err: any) {
      const duration = Date.now() - start;
      const result = {
        model,
        provider: "ollama",
        response: "",
        durationMs: duration,
        error: err?.message ?? "Unknown error",
      };
      modelResults.push(result);
      sendEvent({
        type: "model_error",
        model,
        provider: "ollama",
        error: err?.message ?? "Unknown error",
        durationMs: duration,
      });
    }
  });

  const cloudPromises: Promise<void>[] = [];

  if (researchMode === "extensive") {
    if (
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    ) {
      cloudPromises.push(
        (async () => {
          sendEvent({
            type: "model_start",
            model: "gpt-5.2",
            provider: "openai",
          });
          const start = Date.now();
          try {
            const response = await queryOpenAI(prompt, systemPrompt);
            const duration = Date.now() - start;
            modelResults.push({
              model: "gpt-5.2",
              provider: "openai",
              response,
              durationMs: duration,
            });
            sendEvent({
              type: "model_complete",
              model: "gpt-5.2",
              provider: "openai",
              response,
              durationMs: duration,
            });
          } catch (err: any) {
            const duration = Date.now() - start;
            modelResults.push({
              model: "gpt-5.2",
              provider: "openai",
              response: "",
              durationMs: duration,
              error: err?.message ?? "Unknown error",
            });
            sendEvent({
              type: "model_error",
              model: "gpt-5.2",
              provider: "openai",
              error: err?.message ?? "Unknown error",
              durationMs: duration,
            });
          }
        })()
      );
    }

    if (
      process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY
    ) {
      cloudPromises.push(
        (async () => {
          sendEvent({
            type: "model_start",
            model: "claude-sonnet-4-6",
            provider: "anthropic",
          });
          const start = Date.now();
          try {
            const response = await queryAnthropic(prompt, systemPrompt);
            const duration = Date.now() - start;
            modelResults.push({
              model: "claude-sonnet-4-6",
              provider: "anthropic",
              response,
              durationMs: duration,
            });
            sendEvent({
              type: "model_complete",
              model: "claude-sonnet-4-6",
              provider: "anthropic",
              response,
              durationMs: duration,
            });
          } catch (err: any) {
            const duration = Date.now() - start;
            modelResults.push({
              model: "claude-sonnet-4-6",
              provider: "anthropic",
              response: "",
              durationMs: duration,
              error: err?.message ?? "Unknown error",
            });
            sendEvent({
              type: "model_error",
              model: "claude-sonnet-4-6",
              provider: "anthropic",
              error: err?.message ?? "Unknown error",
              durationMs: duration,
            });
          }
        })()
      );
    }
  }

  await Promise.all([...ollamaPromises, ...cloudPromises]);

  sendEvent({ type: "synthesis_start" });

  const successfulResults = modelResults.filter(
    (r) => r.response && !r.error
  );

  if (successfulResults.length === 0) {
    sendEvent({
      type: "synthesis_complete",
      synthesis: "All models failed to generate responses.",
      results: modelResults,
    });
    sendEvent({ type: "done" });
    res.end();
    return;
  }

  const synthesisPrompt = `You are a research synthesis expert. Below are responses from ${successfulResults.length} different AI models to the same research prompt. Your job is to:

1. Identify the key themes and insights that appear across multiple responses
2. Note any unique insights that only one model provided
3. Flag any contradictions or disagreements between models
4. Produce a comprehensive, well-structured synthesis that combines the best insights from all responses
5. Rate the overall confidence level (High/Medium/Low) based on agreement across models

ORIGINAL PROMPT: "${prompt}"

${successfulResults
  .map(
    (r, i) =>
      `--- RESPONSE FROM ${r.model.toUpperCase()} (${r.provider}) ---\n${r.response}\n`
  )
  .join("\n")}

Provide your synthesis in this structure:
## Key Findings
(Main insights with cross-model agreement)

## Unique Insights
(Notable points from individual models)

## Contradictions & Caveats
(Any disagreements or uncertainties)

## Synthesis
(Your combined, comprehensive answer)

## Confidence Level
(High/Medium/Low with explanation)`;

  try {
    let synthesis: string;

    if (
      researchMode === "extensive" &&
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
    ) {
      synthesis = await queryOpenAI(synthesisPrompt);
    } else {
      const synthModel =
        ollamaModels.find((m) => m.includes("mistral")) ||
        ollamaModels[0];
      synthesis = await queryOllama(serverUrl, synthModel, synthesisPrompt);
    }

    sendEvent({
      type: "synthesis_complete",
      synthesis,
      results: modelResults.map((r) => ({
        model: r.model,
        provider: r.provider,
        durationMs: r.durationMs,
        error: r.error,
        responseLength: r.response.length,
      })),
    });
  } catch (err: any) {
    sendEvent({
      type: "synthesis_complete",
      synthesis: `Synthesis failed: ${err?.message ?? "Unknown error"}. Individual model responses are available above.`,
      results: modelResults.map((r) => ({
        model: r.model,
        provider: r.provider,
        durationMs: r.durationMs,
        error: r.error,
        responseLength: r.response.length,
      })),
    });
  }

  sendEvent({ type: "done" });
  res.end();
});

import { researchSessionsTable, researchFollowUpsTable } from "@workspace/db/schema";
import { desc as descOrder } from "drizzle-orm";

router.get("/research/sessions", async (_req, res): Promise<void> => {
  try {
    const sessions = await db.select().from(researchSessionsTable).orderBy(descOrder(researchSessionsTable.createdAt)).limit(50);
    const enriched = await Promise.all(sessions.map(async (s) => {
      const followUps = await db.select().from(researchFollowUpsTable)
        .where(eq(researchFollowUpsTable.sessionId, s.sessionId))
        .orderBy(researchFollowUpsTable.createdAt);
      return {
        id: s.sessionId,
        prompt: s.prompt,
        mode: s.mode,
        synthesis: s.synthesis,
        modelCount: s.modelCount,
        createdAt: s.createdAt?.toISOString() || new Date().toISOString(),
        followUps: followUps.map(f => ({
          question: f.question,
          answer: f.answer,
          timestamp: f.createdAt?.toISOString() || new Date().toISOString(),
        })),
      };
    }));
    res.json({ success: true, sessions: enriched });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/research/save-session", async (req, res): Promise<void> => {
  const { prompt, mode, synthesis, modelCount } = req.body;
  if (!prompt || !synthesis) {
    res.status(400).json({ success: false, error: "prompt and synthesis required" });
    return;
  }
  try {
    const sessionId = `research-${Date.now()}`;
    const [session] = await db.insert(researchSessionsTable).values({
      sessionId,
      prompt,
      mode: mode || "deep",
      synthesis,
      modelCount: modelCount || 0,
    }).returning();
    res.json({
      success: true,
      session: {
        id: sessionId,
        prompt,
        mode: mode || "deep",
        synthesis,
        modelCount: modelCount || 0,
        createdAt: session?.createdAt?.toISOString() || new Date().toISOString(),
        followUps: [],
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/research/follow-up", async (req, res): Promise<void> => {
  const { sessionId, question } = req.body;
  if (!sessionId || !question) {
    res.status(400).json({ success: false, error: "sessionId and question required" });
    return;
  }

  try {
    const [session] = await db.select().from(researchSessionsTable)
      .where(eq(researchSessionsTable.sessionId, sessionId));
    if (!session) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }

    const existingFollowUps = await db.select().from(researchFollowUpsTable)
      .where(eq(researchFollowUpsTable.sessionId, sessionId));

    const serverUrl = await getOllamaUrl();
    if (!serverUrl) {
      res.status(503).json({ success: false, error: "Ollama not configured" });
      return;
    }

    const context = `Previous research question: ${session.prompt}\n\nPrevious synthesis:\n${session.synthesis}\n\n${existingFollowUps.length > 0 ? "Previous follow-up Q&A:\n" + existingFollowUps.map(f => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n") + "\n\n" : ""}`;
    const models = await getOllamaModels(serverUrl);
    const followUpModel = models.includes("qwen2.5:7b") ? "qwen2.5:7b" : models[0] || "llama3.2:latest";
    const answer = await queryOllama(
      serverUrl,
      followUpModel,
      `${context}Follow-up question: ${question}\n\nProvide a detailed answer based on the previous research context.`
    );

    await db.insert(researchFollowUpsTable).values({
      sessionId,
      question,
      answer,
    });

    res.json({ success: true, answer, followUpCount: existingFollowUps.length + 1 });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/research/sessions/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(researchFollowUpsTable).where(eq(researchFollowUpsTable.sessionId, req.params.id));
    await db.delete(researchSessionsTable).where(eq(researchSessionsTable.sessionId, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
