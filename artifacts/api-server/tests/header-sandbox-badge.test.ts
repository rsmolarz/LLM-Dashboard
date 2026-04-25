import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import { randomBytes } from "node:crypto";

// =============================================================================
// Header sandbox badge — admin-only enforcement (integration / e2e-style).
//
// Task #73 added a "Sandbox: kernel-jail" / "Sandbox: fallback" pill to the
// global app header (`SandboxStatusBadge` mounted in `AppLayout`). The
// visibility rule is layered:
//
//   1. Frontend  — `SandboxStatusBadge` early-returns null when
//                  `useAuth().isAdmin` is false. `useAuth` derives
//                  `isAdmin` from `GET /api/auth/user → user.role`.
//   2. Backend   — even if the React gate were bypassed, the only data
//                  source the badge has, `GET /api/monitor/sandbox`, sits
//                  behind `requireAdmin` (401 anonymous, 403 non-admin).
//
// `monitor-sandbox.test.ts` already pins down the raw `requireAdmin` gate
// using a header shim. This test goes one layer wider: it wires the *real*
// `authMiddleware` against real DB-backed sessions (the same code path the
// browser exercises when it sends its `sid` cookie), so a future refactor
// of `authMiddleware`, the session schema, or the role-propagation logic
// in `/api/auth/user` cannot quietly start leaking the admin badge to
// non-admins (or hiding it from admins) without this test failing.
//
// What we cover, per role:
//
//   anonymous (no `sid` cookie)
//     - GET /api/auth/user → { user: null }
//         → `useAuth.isAdmin` is false → badge null.
//     - GET /api/monitor/sandbox → 401
//         → fetch errors → badge stays null even if the React gate is
//           bypassed.
//
//   member (sid cookie → DB session for a `role: "user"` user)
//     - GET /api/auth/user → { user: { role: "user", ... } }
//         → `useAuth.isAdmin` is false → badge null.
//     - GET /api/monitor/sandbox → 403
//         → fetch errors → badge stays null even if the React gate is
//           bypassed.
//
//   admin (sid cookie → DB session for a `role: "admin"` user)
//     - GET /api/auth/user → { user: { role: "admin", ... } }
//         → `useAuth.isAdmin` is true → badge mounts and fetches.
//     - GET /api/monitor/sandbox → 200 with the live posture
//         → badge renders with `data-posture` matching the live posture
//           and an href deep-linking to `/monitor#sandbox`
//           (asserted on the JSON shape the badge consumes).
//
// We deliberately stand up a *real* express app with the real
// `authMiddleware` + `auth` router + `monitor` router rather than a test
// shim, so that:
//   - the cookie-based `sid` -> session lookup is exercised end-to-end,
//   - the role re-read from `usersTable` runs against a real row,
//   - and any future change to `SESSION_COOKIE`, session shape, or the
//     `/api/auth/user` payload that breaks the badge's assumptions will
//     surface here, not only when a real admin loads the dashboard.
// =============================================================================

const { authMiddleware } = await import("../src/middlewares/authMiddleware");
const { default: authRouter } = await import("../src/routes/auth");
const { default: monitorRouter } = await import("../src/routes/monitor");
const { sandboxHelpers } = await import("../src/lib/command-sandbox");
const {
  createSession,
  deleteSession,
  SESSION_COOKIE,
} = await import("../src/lib/auth");
const { db, usersTable, pool: dbPool } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const expressMod = await import("express");
const cookieParserMod = await import("cookie-parser");
const express = expressMod.default;
const cookieParser = cookieParserMod.default;

const adminUserId = `test-badge-admin-${randomBytes(6).toString("hex")}`;
const memberUserId = `test-badge-member-${randomBytes(6).toString("hex")}`;
const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];

let adminSid = "";
let memberSid = "";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware);
app.use("/api", authRouter);
app.use("/api", monitorRouter);

let server: http.Server;
let serverUrl = "";

before(async () => {
  await db.insert(usersTable).values({
    id: adminUserId,
    email: `${adminUserId}@example.com`,
    firstName: "Admin",
    lastName: "Tester",
    role: "admin",
  });
  createdUserIds.push(adminUserId);

  await db.insert(usersTable).values({
    id: memberUserId,
    email: `${memberUserId}@example.com`,
    firstName: "Member",
    lastName: "Tester",
    role: "user",
  });
  createdUserIds.push(memberUserId);

  const now = Math.floor(Date.now() / 1000);

  adminSid = await createSession({
    user: {
      id: adminUserId,
      email: `${adminUserId}@example.com`,
      firstName: "Admin",
      lastName: "Tester",
      profileImageUrl: null,
      // The sessionData carries a stale role; the real authMiddleware
      // re-reads it from `usersTable` on every request, so flipping the
      // DB row would flip what the badge sees. We assert the live
      // (DB) role wins, not this stashed value.
      role: "user",
    },
    access_token: "test-access-token",
    expires_at: now + 3600,
  });
  createdSessionIds.push(adminSid);

  memberSid = await createSession({
    user: {
      id: memberUserId,
      email: `${memberUserId}@example.com`,
      firstName: "Member",
      lastName: "Tester",
      profileImageUrl: null,
      role: "user",
    },
    access_token: "test-access-token",
    expires_at: now + 3600,
  });
  createdSessionIds.push(memberSid);

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
  for (const sid of createdSessionIds) {
    try { await deleteSession(sid); } catch {}
  }
  for (const id of createdUserIds) {
    try { await db.delete(usersTable).where(eq(usersTable.id, id)); } catch {}
  }
  try { await dbPool.end(); } catch {}
});

