import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import * as os from "node:os";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { exec as childExec } from "node:child_process";
import { Client as Ssh2Client } from "ssh2";

const PROJECT_ROOT = path.resolve(process.cwd(), "../..");

// --- ssh2 mock so VPS branches in project-context.ts run against a real
// local filesystem in a scratch dir (same approach as workbench-diff-undo).
const originalSshConnect = Ssh2Client.prototype.connect;
const originalSshExec = Ssh2Client.prototype.exec;
const originalSshEnd = Ssh2Client.prototype.end;

function installSshMock(): void {
  Ssh2Client.prototype.connect = function (this: Ssh2Client) {
    setImmediate(() => this.emit("ready"));
    return this;
  } as typeof Ssh2Client.prototype.connect;

  Ssh2Client.prototype.exec = function (
    this: Ssh2Client,
    command: string,
    cb: (err: Error | undefined, stream: EventEmitter & { stderr: EventEmitter }) => void,
  ) {
    const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    stream.stderr = new EventEmitter();
    childExec(
      command,
      { maxBuffer: 8 * 1024 * 1024, timeout: 20000 },
      (err, stdout, stderr) => {
        if (stdout) stream.emit("data", Buffer.from(stdout));
        if (stderr) stream.stderr.emit("data", Buffer.from(stderr));
        const code =
          err && typeof (err as NodeJS.ErrnoException).code === "number"
            ? Number((err as NodeJS.ErrnoException).code)
            : err
              ? 1
              : 0;
        stream.emit("close", code);
      },
    );
    cb(undefined, stream);
    return true;
  } as typeof Ssh2Client.prototype.exec;

  Ssh2Client.prototype.end = function (this: Ssh2Client) {
    return this;
  } as typeof Ssh2Client.prototype.end;
}

function restoreSshMock(): void {
  Ssh2Client.prototype.connect = originalSshConnect;
  Ssh2Client.prototype.exec = originalSshExec;
  Ssh2Client.prototype.end = originalSshEnd;
}

const { default: workbenchRouter } = await import("../src/routes/workbench");
const { pool: dbPool } = await import("@workspace/db");
const expressMod = await import("express");
const express = expressMod.default;
type ExpressRequest = import("express").Request;
type ExpressResponse = import("express").Response;
type ExpressNextFunction = import("express").NextFunction;

const app = express();
app.use(express.json({ limit: "20mb" }));
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
let localProjectDir = "";
let localProjectRel = "";
let vpsRemoteRoot = "";
let uploadTargetRel = "";
const createdProjectSlugs: string[] = [];

before(async () => {
  installSshMock();

  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      serverUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const cacheDir = path.join(PROJECT_ROOT, ".cache");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  localProjectRel = `.cache/test-endpoints-${randomBytes(6).toString("hex")}`;
  localProjectDir = path.join(PROJECT_ROOT, localProjectRel);
  fs.mkdirSync(localProjectDir, { recursive: true });
  fs.writeFileSync(
    path.join(localProjectDir, "package.json"),
    JSON.stringify({ name: "test-endpoints" }, null, 2),
  );
  fs.writeFileSync(path.join(localProjectDir, "hello.txt"), "hello world\n");
  fs.mkdirSync(path.join(localProjectDir, "sub"), { recursive: true });
  fs.writeFileSync(path.join(localProjectDir, "sub", "nested.txt"), "nested\n");

  vpsRemoteRoot = path.join(os.tmpdir(), `vps-endpoints-${randomBytes(6).toString("hex")}`);
  fs.mkdirSync(vpsRemoteRoot, { recursive: true });
  fs.writeFileSync(path.join(vpsRemoteRoot, "remote.txt"), "remote contents\n");

  uploadTargetRel = `.cache/test-uploads-${randomBytes(6).toString("hex")}`;
});

after(async () => {
  restoreSshMock();
  await new Promise<void>((resolve) => {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close(() => resolve());
  });
  if (localProjectDir && fs.existsSync(localProjectDir)) {
    fs.rmSync(localProjectDir, { recursive: true, force: true });
  }
  if (vpsRemoteRoot && fs.existsSync(vpsRemoteRoot)) {
    fs.rmSync(vpsRemoteRoot, { recursive: true, force: true });
  }
  const uploadAbs = path.join(PROJECT_ROOT, uploadTargetRel);
  if (uploadAbs && fs.existsSync(uploadAbs)) {
    fs.rmSync(uploadAbs, { recursive: true, force: true });
  }
  for (const slug of createdProjectSlugs) {
    const dir = path.join(PROJECT_ROOT, "projects", slug);
    if (fs.existsSync(dir)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }
  try { await dbPool.end(); } catch { /* may be closed */ }
});

interface JsonResult<T> {
  status: number;
  body: T;
}

async function getJson<T = any>(url: string, headers: Record<string, string> = {}): Promise<JsonResult<T>> {
  const res = await fetch(`${serverUrl}${url}`, { method: "GET", headers });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { _raw: text }; }
  return { status: res.status, body: body as T };
}

