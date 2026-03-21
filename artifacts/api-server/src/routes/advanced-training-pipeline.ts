import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { trainingDataTable } from "@workspace/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { Agent } from "undici";

const router: IRouter = Router();

const ollamaAgent = new Agent({
  headersTimeout: 1200000,
  bodyTimeout: 1200000,
  connectTimeout: 30000,
});

const PMC_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const CT_BASE = "https://clinicaltrials.gov/api/v2";
const OPENALEX_BASE = "https://api.openalex.org";

interface PipelineStats {
  pmcArticles: number;
  pmcSamples: number;
  clinicalTrials: number;
  ctSamples: number;
  openAlexWorks: number;
  oaSamples: number;
  injectionJobs: number;
  lastRunAt: string | null;
}

let pipelineStats: PipelineStats = {
  pmcArticles: 0,
  pmcSamples: 0,
  clinicalTrials: 0,
  ctSamples: 0,
  openAlexWorks: 0,
  oaSamples: 0,
  injectionJobs: 0,
  lastRunAt: null,
};

const ENT_SYSTEM_PROMPT = "You are a board-certified otolaryngologist and AI-in-medicine researcher with comprehensive knowledge of current ENT literature. Per Bao et al. (JAMA Otolaryngology 2026), LLM applications in ENT span data structuring, precision medicine, administrative efficiency, decision support, and multimodal integration. Reference evidence-based benchmarks and cite sources when applicable.";

async function fetchPMCFullText(pmcid: string): Promise<string> {
  const res = await fetch(`${PMC_BASE}/efetch.fcgi?db=pmc&id=${pmcid}&rettype=xml&retmode=xml`);
  if (!res.ok) throw new Error(`PMC fetch failed: ${res.status}`);
  const xml = await res.text();

  const bodyMatch = xml.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/);
  if (!bodyMatch) return "";

  let text = bodyMatch[1]
    .replace(/<xref[^>]*>[\s\S]*?<\/xref>/g, "")
    .replace(/<table-wrap[\s\S]*?<\/table-wrap>/g, "")
    .replace(/<fig[\s\S]*?<\/fig>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, 15000);
}

async function searchPMC(query: string, maxResults: number = 10): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pmc",
    term: `${query} AND open access[filter]`,
    retmax: String(maxResults),
    retmode: "json",
    sort: "relevance",
  });

  const res = await fetch(`${PMC_BASE}/esearch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PMC search failed: ${res.status}`);
  const data = await res.json();
  return data.esearchresult?.idlist || [];
}

