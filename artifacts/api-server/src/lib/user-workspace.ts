/**
 * Per-user scratch workspaces for the Workbench shell + git endpoints.
 *
 * Background
 * ----------
 * Both `POST /api/shell` (host-workspace branch) and `POST /api/git`
 * historically executed in the *shared* host project root. Defence-in-
 * depth lives in `command-sandbox.ts` (scrubbed env, prlimit caps,
 * redirect-target containment, …) but the cwd was still shared across
 * every authenticated user. That left two concrete problems:
 *
 *   1. Two users editing the workbench at the same time can race on
 *      the same files (e.g. one user `> log.txt` clobbering another
 *      user's `> log.txt`).
 *   2. A malicious authenticated user can read or modify another
 *      user's in-flight scratch state — e.g. a wip script left
 *      sitting in the project root by another session.
 *
 * What this module provides
 * -------------------------
 * Each authenticated user gets a private scratch directory at
 *
 *   `<PROJECT_ROOT>/.cache/workbench-sandbox/<userIdHash>/host/`
 *
 * The directory is initialised on demand with a sparse, symlink-based
 * view of the host workspace. Every top-level entry from PROJECT_ROOT
 * is symlinked into the scratch root, EXCEPT a strict skip list:
 *
 *   - `.cache`     — where the scratch root itself lives; mirroring
 *                    would create a self-referential loop.
 *   - `.local`     — agent / per-user private state (tasks, skills
 *                    credentials, agent inboxes); no end-user should
 *                    be able to read it through the workbench shell.
 *   - `.git`       — the host repository. Internal git writes (e.g.
 *                    `git commit`, `git checkout`, `git fetch`)
 *                    bypass the sandbox's argv / redirect-target
 *                    parsers because git mutates `index`, `refs/`,
 *                    and `objects/` via library calls. Symlinking
 *                    `.git` would let any user clobber another
 *                    user's branch / index state through the shared
 *                    repo. Skipping it isolates per-user git state
 *                    by design — `POST /api/git` host-mode commands
 *                    will return git's own "not a git repository"
 *                    error until the caller supplies a project
 *                    descriptor (which routes through the project-
 *                    aware clone flow with its own per-clone state).
 *
 * - **Reads** through symlinks transparently follow back to the host,
 *   so `cat src/foo.ts`, `ls src/`, etc. keep working — dev workflows
 *   are intact.
 * - **Writes** to *new* top-level entries (e.g. `touch foo.txt`,
 *   `echo x > scratch.log`) land inside the user's scratch dir and
 *   are isolated from every other user.
 * - **Writes through symlinks** to host paths (e.g. `echo > src/foo.ts`,
 *   which would mutate the shared host file) are caught by the
 *   existing `checkPathContainment` validator: it realpath()s the
 *   deepest-existing ancestor of the target and rejects when the
 *   resolved path escapes the sandbox cwd. This means writes through
 *   the symlink view are rejected automatically; users must create
 *   new files under their own scratch dir.
 *
 * Limitations
 * -----------
 * We do NOT have OS-level filesystem isolation (the Replit container
 * blocks unprivileged user namespaces; see `command-sandbox.ts`
 * header). Anything that can bypass the static path-containment
 * checker (interpreter syscalls, etc.) could in theory still touch
 * the host workspace via the symlinks. Those primitives are already
 * blocked by the sandbox's interpreter-deny list, but the symlink-
 * view design choice keeps the threat model honest: this is
 * isolation by *cwd + write-target validation*, not chroot.
 *
 * Cleanup
 * -------
 * `startScratchCleanupSchedule()` runs hourly and removes any
 * scratch dir whose mtime is older than `SCRATCH_TTL_MS` (24h),
 * so abandoned sessions don't accumulate. Cleanup is best-effort
 * and fail-soft; a scratch dir locked open by a long-running shell
 * just gets retried on the next interval.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { extractCommands } from "./command-safety";
import { extractRedirectTargets } from "./command-sandbox";

const PROJECT_ROOT = process.env.NODE_ENV === "production"
  ? process.cwd()
  : path.resolve(process.cwd(), "../..");

export const SCRATCH_ROOT = path.join(PROJECT_ROOT, ".cache", "workbench-sandbox");

// Idle TTL after which an abandoned scratch dir is removed by the
// cleanup task. Bumped just high enough to survive an overnight gap.
const SCRATCH_TTL_MS = 24 * 60 * 60 * 1000;
// Cleanup cadence. unref()ed so it doesn't keep the event loop alive.
const SCRATCH_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// Per-user disk-usage cap on the scratch dir. Once a user crosses this
// they cannot start any new shell/git command until they free space.
// The base sandbox already enforces a 512 MiB single-file fsize via
// prlimit, but a user could still grow their dir to many GiB by
// creating lots of files just under the per-file cap. A default of
// 1 GiB keeps generous headroom for legitimate dev workflows (npm
// caches, test outputs) while bounding blast radius long before the
// 24h TTL kicks in. Override via WORKBENCH_USER_QUOTA_BYTES.
const DEFAULT_USER_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GiB
// Host-wide cap on the entire `.cache/workbench-sandbox` tree. After
// the TTL pass, if the tree is still bigger than this the cleanup
// task evicts the LARGEST per-user scratch dirs first until the tree
// fits — even if those users are still within the 24h TTL. This is
// the load-bearing defence against many-users-each-just-under-the-
// per-user-cap scenarios. Override via WORKBENCH_HOST_QUOTA_BYTES.
const DEFAULT_HOST_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB

function parsePositiveBytes(raw: string | undefined, dflt: number): number {
  if (typeof raw !== "string" || raw.length === 0) return dflt;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return dflt;
  return n;
}

// `let` so the test harness can adjust caps without re-importing the
// module (caps are otherwise read once at load time).
let SCRATCH_USER_QUOTA_BYTES = parsePositiveBytes(
  process.env.WORKBENCH_USER_QUOTA_BYTES,
  DEFAULT_USER_QUOTA_BYTES,
);
let SCRATCH_HOST_QUOTA_BYTES = parsePositiveBytes(
  process.env.WORKBENCH_HOST_QUOTA_BYTES,
  DEFAULT_HOST_QUOTA_BYTES,
);

// Top-level workspace entries we deliberately do NOT mirror into the
// scratch view. See module header for rationale on each.
const SKIP_SYMLINK_TOP_LEVEL: ReadonlySet<string> = new Set<string>([
  ".cache",
  ".local",
  ".git",
]);

function userIdHash(userId: string): string {
  // SHA-256 truncated to 16 hex chars. User IDs may be opaque OIDC
  // subject claims, email addresses, or short integers; hashing
  // keeps the on-disk path uniform and avoids leaking PII into the
  // filesystem.
  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

/**
 * Compute the absolute path of `userId`'s scratch dir without
 * touching the filesystem. Useful for tests and assertions.
 */
