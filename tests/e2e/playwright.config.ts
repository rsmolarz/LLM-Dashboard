import { defineConfig, devices } from "@playwright/test";

// E2E tests boot a self-contained stack via Playwright's `webServer`
// block: a dedicated llm-hub Vite dev server and a dedicated api-server
// instance that proxies it. The api-server is launched with
// `WORKBENCH_E2E_AUTH=1` scoped to that subprocess only, so the
// dev-only `POST /api/__test__/login` endpoint is reachable for the
// duration of the test run and nowhere else. This avoids exporting
// the env var into the shared dev workflow (which would otherwise
// leave the fixture-login endpoint live for any local dev request).
//
// Override `PLAYWRIGHT_BASE_URL` to point tests at an already-running
// stack (e.g. a preview deploy). When that env var is set the
// `webServer` block is skipped so we don't try to bind the test ports.
const TEST_API_PORT = process.env.PLAYWRIGHT_API_PORT?.trim() || "8095";
const TEST_VITE_PORT = process.env.PLAYWRIGHT_VITE_PORT?.trim() || "18238";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const BASE_URL = externalBaseUrl || `http://127.0.0.1:${TEST_API_PORT}`;

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : "list",
  // The shell endpoint shells out through bwrap on the first command,
  // which can take a few seconds to warm up.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          // Dedicated Vite dev server for the llm-hub React routes that
          // the api-server proxies in development. Bound to its own port
          // so it never collides with the user's `artifacts/llm-hub: web`
          // workflow if they happen to be running it concurrently.
          command: "pnpm --filter @workspace/llm-hub run dev",
          env: {
            PORT: TEST_VITE_PORT,
            BASE_PATH: "/",
          },
          url: `http://127.0.0.1:${TEST_VITE_PORT}/`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          // Dedicated api-server. `WORKBENCH_E2E_AUTH=1` is scoped to
          // this subprocess only — it does not leak into the user's
          // shell or the long-running dev workflow. `VITE_DEV_PORT`
          // points the proxy at the test Vite instance above.
          command: "pnpm --filter @workspace/api-server run dev",
          env: {
            PORT: TEST_API_PORT,
            VITE_DEV_PORT: TEST_VITE_PORT,
            WORKBENCH_E2E_AUTH: "1",
          },
          url: `http://127.0.0.1:${TEST_API_PORT}/api/healthz`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
