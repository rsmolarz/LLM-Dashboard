ollamaimport { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { Agent } from "undici";
import { db, llmConfigTable, documentsTable, documentChunksTable } from "@workspace/db";
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

const ollamaAgent = new Agent({
  headersTimeout: 600000,
  bodyTimeout: 600000,
  connectTimeout: 30000,
});

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

router.get("/vps-status", async (_req, res): Promise<void> => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.json({ online: false, error: "Server not configured", cpu: null, memory: null, models: [], latencyMs: null });
    return;
  }

  const start = Date.now();
  try {
    const psRes = await fetch(`${serverUrl}/api/ps`, {
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;

    if (!psRes.ok) {
      res.json({ online: false, error: `Server returned ${psRes.status}`, cpu: null, memory: null, models: [], latencyMs });
      return;
    }

    const psData = (await psRes.json()) as {
      models?: Array<{
        name: string;
        size?: number;
        size_vram?: number;
        expires_at?: string;
        details?: { parameter_size?: string; family?: string };
      }>;
    };

    const loadedModels = (psData.models || []).map(m => ({
      name: m.name,
      ramBytes: m.size || 0,
      vramBytes: m.size_vram || 0,
      expiresAt: m.expires_at || null,
      parameterSize: m.details?.parameter_size || null,
    }));

    const totalRam = loadedModels.reduce((s, m) => s + m.ramBytes, 0);
    const totalVram = loadedModels.reduce((s, m) => s + m.vramBytes, 0);

    const cpuEstimate = loadedModels.length === 0
      ? 0
      : Math.min(100, Math.round(latencyMs > 500 ? 80 + Math.min(20, (latencyMs - 500) / 50) : loadedModels.length * 15 + (latencyMs / 20)));

    res.json({
      online: true,
      cpu: cpuEstimate,
      memory: { totalRam, totalVram, modelCount: loadedModels.length },
      models: loadedModels,
      latencyMs,
      error: null,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    res.json({
      online: false,
      error: err instanceof Error ? err.message : "Connection failed",
      cpu: null,
      memory: null,
      models: [],
      latencyMs,
    });
  }
});

router.get("/ollama/status", async (_req, res): Promise<void> => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.json({ online: false, error: "Ollama server not configured", models: [] });
    return;
  }

  try {
    const psRes = await fetch(`${serverUrl}/api/ps`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!psRes.ok) {
      res.json({ online: false, error: `Server returned ${psRes.status}`, models: [] });
      return;
    }

    const data = (await psRes.json()) as {
      models?: Array<{
        name: string;
        size: number;
        size_vram: number;
        expires_at: string;
        details?: { parameter_size?: string; family?: string; quantization_level?: string };
      }>;
    };

    res.json({
      online: true,
      models: (data.models ?? []).map(m => ({
        name: m.name,
        size: m.size,
        sizeVram: m.size_vram,
        expiresAt: m.expires_at,
        parameterSize: m.details?.parameter_size ?? null,
        family: m.details?.family ?? null,
        quantizationLevel: m.details?.quantization_level ?? null,
      })),
    });
  } catch (err) {
    res.json({
      online: false,
      error: err instanceof Error ? err.message : "Connection failed",
      models: [],
    });
  }
});

router.post("/ollama/load", async (req, res): Promise<void> => {
  const { model, keep_alive } = req.body || {};
  if (!model) {
    res.status(400).json({ success: false, message: "model field is required" });
    return;
  }

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.status(503).json({ success: false, message: "Ollama server not configured" });
    return;
  }

  try {
    const genRes = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: "",
        stream: false,
        keep_alive: keep_alive ?? "5m",
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!genRes.ok) {
      const text = await genRes.text();
      res.json({ success: false, message: `Failed to load model: ${text}` });
      return;
    }

    res.json({ success: true, message: `Model ${model} loaded with keep_alive=${keep_alive ?? "5m"}` });
  } catch (err) {
    res.json({ success: false, message: err instanceof Error ? err.message : "Load failed" });
  }
});