export function getUserScratchDir(userId: string): string {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId is required for scratch dir resolution");
  }
  return path.join(SCRATCH_ROOT, userIdHash(userId), "host");
}

/**
 * Create (if necessary) and refresh the per-user scratch dir. Returns
 * the absolute path. Always safe to call on every request — the cost
 * is dominated by a few `lstat` syscalls once the symlinks are in
 * place.
 */
export function ensureUserScratchDir(userId: string): string {
  const dir = getUserScratchDir(userId);
  fs.mkdirSync(dir, { recursive: true });
  syncSymlinkView(dir);
  // Bump mtime so the cleanup task knows the dir is still in use.
  // Cleanup walks SCRATCH_ROOT entries (the per-user `<hash>` dirs)
  // and uses the freshest mtime of `<hash>` or `<hash>/host` as the
  // liveness signal — so we touch BOTH levels here. Touching only
  // `<hash>/host` would leave `<hash>`'s mtime frozen at directory-
  // creation time and the cleanup task would garbage-collect active
  // users after TTL elapsed.
  try {
    const now = new Date();
    fs.utimesSync(dir, now, now);
    fs.utimesSync(path.dirname(dir), now, now);
  } catch {
    // best-effort
  }
  return dir;
}

/**
 * Environment variables that callers should layer on top of the
 * sandbox env when running shell / git commands inside a per-user
 * scratch dir. Specifically we set `GIT_CEILING_DIRECTORIES` so that
 * git's parent-directory walk (`git rev-parse`, `git status`, etc.)
 * stops at the scratch root and never reaches the host workspace's
 * own `.git/` — which is critical because we deliberately do NOT
 * symlink `.git` into the scratch view, but git will happily walk
 * up to find it otherwise.
 */
export function userScratchSandboxEnv(): Record<string, string> {
  return {
    GIT_CEILING_DIRECTORIES: SCRATCH_ROOT,
  };
}

/**
 * Quota snapshot for a user's scratch dir. `usedBytes` counts only
 * concrete files the user created — symlinks (which point back to the
 * shared host workspace) are deliberately excluded so a stable
 * symlink view of a 5 GiB monorepo doesn't burn through every user's
 * 1 GiB quota on first request.
 */
export interface UserQuotaInfo {
  usedBytes: number;
  capBytes: number;
  remainingBytes: number;
}

/**
 * Walk a directory and return total bytes of REAL files (not
 * symlinks, not the symlink target). Returns 0 for missing dirs and
 * is fail-soft on unreadable subtrees so quota accounting never
 * crashes a request handler. Recursion uses an explicit stack to
 * avoid blowing the call stack on pathological scratch trees.
 */
function walkRealFileBytes(root: string): number {
  let total = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      // Skip symlinks: in the scratch view they point back into the
      // shared host workspace; following them would (a) double-count
      // host bytes against the user's per-user quota, and (b) risk
      // walking out into the entire host filesystem.
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile()) {
        try {
          const st = fs.lstatSync(full);
          total += st.size;
        } catch {
          // best-effort: a transient unlink between readdir + lstat
          // shouldn't crash the request handler.
        }
      }
    }
  }
  return total;
}

/**
 * Compute the on-disk usage of a user's scratch dir, in bytes.
 * Returns 0 for users with no scratch dir yet. Excludes symlinks
 * (see `walkRealFileBytes`).
 */
export function computeUserScratchUsage(userId: string): number {
  return walkRealFileBytes(getUserScratchDir(userId));
}

/**
 * Snapshot of the user's quota: used / cap / remaining. The cap is
 * `SCRATCH_USER_QUOTA_BYTES`. `remainingBytes` is clamped to ≥ 0 so
 * a user who blew past the cap mid-command just sees 0 remaining
 * (rather than a negative confusing the UI).
 */
export function getUserQuotaInfo(userId: string): UserQuotaInfo {
  const usedBytes = computeUserScratchUsage(userId);
  const capBytes = SCRATCH_USER_QUOTA_BYTES;
  return {
    usedBytes,
    capBytes,
    remainingBytes: Math.max(0, capBytes - usedBytes),
  };
}

/**
 * Read the current per-user disk cap (bytes). Reflects any runtime
 * override applied via `setUserQuotaBytes`.
 */
