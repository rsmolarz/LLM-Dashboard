/**
 * Defence-in-depth sandbox for Workbench shell + git execution.
 *
 * The denylist parser in `command-safety.ts` blocks known-dangerous binaries
 * and patterns (rm -rf /, mkfs, dd, force pushes, …). It is the first line
 * of defence but it is still a denylist — a creative payload could touch
 * paths outside the project. This module is the second line of defence:
 * it constrains the *execution environment* of the child process so even
 * commands that the safety filter happily admits cannot trivially escape
 * the sandbox.
 *
 * What we contain:
 *   - **OS-level filesystem isolation (when available)**: at module load
 *     we probe for `bwrap` / `firejail` / `nsjail` (in that order). If any
 *     of them works on this host we transparently prepend it to the spawn
 *     argv with a read-only bind of the host root, a writable bind of the
 *     per-project cwd, a private (`tmpfs`) `/tmp`, and `$HOME` pinned
 *     inside the cwd. This is a real kernel-enforced jail: even if a
 *     command uses a write primitive the argv parser missed
 *     (`./compiled-binary`, a script that calls `cp`, etc.) the write
 *     to anywhere outside the cwd / private `/tmp` either lands in the
 *     private mount namespace or fails with `EROFS`/`EACCES`. We do NOT
 *     accept bare `unshare --user --mount` as a real-isolation helper —
 *     it cannot enforce a system-wide read-only bind without a custom
 *     bootstrap script, so accepting it would create a false security
 *     posture. When no helper is available (e.g. the legacy Replit
 *     container blocks unprivileged user namespaces via seccomp) we
 *     fall back to the path-validation layer alone.
 *   - **Working directory**: the cwd is pinned to an absolute path the
 *     caller pre-validated (a per-project local clone, the host workspace
 *     for the host-shell case, or a remote SSH path).
 *   - **Output redirection**: we parse the command and reject any
 *     redirection target (`>`, `>>`, `&>`, `|&`, `2>`, etc.) that resolves
 *     outside the sandbox root, uses tilde or variable expansion, or
 *     traverses out via `..`.
 *   - **Argv-level write destinations**: we ALSO parse each argv and
 *     reject the destination arguments of every common write-oriented
 *     binary (`touch /tmp/x`, `cp src /tmp/x`, `mv ... /tmp/x`,
 *     `tee /tmp/x`, `mkdir /tmp/x`, `mkfifo`, `ln -s`, `chmod /etc/x`,
 *     `chown`, `chgrp`, `truncate`, `dd of=`, `sed -i`, `awk -i inplace`,
 *     `tar -czf /tmp/x` / `tar -xC /tmp/x`, `unzip -d /tmp/x`, `zip`,
 *     `wget -O /tmp/x`, `curl -o /tmp/x`, `rsync ... /tmp/x`,
 *     `install`, `split prefix`). This is what "even safe-listed
 *     actions can't escape" looks like in practice.
 *   - **Arbitrary-code interpreters**: `python -c`, `python3 -c`,
 *     `node -e`, `nodejs -e`, `perl -e`, `perl -i`, `ruby -e`,
 *     `php -r`, `deno eval`, `Rscript -e`, etc. are blocked outright
 *     because their inline code can perform writes via syscalls the
 *     argv parser cannot statically prove safe. Bare interpreter
 *     invocations against in-sandbox script files (`python ./build.py`)
 *     are still allowed — those scripts run inside the sandbox cwd.
 *   - **Shell interpreter recursion**: `bash -c CODE` and `sh -c CODE`
 *     have CODE fed back through this same checker, so write attempts
 *     hidden inside `bash -c "touch /tmp/x"` are also caught.
 *   - **Environment**: we strip the parent process's env down to a small
 *     allowlist (PATH/LANG/TERM/etc). API keys, OAuth tokens, DB
 *     credentials, SSH keys, and Replit secrets are NEVER inherited by
 *     spawned commands — even if the caller chains shell pipes that try
 *     to read `printenv`.
 *   - **HOME / TMPDIR**: forced into per-sandbox subdirectories so a
 *     command that thinks it's writing to `~/.cache/foo` actually writes
 *     inside the sandbox root, not the host runner home.
 *   - **Resource scope**: we wrap the child with `prlimit` (CPU time,
 *     virtual memory, open files, max processes, max file size) to cap
 *     blast radius from runaway loops or fork bombs the parser missed.
 *   - **No-new-privs**: we wrap the child with `setpriv --no-new-privs`
 *     so any setuid/setgid binary the command might find on PATH cannot
 *     elevate. The runner is already non-root, but this hardens against
 *     unforeseen escalation primitives.
 *
 * What we cannot contain (yet):
 *   - True filesystem isolation on hosts WITHOUT a working sandbox
 *     helper. The legacy Replit container blocks unprivileged user
 *     namespaces via seccomp, so `bwrap` / `firejail` / `nsjail` all
 *     fail at startup and the OS-level wrapper above is omitted. On
 *     those hosts the redirect-target validator + argv-level write
 *     check + cwd pinning + sanitized env + dropped privs + resource
 *     caps remain our compensating controls. The detection runs once
 *     at module load, and the wrapper is applied transparently behind
 *     the same `runSandboxed` interface, so deploying onto a host that
 *     DOES support one of these helpers automatically promotes the
 *     sandbox to a real kernel-enforced jail without any caller
 *     changes.
 */

import { execFile, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { extractCommands } from "./command-safety";

export interface SandboxedResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Set when the sandbox itself blocked the command (not the child exit). */
  sandboxBlocked?: string;
  /**
   * Set when the command spawned but was contained at the kernel layer
   * by the OS-level jail (read-only bind, private tmpfs, etc.). The
   * child process may still have exited "successfully" from its own
   * perspective; this flag records that the OS sandbox refused at
   * least one write that would have escaped the project root. Distinct
   * from `sandboxBlocked`, which fires before the spawn from the
   * static path-validation layer.
   */
  sandboxContained?: SandboxContainment;
}

export interface SandboxContainment {
  /**
   * Why the kernel refused the write:
   *  - "readonly"   — EROFS, our read-only bind of the host root caught it.
   *  - "permission" — EACCES against a system path that sits outside
   *                   the project root (mount-namespace level refusal).
   */
  reason: "readonly" | "permission";
  /** The offending absolute path the kernel refused to write to. */
  path: string;
  /**
   * Friendly, non-technical sentence explaining the project boundary.
   * Safe to render verbatim in the Workbench UI alongside stderr.
   */
  message: string;
}

export interface SandboxOptions {
  /** Absolute path the command must run inside. */
  cwd: string;
  /** Hard wall-clock timeout. Default 30s. */
  timeoutMs?: number;
  /** Max stdout+stderr buffer per stream. Default 1 MiB. */
  maxBufferBytes?: number;
  /**
   * Additional environment entries to expose to the child (allowlist
   * union, applied AFTER the strict env scrub). Use sparingly.
   */
  extraEnv?: Record<string, string>;
  /**
   * Override the default per-file `prlimit --fsize` ceiling. The
   * sandbox always applies a 512 MiB single-file cap; passing a
   * smaller value here tightens it further so the kernel refuses any
   * write past `min(default, fsizeBytes)`. Workbench callers use this
   * to thread per-user remaining-quota down to the kernel layer:
   * e.g. a user with 100 MiB of quota left runs with fsize=100 MiB
   * and the write() syscall itself fails with EFBIG/SIGXFSZ once a
   * file would grow past that, BEFORE the bytes ever land on disk.
   * A value of 0 prevents the child from writing any new file bytes
   * at all (useful as a defence-in-depth alongside the pre-flight
   * "already over cap" gate).
   */
  fsizeBytes?: number;
}

// Redirect targets we always allow even when "absolute" — these are
// pseudo-files that don't escape the sandbox.
const ALLOWED_DEV_TARGETS = new Set<string>([
  "/dev/null",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty",
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/full",
]);

// Strict allowlist of env keys that may flow from the parent server
// process to spawned shell commands. Anything not in here is dropped
// (so API keys, OAuth tokens, DB URLs, SSH credentials, Replit secrets
// etc. don't leak into the child even if the caller pipes `printenv`).
const ALLOWED_ENV_KEYS: ReadonlySet<string> = new Set<string>([
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LANGUAGE",
  "TERM",
  "TZ",
  "USER",
  "LOGNAME",
  "SHELL",
  "PWD",
  "SHLVL",
  "HOSTNAME",
  // Toolchain configuration that's not sensitive:
  "NIX_PATH",
  "NODE_PATH",
  "PNPM_HOME",
]);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER = 1024 * 1024;

// Resource caps applied to every child via `prlimit`. These are
// intentionally generous so legitimate dev workflows (npm install, git
// clone, build steps) keep working, while bounding the blast radius of
// a rogue payload.
const PRLIMIT_AS_BYTES = 4 * 1024 * 1024 * 1024;   // 4 GiB virtual memory
const PRLIMIT_CPU_SEC = 300;                        // 5 min CPU time
const PRLIMIT_NPROC = 512;                          // hard fork-bomb cap
const PRLIMIT_FSIZE_BYTES = 512 * 1024 * 1024;      // 512 MiB single-file write cap
const PRLIMIT_NOFILE = 1024;                        // open-file cap

function binaryExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

const PRLIMIT_BIN = ["/usr/bin/prlimit", "/sbin/prlimit", "/bin/prlimit"].find(binaryExists) || null;
const SETPRIV_BIN = ["/usr/bin/setpriv", "/sbin/setpriv", "/bin/setpriv"].find(binaryExists) || null;

