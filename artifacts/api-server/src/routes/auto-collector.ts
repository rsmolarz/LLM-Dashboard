import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vpsDatabaseConfigTable, trainingDataTable, chatMessagesTable, conversationsTable, documentsTable, discoveredSourcesTable } from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { getUncachableGmailClient, driveProxyJson, driveProxyText } from "./google-clients";

const router: IRouter = Router();

interface CollectorConfig {
  enabled: boolean;
  intervalMinutes: number;
  sources: {
    gmail: { enabled: boolean; queries: string[] };
    drive: { enabled: boolean; queries: string[] };
    conversations: { enabled: boolean; minRating: number };
    discovery: { enabled: boolean; categories: string[] };
    knowledgeBase: { enabled: boolean };
  };
  processing: {
    autoProcess: boolean;
    autoRate: boolean;
    generateQA: boolean;
  };
}

interface RunRecord {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  results: {
    gmail: number;
    drive: number;
    conversations: number;
    discovery: number;
    knowledgeBase: number;
    processed: number;
    errors: string[];
  };
}

let collectorConfig: CollectorConfig = {
  enabled: false,
  intervalMinutes: 30,
  sources: {
    gmail: {
      enabled: true,
      queries: [
        "database OR dataset OR API OR data source",
        "machine learning OR AI OR training data",
        "analytics OR insights OR report",
        "project update OR deliverable OR milestone",
        "research OR study OR findings",
      ],
    },
    drive: {
      enabled: true,
      queries: [
        "training data",
        "project documentation",
        "research notes",
        "analysis report",
        "dataset",
      ],
    },
    conversations: { enabled: true, minRating: 3 },
    discovery: {
      enabled: true,
      categories: ["research", "code", "business", "market-data", "alt-data"],
    },
    knowledgeBase: { enabled: true },
  },
  processing: {
    autoProcess: true,
    autoRate: true,
    generateQA: true,
  },
};

let collectorInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let runHistory: RunRecord[] = [];
let lastRunAt: string | null = null;