export function getUserQuotaBytes(): number {
  return SCRATCH_USER_QUOTA_BYTES;
}

/**
 * Read the current host-wide eviction threshold (bytes). Reflects any
 * runtime override applied via `setHostQuotaBytes`.
 */
export function getHostQuotaBytes(): number {
  return SCRATCH_HOST_QUOTA_BYTES;
}

/**
 * The compile-time defaults for both caps. Surfaced so the admin UI
 * can show "default 1 GiB / 10 GiB" alongside the live values.
 */
export function getQuotaDefaults(): { userQuotaBytes: number; hostQuotaBytes: number } {
  return {
    userQuotaBytes: DEFAULT_USER_QUOTA_BYTES,
    hostQuotaBytes: DEFAULT_HOST_QUOTA_BYTES,
  };
}

/**
 * Override the per-user disk cap at runtime. Pass `null` to restore
 * the env-var-or-default value. Throws on a non-positive / non-finite
 * input so an admin endpoint can surface a clear error to the caller.
 */
export function setUserQuotaBytes(n: number | null): void {
  if (n === null) {
    SCRATCH_USER_QUOTA_BYTES = parsePositiveBytes(
      process.env.WORKBENCH_USER_QUOTA_BYTES,
      DEFAULT_USER_QUOTA_BYTES,
    );
    return;
  }
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error("user quota must be a positive integer number of bytes");
  }
  SCRATCH_USER_QUOTA_BYTES = n;
}

/**
 * Override the host-wide eviction threshold at runtime. Pass `null`
 * to restore the env-var-or-default value. Throws on a non-positive /
 * non-finite input.
 */
export function setHostQuotaBytes(n: number | null): void {
  if (n === null) {
    SCRATCH_HOST_QUOTA_BYTES = parsePositiveBytes(
      process.env.WORKBENCH_HOST_QUOTA_BYTES,
      DEFAULT_HOST_QUOTA_BYTES,
    );
    return;
  }
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error("host quota must be a positive integer number of bytes");
  }
  SCRATCH_HOST_QUOTA_BYTES = n;
}

/**
 * Per-entry usage info for a single user's scratch dir, used by the
 * admin usage summary. `overThreshold` is true once `usedBytes` is at
 * or above `OVER_THRESHOLD_PCT` of the per-user cap (default 80%) —
 * intended as a "watch list" for operators.
 */
export interface ScratchUsageEntry {
  userIdHash: string;
  usedBytes: number;
  mtimeMs: number;
  overThreshold: boolean;
}

export interface HostUsageInfo {
  totalBytes: number;
  hostCapBytes: number;
  userCapBytes: number;
  overThresholdPct: number;
  users: ScratchUsageEntry[];
}

const OVER_THRESHOLD_PCT = 0.8;

/**
 * Walk the scratch root and return a per-user usage breakdown plus
 * the host total. Symlinks are excluded (same accounting rule as
 * `computeUserScratchUsage`). Fail-soft on unreadable entries — an
 * admin endpoint should still render a useful summary even if a
 * single user dir is in a weird state.
 */