// ----------------------------------------------------------------------
// OS-level filesystem isolation detection.
//
// We probe (in priority order) for `bwrap`, `firejail`, then `nsjail`.
// Each helper has a different way of constructing a private mount
// namespace; what matters is that ONE of them works on the host, so
// `runSandboxed` can prepend a real kernel-enforced jail to the spawn
// argv that enforces our containment contract: read-only host root +
// writable per-project cwd + private (tmpfs) /tmp + $HOME pinned in
// the cwd.
//
// The probe runs the helper with a no-op inner command (e.g. `true`)
// using the same isolation *primitives* the real wrapper relies on
// (read-only bind of `/`, private tmpfs `/tmp`, dev/proc setup,
// die-with-parent). The cwd-specific bind/chdir flags are omitted
// from the probe because the cwd doesn't exist yet at module-load
// time, but the kernel-level capabilities they exercise are a strict
// subset of what the probe already exercised. If the probe exits 0
// within a couple of seconds we trust the helper; otherwise we move
// to the next candidate. On hosts where unprivileged user namespaces
// are blocked by seccomp (the legacy Replit container) all probes
// fail and we fall back to the path-validation-only behaviour.
//
// Note: bare `unshare --user --mount` is intentionally NOT a candidate.
// It cannot enforce a system-wide read-only bind without a custom
// bootstrap script, and any such script would have to ignore mount
// failures (the new mount namespace is too restricted to remount /
// read-only on most modern kernels). Accepting it as a real-isolation
// helper would advertise containment we cannot deliver. Hosts that
// only have unshare therefore fall through to the path-validation
// fallback, which is honest about its limits.
// ----------------------------------------------------------------------

export type OsSandboxKind = "bwrap" | "firejail" | "nsjail";

export interface OsSandboxInfo {
  kind: OsSandboxKind;
  bin: string;
}

const OS_SANDBOX_PROBE_TIMEOUT_MS = 5_000;

