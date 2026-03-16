import { pgTable, text, serial, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const modelProfilesTable = pgTable("model_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  baseModel: text("base_model").notNull(),
  systemPrompt: text("system_prompt").notNull().default(""),
  temperature: real("temperature").notNull().default(0.7),
  topP: real("top_p").notNull().default(0.9),
  topK: integer("top_k").notNull().default(40),
  contextLength: integer("context_length").notNull().default(4096),
  repeatPenalty: real("repeat_penalty").notNull().default(1.1),
  deployed: text("deployed").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertModelProfileSchema = createInsertSchema(modelProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertModelProfile = z.infer<typeof insertModelProfileSchema>;
export type ModelProfile = typeof modelProfilesTable.$inferSelect;
