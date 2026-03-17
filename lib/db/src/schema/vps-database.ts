import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vpsDatabaseConfigTable = pgTable("vps_database_config", {
  id: serial("id").primaryKey(),
  host: text("host").notNull().default(""),
  port: text("port").notNull().default("5432"),
  database: text("database").notNull().default(""),
  username: text("username").notNull().default(""),
  password: text("password").notNull().default(""),
  sslEnabled: boolean("ssl_enabled").notNull().default(false),
  isActive: boolean("is_active").notNull().default(false),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  lastTestResult: text("last_test_result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVpsDatabaseConfigSchema = createInsertSchema(vpsDatabaseConfigTable).omit({
  id: true, createdAt: true, updatedAt: true, lastTestedAt: true, lastTestResult: true,
});
export type InsertVpsDatabaseConfig = z.infer<typeof insertVpsDatabaseConfigSchema>;
export type VpsDatabaseConfig = typeof vpsDatabaseConfigTable.$inferSelect;