function probeHelper(bin: string, args: string[]): boolean {
  try {
    const r = spawnSync(bin, args, {
      timeout: OS_SANDBOX_PROBE_TIMEOUT_MS,
      stdio: "ignore",
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function findHelperBin(name: string): string | null {
  for (const dir of ["/usr/bin", "/usr/local/bin", "/bin", "/sbin", "/usr/sbin", "/run/current-system/sw/bin"]) {
    const p = `${dir}/${name}`;
    if (binaryExists(p)) return p;
  }
  return null;
}

/**
 * Detect which OS-level sandbox helper (if any) works on this host.
 * Probes are bounded by `OS_SANDBOX_PROBE_TIMEOUT_MS` and run with a
 * minimal env so they don't depend on caller state.
 *
 * Each probe uses the same isolation primitives the real wrapper
 * relies on (read-only bind of `/`, private tmpfs `/tmp`, dev/proc
 * setup, die-with-parent), so if a helper passes the probe we know
 * the host kernel will accept those primitives — not just that the
 * binary exists. The cwd-specific bind/chdir flags are added at run
 * time and exercise a strict subset of the same capabilities.
 *
 * Order: bwrap > firejail > nsjail. bwrap is the smallest viable
 * option and the one we recommend; the others are supported for hosts
 * that ship them but not bwrap.
 */
export function detectOsSandbox(): OsSandboxInfo | null {
  const bwrap = findHelperBin("bwrap");
  if (bwrap && probeHelper(bwrap, [
    "--ro-bind", "/", "/",
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--die-with-parent",
    "--",
    "true",
  ])) {
    return { kind: "bwrap", bin: bwrap };
  }
  const firejail = findHelperBin("firejail");
  if (firejail && probeHelper(firejail, [
    "--quiet",
    "--noprofile",
    "--read-only=/",
    "--private-tmp",
    "--noroot",
    "--",
    "true",
  ])) {
    return { kind: "firejail", bin: firejail };
  }
  const nsjail = findHelperBin("nsjail");
  if (nsjail && probeHelper(nsjail, [
    "-Mo",
    "--really_quiet",
    "--bindmount_ro", "/",
    "-T", "/tmp",
    "--disable_clone_newnet",
    "--",
    "/bin/true",
  ])) {
    return { kind: "nsjail", bin: nsjail };
  }
  return null;
}

const OS_SANDBOX = detectOsSandbox();

/**
 * Build the wrapper argv that constructs a real OS-level jail for the
 * inner command. Layout (semantics, not literal flags):
 *   - Host root mounted READ-ONLY at /
 *   - `cwd` mounted READ-WRITE at the same path inside the namespace
 *   - `/tmp` mounted as a fresh tmpfs (private to the sandbox)
 *   - `$HOME` is left to the caller's env scrub (already pointed
 *     inside cwd by `buildSandboxEnv`)
 *   - `--die-with-parent` (or equivalent) so an orphaned wrapper
 *     can't outlive the API process
 *   - process chdir'd into `cwd`
 * The returned argv ends with `--`; the caller appends the inner argv
 * (typically `setpriv`/`prlimit`/`sh -c CMD`).
 */
export function buildOsIsolationArgv(info: OsSandboxInfo, cwd: string): string[] {
  let realCwd = cwd;
  try { realCwd = fs.realpathSync(cwd); } catch { /* fall back to lexical */ }

  switch (info.kind) {
    case "bwrap":
      return [
        info.bin,
        "--ro-bind", "/", "/",
        "--dev-bind", "/dev", "/dev",
        "--proc", "/proc",
        "--tmpfs", "/tmp",
        "--bind", realCwd, realCwd,
        "--chdir", realCwd,
        "--die-with-parent",
        "--new-session",
        "--",
      ];
    case "firejail":
      // firejail's --read-only / --read-write build up an overlay; the
      // last writable wins for paths under cwd. --private-tmp gives us
      // a private tmpfs at /tmp. --noroot drops the user namespace
      // root mapping (we never want privileged operations inside).
      return [
        info.bin,
        "--quiet",
        "--noprofile",
        "--read-only=/",
        `--read-write=${realCwd}`,
        "--private-tmp",
        "--noroot",
        "--",
      ];
    case "nsjail":
      // nsjail's -Mo runs one command and exits. --bindmount_ro / makes
      // the host root read-only; --bindmount cwd:cwd makes the project
      // dir writable; -T /tmp mounts a fresh tmpfs.
      return [
        info.bin,
        "-Mo",
        "--rw",
        "--bindmount_ro", "/",
        "--bindmount", `${realCwd}:${realCwd}`,
        "-T", "/tmp",
        "--cwd", realCwd,
        "--really_quiet",
        "--disable_clone_newnet",
        "--",
      ];
  }
}

/**
 * Walk a shell-ish command and return the targets of every redirection
 * operator (>, >>, &>, |&, 2>, etc.). Recurses into $(...) and `...`
 * substitutions so nested redirects are also surfaced.
 *
 * Quoted segments are flattened (so `> "/tmp/x"` yields `/tmp/x`),
 * matching what the shell would actually open. We deliberately do NOT
 * expand `$VAR` or `~` — those are caught by `checkPathContainment` as
 * unsafe-by-construction so the sandbox can't be tricked by indirection.
 */
export function extractRedirectTargets(input: string): string[] {
  const targets: string[] = [];
  let i = 0;
  const N = input.length;

  // Read one shell word starting at index `start`. Returns the
  // flattened literal text and whether the resulting word contains any
  // unexpanded `$` or leading `~` (signalling indirection we must
  // reject). Stops at whitespace or shell metacharacters.
  function readWord(start: number): { word: string; end: number; raw: string; hasExpansion: boolean; hasTilde: boolean } {
    let j = start;
    while (j < N && (input[j] === " " || input[j] === "\t")) j++;
    let word = "";
    let raw = "";
    let hasExpansion = false;
    let hasTilde = false;
    let firstChar = true;
    while (j < N) {
      const c = input[j];
      if (c === " " || c === "\t" || c === "\n" || c === "\r" ||
          c === ";" || c === "|" || c === "&" ||
          c === "(" || c === ")" || c === "{" || c === "}" ||
          c === "<" || c === ">") {
        break;
      }
      if (c === "'") {
        j++;
        while (j < N && input[j] !== "'") { word += input[j]; raw += input[j]; j++; }
        if (j < N) j++;
        firstChar = false;
        continue;
      }
      if (c === '"') {
        j++;
        while (j < N && input[j] !== '"') {
          if (input[j] === "\\" && j + 1 < N) {
            const nx = input[j + 1];
            if (nx === '"' || nx === "\\" || nx === "$" || nx === "`") {
              word += nx; raw += nx; j += 2; continue;
            }
          }
          if (input[j] === "$") hasExpansion = true;
          if (input[j] === "`") hasExpansion = true;
          word += input[j]; raw += input[j]; j++;
        }
        if (j < N) j++;
        firstChar = false;
        continue;
      }
      if (c === "\\" && j + 1 < N) {
        word += input[j + 1]; raw += input[j + 1]; j += 2; firstChar = false; continue;
      }
      if (c === "$" || c === "`") { hasExpansion = true; }
      if (c === "~" && firstChar) { hasTilde = true; }
      word += c; raw += c; j++;
      firstChar = false;
    }
    return { word, end: j, raw, hasExpansion, hasTilde };
  }

  while (i < N) {
    const c = input[i];

    // Skip single-quoted: literal, no nested redirects to worry about.
    if (c === "'") {
      i++;
      while (i < N && input[i] !== "'") i++;
      if (i < N) i++;
      continue;
    }
    // Walk into double-quoted segments to catch nested $(...) and `...`.
    if (c === '"') {
      i++;
      while (i < N && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < N) { i += 2; continue; }
        if (input[i] === "$" && input[i + 1] === "(") {
          i += 2;
          let depth = 1;
          let inner = "";
          while (i < N && depth > 0) {
            if (input[i] === "(") { depth++; inner += input[i]; i++; continue; }
            if (input[i] === ")") { depth--; if (depth === 0) break; inner += input[i]; i++; continue; }
            inner += input[i]; i++;
          }
          if (i < N) i++;
          for (const t of extractRedirectTargets(inner)) targets.push(t);
          continue;
        }
        if (input[i] === "`") {
          i++;
          let inner = "";
          while (i < N && input[i] !== "`") {
            if (input[i] === "\\" && i + 1 < N) { inner += input[i + 1]; i += 2; continue; }
            inner += input[i]; i++;
          }
          if (i < N) i++;
          for (const t of extractRedirectTargets(inner)) targets.push(t);
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
      for (const t of extractRedirectTargets(inner)) targets.push(t);
      continue;
    }
    if (c === "$" && input[i + 1] === "(") {
      i += 2;
      let depth = 1;
      let inner = "";
      while (i < N && depth > 0) {
        if (input[i] === "(") { depth++; inner += input[i]; i++; continue; }
        if (input[i] === ")") { depth--; if (depth === 0) break; inner += input[i]; i++; continue; }
        inner += input[i]; i++;
      }
      if (i < N) i++;
      for (const t of extractRedirectTargets(inner)) targets.push(t);
      continue;
    }
    if (c === "\\" && i + 1 < N) { i += 2; continue; }

    // Output redirection operators we care about for write containment:
    //   >  >>  >|  &>  &>>  |&  N>  N>>  N>&M  N<>
    // The only ones that *open a file for writing* and accept a path
    // target are >, >>, >|, N>, N>>, &>, &>>. We collect the next word
    // from each and screen it.
    if (c === ">") {
      // Could be > or >> or >| or >&
      i++;
      if (input[i] === ">") i++;          // >>
      else if (input[i] === "|") i++;     // >|
      // >& is dup, no path target — skip the next word but don't add it
      // to targets. (Bash sometimes uses >&FILE syntax, but that's also
      // a write; we screen it just in case.)
      const isDup = input[i] === "&";
      if (isDup) i++;
      const w = readWord(i);
      i = w.end;
      if (!isDup && w.word) targets.push(w.word);
      // For >&, only screen if the target looks like a filename (not
      // a digit-only fd). Defensive belt-and-suspenders.
      if (isDup && w.word && !/^[0-9-]+$/.test(w.word)) targets.push(w.word);
      continue;
    }
    // Numeric prefix: e.g. `2>`, `2>>`, `2>&1`, `2>&FILE`.
    if (c >= "0" && c <= "9") {
      // Look ahead: digits followed by > ?
      let k = i;
      while (k < N && input[k] >= "0" && input[k] <= "9") k++;
      if (k < N && (input[k] === ">" || input[k] === "<")) {
        const op = input[k];
        i = k + 1;
        if (op === ">" && (input[i] === ">" || input[i] === "|")) i++;
        const isDup = input[i] === "&";
        if (isDup) i++;
        // For < (input redirection), there is no write — skip target.
        if (op === "<") {
          const w = readWord(i);
          i = w.end;
          continue;
        }
        const w = readWord(i);
        i = w.end;
        if (!isDup && w.word) targets.push(w.word);
        if (isDup && w.word && !/^[0-9-]+$/.test(w.word)) targets.push(w.word);
        continue;
      }
      // Not a redirection prefix, fall through to normal char.
    }
    // & alone: could be `&>` (bash output redirect to file) or just
    // backgrounding / `&&`. Only `&>` (or `&>>`) is a write redirect.
    if (c === "&" && input[i + 1] === ">") {
      i += 2;
      if (input[i] === ">") i++;
      const w = readWord(i);
      i = w.end;
      if (w.word) targets.push(w.word);
      continue;
    }
    // |& (bash 4+) pipes both stdout and stderr — no file target, but
    // it's handled by the pipeline downstream so nothing to validate.
    i++;
  }

  return targets;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function stripEnvAssignments(argv: string[]): string[] {
  let i = 0;
  while (i < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i])) i++;
  return argv.slice(i);
}

// Interpreters and DSLs that can execute arbitrary code (either via
// `-c` / `-e`-style flags OR via in-language primitives such as
// awk's `system()` / `getline … from a pipe`, gnuplot's `system()`,
// etc.). The runtime container has no OS-level filesystem isolation
// available (no bwrap / firejail / nsjail / unprivileged userns —
// kernel seccomp blocks them, see file header), so we cannot
// statically prove these processes won't `open("/tmp/escape", "w")`
// or `system("touch /etc/x")`. They are refused outright.
const ARBITRARY_CODE_INTERPRETERS = new Set<string>([
  "python", "python2", "python3",
  "node", "nodejs", "deno", "bun",
  "tsx", "ts-node",
  "perl",
  "ruby",
  "lua", "luajit",
  "php",
  "Rscript", "R",
  "scheme", "guile",
  "racket",
  "groovy",
  // awk variants — `awk 'BEGIN{system("touch /tmp/x")}'` shells out.
  "awk", "gawk", "mawk", "nawk",
  // Other "scripting" tools with shell-out primitives.
  "gnuplot",
  "expect",
  "tcl", "tclsh", "wish",
]);

const SHELL_INTERPRETERS = new Set<string>([
  "bash", "sh", "zsh", "dash", "ash", "ksh", "mksh",
]);

// Wrapper tools that fundamentally change the security context or
// exec arbitrary inner commands we can't statically inspect. These
// are HARD-BLOCKED — there's no safe way to recurse into them.
const WRAPPER_EXEC_TOOLS = new Set<string>([
  // Privilege change.
  "sudo", "doas", "su", "runuser", "pkexec", "setpriv", "capsh",
  // Per-line / per-match command runners — input is dynamic, can't
  // predict the inner command at validate time.
  "xargs", "parallel", "watch",
  // Environment manipulation (`env PATH=/tmp/evil:$PATH cmd` rewrites
  // PATH and then execs a binary that may not be the one we'd find).
  "env",
  // Session / multiplexers — spawn a real shell.
  "script", "screen", "tmux",
  // Network shells / remote exec — escape the host entirely.
  "ssh", "scp", "rsh", "telnet", "socat", "ncat", "nc",
  // Containerisation tools — full OS-level escapes.
  "docker", "podman", "ctr", "runc", "crun", "kubectl", "nerdctl",
  // Namespace / chroot helpers.
  "unshare", "nsenter", "chroot",
]);

// Resource-only wrappers: they exec the next argv unchanged but do
// NOT change PATH, privileges, namespace, or read commands from input.
// Safe to recurse: validate the inner command with our same checks.
const RECURSIVE_WRAPPER_TOOLS = new Set<string>([
  "timeout", "nice", "ionice", "taskset", "chrt", "time", "command",
  "stdbuf", "unbuffer", "nohup", "setsid",
]);

// Editors / pagers that expose a `:!CMD` / `!CMD` shell escape, OR
// that can execute commands from a config file (`:source`, `~/.exrc`,
// etc.). All trivially escape any argv heuristic.
const SHELL_ESCAPING_EDITORS = new Set<string>([
  "vi", "vim", "nvim", "ex", "view", "rview", "rvim",
  "emacs", "emacsclient",
  "less", "more", "most", "man", "info", "pinfo",
  "mc", // midnight commander has built-in shell
]);

// Build / task runners that read a file (Makefile, build.gradle, …)
// containing arbitrary shell snippets and execute them. Without
// auditing the file's contents we cannot prove they're contained.
const BUILD_RUNNERS = new Set<string>([
  "make", "gmake", "bmake", "pmake",
  "cmake", "ninja", "scons", "bazel", "buck", "buck2",
  "rake", "gradle", "gradlew", "ant", "maven", "mvn",
  "cargo", // runs build.rs which is arbitrary Rust code
  "go",    // `go run`, `go build` invoke arbitrary code
  "npm", "pnpm", "yarn", // run scripts from package.json
  "tox", "nox", "pytest", // run arbitrary test code (via interpreters)
]);

/**
 * Result of analysing an argv for filesystem writes.
 *  - `targets`: explicit destination paths the binary will write to.
 *  - `blockReason`: set when the argv invokes a primitive that can
 *    escape sandboxing entirely (interpreter -c/-e/-i, awk inplace,
 *    etc.). Caller MUST refuse to run this command.
 *  - `null` return: the binary is not in our write-aware list; the
 *    caller may proceed without argv-level destination checks (the
 *    redirect-target check still applies).
 */
interface ArgvWriteAnalysis {
  targets: string[];
  blockReason?: string;
}

/**
 * Strip a single positional argument out of an argv, skipping flags
 * and flag-arguments according to a tiny per-binary policy. Returns
 * the array of bare positional arguments (in order) after `--`
 * handling. Conservative: any `--flag=value` form is treated as a
 * single token and never confused for a positional.
 */
function positionals(argv: string[], flagsTakingValue: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  let endOfFlags = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (endOfFlags) { out.push(a); continue; }
    if (a === "--") { endOfFlags = true; continue; }
    if (a.startsWith("--") && a.includes("=")) continue;       // --foo=bar
    if (a.startsWith("--")) {
      if (flagsTakingValue.has(a)) i++;                          // --foo bar
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      if (flagsTakingValue.has(a)) i++;                          // -f bar
      continue;
    }
    out.push(a);
  }
  return out;
}

function extractArgvWriteTargets(argvRaw: string[]): ArgvWriteAnalysis | null {
  const argv = stripEnvAssignments(argvRaw);
  if (argv.length === 0) return null;
  const name = basename(argv[0]);
  const args = argv.slice(1);

  // ---- cwd-mutating builtins: BLOCK ENTIRELY ----
  // `cd /tmp && touch x`, `pushd /tmp; echo y > z`, `popd && rm a`
  // would change the runtime cwd before subsequent writes execute,
  // letting a relative target like "x" land outside the sandbox even
  // though static analysis sees it as in-sandbox. We have no way to
  // honour cwd mutations from a parsed command chain, so refuse them
  // outright. (Alternative: spawn each argv with an explicit `chdir`
  // back to the sandbox, but that breaks env, fd, and pipe sharing
  // between segments.)
  if (name === "cd" || name === "pushd" || name === "popd" || name === "chdir") {
    return {
      targets: [],
      blockReason: `${name} is not allowed in the workbench shell — runtime cwd changes can move subsequent writes outside the sandbox`,
    };
  }

  // ---- arbitrary-code interpreters: BLOCK ENTIRELY ----
  // Without OS-level isolation we cannot statically prove that a
  // python/node/perl/ruby/etc. process won't open `/tmp/escape` for
  // write via syscalls (whether the code is inline `-c`/`-e` or
  // loaded from an in-sandbox script). The only sound containment is
  // to refuse interpreter execution from the Workbench shell.
  // Project-level build runs should go through dedicated, server-side
  // pipelines (build agent, test runner) that can apply real
  // isolation, not through the freeform shell endpoint.
  if (ARBITRARY_CODE_INTERPRETERS.has(name)) {
    return {
      targets: [],
      blockReason: `${name} is not allowed in the workbench shell — interpreter / DSL processes can perform writes outside the sandbox via syscalls or built-in shell-out primitives (e.g. awk's system(), gnuplot's system()); run the script through a dedicated build pipeline instead`,
    };
  }

  // ---- resource-only wrappers: RECURSE into inner command ----
  // `timeout 5s touch foo`, `nice -n 19 cp a b`, `nohup tail -f log`
  // etc. only adjust scheduling / lifecycle and exec the next argv
  // unchanged. We pull out the inner argv and re-validate it with
  // the same rules. The wrapper itself never writes to disk, with
  // ONE exception: `time -o FILE` and `time -a FILE` write timing
  // output. Reject those forms specifically.
  if (RECURSIVE_WRAPPER_TOOLS.has(name)) {
    if (name === "time") {
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-o" || a === "--output" || a === "-a" || a === "--append") {
          return { targets: [], blockReason: `time ${a} writes timing output to a file — not allowed in the workbench shell` };
        }
        if (a.startsWith("--output=") || a.startsWith("--append=")) {
          return { targets: [], blockReason: `time ${a.split("=")[0]}= writes timing output to a file — not allowed in the workbench shell` };
        }
      }
    }
    // Per-tool flag-with-value sets, so we know which leading argv
    // entries to skip before reaching the inner command.
    const flagsWithVal: Record<string, ReadonlySet<string>> = {
      timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
      nice:    new Set(["-n", "--adjustment"]),
      ionice:  new Set(["-c", "--class", "-n", "--classdata", "-p", "--pid", "-P", "--pgid", "-u", "--uid", "-t"]),
      taskset: new Set(["-c", "--cpu-list", "-p", "--pid"]),
      chrt:    new Set(["-p", "--pid", "-T", "--sched-runtime", "-P", "--sched-period", "-D", "--sched-deadline"]),
      time:    new Set(["-f", "--format", "-o", "--output"]),
      command: new Set([]),
      stdbuf:  new Set(["-i", "--input", "-o", "--output", "-e", "--error"]),
      unbuffer: new Set([]),
      nohup:   new Set([]),
      setsid:  new Set([]),
    };
    const valueFlags = flagsWithVal[name] ?? new Set<string>();
    let i = 0;
    while (i < args.length) {
      const a = args[i];
      if (a === "--") { i++; break; }
      if (a.startsWith("--") && a.includes("=")) { i++; continue; }
      if (a.startsWith("--")) {
        if (valueFlags.has(a)) i += 2; else i++;
        continue;
      }
      if (a.startsWith("-") && a.length > 1) {
        if (valueFlags.has(a)) i += 2; else i++;
        continue;
      }
      // First positional reached.
      // `timeout DURATION CMD ARGS...` — first positional is DURATION,
      // not a command, so skip one more.
      if (name === "timeout") { i++; }
      // `taskset MASK CMD ARGS...` — first positional is the bitmask
      // unless `-c` was used (already consumed above).
      if (name === "taskset") { i++; }
      // `chrt [POLICY-FLAG] PRIORITY CMD ARGS...` — the first
      // positional is always PRIORITY; the inner command starts
      // after it. (POLICY-FLAG, if present, was already consumed as
      // a short flag above.)
      if (name === "chrt") { i += 1; }
      break;
    }
    const inner = args.slice(i);
    if (inner.length === 0) {
      // No inner command (e.g. `nohup` alone) — nothing to write.
      return { targets: [] };
    }
    // Reconstruct the inner command as a single argv string and
    // recurse via the same `__RECURSE__:` sentinel the shell
    // interpreter path uses. Single-quote each token so spaces /
    // special chars don't get re-tokenised as separate words.
    const innerCmd = inner.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
    return { targets: [], blockReason: `__RECURSE__:${innerCmd}` };
  }

  // ---- wrapper exec tools: BLOCK ENTIRELY ----
  // These tools change the security context (sudo, env-with-PATH-rewrite,
  // ssh, docker, chroot/unshare) or exec dynamic per-line input
  // (xargs, parallel) — neither category is statically validatable.
  if (WRAPPER_EXEC_TOOLS.has(name)) {
    return {
      targets: [],
      blockReason: `${name} is not allowed in the workbench shell — wrapper / privilege / remote-exec tools can run arbitrary inner commands or escape the host (run the inner command directly)`,
    };
  }

  // ---- editors / pagers with shell escape: BLOCK ENTIRELY ----
  // vim/less/man/etc. all expose `:!CMD` interactively and can also
  // be driven non-interactively (vim -c '!cmd', less +!cmd). They
  // also auto-source rc files that may contain commands.
  if (SHELL_ESCAPING_EDITORS.has(name)) {
    return {
      targets: [],
      blockReason: `${name} is not allowed in the workbench shell — editors and pagers expose interactive shell escapes (e.g. :!CMD) which bypass the sandbox`,
    };
  }

  // ---- build / task runners: BLOCK ENTIRELY ----
  // make / cmake / npm run / cargo / go run all execute arbitrary
  // shell snippets read from a project file. We have no way to audit
  // those snippets, so we refuse them at the workbench layer.
  if (BUILD_RUNNERS.has(name)) {
    return {
      targets: [],
      blockReason: `${name} is not allowed in the workbench shell — build/task runners execute arbitrary shell snippets from project files (Makefile, package.json, build.gradle, …) which the sandbox cannot validate`,
    };
  }

  // ---- find: block subcommand-execution flags ----
  // GNU find has -exec / -execdir / -ok / -okdir which run arbitrary
  // commands per match, and -delete which unlinks paths anywhere the
  // search pattern resolves. -fprint / -fprintf / -fls write to a
  // named file. All bypass our argv heuristics.
  if (name === "find") {
    const targets: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-exec" || a === "-execdir" || a === "-ok" || a === "-okdir") {
        return { targets: [], blockReason: `find ${a} is not allowed in the workbench shell — it spawns arbitrary commands per match` };
      }
      if (a === "-delete") {
        return { targets: [], blockReason: `find -delete is not allowed in the workbench shell — it can unlink any path the search reaches` };
      }
      if (a === "-fprint" || a === "-fprintf" || a === "-fls") {
        if (i + 1 < args.length) targets.push(args[i + 1]);
      }
    }
    return { targets };
  }

  // ---- sed: block 'e' (execute) and 'w' (write to FILE) commands ----
  // sed's `e` command pipes the pattern space through a shell, and
  // `w FILE` / `W FILE` writes to an absolute path. -i is already
  // treated below. We're conservative: any -e / -f script containing
  // a bare `e`, `w`, `W`, or `s/.../.../e` is blocked.
  if (name === "sed") {
    // Collect every script body: explicit -e SCRIPT / --expression=SCRIPT
    // forms AND the implicit first-positional-as-script when no -e/-f
    // was supplied (POSIX sed behaviour: `sed 's/x/y/' file`).
    const scripts: string[] = [];
    let sawExplicitScriptSource = false;
    let positionalIdx = 0;
    const flagsTakingValue = new Set(["-e", "--expression", "-f", "--file", "-l", "--line-length"]);
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-e" || a === "--expression") {
        scripts.push(args[i + 1] ?? "");
        sawExplicitScriptSource = true;
        i++;
        continue;
      }
      if (a.startsWith("--expression=")) {
        scripts.push(a.slice("--expression=".length));
        sawExplicitScriptSource = true;
        continue;
      }
      if (a === "-f" || a === "--file") {
        return { targets: [], blockReason: `sed -f is not allowed in the workbench shell — script files may contain 'e' (execute) commands the sandbox cannot inspect` };
      }
      if (a.startsWith("--file=")) {
        return { targets: [], blockReason: `sed --file= is not allowed in the workbench shell — script files may contain 'e' (execute) commands the sandbox cannot inspect` };
      }
      // Skip flag values.
      if ((a.startsWith("-") && a.length > 1 && flagsTakingValue.has(a))) { i++; continue; }
      if (a.startsWith("-")) continue;
      // Positional: first one is the script if we haven't seen -e/-f.
      if (!sawExplicitScriptSource && positionalIdx === 0) {
        scripts.push(a);
      }
      positionalIdx++;
    }
    for (const script of scripts) {
      // s<DELIM>...<DELIM>...<DELIM>FLAGSe   (flag 'e' = execute
      // replacement). The delimiter can be any single character;
      // capture it so the backreference works for s|…|…|e too.
      if (/s(.)(?:[^\\]|\\.)*?\1(?:[^\\]|\\.)*?\1[a-zA-Z]*e/.test(script)
          // Bare 'e' command (alone on its line / between ; or after start)
          || /(?:^|\n|;)\s*e(?:\s|$)/.test(script)
          // 'w FILE' or 'W FILE' command writes to disk
          || /(?:^|\n|;)\s*[Ww]\s+\S/.test(script)) {
        return { targets: [], blockReason: `sed script uses 'e' (execute) or 'w' (write-to-file) commands — not allowed in the workbench shell` };
      }
    }
    // The existing sed -i argv-write handling continues below.
  }

  // ---- git: validate path-retargeting flags ----
  // `git -C DIR <subcmd>`, `git --git-dir=DIR`, `git --work-tree=DIR`,
  // `git --namespace=NS`, `git --super-prefix=PREFIX` all let git
  // write somewhere other than the sandbox cwd. We must validate
  // each as a path target. (`git push --force` etc. is handled by
  // checkGitSafety upstream; this layer validates the *targets*.)
  if (name === "git") {
    const targets: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-C" || a === "--git-dir" || a === "--work-tree") {
        if (i + 1 < args.length) targets.push(args[i + 1]);
      } else if (a.startsWith("--git-dir=")) {
        targets.push(a.slice("--git-dir=".length));
      } else if (a.startsWith("--work-tree=")) {
        targets.push(a.slice("--work-tree=".length));
      }
    }
    // Also check git subcommand-specific output flags that write
    // outside cwd: `git clone REPO DIR`, `git init DIR`,
    // `git worktree add PATH`, `git bundle create FILE`,
    // `git format-patch -o DIR`, `git archive -o FILE`.
    // Skip global options to find the subcommand:
    let i = 0;
    while (i < args.length) {
      const a = args[i];
      if (a === "--") { i++; break; }
      if (a === "-C" || a === "-c" || a === "--git-dir" || a === "--work-tree"
          || a === "--namespace" || a === "--super-prefix") { i += 2; continue; }
      if (a.startsWith("-")) { i++; continue; }
      break;
    }
    const sub = args[i];
    const rest = args.slice(i + 1);
    if (sub === "clone") {
      // git clone [opts] URL [DIR]   — DIR is the destination dir.
      const ps = positionals(rest, new Set([
        "-o", "--origin", "-b", "--branch", "-u", "--upload-pack",
        "--reference", "--reference-if-able", "--depth", "--shallow-since",
        "--shallow-exclude", "--recurse-submodules", "--shallow-submodules",
        "--no-shallow-submodules", "--separate-git-dir", "--filter",
        "-c", "--config", "--server-option", "--jobs", "-j",
      ]));
      if (ps.length >= 2) targets.push(ps[1]);
      // (single positional = URL only, dir is derived from URL in cwd)
    } else if (sub === "init") {
      // git init [opts] [DIR]
      const ps = positionals(rest, new Set([
        "--template", "--separate-git-dir", "--initial-branch", "-b",
        "--shared",
      ]));
      if (ps.length >= 1) targets.push(ps[0]);
    } else if (sub === "worktree" && rest[0] === "add") {
      // git worktree add [opts] PATH [BRANCH]
      const ps = positionals(rest.slice(1), new Set([
        "-b", "-B", "--track", "--detach", "--lock", "--reason",
      ]));
      if (ps.length >= 1) targets.push(ps[0]);
    } else if (sub === "bundle" && rest[0] === "create") {
      // git bundle create FILE <git-rev-list-args>
      const ps = positionals(rest.slice(1), new Set());
      if (ps.length >= 1) targets.push(ps[0]);
    } else if (sub === "format-patch") {
      for (let j = 0; j < rest.length; j++) {
        if (rest[j] === "-o" && j + 1 < rest.length) targets.push(rest[j + 1]);
        else if (rest[j].startsWith("--output-directory=")) targets.push(rest[j].slice("--output-directory=".length));
        else if (rest[j] === "--output-directory" && j + 1 < rest.length) targets.push(rest[j + 1]);
      }
    } else if (sub === "archive") {
      for (let j = 0; j < rest.length; j++) {
        if (rest[j] === "-o" && j + 1 < rest.length) targets.push(rest[j + 1]);
        else if (rest[j].startsWith("--output=")) targets.push(rest[j].slice("--output=".length));
        else if (rest[j] === "--output" && j + 1 < rest.length) targets.push(rest[j + 1]);
      }
    }
    return { targets };
  }

  // ---- shell interpreters: recurse into -c CODE ----
  if (SHELL_INTERPRETERS.has(name)) {
    // Find -c CODE (or -c=CODE) and feed CODE back through the
    // top-level checker. Without -c the shell reads from stdin or a
    // script file argument which we treat as in-sandbox content.
    let inlineCode: string | null = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-c" && i + 1 < args.length) { inlineCode = args[i + 1]; break; }
      if (args[i].startsWith("-c=")) { inlineCode = args[i].slice(3); break; }
    }
    if (inlineCode != null) {
      // Caller is responsible for re-running checkPathContainment on
      // the inline code; signal via blockReason WHEN we already see a
      // statically detectable escape, otherwise return targets:[] and
      // let `checkPathContainment` recurse.
      return { targets: [], blockReason: `__RECURSE__:${inlineCode}` };
    }
    return { targets: [] };
  }

  // ---- write-oriented core utilities ----
  switch (name) {
    case "touch":
    case "mktemp":
    case "tee":
    case "mkdir":
    case "mkfifo":
    case "rmdir": {
      // All positionals are file/dir destinations.
      const flags = name === "mktemp"
        ? new Set<string>(["-p", "--tmpdir", "--suffix"])
        : new Set<string>();
      return { targets: positionals(args, flags) };
    }
    case "rm":
    case "unlink":
    case "shred":
    case "wipe": {
      // rm / unlink / shred / wipe DELETE the named paths. Deletion
      // is just as dangerous as creation — we must keep `rm -rf /etc`
      // from working. Treat every positional as a "write" target.
      const flagsWithVal = name === "shred"
        ? new Set<string>(["-n", "--iterations", "-s", "--size"])
        : new Set<string>();
      return { targets: positionals(args, flagsWithVal) };
    }
    case "ln":
    case "link": {
      // ln [-s] TARGET LINK_NAME  — LINK_NAME is the *write* target,
      // but the SYMLINK/HARDLINK TARGET also matters: a symlink that
      // points outside the sandbox becomes a future escape vector
      // (`ln -s /tmp link; echo x > link/pwned`), and a hardlink to
      // a file outside the sandbox lets us write to that file via
      // the in-sandbox name. So we treat both as write targets and
      // require both to resolve inside the sandbox.
      const flagsWithVal = new Set<string>(["-t", "--target-directory", "-S", "--suffix", "-T"]);
      const ps = positionals(args, flagsWithVal);
      const targets: string[] = [];
      // Capture -t DIR / --target-directory DIR
      let tDir: string | null = null;
      for (let i = 0; i < args.length; i++) {
        if ((args[i] === "-t" || args[i] === "--target-directory") && i + 1 < args.length) {
          tDir = args[i + 1];
        } else if (args[i].startsWith("--target-directory=")) {
          tDir = args[i].slice("--target-directory=".length);
        }
      }
      if (tDir != null) {
        targets.push(tDir);
        // With -t, all positionals are link TARGETS, also validated.
        for (const p of ps) targets.push(p);
        return { targets };
      }
      if (ps.length >= 2) {
        // ps[0..n-2] = link TARGETS (paths the link will point to);
        // ps[n-1] = the link path being created (write).
        for (let i = 0; i < ps.length - 1; i++) targets.push(ps[i]);
        targets.push(ps[ps.length - 1]);
        return { targets };
      }
      if (ps.length === 1) {
        // Single positional: the link itself (created in cwd) plus
        // the implied target.
        targets.push(ps[0]);
        targets.push("./" + basename(ps[0]));
        return { targets };
      }
      return { targets: [] };
    }
    case "cp":
    case "mv":
    case "install":
    case "rsync": {
      // [opts] SRC... DEST — last positional is destination, unless
      // -t/--target-directory specifies it.
      const flagsWithVal = new Set<string>([
        "-t", "--target-directory", "-T", "--no-target-directory",
        "-S", "--suffix", "-m", "--mode", "-o", "--owner", "-g", "--group",
        "--backup", "-Z", "--context",
        // rsync-specific:
        "-e", "--rsh", "--exclude", "--exclude-from", "--include", "--include-from",
        "--files-from", "--bwlimit", "--port", "--password-file", "--info", "--debug",
        "--log-file", "--log-file-format", "--out-format", "--protocol", "--temp-dir",
        "--partial-dir", "--compare-dest", "--copy-dest", "--link-dest", "--block-size",
        "--max-size", "--min-size", "--modify-window", "--timeout", "--contimeout",
      ]);
      const tDir: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if ((args[i] === "-t" || args[i] === "--target-directory") && i + 1 < args.length) {
          tDir.push(args[i + 1]);
        } else if (args[i].startsWith("--target-directory=")) {
          tDir.push(args[i].slice("--target-directory=".length));
        }
      }
      if (tDir.length > 0) return { targets: tDir };
      const ps = positionals(args, flagsWithVal);
      if (ps.length >= 2) return { targets: [ps[ps.length - 1]] };
      return { targets: [] };
    }
    case "chmod":
    case "chown":
    case "chgrp": {
      // chmod MODE FILES...  (first positional is mode, rest are
      // write-affecting targets; metadata writes still escape sandbox)
      const ps = positionals(args, new Set(["--reference", "--from"]));
      return { targets: ps.slice(1) };
    }
    case "truncate": {
      // truncate -s SIZE FILES...  (-s/--size is required)
      const ps = positionals(args, new Set(["-s", "--size", "-r", "--reference"]));
      return { targets: ps };
    }
    case "dd": {
      // dd of=FILE — already in command-safety BLOCKED_BINARIES, but
      // belt-and-suspenders.
      const targets: string[] = [];
      for (const a of args) {
        if (a.startsWith("of=")) targets.push(a.slice(3));
      }
      return { targets };
    }
    case "sed": {
      // sed -i[SUFFIX] EXPR FILES...  -- inplace overwrites FILES.
      // GNU sed: `-i` takes an optional SUFFIX appended without space
      // (`-i.bak`), so `-i` itself does NOT consume the next argv.
      // BSD/macOS sed requires a SUFFIX, but we err on the side of
      // GNU semantics here.
      let inplace = false;
      for (const a of args) {
        if (a === "-i" || a === "--in-place" || a.startsWith("-i") || a.startsWith("--in-place=")) {
          inplace = true; break;
        }
      }
      if (!inplace) return { targets: [] };
      // -e EXPR / -f SCRIPT take a value; -i does NOT.
      const ps = positionals(args, new Set(["-e", "--expression", "-f", "--file"]));
      // First positional is the sed script (e.g. 's/x/y/'); files follow.
      return { targets: ps.slice(1) };
    }
    case "awk": case "gawk": case "mawk": case "nawk": {
      // awk -i inplace ... FILES   OR   awk -f SCRIPT FILES   OR
      // awk 'PROGRAM' FILES — only the inplace form writes files.
      let inplace = false;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "-i" && i + 1 < args.length && args[i + 1] === "inplace") inplace = true;
        if (args[i] === "-i" && i + 1 < args.length && args[i + 1].startsWith("inplace")) inplace = true;
        if (args[i].startsWith("-i=inplace")) inplace = true;
      }
      if (!inplace) return { targets: [] };
      const ps = positionals(args, new Set(["-f", "--file", "-v", "--assign", "-i"]));
      return { targets: ps.slice(1) };
    }
    case "tar": {
      // tar -x -C DIR     extracts INTO DIR (write)
      // tar -c -f FILE    creates archive AT FILE (write)
      // tar -r/-u -f FILE updates archive AT FILE (write)
      // Combined short flags are common: tar -czf out.tgz src/
      // (here -f is the LAST flag in the cluster and consumes the
      // NEXT argv as its value, mirroring `tar`'s actual behaviour).
      const targets: string[] = [];
      const archiveFiles: string[] = [];     // -f / --file values
      const extractDirs: string[] = [];      // -C / --directory values
      let mode: "x" | "c" | "r" | "u" | null = null;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith("--")) {
          if (a === "--extract" || a === "--get") mode = "x";
          else if (a === "--create") mode = "c";
          else if (a === "--append") mode = "r";
          else if (a === "--update") mode = "u";
          else if (a === "--file" && i + 1 < args.length) archiveFiles.push(args[i + 1]);
          else if (a.startsWith("--file=")) archiveFiles.push(a.slice("--file=".length));
          else if (a === "--directory" && i + 1 < args.length) extractDirs.push(args[i + 1]);
          else if (a.startsWith("--directory=")) extractDirs.push(a.slice("--directory=".length));
          continue;
        }
        if (a.startsWith("-") && a.length > 1) {
          // Combined short flags. -f and -C consume the NEXT argv.
          let needsValueF = false;
          let needsValueC = false;
          for (const ch of a.slice(1)) {
            if (ch === "x") mode = "x";
            else if (ch === "c") mode = "c";
            else if (ch === "r") mode = "r";
            else if (ch === "u") mode = "u";
            else if (ch === "f") needsValueF = true;
            else if (ch === "C") needsValueC = true;
          }
          if (needsValueF && i + 1 < args.length) archiveFiles.push(args[i + 1]);
          if (needsValueC && i + 1 < args.length) extractDirs.push(args[i + 1]);
          continue;
        }
      }
      // -f archive file: written when creating/appending/updating
      if (mode === "c" || mode === "r" || mode === "u") {
        for (const f of archiveFiles) targets.push(f);
      }
      // -C extraction directory: written into when extracting
      if (mode === "x") {
        for (const d of extractDirs) targets.push(d);
      }
      return { targets };
    }
    case "unzip": {
      // unzip ARCHIVE -d DIR  (extracts into DIR)
      const targets: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "-d" && i + 1 < args.length) targets.push(args[i + 1]);
      }
      return { targets };
    }
    case "zip": {
      // zip ARCHIVE FILES... — first positional is the archive (write).
      const ps = positionals(args, new Set(["-O", "--output-file", "-i", "-x", "-t", "-tt", "-ll"]));
      if (ps.length > 0) return { targets: [ps[0]] };
      return { targets: [] };
    }
    case "wget": {
      // wget -O FILE URL  /  wget -P PREFIX URL  /  wget --output-document=FILE
      const targets: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "-O" && i + 1 < args.length) targets.push(args[i + 1]);
        else if (args[i].startsWith("--output-document=")) targets.push(args[i].slice("--output-document=".length));
        else if (args[i] === "-P" || args[i] === "--directory-prefix") {
          if (i + 1 < args.length) targets.push(args[i + 1]);
        } else if (args[i].startsWith("--directory-prefix=")) {
          targets.push(args[i].slice("--directory-prefix=".length));
        }
      }
      return { targets };
    }
    case "curl": {
      // curl -o FILE URL  /  curl --output FILE  /  curl -O (writes
      // to basename of URL in cwd, in-sandbox)
      const targets: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if ((args[i] === "-o" || args[i] === "--output") && i + 1 < args.length) targets.push(args[i + 1]);
        else if (args[i].startsWith("--output=")) targets.push(args[i].slice("--output=".length));
        else if ((args[i] === "--output-dir") && i + 1 < args.length) targets.push(args[i + 1]);
        else if (args[i].startsWith("--output-dir=")) targets.push(args[i].slice("--output-dir=".length));
      }
      return { targets };
    }
    case "split":
    case "csplit": {
      // split [opts] [INPUT [PREFIX]] — PREFIX is the write destination.
      const ps = positionals(args, new Set([
        "-l", "--lines", "-b", "--bytes", "-C", "--line-bytes",
        "-n", "--number", "-a", "--suffix-length", "-d", "-x",
        "--additional-suffix", "--filter",
      ]));
      // First positional = INPUT, second = PREFIX (default: 'x').
      if (ps.length >= 2) return { targets: [ps[1]] };
      return { targets: ["./x"] };
    }
    case "logger": {
      // logger -f FILE  /  logger --file FILE  -- writes via syslog,
      // but the -f flag READS, not writes. No write target.
      return { targets: [] };
    }
    default:
      return null;
  }
}

