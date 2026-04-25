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
 * `SCRATCH_TTL_MS` and remove them. Returns a small report so callers
 * (cleanup task, future admin endpoint) can log what happened.
 */
export function cleanupAbandonedScratchDirs(now: number = Date.now()): {
  removed: string[];
  kept: number;
  errors: Array<{ path: string; message: string }>;
} {
  const removed: string[] = [];
  const errors: Array<{ path: string; message: string }> = [];
  let kept = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(SCRATCH_ROOT, { withFileTypes: true });
  } catch {
    return { removed, kept, errors };
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
  return { removed, kept, errors };
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
      if (r.removed.length > 0 || r.errors.length > 0) {
        console.log(
          `[user-workspace] cleanup: removed=${r.removed.length} kept=${r.kept} errors=${r.errors.length}`,
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

/** Exposed for tests / debugging. */
export const __testing__ = {
  PROJECT_ROOT,
  SCRATCH_ROOT,
  SCRATCH_TTL_MS,
  SCRATCH_CLEANUP_INTERVAL_MS,
  SKIP_SYMLINK_TOP_LEVEL,
  userIdHash,
  syncSymlinkView,
};
