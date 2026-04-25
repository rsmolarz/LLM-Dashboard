import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import { randomBytes } from "node:crypto";

const PROJECT_ROOT = path.resolve(process.cwd(), "../..");
const WORKBENCH_SRC = path.join(
  PROJECT_ROOT,
  "artifacts/api-server/src/routes/workbench.ts",
);

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

// =============================================================================
// Error contract: every failure mode the routes advertise must be a real HTTP
// 4xx/5xx with the documented `{ error, code }` body. A regression that flips
// one of these back to "200 + error string" should trip these tests.
// =============================================================================

test("GET /api/db-query returns 500 + DB_QUERY_FAILED for a SELECT against a missing relation", async () => {
  // Crafted to bypass the safety filter:
  //   - starts with `select`
  //   - contains none of the forbidden keywords (insert/update/delete/drop/
  //     alter/create/truncate/grant/revoke/exec)
  // so it reaches the real db.execute() call and Postgres rejects it with
  // "relation ... does not exist". That error MUST surface as 500 +
  // DB_QUERY_FAILED, not a 200 with an `error` string in the body.
  const q = `select 1 from this_table_definitely_does_not_exist_${randomBytes(4).toString("hex")}`;
  const r = await getJson<{
    error?: string;
    code?: string;
    rows?: unknown[];
    fields?: unknown[];
    rowCount?: number;
  }>(`/api/db-query?q=${encodeURIComponent(q)}`);

  assert.equal(r.status, 500, `expected HTTP 500, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.code, "DB_QUERY_FAILED");
  assert.ok(
    r.body.error && /does not exist|relation|failed query/i.test(r.body.error),
    `expected a DB error message, got ${JSON.stringify(r.body)}`,
  );
  // The route preserves shape so callers reading data?.rows/fields don't crash.
  assert.deepEqual(r.body.rows, []);
  assert.deepEqual(r.body.fields, []);
  assert.equal(r.body.rowCount, 0);
});

test("GET /api/files returns 400 + PATH_TRAVERSAL for a `..`-style traversal input", async () => {
  const r = await getJson<{ items?: unknown[]; error?: string; code?: string }>(
    "/api/files?path=" + encodeURIComponent("../../etc"),
  );
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "PATH_TRAVERSAL");
  // Shape preserved so existing UI code reading data?.items doesn't crash.
  assert.deepEqual(r.body.items, []);
  assert.ok(
    r.body.error && /traversal|allowed/i.test(r.body.error),
    `expected traversal-related error, got ${JSON.stringify(r.body)}`,
  );
});

test("GET /api/file-content returns 404 + NOT_FOUND for a missing workspace file", async () => {
  const missing = `does-not-exist-${randomBytes(6).toString("hex")}.txt`;
  const r = await getJson<{ content?: string; error?: string; code?: string }>(
    "/api/file-content?path=" + encodeURIComponent(missing),
  );
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "NOT_FOUND");
  assert.equal(r.body.content, undefined);
  assert.ok(
    r.body.error && /enoent|no such file|not found/i.test(r.body.error),
    `expected an ENOENT-like error, got ${JSON.stringify(r.body)}`,
  );
});

// -----------------------------------------------------------------------------
// GET /api/file-download
//
// The download route advertises the same `{ error, code }` contract as
// /files and /file-content. Because it normally streams binary octets back,
// it's especially easy to regress into "200 + plain text error in the body"
// — these tests pin the failure modes to real 4xx responses with the
// documented codes.
// -----------------------------------------------------------------------------

test("GET /api/file-download returns 400 + PATH_TRAVERSAL for a `..`-style traversal input", async () => {
  // No `project` param → the workspace branch runs safePath() which throws
  // "Path traversal not allowed", and classifyWorkbenchError translates that
  // into 400 + PATH_TRAVERSAL. A regression that streams the file or
  // returns 200 with a text error would fail this test.
  const r = await getJson<{ error?: string; code?: string }>(
    "/api/file-download?path=" + encodeURIComponent("../../etc/passwd"),
  );
  assert.equal(r.status, 400, `expected HTTP 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.code, "PATH_TRAVERSAL");
  assert.ok(
    r.body.error && /traversal|allowed/i.test(r.body.error),
    `expected traversal-related error, got ${JSON.stringify(r.body)}`,
  );
});