/**
 * Validate one path target against the sandbox root. Returns
 * `{blocked: true, reason}` for the first offender. Pure helper —
 * shared between redirect-target and argv-target validation.
 */
/**
 * Resolve `p` symlink-safely. We can't `realpath()` the full path
 * because the leaf usually doesn't exist yet (it's a target we're
 * about to write). Instead, walk up to the deepest existing
 * ancestor, `realpath` THAT, then re-attach the unresolved tail.
 * This catches `link/pwned` where `link -> /tmp` because the
 * realpath of the parent (`link`) is `/tmp`, which gives us
 * `/tmp/pwned` — clearly outside the sandbox.
 *
 * If realpath itself fails (permission denied, etc.) we fail closed.
 */
function realpathDeepestExisting(p: string): string {
  let cur = path.resolve(p);
  const tail: string[] = [];
  // Bound the walk; also safety against pathological inputs.
  for (let depth = 0; depth < 4096; depth++) {
    try {
      const r = fs.realpathSync(cur);
      return tail.length === 0 ? r : path.join(r, ...tail.reverse());
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        // EACCES, EPERM, ELOOP, … — fail closed by returning a
        // path under /__sandbox_realpath_failed__ so the caller's
        // containment check rejects it.
        return path.join("/__sandbox_realpath_failed__", p);
      }
      // Walk one segment up.
      const parent = path.dirname(cur);
      if (parent === cur) {
        // Reached `/` without ever existing — return cwd-resolved
        // path; downstream validator will compare to root.
        return path.resolve(p);
      }
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
  return path.resolve(p);
}

function validateTargetPath(t: string, kind: "redirect" | "argv", root: string): { blocked: boolean; reason?: string } {
  if (!t) return { blocked: false };
  if (ALLOWED_DEV_TARGETS.has(t)) return { blocked: false };
  if (t.startsWith("~")) {
    return { blocked: true, reason: `${kind} target "${t}" uses tilde expansion (escapes sandbox)` };
  }
  if (t.includes("$") || t.includes("`")) {
    return { blocked: true, reason: `${kind} target "${t}" uses unexpanded shell expansion` };
  }
  // 1. Lexical resolution: catches `..` escapes immediately.
  const lexical = path.isAbsolute(t) ? path.resolve(t) : path.resolve(root, t);
  const lexicalRel = path.relative(root, lexical);
  if (lexicalRel !== "" && (lexicalRel.startsWith("..") || path.isAbsolute(lexicalRel))) {
    return { blocked: true, reason: `${kind} target "${t}" escapes sandbox root` };
  }
  // 2. Symlink-safe resolution: walk up to the deepest existing
  //    ancestor, `realpath` it, and verify the result is still
  //    inside the *realpath*ed root. Catches `ln -s /tmp link` +
  //    `echo x > link/pwned` style escapes.
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    realRoot = root;
  }
  const realResolved = realpathDeepestExisting(lexical);
  const realRel = path.relative(realRoot, realResolved);
  if (realRel === "" || (!realRel.startsWith("..") && !path.isAbsolute(realRel))) {
    return { blocked: false };
  }
  return {
    blocked: true,
    reason: `${kind} target "${t}" escapes sandbox root via symlink (resolved to "${realResolved}")`,
  };
}

