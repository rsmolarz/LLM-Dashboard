import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const researchSessionsTable = pgTable("research_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  prompt: text("prompt").notNull(),
  mode: text("mode").notNull().default("deep"),
  synthesis: text("synthesis").notNull(),
  modelCount: integer("model_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const researchFollowUpsTable = pgTable("research_follow_ups", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
