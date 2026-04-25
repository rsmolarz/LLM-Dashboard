/**
 * Workbench OS-sandbox smoke test.
 *
 * Verifies that the deploy environment actually got the kernel-enforced
 * filesystem jail wired up, instead of silently degrading to the
 * path-validation-only fallback.
 *
 * What it does:
 *   1. Calls `detectOsSandbox()` to confirm an OS-level helper
 *      (`bwrap` / `firejail` / `nsjail`) is present and the host kernel
 *      accepts the isolation primitives we rely on.
 *   2. Builds the same isolation argv the production sandbox would
 *      build for a per-project cwd, then runs a small inner shell
 *      command that tries to write `/etc/wb-test` from inside the
 *      jail (bypassing the path-validation layer, so we are testing
 *      the OS sandbox specifically).
 *   3. Asserts that:
 *        a. The inner write either failed (non-zero exit, EROFS /
 *           EACCES on stderr), OR
 *        b. The host filesystem still does NOT contain `/etc/wb-test`
 *           after the jailed command exits (because the write landed
 *           in the private mount namespace).
 *
 * Exits 0 on success and prints a one-line summary suitable for a
 * deploy / CI gate. Exits non-zero on any of:
 *   - No OS sandbox helper detected.
 *   - The jailed write succeeded AND the host now has `/etc/wb-test`.
 *   - The probe itself errored.
 *
 * Run with: pnpm --filter @workspace/api-server smoke:sandbox
 */

import { spawnSync } from "child_process";
import { randomBytes } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  buildOsIsolationArgv,
  detectOsSandbox,
} from "../src/lib/command-sandbox";

// Use a unique, randomized target under /etc so we never collide with a
// pre-existing file. The original task talks about `/etc/wb-test`; that
// is fine as a docs-level reference, but a fixed name would give a
// false-negative if anything (an old probe run, a system file) already
// occupies it. The randomized suffix guarantees we can use file
// presence as a clean escape signal.
const HOST_TARGET = `/etc/wb-test-${randomBytes(8).toString("hex")}`;
const MARKER = `wb-test-marker-${randomBytes(8).toString("hex")}`;

function fail(msg: string): never {
  console.error(`[sandbox-smoke] FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg: string): never {
  console.log(`[sandbox-smoke] PASS: ${msg}`);
  process.exit(0);
}

function main(): void {
  const helper = detectOsSandbox();
  if (!helper) {
    fail(
      "no OS-level sandbox helper detected (bwrap/firejail/nsjail). " +
        "Production must ship `bubblewrap` (or equivalent) and have " +
        "unprivileged user namespaces enabled on the host kernel.",
    );
  }
  console.log(
    `[sandbox-smoke] detected helper: kind=${helper.kind} bin=${helper.bin}`,
  );

  // Make a temp cwd that the jail will bind read-write. We deliberately
  // do NOT route the write attempt through this cwd — we want the
  // inner command to target /etc/wb-test, which lives outside any
  // bind we set up, so the OS sandbox is the only thing keeping it
  // from landing on the host.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-sandbox-smoke-"));

  // The randomized HOST_TARGET should never pre-exist on the host. If
  // it somehow does (extremely unlikely) we abort rather than risk a
  // false-negative; the next run will pick a fresh suffix.
  if (fs.existsSync(HOST_TARGET)) {
    fail(
      `unexpected pre-existing file at ${HOST_TARGET} — refusing to run probe ` +
        "(would muddle escape signal). Re-run; the suffix is randomized.",
    );
  }

  const isoArgv = buildOsIsolationArgv(helper, tmpRoot);
  const innerCmd =
    // Try the write, capture stderr, then read back to confirm what
    // landed where. `set +e` so the script keeps running after the
    // expected failure and we can see the readback line.
    "set +e; " +
    `echo ${MARKER} > ${HOST_TARGET} 2>&1; ` +
    `echo \"inner_exit=$?\"; ` +
    `if [ -f ${HOST_TARGET} ]; then ` +
    `  echo \"inner_view=present:$(cat ${HOST_TARGET} 2>/dev/null)\"; ` +
    "else " +
    `  echo \"inner_view=absent\"; ` +
    "fi";
  const fullArgv = [...isoArgv, "sh", "-c", innerCmd];

  const r = spawnSync(fullArgv[0], fullArgv.slice(1), {
    encoding: "utf-8",
    timeout: 15_000,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
  });

  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  console.log(`[sandbox-smoke] inner stdout:\n${stdout.trimEnd()}`);
  if (stderr) {
    console.log(`[sandbox-smoke] inner stderr:\n${stderr.trimEnd()}`);
  }

  const innerExitMatch = /inner_exit=(\d+)/.exec(stdout);
  const innerExit = innerExitMatch ? Number(innerExitMatch[1]) : null;
  const innerViewMatch = /inner_view=([^\n]+)/.exec(stdout);
  const innerView = innerViewMatch ? innerViewMatch[1].trim() : null;

  // Now check the host filesystem. The HOST_TARGET path is randomized
  // and was confirmed absent before the probe ran, so any presence
  // here is conclusive evidence the jail leaked.
  let hostLeaked = false;
  if (fs.existsSync(HOST_TARGET)) {
    try {
      const body = fs.readFileSync(HOST_TARGET, "utf-8");
      hostLeaked = body.includes(MARKER);
    } catch {
      hostLeaked = true;
    }
    // Best-effort cleanup so we don't leave evidence lying around if
    // the test ever does leak in a dev environment.
    try { fs.unlinkSync(HOST_TARGET); } catch { /* probably no perms */ }
  }

  if (hostLeaked) {
    fail(
      `${HOST_TARGET} appeared on the host after running an inner write inside ` +
        `${helper.kind}. The OS-level isolation is not actually containing writes.`,
    );
  }

  // If the inner exit was 0 AND the inner view said "present" AND the
  // host did NOT see the file, we're in the desired posture: write
  // landed in the sandbox's private namespace and is invisible to the
  // host. If the inner exit was non-zero with EROFS / EACCES, that's
  // also good — the kernel rejected the write.
  if (innerExit === 0 && innerView?.startsWith("present:") && !hostLeaked) {
    pass(
      `${helper.kind} contained the write in its private namespace ` +
        `(inner saw the file, host did not).`,
    );
  }
  if (innerExit !== null && innerExit !== 0) {
    pass(
      `${helper.kind} blocked the write (inner_exit=${innerExit}, ` +
        `view=${innerView ?? "n/a"}).`,
    );
  }

  fail(
    "inconsistent probe result — could not confirm containment. " +
      `inner_exit=${innerExit ?? "n/a"} inner_view=${innerView ?? "n/a"} ` +
      `host_leaked=${hostLeaked} spawn_status=${r.status} spawn_signal=${r.signal ?? "n/a"} ` +
      `spawn_error=${r.error?.message ?? "n/a"}`,
  );
}

main();
