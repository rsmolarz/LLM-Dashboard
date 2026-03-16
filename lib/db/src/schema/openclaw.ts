import { pgTable, text, serial, integer, real, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const openclawConfigTable = pgTable("openclaw_config", {
  id: serial("id").primaryKey(),
  gatewayUrl: text("gateway_url").notNull().default("ws://72.60.167.64:18789"),
  httpUrl: text("http_url").notNull().default("http://72.60.167.64:18789"),
  authToken: text("auth_token").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOpenclawConfigSchema = createInsertSchema(openclawConfigTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOpenclawConfig = z.infer<typeof insertOpenclawConfigSchema>;
export type OpenclawConfig = typeof openclawConfigTable.$inferSelect;

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  emoji: text("emoji").notNull().default("🤖"),
  model: text("model").notNull().default("llama3.2:latest"),
  systemPrompt: text("system_prompt").notNull().default(""),
  category: text("category").notNull().default("general"),
  status: text("status").notNull().default("idle"),
  channels: text("channels").notNull().default(""),
  temperature: real("temperature").notNull().default(0.7),
  maxTokens: integer("max_tokens").notNull().default(4096),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  totalMessages: integer("total_messages").notNull().default(0),
  lastActive: timestamp("last_active", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, tasksCompleted: true, totalMessages: true, lastActive: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;

export const agentLogsTable = pgTable("agent_logs", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentLogSchema = createInsertSchema(agentLogsTable).omit({ id: true, createdAt: true });
export type InsertAgentLog = z.infer<typeof insertAgentLogSchema>;
export type AgentLog = typeof agentLogsTable.$inferSelect;

export const agentMemoriesTable = pgTable("agent_memories", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  memoryType: text("memory_type").notNull().default("fact"),
  content: text("content").notNull(),
  source: text("source").notNull().default("manual"),
  importance: integer("importance").notNull().default(5),
  tags: text("tags").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentMemorySchema = createInsertSchema(agentMemoriesTable).omit({ id: true, createdAt: true });
export type InsertAgentMemory = z.infer<typeof insertAgentMemorySchema>;
export type AgentMemory = typeof agentMemoriesTable.$inferSelect;

export const agentTasksTable = pgTable("agent_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  assignedAgentId: text("assigned_agent_id"),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("medium"),
  category: text("category").notNull().default("general"),
  result: text("result"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentTaskSchema = createInsertSchema(agentTasksTable).omit({ id: true, completedAt: true, createdAt: true, updatedAt: true });
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type AgentTask = typeof agentTasksTable.$inferSelect;
