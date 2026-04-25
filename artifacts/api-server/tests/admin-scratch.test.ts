import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import { randomBytes, createHash } from "node:crypto";

const PROJECT_ROOT = path.resolve(process.cwd(), "../..");
const SCRATCH_ROOT = path.join(PROJECT_ROOT, ".cache", "workbench-sandbox");

const userWs = await import("../src/lib/user-workspace");
const { default: adminScratchRouter } = await import("../src/routes/admin-scratch");
const { pool: dbPool, db, usersTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const expressMod = await import("express");
const express = expressMod.default;
type ExpressRequest = import("express").Request;
type ExpressResponse = import("express").Response;
type ExpressNextFunction = import("express").NextFunction;

const app = express();
app.use(express.json({ limit: "1mb" }));
// Same test auth shim as `admin-workbench.test.ts`: `x-test-user`
// + (optional) `x-test-role` to fake an authenticated session.
// `requireAdmin` re-reads `role` from the DB so we still provision
// real rows for each test user below.
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
app.use("/api", adminScratchRouter);

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
  try { userWs.setUserQuotaBytes(null); } catch {}
  try { userWs.setHostQuotaBytes(null); } catch {}
  try { await dbPool.end(); } catch { /* may be closed */ }
});

function trackUser(userId: string): string {
  createdUsers.push(userId);
  return userId;
}

