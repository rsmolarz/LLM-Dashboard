import { Router, type IRouter } from "express";
import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";

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
  const timeout = setTimeout(() => {
    conn.end();
    res.status(504).json({ error: "Command timed out after 30s" });
  }, 30000);

  conn
    .on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          res.status(500).json({ error: err.message });
          return;
        }

        let stdout = "";
        let stderr = "";

        stream
          .on("close", (code: number) => {
            clearTimeout(timeout);
            conn.end();
            res.json({ stdout, stderr, exitCode: code });
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
  const { localPath, remotePath, content } = req.body;

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

        if (content !== undefined) {
          const writeStream = sftp.createWriteStream(remotePath);
          writeStream.on("close", () => {
            clearTimeout(timeout);
            conn.end();
            res.json({ success: true, remotePath, size: Buffer.byteLength(content) });
          });
          writeStream.on("error", (e: Error) => {
            clearTimeout(timeout);
            conn.end();
            res.status(500).json({ error: `Write failed: ${e.message}` });
          });
          writeStream.end(content);
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
  const { prompt, messages: history } = req.body;

  if (!prompt) { res.status(400).json({ error: "prompt is required" }); return; }
  if (!config.host || !config.username) { res.status(400).json({ error: "SSH not configured" }); return; }

  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey || !baseUrl) { res.status(503).json({ error: "Anthropic AI integration not configured" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const tools = [
    {
      name: "run_ssh_command",
      description: "Execute a command on the remote server via SSH. Returns stdout, stderr, and exit code.",
      input_schema: { type: "object" as const, properties: { command: { type: "string" as const, description: "The shell command to execute" } }, required: ["command"] },
    },
    {
      name: "run_ssh_commands",
      description: "Execute multiple commands sequentially on the remote server. Use for multi-step operations.",
      input_schema: { type: "object" as const, properties: { commands: { type: "array" as const, items: { type: "string" as const }, description: "Array of shell commands to execute in order" } }, required: ["commands"] },
    },
    {
      name: "list_local_files",
      description: "List files and directories in a local project directory. Use to discover uploaded project files. Start with 'projects' to see all uploaded projects.",
      input_schema: { type: "object" as const, properties: { path: { type: "string" as const, description: "Directory path to list, e.g. 'projects' or 'projects/my-app/src'" } }, required: ["path"] },
    },
    {
      name: "read_local_file",
      description: "Read the contents of a local project file. Use to review code, check for errors, or understand project structure. Max 500KB per file.",
      input_schema: { type: "object" as const, properties: { path: { type: "string" as const, description: "File path to read, e.g. 'projects/my-app/index.js'" } }, required: ["path"] },
    },
    {
      name: "transfer_file_to_remote",
      description: "Transfer a local project file to the remote server via SFTP. Use to deploy code files to the VPS.",
      input_schema: {
        type: "object" as const,
        properties: {
          local_path: { type: "string" as const, description: "Local file path, e.g. 'projects/my-app/index.js'" },
          remote_path: { type: "string" as const, description: "Remote destination path on the server, e.g. '/root/my-app/index.js'" },
        },
        required: ["local_path", "remote_path"],
      },
    },
    {
      name: "transfer_directory_to_remote",
      description: "Transfer all files in a local directory to a remote directory on the server via SFTP. Recursively uploads all files preserving directory structure. Use for deploying entire projects.",
      input_schema: {
        type: "object" as const,
        properties: {
          local_dir: { type: "string" as const, description: "Local directory path, e.g. 'projects/my-app'" },
          remote_dir: { type: "string" as const, description: "Remote destination directory, e.g. '/root/my-app'" },
        },
        required: ["local_dir", "remote_dir"],
      },
    },
  ];

  const systemPrompt = `You are an expert Linux server administrator and developer with SSH access to ${config.username}@${config.host}:${config.port}. You have powerful capabilities:

1. **SSH Commands**: Execute commands on the remote server using run_ssh_command and run_ssh_commands tools.
2. **Local File Access**: Browse and read uploaded project files using list_local_files and read_local_file tools. Files are uploaded by the user and stored in the 'projects/' directory.
3. **File Transfer**: Deploy files to the VPS using transfer_file_to_remote (single file) or transfer_directory_to_remote (entire directory) tools.

When the user asks you to review, fix, or deploy code:
- First use list_local_files to see what's in 'projects/'
- Use read_local_file to review the code and check for errors
- Fix any issues by reading and understanding the code
- Use transfer_file_to_remote or transfer_directory_to_remote to deploy files to the server
- Run SSH commands to set up the environment, install dependencies, and start services

IMPORTANT: Always provide thorough, comprehensive, and complete responses. Do not cut your response short. When showing command output, include all relevant details. Be proactive — take action first, then explain the results. When deploying, make sure to create remote directories first using mkdir -p.`;

  const conversationMessages = (history || []).map((m: any) => ({ role: m.role, content: m.content }));
  conversationMessages.push({ role: "user", content: prompt });

  try {
    let messages = conversationMessages.slice(-30);
    let iterationCount = 0;
    const maxIterations = 20;

    while (iterationCount < maxIterations) {
      iterationCount++;
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 64000, system: systemPrompt, tools, messages }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.write(`data: ${JSON.stringify({ type: "error", content: errText })}\n\n`);
        res.end();
        return;
      }

      const result = await response.json() as any;

      let textContent = "";
      const toolUses: any[] = [];

      for (const block of result.content) {
        if (block.type === "text") {
          textContent += block.text;
          res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
        } else if (block.type === "tool_use") {
          toolUses.push(block);
        }
      }

      if (toolUses.length === 0 && result.stop_reason === "max_tokens") {
        messages.push({ role: "assistant", content: result.content });
        messages.push({ role: "user", content: "Continue from where you left off." });
        continue;
      }

      if (toolUses.length === 0) {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
        return;
      }

      messages.push({ role: "assistant", content: result.content });

      const toolResults: any[] = [];
      for (const tool of toolUses) {
        try {
          if (tool.name === "run_ssh_command") {
            const cmd = tool.input.command;
            res.write(`data: ${JSON.stringify({ type: "command", command: cmd })}\n\n`);
            const cmdResult = await execSSH(config, cmd);
            res.write(`data: ${JSON.stringify({ type: "command_result", command: cmd, ...cmdResult })}\n\n`);
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(cmdResult) });
          } else if (tool.name === "run_ssh_commands") {
            const results: any[] = [];
            for (const cmd of tool.input.commands) {
              res.write(`data: ${JSON.stringify({ type: "command", command: cmd })}\n\n`);
              const cmdResult = await execSSH(config, cmd);
              res.write(`data: ${JSON.stringify({ type: "command_result", command: cmd, ...cmdResult })}\n\n`);
              results.push({ command: cmd, ...cmdResult });
            }
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(results) });
          } else if (tool.name === "list_local_files") {
            const dirPath = tool.input.path;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[local] ls ${dirPath}` })}\n\n`);
            const files = listLocalFiles(dirPath);
            const summary = files.map(f => `${f.type === "directory" ? "📁" : "📄"} ${f.name}${f.type === "file" ? ` (${f.size} bytes)` : ""}`).join("\n");
            res.write(`data: ${JSON.stringify({ type: "command_result", command: `[local] ls ${dirPath}`, stdout: summary || "(empty directory)", stderr: "", exitCode: 0 })}\n\n`);
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(files) });
          } else if (tool.name === "read_local_file") {
            const filePath = tool.input.path;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[local] cat ${filePath}` })}\n\n`);
            const content = readLocalFile(filePath);
            const preview = content.length > 2000 ? content.slice(0, 2000) + `\n... (${content.length} chars total)` : content;
            res.write(`data: ${JSON.stringify({ type: "command_result", command: `[local] cat ${filePath}`, stdout: preview, stderr: "", exitCode: 0 })}\n\n`);
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content });
          } else if (tool.name === "transfer_file_to_remote") {
            const { local_path, remote_path } = tool.input;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[sftp] ${local_path} → ${remote_path}` })}\n\n`);
            const result = await sftpUpload(config, local_path, remote_path);
            res.write(`data: ${JSON.stringify({ type: "command_result", command: `[sftp] ${local_path} → ${remote_path}`, stdout: `Transferred ${result.size} bytes`, stderr: "", exitCode: 0 })}\n\n`);
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(result) });
          } else if (tool.name === "transfer_directory_to_remote") {
            const { local_dir, remote_dir } = tool.input;
            res.write(`data: ${JSON.stringify({ type: "command", command: `[sftp] ${local_dir}/ → ${remote_dir}/` })}\n\n`);
            const files = walkDir(local_dir);
            const results: any[] = [];
            let successCount = 0;
            let failCount = 0;
            await execSSH(config, `mkdir -p ${remote_dir}`);
            const dirs = new Set<string>();
            for (const f of files) {
              const dir = path.dirname(f);
              if (dir !== "." && !dirs.has(dir)) {
                dirs.add(dir);
                await execSSH(config, `mkdir -p ${remote_dir}/${dir}`);
              }
            }
            for (const f of files) {
              const localFilePath = `${local_dir}/${f}`;
              const remoteFilePath = `${remote_dir}/${f}`;
              try {
                const r = await sftpUpload(config, localFilePath, remoteFilePath);
                results.push({ file: f, success: true, size: r.size });
                successCount++;
              } catch (err: any) {
                results.push({ file: f, success: false, error: err.message });
                failCount++;
              }
            }
            const summary = `Transferred ${successCount}/${files.length} files${failCount > 0 ? ` (${failCount} failed)` : ""}`;
            res.write(`data: ${JSON.stringify({ type: "command_result", command: `[sftp] ${local_dir}/ → ${remote_dir}/`, stdout: summary, stderr: "", exitCode: failCount > 0 ? 1 : 0 })}\n\n`);
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify({ summary, files: results }) });
          }
        } catch (err: any) {
          const errMsg = `Error: ${err.message}`;
          res.write(`data: ${JSON.stringify({ type: "command_error", error: errMsg })}\n\n`);
          toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: errMsg, is_error: true });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
    res.end();
  }
});

export default router;
