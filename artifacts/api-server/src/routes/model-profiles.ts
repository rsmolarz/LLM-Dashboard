import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, modelProfilesTable, llmConfigTable } from "@workspace/db";
import {
  ListModelProfilesResponse,
  CreateModelProfileBody,
  UpdateModelProfileParams,
  UpdateModelProfileBody,
  DeleteModelProfileParams,
  DeployModelProfileParams,
  DeployModelProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/model-profiles", async (_req, res): Promise<void> => {
  const profiles = await db
    .select()
    .from(modelProfilesTable)
    .orderBy(asc(modelProfilesTable.createdAt));
  res.json(ListModelProfilesResponse.parse(profiles));
});

router.post("/model-profiles", async (req, res): Promise<void> => {
  const parsed = CreateModelProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .insert(modelProfilesTable)
    .values({
      name: parsed.data.name,
      baseModel: parsed.data.baseModel,
      systemPrompt: parsed.data.systemPrompt ?? "",
      temperature: parsed.data.temperature ?? 0.7,
      topP: parsed.data.topP ?? 0.9,
      topK: parsed.data.topK ?? 40,
      contextLength: parsed.data.contextLength ?? 4096,
      repeatPenalty: parsed.data.repeatPenalty ?? 1.1,
    })
    .returning();

  res.status(201).json(profile);
});

router.put("/model-profiles/:id", async (req, res): Promise<void> => {
  const params = UpdateModelProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateModelProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(modelProfilesTable)
    .set({
      name: parsed.data.name,
      baseModel: parsed.data.baseModel,
      systemPrompt: parsed.data.systemPrompt ?? "",
      temperature: parsed.data.temperature ?? 0.7,
      topP: parsed.data.topP ?? 0.9,
      topK: parsed.data.topK ?? 40,
      contextLength: parsed.data.contextLength ?? 4096,
      repeatPenalty: parsed.data.repeatPenalty ?? 1.1,
    })
    .where(eq(modelProfilesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(updated);
});

router.delete("/model-profiles/:id", async (req, res): Promise<void> => {
  const params = DeleteModelProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(modelProfilesTable)
    .where(eq(modelProfilesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.sendStatus(204);
});

async function getServerUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  if (!config) return null;
  return config.serverUrl;
}

router.post("/model-profiles/:id/deploy", async (req, res): Promise<void> => {
  const params = DeployModelProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db
    .select()
    .from(modelProfilesTable)
    .where(eq(modelProfilesTable.id, params.data.id));

  if (!profile) {
    res.status(404).json(
      DeployModelProfileResponse.parse({
        success: false,
        message: "Profile not found",
      })
    );
    return;
  }

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.status(503).json(
      DeployModelProfileResponse.parse({
        success: false,
        message: "Ollama server not configured",
      })
    );
    return;
  }

  const modelfile = [
    `FROM ${profile.baseModel}`,
    `SYSTEM """${profile.systemPrompt}"""`,
    `PARAMETER temperature ${profile.temperature}`,
    `PARAMETER top_p ${profile.topP}`,
    `PARAMETER top_k ${profile.topK}`,
    `PARAMETER num_ctx ${profile.contextLength}`,
    `PARAMETER repeat_penalty ${profile.repeatPenalty}`,
  ].join("\n");

  try {
    const createRes = await fetch(`${serverUrl}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.name.toLowerCase().replace(/\s+/g, "-"),
        modelfile,
        stream: false,
      }),
      signal: AbortSignal.timeout(300000),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      res.json(
        DeployModelProfileResponse.parse({
          success: false,
          message: `Deploy failed: ${text}`,
        })
      );
      return;
    }

    await db
      .update(modelProfilesTable)
      .set({ deployed: "true" })
      .where(eq(modelProfilesTable.id, params.data.id));

    res.json(
      DeployModelProfileResponse.parse({
        success: true,
        message: `Profile "${profile.name}" deployed to Ollama as "${profile.name.toLowerCase().replace(/\s+/g, "-")}"`,
      })
    );
  } catch (err) {
    res.json(
      DeployModelProfileResponse.parse({
        success: false,
        message: err instanceof Error ? err.message : "Deploy failed",
      })
    );
  }
});

export default router;