function generateFullTextSamples(text: string, title: string, pmcid: string): Array<{ input: string; output: string; category: string }> {
  const samples: Array<{ input: string; output: string; category: string }> = [];
  if (text.length < 200) return samples;

  const textLower = text.toLowerCase();
  let category = "general_ent";
  if (textLower.includes("artificial intelligence") || textLower.includes("deep learning") || textLower.includes("machine learning") || textLower.includes("neural network")) category = "ai_ent";
  else if (textLower.includes("pediatric") || textLower.includes("child") || textLower.includes("neonat")) category = "pediatric_ent";
  else if (textLower.includes("skull base") || textLower.includes("pituitary")) category = "skull_base";
  else if (textLower.includes("salivary") || textLower.includes("parotid")) category = "salivary_gland";
  else if (textLower.includes("tracheostom") || textLower.includes("subglottic stenosis") || textLower.includes("airway obstruction")) category = "airway";
  else if (textLower.includes("rhinoplast") || textLower.includes("facial plastic") || textLower.includes("septoplast")) category = "facial_plastics";
  else if (textLower.includes("allergic rhinit") || textLower.includes("immunotherapy")) category = "allergy";
  else if (textLower.includes("voice disorder") || textLower.includes("dysphon") || textLower.includes("spasmodic")) category = "voice_disorders";
  else if (textLower.includes("vertigo") || textLower.includes("meniere") || textLower.includes("vestibular")) category = "vestibular";
  else if (textLower.includes("laryngo") || textLower.includes("vocal")) category = "laryngology";
  else if (textLower.includes("otitis") || textLower.includes("hearing") || textLower.includes("cochle") || textLower.includes("cholesteatoma")) category = "otology";
  else if (textLower.includes("sinus") || textLower.includes("nasal") || textLower.includes("rhinit")) category = "rhinology";
  else if (textLower.includes("cancer") || textLower.includes("carcinoma") || textLower.includes("tumor")) category = "head_neck_oncology";
  else if (textLower.includes("sleep apnea") || textLower.includes("snoring")) category = "sleep_medicine";
  else if (textLower.includes("swallow") || textLower.includes("dysphag")) category = "dysphagia";
  else if (textLower.includes("thyroid") || textLower.includes("parathyroid")) category = "thyroid";
  else if (textLower.includes("tonsil") || textLower.includes("pharyn")) category = "pharyngology";
  else if (textLower.includes("endoscop")) category = "endoscopy";

  const sections = text.split(/(?:INTRODUCTION|METHODS|RESULTS|DISCUSSION|CONCLUSION)/i).filter(s => s.trim().length > 100);

  if (sections.length >= 2) {
    samples.push({
      input: `Provide a detailed clinical summary of the research findings from: "${title}"`,
      output: `Based on the full-text analysis of "${title}" (PMC ID: ${pmcid}):\n\n${text.slice(0, 2000)}`,
      category,
    });
  }

  const methodsMatch = text.match(/(?:METHODS|MATERIALS AND METHODS|STUDY DESIGN)([\s\S]{200,1500}?)(?:RESULTS|DISCUSSION)/i);
  if (methodsMatch) {
    samples.push({
      input: `What methodology was used in the study "${title}"?`,
      output: `The study "${title}" employed the following methodology:\n\n${methodsMatch[1].trim().slice(0, 1200)}\n\nSource: PMC ${pmcid}`,
      category,
    });
  }

  const resultsMatch = text.match(/(?:RESULTS)([\s\S]{200,2000}?)(?:DISCUSSION|CONCLUSION)/i);
  if (resultsMatch) {
    samples.push({
      input: `What were the key results and findings from "${title}"?`,
      output: `Key results from "${title}":\n\n${resultsMatch[1].trim().slice(0, 1500)}\n\nSource: PMC ${pmcid}`,
      category,
    });
  }

  const conclusionMatch = text.match(/(?:CONCLUSION|CONCLUSIONS)([\s\S]{100,1000})$/i);
  if (conclusionMatch) {
    samples.push({
      input: `What are the clinical implications and conclusions from "${title}"?`,
      output: `Clinical conclusions from "${title}":\n\n${conclusionMatch[1].trim().slice(0, 1000)}\n\nSource: PMC ${pmcid}`,
      category,
    });
  }

  return samples;
}

router.post("/advanced-training/pmc-collect", async (req, res) => {
  const maxPerQuery = Math.min(Math.max(1, Number(req.body?.maxPerQuery) || 5), 25);

  const queries = [
    "otolaryngology artificial intelligence",
    "laryngoscopy deep learning diagnosis",
    "otoscopy machine learning classification",
    "head neck cancer AI detection",
    "voice disorder AI diagnosis",
    "sleep apnea prediction model",
    "cochlear implant outcomes AI",
    "sinus surgery AI navigation",
    "tympanic membrane deep learning",
    "thyroid nodule AI classification",
    "laryngeal cancer image analysis",
    "hearing loss prediction model",
    "vocal cord paralysis diagnosis",
    "rhinosinusitis AI treatment",
    "endoscopy AI real-time detection",
    "pediatric otolaryngology management",
    "tonsillectomy adenoidectomy outcomes",
    "skull base endoscopic surgery",
    "parotid gland tumor surgery",
    "salivary gland disease management",
    "tracheostomy outcomes pediatric",
    "subglottic stenosis treatment",
    "allergic rhinitis immunotherapy",
    "vestibular disorders rehabilitation",
    "Meniere disease treatment",
    "facial plastic surgery reconstruction",
    "septoplasty outcomes quality",
    "laryngopharyngeal reflux management",
    "dysphagia rehabilitation speech",
    "cholesteatoma surgery techniques",
  ];

  res.json({ message: "PMC full-text collection started", queries: queries.length });

  let totalSamples = 0;
  let totalArticles = 0;

  for (const query of queries) {
    try {
      await new Promise(r => setTimeout(r, 500));
      const pmcids = await searchPMC(query, maxPerQuery);
      totalArticles += pmcids.length;

      for (const pmcid of pmcids) {
        try {
          await new Promise(r => setTimeout(r, 400));
          const res2 = await fetch(`${PMC_BASE}/esummary.fcgi?db=pmc&id=${pmcid}&retmode=json`);
          const summary = await res2.json();
          const articleInfo = summary.result?.[pmcid] || {};
          const title = articleInfo.title || `PMC Article ${pmcid}`;

          const fullText = await fetchPMCFullText(pmcid);
          const samples = generateFullTextSamples(fullText, title, pmcid);

          for (const sample of samples) {
            const existing = await db
              .select({ id: trainingDataTable.id })
              .from(trainingDataTable)
              .where(and(
                eq(trainingDataTable.source, "pmc_fulltext"),
                eq(trainingDataTable.inputText, sample.input)
              ))
              .limit(1);

            if (existing.length === 0) {
              await db.insert(trainingDataTable).values({
                inputText: sample.input,
                outputText: sample.output,
                systemPrompt: ENT_SYSTEM_PROMPT,
                category: sample.category,
                quality: 5,
                source: "pmc_fulltext",
              });
              totalSamples++;
            }
          }
        } catch (e: any) {
          console.error(`[pmc] Error processing ${pmcid}:`, e.message);
        }
      }
    } catch (e: any) {
      console.error(`[pmc] Search error for "${query}":`, e.message);
    }
  }

  pipelineStats.pmcArticles += totalArticles;
  pipelineStats.pmcSamples += totalSamples;
  pipelineStats.lastRunAt = new Date().toISOString();
  console.log(`[pmc] Collection complete: ${totalArticles} articles, ${totalSamples} samples`);
});

