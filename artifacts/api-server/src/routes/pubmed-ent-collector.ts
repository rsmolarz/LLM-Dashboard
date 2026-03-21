import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { trainingDataTable } from "@workspace/db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";

const router: IRouter = Router();

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const MESH_QUERIES = [
  '"otolaryngology"[MeSH Terms]',
  '"ear diseases"[MeSH Terms]',
  '"nose diseases"[MeSH Terms]',
  '"laryngeal diseases"[MeSH Terms]',
  '"pharyngeal diseases"[MeSH Terms]',
  '"hearing disorders"[MeSH Terms]',
  '"voice disorders"[MeSH Terms]',
  '"deglutition disorders"[MeSH Terms]',
  '"head and neck neoplasms"[MeSH Terms]',
  '"rhinitis"[MeSH Terms]',
  '"sinusitis"[MeSH Terms]',
  '"otitis"[MeSH Terms]',
  '"tonsillitis"[MeSH Terms]',
  '"sleep apnea"[MeSH Terms]',
  '"cochlear implants"[MeSH Terms]',
  '"endoscopy"[MeSH Terms] AND "otolaryngology"[MeSH Terms]',
  '"artificial intelligence"[MeSH Terms] AND "otolaryngology"[MeSH Terms]',
  '"machine learning"[MeSH Terms] AND "laryngoscopy"[MeSH Terms]',
  '"deep learning"[MeSH Terms] AND "head and neck"[All Fields]',
  '"image processing, computer-assisted"[MeSH Terms] AND "larynx"[MeSH Terms]',
];

const KEYWORD_QUERIES = [
  "flexible laryngoscopy AI",
  "ENT clinical decision support",
  "otolaryngology machine learning",
  "vocal cord paralysis diagnosis",
  "laryngeal cancer detection AI",
  "audiometry deep learning",
  "thyroid nodule classification",
  "sinonasal imaging AI",
  "tympanic membrane image analysis",
  "obstructive sleep apnea prediction model",
];

interface PubMedArticle {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  pubDate: string;
  meshTerms: string[];
  keywords: string[];
  doi: string;
}

interface CollectionRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  queryType: "mesh" | "keyword" | "both";
  articlesFound: number;
  articlesStored: number;
  samplesGenerated: number;
  errors: string[];
}

interface PipelineStats {
  totalArticles: number;
  totalSamples: number;
  lastRunAt: string | null;
  runHistory: CollectionRun[];
  articlesByCategory: Record<string, number>;
}

let currentRun: CollectionRun | null = null;
const runHistory: CollectionRun[] = [];
const storedArticles: Map<string, PubMedArticle> = new Map();
let autoCollectInterval: ReturnType<typeof setInterval> | null = null;
let autoCollectEnabled = false;

async function searchPubMed(query: string, maxResults: number = 20): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmax: String(maxResults),
    retmode: "json",
    sort: "relevance",
  });

  const res = await fetch(`${PUBMED_BASE}/esearch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed search failed: ${res.status}`);
  const data = await res.json();
  return data.esearchresult?.idlist || [];
}

async function fetchArticleDetails(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  const params = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
    rettype: "abstract",
  });

  const res = await fetch(`${PUBMED_BASE}/efetch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed fetch failed: ${res.status}`);
  const xml = await res.text();

  return parseArticlesFromXml(xml);
}

function parseArticlesFromXml(xml: string): PubMedArticle[] {
  const articles: PubMedArticle[] = [];
  const articleBlocks = xml.split("<PubmedArticle>").slice(1);

  for (const block of articleBlocks) {
    try {
      const pmid = extractTag(block, "PMID") || "";
      const title = extractTag(block, "ArticleTitle") || "";
      const abstractParts: string[] = [];
      const abstractTexts = block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g) || [];
      for (const at of abstractTexts) {
        const labelMatch = at.match(/Label="([^"]+)"/);
        const textContent = at.replace(/<[^>]+>/g, "").trim();
        if (labelMatch) {
          abstractParts.push(`${labelMatch[1]}: ${textContent}`);
        } else {
          abstractParts.push(textContent);
        }
      }
      const abstract = abstractParts.join("\n");

      const authorMatches = block.match(/<Author[\s\S]*?<\/Author>/g) || [];
      const authors = authorMatches.map((a) => {
        const last = extractTag(a, "LastName") || "";
        const first = extractTag(a, "ForeName") || "";
        return `${last} ${first}`.trim();
      }).filter(Boolean);

      const journal = extractTag(block, "Title") || extractTag(block, "ISOAbbreviation") || "";
      const year = extractTag(block, "Year") || "";
      const month = extractTag(block, "Month") || "01";
      const day = extractTag(block, "Day") || "01";
      const pubDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

      const meshMatches = block.match(/<DescriptorName[^>]*>([\s\S]*?)<\/DescriptorName>/g) || [];
      const meshTerms = meshMatches.map((m) => m.replace(/<[^>]+>/g, "").trim());

      const kwMatches = block.match(/<Keyword[^>]*>([\s\S]*?)<\/Keyword>/g) || [];
      const keywords = kwMatches.map((k) => k.replace(/<[^>]+>/g, "").trim());

      const doiMatch = block.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);
      const doi = doiMatch ? doiMatch[1].trim() : "";

      if (pmid && title) {
        articles.push({ pmid, title, abstract, authors, journal, pubDate, meshTerms, keywords, doi });
      }
    } catch (e) {
      continue;
    }
  }

  return articles;
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : null;
}