async function postJson<T = any>(
  url: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<JsonResult<T>> {
  const res = await fetch(`${serverUrl}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { _raw: text }; }
  return { status: res.status, body: body as T };
}

async function deleteReq<T = any>(url: string, headers: Record<string, string> = {}): Promise<JsonResult<T>> {
  const res = await fetch(`${serverUrl}${url}`, { method: "DELETE", headers });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { _raw: text }; }
  return { status: res.status, body: body as T };
}

const localProject = () => ({
  origin: "local" as const,
  path: localProjectRel,
  name: "test-endpoints",
});
const vpsProject = () => ({
  origin: "vps" as const,
  path: vpsRemoteRoot,
  name: "vps-endpoints",
  ssh: { host: "fake-host", username: "fake-user", port: 22 },
});

// =============================================================================
// GET /api/files
// =============================================================================

test("GET /api/files (no project) lists workspace root and rejects path traversal", async () => {
  const ok = await getJson<{ items: Array<{ name: string }>; error?: string }>(
    "/api/files?path=.",
  );
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.body.items));
  // node_modules / .git must be filtered out of the no-project listing
  for (const item of ok.body.items) {
    assert.notEqual(item.name, "node_modules");
    assert.notEqual(item.name, ".git");
  }

  const traversal = await getJson<{ items: unknown[]; error?: string; code?: string }>(
    "/api/files?path=" + encodeURIComponent("../../etc"),
  );
  // Path traversal must be rejected with a 4xx status — clients/CDNs/log
  // dashboards must not see a 200 here. items: [] is preserved so callers that
  // were already reading data?.items don't crash.
  assert.equal(traversal.status, 400);
  assert.equal(traversal.body.code, "PATH_TRAVERSAL");
  assert.deepEqual(traversal.body.items, []);
  assert.ok(
    traversal.body.error && /traversal|allowed/i.test(traversal.body.error),
    `expected traversal-related error, got: ${JSON.stringify(traversal.body)}`,
  );
});

test("GET /api/files returns 400 with INVALID_PROJECT for malformed project JSON", async () => {
  const r = await getJson<{ items: unknown[]; error?: string; code?: string }>(
    "/api/files?path=.&project=" + encodeURIComponent("{not json"),
  );
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "INVALID_PROJECT");
  assert.deepEqual(r.body.items, []);
});

test("GET /api/files returns 400 with PROJECT_UNRESOLVED when descriptor doesn't resolve", async () => {
  // An unknown origin cannot be resolved → must be a 4xx, not a 200.
  const bad = { origin: "nonsense", path: "whatever", name: "ghost" };
  const r = await getJson<{ items: unknown[]; error?: string; code?: string }>(
    `/api/files?path=.&project=${encodeURIComponent(JSON.stringify(bad))}`,
  );
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "PROJECT_UNRESOLVED");
  assert.deepEqual(r.body.items, []);
});

test("GET /api/files returns 409 PROJECT_NOT_PULLED for a Replit project that hasn't been cloned", async () => {
  // A replit-origin descriptor whose cache dir doesn't contain a .git
  // checkout resolves with localPath: null — the route must surface that
  // as 409, not silently 200 with an empty list.
  const replit = {
    origin: "replit" as const,
    path: `not-cloned-yet-${randomBytes(4).toString("hex")}`,
    name: "ghost-replit",
  };
  const r = await getJson<{ items: unknown[]; error?: string; code?: string }>(
    `/api/files?path=.&project=${encodeURIComponent(JSON.stringify(replit))}`,
  );
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "PROJECT_NOT_PULLED");
  assert.deepEqual(r.body.items, []);
  assert.match(r.body.error || "", /not pulled yet|not cloned yet/i);
});

test("GET /api/files returns 404 NOT_FOUND for a valid local project pointing at a missing dir", async () => {
  // resolveDescriptor() succeeds for a local origin even if the path doesn't
  // exist, but the subsequent listFiles() call surfaces ENOENT — that must
  // come back as 404, not 200.
  const bad = { origin: "local" as const, path: ".cache/does-not-exist-xyz", name: "ghost" };
  const r = await getJson<{ items: unknown[]; error?: string; code?: string }>(
    `/api/files?path=.&project=${encodeURIComponent(JSON.stringify(bad))}`,
  );
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "NOT_FOUND");
  assert.deepEqual(r.body.items, []);
});

test("GET /api/files (local project) lists files inside the resolved local project", async () => {
  const projectQ = encodeURIComponent(JSON.stringify(localProject()));
  const r = await getJson<{ items: Array<{ name: string; type: string }>; scope?: { origin: string } }>(
    `/api/files?path=.&project=${projectQ}`,
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.scope?.origin, "local");
  const names = r.body.items.map(i => i.name).sort();
  assert.ok(names.includes("hello.txt"));
  assert.ok(names.includes("package.json"));
  assert.ok(names.includes("sub"));
});

test("GET /api/files for a VPS-origin project requires authentication (401 anonymous)", async () => {
  const projectQ = encodeURIComponent(JSON.stringify(vpsProject()));
  const r = await getJson<{ items: unknown[]; error?: string }>(
    `/api/files?path=.&project=${projectQ}`,
  );
  assert.equal(r.status, 401);
  assert.deepEqual(r.body.items, []);
  assert.ok(/auth/i.test(r.body.error || ""));
});

test("GET /api/files for a VPS-origin project succeeds when authenticated (SSH-mocked)", async () => {
  const projectQ = encodeURIComponent(JSON.stringify(vpsProject()));
  const r = await getJson<{ items: Array<{ name: string }>; scope?: { origin: string } }>(
    `/api/files?path=.&project=${projectQ}`,
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.scope?.origin, "vps");
  const names = r.body.items.map(i => i.name);
  assert.ok(names.includes("remote.txt"), `expected remote.txt in ${JSON.stringify(names)}`);
});

// =============================================================================
// GET /api/file-content
// =============================================================================

test("GET /api/file-content requires the path query parameter (400)", async () => {
  const r = await getJson<{ error: string }>("/api/file-content");
  assert.equal(r.status, 400);
  assert.match(r.body.error, /path is required/i);
});

test("GET /api/file-content (no project) reads workspace files and blocks path traversal", async () => {
  const r = await getJson<{ content?: string; error?: string }>(
    "/api/file-content?path=" + encodeURIComponent("package.json"),
  );
  assert.equal(r.status, 200);
  assert.ok(r.body.content && r.body.content.includes('"name"'));

  const traversal = await getJson<{ content?: string; error?: string; code?: string }>(
    "/api/file-content?path=" + encodeURIComponent("../../etc/passwd"),
  );
  // Path traversal must be a 4xx — not a silent 200 with an `error` field.
  assert.equal(traversal.status, 400);
  assert.equal(traversal.body.code, "PATH_TRAVERSAL");
  assert.equal(traversal.body.content, undefined);
  assert.ok(
    traversal.body.error && /traversal|allowed/i.test(traversal.body.error),
    `expected traversal-related error, got: ${JSON.stringify(traversal.body)}`,
  );
});

test("GET /api/file-content returns 404 NOT_FOUND for a missing workspace file", async () => {
  const r = await getJson<{ content?: string; error?: string; code?: string }>(
    "/api/file-content?path=" + encodeURIComponent(`does-not-exist-${randomBytes(4).toString("hex")}.txt`),
  );
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "NOT_FOUND");
  assert.equal(r.body.content, undefined);
});

test("GET /api/file-content returns 400 INVALID_PROJECT for malformed project JSON", async () => {
  const r = await getJson<{ error?: string; code?: string }>(
    "/api/file-content?path=hello.txt&project=" + encodeURIComponent("{nope"),
  );
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "INVALID_PROJECT");
});

test("GET /api/file-content returns 400 PROJECT_UNRESOLVED for an unknown origin", async () => {
  const bad = { origin: "nonsense", path: "whatever" };
  const r = await getJson<{ error?: string; code?: string }>(
    `/api/file-content?path=hello.txt&project=${encodeURIComponent(JSON.stringify(bad))}`,
  );
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "PROJECT_UNRESOLVED");
});

test("GET /api/file-content returns 409 PROJECT_NOT_PULLED for a Replit project that hasn't been cloned", async () => {
  const replit = {
    origin: "replit" as const,
    path: `not-cloned-yet-${randomBytes(4).toString("hex")}`,
    name: "ghost-replit",
  };
  const r = await getJson<{ content?: string; error?: string; code?: string }>(
    `/api/file-content?path=anything.txt&project=${encodeURIComponent(JSON.stringify(replit))}`,
  );
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "PROJECT_NOT_PULLED");
  assert.equal(r.body.content, undefined);
  assert.match(r.body.error || "", /not pulled yet|not cloned yet/i);
});

test("GET /api/file-content (local project) reads from the resolved local project", async () => {
  const projectQ = encodeURIComponent(JSON.stringify(localProject()));
  const r = await getJson<{ content: string; size: number; scope?: { origin: string } }>(
    `/api/file-content?path=hello.txt&project=${projectQ}`,
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.content, "hello world\n");
  assert.equal(r.body.size, Buffer.byteLength("hello world\n"));
  assert.equal(r.body.scope?.origin, "local");
});

test("GET /api/file-content for a VPS-origin project requires authentication (401 anonymous)", async () => {
  const projectQ = encodeURIComponent(JSON.stringify(vpsProject()));
  const r = await getJson<{ error: string }>(
    `/api/file-content?path=remote.txt&project=${projectQ}`,
  );
  assert.equal(r.status, 401);
  assert.ok(/auth/i.test(r.body.error || ""));
});

// =============================================================================
// POST /api/shell
// =============================================================================

test("POST /api/shell requires authentication (401 anonymous)", async () => {
  const r = await postJson("/api/shell", { command: "echo hi" });
  assert.equal(r.status, 401);
});

test("POST /api/shell requires a non-empty command string (400)", async () => {
  const r = await postJson<{ error: string }>(
    "/api/shell",
    { command: "" },
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 400);
  assert.match(r.body.error, /command/i);
});

test("POST /api/shell short-circuits dangerous commands via the blocklist", async () => {
  const blocked = ["rm -rf /", "mkfs", "dd if=/dev/zero of=/dev/sda", ":(){ :|:& };:", "fork bomb"];
  for (const cmd of blocked) {
    const r = await postJson<{ stdout: string; stderr: string; exitCode: number }>(
      "/api/shell",
      { command: cmd },
      { "x-test-user": "user-A" },
    );
    assert.equal(r.status, 200, `blocked path should still respond 200 for "${cmd}"`);
    assert.equal(r.body.stdout, "", `stdout must be empty for blocked "${cmd}"`);
    assert.match(
      r.body.stderr,
      /blocked for safety/i,
      `expected safety-block stderr for "${cmd}", got ${JSON.stringify(r.body)}`,
    );
    assert.equal(r.body.exitCode, 1);
  }
});

test("POST /api/shell blocks whitespace and quoting variants of `rm -rf /`", async () => {
  const variants = [
    "rm  -rf /",                   // extra whitespace between tokens
    "rm -rf  /",
    "rm\t-rf\t/",                  // tabs instead of spaces
    "r''m -rf /",                  // empty single-quoted gap inside the word
    "'rm' -rf /",                  // wholly single-quoted exe
    'r"m" -rf /',                  // double quotes
    "r\\m -rf /",                  // backslash escape
    "/bin/rm -rf /",               // absolute path bypasses basename match
    "/usr/bin/rm -rf /",
    "rm -r -f /",                  // separate flags
    "rm -fr /",                    // reversed combined flags
    "rm --recursive --force /",    // long-form flags
    "rm -rf /etc",                 // system path other than /
    "rm -rf /home",
    "FOO=bar rm -rf /",            // env-var prefix
    "echo hi; rm -rf /",           // hidden after another command
    "true && rm -rf /",
    "true || rm -rf /",
    "$(rm -rf /)",                 // command substitution
    "`rm -rf /`",                  // backtick substitution
    "echo \"$(rm -rf /)\"",        // command substitution inside double quotes
    "rm --no-preserve-root /",
  ];
  for (const cmd of variants) {
    const r = await postJson<{ stdout: string; stderr: string; exitCode: number }>(
      "/api/shell",
      { command: cmd },
      { "x-test-user": "user-A" },
    );
    assert.equal(r.body.stdout, "", `expected empty stdout for "${cmd}"`);
    assert.match(
      r.body.stderr,
      /blocked for safety/i,
      `expected safety block for "${cmd}", got ${JSON.stringify(r.body)}`,
    );
    assert.equal(r.body.exitCode, 1, `expected exit 1 for "${cmd}"`);
  }
});

test("POST /api/shell blocks other dangerous binaries by argv parsing", async () => {
  const variants = [
    "mkfs.ext4 /dev/sda1",         // mkfs family with suffix
    "/sbin/mkfs.ext4 /dev/sda1",   // absolute path
    "'mkfs' /dev/sda1",            // quoted
    "shutdown -h now",
    "/sbin/reboot",
    "poweroff",
    "halt",
    "dd if=/dev/zero of=/dev/sda bs=1M",
    "echo hi && shutdown -h now",
  ];
  for (const cmd of variants) {
    const r = await postJson<{ stdout: string; stderr: string; exitCode: number }>(
      "/api/shell",
      { command: cmd },
      { "x-test-user": "user-A" },
    );
    assert.match(
      r.body.stderr,
      /blocked for safety/i,
      `expected safety block for "${cmd}", got ${JSON.stringify(r.body)}`,
    );
    assert.equal(r.body.exitCode, 1);
  }
});

test("POST /api/shell allows benign commands with whitespace, quoting, and substitutions", async () => {
  // These all should run (or at least not be safety-blocked); the
  // execution itself may or may not succeed depending on the runtime,
  // so we only assert that the safety filter did not short-circuit.
  const allowed = [
    "echo  hello  world",
    "'echo' done",
    'echo "quoted"',
    "ls -la",
    "rm /tmp/some-explicit-file-that-does-not-matter",  // non-recursive
    "rm -rf /tmp/myproj/build",                         // recursive on a deep subpath
    "git status",                                        // not via /api/git
  ];
  for (const cmd of allowed) {
    const r = await postJson<{ stderr: string }>(
      "/api/shell",
      { command: cmd, project: localProject() },
      { "x-test-user": "user-A" },
    );
    assert.ok(
      !/blocked for safety/i.test(r.body.stderr || ""),
      `should not safety-block "${cmd}", got ${JSON.stringify(r.body)}`,
    );
  }
});

test("POST /api/shell runs benign commands inside a local-project scope", async () => {
  const r = await postJson<{ stdout: string; exitCode: number; scope?: { origin: string; path?: string } }>(
    "/api/shell",
    { command: "echo workbench-test", project: localProject() },
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.exitCode, 0);
  assert.match(r.body.stdout, /workbench-test/);
  assert.equal(r.body.scope?.origin, "local");
});

// Forwarding of `sandboxContained` for VPS-origin /shell results. The
// SSH layer is mocked (see installSshMock), so a remote command runs
// against the local filesystem under vpsRemoteRoot. We seed a script
// there that prints an EROFS-shaped stderr line naming a path OUTSIDE
// the project root; the route should map that to the friendly notice
// when the VPS sandbox feature flag is on.
test("POST /api/shell forwards sandboxContained for VPS-origin EROFS stderr when VPS_OS_SANDBOX_ACTIVE=1", async () => {
  const before = process.env.VPS_OS_SANDBOX_ACTIVE;
  process.env.VPS_OS_SANDBOX_ACTIVE = "1";
  const scriptName = `fake-erofs-${randomBytes(4).toString("hex")}.sh`;
  const scriptAbs = path.join(vpsRemoteRoot, scriptName);
  fs.writeFileSync(
    scriptAbs,
    `#!/bin/sh\n` +
      `printf "%s\\n" "cp: cannot create regular file '/etc/wb-vps-fake': Read-only file system" >&2\n` +
      `exit 1\n`,
  );
  fs.chmodSync(scriptAbs, 0o755);
  try {
    const r = await postJson<{
      stdout: string;
      stderr: string;
      exitCode: number;
      scope?: { origin: string };
      sandboxContained?: { reason: string; path: string; message: string };
    }>(
      "/api/shell",
      { command: `./${scriptName}`, project: vpsProject() },
      { "x-test-user": "user-A" },
    );
    assert.equal(r.status, 200);
    assert.equal(r.body.scope?.origin, "vps");
    assert.equal(r.body.exitCode, 1);
    assert.match(r.body.stderr, /Read-only file system/);
    assert.ok(
      r.body.sandboxContained,
      `expected sandboxContained on VPS shell result, got ${JSON.stringify(r.body)}`,
    );
    assert.equal(r.body.sandboxContained!.reason, "readonly");
    assert.equal(r.body.sandboxContained!.path, "/etc/wb-vps-fake");
    assert.match(r.body.sandboxContained!.message, /outside the project/i);
  } finally {
    if (before === undefined) delete process.env.VPS_OS_SANDBOX_ACTIVE;
    else process.env.VPS_OS_SANDBOX_ACTIVE = before;
    try { fs.unlinkSync(scriptAbs); } catch {}
  }
});