/**
 * Decide whether every redirect target AND every argv-level write
 * destination in `input` resolves inside `sandboxRoot`. Returns
 * `{blocked: true, reason}` for the first offender.
 *
 * Rules (defence-in-depth, fail closed):
 *   - Tilde-prefixed targets (`~/x`, `~`, `~user/...`) are rejected
 *     because they expand to paths outside our HOME override.
 *   - Targets containing unexpanded `$VAR` or backticks are rejected:
 *     we cannot statically prove where the value lands.
 *   - Absolute targets must be in `ALLOWED_DEV_TARGETS` or under
 *     `sandboxRoot` after path resolution.
 *   - Relative targets are joined onto `sandboxRoot` and rejected if
 *     the result escapes via `..`.
 *   - Argv-level write commands (touch, cp, mv, tee, install, mkdir,
 *     ln, chmod/chown/chgrp, truncate, sed -i, awk -i inplace, tar,
 *     unzip, zip, wget -O, curl -o, dd of=, rsync, …) are inspected
 *     for their destination arguments; the same path rules apply.
 *   - Arbitrary-code interpreters (python -c, node -e, perl -e/-i,
 *     ruby -e, etc.) are blocked entirely from inline code execution
 *     because their code can perform writes the parser cannot see.
 *   - `bash -c CODE` / `sh -c CODE` recurse: the inline CODE is fed
 *     back through this same checker so its writes are also screened.
 */
