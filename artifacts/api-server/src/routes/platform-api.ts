import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, sql } from "drizzle-orm";
import { Agent } from "undici";
import crypto from "crypto";
import { db, llmConfigTable, apiKeysTable } from "@workspace/db";

const router = Router();

const OPENROUTER_BASE_URL = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || "";

function isOpenRouterModel(model: string): boolean {
  return model.includes("/");
}

let cachedOpenRouterModels: any[] | null = null;
let cachedAt = 0;

async function fetchOpenRouterModels(): Promise<any[]> {
  if (cachedOpenRouterModels && Date.now() - cachedAt < 300000) return cachedOpenRouterModels;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return cachedOpenRouterModels || [];
    const data: any = await r.json();
    cachedOpenRouterModels = (data.data || []).map((m: any) => ({
      id: m.id,
      object: "model",
      created: 0,
      owned_by: "openrouter",
      permission: [],
      root: m.id,
      parent: null,
    }));
    cachedAt = Date.now();
    return cachedOpenRouterModels;
  } catch {
    return cachedOpenRouterModels || [];
  }
}

const ollamaAgent = new Agent({
  headersTimeout: 600000,
  bodyTimeout: 600000,
  connectTimeout: 30000,
});

function generateApiKey(): string {
  const bytes = crypto.randomBytes(32);
  return `ent_${bytes.toString("hex")}`;
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function getServerUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  if (!config) return null;
  return config.serverUrl;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

async function authenticateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: { message: "Missing or invalid Authorization header. Use: Bearer ent_xxx", type: "authentication_error", code: "invalid_api_key" } });
    return;
  }

  const key = authHeader.slice(7);
  const hash = hashKey(key);

  const [apiKey] = await db.select().from(apiKeysTable).where(and(eq(apiKeysTable.keyHash, hash), eq(apiKeysTable.active, true))).limit(1);

  if (!apiKey) {
    res.status(401).json({ error: { message: "Invalid API key", type: "authentication_error", code: "invalid_api_key" } });
    return;
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    res.status(401).json({ error: { message: "API key has expired", type: "authentication_error", code: "expired_api_key" } });
    return;
  }

  const now = Date.now();
  const windowMs = 60000;
  let limiter = rateLimitMap.get(apiKey.id);
  if (!limiter || now > limiter.resetAt) {
    limiter = { count: 0, resetAt: now + windowMs };
    rateLimitMap.set(apiKey.id, limiter);
  }
  limiter.count++;

  if (limiter.count > apiKey.rateLimit) {
    res.status(429).json({ error: { message: `Rate limit exceeded. Limit: ${apiKey.rateLimit} requests/min`, type: "rate_limit_error", code: "rate_limit_exceeded" } });
    return;
  }

  (req as any).apiKey = apiKey;

  db.update(apiKeysTable)
    .set({ lastUsedAt: new Date(), totalRequests: sql`${apiKeysTable.totalRequests} + 1` })
    .where(eq(apiKeysTable.id, apiKey.id))
    .then(() => {});

  next();
}

router.get("/v1/models", authenticateApiKey, async (_req, res) => {
  const allModels: any[] = [];

  const serverUrl = await getServerUrl();
  if (serverUrl) {
    try {
      const ollamaRes = await fetch(`${serverUrl}/api/tags`, {
        signal: AbortSignal.timeout(15000),
        // @ts-ignore
        dispatcher: ollamaAgent,
      });
      if (ollamaRes.ok) {
        const data: any = await ollamaRes.json();
        const ollamaModels = (data.models || []).map((m: any) => ({
          id: m.name,
          object: "model",
          created: m.modified_at ? Math.floor(new Date(m.modified_at).getTime() / 1000) : 0,
          owned_by: "ollama",
          permission: [],
          root: m.name,
          parent: null,
        }));
        allModels.push(...ollamaModels);
      }
    } catch {}
  }

  if (OPENROUTER_API_KEY) {
    const orModels = await fetchOpenRouterModels();
    allModels.push(...orModels);
  }

  res.json({ object: "list", data: allModels });
});

