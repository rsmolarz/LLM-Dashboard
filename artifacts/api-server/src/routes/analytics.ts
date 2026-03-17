import { Router, type IRouter } from "express";
import { db, conversationsTable, chatMessagesTable, documentsTable, documentChunksTable } from "@workspace/db";
import { count, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

const VPS_DB_CONFIG = {
  host: process.env.VPS_DB_HOST,
  port: parseInt(process.env.VPS_DB_PORT || "5432"),
  database: process.env.VPS_DB_NAME,
  user: process.env.VPS_DB_USER,
  password: process.env.VPS_DB_PASSWORD,
  ssl: false,
  connectionTimeoutMillis: 5000,
};

async function getVpsClient() {
  const { Client } = await import("pg");
  const client = new Client(VPS_DB_CONFIG);
  await client.connect();
  return client;
}

router.get("/analytics/overview", async (_req, res): Promise<void> => {
  try {
    const [convCount] = await db.select({ count: count() }).from(conversationsTable);
    const [msgCount] = await db.select({ count: count() }).from(chatMessagesTable);
    const [docCount] = await db.select({ count: count() }).from(documentsTable);
    const [chunkCount] = await db.select({ count: count() }).from(documentChunksTable);

    const recentMessages = await db
      .select({
        model: conversationsTable.model,
        role: chatMessagesTable.role,
        createdAt: chatMessagesTable.createdAt,
        rating: chatMessagesTable.rating,
      })
      .from(chatMessagesTable)
      .innerJoin(conversationsTable, eq(chatMessagesTable.conversationId, conversationsTable.id))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(500);

    const modelUsage: Record<string, number> = {};
    const dailyMessages: Record<string, number> = {};
    const ratingDistribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    let totalRated = 0;
    let ratingSum = 0;

    for (const msg of recentMessages) {
      if (msg.model) {
        modelUsage[msg.model] = (modelUsage[msg.model] || 0) + 1;
      }
      if (msg.createdAt) {
        const day = new Date(msg.createdAt).toISOString().split("T")[0];
        dailyMessages[day] = (dailyMessages[day] || 0) + 1;
      }
      if (msg.rating && msg.rating >= 1 && msg.rating <= 5) {
        ratingDistribution[String(msg.rating)]++;
        totalRated++;
        ratingSum += msg.rating;
      }
    }

    let vpsStats: any = null;
    try {
      const client = await getVpsClient();
      try {
        const [trainingSources, benchmarks, brainSources, brainChunks, backups] = await Promise.all([
          client.query("SELECT COUNT(*) as count FROM training_sources"),
          client.query("SELECT model, category, score, created_at FROM model_benchmarks ORDER BY created_at DESC LIMIT 50"),
          client.query("SELECT COUNT(*) as count, status FROM brain_sources GROUP BY status"),
          client.query("SELECT COUNT(*) as count FROM brain_chunks"),
          client.query("SELECT COUNT(*) as count FROM backup_snapshots"),
        ]);
        vpsStats = {
          trainingSources: parseInt(trainingSources.rows[0]?.count || "0"),
          benchmarks: benchmarks.rows,
          brainSources: brainSources.rows,
          brainChunks: parseInt(brainChunks.rows[0]?.count || "0"),
          backups: parseInt(backups.rows[0]?.count || "0"),
        };
      } finally {
        await client.end();
      }
    } catch {}

    res.json({
      conversations: convCount?.count || 0,
      messages: msgCount?.count || 0,
      documents: docCount?.count || 0,
      chunks: chunkCount?.count || 0,
      modelUsage: Object.entries(modelUsage).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count),
      dailyMessages: Object.entries(dailyMessages).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
      ratingDistribution,
      averageRating: totalRated > 0 ? Math.round((ratingSum / totalRated) * 10) / 10 : null,
      totalRated,
      vpsStats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/analytics/benchmark-trends", async (_req, res): Promise<void> => {
  try {
    const client = await getVpsClient();
    try {
      const result = await client.query(
        `SELECT model, category, score, created_at 
         FROM model_benchmarks 
         ORDER BY created_at DESC 
         LIMIT 200`
      );
      res.json({ benchmarks: result.rows });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    res.json({ benchmarks: [], error: err.message });
  }
});

export default router;
