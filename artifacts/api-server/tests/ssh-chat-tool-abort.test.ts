import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import { AddressInfo } from "node:net";
import { EventEmitter } from "node:events";
import { Client as Ssh2Client } from "ssh2";

// Regression test for task #64: long-running tool calls (run_ssh_command,
// run_ssh_commands batches, transfer_directory_to_remote per-file loops)
// kept running on the VPS / pumping bytes into a closed socket after the
// user closed the tab. Task #58 made the agent loop bail between
// iterations, but the fix did NOT thread an AbortSignal into execSSH /
// sftpUpload — so a 5-minute deploy command that was already in flight
// would simply ride out its 30s timeout (or worse) before the loop even
// got a chance to notice the disconnect.
//
// The fix:
//   - execSSH / sftpUpload accept an optional AbortSignal and, on abort,
//     destroy the underlying ssh2 connection immediately and reject.
//   - The /api/ssh/ai-chat route owns a per-tool-call AbortController
//     that the res.on("close") handler aborts on disconnect.
//   - run_ssh_commands and transfer_directory_to_remote check
//     `clientClosed` between commands / between files, so they don't
//     kick off step N+1 for a tab that is gone.
//
// This test stubs the OpenRouter upstream to emit a tool_call for
// run_ssh_command and stubs the ssh2 Client so `exec` returns a stream
// that NEVER closes — that way, without the fix, the request would hang
// for the full 30s execSSH timeout. We abort the client and assert that
// the ssh2 connection's `destroy()` is called within ~1s, well under
// that timeout.

const originalSshConnect = Ssh2Client.prototype.connect;
const originalSshExec = Ssh2Client.prototype.exec;
const originalSshEnd = Ssh2Client.prototype.end;
const originalSshDestroy = Ssh2Client.prototype.destroy;

let destroyCalls = 0;
let activeStreams: EventEmitter[] = [];

function installSshMock(): void {
  Ssh2Client.prototype.connect = function (this: Ssh2Client) {
    setImmediate(() => this.emit("ready"));
    return this;
  } as typeof Ssh2Client.prototype.connect;

  Ssh2Client.prototype.exec = function (
    this: Ssh2Client,
    _command: string,
    cb: (err: Error | undefined, stream: EventEmitter & { stderr: EventEmitter }) => void,
  ) {
    const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    stream.stderr = new EventEmitter();
    activeStreams.push(stream);
    // Deliberately never emit "close" — simulates a long-running remote
    // command (deploy, build, etc.) so the test can prove the close
    // handler tears the connection down instead of waiting for the 30s
    // execSSH timeout.
    setImmediate(() => cb(undefined, stream));
    return this;
  } as unknown as typeof Ssh2Client.prototype.exec;

  Ssh2Client.prototype.end = function (this: Ssh2Client) {
    return this;
  } as typeof Ssh2Client.prototype.end;

  Ssh2Client.prototype.destroy = function (this: Ssh2Client) {
    destroyCalls++;
    // Emit close on every active stream so the helper's promise can
    // settle quickly in production code paths.
    for (const s of activeStreams) {
      try { s.emit("close", 130); } catch { /* ignore */ }
    }
    activeStreams = [];
    return this;
  } as typeof Ssh2Client.prototype.destroy;
}

function restoreSshMock(): void {
  Ssh2Client.prototype.connect = originalSshConnect;
  Ssh2Client.prototype.exec = originalSshExec;
  Ssh2Client.prototype.end = originalSshEnd;
  Ssh2Client.prototype.destroy = originalSshDestroy;
}

const { default: sshRouter } = await import("../src/routes/ssh");
const { pool: dbPool } = await import("@workspace/db");
const expressMod = await import("express");
const express = expressMod.default;
type ExpressRequest = import("express").Request;
type ExpressResponse = import("express").Response;
type ExpressNextFunction = import("express").NextFunction;

const app = express();
app.use(express.json({ limit: "5mb" }));
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
app.use("/api", sshRouter);

