import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const llmConfigTable = pgTable("llm_config", {
  id: serial("id").primaryKey(),
  serverUrl: text("server_url").notNull().default("http://localhost:11434"),
  port: integer("port").notNull().default(11434),
  gpuEnabled: boolean("gpu_enabled").notNull().default(false),
  defaultModel: text("default_model").notNull().default("llama3"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLlmConfigSchema = createInsertSchema(llmConfigTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLlmConfig = z.infer<typeof insertLlmConfigSchema>;
export type LlmConfig = typeof llmConfigTable.$inferSelect;