router.post("/v1/chat/completions", authenticateApiKey, async (req, res) => {
  const { model, messages, temperature, max_tokens, stream, top_p, frequency_penalty, presence_penalty } = req.body;

  if (!model) {
    res.status(400).json({ error: { message: "model is required", type: "invalid_request_error" } });
    return;
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: { message: "messages array is required and must not be empty", type: "invalid_request_error" } });
    return;
  }

  if (isOpenRouterModel(model)) {
    return handleOpenRouterChat(req, res, { model, messages, temperature, max_tokens, stream, top_p, frequency_penalty, presence_penalty });
  }

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.status(503).json({ error: { message: "LLM server not configured", type: "server_error" } });
    return;
  }

  const ollamaMessages = messages.map((m: any) => ({
    role: m.role,
    content: m.content,
  }));

  const options: any = {};
  if (temperature !== undefined) options.temperature = temperature;
  if (max_tokens !== undefined) options.num_predict = max_tokens;
  if (top_p !== undefined) options.top_p = top_p;
  if (frequency_penalty !== undefined) options.frequency_penalty = frequency_penalty;
  if (presence_penalty !== undefined) options.presence_penalty = presence_penalty;

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const completionId = `chatcmpl-${crypto.randomBytes(12).toString("hex")}`;

    try {
      const ollamaRes = await fetch(`${serverUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: ollamaMessages, stream: true, options }),
        signal: AbortSignal.timeout(300000),
        // @ts-ignore
        dispatcher: ollamaAgent,
      });

      if (!ollamaRes.ok) {
        res.write(`data: ${JSON.stringify({ error: { message: `LLM server error: ${ollamaRes.status}` } })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      const reader = ollamaRes.body?.getReader();
      if (!reader) {
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let totalTokens = 0;

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
              totalTokens++;
              const sseChunk = {
                id: completionId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: { content: chunk.message.content },
                  finish_reason: null,
                }],
              };
              res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
            }
            if (chunk.done) {
              const finalChunk = {
                id: completionId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              };
              res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
            }
          } catch {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.message?.content) {
            totalTokens++;
            res.write(`data: ${JSON.stringify({ id: completionId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: { content: chunk.message.content }, finish_reason: null }] })}\n\n`);
          }
          if (chunk.done) {
            res.write(`data: ${JSON.stringify({ id: completionId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
          }
        } catch {}
      }

      res.write("data: [DONE]\n\n");
      res.end();

      const apiKey = (req as any).apiKey;
      db.update(apiKeysTable).set({ totalTokens: sql`${apiKeysTable.totalTokens} + ${totalTokens}` }).where(eq(apiKeysTable.id, apiKey.id)).then(() => {});
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } else {
    try {
      const ollamaRes = await fetch(`${serverUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: ollamaMessages, stream: false, options }),
        signal: AbortSignal.timeout(300000),
        // @ts-ignore
        dispatcher: ollamaAgent,
      });

      if (!ollamaRes.ok) {
        res.status(502).json({ error: { message: `LLM server error: ${ollamaRes.status}`, type: "server_error" } });
        return;
      }

      const data: any = await ollamaRes.json();
      const content = data.message?.content || "";
      const completionId = `chatcmpl-${crypto.randomBytes(12).toString("hex")}`;
      const promptTokens = data.prompt_eval_count || 0;
      const completionTokens = data.eval_count || 0;

      const apiKey = (req as any).apiKey;
      db.update(apiKeysTable).set({ totalTokens: sql`${apiKeysTable.totalTokens} + ${promptTokens + completionTokens}` }).where(eq(apiKeysTable.id, apiKey.id)).then(() => {});

      res.json({
        id: completionId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      });
    } catch (err: any) {
      res.status(502).json({ error: { message: err.message || "LLM server unreachable", type: "server_error" } });
    }
  }
});