async function searchClinicalTrials(query: string, maxResults: number = 10): Promise<any[]> {
  const params = new URLSearchParams({
    "query.cond": query,
    pageSize: String(maxResults),
    format: "json",
    "fields": "NCTId,BriefTitle,OfficialTitle,BriefSummary,DetailedDescription,Condition,InterventionName,PrimaryOutcomeMeasure,StudyType,Phase,OverallStatus,EnrollmentCount,StartDate,CompletionDate",
  });

  const res = await fetch(`${CT_BASE}/studies?${params}`);
  if (!res.ok) throw new Error(`ClinicalTrials.gov API failed: ${res.status}`);
  const data = await res.json();
  return data.studies || [];
}

function generateTrialSamples(trial: any): Array<{ input: string; output: string; category: string }> {
  const samples: Array<{ input: string; output: string; category: string }> = [];

  const proto = trial.protocolSection || {};
  const id = proto.identificationModule || {};
  const desc = proto.descriptionModule || {};
  const design = proto.designModule || {};
  const status = proto.statusModule || {};
  const conditions = proto.conditionsModule || {};
  const interventions = proto.armsInterventionsModule || {};
  const outcomes = proto.outcomesModule || {};

  const nctId = id.nctId || "";
  const title = id.briefTitle || id.officialTitle || "";
  const summary = desc.briefSummary || "";
  const detailed = desc.detailedDescription || "";
  const conditionList = conditions.conditions || [];
  const interventionList = (interventions.interventions || []).map((i: any) => i.name).filter(Boolean);
  const outcomeList = (outcomes.primaryOutcomes || []).map((o: any) => o.measure).filter(Boolean);
  const phase = (design.phases || []).join(", ") || "N/A";
  const studyType = design.studyType || "N/A";
  const overallStatus = status.overallStatus || "Unknown";
  const enrollment = design.enrollmentInfo?.count || "N/A";

  if (!title || !summary) return samples;

  let category = "general_ent";
  const text = `${title} ${summary} ${conditionList.join(" ")}`.toLowerCase();
  if (text.includes("artificial intelligence") || text.includes("deep learning") || text.includes("machine learning")) category = "ai_ent";
  else if (text.includes("pediatric") || text.includes("child")) category = "pediatric_ent";
  else if (text.includes("skull base") || text.includes("pituitary")) category = "skull_base";
  else if (text.includes("salivary") || text.includes("parotid")) category = "salivary_gland";
  else if (text.includes("tracheostom") || text.includes("subglottic") || text.includes("airway")) category = "airway";
  else if (text.includes("rhinoplast") || text.includes("facial plastic") || text.includes("septoplast")) category = "facial_plastics";
  else if (text.includes("allergic rhinit") || text.includes("immunotherapy")) category = "allergy";
  else if (text.includes("voice disorder") || text.includes("dysphoni") || text.includes("spasmodic")) category = "voice_disorders";
  else if (text.includes("vertigo") || text.includes("meniere") || text.includes("vestibular")) category = "vestibular";
  else if (text.includes("laryngo") || text.includes("vocal") || text.includes("voice")) category = "laryngology";
  else if (text.includes("hear") || text.includes("cochle") || text.includes("otitis") || text.includes("cholesteatoma")) category = "otology";
  else if (text.includes("sinus") || text.includes("nasal") || text.includes("rhinit")) category = "rhinology";
  else if (text.includes("cancer") || text.includes("carcinoma") || text.includes("neoplasm")) category = "head_neck_oncology";
  else if (text.includes("sleep apnea") || text.includes("osa") || text.includes("snoring")) category = "sleep_medicine";
  else if (text.includes("dysphagia") || text.includes("swallow")) category = "dysphagia";
  else if (text.includes("thyroid") || text.includes("parathyroid")) category = "thyroid";
  else if (text.includes("tonsil") || text.includes("pharyn")) category = "pharyngology";
  else if (text.includes("endoscop")) category = "endoscopy";

  samples.push({
    input: `What is the clinical trial "${title}" investigating and what are its key details?`,
    output: `Clinical Trial: ${title}\nNCT ID: ${nctId}\nStatus: ${overallStatus}\nStudy Type: ${studyType}\nPhase: ${phase}\nEnrollment: ${enrollment}\n\nConditions: ${conditionList.join(", ")}\nInterventions: ${interventionList.join(", ") || "N/A"}\n\nSummary: ${summary}\n\n${detailed ? `Details: ${detailed.slice(0, 800)}` : ""}\n\nPrimary Outcomes: ${outcomeList.join("; ") || "N/A"}`,
    category,
  });

  if (interventionList.length > 0) {
    samples.push({
      input: `What interventions are being studied for ${conditionList[0] || "this ENT condition"} in trial ${nctId}?`,
      output: `In clinical trial ${nctId} ("${title}"), the following interventions are being investigated:\n\n${interventionList.map((i: string, idx: number) => `${idx + 1}. ${i}`).join("\n")}\n\nStudy Phase: ${phase}\nCurrent Status: ${overallStatus}\nEnrollment Target: ${enrollment}\n\n${summary}`,
      category,
    });
  }

  return samples;
}

