import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomBytes } from "node:crypto";

const {
  runSandboxed,
  checkPathContainment,
  extractRedirectTargets,
  buildSandboxEnv,
  sandboxHelpers,
} = await import("../src/lib/command-sandbox");

function mkSandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-sandbox-"));
  return dir;
}

// ---------------------------------------------------------------------
// extractRedirectTargets
// ---------------------------------------------------------------------

test("extractRedirectTargets pulls bare > and >> targets", () => {
  assert.deepEqual(extractRedirectTargets("echo hi > out.txt"), ["out.txt"]);
  assert.deepEqual(extractRedirectTargets("echo hi >> out.txt"), ["out.txt"]);
  assert.deepEqual(extractRedirectTargets("echo a; echo b > b.txt"), ["b.txt"]);
});

test("extractRedirectTargets handles quoted and absolute targets", () => {
  assert.deepEqual(extractRedirectTargets('echo hi > "/tmp/escape.txt"'), ["/tmp/escape.txt"]);
  assert.deepEqual(extractRedirectTargets("echo hi > '/tmp/escape.txt'"), ["/tmp/escape.txt"]);
  assert.deepEqual(extractRedirectTargets("cat foo >/etc/passwd"), ["/etc/passwd"]);
});

test("extractRedirectTargets handles &> and N> forms", () => {
  assert.deepEqual(extractRedirectTargets("cmd &> /tmp/log"), ["/tmp/log"]);
  assert.deepEqual(extractRedirectTargets("cmd 2> /tmp/err"), ["/tmp/err"]);
  assert.deepEqual(extractRedirectTargets("cmd 2>> /tmp/err"), ["/tmp/err"]);
  // 2>&1 is a dup, not a path target — should not be flagged.
  assert.deepEqual(extractRedirectTargets("cmd 2>&1"), []);
});

test("extractRedirectTargets recurses into $(...) and `...`", () => {
  assert.deepEqual(
    extractRedirectTargets("echo $(printf hi > /tmp/escape)"),
    ["/tmp/escape"],
  );
  assert.deepEqual(
    extractRedirectTargets("echo `printf hi > /tmp/escape`"),
    ["/tmp/escape"],
  );
  assert.deepEqual(
    extractRedirectTargets('echo "hi $(echo x > /tmp/inner)"'),
    ["/tmp/inner"],
  );
});

test("extractRedirectTargets ignores < input redirections", () => {
  assert.deepEqual(extractRedirectTargets("cat < /etc/passwd"), []);
  assert.deepEqual(extractRedirectTargets("cat 0< /etc/passwd"), []);
});

// ---------------------------------------------------------------------
// checkPathContainment
// ---------------------------------------------------------------------