export function checkPathContainment(input: string, sandboxRoot: string): { blocked: boolean; reason?: string } {
  if (typeof input !== "string") {
    return { blocked: true, reason: "command is not a string" };
  }
  const root = path.resolve(sandboxRoot);

  // 1. Redirect targets (>, >>, &>, N>, $(...), `...`).
  let redirects: string[];
  try {
    redirects = extractRedirectTargets(input);
  } catch {
    return { blocked: true, reason: "could not safely parse redirections" };
  }
  for (const t of redirects) {
    const r = validateTargetPath(t, "redirect", root);
    if (r.blocked) return r;
  }

  // 2. Argv-level write destinations (touch /tmp/x, cp src /tmp/x, ...).
  let argvs: string[][];
  try {
    argvs = extractCommands(input);
  } catch {
    return { blocked: true, reason: "could not safely parse command argv" };
  }
  for (const argv of argvs) {
    const analysis = extractArgvWriteTargets(argv);
    if (analysis == null) continue; // unknown binary, allow (may be read-only)
    if (analysis.blockReason) {
      // Shell interpreter recursion uses a sentinel reason.
      const RECURSE = "__RECURSE__:";
      if (analysis.blockReason.startsWith(RECURSE)) {
        const innerCode = analysis.blockReason.slice(RECURSE.length);
        const inner = checkPathContainment(innerCode, root);
        if (inner.blocked) return inner;
        continue;
      }
      return { blocked: true, reason: analysis.blockReason };
    }
    for (const t of analysis.targets) {
      const r = validateTargetPath(t, "argv", root);
      if (r.blocked) return r;
    }
  }

  return { blocked: false };
}