router.post("/advanced-training/clinicaltrials-collect", async (req, res) => {
  const maxPerQuery = Math.min(Math.max(1, Number(req.body?.maxPerQuery) || 10), 25);

  const queries = [
    "otolaryngology",
    "laryngeal cancer",
    "hearing loss",
    "cochlear implant",
    "chronic sinusitis",
    "sleep apnea",
    "tonsillectomy",
    "voice disorders",
    "thyroid nodule",
    "head and neck cancer",
    "vocal cord paralysis",
    "otitis media",
    "rhinoplasty",
    "dysphagia",
    "laryngoscopy",
    "pediatric otolaryngology",
    "adenoidectomy",
    "skull base surgery",
    "parotid tumor",
    "salivary gland",
    "tracheostomy",
    "subglottic stenosis",
    "allergic rhinitis",
    "immunotherapy rhinitis",
    "vestibular disorder",
    "Meniere disease",
    "vertigo",
    "facial reconstruction",
    "septoplasty",
    "cholesteatoma",
    "sensorineural hearing loss",
    "laryngopharyngeal reflux",
    "spasmodic dysphonia",
    "parathyroid surgery",
    "endoscopic sinus surgery",
  ];

  res.json({ message: "ClinicalTrials.gov collection started", queries: queries.length });

  let totalTrials = 0;
  let totalSamples = 0;

  for (const query of queries) {
    try {
      await new Promise(r => setTimeout(r, 300));
      const trials = await searchClinicalTrials(query, maxPerQuery);
      totalTrials += trials.length;

      for (const trial of trials) {
        const samples = generateTrialSamples(trial);
        for (const sample of samples) {
          const existing = await db
            .select({ id: trainingDataTable.id })
            .from(trainingDataTable)
            .where(and(
              eq(trainingDataTable.source, "clinicaltrials"),
              eq(trainingDataTable.inputText, sample.input)
            ))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(trainingDataTable).values({
              inputText: sample.input,
              outputText: sample.output,
              systemPrompt: ENT_SYSTEM_PROMPT,
              category: sample.category,
              quality: 4,
              source: "clinicaltrials",
            });
            totalSamples++;
          }
        }
      }
    } catch (e: any) {
      console.error(`[ct] Error for "${query}":`, e.message);
    }
  }

  pipelineStats.clinicalTrials += totalTrials;
  pipelineStats.ctSamples += totalSamples;
  pipelineStats.lastRunAt = new Date().toISOString();
  console.log(`[ct] Collection complete: ${totalTrials} trials, ${totalSamples} samples`);
});