function categorizeArticle(article: PubMedArticle): string {
  const text = `${article.title} ${article.abstract} ${article.meshTerms.join(" ")} ${article.keywords.join(" ")}`.toLowerCase();

  if (text.includes("artificial intelligence") || text.includes("machine learning") || text.includes("deep learning") || text.includes("neural network")) return "ai_ent";
  if (text.includes("laryngo") || text.includes("vocal") || text.includes("voice") || text.includes("glott")) return "laryngology";
  if (text.includes("otitis") || text.includes("hearing") || text.includes("cochle") || text.includes("tympan") || text.includes("ear")) return "otology";
  if (text.includes("sinus") || text.includes("rhinit") || text.includes("nasal") || text.includes("nose") || text.includes("rhinol")) return "rhinology";
  if (text.includes("cancer") || text.includes("neoplas") || text.includes("tumor") || text.includes("carcinoma")) return "head_neck_oncology";
  if (text.includes("sleep apnea") || text.includes("snoring") || text.includes("obstructive sleep")) return "sleep_medicine";
  if (text.includes("swallow") || text.includes("deglutit") || text.includes("dysphag")) return "dysphagia";
  if (text.includes("thyroid") || text.includes("parathyroid")) return "thyroid";
  if (text.includes("tonsil") || text.includes("adenoid") || text.includes("pharyn")) return "pharyngology";
  if (text.includes("endoscop")) return "endoscopy";
  return "general_ent";
}

function generateTrainingSamples(article: PubMedArticle): Array<{ input: string; output: string; category: string }> {
  const samples: Array<{ input: string; output: string; category: string }> = [];
  const category = categorizeArticle(article);

  if (!article.abstract || article.abstract.length < 100) return samples;

  samples.push({
    input: `Summarize the key findings from the following ENT research: "${article.title}"`,
    output: `Based on the study "${article.title}" published in ${article.journal} (${article.pubDate}):\n\n${article.abstract}\n\nAuthors: ${article.authors.slice(0, 5).join(", ")}${article.authors.length > 5 ? " et al." : ""}\n${article.doi ? `DOI: ${article.doi}` : `PMID: ${article.pmid}`}`,
    category,
  });

  if (article.meshTerms.length > 0) {
    samples.push({
      input: `What MeSH terms and medical concepts are associated with "${article.title}"?`,
      output: `The study "${article.title}" is indexed with the following MeSH terms: ${article.meshTerms.join(", ")}.\n\n${article.keywords.length > 0 ? `Additional keywords: ${article.keywords.join(", ")}.` : ""}\n\nThis article falls under the ${category.replace(/_/g, " ")} subcategory of otolaryngology.`,
      category,
    });
  }

  const hasBackground = article.abstract.toLowerCase().includes("background") || article.abstract.toLowerCase().includes("objective");
  const hasConclusion = article.abstract.toLowerCase().includes("conclusion") || article.abstract.toLowerCase().includes("results");
  if (hasBackground && hasConclusion) {
    samples.push({
      input: `What clinical question does this study address and what were the conclusions? Title: "${article.title}"`,
      output: article.abstract,
      category,
    });
  }

  return samples;
}