export function getHostUsageInfo(): HostUsageInfo {
  const userCapBytes = SCRATCH_USER_QUOTA_BYTES;
  const hostCapBytes = SCRATCH_HOST_QUOTA_BYTES;
  const users: ScratchUsageEntry[] = [];
  let totalBytes = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(SCRATCH_ROOT, { withFileTypes: true });
  } catch {
    return { totalBytes: 0, hostCapBytes, userCapBytes, overThresholdPct: OVER_THRESHOLD_PCT, users };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const userDir = path.join(SCRATCH_ROOT, entry.name);
    const usedBytes = walkRealFileBytes(userDir);
    let mtimeMs = 0;
    try {
      const st = fs.statSync(userDir);
      mtimeMs = Math.max(mtimeMs, st.mtimeMs);
    } catch {}
    try {
      const stHost = fs.statSync(path.join(userDir, "host"));
      mtimeMs = Math.max(mtimeMs, stHost.mtimeMs);
    } catch {}
    users.push({
      userIdHash: entry.name,
      usedBytes,
      mtimeMs,
      overThreshold: userCapBytes > 0 && usedBytes >= userCapBytes * OVER_THRESHOLD_PCT,
    });
    totalBytes += usedBytes;
  }
  // Largest first — operators reading an incident report care about
  // who's burning the most disk, not lexicographic ordering.
  users.sort((a, b) => b.usedBytes - a.usedBytes);
  return { totalBytes, hostCapBytes, userCapBytes, overThresholdPct: OVER_THRESHOLD_PCT, users };
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KiB`;
  return `${n} B`;
}

/**
 * Pre-flight quota check for shell / git commands. If the user's
 * scratch dir is already at or above the per-user cap, the caller
 * should refuse the command before spawning anything; otherwise the
 * command is allowed to proceed and the same quota snapshot can be
 * surfaced in the success response so the user knows their headroom.
 *
 * Note: the check is "already over" rather than "would exceed after
 * this command", because we cannot statically predict how many bytes
 * a shell command will write. The post-flight quota snapshot in the
 * response is what reveals the actual delta. Combined with the
 * existing 512 MiB single-file `prlimit --fsize` and a 30s wall-clock
 * timeout, the total a single command can write past the cap is
 * bounded.
 */
export function checkUserQuota(userId: string): {
  blocked: boolean;
  reason?: string;
  quota: UserQuotaInfo;
} {
  const quota = getUserQuotaInfo(userId);
  if (quota.usedBytes >= quota.capBytes) {
    return {
      blocked: true,
      reason: `Scratch disk quota exceeded (${formatBytes(quota.usedBytes)} used of ${formatBytes(quota.capBytes)} cap). Delete files in your scratch dir before running new commands.`,
      quota,
    };
  }
  return { blocked: false, quota };
}

/**
 * Reject commands whose argv operands try to read or write paths
 * outside the current user's scratch dir. The base sandbox already
 * blocks WRITE escapes (redirect targets + known write argvs +
 * realpath-based containment), but read paths slip through: a
 * malicious user could `cat ../../<otherUserHash>/host/<secret>`,
 * `ls /home/runner/workspace/.local/...`, or read another user's
 * scratch via an absolute path. Those are read-only operations the
 * base sandbox doesn't intercept, so we add an explicit pre-flight
 * containment check on EVERY argv operand here.
 *
 * The rule, applied to every non-flag argv token of every command in
 * the pipeline:
 *   - tokens that look like paths (contain `/`, equal `.`/`..`, or
 *     start with `~`) are resolved relative to `scratchDir` (or used
 *     directly when absolute) and rejected if the resolved path
 *     escapes the user's scratch dir, UNLESS the absolute path falls
 *     inside an allowlist of safe system locations (`/usr`, `/bin`,
 *     `/etc`, `/proc`, `/sys`, `/tmp`, `/dev/null` etc.) that hold
 *     no user-private data and that real tools need to function.
 *   - tokens whose path segments contain `..` and resolve outside
 *     the scratch dir are always rejected (covers traversal even
 *     when the absolute prefix would have been allowed).
 *
 * This is intentionally an over-approximation: a token that looks
 * like a path operand but is actually a literal (e.g. a sed pattern
 * containing a `/`) might be rejected. That's the safer failure
 * mode for the workbench shell.
 */
export function checkScratchContainment(
  command: string,
  scratchDir: string,
): { blocked: boolean; reason?: string } {
  if (typeof command !== "string" || command.length === 0) {
    return { blocked: false };
  }
  const root = path.resolve(scratchDir);
  let argvs: string[][];
  try {
    argvs = extractCommands(command);
  } catch {
    return { blocked: true, reason: "could not safely parse command argv for read-side containment" };
  }

  for (const argv of argvs) {
    // Skip the binary itself (argv[0]) — we don't validate $PATH lookups.
    for (let i = 1; i < argv.length; i++) {
      const tok = argv[i];
      if (typeof tok !== "string" || tok.length === 0) continue;
      // Strip a leading `-flag=` prefix so we can validate the value
      // half of `--file=../../secret`. Pure flags (`-rf`, `--all`)
      // have no `=` and are skipped below by the path-shape filter.
      let candidate = tok;
      if (tok.startsWith("-")) {
        const eq = tok.indexOf("=");
        if (eq < 0) continue;
        candidate = tok.slice(eq + 1);
        if (candidate.length === 0) continue;
      }
      if (!looksLikePath(candidate)) continue;
      const r = validateScratchOperand(candidate, root);
      if (r.blocked) return r;
    }
  }

  // Also validate WRITE-redirection targets (`>`, `>>`, `&>`, `2>`,
  // …). The base sandbox already does this for write-containment
  // purposes, but it allows the write to proceed if the resolved
  // path is inside cwd — which from a per-user scratch perspective
  // is what we want too. We re-check here only to keep the error
  // message and reasoning unified for the workbench's pre-flight.
  let writeTargets: string[];
  try {
    writeTargets = extractRedirectTargets(command);
  } catch {
    return { blocked: true, reason: "could not safely parse write redirections" };
  }
  for (const t of writeTargets) {
    if (!looksLikePath(t)) continue;
    const r = validateScratchOperand(t, root);
    if (r.blocked) return { blocked: true, reason: `write redirect ${r.reason}` };
  }

  // **Critical**: validate READ-redirection targets (`<file`,
  // `0<file`, `N<file`). The base sandbox's `extractRedirectTargets`
  // intentionally ignores input redirection (it's only screening
  // *write* targets), and `extractCommands` skips redirect operands
  // entirely. Without this pre-flight, a user could bypass our
  // argv-level containment via:
  //   cat < ../../<otherHash>/host/secret
  //   cat < /home/runner/workspace/.local/...
  //   < ../../<otherHash>/host/secret cat
  // We deliberately do NOT screen `<<` (heredocs — no path) or
  // `<<<` (here-strings — literal, not a path). `<(cmd)` process
  // substitution recurses by tokenising the inner command.
  const readTargets = extractReadRedirectTargets(command);
  for (const t of readTargets) {
    if (!looksLikePath(t)) continue;
    const r = validateScratchOperand(t, root);
    if (r.blocked) return { blocked: true, reason: `read redirect ${r.reason}` };
  }

  return { blocked: false };
}

/**
 * Walk a shell-ish command and return every input-redirection target
 * (`<path`, `N<path`). Recurses into `$(…)`, `` `…` ``, and `<(…)`
 * process substitution. Heredocs (`<<MARKER`) and here-strings
 * (`<<<literal`) are intentionally skipped: they don't reference a
 * filesystem path. Quoted segments are flattened the same way the
 * shell would open the file.
 */
function extractReadRedirectTargets(input: string): string[] {
  const targets: string[] = [];
  const N = input.length;
  let i = 0;

  function readWord(start: number): { word: string; end: number } {
    let j = start;
    while (j < N && (input[j] === " " || input[j] === "\t")) j++;
    let word = "";
    while (j < N) {
      const c = input[j];
      if (c === " " || c === "\t" || c === "\n" || c === "\r" ||
          c === ";" || c === "|" || c === "&" ||
          c === "(" || c === ")" || c === "{" || c === "}" ||
          c === "<" || c === ">") break;
      if (c === "'") {
        j++;
        while (j < N && input[j] !== "'") { word += input[j]; j++; }
        if (j < N) j++;
        continue;
      }
      if (c === '"') {
        j++;
        while (j < N && input[j] !== '"') {
          if (input[j] === "\\" && j + 1 < N) { word += input[j + 1]; j += 2; continue; }
          word += input[j]; j++;
        }
        if (j < N) j++;
        continue;
      }
      if (c === "\\" && j + 1 < N) { word += input[j + 1]; j += 2; continue; }
      word += c; j++;
    }
    return { word, end: j };
  }

  while (i < N) {
    const c = input[i];
    if (c === "'") {
      i++;
      while (i < N && input[i] !== "'") i++;
      if (i < N) i++;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < N && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < N) { i += 2; continue; }
        if (input[i] === "$" && input[i + 1] === "(") {
          i += 2; let depth = 1; let inner = "";
          while (i < N && depth > 0) {
            if (input[i] === "(") { depth++; inner += input[i]; i++; continue; }
            if (input[i] === ")") { depth--; if (depth === 0) break; inner += input[i]; i++; continue; }
            inner += input[i]; i++;
          }
          if (i < N) i++;
          for (const t of extractReadRedirectTargets(inner)) targets.push(t);
          continue;
        }
        i++;
      }
      if (i < N) i++;
      continue;
    }
    if (c === "`") {
      i++;
      let inner = "";
      while (i < N && input[i] !== "`") {
        if (input[i] === "\\" && i + 1 < N) { inner += input[i + 1]; i += 2; continue; }
        inner += input[i]; i++;
      }
      if (i < N) i++;
      for (const t of extractReadRedirectTargets(inner)) targets.push(t);
      continue;
    }
    if (c === "$" && input[i + 1] === "(") {
      i += 2; let depth = 1; let inner = "";
      while (i < N && depth > 0) {
        if (input[i] === "(") { depth++; inner += input[i]; i++; continue; }
        if (input[i] === ")") { depth--; if (depth === 0) break; inner += input[i]; i++; continue; }
        inner += input[i]; i++;
      }
      if (i < N) i++;
      for (const t of extractReadRedirectTargets(inner)) targets.push(t);
      continue;
    }
    if (c === "\\" && i + 1 < N) { i += 2; continue; }

    // Numeric fd prefix: e.g. `0<file`, `3<file`.
    if (c >= "0" && c <= "9") {
      let k = i;
      while (k < N && input[k] >= "0" && input[k] <= "9") k++;
      if (k < N && input[k] === "<") {
        i = k + 1;
        // `N<<` or `N<<<` — heredoc / here-string, no file target.
        if (input[i] === "<") {
          while (i < N && input[i] === "<") i++;
          const w = readWord(i); i = w.end; continue;
        }
        // `N<&FD` — fd dup, no file target unless it's a name.
        if (input[i] === "&") {
          i++;
          const w = readWord(i); i = w.end;
          if (w.word && !/^[0-9-]+$/.test(w.word)) targets.push(w.word);
          continue;
        }
        const w = readWord(i); i = w.end;
        if (w.word) targets.push(w.word);
        continue;
      }
    }

    // Bare `<`. May be `<file`, `<<`, `<<<`, `<&FD`, or `<(cmd)`.
    if (c === "<") {
      i++;
      // `<<` heredoc or `<<<` here-string — no file target.
      if (input[i] === "<") {
        while (i < N && input[i] === "<") i++;
        const w = readWord(i); i = w.end; continue;
      }
      // `<&FD` — fd dup; treat name targets as paths defensively.
      if (input[i] === "&") {
        i++;
        const w = readWord(i); i = w.end;
        if (w.word && !/^[0-9-]+$/.test(w.word)) targets.push(w.word);
        continue;
      }
      // `<(cmd)` — process substitution. Recurse on inner command.
      if (input[i] === "(") {
        i++; let depth = 1; let inner = "";
        while (i < N && depth > 0) {
          if (input[i] === "(") { depth++; inner += input[i]; i++; continue; }
          if (input[i] === ")") { depth--; if (depth === 0) break; inner += input[i]; i++; continue; }
          inner += input[i]; i++;
        }
        if (i < N) i++;
        for (const t of extractReadRedirectTargets(inner)) targets.push(t);
        for (const t of extractRedirectTargets(inner)) targets.push(t);
        continue;
      }
      // Plain input redirection: `<file` or `< file`.
      const w = readWord(i); i = w.end;
      if (w.word) targets.push(w.word);
      continue;
    }

    i++;
  }
  return targets;
}

