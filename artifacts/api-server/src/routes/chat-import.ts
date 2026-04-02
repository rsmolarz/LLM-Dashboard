import { Router } from "express";
import { eq, desc, sql, and, like } from "drizzle-orm";
import { db, conversationsTable, chatMessagesTable } from "@workspace/db";

const router = Router();

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function getUserId(req: any): string | null {
  return req.user?.id || null;
}

interface ParsedConversation {
  title: string;
  model: string;
  source: string;
  createdAt?: Date;
  messages: { role: string; content: string; createdAt?: Date }[];
}

function parseChatGPTExport(data: any): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];

  const items = Array.isArray(data) ? data : [data];

  for (const conv of items) {
    if (!conv.mapping && !conv.messages) continue;

    const title = conv.title || "Untitled ChatGPT Chat";
    const model = conv.default_model_slug || conv.model || "chatgpt";
    const createdAt = conv.create_time ? new Date(conv.create_time * 1000) : undefined;
    const messages: { role: string; content: string; createdAt?: Date }[] = [];

    if (conv.mapping) {
      const nodes = Object.values(conv.mapping) as any[];
      const sorted = nodes
        .filter((n: any) => n.message && n.message.content?.parts?.length > 0)
        .sort((a: any, b: any) => (a.message.create_time || 0) - (b.message.create_time || 0));

      for (const node of sorted) {
        const msg = node.message;
        const role = msg.author?.role || msg.role || "user";
        if (role === "system") continue;
        const content = (msg.content?.parts || [])
          .filter((p: any) => typeof p === "string")
          .join("\n")
          .trim();
        if (!content) continue;
        messages.push({
          role: role === "assistant" ? "assistant" : "user",
          content,
          createdAt: msg.create_time ? new Date(msg.create_time * 1000) : undefined,
        });
      }
    } else if (conv.messages) {
      for (const msg of conv.messages) {
        const role = msg.role || msg.author?.role || "user";
        if (role === "system") continue;
        const content = typeof msg.content === "string" ? msg.content :
          (msg.content?.parts || []).filter((p: any) => typeof p === "string").join("\n");
        if (!content.trim()) continue;
        messages.push({
          role: role === "assistant" ? "assistant" : "user",
          content: content.trim(),
        });
      }
    }

    if (messages.length > 0) {
      conversations.push({ title, model, source: "chatgpt", createdAt, messages });
    }
  }

  return conversations;
}

function parseClaudeExport(data: any): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];

  const items = Array.isArray(data) ? data : [data];

  for (const conv of items) {
    const title = conv.name || conv.title || "Untitled Claude Chat";
    const model = conv.model || "claude";
    const createdAt = conv.created_at ? new Date(conv.created_at) : undefined;
    const messages: { role: string; content: string; createdAt?: Date }[] = [];

    const chatMessages = conv.chat_messages || conv.messages || [];
    for (const msg of chatMessages) {
      const role = msg.sender === "human" ? "user" :
                   msg.sender === "assistant" ? "assistant" :
                   msg.role || "user";
      if (role === "system") continue;

      let content = "";
      if (typeof msg.text === "string") {
        content = msg.text;
      } else if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter((c: any) => c.type === "text" || typeof c === "string")
          .map((c: any) => typeof c === "string" ? c : c.text || "")
          .join("\n");
      }

      if (!content.trim()) continue;
      messages.push({
        role: role === "assistant" ? "assistant" : "user",
        content: content.trim(),
        createdAt: msg.created_at ? new Date(msg.created_at) : undefined,
      });
    }

    if (messages.length > 0) {
      conversations.push({ title, model, source: "claude", createdAt, messages });
    }
  }

  return conversations;
}

