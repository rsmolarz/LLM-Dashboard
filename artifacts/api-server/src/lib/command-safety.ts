/**
 * Defensive command-safety utilities for the Workbench `/api/shell` and
 * `/api/git` routes (and `execCommand` in project-context.ts).
 *
 * The previous implementation used `String#includes` against literal
 * patterns like `"rm -rf /"`. That filter was trivially bypassed by extra
 * whitespace (`rm  -rf /`), partial quoting (`r''m -rf /`), or absolute
 * paths (`/bin/rm -rf /`).
 *
 * This module replaces the substring match with a small shell tokenizer
 * that:
 *
 *   - Strips quoting (`'..'`, `".."`) and joins adjacent quoted segments
 *     so `r''m`, `'rm'`, `"rm"` all collapse to the token `rm`.
 *   - Splits the input into separate "candidate commands" on shell
 *     operators (`;`, `&&`, `||`, `|`, `&`, newlines, `(`/`)`, `{`/`}`)
 *     and recursively walks command substitutions (`$(...)`, backticks)
 *     so `$(rm -rf /)` is checked just like `rm -rf /`.
 *   - For each argv, strips leading `VAR=value` env assignments, takes
 *     the basename of the executable so `/bin/rm` → `rm`, then matches
 *     against a small list of dangerous binaries/flag combinations.
 *
 * It is not a full POSIX-compliant shell parser; it is a defensive
 * over-extractor designed to fail closed on anything that can't be
 * cleanly parsed. The goal is to make bypass meaningfully harder, not to
 * be a perfect sandbox — for true isolation the caller should also
 * restrict working dir / drop privileges (tracked separately).
 */

export interface SafetyResult {
  blocked: boolean;
  reason?: string;
}

const BLOCKED_BINARIES = new Set<string>([
  "mkfs",
  "dd",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "init",
  "telinit",
]);

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * True iff EVERY extracted top-level command in the input is a `git`
 * invocation. This stays consistent with `checkGitSafety`'s argv
 * detection (quoting / absolute path / env-prefix tolerant) AND
 * intentionally rejects chained payloads like
 *   git status; some-other-cmd
 * which the previous `command.startsWith("git ")` substring check
 * happily admitted, leaving the rest of the chain to whatever shell
 * was downstream.
 *
 * Returns false if the parser yields no commands or any extracted
 * command's executable basename is not `git`.
 */
export function isGitCommand(input: string): boolean {
  if (typeof input !== "string") return false;
  let argvs: string[][];
  try {
    argvs = extractCommands(input);
  } catch {
    return false;
  }
  if (argvs.length === 0) return false;
  for (const raw of argvs) {
    const argv = stripEnvAssignments(raw);
    if (argv.length === 0) continue; // empty groups don't disqualify
    if (basename(argv[0]) !== "git") return false;
  }
  // Require at least one non-empty argv that is git.
  return argvs.some(raw => {
    const argv = stripEnvAssignments(raw);
    return argv.length > 0 && basename(argv[0]) === "git";
  });
}

function isRootLikePath(p: string): boolean {
  if (!p) return false;
  // Filesystem root and direct variants.
  if (p === "/" || p === "/*" || p === "/." || p === "/..") return true;
  // User home shorthand. We only block the bare home, not subpaths inside
  // it; recursive deletes inside ~ may be legitimate (e.g. project dirs).
  if (p === "~" || p === "~/" || p === "~/*") return true;
  if (p === "$HOME" || p === "${HOME}" || p === "$HOME/" || p === "$HOME/*") return true;
  // Top-level system directories themselves (with optional trailing
  // slash, glob, or `/.`). Subpaths like `/tmp/myproj/build` are
  // intentionally NOT blocked so legitimate cleanups still work.
  if (/^\/(home|etc|var|usr|bin|sbin|boot|opt|root|lib|lib64|dev|proc|sys|tmp|run)(\/?\*?|\/\.)$/.test(p)) {
    return true;
  }
  return false;
}

function stripEnvAssignments(argv: string[]): string[] {
  let i = 0;
  while (i < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i])) i++;
  return argv.slice(i);
}

/**
 * Tokenize a shell-ish command string into one or more argv arrays.
 *
 * Recursive: commands found inside `$(...)` and backticks are appended as
 * additional argvs so they are screened too.
 */
