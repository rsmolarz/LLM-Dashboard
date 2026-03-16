import { Router, type IRouter } from "express";
import { db, llmConfigTable } from "@workspace/db";
import {
  GetLlmStatusResponse,
  ListModelsResponse,
  ListRunningModelsResponse,
  PullModelBody,
  PullModelResponse,
  DeleteModelParams,
  DeleteModelResponse,
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
        version: null,
        modelsCount: 0,
        runningModels: [],
        error: "Server URL not configured",
      })
    );
    return;
  }

  try {
    const tagsRes = await fetch(`${serverUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!tagsRes.ok) {
      res.json(
        GetLlmStatusResponse.parse({
          online: false,
          serverHealth: "error",
          version: null,
          modelsCount: 0,
          runningModels: [],
          error: `Server returned ${tagsRes.status}`,
        })
      );
      return;
    }

    const tagsData = (await tagsRes.json()) as {
      models?: Array<{ name: string }>;
    };
    const modelsCount = tagsData.models?.length ?? 0;

    let version: string | null = null;
    try {
      const versionRes = await fetch(`${serverUrl}/api/version`, {
        signal: AbortSignal.timeout(3000),
      });
      if (versionRes.ok) {
        const versionData = (await versionRes.json()) as { version?: string };
        version = versionData.version ?? null;
      }
    } catch {
      // version endpoint may not be available
    }

    let runningModels: string[] = [];
    try {
      const psRes = await fetch(`${serverUrl}/api/ps`, {
        signal: AbortSignal.timeout(3000),
      });
      if (psRes.ok) {
        const psData = (await psRes.json()) as {
          models?: Array<{ name: string }>;
        };
        runningModels = psData.models?.map((m) => m.name) ?? [];
      }
    } catch {
      // ps endpoint may not be available
    }

    res.json(
      GetLlmStatusResponse.parse({
        online: true,
        serverHealth: "ok",
        version,
        modelsCount,
        runningModels,
        error: null,
      })
    );
  } catch (err) {
    res.json(
      GetLlmStatusResponse.parse({
        online: false,
        serverHealth: "offline",
        version: null,
        modelsCount: 0,
        runningModels: [],
        error: err instanceof Error ? err.message : "Connection failed",
      })
    );
  }
});

router.get("/llm/models", async (_req, res): Promise<void> => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.json([]);
    return;
  }

  try {
    const tagsRes = await fetch(`${serverUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!tagsRes.ok) {
      res.json([]);
      return;
    }

    const data = (await tagsRes.json()) as {
      models?: Array<{
        name: string;
        size: number;
        digest: string;
        modified_at: string;
        details?: {
          parameter_size?: string;
          quantization_level?: string;
          family?: string;
        };
      }>;
    };

    const models = (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      digest: m.digest,
      modifiedAt: m.modified_at,
      parameterSize: m.details?.parameter_size ?? null,
      quantizationLevel: m.details?.quantization_level ?? null,
      family: m.details?.family ?? null,
    }));

    res.json(ListModelsResponse.parse(models));
  } catch {
    res.json([]);
  }
});

router.get("/llm/models/running", async (_req, res): Promise<void> => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.json([]);
    return;
  }

  try {
    const psRes = await fetch(`${serverUrl}/api/ps`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!psRes.ok) {
      res.json([]);
      return;
    }

    const data = (await psRes.json()) as {
      models?: Array<{
        name: string;
        size: number;
        size_vram: number;
        expires_at: string;
      }>;
    };

    const models = (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      sizeVram: m.size_vram,
      expiresAt: m.expires_at,
    }));

    res.json(ListRunningModelsResponse.parse(models));
  } catch {
    res.json([]);
  }
});

router.post("/llm/models/pull", async (req, res): Promise<void> => {
  const parsed = PullModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.status(503).json(
      PullModelResponse.parse({
        success: false,
        message: "Ollama server not configured",
      })
    );
    return;
  }

  try {
    const pullRes = await fetch(`${serverUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: parsed.data.name, stream: false }),
      signal: AbortSignal.timeout(600000),
    });

    if (!pullRes.ok) {
      const text = await pullRes.text();
      res.json(
        PullModelResponse.parse({
          success: false,
          message: `Pull failed: ${text}`,
        })
      );
      return;
    }

    res.json(
      PullModelResponse.parse({
        success: true,
        message: `Model ${parsed.data.name} pulled successfully`,
      })
    );
  } catch (err) {
    res.json(
      PullModelResponse.parse({
        success: false,
        message: err instanceof Error ? err.message : "Pull failed",
      })
    );
  }
});

router.delete("/llm/models/:name", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.json(
      DeleteModelResponse.parse({
        success: false,
        message: "Ollama server not configured",
      })
    );
    return;
  }

  try {
    const delRes = await fetch(`${serverUrl}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: raw }),
      signal: AbortSignal.timeout(30000),
    });

    if (!delRes.ok) {
      const text = await delRes.text();
      res.json(
        DeleteModelResponse.parse({
          success: false,
          message: `Delete failed: ${text}`,
        })
      );
      return;
    }

    res.json(
      DeleteModelResponse.parse({
        success: true,
        message: `Model ${raw} deleted`,
      })
    );
  } catch (err) {
    res.json(
      DeleteModelResponse.parse({
        success: false,
        message: err instanceof Error ? err.message : "Delete failed",
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
    res.status(503).json({ error: "Ollama server not configured" });
    return;
  }

  try {
    const ollamaRes = await fetch(`${serverUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: parsed.data.model,
        messages: parsed.data.messages,
        stream: false,
        options: {
          temperature: parsed.data.temperature ?? 0.7,
        },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      res.status(502).json({ error: `Ollama error: ${text}` });
      return;
    }

    const data = (await ollamaRes.json()) as {
      message?: { content?: string };
      model?: string;
      total_duration?: number;
      eval_count?: number;
    };

    const content = data.message?.content ?? "No response generated";

    res.json(
      SendChatMessageResponse.parse({
        content,
        model: data.model ?? null,
        totalDuration: data.total_duration ?? null,
        evalCount: data.eval_count ?? null,
      })
    );
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to connect to Ollama",
    });
  }
});

export default router;
