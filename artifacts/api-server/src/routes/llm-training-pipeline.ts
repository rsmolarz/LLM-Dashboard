import { Router, type IRouter } from "express";
import { eq, sql, desc, asc, and, isNotNull } from "drizzle-orm";
import {
  db,
  trainingDataTable,
  fineTuningJobsTable,
  rlhfPairsTable,
  fewShotLibrariesTable,
  fewShotExamplesTable,
  evalBenchmarksTable,
  evalQuestionsTable,
  evalRunsTable,
  evalResultsTable,
  distillationJobsTable,
  chatMessagesTable,
  llmConfigTable,
} from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  next();
}

async function getServerUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  return config?.serverUrl || null;
}

async function callOllama(serverUrl: string, model: string, prompt: string, system?: string): Promise<{ content: string; duration: number }> {
  const messages: Array<{ role: string; content: string }> = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const start = Date.now();
  const res = await fetch(`${serverUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.3 } }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return { content: data.message?.content || "", duration: Date.now() - start };
}

router.get("/training-pipeline/overview", async (_req, res): Promise<void> => {
  const [trainingCount] = await db.select({ count: sql<number>`count(*)` }).from(trainingDataTable);
  const [ftJobCount] = await db.select({ count: sql<number>`count(*)` }).from(fineTuningJobsTable);
  const [rlhfCount] = await db.select({ count: sql<number>`count(*)` }).from(rlhfPairsTable);
  const [libraryCount] = await db.select({ count: sql<number>`count(*)` }).from(fewShotLibrariesTable);
  const [benchmarkCount] = await db.select({ count: sql<number>`count(*)` }).from(evalBenchmarksTable);
  const [distillCount] = await db.select({ count: sql<number>`count(*)` }).from(distillationJobsTable);

  res.json({
    trainingPairs: Number(trainingCount?.count ?? 0),
    fineTuningJobs: Number(ftJobCount?.count ?? 0),
    rlhfPairs: Number(rlhfCount?.count ?? 0),
    fewShotLibraries: Number(libraryCount?.count ?? 0),
    benchmarks: Number(benchmarkCount?.count ?? 0),
    distillationJobs: Number(distillCount?.count ?? 0),
  });
});


router.get("/training-pipeline/fine-tuning/jobs", async (_req, res): Promise<void> => {
  const jobs = await db.select().from(fineTuningJobsTable).orderBy(desc(fineTuningJobsTable.createdAt));
  res.json(jobs);
});

router.post("/training-pipeline/fine-tuning/create", requireAuth, async (req, res): Promise<void> => {
  const { name, baseModel, outputModel, systemPrompt, datasetFilter } = req.body as {
    name: string; baseModel: string; outputModel: string; systemPrompt?: string; datasetFilter?: string;
  };

  if (!name || !baseModel || !outputModel) {
    res.status(400).json({ error: "name, baseModel, and outputModel are required" });
    return;
  }

  const filter = datasetFilter || "";
  const conditions = filter
    ? [eq(trainingDataTable.category, filter)]
    : [];

  const samples = conditions.length > 0
    ? await db.select().from(trainingDataTable).where(conditions[0]!)
    : await db.select().from(trainingDataTable);

  const conversationBlocks = samples.map((s) => {
    const msgs = [];
    if (s.systemPrompt) msgs.push(`<|system|>\n${s.systemPrompt}`);
    msgs.push(`<|user|>\n${s.inputText}`);
    msgs.push(`<|assistant|>\n${s.outputText}`);
    return msgs.join("\n");
  }).join("\n\n---\n\n");

  const modelfile = [
    `FROM ${baseModel}`,
    systemPrompt ? `SYSTEM """${systemPrompt}"""` : "",
    `PARAMETER temperature 0.4`,
    `PARAMETER top_p 0.9`,
    `PARAMETER stop "<|user|>"`,
    `PARAMETER stop "<|assistant|>"`,
    conversationBlocks ? `MESSAGE user """Below are training examples for this model:\n\n${conversationBlocks.slice(0, 50000)}"""` : "",
    conversationBlocks ? `MESSAGE assistant """I have studied these ${samples.length} training examples and will respond following the patterns and knowledge demonstrated."""` : "",
  ].filter(Boolean).join("\n\n");

  const [job] = await db.insert(fineTuningJobsTable).values({
    name,
    baseModel,
    outputModel,
    systemPrompt: systemPrompt || "",
    datasetFilter: filter,
    samplesCount: samples.length,
    modelfileContent: modelfile,
    status: "pending",
  }).returning();

  res.status(201).json(job);
});

router.post("/training-pipeline/fine-tuning/:id/run", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [job] = await db.select().from(fineTuningJobsTable).where(eq(fineTuningJobsTable.id, id));

  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }

  await db.update(fineTuningJobsTable).set({ status: "running" }).where(eq(fineTuningJobsTable.id, id));

  try {
    const createRes = await fetch(`${serverUrl}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: job.outputModel, modelfile: job.modelfileContent, stream: false }),
      signal: AbortSignal.timeout(300000),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      await db.update(fineTuningJobsTable).set({ status: "failed", errorMessage: errText }).where(eq(fineTuningJobsTable.id, id));
      res.status(502).json({ error: errText });
      return;
    }

    await db.update(fineTuningJobsTable).set({ status: "completed", completedAt: new Date() }).where(eq(fineTuningJobsTable.id, id));
    res.json({ success: true, model: job.outputModel, message: `Model ${job.outputModel} created on Ollama server` });
  } catch (err: any) {
    await db.update(fineTuningJobsTable).set({ status: "failed", errorMessage: err.message }).where(eq(fineTuningJobsTable.id, id));
    res.status(500).json({ error: err.message });
  }
});