router.post("/ollama/unload", async (req, res): Promise<void> => {
  const { model } = req.body || {};
  if (!model) {
    res.status(400).json({ success: false, message: "model field is required" });
    return;
  }

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.status(503).json({ success: false, message: "Ollama server not configured" });
    return;
  }

  try {
    const genRes = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: "",
        stream: false,
        keep_alive: 0,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!genRes.ok) {
      const text = await genRes.text();
      res.json({ success: false, message: `Failed to unload model: ${text}` });
      return;
    }

    res.json({ success: true, message: `Model ${model} unloaded` });
  } catch (err) {
    res.json({ success: false, message: err instanceof Error ? err.message : "Unload failed" });
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

router.post("/llm/models/pull-stream", async (req, res): Promise<void> => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "model name required" });
    return;
  }
  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.status(503).json({ error: "Ollama server not configured" });
    return;
  }
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const pullRes = await fetch(`${serverUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name, stream: true }),
      signal: AbortSignal.timeout(1800000),
    });
    if (!pullRes.ok || !pullRes.body) {
      res.write(`data: ${JSON.stringify({ error: "Pull failed" })}\n\n`);
      res.end();
      return;
    }
    const reader = pullRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            res.write(`data: ${JSON.stringify(parsed)}\n\n`);
          } catch {}
        }
      }
    }
    if (buf.trim()) {
      try { res.write(`data: ${JSON.stringify(JSON.parse(buf))}\n\n`); } catch {}
    }
    res.write(`data: ${JSON.stringify({ status: "complete" })}\n\n`);
    res.end();
  } catch (err) {
    try {
      res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : "Pull failed" })}\n\n`);
      res.end();
    } catch {}
  }
});

router.post("/llm/models/load", async (req, res): Promise<void> => {
  const { name, keep_alive } = req.body || {};
  if (!name) {
    res.status(400).json({ success: false, message: "Model name is required" });
    return;
  }

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.status(503).json({ success: false, message: "Ollama server not configured" });
    return;
  }

  try {
    const genRes = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: name,
        prompt: "",
        stream: false,
        keep_alive: keep_alive ?? "5m",
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!genRes.ok) {
      const text = await genRes.text();
      res.json({ success: false, message: `Failed: ${text}` });
      return;
    }

    res.json({ success: true, message: keep_alive === 0 ? `Unloaded ${name}` : `Loaded ${name}` });
  } catch (err) {
    res.json({ success: false, message: err instanceof Error ? err.message : "Operation failed" });
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

async function searchRagContext(query: string, maxResults = 3): Promise<string | null> {
  try {
    const { searchVectorKnowledge } = await import("./rag-pipeline");
    const vectorResults = await searchVectorKnowledge(query, maxResults);
    if (vectorResults.length > 0 && vectorResults[0].score > 0.05) {
      return vectorResults
        .filter(r => r.score > 0.05)
        .map(r => `[From: ${r.title} (${r.sourceType}, score: ${r.score.toFixed(3)})]\n${r.content}`)
        .join("\n\n---\n\n");
    }
  } catch {}

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return null;

  const allChunks = await db
    .select({
      content: documentChunksTable.content,
      documentTitle: documentsTable.title,
    })
    .from(documentChunksTable)
    .innerJoin(documentsTable, eq(documentChunksTable.documentId, documentsTable.id));

  if (allChunks.length === 0) return null;

  const scored = allChunks.map(chunk => {
    const lowerContent = chunk.content.toLowerCase();
    let matchCount = 0;
    for (const word of queryWords) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = lowerContent.match(regex);
      if (matches) matchCount += matches.length;
    }
    return { ...chunk, matchCount };
  });

  const relevant = scored
    .filter(s => s.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, maxResults);

  if (relevant.length === 0) return null;

  return relevant
    .map(r => `[From: ${r.documentTitle}]\n${r.content}`)
    .join("\n\n---\n\n");
}

