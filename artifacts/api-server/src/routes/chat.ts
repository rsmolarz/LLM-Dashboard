import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, conversationsTable, chatMessagesTable } from "@workspace/db";
import {
  ListConversationsResponse,
  CreateConversationBody,
  DeleteConversationParams,
  GetMessagesParams,
  GetMessagesResponse,
  AddMessageParams,
  AddMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/chat/conversations", async (_req, res): Promise<void> => {
  const conversations = await db
    .select()
    .from(conversationsTable)
    .orderBy(asc(conversationsTable.createdAt));
  res.json(ListConversationsResponse.parse(conversations));
});

router.post("/chat/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conversation] = await db
    .insert(conversationsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(conversation);
});

router.delete("/chat/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/chat/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = GetMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.conversationId, params.data.id))
    .orderBy(asc(chatMessagesTable.createdAt));

  res.json(GetMessagesResponse.parse(messages));
});

router.post("/chat/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = AddMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [message] = await db
    .insert(chatMessagesTable)
    .values({
      conversationId: params.data.id,
      role: parsed.data.role,
      content: parsed.data.content,
    })
    .returning();

  res.status(201).json(message);
});

export default router;