test("POST /api/shell does NOT brand VPS EROFS stderr as sandboxContained when VPS_OS_SANDBOX_ACTIVE is unset", async () => {
  // Same input as above, but without the env gate the route must NOT
  // brand a non-jailed VPS error as a sandbox event. This mirrors the
  // local rule that we only emit `sandboxContained` when an OS jail is
  // actually in place.
  const before = process.env.VPS_OS_SANDBOX_ACTIVE;
  delete process.env.VPS_OS_SANDBOX_ACTIVE;
  const scriptName = `fake-erofs-${randomBytes(4).toString("hex")}.sh`;
  const scriptAbs = path.join(vpsRemoteRoot, scriptName);
  fs.writeFileSync(
    scriptAbs,
    `#!/bin/sh\n` +
      `printf "%s\\n" "cp: cannot create regular file '/etc/wb-vps-fake': Read-only file system" >&2\n` +
      `exit 1\n`,
  );
  fs.chmodSync(scriptAbs, 0o755);
  try {
    const r = await postJson<{
      exitCode: number;
      stderr: string;
      scope?: { origin: string };
      sandboxContained?: unknown;
    }>(
      "/api/shell",
      { command: `./${scriptName}`, project: vpsProject() },
      { "x-test-user": "user-A" },
    );
    assert.equal(r.status, 200);
    assert.equal(r.body.scope?.origin, "vps");
    // The EROFS line still flows through stderr — we just must not
    // attribute it to a sandbox that isn't there.
    assert.match(r.body.stderr, /Read-only file system/);
    assert.equal(
      r.body.sandboxContained,
      undefined,
      `expected NO sandboxContained without the VPS jail flag, got ${JSON.stringify(r.body.sandboxContained)}`,
    );
  } finally {
    if (before === undefined) delete process.env.VPS_OS_SANDBOX_ACTIVE;
    else process.env.VPS_OS_SANDBOX_ACTIVE = before;
    try { fs.unlinkSync(scriptAbs); } catch {}
  }
});

