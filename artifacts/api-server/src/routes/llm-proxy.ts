import { Router, type IRouter } from "express";
import { db, llmConfigTable } from "@workspace/db";
import {
  GetLlmStatusResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getServerUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  if (!config) return null;
  return config.serverUrl;
}

router.get("/llm/status", async (_req, res): Promise<void> => {
  const serverUrl = await getServerUrl();

  if (!serverUrl) {
    res.json(
      GetLlmStatusResponse.parse({
        online: false,
        serverHealth: "not_configured",
        modelLoaded: null,
        slotsTotal: 0,
        slotsUsed: 0,
        error: "Server URL not configured",
      })
    );
    return;
  }

  try {
    const healthRes = await fetch(`${serverUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!healthRes.ok) {
      res.json(
        GetLlmStatusResponse.parse({
          online: false,
          serverHealth: "error",
          modelLoaded: null,
          slotsTotal: 0,
          slotsUsed: 0,
          error: `Server returned ${healthRes.status}`,
        })
      );
      return;
    }

    const healthData = await healthRes.json() as Record<string, unknown>;

    let modelName: string | null = null;
    let slotsTotal = 0;
    let slotsUsed = 0;

    try {
      const slotsRes = await fetch(`${serverUrl}/slots`, {
        signal: AbortSignal.timeout(5000),
      });
      if (slotsRes.ok) {
        const slotsData = (await slotsRes.json()) as Array<Record<string, unknown>>;
        slotsTotal = slotsData.length;
        slotsUsed = slotsData.filter(
          (s) => s.state !== undefined && s.state !== 0
        ).length;
        if (slotsData.length > 0 && slotsData[0].model) {
          modelName = slotsData[0].model as string;
        }
      }
    } catch {
      // slots endpoint may not be available
    }

    if (!modelName) {
      try {
        const propsRes = await fetch(`${serverUrl}/props`, {
          signal: AbortSignal.timeout(5000),
        });
        if (propsRes.ok) {
          const propsData = (await propsRes.json()) as Record<string, unknown>;
          if (propsData.default_generation_settings && typeof propsData.default_generation_settings === 'object') {
            const settings = propsData.default_generation_settings as Record<string, unknown>;
            if (settings.model) {
              modelName = settings.model as string;
            }
          }
        }
      } catch {
        // props endpoint may not be available
      }
    }

    res.json(
      GetLlmStatusResponse.parse({
        online: true,
        serverHealth: (healthData.status as string) || "ok",
        modelLoaded: modelName,
        slotsTotal,
        slotsUsed,
        error: null,
      })
    );
  } catch (err) {
    res.json(
      GetLlmStatusResponse.parse({
        online: false,
        serverHealth: "offline",
        modelLoaded: null,
        slotsTotal: 0,
        slotsUsed: 0,
        error: err instanceof Error ? err.message : "Connection failed",
      })
    );
  }
});

router.post("/llm/chat", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.status(503).json({ error: "LLM server not configured" });
    return;
  }

  try {
    const llamaRes = await fetch(`${serverUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: parsed.data.messages,
        temperature: parsed.data.temperature ?? 0.7,
        max_tokens: parsed.data.maxTokens ?? 512,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!llamaRes.ok) {
      const text = await llamaRes.text();
      res.status(502).json({ error: `LLM server error: ${text}` });
      return;
    }

    const data = (await llamaRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { total_tokens?: number };
    };

    const content =
      data.choices?.[0]?.message?.content ?? "No response generated";

    res.json(
      SendChatMessageResponse.parse({
        content,
        model: data.model ?? null,
        tokensUsed: data.usage?.total_tokens ?? 0,
      })
    );
  } catch (err) {
    res.status(502).json({
      error:
        err instanceof Error ? err.message : "Failed to connect to LLM server",
    });
  }
});

export default router;