async function handleOpenRouterChat(req: Request, res: Response, params: any) {
  const { model, messages, temperature, max_tokens, stream, top_p, frequency_penalty, presence_penalty } = params;
  const completionId = `chatcmpl-${crypto.randomBytes(12).toString("hex")}`;

  const body: any = { model, messages, stream: !!stream };
  if (temperature !== undefined) body.temperature = temperature;
  if (max_tokens !== undefined) body.max_tokens = max_tokens;
  if (top_p !== undefined) body.top_p = top_p;
  if (frequency_penalty !== undefined) body.frequency_penalty = frequency_penalty;
  if (presence_penalty !== undefined) body.presence_penalty = presence_penalty;

  try {
    const orRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    });

    if (!orRes.ok) {
      const errText = await orRes.text();
      res.status(orRes.status).json({ error: { message: `OpenRouter error: ${errText}`, type: "server_error" } });
      return;
    }

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const reader = orRes.body?.getReader();
      if (!reader) { res.write("data: [DONE]\n\n"); res.end(); return; }
      const decoder = new TextDecoder();
      let totalTokens = 0;
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              res.write("data: [DONE]\n\n");
              continue;
            }
            try {
              const chunk = JSON.parse(payload);
              if (chunk.choices?.[0]?.delta?.content) totalTokens++;
              chunk.id = completionId;
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } catch {
              res.write(`${line}\n`);
            }
          }
        }
      }
      if (!buf.includes("[DONE]")) res.write("data: [DONE]\n\n");
      res.end();

      const apiKey = (req as any).apiKey;
      db.update(apiKeysTable).set({ totalTokens: sql`${apiKeysTable.totalTokens} + ${totalTokens}` }).where(eq(apiKeysTable.id, apiKey.id)).then(() => {});
    } else {
      const data: any = await orRes.json();
      data.id = completionId;

      const apiKey = (req as any).apiKey;
      const total = (data.usage?.total_tokens) || 0;
      db.update(apiKeysTable).set({ totalTokens: sql`${apiKeysTable.totalTokens} + ${total}` }).where(eq(apiKeysTable.id, apiKey.id)).then(() => {});

      res.json(data);
    }
  } catch (err: any) {
    res.status(502).json({ error: { message: err.message || "OpenRouter unreachable", type: "server_error" } });
  }
}

router.get("/platform-api/keys", async (_req, res) => {
  const keys = await db.select({
    id: apiKeysTable.id,
    name: apiKeysTable.name,
    keyPrefix: apiKeysTable.keyPrefix,
    scopes: apiKeysTable.scopes,
    rateLimit: apiKeysTable.rateLimit,
    totalRequests: apiKeysTable.totalRequests,
    totalTokens: apiKeysTable.totalTokens,
    active: apiKeysTable.active,
    lastUsedAt: apiKeysTable.lastUsedAt,
    expiresAt: apiKeysTable.expiresAt,
    createdAt: apiKeysTable.createdAt,
  }).from(apiKeysTable);
  res.json({ keys });
});

