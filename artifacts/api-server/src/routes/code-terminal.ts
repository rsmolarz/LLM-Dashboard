import { Router } from "express";
import { execFile } from "child_process";
import { Agent } from "undici";
import { resolve, normalize } from "path";
import { db, llmConfigTable } from "@workspace/db";

const router = Router();

const WORKSPACE_ROOT = resolve(process.cwd(), "../..");

function sanitizePath(inputPath: string): string | null {
  const resolved = resolve(WORKSPACE_ROOT, inputPath);
  const normalized = normalize(resolved);
  if (!normalized.startsWith(WORKSPACE_ROOT)) return null;
  return normalized;
}

const OPENROUTER_BASE_URL = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || "";

const ollamaAgent = new Agent({
  headersTimeout: 600000,
  bodyTimeout: 600000,
  connectTimeout: 30000,
});

function isOpenRouterModel(model: string): boolean {
  return model.includes("/");
}

async function getServerUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  return config?.serverUrl || null;
}

let cachedORModels: any[] | null = null;
let cachedORAt = 0;

async function fetchOpenRouterModels(): Promise<any[]> {
  if (cachedORModels && Date.now() - cachedORAt < 300000) return cachedORModels;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return cachedORModels || [];
    const data: any = await r.json();
    cachedORModels = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length,
      pricing: m.pricing,
      source: "openrouter" as const,
    }));
    cachedORAt = Date.now();
    return cachedORModels;
  } catch {
    return cachedORModels || [];
  }
}

const BLOCKED_COMMANDS = [
  "rm -rf /", "mkfs", "dd if=", ":(){", "fork bomb",
  "shutdown", "reboot", "halt", "poweroff", "init 0", "init 6",
];

const MAX_OUTPUT_LENGTH = 50000;
const COMMAND_TIMEOUT = 30000;

