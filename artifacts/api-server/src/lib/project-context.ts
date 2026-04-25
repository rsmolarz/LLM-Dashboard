import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Client, type ConnectConfig } from "ssh2";
import { execFile } from "child_process";

export type ProjectOrigin = "local" | "vps" | "replit";

export interface ProjectDescriptor {
  origin: ProjectOrigin;
  path: string;
  name?: string;
  url?: string;
  ssh?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string;
  };
}

export interface ResolvedProject {
  descriptor: ProjectDescriptor;
  origin: ProjectOrigin;
  localPath: string | null;
  cloned: boolean;
  remotePath: string | null;
  ssh?: ConnectConfig;
}

const PROJECT_ROOT = process.env.NODE_ENV === "production"
  ? process.cwd()
  : path.resolve(process.cwd(), "../..");

const REPLIT_CLONE_CACHE = path.resolve(PROJECT_ROOT, ".cache/replit-clones");

function ensureCloneCacheDir() {
  try {
    fs.mkdirSync(REPLIT_CLONE_CACHE, { recursive: true });
  } catch {}
}

function safeLocalPath(p: string): string {
  const resolved = path.resolve(PROJECT_ROOT, p);
  const rel = path.relative(PROJECT_ROOT, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path traversal blocked: " + p);
  }
  return resolved;
}

function safeReplitClonePath(p: string, cloneDir: string): string {
  const resolved = path.resolve(cloneDir, p);
  const rel = path.relative(cloneDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path traversal blocked: " + p);
  }
  return resolved;
}

function safeRemoteSubPath(sub: string): string {
  const s = (sub || ".").trim();
  if (s === "" || s === ".") return ".";
  if (s.startsWith("/")) throw new Error("Absolute path not allowed: " + sub);
  const segs = s.split(/[\\/]+/);
  for (const seg of segs) {
    if (seg === ".." || seg === "") throw new Error("Path traversal blocked: " + sub);
  }
  return segs.join("/");
}

function joinRemote(remoteRoot: string, sub: string): string {
  const safe = safeRemoteSubPath(sub);
  if (safe === ".") return remoteRoot.replace(/\/$/, "");
  return `${remoteRoot.replace(/\/$/, "")}/${safe}`;
}

function getEnvSshConfig(): ConnectConfig {
  return {
    host: process.env.SSH_HOST || "",
    port: parseInt(process.env.SSH_PORT || "22", 10),
    username: process.env.SSH_USERNAME || "",
    password: process.env.SSH_PASSWORD || undefined,
    privateKey: process.env.SSH_PRIVATE_KEY || undefined,
    readyTimeout: 10000,
  };
}

function mergeSshConfig(descriptor: ProjectDescriptor): ConnectConfig {
  const env = getEnvSshConfig();
  const fromDesc = descriptor.ssh || {};
  return {
    host: fromDesc.host || env.host,
    port: fromDesc.port || env.port,
    username: fromDesc.username || env.username,
    password: fromDesc.password || env.password,
    privateKey: fromDesc.privateKey || env.privateKey,
    readyTimeout: 10000,
  };
}

