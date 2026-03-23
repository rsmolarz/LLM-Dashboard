import { pgTable, serial, text, timestamp, integer, real, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const entKnowledgeSourcesTable = pgTable("ent_knowledge_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  totalChunks: integer("total_chunks").default(0),
  totalDocuments: integer("total_documents").default(0),
  status: text("status").default("pending"),
  lastIngestedAt: timestamp("last_ingested_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const entEmbeddingsTable = pgTable("ent_embeddings", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id"),
  sourceType: text("source_type").notNull(),
  sourceRef: text("source_ref"),
  title: text("title"),
  content: text("content").notNull(),
  chunkIndex: integer("chunk_index").default(0),
  metadata: text("metadata"),
  embeddingModel: text("embedding_model"),
  embeddingDim: integer("embedding_dim"),
  embeddingVector: text("embedding_vector"),
  similarity: real("similarity"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ent_embeddings_source_type").on(table.sourceType),
  index("idx_ent_embeddings_source_ref").on(table.sourceRef),
]);
