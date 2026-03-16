import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trainingDataTable = pgTable("training_data", {
  id: serial("id").primaryKey(),
  inputText: text("input_text").notNull(),
  outputText: text("output_text").notNull(),
  systemPrompt: text("system_prompt").notNull().default(""),
  category: text("category").notNull().default("general"),
  quality: integer("quality").notNull().default(3),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTrainingDataSchema = createInsertSchema(trainingDataTable).omit({ id: true, createdAt: true });
export type InsertTrainingData = z.infer<typeof insertTrainingDataSchema>;
export type TrainingData = typeof trainingDataTable.$inferSelect;
