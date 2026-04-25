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

process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||= "test-key";
process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ||= "https://anthropic.test";

const PROJECT_ROOT = path.resolve(process.cwd(), "../..");

interface FileEditEvent {
  type: "file_edit";
  name: string;
  editId: string;
  path: string;
  isNew: boolean;
  added: number;
  removed: number;
  previousBytes: number;
  newBytes: number;
  diff: string;
  truncated: boolean;
  summary: string;
  undoDisabled: boolean;
  undoSkipReason?: string;
}

type SseEvent =
  | FileEditEvent
  | { type: "tool_start"; name: string; id: string }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "tool_error"; name: string; error: string }
  | { type: "chunk"; content: string }
  | { type: "done" }
  | { type: "error"; content: string; status?: number }
  | { type: "warning"; content: string }
  | { type: "project"; origin: string; localPath?: string | null; remotePath?: string | null; cloned: boolean }
  | { type: string; [key: string]: unknown };

interface AnthropicEvent {
  type: string;
  [key: string]: unknown;
}

interface UndoResponse {
  ok?: boolean;
  path?: string;
  restoredBytes?: number;
  deleted?: boolean;
  remainingForFile?: number;
  error?: string;
  code?: string;
  newerCount?: number;
}

const anthropicQueue: AnthropicEvent[][] = [];
let anthropicCallCount = 0;

const realFetch = globalThis.fetch.bind(globalThis);

function makeSseResponse(events: AnthropicEvent[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

const fetchMock: typeof fetch = async (input, init) => {
  const url = urlOf(input);
  if (url.includes("anthropic.test") || url.includes("/v1/messages")) {
    anthropicCallCount++;
    const events = anthropicQueue.shift();
    if (!events) {
      return new Response(JSON.stringify({ error: "no mocked response" }), {
        status: 500,
      });
    }
    return makeSseResponse(events);
  }
  return realFetch(input as Parameters<typeof fetch>[0], init);
};
globalThis.fetch = fetchMock;

function queueWriteFileToolUse(args: {
  toolUseId: string;
  path: string;
  content: string;
}): void {
  const argJson = JSON.stringify({ path: args.path, content: args.content });
  anthropicQueue.push([
    {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: args.toolUseId,
        name: "write_file",
        input: {},
      },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: argJson },
    },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use" } },
  ]);
  anthropicQueue.push([
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "ok" },
    },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
  ]);
}

// --- ssh2 mock: replace Client.prototype.{connect,exec,end} so the VPS
// branch in project-context.ts runs against a real local filesystem in a
// scratch dir. The handler in workbench.ts can't tell the difference: the
// commands it shells out (test -f, cat, base64 -d, rm -f, stat -c%s, ls, etc.)
// just execute locally instead of over SSH.
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
  localProjectRel = `.cache/test-workbench-${randomBytes(6).toString("hex")}`;
  localProjectDir = path.join(PROJECT_ROOT, localProjectRel);
  fs.mkdirSync(localProjectDir, { recursive: true });
  fs.writeFileSync(
    path.join(localProjectDir, "package.json"),
    JSON.stringify({ name: "test-proj" }, null, 2),
  );

  vpsRemoteRoot = path.join(os.tmpdir(), `vps-test-${randomBytes(6).toString("hex")}`);
  fs.mkdirSync(vpsRemoteRoot, { recursive: true });
  fs.writeFileSync(
    path.join(vpsRemoteRoot, "package.json"),
    JSON.stringify({ name: "vps-proj" }, null, 2),
  );
});

after(async () => {
  globalThis.fetch = realFetch;
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
  try {
    await dbPool.end();
  } catch {
    /* pool may already be closed */
  }
});

interface CodeChatResult {
  events: SseEvent[];
  fileEdit: FileEditEvent | undefined;
  status: number;
}

interface ProjectDescriptorInput {
  origin: "local" | "vps";
  path: string;
  name?: string;
  ssh?: { host?: string; username?: string; port?: number };
}

