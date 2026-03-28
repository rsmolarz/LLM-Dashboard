import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id"),
    userEmail: varchar("user_email"),
    action: varchar("action").notNull(),
    resource: varchar("resource").notNull(),
    resourceId: varchar("resource_id"),
    ipAddress: varchar("ip_address"),
    userAgent: varchar("user_agent"),
    phiAccessed: boolean("phi_accessed").default(false),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_logs_user").on(table.userId),
    index("idx_audit_logs_created").on(table.createdAt),
  ],
);

export const promptsTable = pgTable("prompts", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  category: varchar("category").notNull().default("Custom"),
  tags: jsonb("tags").default(sql`'[]'`),
  isFavorite: boolean("is_favorite").default(false),
  usageCount: integer("usage_count").default(0),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const memoryEntriesTable = pgTable("memory_entries", {
  id: serial("id").primaryKey(),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  category: varchar("category").notNull().default("context"),
  source: varchar("source").notNull().default("user"),
  confidence: real("confidence").default(1.0),
  accessCount: integer("access_count").default(0),
  lastAccessed: timestamp("last_accessed", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const costUsageTable = pgTable(
  "cost_usage",
  {
    id: serial("id").primaryKey(),
    model: varchar("model").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costEstimate: real("cost_estimate").notNull().default(0),
    source: varchar("source").notNull().default("chat"),
    userId: varchar("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_cost_usage_created").on(table.createdAt),
    index("idx_cost_usage_model").on(table.model),
  ],
);

export const budgetAlertsTable = pgTable("budget_alerts", {
  id: serial("id").primaryKey(),
  threshold: real("threshold").notNull(),
  email: varchar("email").notNull(),
  enabled: boolean("enabled").default(true),
  triggered: boolean("triggered").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
export type Prompt = typeof promptsTable.$inferSelect;
export type InsertPrompt = typeof promptsTable.$inferInsert;
export type MemoryEntry = typeof memoryEntriesTable.$inferSelect;
export type InsertMemoryEntry = typeof memoryEntriesTable.$inferInsert;
export type CostUsage = typeof costUsageTable.$inferSelect;
export type InsertCostUsage = typeof costUsageTable.$inferInsert;
export type BudgetAlert = typeof budgetAlertsTable.$inferSelect;
export type InsertBudgetAlert = typeof budgetAlertsTable.$inferInsert;