// ----------------------------------------------------------------------
// OS-level containment detection from child stderr.
//
// When the OS sandbox is active (bwrap/firejail/nsjail) writes that
// escape the project cwd hit either a read-only bind (EROFS) or, for
// system paths, a permission refusal (EACCES). The inner command is
// usually a vanilla coreutils binary that prints something like:
//
//   cp: cannot create regular file '/etc/x': Read-only file system
//   bash: /usr/bin/foo: Permission denied
//   touch: cannot touch '/sys/kernel/x': Read-only file system
//
// On hosts WITHOUT OS isolation these messages mean nothing of the
// sort — the user genuinely hit a read-only mount or lacked perms —
// so we only ever emit `sandboxContained` when (a) the message is in
// the EROFS/EACCES family AND (b) the offending path is OUTSIDE the
// per-project sandbox root. That keeps in-project permission errors
// (e.g. writing to a chmod-000 file the user owns) from being
// mislabelled as "sandbox blocked".
// ----------------------------------------------------------------------

const SYSTEM_PATH_PREFIXES: readonly string[] = [
  "/etc", "/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64",
  "/var", "/sys", "/proc", "/boot", "/root", "/run", "/srv", "/opt",
  "/dev",
];

function isSystemPath(p: string): boolean {
  for (const prefix of SYSTEM_PATH_PREFIXES) {
    if (p === prefix || p.startsWith(prefix + "/")) return true;
  }
  return false;
}

function isOutsideSandboxRoot(p: string, sandboxRoot: string): boolean {
  if (!path.isAbsolute(p)) return false;
  const root = path.resolve(sandboxRoot);
  let realRoot = root;
  try { realRoot = fs.realpathSync(root); } catch { /* fall back to lexical */ }
  const abs = path.resolve(p);
  for (const r of [root, realRoot]) {
    const rel = path.relative(r, abs);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return false;
    }
  }
  return true;
}

/**
 * Walk backwards from a marker hit to recover the path token that
 * preceded it. Handles single-quoted, double-quoted, and bare paths
 * the way coreutils, bash, busybox, and Go's `errors.errno` typically
 * format errors:
 *
 *   "cp: cannot create regular file '/etc/x': Read-only file system"
 *   "touch: cannot touch \"/usr/foo\": Permission denied"
 *   "bash: /usr/bin/foo: Permission denied"
 *   "open /etc/x: read-only file system"           (Go)
 *   "mkdir /etc/x: permission denied"              (Go)
 *
 * Returns null if no `/`-rooted token is found before the marker.
 */
function extractPathBefore(stderr: string, markerStart: number): string | null {
  let end = markerStart;
  // Skip the ":" and whitespace separating path from marker text.
  while (end > 0 && (stderr[end - 1] === ":" || stderr[end - 1] === " " || stderr[end - 1] === "\t")) end--;
  // Optional trailing quote.
  let quote: string | null = null;
  if (end > 0 && (stderr[end - 1] === "'" || stderr[end - 1] === '"' || stderr[end - 1] === "`")) {
    quote = stderr[end - 1];
    end--;
  }
  let start = end;
  if (quote) {
    // Scan back to the matching opening quote.
    while (start > 0 && stderr[start - 1] !== quote) start--;
  } else {
    // Scan back to whitespace, newline, or another colon (which often
    // precedes the path in `cmd: PATH: error` style messages).
    while (start > 0) {
      const c = stderr[start - 1];
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === ":") break;
      start--;
    }
  }
  const token = stderr.slice(start, end).trim();
  if (!token.startsWith("/")) return null;
  return token;
}

/**
 * Walk forwards from the end of a marker hit to recover the path token
 * that follows it. Handles the message shapes used by Python tracebacks
 * and Node.js error formatting, where the syscall arg is rendered AFTER
 * the kernel error string:
 *
 *   "OSError: [Errno 30] Read-only file system: '/etc/x'"           (Python)
 *   "PermissionError: [Errno 13] Permission denied: '/etc/x'"       (Python)
 *   "Error: EROFS: read-only file system, open '/etc/x'"            (Node)
 *   "Error: EACCES: permission denied, mkdir '/etc/x'"              (Node)
 *
 * Stops at end-of-line so a marker on one line never picks up a path
 * from the next line. Returns null if no `/`-rooted token is found.
 */
function extractPathAfter(stderr: string, markerEnd: number): string | null {
  let i = markerEnd;
  while (i < stderr.length) {
    const c = stderr[i];
    if (c === "\n" || c === "\r") return null;
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      const start = i + 1;
      let end = start;
      while (end < stderr.length && stderr[end] !== quote && stderr[end] !== "\n") end++;
      const token = stderr.slice(start, end);
      if (token.startsWith("/")) return token;
      // Not a path token; advance past this quoted segment and keep
      // scanning the same line for another candidate.
      i = end < stderr.length && stderr[end] === quote ? end + 1 : end;
      continue;
    }
    if (c === "/") {
      let end = i;
      while (end < stderr.length) {
        const ch = stderr[end];
        if (ch === ":" || ch === " " || ch === "\t" || ch === "\n" ||
            ch === "\r" || ch === "," || ch === ")" || ch === '"' ||
            ch === "'" || ch === "`") break;
        end++;
      }
      return stderr.slice(i, end);
    }
    i++;
  }
  return null;
}

/**
 * Phrases that indicate the line of stderr is talking about a WRITE
 * operation. We use these to disambiguate `Permission denied` from
 * benign read/exec failures (e.g. opening a config file the user
 * happens not to have read perms on) before branding the result a
 * sandbox containment event. EROFS doesn't need this gate — any
 * `Read-only file system` error is by definition write-related.
 *
 * Covers coreutils/bash/busybox phrasing plus the structured shapes
 * used by Node.js (`EACCES: permission denied, mkdir '/x'`) and
 * Go's standard error formatter (`mkdir /etc/x: permission denied`).
 * Python's `PermissionError` is intentionally NOT a write-context
 * signal because it can also be raised on read-only opens — the only
 * reliable Python signal is `OSError: [Errno 30] Read-only file
 * system`, which is already covered by the EROFS marker (no write
 * gate needed).
 */
const WRITE_CONTEXT_PATTERNS: readonly RegExp[] = [
  /cannot create/i,
  /cannot touch/i,
  /cannot remove/i,
  /cannot mkdir/i,
  /cannot make directory/i,
  /cannot overwrite/i,
  /cannot write/i,
  /unable to create/i,
  /unable to write/i,
  /failed to (?:create|write|open .* for writing)/i,
  /error writing/i,
  // Node.js libuv-style: "Error: EACCES: permission denied, mkdir '/x'".
  // The operation name (mkdir, write, unlink, …) appears between the
  // marker and the path, after a comma. We anchor on the errno token
  // so we don't accidentally match free-form English elsewhere.
  /(?:EACCES|EROFS|EPERM)[^\n,]*,\s*(?:mkdir|write|unlink|rmdir|rename|chmod|chown|symlink|link|truncate|copyfile|mkstemp|ftruncate|utimes|lchown|fchmod|fchown)\b/i,
  // Go-style: a write-oriented op name appears at the start of the
  // line, immediately followed by an absolute path:
  //   "mkdir /etc/x: permission denied"
  // `open` / `openat` are intentionally excluded: a Go EACCES on
  // `open /path` is ambiguous between read and write (the syscall is
  // the same for both), so flagging it as a sandbox write attempt
  // would mislabel benign read failures like
  // `open /etc/shadow: permission denied`. EROFS on the same wording
  // is unambiguous and is handled by the EROFS marker on its own
  // (no write-context gate). We require the path to be `/`-rooted so
  // we don't match build tool output like `create file foo`.
  /(?:^|\s)(?:mkdir|write|create|remove|removeall|unlink|rename|chmod|chown|lchown|symlink|link|truncate)\s+\//i,
];

function lineOf(stderr: string, index: number): string {
  let lineStart = stderr.lastIndexOf("\n", index - 1) + 1;
  let lineEnd = stderr.indexOf("\n", index);
  if (lineEnd < 0) lineEnd = stderr.length;
  return stderr.slice(lineStart, lineEnd);
}

function looksLikeWriteContext(line: string): boolean {
  for (const re of WRITE_CONTEXT_PATTERNS) {
    if (re.test(line)) return true;
  }
  return false;
}

/**
 * Inspect stderr for OS-level containment signals. Returns a
 * `SandboxContainment` describing the friendliest message we can
 * produce for the user, or null if nothing matches. Pure helper —
 * exported so tests can pin the mapping behaviour without spawning
 * real sandboxed commands.
 *
 * Discrimination rules (designed to minimise false positives on hosts
 * WITHOUT an OS jail, where the same kernel errors can come from
 * legitimate causes):
 *   - `Read-only file system` (EROFS): treated as containment whenever
 *     the offending path resolves outside the sandbox root. Inside a
 *     project tree EROFS effectively never happens, so this is a
 *     strong write-attempt signal on its own.
 *   - `Permission denied` (EACCES): only treated as containment when
 *     the offending path is a system path AND the surrounding line
 *     looks like a write context (`cannot create`, `cannot touch`,
 *     `unable to write`, libuv `EACCES: ..., mkdir`, Go `mkdir /x`,
 *     etc.). This rules out read/exec EACCES (e.g.
 *     `bash: /usr/local/sbin/foo: Permission denied` for a missing
 *     +x bit) which is NOT a sandbox event.
 *
 * Marker matching is case-insensitive so we recognise the lowercase
 * spellings used by Go's `errors.errno` formatter and Node's libuv
 * (`read-only file system`, `permission denied`) alongside the
 * capitalised spellings used by glibc/coreutils.
 *
 * For the offending path we try the token immediately BEFORE the
 * marker first (coreutils/bash/Go shape: `cp: cannot create '/x':
 * Read-only file system` and `mkdir /x: permission denied`); if
 * nothing usable is there we then try the token immediately AFTER the
 * marker on the same line (Python/Node shape: `OSError: [Errno 30]
 * Read-only file system: '/x'` and `Error: EROFS: ..., open '/x'`).
 */
