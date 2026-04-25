import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import { AddressInfo } from "node:net";

// Regression test for the SSH chat agent loop continuing to issue upstream
// LLM completions after the client closes the tab. The original bug
// (mirror of task #47, but in /api/ssh/ai-chat): each iteration created a
// fresh setInterval heartbeat AND a fresh AbortSignal.timeout()-only
// fetch, with NO listener for the response close event — so an abandoned
// chat would happily fire off up to 20 8k-token completions to a dead
// socket.
//
// The fix attaches `res.on("close", ...)` that flips a "client gone"
// flag, clears the active heartbeat, and aborts the in-flight upstream
// fetch via an AbortController linked into AbortSignal.any([...]). The
// while-loop checks the flag at the top of every iteration and breaks
// out instead of looping further.
//
// This test stubs the OpenRouter upstream so each call returns instantly
// with a tool_use that triggers a fast local tool (list_local_files .),
// driving the loop. The test consumer reads one SSE chunk and aborts.
// We then assert the upstream call count stops climbing within a short
// window — a regression that loses the close handling would keep
// hammering the stub up to maxIterations=20 times.

const { default: sshRouter } = await import("../src/routes/ssh");
const { pool: dbPool } = await import("@workspace/db");
const expressMod = await import("express");
const express = expressMod.default;
type ExpressRequest = import("express").Request;
type ExpressResponse = import("express").Response;
type ExpressNextFunction = import("express").NextFunction;

const app = express();
app.use(express.json({ limit: "5mb" }));
// Same shim as workbench-errors: x-test-user header → req.user, so
// requireAuth on /api/ssh/ai-chat lets the request through.
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
  // Local upstream stub — returns a tool_use response on every call so
  // the agent loop wants to continue forever (well, up to 20 iterations).
  // Each call increments the counter so the test can prove no further
  // calls happen after the client disconnects.
  await new Promise<void>((resolve) => {
    upstream = http.createServer((req, res) => {
      upstreamCalls++;
      let body = "";
      req.on("data", (c) => { body += c.toString(); });
      req.on("end", () => {
        // Mirror the OpenRouter chat/completions response shape with a
        // single tool_call. list_local_files runs against the workspace
        // synchronously and returns immediately, so there is no other
        // delay between iterations.
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
                  name: "list_local_files",
                  arguments: JSON.stringify({ path: "." }),
                },
              }],
            },
            finish_reason: "tool_calls",
          }],
        }));
      });
      // Make sure we don't hold the response open if the client aborts the
      // upstream connection (the route's AbortController abort propagates
      // here as a request 'aborted' / 'close' event). We've already sent
      // the body above so this is a no-op for the happy path.
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

test("POST /api/ssh/ai-chat stops calling the upstream LLM after the client closes the connection", async () => {
  // Point the route at the local stub. modelOverride forces the OpenRouter
  // branch (tested below) and avoids the Ollama-availability probe path.
  const prevKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  const prevBase = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = "test-fake-key";
  process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL = upstreamUrl;
  upstreamCalls = 0;

  try {
    const controller = new AbortController();
    const reqPromise = fetch(`${serverUrl}/api/ssh/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user": "ssh-chat-abort-test",
      },
      body: JSON.stringify({
        // Bypass the SSH config 400 — the route never actually opens an
        // SSH connection in this test because the only tool the stub
        // emits is the local-only list_local_files.
        host: "stub.example.test",
        username: "stub",
        password: "stub",
        prompt: "list files",
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

    // Read SSE chunks until we have observed at least one upstream call
    // AND the iteration that consumed it has emitted its tool_result
    // event. That guarantees we are at the top of the loop about to
    // issue another upstream call when we abort.
    const decoder = new TextDecoder();
    let buffered = "";
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      // Wait until the loop has issued ≥1 upstream call AND has emitted
      // a tool_result for it — that means the SECOND iteration's fetch
      // is about to fire (or just fired).
      if (upstreamCalls >= 1 && buffered.includes("command_result")) {
        break;
      }
    }

    assert.ok(
      upstreamCalls >= 1,
      `expected at least one upstream call before abort, got ${upstreamCalls}`,
    );
    const callsAtAbort = upstreamCalls;

    // Abort the client side — this tears down the socket, which fires
    // res.on("close") on the server side, which in turn (with the fix)
    // sets clientClosed=true, clears the heartbeat, and aborts the
    // in-flight upstream fetch. The next iteration's `if (clientClosed)
    // break` exits the loop without issuing another completion.
    controller.abort();
    try { await reader.cancel(); } catch { /* already aborted */ }

    // Wait long enough that, without the fix, several more upstream
    // calls would have piled up: each iteration takes only a few ms of
    // wall time (synchronous local tool + immediate stub response).
    await new Promise((r) => setTimeout(r, 1500));

    // With the fix, we expect AT MOST one further call — the one that
    // was already in-flight at the moment of abort and is being aborted
    // by the close handler. Pre-fix, the loop would happily race
    // through many more iterations within the 1.5s window.
    assert.ok(
      upstreamCalls <= callsAtAbort + 1,
      `agent loop kept calling the upstream LLM after the client disconnected: ${callsAtAbort} -> ${upstreamCalls}. The res.on("close") + AbortController short-circuit appears to be missing.`,
    );
  } finally {
    if (prevKey === undefined) delete process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
    else process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = prevKey;
    if (prevBase === undefined) delete process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
    else process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL = prevBase;
  }
});
