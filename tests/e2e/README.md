# End-to-end browser tests

Playwright specs that drive the running app from a real Chromium browser. They
exist to catch regressions in flows that pure unit tests can't cover — most
notably the workbench shell's persisted history flow (up-arrow walk, Ctrl-R
reverse search, the `(reverse-i-search)` overlay, Tab/Esc accept/cancel, and
the trash-can clear that calls `DELETE /api/workbench/shell-history`).

## Prerequisites

1. The dev stack must be running. The `artifacts/api-server: API Server`
   workflow boots the api-server on `http://127.0.0.1:8080`; it proxies the
   `artifacts/llm-hub: web` Vite dev server, so a single base URL covers both
   the React routes (`/workbench`, `/claude-workbench`) and the JSON API
   (`/api/...`).
2. The api-server must be started with `WORKBENCH_E2E_AUTH=1`. The
   `artifacts/api-server/.replit-artifact/artifact.toml` dev `run` already
   prefixes the start command with this env var, so the bundled workflow is
   ready out of the box. Without it the dev-only `POST /api/__test__/login`
   endpoint returns 404 and the tests fail immediately with an authentication
   error. (Production refuses the endpoint regardless of the env var — it is
   gated on `NODE_ENV !== "production"` AND `WORKBENCH_E2E_AUTH === "1"`.)
3. Chromium needs the system libraries Playwright depends on. If
   `pnpm exec playwright test` errors with `error while loading shared
   libraries: libnss3.so` (or similar), make sure the workspace's `LD_LIBRARY_PATH`
   is exported (`export LD_LIBRARY_PATH="$REPLIT_LD_LIBRARY_PATH"`).

## Running

```bash
# one-time: install the Chromium browser binaries Playwright drives
pnpm --filter @workspace/tests-e2e test:e2e:install-browsers

# from the repo root
pnpm --filter @workspace/tests-e2e test:e2e

# or, headed for local debugging
pnpm --filter @workspace/tests-e2e test:e2e:headed
```

Override the target URL with `PLAYWRIGHT_BASE_URL`, e.g. when pointing at a
preview deploy:

```bash
PLAYWRIGHT_BASE_URL=https://my-preview.example.com \
  pnpm --filter @workspace/tests-e2e test:e2e
```

## Fixture user

`POST /api/__test__/login` upserts a deterministic `e2e_*` user and mints a
real session cookie for it. The endpoint is hard-gated on
`process.env.NODE_ENV !== "production"` AND `WORKBENCH_E2E_AUTH === "1"` so
it can never reach the production API surface. See
`artifacts/api-server/src/routes/auth.ts` for the implementation.