router.delete("/training-pipeline/fine-tuning/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(fineTuningJobsTable).where(eq(fineTuningJobsTable.id, id));
  res.sendStatus(204);
});


router.get("/training-pipeline/rlhf/pairs", async (_req, res): Promise<void> => {
  const pairs = await db.select().from(rlhfPairsTable).orderBy(desc(rlhfPairsTable.createdAt)).limit(200);
  res.json(pairs);
});

router.post("/training-pipeline/rlhf/collect-from-ratings", requireAuth, async (_req, res): Promise<void> => {
  const ratedMessages = await db
    .select()
    .from(chatMessagesTable)
    .where(isNotNull(chatMessagesTable.rating))
    .orderBy(asc(chatMessagesTable.createdAt));

  if (ratedMessages.length === 0) {
    res.json({ collected: 0, message: "No rated messages found" });
    return;
  }

  const byConversation: Record<number, typeof ratedMessages> = {};
  for (const msg of ratedMessages) {
    if (!byConversation[msg.conversationId]) byConversation[msg.conversationId] = [];
    byConversation[msg.conversationId].push(msg);
  }

  let collected = 0;
  const allConvMessages: Record<number, Array<{ role: string; content: string; rating: number | null; id: number }>> = {};

  for (const convId of Object.keys(byConversation)) {
    const cid = parseInt(convId);
    if (!allConvMessages[cid]) {
      const msgs = await db.select().from(chatMessagesTable)
        .where(eq(chatMessagesTable.conversationId, cid))
        .orderBy(asc(chatMessagesTable.createdAt));
      allConvMessages[cid] = msgs;
    }
  }

  for (const convId of Object.keys(byConversation)) {
    const cid = parseInt(convId);
    const convMsgs = allConvMessages[cid] || [];

    for (const ratedMsg of byConversation[cid]) {
      if (ratedMsg.role !== "assistant" || ratedMsg.rating === null) continue;

      const msgIdx = convMsgs.findIndex((m) => m.id === ratedMsg.id);
      if (msgIdx <= 0) continue;

      const prevMsg = convMsgs[msgIdx - 1];
      if (prevMsg.role !== "user") continue;

      if (ratedMsg.rating >= 4) {
        const [existing] = await db.select().from(rlhfPairsTable)
          .where(and(
            eq(rlhfPairsTable.prompt, prevMsg.content),
            eq(rlhfPairsTable.chosenResponse, ratedMsg.content)
          ));
        if (existing) continue;

        await db.insert(rlhfPairsTable).values({
          prompt: prevMsg.content,
          chosenResponse: ratedMsg.content,
          rejectedResponse: "[placeholder - needs contrasting response]",
          source: "chat_ratings_positive",
          category: "general",
        });
        collected++;
      } else if (ratedMsg.rating <= 2) {
        const [existing] = await db.select().from(rlhfPairsTable)
          .where(and(
            eq(rlhfPairsTable.prompt, prevMsg.content),
            eq(rlhfPairsTable.rejectedResponse, ratedMsg.content)
          ));
        if (existing) continue;

        await db.insert(rlhfPairsTable).values({
          prompt: prevMsg.content,
          chosenResponse: "[placeholder - needs preferred response]",
          rejectedResponse: ratedMsg.content,
          source: "chat_ratings_negative",
          category: "general",
        });
        collected++;
      }
    }
  }

  res.json({ collected, message: `Collected ${collected} RLHF pairs from rated messages` });
});

