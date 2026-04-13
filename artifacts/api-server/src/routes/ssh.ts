import { Router, type IRouter } from "express";
import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";
import { db, llmConfigTable } from "@workspace/db";

const router: IRouter = Router();

const PROJECT_ROOT = process.env.NODE_ENV === "production"
  ? process.cwd()
  : path.resolve(process.cwd(), "../..");

function safePath(requestedPath: string): string {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath);
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

function getSSHConfig(body: any): SSHConfig {
  return {
    host: body.host || process.env.SSH_HOST || "",
    port: parseInt(body.port || process.env.SSH_PORT || "22", 10),
    username: body.username || process.env.SSH_USERNAME || "",
    password: body.password || process.env.SSH_PASSWORD || undefined,
    privateKey: body.privateKey || process.env.SSH_PRIVATE_KEY || undefined,
  };
}

router.post("/ssh/test", async (req, res): Promise<void> => {
  const config = getSSHConfig(req.body);

  if (!config.host || !config.username) {
    res.status(400).json({ error: "Host and username are required" });
    return;
  }

  if (!config.password && !config.privateKey) {
    res.status(400).json({ error: "Password or private key is required" });
    return;
  }

  const conn = new Client();
  const timeout = setTimeout(() => {
    conn.end();
    res.status(504).json({ error: "Connection timed out after 10s" });
  }, 10000);

  conn
    .on("ready", () => {
      clearTimeout(timeout);
      conn.end();
      res.json({ connected: true, host: config.host, username: config.username });
    })
    .on("error", (err) => {
      clearTimeout(timeout);
      res.status(502).json({ error: `SSH connection failed: ${err.message}` });
    })
    .connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      readyTimeout: 10000,
    });
});

router.post("/ssh/exec", async (req, res): Promise<void> => {
  const config = getSSHConfig(req.body);
  const { command } = req.body;

  if (!command) {
    res.status(400).json({ error: "Command is required" });
    return;
  }

  if (!config.host || !config.username) {
    res.status(400).json({ error: "SSH not configured. Set host and username." });
    return;
  }

  if (!config.password && !config.privateKey) {
    res.status(400).json({ error: "Password or private key is required" });
    return;
  }

  const conn = new Client();
  let responded = false;
  const timeout = setTimeout(() => {
    conn.end();
    if (!responded) {
      responded = true;
      res.status(504).json({ error: "Command timed out after 30s" });
    }
  }, 30000);

  conn
    .on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          if (!responded) {
            responded = true;
            res.status(500).json({ error: err.message });
          }
          return;
        }

        let stdout = "";
        let stderr = "";

        stream
          .on("close", (code: number) => {
            clearTimeout(timeout);
            conn.end();
            if (!responded) {
              responded = true;
              res.json({ stdout, stderr, exitCode: code });
            }
          })
          .on("data", (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
      });
    })
    .on("error", (err) => {
      clearTimeout(timeout);
      res.status(502).json({ error: `SSH connection failed: ${err.message}` });
    })
    .connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      readyTimeout: 10000,
    });
});

router.post("/ssh/upload-file", async (req, res): Promise<void> => {
  const config = getSSHConfig(req.body);
  const { localPath, remotePath, content, contentBase64 } = req.body;

  if (!remotePath) {
    res.status(400).json({ error: "remotePath is required" });
    return;
  }

  if (!config.host || !config.username) {
    res.status(400).json({ error: "SSH not configured" });
    return;
  }

  if (!config.password && !config.privateKey) {
    res.status(400).json({ error: "Password or private key is required" });
    return;
  }

  const conn = new Client();
  const timeout = setTimeout(() => {
    conn.end();
    res.status(504).json({ error: "Upload timed out after 60s" });
  }, 60000);

  conn
    .on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          res.status(500).json({ error: `SFTP error: ${err.message}` });
          return;
        }

        if (content !== undefined || contentBase64 !== undefined) {
          const buf = contentBase64 ? Buffer.from(contentBase64, "base64") : Buffer.from(content, "utf-8");
          const parentDir = path.posix.dirname(remotePath);
          sftp.mkdir(parentDir, (mkdirErr) => {
            const writeStream = sftp.createWriteStream(remotePath);
            writeStream.on("close", () => {
              clearTimeout(timeout);
              conn.end();
              res.json({ success: true, remotePath, size: buf.length });
            });
            writeStream.on("error", (e: Error) => {
              clearTimeout(timeout);
              conn.end();
              res.status(500).json({ error: `Write failed: ${e.message}` });
            });
            writeStream.end(buf);
          });
        } else if (localPath) {
          const fullLocal = path.resolve(PROJECT_ROOT, localPath);
          const relative = path.relative(PROJECT_ROOT, fullLocal);
          if (relative.startsWith("..") || path.isAbsolute(relative)) {
            clearTimeout(timeout);
            conn.end();
            res.status(400).json({ error: "Path traversal not allowed" });
            return;
          }

          sftp.fastPut(fullLocal, remotePath, (putErr: Error | undefined) => {
            clearTimeout(timeout);
            conn.end();
            if (putErr) {
              res.status(500).json({ error: `Upload failed: ${putErr.message}` });
            } else {
              const stats = fs.statSync(fullLocal);
              res.json({ success: true, localPath, remotePath, size: stats.size });
            }
          });
        } else {
          clearTimeout(timeout);
          conn.end();
          res.status(400).json({ error: "Either content or localPath is required" });
        }
      });
    })
    .on("error", (err) => {
      clearTimeout(timeout);
      res.status(502).json({ error: `SSH connection failed: ${err.message}` });
    })
    .connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      readyTimeout: 10000,
    });
});

