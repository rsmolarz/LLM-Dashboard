import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

async function searchRagContext(query: string, maxResults = 3): Promise<string | null> {
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
    host: "72.60.167.64",
    port: 5432,
    database: "llmhub",
    user: "llmhub",
    password: "Asherharper1!",
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

  let ragContext: string | null = null;
  let brainContext: string | null = null;
  let messagesWithRag = parsed.data.messages;

  const lastUserMsg = [...parsed.data.messages].reverse().find(m => m.role === "user");

  if (parsed.data.useRag && lastUserMsg) {
    ragContext = await searchRagContext(lastUserMsg.content);
  }

  const useBrain = (req.body as any).useBrain;
  if (useBrain && lastUserMsg) {
    brainContext = await searchBrainContext(lastUserMsg.content);
  }

  const combinedContext = [ragContext, brainContext].filter(Boolean).join("\n\n===\n\n");

  if (combinedContext) {
    messagesWithRag = parsed.data.messages.map((m, i) => {
      if (i === parsed.data.messages.length - 1 && m.role === "user") {
        return {
          ...m,
          content: `Use the following knowledge context to help answer the question. If the context is not relevant, answer based on your own knowledge.\n\n--- PROJECT KNOWLEDGE CONTEXT ---\n${combinedContext}\n--- END CONTEXT ---\n\nQuestion: ${m.content}`,
        };
      }
      return m;
    });
  }

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

export default router;
