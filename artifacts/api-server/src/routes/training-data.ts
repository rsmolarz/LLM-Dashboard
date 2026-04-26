import { Router, type IRouter } from "express";
import { eq, asc, gte, sql } from "drizzle-orm";
import { db, trainingDataTable, chatMessagesTable, conversationsTable } from "@workspace/db";
import {
  ListTrainingDataResponse,
  AddTrainingDataBody,
  DeleteTrainingDataParams,
  ExportTrainingDataBody,
  CollectFromConversationBody,
  CollectFromConversationResponse,
  GetTrainingStatsResponse,
} from "@workspace/api-zod";
import { rateLimiter } from "../middlewares/rateLimiter";

const router: IRouter = Router();

router.use("/training", rateLimiter(60, 60000));

router.get("/training/data", async (_req, res): Promise<void> => {
  const data = await db
    .select()
    .from(trainingDataTable)
    .orderBy(asc(trainingDataTable.createdAt));
  res.json(ListTrainingDataResponse.parse(data));
});

router.post("/training/data", async (req, res): Promise<void> => {
  const parsed = AddTrainingDataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [entry] = await db
    .insert(trainingDataTable)
    .values({
      inputText: parsed.data.inputText,
      outputText: parsed.data.outputText,
      systemPrompt: parsed.data.systemPrompt ?? "",
      category: parsed.data.category ?? "general",
      quality: parsed.data.quality ?? 3,
      source: "manual",
    })
    .returning();

  res.status(201).json(entry);
});

router.delete("/training/data/:id", async (req, res): Promise<void> => {
  const params = DeleteTrainingDataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(trainingDataTable)
    .where(eq(trainingDataTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/training/data/export", async (req, res): Promise<void> => {
  const parsed = ExportTrainingDataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let query = db.select().from(trainingDataTable);

  const conditions: any[] = [];
  if (parsed.data.minQuality) {
    conditions.push(gte(trainingDataTable.quality, parsed.data.minQuality));
  }
  if (parsed.data.category) {
    conditions.push(eq(trainingDataTable.category, parsed.data.category));
  }

  const data = conditions.length > 0
    ? await query.where(sql`${conditions.map((c, i) => i === 0 ? c : sql` AND ${c}`).reduce((a, b) => sql`${a}${b}`)}`)
    : await query;

  let output: string;

  if (parsed.data.format === "alpaca") {
    output = data
      .map((d) =>
        JSON.stringify({
          instruction: d.inputText,
          input: "",
          output: d.outputText,
          system: d.systemPrompt || undefined,
        })
      )
      .join("\n");
  } else if (parsed.data.format === "sharegpt") {
    output = data
      .map((d) =>
        JSON.stringify({
          conversations: [
            ...(d.systemPrompt ? [{ from: "system", value: d.systemPrompt }] : []),
            { from: "human", value: d.inputText },
            { from: "gpt", value: d.outputText },
          ],
        })
      )
      .join("\n");
  } else {
    output = data
      .map((d) =>
        JSON.stringify({
          messages: [
            ...(d.systemPrompt ? [{ role: "system", content: d.systemPrompt }] : []),
            { role: "user", content: d.inputText },
            { role: "assistant", content: d.outputText },
          ],
        })
      )
      .join("\n");
  }

  res.setHeader("Content-Type", "application/jsonl");
  res.setHeader("Content-Disposition", `attachment; filename=training-data-${parsed.data.format}.jsonl`);
  res.send(output);
});

router.post("/training/data/collect", async (req, res): Promise<void> => {
  const parsed = CollectFromConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.conversationId, parsed.data.conversationId))
    .orderBy(asc(chatMessagesTable.createdAt));

  const minRating = parsed.data.minRating ?? 0;
  let collected = 0;

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];

    if (msg.role === "user" && next.role === "assistant") {
      if (minRating > 0 && (next.rating === null || next.rating < minRating)) {
        i++;
        continue;
      }

      await db.insert(trainingDataTable).values({
        inputText: msg.content,
        outputText: next.content,
        systemPrompt: "",
        category: "conversation",
        quality: next.rating ?? 3,
        source: "conversation",
      });

      collected++;
      i++;
    }
  }

  res.json(
    CollectFromConversationResponse.parse({
      collected,
      message: `Collected ${collected} training pairs from conversation`,
    })
  );
});

router.get("/training/stats", async (_req, res): Promise<void> => {
  const data = await db.select().from(trainingDataTable);

  const byCategory: Record<string, number> = {};
  const byQuality: Record<string, number> = {};
  let totalQuality = 0;

  for (const d of data) {
    byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
    const q = String(d.quality);
    byQuality[q] = (byQuality[q] ?? 0) + 1;
    totalQuality += d.quality;
  }

  res.json(
    GetTrainingStatsResponse.parse({
      totalEntries: data.length,
      byCategory,
      byQuality,
      avgQuality: data.length > 0 ? totalQuality / data.length : 0,
    })
  );
});

export default router;
