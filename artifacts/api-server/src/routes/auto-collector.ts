import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vpsDatabaseConfigTable, trainingDataTable, chatMessagesTable, conversationsTable, documentsTable, discoveredSourcesTable, trainingDataJobsTable, trainingDatasetsTable } from "@workspace/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { getUncachableGmailClient, driveProxyJson, driveProxyText } from "./google-clients";
import { Agent } from "undici";

const ollamaAgent = new Agent({
  headersTimeout: 1200000,
  bodyTimeout: 1200000,
  connectTimeout: 30000,
});

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
let wasExplicitlyStopped = false;
const serverStartedAt = new Date().toISOString();

interface TrainingSchedulerConfig {
  enabled: boolean;
  intervalMinutes: number;
  domains: string[];
  samplesPerRun: number;
  model: string;
  autoDataset: boolean;
}

let trainingSchedulerConfig: TrainingSchedulerConfig = {
  enabled: true,
  intervalMinutes: 30,
  domains: ["otolaryngology", "social_media", "hedge_fund"],
  samplesPerRun: 3,
  model: "qwen2.5:7b",
  autoDataset: true,
};

const MODEL_ROTATION = ["qwen2.5:7b", "mistral:latest", "deepseek-r1:8b", "meditron:7b"];
let modelRotationIndex = 0;

function getNextModel(): string {
  const model = MODEL_ROTATION[modelRotationIndex % MODEL_ROTATION.length];
  modelRotationIndex++;
  return model;
}

const SUBTOPIC_ROTATION: Record<string, string[]> = {
  otolaryngology: [
    "otitis media diagnosis, treatment, tympanoplasty surgical techniques, complications management",
    "chronic sinusitis evaluation, endoscopic sinus surgery (FESS), polyp management, medical therapy protocols",
    "tonsillectomy and adenoidectomy indications, surgical techniques, post-operative care, sleep apnea in children",
    "sensorineural hearing loss workup, cochlear implant candidacy, hearing aid fitting, presbycusis management",
    "BPPV diagnosis (Dix-Hallpike), Epley maneuver, vestibular neuritis, Meniere disease treatment",
    "vocal cord paralysis, laryngeal cancer staging, microlaryngoscopy, voice therapy techniques",
    "pediatric airway management, stridor evaluation, subglottic stenosis, foreign body aspiration",
    "head and neck cancer (SCC) staging, neck dissection types, radiation therapy protocols, reconstruction",
    "allergic rhinitis pharmacotherapy, immunotherapy protocols, turbinate reduction, septoplasty indications",
    "salivary gland disorders, parotidectomy, sialolithiasis, submandibular gland excision",
    "thyroid nodule evaluation, FNA biopsy, thyroidectomy, parathyroid surgery",
    "facial plastic surgery, rhinoplasty techniques, otoplasty, facial nerve repair",
    "skull base surgery, acoustic neuroma management, CSF leak repair, pituitary approaches",
    "tracheostomy care, decannulation protocols, laryngotracheal reconstruction",
    "epistaxis management, nasal fracture reduction, septal hematoma drainage",
    "AI-assisted laryngoscopy: CNN-based lesion detection, benign vs malignant classification (92% accuracy), NBI frame classification, real-time diagnostic support",
    "AI in otoscopy: deep learning for tympanic membrane analysis, AOM vs OME classification (97.6% accuracy), AI vs clinician performance (93.4% vs 73.2%)",
    "LLMs in ENT clinical workflows: structured data extraction from operative notes, automated phenotyping, clinical decision support, patient education content generation",
    "AI-driven voice pathology detection: CNN analysis of voice recordings, laryngeal cancer screening via voice biomarkers, dysphonia classification models",
    "multimodal AI in head and neck oncology: combining imaging (CT/MRI/PET), histopathology, genomics, and clinical data for treatment planning and prognosis",
    "AI for sleep apnea: polysomnography analysis automation, OSA prediction from craniofacial imaging, CPAP compliance monitoring, surgical outcome prediction",
    "deep learning for sinus CT interpretation: automated Lund-Mackay scoring, polyp detection, surgical navigation AI, post-operative outcome prediction",
    "Bridge2AI voice database applications: diverse population voice biomarkers, laryngology AI training datasets, health-voice correlation models",
  ],
  social_media: [
    "Instagram Reels strategy for medical practices, content calendars, hashtag research for healthcare",
    "TikTok medical education content, short-form video best practices, trending audio strategies",
    "LinkedIn thought leadership for physicians, professional networking, article writing",
    "YouTube medical channel growth, SEO optimization, thumbnail design, subscriber retention",
    "patient testimonial content guidelines, HIPAA compliance in social media, consent forms",
    "paid advertising for medical practices, Facebook Ads targeting, Google Ads for healthcare",
    "influencer marketing in healthcare, KOL partnerships, brand ambassador programs",
    "crisis management on social media, handling negative reviews, reputation management",
    "email marketing funnels for medical practices, newsletter content, patient engagement",
    "analytics dashboards, engagement metrics, ROI tracking, A/B testing social content",
    "community building strategies, Facebook Groups, Discord for patient support",
  ],
  hedge_fund: [
    "fundamental equity analysis (DCF, comparable analysis), earnings quality, balance sheet deep-dive",
    "options strategies (iron condor, butterfly spread, straddle), Greeks management, volatility trading",
    "quantitative trading strategies, factor investing, statistical arbitrage, momentum signals",
    "healthcare/biotech sector analysis, FDA approval catalysts, clinical trial investing, patent cliffs",
    "macro economic analysis, interest rate impact, inflation hedging, currency risk management",
    "risk management frameworks, VaR calculation, portfolio stress testing, drawdown analysis",
    "alternative data sources for alpha generation, satellite imagery, web scraping, sentiment analysis",
    "fixed income analysis, yield curve strategies, credit spreads, duration management",
    "ESG investing criteria, impact measurement, sustainable finance frameworks",
    "merger arbitrage, event-driven strategies, special situations, activist investing",
    "cryptocurrency and digital assets analysis, DeFi yield strategies, on-chain analytics",
    "commodities trading, energy sector analysis, agricultural futures, precious metals",
    "real estate investment analysis, REITs, cap rates, property market cycles",
  ],
};

