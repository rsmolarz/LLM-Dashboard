import { Router, type IRouter } from "express";
import { eq, sql, desc, and } from "drizzle-orm";
import { db, openclawConfigTable, agentsTable, agentLogsTable, agentMemoriesTable, agentTasksTable } from "@workspace/db";
import {
  GetOpenclawConfigResponse,
  UpdateOpenclawConfigBody,
  UpdateOpenclawConfigResponse,
  GetGatewayStatusResponse,
  ListAgentsResponse,
  CreateAgentBody,
  GetAgentParams,
  GetAgentResponse,
  UpdateAgentParams,
  UpdateAgentBody,
  UpdateAgentResponse,
  DeleteAgentParams,
  ChatWithAgentParams,
  ChatWithAgentBody,
  ChatWithAgentResponse,
  GetAgentLogsParams,
  GetAgentLogsQueryParams,
  GetAgentLogsResponse,
  GetOpenclawStatsResponse,
  AddAgentMemoryParams,
  AddAgentMemoryBody,
  DeleteAgentMemoryParams,
  ExtractMemoriesFromChatParams,
  ExtractMemoriesFromChatBody,
  CreateAgentTaskBody,
  UpdateAgentTaskParams,
  UpdateAgentTaskBody,
  CompleteAgentTaskParams,
  CompleteAgentTaskBody,
  RouteTaskBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getOpenclawConfig() {
  const [config] = await db.select().from(openclawConfigTable).limit(1);
  return config;
}

async function logAgentActivity(agentId: string, level: string, message: string, metadata: Record<string, unknown> = {}) {
  await db.insert(agentLogsTable).values({
    agentId,
    level,
    message,
    metadata: JSON.stringify(metadata),
  });
}

router.get("/openclaw/config", async (_req, res): Promise<void> => {
  let config = await getOpenclawConfig();
  if (!config) {
    [config] = await db
      .insert(openclawConfigTable)
      .values({
        gatewayUrl: "ws://72.60.167.64:18789",
        httpUrl: "http://72.60.167.64:18789",
        authToken: "",
      })
      .returning();
  }
  res.json(config);
});

router.put("/openclaw/config", async (req, res): Promise<void> => {
  const body = UpdateOpenclawConfigBody.parse(req.body);
  let config = await getOpenclawConfig();

  if (config) {
    [config] = await db
      .update(openclawConfigTable)
      .set(body)
      .where(eq(openclawConfigTable.id, config.id))
      .returning();
  } else {
    [config] = await db
      .insert(openclawConfigTable)
      .values(body)
      .returning();
  }

  res.json(config);
});

router.get("/openclaw/gateway/status", async (_req, res): Promise<void> => {
  const config = await getOpenclawConfig();

  if (!config || !config.httpUrl) {
    res.json(
      GetGatewayStatusResponse.parse({
        online: false,
        health: "not_configured",
        agentsCount: 0,
        version: null,
        error: "Gateway URL not configured",
      })
    );
    return;
  }

  try {
    const healthRes = await fetch(`${config.httpUrl}/health`, {
      signal: AbortSignal.timeout(5000),
      headers: config.authToken
        ? { Authorization: `Bearer ${config.authToken}` }
        : {},
    });

    const agentCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentsTable);

    if (healthRes.ok) {
      res.json(
        GetGatewayStatusResponse.parse({
          online: true,
          health: "healthy",
          agentsCount: Number(agentCount[0]?.count ?? 0),
          version: null,
          error: null,
        })
      );
    } else {
      res.json(
        GetGatewayStatusResponse.parse({
          online: false,
          health: "error",
          agentsCount: Number(agentCount[0]?.count ?? 0),
          version: null,
          error: `Gateway returned ${healthRes.status}`,
        })
      );
    }
  } catch (err: unknown) {
    const agentCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentsTable);

    res.json(
      GetGatewayStatusResponse.parse({
        online: false,
        health: "unreachable",
        agentsCount: Number(agentCount[0]?.count ?? 0),
        version: null,
        error: err instanceof Error ? err.message : "Connection failed",
      })
    );
  }
});

router.get("/openclaw/agents", async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable).orderBy(desc(agentsTable.createdAt));
  res.json(agents);
});