// =============================================================================
// /api/shell-history (per-user, persisted)
// =============================================================================

test("GET /api/shell-history requires authentication (401 anonymous)", async () => {
  const r = await getJson("/api/shell-history");
  assert.equal(r.status, 401);
});

test("DELETE /api/shell-history requires authentication (401 anonymous)", async () => {
  const r = await deleteReq("/api/shell-history");
  assert.equal(r.status, 401);
});

test("POST /api/shell records the user's command into shell-history (newest-first, deduped)", async () => {
  // Use a unique user id so this test doesn't collide with parallel tests
  // touching `user-A`/`user-B`'s history (the same DB is shared across the
  // suite — rows from earlier /shell calls would otherwise leak in).
  const userId = `hist-user-${randomBytes(6).toString("hex")}`;

  // Sanity: an unused user starts empty.
  const empty = await getJson<{ history: Array<{ command: string }> }>(
    "/api/shell-history",
    { "x-test-user": userId },
  );
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.history, []);

  // Run two commands, then re-run the second to exercise the adjacent
  // dedup path.
  for (const cmd of ["echo first-cmd", "echo second-cmd", "echo second-cmd"]) {
    const r = await postJson("/api/shell", { command: cmd }, { "x-test-user": userId });
    assert.equal(r.status, 200, `unexpected status for "${cmd}"`);
  }

  const after = await getJson<{ history: Array<{ command: string; createdAt: string }> }>(
    "/api/shell-history",
    { "x-test-user": userId },
  );
  assert.equal(after.status, 200);
  // Newest command first, dedup collapses the doubled "echo second-cmd".
  assert.deepEqual(
    after.body.history.map(h => h.command),
    ["echo second-cmd", "echo first-cmd"],
  );
  // Each entry has an ISO timestamp the frontend can render.
  for (const entry of after.body.history) {
    assert.ok(typeof entry.createdAt === "string" && /T.*Z$/.test(entry.createdAt));
  }
});