router.post("/platform-api/keys", async (req, res) => {
  const { name, scopes, rateLimit, expiresAt } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const rawKey = generateApiKey();
  const hash = hashKey(rawKey);
  const prefix = rawKey.slice(0, 12) + "...";

  const [key] = await db.insert(apiKeysTable).values({
    name: name.trim(),
    keyHash: hash,
    keyPrefix: prefix,
    scopes: scopes || "chat,models",
    rateLimit: rateLimit || 60,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();

  res.json({ key: { ...key, fullKey: rawKey } });
});

router.put("/platform-api/keys/:id", async (req, res) => {
  const { id } = req.params;
  const updates: any = {};

  if (req.body.name !== undefined) {
    if (typeof req.body.name !== "string") { res.status(400).json({ error: "name must be a string" }); return; }
    updates.name = req.body.name;
  }
  if (req.body.active !== undefined) updates.active = !!req.body.active;
  if (req.body.rateLimit !== undefined) {
    const rl = Number(req.body.rateLimit);
    if (isNaN(rl) || rl < 1) { res.status(400).json({ error: "rateLimit must be a positive number" }); return; }
    updates.rateLimit = rl;
  }
  if (req.body.scopes !== undefined) updates.scopes = req.body.scopes;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db.update(apiKeysTable).set(updates).where(eq(apiKeysTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Key not found" }); return; }
  res.json({ key: updated });
});

router.delete("/platform-api/keys/:id", async (req, res) => {
  const [deleted] = await db.delete(apiKeysTable).where(eq(apiKeysTable.id, req.params.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Key not found" }); return; }
  res.json({ deleted: true });
});

router.get("/platform-api/usage", async (_req, res) => {
  const keys = await db.select().from(apiKeysTable);
  const totalRequests = keys.reduce((s, k) => s + k.totalRequests, 0);
  const totalTokens = keys.reduce((s, k) => s + k.totalTokens, 0);
  const activeKeys = keys.filter(k => k.active).length;

  const serverUrl = await getServerUrl();
  let modelsCount = 0;
  let serverOnline = false;
  if (serverUrl) {
    try {
      const r = await fetch(`${serverUrl}/api/tags`, { signal: AbortSignal.timeout(3000), /* @ts-ignore */ dispatcher: ollamaAgent });
      if (r.ok) {
        const d: any = await r.json();
        modelsCount = d.models?.length || 0;
        serverOnline = true;
      }
    } catch {}
  }

  res.json({ totalRequests, totalTokens, activeKeys, totalKeys: keys.length, modelsCount, serverOnline });
});

router.get("/ollama/api/tags", async (_req, res) => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.json({ models: [] }); return; }
  try {
    const r = await fetch(`${serverUrl}/api/tags`, { signal: AbortSignal.timeout(15000), /* @ts-ignore */ dispatcher: ollamaAgent });
    if (!r.ok) { res.json({ models: [] }); return; }
    res.json(await r.json());
  } catch { res.json({ models: [] }); }
});

router.get("/ollama/api/version", async (_req, res) => {
  res.json({ version: "0.18.0" });
});

router.post("/ollama/api/chat", async (req, res) => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "LLM server not configured" }); return; }
  const { model, messages, stream = true, options } = req.body;
  if (!model) { res.status(400).json({ error: "model is required" }); return; }
  try {
    const ollamaRes = await fetch(`${serverUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream, options }),
      signal: AbortSignal.timeout(300000),
      // @ts-ignore
      dispatcher: ollamaAgent,
    });
    if (!ollamaRes.ok) { res.status(ollamaRes.status).json({ error: await ollamaRes.text() }); return; }
    if (stream && ollamaRes.body) {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Cache-Control", "no-cache");
      const reader = ollamaRes.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    } else { res.json(await ollamaRes.json()); }
  } catch (err: any) { res.status(502).json({ error: err.message || "LLM server unreachable" }); }
});

router.post("/ollama/api/generate", async (req, res) => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "LLM server not configured" }); return; }
  try {
    const ollamaRes = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(300000),
      // @ts-ignore
      dispatcher: ollamaAgent,
    });
    if (!ollamaRes.ok) { res.status(ollamaRes.status).json({ error: await ollamaRes.text() }); return; }
    if (req.body.stream !== false && ollamaRes.body) {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Cache-Control", "no-cache");
      const reader = ollamaRes.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    } else { res.json(await ollamaRes.json()); }
  } catch (err: any) { res.status(502).json({ error: err.message || "LLM server unreachable" }); }
});

router.post("/ollama/api/show", async (req, res) => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "LLM server not configured" }); return; }
  try {
    const r = await fetch(`${serverUrl}/api/show`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(15000), /* @ts-ignore */ dispatcher: ollamaAgent });
    res.status(r.status).json(await r.json());
  } catch (err: any) { res.status(502).json({ error: err.message }); }
});

router.get("/ollama/api/ps", async (_req, res) => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.json({ models: [] }); return; }
  try {
    const r = await fetch(`${serverUrl}/api/ps`, { signal: AbortSignal.timeout(5000), /* @ts-ignore */ dispatcher: ollamaAgent });
    res.json(await r.json());
  } catch { res.json({ models: [] }); }
});

export default router;
