import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import { randomBytes } from "node:crypto";

const { default: monitorRouter } = await import("../src/routes/monitor");
const { sandboxHelpers } = await import("../src/lib/command-sandbox");
const { db, usersTable, pool: dbPool } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const expressMod = await import("express");
const express = expressMod.default;
type ExpressRequest = import("express").Request;
type ExpressResponse = import("express").Response;
type ExpressNextFunction = import("express").NextFunction;

const adminUserId = `test-admin-sandbox-${randomBytes(6).toString("hex")}`;
const memberUserId = `test-user-sandbox-${randomBytes(6).toString("hex")}`;
const createdUserIds: string[] = [];

const app = express();
app.use(express.json());
app.use((req: ExpressRequest, _res: ExpressResponse, next: ExpressNextFunction) => {
  const u = req.headers["x-test-user"];
  if (typeof u === "string" && u) {
    req.user = {
      id: u,
      email: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "user",
    };
    req.isAuthenticated = (() => true) as ExpressRequest["isAuthenticated"];
  } else {
    req.isAuthenticated = (() => false) as ExpressRequest["isAuthenticated"];
  }
  next();
});
app.use("/api", monitorRouter);

let server: http.Server;
let serverUrl = "";

before(async () => {
  await db.insert(usersTable).values({
    id: adminUserId,
    email: `${adminUserId}@example.com`,
    role: "admin",
  });
  createdUserIds.push(adminUserId);

  await db.insert(usersTable).values({
    id: memberUserId,
    email: `${memberUserId}@example.com`,
    role: "user",
  });
  createdUserIds.push(memberUserId);

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
  for (const id of createdUserIds) {
    try { await db.delete(usersTable).where(eq(usersTable.id, id)); } catch {}
  }
  try { await dbPool.end(); } catch {}
});

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${serverUrl}${url}`, { method: "GET", headers });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { _raw: text }; }
  return { status: res.status, body };
}

// =============================================================================
// /api/monitor/sandbox: at-a-glance OS sandbox posture for ops.
//
// The sandbox boot log has shown the kernel-jail kind for a while, but ops
// had to dig through Replit deploy logs to read it. This endpoint surfaces
// the same data on a request basis so admins can confirm production is
// running with a real bwrap/firejail/nsjail jail (rather than the
// path-validation fallback) without a restart.
// =============================================================================

test("GET /api/monitor/sandbox rejects unauthenticated callers (401)", async () => {
  const { status, body } = await getJson("/api/monitor/sandbox");
  assert.equal(status, 401);
  assert.equal(body.error, "Authentication required");
});

test("GET /api/monitor/sandbox rejects non-admin callers (403)", async () => {
  const { status, body } = await getJson(
    "/api/monitor/sandbox",
    { "x-test-user": memberUserId },
  );
  assert.equal(status, 403);
  assert.equal(body.error, "Admin access required");
});

test("GET /api/monitor/sandbox returns the live sandbox posture for admins", async () => {
  const { status, body } = await getJson(
    "/api/monitor/sandbox",
    { "x-test-user": adminUserId },
  );
  assert.equal(status, 200);

  // posture must mirror sandboxHelpers, not be a hardcoded value: a
  // regression that returns a stale "kernel-jail" on a fallback host
  // would defeat the entire point of the endpoint.
  if (sandboxHelpers.osIsolation) {
    assert.equal(body.posture, "kernel-jail");
    assert.ok(body.osIsolation);
    assert.equal(body.osIsolation.kind, sandboxHelpers.osIsolation.kind);
    assert.equal(body.osIsolation.bin, sandboxHelpers.osIsolation.bin);
    assert.match(body.osIsolation.kind, /^(bwrap|firejail|nsjail)$/);
  } else {
    assert.equal(body.posture, "fallback");
    assert.equal(body.osIsolation, null);
  }

  // setpriv / prlimit fields must be present (string or null) to match
  // the boot-log line.
  assert.ok("setpriv" in body);
  assert.ok("prlimit" in body);
  assert.equal(body.setpriv, sandboxHelpers.setpriv);
  assert.equal(body.prlimit, sandboxHelpers.prlimit);
});

test("GET /api/monitor/dashboard includes the sandbox posture for admins", async () => {
  const { status, body } = await getJson(
    "/api/monitor/dashboard",
    { "x-test-user": adminUserId },
  );
  // The dashboard fans out to several optional services (Ollama, VPS DB)
  // which may be unreachable in CI; we only care that the request was
  // authorized and that, when it succeeds, sandbox is present.
  if (status === 200) {
    assert.ok(body.sandbox, "dashboard should include sandbox posture");
    assert.match(body.sandbox.posture, /^(kernel-jail|fallback)$/);
    assert.equal(
      body.sandbox.posture,
      sandboxHelpers.osIsolation ? "kernel-jail" : "fallback",
    );
  } else {
    // Even on partial-failure paths the auth gate must have passed.
    assert.notEqual(status, 401);
    assert.notEqual(status, 403);
  }
});