test("POST /api/shell records safety-blocked commands too (history matches what the user typed)", async () => {
  // A command the safety layer rejects should still land in the user's
  // history — otherwise the user can't ↑-arrow to fix the typo.
  const userId = `hist-blocked-${randomBytes(6).toString("hex")}`;
  const blocked = await postJson<{ stderr: string }>(
    "/api/shell",
    { command: "rm -rf /" },
    { "x-test-user": userId },
  );
  assert.equal(blocked.status, 200);
  assert.match(blocked.body.stderr, /blocked for safety/i);
  const after = await getJson<{ history: Array<{ command: string }> }>(
    "/api/shell-history",
    { "x-test-user": userId },
  );
  assert.equal(after.status, 200);
  assert.deepEqual(after.body.history.map(h => h.command), ["rm -rf /"]);
});

test("GET /api/shell-history scopes results per-user (cross-user isolation)", async () => {
  const alice = `hist-alice-${randomBytes(6).toString("hex")}`;
  const bob = `hist-bob-${randomBytes(6).toString("hex")}`;
  await postJson("/api/shell", { command: "echo alice-only" }, { "x-test-user": alice });
  await postJson("/api/shell", { command: "echo bob-only" }, { "x-test-user": bob });

  const aliceView = await getJson<{ history: Array<{ command: string }> }>(
    "/api/shell-history",
    { "x-test-user": alice },
  );
  const bobView = await getJson<{ history: Array<{ command: string }> }>(
    "/api/shell-history",
    { "x-test-user": bob },
  );
  assert.deepEqual(aliceView.body.history.map(h => h.command), ["echo alice-only"]);
  assert.deepEqual(bobView.body.history.map(h => h.command), ["echo bob-only"]);
});