function gitCloneUrl(descriptor: ProjectDescriptor): string {
  if (descriptor.url && descriptor.url.includes("replit.com/@")) {
    const m = descriptor.url.match(/replit\.com\/@([^/]+)\/([^/?#]+)/);
    if (m) {
      return `https://github.com/${m[1]}/${m[2]}.git`;
    }
  }
  if (descriptor.path && /^[\w-]+\/[\w.-]+$/.test(descriptor.path)) {
    return `https://github.com/${descriptor.path}.git`;
  }
  if (descriptor.url && (descriptor.url.endsWith(".git") || /github\.com|gitlab\.com|bitbucket\.org/.test(descriptor.url))) {
    return descriptor.url;
  }
  if (descriptor.url && descriptor.url.startsWith("http")) {
    return descriptor.url;
  }
  throw new Error("Cannot determine git clone URL for descriptor");
}

function cloneCacheDir(descriptor: ProjectDescriptor): string {
  const repo = descriptor.path.replace(/[^\w.-]+/g, "_");
  return path.join(REPLIT_CLONE_CACHE, repo);
}

export async function ensureCloned(descriptor: ProjectDescriptor): Promise<{ localPath: string; cloned: boolean }> {
  if (descriptor.origin !== "replit") {
    throw new Error("ensureCloned only valid for replit projects");
  }
  ensureCloneCacheDir();
  const dest = cloneCacheDir(descriptor);
  if (fs.existsSync(path.join(dest, ".git"))) {
    return { localPath: dest, cloned: false };
  }
  const url = gitCloneUrl(descriptor);
  await new Promise<void>((resolve, reject) => {
    execFile("git", ["clone", "--depth", "1", url, dest], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
  return { localPath: dest, cloned: true };
}

function runGit(cwd: string, args: string[], timeoutMs = 60000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || "git failed").trim()));
      else resolve({ stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

export interface CloneInfo {
  exists: boolean;
  localPath: string | null;
  lastFetchedAt: number | null;
  ageMs: number | null;
  stale: boolean;
  dirty: boolean;
  dirtyFiles: string[];
  branch: string | null;
}

const STALE_THRESHOLD_MS = 60 * 60 * 1000;

export async function getCloneInfo(descriptor: ProjectDescriptor): Promise<CloneInfo> {
  if (descriptor.origin !== "replit") {
    throw new Error("getCloneInfo only valid for replit projects");
  }
  const dest = cloneCacheDir(descriptor);
  const gitDir = path.join(dest, ".git");
  if (!fs.existsSync(gitDir)) {
    return {
      exists: false,
      localPath: null,
      lastFetchedAt: null,
      ageMs: null,
      stale: false,
      dirty: false,
      dirtyFiles: [],
      branch: null,
    };
  }

  let lastFetchedAt: number | null = null;
  for (const candidate of ["FETCH_HEAD", "HEAD"]) {
    try {
      const st = fs.statSync(path.join(gitDir, candidate));
      const t = st.mtimeMs;
      if (t && (lastFetchedAt === null || t > lastFetchedAt)) lastFetchedAt = t;
    } catch {}
  }

  let dirtyFiles: string[] = [];
  try {
    const { stdout } = await runGit(dest, ["status", "--porcelain"], 15000);
    dirtyFiles = stdout.split("\n").map(l => l.slice(3).trim()).filter(Boolean).slice(0, 50);
  } catch {}

  let branch: string | null = null;
  try {
    const { stdout } = await runGit(dest, ["rev-parse", "--abbrev-ref", "HEAD"], 10000);
    const b = stdout.trim();
    branch = b && b !== "HEAD" ? b : null;
  } catch {}

  const ageMs = lastFetchedAt ? Date.now() - lastFetchedAt : null;
  return {
    exists: true,
    localPath: dest,
    lastFetchedAt,
    ageMs,
    stale: ageMs !== null && ageMs > STALE_THRESHOLD_MS,
    dirty: dirtyFiles.length > 0,
    dirtyFiles,
    branch,
  };
}

export interface PullResult {
  localPath: string;
  pulled: boolean;
  fromRev: string | null;
  toRev: string | null;
  changedFiles: string[];
  preservedDirty: boolean;
  discardedDirty: boolean;
  info: CloneInfo;
}

export async function pullLatest(
  descriptor: ProjectDescriptor,
  opts: { discardLocal?: boolean } = {}
): Promise<PullResult> {
  if (descriptor.origin !== "replit") {
    throw new Error("pullLatest only valid for replit projects");
  }
  const dest = cloneCacheDir(descriptor);
  if (!fs.existsSync(path.join(dest, ".git"))) {
    throw new Error("Project is not cloned yet. Use 'Pull files for editing' first.");
  }

  const before = await getCloneInfo(descriptor);
  if (before.dirty && !opts.discardLocal) {
    const err: any = new Error(
      `Local changes would be overwritten in ${before.dirtyFiles.length} file(s). Commit, save, or pass discardLocal=true to discard.`
    );
    err.code = "DIRTY_WORKING_TREE";
    err.dirtyFiles = before.dirtyFiles;
    throw err;
  }

  let fromRev: string | null = null;
  try {
    const { stdout } = await runGit(dest, ["rev-parse", "HEAD"], 10000);
    fromRev = stdout.trim() || null;
  } catch {}

  await runGit(dest, ["fetch", "--depth", "1", "origin", "HEAD"], 120000);

  if (before.dirty && opts.discardLocal) {
    try {
      await runGit(dest, ["reset", "--hard", "HEAD"], 30000);
      await runGit(dest, ["clean", "-fd"], 30000);
    } catch {}
  }

  await runGit(dest, ["reset", "--hard", "FETCH_HEAD"], 30000);

  let toRev: string | null = null;
  try {
    const { stdout } = await runGit(dest, ["rev-parse", "HEAD"], 10000);
    toRev = stdout.trim() || null;
  } catch {}

  let changedFiles: string[] = [];
  if (fromRev && toRev && fromRev !== toRev) {
    try {
      const { stdout } = await runGit(dest, ["diff", "--name-only", fromRev, toRev], 15000);
      changedFiles = stdout.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 200);
    } catch {}
  }

  const info = await getCloneInfo(descriptor);
  return {
    localPath: dest,
    pulled: fromRev !== toRev,
    fromRev,
    toRev,
    changedFiles,
    preservedDirty: !before.dirty,
    discardedDirty: before.dirty && !!opts.discardLocal,
    info,
  };
}

export async function resolveDescriptor(descriptor: ProjectDescriptor | undefined | null): Promise<ResolvedProject | null> {
  if (!descriptor || !descriptor.origin) return null;

  if (descriptor.origin === "local") {
    const localPath = safeLocalPath(descriptor.path);
    return { descriptor, origin: "local", localPath, cloned: false, remotePath: null };
  }

  if (descriptor.origin === "vps") {
    return {
      descriptor,
      origin: "vps",
      localPath: null,
      cloned: false,
      remotePath: descriptor.path,
      ssh: mergeSshConfig(descriptor),
    };
  }

  if (descriptor.origin === "replit") {
    const dest = cloneCacheDir(descriptor);
    const exists = fs.existsSync(path.join(dest, ".git"));
    return {
      descriptor,
      origin: "replit",
      localPath: exists ? dest : null,
      cloned: false,
      remotePath: null,
    };
  }

  return null;
}

export async function resolveAndEnsureCloned(descriptor: ProjectDescriptor | undefined | null): Promise<ResolvedProject | null> {
  const resolved = await resolveDescriptor(descriptor);
  if (!resolved) return null;
  if (resolved.origin === "replit" && !resolved.localPath) {
    const result = await ensureCloned(descriptor!);
    return { ...resolved, localPath: result.localPath, cloned: result.cloned };
  }
  return resolved;
}

export interface ListEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
}

function listLocal(rootPath: string, subPath: string): ListEntry[] {
  const target = subPath === "." || !subPath
    ? rootPath
    : path.resolve(rootPath, subPath);
  const rel = path.relative(rootPath, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path traversal blocked");
  }
  const entries = fs.readdirSync(target, { withFileTypes: true });
  return entries
    .filter(e => e.name !== "node_modules" && e.name !== ".git")
    .map(e => {
      const out: ListEntry = {
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
      };
      if (!e.isDirectory()) {
        try {
          const st = fs.statSync(path.join(target, e.name));
          out.size = st.size;
        } catch {}
      }
      return out;
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function execSshCommand(config: ConnectConfig, command: string, timeoutMs = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    if (!config.host || !config.username) {
      reject(new Error("SSH not configured (missing host or username)"));
      return;
    }
    const conn = new Client();
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.end();
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            if (settled) return;
            settled = true;
            clearTimeout(t);
            conn.end();
            reject(err);
            return;
          }
          let stdout = "";
          let stderr = "";
          stream
            .on("close", (code: number) => {
              if (settled) return;
              settled = true;
              clearTimeout(t);
              conn.end();
              resolve({ stdout, stderr, exitCode: code });
            })
            .on("data", (d: Buffer) => { stdout += d.toString(); })
            .stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
        });
      })
      .on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        reject(err);
      })
      .connect(config);
  });
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function listVps(remotePath: string, subPath: string, ssh: ConnectConfig): Promise<ListEntry[]> {
  const fullPath = joinRemote(remotePath, subPath);
  const cmd = `ls -lA --time-style=+%s ${shellQuote(fullPath)} 2>/dev/null | tail -n +2`;
  const { stdout } = await execSshCommand(ssh, cmd, 15000);
  const out: ListEntry[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 7) continue;
    const isDir = parts[0].startsWith("d");
    const size = parseInt(parts[4], 10);
    const name = parts.slice(6).join(" ");
    if (!name || name === "." || name === ".." || name === "node_modules" || name === ".git") continue;
    out.push({ name, type: isDir ? "directory" : "file", size: isNaN(size) ? undefined : size });
  }
  return out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function listFiles(resolved: ResolvedProject, subPath: string = "."): Promise<ListEntry[]> {
  if (resolved.origin === "vps" && resolved.remotePath && resolved.ssh) {
    return listVps(resolved.remotePath, subPath, resolved.ssh);
  }
  if (!resolved.localPath) return [];
  return listLocal(resolved.localPath, subPath);
}