const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","shall","should","may","might","must","can","could",
  "i","you","he","she","it","we","they","me","him","her","us","them","my","your",
  "his","its","our","their","this","that","these","those","what","which","who","whom",
  "and","but","or","nor","not","so","yet","for","at","by","in","on","to","of","with",
  "from","up","out","if","then","than","too","very","just","about","above","after",
  "before","between","into","through","during","how","all","each","every","both","few",
  "more","most","other","some","such","no","only","same","also","any","here","there",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function computeTfIdf(docs: string[][], queryTokens: string[]) {
  const N = docs.length;
  const df: Record<string, number> = {};
  for (const doc of docs) {
    const unique = new Set(doc);
    for (const term of unique) df[term] = (df[term] || 0) + 1;
  }

  return docs.map((doc) => {
    const tf: Record<string, number> = {};
    for (const t of doc) tf[t] = (tf[t] || 0) + 1;
    const maxTf = Math.max(...Object.values(tf), 1);

    let score = 0;
    for (const qt of queryTokens) {
      if (tf[qt]) {
        const normalizedTf = 0.5 + 0.5 * (tf[qt] / maxTf);
        const idf = Math.log((N + 1) / ((df[qt] || 0) + 1)) + 1;
        score += normalizedTf * idf;
      }
    }

    const matchedTerms = queryTokens.filter(qt => tf[qt]);
    const coverageBonus = matchedTerms.length / Math.max(queryTokens.length, 1);
    score *= (1 + coverageBonus);

    return score;
  });
}