function looksLikePath(s: string): boolean {
  if (s === "." || s === "..") return true;
  if (s.startsWith("/") || s.startsWith("./") || s.startsWith("../") || s.startsWith("~")) return true;
  if (s.includes("/")) return true;
  return false;
}

// Absolute path prefixes outside PROJECT_ROOT that are safe for read
// access (binaries, libs, config, /proc/self, /tmp scratch) and that
// hold no per-user private data. An exact-match or prefix-with-`/`
// match counts as inside the allowlist.
const ABSOLUTE_READ_ALLOWLIST: readonly string[] = [
  "/usr",
  "/bin",
  "/sbin",
  "/lib",
  "/lib64",
  "/etc",
  "/proc",
  "/sys",
  "/run",
  "/tmp",
  "/var/tmp",
  "/dev/null",
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty",
  "/dev/full",
];

function isInAllowlist(absPath: string): boolean {
  for (const prefix of ABSOLUTE_READ_ALLOWLIST) {
    if (absPath === prefix) return true;
    if (absPath.startsWith(prefix + "/")) return true;
  }
  return false;
}

function validateScratchOperand(
  token: string,
  scratchRoot: string,
): { blocked: boolean; reason?: string } {
  // Tilde expansion would be done by the shell; we treat `~` and
  // `~user` as escaping (HOME is sandboxed elsewhere but a literal
  // ~ in argv is still a redirection-of-intent we should refuse).
  if (token === "~" || token.startsWith("~/") || (token.startsWith("~") && !token.startsWith("~/"))) {
    return { blocked: true, reason: `path operand uses tilde expansion which escapes scratch: ${token}` };
  }
  let resolved: string;
  if (path.isAbsolute(token)) {
    resolved = path.resolve(token);
  } else {
    resolved = path.resolve(scratchRoot, token);
  }
  if (resolved === scratchRoot || resolved.startsWith(scratchRoot + path.sep)) {
    return { blocked: false };
  }
  // Outside scratch — only allowed if it's in the system allowlist
  // AND does not fall under PROJECT_ROOT (which would mean it's
  // either another user's scratch or workbench-private state).
  if (resolved === PROJECT_ROOT || resolved.startsWith(PROJECT_ROOT + path.sep)) {
    return { blocked: true, reason: `path operand escapes scratch into shared workspace: ${token}` };
  }
  if (isInAllowlist(resolved)) {
    return { blocked: false };
  }
  return { blocked: true, reason: `path operand escapes scratch and is outside the safe-read allowlist: ${token}` };
}

