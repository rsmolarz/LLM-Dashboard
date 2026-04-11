import { Router, type IRouter } from "express";
import { Client } from "ssh2";

const router: IRouter = Router();

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
          const fs = require("fs");
          const path = require("path");
          const PROJECT_ROOT = process.env.NODE_ENV === "production"
            ? process.cwd()
            : path.resolve(process.cwd(), "../..");
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
  ];

  const systemPrompt = `You are an expert Linux server administrator with SSH access to ${config.username}@${config.host}:${config.port}. You can execute commands on this server using the run_ssh_command and run_ssh_commands tools. When the user asks you to do something on the server, use these tools to actually execute the commands. Always show the user what you're running and the results. Be proactive — run commands first, then explain the results.`;

  const conversationMessages = (history || []).map((m: any) => ({ role: m.role, content: m.content }));
  conversationMessages.push({ role: "user", content: prompt });

  try {
    let messages = conversationMessages.slice(-30);
    let iterationCount = 0;
    const maxIterations = 10;

    while (iterationCount < maxIterations) {
      iterationCount++;
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4096, system: systemPrompt, tools, messages }),
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
