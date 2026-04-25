import { Router, type IRouter } from "express";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { db, workbenchUndoEntriesTable, type PersistedProjectDescriptor } from "@workspace/db";
import { sql, and, eq, lt } from "drizzle-orm";
import multer from "multer";
import AdmZip from "adm-zip";
import * as projectCtx from "../lib/project-context";
import { unifiedDiff } from "../lib/file-diff";
import { checkShellSafety, checkGitSafety, isGitCommand } from "../lib/command-safety";
import { requireAuth } from "../middlewares/rateLimiter";
import { randomBytes } from "crypto";

const router: IRouter = Router();

// In-memory redo stack. Undo is persisted in the DB
// (workbench_undo_entries) so it survives page reloads / API restarts;
// redo is intentionally ephemeral — once an entry has been undone the
// chance the user wants to re-apply the AI's content is highest while
// the same browser session is still open. Persisting redo across server
// restarts would require additional schema and a story for stale
// "newContent" replays after the file moved on disk; out of scope for
// this rebase.
interface RedoEntry {
  editId: string;
  resolved: projectCtx.ResolvedProject;
  descriptor: PersistedProjectDescriptor;
  filePath: string;
  previousContent: string;
  newContent: string;
  isNew: boolean;
  createdAt: number;
  userId: string;
  stackKey: string;
}

// Per-file redo stacks, keyed by `userId|projectKey|filePath`. When an
// entry is undone we move it onto the redo stack so the user can re-
// apply the AI's content; a fresh AI write_file to the same file clears
// the redo stack (so we never silently overwrite work the agent just
// did).
const fileRedoStacks = new Map<string, RedoEntry[]>();
// Reverse index for entries currently sitting on a redo stack (redoable).
const redoEditsById = new Map<string, RedoEntry>();

const UNDO_TTL_MS = 60 * 60 * 1000;
const UNDO_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
// Hard cap per file so a runaway agent can't grow redo memory unbounded.
const MAX_STACK_PER_FILE = 50;

function projectKeyFor(descriptor: PersistedProjectDescriptor): string {
  return `${descriptor.origin}:${descriptor.path || ""}`;
}

function toPersistedDescriptor(descriptor: projectCtx.ProjectDescriptor): PersistedProjectDescriptor {
  const out: PersistedProjectDescriptor = {
    origin: descriptor.origin,
    path: typeof descriptor.path === "string" ? descriptor.path : "",
  };
  if (typeof descriptor.name === "string") out.name = descriptor.name;
  if (typeof descriptor.url === "string") out.url = descriptor.url;
  const ssh = descriptor.ssh;
  if (ssh && typeof ssh === "object") {
    const sshOut: PersistedProjectDescriptor["ssh"] = {};
    if (typeof ssh.host === "string") sshOut.host = ssh.host;
    if (typeof ssh.port === "number") sshOut.port = ssh.port;
    if (typeof ssh.username === "string") sshOut.username = ssh.username;
    if (typeof ssh.password === "string") sshOut.password = ssh.password;
    if (typeof ssh.privateKey === "string") sshOut.privateKey = ssh.privateKey;
    if (Object.keys(sshOut).length > 0) out.ssh = sshOut;
  }
  return out;
}

function parsePersistedDescriptor(raw: unknown): PersistedProjectDescriptor | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.origin !== "local" && r.origin !== "vps" && r.origin !== "replit") return null;
  if (typeof r.path !== "string") return null;
  const out: PersistedProjectDescriptor = { origin: r.origin, path: r.path };
  if (typeof r.name === "string") out.name = r.name;
  if (typeof r.url === "string") out.url = r.url;
  if (r.ssh && typeof r.ssh === "object") {
    const s = r.ssh as Record<string, unknown>;
    const sshOut: PersistedProjectDescriptor["ssh"] = {};
    if (typeof s.host === "string") sshOut.host = s.host;
    if (typeof s.port === "number") sshOut.port = s.port;
    if (typeof s.username === "string") sshOut.username = s.username;
    if (typeof s.password === "string") sshOut.password = s.password;
    if (typeof s.privateKey === "string") sshOut.privateKey = s.privateKey;
    if (Object.keys(sshOut).length > 0) out.ssh = sshOut;
  }
  return out;
}

function fileStackKey(
  userId: string,
  descriptor: PersistedProjectDescriptor,
  filePath: string,
): string {
  return `${userId}|${projectKeyFor(descriptor)}|${filePath}`;
}

async function pruneUndoStore(): Promise<void> {
  try {
    await db
      .delete(workbenchUndoEntriesTable)
      .where(lt(workbenchUndoEntriesTable.expiresAt, new Date()));
  } catch (err: any) {
    console.error("[workbench-undo] prune failed:", err?.message || err);
  }
  // In-memory redo entries share the same TTL relative to original edit
  // time, so an hour after the AI wrote a file the redo affordance
  // disappears too.
  const cutoff = Date.now() - UNDO_TTL_MS;
  for (const [key, stack] of fileRedoStacks) {
    const kept: RedoEntry[] = [];
    for (const e of stack) {
      if (e.createdAt < cutoff) {
        redoEditsById.delete(e.editId);
      } else {
        kept.push(e);
      }
    }
    if (kept.length === 0) fileRedoStacks.delete(key);
    else fileRedoStacks.set(key, kept);
  }
}

function pushRedoEntry(entry: RedoEntry) {
  const stack = fileRedoStacks.get(entry.stackKey) || [];
  stack.push(entry);
  // Per-file cap so a chain of undos can't grow memory unbounded.
  while (stack.length > MAX_STACK_PER_FILE) {
    const dropped = stack.shift();
    if (dropped) redoEditsById.delete(dropped.editId);
  }
  fileRedoStacks.set(entry.stackKey, stack);
  redoEditsById.set(entry.editId, entry);
}

function popTopRedoEntry(stackKey: string): RedoEntry | undefined {
  const stack = fileRedoStacks.get(stackKey);
  if (!stack || stack.length === 0) return undefined;
  const top = stack.pop()!;
  if (stack.length === 0) fileRedoStacks.delete(stackKey);
  else fileRedoStacks.set(stackKey, stack);
  redoEditsById.delete(top.editId);
  return top;
}

// A fresh AI edit invalidates everything sitting in the redo stack for that
// file — replaying an older "newContent" would silently clobber the just-
// written changes the user hasn't agreed to discard.
function clearRedoStackForFile(stackKey: string): string[] {
  const stack = fileRedoStacks.get(stackKey);
  if (!stack || stack.length === 0) return [];
  const ids = stack.map(e => e.editId);
  for (const e of stack) redoEditsById.delete(e.editId);
  fileRedoStacks.delete(stackKey);
  return ids;
}

// Stack semantics: returns active (unused, unexpired) undo entries for a
// given file in a given project, ordered oldest -> newest. The last entry
// is the "top of stack" that may be safely undone without clobbering newer
// edits the user hasn't agreed to discard.
async function getActiveStackForFile(
  userId: string,
  descriptor: PersistedProjectDescriptor,
  filePath: string,
) {
  return await db
    .select()
    .from(workbenchUndoEntriesTable)
    .where(
      and(
        eq(workbenchUndoEntriesTable.userId, userId),
        eq(workbenchUndoEntriesTable.filePath, filePath),
        sql`${workbenchUndoEntriesTable.usedAt} IS NULL`,
        sql`${workbenchUndoEntriesTable.expiresAt} > NOW()`,
        sql`(${workbenchUndoEntriesTable.projectDescriptor}->>'origin') = ${descriptor.origin}`,
        sql`(${workbenchUndoEntriesTable.projectDescriptor}->>'path') = ${descriptor.path || ""}`,
      ),
    )
    .orderBy(workbenchUndoEntriesTable.createdAt);
}

const undoCleanupTimer = setInterval(() => {
  void pruneUndoStore();
}, UNDO_CLEANUP_INTERVAL_MS);
if (typeof undoCleanupTimer.unref === "function") undoCleanupTimer.unref();
const PROJECT_ROOT = process.env.NODE_ENV === "production"
  ? process.cwd()
  : path.resolve(process.cwd(), "../..");