router.post("/training-pipeline/rlhf/generate-contrasts", requireAuth, async (_req, res): Promise<void> => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }

  const incompletePairs = await db.select().from(rlhfPairsTable)
    .where(sql`${rlhfPairsTable.chosenResponse} LIKE '%[placeholder%' OR ${rlhfPairsTable.rejectedResponse} LIKE '%[placeholder%'`)
    .limit(20);

  let filled = 0;
  for (const pair of incompletePairs) {
    try {
      if (pair.chosenResponse.includes("[placeholder")) {
        const { content } = await callOllama(serverUrl, "llama3.2:latest", 
          `Provide an excellent, thorough response to this question:\n\n${pair.prompt}`,
          "You are a helpful expert assistant. Give detailed, accurate answers."
        );
        if (content) {
          await db.update(rlhfPairsTable).set({ chosenResponse: content }).where(eq(rlhfPairsTable.id, pair.id));
          filled++;
        }
      } else if (pair.rejectedResponse.includes("[placeholder")) {
        const { content } = await callOllama(serverUrl, "llama3.2:latest",
          `Provide a brief, somewhat vague response to this question:\n\n${pair.prompt}`,
          "Give a short, imprecise response that could be improved."
        );
        if (content) {
          await db.update(rlhfPairsTable).set({ rejectedResponse: content }).where(eq(rlhfPairsTable.id, pair.id));
          filled++;
        }
      }
    } catch {
      continue;
    }
  }

  res.json({ filled, total: incompletePairs.length });
});

router.post("/training-pipeline/rlhf/export-dpo", requireAuth, async (_req, res): Promise<void> => {
  const pairs = await db.select().from(rlhfPairsTable)
    .where(sql`${rlhfPairsTable.chosenResponse} NOT LIKE '%[placeholder%' AND ${rlhfPairsTable.rejectedResponse} NOT LIKE '%[placeholder%'`);

  const dpoData = pairs.map((p) => ({
    prompt: p.prompt,
    chosen: p.chosenResponse,
    rejected: p.rejectedResponse,
  }));

  res.json({ count: dpoData.length, data: dpoData });
});

router.delete("/training-pipeline/rlhf/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(rlhfPairsTable).where(eq(rlhfPairsTable.id, id));
  res.sendStatus(204);
});


router.get("/training-pipeline/distillation/jobs", async (_req, res): Promise<void> => {
  const jobs = await db.select().from(distillationJobsTable).orderBy(desc(distillationJobsTable.createdAt));
  res.json(jobs);
});

router.post("/training-pipeline/distillation/create", requireAuth, async (req, res): Promise<void> => {
  const { name, teacherModel, studentModel, category, prompts } = req.body as {
    name: string; teacherModel: string; studentModel: string; category?: string;
    prompts: string[];
  };

  if (!name || !teacherModel || !studentModel || !prompts?.length) {
    res.status(400).json({ error: "name, teacherModel, studentModel, and prompts[] are required" });
    return;
  }

  const [job] = await db.insert(distillationJobsTable).values({
    name,
    teacherModel,
    studentModel,
    category: category || "general",
    prompts: JSON.stringify(prompts),
    promptsCount: prompts.length,
    status: "pending",
  }).returning();

  res.status(201).json(job);
});

router.post("/training-pipeline/distillation/:id/run", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [job] = await db.select().from(distillationJobsTable).where(eq(distillationJobsTable.id, id));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }

  let prompts: string[] = [];
  try { prompts = JSON.parse(job.prompts); } catch { prompts = []; }
  if (!prompts.length) { res.status(400).json({ error: "Job has no prompts stored" }); return; }

  await db.update(distillationJobsTable).set({ status: "running" }).where(eq(distillationJobsTable.id, id));

  let completed = 0;
  let pairsGenerated = 0;

  for (const prompt of prompts) {
    try {
      const { content: teacherAnswer } = await callOllama(serverUrl, job.teacherModel, prompt,
        "You are an expert. Provide a thorough, detailed, and accurate response."
      );

      if (teacherAnswer && teacherAnswer.length > 20) {
        await db.insert(trainingDataTable).values({
          inputText: prompt,
          outputText: teacherAnswer,
          systemPrompt: `Distilled from ${job.teacherModel} for ${job.studentModel}`,
          category: job.category,
          quality: 4,
          source: `distillation-${job.name}`,
        });
        pairsGenerated++;
      }

      completed++;
      await db.update(distillationJobsTable).set({ completedCount: completed, pairsGenerated }).where(eq(distillationJobsTable.id, id));
    } catch {
      completed++;
      await db.update(distillationJobsTable).set({ completedCount: completed }).where(eq(distillationJobsTable.id, id));
    }
  }

  await db.update(distillationJobsTable).set({
    status: "completed",
    completedCount: completed,
    pairsGenerated,
    completedAt: new Date(),
  }).where(eq(distillationJobsTable.id, id));

  res.json({ success: true, completed, pairsGenerated });
});