test("GET /api/shell-history honours the `limit` query parameter (clamped to per-user cap)", async () => {
  const userId = `hist-limit-${randomBytes(6).toString("hex")}`;
  for (const cmd of ["echo one", "echo two", "echo three"]) {
    await postJson("/api/shell", { command: cmd }, { "x-test-user": userId });
  }

  const limited = await getJson<{ history: Array<{ command: string }> }>(
    "/api/shell-history?limit=2",
    { "x-test-user": userId },
  );
  assert.equal(limited.body.history.length, 2);
  assert.deepEqual(
    limited.body.history.map(h => h.command),
    ["echo three", "echo two"],
  );

  // Garbage / huge `limit` values must be clamped — don't trust client input.
  const huge = await getJson<{ history: unknown[] }>(
    "/api/shell-history?limit=999999",
    { "x-test-user": userId },
  );
  assert.equal(huge.status, 200);
  assert.ok(huge.body.history.length <= 500);
});

test("DELETE /api/shell-history wipes only the calling user's rows", async () => {
  const userId = `hist-del-${randomBytes(6).toString("hex")}`;
  const otherId = `hist-keep-${randomBytes(6).toString("hex")}`;
  await postJson("/api/shell", { command: "echo to-delete" }, { "x-test-user": userId });
  await postJson("/api/shell", { command: "echo keep-me" }, { "x-test-user": otherId });

  const del = await deleteReq<{ ok: boolean }>(
    "/api/shell-history",
    { "x-test-user": userId },
  );
  assert.equal(del.status, 200);
  assert.equal(del.body.ok, true);

  const empty = await getJson<{ history: unknown[] }>(
    "/api/shell-history",
    { "x-test-user": userId },
  );
  assert.deepEqual(empty.body.history, []);

  const otherStill = await getJson<{ history: Array<{ command: string }> }>(
    "/api/shell-history",
    { "x-test-user": otherId },
  );
  // The DELETE must not touch other users' history.
  assert.deepEqual(otherStill.body.history.map(h => h.command), ["echo keep-me"]);
});

// =============================================================================
// POST /api/git
// =============================================================================

test("POST /api/git requires authentication (401 anonymous)", async () => {
  const r = await postJson("/api/git", { command: "git status" });
  assert.equal(r.status, 401);
});