function parseGeminiExport(data: any): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];
  const items = Array.isArray(data) ? data : [data];

  for (const conv of items) {
    const title = conv.title || conv.name || "Untitled Gemini Chat";
    const model = conv.model || "gemini";
    const messages: { role: string; content: string; createdAt?: Date }[] = [];

    const chatMsgs = conv.messages || conv.contents || conv.history || [];
    for (const msg of chatMsgs) {
      const role = msg.role === "model" ? "assistant" : (msg.role || "user");
      if (role === "system") continue;

      let content = "";
      if (typeof msg.content === "string") content = msg.content;
      else if (msg.parts) {
        content = msg.parts.filter((p: any) => p.text).map((p: any) => p.text).join("\n");
      } else if (typeof msg.text === "string") content = msg.text;

      if (!content.trim()) continue;
      messages.push({ role: role === "assistant" ? "assistant" : "user", content: content.trim() });
    }

    if (messages.length > 0) {
      conversations.push({ title, model, source: "gemini", messages });
    }
  }

  return conversations;
}

function parseMarkdownChat(text: string, filename: string): ParsedConversation[] {
  const title = filename.replace(/\.(md|txt|text)$/i, "").replace(/[_-]/g, " ");
  const messages: { role: string; content: string }[] = [];

  const userPatterns = [/^(?:##?\s*)?(?:User|Human|Me|You|Q):\s*/i, /^>\s*/];
  const assistantPatterns = [/^(?:##?\s*)?(?:Assistant|AI|Bot|Claude|ChatGPT|GPT|Gemini|A|Response):\s*/i];

  const lines = text.split("\n");
  let currentRole = "user";
  let currentContent = "";

  for (const line of lines) {
    let matched = false;

    for (const pattern of userPatterns) {
      if (pattern.test(line)) {
        if (currentContent.trim()) {
          messages.push({ role: currentRole, content: currentContent.trim() });
        }
        currentRole = "user";
        currentContent = line.replace(pattern, "");
        matched = true;
        break;
      }
    }

    if (!matched) {
      for (const pattern of assistantPatterns) {
        if (pattern.test(line)) {
          if (currentContent.trim()) {
            messages.push({ role: currentRole, content: currentContent.trim() });
          }
          currentRole = "assistant";
          currentContent = line.replace(pattern, "");
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      currentContent += "\n" + line;
    }
  }

  if (currentContent.trim()) {
    messages.push({ role: currentRole, content: currentContent.trim() });
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: text.trim() });
  }

  return [{ title, model: "imported", source: "markdown", messages }];
}

function detectAndParse(content: string, filename: string): { conversations: ParsedConversation[]; format: string } {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (ext === "json" || content.trim().startsWith("[") || content.trim().startsWith("{")) {
    try {
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];

      if (items.length > 0) {
        const sample = items[0];

        if (sample.mapping || (sample.title && sample.default_model_slug)) {
          return { conversations: parseChatGPTExport(data), format: "chatgpt" };
        }

        if (sample.chat_messages || sample.sender === "human" || sample.sender === "assistant" ||
            (sample.uuid && sample.name)) {
          return { conversations: parseClaudeExport(data), format: "claude" };
        }

        if (sample.contents || sample.history || (sample.parts && !sample.mapping)) {
          return { conversations: parseGeminiExport(data), format: "gemini" };
        }

        if (sample.messages && !sample.mapping) {
          const msgs = sample.messages;
          if (msgs.length > 0 && (msgs[0].sender || (msgs[0].role && msgs[0].content))) {
            if (msgs[0].sender === "human" || msgs[0].sender === "assistant") {
              return { conversations: parseClaudeExport(data), format: "claude" };
            }
            return { conversations: parseChatGPTExport(data), format: "chatgpt" };
          }
        }

        return { conversations: parseChatGPTExport(data), format: "json" };
      }
    } catch {}
  }

  return { conversations: parseMarkdownChat(content, filename), format: "markdown" };
}

router.post("/chat-import/parse", async (req, res): Promise<void> => {
  const { content, filename } = req.body;

  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "filename is required" });
    return;
  }

  if (content.length > MAX_FILE_SIZE) {
    res.status(400).json({ error: `File too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    return;
  }

  try {
    const { conversations, format } = detectAndParse(content, filename);

    const preview = conversations.map(c => ({
      title: c.title,
      model: c.model,
      source: c.source,
      messageCount: c.messages.length,
      createdAt: c.createdAt?.toISOString() || null,
      firstMessage: c.messages[0]?.content?.slice(0, 200) || "",
      lastMessage: c.messages[c.messages.length - 1]?.content?.slice(0, 200) || "",
    }));

    res.json({
      format,
      totalConversations: conversations.length,
      totalMessages: conversations.reduce((acc, c) => acc + c.messages.length, 0),
      preview,
    });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to parse: ${err.message}` });
  }
});