router.post("/ssh/list-remote", async (req, res): Promise<void> => {
  const config = getSSHConfig(req.body);
  const { path: remotePath } = req.body;

  if (!config.host || !config.username) {
    res.status(400).json({ error: "SSH not configured" });
    return;
  }

  if (!config.password && !config.privateKey) {
    res.status(400).json({ error: "Password or private key is required" });
    return;
  }

  const conn = new Client();
  const timeout = setTimeout(() => {
    conn.end();
    res.status(504).json({ error: "Timed out" });
  }, 15000);

  conn
    .on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          res.status(500).json({ error: err.message });
          return;
        }

        sftp.readdir(remotePath || "/", (rdErr, list) => {
          clearTimeout(timeout);
          conn.end();
          if (rdErr) {
            res.status(500).json({ error: rdErr.message });
            return;
          }
          const entries = list.map((item) => ({
            name: item.filename,
            type: (item.attrs as any).isDirectory?.() ? "directory" :
                  item.longname.startsWith("d") ? "directory" : "file",
            size: item.attrs.size,
            modified: item.attrs.mtime,
          }));
          entries.sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          res.json({ path: remotePath || "/", entries });
        });
      });
    })
    .on("error", (err) => {
      clearTimeout(timeout);
      res.status(502).json({ error: err.message });
    })
    .connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      readyTimeout: 10000,
    });
});

function listLocalFiles(dirPath: string): { name: string; type: string; size: number; path: string }[] {
  const fullPath = safePath(dirPath);
  if (!fs.existsSync(fullPath)) return [];
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  return entries
    .filter(e => !e.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })
    .map(e => {
      const itemPath = path.join(dirPath, e.name);
      const stats = fs.statSync(path.join(fullPath, e.name));
      return { name: e.name, type: e.isDirectory() ? "directory" : "file", size: stats.size, path: itemPath };
    });
}

function readLocalFile(filePath: string): string {
  const fullPath = safePath(filePath);
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) throw new Error(`${filePath} is a directory, not a file`);
  if (stats.size > 500000) throw new Error(`File too large (${stats.size} bytes). Max 500KB.`);
  return fs.readFileSync(fullPath, "utf-8");
}

function sftpUpload(config: SSHConfig, localFilePath: string, remoteFilePath: string): Promise<{ success: boolean; size: number }> {
  const fullLocal = safePath(localFilePath);
  if (!fs.existsSync(fullLocal)) throw new Error(`Local file not found: ${localFilePath}`);
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => { conn.end(); reject(new Error("Upload timed out after 60s")); }, 60000);
    conn
      .on("ready", () => {
        conn.sftp((err, sftp) => {
          if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
          sftp.fastPut(fullLocal, remoteFilePath, (putErr: Error | undefined) => {
            clearTimeout(timeout);
            conn.end();
            if (putErr) reject(putErr);
            else {
              const stats = fs.statSync(fullLocal);
              resolve({ success: true, size: stats.size });
            }
          });
        });
      })
      .on("error", (err) => { clearTimeout(timeout); reject(err); })
      .connect({ host: config.host, port: config.port, username: config.username, password: config.password, privateKey: config.privateKey, readyTimeout: 10000 });
  });
}