router.delete("/training-pipeline/distillation/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(distillationJobsTable).where(eq(distillationJobsTable.id, id));
  res.sendStatus(204);
});


router.get("/training-pipeline/few-shot/libraries", async (_req, res): Promise<void> => {
  const libraries = await db.select().from(fewShotLibrariesTable).orderBy(desc(fewShotLibrariesTable.createdAt));

  const result = [];
  for (const lib of libraries) {
    const [count] = await db.select({ count: sql<number>`count(*)` }).from(fewShotExamplesTable)
      .where(eq(fewShotExamplesTable.libraryId, lib.id));
    result.push({ ...lib, examplesCount: Number(count?.count ?? 0) });
  }

  res.json(result);
});

router.post("/training-pipeline/few-shot/libraries", requireAuth, async (req, res): Promise<void> => {
  const { name, description, category } = req.body as { name: string; description?: string; category?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const [lib] = await db.insert(fewShotLibrariesTable).values({
    name,
    description: description || "",
    category: category || "general",
  }).returning();

  res.status(201).json(lib);
});

router.delete("/training-pipeline/few-shot/libraries/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(fewShotLibrariesTable).where(eq(fewShotLibrariesTable.id, id));
  res.sendStatus(204);
});

router.get("/training-pipeline/few-shot/libraries/:id/examples", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const examples = await db.select().from(fewShotExamplesTable)
    .where(eq(fewShotExamplesTable.libraryId, id))
    .orderBy(desc(fewShotExamplesTable.priority));
  res.json(examples);
});

router.post("/training-pipeline/few-shot/libraries/:id/examples", requireAuth, async (req, res): Promise<void> => {
  const libraryId = parseInt(req.params.id);
  const { userMessage, assistantResponse, keywords, priority } = req.body as {
    userMessage: string; assistantResponse: string; keywords?: string; priority?: number;
  };

  if (!userMessage || !assistantResponse) {
    res.status(400).json({ error: "userMessage and assistantResponse are required" });
    return;
  }

  const [example] = await db.insert(fewShotExamplesTable).values({
    libraryId,
    userMessage,
    assistantResponse,
    keywords: keywords || "",
    priority: priority || 5,
  }).returning();

  res.status(201).json(example);
});

router.delete("/training-pipeline/few-shot/examples/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(fewShotExamplesTable).where(eq(fewShotExamplesTable.id, id));
  res.sendStatus(204);
});

router.post("/training-pipeline/few-shot/match", async (req, res): Promise<void> => {
  const { query, maxExamples } = req.body as { query: string; maxExamples?: number };
  if (!query) { res.status(400).json({ error: "query is required" }); return; }

  const limit = maxExamples || 3;
  const activeLibraries = await db.select().from(fewShotLibrariesTable)
    .where(eq(fewShotLibrariesTable.isActive, true));

  if (activeLibraries.length === 0) { res.json({ examples: [] }); return; }

  const allExamples = [];
  for (const lib of activeLibraries) {
    const examples = await db.select().from(fewShotExamplesTable)
      .where(eq(fewShotExamplesTable.libraryId, lib.id));
    allExamples.push(...examples.map((e) => ({ ...e, libraryName: lib.name })));
  }

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  const scored = allExamples.map((ex) => {
    const keywordList = ex.keywords.toLowerCase().split(",").map((k) => k.trim()).filter(Boolean);
    let score = 0;
    for (const kw of keywordList) {
      if (queryLower.includes(kw)) score += 3;
    }
    const msgLower = ex.userMessage.toLowerCase();
    for (const w of queryWords) {
      if (msgLower.includes(w)) score += 1;
    }
    score += ex.priority / 10;
    return { ...ex, score };
  });

  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

  res.json({ examples: matched });
});