async function searchBrainContext(query: string, maxResults = 5): Promise<string | null> {
  const { Client } = await import("pg");
  const client = new Client({
    host: process.env.VPS_DB_HOST,
    port: parseInt(process.env.VPS_DB_PORT || "5432"),
    database: process.env.VPS_DB_NAME,
    user: process.env.VPS_DB_USER,
    password: process.env.VPS_DB_PASSWORD,
    ssl: false,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return null;

    const result = await client.query(
      `SELECT bc.content, bc.summary, bs.name as source_name
       FROM brain_chunks bc
       JOIN brain_sources bs ON bs.id = bc.source_id
       WHERE bs.status = 'indexed'
       ORDER BY bc.id LIMIT 500`
    );

    if (result.rows.length === 0) return null;

    const docTexts = result.rows.map((row: any) => row.content + " " + (row.summary || ""));
    const docTokens = docTexts.map(tokenize);
    const scores = computeTfIdf(docTokens, queryTokens);

    const scored = result.rows.map((row: any, i: number) => ({ ...row, score: scores[i] }));
    const relevant = scored
      .filter(s => s.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    if (relevant.length === 0) return null;

    return relevant
      .map(r => `[From: ${r.source_name} | Relevance: ${Math.round(r.score * 100) / 100}]\n${r.content}`)
      .join("\n\n---\n\n");
  } catch {
    return null;
  } finally {
    await client.end();
  }
}

async function prepareRagMessages(req: any, parsed: any) {
  let ragContext: string | null = null;
  let brainContext: string | null = null;
  let messagesWithRag = parsed.data.messages;

  const lastUserMsg = [...parsed.data.messages].reverse().find((m: any) => m.role === "user");

  if (parsed.data.useRag && lastUserMsg) {
    ragContext = await searchRagContext(lastUserMsg.content);
  }

  const useBrain = (req.body as any).useBrain;
  if (useBrain && lastUserMsg) {
    brainContext = await searchBrainContext(lastUserMsg.content);
  }

  const combinedContext = [ragContext, brainContext].filter(Boolean).join("\n\n===\n\n");

  if (combinedContext) {
    messagesWithRag = parsed.data.messages.map((m: any, i: number) => {
      if (i === parsed.data.messages.length - 1 && m.role === "user") {
        return {
          ...m,
          content: `Use the following knowledge context to help answer the question. If the context is not relevant, answer based on your own knowledge.\n\n--- PROJECT KNOWLEDGE CONTEXT ---\n${combinedContext}\n--- END CONTEXT ---\n\nQuestion: ${m.content}`,
        };
      }
      return m;
    });
  }

  return { messagesWithRag, ragContext, brainContext };
}

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

  const { messagesWithRag, ragContext, brainContext } = await prepareRagMessages(req, parsed);

  try {
    const ollamaRes = await fetch(`${serverUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: parsed.data.model,
        messages: messagesWithRag,
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
        ragContext: (ragContext || brainContext) ? `Context used: ${[ragContext ? "Knowledge Base" : "", brainContext ? "Project Brain" : ""].filter(Boolean).join(" + ")}` : null,
      })
    );
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to connect to Ollama",
    });
  }
});

router.post("/llm/chat/stream", async (req, res): Promise<void> => {
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

  const { messagesWithRag, ragContext, brainContext } = await prepareRagMessages(req, parsed);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  if (ragContext || brainContext) {
    const ctxLabel = [ragContext ? "Knowledge Base" : "", brainContext ? "Project Brain" : ""].filter(Boolean).join(" + ");
    res.write(`data: ${JSON.stringify({ type: "context", context: ctxLabel })}\n\n`);
  }

  try {
    const ollamaRes = await fetch(`${serverUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: parsed.data.model,
        messages: messagesWithRag,
        stream: true,
        options: {
          temperature: parsed.data.temperature ?? 0.7,
        },
      }),
      signal: AbortSignal.timeout(300000),
      // @ts-ignore
      dispatcher: ollamaAgent,
    });

    if (!ollamaRes.ok) {
      res.write(`data: ${JSON.stringify({ type: "error", error: `Ollama error: ${ollamaRes.status}` })}\n\n`);
      res.end();
      return;
    }

    const reader = ollamaRes.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ type: "error", error: "No response body" })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            fullContent += chunk.message.content;
            res.write(`data: ${JSON.stringify({ type: "token", content: chunk.message.content })}\n\n`);
          }
          if (chunk.done) {
            res.write(`data: ${JSON.stringify({
              type: "done",
              model: chunk.model,
              totalDuration: chunk.total_duration,
              evalCount: chunk.eval_count,
              fullContent,
            })}\n\n`);
          }
        } catch {}
      }
    }

    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        if (chunk.message?.content) {
          fullContent += chunk.message.content;
          res.write(`data: ${JSON.stringify({ type: "token", content: chunk.message.content })}\n\n`);
        }
        if (chunk.done) {
          res.write(`data: ${JSON.stringify({
            type: "done",
            model: chunk.model,
            totalDuration: chunk.total_duration,
            evalCount: chunk.eval_count,
            fullContent,
          })}\n\n`);
        }
      } catch {}
    }

    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", error: err instanceof Error ? err.message : "Stream failed" })}\n\n`);
    res.end();
  }
});

router.post("/ollama/create", async (req, res): Promise<void> => {
    const { name, modelfile } = req.body || {};
    if (!name || !modelfile) {
          res.status(400).json({ error: "name and modelfile are required" });
          return;
    }

    const serverUrl = await getServerUrl();
    if (!serverUrl) {
          res.status(503).json({ error: "Ollama server not configured" });
          return;
    }

    try {
          const createRes = await fetch(`${serverUrl}/api/create`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, modelfile, stream: false }),
                  signal: AbortSignal.timeout(120000),
          });

          if (!createRes.ok) {
                  const text = await createRes.text();
                  res.status(createRes.status).json({ error: `Ollama error: ${text}` });
                  return;
          }

          const data = await createRes.json();
          res.json({ success: true, message: `Model "${name}" created successfully`, data });
    } catch (err) {
          res.status(500).json({ error: err instanceof Error ? err.message : "Create failed" });
    }
});
    }
          }
          })
    }
    }
    }
})

export default router;
