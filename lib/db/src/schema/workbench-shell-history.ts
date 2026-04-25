import { bigserial, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const workbenchShellHistoryTable = pgTable(
  "workbench_shell_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: varchar("user_id").notNull(),
    command: text("command").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("IDX_workbench_shell_history_user_created").on(table.userId, table.createdAt),
  ],
);

export type WorkbenchShellHistoryEntry = typeof workbenchShellHistoryTable.$inferSelect;
export type InsertWorkbenchShellHistoryEntry = typeof workbenchShellHistoryTable.$inferInsert;
