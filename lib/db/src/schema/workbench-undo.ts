import { boolean, index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export interface PersistedProjectDescriptor {
  origin: "local" | "vps" | "replit";
  path: string;
  name?: string;
  url?: string;
  ssh?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string;
  };
}

export const workbenchUndoEntriesTable = pgTable(
  "workbench_undo_entries",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    filePath: text("file_path").notNull(),
    previousContent: text("previous_content").notNull().default(""),
    newContent: text("new_content").notNull().default(""),
    isNew: boolean("is_new").notNull().default(false),
    projectDescriptor: jsonb("project_descriptor").$type<PersistedProjectDescriptor>().notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("IDX_workbench_undo_expires").on(table.expiresAt),
    index("IDX_workbench_undo_user").on(table.userId),
  ],
);

export type WorkbenchUndoEntry = typeof workbenchUndoEntriesTable.$inferSelect;
export type InsertWorkbenchUndoEntry = typeof workbenchUndoEntriesTable.$inferInsert;
