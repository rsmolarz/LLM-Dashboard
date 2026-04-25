#!/usr/bin/env bash
# Wrapper used by the `e2e` validation hook and the root `pnpm test:e2e`
# script. It is the single automated entry point for the workbench
# Playwright suite — see tests/e2e/README.md.
#
# Responsibilities:
#   1. Make sure Playwright's Chromium binary is on disk. The first cold
#      run downloads it into `~/.cache/ms-playwright`; every subsequent
#      run reuses the cached copy so a clean re-run stays well under
#      ~2 min on the validation hook.
#   2. Export the Nix LD_LIBRARY_PATH that Chromium needs (libnss3 etc.)
#      when running on the Replit container, so we don't fail with
#      "error while loading shared libraries".
#   3. Hand off to `playwright test`, which then boots the api-server +
#      vite dev stack itself via the `webServer` config.
set -euo pipefail

# Forward Replit's curated LD_LIBRARY_PATH if the caller hasn't set one.
# Without this Chromium fails to start on the Nix-based dev container
# because libnss3.so etc. aren't on the default loader path.
if [ -z "${LD_LIBRARY_PATH:-}" ] && [ -n "${REPLIT_LD_LIBRARY_PATH:-}" ]; then
  export LD_LIBRARY_PATH="$REPLIT_LD_LIBRARY_PATH"
fi

# Resolve where Playwright will look for downloaded browsers, mirroring
# Playwright's own resolution order so the cache check matches reality:
#   1. PLAYWRIGHT_BROWSERS_PATH wins if set.
#   2. Otherwise XDG_CACHE_HOME/ms-playwright (the workspace .cache on
#      this Replit container).
#   3. Otherwise $HOME/.cache/ms-playwright (Linux default).
if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  CACHE_DIR="$PLAYWRIGHT_BROWSERS_PATH"
elif [ -n "${XDG_CACHE_HOME:-}" ]; then
  CACHE_DIR="$XDG_CACHE_HOME/ms-playwright"
else
  CACHE_DIR="$HOME/.cache/ms-playwright"
fi

# Detect a cached Chromium install. Playwright stores browsers under
# `chromium-<revision>/` (or `chromium_headless_shell-<revision>/` for
# the lighter headless build); either is fine for running our suite.
need_install=1
if [ -d "$CACHE_DIR" ] && compgen -G "$CACHE_DIR/chromium*" > /dev/null; then
  need_install=0
fi

if [ "$need_install" = "1" ]; then
  echo "[e2e] installing Playwright Chromium binary into $CACHE_DIR (one-time)"
  pnpm --filter @workspace/tests-e2e exec playwright install chromium
else
  echo "[e2e] reusing cached Playwright Chromium binary at $CACHE_DIR"
fi

echo "[e2e] running workbench Playwright suite"
exec pnpm --filter @workspace/tests-e2e exec playwright test "$@"