export function extractCommands(input: string): string[][] {
  const cmds: string[][] = [];
  let cur: string[] = [];
  let word = "";
  let wordHasContent = false;

  function pushWord(): void {
    if (wordHasContent) cur.push(word);
    word = "";
    wordHasContent = false;
  }
  function pushCmd(): void {
    pushWord();
    if (cur.length > 0) cmds.push(cur);
    cur = [];
  }

  let i = 0;
  const N = input.length;

  while (i < N) {
    const c = input[i];

    // Whitespace separates words within a command.
    if (c === " " || c === "\t") { pushWord(); i++; continue; }
    if (c === "\n" || c === "\r") { pushCmd(); i++; continue; }

    // Single-quoted string: literal contents, no escapes.
    if (c === "'") {
      i++;
      let lit = "";
      while (i < N && input[i] !== "'") { lit += input[i]; i++; }
      if (i < N) i++; // consume closing '
      word += lit;
      wordHasContent = true;
      continue;
    }

    // Double-quoted string: handles \\, \", \$, \`; recursively walks
    // $(...) and backtick substitutions inside.
    if (c === '"') {
      i++;
      let lit = "";
      while (i < N && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < N) {
          const nx = input[i + 1];
          if (nx === '"' || nx === "\\" || nx === "$" || nx === "`") {
            lit += nx; i += 2; continue;
          }
          lit += input[i]; i++; continue;
        }
        if (input[i] === "$" && input[i + 1] === "(") {
          i += 2;
          let depth = 1;
          let inner = "";
          while (i < N && depth > 0) {
            if (input[i] === "(") { depth++; inner += input[i]; i++; continue; }
            if (input[i] === ")") { depth--; if (depth === 0) break; inner += input[i]; i++; continue; }
            inner += input[i]; i++;
          }
          if (i < N) i++; // closing )
          for (const sub of extractCommands(inner)) cmds.push(sub);
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
          for (const sub of extractCommands(inner)) cmds.push(sub);
          continue;
        }
        lit += input[i]; i++;
      }
      if (i < N) i++; // closing "
      word += lit;
      wordHasContent = true;
      continue;
    }

    // Backtick command substitution.
    if (c === "`") {
      pushWord();
      i++;
      let inner = "";
      while (i < N && input[i] !== "`") {
        if (input[i] === "\\" && i + 1 < N) { inner += input[i + 1]; i += 2; continue; }
        inner += input[i]; i++;
      }
      if (i < N) i++;
      for (const sub of extractCommands(inner)) cmds.push(sub);
      continue;
    }

    // $(...) command substitution outside quotes.
    if (c === "$" && input[i + 1] === "(") {
      pushWord();
      i += 2;
      let depth = 1;
      let inner = "";
      while (i < N && depth > 0) {
        if (input[i] === "(") { depth++; inner += input[i]; i++; continue; }
        if (input[i] === ")") { depth--; if (depth === 0) break; inner += input[i]; i++; continue; }
        inner += input[i]; i++;
      }
      if (i < N) i++;
      for (const sub of extractCommands(inner)) cmds.push(sub);
      continue;
    }

    // Backslash escape outside quotes.
    if (c === "\\") {
      if (i + 1 < N) {
        if (input[i + 1] === "\n") { i += 2; continue; }
        word += input[i + 1];
        wordHasContent = true;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Operators that separate commands.
    if (c === ";") { pushCmd(); i++; continue; }
    if (c === "|") { pushCmd(); i++; if (input[i] === "|") i++; continue; }
    if (c === "&") { pushCmd(); i++; if (input[i] === "&") i++; continue; }
    if (c === "(" || c === ")" || c === "{" || c === "}") { pushCmd(); i++; continue; }

    // Redirections — skip the operator and the target token.
    if (c === ">" || c === "<") {
      pushWord();
      i++;
      if (input[i] === c) i++;
      if (input[i] === "&") i++;
      while (i < N && (input[i] === " " || input[i] === "\t")) i++;
      while (i < N && !/[\s;|&()<>{}]/.test(input[i])) i++;
      continue;
    }

    word += c;
    wordHasContent = true;
    i++;
  }
  pushCmd();
  return cmds;
}

/**
 * Decide whether a command string is unsafe to run via the Workbench
 * shell. Returns `{blocked: true, reason}` if so, otherwise `{blocked:
 * false}`. Failing closed on parser errors is intentional.
 */
export function checkShellSafety(input: string): SafetyResult {
  if (typeof input !== "string") {
    return { blocked: true, reason: "command is not a string" };
  }

  // Fork-bomb signature check, tolerant to whitespace. The classic form is
  // `:(){ :|:& };:`; any benign command containing `:|:&` is vanishingly
  // unlikely so this is a safe regex tripwire.
  const compact = input.replace(/\s+/g, "");
  if (/:\(\)\{.*:\|:.*\}/.test(compact) || /:\|:&/.test(compact)) {
    return { blocked: true, reason: "fork bomb pattern" };
  }

  // Belt-and-suspenders: a tiny set of literal patterns that have no
  // legitimate use in a Workbench shell command. The parser-based checks
  // below are the primary defense.
  const lower = input.toLowerCase();
  if (lower.includes("fork bomb")) {
    return { blocked: true, reason: "fork bomb pattern" };
  }

  let argvs: string[][];
  try {
    argvs = extractCommands(input);
  } catch {
    return { blocked: true, reason: "could not safely parse command" };
  }

  for (const raw of argvs) {
    const argv = stripEnvAssignments(raw);
    if (argv.length === 0) continue;
    const exe = argv[0];
    const name = basename(exe);

    if (BLOCKED_BINARIES.has(name) || name.startsWith("mkfs.")) {
      return { blocked: true, reason: `${name} is not allowed` };
    }

    if (name === "rm") {
      let recursive = false;
      let noPreserveRoot = false;
      let endOfFlags = false;
      const targets: string[] = [];
      for (const a of argv.slice(1)) {
        if (endOfFlags) { targets.push(a); continue; }
        if (a === "--") { endOfFlags = true; continue; }
        if (a === "--recursive") { recursive = true; continue; }
        if (a === "--no-preserve-root") { noPreserveRoot = true; continue; }
        if (a.startsWith("--")) continue;
        if (a.startsWith("-") && a.length > 1) {
          for (const ch of a.slice(1)) {
            if (ch === "r" || ch === "R") recursive = true;
          }
          continue;
        }
        targets.push(a);
      }
      if (noPreserveRoot) {
        return { blocked: true, reason: "rm --no-preserve-root is not allowed" };
      }
      if (recursive) {
        for (const t of targets) {
          if (isRootLikePath(t)) {
            return { blocked: true, reason: `recursive rm against system path "${t}" is not allowed` };
          }
        }
      }
    }
  }

  return { blocked: false };
}

/**
 * Decide whether a `git ...` command is unsafe. Mirrors the spirit of
 * the legacy substring blocklist (force pushes, `reset --hard`, `clean
 * -fd`) but parses argv so whitespace/quoting variants and `git -C dir
 * <subcmd>` invocations are also caught.
 */
export function checkGitSafety(input: string): SafetyResult {
  if (typeof input !== "string") {
    return { blocked: true, reason: "command is not a string" };
  }

  let argvs: string[][];
  try {
    argvs = extractCommands(input);
  } catch {
    return { blocked: true, reason: "could not safely parse command" };
  }

  for (const raw of argvs) {
    const argv = stripEnvAssignments(raw);
    if (argv.length === 0) continue;
    const exe = argv[0];
    if (basename(exe) !== "git") continue;

    // Skip git's global options to find the subcommand.
    let i = 1;
    while (i < argv.length) {
      const a = argv[i];
      if (a === "--") { i++; break; }
      if (a === "-C" || a === "-c") { i += 2; continue; }
      // Long options that take a separate value:
      if (a === "--git-dir" || a === "--work-tree" || a === "--namespace" || a === "--super-prefix") {
        i += 2; continue;
      }
      if (a.startsWith("-")) { i++; continue; }
      break;
    }
    if (i >= argv.length) continue;

    const sub = argv[i];
    const rest = argv.slice(i + 1);

    if (sub === "push") {
      for (const a of rest) {
        if (a === "--") break;
        if (a === "--force") {
          return { blocked: true, reason: "git push --force is not allowed" };
        }
        // Combined short flags like -f, -fu, -uf — block only when -f is
        // present, never when --force-with-lease (commonly used as the
        // safer alternative) is requested.
        if (/^-[A-Za-z]+$/.test(a) && a.includes("f")) {
          return { blocked: true, reason: "git push -f is not allowed" };
        }
      }
    } else if (sub === "reset") {
      for (const a of rest) {
        if (a === "--hard") {
          return { blocked: true, reason: "git reset --hard is not allowed" };
        }
      }
    } else if (sub === "clean") {
      let force = false;
      let dirOrX = false;
      for (const a of rest) {
        if (a === "--force") { force = true; continue; }
        if (a === "--directories" || a === "-d") { dirOrX = true; continue; }
        if (a === "-x" || a === "-X") { dirOrX = true; continue; }
        if (/^-[A-Za-z]+$/.test(a)) {
          for (const ch of a.slice(1)) {
            if (ch === "f") force = true;
            if (ch === "d" || ch === "x" || ch === "X") dirOrX = true;
          }
        }
      }
      if (force && dirOrX) {
        return { blocked: true, reason: "git clean -fd is not allowed" };
      }
    }
  }

  return { blocked: false };
}