let subtopicIndices: Record<string, number> = {
  otolaryngology: 0,
  social_media: 0,
  hedge_fund: 0,
};

function getNextSubtopic(domain: string): string {
  const topics = SUBTOPIC_ROTATION[domain] || SUBTOPIC_ROTATION.otolaryngology;
  const idx = (subtopicIndices[domain] || 0) % topics.length;
  subtopicIndices[domain] = idx + 1;
  return topics[idx];
}

let domainRotationCounter = 0;
let trainingSchedulerInterval: ReturnType<typeof setInterval> | null = null;
let isTrainingRunning = false;
let trainingRunHistory: Array<{
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  results: Record<string, { samples: number; jobId: number | null; error?: string }>;
}> = [];
let lastTrainingRunAt: string | null = null;

async function cleanupOrphanedJobs() {
  try {
    const orphaned = await db.select().from(trainingDataJobsTable)
      .where(eq(trainingDataJobsTable.status, "running"));
    if (orphaned.length > 0) {
      for (const job of orphaned) {
        await db.update(trainingDataJobsTable).set({
          status: "failed",
          errorLog: "Orphaned: server restarted before job completed",
          completedAt: new Date(),
        }).where(eq(trainingDataJobsTable.id, job.id));
      }
      console.log(`[training-scheduler] Cleaned up ${orphaned.length} orphaned jobs from previous run`);
    }
  } catch (e: any) {
    console.error(`[training-scheduler] Cleanup error:`, e.message);
  }
}

function startTrainingScheduler() {
  if (trainingSchedulerInterval) clearInterval(trainingSchedulerInterval);
  trainingSchedulerInterval = setInterval(() => {
    if (!isTrainingRunning) runTrainingGeneration().catch(console.error);
  }, trainingSchedulerConfig.intervalMinutes * 60 * 1000);
  console.log(`[training-scheduler] Started. Generating training data every ${trainingSchedulerConfig.intervalMinutes} minutes for domains: ${trainingSchedulerConfig.domains.join(", ")}`);
}

