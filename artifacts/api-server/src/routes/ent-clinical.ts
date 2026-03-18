import { Router } from "express";
import type { IRouter, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  clinicalDecisionsTable, audiogramAnalysesTable, clinicalCasesTable,
  medicalReportsTable, drugInteractionsTable, patientEducationTable,
  imageAnnotationsTable, clinicalProtocolsTable,
  surgicalPlanningTable, treatmentOutcomesTable, literatureSearchTable,
  symptomTimelineTable, referralLettersTable, dosageCalculatorTable, voiceDisorderTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { llmConfigTable } from "@workspace/db/schema";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) { next(); }

async function getServerUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  return config?.serverUrl || null;
}

async function queryOllama(serverUrl: string, model: string, prompt: string): Promise<string> {
  const resp = await fetch(`${serverUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!resp.ok) throw new Error(`Ollama returned ${resp.status}: ${await resp.text().catch(() => "unknown")}`);
  const data = await resp.json() as any;
  return data.response || "";
}

router.get("/clinical/decisions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(clinicalDecisionsTable).orderBy(desc(clinicalDecisionsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/decisions/analyze", requireAuth, async (req, res): Promise<void> => {
  const { symptoms, history, findings, model } = req.body;
  if (!symptoms) { res.status(400).json({ error: "symptoms required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `You are an expert ENT (Otolaryngology) physician. Based on the following clinical presentation, provide:
1. Top 5 differential diagnoses with confidence percentages
2. Recommended diagnostic workup
3. Urgency level (emergency/urgent/routine)
4. Key red flags to watch for

Symptoms: ${symptoms}
${history ? `History: ${history}` : ""}
${findings ? `Examination Findings: ${findings}` : ""}

Respond in JSON format: { "differentials": [{"diagnosis": "...", "confidence": 0.0-1.0, "reasoning": "..."}], "workup": ["..."], "urgencyLevel": "...", "redFlags": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch { parsed = { raw: response }; }

    const [row] = await db.insert(clinicalDecisionsTable).values({
      symptoms, history, findings,
      differentials: JSON.stringify(parsed.differentials || []),
      recommendedWorkup: JSON.stringify(parsed.workup || []),
      urgencyLevel: parsed.urgencyLevel || "routine",
      model: useModel,
      confidence: parsed.differentials?.[0]?.confidence || null,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/audiogram", async (_req, res): Promise<void> => {
  const rows = await db.select().from(audiogramAnalysesTable).orderBy(desc(audiogramAnalysesTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/audiogram/analyze", requireAuth, async (req, res): Promise<void> => {
  const { frequencies, patientAge, model } = req.body;
  if (!frequencies) { res.status(400).json({ error: "frequencies data required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `You are an expert audiologist. Analyze this audiogram data and provide:
1. Type of hearing loss (conductive/sensorineural/mixed)
2. Severity (normal/mild/moderate/moderately-severe/severe/profound)
3. Likely etiology
4. Clinical recommendations
5. Need for further testing

Audiogram data (frequencies in Hz -> dB HL): ${JSON.stringify(frequencies)}
${patientAge ? `Patient age: ${patientAge}` : ""}

Respond in JSON: { "hearingLossType": "...", "severity": "...", "etiology": "...", "interpretation": "...", "recommendations": ["..."], "furtherTests": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }

    const [row] = await db.insert(audiogramAnalysesTable).values({
      patientAge, frequencies: JSON.stringify(frequencies),
      hearingLossType: parsed.hearingLossType || null,
      severity: parsed.severity || null,
      aiInterpretation: parsed.interpretation || response,
      recommendations: JSON.stringify(parsed.recommendations || []),
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/cases", async (_req, res): Promise<void> => {
  const rows = await db.select().from(clinicalCasesTable).orderBy(desc(clinicalCasesTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/cases/generate", requireAuth, async (req, res): Promise<void> => {
  const { category, difficulty, model } = req.body;
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const cat = category || "otology";
  const diff = difficulty || "intermediate";
  const prompt = `Generate a realistic ENT clinical case study for medical education.
Category: ${cat} (otology/rhinology/laryngology/head-neck)
Difficulty: ${diff}

Include: presenting complaint, history, examination findings, investigation results, differential diagnoses, final diagnosis, management plan.

Respond in JSON: { "title": "...", "presentation": "...", "differentials": ["..."], "diagnosis": "...", "workup": "...", "management": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { title: `ENT Case - ${cat}`, presentation: response }; }

    const [row] = await db.insert(clinicalCasesTable).values({
      title: parsed.title || `ENT Case Study - ${cat}`,
      category: cat, difficulty: diff,
      presentation: parsed.presentation || response,
      differentials: JSON.stringify(parsed.differentials || []),
      diagnosis: parsed.diagnosis || null,
      workup: parsed.workup || null,
      management: parsed.management || null,
      generatedBy: useModel,
    }).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/reports", async (_req, res): Promise<void> => {
  const rows = await db.select().from(medicalReportsTable).orderBy(desc(medicalReportsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/reports/generate", requireAuth, async (req, res): Promise<void> => {
  const { reportType, templateName, inputData, model } = req.body;
  if (!reportType || !inputData) { res.status(400).json({ error: "reportType and inputData required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";

  const templates: Record<string, string> = {
    "operative_note": "Write a detailed operative note for an ENT surgical procedure.",
    "clinic_letter": "Write a professional clinic letter to a referring physician.",
    "discharge_summary": "Write a comprehensive discharge summary for an ENT patient.",
    "consultation": "Write a formal consultation note for an ENT referral.",
  };

  const prompt = `${templates[reportType] || "Write a professional ENT medical report."}

Clinical information: ${inputData}

Format the report professionally with appropriate sections, medical terminology, and formal structure. Include date, patient details placeholders, findings, and plan.`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    const [row] = await db.insert(medicalReportsTable).values({
      reportType, templateName: templateName || reportType,
      inputData, generatedReport: response, model: useModel, status: "draft",
    }).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/drug-interactions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(drugInteractionsTable).orderBy(desc(drugInteractionsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/drug-interactions/check", requireAuth, async (req, res): Promise<void> => {
  const { drugs, model } = req.body;
  if (!drugs) { res.status(400).json({ error: "drugs list required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `You are a clinical pharmacist specializing in ENT medications. Analyze these medications for interactions:

Medications: ${drugs}

Provide:
1. Known drug interactions with severity (major/moderate/minor)
2. ENT-specific relevance (e.g., ototoxicity, effects on mucosal healing)
3. Safer alternatives if interactions exist
4. Monitoring recommendations

Respond in JSON: { "interactions": [{"drugs": "...", "severity": "...", "description": "..."}], "entRelevance": "...", "alternatives": ["..."], "monitoring": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }

    const [row] = await db.insert(drugInteractionsTable).values({
      drugs, interactions: JSON.stringify(parsed.interactions || []),
      severity: parsed.interactions?.[0]?.severity || "unknown",
      entRelevance: parsed.entRelevance || null,
      alternatives: JSON.stringify(parsed.alternatives || []),
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/patient-education", async (_req, res): Promise<void> => {
  const rows = await db.select().from(patientEducationTable).orderBy(desc(patientEducationTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/patient-education/generate", requireAuth, async (req, res): Promise<void> => {
  const { topic, category, readingLevel, language, model } = req.body;
  if (!topic) { res.status(400).json({ error: "topic required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `Create patient education material about: ${topic}

Requirements:
- Reading level: ${readingLevel || "6th grade"} (use simple, clear language)
- Category: ${category || "general ENT"}
- Language: ${language || "English"}
- Include: what it is, why it matters, what to expect, when to seek help
- Use bullet points and short paragraphs
- Avoid medical jargon or explain it when used`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    const [row] = await db.insert(patientEducationTable).values({
      topic, category: category || "general",
      content: response, readingLevel: readingLevel || "6th grade",
      language: language || "english", model: useModel,
    }).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/annotations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(imageAnnotationsTable).orderBy(desc(imageAnnotationsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/annotations/analyze", requireAuth, async (req, res): Promise<void> => {
  const { imageUrl, imageType, model } = req.body;
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llava:13b";
  const prompt = `Analyze this ${imageType || "endoscopy"} image for ENT clinical findings.

Identify:
1. Anatomical structures visible
2. Normal vs abnormal findings
3. Potential pathology
4. Quality assessment
5. Suggested annotations/labels

${imageUrl ? `Image: ${imageUrl}` : "Describe a typical analysis for this image type."}

Respond in JSON: { "structures": ["..."], "annotations": [{"label": "...", "finding": "normal/abnormal", "description": "..."}], "pathologyFindings": "...", "quality": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }

    const [row] = await db.insert(imageAnnotationsTable).values({
      imageUrl, imageType: imageType || "endoscopy",
      annotations: JSON.stringify(parsed.annotations || []),
      structures: JSON.stringify(parsed.structures || []),
      pathologyFindings: parsed.pathologyFindings || response,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/protocols", async (_req, res): Promise<void> => {
  const rows = await db.select().from(clinicalProtocolsTable).orderBy(desc(clinicalProtocolsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/protocols/generate", requireAuth, async (req, res): Promise<void> => {
  const { condition, category, model } = req.body;
  if (!condition) { res.status(400).json({ error: "condition required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `Create a clinical protocol/pathway for the ENT condition: ${condition}
Category: ${category || "diagnostic"}

Include:
1. Protocol title and scope
2. Step-by-step clinical pathway
3. Decision points with criteria
4. Evidence level for each recommendation
5. Key references/guidelines

Respond in JSON: { "title": "...", "steps": [{"step": 1, "action": "...", "criteria": "...", "evidence": "..."}], "evidenceLevel": "...", "references": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { title: condition, steps: [], raw: response }; }

    const [row] = await db.insert(clinicalProtocolsTable).values({
      title: parsed.title || `Protocol: ${condition}`,
      condition, category: category || "diagnostic",
      steps: JSON.stringify(parsed.steps || []),
      evidenceLevel: parsed.evidenceLevel || null,
      references: JSON.stringify(parsed.references || []),
      model: useModel, status: "draft",
    }).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/surgical-planning", async (_req, res): Promise<void> => {
  const rows = await db.select().from(surgicalPlanningTable).orderBy(desc(surgicalPlanningTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/surgical-planning/generate", requireAuth, async (req, res): Promise<void> => {
  const { procedureName, diagnosis, patientAge, comorbidities, model } = req.body;
  if (!procedureName || !diagnosis) { res.status(400).json({ error: "procedureName and diagnosis required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `You are an expert ENT surgeon. Create a detailed pre-operative surgical plan.

Procedure: ${procedureName}
Diagnosis: ${diagnosis}
${patientAge ? `Patient Age: ${patientAge}` : ""}
${comorbidities ? `Comorbidities: ${comorbidities}` : ""}

Provide:
1. Pre-operative checklist (labs, imaging, consents)
2. Step-by-step surgical approach
3. Risk assessment with mitigation strategies
4. Post-operative care plan
5. Expected recovery timeline

Respond in JSON: { "preOpChecklist": ["..."], "surgicalSteps": [{"step": 1, "description": "...", "keyPoints": "..."}], "riskAssessment": {"level": "low/moderate/high", "risks": ["..."], "mitigation": ["..."]}, "postOpPlan": {"instructions": ["..."], "followUp": "...", "recovery": "..."} }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(surgicalPlanningTable).values({
      procedureName, diagnosis, patientAge, comorbidities,
      preOpChecklist: JSON.stringify(parsed.preOpChecklist || []),
      surgicalSteps: JSON.stringify(parsed.surgicalSteps || []),
      riskAssessment: JSON.stringify(parsed.riskAssessment || {}),
      postOpPlan: JSON.stringify(parsed.postOpPlan || {}),
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/treatment-outcomes", async (_req, res): Promise<void> => {
  const rows = await db.select().from(treatmentOutcomesTable).orderBy(desc(treatmentOutcomesTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/treatment-outcomes/analyze", requireAuth, async (req, res): Promise<void> => {
  const { condition, treatment, outcome, followUpWeeks, complications, model } = req.body;
  if (!condition || !treatment || !outcome) { res.status(400).json({ error: "condition, treatment, and outcome required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `Analyze this ENT treatment outcome:
Condition: ${condition}
Treatment: ${treatment}
Outcome: ${outcome}
${followUpWeeks ? `Follow-up period: ${followUpWeeks} weeks` : ""}
${complications ? `Complications: ${complications}` : ""}

Provide analysis of treatment effectiveness, comparison to expected outcomes, and recommendations for future similar cases.
Respond in JSON: { "effectiveness": "...", "comparedToLiterature": "...", "recommendations": ["..."], "satisfactionScore": 0.0-1.0 }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(treatmentOutcomesTable).values({
      condition, treatment, outcome, followUpWeeks, complications,
      patientSatisfaction: parsed.satisfactionScore || null,
      aiAnalysis: parsed.effectiveness || response,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/literature", async (_req, res): Promise<void> => {
  const rows = await db.select().from(literatureSearchTable).orderBy(desc(literatureSearchTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/literature/search", requireAuth, async (req, res): Promise<void> => {
  const { query, specialty, model } = req.body;
  if (!query) { res.status(400).json({ error: "query required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `You are a medical research assistant specializing in ${specialty || "otolaryngology"}.

Research query: ${query}

Provide a comprehensive literature review summary including:
1. Key findings from recent studies
2. Clinical relevance and evidence levels
3. Current guidelines and consensus
4. Areas of ongoing research
5. Practical clinical implications

Respond in JSON: { "results": [{"title": "...", "findings": "...", "evidenceLevel": "I-IV", "year": "..."}], "summary": "...", "clinicalRelevance": "...", "evidenceLevel": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(literatureSearchTable).values({
      query, specialty: specialty || "otolaryngology",
      results: JSON.stringify(parsed.results || []),
      summary: parsed.summary || response,
      clinicalRelevance: parsed.clinicalRelevance || null,
      evidenceLevel: parsed.evidenceLevel || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/symptom-timeline", async (_req, res): Promise<void> => {
  const rows = await db.select().from(symptomTimelineTable).orderBy(desc(symptomTimelineTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/symptom-timeline/analyze", requireAuth, async (req, res): Promise<void> => {
  const { symptoms, patientId, model } = req.body;
  if (!symptoms) { res.status(400).json({ error: "symptoms required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `Analyze this symptom progression timeline for an ENT patient:

Symptoms: ${symptoms}

Provide:
1. Symptom timeline reconstruction
2. Progression pattern analysis
3. Projected trajectory if untreated
4. Alert flags requiring immediate attention

Respond in JSON: { "timeline": [{"timepoint": "...", "symptoms": "...", "severity": 1-10}], "progression": "...", "projection": "...", "alerts": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(symptomTimelineTable).values({
      patientId, symptoms,
      timeline: JSON.stringify(parsed.timeline || []),
      progression: parsed.progression || response,
      aiProjection: parsed.projection || null,
      alerts: JSON.stringify(parsed.alerts || []),
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/referral-letters", async (_req, res): Promise<void> => {
  const rows = await db.select().from(referralLettersTable).orderBy(desc(referralLettersTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/referral-letters/generate", requireAuth, async (req, res): Promise<void> => {
  const { referTo, diagnosis, clinicalHistory, findings, urgency, model } = req.body;
  if (!referTo || !diagnosis) { res.status(400).json({ error: "referTo and diagnosis required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `Write a professional ENT referral letter.

Referring to: ${referTo}
Diagnosis: ${diagnosis}
Urgency: ${urgency || "routine"}
${clinicalHistory ? `Clinical History: ${clinicalHistory}` : ""}
${findings ? `Examination Findings: ${findings}` : ""}

Write a formal, professional referral letter with proper medical formatting, including reason for referral, clinical summary, and specific questions for the specialist.`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    const [row] = await db.insert(referralLettersTable).values({
      referTo, diagnosis, clinicalHistory, findings,
      urgency: urgency || "routine",
      letterContent: response, model: useModel,
    }).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/dosage", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dosageCalculatorTable).orderBy(desc(dosageCalculatorTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/dosage/calculate", requireAuth, async (req, res): Promise<void> => {
  const { medication, indication, patientWeight, patientAge, renalFunction, model } = req.body;
  if (!medication || !indication) { res.status(400).json({ error: "medication and indication required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `You are a clinical pharmacist specializing in ENT medications. Calculate appropriate dosing:

Medication: ${medication}
Indication: ${indication}
${patientWeight ? `Patient Weight: ${patientWeight} kg` : ""}
${patientAge ? `Patient Age: ${patientAge} years` : ""}
${renalFunction ? `Renal Function: ${renalFunction}` : ""}

Provide:
1. Recommended dose with frequency
2. Maximum daily dose
3. Duration of treatment
4. Key warnings and contraindications
5. Alternative medications

Respond in JSON: { "dose": "...", "frequency": "...", "maxDaily": "...", "duration": "...", "warnings": ["..."], "alternatives": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(dosageCalculatorTable).values({
      medication, indication, patientWeight, patientAge, renalFunction,
      calculatedDose: parsed.dose ? `${parsed.dose} ${parsed.frequency || ""}`.trim() : response,
      warnings: JSON.stringify(parsed.warnings || []),
      alternatives: JSON.stringify(parsed.alternatives || []),
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/clinical/voice-disorders", async (_req, res): Promise<void> => {
  const rows = await db.select().from(voiceDisorderTable).orderBy(desc(voiceDisorderTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/clinical/voice-disorders/analyze", requireAuth, async (req, res): Promise<void> => {
  const { symptoms, voiceQuality, onsetDuration, occupation, model } = req.body;
  if (!symptoms) { res.status(400).json({ error: "symptoms required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "meditron:7b";
  const prompt = `You are a laryngologist specializing in voice disorders. Analyze this presentation:

Symptoms: ${symptoms}
${voiceQuality ? `Voice Quality: ${voiceQuality}` : ""}
${onsetDuration ? `Onset/Duration: ${onsetDuration}` : ""}
${occupation ? `Occupation: ${occupation}` : ""}

Provide:
1. Likely diagnosis
2. Vocal hygiene recommendations
3. Treatment plan (behavioral, medical, surgical options)
4. Prognosis

Respond in JSON: { "diagnosis": "...", "vocalHygiene": ["..."], "treatmentPlan": {"behavioral": ["..."], "medical": ["..."], "surgical": "..."}, "prognosis": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(voiceDisorderTable).values({
      symptoms, voiceQuality, onsetDuration, occupation,
      diagnosis: parsed.diagnosis || null,
      vocalHygiene: JSON.stringify(parsed.vocalHygiene || []),
      treatmentPlan: JSON.stringify(parsed.treatmentPlan || {}),
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