const MAX_FILE_BYTES = 500_000;

export async function readFile(resolved: ResolvedProject, filePath: string): Promise<{ content: string; size: number; truncated: boolean }> {
  if (resolved.origin === "vps" && resolved.remotePath && resolved.ssh) {
    const fullPath = joinRemote(resolved.remotePath, filePath);
    const sizeRes = await execSshCommand(resolved.ssh, `stat -c%s ${shellQuote(fullPath)} 2>/dev/null || echo 0`, 10000);
    const size = parseInt(sizeRes.stdout.trim(), 10) || 0;
    if (size > MAX_FILE_BYTES) {
      const headRes = await execSshCommand(resolved.ssh, `head -c ${MAX_FILE_BYTES} ${shellQuote(fullPath)}`, 15000);
      return { content: headRes.stdout, size, truncated: true };
    }
    const cat = await execSshCommand(resolved.ssh, `cat ${shellQuote(fullPath)}`, 15000);
    return { content: cat.stdout, size, truncated: false };
  }
  if (!resolved.localPath) {
    if (resolved.origin === "replit") {
      throw new Error("Replit project not cloned yet. Sign in and use 'Pull files for editing'.");
    }
    throw new Error("Project has no local path");
  }
  const full = path.resolve(resolved.localPath, filePath);
  const rel = path.relative(resolved.localPath, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path traversal blocked");
  const stat = fs.statSync(full);
  if (stat.size > MAX_FILE_BYTES) {
    const fd = fs.openSync(full, "r");
    const buf = Buffer.alloc(MAX_FILE_BYTES);
    fs.readSync(fd, buf, 0, MAX_FILE_BYTES, 0);
    fs.closeSync(fd);
    return { content: buf.toString("utf-8"), size: stat.size, truncated: true };
  }
  return { content: fs.readFileSync(full, "utf-8"), size: stat.size, truncated: false };
}

/**
 * Read the full content of a file, with no size truncation. Throws on read
 * errors. Used by features (like undo snapshots) that must capture exact
 * prior bytes — never use for LLM context, which should use readFile().
 *
 * The error thrown for a missing file has `code === "ENOENT"` so callers can
 * distinguish "file does not exist" from other failures.
 */
export async function readFileFull(resolved: ResolvedProject, filePath: string): Promise<{ content: string; size: number }> {
  if (resolved.origin === "vps" && resolved.remotePath && resolved.ssh) {
    const fullPath = joinRemote(resolved.remotePath, filePath);
    const exists = await execSshCommand(resolved.ssh, `test -f ${shellQuote(fullPath)} && echo OK || echo MISSING`, 10000);
    if (exists.stdout.trim() !== "OK") {
      const err: NodeJS.ErrnoException = new Error(`ENOENT: no such file ${filePath}`);
      err.code = "ENOENT";
      throw err;
    }
    const cat = await execSshCommand(resolved.ssh, `cat ${shellQuote(fullPath)}`, 30000);
    if (cat.exitCode !== 0) throw new Error(`SSH read failed: ${cat.stderr || "exit " + cat.exitCode}`);
    return { content: cat.stdout, size: Buffer.byteLength(cat.stdout, "utf-8") };
  }
  if (!resolved.localPath) {
    if (resolved.origin === "replit") {
      throw new Error("Replit project not cloned yet. Sign in and use 'Pull files for editing'.");
    }
    throw new Error("Project has no local path");
  }
  const full = path.resolve(resolved.localPath, filePath);
  const rel = path.relative(resolved.localPath, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path traversal blocked");
  const content = fs.readFileSync(full, "utf-8");
  return { content, size: Buffer.byteLength(content, "utf-8") };
}

export async function writeFile(resolved: ResolvedProject, filePath: string, content: string): Promise<{ bytes: number }> {
  if (resolved.origin === "vps" && resolved.remotePath && resolved.ssh) {
    const fullPath = joinRemote(resolved.remotePath, filePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    const b64 = Buffer.from(content, "utf-8").toString("base64");
    const cmd = `mkdir -p ${shellQuote(dir)} && echo ${shellQuote(b64)} | base64 -d > ${shellQuote(fullPath)}`;
    const res = await execSshCommand(resolved.ssh, cmd, 30000);
    if (res.exitCode !== 0) throw new Error(`SSH write failed: ${res.stderr || "exit " + res.exitCode}`);
    return { bytes: Buffer.byteLength(content, "utf-8") };
  }
  if (!resolved.localPath) {
    if (resolved.origin === "replit") {
      throw new Error("Replit project not cloned yet. Sign in and use 'Pull files for editing'.");
    }
    throw new Error("Project has no local path");
  }
  const full = path.resolve(resolved.localPath, filePath);
  const rel = path.relative(resolved.localPath, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path traversal blocked");
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return { bytes: Buffer.byteLength(content, "utf-8") };
}

export async function deleteFile(resolved: ResolvedProject, filePath: string): Promise<{ ok: true }> {
  if (resolved.origin === "vps" && resolved.remotePath && resolved.ssh) {
    const fullPath = joinRemote(resolved.remotePath, filePath);
    const cmd = `rm -f ${shellQuote(fullPath)}`;
    const res = await execSshCommand(resolved.ssh, cmd, 15000);
    if (res.exitCode !== 0) throw new Error(`SSH delete failed: ${res.stderr || "exit " + res.exitCode}`);
    return { ok: true };
  }
  if (!resolved.localPath) {
    throw new Error("Project has no local path");
  }
  const full = path.resolve(resolved.localPath, filePath);
  const rel = path.relative(resolved.localPath, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path traversal blocked");
  try {
    fs.unlinkSync(full);
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }
  return { ok: true };
}

const BLOCKED_CMDS = ["rm -rf /", "mkfs", "dd if=", ":(){", "shutdown", "reboot", "halt", "poweroff"];

export async function execCommand(resolved: ResolvedProject, command: string, timeoutMs = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (BLOCKED_CMDS.some(b => command.includes(b))) {
    return { stdout: "", stderr: "Command blocked for safety", exitCode: 1 };
  }
  if (resolved.origin === "vps" && resolved.remotePath && resolved.ssh) {
    const wrapped = `cd ${shellQuote(resolved.remotePath)} && ${command}`;
    return execSshCommand(resolved.ssh, wrapped, timeoutMs);
  }
  if (!resolved.localPath) throw new Error("Project has no local path");
  return new Promise((resolve) => {
    execFile("sh", ["-c", command], {
      cwd: resolved.localPath!,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, TERM: "dumb" },
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : err.message,
          exitCode: (err as any).code || 1,
        });
      } else {
        resolve({ stdout: stdout || "", stderr: stderr || "", exitCode: 0 });
      }
    });
  });
}

const KEY_FILES = ["README.md", "README", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "requirements.txt"];
const ENTRY_FILES = ["src/index.ts", "src/index.js", "src/main.ts", "src/App.tsx", "src/app.ts", "main.py", "app.py", "index.js"];

export async function getSummary(
  resolved: ResolvedProject,
  options: { tokenBudget?: number } = {}
): Promise<string> {
  const budget = options.tokenBudget ?? 3000;
  const lines: string[] = [];
  const name = resolved.descriptor.name || resolved.descriptor.path.split("/").pop() || "(unnamed)";
  lines.push(`# Project: ${name}`);
  lines.push(`Origin: ${resolved.origin}`);
  if (resolved.origin === "replit") {
    lines.push(`Cloned to: ${resolved.localPath} (${resolved.cloned ? "fresh clone" : "cached"})`);
  } else if (resolved.origin === "vps") {
    lines.push(`Remote path: ${resolved.remotePath}`);
  } else {
    lines.push(`Local path: ${resolved.localPath}`);
  }
  if (resolved.descriptor.url) lines.push(`URL: ${resolved.descriptor.url}`);
  lines.push("");

  try {
    const top = await listFiles(resolved, ".");
    lines.push("## Top-level files");
    for (const e of top.slice(0, 50)) {
      lines.push(`- ${e.type === "directory" ? "[d]" : "[f]"} ${e.name}`);
    }
    lines.push("");

    lines.push("## Selected directories (depth 2)");
    for (const e of top) {
      if (e.type !== "directory") continue;
      if (["dist", "build", ".cache", ".next", "coverage", "out"].includes(e.name)) continue;
      try {
        const inner = await listFiles(resolved, e.name);
        const sample = inner.slice(0, 15).map(i => `${i.type === "directory" ? "d" : "f"}:${i.name}`).join(", ");
        if (sample) lines.push(`- ${e.name}/  ${sample}${inner.length > 15 ? ` (+${inner.length - 15} more)` : ""}`);
      } catch {}
    }
    lines.push("");
  } catch (err: any) {
    lines.push(`(file listing failed: ${err.message})`);
  }

  for (const f of KEY_FILES) {
    try {
      const r = await readFile(resolved, f);
      lines.push(`## ${f}`);
      const max = 1500;
      lines.push(r.content.length > max ? r.content.slice(0, max) + "\n...(truncated)" : r.content);
      lines.push("");
    } catch {}
    if (lines.join("\n").length > budget) break;
  }

  if (lines.join("\n").length < budget) {
    for (const f of ENTRY_FILES) {
      try {
        const r = await readFile(resolved, f);
        lines.push(`## ${f}`);
        const max = 1200;
        lines.push(r.content.length > max ? r.content.slice(0, max) + "\n...(truncated)" : r.content);
        lines.push("");
      } catch {}
      if (lines.join("\n").length > budget) break;
    }
  }

  const out = lines.join("\n");
  return out.length > budget ? out.slice(0, budget) + "\n...(summary truncated)" : out;
}

export function describeForLog(resolved: ResolvedProject | null): string {
  if (!resolved) return "<no project>";
  return `${resolved.origin}:${resolved.descriptor.name || resolved.descriptor.path}`;
}