export function detectOsContainment(
  stderr: string,
  sandboxRoot: string,
): SandboxContainment | null {
  if (typeof stderr !== "string" || stderr.length === 0) return null;
  // Search marker by marker; pick the FIRST match in stderr order so
  // the offending path matches the first thing the user's command
  // actually tried to write to. Case-insensitive matching lets us
  // catch the lowercase spellings emitted by Go and Node alongside
  // the capitalised glibc/coreutils form.
  type Hit = { reason: "readonly" | "permission"; index: number; markerLen: number };
  const hits: Hit[] = [];
  const RO_RE = /read-only file system/gi;
  const EACCES_RE = /permission denied/gi;
  let m: RegExpExecArray | null;
  while ((m = RO_RE.exec(stderr)) !== null) {
    hits.push({ reason: "readonly", index: m.index, markerLen: m[0].length });
  }
  while ((m = EACCES_RE.exec(stderr)) !== null) {
    hits.push({ reason: "permission", index: m.index, markerLen: m[0].length });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.index - b.index);

  for (const hit of hits) {
    // Prefer the path token directly before the marker (coreutils,
    // bash, busybox, Go). If it's missing OR resolves inside the
    // project — meaning this line is talking about an in-project
    // file, which is NOT containment — fall back to the path token
    // AFTER the marker on the same line (Python OSError, Node libuv).
    let offending = extractPathBefore(stderr, hit.index);
    let inProjectBefore = false;
    if (offending) {
      if (!isOutsideSandboxRoot(offending, sandboxRoot)) {
        inProjectBefore = true;
        offending = null;
      }
    }
    if (!offending) {
      const after = extractPathAfter(stderr, hit.index + hit.markerLen);
      if (after && isOutsideSandboxRoot(after, sandboxRoot)) {
        offending = after;
      }
    }
    if (!offending) {
      // Either nothing parseable, or the only path on the line was
      // in-project (legitimate user-owned permission/EROFS error).
      // Either way, this hit is not containment; move on.
      void inProjectBefore;
      continue;
    }
    if (hit.reason === "readonly") {
      // EROFS is a strong signal: nothing inside the project bind is
      // read-only, so EROFS against any path means the OS jail caught
      // a host-root write.
      return {
        reason: "readonly",
        path: offending,
        message:
          `Your command tried to write to "${offending}", which is outside the project. ` +
          `The sandbox blocked it because the project boundary is read-only.`,
      };
    }
    // EACCES: only treat it as containment when the path is plainly a
    // system path AND the same line clearly indicates a write attempt.
    // EACCES inside the user's own file tree is a normal permission
    // error; EACCES on a system path during a read/exec is also NOT a
    // sandbox event. Both must be discarded here.
    if (!isSystemPath(offending)) continue;
    if (!looksLikeWriteContext(lineOf(stderr, hit.index))) continue;
    return {
      reason: "permission",
      path: offending,
      message:
        `Your command tried to write to "${offending}", which is outside the project. ` +
        `The sandbox blocked it.`,
    };
  }
  return null;
}

/**
 * Build an environment object scrubbed down to the allowlist plus
 * sandbox-local HOME/TMPDIR overrides. Creates the sandbox subdirs on
 * first call so spawned commands see a real, writable HOME.
 */
export function buildSandboxEnv(cwd: string, extras: Record<string, string> = {}): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of ALLOWED_ENV_KEYS) {
    const v = process.env[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  const sandboxHome = path.join(cwd, ".workbench-sandbox", "home");
  const sandboxTmp = path.join(cwd, ".workbench-sandbox", "tmp");
  try { fs.mkdirSync(sandboxHome, { recursive: true }); } catch {}
  try { fs.mkdirSync(sandboxTmp, { recursive: true }); } catch {}
  out.HOME = sandboxHome;
  out.TMPDIR = sandboxTmp;
  out.TMP = sandboxTmp;
  out.TEMP = sandboxTmp;
  if (!out.TERM) out.TERM = "dumb";
  for (const [k, v] of Object.entries(extras)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Build the argv that wraps the user's `command` with the available
 * privilege-dropping and resource-limiting helpers. If an OS-level
 * sandbox helper (bwrap/firejail/nsjail) was detected at
 * module load it is prepended too, giving us a real kernel-enforced
 * filesystem jail. If none of the helpers exist the command runs
 * directly via `sh -c` and we rely on the path-validation layer.
 */
export function buildSandboxArgv(command: string, cwd: string, fsizeBytes?: number): string[] {
  const argv: string[] = [];
  if (OS_SANDBOX) {
    argv.push(...buildOsIsolationArgv(OS_SANDBOX, cwd));
  }
  if (SETPRIV_BIN) {
    argv.push(SETPRIV_BIN, "--no-new-privs");
  }
  if (PRLIMIT_BIN) {
    // Caller-supplied fsize tightens (never loosens) the default
    // 512 MiB single-file cap. Workbench routes thread per-user
    // remaining-quota in here so the kernel itself refuses writes
    // past the user's headroom — that's the "rejected before they
    // touch disk" semantics the sandbox cannot get from a userspace
    // pre-flight `du` walk alone.
    let fsize = PRLIMIT_FSIZE_BYTES;
    if (typeof fsizeBytes === "number" && Number.isFinite(fsizeBytes) && fsizeBytes >= 0) {
      fsize = Math.min(fsize, Math.floor(fsizeBytes));
    }
    argv.push(
      PRLIMIT_BIN,
      `--as=${PRLIMIT_AS_BYTES}`,
      `--cpu=${PRLIMIT_CPU_SEC}`,
      `--nproc=${PRLIMIT_NPROC}`,
      `--fsize=${fsize}`,
      `--nofile=${PRLIMIT_NOFILE}`,
    );
  }
  argv.push("sh", "-c", command);
  return argv;
}

/**
 * Run `command` inside the sandbox. Always returns a structured result
 * (never throws for command failures); only programmer errors (e.g. an
 * invalid cwd) propagate.
 */
export async function runSandboxed(command: string, opts: SandboxOptions): Promise<SandboxedResult> {
  if (typeof command !== "string" || command.length === 0) {
    return { stdout: "", stderr: "command is required", exitCode: 1 };
  }
  const cwd = path.resolve(opts.cwd);
  let st: fs.Stats;
  try {
    st = fs.statSync(cwd);
  } catch (err: any) {
    return { stdout: "", stderr: `sandbox cwd does not exist: ${cwd}`, exitCode: 1 };
  }
  if (!st.isDirectory()) {
    return { stdout: "", stderr: `sandbox cwd is not a directory: ${cwd}`, exitCode: 1 };
  }

  const containment = checkPathContainment(command, cwd);
  if (containment.blocked) {
    return {
      stdout: "",
      stderr: `Sandbox blocked: ${containment.reason}`,
      exitCode: 1,
      sandboxBlocked: containment.reason,
    };
  }

  const env = buildSandboxEnv(cwd, opts.extraEnv);
  const argv = buildSandboxArgv(command, cwd, opts.fsizeBytes);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = opts.maxBufferBytes ?? DEFAULT_MAX_BUFFER;

  return new Promise((resolve) => {
    execFile(
      argv[0],
      argv.slice(1),
      {
        cwd,
        env,
        timeout: timeoutMs,
        maxBuffer,
        encoding: "utf-8",
      },
      (err, stdout, stderr) => {
        const out = typeof stdout === "string" ? stdout : "";
        const errOut = typeof stderr === "string" ? stderr : "";
        // Inspect the merged stderr for OS-isolation signals — but
        // ONLY when the OS jail is actually active on this host.
        // On non-isolated hosts the same EROFS / EACCES messages can
        // come from legitimate causes (a real read-only mount, a
        // permission slip the user can fix), so attributing them to
        // "the sandbox blocked it" would be a lie. The post-spawn
        // check therefore gates on `OS_SANDBOX` being non-null. The
        // pre-spawn static check (`sandboxBlocked`) is unaffected.
        const merged = err ? (errOut || (err as Error).message || "") : errOut;
        const contained = OS_SANDBOX ? detectOsContainment(merged, cwd) : null;
        if (err) {
          // execFile sets `code` to the exit code if the child exited,
          // or "ETIMEDOUT"/"ENOENT"/etc. for spawn-level errors.
          const codeRaw = (err as NodeJS.ErrnoException).code;
          const exitCode = typeof codeRaw === "number" ? codeRaw : 1;
          const message = errOut || (err as Error).message || "command failed";
          resolve({
            stdout: out,
            stderr: message,
            exitCode,
            ...(contained ? { sandboxContained: contained } : {}),
          });
        } else {
          resolve({
            stdout: out,
            stderr: errOut,
            exitCode: 0,
            ...(contained ? { sandboxContained: contained } : {}),
          });
        }
      },
    );
  });
}

/** Exposed for tests: which OS sandbox helpers were detected. */
export const sandboxHelpers = {
  setpriv: SETPRIV_BIN,
  prlimit: PRLIMIT_BIN,
  /**
   * The kernel-level isolation helper detected at module load (or
   * `null` if none of bwrap/firejail/nsjail worked). When
   * non-null, `runSandboxed` prepends the appropriate wrapper to the
   * spawn argv so writes outside the per-project cwd hit a private
   * mount namespace (or fail with EROFS) instead of the host disk.
   */
  osIsolation: OS_SANDBOX,
};