async function runCollection(queryType: "mesh" | "keyword" | "both", maxPerQuery: number = 10): Promise<CollectionRun> {
  const run: CollectionRun = {
    id: `pubmed-${Date.now()}`,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    queryType,
    articlesFound: 0,
    articlesStored: 0,
    samplesGenerated: 0,
    errors: [],
  };
  currentRun = run;

  try {
    const queries: string[] = [];
    if (queryType === "mesh" || queryType === "both") queries.push(...MESH_QUERIES);
    if (queryType === "keyword" || queryType === "both") queries.push(...KEYWORD_QUERIES);

    const allPmids = new Set<string>();

    for (const query of queries) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const pmids = await searchPubMed(query, maxPerQuery);
        pmids.forEach((id) => allPmids.add(id));
      } catch (e: any) {
        run.errors.push(`Search "${query.slice(0, 50)}...": ${e.message}`);
      }
    }

    run.articlesFound = allPmids.size;
    console.log(`[pubmed-ent] Found ${allPmids.size} unique articles from ${queries.length} queries`);

    const pmidArray = Array.from(allPmids);
    const batchSize = 50;
    const articles: PubMedArticle[] = [];

    for (let i = 0; i < pmidArray.length; i += batchSize) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const batch = await fetchArticleDetails(pmidArray.slice(i, i + batchSize));
        articles.push(...batch);
      } catch (e: any) {
        run.errors.push(`Fetch batch ${i}: ${e.message}`);
      }
    }

    let newArticles = 0;
    for (const article of articles) {
      if (!storedArticles.has(article.pmid)) {
        storedArticles.set(article.pmid, article);
        newArticles++;
      }
    }
    run.articlesStored = newArticles;

    let samplesGenerated = 0;
    for (const article of articles) {
      const samples = generateTrainingSamples(article);
      for (const sample of samples) {
        try {
          const existing = await db
            .select({ id: trainingDataTable.id })
            .from(trainingDataTable)
            .where(
              and(
                eq(trainingDataTable.source, "pubmed"),
                eq(trainingDataTable.inputText, sample.input)
              )
            )
            .limit(1);

          if (existing.length === 0) {
            await db.insert(trainingDataTable).values({
              inputText: sample.input,
              outputText: sample.output,
              systemPrompt: "You are an expert otolaryngologist and ENT researcher with comprehensive knowledge of current medical literature.",
              category: sample.category,
              quality: 4,
              source: "pubmed",
            });
            samplesGenerated++;
          }
        } catch (e: any) {
          run.errors.push(`Store sample: ${e.message}`);
        }
      }
    }

    run.samplesGenerated = samplesGenerated;
    run.status = "completed";
    run.completedAt = new Date().toISOString();
    console.log(`[pubmed-ent] Collection complete: ${run.articlesFound} found, ${run.articlesStored} new articles, ${run.samplesGenerated} samples generated`);
  } catch (e: any) {
    run.status = "failed";
    run.errors.push(`Fatal: ${e.message}`);
    run.completedAt = new Date().toISOString();
    console.error(`[pubmed-ent] Collection failed:`, e.message);
  }

  currentRun = null;
  runHistory.unshift(run);
  if (runHistory.length > 50) runHistory.pop();
  return run;
}

router.get("/pubmed-ent/status", (_req, res) => {
  const totalSamples = storedArticles.size;
  res.json({
    autoCollectEnabled,
    currentRun,
    totalArticlesCached: storedArticles.size,
    runHistory: runHistory.slice(0, 20),
    meshQueries: MESH_QUERIES.length,
    keywordQueries: KEYWORD_QUERIES.length,
  });
});