test("GET /api/file-download returns 400 + INVALID_PROJECT for malformed project JSON", async () => {
  // The handler tries `JSON.parse(projectRaw)` first thing inside the
  // project branch; a parse failure must be a 400 with INVALID_PROJECT —
  // never a 500 or a 200 with a stringified error.
  const r = await getJson<{ error?: string; code?: string }>(
    "/api/file-download?path=hello.txt&project=" + encodeURIComponent("{nope"),
  );
  assert.equal(r.status, 400, `expected HTTP 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.code, "INVALID_PROJECT");
  assert.ok(
    r.body.error && /invalid project/i.test(r.body.error),
    `expected an invalid-project error, got ${JSON.stringify(r.body)}`,
  );
});

test("GET /api/file-download returns 404 + NOT_FOUND for a missing local file", async () => {
  // No `project` param → safePath() succeeds (the path is inside
  // PROJECT_ROOT and contains no `..`), then sendStream() calls
  // fs.statSync() which throws ENOENT. classifyWorkbenchError must turn
  // that into 404 + NOT_FOUND, not a 500 or a 200 with a partial stream.
  const missing = `does-not-exist-${randomBytes(6).toString("hex")}.bin`;
  const r = await getJson<{ error?: string; code?: string }>(
    "/api/file-download?path=" + encodeURIComponent(missing),
  );
  assert.equal(r.status, 404, `expected HTTP 404, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.code, "NOT_FOUND");
  assert.ok(
    r.body.error && /enoent|no such file|not found/i.test(r.body.error),
    `expected an ENOENT-like error, got ${JSON.stringify(r.body)}`,
  );
});

test("GET /api/file-download returns 409 + PROJECT_NOT_PULLED for a Replit project that hasn't been cloned", async () => {
  // A replit-origin descriptor whose cache dir doesn't contain a .git
  // checkout resolves with localPath: null. The handler explicitly
  // surfaces that as 409 + PROJECT_NOT_PULLED with a sign-in hint, so
  // the UI can prompt the user to pull instead of silently succeeding.
  const replit = {
    origin: "replit" as const,
    path: `not-cloned-yet-${randomBytes(4).toString("hex")}`,
    name: "ghost-replit",
  };
  const r = await getJson<{ error?: string; code?: string }>(
    `/api/file-download?path=anything.bin&project=${encodeURIComponent(JSON.stringify(replit))}`,
  );
  assert.equal(r.status, 409, `expected HTTP 409, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.code, "PROJECT_NOT_PULLED");
  assert.ok(
    r.body.error && /not pulled yet|not cloned yet|pull files for editing/i.test(r.body.error),
    `expected a not-pulled error, got ${JSON.stringify(r.body)}`,
  );
});

test("POST /api/code-review returns 502 + AI_REQUEST_FAILED when the upstream Anthropic call fails", async () => {
  // The route gates on these two env vars before doing anything; if they're
  // not set in this test environment, set them to throwaway values so we hit
  // the upstream branch (which we then stub out below).
  const prevApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const prevBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = prevApiKey || "test-fake-key";
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL =
    prevBaseUrl || "http://127.0.0.1:1/anthropic-stub";

  // Stub global.fetch ONLY for calls that target the Anthropic upstream so we
  // can force a non-ok response without touching any other fetch use (the
  // test harness itself talks to the local Express server via fetch).
  const realFetch = globalThis.fetch;
  const upstreamHost = new URL(
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL!,
  ).host;

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    if (url.includes(upstreamHost) || url.includes("/v1/messages")) {
      // Mimic an upstream 5xx — the route is supposed to translate this into
      // its own 502 + AI_REQUEST_FAILED contract, NOT propagate the upstream
      // status verbatim and NOT swallow it as a 200.
      return new Response(
        JSON.stringify({ type: "error", error: { message: "stubbed upstream failure" } }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;

  try {
    const r = await postJson<{
      error?: string;
      code?: string;
      review?: unknown;
      meta?: unknown;
    }>("/api/code-review", { projectSlug: "test-slug" });

    assert.equal(r.status, 502, `expected HTTP 502, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code, "AI_REQUEST_FAILED");
    assert.ok(
      r.body.error && /upstream|code-review|failed/i.test(r.body.error),
      `expected an upstream-failure error, got ${JSON.stringify(r.body)}`,
    );
    // Shape preserved so the UI can read data?.review without crashing.
    assert.equal(r.body.review, null);
    assert.equal(r.body.meta, null);
  } finally {
    globalThis.fetch = realFetch;
    if (prevApiKey === undefined) delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    else process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = prevApiKey;
    if (prevBaseUrl === undefined) delete process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    else process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = prevBaseUrl;
  }
});