const upload = multer({
  dest: path.join(os.tmpdir(), "workbench-uploads"),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function safePath(requestedPath: string): string {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath);
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

// Stable error codes returned in the JSON body of a 4xx/5xx response so
// frontend code (and CDNs/log dashboards) can branch on the actual reason
// instead of substring-matching a free-form message. Keep this union in
// sync with every literal `code:` value emitted from the workbench routes.
type WorkbenchErrorCode =
  | "PATH_TRAVERSAL"
  | "FILE_TOO_LARGE"
  | "NOT_FOUND"
  | "MISSING_PATH"
  | "INVALID_INPUT"
  | "INVALID_PROJECT"
  | "PROJECT_UNRESOLVED"
  | "PROJECT_NOT_PULLED"
  | "AUTH_REQUIRED"
  | "GIT_ERROR"
  | "DB_QUERY_FAILED"
  | "AI_REQUEST_FAILED"
  | "INTERNAL_ERROR";

function classifyWorkbenchError(err: unknown): { status: number; code: WorkbenchErrorCode; message: string } {
  const message = (err as any)?.message || String(err) || "Unknown error";
  const errno = (err as NodeJS.ErrnoException)?.code;
  if (/path traversal|absolute path not allowed/i.test(message)) {
    return { status: 400, code: "PATH_TRAVERSAL", message };
  }
  if (/not cloned yet|not pulled yet|use ['"]?pull files for editing/i.test(message)) {
    return { status: 409, code: "PROJECT_NOT_PULLED", message };
  }
  if (/has no local path|cannot determine git clone url/i.test(message)) {
    return { status: 409, code: "PROJECT_NOT_PULLED", message };
  }
  if (errno === "ENOENT" || /ENOENT/.test(message)) {
    return { status: 404, code: "NOT_FOUND", message };
  }
  return { status: 500, code: "INTERNAL_ERROR", message };
}

router.post("/shell", requireAuth, async (req, res): Promise<void> => {
  const { command, project } = req.body || {};
  if (!command || typeof command !== "string") {
    res.status(400).json({ error: "command is required" });
    return;
  }

  const safety = checkShellSafety(command);
  if (safety.blocked) {
    res.json({
      stdout: "",
      stderr: `Command blocked for safety: ${safety.reason || "unsafe command"}`,
      exitCode: 1,
    });
    return;
  }

  try {
    if (project && project.origin) {
      const resolved = await projectCtx.resolveAndEnsureCloned(project);
      if (!resolved) {
        res.status(400).json({ error: "could not resolve project" });
        return;
      }
      const r = await projectCtx.execCommand(resolved, command);
      res.json({ stdout: r.stdout || "", stderr: r.stderr || "", exitCode: r.exitCode, scope: { origin: resolved.origin, path: resolved.origin === "vps" ? resolved.remotePath : resolved.localPath } });
      return;
    }

    const stdout = execSync(command, {
      cwd: PROJECT_ROOT,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
      env: { ...process.env, TERM: "dumb" },
    });
    res.json({ stdout: stdout || "", stderr: "", exitCode: 0, scope: { origin: "workspace", path: PROJECT_ROOT } });
  } catch (err: any) {
    res.json({
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "Command failed",
      exitCode: err.status || 1,
    });
  }
});

router.get("/files", async (req, res): Promise<void> => {
  const requestedPath = (req.query.path as string) || ".";
  const projectRaw = req.query.project as string | undefined;
  if (projectRaw) {
    let project: any;
    try {
      project = JSON.parse(projectRaw);
    } catch {
      res.status(400).json({ items: [], error: "Invalid project descriptor JSON", code: "INVALID_PROJECT" });
      return;
    }
    if (project?.origin === "vps" && !(req as any).user) {
      res.status(401).json({ items: [], error: "Authentication required for VPS-origin project access", code: "AUTH_REQUIRED" });
      return;
    }
    try {
      const resolved = await projectCtx.resolveDescriptor(project);
      if (!resolved) {
        res.status(400).json({ items: [], error: "could not resolve project", code: "PROJECT_UNRESOLVED" });
        return;
      }
      if (resolved.origin === "replit" && !resolved.localPath) {
        res.status(409).json({
          items: [],
          error: "Replit project not pulled yet — open the Replit Workbench and click 'Pull files for editing' (sign-in required).",
          code: "PROJECT_NOT_PULLED",
        });
        return;
      }
      const entries = await projectCtx.listFiles(resolved, requestedPath);
      const items = entries.map(e => ({
        name: e.name,
        type: e.type,
        path: requestedPath === "." || !requestedPath ? e.name : `${requestedPath}/${e.name}`,
        ...(e.size !== undefined ? { size: e.size } : {}),
      }));
      res.json({ items, path: requestedPath, scope: { origin: resolved.origin } });
      return;
    } catch (err: any) {
      const c = classifyWorkbenchError(err);
      res.status(c.status).json({ items: [], error: c.message, code: c.code });
      return;
    }
  }
  try {
    const fullPath = safePath(requestedPath);
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    const items = entries
      .filter(e => !e.name.startsWith(".") || e.name === ".env")
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => {
        const itemPath = path.join(requestedPath === "." ? "" : requestedPath, e.name);
        const result: any = {
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
          path: itemPath,
        };
        if (!e.isDirectory()) {
          try {
            const stat = fs.statSync(path.join(fullPath, e.name));
            result.size = stat.size;
          } catch {}
        }
        return result;
      })
      .filter(e => e.name !== "node_modules" && e.name !== ".git");

    res.json({ items, path: requestedPath });
  } catch (err: any) {
    const c = classifyWorkbenchError(err);
    res.status(c.status).json({ items: [], error: c.message, code: c.code });
  }
});

router.get("/file-content", async (req, res): Promise<void> => {
  const filePath = req.query.path as string;
  const projectRaw = req.query.project as string | undefined;
  if (!filePath) {
    res.status(400).json({ error: "path is required", code: "MISSING_PATH" });
    return;
  }
  if (projectRaw) {
    let project: any;
    try {
      project = JSON.parse(projectRaw);
    } catch {
      res.status(400).json({ error: "Invalid project descriptor JSON", code: "INVALID_PROJECT" });
      return;
    }
    if (project?.origin === "vps" && !(req as any).user) {
      res.status(401).json({ error: "Authentication required for VPS-origin project access", code: "AUTH_REQUIRED" });
      return;
    }
    try {
      const resolved = await projectCtx.resolveDescriptor(project);
      if (!resolved) {
        res.status(400).json({ error: "could not resolve project", code: "PROJECT_UNRESOLVED" });
        return;
      }
      if (resolved.origin === "replit" && !resolved.localPath) {
        res.status(409).json({
          error: "Replit project not pulled yet — open the Replit Workbench and click 'Pull files for editing' (sign-in required).",
          code: "PROJECT_NOT_PULLED",
        });
        return;
      }
      const r = await projectCtx.readFile(resolved, filePath);
      res.json({ content: r.content, size: r.size, truncated: r.truncated, path: filePath, scope: { origin: resolved.origin } });
      return;
    } catch (err: any) {
      const c = classifyWorkbenchError(err);
      res.status(c.status).json({ error: c.message, code: c.code });
      return;
    }
  }

  try {
    const fullPath = safePath(filePath);
    const stat = fs.statSync(fullPath);

    if (stat.size > 500000) {
      res.status(413).json({ error: "File too large (>500KB)", code: "FILE_TOO_LARGE", size: stat.size });
      return;
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    res.json({ content, size: stat.size, path: filePath });
  } catch (err: any) {
    const c = classifyWorkbenchError(err);
    res.status(c.status).json({ error: c.message, code: c.code });
  }
});

// Streams the raw file as a download attachment, bypassing the 500KB
// preview cap that /file-content enforces. This is what the
// "Download instead" CTA on the FILE_TOO_LARGE error card calls so
// users can still get at large logs/bundles without dropping into the
// shell. VPS-origin projects are not supported here yet because we
// don't have a streaming SSH path.
router.get("/file-download", async (req, res): Promise<void> => {
  const filePath = req.query.path as string;
  const projectRaw = req.query.project as string | undefined;
  if (!filePath) {
    res.status(400).json({ error: "path is required", code: "MISSING_PATH" });
    return;
  }
  const sendStream = (absPath: string, downloadName: string) => {
    const stat = fs.statSync(absPath);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    );
    fs.createReadStream(absPath).pipe(res);
  };
  const baseName = path.basename(filePath) || "download";
  if (projectRaw) {
    let project: any;
    try {
      project = JSON.parse(projectRaw);
    } catch {
      res.status(400).json({ error: "Invalid project descriptor JSON", code: "INVALID_PROJECT" });
      return;
    }
    if (project?.origin === "vps" && !(req as any).user) {
      res.status(401).json({ error: "Authentication required for VPS-origin project access", code: "AUTH_REQUIRED" });
      return;
    }
    try {
      const resolved = await projectCtx.resolveDescriptor(project);
      if (!resolved) {
        res.status(400).json({ error: "could not resolve project", code: "PROJECT_UNRESOLVED" });
        return;
      }
      if (resolved.origin === "replit" && !resolved.localPath) {
        res.status(409).json({
          error: "Replit project not pulled yet — open the Replit Workbench and click 'Pull files for editing' (sign-in required).",
          code: "PROJECT_NOT_PULLED",
        });
        return;
      }
      if (!resolved.localPath) {
        res.status(409).json({ error: "Download is only supported for projects with a local copy.", code: "PROJECT_NOT_PULLED" });
        return;
      }
      const full = path.resolve(resolved.localPath, filePath);
      const rel = path.relative(resolved.localPath, full);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        res.status(400).json({ error: "Path traversal not allowed", code: "PATH_TRAVERSAL" });
        return;
      }
      sendStream(full, baseName);
      return;
    } catch (err: any) {
      const c = classifyWorkbenchError(err);
      res.status(c.status).json({ error: c.message, code: c.code });
      return;
    }
  }
  try {
    const fullPath = safePath(filePath);
    sendStream(fullPath, baseName);
  } catch (err: any) {
    const c = classifyWorkbenchError(err);
    res.status(c.status).json({ error: c.message, code: c.code });
  }
});

router.get("/git-status", async (_req, res): Promise<void> => {
  try {
    let currentBranch = "";
    try {
      currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: PROJECT_ROOT, encoding: "utf-8" }).trim();
    } catch {}

    let changes: any[] = [];
    try {
      const statusOutput = execSync("git status --porcelain", { cwd: PROJECT_ROOT, encoding: "utf-8" });
      changes = statusOutput
        .split("\n")
        .filter(Boolean)
        .map(line => ({
          status: line.substring(0, 2).trim(),
          file: line.substring(3),
        }));
    } catch {}

    let commits: any[] = [];
    try {
      const logOutput = execSync(
        'git log --oneline --format="%H|%s|%an|%ar" -20',
        { cwd: PROJECT_ROOT, encoding: "utf-8" }
      );
      commits = logOutput
        .split("\n")
        .filter(Boolean)
        .map(line => {
          const [hash, message, author, date] = line.split("|");
          return { hash, message, author, date };
        });
    } catch {}

    let remotes: any[] = [];
    try {
      const remotesOutput = execSync("git remote -v", { cwd: PROJECT_ROOT, encoding: "utf-8" });
      remotes = remotesOutput
        .split("\n")
        .filter(Boolean)
        .map(line => {
          const parts = line.split(/\s+/);
          return { name: parts[0], url: parts[1], type: parts[2]?.replace(/[()]/g, "") };
        });
    } catch {}

    res.json({ currentBranch, changes, commits, remotes });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || "Failed to load git status",
      code: "GIT_ERROR" satisfies WorkbenchErrorCode,
    });
  }
});