router.post("/openclaw/agents", async (req, res): Promise<void> => {
  const body = CreateAgentBody.parse(req.body);

  const existing = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.agentId, body.agentId));
  if (existing.length > 0) {
    res.status(409).json({ error: "Agent ID already exists" });
    return;
  }

  const [agent] = await db
    .insert(agentsTable)
    .values({
      agentId: body.agentId,
      name: body.name,
      description: body.description ?? "",
      emoji: body.emoji ?? "🤖",
      model: body.model ?? "llama3.2:latest",
      systemPrompt: body.systemPrompt ?? "",
      category: body.category ?? "general",
      channels: body.channels ?? "",
      temperature: body.temperature ?? 0.7,
      maxTokens: body.maxTokens ?? 4096,
    })
    .returning();

  await logAgentActivity(body.agentId, "info", `Agent "${body.name}" created`, { category: body.category });

  const config = await getOpenclawConfig();
  if (config?.httpUrl && config?.authToken) {
    try {
      await fetch(`${config.httpUrl}/tools/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.authToken}`,
        },
        body: JSON.stringify({
          tool: "agents.add",
          args: { id: body.agentId, workspace: `~/.openclaw/workspace-${body.agentId}` },
        }),
        signal: AbortSignal.timeout(10000),
      });
      await logAgentActivity(body.agentId, "info", "Registered with OpenClaw gateway");
    } catch {
      await logAgentActivity(body.agentId, "warn", "Could not register with OpenClaw gateway (gateway may not be running)");
    }
  }

  res.status(201).json(agent);
});

router.get("/openclaw/agents/:agentId", async (req, res): Promise<void> => {
  const { agentId } = GetAgentParams.parse(req.params);
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.agentId, agentId));

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json(agent);
});

router.put("/openclaw/agents/:agentId", async (req, res): Promise<void> => {
  const { agentId } = UpdateAgentParams.parse(req.params);
  const body = UpdateAgentBody.parse(req.body);

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.emoji !== undefined) updateData.emoji = body.emoji;
  if (body.model !== undefined) updateData.model = body.model;
  if (body.systemPrompt !== undefined) updateData.systemPrompt = body.systemPrompt;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.channels !== undefined) updateData.channels = body.channels;
  if (body.temperature !== undefined) updateData.temperature = body.temperature;
  if (body.maxTokens !== undefined) updateData.maxTokens = body.maxTokens;

  const [agent] = await db
    .update(agentsTable)
    .set(updateData)
    .where(eq(agentsTable.agentId, agentId))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  await logAgentActivity(agentId, "info", `Agent updated`, { fields: Object.keys(updateData) });
  res.json(agent);
});

router.delete("/openclaw/agents/:agentId", async (req, res): Promise<void> => {
  const { agentId } = DeleteAgentParams.parse(req.params);

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.agentId, agentId));

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const config = await getOpenclawConfig();
  if (config?.httpUrl && config?.authToken) {
    try {
      await fetch(`${config.httpUrl}/tools/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.authToken}`,
        },
        body: JSON.stringify({
          tool: "agents.delete",
          args: { id: agentId },
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
    }
  }

  await db.delete(agentMemoriesTable).where(eq(agentMemoriesTable.agentId, agentId));
  await db.delete(agentTasksTable).where(eq(agentTasksTable.assignedAgentId, agentId));
  await db.delete(agentLogsTable).where(eq(agentLogsTable.agentId, agentId));
  await db.delete(agentsTable).where(eq(agentsTable.agentId, agentId));
  await logAgentActivity(agentId, "info", `Agent "${agent.name}" deleted`);

  res.status(204).send();
});

