#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Workbench OS-sandbox gate (staging).
#
# Catches regressions where a kernel/Nix change has removed `bwrap` or
# disabled unprivileged user namespaces, which would silently degrade
# the Workbench shell sandbox to the path-validation-only fallback.
# A failing gate aborts the post-merge so the regression is surfaced
# one environment before production. See:
#   artifacts/api-server/scripts/sandbox-smoke-test.ts
echo "[post-merge] running Workbench OS-sandbox gate (artifacts/api-server/scripts/sandbox-smoke-test.ts)"
if ! pnpm --filter @workspace/api-server run smoke:sandbox; then
  echo "[post-merge] FAIL: Workbench OS-sandbox gate failed." >&2
  echo "[post-merge] The Workbench shell would silently fall back to path-validation-only protection." >&2
  echo "[post-merge] Inspect artifacts/api-server/scripts/sandbox-smoke-test.ts and fix the host before merging again." >&2
  exit 1
fi
