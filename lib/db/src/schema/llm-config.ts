import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const llmConfigTable = pgTable("llm_config", {
  id: serial("id").primaryKey(),
  serverUrl: text("server_url").notNull().default("http://localhost:8080"),
  port: integer("port").notNull().default(8080),
  cpuThreads: integer("cpu_threads").notNull().default(4),
  contextSize: integer("context_size").notNull().default(2048),
  gpuLayers: integer("gpu_layers").notNull().default(0),
  containerName: text("container_name").notNull().default("llama-server"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLlmConfigSchema = createInsertSchema(llmConfigTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLlmConfig = z.infer<typeof insertLlmConfigSchema>;
export type LlmConfig = typeof llmConfigTable.$inferSelect;
