# End-to-end browser tests

Playwright specs that drive the running app from a real Chromium browser. They
exist to catch regressions in flows that pure unit tests can't cover — most
notably the workbench shell's persisted history flow (up-arrow walk, Ctrl-R
reverse search, the `(reverse-i-search)` overlay, Tab/Esc accept/cancel, and
the trash-can clear that calls `DELETE /api/workbench/shell-history`).

## Prerequisites

The Playwright config ships a `webServer` block that boots a dedicated
api-server + llm-hub Vite dev server on their own ports for the duration of
the run, so no long-running dev workflow is required. The fixture-login env
var (`WORKBENCH_E2E_AUTH=1`) is scoped to the api-server subprocess Playwright
spawns — it is **not** exported into the long-running `artifacts/api-server`
dev workflow.

The only manual prerequisites are:

1. Chromium needs the system libraries Playwright depends on. If
   `pnpm exec playwright test` errors with `error while loading shared
   libraries: libnss3.so` (or similar), make sure the workspace's
   `LD_LIBRARY_PATH` is exported
   (`export LD_LIBRARY_PATH="$REPLIT_LD_LIBRARY_PATH"`).
2. Chromium browser binaries must be installed once
   (`pnpm --filter @workspace/tests-e2e test:e2e:install-browsers`).

## Running

```bash
# one-time: install the Chromium browser binaries Playwright drives
pnpm --filter @workspace/tests-e2e test:e2e:install-browsers

# from the repo root
pnpm --filter @workspace/tests-e2e test:e2e

# or, headed for local debugging
pnpm --filter @workspace/tests-e2e test:e2e:headed
```

The bundled `webServer` block listens on `127.0.0.1:8095` (api-server) and
`127.0.0.1:18238` (Vite). Override the ports with `PLAYWRIGHT_API_PORT` /
`PLAYWRIGHT_VITE_PORT` if those collide with something else on your machine.

To skip the bundled servers entirely and target an already-running stack
(e.g. a preview deploy), set `PLAYWRIGHT_BASE_URL` — the `webServer` block is
disabled when that env var is present:

```bash
PLAYWRIGHT_BASE_URL=https://my-preview.example.com \
  pnpm --filter @workspace/tests-e2e test:e2e
```

When pointing at an external stack you are responsible for ensuring the
api-server it serves was started with `WORKBENCH_E2E_AUTH=1`, otherwise the
fixture-login endpoint returns 404 and the tests fail at the first
`/api/__test__/login` call.

## Fixture user

`POST /api/__test__/login` upserts a deterministic `e2e_*` user and mints a
real session cookie for it. The endpoint is hard-gated on
`process.env.NODE_ENV !== "production"` AND `WORKBENCH_E2E_AUTH === "1"` so
it can never reach the production API surface, and (because we no longer set
the env var on the dev workflow) it is only reachable while a Playwright run
is in flight. See `artifacts/api-server/src/routes/auth.ts` for the
implementation.