router.post("/openclaw/agents/:agentId/chat", async (req, res): Promise<void> => {
  const { agentId } = ChatWithAgentParams.parse(req.params);
  const body = ChatWithAgentBody.parse(req.body);

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.agentId, agentId));

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const config = await getOpenclawConfig();
  const sessionKey = body.sessionKey || `session-${agentId}-${Date.now()}`;

  const memories = await db
    .select()
    .from(agentMemoriesTable)
    .where(eq(agentMemoriesTable.agentId, agentId))
    .orderBy(desc(agentMemoriesTable.importance))
    .limit(10);

  let systemContent = agent.systemPrompt || "";
  if (memories.length > 0) {
    const memoryContext = memories
      .map((m) => `[${m.memoryType}] ${m.content}`)
      .join("\n");
    systemContent += `\n\n## Persistent Memory\nThe following are remembered facts, summaries, and preferences:\n${memoryContext}`;
  }

  if (config?.httpUrl && config?.authToken) {
    try {
      const chatRes = await fetch(`${config.httpUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.authToken}`,
          "x-openclaw-agent-id": agentId,
        },
        body: JSON.stringify({
          model: "openclaw",
          stream: false,
          messages: [
            ...(systemContent
              ? [{ role: "system", content: systemContent }]
              : []),
            { role: "user", content: body.message },
          ],
          user: sessionKey,
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (chatRes.ok) {
        const data = (await chatRes.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const responseText =
          data.choices?.[0]?.message?.content ?? "No response from agent";

        await db
          .update(agentsTable)
          .set({
            totalMessages: sql`${agentsTable.totalMessages} + 1`,
            lastActive: new Date(),
            status: "active",
          })
          .where(eq(agentsTable.agentId, agentId));

        await logAgentActivity(agentId, "info", "Chat message processed", {
          sessionKey,
        });

        res.json(
          ChatWithAgentResponse.parse({
            agentId,
            response: responseText,
            sessionKey,
          })
        );
        return;
      }

      res.json(
        ChatWithAgentResponse.parse({
          agentId,
          response: `Gateway error: ${chatRes.status} ${chatRes.statusText}`,
          sessionKey,
        })
      );
      return;
    } catch (err: unknown) {
      const fallbackMsg =
        err instanceof Error ? err.message : "Gateway connection failed";
      await logAgentActivity(agentId, "error", `Chat failed: ${fallbackMsg}`);

      res.json(
        ChatWithAgentResponse.parse({
          agentId,
          response: `Error: ${fallbackMsg}. Gateway may not be running. You can still manage agents and they will connect when the gateway is online.`,
          sessionKey,
        })
      );
      return;
    }
  }

  res.json(
    ChatWithAgentResponse.parse({
      agentId,
      response:
        "OpenClaw gateway not configured. Set up the gateway URL and auth token in the Agents settings.",
      sessionKey,
    })
  );
});

router.get("/openclaw/agents/:agentId/logs", async (req, res): Promise<void> => {
  const { agentId } = GetAgentLogsParams.parse(req.params);
  const { limit } = GetAgentLogsQueryParams.parse(req.query);

  const logs = await db
    .select()
    .from(agentLogsTable)
    .where(eq(agentLogsTable.agentId, agentId))
    .orderBy(desc(agentLogsTable.createdAt))
    .limit(limit);

  res.json(logs);
});

router.get("/openclaw/stats", async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable);

  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.status === "active").length;
  const idleAgents = agents.filter((a) => a.status === "idle").length;
  const totalMessages = agents.reduce((sum, a) => sum + a.totalMessages, 0);
  const totalTasksCompleted = agents.reduce(
    (sum, a) => sum + a.tasksCompleted,
    0
  );

  const byCategory: Record<string, number> = {};
  for (const agent of agents) {
    byCategory[agent.category] = (byCategory[agent.category] ?? 0) + 1;
  }

  const [taskCountResult] = await db.select({ count: sql<number>`count(*)` }).from(agentTasksTable);
  const totalTaskCount = Number(taskCountResult?.count ?? 0);
  const [pendingResult] = await db.select({ count: sql<number>`count(*)` }).from(agentTasksTable).where(eq(agentTasksTable.status, "pending"));
  const pendingTaskCount = Number(pendingResult?.count ?? 0);
  const [memoryResult] = await db.select({ count: sql<number>`count(*)` }).from(agentMemoriesTable);
  const totalMemoryCount = Number(memoryResult?.count ?? 0);

  let gatewayConnected = false;
  const config = await getOpenclawConfig();
  if (config?.httpUrl) {
    try {
      const healthRes = await fetch(`${config.httpUrl}/health`, {
        signal: AbortSignal.timeout(3000),
        headers: config.authToken
          ? { Authorization: `Bearer ${config.authToken}` }
          : {},
      });
      gatewayConnected = healthRes.ok;
    } catch {
      gatewayConnected = false;
    }
  }

  res.json(
    GetOpenclawStatsResponse.parse({
      totalAgents,
      activeAgents,
      idleAgents,
      totalMessages,
      totalTasksCompleted,
      totalTasks: totalTaskCount,
      pendingTasks: pendingTaskCount,
      totalMemories: totalMemoryCount,
      byCategory,
      gatewayConnected,
    })
  );
});