router.post("/git", requireAuth, async (req, res): Promise<void> => {
  const { command } = req.body || {};
  if (!command || typeof command !== "string") {
    res.status(400).json({ error: "command is required" });
    return;
  }
  if (!isGitCommand(command)) {
    res.status(400).json({ error: "Only git commands allowed" });
    return;
  }

  const safety = checkGitSafety(command);
  if (safety.blocked) {
    res.json({
      stdout: "",
      stderr: `Dangerous git command blocked: ${safety.reason || "unsafe command"}`,
      exitCode: 1,
    });
    return;
  }

  try {
    const stdout = execSync(command, { cwd: PROJECT_ROOT, timeout: 30000, encoding: "utf-8" });
    res.json({ stdout, stderr: "", exitCode: 0 });
  } catch (err: any) {
    res.json({ stdout: err.stdout || "", stderr: err.stderr || err.message, exitCode: err.status || 1 });
  }
});

router.get("/env", async (_req, res): Promise<void> => {
  const sensitiveKeys = ["KEY", "SECRET", "PASSWORD", "TOKEN", "CREDENTIALS", "AUTH"];
  const variables = Object.entries(process.env)
    .filter(([key]) => !key.startsWith("npm_") && !key.startsWith("__"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const isSensitive = sensitiveKeys.some(sk => key.toUpperCase().includes(sk));
      return {
        key,
        value: isSensitive ? "••••••••" : (value || "").substring(0, 200),
        sensitive: isSensitive,
      };
    });

  res.json({ variables, count: variables.length });
});

router.get("/process-info", async (_req, res): Promise<void> => {
  const mem = process.memoryUsage();
  res.json({
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    loadAvg: os.loadavg(),
    memoryUsage: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
  });
});

router.get("/db-query", async (req, res): Promise<void> => {
  const q = req.query.q as string;
  if (!q) {
    res.status(400).json({ error: "q parameter required", code: "INVALID_INPUT" satisfies WorkbenchErrorCode });
    return;
  }

  const lower = q.trim().toLowerCase();
  if (!lower.startsWith("select")) {
    res.status(400).json({ error: "Only SELECT queries allowed for safety", code: "INVALID_INPUT" satisfies WorkbenchErrorCode });
    return;
  }

  const forbidden = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "grant", "revoke", "exec"];
  if (forbidden.some(kw => lower.includes(kw))) {
    res.status(400).json({ error: "Query contains forbidden keyword", code: "INVALID_INPUT" satisfies WorkbenchErrorCode });
    return;
  }

  try {
    const result = await db.execute(sql.raw(q));
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    const fields = rows.length > 0 ? Object.keys(rows[0]) : [];
    res.json({ rows: rows.slice(0, 500), fields, rowCount: rows.length });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || "Query failed",
      code: "DB_QUERY_FAILED" satisfies WorkbenchErrorCode,
      rows: [],
      fields: [],
      rowCount: 0,
    });
  }
});

router.get("/agent-activity", async (_req, res): Promise<void> => {
  try {
    const logOutput = execSync(
      'git log --format="%H|%s|%b|%an|%aI" --name-status -50',
      { cwd: PROJECT_ROOT, encoding: "utf-8", maxBuffer: 1024 * 1024 }
    );

    const entries: any[] = [];
    let current: any = null;

    for (const line of logOutput.split("\n")) {
      if (!line) {
        if (current) {
          entries.push(current);
          current = null;
        }
        continue;
      }
      if (line.includes("|")) {
        const parts = line.split("|");
        if (parts.length >= 5 && parts[0].length === 40) {
          if (current) entries.push(current);
          const message = parts[1];
          const isAgent = message.includes("agent") || message.includes("Agent") || parts[2].includes("agent");
          current = {
            hash: parts[0],
            message,
            body: parts[2] || null,
            author: parts[3],
            date: parts[4],
            isAgent,
            files: [],
          };
          continue;
        }
      }
      if (current && /^[AMDRC]\t/.test(line)) {
        const [status, ...fileParts] = line.split("\t");
        current.files.push({ status, file: fileParts.join("\t") });
      }
    }
    if (current) entries.push(current);

    const agentCommits = entries.filter(e => e.isAgent).length;
    const filesChanged = new Set(entries.flatMap(e => e.files.map((f: any) => f.file))).size;

    res.json({
      entries: entries.slice(0, 30),
      stats: { totalCommits: entries.length, agentCommits, manualCommits: entries.length - agentCommits, filesChanged },
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || "Failed to load agent activity",
      code: "GIT_ERROR" satisfies WorkbenchErrorCode,
      entries: [],
      stats: null,
    });
  }
});

