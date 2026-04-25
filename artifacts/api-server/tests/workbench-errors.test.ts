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