function walkDir(dirPath: string, base: string = ""): string[] {
  const fullPath = safePath(dirPath);
  const results: string[] = [];
  if (!fs.existsSync(fullPath)) return results;
  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...walkDir(path.join(dirPath, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

function execSSH(config: SSHConfig, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => { conn.end(); reject(new Error("Command timed out after 30s")); }, 30000);
    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
          let stdout = "";
          let stderr = "";
          stream
            .on("close", (code: number) => { clearTimeout(timeout); conn.end(); resolve({ stdout, stderr, exitCode: code }); })
            .on("data", (d: Buffer) => { stdout += d.toString(); })
            .stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
        });
      })
      .on("error", (err) => { clearTimeout(timeout); reject(err); })
      .connect({ host: config.host, port: config.port, username: config.username, password: config.password, privateKey: config.privateKey, readyTimeout: 10000 });
  });
}

router.post("/ssh/ai-chat", async (req, res): Promise<void> => {
  const config = getSSHConfig(req.body);
  const { prompt, messages: history, modelOverride } = req.body;

  if (!prompt) { res.status(400).json({ error: "prompt is required" }); return; }
  if (!config.host || !config.username) { res.status(400).json({ error: "SSH not configured" }); return; }

  const [llmConfig] = await db.select().from(llmConfigTable).limit(1);
  const serverUrl = llmConfig?.serverUrl;

  const openrouterKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  const openrouterBaseUrl = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const anthropicBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";

  let ollamaOnline = false;
  if (serverUrl) {
    try {
      const check = await fetch(`${serverUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      ollamaOnline = check.ok;
    } catch {}
  }

  let useOllama = false;
  let useAnthropic = false;
  let activeModel = "google/gemini-2.5-flash";
  let provider = "openrouter";

  if (modelOverride) {
    if (modelOverride.startsWith("ollama/")) {
      useOllama = true;
      activeModel = modelOverride.replace("ollama/", "");
      provider = "ollama";
    } else if (modelOverride.startsWith("anthropic/")) {
      useAnthropic = true;
      activeModel = modelOverride.replace("anthropic/", "");
      provider = "anthropic";
    } else if (modelOverride.startsWith("openrouter/")) {
      activeModel = modelOverride.replace("openrouter/", "");
      provider = "openrouter";
    }
  } else {
    if (openrouterKey) {
      provider = "openrouter";
      activeModel = "google/gemini-2.5-flash";
    } else if (ollamaOnline) {
      useOllama = true;
      provider = "ollama";
      activeModel = (llmConfig as any)?.defaultModel || "llama3.2:latest";
    }
  }

  if (!useOllama && !useAnthropic && !openrouterKey) {
    res.status(503).json({ error: "No AI provider available. Configure OpenRouter integration or connect Ollama." });
    return;
  }
  if (useOllama && !ollamaOnline) {
    res.status(503).json({ error: `Ollama at ${serverUrl} is offline. Choose a cloud model or start Ollama on your VPS.` });
    return;
  }
  if (useAnthropic && !anthropicKey) {
    res.status(503).json({ error: "Anthropic integration not configured." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const ollamaTools = [
    {
      type: "function",
      function: {
        name: "run_ssh_command",
        description: "Execute a command on the remote server via SSH. Returns stdout, stderr, and exit code.",
        parameters: { type: "object", properties: { command: { type: "string", description: "The shell command to execute" } }, required: ["command"] },
      },
    },
    {
      type: "function",
      function: {
        name: "run_ssh_commands",
        description: "Execute multiple commands sequentially on the remote server. Use for multi-step operations.",
        parameters: { type: "object", properties: { commands: { type: "array", items: { type: "string" }, description: "Array of shell commands to execute in order" } }, required: ["commands"] },
      },
    },
    {
      type: "function",
      function: {
        name: "list_local_files",
        description: "List files and directories in the local workspace. Use to discover project files. Start with '.' to see all top-level directories and files.",
        parameters: { type: "object", properties: { path: { type: "string", description: "Directory path to list, e.g. '.' or 'claw-code-agent/src' or 'projects/my-app'" } }, required: ["path"] },
      },
    },
    {
      type: "function",
      function: {
        name: "read_local_file",
        description: "Read the contents of a local file. Use to review code, check for errors, or understand project structure. Max 500KB per file.",
        parameters: { type: "object", properties: { path: { type: "string", description: "File path to read, e.g. 'claw-code-agent/src/main.py' or 'projects/my-app/index.js'" } }, required: ["path"] },
      },
    },
    {
      type: "function",
      function: {
        name: "read_remote_file",
        description: "Read the contents of a file on the remote VPS server via SSH. Use to review code that was uploaded to the server, check config files, or inspect deployed files. Max 500KB.",
        parameters: { type: "object", properties: { path: { type: "string", description: "Absolute path on the remote server, e.g. '/tmp/uploads/main.py' or '/root/my-app/index.js'" } }, required: ["path"] },
      },
    },
    {
      type: "function",
      function: {
        name: "list_remote_files",
        description: "List files and directories on the remote VPS server. Use to explore uploaded files or deployed projects on the server.",
        parameters: { type: "object", properties: { path: { type: "string", description: "Absolute directory path on the remote server, e.g. '/tmp/uploads' or '/root/my-app'" } }, required: ["path"] },
      },
    },
    {
      type: "function",
      function: {
        name: "transfer_file_to_remote",
        description: "Transfer a local project file to the remote server via SFTP. Use to deploy code files to the VPS.",
        parameters: {
          type: "object",
          properties: {
            local_path: { type: "string", description: "Local file path, e.g. 'projects/my-app/index.js'" },
            remote_path: { type: "string", description: "Remote destination path on the server, e.g. '/root/my-app/index.js'" },
          },
          required: ["local_path", "remote_path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "transfer_directory_to_remote",
        description: "Transfer all files in a local directory to a remote directory on the server via SFTP. Recursively uploads all files preserving directory structure. Use for deploying entire projects.",
        parameters: {
          type: "object",
          properties: {
            local_dir: { type: "string", description: "Local directory path, e.g. 'projects/my-app'" },
            remote_dir: { type: "string", description: "Remote destination directory, e.g. '/root/my-app'" },
          },
          required: ["local_dir", "remote_dir"],
        },
      },
    },
  ];

  const systemPrompt = `You are an expert Linux server administrator and developer with SSH access to ${config.username}@${config.host}:${config.port}. You have powerful capabilities:

1. **SSH Commands**: Execute commands on the remote server using run_ssh_command and run_ssh_commands tools.
2. **Local File Access**: Browse and read local workspace files using list_local_files and read_local_file tools. Attached/uploaded files are stored locally in "attached_assets/".
3. **Remote File Access**: Browse and read files on the VPS using list_remote_files and read_remote_file tools.
4. **File Transfer**: Deploy files from local workspace to VPS using transfer_file_to_remote (single file) or transfer_directory_to_remote (entire directory).

## File Attachment Workflow
Users can attach files (including .zip files) to this chat using the paperclip button. When they do:
- Files are saved LOCALLY to "attached_assets/" in the workspace (NOT on the VPS)
- ZIP files are automatically extracted locally to "attached_assets/<zipname>/"
- You will see a message like "Attached 1 file: project.zip" in the conversation
- Use list_local_files with path "attached_assets" to see attached files
- Use read_local_file to review the code

## When asked to "review code" or "review my code":
1. Use list_local_files on "attached_assets/" to see what was attached
2. Use read_local_file to read and review each relevant source file
3. Provide code review feedback: bugs, improvements, security issues, best practices

## When asked to "deploy" or "deploy the code":
1. Find the project files in the local workspace (attached_assets/ or other directories)
2. Review the code structure and understand what it needs
3. Create the deployment directory on VPS: run_ssh_command("mkdir -p /root/<project-name>")
4. Use transfer_directory_to_remote to upload the project from local workspace to VPS
5. Install dependencies (pip install, npm install, etc.)
6. Set up and start the service (systemd, pm2, screen, etc.)

IMPORTANT: Always provide thorough, comprehensive responses. Be proactive — take action first, then explain results. When deploying, create remote directories with mkdir -p first. Always use tools — do not just describe what to do. When the user says "review your code" or "review the code", they mean the project code, NOT your own AI architecture. Attached files are LOCAL, not on the VPS — use list_local_files and read_local_file to access them.`;

  let availableDirs = "";
  try {
    const entries = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith(".") && !["node_modules", "dist"].includes(e.name))
      .map(e => e.name);
    availableDirs = `\n\nAVAILABLE LOCAL DIRECTORIES (use these paths with list_local_files and read_local_file):\n${dirs.map(d => `- ${d}/`).join("\n")}`;
  } catch {}

  const conversationMessages: any[] = [{ role: "system", content: systemPrompt + availableDirs }];
  if (history && Array.isArray(history)) {
    const filtered = history.filter((m: any) => {
      if (m.role === "assistant" && typeof m.content === "string") {
        const lower = m.content.toLowerCase();
        if (lower.includes("unable to access") || lower.includes("appears empty") || lower.includes("could you please confirm") || lower.includes("exact local path") || lower.includes("exact path")) return false;
      }
      return true;
    });
    const recent = filtered.slice(-10);
    for (const m of recent) {
      conversationMessages.push({ role: m.role, content: m.content });
    }
  }
  conversationMessages.push({ role: "user", content: prompt });

  if (!modelOverride && !useOllama && !ollamaOnline) {
    res.write(`data: ${JSON.stringify({ type: "text", content: "⚠️ Ollama is offline — using cloud model.\n\n" })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ type: "routing", provider, model: activeModel })}\n\n`);

  try {
    let messages = conversationMessages.slice(-30);
    let iterationCount = 0;
    const maxIterations = 20;

    while (iterationCount < maxIterations) {
      iterationCount++;

      const heartbeat = setInterval(() => {
        try { res.write(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`); } catch {}
      }, 10000);

      let llmResponse: Response;
      try {
      if (useOllama) {
        llmResponse = await fetch(`${serverUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: activeModel,
            messages,
            tools: ollamaTools,
            stream: false,
            options: { temperature: 0.3, num_predict: 4096 },
          }),
          signal: AbortSignal.timeout(600000),
        });
      } else if (useAnthropic) {
        const anthropicMessages = messages.filter((m: any) => m.role !== "system");
        const systemContent = messages.find((m: any) => m.role === "system")?.content || "";
        const anthropicTools = ollamaTools.map((t: any) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        }));
        llmResponse = await fetch(`${anthropicBaseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: activeModel,
            system: systemContent,
            messages: anthropicMessages,
            tools: anthropicTools,
            max_tokens: 8192,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(120000),
        });
      } else {
        let retries = 0;
        const maxRetries = 3;
        while (true) {
          llmResponse = await fetch(`${openrouterBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${openrouterKey}`,
              "HTTP-Referer": "https://llm-hub.replit.app",
            },
            body: JSON.stringify({
              model: activeModel,
              messages,
              tools: ollamaTools,
              temperature: 0.3,
              max_tokens: 8192,
            }),
            signal: AbortSignal.timeout(120000),
          });
          if (llmResponse.status === 429 && retries < maxRetries) {
            retries++;
            const retryAfter = parseInt(llmResponse.headers.get("retry-after") || "10", 10);
            const waitTime = Math.min(retryAfter, 30) * 1000;
            res.write(`data: ${JSON.stringify({ type: "text", content: `⏳ Rate limited, retrying in ${Math.ceil(waitTime / 1000)}s...\n` })}\n\n`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          break;
        }
      }
      } finally {
        clearInterval(heartbeat);
      }

      if (!llmResponse.ok) {
        const errText = await llmResponse.text();
        res.write(`data: ${JSON.stringify({ type: "error", content: `${provider} error ${llmResponse.status}: ${errText}` })}\n\n`);
        res.end();
        return;
      }

      const result = await llmResponse.json() as any;

      let assistantMsg: any;
      let toolCalls: any[] | undefined;

      if (useAnthropic) {
        const textParts = (result.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
        const toolParts = (result.content || []).filter((c: any) => c.type === "tool_use");
        if (textParts) {
          res.write(`data: ${JSON.stringify({ type: "text", content: textParts })}\n\n`);
        }
        toolCalls = toolParts.length > 0 ? toolParts.map((t: any) => ({
          id: t.id,
          function: { name: t.name, arguments: t.input },
        })) : undefined;
        assistantMsg = { role: "assistant", content: result.content };
      } else {
        assistantMsg = useOllama ? result.message : result.choices?.[0]?.message;
        if (assistantMsg?.content) {
          res.write(`data: ${JSON.stringify({ type: "text", content: assistantMsg.content })}\n\n`);
        }
        toolCalls = assistantMsg?.tool_calls;
      }

      if (!toolCalls || toolCalls.length === 0) {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
        return;
      }

      messages.push(assistantMsg);

      for (const tc of toolCalls) {
        const toolName = tc.function?.name;
        const rawArgs = tc.function?.arguments;
        const toolArgs = typeof rawArgs === "string" ? JSON.parse(rawArgs) : (rawArgs || {});
        let toolResult = "";

        try {
          if (toolName === "run_ssh_command") {
            const cmd = toolArgs.command;
            res.write(`data: ${JSON.stringify({ type: "command", command: cmd })}\n\n`);
            const cmdResult = await execSSH(config, cmd);
            res.write(`data: ${JSON.stringify({ type: "command_result", command: cmd, ...cmdResult })}\n\n`);
            toolResult = JSON.stringify(cmdResult);
          } else if (toolName === "run_ssh_commands") {
            const results: any[] = [];
            for (const cmd of toolArgs.commands) {
              res.write(`data: ${JSON.stringify({ type: "command", command: cmd })}\n\n`);
              const cmdResult = await execSSH(config, cmd);
              res.write(`data: ${JSON.stringify({ type: "command_result", command: cmd, ...cmdResult })}\n\n`);
              results.push({ command: cmd, ...cmdResult });
            }
            toolResult = JSON.stringify(results);
          } else if (toolName === "list_local_files") {
            const dirPath = toolArgs.path;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[local] ls ${dirPath}` })}\n\n`);
            const files = listLocalFiles(dirPath);
            const summary = files.map((f: any) => `${f.type === "directory" ? "dir" : "file"}: ${f.name}${f.type === "file" ? ` (${f.size} bytes)` : ""}`).join("\n");
            res.write(`data: ${JSON.stringify({ type: "command_result", command: `[local] ls ${dirPath}`, stdout: summary || "(empty directory)", stderr: "", exitCode: 0 })}\n\n`);
            toolResult = JSON.stringify(files);
          } else if (toolName === "read_local_file") {
            const filePath = toolArgs.path;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[local] cat ${filePath}` })}\n\n`);
            const content = readLocalFile(filePath);
            const preview = content.length > 2000 ? content.slice(0, 2000) + `\n... (${content.length} chars total)` : content;
            res.write(`data: ${JSON.stringify({ type: "command_result", command: `[local] cat ${filePath}`, stdout: preview, stderr: "", exitCode: 0 })}\n\n`);
            toolResult = content;
          } else if (toolName === "read_remote_file") {
            const remotePath = toolArgs.path;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[vps] cat ${remotePath}` })}\n\n`);
            const result = await execSSH(config, `head -c 512000 ${JSON.stringify(remotePath)}`);
            if (result.exitCode !== 0) {
              res.write(`data: ${JSON.stringify({ type: "command_result", command: `[vps] cat ${remotePath}`, stdout: "", stderr: result.stderr || "File not found", exitCode: result.exitCode })}\n\n`);
              toolResult = `Error reading file: ${result.stderr}`;
            } else {
              const preview = result.stdout.length > 2000 ? result.stdout.slice(0, 2000) + `\n... (${result.stdout.length} chars total)` : result.stdout;
              res.write(`data: ${JSON.stringify({ type: "command_result", command: `[vps] cat ${remotePath}`, stdout: preview, stderr: "", exitCode: 0 })}\n\n`);
              toolResult = result.stdout;
            }
          } else if (toolName === "list_remote_files") {
            const remotePath = toolArgs.path;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[vps] ls -la ${remotePath}` })}\n\n`);
            const result = await execSSH(config, `ls -la ${JSON.stringify(remotePath)} 2>&1`);
            res.write(`data: ${JSON.stringify({ type: "command_result", command: `[vps] ls -la ${remotePath}`, stdout: result.stdout || "(empty)", stderr: result.stderr, exitCode: result.exitCode })}\n\n`);
            toolResult = result.stdout || result.stderr;
          } else if (toolName === "transfer_file_to_remote") {
            const { local_path, remote_path } = toolArgs;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[sftp] ${local_path} -> ${remote_path}` })}\n\n`);
            const uploadResult = await sftpUpload(config, local_path, remote_path);
            res.write(`data: ${JSON.stringify({ type: "command_result", command: `[sftp] ${local_path} -> ${remote_path}`, stdout: `Transferred ${uploadResult.size} bytes`, stderr: "", exitCode: 0 })}\n\n`);
            toolResult = JSON.stringify(uploadResult);
          } else if (toolName === "transfer_directory_to_remote") {
            const { local_dir, remote_dir } = toolArgs;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[sftp] ${local_dir}/ -> ${remote_dir}/` })}\n\n`);
            const allFiles = walkDir(local_dir);
            const uploadResults: any[] = [];
            let successCount = 0;
            let failCount = 0;
            await execSSH(config, `mkdir -p ${remote_dir}`);
            const dirs = new Set<string>();
            for (const f of allFiles) {
              const dir = path.dirname(f);
              if (dir !== "." && !dirs.has(dir)) {
                dirs.add(dir);
                await execSSH(config, `mkdir -p ${remote_dir}/${dir}`);
              }
            }
            for (const f of allFiles) {
              const localFilePath = `${local_dir}/${f}`;
              const remoteFilePath = `${remote_dir}/${f}`;
              try {
                const r = await sftpUpload(config, localFilePath, remoteFilePath);
                uploadResults.push({ file: f, success: true, size: r.size });
                successCount++;
                res.write(`data: ${JSON.stringify({ type: "text", content: "" })}\n\n`);
              } catch (err: any) {
                uploadResults.push({ file: f, success: false, error: err.message });
                failCount++;
              }
            }
            const summary = `Transferred ${successCount}/${allFiles.length} files${failCount > 0 ? ` (${failCount} failed)` : ""}`;
            res.write(`data: ${JSON.stringify({ type: "command_result", command: `[sftp] ${local_dir}/ -> ${remote_dir}/`, stdout: summary, stderr: "", exitCode: failCount > 0 ? 1 : 0 })}\n\n`);
            toolResult = JSON.stringify({ summary, files: uploadResults });
          } else {
            toolResult = `Unknown tool: ${toolName}`;
          }
        } catch (err: any) {
          const errMsg = `Error: ${err.message}`;
          res.write(`data: ${JSON.stringify({ type: "command_error", error: errMsg })}\n\n`);
          toolResult = errMsg;
        }

        if (useOllama) {
          messages.push({ role: "tool", content: toolResult });
        } else if (useAnthropic) {
          messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: tc.id, content: toolResult }] });
        } else {
          messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
    res.end();
  }
});

