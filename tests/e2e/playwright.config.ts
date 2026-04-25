import { defineConfig, devices } from "@playwright/test";

// E2E tests assume the dev stack (api-server + llm-hub vite dev server) is
// already running and that `WORKBENCH_E2E_AUTH=1` is exported in the
// api-server's environment so the dev-only `/api/__test__/login` endpoint
// will mint a fixture-user session. See README.md for instructions.
//
// The api-server's dev workflow listens on port 8080 and proxies the
// llm-hub vite dev server, so a single base URL covers both the static
// React routes (`/workbench`, `/claude-workbench`) and the JSON API
// (`/api/...`). Override with `PLAYWRIGHT_BASE_URL` when pointing at a
// preview deploy or a stack on a non-default port.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:8080";

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