let server: http.Server;
let serverUrl = "";

let upstream: http.Server;
let upstreamUrl = "";
let upstreamCalls = 0;

before(async () => {
  installSshMock();

  await new Promise<void>((resolve) => {
    upstream = http.createServer((req, res) => {
      upstreamCalls++;
      let body = "";
      req.on("data", (c) => { body += c.toString(); });
      req.on("end", () => {
        // Emit one tool_call for run_ssh_command. The mock above makes
        // that exec hang forever, so the request will sit blocked
        // inside the execSSH await until either the 30s timeout or the
        // close-handler-driven abort fires.
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          id: `stub-${upstreamCalls}`,
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                id: `call_${upstreamCalls}`,
                type: "function",
                function: {
                  name: "run_ssh_command",
                  arguments: JSON.stringify({ command: "sleep 600" }),
                },
              }],
            },
            finish_reason: "tool_calls",
          }],
        }));
      });
      req.on("close", () => { try { res.end(); } catch {} });
    });
    upstream.listen(0, "127.0.0.1", () => {
      const addr = upstream.address() as AddressInfo;
      upstreamUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  restoreSshMock();
  await new Promise<void>((resolve) => {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close(() => resolve());
  });
  await new Promise<void>((resolve) => {
    if (typeof upstream.closeAllConnections === "function") {
      upstream.closeAllConnections();
    }
    upstream.close(() => resolve());
  });
  try { await dbPool.end(); } catch { /* may be closed */ }
});

test("POST /api/ssh/ai-chat tears down an in-flight SSH command when the client disconnects", async () => {
  const prevKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  const prevBase = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = "test-fake-key";
  process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL = upstreamUrl;
  upstreamCalls = 0;
  destroyCalls = 0;
  activeStreams = [];

  try {
    const controller = new AbortController();
    const reqPromise = fetch(`${serverUrl}/api/ssh/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user": "ssh-chat-tool-abort-test",
      },
      body: JSON.stringify({
        host: "stub.example.test",
        username: "stub",
        password: "stub",
        prompt: "deploy the thing",
        modelOverride: "openrouter/test-stub",
      }),
      signal: controller.signal,
    });

    const response = await reqPromise;
    assert.equal(
      response.status,
      200,
      `expected 200 SSE response, got ${response.status}`,
    );
    const reader = response.body!.getReader();

    // Read SSE chunks until we see the "command" event for run_ssh_command,
    // which proves the route has entered the (mocked-hanging) execSSH call.
    const decoder = new TextDecoder();
    let buffered = "";
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      if (buffered.includes("\"command\"") && buffered.includes("sleep 600")) {
        break;
      }
    }
    assert.ok(
      buffered.includes("sleep 600"),
      `expected the route to start the SSH command before abort, saw: ${buffered.slice(0, 500)}`,
    );
    assert.equal(
      destroyCalls,
      0,
      "ssh2 destroy() must not be called before the client disconnects",
    );

    // Abort the client tab — fires res.on("close") on the server, which
    // (with the fix) aborts the per-tool-call controller, which causes
    // execSSH's onAbort to call conn.destroy() within microseconds.
    controller.abort();
    try { await reader.cancel(); } catch { /* already aborted */ }

    // Allow ~1s — well under the 30s execSSH internal timeout — for the
    // close handler to fire and the destroy() to land. Without the fix,
    // execSSH would hold the connection open for the full 30s timeout.
    const teardownDeadline = Date.now() + 1500;
    while (destroyCalls === 0 && Date.now() < teardownDeadline) {
      await new Promise((r) => setTimeout(r, 25));
    }

    assert.ok(
      destroyCalls >= 1,
      `expected the in-flight SSH connection to be destroyed within 1.5s of client abort, got destroyCalls=${destroyCalls}. The AbortSignal plumbing into execSSH appears to be missing.`,
    );
  } finally {
    if (prevKey === undefined) delete process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
    else process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = prevKey;
    if (prevBase === undefined) delete process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
    else process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL = prevBase;
  }
});
