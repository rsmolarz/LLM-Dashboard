import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import { randomBytes, createHash } from "node:crypto";

const PROJECT_ROOT = path.resolve(process.cwd(), "../..");
const SCRATCH_ROOT = path.join(PROJECT_ROOT, ".cache", "workbench-sandbox");

const userWs = await import("../src/lib/user-workspace");
const { default: adminRouter } = await import("../src/routes/admin-workbench");
const { pool: dbPool, db, usersTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const expressMod = await import("express");
const express = expressMod.default;
type ExpressRequest = import("express").Request;
type ExpressResponse = import("express").Response;
type ExpressNextFunction = import("express").NextFunction;

const app = express();
app.use(express.json({ limit: "1mb" }));
// Test auth shim — pass `x-test-user: <id>` and (optionally)
// `x-test-role: admin|user` to simulate an authenticated request.
// The real `requireAdmin` middleware then re-reads the user's role
// from the DB, so we provision real DB rows below for the test users.
app.use((req: ExpressRequest, _res: ExpressResponse, next: ExpressNextFunction) => {
  const u = req.headers["x-test-user"];
  const role = req.headers["x-test-role"];
  if (typeof u === "string" && u) {
    req.user = {
      id: u,
      email: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: typeof role === "string" ? role : "user",
    };
    req.isAuthenticated = (() => true) as ExpressRequest["isAuthenticated"];
  } else {
    req.isAuthenticated = (() => false) as ExpressRequest["isAuthenticated"];
  }
  next();
});
app.use("/api", adminRouter);

let server: http.Server;
let serverUrl = "";
const createdUsers: string[] = [];
const createdDbUsers: string[] = [];

function userIdHash(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

function scratchPathFor(userId: string): string {
  return path.join(SCRATCH_ROOT, userIdHash(userId), "host");
}

async function provisionDbUser(id: string, role: "admin" | "user"): Promise<void> {
  // The real `requireAdmin` middleware reloads `role` from the DB on
  // every call. To exercise it honestly we have to insert a real row.
  // Use upsert semantics so re-runs are idempotent.
  await db
    .insert(usersTable)
    .values({ id, email: `${id}@test.local`, role })
    .onConflictDoUpdate({ target: usersTable.id, set: { role } });
  createdDbUsers.push(id);
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      serverUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close(() => resolve());
  });
  try { userWs.stopScratchCleanupSchedule(); } catch {}
  for (const userId of createdUsers) {
    const userHashDir = path.dirname(scratchPathFor(userId));
    if (fs.existsSync(userHashDir)) {
      try { fs.rmSync(userHashDir, { recursive: true, force: true }); } catch {}
    }
  }
  for (const id of createdDbUsers) {
    try { await db.delete(usersTable).where(eq(usersTable.id, id)); } catch {}
  }
  // Restore caps to defaults in case anything earlier in the run set them.
  try { userWs.setUserQuotaBytes(null); } catch {}
  try { userWs.setHostQuotaBytes(null); } catch {}
  try { await dbPool.end(); } catch { /* may be closed */ }
});

function trackUser(userId: string): string {
  createdUsers.push(userId);
  return userId;
}