test("POST /api/git rejects non-git commands (400)", async () => {
  const r = await postJson<{ error: string }>(
    "/api/git",
    { command: "ls -la" },
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 400);
  assert.match(r.body.error, /git commands allowed/i);
});

test("POST /api/git blocks dangerous git commands via the safety list", async () => {
  const dangerous = ["git push --force origin main", "git reset --hard HEAD", "git clean -fd"];
  for (const cmd of dangerous) {
    const r = await postJson<{ stdout: string; stderr: string; exitCode: number }>(
      "/api/git",
      { command: cmd },
      { "x-test-user": "user-A" },
    );
    assert.equal(r.status, 200);
    assert.equal(r.body.stdout, "");
    assert.match(r.body.stderr, /dangerous git command blocked/i);
    assert.equal(r.body.exitCode, 1);
  }
});

test("POST /api/git blocks whitespace and quoting variants of dangerous git commands", async () => {
  const variants = [
    "git  push  --force origin main",   // extra whitespace
    "git\tpush\t--force",                // tab separators
    "'git' push --force",                // quoted exe
    "g'i't push --force",                // partial quoting
    "git push -f",                       // short-form force
    "git push -fu origin main",          // combined short flags
    "git -C /tmp push --force",          // -C dir before subcommand
    "git --git-dir=. push --force",      // --git-dir= form
    "git reset  --hard HEAD",            // extra whitespace
    "git reset HEAD --hard",             // --hard later in argv
    "git -C . reset --hard",
    "git clean -df",
    "git clean -f -d",
    "git clean -fdx",
    "git clean --force -d",
    "git status; git push --force",      // chained after benign
    "git status && git reset --hard",
  ];
  for (const cmd of variants) {
    const r = await postJson<{ stdout: string; stderr: string; exitCode: number }>(
      "/api/git",
      { command: cmd },
      { "x-test-user": "user-A" },
    );
    assert.equal(r.body.stdout, "", `expected empty stdout for "${cmd}"`);
    assert.match(
      r.body.stderr,
      /dangerous git command blocked/i,
      `expected git block for "${cmd}", got ${JSON.stringify(r.body)}`,
    );
    assert.equal(r.body.exitCode, 1);
  }
});