test("checkPathContainment allows in-sandbox relative writes", () => {
  const root = mkSandbox();
  try {
    assert.equal(checkPathContainment("echo hi > out.txt", root).blocked, false);
    assert.equal(checkPathContainment("echo hi >> sub/dir/out.txt", root).blocked, false);
    assert.equal(checkPathContainment("echo hi > /dev/null", root).blocked, false);
    assert.equal(checkPathContainment("echo no redirects here", root).blocked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks absolute redirect targets outside sandbox", () => {
  const root = mkSandbox();
  try {
    const r1 = checkPathContainment("echo evil > /tmp/escape.txt", root);
    assert.equal(r1.blocked, true);
    assert.match(r1.reason || "", /escapes sandbox/);

    const r2 = checkPathContainment("echo evil >> /etc/passwd", root);
    assert.equal(r2.blocked, true);

    const r3 = checkPathContainment("cmd &> /var/log/wb.log", root);
    assert.equal(r3.blocked, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks parent-traversal escapes", () => {
  const root = mkSandbox();
  try {
    const r = checkPathContainment("echo evil > ../escape.txt", root);
    assert.equal(r.blocked, true);
    assert.match(r.reason || "", /escapes sandbox/);

    const r2 = checkPathContainment("echo evil > ../../../etc/passwd", root);
    assert.equal(r2.blocked, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks tilde and shell-expansion targets", () => {
  const root = mkSandbox();
  try {
    assert.equal(checkPathContainment("echo evil > ~/escape", root).blocked, true);
    assert.equal(checkPathContainment("echo evil > ~root/x", root).blocked, true);
    assert.equal(checkPathContainment("echo evil > $HOME/escape", root).blocked, true);
    assert.equal(checkPathContainment("echo evil > `echo /tmp/x`", root).blocked, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks redirects nested in command substitutions", () => {
  const root = mkSandbox();
  try {
    const r = checkPathContainment("echo $(printf evil > /tmp/escape)", root);
    assert.equal(r.blocked, true);
    assert.match(r.reason || "", /escapes sandbox/);

    const r2 = checkPathContainment('echo "$(echo x > /tmp/escape2)"', root);
    assert.equal(r2.blocked, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------
// buildSandboxEnv
// ---------------------------------------------------------------------

test("buildSandboxEnv strips secrets and pins HOME/TMPDIR into the sandbox", () => {
  const root = mkSandbox();
  // Inject a fake secret and a fake API key into the parent env to
  // prove the scrub is allowlist-based.
  const before = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SOME_DB_PASSWORD: process.env.SOME_DB_PASSWORD,
    REPLIT_DB_URL: process.env.REPLIT_DB_URL,
  };
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-secret";
  process.env.SOME_DB_PASSWORD = "p@ss";
  process.env.REPLIT_DB_URL = "postgres://test";
  try {
    const env = buildSandboxEnv(root);
    assert.equal(env.ANTHROPIC_API_KEY, undefined, "API keys must NOT flow into sandbox env");
    assert.equal(env.SOME_DB_PASSWORD, undefined);
    assert.equal(env.REPLIT_DB_URL, undefined);
    assert.equal(env.PATH, process.env.PATH, "PATH must flow through");
    assert.ok(env.HOME && env.HOME.startsWith(root), `HOME must be inside sandbox, got ${env.HOME}`);
    assert.ok(env.TMPDIR && env.TMPDIR.startsWith(root), `TMPDIR must be inside sandbox, got ${env.TMPDIR}`);
    assert.ok(fs.existsSync(env.HOME!), "sandbox HOME dir is created");
    assert.ok(fs.existsSync(env.TMPDIR!), "sandbox TMPDIR dir is created");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (before.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = before.ANTHROPIC_API_KEY;
    if (before.SOME_DB_PASSWORD === undefined) delete process.env.SOME_DB_PASSWORD;
    else process.env.SOME_DB_PASSWORD = before.SOME_DB_PASSWORD;
    if (before.REPLIT_DB_URL === undefined) delete process.env.REPLIT_DB_URL;
    else process.env.REPLIT_DB_URL = before.REPLIT_DB_URL;
  }
});

// ---------------------------------------------------------------------
// runSandboxed — end-to-end containment proof
// ---------------------------------------------------------------------

test("runSandboxed runs benign commands and returns stdout", async () => {
  const root = mkSandbox();
  try {
    const r = await runSandboxed("echo workbench-sandbox", { cwd: root });
    assert.equal(r.exitCode, 0, `stderr=${r.stderr}`);
    assert.match(r.stdout, /workbench-sandbox/);
    assert.equal(r.sandboxBlocked, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runSandboxed allows in-sandbox writes", async () => {
  const root = mkSandbox();
  try {
    const r = await runSandboxed("echo inside > inside.txt && cat inside.txt", { cwd: root });
    assert.equal(r.exitCode, 0, `stderr=${r.stderr}`);
    assert.match(r.stdout, /inside/);
    assert.ok(fs.existsSync(path.join(root, "inside.txt")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// THIS IS THE KEY ACCEPTANCE TEST.
//
// `echo evil > /tmp/<unique>.txt` would NOT be blocked by the existing
// safety filter (`checkShellSafety`) — it has no rm/mkfs/dd/fork-bomb
// signature and `>` redirection to absolute paths is not in the
// denylist. Without the sandbox the file would be created on the host
// filesystem. With the sandbox in place, `runSandboxed` rejects the
// command at the redirect-target validation stage and the file is
// never created.
test("runSandboxed contains an attempted write outside the sandbox even when the safety filter would have allowed it", async () => {
  // Sanity-check: the safety filter does NOT block this command, so
  // the only line of defence is the sandbox.
  const { checkShellSafety } = await import("../src/lib/command-safety");

  const root = mkSandbox();
  const escapeName = `wb-escape-${randomBytes(8).toString("hex")}.txt`;
  const escapePath = path.join(os.tmpdir(), escapeName);
  // Make absolutely sure no leftover file exists from a previous run.
  try { fs.unlinkSync(escapePath); } catch {}
  const command = `echo pwned > ${escapePath}`;
  try {
    const safety = checkShellSafety(command);
    assert.equal(safety.blocked, false, "premise: safety filter must NOT block this command");

    const r = await runSandboxed(command, { cwd: root });

    assert.equal(r.exitCode, 1);
    assert.ok(r.sandboxBlocked, `sandbox should mark the command as blocked, got ${JSON.stringify(r)}`);
    assert.match(r.stderr, /Sandbox blocked/, `stderr should explain the sandbox block, got ${r.stderr}`);
    assert.equal(
      fs.existsSync(escapePath),
      false,
      `file at ${escapePath} must NOT exist — sandbox failed to contain the write`,
    );
  } finally {
    try { fs.unlinkSync(escapePath); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runSandboxed contains parent-traversal redirect escapes", async () => {
  const root = mkSandbox();
  // Pre-create a file just outside the sandbox so we can prove it is
  // not modified by the attempted escape.
  const parent = path.dirname(root);
  const escapeName = `wb-escape-parent-${randomBytes(8).toString("hex")}.txt`;
  const escapePath = path.join(parent, escapeName);
  try { fs.unlinkSync(escapePath); } catch {}
  try {
    const r = await runSandboxed(`echo pwned > ../${escapeName}`, { cwd: root });
    assert.equal(r.exitCode, 1);
    assert.ok(r.sandboxBlocked);
    assert.equal(fs.existsSync(escapePath), false, `parent-traversal write to ${escapePath} must be contained`);
  } finally {
    try { fs.unlinkSync(escapePath); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runSandboxed strips secrets from the child env even for commands that try to leak them", async () => {
  const root = mkSandbox();
  const before = process.env.WB_SANDBOX_LEAK_TEST;
  process.env.WB_SANDBOX_LEAK_TEST = "leak-secret-value-do-not-ship";
  try {
    // `printenv WB_SANDBOX_LEAK_TEST` exits non-zero when the var is
    // unset, and prints nothing — exactly what we want to see.
    const r = await runSandboxed("printenv WB_SANDBOX_LEAK_TEST || echo MISSING", { cwd: root });
    assert.equal(r.exitCode, 0);
    assert.doesNotMatch(
      r.stdout,
      /leak-secret-value-do-not-ship/,
      "secret env vars must NOT leak into the sandboxed child",
    );
    assert.match(r.stdout, /MISSING/);
  } finally {
    if (before === undefined) delete process.env.WB_SANDBOX_LEAK_TEST;
    else process.env.WB_SANDBOX_LEAK_TEST = before;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runSandboxed reports the OS helpers it picked up (informational)", () => {
  // No assertion — just a smoke check so failures elsewhere are easier
  // to diagnose. On hosts where setpriv/prlimit are missing, the
  // sandbox still works (validation + cwd + env) but with weaker
  // process-scope guarantees.
  assert.ok(typeof sandboxHelpers === "object");
});

// ---------------------------------------------------------------------
// Argv-level write target containment (NOT just redirects)
// ---------------------------------------------------------------------

test("checkPathContainment blocks `touch` against absolute outside paths", () => {
  const root = mkSandbox();
  try {
    const r = checkPathContainment("touch /tmp/escape.txt", root);
    assert.equal(r.blocked, true);
    assert.match(r.reason || "", /escapes sandbox/);

    // Inside-sandbox touch is fine.
    assert.equal(checkPathContainment("touch inside.txt", root).blocked, false);
    assert.equal(checkPathContainment("touch sub/dir/inside.txt", root).blocked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks cp/mv/install/tee/mkdir/mkfifo/ln to outside paths", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      "cp foo /tmp/escape",
      "cp -r src/ /tmp/escape/",
      "cp -t /tmp/destdir foo bar",
      "mv foo /tmp/escape",
      "mv -t /etc foo",
      "install -m 644 foo /tmp/escape",
      "install -t /etc/cron.d foo",
      "tee /tmp/escape",
      "tee -a /etc/passwd",
      "mkdir /tmp/escape-dir",
      "mkdir -p /tmp/a/b/c",
      "mkfifo /tmp/myfifo",
      "ln -s /etc/passwd /tmp/escape-link",
      "ln foo /tmp/escape-hardlink",
      "rsync -a foo/ /tmp/escape/",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks chmod/chown/chgrp/truncate against outside files", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      "chmod 777 /etc/passwd",
      "chmod -R 700 /tmp/x",
      "chown root /etc/shadow",
      "chgrp wheel /etc/sudoers",
      "truncate -s 0 /var/log/auth.log",
      "truncate --size=0 /tmp/escape",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks dd/sed -i/awk -i/tar/unzip/wget/curl writes outside", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      "dd if=/dev/zero of=/tmp/escape bs=1M count=1",
      "sed -i 's/x/y/g' /etc/hosts",
      "sed --in-place 's/x/y/' /tmp/escape.txt",
      "awk -i inplace '{print}' /tmp/escape.txt",
      "tar -xf foo.tar -C /tmp/escape-dir",
      "tar -czf /tmp/out.tar.gz src/",
      "unzip foo.zip -d /tmp/escape-dir",
      "zip /tmp/out.zip src/",
      "wget -O /tmp/escape.html https://example.com",
      "wget --output-document=/etc/passwd https://example.com",
      "curl -o /tmp/escape https://example.com",
      "curl --output /etc/hosts https://example.com",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks ALL interpreter invocations (inline AND script)", () => {
  // Without OS-level isolation we cannot prove an interpreter script
  // won't write outside cwd via syscalls, so even bare invocations
  // like `python ./script.py` are blocked. Workbench is a freeform
  // shell — build/test runs belong in dedicated server-side pipelines.
  const root = mkSandbox();
  try {
    for (const cmd of [
      `python -c "open('/tmp/escape','w').write('x')"`,
      `python3 -c "import os; os.system('echo x > /tmp/escape')"`,
      `node -e "require('fs').writeFileSync('/tmp/escape','x')"`,
      `nodejs -e "..."`,
      `perl -e "open(F, '>', '/tmp/escape'); print F 'x';"`,
      `perl -i -pe 's/x/y/' /tmp/escape`,
      `ruby -e "File.write('/tmp/escape','x')"`,
      `php -r "file_put_contents('/tmp/escape','x');"`,
      `deno eval "Deno.writeTextFileSync('/tmp/escape','x')"`,
      // Bare script execution is ALSO blocked — the script's syscalls
      // are out of our reach.
      "python ./script.py",
      "python3 ./build.py",
      "node ./build.js",
      "ruby script.rb",
      "perl script.pl",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks `git -C` / `--git-dir=` / `--work-tree=` outside sandbox", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      "git -C /tmp init",
      "git -C /tmp/escape clone https://example.com/foo.git",
      "git --git-dir=/tmp/foo.git status",
      "git --git-dir /tmp/foo.git status",
      "git --work-tree=/tmp/escape checkout HEAD",
      "git --work-tree /tmp/escape checkout HEAD",
      "git -C /tmp -c color.ui=never status",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
    // In-sandbox git operations are still allowed.
    assert.equal(checkPathContainment("git status", root).blocked, false);
    assert.equal(checkPathContainment("git log --oneline", root).blocked, false);
    assert.equal(checkPathContainment("git -C ./subproject status", root).blocked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment uses symlink-safe path resolution (catches ln -s /tmp link + write via link/...)", () => {
  // The reviewer-supplied bypass: `ln -s /tmp link` (allowed because
  // both endpoints are inside the sandbox lexically) then
  // `echo x > link/pwned`. Without realpath we'd accept the redirect
  // because `link/pwned` lexically resolves inside the sandbox; the
  // shell would then follow the symlink and write to `/tmp/pwned`.
  const root = mkSandbox();
  try {
    // Pre-create the escape symlink the way an attacker would have
    // by running `ln -s /tmp link` in a previous step.
    fs.symlinkSync("/tmp", path.join(root, "link"));
    // Redirect via the symlinked dir.
    const r1 = checkPathContainment("echo pwned > link/pwned", root);
    assert.equal(r1.blocked, true, `expected to block redirect via symlink, reason=${r1.reason}`);
    assert.match(String(r1.reason), /symlink|escape/);
    // Argv-level write via the symlinked dir.
    const r2 = checkPathContainment("touch link/pwned2", root);
    assert.equal(r2.blocked, true, `expected to block touch via symlink, reason=${r2.reason}`);
    // Even nested deeper.
    const r3 = checkPathContainment("cp src.txt link/sub/pwned", root);
    assert.equal(r3.blocked, true, `expected to block cp via symlink, reason=${r3.reason}`);
    // Non-symlinked sibling stays allowed.
    fs.mkdirSync(path.join(root, "real"), { recursive: true });
    const ok = checkPathContainment("touch real/file", root);
    assert.equal(ok.blocked, false, `real/file should be allowed, reason=${ok.reason}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks ln -s creating an escape symlink in the first place", () => {
  // Treat the symlink TARGET as a write target so attackers can't
  // even plant the escape link.
  const root = mkSandbox();
  try {
    for (const cmd of [
      "ln -s /tmp link",
      "ln -s /etc/passwd evil",
      "ln -s ../../../tmp link",
      "ln -sf /tmp ./link",
      // hardlinks to outside files are equally dangerous
      "ln /etc/passwd link",
      "ln -t ./dir /tmp/foo /tmp/bar",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
    // In-sandbox links stay allowed.
    assert.equal(checkPathContainment("ln -s ./real ./alias", root).blocked, false);
    assert.equal(checkPathContainment("ln ./real ./hard", root).blocked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment recurses into resource wrappers (timeout/nice/nohup/setsid/stdbuf/command/chrt)", () => {
  const root = mkSandbox();
  try {
    // Inner command escapes → still blocked.
    for (const cmd of [
      "timeout 5s touch /tmp/escape",
      "timeout -k 1s 5s rm -rf /etc",
      "nice -n 19 cp src /tmp/escape",
      "nice -19 touch /tmp/escape",
      "nohup touch /tmp/escape",
      "setsid touch /tmp/escape",
      "stdbuf -o0 touch /tmp/escape",
      "command touch /tmp/escape",
      "ionice -c 3 touch /tmp/escape",
      "taskset 0x1 touch /tmp/escape",
      "chrt -r 50 touch /tmp/escape",
      // wrapped python should still be blocked (interpreter)
      "timeout 5s python -c 'open(\"/tmp/escape\",\"w\").write(\"x\")'",
      // wrapped sudo should still be blocked
      "nohup sudo touch /tmp/escape",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
    // Wrapper around a benign command stays allowed.
    assert.equal(checkPathContainment("timeout 5s ls", root).blocked, false);
    assert.equal(checkPathContainment("nice -n 10 cat README.md", root).blocked, false);
    assert.equal(checkPathContainment("nohup tail -n 1 README.md", root).blocked, false);
    assert.equal(checkPathContainment("stdbuf -o0 grep foo README.md", root).blocked, false);
    // `time -o FILE cmd` is blocked because `time` writes to FILE.
    assert.equal(checkPathContainment("time -o /tmp/log ls", root).blocked, true);
    assert.equal(checkPathContainment("time --output=/tmp/log ls", root).blocked, true);
    assert.equal(checkPathContainment("time -a -o ./log ls", root).blocked, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks awk / gawk / mawk (system() shell-out)", () => {
  // The reviewer-supplied bypass: `awk 'BEGIN{system("touch /tmp/x")}'`
  // evades argv heuristics because the path lives inside an awk
  // string. Block awk entirely.
  const root = mkSandbox();
  try {
    for (const cmd of [
      `awk 'BEGIN{system("touch /tmp/escape")}'`,
      `gawk 'BEGIN{system("rm -rf /etc")}'`,
      `mawk 'BEGIN{print "hi"}'`,
      `awk -f script.awk data.csv`,
      `awk '/foo/{print > "/tmp/escape"}' input`,
      // gnuplot also has system()
      `gnuplot -e "system('touch /tmp/escape')"`,
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks find -exec / -execdir / -delete / -fprint", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      `find . -name '*.txt' -exec rm {} \\;`,
      `find . -name '*.txt' -execdir rm {} \\;`,
      `find / -name foo -ok rm {} \\;`,
      `find . -okdir touch evil`,
      `find . -delete`,
      `find . -name foo -fprint /tmp/escape`,
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
    // Read-only find usage stays allowed.
    assert.equal(checkPathContainment("find . -name '*.ts'", root).blocked, false);
    assert.equal(checkPathContainment("find . -type f -newer ./foo", root).blocked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks wrapper / privilege / remote tools", () => {
  // sudo, xargs, env, timeout, ssh, docker, etc. all run another
  // command. Statically validating the inner command is
  // equivalent to validating top-level argv, which we'd then need
  // to do recursively. Refuse outright.
  const root = mkSandbox();
  try {
    for (const cmd of [
      "sudo touch /etc/escape",
      "doas rm -rf /",
      "su root -c 'touch /tmp/escape'",
      "xargs -I {} sh -c 'touch /tmp/escape' < /dev/null",
      "find . -name foo | xargs rm",
      "env PATH=/tmp/evil:$PATH ls",
      "timeout 5s touch /tmp/escape",
      "nice -n 19 touch /tmp/escape",
      "ssh user@host 'touch /tmp/escape'",
      "docker run --rm alpine touch /tmp/escape",
      "kubectl exec pod -- rm -rf /",
      "unshare -m touch /tmp/escape",
      "chroot /tmp/evil /bin/sh",
      "watch -n1 touch /tmp/escape",
      "parallel touch ::: /tmp/a /tmp/b",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks editors / pagers with shell escape", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      "vim file.txt",
      `vim -c '!touch /tmp/escape' -c 'q'`,
      "nvim README.md",
      "less /etc/passwd",
      "more /etc/hosts",
      "man bash",
      "emacs file.txt",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks build / task runners (make / npm / cargo / go)", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      "make all",
      "make -C /tmp/evil install",
      "cmake --build .",
      "ninja",
      "npm install",
      "npm run build",
      "pnpm build",
      "yarn install",
      "cargo build",
      "cargo run --bin foo",
      "go run main.go",
      "go build ./...",
      "rake test",
      "gradle assemble",
      "mvn package",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks sed 'e' (execute) and 'w' (write-to-file) commands", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      `sed -e 's/foo/bar/e' input.txt`,
      `sed 's|foo|bar|e' input.txt`,
      `sed -e 'w /tmp/escape' input.txt`,
      `sed -e 'W /tmp/escape' input.txt`,
      `sed -f script.sed input.txt`,
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
    // Plain in-place sed is still caught by the existing -i argv-write
    // path (covered elsewhere). Read-only sed is allowed.
    assert.equal(checkPathContainment("sed 's/foo/bar/' input.txt", root).blocked, false);
    assert.equal(checkPathContainment("sed -n '1,5p' input.txt", root).blocked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment blocks git subcommand-specific output flags outside sandbox", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      "git clone https://example.com/foo.git /tmp/escape",
      "git init /tmp/escape",
      "git worktree add /tmp/escape feature/x",
      "git bundle create /tmp/escape.bundle HEAD",
      "git format-patch -o /tmp/escape HEAD~3..HEAD",
      "git format-patch --output-directory=/tmp/escape HEAD~3..HEAD",
      "git archive -o /tmp/escape.tar HEAD",
      "git archive --output=/tmp/escape.tar HEAD",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
    }
    // In-sandbox versions are allowed.
    assert.equal(checkPathContainment("git clone https://example.com/foo.git ./foo", root).blocked, false);
    assert.equal(checkPathContainment("git init ./newproj", root).blocked, false);
    assert.equal(checkPathContainment("git format-patch -o ./patches HEAD~3..HEAD", root).blocked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment refuses cwd-mutating builtins (cd / pushd / popd)", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      "cd /tmp && touch x",
      "cd /tmp; echo pwned > y",
      "pushd /tmp && touch z",
      "popd && rm a",
      "(cd /tmp && touch sub)",
      "{ cd /tmp; touch x; }",
      "touch a; cd /tmp; touch b",
      `bash -c "cd /tmp && touch x"`,
      "cd ../../..",
      "cd",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, true, `expected to block: ${cmd}, reason=${r.reason}`);
      assert.match(r.reason || "", /cd|pushd|popd|chdir/i, `reason should mention cd-style builtin: ${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment recurses into bash -c / sh -c inline code", () => {
  const root = mkSandbox();
  try {
    assert.equal(checkPathContainment(`bash -c "touch /tmp/escape"`, root).blocked, true);
    assert.equal(checkPathContainment(`sh -c 'cp foo /tmp/escape'`, root).blocked, true);
    assert.equal(checkPathContainment(`bash -c "echo hi > /tmp/escape"`, root).blocked, true);
    // Inner code that is in-sandbox is allowed.
    assert.equal(checkPathContainment(`bash -c "touch inside.txt"`, root).blocked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkPathContainment allows benign read-only commands", () => {
  const root = mkSandbox();
  try {
    for (const cmd of [
      "ls /etc",
      "cat /etc/hostname",
      "stat /tmp",
      "which python",
      "echo hello world",
      "head -n 5 /etc/hosts",
      "file /bin/ls",
      "wc -l README.md",
      "grep foo /etc/passwd",
      "find . -name '*.ts'",
      "git status",
      "git log --oneline",
    ]) {
      const r = checkPathContainment(cmd, root);
      assert.equal(r.blocked, false, `expected to allow: ${cmd}, reason=${r.reason}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// THE EXPANDED ACCEPTANCE TEST: prove that for every common write
// primitive that the parser-based safety filter (`checkShellSafety`)
// happily admits, the sandbox actually prevents the file from being
// created on the host filesystem.
test("runSandboxed contains argv-level write escapes the safety filter would have allowed", async () => {
  const { checkShellSafety } = await import("../src/lib/command-safety");
  const root = mkSandbox();
  const tag = randomBytes(6).toString("hex");
  const escapes: { name: string; cmd: string; checkPaths: string[] }[] = [
    {
      name: "touch absolute",
      cmd: `touch /tmp/wb-touch-${tag}`,
      checkPaths: [`/tmp/wb-touch-${tag}`],
    },
    {
      name: "tee absolute",
      cmd: `echo evil | tee /tmp/wb-tee-${tag}`,
      checkPaths: [`/tmp/wb-tee-${tag}`],
    },
    {
      name: "mkdir absolute",
      cmd: `mkdir -p /tmp/wb-mkdir-${tag}`,
      checkPaths: [`/tmp/wb-mkdir-${tag}`],
    },
    {
      name: "cp to absolute",
      cmd: `cp /etc/hostname /tmp/wb-cp-${tag}`,
      checkPaths: [`/tmp/wb-cp-${tag}`],
    },
    {
      name: "python -c writes absolute",
      cmd: `python3 -c "open('/tmp/wb-py-${tag}','w').write('pwned')"`,
      checkPaths: [`/tmp/wb-py-${tag}`],
    },
    {
      name: "node -e writes absolute",
      cmd: `node -e "require('fs').writeFileSync('/tmp/wb-node-${tag}','pwned')"`,
      checkPaths: [`/tmp/wb-node-${tag}`],
    },
    {
      name: "bash -c hides touch",
      cmd: `bash -c "touch /tmp/wb-bashc-${tag}"`,
      checkPaths: [`/tmp/wb-bashc-${tag}`],
    },
    {
      name: "git -C absolute path",
      cmd: `git -C /tmp/wb-git-${tag} init`,
      checkPaths: [`/tmp/wb-git-${tag}`, `/tmp/wb-git-${tag}/.git`],
    },
    {
      name: "git init absolute path",
      cmd: `git init /tmp/wb-gitinit-${tag}`,
      checkPaths: [`/tmp/wb-gitinit-${tag}`, `/tmp/wb-gitinit-${tag}/.git`],
    },
    {
      // Reviewer-supplied bypass: argv-target heuristics can't see
      // the path because it's inside an awk string. Sandbox MUST still
      // refuse to spawn awk.
      name: "awk system() shell-out",
      cmd: `awk 'BEGIN{system("touch /tmp/wb-awk-${tag}")}'`,
      checkPaths: [`/tmp/wb-awk-${tag}`],
    },
    {
      name: "find -exec touch absolute path",
      cmd: `find . -maxdepth 1 -name . -exec touch /tmp/wb-find-${tag} \\;`,
      checkPaths: [`/tmp/wb-find-${tag}`],
    },
    {
      name: "xargs touch absolute path",
      cmd: `echo /tmp/wb-xargs-${tag} | xargs touch`,
      checkPaths: [`/tmp/wb-xargs-${tag}`],
    },
    {
      name: "sudo touch absolute path",
      cmd: `sudo touch /tmp/wb-sudo-${tag}`,
      checkPaths: [`/tmp/wb-sudo-${tag}`],
    },
    {
      name: "env wrapper touch absolute path",
      cmd: `env touch /tmp/wb-env-${tag}`,
      checkPaths: [`/tmp/wb-env-${tag}`],
    },
    {
      name: "timeout wrapper touch absolute path",
      cmd: `timeout 5 touch /tmp/wb-timeout-${tag}`,
      checkPaths: [`/tmp/wb-timeout-${tag}`],
    },
    {
      // Reviewer-supplied bypass: cwd mutation lets a relative target
      // land in /tmp at runtime even though it appears in-sandbox to
      // static analysis.
      name: "cd then touch relative",
      cmd: `cd /tmp && touch wb-cd-${tag}`,
      checkPaths: [`/tmp/wb-cd-${tag}`],
    },
    {
      name: "cd then redirect relative",
      cmd: `cd /tmp && echo pwned > wb-cdredir-${tag}`,
      checkPaths: [`/tmp/wb-cdredir-${tag}`],
    },
    {
      name: "pushd then touch relative",
      cmd: `pushd /tmp && touch wb-pushd-${tag}`,
      checkPaths: [`/tmp/wb-pushd-${tag}`],
    },
    {
      name: "subshell cd then touch relative",
      cmd: `(cd /tmp && touch wb-subshell-${tag})`,
      checkPaths: [`/tmp/wb-subshell-${tag}`],
    },
    {
      name: "brace group cd then touch relative",
      cmd: `{ cd /tmp; touch wb-brace-${tag}; }`,
      checkPaths: [`/tmp/wb-brace-${tag}`],
    },
    {
      name: "bash -c cd then touch",
      cmd: `bash -c "cd /tmp && touch wb-bashcd-${tag}"`,
      checkPaths: [`/tmp/wb-bashcd-${tag}`],
    },
  ];
  // Pre-clean any leftover sentinels.
  for (const e of escapes) for (const p of e.checkPaths) { try { fs.unlinkSync(p); } catch {} try { fs.rmdirSync(p); } catch {} }
  try {
    for (const e of escapes) {
      const safety = checkShellSafety(e.cmd);
      assert.equal(safety.blocked, false, `premise: safety filter must NOT block: ${e.name} (${e.cmd})`);

      const r = await runSandboxed(e.cmd, { cwd: root });
      assert.equal(r.exitCode, 1, `${e.name}: expected exitCode 1, got ${r.exitCode}, stderr=${r.stderr}`);
      assert.ok(r.sandboxBlocked, `${e.name}: sandbox should mark blocked, got ${JSON.stringify(r)}`);
      assert.match(r.stderr, /Sandbox blocked/, `${e.name}: stderr should explain block, got ${r.stderr}`);

      for (const p of e.checkPaths) {
        assert.equal(
          fs.existsSync(p),
          false,
          `${e.name}: file at ${p} must NOT exist — sandbox failed to contain the write`,
        );
      }
    }
  } finally {
    for (const e of escapes) for (const p of e.checkPaths) { try { fs.unlinkSync(p); } catch {} try { fs.rmdirSync(p); } catch {} }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runSandboxed allows in-sandbox argv-level writes", async () => {
  const root = mkSandbox();
  try {
    const r = await runSandboxed("touch inside.txt && mkdir -p sub && cp inside.txt sub/copy.txt", { cwd: root });
    assert.equal(r.exitCode, 0, `stderr=${r.stderr}`);
    assert.ok(fs.existsSync(path.join(root, "inside.txt")));
    assert.ok(fs.existsSync(path.join(root, "sub", "copy.txt")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
