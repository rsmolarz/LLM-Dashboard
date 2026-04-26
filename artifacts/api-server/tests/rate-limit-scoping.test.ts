import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

const expressMod = await import("express");
const express = expressMod.default;
const { Router } = expressMod;
type ExpressRequest = import("express").Request;
type ExpressResponse = import("express").Response;
type ExpressNextFunction = import("express").NextFunction;

const { default: deepResearchRouter } = await import("../src/routes/deep-research");
const { default: llmProxyRouter } = await import("../src/routes/llm-proxy");
const { default: trainingDataRouter } = await import("../src/routes/training-data");
const { default: healthRouter } = await import("../src/routes/health");
const { pool: dbPool } = await import("@workspace/db");

const apiRouter = Router();
apiRouter.use(healthRouter);
apiRouter.use(deepResearchRouter);
apiRouter.use(llmProxyRouter);
apiRouter.use(trainingDataRouter);

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
  }
  next();
});
app.use("/api", apiRouter);

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
    if (!server) return resolve();
    server.close(() => resolve());
  });
  try {
    await dbPool.end();
  } catch {}
});

function freshUser(): string {
  return `rate-limit-scope-${randomBytes(6).toString("hex")}`;
}

async function hit(urlPath: string, user: string): Promise<number> {
  const res = await fetch(`${serverUrl}${urlPath}`, {
    headers: { "x-test-user": user },
  });
  await res.arrayBuffer().catch(() => {});
  return res.status;
}

async function hitMany(urlPath: string, user: string, count: number): Promise<number[]> {
  return Promise.all(Array.from({ length: count }, () => hit(urlPath, user)));
}

test("per-router rate limits do not bleed onto unrelated /api routes", async () => {
  const user = freshUser();

  const initialHealth = await hitMany("/api/healthz", user, 15);
  for (const status of initialHealth) {
    assert.equal(status, 200, `/api/healthz should return 200, got ${status}`);
  }

  const drStatuses = await hitMany("/api/research/sessions", user, 12);
  assert.equal(
    drStatuses.filter((s) => s === 429).length,
    2,
    `deep-research ceiling=10: expected 2 of 12 requests to be 429 (statuses: ${drStatuses.join(",")})`,
  );

  const lpStatuses = await hitMany("/api/llm/status", user, 33);
  assert.equal(
    lpStatuses.filter((s) => s === 429).length,
    3,
    `llm-proxy ceiling=30: expected 3 of 33 requests to be 429`,
  );

  const tdStatuses = await hitMany("/api/training/stats", user, 63);
  assert.equal(
    tdStatuses.filter((s) => s === 429).length,
    3,
    `training-data ceiling=60: expected 3 of 63 requests to be 429`,
  );

  const finalHealth = await hitMany("/api/healthz", user, 15);
  assert.equal(
    finalHealth.filter((s) => s === 429).length,
    0,
    `/api/healthz must never be 429 even after per-router limits are exhausted`,
  );
});

test("each per-router limiter is independent of the others", async () => {
  const user = freshUser();

  const drStatuses = await hitMany("/api/research/sessions", user, 11);
  assert.equal(
    drStatuses.filter((s) => s === 429).length,
    1,
    "deep-research should reject the 11th request (ceiling=10)",
  );

  const tdStatuses = await hitMany("/api/training/stats", user, 5);
  assert.equal(
    tdStatuses.filter((s) => s === 429).length,
    0,
    `training-data was throttled by deep-research's bucket (statuses: ${tdStatuses.join(",")})`,
  );

  const lpStatuses = await hitMany("/api/llm/status", user, 5);
  assert.equal(
    lpStatuses.filter((s) => s === 429).length,
    0,
    `llm-proxy was throttled by deep-research's bucket (statuses: ${lpStatuses.join(",")})`,
  );
});

test("src/routes/index.ts does not pass rateLimiter(...) as middleware to router.use(...)", () => {
  const indexPath = path.resolve(import.meta.dirname, "../src/routes/index.ts");
  const content = fs.readFileSync(indexPath, "utf8");

  const lines = content.split("\n");
  const offending: Array<{ line: number; text: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? "";
    const codeOnly = text.replace(/\/\/.*$/, "");
    if (/\.use\s*\(/.test(codeOnly) && /rateLimiter\s*\(/.test(codeOnly)) {
      offending.push({ line: i + 1, text: text.trim() });
    }
  }

  assert.equal(
    offending.length,
    0,
    `routes/index.ts attaches rateLimiter as middleware to router.use(...). ` +
      `Move it inside the affected sub-router instead. Offending lines:\n` +
      offending.map((o) => `  ${o.line}: ${o.text}`).join("\n"),
  );
});