// ===== MEMORY ROUTES =====

router.get("/openclaw/agents/:agentId/memories", async (req, res): Promise<void> => {
  const { agentId } = req.params;
  const memType = req.query.type as string | undefined;

  const conditions = [eq(agentMemoriesTable.agentId, agentId)];
  if (memType) {
    conditions.push(eq(agentMemoriesTable.memoryType, memType));
  }

  const memories = await db
    .select()
    .from(agentMemoriesTable)
    .where(conditions.length === 1 ? conditions[0]! : and(...conditions))
    .orderBy(desc(agentMemoriesTable.importance), desc(agentMemoriesTable.createdAt));

  res.json(memories);
});

router.post("/openclaw/agents/:agentId/memories", async (req, res): Promise<void> => {
  const { agentId } = AddAgentMemoryParams.parse(req.params);
  const { content, memoryType, source, importance, tags } = AddAgentMemoryBody.parse(req.body);

  const [memory] = await db
    .insert(agentMemoriesTable)
    .values({
      agentId,
      content,
      memoryType: memoryType ?? "fact",
      source: source ?? "manual",
      importance: importance ?? 5,
      tags: tags ?? "",
    })
    .returning();

  await logAgentActivity(agentId, "info", `Memory added: ${(content as string).slice(0, 80)}...`, { memoryType: memoryType ?? "fact" });
  res.status(201).json(memory);
});

router.delete("/openclaw/agents/:agentId/memories/:memoryId", async (req, res): Promise<void> => {
  const { agentId, memoryId } = DeleteAgentMemoryParams.parse(req.params);
  await db
    .delete(agentMemoriesTable)
    .where(and(eq(agentMemoriesTable.agentId, agentId), eq(agentMemoriesTable.id, memoryId)));
  res.status(204).send();
});

router.post("/openclaw/agents/:agentId/memories/extract", async (req, res): Promise<void> => {
  const { agentId } = ExtractMemoriesFromChatParams.parse(req.params);
  const { messages } = ExtractMemoriesFromChatBody.parse(req.body);

  const extracted: Array<typeof agentMemoriesTable.$inferSelect> = [];

  for (const msg of messages) {
    if (msg.role !== "assistant" || msg.content.length < 20) continue;

    const content = msg.content;
    const sentences = content.split(/[.!?]+/).filter((s: string) => s.trim().length > 15);

    for (const sentence of sentences.slice(0, 3)) {
      const trimmed = sentence.trim();
      if (trimmed.length < 15 || trimmed.length > 500) continue;

      const hasFactPattern = /\b(is|are|was|were|has|have|can|will|should|means|refers|defined|known|called|named|located|built|created|uses|requires)\b/i.test(trimmed);
      if (!hasFactPattern) continue;

      const [mem] = await db
        .insert(agentMemoriesTable)
        .values({
          agentId,
          content: trimmed,
          memoryType: "fact",
          source: "chat-extraction",
          importance: 3,
          tags: "",
        })
        .returning();
      extracted.push(mem!);
    }
  }

  if (messages.length > 4) {
    const userMsgs = messages.filter((m: { role: string }) => m.role === "user").map((m: { content: string }) => m.content);
    const summaryContent = `Conversation topics: ${userMsgs.slice(0, 5).map((m: string) => m.slice(0, 50)).join("; ")}`;
    const [summaryMem] = await db
      .insert(agentMemoriesTable)
      .values({
        agentId,
        content: summaryContent,
        memoryType: "summary",
        source: "chat-extraction",
        importance: 4,
        tags: "",
      })
      .returning();
    extracted.push(summaryMem!);
  }

  await logAgentActivity(agentId, "info", `Extracted ${extracted.length} memories from chat`, { count: extracted.length });

  res.json({ extracted: extracted.length, memories: extracted });
});

// ===== TASK ROUTES =====

