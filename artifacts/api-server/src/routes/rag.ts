import { Router, type IRouter } from "express";
import { eq, asc, desc, sql, ilike } from "drizzle-orm";
import { db, documentsTable, documentChunksTable, discoveredSourcesTable, llmConfigTable } from "@workspace/db";
import {
  ListDocumentsResponse,
  CreateDocumentBody,
  DeleteDocumentParams,
  SearchDocumentsBody,
  SearchDocumentsResponse,
  GetRagStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + " " + sentence).trim().length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const words = currentChunk.split(/\s+/);
      currentChunk = words.slice(-CHUNK_OVERLAP).join(" ") + " " + sentence;
    } else {
      currentChunk = (currentChunk + " " + sentence).trim();
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

router.get("/rag/documents", async (_req, res): Promise<void> => {
  const docs = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      category: documentsTable.category,
      chunksCount: documentsTable.chunksCount,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
    })
    .from(documentsTable)
    .orderBy(asc(documentsTable.createdAt));
  res.json(ListDocumentsResponse.parse(docs));
});

router.post("/rag/documents", async (req, res): Promise<void> => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const chunks = chunkText(parsed.data.content);

  const [doc] = await db
    .insert(documentsTable)
    .values({
      title: parsed.data.title,
      content: parsed.data.content,
      category: parsed.data.category ?? "general",
      chunksCount: chunks.length,
    })
    .returning();

  if (chunks.length > 0) {
    await db.insert(documentChunksTable).values(
      chunks.map((content, index) => ({
        documentId: doc.id,
        content,
        chunkIndex: index,
      }))
    );
  }

  res.status(201).json({
    id: doc.id,
    title: doc.title,
    category: doc.category,
    chunksCount: doc.chunksCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
});

router.delete("/rag/documents/:id", async (req, res): Promise<void> => {
  const params = DeleteDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(documentsTable)
    .where(eq(documentsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/rag/search", async (req, res): Promise<void> => {
  const parsed = SearchDocumentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const maxResults = parsed.data.maxResults ?? 5;
  const queryWords = parsed.data.query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (queryWords.length === 0) {
    res.json([]);
    return;
  }

  let allChunks;
  if (parsed.data.category) {
    allChunks = await db
      .select({
        chunkId: documentChunksTable.id,
        documentId: documentChunksTable.documentId,
        content: documentChunksTable.content,
        documentTitle: documentsTable.title,
      })
      .from(documentChunksTable)
      .innerJoin(documentsTable, eq(documentChunksTable.documentId, documentsTable.id))
      .where(eq(documentsTable.category, parsed.data.category));
  } else {
    allChunks = await db
      .select({
        chunkId: documentChunksTable.id,
        documentId: documentChunksTable.documentId,
        content: documentChunksTable.content,
        documentTitle: documentsTable.title,
      })
      .from(documentChunksTable)
      .innerJoin(documentsTable, eq(documentChunksTable.documentId, documentsTable.id));
  }

  const scored = allChunks.map((chunk) => {
    const lowerContent = chunk.content.toLowerCase();
    let matchCount = 0;
    let totalWeight = 0;

    for (const word of queryWords) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = lowerContent.match(regex);
      if (matches) {
        matchCount += matches.length;
        totalWeight += matches.length * word.length;
      }
    }

    const relevance = queryWords.length > 0 ? totalWeight / (queryWords.length * 10) : 0;

    return {
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      content: chunk.content,
      relevance: Math.min(relevance, 1),
      matchCount,
    };
  });

  const results = scored
    .filter((s) => s.matchCount > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxResults)
    .map(({ matchCount, ...rest }) => rest);

  res.json(SearchDocumentsResponse.parse(results));
});

router.get("/rag/stats", async (_req, res): Promise<void> => {
  const docs = await db.select().from(documentsTable);
  const chunks = await db.select({ id: documentChunksTable.id }).from(documentChunksTable);

  const byCategory: Record<string, number> = {};
  for (const d of docs) {
    byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
  }

  res.json(
    GetRagStatsResponse.parse({
      totalDocuments: docs.length,
      totalChunks: chunks.length,
      byCategory,
    })
  );
});

router.post("/rag/fetch-url", async (req, res): Promise<void> => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      res.status(400).json({ error: "Only http and https URLs are allowed" });
      return;
    }

    const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "169.254.169.254", "metadata.google.internal"];
    if (blockedHosts.includes(parsed.hostname) || parsed.hostname.startsWith("10.") || parsed.hostname.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)) {
      res.status(400).json({ error: "URLs pointing to internal/private networks are not allowed" });
      return;
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "LLM-Hub-KnowledgeBase/1.0",
        Accept: "text/html,text/plain,application/json,*/*",
      },
    });

    if (!response.ok) {
      res.status(400).json({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` });
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    let cleanedText = rawText;

    if (contentType.includes("text/html")) {
      cleanedText = rawText
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (cleanedText.length < 50) {
      res.status(400).json({ error: "Page content too short or could not extract meaningful text" });
      return;
    }

    if (cleanedText.length > 500000) {
      cleanedText = cleanedText.slice(0, 500000);
    }

    const titleMatch = rawText.match(/<title[^>]*>(.*?)<\/title>/i);
    const suggestedTitle = titleMatch?.[1]?.trim() || new URL(url).hostname;

    res.json({
      title: suggestedTitle,
      content: cleanedText,
      contentLength: cleanedText.length,
      sourceUrl: url,
    });
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      res.status(408).json({ error: "Request timed out" });
    } else {
      res.status(500).json({ error: `Failed to fetch: ${err?.message ?? "Unknown error"}` });
    }
  }
});

router.post("/rag/bulk-import", async (req, res): Promise<void> => {
  const { documents } = req.body as {
    documents?: Array<{ title: string; content: string; category?: string }>;
  };

  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    res.status(400).json({ error: "documents array is required and must not be empty" });
    return;
  }

  if (documents.length > 50) {
    res.status(400).json({ error: "Maximum 50 documents per bulk import" });
    return;
  }

  const results: Array<{
    title: string;
    id: number;
    chunksCount: number;
    status: "success" | "error";
    error?: string;
  }> = [];

  for (const docInput of documents) {
    if (!docInput.title?.trim() || !docInput.content?.trim()) {
      results.push({ title: docInput.title || "Untitled", id: 0, chunksCount: 0, status: "error", error: "Missing title or content" });
      continue;
    }

    try {
      const chunks = chunkText(docInput.content);
      const [doc] = await db
        .insert(documentsTable)
        .values({
          title: docInput.title.trim(),
          content: docInput.content,
          category: docInput.category?.trim() || "general",
          chunksCount: chunks.length,
        })
        .returning();

      if (chunks.length > 0) {
        await db.insert(documentChunksTable).values(
          chunks.map((content, index) => ({
            documentId: doc.id,
            content,
            chunkIndex: index,
          }))
        );
      }

      results.push({ title: doc.title, id: doc.id, chunksCount: doc.chunksCount, status: "success" });
    } catch (err: any) {
      results.push({ title: docInput.title, id: 0, chunksCount: 0, status: "error", error: err?.message ?? "Unknown error" });
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  res.json({ total: documents.length, succeeded, failed, results });
});

async function getOllamaUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  return config?.serverUrl ?? null;
}

const DISCOVERY_CATEGORIES = [
  "market-data", "medical", "hedge-fund", "alt-data", "influencer",
  "research", "code", "security", "business",
];

router.get("/rag/discovery/sources", async (req, res): Promise<void> => {
  const status = (req.query.status as string) || undefined;

  let query = db
    .select()
    .from(discoveredSourcesTable)
    .orderBy(desc(discoveredSourcesTable.createdAt));

  if (status) {
    const results = await db
      .select()
      .from(discoveredSourcesTable)
      .where(eq(discoveredSourcesTable.status, status))
      .orderBy(desc(discoveredSourcesTable.createdAt));
    res.json(results);
    return;
  }

  const results = await query;
  res.json(results);
});

router.post("/rag/discovery/run", async (req, res): Promise<void> => {
  const body = req.body || {};
  const category = typeof body.category === "string" ? body.category : undefined;
  const customPrompt = typeof body.customPrompt === "string" ? body.customPrompt.slice(0, 2000) : undefined;

  const ollamaUrl = await getOllamaUrl();
  if (!ollamaUrl) {
    res.status(503).json({ error: "Ollama server not configured" });
    return;
  }

  const existingSources = await db.select({ url: discoveredSourcesTable.url }).from(discoveredSourcesTable);
  const existingUrls = existingSources.map((s) => s.url);

  const existingDocs = await db.select({ title: documentsTable.title }).from(documentsTable);
  const existingTitles = existingDocs.map((d) => d.title);

  const targetCategory = category && DISCOVERY_CATEGORIES.includes(category)
    ? category : DISCOVERY_CATEGORIES[Math.floor(Math.random() * DISCOVERY_CATEGORIES.length)];

  const categoryDescriptions: Record<string, string> = {
    "market-data": "financial market data, stock APIs, economic indicators, SEC filings, earnings data, forex, commodities",
    "medical": "medical research databases, clinical guidelines, otolaryngology/ENT, PubMed, biomedical literature, surgical datasets, voice/speech databases",
    "hedge-fund": "hedge fund databases, institutional investor tracking, fund performance data, allocator intelligence",
    "alt-data": "alternative data for finance, satellite imagery, supply chain data, web scraping, credit card spending, job posting data",
    "influencer": "influencer databases, social media analytics, creator marketplaces, audience demographics, engagement tracking",
    "research": "academic research datasets, AI/ML datasets, NLP corpora, scientific papers, open data repositories",
    "code": "programming documentation, API references, developer tools, framework docs, open-source projects",
    "security": "cybersecurity databases, vulnerability databases, threat intelligence, security frameworks, compliance standards",
    "business": "business intelligence, CRM data, marketing analytics, cloud services, productivity tools, SaaS platforms",
  };

  const categoryDesc = categoryDescriptions[targetCategory] || targetCategory;

  const prompt = customPrompt
    ? `${customPrompt}\n\nFor each database/source, provide a JSON array with objects containing: title, url, category, description, reasoning (why this is valuable). Return ONLY a valid JSON array, no other text.`
    : `You are a data intelligence research agent. Find 5 high-quality, publicly accessible databases, APIs, or data sources related to: ${categoryDesc}.

Requirements:
- Each source must have a real, working URL
- Focus on sources that provide data APIs, documentation, or downloadable datasets
- Prefer sources with free tiers or public access
- Avoid sources already known: ${existingTitles.slice(0, 20).join(", ")}
- Do not include these URLs: ${existingUrls.slice(0, 20).join(", ")}
- Category should be: ${targetCategory}

Return ONLY a valid JSON array with objects containing these exact fields:
- "title": short descriptive name
- "url": the actual URL of the resource
- "category": "${targetCategory}"
- "description": 1-2 sentence description of what data it provides and why it's useful
- "reasoning": why this source is valuable for AI agents and data intelligence

Example format:
[{"title":"Example DB","url":"https://example.com","category":"${targetCategory}","description":"A useful database.","reasoning":"It provides unique data."}]

Return ONLY the JSON array, nothing else.`;

  try {
    const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:latest",
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.8 },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      res.status(502).json({ error: `Ollama error: ${text}` });
      return;
    }

    const data = await ollamaRes.json() as { message?: { content?: string } };
    const responseText = data.message?.content ?? "";

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse discovery results", raw: responseText });
      return;
    }

    let discovered: Array<{
      title: string;
      url: string;
      category: string;
      description: string;
      reasoning: string;
    }>;

    try {
      discovered = JSON.parse(jsonMatch[0]);
    } catch {
      res.status(500).json({ error: "Invalid JSON from LLM", raw: responseText });
      return;
    }

    const saved: Array<{ id: number; title: string; url: string }> = [];
    const skipped: string[] = [];

    for (const item of discovered) {
      if (!item.title || !item.url) continue;

      try {
        new URL(item.url);
      } catch {
        skipped.push(`${item.title}: invalid URL`);
        continue;
      }

      if (existingUrls.includes(item.url)) {
        skipped.push(`${item.title}: already discovered`);
        continue;
      }

      try {
        const [inserted] = await db.insert(discoveredSourcesTable).values({
          title: item.title,
          url: item.url,
          category: item.category || targetCategory,
          description: item.description || "",
          relevanceScore: 0.7,
          status: "pending",
          discoveredBy: "discovery-agent",
          searchQuery: customPrompt || `auto-discovery: ${targetCategory}`,
          reasoning: item.reasoning || "",
        }).returning();

        saved.push({ id: inserted.id, title: inserted.title, url: inserted.url });
        existingUrls.push(item.url);
      } catch (err: any) {
        skipped.push(`${item.title}: ${err?.message ?? "insert error"}`);
      }
    }

    res.json({
      category: targetCategory,
      discovered: saved.length,
      skipped: skipped.length,
      sources: saved,
      skippedReasons: skipped,
    });
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      res.status(408).json({ error: "Discovery timed out — Ollama may be slow" });
    } else {
      res.status(502).json({ error: `Discovery failed: ${err?.message ?? "Unknown error"}` });
    }
  }
});

router.patch("/rag/discovery/sources/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { status } = req.body as { status?: string };
  if (!status || !["approved", "rejected", "imported"].includes(status)) {
    res.status(400).json({ error: "status must be approved, rejected, or imported" });
    return;
  }

  const updates: Record<string, any> = { status };
  if (status === "imported") {
    updates.importedAt = new Date();
  }

  const [updated] = await db
    .update(discoveredSourcesTable)
    .set(updates)
    .where(eq(discoveredSourcesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  res.json(updated);
});

router.delete("/rag/discovery/sources/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [deleted] = await db
    .delete(discoveredSourcesTable)
    .where(eq(discoveredSourcesTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  res.json({ success: true });
});

router.get("/rag/discovery/stats", async (_req, res): Promise<void> => {
  const all = await db.select().from(discoveredSourcesTable);
  const stats = {
    total: all.length,
    pending: all.filter((s) => s.status === "pending").length,
    approved: all.filter((s) => s.status === "approved").length,
    rejected: all.filter((s) => s.status === "rejected").length,
    imported: all.filter((s) => s.status === "imported").length,
    byCategory: {} as Record<string, number>,
  };

  for (const source of all) {
    stats.byCategory[source.category] = (stats.byCategory[source.category] || 0) + 1;
  }

  res.json(stats);
});

export default router;