router.post("/code-chat", async (req, res): Promise<void> => {
  const { prompt, messages: history, project: projectDescriptor, writeMode } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey || !baseUrl) {
    res.status(503).json({ error: "Anthropic AI integration not configured" });
    return;
  }

  const isAuthed = !!(req as any).user;
  if (writeMode === true && !isAuthed) {
    res.status(401).json({ error: "Authentication required for writeMode chat (write_file/run_shell)" });
    return;
  }
  if (projectDescriptor?.origin === "vps" && !isAuthed) {
    res.status(401).json({ error: "Authentication required for VPS-origin project access" });
    return;
  }

  // Warm-up phase: do everything that can fail before we commit to SSE.
  // Once flushHeaders() runs we can no longer change the HTTP status, so
  // any failure after that point has to surface as an SSE `type: "error"`
  // event under a misleading 200. By resolving the project (and queueing
  // the upstream call below) before flushing, real failure modes here
  // get the correct 4xx/5xx + structured body that CDNs and frontend
  // retry logic can reason about.
  let projectContext = "";
  let resolved: Awaited<ReturnType<typeof projectCtx.resolveDescriptor>> | null = null;
  let projectWarmupWarning: string | null = null;
  if (projectDescriptor && projectDescriptor.origin && projectDescriptor.path) {
    try {
      resolved = isAuthed
        ? await projectCtx.resolveAndEnsureCloned(projectDescriptor)
        : await projectCtx.resolveDescriptor(projectDescriptor);
      if (resolved) {
        const summary = await projectCtx.getSummary(resolved, { tokenBudget: 3500 });
        projectContext = `\n\n## Selected Project Context\n${summary}\n`;
      }
    } catch (err: any) {
      // Soft failure: the chat falls back to general-assistant mode rather
      // than refusing the request. We surface the reason as a `warning`
      // SSE event once the stream is committed below — it's not fatal,
      // so we don't return 4xx here.
      projectWarmupWarning = `Project context unavailable: ${err?.message || String(err)}`;
    }
  } else {
    try {
      const pkgPath = path.join(PROJECT_ROOT, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        projectContext = `Project: ${pkg.name || "unknown"}\n`;
      }
      const dirs = fs.readdirSync(PROJECT_ROOT).filter(d => !d.startsWith(".") && d !== "node_modules").slice(0, 20);
      projectContext += `Top-level: ${dirs.join(", ")}\n`;
    } catch {}
  }

  let streamStarted = false;
  let keepAlive: NodeJS.Timeout | null = null;
  const startStream = () => {
    if (streamStarted) return;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    streamStarted = true;
    keepAlive = setInterval(() => {
      try { res.write(": keepalive\n\n"); } catch { if (keepAlive) clearInterval(keepAlive); }
    }, 15000);
    if (resolved) {
      res.write(`data: ${JSON.stringify({ type: "project", origin: resolved.origin, localPath: resolved.localPath, remotePath: resolved.remotePath, cloned: resolved.cloned })}\n\n`);
    }
    if (projectWarmupWarning) {
      res.write(`data: ${JSON.stringify({ type: "warning", content: projectWarmupWarning })}\n\n`);
    }
  };

  try {

    const conversationMessages = (history || []).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    conversationMessages.push({ role: "user", content: prompt });

    const toolNote = resolved
      ? `\n\nYou have file/shell tools scoped to the selected project at ${resolved.origin === "vps" ? resolved.remotePath : resolved.localPath}. Use list_files / read_file to explore. ${isAuthed ? "Use write_file and run_shell to make changes — they apply directly to the selected app (over SSH for VPS, in the local clone for Replit projects)." : "Sign in to enable write_file and run_shell."}`
      : `\n\nNo project is selected. Ask the user to pick one from the sidebar to enable file operations.`;

    const systemPrompt = `You are an expert coding assistant integrated into the LLM Hub Workbench. You help with code analysis, debugging, refactoring, and writing new code.${toolNote}

IMPORTANT: Always provide thorough, comprehensive, and complete responses. Do not cut your response short. When showing code, include the FULL implementation — never truncate, abbreviate, or use "..." placeholders. When explaining concepts, cover all important aspects. If your response is long, that is expected and preferred. The user needs complete, production-ready answers.${projectContext ? "\n" + projectContext : ""}`;

    const baseTools = resolved ? [
      {
        name: "list_files",
        description: "List files and directories within the selected project. Use to explore the project structure. Path is relative to the project root.",
        input_schema: { type: "object", properties: { path: { type: "string", description: "Subdirectory inside the project, or '.' for the root" } }, required: ["path"] },
      },
      {
        name: "read_file",
        description: "Read a file from within the selected project. Returns up to 500KB of content.",
        input_schema: { type: "object", properties: { path: { type: "string", description: "File path relative to the project root" } }, required: ["path"] },
      },
    ] : [];
    const writeTools = resolved && isAuthed ? [
      {
        name: "write_file",
        description: "Write or overwrite a file in the selected project. Edits apply directly to the project (VPS over SSH, Replit in the local clone, Local in place).",
        input_schema: { type: "object", properties: { path: { type: "string", description: "File path relative to the project root" }, content: { type: "string", description: "Full file contents to write" } }, required: ["path", "content"] },
      },
      {
        name: "run_shell",
        description: "Run a shell command inside the selected project's working directory. For VPS projects this runs over SSH. 30s timeout.",
        input_schema: { type: "object", properties: { command: { type: "string", description: "Shell command to execute" } }, required: ["command"] },
      },
    ] : [];
    const tools = resolved ? [...baseTools, ...writeTools] : undefined;

    let msgs = conversationMessages.slice(-20);
    let continuations = 0;
    const maxContinuations = 5;
    const maxToolIterations = 10;
    let toolIterations = 0;

    while (continuations <= maxContinuations && toolIterations <= maxToolIterations) {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 16000,
          stream: true,
          system: systemPrompt,
          messages: msgs,
          ...(tools ? { tools } : {}),
        }),
        signal: AbortSignal.timeout(300000),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (!streamStarted) {
          // First upstream call failed before we committed to SSE — return
          // a real HTTP error so frontend retry logic and CDNs see the
          // failure instead of a misleading 200.
          res.status(502).json({
            error: errText || "Upstream chat request failed",
            code: "AI_REQUEST_FAILED" satisfies WorkbenchErrorCode,
            upstreamStatus: response.status,
          });
          return;
        }
        res.write(`data: ${JSON.stringify({ type: "error", content: errText })}\n\n`);
        res.end();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        if (!streamStarted) {
          res.status(502).json({
            error: "Upstream returned no response body",
            code: "AI_REQUEST_FAILED" satisfies WorkbenchErrorCode,
          });
          return;
        }
        res.write(`data: ${JSON.stringify({ type: "error", content: "No response body" })}\n\n`);
        res.end();
        return;
      }

      // Upstream is OK — commit to streaming. Subsequent failures inside
      // the read loop or on continuation iterations have to be surfaced
      // as SSE events because the headers are now flushed.
      startStream();

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";
      let stopReason = "end_turn";
      const contentBlocks: any[] = [];
      const toolInputBuffers: Record<number, string> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_start") {
              const block = parsed.content_block;
              contentBlocks[parsed.index] = block;
              if (block.type === "tool_use") {
                toolInputBuffers[parsed.index] = "";
                res.write(`data: ${JSON.stringify({ type: "tool_start", name: block.name, id: block.id })}\n\n`);
              }
            } else if (parsed.type === "content_block_delta") {
              if (parsed.delta?.text) {
                accumulatedText += parsed.delta.text;
                contentBlocks[parsed.index] = contentBlocks[parsed.index] || { type: "text", text: "" };
                contentBlocks[parsed.index].text += parsed.delta.text;
                res.write(`data: ${JSON.stringify({ type: "chunk", content: parsed.delta.text })}\n\n`);
              } else if (parsed.delta?.partial_json !== undefined) {
                toolInputBuffers[parsed.index] = (toolInputBuffers[parsed.index] || "") + parsed.delta.partial_json;
              }
            } else if (parsed.type === "content_block_stop") {
              const block = contentBlocks[parsed.index];
              if (block?.type === "tool_use") {
                try {
                  block.input = JSON.parse(toolInputBuffers[parsed.index] || "{}");
                } catch {
                  block.input = {};
                }
              }
            } else if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
              stopReason = parsed.delta.stop_reason;
            }
          } catch {}
        }
      }

      console.log(`[code-chat] stop_reason=${stopReason}, textLen=${accumulatedText.length}, continuation=${continuations}, toolIter=${toolIterations}`);

      const toolUses = contentBlocks.filter(b => b?.type === "tool_use");

      if (stopReason === "tool_use" && toolUses.length > 0 && resolved) {
        const assistantContent: any[] = [];
        for (const b of contentBlocks) {
          if (!b) continue;
          if (b.type === "text" && b.text) assistantContent.push({ type: "text", text: b.text });
          if (b.type === "tool_use") assistantContent.push(b);
        }
        msgs.push({ role: "assistant", content: assistantContent });

        const toolResults: any[] = [];
        for (const tu of toolUses) {
          let resultText = "";
          let isError = false;
          try {
            const writeOrExec = tu.name === "write_file" || tu.name === "run_shell";
            if (writeOrExec && !isAuthed) {
              res.write(`data: ${JSON.stringify({ type: "error", status: 401, content: "Authentication required for write_file/run_shell. Please sign in." })}\n\n`);
              res.end();
              return;
            }
            if (writeOrExec && resolved && resolved.origin === "replit" && !resolved.localPath) {
              const ec = await projectCtx.ensureCloned(projectDescriptor);
              resolved = { ...resolved, localPath: ec.localPath, cloned: ec.cloned };
              res.write(`data: ${JSON.stringify({ type: "project", origin: resolved.origin, localPath: resolved.localPath, cloned: ec.cloned })}\n\n`);
            }
            if (tu.name === "list_files") {
              const entries = await projectCtx.listFiles(resolved, tu.input.path || ".");
              resultText = JSON.stringify({ entries: entries.slice(0, 200) });
              res.write(`data: ${JSON.stringify({ type: "tool_result", name: tu.name, summary: `${entries.length} entries in ${tu.input.path || "."}` })}\n\n`);
            } else if (tu.name === "read_file") {
              const r = await projectCtx.readFile(resolved, tu.input.path);
              resultText = JSON.stringify({ content: r.content, size: r.size, truncated: r.truncated });
              res.write(`data: ${JSON.stringify({ type: "tool_result", name: tu.name, summary: `read ${tu.input.path} (${r.size}B${r.truncated ? ", truncated" : ""})` })}\n\n`);
            } else if (tu.name === "write_file") {
              const targetPath = tu.input.path;
              const newContent = tu.input.content || "";
              let previousContent = "";
              let isNew = false;
              let undoSafe = true;
              let undoSkipReason: string | undefined;
              try {
                // Use full (untruncated) read so undo restores exact prior bytes.
                const prev = await projectCtx.readFileFull(resolved, targetPath);
                previousContent = prev.content || "";
              } catch (e: any) {
                if (e && (e.code === "ENOENT" || /ENOENT/i.test(String(e.message || "")))) {
                  isNew = true;
                } else {
                  // Read failed for a non-missing reason (permission, ssh, etc).
                  // Do NOT pretend the file is new — that would let undo delete
                  // it. Disable undo for this edit and surface why.
                  undoSafe = false;
                  undoSkipReason = e?.message || "could not read previous content";
                }
              }
              const r = await projectCtx.writeFile(resolved, targetPath, newContent);
              const diff = unifiedDiff(previousContent, newContent, targetPath);
              const userId = String((req as any).user?.id || (req as any).user?.sub || "anon");
              let editId: string | undefined;
              let stackDepth: number | undefined;
              let invalidatedRedoIds: string[] = [];
              if (undoSafe && isAuthed) {
                editId = randomBytes(12).toString("hex");
                const now = new Date();
                const persistedDescriptor = toPersistedDescriptor(resolved.descriptor);
                try {
                  await db.insert(workbenchUndoEntriesTable).values({
                    id: editId,
                    userId,
                    filePath: targetPath,
                    previousContent,
                    newContent,
                    isNew,
                    projectDescriptor: persistedDescriptor,
                    createdAt: now,
                    expiresAt: new Date(now.getTime() + UNDO_TTL_MS),
                  });
                  const stack = await getActiveStackForFile(userId, persistedDescriptor, targetPath);
                  stackDepth = stack.length;
                  // A new AI write to this file invalidates any in-memory
                  // redo entries — replaying them would silently overwrite
                  // this fresh edit. The DB-backed undo stack already
                  // implicitly supersedes older entries (newer createdAt
                  // becomes the new top), but we explicitly clear redo so
                  // stale Redo affordances disappear in the UI.
                  invalidatedRedoIds = clearRedoStackForFile(
                    fileStackKey(userId, persistedDescriptor, targetPath),
                  );
                } catch (e: any) {
                  console.error("[workbench-undo] insert failed:", e?.message || e);
                  editId = undefined;
                  undoSafe = false;
                  undoSkipReason = "could not persist undo entry";
                }
              } else if (undoSafe && !isAuthed) {
                undoSafe = false;
                undoSkipReason = "sign in to enable undo";
              }
              const summary = `wrote ${targetPath} (${r.bytes}B${isNew ? ", new" : `, +${diff.stats.added}/-${diff.stats.removed}`})`;
              resultText = JSON.stringify({ ok: true, bytes: r.bytes, path: targetPath, isNew, added: diff.stats.added, removed: diff.stats.removed });
              res.write(`data: ${JSON.stringify({
                type: "file_edit",
                name: tu.name,
                editId,
                path: targetPath,
                isNew,
                added: diff.stats.added,
                removed: diff.stats.removed,
                previousBytes: Buffer.byteLength(previousContent, "utf-8"),
                newBytes: r.bytes,
                diff: diff.diff,
                truncated: diff.truncated,
                summary,
                undoDisabled: !undoSafe,
                undoSkipReason,
                ...(stackDepth !== undefined ? { stackDepth } : {}),
                ...(invalidatedRedoIds.length > 0 ? { invalidatedRedoIds } : {}),
              })}\n\n`);
            } else if (tu.name === "run_shell") {
              const r = await projectCtx.execCommand(resolved, tu.input.command);
              resultText = JSON.stringify({ stdout: (r.stdout || "").slice(0, 8000), stderr: (r.stderr || "").slice(0, 4000), exitCode: r.exitCode });
              res.write(`data: ${JSON.stringify({ type: "tool_result", name: tu.name, summary: `$ ${tu.input.command} → exit ${r.exitCode}` })}\n\n`);
            } else {
              throw new Error(`Unknown tool ${tu.name}`);
            }
          } catch (err: any) {
            isError = true;
            resultText = JSON.stringify({ error: err.message });
            res.write(`data: ${JSON.stringify({ type: "tool_error", name: tu.name, error: err.message })}\n\n`);
          }
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: resultText, ...(isError ? { is_error: true } : {}) });
        }
        msgs.push({ role: "user", content: toolResults });
        toolIterations++;
        continue;
      }

      if (stopReason === "max_tokens" && continuations < maxContinuations) {
        console.log(`[code-chat] Auto-continuing (${continuations + 1}/${maxContinuations})...`);
        msgs.push({ role: "assistant", content: accumulatedText });
        msgs.push({ role: "user", content: "Continue from where you left off. Do not repeat what you already said." });
        continuations++;
        continue;
      }

      break;
    }

    if (keepAlive) clearInterval(keepAlive);
    if (streamStarted) {
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } else {
      // Reached end of loop without ever starting the stream — treat as
      // an unexpected upstream issue rather than silent 200.
      res.status(502).json({
        error: "Upstream chat returned no usable response",
        code: "AI_REQUEST_FAILED" satisfies WorkbenchErrorCode,
      });
    }
  } catch (err: any) {
    if (keepAlive) clearInterval(keepAlive);
    console.error(`[code-chat] Error:`, err.message);
    if (!streamStarted) {
      // Failure happened during warm-up / before SSE began — return a
      // proper 5xx so retry logic can react.
      const c = classifyWorkbenchError(err);
      res.status(c.status).json({ error: c.message, code: c.code });
      return;
    }
    try {
      res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
      res.end();
    } catch {}
  }
});