router.get("/models", async (_req, res): Promise<void> => {
  try {
    const serverUrl = await getServerUrl();
    let ollamaModels: any[] = [];
    if (serverUrl) {
      try {
        const r = await fetch(`${serverUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const data: any = await r.json();
          ollamaModels = (data.models || []).map((m: any) => ({
            id: m.name,
            name: m.name,
            size: m.size,
            source: "ollama" as const,
          }));
        }
      } catch {}
    }

    let orModels: any[] = [];
    try {
      orModels = await fetchOpenRouterModels();
    } catch {}

    res.json({ ollama: ollamaModels, openrouter: orModels });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/chat", async (req, res): Promise<void> => {
  const { model, messages, temperature = 0.3, max_tokens, stream = true } = req.body;

  if (!model || !messages?.length) {
    res.status(400).json({ error: "model and messages are required" });
    return;
  }

  if (isOpenRouterModel(model)) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      const orRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://llm-hub.replit.app",
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens, stream: true }),
        signal: AbortSignal.timeout(300000),
      });

      if (!orRes.ok) {
        const errText = await orRes.text();
        res.write(`data: ${JSON.stringify({ error: errText })}\n\n`);
        res.end();
        return;
      }

      const reader = orRes.body?.getReader();
      if (!reader) { res.end(); return; }

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
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              res.write("data: [DONE]\n\n");
            } else {
              try {
                const chunk = JSON.parse(payload);
                const content = chunk.choices?.[0]?.delta?.content;
                if (content) {
                  res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
                if (chunk.choices?.[0]?.finish_reason === "stop") {
                  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                }
              } catch {}
            }
          }
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
    return;
  }

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    res.status(503).json({ error: "Ollama server not configured" });
    return;
  }

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      const options: any = { temperature };
      if (max_tokens) options.num_predict = max_tokens;

      const ollamaRes = await fetch(`${serverUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true, options }),
        signal: AbortSignal.timeout(300000),
        // @ts-ignore
        dispatcher: ollamaAgent,
      });

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text();
        res.write(`data: ${JSON.stringify({ error: errText })}\n\n`);
        res.end();
        return;
      }

      const reader = ollamaRes.body?.getReader();
      if (!reader) { res.end(); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.message?.content) {
              res.write(`data: ${JSON.stringify({ content: chunk.message.content })}\n\n`);
            }
            if (chunk.done) {
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            }
          } catch {}
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
    return;
  }

  try {
    const options: any = { temperature };
    if (max_tokens) options.num_predict = max_tokens;

    const ollamaRes = await fetch(`${serverUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false, options }),
      signal: AbortSignal.timeout(120000),
      // @ts-ignore
      dispatcher: ollamaAgent,
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      res.status(502).json({ error: errText });
      return;
    }

    const data: any = await ollamaRes.json();
    res.json({ content: data.message?.content || "", model: data.model });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

router.post("/exec", async (req, res): Promise<void> => {
  const { command } = req.body;

  if (!command || typeof command !== "string") {
    res.status(400).json({ error: "command is required" });
    return;
  }

  const trimmed = command.trim();
  if (!trimmed) {
    res.status(400).json({ error: "command cannot be empty" });
    return;
  }

  const lower = trimmed.toLowerCase();
  for (const blocked of BLOCKED_COMMANDS) {
    if (lower.includes(blocked)) {
      res.status(403).json({ error: `Command blocked for safety: contains '${blocked}'` });
      return;
    }
  }

  try {
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      exec(trimmed, {
        timeout: COMMAND_TIMEOUT,
        maxBuffer: 1024 * 1024,
        cwd: process.cwd(),
        env: { ...process.env, TERM: "xterm-256color" },
      }, (error, stdout, stderr) => {
        if (error && !stdout && !stderr) {
          reject(error);
          return;
        }
        resolve({
          stdout: stdout ? stdout.slice(0, MAX_OUTPUT_LENGTH) : "",
          stderr: stderr ? stderr.slice(0, MAX_OUTPUT_LENGTH) : "",
        });
      });
    });

    res.json(result);
  } catch (err: any) {
    res.json({
      stdout: "",
      stderr: "",
      error: err.message || "Command execution failed",
      exitCode: err.code || 1,
    });
  }
});

router.post("/read-file", async (req, res): Promise<void> => {
  const { path: filePath } = req.body;
  if (!filePath || typeof filePath !== "string") {
    res.status(400).json({ error: "path is required" });
    return;
  }

  const safePath = sanitizePath(filePath);
  if (!safePath) {
    res.status(403).json({ error: "Access denied: path outside workspace" });
    return;
  }

  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(safePath, "utf-8");
    res.json({ content: content.slice(0, MAX_OUTPUT_LENGTH) });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.post("/write-file", async (req, res): Promise<void> => {
  const { path: filePath, content } = req.body;
  if (!filePath || typeof filePath !== "string") {
    res.status(400).json({ error: "path is required" });
    return;
  }
  if (typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const safePath = sanitizePath(filePath);
  if (!safePath) {
    res.status(403).json({ error: "Access denied: path outside workspace" });
    return;
  }

  try {
    const fs = await import("fs/promises");
    const { dirname } = await import("path");
    await fs.mkdir(dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, "utf-8");
    res.json({ success: true, path: filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/list-files", async (req, res): Promise<void> => {
  const { path: dirPath = "." } = req.body;

  const safePath = sanitizePath(dirPath);
  if (!safePath) {
    res.status(403).json({ error: "Access denied: path outside workspace" });
    return;
  }

  try {
    const fs = await import("fs/promises");
    const pathMod = await import("path");
    const entries = await fs.readdir(safePath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async e => {
      const fullPath = pathMod.join(safePath, e.name);
      let size = 0;
      try {
        if (!e.isDirectory()) {
          const stat = await fs.stat(fullPath);
          size = stat.size;
        }
      } catch {}
      return {
        name: e.name,
        isDirectory: e.isDirectory(),
        size,
        path: pathMod.relative(WORKSPACE_ROOT, fullPath) || ".",
      };
    }));
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ files, path: pathMod.relative(WORKSPACE_ROOT, safePath) || "." });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.post("/clone-repo", async (req, res): Promise<void> => {
  const { url, targetDir } = req.body;

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const urlPattern = /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+/;
  if (!urlPattern.test(url)) {
    res.status(400).json({ error: "Only HTTPS URLs from GitHub, GitLab, or Bitbucket are supported" });
    return;
  }

  const repoName = url.split("/").pop()?.replace(/\.git$/, "") || "repo";
  const dest = targetDir || `projects/${repoName}`;
  const safeDest = sanitizePath(dest);
  if (!safeDest) {
    res.status(403).json({ error: "Access denied: path outside workspace" });
    return;
  }

  try {
    const fs = await import("fs/promises");
    const pathMod = await import("path");

    let alreadyExists = false;
    try {
      await fs.access(safeDest);
      alreadyExists = true;
    } catch {}

    if (alreadyExists) {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile("git", ["-C", safeDest, "pull"], {
          timeout: 60000,
          maxBuffer: 1024 * 1024,
        }, (error, stdout, stderr) => {
          if (error) { reject(new Error(stderr || error.message)); return; }
          resolve({ stdout, stderr });
        });
      });
      res.json({ success: true, action: "pulled", path: dest, output: result.stdout || result.stderr });
      return;
    }

    const parentDir = pathMod.dirname(safeDest);
    await fs.mkdir(parentDir, { recursive: true });

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile("git", ["clone", "--depth", "1", url, safeDest], {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        if (error) { reject(new Error(stderr || error.message)); return; }
        resolve({ stdout, stderr });
      });
    });
    res.json({ success: true, action: "cloned", path: dest, output: result.stdout || result.stderr });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/projects", async (_req, res): Promise<void> => {
  try {
    const fs = await import("fs/promises");
    const pathMod = await import("path");

    const projects: any[] = [];

    const scanDir = async (dir: string, label: string) => {
      try {
        const entries = await fs.readdir(resolve(WORKSPACE_ROOT, dir), { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          if (e.name.startsWith(".") || e.name === "node_modules") continue;
          const fullPath = pathMod.join(dir, e.name);
          const relativePath = fullPath;
          let hasPackageJson = false;
          let description = "";
          try {
            const pkg = JSON.parse(await fs.readFile(resolve(WORKSPACE_ROOT, fullPath, "package.json"), "utf-8"));
            hasPackageJson = true;
            description = pkg.description || "";
          } catch {}
          let isGit = false;
          try {
            await fs.access(resolve(WORKSPACE_ROOT, fullPath, ".git"));
            isGit = true;
          } catch {}
          projects.push({
            name: e.name,
            path: relativePath,
            source: label,
            hasPackageJson,
            isGit,
            description,
          });
        }
      } catch {}
    };

    await scanDir("artifacts", "artifact");
    await scanDir("lib", "library");
    await scanDir("projects", "project");

    const rootEntries = await fs.readdir(WORKSPACE_ROOT, { withFileTypes: true });
    for (const e of rootEntries) {
      if (!e.isDirectory()) continue;
      if (["artifacts", "lib", "node_modules", ".local", ".git", ".replit-artifact", "scripts", ".canvas", "projects"].includes(e.name)) continue;
      if (e.name.startsWith(".")) continue;
      let hasPackageJson = false;
      try {
        await fs.access(resolve(WORKSPACE_ROOT, e.name, "package.json"));
        hasPackageJson = true;
      } catch {}
      let isGit = false;
      try {
        await fs.access(resolve(WORKSPACE_ROOT, e.name, ".git"));
        isGit = true;
      } catch {}
      if (hasPackageJson || isGit) {
        projects.push({
          name: e.name,
          path: e.name,
          source: "root",
          hasPackageJson,
          isGit,
          description: "",
        });
      }
    }

    res.json({ projects });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