test("GET /api/admin/scratch requires admin role (401 anon, 403 non-admin)", async () => {
  const anon = await fetch(`${serverUrl}/api/admin/scratch`);
  assert.equal(anon.status, 401);
  const nonAdminId = `as-non-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(nonAdminId, "user");
  const forbid = await fetch(`${serverUrl}/api/admin/scratch`, {
    headers: { "x-test-user": nonAdminId },
  });
  assert.equal(forbid.status, 403);
});

test("GET /api/admin/scratch (no params) returns the host overview with the target user listed", async () => {
  const adminId = `as-admin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const u = trackUser(`as-overview-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(u);
  fs.writeFileSync(path.join(dir, "fixture.bin"), Buffer.alloc(2048));

  const res = await fetch(`${serverUrl}/api/admin/scratch`, {
    headers: { "x-test-user": adminId },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    totalBytes: number;
    users: Array<{ userIdHash: string; usedBytes: number }>;
  };
  const ours = body.users.find((x) => x.userIdHash === userIdHash(u));
  assert.ok(ours, "test user must appear in the admin overview");
  assert.ok(ours!.usedBytes >= 2048);
});

test("GET /api/admin/scratch?userIdHash=... lists another user's scratch contents", async () => {
  const adminId = `as-list-admin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const u = trackUser(`as-list-user-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(u);
  fs.writeFileSync(path.join(dir, "report.txt"), "hello world");
  fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
  fs.writeFileSync(path.join(dir, "sub", "deep.bin"), Buffer.alloc(64));

  const res = await fetch(
    `${serverUrl}/api/admin/scratch?userIdHash=${userIdHash(u)}`,
    { headers: { "x-test-user": adminId } },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    path: string;
    entries: Array<{ name: string; type: string; isSymlink: boolean }>;
    quota: { usedBytes: number; capBytes: number; remainingBytes: number };
  };
  const names = body.entries.map((e) => e.name);
  assert.ok(names.includes("report.txt"), `expected report.txt in entries: ${names.join(",")}`);
  assert.ok(names.includes("sub"), `expected sub dir in entries: ${names.join(",")}`);
  assert.ok(body.quota.usedBytes >= 11, "quota must reflect the user's on-disk bytes");
});

test("GET /api/admin/scratch?userIdHash=... drills into a sub-path", async () => {
  const adminId = `as-drill-admin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const u = trackUser(`as-drill-user-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(u);
  fs.mkdirSync(path.join(dir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "logs", "error.log"), "oops");

  const res = await fetch(
    `${serverUrl}/api/admin/scratch?userIdHash=${userIdHash(u)}&path=logs`,
    { headers: { "x-test-user": adminId } },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { entries: Array<{ name: string }> };
  assert.ok(body.entries.find((e) => e.name === "error.log"), "must list nested file");
});

test("GET /api/admin/scratch returns 400 for malformed userIdHash, 404 for missing user", async () => {
  const adminId = `as-bad-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");

  const bad = await fetch(`${serverUrl}/api/admin/scratch?userIdHash=not-a-hash`, {
    headers: { "x-test-user": adminId },
  });
  assert.equal(bad.status, 400);

  // Valid 16-hex hash that doesn't match any user → ENOENT → 404.
  const missing = await fetch(`${serverUrl}/api/admin/scratch?userIdHash=0123456789abcdef`, {
    headers: { "x-test-user": adminId },
  });
  assert.equal(missing.status, 404);
});

test("DELETE /api/admin/scratch removes a single entry from another user's scratch", async () => {
  const adminId = `as-del-admin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const u = trackUser(`as-del-user-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(u);
  fs.writeFileSync(path.join(dir, "doomed.bin"), Buffer.alloc(1024));
  fs.writeFileSync(path.join(dir, "keep.bin"), Buffer.alloc(1024));

  const res = await fetch(
    `${serverUrl}/api/admin/scratch?userIdHash=${userIdHash(u)}&path=${encodeURIComponent("doomed.bin")}`,
    { method: "DELETE", headers: { "x-test-user": adminId } },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { deletedPath: string; quota: { usedBytes: number } };
  assert.equal(body.deletedPath, "doomed.bin");
  assert.ok(!fs.existsSync(path.join(dir, "doomed.bin")), "doomed.bin must be gone");
  assert.ok(fs.existsSync(path.join(dir, "keep.bin")), "keep.bin must survive");
});

test("DELETE /api/admin/scratch refuses paths that escape the target user's scratch dir", async () => {
  const adminId = `as-esc-admin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const target = trackUser(`as-esc-target-${randomBytes(4).toString("hex")}`);
  const other = trackUser(`as-esc-other-${randomBytes(4).toString("hex")}`);
  userWs.ensureUserScratchDir(target);
  const otherDir = userWs.ensureUserScratchDir(other);
  fs.writeFileSync(path.join(otherDir, "secret.txt"), "hands off");

  // Try to traverse from `target` into `other`'s scratch dir.
  const escapePath = `../../${userIdHash(other)}/host/secret.txt`;
  const res = await fetch(
    `${serverUrl}/api/admin/scratch?userIdHash=${userIdHash(target)}&path=${encodeURIComponent(escapePath)}`,
    { method: "DELETE", headers: { "x-test-user": adminId } },
  );
  assert.equal(res.status, 400);
  assert.ok(
    fs.existsSync(path.join(otherDir, "secret.txt")),
    "the other user's secret.txt must NOT have been deleted",
  );
});

test("DELETE /api/admin/scratch requires both userIdHash and path", async () => {
  const adminId = `as-del-args-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");

  const noHash = await fetch(
    `${serverUrl}/api/admin/scratch?path=foo.txt`,
    { method: "DELETE", headers: { "x-test-user": adminId } },
  );
  assert.equal(noHash.status, 400);

  const noPath = await fetch(
    `${serverUrl}/api/admin/scratch?userIdHash=0123456789abcdef`,
    { method: "DELETE", headers: { "x-test-user": adminId } },
  );
  assert.equal(noPath.status, 400);
});

test("POST /api/admin/scratch/clear wipes all real entries in another user's scratch", async () => {
  const adminId = `as-clr-admin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const u = trackUser(`as-clr-user-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(u);
  fs.writeFileSync(path.join(dir, "a.bin"), Buffer.alloc(2048));
  fs.mkdirSync(path.join(dir, "subdir"), { recursive: true });
  fs.writeFileSync(path.join(dir, "subdir", "nested.txt"), "data");
  const beforeUsage = userWs.computeUserScratchUsage(u);
  assert.ok(beforeUsage >= 2048);

  const res = await fetch(
    `${serverUrl}/api/admin/scratch/clear?userIdHash=${userIdHash(u)}`,
    { method: "POST", headers: { "x-test-user": adminId } },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { removed: string[]; quota: { usedBytes: number } };
  assert.ok(body.removed.includes("a.bin"));
  assert.ok(body.removed.includes("subdir"));
  assert.equal(body.quota.usedBytes, 0, "post-clear usage must be zero");
  assert.ok(!fs.existsSync(path.join(dir, "a.bin")));
  assert.ok(!fs.existsSync(path.join(dir, "subdir")));
  // The host-mirror symlinks must still be there after the clear.
  let hadSymlink = false;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isSymbolicLink()) { hadSymlink = true; break; }
  }
  assert.ok(hadSymlink, "clear must re-sync the host-mirror symlink view");
});

test("POST /api/admin/scratch/clear requires userIdHash and admin role", async () => {
  const noHashRes = await fetch(`${serverUrl}/api/admin/scratch/clear`, {
    method: "POST",
  });
  // No auth at all → 401.
  assert.equal(noHashRes.status, 401);

  const adminId = `as-clr-args-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(adminId, "admin");
  const noHash = await fetch(`${serverUrl}/api/admin/scratch/clear`, {
    method: "POST",
    headers: { "x-test-user": adminId },
  });
  assert.equal(noHash.status, 400);

  const nonAdminId = `as-clr-nonadmin-${randomBytes(4).toString("hex")}`;
  await provisionDbUser(nonAdminId, "user");
  const forbid = await fetch(
    `${serverUrl}/api/admin/scratch/clear?userIdHash=0123456789abcdef`,
    { method: "POST", headers: { "x-test-user": nonAdminId } },
  );
  assert.equal(forbid.status, 403);
});