router.get("/vps-projects", async (req, res): Promise<void> => {
  const config: SSHConfig = {
    host: process.env.SSH_HOST || "",
    port: parseInt(process.env.SSH_PORT || "22", 10),
    username: process.env.SSH_USERNAME || "",
    password: process.env.SSH_PASSWORD || undefined,
    privateKey: process.env.SSH_PRIVATE_KEY || undefined,
  };

  if (!config.host || !config.username) {
    res.json({ projects: [] });
    return;
  }

  const conn = new Client();
  const timeout = setTimeout(() => { conn.end(); res.json({ projects: [] }); }, 10000);

  conn.on("ready", () => {
    const cmd = `find /root -maxdepth 2 -name "package.json" -o -name ".git" 2>/dev/null | head -60`;
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timeout); conn.end(); res.json({ projects: [] }); return; }
      let output = "";
      stream.on("data", (d: Buffer) => { output += d.toString(); });
      stream.on("close", () => {
        clearTimeout(timeout);
        conn.end();
        const dirs = new Map<string, { hasPackageJson: boolean; isGit: boolean }>();
        for (const line of output.split("\n").filter(Boolean)) {
          const dir = line.replace(/\/(package\.json|\.git)$/, "");
          if (dir === "/root") continue;
          const existing = dirs.get(dir) || { hasPackageJson: false, isGit: false };
          if (line.endsWith("package.json")) existing.hasPackageJson = true;
          if (line.endsWith(".git")) existing.isGit = true;
          dirs.set(dir, existing);
        }
        const projects = Array.from(dirs.entries()).map(([dirPath, info]) => ({
          name: dirPath.split("/").pop() || dirPath,
          path: dirPath,
          source: "vps",
          hasPackageJson: info.hasPackageJson,
          isGit: info.isGit,
          description: "",
          language: info.hasPackageJson ? "TypeScript" : "Project",
          origin: "vps",
          status: "live",
        }));
        res.json({ projects });
      });
    });
  });

  conn.on("error", () => {
    clearTimeout(timeout);
    res.json({ projects: [] });
  });

  try {
    conn.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      readyTimeout: 8000,
    });
  } catch {
    clearTimeout(timeout);
    res.json({ projects: [] });
  }
});

export default router;