/**
 * Reconcile the scratch dir's top-level symlinks against the current
 * contents of PROJECT_ROOT. New host entries get a fresh symlink;
 * dangling or retargeted symlinks get rewritten; concrete files /
 * dirs the user created themselves are left alone (that's their
 * scratch state).
 */
function syncSymlinkView(scratchDir: string): void {
  let hostEntries: fs.Dirent[];
  try {
    hostEntries = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
  } catch {
    return;
  }
  const wantedNames = new Set<string>();
  for (const entry of hostEntries) {
    if (SKIP_SYMLINK_TOP_LEVEL.has(entry.name)) continue;
    wantedNames.add(entry.name);
    const target = path.join(PROJECT_ROOT, entry.name);
    const link = path.join(scratchDir, entry.name);
    let needCreate = false;
    try {
      const st = fs.lstatSync(link);
      if (st.isSymbolicLink()) {
        let cur = "";
        try { cur = fs.readlinkSync(link); } catch { /* fall through */ }
        if (cur !== target) {
          try { fs.unlinkSync(link); } catch {}
          needCreate = true;
        }
      }
      // If it's a real file/dir, leave it alone — the user wrote it.
    } catch (err: any) {
      if (err && err.code === "ENOENT") needCreate = true;
    }
    if (needCreate) {
      try {
        fs.symlinkSync(target, link);
      } catch {
        // Symlink creation can fail on EEXIST if a sibling concurrent
        // request just created the link; that's harmless, retry next
        // call.
      }
    }
  }

  // Drop dangling symlinks for entries that were removed from the
  // host workspace. We never delete real files/dirs the user owns.
  let scratchEntries: fs.Dirent[] = [];
  try {
    scratchEntries = fs.readdirSync(scratchDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of scratchEntries) {
    if (!entry.isSymbolicLink()) continue;
    if (wantedNames.has(entry.name)) continue;
    try { fs.unlinkSync(path.join(scratchDir, entry.name)); } catch {}
  }
}

/**
 * Sweep the scratch root for per-user dirs whose mtime is older than
 * `SCRATCH_TTL_MS` and remove them. After the TTL pass, if the
 * remaining tree is STILL bigger than `SCRATCH_HOST_QUOTA_BYTES`, the
 * largest per-user dirs are evicted next-largest-first until the
 * tree fits. The host-wide eviction is the load-bearing defence
 * against many-active-users-each-just-under-the-per-user-cap
 * scenarios; the TTL pass on its own would leave the host disk
 * starved for up to 24h. Returns a small report so callers (cleanup
 * task, future admin endpoint) can log what happened.
 */
export function cleanupAbandonedScratchDirs(now: number = Date.now()): {
  removed: string[];
  evicted: string[];
  kept: number;
  errors: Array<{ path: string; message: string }>;
} {
  const removed: string[] = [];
  const evicted: string[] = [];
  const errors: Array<{ path: string; message: string }> = [];
  let kept = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(SCRATCH_ROOT, { withFileTypes: true });
  } catch {
    return { removed, evicted, kept, errors };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const userDir = path.join(SCRATCH_ROOT, entry.name);
    // Use the freshest mtime across `<hash>` AND `<hash>/host`. The
    // host subdir's mtime bumps whenever the user creates a top-level
    // file in scratch (file create/delete in a directory bumps that
    // directory's mtime); the parent's mtime is bumped explicitly by
    // `ensureUserScratchDir`. Either signal counts as activity.
    let mtime = 0;
    try {
      const st = fs.statSync(userDir);
      mtime = Math.max(mtime, st.mtimeMs);
    } catch {}
    try {
      const stHost = fs.statSync(path.join(userDir, "host"));
      mtime = Math.max(mtime, stHost.mtimeMs);
    } catch {}
    if (mtime > 0 && (now - mtime) > SCRATCH_TTL_MS) {
      try {
        fs.rmSync(userDir, { recursive: true, force: true });
        removed.push(entry.name);
        continue;
      } catch (err: any) {
        errors.push({ path: userDir, message: err?.message || String(err) });
      }
    }
    kept++;
  }

  // Host-wide overflow eviction. Runs only after the TTL pass so we
  // never delete a user dir that was already going away. We
  // intentionally walk every surviving `<hash>` dir to size it (the
  // top-level scratch root is small in entry count even when the
  // total bytes are large), then evict largest-first until we either
  // fit or run out of candidates. We do NOT account for symlinks
  // (`walkRealFileBytes`) so we don't double-count the host workspace
  // through every user's symlink view.
  let surviving: Array<{ name: string; bytes: number; userDir: string }> = [];
  let totalBytes = 0;
  let postEntries: fs.Dirent[];
  try {
    postEntries = fs.readdirSync(SCRATCH_ROOT, { withFileTypes: true });
  } catch {
    return { removed, evicted, kept, errors };
  }
  for (const entry of postEntries) {
    if (!entry.isDirectory()) continue;
    const userDir = path.join(SCRATCH_ROOT, entry.name);
    const bytes = walkRealFileBytes(userDir);
    surviving.push({ name: entry.name, bytes, userDir });
    totalBytes += bytes;
  }
  if (totalBytes > SCRATCH_HOST_QUOTA_BYTES) {
    surviving.sort((a, b) => b.bytes - a.bytes);
    for (const cand of surviving) {
      if (totalBytes <= SCRATCH_HOST_QUOTA_BYTES) break;
      try {
        fs.rmSync(cand.userDir, { recursive: true, force: true });
        evicted.push(cand.name);
        totalBytes -= cand.bytes;
        kept = Math.max(0, kept - 1);
      } catch (err: any) {
        errors.push({ path: cand.userDir, message: err?.message || String(err) });
      }
    }
  }
  return { removed, evicted, kept, errors };
}