function autoStartCollector() {
  setTimeout(() => {
    if (!collectorConfig.enabled && !wasExplicitlyStopped) {
      collectorConfig.enabled = true;
      if (collectorInterval) clearInterval(collectorInterval);
      collectorInterval = setInterval(() => {
        if (!isRunning) runCollection().catch(console.error);
      }, collectorConfig.intervalMinutes * 60 * 1000);
      console.log(`[auto-collector] Auto-started. Running every ${collectorConfig.intervalMinutes} minutes.`);
      runCollection().catch(console.error);
    }
    cleanupOrphanedJobs().then(() => {
      if (trainingSchedulerConfig.enabled) {
        startTrainingScheduler();
        runTrainingGeneration().catch(console.error);
      }
    });
  }, 15000);
}

autoStartCollector();

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
  wasExplicitlyStopped = true;
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

export function getCollectorState() {
  const totalCollected = runHistory.reduce((sum, r) =>
    sum + r.results.gmail + r.results.drive + r.results.conversations + r.results.discovery + r.results.knowledgeBase, 0);
  return {
    enabled: collectorConfig.enabled,
    isRunning,
    intervalMinutes: collectorConfig.intervalMinutes,
    lastRunAt,
    totalRuns: runHistory.length,
    totalCollected,
    serverStartedAt,
    recentRuns: runHistory.slice(0, 5),
    sources: {
      gmail: collectorConfig.sources.gmail.enabled,
      drive: collectorConfig.sources.drive.enabled,
      conversations: collectorConfig.sources.conversations.enabled,
      discovery: collectorConfig.sources.discovery.enabled,
      knowledgeBase: collectorConfig.sources.knowledgeBase.enabled,
    },
  };
}

const DOMAIN_SYSTEM_PROMPTS: Record<string, string> = {
  otolaryngology: `You are a board-certified otolaryngologist, medical education specialist, and AI-in-medicine researcher. Generate precise, evidence-based training data for ENT clinical AI.

Key Research Framework (per Bao et al., JAMA Otolaryngology 2026 — "Large Language Models and Otolaryngology: A Review"):
- LLM applications in ENT: (1) Data Structuring — converting unstructured clinical notes to structured variables, (2) Precision Medicine — automated phenotyping and subphenotyping, (3) Administrative Efficiency — streamlining documentation, (4) Decision Support — domain-specific clinical tools, (5) Multimodal Integration — combining text with imaging/video/electrophysiology.
- Otolaryngology is uniquely suited for AI due to its reliance on multimodal data (text, imaging, electrophysiology, video) and symptom-driven complexity.
- Current gap: 99.3% of deep learning studies in OHNS are proof-of-concept with zero clinical validation (Liu et al., Nature Digital Medicine 2025). Focus training on clinically actionable content.

Key Benchmarks (Novi et al., JAMA Otolaryngology 2026 — "Deep Learning in Otolaryngology" review of 327 studies):
- AI diagnostic accuracy for ear disease from otoscopy: 90.7% (normal vs abnormal), up to 97.6% for 3-class classification.
- AI outperforms clinicians: 93.4% vs 73.2% in otoscopy diagnosis.
- AI-assisted laryngeal endoscopy: 92% accuracy, 91% sensitivity for benign vs malignant classification.

Use current medical terminology, cite guidelines (AAO-HNS, ACR, NCCN) where relevant, include differential diagnoses, and reference AI diagnostic capabilities where applicable.`,
  social_media: "You are a healthcare marketing strategist with expertise in digital media. Generate actionable, data-driven training data for social media AI. Include specific metrics, platform algorithms, and real-world strategy patterns.",
  hedge_fund: "You are a senior quantitative analyst at a multi-strategy hedge fund. Generate rigorous, quantitative training data for financial AI. Use real financial frameworks, formulas, and analytical methods.",
};