// -----------------------------------------------------------------------------
// AI_NOT_CONFIGURED: when the AI_INTEGRATIONS_ANTHROPIC_* env vars are missing
// the routes are supposed to short-circuit with HTTP 503 + a structured
// `{ error, code: "AI_NOT_CONFIGURED" }` body so the workbench UI can render
// a one-click "configure Anthropic" prompt instead of a generic toast.
// Both /code-chat and /code-review must use the same code so the UI can
// branch on it from a single switch.
// -----------------------------------------------------------------------------

async function withAnthropicEnvCleared(fn: () => Promise<void>): Promise<void> {
  const prevApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const prevBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  delete process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  try {
    await fn();
  } finally {
    if (prevApiKey === undefined) delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    else process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = prevApiKey;
    if (prevBaseUrl === undefined) delete process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    else process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = prevBaseUrl;
  }
}

test("POST /api/code-chat returns 503 + AI_NOT_CONFIGURED when the Anthropic env vars are missing", async () => {
  await withAnthropicEnvCleared(async () => {
    const r = await postJson<{ error?: string; code?: string }>(
      "/api/code-chat",
      { prompt: "hello" },
    );
    assert.equal(r.status, 503, `expected HTTP 503, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code, "AI_NOT_CONFIGURED");
    assert.ok(
      r.body.error && /not configured|anthropic/i.test(r.body.error),
      `expected an Anthropic-not-configured error, got ${JSON.stringify(r.body)}`,
    );
  });
});

test("POST /api/code-review returns 503 + AI_NOT_CONFIGURED when the Anthropic env vars are missing", async () => {
  await withAnthropicEnvCleared(async () => {
    const r = await postJson<{
      error?: string;
      code?: string;
      review?: unknown;
      meta?: unknown;
    }>("/api/code-review", { projectSlug: "test-slug" });
    assert.equal(r.status, 503, `expected HTTP 503, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code, "AI_NOT_CONFIGURED");
    assert.ok(
      r.body.error && /not configured|anthropic/i.test(r.body.error),
      `expected an Anthropic-not-configured error, got ${JSON.stringify(r.body)}`,
    );
    // Shape preserved so the UI can read data?.review / data?.meta without crashing.
    assert.equal(r.body.review, null);
    assert.equal(r.body.meta, null);
  });
});

// -----------------------------------------------------------------------------
// /api/code-chat has THREE distinct sites that emit AI_REQUEST_FAILED:
//   1. line ~886 — initial Anthropic upstream call returned a non-ok status,
//                  before SSE headers are flushed.
//   2. line ~901 — initial Anthropic upstream call returned ok=true but with
//                  no usable response body, before SSE headers are flushed.
//   3. line ~1129 — defensive fallthrough after the agent loop in case the
//                  loop exits without ever committing to the SSE stream.
//
// The /code-review test only covered one upstream-failure path. Without
// dedicated /code-chat tests, a refactor that flips one of these to a "200
// + error in body" SSE event would silently break the UI: the frontend
// (and any retry/CDN layer in front of it) would see "success" and the
// user would be staring at an empty chat. These tests stub global.fetch
// scoped to the Anthropic upstream host (mirroring the /code-review test)
// and assert each branch holds its 502 + AI_REQUEST_FAILED contract.
// -----------------------------------------------------------------------------