// Re-apply a previously-undone AI edit. Caller has already popped the
// entry from the in-memory redo stack; on success the corresponding DB
// undo row is reactivated (usedAt cleared, expiresAt bumped) so the
// user can undo again. On failure we re-push so the user can retry.
async function applyRedo(entry: RedoEntry): Promise<void> {
  // Re-apply the AI's content. For "new file" edits this also re-creates
  // the file from scratch — projectCtx.writeFile will create it if missing.
  await projectCtx.writeFile(entry.resolved, entry.filePath, entry.newContent);
  // Reactivate the persisted undo row so the user can undo this edit
  // again. Bump expiresAt off "now" so they get the full TTL window.
  const now = new Date();
  await db
    .update(workbenchUndoEntriesTable)
    .set({ usedAt: null, expiresAt: new Date(now.getTime() + UNDO_TTL_MS) })
    .where(eq(workbenchUndoEntriesTable.id, entry.editId));
}

router.post("/undo-edit", requireAuth, async (req, res): Promise<void> => {
  const { editId } = req.body || {};
  if (!editId || typeof editId !== "string") {
    res.status(400).json({ error: "editId is required" });
    return;
  }
  await pruneUndoStore();
  const rows = await db
    .select()
    .from(workbenchUndoEntriesTable)
    .where(eq(workbenchUndoEntriesTable.id, editId))
    .limit(1);
  const entry = rows[0];
  if (!entry) {
    res.status(404).json({ error: "Edit not found or expired" });
    return;
  }
  if (entry.expiresAt.getTime() <= Date.now()) {
    await db.delete(workbenchUndoEntriesTable).where(eq(workbenchUndoEntriesTable.id, editId));
    res.status(404).json({ error: "Edit not found or expired" });
    return;
  }
  if (entry.usedAt) {
    res.status(409).json({ error: "Edit was already undone" });
    return;
  }
  const userId = String((req as any).user?.id || (req as any).user?.sub || "anon");
  if (entry.userId !== userId) {
    res.status(403).json({ error: "You did not author this edit" });
    return;
  }
  const descriptor = parsePersistedDescriptor(entry.projectDescriptor);
  if (!descriptor) {
    res.status(500).json({ error: "Stored project context is invalid" });
    return;
  }
  // Enforce stack semantics: only the most recent edit to this file can be
  // undone individually, otherwise restoring an older "previousContent" would
  // wipe out newer changes that the user hasn't agreed to discard.
  const stack = await getActiveStackForFile(userId, descriptor, entry.filePath);
  const top = stack[stack.length - 1];
  if (!top || top.id !== entry.id) {
    const idx = stack.findIndex(e => e.id === entry.id);
    const newerCount = idx >= 0 ? stack.length - 1 - idx : stack.length;
    res.status(409).json({
      error: `There ${newerCount === 1 ? "is" : "are"} ${newerCount} newer edit${newerCount === 1 ? "" : "s"} to this file. Undo the latest first, or use "Undo last edit to this file".`,
      code: "not_top_of_stack",
      newerCount,
    });
    return;
  }
  let resolved: projectCtx.ResolvedProject | null;
  try {
    resolved = await projectCtx.resolveAndEnsureCloned(descriptor);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Could not access project to undo edit" });
    return;
  }
  if (!resolved) {
    res.status(500).json({ error: "Could not access project to undo edit" });
    return;
  }
  try {
    if (entry.isNew) {
      await projectCtx.deleteFile(resolved, entry.filePath);
    } else {
      await projectCtx.writeFile(resolved, entry.filePath, entry.previousContent);
    }
    const usedAt = new Date();
    const updated = await db
      .update(workbenchUndoEntriesTable)
      .set({ usedAt })
      .where(and(eq(workbenchUndoEntriesTable.id, editId), sql`${workbenchUndoEntriesTable.usedAt} IS NULL`))
      .returning({ id: workbenchUndoEntriesTable.id });
    if (updated.length === 0) {
      res.status(409).json({ error: "Edit was already undone" });
      return;
    }
    // Push to in-memory redo stack so the user can re-apply the AI's
    // content. Redo state lives only in memory (server restart clears it),
    // matching the original Task #16 behavior.
    pushRedoEntry({
      editId: entry.id,
      resolved,
      descriptor,
      filePath: entry.filePath,
      previousContent: entry.previousContent,
      newContent: entry.newContent,
      isNew: entry.isNew,
      createdAt: entry.createdAt.getTime(),
      userId,
      stackKey: fileStackKey(userId, descriptor, entry.filePath),
    });
    const remaining = (await getActiveStackForFile(userId, descriptor, entry.filePath)).length;
    res.json({
      ok: true,
      path: entry.filePath,
      restoredBytes: Buffer.byteLength(entry.previousContent, "utf-8"),
      deleted: entry.isNew,
      remainingForFile: remaining,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Undo failed" });
  }
});

// Revert every AI edit to a single file in one shot. We restore the file to
// the `previousContent` recorded at the bottom of the per-file stack — that
// is, the snapshot from before the AI's first touch in this session — and
// then drop the entire stack. If the oldest entry was a file creation, the
// file is deleted. This is the "Revert all AI edits to this file" button.
router.post("/revert-all-file-edits", requireAuth, async (req, res): Promise<void> => {
  const { filePath, project } = req.body || {};
  if (!filePath || typeof filePath !== "string") {
    res.status(400).json({ error: "filePath is required" });
    return;
  }
  const userId = String((req as any).user?.id || (req as any).user?.sub || "anon");
  let resolved: projectCtx.ResolvedProject | null = null;
  try {
    resolved = project ? await projectCtx.resolveDescriptor(project) : null;
  } catch (err: any) {
    res.status(400).json({ error: err.message || "could not resolve project" });
    return;
  }
  if (!resolved) {
    res.status(400).json({ error: "could not resolve project" });
    return;
  }
  pruneUndoStore();
  const stackKey = fileStackKey(userId, resolved, filePath);
  const stack = fileUndoStacks.get(stackKey);
  if (!stack || stack.length === 0) {
    res.status(404).json({ error: "No AI edits to revert for this file" });
    return;
  }
  const oldest = stack[0];
  const undoneEditIds = stack.map(e => e.editId);
  try {
    if (oldest.isNew) {
      await projectCtx.deleteFile(oldest.resolved, oldest.filePath);
    } else {
      await projectCtx.writeFile(oldest.resolved, oldest.filePath, oldest.previousContent);
    }
    // Mark every entry used and drop the whole stack only after the write
    // succeeds, so a failure leaves the existing per-edit undos intact.
    for (const e of stack) {
      e.used = true;
      editsById.delete(e.editId);
    }
    fileUndoStacks.delete(stackKey);
    res.json({
      ok: true,
      path: oldest.filePath,
      restoredBytes: Buffer.byteLength(oldest.previousContent, "utf-8"),
      deleted: oldest.isNew,
      revertedCount: undoneEditIds.length,
      undoneEditIds,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Revert failed" });
  }
});

// Pop the most recent unused edit for a given file. The frontend "Undo last
// edit to this file" affordance calls this so it works even when the user
// no longer has the latest editId in view (e.g. after a chat refresh).
router.post("/undo-last-file-edit", requireAuth, async (req, res): Promise<void> => {
  const { filePath, project } = req.body || {};
  if (!filePath || typeof filePath !== "string") {
    res.status(400).json({ error: "filePath is required" });
    return;
  }
  const userId = String((req as any).user?.id || (req as any).user?.sub || "anon");
  let resolved: projectCtx.ResolvedProject | null = null;
  try {
    resolved = project ? await projectCtx.resolveAndEnsureCloned(project) : null;
  } catch (err: any) {
    res.status(400).json({ error: err.message || "could not resolve project" });
    return;
  }
  if (!resolved) {
    res.status(400).json({ error: "could not resolve project" });
    return;
  }
  const descriptor = toPersistedDescriptor(resolved.descriptor);
  await pruneUndoStore();
  const stack = await getActiveStackForFile(userId, descriptor, filePath);
  if (stack.length === 0) {
    res.status(404).json({ error: "No undoable edits for this file" });
    return;
  }
  const top = stack[stack.length - 1];
  try {
    if (top.isNew) {
      await projectCtx.deleteFile(resolved, top.filePath);
    } else {
      await projectCtx.writeFile(resolved, top.filePath, top.previousContent);
    }
    const updated = await db
      .update(workbenchUndoEntriesTable)
      .set({ usedAt: new Date() })
      .where(and(eq(workbenchUndoEntriesTable.id, top.id), sql`${workbenchUndoEntriesTable.usedAt} IS NULL`))
      .returning({ id: workbenchUndoEntriesTable.id });
    if (updated.length === 0) {
      res.status(409).json({ error: "Edit was already undone" });
      return;
    }
    pushRedoEntry({
      editId: top.id,
      resolved,
      descriptor,
      filePath: top.filePath,
      previousContent: top.previousContent,
      newContent: top.newContent,
      isNew: top.isNew,
      createdAt: top.createdAt.getTime(),
      userId,
      stackKey: fileStackKey(userId, descriptor, top.filePath),
    });
    const remaining = (await getActiveStackForFile(userId, descriptor, filePath)).length;
    res.json({
      ok: true,
      editId: top.id,
      path: top.filePath,
      restoredBytes: Buffer.byteLength(top.previousContent, "utf-8"),
      deleted: top.isNew,
      remainingForFile: remaining,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Undo failed" });
  }
});

// Re-apply a previously-undone AI edit. Mirrors /undo-edit: the entry must
// be at the top of its file's redo stack (otherwise restoring an older
// "newContent" would silently overwrite a newer undo the user wants kept),
// the requester must have authored it, and a 409/404 is returned otherwise.
// Redo state is in-memory only (does not survive server restart) — undo
// state, by contrast, is persisted in workbench_undo_entries.
router.post("/redo-edit", requireAuth, async (req, res): Promise<void> => {
  const { editId } = req.body || {};
  if (!editId || typeof editId !== "string") {
    res.status(400).json({ error: "editId is required" });
    return;
  }
  await pruneUndoStore();
  const entry = redoEditsById.get(editId);
  if (!entry) {
    res.status(404).json({
      error: "Redo not available — entry expired or invalidated by a newer AI edit to this file",
    });
    return;
  }
  const userId = String((req as any).user?.id || (req as any).user?.sub || "anon");
  if (entry.userId !== userId) {
    res.status(403).json({ error: "You did not author this edit" });
    return;
  }
  const stack = fileRedoStacks.get(entry.stackKey) || [];
  const top = stack[stack.length - 1];
  if (!top || top.editId !== entry.editId) {
    const newerCount = stack.length - 1 - stack.findIndex(e => e.editId === editId);
    res.status(409).json({
      error: `There ${newerCount === 1 ? "is" : "are"} ${newerCount} more recent undo${newerCount === 1 ? "" : "s"} on this file. Redo the latest first, or use "Redo last undo".`,
      code: "not_top_of_redo_stack",
      newerCount,
    });
    return;
  }
  const popped = popTopRedoEntry(entry.stackKey)!;
  try {
    await applyRedo(popped);
    const undoStackDepth = (await getActiveStackForFile(userId, popped.descriptor, popped.filePath)).length;
    res.json({
      ok: true,
      editId: popped.editId,
      path: popped.filePath,
      reappliedBytes: Buffer.byteLength(popped.newContent, "utf-8"),
      isNew: popped.isNew,
      remainingRedoForFile: fileRedoStacks.get(entry.stackKey)?.length ?? 0,
      undoStackDepth,
    });
  } catch (err: any) {
    // Re-push so the user can retry — a transient write error
    // shouldn't silently lose their redo entry.
    pushRedoEntry(popped);
    res.status(500).json({ error: err.message || "Redo failed" });
  }
});

// Pop the most recent redo entry for a given file. Mirrors
// /undo-last-file-edit so the per-file "Redo last undo" affordance keeps
// working after the chat scrolls away.
router.post("/redo-last-file-edit", requireAuth, async (req, res): Promise<void> => {
  const { filePath, project } = req.body || {};
  if (!filePath || typeof filePath !== "string") {
    res.status(400).json({ error: "filePath is required" });
    return;
  }
  const userId = String((req as any).user?.id || (req as any).user?.sub || "anon");
  let resolved: projectCtx.ResolvedProject | null = null;
  try {
    resolved = project ? await projectCtx.resolveAndEnsureCloned(project) : null;
  } catch (err: any) {
    res.status(400).json({ error: err.message || "could not resolve project" });
    return;
  }
  if (!resolved) {
    res.status(400).json({ error: "could not resolve project" });
    return;
  }
  await pruneUndoStore();
  const descriptor = toPersistedDescriptor(resolved.descriptor);
  const stackKey = fileStackKey(userId, descriptor, filePath);
  const stack = fileRedoStacks.get(stackKey);
  if (!stack || stack.length === 0) {
    res.status(404).json({ error: "Nothing to redo for this file" });
    return;
  }
  const popped = popTopRedoEntry(stackKey)!;
  try {
    await applyRedo(popped);
    const undoStackDepth = (await getActiveStackForFile(userId, descriptor, filePath)).length;
    res.json({
      ok: true,
      editId: popped.editId,
      path: popped.filePath,
      reappliedBytes: Buffer.byteLength(popped.newContent, "utf-8"),
      isNew: popped.isNew,
      remainingRedoForFile: fileRedoStacks.get(stackKey)?.length ?? 0,
      undoStackDepth,
    });
  } catch (err: any) {
    // Re-push so the user can retry — a transient write error
    // shouldn't silently lose their redo entry.
    pushRedoEntry(popped);
    res.status(500).json({ error: err.message || "Redo failed" });
  }
});

router.get("/undo-entries", requireAuth, async (req, res): Promise<void> => {
  await pruneUndoStore();
  const userId = String((req as any).user?.id || (req as any).user?.sub || "anon");
  try {
    const rows = await db
      .select({
        id: workbenchUndoEntriesTable.id,
        filePath: workbenchUndoEntriesTable.filePath,
        isNew: workbenchUndoEntriesTable.isNew,
        usedAt: workbenchUndoEntriesTable.usedAt,
        createdAt: workbenchUndoEntriesTable.createdAt,
        expiresAt: workbenchUndoEntriesTable.expiresAt,
      })
      .from(workbenchUndoEntriesTable)
      .where(eq(workbenchUndoEntriesTable.userId, userId));
    res.json({
      entries: rows.map(r => ({
        editId: r.id,
        path: r.filePath,
        isNew: r.isNew,
        undone: !!r.usedAt,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load undo entries", entries: [] });
  }
});

router.get("/security-report", async (_req, res): Promise<void> => {
  const findings: any[] = [];
  try {
    const envVars = Object.keys(process.env);
    const hasSecrets = envVars.some(k => k.includes("SECRET") || k.includes("PASSWORD"));
    if (hasSecrets) {
      findings.push({ severity: "info", category: "secrets", title: "Secrets detected in environment", detail: "Environment variables contain sensitive keys (masked)" });
    }

    try {
      const pkgPath = path.join(PROJECT_ROOT, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps["express"]) {
          findings.push({ severity: "info", category: "dependencies", title: "Express.js detected", detail: `Version: ${deps["express"]}` });
        }
      }
    } catch {}

    try {
      const gitignorePath = path.join(PROJECT_ROOT, ".gitignore");
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, "utf-8");
        if (!content.includes(".env")) {
          findings.push({ severity: "warning", category: "config", title: ".env not in .gitignore", detail: "Environment files may be committed to version control" });
        }
      } else {
        findings.push({ severity: "warning", category: "config", title: "No .gitignore found", detail: "Project lacks a .gitignore file" });
      }
    } catch {}

    const sensitiveFiles = [".env", ".env.local", ".env.production"];
    for (const sf of sensitiveFiles) {
      const fp = path.join(PROJECT_ROOT, sf);
      if (fs.existsSync(fp)) {
        findings.push({ severity: "warning", category: "files", title: `${sf} file exists`, detail: `Sensitive config file found at project root` });
      }
    }

    try {
      const lockFiles = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"];
      const hasLock = lockFiles.some(l => fs.existsSync(path.join(PROJECT_ROOT, l)));
      if (!hasLock) {
        findings.push({ severity: "warning", category: "dependencies", title: "No lockfile found", detail: "Missing dependency lockfile" });
      }
    } catch {}
  } catch {}

  const criticalCount = findings.filter(f => f.severity === "critical").length;
  const warningCount = findings.filter(f => f.severity === "warning").length;

  res.json({
    findings,
    summary: { total: findings.length, critical: criticalCount, warning: warningCount, info: findings.length - criticalCount - warningCount },
    scannedAt: new Date().toISOString(),
  });
});

router.post("/security-scan-text", async (req, res): Promise<void> => {
  const { text } = req.body || {};
  if (!text) { res.status(400).json({ error: "text required" }); return; }

  const patterns = [
    { regex: /(?:sk-|pk_|rk_)[a-zA-Z0-9]{20,}/g, type: "API Key" },
    { regex: /(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{36,}/g, type: "GitHub Token" },
    { regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, type: "Private Key" },
    { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]\S+['"]/gi, type: "Hardcoded Password" },
    { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, type: "Email Address" },
    { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, type: "IP Address" },
  ];

  const findings: any[] = [];
  for (const p of patterns) {
    const matches = text.match(p.regex);
    if (matches) {
      findings.push({ type: p.type, count: matches.length, severity: p.type.includes("Key") || p.type.includes("Token") || p.type.includes("Password") ? "critical" : "info" });
    }
  }

  res.json({ findings, scannedLength: text.length });
});

router.get("/skills", async (_req, res): Promise<void> => {
  const skills: any[] = [];
  const skillsDir = path.join(PROJECT_ROOT, ".local/skills");
  try {
    if (fs.existsSync(skillsDir)) {
      const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const dir of dirs) {
        const skillMd = path.join(skillsDir, dir.name, "SKILL.md");
        if (fs.existsSync(skillMd)) {
          let description = "";
          try {
            const content = fs.readFileSync(skillMd, "utf-8");
            const descMatch = content.match(/description:\s*[|>]?\s*\n?\s*(.+)/);
            if (descMatch) description = descMatch[1].trim();
            else {
              const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("---") && !l.startsWith("#") && !l.startsWith("name:"));
              description = lines[0]?.trim() || "";
            }
          } catch {}
          skills.push({ id: dir.name, name: dir.name, description: description.substring(0, 200), category: "replit", enabled: true });
        }
      }
    }
  } catch {}

  const secondaryDir = path.join(PROJECT_ROOT, ".local/secondary_skills");
  try {
    if (fs.existsSync(secondaryDir)) {
      const dirs = fs.readdirSync(secondaryDir, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const dir of dirs) {
        skills.push({ id: `secondary-${dir.name}`, name: dir.name, description: "", category: "secondary", enabled: true });
      }
    }
  } catch {}

  res.json(skills);
});

router.get("/router-config", async (_req, res): Promise<void> => {
  const models = [
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", available: true, speed: "fast", cost: "$$" },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic", available: true, speed: "slow", cost: "$$$$" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic", available: true, speed: "fastest", cost: "$" },
  ];
  res.json({ models, defaultModel: "claude-sonnet-4-6", routingMode: "auto" });
});

router.post("/route-prompt", async (req, res): Promise<void> => {
  const { prompt, mode, model, messages: history, projectContext } = req.body || {};
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey || !baseUrl) { res.status(503).json({ error: "Anthropic not configured" }); return; }

  let selectedModel = "claude-sonnet-4-6";
  if (mode === "manual" && model) {
    selectedModel = model;
  } else if (mode === "auto") {
    const lower = prompt.toLowerCase();
    if (lower.length > 500 || lower.includes("architect") || lower.includes("complex") || lower.includes("refactor")) {
      selectedModel = "claude-opus-4-6";
    } else if (lower.length < 100 && (lower.includes("fix") || lower.includes("typo") || lower.includes("rename"))) {
      selectedModel = "claude-haiku-4-5";
    }
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`data: ${JSON.stringify({ type: "model_selected", model: selectedModel, name: selectedModel })}\n\n`);

  try {
    let systemPrompt = `You are an AI coding assistant in the Claude Workbench. Model: ${selectedModel}.`;
    if (projectContext) {
      systemPrompt += `\nProject: ${projectContext.title || "unknown"} (${projectContext.language || "TypeScript"})`;
    }

    const conversationMessages = (history || []).map((m: any) => ({ role: m.role, content: m.content }));
    conversationMessages.push({ role: "user", content: prompt });

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages: conversationMessages.slice(-20),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ type: "error", content: errText })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { res.write(`data: ${JSON.stringify({ type: "error", content: "No response body" })}\n\n`); res.end(); return; }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              totalTokens += parsed.delta.text.length / 4;
              res.write(`data: ${JSON.stringify({ type: "chunk", content: parsed.delta.text, model: selectedModel })}\n\n`);
            } else if (parsed.type === "message_stop") {
              res.write(`data: ${JSON.stringify({ type: "done", tokens: Math.round(totalTokens) })}\n\n`);
            }
          } catch {}
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done", tokens: Math.round(totalTokens) })}\n\n`);
    res.end();
  } catch (err: any) {
    try { res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`); res.end(); } catch {}
  }
});

router.post("/code-review", async (req, res): Promise<void> => {
  const { projectSlug } = req.body || {};
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey || !baseUrl) { res.status(503).json({ error: "Anthropic not configured" }); return; }

  try {
    let filesContent = "";
    let fileCount = 0;
    const scanDirs = ["artifacts/api-server/src", "artifacts/llm-hub/src", "lib"];

    for (const dir of scanDirs) {
      const fullDir = path.join(PROJECT_ROOT, dir);
      if (!fs.existsSync(fullDir)) continue;
      try {
        const output = execSync(`find ${fullDir} -name "*.ts" -o -name "*.tsx" | head -20`, { encoding: "utf-8", timeout: 5000 });
        const files = output.split("\n").filter(Boolean);
        for (const file of files.slice(0, 15)) {
          try {
            const content = fs.readFileSync(file, "utf-8");
            if (content.length < 5000) {
              filesContent += `\n--- ${path.relative(PROJECT_ROOT, file)} ---\n${content.substring(0, 3000)}\n`;
              fileCount++;
            }
          } catch {}
        }
      } catch {}
    }

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        system: "You are a senior code reviewer. Respond ONLY with valid JSON matching this schema: { overallGrade: 'A'|'B'|'C'|'D', overallSummary: string, securityAudit: { score: number(1-10), findings: string[] }, issues: [{ title: string, severity: 'critical'|'warning'|'info', category: string, file: string, line: number|null, detail: string, suggestion: string }] }",
        messages: [{ role: "user", content: `Review this codebase for bugs, security issues, and code quality:\n\n${filesContent.substring(0, 30000)}` }],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      res.status(502).json({
        error: "Upstream code-review request failed",
        code: "AI_REQUEST_FAILED" satisfies WorkbenchErrorCode,
        review: null,
        meta: null,
      });
      return;
    }

    const result = await response.json() as any;
    const text = result.content?.[0]?.text || "";

    let review;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      review = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      review = { overallGrade: "B", overallSummary: text.substring(0, 500), issues: [], securityAudit: { score: 7, findings: [] } };
    }

    res.json({ review, meta: { filesScanned: fileCount, model: "claude-haiku-4-5", slug: projectSlug } });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || "Code review failed",
      code: "INTERNAL_ERROR" satisfies WorkbenchErrorCode,
      review: null,
      meta: null,
    });
  }
});

router.get("/claude-code", async (req, res): Promise<void> => {
  const { prompt } = req.query as { prompt?: string };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey || !baseUrl) { res.status(503).json({ error: "Anthropic not configured" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const ccKeepAlive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch { clearInterval(ccKeepAlive); }
  }, 15000);

  const ccSystem = "You are Claude Code, an expert AI coding agent in the Claude Workbench. You write production-ready code, debug complex issues, and architect systems. Always provide complete working code with proper error handling.\n\nIMPORTANT: Always provide thorough, comprehensive, and complete responses. Do not cut your response short. When showing code, include the FULL implementation — never truncate, abbreviate, or use \"...\" placeholders. When explaining concepts, cover all important aspects. If your response is long, that is expected and preferred. The user needs complete, production-ready answers.";
  try {
    let msgs: any[] = [{ role: "user", content: prompt }];
    let continuations = 0;
    const maxContinuations = 5;

    while (continuations <= maxContinuations) {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 64000, stream: true, system: ccSystem, messages: msgs }),
        signal: AbortSignal.timeout(300000),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.write(`data: ${JSON.stringify({ type: "error", content: errText })}\n\n`);
        res.end();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { res.write(`data: ${JSON.stringify({ type: "error", content: "No response body" })}\n\n`); res.end(); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";
      let stopReason = "end_turn";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                accumulatedText += parsed.delta.text;
                res.write(`data: ${JSON.stringify({ type: "chunk", content: parsed.delta.text })}\n\n`);
              } else if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
                stopReason = parsed.delta.stop_reason;
              }
            } catch {}
          }
        }
      }

      console.log(`[claude-code] stop_reason=${stopReason}, textLen=${accumulatedText.length}, continuation=${continuations}`);

      if (stopReason === "max_tokens" && continuations < maxContinuations) {
        console.log(`[claude-code] Auto-continuing (${continuations + 1}/${maxContinuations})...`);
        msgs.push({ role: "assistant", content: accumulatedText });
        msgs.push({ role: "user", content: "Continue from where you left off. Do not repeat what you already said." });
        continuations++;
        continue;
      }

      break;
    }

    clearInterval(ccKeepAlive);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err: any) {
    clearInterval(ccKeepAlive);
    console.error(`[claude-code] Error:`, err.message);
    try { res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`); res.end(); } catch {}
  }
});

router.post("/create-project", requireAuth, async (req, res): Promise<void> => {
  const { name, template, description } = req.body || {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Project name is required" });
    return;
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!slug) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }

  const projectDir = path.join(PROJECT_ROOT, "projects", slug);

  try {
    const projectsDir = path.join(PROJECT_ROOT, "projects");
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }

    if (fs.existsSync(projectDir)) {
      res.status(409).json({ error: `Project "${slug}" already exists` });
      return;
    }

    fs.mkdirSync(projectDir, { recursive: true });

    const tmpl = template || "blank";
    if (tmpl === "node" || tmpl === "express") {
      const pkg = {
        name: slug,
        version: "1.0.0",
        description: description || "",
        main: "index.js",
        scripts: { start: tmpl === "express" ? "node index.js" : "node index.js", dev: tmpl === "express" ? "node --watch index.js" : "node --watch index.js" },
        dependencies: tmpl === "express" ? { express: "^4.21.0" } : {},
      };
      fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify(pkg, null, 2));
      if (tmpl === "express") {
        fs.writeFileSync(path.join(projectDir, "index.js"),
          `const express = require('express');\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello from ${name}!' });\n});\n\napp.listen(PORT, () => console.log(\`${name} running on port \${PORT}\`));\n`);
      } else {
        fs.writeFileSync(path.join(projectDir, "index.js"), `console.log('Hello from ${name}!');\n`);
      }
    } else if (tmpl === "python") {
      fs.writeFileSync(path.join(projectDir, "main.py"), `# ${name}\n# ${description || ''}\n\ndef main():\n    print("Hello from ${name}!")\n\nif __name__ == "__main__":\n    main()\n`);
      fs.writeFileSync(path.join(projectDir, "requirements.txt"), "");
    } else if (tmpl === "react") {
      const pkg = {
        name: slug,
        version: "1.0.0",
        description: description || "",
        scripts: { dev: "vite", build: "vite build" },
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: { vite: "^6.0.0", "@vitejs/plugin-react": "^4.0.0" },
      };
      fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify(pkg, null, 2));
      fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(projectDir, "src", "App.jsx"), `export default function App() {\n  return <div><h1>${name}</h1><p>${description || 'New React app'}</p></div>;\n}\n`);
      fs.writeFileSync(path.join(projectDir, "index.html"), `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8" /><title>${name}</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>\n</html>\n`);
      fs.writeFileSync(path.join(projectDir, "src", "main.jsx"), `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);\n`);
    } else if (tmpl === "html") {
      fs.writeFileSync(path.join(projectDir, "index.html"), `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${name}</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <h1>${name}</h1>\n  <p>${description || 'New project'}</p>\n  <script src="script.js"></script>\n</body>\n</html>\n`);
      fs.writeFileSync(path.join(projectDir, "style.css"), `body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }\n`);
      fs.writeFileSync(path.join(projectDir, "script.js"), `console.log('${name} loaded');\n`);
    } else {
      fs.writeFileSync(path.join(projectDir, "README.md"), `# ${name}\n\n${description || ''}\n`);
    }

    fs.writeFileSync(path.join(projectDir, ".gitignore"), "node_modules\ndist\n.env\n*.log\n");

    const files = fs.readdirSync(projectDir);
    res.json({
      success: true,
      project: { name, slug, template: tmpl, path: `projects/${slug}`, description: description || "" },
      files: files.map(f => ({ name: f, type: fs.statSync(path.join(projectDir, f)).isDirectory() ? "directory" : "file" })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/projects", async (_req, res): Promise<void> => {
  const projectsDir = path.join(PROJECT_ROOT, "projects");
  try {
    if (!fs.existsSync(projectsDir)) {
      res.json([]);
      return;
    }
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    const projects = dirs.map(d => {
      const dirPath = path.join(projectsDir, d.name);
      let description = "";
      let template = "blank";
      try {
        const pkgPath = path.join(dirPath, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          description = pkg.description || "";
          template = pkg.dependencies?.express ? "express" : pkg.dependencies?.react ? "react" : "node";
        } else if (fs.existsSync(path.join(dirPath, "main.py"))) {
          template = "python";
        } else if (fs.existsSync(path.join(dirPath, "index.html"))) {
          template = "html";
        }
      } catch {}
      const files = fs.readdirSync(dirPath);
      const stats = fs.statSync(dirPath);
      return {
        name: d.name,
        slug: d.name,
        path: `projects/${d.name}`,
        description,
        template,
        fileCount: files.length,
        createdAt: stats.birthtime?.toISOString() || stats.mtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
      };
    });
    res.json(projects);
  } catch (err: any) {
    res.json([]);
  }
});

router.delete("/projects/:slug", requireAuth, async (req, res): Promise<void> => {
  const { slug } = req.params;
  const projectDir = path.join(PROJECT_ROOT, "projects", slug);
  try {
    const relative = path.relative(path.join(PROJECT_ROOT, "projects"), projectDir);
    if (relative.startsWith("..") || path.isAbsolute(relative) || relative.includes("/")) {
      res.status(400).json({ error: "Invalid project slug" });
      return;
    }
    if (!fs.existsSync(projectDir)) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    fs.rmSync(projectDir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/upload", requireAuth, upload.array("files", 50), async (req, res): Promise<void> => {
  const targetPath = (req.body?.path as string) || ".";
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const results: any[] = [];

  try {
    const destDir = safePath(targetPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    for (const file of files) {
      const originalName = file.originalname;
      const isZip = originalName.toLowerCase().endsWith(".zip");

      if (isZip) {
        try {
          const extractDir = path.join(destDir, path.basename(originalName, ".zip"));
          if (!fs.existsSync(extractDir)) {
            fs.mkdirSync(extractDir, { recursive: true });
          }
          const zip = new AdmZip(file.path);
          zip.extractAllTo(extractDir, true);

          const extractedFiles: string[] = [];
          const walkDir = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) walkDir(full);
              else if (extractedFiles.length < 50) extractedFiles.push(full);
            }
          };
          try { walkDir(extractDir); } catch {}

          results.push({
            name: originalName,
            type: "zip",
            extractedTo: path.relative(PROJECT_ROOT, extractDir),
            fileCount: extractedFiles.length,
            files: extractedFiles.slice(0, 20).map(f => path.relative(extractDir, f)),
          });
        } catch (err: any) {
          fs.copyFileSync(file.path, path.join(destDir, originalName));
          results.push({
            name: originalName,
            type: "file",
            path: path.relative(PROJECT_ROOT, path.join(destDir, originalName)),
            size: file.size,
            note: "ZIP extraction failed, saved as file",
            error: err.message,
          });
        }
      } else {
        const destFile = path.join(destDir, originalName);
        fs.copyFileSync(file.path, destFile);
        results.push({
          name: originalName,
          type: "file",
          path: path.relative(PROJECT_ROOT, destFile),
          size: file.size,
          mimetype: file.mimetype,
        });
      }

      try { fs.unlinkSync(file.path); } catch {}
    }

    res.json({ success: true, uploaded: results.length, files: results });
  } catch (err: any) {
    console.error("[workbench/upload] Error:", err.message, "| destDir:", targetPath, "| PROJECT_ROOT:", PROJECT_ROOT);
    for (const file of files) {
      try { fs.unlinkSync(file.path); } catch {}
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