/**
 * Materialise a host workspace file into the user's scratch dir at
 * the same relative path, replacing any top-level shared symlink
 * along the way with a real directory whose remaining children stay
 * symlinked to their host counterparts. After this returns the file
 * is "private" — the user can edit it through the workbench shell
 * and the scratch view will surface it with the `private` badge.
 *
 * Walks each ancestor of `relPath`. Whenever an ancestor is one of
 * the top-level shared symlinks (e.g. `<scratch>/src` → `<host>/src`)
 * the symlink is unlinked, replaced with a real directory of the
 * same name, and every host child of the original target is
 * re-mirrored as its own symlink so the user keeps read access to
 * sibling files via the same path. Already-real ancestors are left
 * alone.
 *
 * Refuses to overwrite an existing real (non-symlink) entry at the
 * destination — that would clobber user state. The caller is expected
 * to have run `safeBasedPath` on `relPath` to guarantee it stays
 * inside both PROJECT_ROOT and the scratch dir.
 *
 * Errors thrown carry an `errno`-style `code` property so the route
 * handler can map them to deterministic HTTP statuses:
 *   - `MISSING_PATH`     — empty / root path
 *   - `PATH_TRAVERSAL`   — relPath escapes either base
 *   - `SKIPPED_TOP_LEVEL`— relPath touches a SKIP_SYMLINK_TOP_LEVEL
 *                         entry (.git, .local, .cache); those are
 *                         deliberately not part of the scratch view
 *                         and must not be copyable through this API
 *   - `NOT_FOUND`        — source missing on host
 *   - `INVALID_INPUT`    — source is not a regular file, or an
 *                         ancestor is not a directory
 *   - `ALREADY_PRIVATE`  — destination already exists as a real file
 *                         in the user's scratch dir
 */
