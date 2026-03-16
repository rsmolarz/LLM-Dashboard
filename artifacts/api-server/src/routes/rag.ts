import { Router, type IRouter } from "express";
import { eq, asc, sql, ilike } from "drizzle-orm";
import { db, documentsTable, documentChunksTable } from "@workspace/db";
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

export default router;
