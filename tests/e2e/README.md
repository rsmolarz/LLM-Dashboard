# End-to-end browser tests

Playwright specs that drive the running app from a real Chromium browser. They
exist to catch regressions in flows that pure unit tests can't cover — most
notably the workbench shell's persisted history flow (up-arrow walk, Ctrl-R
reverse search, the `(reverse-i-search)` overlay, Tab/Esc accept/cancel, and
the trash-can clear that calls `DELETE /api/workbench/shell-history`).

## Automated entry point

The suite is wired into the project's validation hook as the **`e2e`** check
and into the root `pnpm test:e2e` script. Both call
[`scripts/run-e2e.sh`](../../scripts/run-e2e.sh), which:

1. Installs Playwright's Chromium binary on the first run and caches it
   under `~/.cache/ms-playwright` (or `$XDG_CACHE_HOME/ms-playwright`
   when set, which is the case on the Replit container). Subsequent runs
   reuse the cached copy so a clean re-run stays well under ~2 min.
2. Forwards `REPLIT_LD_LIBRARY_PATH` so Chromium can find the Nix-provided
   libraries (`libnss3.so`, etc.) it links against on the dev container.
3. Hands off to `playwright test`, which then **boots a self-contained
   stack** via the `webServer` block in `playwright.config.ts` — a
   dedicated api-server + llm-hub Vite dev server on their own ports, so
   no long-running dev workflow is required. The fixture-login env var
   (`WORKBENCH_E2E_AUTH=1`) is scoped to the api-server subprocess
   Playwright spawns — it is **not** exported into the long-running
   `artifacts/api-server` dev workflow.

A failing spec blocks the merge with the trace, screenshot, and video
artifacts that Playwright records under `tests/e2e/test-results/` (and,
in CI, also `tests/e2e/playwright-report/`).

So in practice: **you don't have to start anything.** Push your branch
and the validation hook runs the suite. Locally, just:

```bash
pnpm test:e2e
```

## Running ad-hoc

The bundled `webServer` block listens on `127.0.0.1:8095` (api-server) and
`127.0.0.1:18238` (Vite). Override the ports with `PLAYWRIGHT_API_PORT` /
`PLAYWRIGHT_VITE_PORT` if those collide with something else on your machine.

To skip the bundled servers entirely and target an already-running stack
(e.g. a preview deploy), set `PLAYWRIGHT_BASE_URL` — the `webServer` block is
disabled when that env var is present:

```bash
# Repo-root convenience script (auto-boots the dedicated stack):
pnpm test:e2e

# Or call Playwright directly inside the package, against an already-running stack:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 \
  pnpm --filter @workspace/tests-e2e exec playwright test

# Headed browser for local debugging (also against a running stack):
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 \
  pnpm --filter @workspace/tests-e2e test:e2e:headed
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
