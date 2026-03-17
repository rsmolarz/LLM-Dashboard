import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { db, conversationsTable, chatMessagesTable } from "@workspace/db";
import {
  ListConversationsResponse,
  CreateConversationBody,
  DeleteConversationParams,
  GetMessagesParams,
  GetMessagesResponse,
  AddMessageParams,
  AddMessageBody,
  RateMessageParams,
  RateMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function getUserId(req: any): string | null {
  return req.user?.id || null;
}

router.get("/chat/conversations", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const conditions = userId ? [eq(conversationsTable.userId, userId)] : [];
  const conversations = conditions.length > 0
    ? await db.select().from(conversationsTable).where(conditions[0]!).orderBy(asc(conversationsTable.createdAt))
    : await db.select().from(conversationsTable).orderBy(asc(conversationsTable.createdAt));
  res.json(ListConversationsResponse.parse(conversations));
});

router.post("/chat/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getUserId(req);
  const [conversation] = await db
    .insert(conversationsTable)
    .values({ ...parsed.data, userId })
    .returning();

  res.status(201).json(conversation);
});

router.delete("/chat/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getUserId(req);
  const conditions = userId
    ? and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, userId))
    : eq(conversationsTable.id, params.data.id);

  const [deleted] = await db
    .delete(conversationsTable)
    .where(conditions!)
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

router.patch("/chat/messages/:messageId/rate", async (req, res): Promise<void> => {
  const params = RateMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = RateMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(chatMessagesTable)
    .set({ rating: parsed.data.rating })
    .where(eq(chatMessagesTable.id, params.data.messageId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  res.json(updated);
});

export default router;