router.get("/training-pipeline/eval/benchmarks", async (_req, res): Promise<void> => {
  const benchmarks = await db.select().from(evalBenchmarksTable).orderBy(desc(evalBenchmarksTable.createdAt));

  const result = [];
  for (const bm of benchmarks) {
    const [qCount] = await db.select({ count: sql<number>`count(*)` }).from(evalQuestionsTable)
      .where(eq(evalQuestionsTable.benchmarkId, bm.id));
    const runs = await db.select().from(evalRunsTable)
      .where(eq(evalRunsTable.benchmarkId, bm.id))
      .orderBy(desc(evalRunsTable.createdAt))
      .limit(5);
    result.push({ ...bm, questionsCount: Number(qCount?.count ?? 0), recentRuns: runs });
  }

  res.json(result);
});

router.post("/training-pipeline/eval/benchmarks", requireAuth, async (req, res): Promise<void> => {
  const { name, description, category } = req.body as { name: string; description?: string; category?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const [bm] = await db.insert(evalBenchmarksTable).values({
    name,
    description: description || "",
    category: category || "general",
  }).returning();

  res.status(201).json(bm);
});

router.delete("/training-pipeline/eval/benchmarks/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(evalBenchmarksTable).where(eq(evalBenchmarksTable.id, id));
  res.sendStatus(204);
});

router.get("/training-pipeline/eval/benchmarks/:id/questions", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const questions = await db.select().from(evalQuestionsTable)
    .where(eq(evalQuestionsTable.benchmarkId, id))
    .orderBy(asc(evalQuestionsTable.id));
  res.json(questions);
});

router.post("/training-pipeline/eval/benchmarks/:id/questions", requireAuth, async (req, res): Promise<void> => {
  const benchmarkId = parseInt(req.params.id);
  const { questions } = req.body as { questions: Array<{ question: string; expectedAnswer: string; category?: string; difficulty?: string }> };

  if (!questions?.length) { res.status(400).json({ error: "questions[] is required" }); return; }

  const inserted = [];
  for (const q of questions) {
    const [row] = await db.insert(evalQuestionsTable).values({
      benchmarkId,
      question: q.question,
      expectedAnswer: q.expectedAnswer,
      category: q.category || "general",
      difficulty: q.difficulty || "medium",
    }).returning();
    inserted.push(row);
  }

  await db.update(evalBenchmarksTable).set({ questionsCount: sql`(SELECT count(*) FROM eval_questions WHERE benchmark_id = ${benchmarkId})` })
    .where(eq(evalBenchmarksTable.id, benchmarkId));

  res.status(201).json(inserted);
});