test("GET /api/admin/workbench-quotas requires admin role (401 anon, 403 non-admin)", async () => {
  const anon = await fetch(`${serverUrl}/api/admin/workbench-quotas`);
  assert.equal(anon.status, 401);

  const nonAdminId = `wq-nonadmin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(nonAdminId, "user");
  const forbid = await fetch(`${serverUrl}/api/admin/workbench-quotas`, {
    headers: { "x-test-user": nonAdminId },
  });
  assert.equal(forbid.status, 403);
});

test("GET /api/admin/workbench-quotas returns current caps + defaults for admins", async () => {
  const adminId = `wq-admin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const res = await fetch(`${serverUrl}/api/admin/workbench-quotas`, {
    headers: { "x-test-user": adminId },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    userQuotaBytes: number;
    hostQuotaBytes: number;
    defaults: { userQuotaBytes: number; hostQuotaBytes: number };
  };
  assert.ok(Number.isInteger(body.userQuotaBytes) && body.userQuotaBytes > 0);
  assert.ok(Number.isInteger(body.hostQuotaBytes) && body.hostQuotaBytes > 0);
  assert.equal(body.defaults.userQuotaBytes, 1024 * 1024 * 1024);
  assert.equal(body.defaults.hostQuotaBytes, 10 * 1024 * 1024 * 1024);
});

test("PUT /api/admin/workbench-quotas updates caps and they take effect immediately", async () => {
  const adminId = `wq-put-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const newUser = 2048;
  const newHost = 4096;
  try {
    const res = await fetch(`${serverUrl}/api/admin/workbench-quotas`, {
      method: "PUT",
      headers: { "x-test-user": adminId, "Content-Type": "application/json" },
      body: JSON.stringify({ userQuotaBytes: newUser, hostQuotaBytes: newHost }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { userQuotaBytes: number; hostQuotaBytes: number };
    assert.equal(body.userQuotaBytes, newUser);
    assert.equal(body.hostQuotaBytes, newHost);
    // Live module state must reflect the change so future callers
    // (shell route, cleanup task, etc.) actually use the new caps.
    assert.equal(userWs.getUserQuotaBytes(), newUser);
    assert.equal(userWs.getHostQuotaBytes(), newHost);
  } finally {
    userWs.setUserQuotaBytes(null);
    userWs.setHostQuotaBytes(null);
  }
});

test("PUT /api/admin/workbench-quotas with null restores the env / compile-time default", async () => {
  const adminId = `wq-reset-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  // Set an off-default value first so we can observe the reset.
  userWs.setUserQuotaBytes(123);
  try {
    const res = await fetch(`${serverUrl}/api/admin/workbench-quotas`, {
      method: "PUT",
      headers: { "x-test-user": adminId, "Content-Type": "application/json" },
      body: JSON.stringify({ userQuotaBytes: null }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { userQuotaBytes: number };
    // Default per the module is 1 GiB (or whatever the env sets).
    assert.notEqual(body.userQuotaBytes, 123);
    assert.ok(body.userQuotaBytes >= 1024 * 1024);
  } finally {
    userWs.setUserQuotaBytes(null);
  }
});

test("PUT /api/admin/workbench-quotas rejects non-positive / non-integer input", async () => {
  const adminId = `wq-bad-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const before = userWs.getUserQuotaBytes();
  const cases: Array<unknown> = [-1, 0, 1.5, "1024", true];
  for (const v of cases) {
    const res = await fetch(`${serverUrl}/api/admin/workbench-quotas`, {
      method: "PUT",
      headers: { "x-test-user": adminId, "Content-Type": "application/json" },
      body: JSON.stringify({ userQuotaBytes: v }),
    });
    assert.equal(res.status, 400, `expected 400 for input ${JSON.stringify(v)}`);
  }
  // Live cap must not have shifted under any of those invalid inputs.
  assert.equal(userWs.getUserQuotaBytes(), before);
});

test("PUT /api/admin/workbench-quotas with empty body is a 400", async () => {
  const adminId = `wq-empty-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const res = await fetch(`${serverUrl}/api/admin/workbench-quotas`, {
    method: "PUT",
    headers: { "x-test-user": adminId, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 400);
});

test("GET /api/admin/workbench-usage returns host total + per-user breakdown with overThreshold flags", async () => {
  const adminId = `wq-usage-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  // Write a known-size file into a fresh user dir and shrink the
  // per-user cap so the entry crosses the 80% threshold.
  const u = trackUser(`wq-usage-user-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(u);
  const FILE_BYTES = 4096;
  fs.writeFileSync(path.join(dir, "fixture.bin"), Buffer.alloc(FILE_BYTES));
  userWs.setUserQuotaBytes(5000); // 4096 / 5000 ≈ 82% > 80% threshold
  try {
    const res = await fetch(`${serverUrl}/api/admin/workbench-usage`, {
      headers: { "x-test-user": adminId },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      totalBytes: number;
      hostCapBytes: number;
      userCapBytes: number;
      overThresholdPct: number;
      users: Array<{ userIdHash: string; usedBytes: number; mtimeMs: number; overThreshold: boolean }>;
    };
    assert.ok(body.totalBytes >= FILE_BYTES);
    assert.equal(body.userCapBytes, 5000);
    assert.equal(body.overThresholdPct, 0.8);
    const ours = body.users.find((x) => x.userIdHash === userIdHash(u));
    assert.ok(ours, "test user must appear in the usage list");
    assert.equal(ours!.usedBytes, FILE_BYTES);
    assert.equal(ours!.overThreshold, true);
  } finally {
    userWs.setUserQuotaBytes(null);
  }
});

test("POST /api/admin/workbench-evict triggers a host-cap eviction sweep and returns the report", async () => {
  const adminId = `wq-evict-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const big = trackUser(`wq-evict-big-${randomBytes(4).toString("hex")}`);
  const small = trackUser(`wq-evict-small-${randomBytes(4).toString("hex")}`);
  const dirBig = userWs.ensureUserScratchDir(big);
  const dirSmall = userWs.ensureUserScratchDir(small);
  fs.writeFileSync(path.join(dirBig, "f.bin"), Buffer.alloc(50_000));
  fs.writeFileSync(path.join(dirSmall, "f.bin"), Buffer.alloc(500));
  userWs.setHostQuotaBytes(10_000); // forces big to be evicted
  try {
    const res = await fetch(`${serverUrl}/api/admin/workbench-evict`, {
      method: "POST",
      headers: { "x-test-user": adminId },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      removed: string[];
      evicted: string[];
      kept: number;
      errors: Array<{ path: string; message: string }>;
      usage: { totalBytes: number; users: Array<{ userIdHash: string }> };
    };
    assert.ok(
      body.evicted.includes(userIdHash(big)),
      `big user must be evicted: ${JSON.stringify(body)}`,
    );
    assert.ok(!fs.existsSync(dirBig), "big user dir must be gone");
    assert.ok(fs.existsSync(dirSmall), "small user dir must survive");
    // The returned usage snapshot must reflect post-eviction state.
    assert.ok(
      !body.usage.users.some((u) => u.userIdHash === userIdHash(big)),
      "post-eviction usage snapshot must not list the evicted user",
    );
  } finally {
    userWs.setHostQuotaBytes(null);
  }
});

test("POST /api/admin/workbench-evict requires admin role", async () => {
  const anon = await fetch(`${serverUrl}/api/admin/workbench-evict`, { method: "POST" });
  assert.equal(anon.status, 401);
  const nonAdminId = `wq-evict-nonadmin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(nonAdminId, "user");
  const forbid = await fetch(`${serverUrl}/api/admin/workbench-evict`, {
    method: "POST",
    headers: { "x-test-user": nonAdminId },
  });
  assert.equal(forbid.status, 403);
});