async function runCodeChat(
  userId: string,
  toolPath: string,
  content: string,
  project: ProjectDescriptorInput,
): Promise<CodeChatResult> {
  const toolUseId = "toolu_" + randomBytes(8).toString("hex");
  queueWriteFileToolUse({ toolUseId, path: toolPath, content });

  const res = await realFetch(`${serverUrl}/api/code-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user": userId,
    },
    body: JSON.stringify({
      prompt: "please write " + toolPath,
      messages: [],
      writeMode: true,
      project,
    }),
  });

  const text = await res.text();
  const events: SseEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data) as SseEvent);
    } catch {
      /* skip non-json frames */
    }
  }
  const fileEdit = events.find(
    (e): e is FileEditEvent => e.type === "file_edit",
  );
  return { events, fileEdit, status: res.status };
}

async function postUndo(
  userId: string | null,
  editId: string,
): Promise<{ status: number; body: UndoResponse }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["x-test-user"] = userId;
  const res = await realFetch(`${serverUrl}/api/undo-edit`, {
    method: "POST",
    headers,
    body: JSON.stringify({ editId }),
  });
  const body = (await res.json()) as UndoResponse;
  return { status: res.status, body };
}

const localProject = (): ProjectDescriptorInput => ({
  origin: "local",
  path: localProjectRel,
  name: "test-proj",
});
const vpsProject = (): ProjectDescriptorInput => ({
  origin: "vps",
  path: vpsRemoteRoot,
  name: "vps-proj",
  ssh: { host: "fake-host", username: "fake-user", port: 22 },
});

test("local: write_file emits a file_edit SSE event with diff and undo metadata", async () => {
  const targetRel = "existing.txt";
  const fullPath = path.join(localProjectDir, targetRel);
  fs.writeFileSync(fullPath, "alpha\nbeta\ngamma\n");

  const { fileEdit } = await runCodeChat(
    "user-A",
    targetRel,
    "alpha\nBETA\ngamma\ndelta\n",
    localProject(),
  );

  assert.ok(fileEdit, "expected a file_edit SSE event");
  assert.equal(fileEdit.path, targetRel);
  assert.equal(fileEdit.isNew, false);
  assert.equal(fileEdit.name, "write_file");
  assert.equal(typeof fileEdit.editId, "string");
  assert.ok(fileEdit.editId.length >= 16);
  assert.equal(fileEdit.added, 2);
  assert.equal(fileEdit.removed, 1);
  assert.equal(fileEdit.previousBytes, Buffer.byteLength("alpha\nbeta\ngamma\n"));
  assert.equal(fileEdit.newBytes, Buffer.byteLength("alpha\nBETA\ngamma\ndelta\n"));
  assert.match(fileEdit.diff, /^--- a\/existing\.txt/m);
  assert.match(fileEdit.diff, /^\+\+\+ b\/existing\.txt/m);
  assert.match(fileEdit.diff, /^-beta$/m);
  assert.match(fileEdit.diff, /^\+BETA$/m);
  assert.match(fileEdit.diff, /^\+delta$/m);
  assert.equal(fileEdit.undoDisabled, false);

  assert.equal(
    fs.readFileSync(fullPath, "utf-8"),
    "alpha\nBETA\ngamma\ndelta\n",
    "file on disk should reflect the new content",
  );
});

test("local: undo-edit restores the previous bytes for an existing file", async () => {
  const targetRel = "restorable.txt";
  const fullPath = path.join(localProjectDir, targetRel);
  const original = "line1\nline2\nline3\n";
  fs.writeFileSync(fullPath, original);

  const { fileEdit } = await runCodeChat(
    "user-A",
    targetRel,
    "totally\nrewritten\n",
    localProject(),
  );
  assert.ok(fileEdit && fileEdit.editId);
  assert.equal(fs.readFileSync(fullPath, "utf-8"), "totally\nrewritten\n");

  const undo = await postUndo("user-A", fileEdit.editId);
  assert.equal(undo.status, 200, JSON.stringify(undo.body));
  assert.equal(undo.body.ok, true);
  assert.equal(undo.body.path, targetRel);
  assert.equal(undo.body.deleted, false);
  assert.equal(undo.body.restoredBytes, Buffer.byteLength(original));
  assert.equal(undo.body.remainingForFile, 0);
  assert.equal(
    fs.readFileSync(fullPath, "utf-8"),
    original,
    "undo should restore the exact prior bytes",
  );

  // After a successful undo the entry is removed from the per-file stack and
  // from the by-id index, so a replay of the same editId is reported as 404
  // (not-found / expired) rather than 409. 409 is now reserved for the
  // "newer edit exists on this file" case (covered separately below).
  const undoAgain = await postUndo("user-A", fileEdit.editId);
  assert.equal(undoAgain.status, 404, "consumed editId should be 404 on replay");
});

test("local: undo-edit returns 409 when a newer edit to the same file exists (not_top_of_stack)", async () => {
  const targetRel = "stacked-" + randomBytes(4).toString("hex") + ".txt";
  const fullPath = path.join(localProjectDir, targetRel);
  fs.writeFileSync(fullPath, "v0\n");

  const first = await runCodeChat("user-A", targetRel, "v1\n", localProject());
  assert.ok(first.fileEdit && first.fileEdit.editId, "first edit must produce an editId");

  const second = await runCodeChat("user-A", targetRel, "v2\n", localProject());
  assert.ok(second.fileEdit && second.fileEdit.editId, "second edit must produce an editId");
  assert.notEqual(first.fileEdit.editId, second.fileEdit.editId);
  assert.equal(fs.readFileSync(fullPath, "utf-8"), "v2\n");

  // Undoing the older (now-stacked-under) edit must be refused, otherwise the
  // newer v2 changes would be silently discarded by restoring v0.
  const undoOlder = await postUndo("user-A", first.fileEdit.editId);
  assert.equal(undoOlder.status, 409, JSON.stringify(undoOlder.body));
  assert.equal(undoOlder.body.code, "not_top_of_stack");
  assert.equal(undoOlder.body.newerCount, 1);
  assert.equal(fs.readFileSync(fullPath, "utf-8"), "v2\n", "file must not change");

  // Top-of-stack undo still works.
  const undoTop = await postUndo("user-A", second.fileEdit.editId);
  assert.equal(undoTop.status, 200, JSON.stringify(undoTop.body));
  assert.equal(fs.readFileSync(fullPath, "utf-8"), "v1\n");
});

test("local: undo-edit deletes a brand-new file (isNew branch)", async () => {
  const targetRel = "fresh-" + randomBytes(4).toString("hex") + ".txt";
  const fullPath = path.join(localProjectDir, targetRel);
  assert.equal(fs.existsSync(fullPath), false, "precondition: file must not exist");

  const { fileEdit } = await runCodeChat(
    "user-A",
    targetRel,
    "hello brand-new file\n",
    localProject(),
  );

  assert.ok(fileEdit, "expected a file_edit SSE event");
  assert.equal(fileEdit.isNew, true);
  assert.equal(fileEdit.previousBytes, 0);
  assert.equal(fs.existsSync(fullPath), true);

  const undo = await postUndo("user-A", fileEdit.editId);
  assert.equal(undo.status, 200, JSON.stringify(undo.body));
  assert.equal(undo.body.deleted, true);
  assert.equal(undo.body.restoredBytes, 0);
  assert.equal(
    fs.existsSync(fullPath),
    false,
    "isNew undo should remove the file from disk",
  );
});

test("vps: write_file emits a file_edit SSE event and persists over SSH", async () => {
  const targetRel = "vps-existing.txt";
  const fullPath = path.join(vpsRemoteRoot, targetRel);
  fs.writeFileSync(fullPath, "remote\nold\n");

  const { fileEdit } = await runCodeChat(
    "user-A",
    targetRel,
    "remote\nNEW\nextra\n",
    vpsProject(),
  );
  assert.ok(fileEdit, "expected a file_edit SSE event from VPS write");
  assert.equal(fileEdit.isNew, false);
  assert.equal(fileEdit.path, targetRel);
  assert.equal(fileEdit.previousBytes, Buffer.byteLength("remote\nold\n"));
  assert.equal(fileEdit.newBytes, Buffer.byteLength("remote\nNEW\nextra\n"));
  assert.match(fileEdit.diff, /^-old$/m);
  assert.match(fileEdit.diff, /^\+NEW$/m);
  assert.match(fileEdit.diff, /^\+extra$/m);
  assert.equal(
    fs.readFileSync(fullPath, "utf-8"),
    "remote\nNEW\nextra\n",
    "VPS write_file should overwrite the remote file via SSH (base64 round-trip)",
  );

  const undo = await postUndo("user-A", fileEdit.editId);
  assert.equal(undo.status, 200, JSON.stringify(undo.body));
  assert.equal(undo.body.deleted, false);
  assert.equal(
    fs.readFileSync(fullPath, "utf-8"),
    "remote\nold\n",
    "VPS undo should restore the prior bytes via SSH",
  );
});

test("vps: undo-edit deletes a brand-new file over SSH (isNew branch)", async () => {
  const targetRel = "vps-fresh-" + randomBytes(4).toString("hex") + ".txt";
  const fullPath = path.join(vpsRemoteRoot, targetRel);
  assert.equal(fs.existsSync(fullPath), false, "precondition: VPS file must not exist");

  const { fileEdit } = await runCodeChat(
    "user-A",
    targetRel,
    "fresh remote contents\n",
    vpsProject(),
  );

  assert.ok(fileEdit, "expected a file_edit SSE event from VPS write");
  assert.equal(fileEdit.isNew, true, "missing remote file must be reported as new");
  assert.equal(fileEdit.previousBytes, 0);
  assert.equal(fs.existsSync(fullPath), true, "VPS write should land the file on the remote");

  const undo = await postUndo("user-A", fileEdit.editId);
  assert.equal(undo.status, 200, JSON.stringify(undo.body));
  assert.equal(undo.body.deleted, true);
  assert.equal(
    fs.existsSync(fullPath),
    false,
    "VPS isNew undo should rm -f the remote file",
  );
});

test("undo-edit rejects a different user with 403 (auth-owner check)", async () => {
  const targetRel = "owned-by-A.txt";
  const fullPath = path.join(localProjectDir, targetRel);
  fs.writeFileSync(fullPath, "owner=A\n");

  const { fileEdit } = await runCodeChat(
    "user-A",
    targetRel,
    "tampered by A\n",
    localProject(),
  );
  assert.ok(fileEdit && fileEdit.editId);

  const undoAsB = await postUndo("user-B", fileEdit.editId);
  assert.equal(undoAsB.status, 403, "different user must not undo someone else's edit");
  assert.equal(
    fs.readFileSync(fullPath, "utf-8"),
    "tampered by A\n",
    "rejected undo must not modify the file",
  );

  const undoAsA = await postUndo("user-A", fileEdit.editId);
  assert.equal(undoAsA.status, 200, "owner must still be able to undo after a rejected attempt");
  assert.equal(fs.readFileSync(fullPath, "utf-8"), "owner=A\n");
});

test("undo-edit requires authentication (401 when anonymous)", async () => {
  const res = await realFetch(`${serverUrl}/api/undo-edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ editId: "deadbeef".repeat(3) }),
  });
  assert.equal(res.status, 401);
});

test("undo-edit returns 404 for unknown edit ids", async () => {
  const undo = await postUndo(
    "user-A",
    "no-such-edit-" + randomBytes(8).toString("hex"),
  );
  assert.equal(undo.status, 404);
});

test("anthropic mock was actually exercised", () => {
  assert.ok(anthropicCallCount > 0, "expected the mocked Anthropic endpoint to be called");
});