export function materializeScratchFile(
  userId: string,
  relPath: string,
): { absPath: string; bytesWritten: number } {
  if (typeof relPath !== "string" || relPath.length === 0 || relPath === "." || relPath === "/") {
    const err: any = new Error("path is required");
    err.code = "MISSING_PATH";
    throw err;
  }
  const scratchDir = ensureUserScratchDir(userId);
  const hostSrc = path.resolve(PROJECT_ROOT, relPath);
  const scratchDest = path.resolve(scratchDir, relPath);
  const relCheckHost = path.relative(PROJECT_ROOT, hostSrc);
  const relCheckScratch = path.relative(scratchDir, scratchDest);
  if (relCheckHost.startsWith("..") || path.isAbsolute(relCheckHost) ||
      relCheckScratch.startsWith("..") || path.isAbsolute(relCheckScratch)) {
    const err: any = new Error("Path traversal not allowed");
    err.code = "PATH_TRAVERSAL";
    throw err;
  }

  // Normalise into segments so we can walk top-down; reject the
  // skip-list ancestors that the scratch view deliberately hides.
  const parts = relCheckHost.split(path.sep).filter((p) => p.length > 0);
  if (parts.length === 0) {
    const err: any = new Error("path is required");
    err.code = "MISSING_PATH";
    throw err;
  }
  if (SKIP_SYMLINK_TOP_LEVEL.has(parts[0])) {
    const err: any = new Error(
      `Files under '${parts[0]}/' are not part of the shared workbench view and cannot be copied to scratch.`,
    );
    err.code = "SKIPPED_TOP_LEVEL";
    throw err;
  }

  let hostLst: fs.Stats;
  try {
    hostLst = fs.statSync(hostSrc);
  } catch {
    const err: any = new Error("Source file not found in shared workspace.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (!hostLst.isFile()) {
    const err: any = new Error("Only regular files can be copied to scratch.");
    err.code = "INVALID_INPUT";
    throw err;
  }

  // Pre-flight: refuse if the destination is ALREADY a real, non-
  // symlink file in the user's scratch (would clobber their state).
  // We can't just `lstat(scratchDest)` because Node's lstat follows
  // intermediate symlinks: for `artifacts/api-server/package.json`
  // it would chase the top-level `<scratch>/artifacts` symlink into
  // the host workspace and report the host file as a "real file",
  // false-positively flagging every nested-shared file as private.
  // Instead we walk segment by segment with lstat: as soon as we
  // encounter a symlink ancestor, we know everything past that point
  // is shared host state (and therefore safe to materialise). Only
  // when EVERY ancestor is a real directory do we look at the leaf.
  const fileName = parts[parts.length - 1];
  const dirParts = parts.slice(0, -1);
  {
    let walk = scratchDir;
    let allRealAncestors = true;
    for (const seg of dirParts) {
      const next = path.join(walk, seg);
      let lst: fs.Stats | null = null;
      try { lst = fs.lstatSync(next); } catch { /* ENOENT */ }
      if (!lst) { allRealAncestors = false; break; }
      if (lst.isSymbolicLink() || !lst.isDirectory()) { allRealAncestors = false; break; }
      walk = next;
    }
    if (allRealAncestors) {
      let leafLst: fs.Stats | null = null;
      try { leafLst = fs.lstatSync(path.join(walk, fileName)); } catch {}
      if (leafLst && !leafLst.isSymbolicLink() && !leafLst.isDirectory()) {
        const err: any = new Error(
          "A private copy already exists at this path. Delete it first if you want to refresh from the shared file.",
        );
        err.code = "ALREADY_PRIVATE";
        throw err;
      }
    }
  }
  let curScratch = scratchDir;
  let curHost = PROJECT_ROOT;
  for (const seg of dirParts) {
    const nextScratch = path.join(curScratch, seg);
    const nextHost = path.join(curHost, seg);
    let lst: fs.Stats | null = null;
    try { lst = fs.lstatSync(nextScratch); } catch {}
    if (!lst) {
      // Ancestor doesn't exist in the scratch view at all (e.g. the
      // host has it but the user nuked the symlink). Just create the
      // real dir; no siblings to mirror.
      fs.mkdirSync(nextScratch);
    } else if (lst.isSymbolicLink()) {
      // Snapshot host children, replace the symlink with a real dir,
      // then re-mirror every child as its own symlink so the user
      // keeps read access to siblings through the same path.
      let hostEntries: fs.Dirent[] = [];
      try { hostEntries = fs.readdirSync(nextHost, { withFileTypes: true }); } catch {}
      try { fs.unlinkSync(nextScratch); } catch {}
      fs.mkdirSync(nextScratch);
      for (const e of hostEntries) {
        try {
          fs.symlinkSync(path.join(nextHost, e.name), path.join(nextScratch, e.name));
        } catch { /* best-effort; EEXIST is harmless */ }
      }
    } else if (!lst.isDirectory()) {
      const err: any = new Error(`Path conflict: '${seg}' exists in scratch but is not a directory.`);
      err.code = "INVALID_INPUT";
      throw err;
    }
    curScratch = nextScratch;
    curHost = nextHost;
  }

  // After parent materialisation the destination is either absent
  // (we just created the parent) or a per-entry symlink we put in
  // place; either way we can clear it and write the real file.
  const destAbs = path.join(curScratch, fileName);
  let finalLst: fs.Stats | null = null;
  try { finalLst = fs.lstatSync(destAbs); } catch {}
  if (finalLst && !finalLst.isSymbolicLink()) {
    const err: any = new Error(
      "A private copy already exists at this path. Delete it first if you want to refresh from the shared file.",
    );
    err.code = "ALREADY_PRIVATE";
    throw err;
  }
  if (finalLst) {
    try { fs.unlinkSync(destAbs); } catch {}
  }
  fs.copyFileSync(hostSrc, destAbs);
  const stat = fs.statSync(destAbs);
  return { absPath: destAbs, bytesWritten: stat.size };
}

let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Start the periodic cleanup task. Idempotent. The timer is unref()ed
 * so it never keeps the process alive on its own.
 */
export function startScratchCleanupSchedule(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    try {
      const r = cleanupAbandonedScratchDirs();
      if (r.removed.length > 0 || r.evicted.length > 0 || r.errors.length > 0) {
        console.log(
          `[user-workspace] cleanup: removed=${r.removed.length} evicted=${r.evicted.length} kept=${r.kept} errors=${r.errors.length}`,
        );
      }
    } catch (err: any) {
      console.error("[user-workspace] cleanup failed:", err?.message || err);
    }
  }, SCRATCH_CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();
}

/** Stop the periodic cleanup task. Used by tests. */
export function stopScratchCleanupSchedule(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// Auto-start cleanup outside test runs. Tests opt in explicitly.
if (process.env.NODE_ENV !== "test") {
  startScratchCleanupSchedule();
}

/**
 * Exposed for tests / debugging. The quota getters/setters here
 * delegate to the public exports above so existing test call sites
 * (`__testing__.setUserQuotaBytes(...)`) keep working unchanged.
 */
export const __testing__ = {
  PROJECT_ROOT,
  SCRATCH_ROOT,
  SCRATCH_TTL_MS,
  SCRATCH_CLEANUP_INTERVAL_MS,
  SKIP_SYMLINK_TOP_LEVEL,
  userIdHash,
  syncSymlinkView,
  getUserQuotaBytes,
  getHostQuotaBytes,
  setUserQuotaBytes,
  setHostQuotaBytes,
};