router.get("/openclaw/tasks", async (req, res): Promise<void> => {
  const { status, agentId, priority } = req.query as { status?: string; agentId?: string; priority?: string };

  let query = db.select().from(agentTasksTable);
  const conditions = [];
  if (status) conditions.push(eq(agentTasksTable.status, status));
  if (agentId) conditions.push(eq(agentTasksTable.assignedAgentId, agentId));
  if (priority) conditions.push(eq(agentTasksTable.priority, priority));

  const tasks = conditions.length > 0
    ? await query.where(conditions.length === 1 ? conditions[0]! : and(...conditions)).orderBy(desc(agentTasksTable.createdAt))
    : await query.orderBy(desc(agentTasksTable.createdAt));

  res.json(tasks);
});

router.post("/openclaw/tasks", async (req, res): Promise<void> => {
  const { title, description, assignedAgentId, priority, category, dueAt } = CreateAgentTaskBody.parse(req.body);

  const [task] = await db
    .insert(agentTasksTable)
    .values({
      title,
      description: description ?? "",
      assignedAgentId: assignedAgentId ?? null,
      priority: priority ?? "medium",
      category: category ?? "general",
      dueAt: dueAt ? new Date(dueAt) : null,
    })
    .returning();

  if (assignedAgentId) {
    await logAgentActivity(assignedAgentId, "info", `Task assigned: ${title}`, { taskId: task!.id });
  }

  res.status(201).json(task);
});

router.put("/openclaw/tasks/:taskId", async (req, res): Promise<void> => {
  const { taskId } = UpdateAgentTaskParams.parse(req.params);
  const updates: Record<string, unknown> = {};

  const { title, description, assignedAgentId, status, priority, category, result, dueAt } = UpdateAgentTaskBody.parse(req.body);
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (assignedAgentId !== undefined) updates.assignedAgentId = assignedAgentId;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (category !== undefined) updates.category = category;
  if (result !== undefined) updates.result = result;
  if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : null;

  const [task] = await db
    .update(agentTasksTable)
    .set(updates)
    .where(eq(agentTasksTable.id, taskId))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(task);
});

router.delete("/openclaw/tasks/:taskId", async (req, res): Promise<void> => {
  const { taskId } = UpdateAgentTaskParams.parse(req.params);
  await db.delete(agentTasksTable).where(eq(agentTasksTable.id, taskId));
  res.status(204).send();
});

router.post("/openclaw/tasks/:taskId/complete", async (req, res): Promise<void> => {
  const { taskId } = CompleteAgentTaskParams.parse(req.params);
  const { result } = CompleteAgentTaskBody.parse(req.body);

  const [existing] = await db.select().from(agentTasksTable).where(eq(agentTasksTable.id, taskId));
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  if (existing.status === "completed") {
    res.json(existing);
    return;
  }

  const [task] = await db
    .update(agentTasksTable)
    .set({
      status: "completed",
      result,
      completedAt: new Date(),
    })
    .where(eq(agentTasksTable.id, taskId))
    .returning();

  if (task!.assignedAgentId) {
    await db
      .update(agentsTable)
      .set({ tasksCompleted: sql`${agentsTable.tasksCompleted} + 1` })
      .where(eq(agentsTable.agentId, task!.assignedAgentId));
    await logAgentActivity(task!.assignedAgentId, "info", `Task completed: ${task!.title}`, { taskId: task!.id, result });
  }

  res.json(task);
});