router.get("/pubmed-ent/stats", async (_req, res) => {
  try {
    const samples = await db
      .select({
        category: trainingDataTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingDataTable)
      .where(eq(trainingDataTable.source, "pubmed"))
      .groupBy(trainingDataTable.category);

    const total = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainingDataTable)
      .where(eq(trainingDataTable.source, "pubmed"));

    const recent = await db
      .select()
      .from(trainingDataTable)
      .where(eq(trainingDataTable.source, "pubmed"))
      .orderBy(desc(trainingDataTable.createdAt))
      .limit(10);

    res.json({
      totalSamples: total[0]?.count || 0,
      byCategory: Object.fromEntries(samples.map((s) => [s.category, s.count])),
      recentSamples: recent,
      totalArticlesCached: storedArticles.size,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/pubmed-ent/collect", async (req, res) => {
  if (currentRun) {
    return res.status(409).json({ error: "Collection already in progress", currentRun });
  }

  const { queryType = "both", maxPerQuery = 10 } = req.body || {};
  res.json({ message: "Collection started", queryType, maxPerQuery });

  runCollection(queryType, maxPerQuery).catch((e) =>
    console.error("[pubmed-ent] Background collection error:", e)
  );
});

router.post("/pubmed-ent/search-custom", async (req, res) => {
  try {
    const { query, maxResults = 10 } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" });

    const pmids = await searchPubMed(query, maxResults);
    const articles = await fetchArticleDetails(pmids);

    articles.forEach((a) => {
      if (!storedArticles.has(a.pmid)) storedArticles.set(a.pmid, a);
    });

    res.json({
      query,
      found: articles.length,
      articles: articles.map((a) => ({
        pmid: a.pmid,
        title: a.title,
        authors: a.authors.slice(0, 3).join(", ") + (a.authors.length > 3 ? " et al." : ""),
        journal: a.journal,
        pubDate: a.pubDate,
        category: categorizeArticle(a),
        hasAbstract: a.abstract.length > 0,
        meshTerms: a.meshTerms.slice(0, 5),
        doi: a.doi,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/pubmed-ent/articles", (_req, res) => {
  const articles = Array.from(storedArticles.values())
    .sort((a, b) => b.pubDate.localeCompare(a.pubDate))
    .slice(0, 100)
    .map((a) => ({
      pmid: a.pmid,
      title: a.title,
      authors: a.authors.slice(0, 3).join(", ") + (a.authors.length > 3 ? " et al." : ""),
      journal: a.journal,
      pubDate: a.pubDate,
      category: categorizeArticle(a),
      hasAbstract: a.abstract.length > 0,
      abstractLength: a.abstract.length,
      meshTerms: a.meshTerms.slice(0, 5),
      keywords: a.keywords.slice(0, 5),
      doi: a.doi,
    }));

  res.json({ total: storedArticles.size, articles });
});

router.get("/pubmed-ent/article/:pmid", (req, res) => {
  const article = storedArticles.get(req.params.pmid);
  if (!article) return res.status(404).json({ error: "Article not found in cache" });
  res.json({ ...article, category: categorizeArticle(article) });
});

router.post("/pubmed-ent/generate-samples/:pmid", async (req, res) => {
  try {
    const article = storedArticles.get(req.params.pmid);
    if (!article) return res.status(404).json({ error: "Article not found in cache" });

    const samples = generateTrainingSamples(article);
    let stored = 0;

    for (const sample of samples) {
      const existing = await db
        .select({ id: trainingDataTable.id })
        .from(trainingDataTable)
        .where(
          and(
            eq(trainingDataTable.source, "pubmed"),
            eq(trainingDataTable.inputText, sample.input)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(trainingDataTable).values({
          inputText: sample.input,
          outputText: sample.output,
          systemPrompt: "You are an expert otolaryngologist and ENT researcher with comprehensive knowledge of current medical literature.",
          category: sample.category,
          quality: 4,
          source: "pubmed",
        });
        stored++;
      }
    }

    res.json({
      pmid: article.pmid,
      title: article.title,
      samplesGenerated: samples.length,
      samplesStored: stored,
      category: categorizeArticle(article),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/pubmed-ent/auto-collect", (req, res) => {
  const { enabled, intervalMinutes = 120 } = req.body;

  if (enabled && !autoCollectEnabled) {
    autoCollectEnabled = true;
    autoCollectInterval = setInterval(() => {
      if (!currentRun) {
        console.log("[pubmed-ent] Auto-collect triggered");
        runCollection("both", 5).catch((e) =>
          console.error("[pubmed-ent] Auto-collect error:", e)
        );
      }
    }, intervalMinutes * 60 * 1000);
    console.log(`[pubmed-ent] Auto-collect enabled every ${intervalMinutes} minutes`);
    res.json({ enabled: true, intervalMinutes });
  } else if (!enabled && autoCollectEnabled) {
    autoCollectEnabled = false;
    if (autoCollectInterval) {
      clearInterval(autoCollectInterval);
      autoCollectInterval = null;
    }
    console.log("[pubmed-ent] Auto-collect disabled");
    res.json({ enabled: false });
  } else {
    res.json({ enabled: autoCollectEnabled });
  }
});

router.get("/pubmed-ent/queries", (_req, res) => {
  res.json({
    meshQueries: MESH_QUERIES,
    keywordQueries: KEYWORD_QUERIES,
  });
});

export default router;