router.post("/advanced-training/openalex-collect", async (req, res) => {
  const maxPerQuery = Math.min(Math.max(1, Number(req.body?.maxPerQuery) || 10), 25);

  const queries = [
    "otolaryngology artificial intelligence",
    "laryngoscopy machine learning",
    "deep learning head neck cancer",
    "voice pathology AI diagnosis",
    "otoscopy neural network",
    "sleep apnea prediction",
    "cochlear implant outcomes",
    "endoscopy AI real-time",
  ];

  res.json({ message: "OpenAlex collection started", queries: queries.length });

  let totalWorks = 0;
  let totalSamples = 0;

  for (const query of queries) {
    try {
      await new Promise(r => setTimeout(r, 200));
      const params = new URLSearchParams({
        search: query,
        per_page: String(maxPerQuery),
        sort: "relevance_score:desc",
        select: "id,title,abstract_inverted_index,publication_date,authorships,primary_location,concepts,cited_by_count",
      });

      const oaRes = await fetch(`${OPENALEX_BASE}/works?${params}`, {
        headers: { "User-Agent": "mailto:llmhub@replit.app" },
      });
      if (!oaRes.ok) continue;
      const data = await oaRes.json();
      const works = data.results || [];
      totalWorks += works.length;

      for (const work of works) {
        if (!work.abstract_inverted_index) continue;

        const words: Array<[string, number[]]> = Object.entries(work.abstract_inverted_index);
        const maxPos = Math.max(...words.flatMap(([, positions]) => positions as number[]));
        const reconstructed = new Array(maxPos + 1).fill("");
        for (const [word, positions] of words) {
          for (const pos of positions as number[]) {
            reconstructed[pos] = word;
          }
        }
        const abstract = reconstructed.join(" ").trim();
        if (abstract.length < 100) continue;

        const title = work.title || "Untitled";
        const pubDate = work.publication_date || "";
        const journal = work.primary_location?.source?.display_name || "";
        const authors = (work.authorships || []).slice(0, 3).map((a: any) => a.author?.display_name).filter(Boolean).join(", ");
        const citations = work.cited_by_count || 0;

        const textLower = `${title} ${abstract}`.toLowerCase();
        let category = "general_ent";
        if (textLower.includes("artificial intelligence") || textLower.includes("deep learning") || textLower.includes("machine learning")) category = "ai_ent";
        else if (textLower.includes("laryngo") || textLower.includes("vocal")) category = "laryngology";
        else if (textLower.includes("hearing") || textLower.includes("otitis") || textLower.includes("cochle")) category = "otology";
        else if (textLower.includes("sinus") || textLower.includes("nasal")) category = "rhinology";
        else if (textLower.includes("cancer") || textLower.includes("carcinoma")) category = "head_neck_oncology";
        else if (textLower.includes("sleep apnea")) category = "sleep_medicine";

        const input = `Summarize the research findings and clinical significance of: "${title}"`;
        const output = `Research Summary: "${title}"\nAuthors: ${authors}${authors ? " et al." : ""}\nPublished: ${pubDate} in ${journal}\nCitations: ${citations}\n\n${abstract}\n\nThis study contributes to the growing body of evidence in ${category.replace(/_/g, " ")} research.`;

        const existing = await db
          .select({ id: trainingDataTable.id })
          .from(trainingDataTable)
          .where(and(
            eq(trainingDataTable.source, "openalex"),
            eq(trainingDataTable.inputText, input)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(trainingDataTable).values({
            inputText: input,
            outputText: output,
            systemPrompt: ENT_SYSTEM_PROMPT,
            category,
            quality: citations > 50 ? 5 : citations > 10 ? 4 : 3,
            source: "openalex",
          });
          totalSamples++;
        }
      }
    } catch (e: any) {
      console.error(`[openalex] Error for "${query}":`, e.message);
    }
  }

  pipelineStats.openAlexWorks += totalWorks;
  pipelineStats.oaSamples += totalSamples;
  pipelineStats.lastRunAt = new Date().toISOString();
  console.log(`[openalex] Collection complete: ${totalWorks} works, ${totalSamples} samples`);
});

router.post("/advanced-training/inject-to-model", async (req, res) => {
  const { model = "meditron:7b", category, limit = 50 } = req.body || {};

  try {
    const vpsIp = process.env.VPS_IP || "72.60.167.64";
    const serverUrl = process.env.OLLAMA_BASE_URL || `http://${vpsIp}:11434`;

    const clampedLimit = Math.min(Math.max(10, limit), 200);
    const conditions = [sql`${trainingDataTable.quality} >= 3`];
    if (category) conditions.push(eq(trainingDataTable.category, category));

    const samples = await db
      .select()
      .from(trainingDataTable)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(trainingDataTable.quality))
      .limit(clampedLimit);

    if (samples.length === 0) {
      return res.json({ error: "No training samples found matching criteria" });
    }

    const conversationPairs = samples.map(s => ({
      role_system: s.systemPrompt,
      role_user: s.inputText,
      role_assistant: s.outputText,
    }));

    const systemPrompt = samples[0].systemPrompt || ENT_SYSTEM_PROMPT;
    const modelfileName = `${model.replace(/[:.]/g, "-")}-ent-trained`;

    const messages = conversationPairs.slice(0, 20).flatMap(p => [
      { role: "user" as const, content: p.role_user },
      { role: "assistant" as const, content: p.role_assistant },
    ]);

    const createRes = await fetch(`${serverUrl}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelfileName,
        from: model,
        system: systemPrompt,
        parameters: {
          temperature: 0.3,
          top_p: 0.85,
          top_k: 30,
          repeat_penalty: 1.15,
        },
        messages,
        stream: false,
      }),
      dispatcher: ollamaAgent,
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      return res.status(500).json({ error: `Ollama create failed: ${createRes.status}`, details: errorText });
    }

    pipelineStats.injectionJobs++;
    pipelineStats.lastRunAt = new Date().toISOString();

    res.json({
      success: true,
      modelName: modelfileName,
      baseModel: model,
      samplesUsed: conversationPairs.length,
      messagesInjected: Math.min(20, conversationPairs.length),
      category: category || "all",
    });

    console.log(`[inject] Created model ${modelfileName} from ${model} with ${conversationPairs.length} samples`);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/advanced-training/stats", async (_req, res) => {
  try {
    const sourceStats = await db
      .select({
        source: trainingDataTable.source,
        count: sql<number>`count(*)::int`,
        avgQuality: sql<number>`avg(quality)::numeric(3,1)`,
      })
      .from(trainingDataTable)
      .groupBy(trainingDataTable.source);

    const totalByCategory = await db
      .select({
        category: trainingDataTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingDataTable)
      .groupBy(trainingDataTable.category);

    const total = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainingDataTable);

    const vpsIp = process.env.VPS_IP || "72.60.167.64";
    const serverUrl = process.env.OLLAMA_BASE_URL || `http://${vpsIp}:11434`;
    let vpsModels: any[] = [];
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const modelsRes = await fetch(`${serverUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(t);
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        vpsModels = (modelsData.models || []).map((m: any) => ({
          name: m.name,
          size: m.size,
          modified: m.modified_at,
        }));
      }
    } catch (e: any) {
      console.log("[stats] VPS unreachable for model list:", e.message?.slice(0, 50));
    }

    res.json({
      totalSamples: total[0]?.count || 0,
      bySource: Object.fromEntries(sourceStats.map(s => [s.source, { count: s.count, avgQuality: s.avgQuality }])),
      byCategory: Object.fromEntries(totalByCategory.map(c => [c.category, c.count])),
      pipeline: pipelineStats,
      vpsModels,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/advanced-training/progress", async (_req, res) => {
  try {
    const total = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainingDataTable);

    const bySource = await db
      .select({
        source: trainingDataTable.source,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingDataTable)
      .groupBy(trainingDataTable.source);

    const byCategory = await db
      .select({
        category: trainingDataTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingDataTable)
      .groupBy(trainingDataTable.category);

    const avgTokensPerSample = 500;
    const totalSamples = total[0]?.count || 0;
    const estimatedTokens = totalSamples * avgTokensPerSample;
    const estimatedSizeMB = parseFloat(((estimatedTokens * 4) / (1024 * 1024)).toFixed(2));

    const growthData = await db
      .select({
        date: sql<string>`to_char(${trainingDataTable.createdAt}::date, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingDataTable)
      .groupBy(sql`${trainingDataTable.createdAt}::date`)
      .orderBy(sql`${trainingDataTable.createdAt}::date`);

    let cumulative = 0;
    const cumulativeGrowth = growthData.map((d) => {
      cumulative += d.count;
      return { date: d.date, added: d.count, total: cumulative };
    });

    const oldest = await db
      .select({ ts: sql<string>`to_char(min(${trainingDataTable.createdAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` })
      .from(trainingDataTable);

    const newest = await db
      .select({ ts: sql<string>`to_char(max(${trainingDataTable.createdAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` })
      .from(trainingDataTable);

    const qualityDist = await db
      .select({
        quality: trainingDataTable.quality,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingDataTable)
      .groupBy(trainingDataTable.quality)
      .orderBy(trainingDataTable.quality);

    res.json({
      totalSamples,
      estimatedSizeMB,
      estimatedTokens,
      sourceBreakdown: Object.fromEntries(bySource.map((s) => [s.source, s.count])),
      categoryCount: byCategory.length,
      qualityDistribution: Object.fromEntries(qualityDist.map((q) => [q.quality, q.count])),
      firstCollectionAt: oldest[0]?.ts || null,
      lastCollectionAt: newest[0]?.ts || null,
      lastPipelineRun: pipelineStats.lastRunAt,
      nextScheduledRun: pipelineStats.lastRunAt
        ? new Date(new Date(pipelineStats.lastRunAt).getTime() + 30 * 60 * 1000).toISOString()
        : null,
      growthOverTime: cumulativeGrowth,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/advanced-training/export-jsonl", async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const source = req.query.source as string | undefined;
    const minQuality = Math.min(Math.max(1, Number(req.query.minQuality) || 1), 5);

    const conditions: any[] = [sql`${trainingDataTable.quality} >= ${minQuality}`];
    if (category) conditions.push(eq(trainingDataTable.category, category));
    if (source) conditions.push(eq(trainingDataTable.source, source));

    const samples = await db
      .select()
      .from(trainingDataTable)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(trainingDataTable.quality));

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const parts = [category && `-${category}`, source && `-${source}`].filter(Boolean).join("");
    const suffix = parts || "";
    const filename = `training-data${suffix}-${timestamp}.jsonl`;

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    for (const sample of samples) {
      const jsonlLine = JSON.stringify({
        messages: [
          ...(sample.systemPrompt ? [{ role: "system", content: sample.systemPrompt }] : []),
          { role: "user", content: sample.inputText },
          { role: "assistant", content: sample.outputText },
        ],
        metadata: {
          source: sample.source,
          category: sample.category,
          quality: sample.quality,
          id: sample.id,
        },
      });
      res.write(jsonlLine + "\n");
    }

    res.end();
    console.log(`[export] Exported ${samples.length} samples as JSONL (category=${category || "all"}, source=${source || "all"}, minQuality=${minQuality})`);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/advanced-training/collect-all", async (_req, res) => {
  res.json({ message: "Full collection pipeline started (PMC + ClinicalTrials + OpenAlex)" });

  const runEndpoint = async (path: string, body: any) => {
    try {
      await fetch(`http://localhost:${process.env.PORT || 8080}/api/advanced-training/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      console.error(`[pipeline] Error running ${path}:`, e.message);
    }
  };

  await runEndpoint("pmc-collect", { maxPerQuery: 5 });
  await runEndpoint("clinicaltrials-collect", { maxPerQuery: 10 });
  await runEndpoint("openalex-collect", { maxPerQuery: 10 });

  console.log("[pipeline] Full collection pipeline complete");
});

export default router;