router.post("/training-pipeline/eval/benchmarks/:id/generate-questions", requireAuth, async (req, res): Promise<void> => {
  const benchmarkId = parseInt(req.params.id);
  const { topic, count, difficulty } = req.body as { topic: string; count?: number; difficulty?: string };

  const [bm] = await db.select().from(evalBenchmarksTable).where(eq(evalBenchmarksTable.id, benchmarkId));
  if (!bm) { res.status(404).json({ error: "Benchmark not found" }); return; }

  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }

  const numQuestions = count || 10;
  const diff = difficulty || "medium";

  const { content } = await callOllama(serverUrl, "llama3.2:latest",
    `Generate exactly ${numQuestions} ${diff}-difficulty test questions about "${topic}" in the category "${bm.category}".

For each question, provide:
1. The question
2. The expected correct answer

Format your response as a JSON array:
[{"question": "...", "expectedAnswer": "...", "difficulty": "${diff}"}]

Only output the JSON array, nothing else.`,
    "You are an expert test question generator. Create clear, specific questions with definitive correct answers."
  );

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found");

    const questions = JSON.parse(jsonMatch[0]) as Array<{ question: string; expectedAnswer: string; difficulty?: string }>;
    const inserted = [];

    for (const q of questions) {
      const [row] = await db.insert(evalQuestionsTable).values({
        benchmarkId,
        question: q.question,
        expectedAnswer: q.expectedAnswer,
        category: bm.category,
        difficulty: q.difficulty || diff,
      }).returning();
      inserted.push(row);
    }

    await db.update(evalBenchmarksTable).set({ questionsCount: sql`(SELECT count(*) FROM eval_questions WHERE benchmark_id = ${benchmarkId})` })
      .where(eq(evalBenchmarksTable.id, benchmarkId));

    res.json({ generated: inserted.length, questions: inserted });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to parse generated questions: ${err.message}`, raw: content });
  }
});

router.post("/training-pipeline/eval/benchmarks/:id/run", requireAuth, async (req, res): Promise<void> => {
  const benchmarkId = parseInt(req.params.id);
  const { model } = req.body as { model: string };

  if (!model) { res.status(400).json({ error: "model is required" }); return; }

  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }

  const questions = await db.select().from(evalQuestionsTable)
    .where(eq(evalQuestionsTable.benchmarkId, benchmarkId));

  if (questions.length === 0) { res.status(400).json({ error: "Benchmark has no questions" }); return; }

  const [run] = await db.insert(evalRunsTable).values({
    benchmarkId,
    model,
    status: "running",
    totalQuestions: questions.length,
  }).returning();

  let totalScore = 0;
  let totalLatency = 0;
  let completed = 0;

  for (const q of questions) {
    try {
      const start = Date.now();
      const { content: answer } = await callOllama(serverUrl, model, q.question,
        "Answer the question directly and concisely."
      );
      const latency = Date.now() - start;

      const { content: scoreRaw } = await callOllama(serverUrl, "llama3.2:latest",
        `Compare the model's answer to the expected answer and rate accuracy from 0.0 to 1.0.

Question: ${q.question}
Expected Answer: ${q.expectedAnswer}
Model's Answer: ${answer}

Respond with ONLY a number between 0.0 and 1.0, nothing else.`,
        "You are a strict grading assistant. Output only a decimal number."
      );

      const score = Math.min(1, Math.max(0, parseFloat(scoreRaw.trim()) || 0));

      await db.insert(evalResultsTable).values({
        runId: run.id,
        questionId: q.id,
        modelAnswer: answer,
        score,
        latencyMs: latency,
      });

      totalScore += score;
      totalLatency += latency;
      completed++;

      await db.update(evalRunsTable).set({ completedQuestions: completed }).where(eq(evalRunsTable.id, run.id));
    } catch {
      completed++;
      await db.update(evalRunsTable).set({ completedQuestions: completed }).where(eq(evalRunsTable.id, run.id));
    }
  }

  const avgScore = completed > 0 ? totalScore / completed : 0;
  const avgLatency = completed > 0 ? totalLatency / completed : 0;

  await db.update(evalRunsTable).set({
    status: "completed",
    completedQuestions: completed,
    avgScore,
    avgLatencyMs: avgLatency,
    completedAt: new Date(),
  }).where(eq(evalRunsTable.id, run.id));

  res.json({
    runId: run.id,
    model,
    avgScore: Math.round(avgScore * 100) / 100,
    avgLatencyMs: Math.round(avgLatency),
    completedQuestions: completed,
    totalQuestions: questions.length,
  });
});

router.get("/training-pipeline/eval/runs/:id/results", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [run] = await db.select().from(evalRunsTable).where(eq(evalRunsTable.id, id));
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }

  const results = await db.select({
    id: evalResultsTable.id,
    questionId: evalResultsTable.questionId,
    question: evalQuestionsTable.question,
    expectedAnswer: evalQuestionsTable.expectedAnswer,
    modelAnswer: evalResultsTable.modelAnswer,
    score: evalResultsTable.score,
    latencyMs: evalResultsTable.latencyMs,
  }).from(evalResultsTable)
    .innerJoin(evalQuestionsTable, eq(evalResultsTable.questionId, evalQuestionsTable.id))
    .where(eq(evalResultsTable.runId, id))
    .orderBy(asc(evalResultsTable.id));

  res.json({ run, results });
});

router.get("/training-pipeline/eval/leaderboard", async (_req, res): Promise<void> => {
  const runs = await db.select().from(evalRunsTable)
    .where(eq(evalRunsTable.status, "completed"))
    .orderBy(desc(evalRunsTable.avgScore));

  const byModel: Record<string, { model: string; runs: number; avgScore: number; avgLatency: number; bestScore: number }> = {};

  for (const run of runs) {
    if (!byModel[run.model]) {
      byModel[run.model] = { model: run.model, runs: 0, avgScore: 0, avgLatency: 0, bestScore: 0 };
    }
    const entry = byModel[run.model];
    entry.runs++;
    entry.avgScore = (entry.avgScore * (entry.runs - 1) + (run.avgScore || 0)) / entry.runs;
    entry.avgLatency = (entry.avgLatency * (entry.runs - 1) + (run.avgLatencyMs || 0)) / entry.runs;
    if ((run.avgScore || 0) > entry.bestScore) entry.bestScore = run.avgScore || 0;
  }

  const leaderboard = Object.values(byModel).sort((a, b) => b.avgScore - a.avgScore);
  res.json(leaderboard);
});

export default router;