function buildTrainingPrompt(domain: string, count: number): string {
  const subtopic = getNextSubtopic(domain);
  return `Generate exactly ${count} training data samples as a JSON array. Each sample must follow this exact format:
[{"instruction":"<specific question or task>","input":"<optional context or patient data>","output":"<detailed expert response>"}]

FOCUS AREA: ${subtopic}

Requirements:
- Each "output" must be 150-400 words with specific, actionable detail
- Each "instruction" must be a unique, specific question (not generic)
- Include clinical/technical specifics: numbers, dosages, percentages, timelines where applicable
- Vary question types: diagnostic, treatment, procedural, educational, case-based
- Return ONLY the JSON array, no other text or markdown`;
}

async function generateDomainTrainingData(domain: string, model: string, count: number): Promise<{ samples: number; jobId: number | null; error?: string }> {
  try {
    const vpsIp = process.env.VPS_IP || "72.60.167.64";
    const serverUrl = process.env.OLLAMA_BASE_URL || process.env.VPS_OLLAMA_URL || `http://${vpsIp}:11434`;
    const prompt = buildTrainingPrompt(domain, count);
    const systemPrompt = DOMAIN_SYSTEM_PROMPTS[domain] || DOMAIN_SYSTEM_PROMPTS.otolaryngology;

    const [job] = await db.insert(trainingDataJobsTable).values({
      domain,
      jobType: "generate",
      status: "running",
      model,
      startedAt: new Date(),
    }).returning();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200000);
    let response = "";
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    try {
      const resp = await fetch(`${serverUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: fullPrompt,
          stream: true,
          options: { temperature: 0.8, num_predict: 2048 },
        }),
        signal: controller.signal,
        // @ts-ignore - undici dispatcher to override headersTimeout
        dispatcher: ollamaAgent,
      });
      if (!resp.ok) throw new Error(`Ollama returned ${resp.status}`);
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let carry = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = carry + decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        carry = lines.pop() || "";
        for (const line of lines.filter(l => l.trim())) {
          try {
            const obj = JSON.parse(line);
            if (obj.response) response += obj.response;
          } catch {}
        }
      }
      if (carry.trim()) {
        try { const obj = JSON.parse(carry); if (obj.response) response += obj.response; } catch {}
      }
    } finally {
      clearTimeout(timeoutId);
    }

    let samples: any[] = [];
    try {
      const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const m = cleaned.match(/\[[\s\S]*\]/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed)) {
          samples = parsed.filter((s: any) => {
            if (!s.instruction) return false;
            const output = typeof s.output === "string" ? s.output : JSON.stringify(s.output);
            if (output.length < 30) return false;
            s.output = output;
            return true;
          });
        }
      }
    } catch (parseErr: any) {
      console.log(`[training-scheduler] JSON parse issue for ${domain}: ${parseErr.message?.substring(0, 100)}`);
      const objMatches = response.matchAll(/"instruction"\s*:\s*"([^"]+)"[\s\S]*?"output"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/g);
      for (const match of objMatches) {
        if (match[1] && match[2] && match[2].length > 30) {
          samples.push({ instruction: match[1], input: "", output: match[2] });
        }
      }
      if (samples.length === 0 && response.length > 200) {
        samples = [{ instruction: "training sample", input: "", output: response.substring(0, 2000) }];
      }
    }
    console.log(`[training-scheduler] ${domain}: parsed ${samples.length} samples from ${response.length} chars`);

    for (const sample of samples) {
      await db.insert(trainingDataTable).values({
        inputText: sample.instruction + (sample.input ? `\n\nContext: ${sample.input}` : ""),
        outputText: sample.output,
        systemPrompt: systemPrompt,
        category: domain,
        quality: 4,
        source: `auto-${model}`,
      });
    }

    await db.update(trainingDataJobsTable).set({
      status: "completed",
      recordsCollected: samples.length,
      recordsProcessed: samples.length,
      outputPath: `/training-data/${domain}/${job.id}.jsonl`,
      aiSummary: `[Auto] Generated ${samples.length} training samples for ${domain} using ${model}`,
      completedAt: new Date(),
    }).where(eq(trainingDataJobsTable.id, job.id));

    if (samples.length > 0) {
      const existingDatasets = await db.select().from(trainingDatasetsTable)
        .where(eq(trainingDatasetsTable.domain, domain));

      if (existingDatasets.length > 0) {
        const ds = existingDatasets[0];
        const currentSamples = ds.totalSamples || 0;
        await db.update(trainingDatasetsTable).set({
          totalSamples: currentSamples + samples.length,
          status: "building",
          sampleData: JSON.stringify(samples.slice(0, 3)),
        }).where(eq(trainingDatasetsTable.id, ds.id));
      } else {
        await db.insert(trainingDatasetsTable).values({
          name: `${domain} Training Dataset`,
          domain,
          format: "jsonl",
          totalSamples: samples.length,
          status: "building",
          sampleData: JSON.stringify(samples.slice(0, 3)),
        });
      }
    }

    return { samples: samples.length, jobId: job.id };
  } catch (e: any) {
    const errMsg = e.name === "AbortError" ? "Timeout after 20 minutes" : `${e.message} | ${e.cause ? JSON.stringify(e.cause) : 'no cause'}`;
    console.error(`[training-scheduler] Error generating ${domain}:`, errMsg);
    try {
      const runningJobs = await db.select().from(trainingDataJobsTable)
        .where(eq(trainingDataJobsTable.status, "running"));
      for (const j of runningJobs.filter(j => j.domain === domain)) {
        await db.update(trainingDataJobsTable).set({
          status: "failed", errorLog: errMsg, completedAt: new Date(),
        }).where(eq(trainingDataJobsTable.id, j.id));
      }
    } catch {}
    return { samples: 0, jobId: null, error: errMsg };
  }
}

async function runTrainingGeneration() {
  if (isTrainingRunning) return;
  isTrainingRunning = true;

  const runId = `train-${Date.now()}`;
  const record = {
    id: runId,
    startedAt: new Date().toISOString(),
    completedAt: null as string | null,
    status: "running",
    results: {} as Record<string, { samples: number; jobId: number | null; error?: string }>,
  };

  trainingRunHistory.unshift(record);
  if (trainingRunHistory.length > 50) trainingRunHistory = trainingRunHistory.slice(0, 50);

  console.log(`[training-scheduler] Starting training data generation for domains: ${trainingSchedulerConfig.domains.join(", ")}`);

  try {
    const vpsIp = process.env.VPS_IP || "72.60.167.64";
    const serverUrl = process.env.OLLAMA_BASE_URL || process.env.VPS_OLLAMA_URL || `http://${vpsIp}:11434`;
    const cycleModel = getNextModel();

    try {
      const warmResp = await fetch(`${serverUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cycleModel, prompt: "Ready", stream: true }),
        signal: AbortSignal.timeout(180000),
        // @ts-ignore
        dispatcher: ollamaAgent,
      });
      const warmReader = warmResp.body?.getReader();
      if (warmReader) { while (!(await warmReader.read()).done) {} }
      console.log(`[training-scheduler] Model ${cycleModel} warmed up`);
    } catch (e: any) {
      console.log(`[training-scheduler] Warmup ${cycleModel}: ${e.message}`);
    }
    console.log(`[training-scheduler] Cycle model: ${cycleModel}`);

    const allDomains = trainingSchedulerConfig.domains;
    const domainsPerCycle = 2;
    const cycleDomains: string[] = [];
    for (let i = 0; i < domainsPerCycle && i < allDomains.length; i++) {
      cycleDomains.push(allDomains[(domainRotationCounter + i) % allDomains.length]);
    }
    domainRotationCounter += domainsPerCycle;
    console.log(`[training-scheduler] Domains this cycle: ${cycleDomains.join(", ")} (rotating ${domainsPerCycle} of ${allDomains.length})`);
    for (const domain of cycleDomains) {
      let result = await generateDomainTrainingData(
        domain, cycleModel, trainingSchedulerConfig.samplesPerRun
      );
      if (result.error) {
        console.log(`[training-scheduler] ${domain}: retrying after 10s...`);
        await new Promise(r => setTimeout(r, 10000));
        result = await generateDomainTrainingData(
          domain, cycleModel, trainingSchedulerConfig.samplesPerRun
        );
      }
      record.results[domain] = result;
      console.log(`[training-scheduler] ${domain}: generated ${result.samples} samples${result.error ? ` (error: ${result.error})` : ""}`);
      if (cycleDomains.indexOf(domain) < cycleDomains.length - 1) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    record.status = "completed";
  } catch (e: any) {
    record.status = "failed";
    console.error(`[training-scheduler] Run failed:`, e.message);
  } finally {
    isTrainingRunning = false;
    record.completedAt = new Date().toISOString();
    lastTrainingRunAt = record.completedAt;
  }
}

router.get("/auto-collector/training-status", async (_req, res): Promise<void> => {
  const jobs = await db.select().from(trainingDataJobsTable).orderBy(desc(trainingDataJobsTable.createdAt)).limit(20);
  const datasets = await db.select().from(trainingDatasetsTable);

  const totalSamplesGenerated = jobs
    .filter(j => j.status === "completed")
    .reduce((sum, j) => sum + (j.recordsCollected || 0), 0);

  const storedSamplesResult = await db.select({ count: sql<number>`count(*)` }).from(trainingDataTable);
  const totalStoredSamples = Number(storedSamplesResult[0]?.count || 0);

  const domainSampleCounts: Record<string, number> = {};
  for (const domain of trainingSchedulerConfig.domains) {
    const ct = await db.select({ count: sql<number>`count(*)` }).from(trainingDataTable)
      .where(eq(trainingDataTable.category, domain));
    domainSampleCounts[domain] = Number(ct[0]?.count || 0);
  }

  const domainStats: Record<string, { jobs: number; samples: number; datasetSize: number; storedSamples: number }> = {};
  for (const domain of trainingSchedulerConfig.domains) {
    const domainJobs = jobs.filter(j => j.domain === domain);
    const domainDataset = datasets.find(d => d.domain === domain);
    domainStats[domain] = {
      jobs: domainJobs.length,
      samples: domainJobs.filter(j => j.status === "completed").reduce((s, j) => s + (j.recordsCollected || 0), 0),
      datasetSize: domainDataset?.totalSamples || 0,
      storedSamples: domainSampleCounts[domain] || 0,
    };
  }

  res.json({
    scheduler: {
      enabled: trainingSchedulerConfig.enabled,
      isRunning: isTrainingRunning,
      intervalMinutes: trainingSchedulerConfig.intervalMinutes,
      lastRunAt: lastTrainingRunAt,
      totalRuns: trainingRunHistory.length,
      model: trainingSchedulerConfig.model,
      samplesPerRun: trainingSchedulerConfig.samplesPerRun,
      domains: trainingSchedulerConfig.domains,
    },
    stats: {
      totalJobs: jobs.length,
      completedJobs: jobs.filter(j => j.status === "completed").length,
      failedJobs: jobs.filter(j => j.status === "failed").length,
      totalSamplesGenerated,
      totalStoredSamples,
      totalDatasets: datasets.length,
    },
    domainStats,
    recentJobs: jobs.slice(0, 10),
    recentRuns: trainingRunHistory.slice(0, 10),
    datasets,
  });
});

router.post("/auto-collector/training-config", async (req, res): Promise<void> => {
  const { enabled, intervalMinutes, domains, samplesPerRun, model } = req.body;

  if (enabled !== undefined) trainingSchedulerConfig.enabled = enabled;
  if (intervalMinutes !== undefined) trainingSchedulerConfig.intervalMinutes = Math.max(15, Math.min(1440, intervalMinutes));
  if (domains !== undefined) trainingSchedulerConfig.domains = domains;
  if (samplesPerRun !== undefined) trainingSchedulerConfig.samplesPerRun = Math.max(1, Math.min(50, samplesPerRun));
  if (model !== undefined) trainingSchedulerConfig.model = model;

  if (trainingSchedulerConfig.enabled) {
    startTrainingScheduler();
  } else if (trainingSchedulerInterval) {
    clearInterval(trainingSchedulerInterval);
    trainingSchedulerInterval = null;
    console.log("[training-scheduler] Stopped.");
  }

  res.json({ config: trainingSchedulerConfig });
});

router.post("/auto-collector/training-run", async (_req, res): Promise<void> => {
  if (isTrainingRunning) {
    res.status(409).json({ error: "Training generation already running" });
    return;
  }
  runTrainingGeneration().catch(console.error);
  res.json({ message: "Training generation started", domains: trainingSchedulerConfig.domains });
});

router.get("/auto-collector/training-samples", async (req, res): Promise<void> => {
  const domain = req.query.domain as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;

  let query = db.select().from(trainingDataTable).orderBy(desc(trainingDataTable.createdAt)).limit(limit).offset(offset);
  if (domain) {
    const samples = await db.select().from(trainingDataTable)
      .where(eq(trainingDataTable.category, domain))
      .orderBy(desc(trainingDataTable.createdAt)).limit(limit).offset(offset);
    const total = await db.select({ count: sql<number>`count(*)` }).from(trainingDataTable)
      .where(eq(trainingDataTable.category, domain));
    res.json({ samples, total: Number(total[0]?.count || 0), limit, offset });
    return;
  }
  const samples = await query;
  const total = await db.select({ count: sql<number>`count(*)` }).from(trainingDataTable);
  res.json({ samples, total: Number(total[0]?.count || 0), limit, offset });
});

router.post("/auto-collector/drive-import", async (req, res): Promise<void> => {
  const { folderQuery, maxFiles } = req.body;
  const searchQuery = folderQuery || "ENT OR otolaryngology OR otology OR rhinology OR laryngology OR audiology OR 'head and neck'";
  const fileLimit = Math.min(maxFiles || 20, 50);

  try {
    const driveFiles = await driveProxyJson(
      `/drive/v3/files?q=name contains '${searchQuery.split(" OR ")[0].replace(/'/g, "")}' and (mimeType='application/pdf' or mimeType='application/vnd.google-apps.document' or mimeType='text/plain')&pageSize=${fileLimit}&fields=files(id,name,mimeType,size,modifiedTime)`
    );

    if (!driveFiles.files || driveFiles.files.length === 0) {
      const broadSearch = await driveProxyJson(
        `/drive/v3/files?q=fullText contains 'ENT' or fullText contains 'otolaryngology' or fullText contains 'medical'&pageSize=${fileLimit}&fields=files(id,name,mimeType,size,modifiedTime)`
      );
      driveFiles.files = broadSearch.files || [];
    }

    const results: { file: string; samplesGenerated: number; error?: string }[] = [];

    for (const file of (driveFiles.files || []).slice(0, fileLimit)) {
      try {
        let content = "";
        if (file.mimeType === "application/vnd.google-apps.document") {
          content = await driveProxyText(`/drive/v3/files/${file.id}/export?mimeType=text/plain`);
        } else {
          content = await driveProxyText(`/drive/v3/files/${file.id}?alt=media`);
        }

        if (!content || content.length < 100) {
          results.push({ file: file.name, samplesGenerated: 0, error: "Content too short or empty" });
          continue;
        }

        const chunks = [];
        const chunkSize = 2000;
        for (let i = 0; i < content.length && chunks.length < 5; i += chunkSize) {
          const chunk = content.slice(i, i + chunkSize).trim();
          if (chunk.length > 200) chunks.push(chunk);
        }

        let totalSamples = 0;
        for (const chunk of chunks) {
          const vpsIp = process.env.VPS_IP || "72.60.167.64";
          const serverUrl = process.env.OLLAMA_BASE_URL || process.env.VPS_OLLAMA_URL || `http://${vpsIp}:11434`;

          const resp = await fetch(`${serverUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "qwen2.5:7b",
              messages: [
                { role: "system", content: DOMAIN_SYSTEM_PROMPTS.otolaryngology },
                { role: "user", content: `Based on this medical text excerpt, generate 3 training Q&A pairs as a JSON array of [{"instruction":"...","input":"...","output":"..."}].

Text excerpt:
${chunk.substring(0, 1500)}

Generate clinically precise Q&A pairs that capture the key medical knowledge from this text. Return ONLY the JSON array.` },
              ],
              stream: true,
              options: { temperature: 0.7, num_predict: 2048 },
            }),
            signal: AbortSignal.timeout(600000),
            // @ts-ignore
            dispatcher: ollamaAgent,
          });

          if (!resp.ok) continue;
          let genResponse = "";
          const reader = resp.body?.getReader();
          if (!reader) continue;
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkText = decoder.decode(value, { stream: true });
            for (const line of chunkText.split("\n").filter(l => l.trim())) {
              try {
                const obj = JSON.parse(line);
                if (obj.message?.content) genResponse += obj.message.content;
              } catch {}
            }
          }

          try {
            const cleaned = genResponse.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            const m = cleaned.match(/\[[\s\S]*\]/);
            if (m) {
              const samples = JSON.parse(m[0]).filter((s: any) => s.instruction && s.output && s.output.length > 50);
              for (const sample of samples) {
                await db.insert(trainingDataTable).values({
                  inputText: sample.instruction + (sample.input ? `\n\nContext: ${sample.input}` : ""),
                  outputText: sample.output,
                  systemPrompt: DOMAIN_SYSTEM_PROMPTS.otolaryngology,
                  category: "otolaryngology",
                  quality: 5,
                  source: `drive-import:${file.name}`,
                });
              }
              totalSamples += samples.length;
            }
          } catch {}

          await new Promise(r => setTimeout(r, 3000));
        }

        if (totalSamples > 0) {
          const existing = await db.select().from(trainingDatasetsTable)
            .where(eq(trainingDatasetsTable.domain, "otolaryngology"));
          if (existing.length > 0) {
            await db.update(trainingDatasetsTable).set({
              totalSamples: (existing[0].totalSamples || 0) + totalSamples,
            }).where(eq(trainingDatasetsTable.id, existing[0].id));
          }
        }

        results.push({ file: file.name, samplesGenerated: totalSamples });
        console.log(`[drive-import] ${file.name}: generated ${totalSamples} training samples`);
      } catch (e: any) {
        results.push({ file: file.name, samplesGenerated: 0, error: e.message });
      }
    }

    res.json({
      message: "Drive import completed",
      filesScanned: driveFiles.files?.length || 0,
      results,
      totalSamplesGenerated: results.reduce((s, r) => s + r.samplesGenerated, 0),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/auto-collector/vps-models", async (_req, res): Promise<void> => {
  try {
    const vpsIp = process.env.VPS_IP || "72.60.167.64";
    const serverUrl = process.env.OLLAMA_BASE_URL || process.env.VPS_OLLAMA_URL || `http://${vpsIp}:11434`;
    const resp = await fetch(`${serverUrl}/api/tags`);
    const data = await resp.json() as any;
    res.json({ models: data.models || [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/auto-collector/vps-pull-model", async (req, res): Promise<void> => {
  const { modelName } = req.body;
  if (!modelName) { res.status(400).json({ error: "modelName required" }); return; }
  try {
    const vpsIp = process.env.VPS_IP || "72.60.167.64";
    const serverUrl = process.env.OLLAMA_BASE_URL || process.env.VPS_OLLAMA_URL || `http://${vpsIp}:11434`;
    const resp = await fetch(`${serverUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName, stream: true }),
      signal: AbortSignal.timeout(1800000),
      // @ts-ignore
      dispatcher: ollamaAgent,
    });
    if (!resp.ok) throw new Error(`Ollama returned ${resp.status}`);
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let lastStatus = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n").filter(l => l.trim())) {
        try { const obj = JSON.parse(line); if (obj.status) lastStatus = obj.status; } catch {}
      }
    }
    res.json({ message: `Model ${modelName} pull completed`, status: lastStatus });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