router.post("/chat-import/import", async (req, res): Promise<void> => {
  const { content, filename, selectedIndices } = req.body;

  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "filename is required" });
    return;
  }

  const userId = getUserId(req);

  try {
    const { conversations, format } = detectAndParse(content, filename);
    const toImport = selectedIndices?.length
      ? conversations.filter((_: any, i: number) => selectedIndices.includes(i))
      : conversations;

    let importedCount = 0;
    let messageCount = 0;

    for (const conv of toImport) {
      const [conversation] = await db
        .insert(conversationsTable)
        .values({
          title: `[${conv.source.toUpperCase()}] ${conv.title}`,
          model: conv.model,
          systemPrompt: `Imported from ${conv.source} via ${filename}`,
          userId,
        })
        .returning();

      for (const msg of conv.messages) {
        await db.insert(chatMessagesTable).values({
          conversationId: conversation.id,
          role: msg.role,
          content: msg.content,
        });
        messageCount++;
      }

      importedCount++;
    }

    res.json({
      success: true,
      format,
      importedConversations: importedCount,
      importedMessages: messageCount,
      skippedConversations: conversations.length - importedCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

router.get("/chat-import/imported", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  try {
    const conditions = [like(conversationsTable.systemPrompt, "Imported from %")];
    if (userId) {
      conditions.push(eq(conversationsTable.userId, userId));
    }
    const imported = await db
      .select({
        id: conversationsTable.id,
        title: conversationsTable.title,
        model: conversationsTable.model,
        systemPrompt: conversationsTable.systemPrompt,
        createdAt: conversationsTable.createdAt,
        messageCount: sql<number>`(SELECT COUNT(*)::int FROM chat_messages cm WHERE cm.conversation_id = conversations.id)`,
      })
      .from(conversationsTable)
      .where(and(...conditions))
      .orderBy(desc(conversationsTable.createdAt));

    const conversations = imported.map(c => ({
      ...c,
      source: c.systemPrompt?.match(/Imported from (\w+)/)?.[1] || "unknown",
      filename: c.systemPrompt?.match(/via (.+)/)?.[1] || "unknown",
    }));

    res.json({ conversations, total: conversations.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/chat-import/imported/:id/messages", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const userId = getUserId(req);

  try {
    const conditions = [
      eq(conversationsTable.id, id),
      like(conversationsTable.systemPrompt, "Imported from %"),
    ];
    if (userId) {
      conditions.push(eq(conversationsTable.userId, userId));
    }
    const [conv] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(and(...conditions));

    if (!conv) {
      res.status(404).json({ error: "Imported conversation not found" });
      return;
    }

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, id))
      .orderBy(chatMessagesTable.createdAt);

    res.json({ messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/chat-import/imported/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const userId = getUserId(req);

  try {
    const conditions = [
      eq(conversationsTable.id, id),
      like(conversationsTable.systemPrompt, "Imported from %"),
    ];
    if (userId) {
      conditions.push(eq(conversationsTable.userId, userId));
    }

    await db
      .delete(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, id));

    const [deleted] = await db
      .delete(conversationsTable)
      .where(and(...conditions))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Imported conversation not found" });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/chat-import/stats", async (_req, res): Promise<void> => {
  try {
    const result = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        totalMessages: sql<number>`COALESCE((SELECT COUNT(*)::int FROM chat_messages cm WHERE cm.conversation_id IN (SELECT id FROM conversations WHERE system_prompt LIKE 'Imported from %')), 0)`,
      })
      .from(conversationsTable)
      .where(like(conversationsTable.systemPrompt, "Imported from %"));

    res.json({
      totalConversations: Number(result[0]?.total || 0),
      totalMessages: Number(result[0]?.totalMessages || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