router.post("/openclaw/tasks/route", async (req, res): Promise<void> => {
  const { title, description, category, priority } = RouteTaskBody.parse(req.body);

  const agents = await db.select().from(agentsTable);
  if (agents.length === 0) {
    res.status(400).json({ error: "No agents available for routing" });
    return;
  }

  let bestAgent = agents[0]!;
  let bestScore = -1;
  const taskCategory = category ?? "general";

  for (const agent of agents) {
    let score = 0;

    if (agent.category === taskCategory) score += 10;

    if (agent.status === "idle") score += 5;
    else if (agent.status === "active") score += 2;

    const pendingTasks = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentTasksTable)
      .where(and(
        eq(agentTasksTable.assignedAgentId, agent.agentId),
        eq(agentTasksTable.status, "pending")
      ));
    const pending = Number(pendingTasks[0]?.count ?? 0);
    score -= pending * 2;

    const titleLower = title.toLowerCase();
    const descLower = (description ?? "").toLowerCase();
    const combined = titleLower + " " + descLower;

    if (agent.description) {
      const descWords = agent.description.toLowerCase().split(/\s+/);
      for (const word of descWords) {
        if (word.length > 3 && combined.includes(word)) score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  const [task] = await db
    .insert(agentTasksTable)
    .values({
      title,
      description: description ?? "",
      assignedAgentId: bestAgent.agentId,
      priority: priority ?? "medium",
      category: taskCategory,
    })
    .returning();

  await logAgentActivity(bestAgent.agentId, "info", `Auto-routed task: ${title}`, { taskId: task!.id, score: bestScore });

  let reason = `Assigned to ${bestAgent.name}`;
  if (bestAgent.category === taskCategory) reason += ` (category match: ${taskCategory})`;
  reason += ` with routing score ${bestScore}`;

  res.json({ task, assignedAgent: bestAgent, reason });
});

router.get("/openclaw/setup-script", async (_req, res): Promise<void> => {
  const config = await getOpenclawConfig();
  const gatewayToken = config?.authToken || "CHANGE_ME_TO_A_SECURE_TOKEN";

  const configJson = JSON.stringify({
    gateway: {
      port: 18789,
      auth: { token: gatewayToken },
    },
    agents: {
      list: [
        {
          id: "main",
          workspace: "~/.openclaw/workspace",
          identity: { name: "Main Agent", emoji: "\uD83E\uDD9E" },
        },
      ],
    },
  }, null, 2);

  const script = `#!/bin/bash
set -euo pipefail

GATEWAY_TOKEN="${gatewayToken}"

echo "============================================"
echo "  OpenClaw Gateway Setup Script"
echo "  Target: \$(hostname)"
echo "============================================"
echo ""

if ! command -v node &> /dev/null; then
    echo "[1/6] Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[1/6] Node.js already installed: \$(node --version)"
fi

echo "[2/6] Installing OpenClaw..."
if ! command -v openclaw &> /dev/null; then
    npm install -g openclaw
    echo "  OpenClaw installed: \$(openclaw --version)"
else
    echo "  OpenClaw already installed: \$(openclaw --version)"
fi

echo "[3/6] Setting up OpenClaw directory..."
mkdir -p ~/.openclaw

echo "[4/6] Configuring gateway..."
cat > ~/.openclaw/openclaw.json << 'OPENCLAW_CONFIG'
${configJson}
OPENCLAW_CONFIG

echo "[5/6] Opening firewall port 18789..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 18789/tcp
    echo "  UFW rule added for port 18789"
fi

echo "[6/6] Setting up systemd service..."
OPENCLAW_BIN=\$(which openclaw)
CURRENT_USER=\$(whoami)

sudo tee /etc/systemd/system/openclaw-gateway.service > /dev/null << SERVICEEOF
[Unit]
Description=OpenClaw Gateway
After=network.target ollama.service

[Service]
Type=simple
User=\${CURRENT_USER}
Environment=OPENCLAW_GATEWAY_TOKEN=\${GATEWAY_TOKEN}
ExecStart=\${OPENCLAW_BIN} gateway run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICEEOF

sudo systemctl daemon-reload
sudo systemctl enable openclaw-gateway
sudo systemctl start openclaw-gateway

echo ""
echo "============================================"
echo "  OpenClaw Gateway Setup Complete!"
echo "============================================"
echo ""
echo "Gateway URL:  ws://\$(hostname -I | awk '{print \$1}'):18789"
echo "HTTP URL:     http://\$(hostname -I | awk '{print \$1}'):18789"
echo "Auth Token:   \${GATEWAY_TOKEN}"
echo ""
echo "Test with: openclaw gateway status"
echo "Health:    curl http://localhost:18789/health"
echo ""
echo "Next steps:"
echo "  1. Copy the gateway URL and token to your LLM Hub dashboard"
echo "  2. Create agents from the Agents tab"
echo "  3. Connect channels (Telegram, Slack, etc.)"
echo ""
`;

  res.setHeader("Content-Type", "text/plain");
  res.send(script);
});

export default router;