async function getVpsClient() {
  const [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);
  if (!config || !config.password || !config.isActive) return null;
  const connectionString = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}${config.sslEnabled ? "?sslmode=require" : ""}`;
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  return client;
}

async function saveToVps(items: Array<{ source_type: string; source_id: string; title: string; sender?: string; content: string; metadata?: any; status?: string }>) {
  let client;
  try {
    client = await getVpsClient();
    if (!client) return { inserted: 0, skipped: 0, error: "VPS not configured" };

    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      try {
        await client.query(
          `INSERT INTO training_sources (source_type, source_id, title, sender, content, content_preview, metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (source_type, source_id) DO UPDATE SET
             content = EXCLUDED.content,
             content_preview = EXCLUDED.content_preview,
             metadata = EXCLUDED.metadata,
             collected_at = NOW()`,
          [
            item.source_type,
            item.source_id,
            item.title || "",
            item.sender || "",
            item.content || "",
            (item.content || "").slice(0, 500),
            JSON.stringify(item.metadata || {}),
            item.status || "collected",
          ]
        );
        inserted++;
      } catch {
        skipped++;
      }
    }

    await client.end();
    return { inserted, skipped };
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    return { inserted: 0, skipped: 0, error: err?.message };
  }
}

async function collectGmail(queries: string[]): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const items: any[] = [];

  for (const query of queries) {
    try {
      const gmail = await getUncachableGmailClient();
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 15,
      });

      const messages = listRes.data.messages || [];

      for (const msg of messages.slice(0, 15)) {
        try {
          const detail = await gmail.users.messages.get({
            userId: "me",
            id: msg.id!,
            format: "full",
            metadataHeaders: ["Subject", "From", "Date"],
          });

          const headers = detail.data.payload?.headers || [];
          const subject = headers.find((h: any) => h.name === "Subject")?.value || "(No Subject)";
          const from = headers.find((h: any) => h.name === "From")?.value || "";
          const date = headers.find((h: any) => h.name === "Date")?.value || "";
          const labels = detail.data.labelIds || [];

          let body = "";
          function extractText(part: any): string {
            if (part.mimeType === "text/plain" && part.body?.data) {
              return Buffer.from(part.body.data, "base64").toString("utf-8");
            }
            if (part.parts) return part.parts.map(extractText).join("\n");
            return "";
          }
          if (detail.data.payload) body = extractText(detail.data.payload);
          if (!body) body = detail.data.snippet || "";

          items.push({
            source_type: "gmail",
            source_id: msg.id!,
            title: subject,
            sender: from,
            content: body.slice(0, 50000),
            metadata: { date, labels, query, collectedBy: "auto-collector" },
          });
        } catch (err: any) {
          errors.push(`Gmail message ${msg.id}: ${err?.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Gmail query "${query}": ${err?.message}`);
    }
  }

  if (items.length > 0) {
    const result = await saveToVps(items);
    return { count: result.inserted, errors };
  }
  return { count: 0, errors };
}

async function collectDrive(queries: string[]): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const items: any[] = [];

  for (const query of queries) {
    try {
      const driveQuery = `fullText contains '${query.replace(/'/g, "\\'")}' and trashed=false`;
      const data = await driveProxyJson(
        `/drive/v3/files?q=${encodeURIComponent(driveQuery)}&pageSize=15&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,owners)&orderBy=modifiedTime desc`
      ) as any;

      for (const file of (data.files || [])) {
        try {
          let content = "";

          if (file.mimeType === "application/vnd.google-apps.document") {
            content = await driveProxyText(`/drive/v3/files/${file.id}/export?mimeType=text/plain`);
          } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
            content = await driveProxyText(`/drive/v3/files/${file.id}/export?mimeType=text/csv`);
          } else if (file.mimeType?.startsWith("text/") || file.mimeType === "application/json") {
            content = await driveProxyText(`/drive/v3/files/${file.id}?alt=media`);
          }

          items.push({
            source_type: "drive",
            source_id: file.id,
            title: file.name || "Untitled",
            sender: file.owners?.[0]?.displayName || "",
            content: content.slice(0, 100000),
            metadata: {
              mimeType: file.mimeType,
              modifiedTime: file.modifiedTime,
              size: file.size,
              webViewLink: file.webViewLink,
              query,
              collectedBy: "auto-collector",
            },
          });
        } catch (err: any) {
          errors.push(`Drive file ${file.name}: ${err?.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Drive query "${query}": ${err?.message}`);
    }
  }

  if (items.length > 0) {
    const result = await saveToVps(items);
    return { count: result.inserted, errors };
  }
  return { count: 0, errors };
}

