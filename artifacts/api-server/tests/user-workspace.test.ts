import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import { randomBytes, createHash } from "node:crypto";

const PROJECT_ROOT = path.resolve(process.cwd(), "../..");
const SCRATCH_ROOT = path.join(PROJECT_ROOT, ".cache", "workbench-sandbox");

const userWs = await import("../src/lib/user-workspace");
const { default: workbenchRouter } = await import("../src/routes/workbench");
const { pool: dbPool } = await import("@workspace/db");
const expressMod = await import("express");
const express = expressMod.default;
type ExpressRequest = import("express").Request;
type ExpressResponse = import("express").Response;
type ExpressNextFunction = import("express").NextFunction;

const app = express();
app.use(express.json({ limit: "1mb" }));
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
app.use("/api", workbenchRouter);

let server: http.Server;
let serverUrl = "";
const createdUsers: string[] = [];

function userIdHash(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

function scratchPathFor(userId: string): string {
  return path.join(SCRATCH_ROOT, userIdHash(userId), "host");
}

function trackUser(userId: string): string {
  createdUsers.push(userId);
  return userId;
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
  // Stop the auto-started cleanup interval (if any) so the test
  // process exits promptly.
  try { userWs.stopScratchCleanupSchedule(); } catch {}
  // Wipe per-test scratch dirs to keep the workspace tidy.
  for (const userId of createdUsers) {
    const userHashDir = path.dirname(scratchPathFor(userId));
    if (fs.existsSync(userHashDir)) {
      try { fs.rmSync(userHashDir, { recursive: true, force: true }); } catch {}
    }
  }
  try { await dbPool.end(); } catch { /* may be closed */ }
});

interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  scope?: { origin: string; path: string };
  sandboxBlocked?: string;
}

async function shell(userId: string, command: string): Promise<{ status: number; body: ShellResult }> {
  const res = await fetch(`${serverUrl}/api/shell`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user": userId },
    body: JSON.stringify({ command }),
  });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { _raw: text }; }
  return { status: res.status, body };
}

// =============================================================================
// Direct module unit tests
// =============================================================================

test("getUserScratchDir lives under .cache/workbench-sandbox/<hash>/host", () => {
  const userId = trackUser(`unit-getdir-${randomBytes(4).toString("hex")}`);
  const dir = userWs.getUserScratchDir(userId);
  assert.ok(
    dir.startsWith(SCRATCH_ROOT),
    `expected scratch dir under ${SCRATCH_ROOT}, got ${dir}`,
  );
  assert.ok(dir.endsWith(path.join(userIdHash(userId), "host")));
  assert.notEqual(dir.indexOf(userId), 0, "userId must be hashed, not stored verbatim");
  assert.ok(!dir.includes(userId), "raw userId must not appear in scratch path");
});

test("getUserScratchDir refuses empty userId", () => {
  assert.throws(() => userWs.getUserScratchDir(""), /userId is required/);
});

test("ensureUserScratchDir creates dir on demand and is idempotent", () => {
  const userId = trackUser(`unit-ensure-${randomBytes(4).toString("hex")}`);
  const a = userWs.ensureUserScratchDir(userId);
  assert.ok(fs.statSync(a).isDirectory(), "scratch dir should exist after ensure");
  const b = userWs.ensureUserScratchDir(userId);
  assert.equal(a, b, "ensure should be idempotent");
});

