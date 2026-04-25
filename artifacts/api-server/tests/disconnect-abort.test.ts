// OpenRouter env vars are read at module-load time in code-terminal.ts,
// so they must be set before that module is imported below.
process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL =
  process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ||
  "http://127.0.0.1:1/openrouter-stub";
process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY =
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || "test-fake-key";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import {
  installDisconnectAbortStub,
  awaitSignalAbort,
} from "./_disconnect-abort-helpers";

const { default: codeTerminalRouter } = await import(
  "../src/routes/code-terminal"
);
const { default: modelEvolutionRouter } = await import(
  "../src/routes/model-evolution"
);
const { pool: dbPool } = await import("@workspace/db");
const expressMod = await import("express");
const express = expressMod.default;

const app = express();
app.use(express.json({ limit: "20mb" }));
// Mount the routers at the same paths the production server uses.
app.use("/api", modelEvolutionRouter);
app.use("/api/code-terminal", codeTerminalRouter);

// Regression coverage: the routes must abort their upstream LLM calls
// when the client disconnects, instead of letting them run for the
// full per-route timeout window.

let server: http.Server;
let serverUrl = "";

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
  try { await dbPool.end(); } catch { /* may be closed */ }
});

test("POST /api/model-evolution/generate-synthetic aborts the upstream OpenAI fetch when the client disconnects mid-generation", async () => {
  const fixture = installDisconnectAbortStub({
    ssePreamble: false,
    provider: "openai",
  });
  try {
    const controller = new AbortController();
    const reqPromise = fetch(
      `${serverUrl}/api/model-evolution/generate-synthetic`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          category: "general",
          count: 1,
        }),
        signal: controller.signal,
      },
    ).catch((err) => {
      if (err?.name !== "AbortError") throw err;
    });

    // Wait until the route has issued the upstream fetch.
    await Promise.race([
      fixture.upstreamFetchStartedPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "timed out waiting for /api/model-evolution/generate-synthetic to issue its upstream OpenAI fetch",
              ),
            ),
          5000,
        ),
      ),
    ]);

    assert.ok(
      fixture.upstreamSignal,
      "expected /api/model-evolution/generate-synthetic to attach an AbortSignal to its upstream OpenAI fetch",
    );

    controller.abort();
    await reqPromise;
    await awaitSignalAbort(
      fixture,
      "/api/model-evolution/generate-synthetic",
    );
  } finally {
    fixture.restore();
  }
});

test("POST /api/code-terminal/chat aborts the upstream OpenRouter fetch (not just the body reader) when the client disconnects mid-stream", async () => {
  const fixture = installDisconnectAbortStub({
    ssePreamble: true,
    provider: "openrouter",
  });
  try {
    const controller = new AbortController();
    const res = await fetch(`${serverUrl}/api/code-terminal/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Model name with "/" routes into the OpenRouter branch (rather
      // than Ollama which would require a DB lookup).
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      }),
      signal: controller.signal,
    });
    assert.equal(
      res.status,
      200,
      `expected HTTP 200 (SSE stream), got ${res.status}`,
    );

    // Read at least one chunk so the route is mid-stream.
    const reader = res.body!.getReader();
    const first = await reader.read();
    assert.ok(first.value, "expected at least one byte from the SSE stream");

    assert.ok(
      fixture.upstreamSignal,
      "expected /api/code-terminal/chat to attach an AbortSignal to its upstream OpenRouter fetch",
    );

    controller.abort();
    try { await reader.cancel(); } catch { /* expected after abort */ }
    await awaitSignalAbort(fixture, "/api/code-terminal/chat");
  } finally {
    fixture.restore();
  }
});