async function withAnthropicStub(
  stub: () => Response,
  fn: () => Promise<void>,
): Promise<void> {
  const prevApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const prevBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = prevApiKey || "test-fake-key";
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL =
    prevBaseUrl || "http://127.0.0.1:1/anthropic-stub";

  const realFetch = globalThis.fetch;
  const upstreamHost = new URL(
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL!,
  ).host;

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    if (url.includes(upstreamHost) || url.includes("/v1/messages")) {
      return stub();
    }
    return realFetch(input, init);
  }) as typeof fetch;

  try {
    await fn();
  } finally {
    // Always restore the real fetch so subsequent tests (and the test
    // harness's own server-talking fetches) are unaffected, even if the
    // assertions below threw.
    globalThis.fetch = realFetch;
    if (prevApiKey === undefined) delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    else process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = prevApiKey;
    if (prevBaseUrl === undefined) delete process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    else process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = prevBaseUrl;
  }
}

test("POST /api/code-chat returns 502 + AI_REQUEST_FAILED when the initial Anthropic call returns a non-ok status", async () => {
  await withAnthropicStub(
    () => new Response(
      JSON.stringify({ type: "error", error: { message: "stubbed upstream failure" } }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    ),
    async () => {
      // Anonymous, read-only chat. No project descriptor so we skip the
      // project-resolve branch and go straight into the agent loop's first
      // upstream fetch — which the stub forces to fail.
      const r = await postJson<{
        error?: string;
        code?: string;
        upstreamStatus?: number;
      }>("/api/code-chat", { prompt: "hello" });

      assert.equal(r.status, 502, `expected HTTP 502, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.code, "AI_REQUEST_FAILED");
      assert.ok(
        r.body.error && /upstream|failed|stubbed/i.test(r.body.error),
        `expected an upstream-failure error string, got ${JSON.stringify(r.body)}`,
      );
      // The handler attaches upstreamStatus on this branch so the UI can
      // distinguish "Anthropic 5xx'd us" from a transport error. Regression
      // test for that contract.
      assert.equal(r.body.upstreamStatus, 503);
    },
  );
});

test("POST /api/code-chat returns 502 + AI_REQUEST_FAILED when the upstream returns no response body", async () => {
  await withAnthropicStub(
    // ok=true but body is null. response.body?.getReader() resolves to
    // undefined, hitting the second pre-stream emit site.
    () => new Response(null, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    async () => {
      const r = await postJson<{
        error?: string;
        code?: string;
        upstreamStatus?: number;
      }>("/api/code-chat", { prompt: "hello" });

      assert.equal(r.status, 502, `expected HTTP 502, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.code, "AI_REQUEST_FAILED");
      assert.ok(
        r.body.error && /no response body|body|upstream/i.test(r.body.error),
        `expected a no-response-body error string, got ${JSON.stringify(r.body)}`,
      );
    },
  );
});

test("POST /api/code-chat (writeMode + authenticated) returns 502 + AI_REQUEST_FAILED when the Anthropic call fails", async () => {
  await withAnthropicStub(
    () => new Response(
      JSON.stringify({ type: "error", error: { message: "stubbed upstream failure" } }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    ),
    async () => {
      // writeMode=true requires authentication (the route 401s anonymous
      // write-mode requests early, before any upstream call). Sending the
      // x-test-user header trips the auth shim above so we reach the same
      // upstream fetch — but with the write-mode tools and system prompt
      // baked into the request. This guards the contract that the
      // write-mode code path doesn't accidentally stop translating
      // upstream failures into the documented 502.
      const r = await postJson<{
        error?: string;
        code?: string;
        upstreamStatus?: number;
      }>(
        "/api/code-chat",
        { prompt: "hello", writeMode: true },
        { "x-test-user": "test-user-code-chat-writemode" },
      );

      assert.equal(r.status, 502, `expected HTTP 502, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.code, "AI_REQUEST_FAILED");
      assert.ok(
        r.body.error && /upstream|failed|stubbed/i.test(r.body.error),
        `expected an upstream-failure error string, got ${JSON.stringify(r.body)}`,
      );
      assert.equal(r.body.upstreamStatus, 503);
    },
  );
});

test("POST /api/code-chat surfaces a mid-reply upstream failure as an SSE error event under HTTP 200", async () => {
  // Once the SSE stream has been flushed (the user is already seeing their
  // reply start arriving) we can no longer change the HTTP status. A
  // continuation/tool-use iteration that fails upstream is therefore
  // surfaced as `data: {"type":"error", content: ...}` under HTTP 200 and
  // the stream is ended cleanly. If a refactor swallows or mis-formats
  // that event the user's reply would just stop mid-sentence with no
  // indication anything went wrong — this test pins the contract.
  //
  // Reuses withAnthropicStub() — the helper invokes its `stub` callback
  // once per upstream call, so a closure-based counter lets us return a
  // different Response for the initial vs. continuation call without
  // re-implementing the env-var/fetch-restore scaffolding.
  let callCount = 0;
  await withAnthropicStub(
    () => {
      callCount++;
      if (callCount === 1) {
        // First upstream call: stream a small text chunk and end with
        // stop_reason=max_tokens to force the agent loop into a
        // continuation iteration. startStream() runs after the headers
        // come back ok, so by the time the second call happens the SSE
        // response to the client has already been flushed.
        const encoder = new TextEncoder();
        const events = [
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
          'data: {"type":"content_block_delta","index":0,"delta":{"text":"partial reply"}}\n\n',
          'data: {"type":"content_block_stop","index":0}\n\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n',
        ];
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const ev of events) controller.enqueue(encoder.encode(ev));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      // Second upstream call (continuation) fails. Because streamStarted
      // is now true the route MUST emit an SSE error event and end the
      // stream — it cannot change the status to 502 anymore.
      return new Response(
        "stubbed mid-stream upstream failure",
        { status: 503, headers: { "Content-Type": "text/plain" } },
      );
    },
    async () => {
      // Use raw fetch so we can read the streaming body and assert the
      // server actually called res.end() (i.e. the response terminates
      // instead of hanging the user's tab forever).
      const res = await fetch(`${serverUrl}/api/code-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "hello" }),
      });

      assert.equal(
        res.status,
        200,
        `expected HTTP 200 (SSE already flushed), got ${res.status}`,
      );
      assert.match(
        res.headers.get("content-type") || "",
        /text\/event-stream/,
        "expected SSE content-type once the stream has started",
      );

      // .text() resolves only when the server ends the stream. If the route
      // forgot to call res.end() after the mid-stream failure this would
      // hang until the test runner times out.
      const body = await res.text();

      // The first upstream call's text delta should have made it through
      // before the failure — sanity check that we really exercised the
      // "stream already started" branch.
      assert.match(
        body,
        /"type":"chunk"[^\n]*partial reply/,
        `expected the pre-failure chunk to be in the body, got:\n${body}`,
      );

      // The mid-stream failure MUST surface as a `data: {"type":"error", ...}`
      // SSE event carrying the upstream error text. A regression that
      // swallows it (or formats it as a different SSE type) would leave
      // the user staring at a half-finished reply with no indication.
      const errLine = body
        .split("\n")
        .find((l) => l.startsWith("data: ") && /"type":"error"/.test(l));
      assert.ok(
        errLine,
        `expected an SSE error event in the body, got:\n${body}`,
      );
      assert.match(
        errLine!,
        /stubbed mid-stream upstream failure/,
        `expected the SSE error event to carry the upstream error text, got: ${errLine}`,
      );

      // Two upstream calls total: the initial stream + the failed
      // continuation. If this drops to 1 the test no longer exercises the
      // post-stream branch and the assertions above are meaningless.
      assert.equal(
        callCount,
        2,
        `expected exactly 2 upstream calls (initial + continuation), got ${callCount}`,
      );
    },
  );
});