test("ensureUserScratchDir mirrors top-level host entries as symlinks", () => {
  const userId = trackUser(`unit-symlinks-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(userId);
  // package.json sits at the host workspace root and is a stable
  // sentinel — every checkout has it.
  const linkPath = path.join(dir, "package.json");
  const lst = fs.lstatSync(linkPath);
  assert.ok(lst.isSymbolicLink(), "package.json should be symlinked into scratch dir");
  const target = fs.readlinkSync(linkPath);
  assert.equal(target, path.join(PROJECT_ROOT, "package.json"));
  // Reading through the symlink should yield real content.
  const content = fs.readFileSync(linkPath, "utf-8");
  assert.ok(content.includes("workspaces") || content.includes("name"), "symlinked file should be readable");
});

test("ensureUserScratchDir skips .cache (loop), .local (private state), and .git (shared repo)", () => {
  const userId = trackUser(`unit-skip-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(userId);
  for (const name of [".cache", ".local", ".git"]) {
    const link = path.join(dir, name);
    assert.ok(
      !fs.existsSync(link),
      `${name} should NOT be mirrored (would expose private state, create a loop, or let users mutate the shared host repo)`,
    );
    // Belt-and-braces: lstat shouldn't see a dangling symlink either.
    let lstatErr: any = null;
    try { fs.lstatSync(link); } catch (e) { lstatErr = e; }
    assert.ok(
      lstatErr && lstatErr.code === "ENOENT",
      `${name} should not exist as a symlink either; got lstat error code ${lstatErr?.code}`,
    );
  }
});

test("POST /api/git in host mode cannot reach the shared host .git repository", async () => {
  // Skipping `.git` from the symlink view is the structural defense
  // against cross-user mutation of refs/index/objects. Verify that
  // git commands in host scope see no repo (since the per-user
  // scratch dir doesn't have its own .git either) — i.e. they can
  // neither read nor write shared host repository state.
  const userA = trackUser(`isolate-git-${randomBytes(4).toString("hex")}`);
  const r = await shell(userA, "git rev-parse --show-toplevel");
  assert.equal(r.status, 200);
  assert.notEqual(
    r.body.exitCode,
    0,
    `git should fail (no repo in scratch); instead it succeeded with stdout=${r.body.stdout}`,
  );
  // Stdout must not leak the host project root path back to the user.
  assert.ok(
    !r.body.stdout.includes(PROJECT_ROOT),
    `git rev-parse leaked the host project root path: ${r.body.stdout}`,
  );
});

test("cleanupAbandonedScratchDirs respects activity inside <hash>/host (not just <hash> itself)", () => {
  // Regression: previously cleanup checked only the parent <hash>
  // mtime, so an active user whose only signal was new files inside
  // <hash>/host (which bumps <hash>/host mtime, not <hash>) would be
  // garbage-collected after TTL.
  const userId = trackUser(`unit-cleanup-active-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(userId);
  const userHashRoot = path.dirname(dir);
  // Backdate the parent <hash> dir far past TTL.
  const longAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  fs.utimesSync(userHashRoot, longAgo, longAgo);
  // But keep <hash>/host fresh — simulating a user who just wrote a
  // new scratch file. (Writing the file would bump host's mtime
  // naturally; we do it explicitly to keep the test deterministic.)
  const now = new Date();
  fs.utimesSync(dir, now, now);

  const report = userWs.cleanupAbandonedScratchDirs();
  assert.ok(
    !report.removed.includes(userIdHash(userId)),
    `active user (host mtime fresh) was incorrectly garbage-collected: ${JSON.stringify(report)}`,
  );
  assert.ok(fs.existsSync(dir), "active user's scratch dir must still exist after cleanup");
});

test("ensureUserScratchDir leaves user-created scratch files alone on resync", () => {
  const userId = trackUser(`unit-userfile-${randomBytes(4).toString("hex")}`);
  const dir = userWs.ensureUserScratchDir(userId);
  const userFile = path.join(dir, `keep-me-${randomBytes(4).toString("hex")}.txt`);
  fs.writeFileSync(userFile, "user content");
  // Simulate a second request that re-syncs symlinks.
  userWs.ensureUserScratchDir(userId);
  assert.ok(fs.existsSync(userFile), "user-created scratch files must survive resync");
  assert.equal(fs.readFileSync(userFile, "utf-8"), "user content");
});

test("cleanupAbandonedScratchDirs removes dirs older than the TTL and keeps fresh ones", () => {
  const oldUser = trackUser(`unit-cleanup-old-${randomBytes(4).toString("hex")}`);
  const youngUser = trackUser(`unit-cleanup-new-${randomBytes(4).toString("hex")}`);
  const oldDir = userWs.ensureUserScratchDir(oldUser);
  const youngDir = userWs.ensureUserScratchDir(youngUser);
  // Push the OLD user's scratch dir mtime far into the past. We have
  // to backdate BOTH `<hash>` and `<hash>/host` since cleanup uses
  // the freshest mtime across the two as its liveness signal (so
  // that activity inside `<hash>/host` keeps the dir alive — see the
  // dedicated regression test below).
  const userHashRoot = path.dirname(oldDir);
  const longAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  fs.utimesSync(userHashRoot, longAgo, longAgo);
  fs.utimesSync(oldDir, longAgo, longAgo);

  const report = userWs.cleanupAbandonedScratchDirs();
  assert.ok(
    report.removed.includes(userIdHash(oldUser)),
    `expected old user dir ${userIdHash(oldUser)} to be removed, got ${JSON.stringify(report)}`,
  );
  assert.ok(!fs.existsSync(oldDir), "old user's scratch dir must be gone after cleanup");
  assert.ok(fs.existsSync(youngDir), "young user's scratch dir must NOT be cleaned up");
});

// =============================================================================
// Endpoint isolation tests
// =============================================================================

test("POST /api/shell requires auth (no anonymous host shell)", async () => {
  const res = await fetch(`${serverUrl}/api/shell`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: "echo hi" }),
  });
  assert.equal(res.status, 401, "anonymous shell call must be rejected");
});

test("POST /api/shell rejects authenticated requests whose user object has no id", async () => {
  // Build a separate express server that attaches a user object
  // WITHOUT an id, simulating a misconfigured upstream auth shim.
  // The handler must refuse with a deterministic 401 rather than
  // throw inside the catch block.
  const noIdApp = express();
  noIdApp.use(express.json({ limit: "1mb" }));
  noIdApp.use((req: ExpressRequest, _res: ExpressResponse, next: ExpressNextFunction) => {
    req.user = {
      id: "",
      email: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "user",
    };
    req.isAuthenticated = (() => true) as ExpressRequest["isAuthenticated"];
    next();
  });
  noIdApp.use("/api", workbenchRouter);
  const noIdServer = http.createServer(noIdApp);
  await new Promise<void>((resolve) => noIdServer.listen(0, "127.0.0.1", () => resolve()));
  try {
    const addr = noIdServer.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}/api/shell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "echo hi" }),
    });
    assert.equal(res.status, 401, "request with empty user.id must be rejected with 401");
    const body = await res.json() as { error?: string };
    assert.match(body.error || "", /missing user id|authentication required/i);
  } finally {
    await new Promise<void>((resolve) => {
      if (typeof noIdServer.closeAllConnections === "function") noIdServer.closeAllConnections();
      noIdServer.close(() => resolve());
    });
  }
});

test("POST /api/shell scope.path points at the per-user scratch dir, not PROJECT_ROOT", async () => {
  const userA = trackUser(`endpoint-scope-${randomBytes(4).toString("hex")}`);
  const r = await shell(userA, "true");
  assert.equal(r.status, 200);
  assert.ok(r.body.scope, "shell response must include scope info");
  assert.equal(r.body.scope?.origin, "workspace");
  assert.equal(
    r.body.scope?.path,
    scratchPathFor(userA),
    `scope.path should equal user A's scratch dir; got ${r.body.scope?.path}`,
  );
  assert.notEqual(
    r.body.scope?.path,
    PROJECT_ROOT,
    "scope.path must NOT be the shared project root anymore",
  );
});

test("POST /api/shell isolates per-user scratch dirs — user B cannot see user A's writes", async () => {
  const userA = trackUser(`isolate-A-${randomBytes(4).toString("hex")}`);
  const userB = trackUser(`isolate-B-${randomBytes(4).toString("hex")}`);
  const fileName = `secret-${randomBytes(6).toString("hex")}.txt`;
  const secret = `hello-from-A-${randomBytes(4).toString("hex")}`;

  // Step 1: user A writes a private scratch file.
  const writeA = await shell(userA, `printf '%s' '${secret}' > ${fileName}`);
  assert.equal(writeA.status, 200);
  assert.equal(
    writeA.body.exitCode,
    0,
    `user A write failed: stderr=${writeA.body.stderr} sandboxBlocked=${writeA.body.sandboxBlocked || ""}`,
  );

  // Step 2: user A can read their own file back.
  const readA = await shell(userA, `cat ${fileName}`);
  assert.equal(readA.body.exitCode, 0, `user A read failed: ${readA.body.stderr}`);
  assert.equal(readA.body.stdout, secret);

  // Step 3: user B's `ls` does NOT show user A's file.
  const lsB = await shell(userB, "ls -1");
  assert.equal(lsB.body.exitCode, 0, `user B ls failed: ${lsB.body.stderr}`);
  assert.ok(
    !lsB.body.stdout.split("\n").some(line => line.trim() === fileName),
    `user B's listing leaked user A's private file ${fileName}: ${lsB.body.stdout}`,
  );

  // Step 4: user B's `cat` cannot read the secret content.
  const readB = await shell(userB, `cat ${fileName} 2>/dev/null; echo __EOF__`);
  assert.ok(
    !readB.body.stdout.includes(secret),
    `user B was able to read user A's secret content: ${readB.body.stdout}`,
  );

  // Step 5: directly verify the file landed in user A's scratch dir on disk.
  const onDisk = path.join(scratchPathFor(userA), fileName);
  assert.ok(
    fs.existsSync(onDisk),
    `expected user A's write to land at ${onDisk}, but file is missing`,
  );
  assert.equal(fs.readFileSync(onDisk, "utf-8"), secret);
  // …and crucially that it did NOT land in user B's scratch dir or
  // the shared host root.
  assert.ok(
    !fs.existsSync(path.join(scratchPathFor(userB), fileName)),
    "user A's write must NOT appear in user B's scratch dir",
  );
  assert.ok(
    !fs.existsSync(path.join(PROJECT_ROOT, fileName)),
    "user A's write must NOT touch the shared host project root",
  );
});

test("POST /api/shell blocks user B from reading user A's scratch via ../ traversal", async () => {
  const userA = trackUser(`traverse-A-${randomBytes(4).toString("hex")}`);
  const userB = trackUser(`traverse-B-${randomBytes(4).toString("hex")}`);
  const fileName = `secret-${randomBytes(6).toString("hex")}.txt`;
  const secret = `private-A-${randomBytes(4).toString("hex")}`;

  // user A writes a private file
  const writeA = await shell(userA, `printf '%s' '${secret}' > ${fileName}`);
  assert.equal(writeA.body.exitCode, 0, `user A write failed: ${writeA.body.stderr}`);

  // user B knows user A's userId hash (in any leaky scenario this is
  // not hard to obtain) and tries to read via ../ traversal. We
  // construct the relative path from user B's scratch dir to user
  // A's scratch dir:
  //   <scratchA>/<file>  =  <SCRATCH_ROOT>/<hashA>/host/<file>
  //   <scratchB>          =  <SCRATCH_ROOT>/<hashB>/host
  // so the relative path from B's cwd to A's file is
  //   ../../<hashA>/host/<file>
  const traversal = `../../${userIdHash(userA)}/host/${fileName}`;
  const r = await shell(userB, `cat ${traversal}`);
  assert.equal(r.status, 200);
  assert.notEqual(
    r.body.exitCode,
    0,
    `user B's traversal read should be rejected; got exit 0 with stdout=${r.body.stdout}`,
  );
  assert.ok(
    !r.body.stdout.includes(secret),
    `user B leaked user A's secret via traversal: ${r.body.stdout}`,
  );
  assert.ok(
    r.body.sandboxBlocked || /escape|sandbox|scratch/i.test(r.body.stderr || ""),
    `expected sandbox-blocked message, got stderr=${r.body.stderr}`,
  );
});

test("POST /api/shell blocks reads of workbench-private state via absolute paths", async () => {
  const userA = trackUser(`abs-A-${randomBytes(4).toString("hex")}`);
  // .local holds per-agent / per-user private state we deliberately
  // do NOT mirror into scratch. A user must not be able to reach it
  // by typing the absolute path either.
  const r = await shell(userA, `ls ${path.join(PROJECT_ROOT, ".local")}`);
  assert.equal(r.status, 200);
  assert.notEqual(
    r.body.exitCode,
    0,
    `absolute-path read into .local should be rejected; got exit 0 with stdout=${r.body.stdout.slice(0, 200)}`,
  );
  assert.ok(
    r.body.sandboxBlocked || /escape|sandbox|scratch/i.test(r.body.stderr || ""),
    `expected sandbox-blocked message, got stderr=${r.body.stderr}`,
  );
});

test("POST /api/shell blocks reads into another user's scratch via absolute path", async () => {
  const userA = trackUser(`abs-victim-${randomBytes(4).toString("hex")}`);
  const userB = trackUser(`abs-attacker-${randomBytes(4).toString("hex")}`);
  const fileName = `abs-secret-${randomBytes(4).toString("hex")}.txt`;
  const secret = `abs-private-${randomBytes(4).toString("hex")}`;

  const writeA = await shell(userA, `printf '%s' '${secret}' > ${fileName}`);
  assert.equal(writeA.body.exitCode, 0, `user A write failed: ${writeA.body.stderr}`);

  // user B uses the absolute path directly
  const absPath = path.join(scratchPathFor(userA), fileName);
  const r = await shell(userB, `cat ${absPath}`);
  assert.notEqual(r.body.exitCode, 0, `absolute-path cross-user read should be rejected; stdout=${r.body.stdout}`);
  assert.ok(
    !r.body.stdout.includes(secret),
    `user B leaked user A's secret via absolute path: ${r.body.stdout}`,
  );
  assert.ok(
    r.body.sandboxBlocked || /escape|sandbox|scratch/i.test(r.body.stderr || ""),
    `expected sandbox-blocked message, got stderr=${r.body.stderr}`,
  );
});

test("POST /api/shell blocks input-redirection bypass: `cat < ../../<otherHash>/host/file`", async () => {
  const userA = trackUser(`redir-A-${randomBytes(4).toString("hex")}`);
  const userB = trackUser(`redir-B-${randomBytes(4).toString("hex")}`);
  const fileName = `redir-secret-${randomBytes(6).toString("hex")}.txt`;
  const secret = `redir-private-${randomBytes(4).toString("hex")}`;

  const writeA = await shell(userA, `printf '%s' '${secret}' > ${fileName}`);
  assert.equal(writeA.body.exitCode, 0, `user A write failed: ${writeA.body.stderr}`);

  // Classic bypass: argv-level containment doesn't see the file
  // operand because it's behind a `<` redirection.
  const traversal = `../../${userIdHash(userA)}/host/${fileName}`;
  const r = await shell(userB, `cat < ${traversal}`);
  assert.notEqual(
    r.body.exitCode, 0,
    `input-redirection traversal must be rejected; got exit 0 with stdout=${r.body.stdout}`,
  );
  assert.ok(
    !r.body.stdout.includes(secret),
    `input redirection leaked secret: ${r.body.stdout}`,
  );
  assert.ok(
    r.body.sandboxBlocked || /escape|sandbox|scratch|read redirect/i.test(r.body.stderr || ""),
    `expected sandbox-blocked message, got stderr=${r.body.stderr}`,
  );
});

test("POST /api/shell blocks input-redirection bypass: `cat < /workspace/.local/...`", async () => {
  const userA = trackUser(`redir-abs-${randomBytes(4).toString("hex")}`);
  // Using an absolute path into .local via input redirection. Even
  // if .local has no world-readable files, the sandbox should reject
  // BEFORE the syscall runs because the path operand escapes scratch.
  const r = await shell(userA, `cat < ${path.join(PROJECT_ROOT, ".local/skills/follow-up-tasks/SKILL.md")}`);
  assert.notEqual(
    r.body.exitCode, 0,
    `absolute-path input redirection into .local must be rejected; stdout=${r.body.stdout.slice(0, 200)}`,
  );
  assert.ok(
    r.body.sandboxBlocked || /escape|sandbox|scratch|read redirect/i.test(r.body.stderr || ""),
    `expected sandbox-blocked message, got stderr=${r.body.stderr}`,
  );
});

test("POST /api/shell blocks input-redirection bypass: numeric-fd `0< ../path`", async () => {
  const userA = trackUser(`redir-fd-A-${randomBytes(4).toString("hex")}`);
  const userB = trackUser(`redir-fd-B-${randomBytes(4).toString("hex")}`);
  const fileName = `fd-secret-${randomBytes(6).toString("hex")}.txt`;
  const secret = `fd-private-${randomBytes(4).toString("hex")}`;
  const writeA = await shell(userA, `printf '%s' '${secret}' > ${fileName}`);
  assert.equal(writeA.body.exitCode, 0);
  const traversal = `../../${userIdHash(userA)}/host/${fileName}`;
  // `0<` is the explicit-fd form of input redirection.
  const r = await shell(userB, `cat 0< ${traversal}`);
  assert.notEqual(r.body.exitCode, 0, `numeric-fd input redirection must be rejected; stdout=${r.body.stdout}`);
  assert.ok(!r.body.stdout.includes(secret), `numeric-fd input redirection leaked secret: ${r.body.stdout}`);
});

test("POST /api/shell blocks input-redirection bypass: process substitution `<(cat ../../<hash>/host/file)`", async () => {
  const userA = trackUser(`procsub-A-${randomBytes(4).toString("hex")}`);
  const userB = trackUser(`procsub-B-${randomBytes(4).toString("hex")}`);
  const fileName = `ps-secret-${randomBytes(6).toString("hex")}.txt`;
  const secret = `ps-private-${randomBytes(4).toString("hex")}`;
  const writeA = await shell(userA, `printf '%s' '${secret}' > ${fileName}`);
  assert.equal(writeA.body.exitCode, 0);
  const traversal = `../../${userIdHash(userA)}/host/${fileName}`;
  // Process substitution: the inner `cat` operand should be screened.
  const r = await shell(userB, `cat <(cat ${traversal})`);
  assert.notEqual(r.body.exitCode, 0, `process-substitution traversal must be rejected; stdout=${r.body.stdout}`);
  assert.ok(!r.body.stdout.includes(secret), `process substitution leaked secret: ${r.body.stdout}`);
});

test("POST /api/shell still allows reads from safe system locations (allowlist)", async () => {
  const userA = trackUser(`allowlist-${randomBytes(4).toString("hex")}`);
  // Prove that we didn't lock down so hard that normal tools break.
  // /usr/bin/env exists on every Replit container; reading from /etc
  // and /proc is also commonly required.
  const r = await shell(userA, "ls /usr/bin >/dev/null && head -c 0 /etc/hostname; echo OK");
  assert.equal(r.body.exitCode, 0, `safe-allowlist read failed: stderr=${r.body.stderr} blocked=${r.body.sandboxBlocked || ""}`);
  assert.ok(r.body.stdout.trim().endsWith("OK"), `expected OK marker; got ${r.body.stdout}`);
});

test("POST /api/shell blocks writes through symlinks back to the host workspace", async () => {
  const userA = trackUser(`isolate-noescape-${randomBytes(4).toString("hex")}`);
  // Touch a top-level entry that exists in the host (artifacts/) and
  // try to drop a payload into it via the symlink. The sandbox's
  // realpath-based path-containment check should block this.
  const payload = `payload-${randomBytes(4).toString("hex")}.txt`;
  const r = await shell(userA, `echo pwned > artifacts/${payload}`);
  assert.equal(r.status, 200);
  assert.notEqual(
    r.body.exitCode,
    0,
    `sandbox should have blocked the write through the symlink, got exit 0 with stdout=${r.body.stdout}`,
  );
  assert.ok(
    r.body.sandboxBlocked || /escape|sandbox|symlink/i.test(r.body.stderr || ""),
    `expected sandbox-blocked message, got stderr=${r.body.stderr}`,
  );
  assert.ok(
    !fs.existsSync(path.join(PROJECT_ROOT, "artifacts", payload)),
    "payload must NOT have landed in the shared host workspace",
  );
});
