// Non-interactive Drizzle "push" used by the e2e validation hook (and anyone
// else that needs to bring a workspace Postgres up to the current schema
// without a TTY).
//
// Why this exists
// ----------------
// `drizzle-kit push --force` is *not* fully non-interactive:
//   * `--force` only auto-approves data-loss prompts (e.g. dropping a column).
//   * It does NOT resolve the rename-detection prompt
//     ("Is workbench_undo_entries created or renamed from compliance_reviews?").
//   * It does NOT resolve the "add unique constraint to a table that already
//     has rows; truncate or not?" prompt.
// Both prompts are raw-mode TTY menus rendered by the bundled `hanji`
// library. Under piped stdin they hang and eventually get killed with
// SIGTERM, which is exactly what kills the e2e validation hook in a fresh
// task agent environment whose snapshotted Postgres still contains stale
// tables from older branches.
//
// What this script does
// ---------------------
// 1. Drops any `public.*` tables that are NOT present in the current Drizzle
//    schema. After this step there are no "removed" tables for drizzle's
//    diff, so the rename-detection prompt cannot trigger.
// 2. Installs a stdin shim that makes `hanji` think it has a TTY and
//    auto-presses Enter on every prompt it tries to render. Enter selects
//    the highlighted *default* option, which for every push prompt is the
//    safe choice (e.g. "create new table", "add the constraint without
//    truncating").
// 3. Calls `pushSchema` from `drizzle-kit/api`, which then runs to
//    completion without any human input.
//
// Scope and safety
// ----------------
// THIS IS DESTRUCTIVE. It is meant only for disposable/dev databases
// such as the workspace Postgres used by the e2e validation hook:
//   * Step 1 unconditionally drops every `public.*` table that isn't in
//     the current Drizzle schema (with CASCADE). Any non-Drizzle
//     bookkeeping tables you keep in `public` would be wiped.
//   * Step 2 auto-confirms the *default* answer on every drizzle push
//     prompt, including ones that may discard column data.
// Production migrations still go through `pnpm --filter @workspace/db
// push` from `scripts/post-merge.sh`, which is interactive and runs
// against the production-shaped DB.
import process from "node:process";
import { EventEmitter } from "node:events";

installHanjiAutoConfirmShim();

const pg = (await import("pg")).default;
const { drizzle } = await import("drizzle-orm/node-postgres");
const { getTableConfig, PgTable } = await import("drizzle-orm/pg-core");
const { is } = await import("drizzle-orm");
const { pushSchema } = await import("drizzle-kit/api");
const schema = await import("../src/schema/index.ts");

function installHanjiAutoConfirmShim(): void {
  // hanji creates a new readline interface for each prompt and listens for
  // `keypress` events on `process.stdin`. We can't get our keystrokes into
  // its readline pipeline through normal piping, because:
  //   * piped stdin is not a TTY, so hanji never enters raw mode and the
  //     keypress events readline emits don't include the structured `key`
  //     descriptor hanji checks (`key.name === "return"`);
  //   * once one prompt resolves, hanji closes its readline interface, and
  //     a second prompt creates a brand-new one — there's no single, long-
  //     lived input pipeline to feed.
  //
  // So instead we patch `process.stdin.addListener("keypress", ...)`: every
  // time hanji subscribes to `keypress` we know a new prompt has just been
  // rendered, and we can synchronously emit a synthetic Enter on the next
  // tick. That selects whatever the prompt's default highlighted option is.
  const stdin = process.stdin as unknown as EventEmitter & {
    isTTY?: boolean;
    setRawMode?: (mode: boolean) => unknown;
  };

  // Make hanji's `if (this.stdin.isTTY) this.stdin.setRawMode(true)` happy
  // without actually flipping the real TTY (there isn't one).
  Object.defineProperty(stdin, "isTTY", {
    configurable: true,
    get: () => true,
  });
  stdin.setRawMode = () => stdin;

  const originalAddListener = stdin.addListener.bind(stdin);
  const wrappedAddListener: typeof stdin.addListener = (event, listener) => {
    const result = originalAddListener(event, listener);
    if (event === "keypress") {
      // Defer so the prompt finishes rendering before we "press" Enter.
      setImmediate(() => {
        try {
          stdin.emit("keypress", "\r", { name: "return" });
        } catch {
          // If hanji has already torn down by the time we fire, that's fine.
        }
      });
    }
    return result;
  };
  stdin.addListener = wrappedAddListener;
  stdin.on = wrappedAddListener;
}

function collectSchemaTables(imports: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const value of Object.values(imports)) {
    if (is(value, PgTable)) {
      const { name, schema: tableSchema } = getTableConfig(value as InstanceType<typeof PgTable>);
      // Only manage the default `public` schema; other schemas are out of
      // scope for this script (and drizzle-kit's default behaviour anyway).
      if (!tableSchema || tableSchema === "public") {
        names.add(name);
      }
    }
  }
  return names;
}

async function dropStaleTables(
  pool: InstanceType<typeof pg.Pool>,
  expected: Set<string>,
): Promise<string[]> {
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  const stale = rows
    .map((r) => r.tablename)
    .filter((t) => !expected.has(t))
    // Drizzle's own bookkeeping table — leave it alone if it ever appears.
    .filter((t) => t !== "__drizzle_migrations");

  if (stale.length === 0) {
    return [];
  }

  // Quote each identifier defensively in case a name needs escaping.
  const quoted = stale.map((t) => `"${t.replace(/"/g, '""')}"`).join(", ");
  await pool.query(`DROP TABLE IF EXISTS ${quoted} CASCADE`);
  return stale;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set; cannot push schema. Provision a database first.",
    );
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const expected = collectSchemaTables(schema as Record<string, unknown>);
    const dropped = await dropStaleTables(pool, expected);
    if (dropped.length > 0) {
      console.log(
        `[db:push:auto] dropped ${dropped.length} stale table(s) not in schema: ${dropped.join(", ")}`,
      );
    }

    const { hasDataLoss, warnings, statementsToExecute, apply } =
      await pushSchema(schema as Record<string, unknown>, db);

    if (statementsToExecute.length === 0) {
      console.log("[db:push:auto] schema is already up to date");
      return;
    }

    console.log(
      `[db:push:auto] applying ${statementsToExecute.length} statement(s)` +
        (hasDataLoss ? " (includes data-loss changes)" : ""),
    );
    for (const warning of warnings) {
      console.log(`[db:push:auto] ${warning}`);
    }
    for (const stmt of statementsToExecute) {
      const oneLine = stmt.replace(/\s+/g, " ").trim();
      const preview = oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
      console.log(`[db:push:auto]   > ${preview}`);
    }

    await apply();
    console.log("[db:push:auto] done");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[db:push:auto] failed:", err);
  process.exit(1);
});
