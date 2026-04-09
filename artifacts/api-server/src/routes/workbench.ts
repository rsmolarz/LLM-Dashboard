import { Router, type IRouter } from "express";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();
const PROJECT_ROOT = path.resolve(process.cwd(), "../..");

function safePath(requestedPath: string): string {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath);
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

router.post("/shell", async (req, res): Promise<void> => {
  const { command } = req.body || {};
  if (!command || typeof command !== "string") {
    res.status(400).json({ error: "command is required" });
    return;
  }

  const blocked = ["rm -rf /", "mkfs", "dd if=", ":(){", "fork bomb"];
  if (blocked.some(b => command.includes(b))) {
    res.json({ stdout: "", stderr: "Command blocked for safety", exitCode: 1 });
    return;
  }

  try {
    const stdout = execSync(command, {
      cwd: PROJECT_ROOT,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
      env: { ...process.env, TERM: "dumb" },
    });
    res.json({ stdout: stdout || "", stderr: "", exitCode: 0 });
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
    res.json({ items: [], error: err.message });
  }
});

router.get("/file-content", async (req, res): Promise<void> => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ error: "path is required" });
    return;
  }

  try {
    const fullPath = safePath(filePath);
    const stat = fs.statSync(fullPath);

    if (stat.size > 500000) {
      res.json({ error: "File too large (>500KB)", size: stat.size });
      return;
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    res.json({ content, size: stat.size, path: filePath });
  } catch (err: any) {
    res.json({ error: err.message });
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
    res.json({ error: err.message });
  }
});

router.post("/git", async (req, res): Promise<void> => {
  const { command } = req.body || {};
  if (!command || typeof command !== "string" || !command.startsWith("git ")) {
    res.status(400).json({ error: "Only git commands allowed" });
    return;
  }

  const dangerous = ["git push --force", "git reset --hard", "git clean -fd"];
  if (dangerous.some(d => command.includes(d))) {
    res.json({ stdout: "", stderr: "Dangerous git command blocked", exitCode: 1 });
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
    res.status(400).json({ error: "q parameter required" });
    return;
  }

  const lower = q.trim().toLowerCase();
  if (!lower.startsWith("select")) {
    res.status(400).json({ error: "Only SELECT queries allowed for safety" });
    return;
  }

  const forbidden = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "grant", "revoke", "exec"];
  if (forbidden.some(kw => lower.includes(kw))) {
    res.status(400).json({ error: "Query contains forbidden keyword" });
    return;
  }

  try {
    const result = await db.execute(sql.raw(q));
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    const fields = rows.length > 0 ? Object.keys(rows[0]) : [];
    res.json({ rows: rows.slice(0, 500), fields, rowCount: rows.length });
  } catch (err: any) {
    res.json({ error: err.message, rows: [], fields: [], rowCount: 0 });
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
    res.json({ entries: [], stats: null, error: err.message });
  }
});

router.post("/code-chat", async (req, res): Promise<void> => {
  const { prompt, messages: history } = req.body || {};
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

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    let projectContext = "";
    try {
      const pkgPath = path.join(PROJECT_ROOT, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        projectContext = `Project: ${pkg.name || "unknown"}\n`;
      }
      const dirs = fs.readdirSync(PROJECT_ROOT).filter(d => !d.startsWith(".") && d !== "node_modules").slice(0, 20);
      projectContext += `Top-level: ${dirs.join(", ")}\n`;
    } catch {}

    const conversationMessages = (history || []).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    conversationMessages.push({ role: "user", content: prompt });

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        stream: true,
        system: `You are an expert coding assistant integrated into the LLM Hub Workbench. You help with code analysis, debugging, refactoring, and writing new code. You have access to a TypeScript/React project with Express backend.${projectContext ? "\n\n" + projectContext : ""}`,
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
    if (!reader) {
      res.write(`data: ${JSON.stringify({ type: "error", content: "No response body" })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

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
              res.write(`data: ${JSON.stringify({ type: "chunk", content: parsed.delta.text })}\n\n`);
            } else if (parsed.type === "message_stop") {
              res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
            }
          } catch {}
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err: any) {
    try {
      res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
      res.end();
    } catch {}
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
      res.json({ error: "Review request failed", review: null, meta: null });
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
    res.json({ error: err.message, review: null, meta: null });
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

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        stream: true,
        system: "You are Claude Code, an expert AI coding agent in the Claude Workbench. You write production-ready code, debug complex issues, and architect systems. Always provide complete working code with proper error handling.",
        messages: [{ role: "user", content: prompt }],
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
              res.write(`data: ${JSON.stringify({ type: "chunk", content: parsed.delta.text })}\n\n`);
            } else if (parsed.type === "message_stop") {
              res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
            }
          } catch {}
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err: any) {
    try { res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`); res.end(); } catch {}
  }
});

export default router;
