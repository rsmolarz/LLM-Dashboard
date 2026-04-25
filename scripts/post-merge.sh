#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Workbench OS-sandbox gate (staging).
#
# Catches regressions where a kernel/Nix change has removed `bwrap` or
# disabled unprivileged user namespaces, which would silently degrade
# the Workbench shell sandbox to the path-validation-only fallback.
#
# In dev containers where unprivileged user namespaces are disabled by
# the host kernel (e.g. the Replit dev sandbox), no helper can ever
# work, so a hard failure here would block every merge for a problem
# we cannot fix from inside the container. We therefore:
#   * Run the smoke test and surface its output.
#   * Treat a failure as a WARNING in this environment.
#   * Still rely on the production pre-deploy gate
#     (artifacts/api-server/.replit-artifact/artifact.toml) to hard-fail
#     a real production build that doesn't ship a working jail.
echo "[post-merge] running Workbench OS-sandbox gate (artifacts/api-server/scripts/sandbox-smoke-test.ts)"
if ! pnpm --filter @workspace/api-server run smoke:sandbox; then
  echo "[post-merge] WARN: Workbench OS-sandbox gate failed in this environment." >&2
  echo "[post-merge] WARN: Dev containers commonly lack unprivileged user namespaces; not blocking the merge." >&2
  echo "[post-merge] WARN: The production pre-deploy gate still enforces a working jail before shipping." >&2
fi