test("POST /api/git rejects chained payloads where any command is not git", async () => {
  // The previous `command.startsWith("git ")` admission check let
  // payloads like `git status; rm -rf /tmp` slip past the "Only git"
  // gate. The parser-based `isGitCommand` now requires every extracted
  // top-level command to be a git invocation.
  const variants = [
    "git status; rm -rf /tmp",
    "git status && mkfs.ext4 /dev/sda1",
    "git status || /sbin/poweroff",
    "git status | tee /tmp/out",         // pipe to non-git
    "git log; echo done",                 // even benign chained cmd is rejected
  ];
  for (const cmd of variants) {
    const r = await postJson<{ error?: string; stderr?: string }>(
      "/api/git",
      { command: cmd },
      { "x-test-user": "user-A" },
    );
    assert.equal(r.status, 400, `expected 400 for "${cmd}", got ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(
      r.body.error || "",
      /git commands allowed/i,
      `expected "Only git commands allowed" for "${cmd}", got ${JSON.stringify(r.body)}`,
    );
  }
});

test("POST /api/git allows benign multi-arg git commands", async () => {
  const allowed = [
    "git status",
    "git log -1",
    "git diff HEAD",
    "git push origin main",                    // non-force push
    "git push --force-with-lease origin main", // safer force variant
    "git reset HEAD",                          // soft reset
    "git clean -n",                            // dry run
  ];
  for (const cmd of allowed) {
    const r = await postJson<{ stderr: string }>(
      "/api/git",
      { command: cmd },
      { "x-test-user": "user-A" },
    );
    assert.ok(
      !/dangerous git command blocked/i.test(r.body.stderr || ""),
      `should not safety-block "${cmd}", got ${JSON.stringify(r.body)}`,
    );
  }
});

test("POST /api/git allows benign git commands like `git --version`", async () => {
  const r = await postJson<{ stdout: string; stderr: string; exitCode: number }>(
    "/api/git",
    { command: "git --version" },
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 200);
  // Allow either success or a non-zero exit if git isn't available — we only
  // care that the route did not short-circuit on the safety list.
  assert.ok(
    !/dangerous git command blocked/i.test(r.body.stderr || ""),
    `git --version should not be safety-blocked, got stderr=${r.body.stderr}`,
  );
});

// =============================================================================
// POST /api/upload
// =============================================================================

test("POST /api/upload requires authentication (401 anonymous)", async () => {
  // Send an empty multipart-style body — even before multer reads files, the
  // requireAuth middleware should short-circuit anonymous callers.
  const fd = new FormData();
  fd.set("path", uploadTargetRel);
  const res = await fetch(`${serverUrl}/api/upload`, { method: "POST", body: fd });
  assert.equal(res.status, 401);
});

test("POST /api/upload returns 400 when no files are attached", async () => {
  const fd = new FormData();
  fd.set("path", uploadTargetRel);
  const res = await fetch(`${serverUrl}/api/upload`, {
    method: "POST",
    body: fd,
    headers: { "x-test-user": "user-A" },
  });
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string };
  assert.match(body.error, /no files uploaded/i);
});

test("POST /api/upload writes uploaded files into the safe target dir", async () => {
  const fileName = `uploaded-${randomBytes(4).toString("hex")}.txt`;
  const payload = "uploaded test contents\n";

  const fd = new FormData();
  fd.set("path", uploadTargetRel);
  fd.append("files", new Blob([payload], { type: "text/plain" }), fileName);

  const res = await fetch(`${serverUrl}/api/upload`, {
    method: "POST",
    body: fd,
    headers: { "x-test-user": "user-A" },
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { success: boolean; uploaded: number; files: Array<{ name: string; path: string }> };
  assert.equal(body.success, true);
  assert.equal(body.uploaded, 1);
  assert.equal(body.files[0].name, fileName);

  const onDisk = path.join(PROJECT_ROOT, uploadTargetRel, fileName);
  assert.equal(fs.existsSync(onDisk), true, `expected uploaded file at ${onDisk}`);
  assert.equal(fs.readFileSync(onDisk, "utf-8"), payload);
});

test("POST /api/upload rejects path traversal in the target path", async () => {
  const fd = new FormData();
  fd.set("path", "../../etc/evil-" + randomBytes(4).toString("hex"));
  fd.append("files", new Blob(["nope"], { type: "text/plain" }), "evil.txt");

  const res = await fetch(`${serverUrl}/api/upload`, {
    method: "POST",
    body: fd,
    headers: { "x-test-user": "user-A" },
  });
  assert.equal(res.status, 500);
  const body = await res.json() as { error: string };
  assert.ok(
    /traversal|allowed/i.test(body.error),
    `expected traversal-related error, got ${JSON.stringify(body)}`,
  );
});

// =============================================================================
// POST /api/create-project + DELETE /api/projects/:slug
// =============================================================================

test("POST /api/create-project requires authentication (401 anonymous)", async () => {
  const r = await postJson("/api/create-project", { name: "anon-attempt" });
  assert.equal(r.status, 401);
});

test("POST /api/create-project requires a name (400)", async () => {
  const r = await postJson<{ error: string }>(
    "/api/create-project",
    {},
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 400);
  assert.match(r.body.error, /name is required/i);
});

test("POST /api/create-project rejects names that slugify to empty (400)", async () => {
  const r = await postJson<{ error: string }>(
    "/api/create-project",
    { name: "!!!" },
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 400);
  assert.match(r.body.error, /invalid project name/i);
});

test("POST /api/create-project creates a project on disk and reports a duplicate as 409", async () => {
  const slug = `test-proj-${randomBytes(4).toString("hex")}`;
  createdProjectSlugs.push(slug);

  const r = await postJson<{ success: boolean; project: { slug: string; path: string } }>(
    "/api/create-project",
    { name: slug, template: "blank", description: "auto-test" },
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(r.body.project.slug, slug);
  const dir = path.join(PROJECT_ROOT, "projects", slug);
  assert.equal(fs.existsSync(dir), true);
  assert.equal(fs.existsSync(path.join(dir, "README.md")), true);

  // Duplicate creation must be refused with 409.
  const dup = await postJson<{ error: string }>(
    "/api/create-project",
    { name: slug, template: "blank" },
    { "x-test-user": "user-A" },
  );
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /already exists/i);
});

test("DELETE /api/projects/:slug requires authentication (401 anonymous)", async () => {
  const r = await deleteReq("/api/projects/whatever");
  assert.equal(r.status, 401);
});

test("DELETE /api/projects/:slug returns 404 for unknown projects", async () => {
  const r = await deleteReq<{ error: string }>(
    `/api/projects/missing-${randomBytes(4).toString("hex")}`,
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 404);
  assert.match(r.body.error, /not found/i);
});

test("DELETE /api/projects/:slug rejects path-traversal slugs (400)", async () => {
  // %2F = "/", which after url-decoding produces a slug containing a slash.
  const r = await deleteReq<{ error: string }>(
    `/api/projects/${encodeURIComponent("../etc")}`,
    { "x-test-user": "user-A" },
  );
  assert.equal(r.status, 400);
  assert.match(r.body.error, /invalid project slug/i);
});

test("DELETE /api/projects/:slug removes the directory for an authenticated owner", async () => {
  const slug = `del-proj-${randomBytes(4).toString("hex")}`;
  createdProjectSlugs.push(slug);
  const create = await postJson<{ success: boolean }>(
    "/api/create-project",
    { name: slug, template: "blank" },
    { "x-test-user": "user-A" },
  );
  assert.equal(create.status, 200);
  const dir = path.join(PROJECT_ROOT, "projects", slug);
  assert.equal(fs.existsSync(dir), true);

  const del = await deleteReq<{ success: boolean }>(
    `/api/projects/${slug}`,
    { "x-test-user": "user-A" },
  );
  assert.equal(del.status, 200);
  assert.equal(del.body.success, true);
  assert.equal(fs.existsSync(dir), false, "project dir must be gone after DELETE");
});