async function getJson(url: string, sid?: string) {
  const headers: Record<string, string> = {};
  if (sid) headers.cookie = `${SESSION_COOKIE}=${sid}`;
  const res = await fetch(`${serverUrl}${url}`, { method: "GET", headers });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { _raw: text }; }
  return { status: res.status, body };
}

// ---- anonymous --------------------------------------------------------------

test("anonymous: useAuth().isAdmin will be false (badge stays null)", async () => {
  const { status, body } = await getJson("/api/auth/user");
  // /api/auth/user always returns 200; an anonymous caller gets `user: null`.
  // The web client's `useAuth` derives `isAdmin = user?.role === "admin"`,
  // so a null user means `isAdmin === false` → SandboxStatusBadge's first
  // early-return fires.
  assert.equal(status, 200);
  assert.equal(body.user, null);
});

test("anonymous: /api/monitor/sandbox is 401 (badge has no posture to render)", async () => {
  const { status, body } = await getJson("/api/monitor/sandbox");
  // Even if the React `if (!isAdmin) return null` gate were ever bypassed,
  // the badge's only data source is gated server-side. A 401 makes the
  // badge's `setError(true)` fire and `data` stays null → component returns
  // null. This is the second-line defense.
  assert.equal(status, 401);
  assert.equal(body.error, "Authentication required");
});

// ---- member (signed-in, role=user) ------------------------------------------

test("member: useAuth().isAdmin will be false (badge stays null)", async () => {
  const { status, body } = await getJson("/api/auth/user", memberSid);
  assert.equal(status, 200);
  assert.ok(body.user, "/api/auth/user should return the signed-in member");
  assert.equal(body.user.id, memberUserId);
  // The role MUST be re-read from the DB by /api/auth/user, not echoed from
  // the stashed session payload. If a future refactor stops doing that
  // re-read, an admin demoted in the DB could keep seeing the badge until
  // their session expires — that would be the leak this test is here to
  // catch.
  assert.equal(body.user.role, "user");
});

test("member: /api/monitor/sandbox is 403 (badge has no posture to render)", async () => {
  const { status, body } = await getJson("/api/monitor/sandbox", memberSid);
  assert.equal(status, 403);
  assert.equal(body.error, "Admin access required");
});

// ---- admin (signed-in, role=admin) ------------------------------------------

test("admin: useAuth().isAdmin will be true (badge mounts and fetches)", async () => {
  const { status, body } = await getJson("/api/auth/user", adminSid);
  assert.equal(status, 200);
  assert.ok(body.user, "/api/auth/user should return the signed-in admin");
  assert.equal(body.user.id, adminUserId);
  // This is the value `useAuth` keys off of for `isAdmin`. If this stops
  // being "admin" for a DB row with role=admin, the badge silently
  // disappears for ops.
  assert.equal(body.user.role, "admin");
});

test("admin: /api/monitor/sandbox returns the live posture for the badge", async () => {
  const { status, body } = await getJson("/api/monitor/sandbox", adminSid);
  assert.equal(status, 200);

  // The badge consumes `posture`, `osIsolation`, `setpriv`, `prlimit` —
  // and renders `data-posture={posture}` with text "Sandbox: <posture>".
  // We assert the JSON shape the badge depends on, and that the values
  // mirror the live `sandboxHelpers` (NOT a stale literal), because a
  // hardcoded "kernel-jail" return value would defeat the entire reason
  // the badge exists.
  assert.match(body.posture, /^(kernel-jail|fallback)$/);
  if (sandboxHelpers.osIsolation) {
    assert.equal(body.posture, "kernel-jail");
    assert.ok(body.osIsolation);
    assert.equal(body.osIsolation.kind, sandboxHelpers.osIsolation.kind);
    assert.equal(body.osIsolation.bin, sandboxHelpers.osIsolation.bin);
  } else {
    assert.equal(body.posture, "fallback");
    assert.equal(body.osIsolation, null);
  }
  assert.ok("setpriv" in body);
  assert.ok("prlimit" in body);
  assert.equal(body.setpriv, sandboxHelpers.setpriv);
  assert.equal(body.prlimit, sandboxHelpers.prlimit);
});

// ---- session role flip (regression for "stale session leaks admin") ---------

test("admin demoted to user in DB: /api/auth/user reflects the new role on the next request", async () => {
  // Flip the role in the DB without invalidating the session.
  await db.update(usersTable).set({ role: "user" }).where(eq(usersTable.id, adminUserId));
  try {
    const { status, body } = await getJson("/api/auth/user", adminSid);
    assert.equal(status, 200);
    // If this assertion ever flips back to "admin", a demoted user would
    // keep seeing the sandbox badge until their session expires —
    // exactly the kind of regression task #92 is meant to pin down.
    assert.equal(body.user.role, "user");

    // And the API gate immediately follows suit, so the badge would also
    // lose its data source on the next poll.
    const sandboxRes = await getJson("/api/monitor/sandbox", adminSid);
    assert.equal(sandboxRes.status, 403);
  } finally {
    // Restore the row so test order doesn't matter and `after()` cleanup
    // hits a known shape.
    await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, adminUserId));
  }
});