test("POST /api/code-chat surfaces a mid-reply continuation with no response body as an SSE error event under HTTP 200", async () => {
  // Sibling of the previous mid-reply test: this time the SECOND upstream
  // call returns ok=true but a null body, so `response.body?.getReader()`
  // resolves to undefined and the route hits the post-stream branch of
  // the `!reader` check (workbench.ts ~line 909). Because streamStarted
  // is already true by that point we cannot change the HTTP status to
  // 502; the route MUST emit a `data: {"type":"error", content: "No
  // response body"}` SSE event and call res.end(). Without this test, a
  // refactor that drops that emit would silently freeze the user's reply
  // mid-sentence with no indication anything went wrong.
  let callCount = 0;
  await withAnthropicStub(
    () => {
      callCount++;
      if (callCount === 1) {
        // Same first-call setup as the sibling test: stream a small text
        // chunk and end with stop_reason=max_tokens to force the agent
        // loop into a continuation iteration once the SSE response to
        // the client has been flushed.
        const encoder = new TextEncoder();
        const events = [
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
          'data: {"type":"content_block_delta","index":0,"delta":{"text":"partial reply"}}\n\n',
          'data: {"type":"content_block_stop","index":0}\n\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n',
        ];
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const ev of events) controller.enqueue(encoder.encode(ev));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      // Second upstream call: ok=true but body is null. This is the
      // specific shape that makes `response.body?.getReader()` undefined
      // inside the agent loop, exercising the post-stream `!reader`
      // branch.
      return new Response(null, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
    async () => {
      // Raw fetch so we can read the streaming body and assert the
      // server actually called res.end() — if the route forgot to end
      // the stream after the no-body continuation, .text() would hang
      // until the test runner times out.
      const res = await fetch(`${serverUrl}/api/code-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "hello" }),
      });

      assert.equal(
        res.status,
        200,
        `expected HTTP 200 (SSE already flushed), got ${res.status}`,
      );
      assert.match(
        res.headers.get("content-type") || "",
        /text\/event-stream/,
        "expected SSE content-type once the stream has started",
      );

      const body = await res.text();

      // The first upstream call's text delta should have made it through
      // before the no-body continuation — sanity check that we really
      // exercised the "stream already started" branch.
      assert.match(
        body,
        /"type":"chunk"[^\n]*partial reply/,
        `expected the pre-failure chunk to be in the body, got:\n${body}`,
      );

      // The no-body continuation MUST surface as a `data: {"type":"error",
      // content: "No response body"}` SSE event. A regression that drops
      // it would leave the user staring at a half-finished reply with
      // no indication.
      const errLine = body
        .split("\n")
        .find((l) => l.startsWith("data: ") && /"type":"error"/.test(l));
      assert.ok(
        errLine,
        `expected an SSE error event in the body, got:\n${body}`,
      );
      assert.match(
        errLine!,
        /"content":"No response body"/,
        `expected the SSE error event to carry "No response body", got: ${errLine}`,
      );

      // Two upstream calls total: the initial stream + the no-body
      // continuation. If this drops to 1 the test no longer exercises
      // the post-stream `!reader` branch and the assertions above are
      // meaningless.
      assert.equal(
        callCount,
        2,
        `expected exactly 2 upstream calls (initial + continuation), got ${callCount}`,
      );
    },
  );
});

test("/api/code-chat keeps three AI_REQUEST_FAILED emit sites with the documented response shape", () => {
  // The agent-loop fallthrough at line ~1129 is defensive: in the current
  // structure the loop always either returns early (branches above) or
  // calls startStream() before continuing, so it can't be exercised via
  // fetch stubs alone. A static check still catches the regression where
  // someone deletes the defensive branch (or, worse, replaces it with a
  // 200 + error-in-body shape).
  const source = fs.readFileSync(WORKBENCH_SRC, "utf-8");

  // Slice out just the /code-chat handler so /code-review's AI_REQUEST_FAILED
  // emit doesn't leak into the count.
  const start = source.indexOf('router.post("/code-chat"');
  assert.ok(start >= 0, "could not locate /code-chat handler in workbench.ts");
  const codeReviewStart = source.indexOf('router.post("/code-review"', start);
  const end = codeReviewStart >= 0 ? codeReviewStart : source.length;
  const handler = source.slice(start, end);

  const emitSites = Array.from(
    handler.matchAll(/code:\s*"AI_REQUEST_FAILED"/g),
  );
  assert.equal(
    emitSites.length,
    3,
    `expected 3 AI_REQUEST_FAILED emit sites in /code-chat, found ${emitSites.length}`,
  );

  // Every emit site must sit inside a `res.status(502).json({ ... })` block
  // — i.e. an HTTP 502 with `{ error, code }`. If a refactor flips any of
  // them to `res.write(...)` (an SSE event under a 200) or `res.status(200)`
  // this test fails.
  for (const m of emitSites) {
    const at = m.index ?? 0;
    const window = handler.slice(Math.max(0, at - 200), at);
    assert.ok(
      /res\.status\(502\)\.json\(\{[\s\S]*$/.test(window),
      `AI_REQUEST_FAILED emit site is not inside a res.status(502).json({...}) block: \n${window}`,
    );
    assert.ok(
      /error:/.test(window),
      `AI_REQUEST_FAILED emit site is missing an \`error\` field in the same response body: \n${window}`,
    );
  }
});

// =============================================================================
// Static contract: the WorkbenchErrorCode union must stay in sync with the
// `code: "..."` literals the routes actually emit. If a route adds a new code
// without extending the type (or vice versa) this test fails.
// =============================================================================

test("WorkbenchErrorCode union covers every code emitted by the route handlers", () => {
  const source = fs.readFileSync(WORKBENCH_SRC, "utf-8");

  // 1. Extract the union members from the type declaration.
  const unionMatch = source.match(
    /type\s+WorkbenchErrorCode\s*=\s*([\s\S]*?);/,
  );
  assert.ok(unionMatch, "could not find `type WorkbenchErrorCode = ...;` in workbench.ts");
  const unionBody = unionMatch[1];
  const unionMembers = new Set(
    Array.from(unionBody.matchAll(/"([A-Z][A-Z0-9_]+)"/g)).map(m => m[1]),
  );
  assert.ok(unionMembers.size > 0, "union appears empty");

  // 2. Extract every literal `code: "..."` value emitted by the routes,
  // EXCLUDING the type-declaration block itself so we only count emit sites.
  const beforeUnion = source.slice(0, unionMatch.index ?? 0);
  const afterUnion = source.slice((unionMatch.index ?? 0) + unionMatch[0].length);
  const emitSource = beforeUnion + afterUnion;
  const emittedCodes = new Set(
    Array.from(emitSource.matchAll(/code:\s*"([A-Za-z0-9_]+)"/g)).map(m => m[1]),
  );
  // The two not_top_of_*_stack codes are local to the undo/redo response
  // shape and not part of the shared HTTP error contract — they are
  // intentionally lowercase and excluded from WorkbenchErrorCode.
  emittedCodes.delete("not_top_of_stack");
  emittedCodes.delete("not_top_of_redo_stack");

  assert.ok(emittedCodes.size > 0, "no `code: \"...\"` emit sites found");

  // 3. Every emitted UPPER_SNAKE code must be a member of the union.
  const missingFromUnion = [...emittedCodes].filter(c => !unionMembers.has(c));
  assert.deepEqual(
    missingFromUnion,
    [],
    `routes emit codes not in WorkbenchErrorCode: ${missingFromUnion.join(", ")}`,
  );

  // 4. The four codes the task pins down explicitly must be in the union.
  for (const required of [
    "PATH_TRAVERSAL",
    "NOT_FOUND",
    "DB_QUERY_FAILED",
    "AI_REQUEST_FAILED",
  ] as const) {
    assert.ok(
      unionMembers.has(required),
      `WorkbenchErrorCode is missing required member ${required}`,
    );
  }
});
