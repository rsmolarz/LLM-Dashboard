import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";

// Stash + force NODE_ENV to "production" BEFORE importing the route module.
// The boot-time alert check reads `process.env.NODE_ENV` once per call, but
// the once-per-process latch we're testing only flips when that branch
// triggers — so the env has to be set before any caller reaches the
// `notifySandboxPosture` function during module load.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "production";

const { default: healthRouter, notifySandboxPosture, _resetSandboxAlertForTests } =
  await import("../src/routes/health-check");
const { sandboxHelpers } = await import("../src/lib/command-sandbox");
const { pool: dbPool } = await import("@workspace/db");
const expressMod = await import("express");
const express = expressMod.default;

const app = express();
app.use("/api", healthRouter);

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
  try { await dbPool.end(); } catch {}
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

/**
 * Read one SSE `data:` payload from a stream, with a hard timeout so a hung
 * server doesn't wedge the test runner. Returns the parsed JSON or null.
 */
async function readOneSseEvent(
  res: Awaited<ReturnType<typeof fetch>>,
  predicate: (msg: any) => boolean,
  timeoutMs = 2000,
): Promise<any | null> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const readPromise = reader.read();
    const timer = new Promise<{ done: true; value: undefined }>((resolve) =>
      setTimeout(() => resolve({ done: true, value: undefined }), remaining),
    );
    const result = await Promise.race([readPromise, timer]);
    if (result.done) break;
    buf += decoder.decode(result.value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        const payload = JSON.parse(dataLine.slice(5).trim());
        if (predicate(payload)) {
          try { await reader.cancel(); } catch {}
          return payload;
        }
      } catch { /* keep reading */ }
    }
  }
  try { await reader.cancel(); } catch {}
  return null;
}

// =============================================================================
// notifySandboxPosture: emits a one-shot alert in production when the
// kernel-enforced jail (bwrap/firejail/nsjail) is missing, and is otherwise a
// no-op so we don't spam ops on healthy boots.
// =============================================================================

test("notifySandboxPosture is a no-op when a kernel-jail helper is detected", async () => {
  if (!sandboxHelpers.osIsolation) {
    // On a fallback host this assertion would belong to the next test. The
    // run skips this case rather than faking the helper because the latch
    // we're verifying is stateful across the module instance.
    return;
  }
  _resetSandboxAlertForTests();
  const res = await fetch(`${serverUrl}/api/health/events`);
  // Drain the initial "connected" frame; any subsequent sandbox_degraded
  // would be a regression. Boot-time call should not emit one.
  notifySandboxPosture();
  const evt = await readOneSseEvent(res, (m) => m.type === "sandbox_degraded", 600);
  assert.equal(evt, null, "kernel-jail host must not produce sandbox_degraded alerts");
});

test("a fallback-posture production boot emits exactly one sandbox_degraded SSE alert", async () => {
  if (sandboxHelpers.osIsolation) {
    // Only meaningful on a host where the helper is genuinely absent. The
    // existing monitor-sandbox.test.ts already proves the JSON shape; this
    // test is specifically about the SSE push, which only fires on the
    // fallback path.
    return;
  }
  _resetSandboxAlertForTests();

  const res = await fetch(`${serverUrl}/api/health/events`);
  // Race: the SSE handler itself replays the alert to new subscribers when
  // posture is fallback-in-production, AND notifySandboxPosture broadcasts.
  // Either path is acceptable — the contract is that an SSE consumer
  // learns about the degraded posture without polling.
  notifySandboxPosture();

  const evt = await readOneSseEvent(
    res,
    (m) => m.type === "sandbox_degraded",
    2000,
  );
  assert.ok(evt, "expected a sandbox_degraded SSE event on a fallback prod boot");
  assert.equal(evt.severity, "warning");
  assert.equal(evt.sandbox.posture, "fallback");
  assert.equal(evt.sandbox.osIsolation, null);
  assert.match(evt.message, /sandbox/i);
});

test("notifySandboxPosture does not re-broadcast on subsequent calls (latched)", async () => {
  if (sandboxHelpers.osIsolation) return;
  // After the previous test the latch is already set. Calling again must
  // NOT push another live event to subscribers (the SSE replay path is a
  // separate code path and only runs on connect, not on each call).
  const res = await fetch(`${serverUrl}/api/health/events`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  // Drain everything available within a short window — replay frame +
  // connected frame — then keep the reader live to detect any unwanted
  // follow-up broadcasts.
  async function drain(timeoutMs: number): Promise<string[]> {
    const frames: string[] = [];
    let buf = "";
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), remaining),
        ),
      ]);
      if (result.done) break;
      buf += decoder.decode(result.value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        frames.push(buf.slice(0, idx));
        buf = buf.slice(idx + 2);
      }
    }
    return frames;
  }

  // Drain everything that was waiting at connect time (connected + replay).
  await drain(500);

  // Now call notify again; we must NOT see a new live broadcast follow.
  notifySandboxPosture();
  notifySandboxPosture();
  const followUp = await drain(600);
  try { await reader.cancel(); } catch {}

  const sandboxFrames = followUp.filter((f) => f.includes("sandbox_degraded"));
  assert.equal(
    sandboxFrames.length,
    0,
    `latch must suppress repeat broadcasts after boot (got ${sandboxFrames.length})`,
  );
});

// =============================================================================
// /api/health/status integrates the sandbox posture into the overall flag.
// =============================================================================

test("GET /api/health/status reports `degraded` when the sandbox is on fallback in production", async () => {
  const res = await fetch(`${serverUrl}/api/health/status`);
  // The route fans out to Ollama / VPS DB / local DB checks that may all
  // legitimately be down in CI; we only assert on the sandbox piece.
  const body = (await res.json()) as { status: string; sandbox: { posture: string } };
  assert.ok(body.sandbox, "status payload must include sandbox posture");
  assert.equal(
    body.sandbox.posture,
    sandboxHelpers.osIsolation ? "kernel-jail" : "fallback",
  );
  if (!sandboxHelpers.osIsolation) {
    // production + fallback ⇒ overall status MUST be degraded, regardless
    // of whether the other services are reachable.
    assert.equal(body.status, "degraded");
  }
});

test("GET /api/health/events replays the sandbox_degraded alert to new subscribers on fallback prod hosts", async () => {
  if (sandboxHelpers.osIsolation) return;
  const res = await fetch(`${serverUrl}/api/health/events`);
  const evt = await readOneSseEvent(
    res,
    (m) => m.type === "sandbox_degraded",
    2000,
  );
  assert.ok(evt, "fresh subscriber on a fallback prod host must receive the alert");
  assert.equal(evt.replay, true, "the connect-time alert must be marked as a replay");
  assert.equal(evt.sandbox.posture, "fallback");
});