async function collectConversations(minRating: number): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const items: any[] = [];

  try {
    const allConversations = await db.select().from(conversationsTable).orderBy(desc(conversationsTable.updatedAt)).limit(50);

    for (const conv of allConversations) {
      try {
        const messages = await db
          .select()
          .from(chatMessagesTable)
          .where(eq(chatMessagesTable.conversationId, conv.id))
          .orderBy(asc(chatMessagesTable.createdAt));

        for (let i = 0; i < messages.length - 1; i++) {
          const msg = messages[i];
          const next = messages[i + 1];

          if (msg.role === "user" && next.role === "assistant") {
            if (minRating > 0 && (next.rating === null || next.rating < minRating)) {
              i++;
              continue;
            }

            const pairContent = JSON.stringify({
              instruction: msg.content,
              response: next.content,
              model: conv.model || "unknown",
              rating: next.rating,
            });

            items.push({
              source_type: "manual",
              source_id: `conv-${conv.id}-msg-${msg.id}`,
              title: `Chat: ${msg.content.slice(0, 80)}`,
              sender: conv.model || "ollama",
              content: pairContent,
              metadata: {
                conversationId: conv.id,
                conversationTitle: conv.title,
                model: conv.model,
                rating: next.rating,
                collectedBy: "auto-collector",
              },
            });

            i++;
          }
        }
      } catch (err: any) {
        errors.push(`Conversation ${conv.id}: ${err?.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`Conversations: ${err?.message}`);
  }

  if (items.length > 0) {
    const result = await saveToVps(items);
    return { count: result.inserted, errors };
  }
  return { count: 0, errors };
}

async function collectDiscovery(categories: string[]): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const items: any[] = [];

  try {
    const sources = await db
      .select()
      .from(discoveredSourcesTable)
      .where(eq(discoveredSourcesTable.status, "approved"))
      .orderBy(desc(discoveredSourcesTable.createdAt))
      .limit(30);

    for (const source of sources) {
      items.push({
        source_type: "web",
        source_id: `discovery-${source.id}`,
        title: source.title,
        sender: source.discoveredBy || "discovery-agent",
        content: JSON.stringify({
          url: source.url,
          description: source.description,
          reasoning: source.reasoning,
          category: source.category,
        }),
        metadata: {
          url: source.url,
          category: source.category,
          discoveredBy: source.discoveredBy,
          relevanceScore: source.relevanceScore,
          collectedBy: "auto-collector",
        },
      });
    }

    const pendingSources = await db
      .select()
      .from(discoveredSourcesTable)
      .where(eq(discoveredSourcesTable.status, "pending"))
      .orderBy(desc(discoveredSourcesTable.createdAt))
      .limit(20);

    for (const source of pendingSources) {
      items.push({
        source_type: "web",
        source_id: `discovery-pending-${source.id}`,
        title: `[Pending] ${source.title}`,
        sender: source.discoveredBy || "discovery-agent",
        content: JSON.stringify({
          url: source.url,
          description: source.description,
          reasoning: source.reasoning,
          category: source.category,
        }),
        metadata: {
          url: source.url,
          category: source.category,
          discoveredBy: source.discoveredBy,
          status: "pending",
          collectedBy: "auto-collector",
        },
      });
    }
  } catch (err: any) {
    errors.push(`Discovery sources: ${err?.message}`);
  }

  if (items.length > 0) {
    const result = await saveToVps(items);
    return { count: result.inserted, errors };
  }
  return { count: 0, errors };
}

async function collectKnowledgeBase(): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const items: any[] = [];

  try {
    const docs = await db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt)).limit(100);

    for (const doc of docs) {
      items.push({
        source_type: "manual",
        source_id: `kb-doc-${doc.id}`,
        title: doc.title,
        sender: "knowledge-base",
        content: doc.content || "",
        metadata: {
          category: doc.category,
          chunksCount: doc.chunksCount,
          docId: doc.id,
          collectedBy: "auto-collector",
        },
      });
    }
  } catch (err: any) {
    errors.push(`Knowledge base: ${err?.message}`);
  }

  if (items.length > 0) {
    const result = await saveToVps(items);
    return { count: result.inserted, errors };
  }
  return { count: 0, errors };
}

async function getOllamaUrl(): Promise<string | null> {
  try {
    const { llmConfigTable } = await import("@workspace/db/schema");
    const [config] = await db.select().from(llmConfigTable).limit(1);
    if (config?.serverUrl) return config.serverUrl;
  } catch {}
  return null;
}

async function processWithLLM(batchSize: number = 10): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  let client;
  try {
    client = await getVpsClient();
    if (!client) return { processed: 0, errors: ["VPS not configured"] };

    const ollamaUrl = await getOllamaUrl();
    if (!ollamaUrl) {
      await client.end();
      return { processed: 0, errors: ["Ollama not configured"] };
    }

    const result = await client.query(
      `SELECT id, source_type, title, content, content_preview FROM training_sources
       WHERE status = 'collected' AND content != '' AND length(content) > 50
       ORDER BY collected_at DESC LIMIT $1`,
      [batchSize]
    );

    for (const row of result.rows) {
      try {
        const contentSample = (row.content || "").slice(0, 3000);

        const prompt = `Analyze the following ${row.source_type} content and generate a training data entry for a domain-specific AI assistant.

Title: ${row.title}
Content: ${contentSample}

Generate a JSON object with:
1. "summary": A concise 2-3 sentence summary
2. "qa_pairs": An array of 2-3 question-answer pairs derived from the content
3. "category": Best category (research, business, code, medical, finance, security, general)
4. "quality_score": Rate 1-5 based on how useful this content is for AI training
5. "key_topics": Array of 3-5 key topics/keywords

Return ONLY valid JSON, no other text.`;

        const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3.2:latest",
            messages: [{ role: "user", content: prompt }],
            stream: false,
            options: { temperature: 0.3 },
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!ollamaRes.ok) continue;

        const ollamaData = await ollamaRes.json() as { message?: { content?: string } };
        const responseText = ollamaData.message?.content ?? "";

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        let analysis: any;
        try {
          analysis = JSON.parse(jsonMatch[0]);
        } catch {
          continue;
        }

        const qualityScore = Math.min(5, Math.max(1, parseInt(analysis.quality_score) || 3));

        const enrichedContent = JSON.stringify({
          original: row.content,
          summary: analysis.summary,
          qa_pairs: analysis.qa_pairs,
          key_topics: analysis.key_topics,
          category: analysis.category,
        });

        await client.query(
          `UPDATE training_sources SET
            status = 'reviewed',
            quality = $1,
            content = $2,
            metadata = metadata || $3::jsonb
          WHERE id = $4`,
          [
            qualityScore,
            enrichedContent.slice(0, 500000),
            JSON.stringify({
              llmProcessed: true,
              processedAt: new Date().toISOString(),
              summary: analysis.summary,
              category: analysis.category,
              key_topics: analysis.key_topics,
              qa_pairs: analysis.qa_pairs,
            }),
            row.id,
          ]
        );

        processed++;
      } catch (err: any) {
        errors.push(`Process item ${row.id}: ${err?.message}`);
      }
    }

    await client.end();
  } catch (err: any) {
    if (client) try { await client.end(); } catch {}
    errors.push(`LLM processing: ${err?.message}`);
  }

  return { processed, errors };
}

async function runCollection(): Promise<RunRecord> {
  const runId = `run-${Date.now()}`;
  const record: RunRecord = {
    id: runId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    results: { gmail: 0, drive: 0, conversations: 0, discovery: 0, knowledgeBase: 0, processed: 0, errors: [] },
  };

  runHistory.unshift(record);
  if (runHistory.length > 50) runHistory = runHistory.slice(0, 50);

  try {
    isRunning = true;

    if (collectorConfig.sources.gmail.enabled) {
      const r = await collectGmail(collectorConfig.sources.gmail.queries);
      record.results.gmail = r.count;
      record.results.errors.push(...r.errors);
    }

    if (collectorConfig.sources.drive.enabled) {
      const r = await collectDrive(collectorConfig.sources.drive.queries);
      record.results.drive = r.count;
      record.results.errors.push(...r.errors);
    }

    if (collectorConfig.sources.conversations.enabled) {
      const r = await collectConversations(collectorConfig.sources.conversations.minRating);
      record.results.conversations = r.count;
      record.results.errors.push(...r.errors);
    }

    if (collectorConfig.sources.discovery.enabled) {
      const r = await collectDiscovery(collectorConfig.sources.discovery.categories);
      record.results.discovery = r.count;
      record.results.errors.push(...r.errors);
    }

    if (collectorConfig.sources.knowledgeBase.enabled) {
      const r = await collectKnowledgeBase();
      record.results.knowledgeBase = r.count;
      record.results.errors.push(...r.errors);
    }

    if (collectorConfig.processing.autoProcess) {
      const r = await processWithLLM(10);
      record.results.processed = r.processed;
      record.results.errors.push(...r.errors);
    }

    record.status = "completed";
  } catch (err: any) {
    record.status = "failed";
    record.results.errors.push(`Collection run failed: ${err?.message}`);
  } finally {
    isRunning = false;
    record.completedAt = new Date().toISOString();
    lastRunAt = record.completedAt;
  }

  return record;
}

router.get("/auto-collector/status", async (_req, res): Promise<void> => {
  const totalCollected = runHistory.reduce((sum, r) =>
    sum + r.results.gmail + r.results.drive + r.results.conversations + r.results.discovery + r.results.knowledgeBase, 0);

  res.json({
    enabled: collectorConfig.enabled,
    isRunning,
    intervalMinutes: collectorConfig.intervalMinutes,
    lastRunAt,
    totalRuns: runHistory.length,
    totalCollected,
    config: collectorConfig,
  });
});

router.get("/auto-collector/history", async (_req, res): Promise<void> => {
  res.json(runHistory.slice(0, 20));
});

router.post("/auto-collector/config", async (req, res): Promise<void> => {
  const updates = req.body;

  if (updates.intervalMinutes !== undefined) {
    collectorConfig.intervalMinutes = Math.max(5, Math.min(1440, updates.intervalMinutes));
  }

  if (updates.sources) {
    if (updates.sources.gmail) Object.assign(collectorConfig.sources.gmail, updates.sources.gmail);
    if (updates.sources.drive) Object.assign(collectorConfig.sources.drive, updates.sources.drive);
    if (updates.sources.conversations) Object.assign(collectorConfig.sources.conversations, updates.sources.conversations);
    if (updates.sources.discovery) Object.assign(collectorConfig.sources.discovery, updates.sources.discovery);
    if (updates.sources.knowledgeBase) Object.assign(collectorConfig.sources.knowledgeBase, updates.sources.knowledgeBase);
  }

  if (updates.processing) {
    Object.assign(collectorConfig.processing, updates.processing);
  }

  res.json({ success: true, config: collectorConfig });
});

router.post("/auto-collector/start", async (_req, res): Promise<void> => {
  if (collectorConfig.enabled) {
    res.json({ success: true, message: "Already running" });
    return;
  }

  collectorConfig.enabled = true;

  if (collectorInterval) clearInterval(collectorInterval);
  collectorInterval = setInterval(() => {
    if (!isRunning) runCollection().catch(console.error);
  }, collectorConfig.intervalMinutes * 60 * 1000);

  if (!isRunning) {
    runCollection().catch(console.error);
  }

  res.json({ success: true, message: `Auto-collector started. Running every ${collectorConfig.intervalMinutes} minutes.` });
});

router.post("/auto-collector/stop", async (_req, res): Promise<void> => {
  collectorConfig.enabled = false;
  if (collectorInterval) {
    clearInterval(collectorInterval);
    collectorInterval = null;
  }

  res.json({ success: true, message: "Auto-collector stopped" });
});

router.post("/auto-collector/run-now", async (req, res): Promise<void> => {
  if (isRunning) {
    res.status(409).json({ error: "Collection is already running" });
    return;
  }

  const { source } = req.body || {};

  if (source) {
    const record: RunRecord = {
      id: `manual-${Date.now()}`,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "running",
      results: { gmail: 0, drive: 0, conversations: 0, discovery: 0, knowledgeBase: 0, processed: 0, errors: [] },
    };

    runHistory.unshift(record);
    isRunning = true;

    try {
      if (source === "gmail") {
        const r = await collectGmail(collectorConfig.sources.gmail.queries);
        record.results.gmail = r.count;
        record.results.errors.push(...r.errors);
      } else if (source === "drive") {
        const r = await collectDrive(collectorConfig.sources.drive.queries);
        record.results.drive = r.count;
        record.results.errors.push(...r.errors);
      } else if (source === "conversations") {
        const r = await collectConversations(collectorConfig.sources.conversations.minRating);
        record.results.conversations = r.count;
        record.results.errors.push(...r.errors);
      } else if (source === "discovery") {
        const r = await collectDiscovery(collectorConfig.sources.discovery.categories);
        record.results.discovery = r.count;
        record.results.errors.push(...r.errors);
      } else if (source === "knowledgeBase") {
        const r = await collectKnowledgeBase();
        record.results.knowledgeBase = r.count;
        record.results.errors.push(...r.errors);
      }

      record.status = "completed";
    } catch (err: any) {
      record.status = "failed";
      record.results.errors.push(err?.message);
    } finally {
      isRunning = false;
      record.completedAt = new Date().toISOString();
      lastRunAt = record.completedAt;
    }

    res.json(record);
    return;
  }

  const record = await runCollection();
  res.json(record);
});

router.post("/auto-collector/process", async (req, res): Promise<void> => {
  if (isRunning) {
    res.status(409).json({ error: "Collection is already running" });
    return;
  }

  const batchSize = Math.min(req.body?.batchSize || 10, 50);
  isRunning = true;

  try {
    const result = await processWithLLM(batchSize);
    isRunning = false;
    res.json({ success: true, ...result });
  } catch (err: any) {
    isRunning = false;
    res.status(500).json({ error: err?.message || "Processing failed" });
  }
});

export default router;
