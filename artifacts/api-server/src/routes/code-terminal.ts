import { Router } from "express";
import { exec } from "child_process";

const router = Router();

const BLOCKED_COMMANDS = [
  "rm -rf /",
  "mkfs",
  "dd if=",
  ":(){",
  "fork bomb",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "init 0",
  "init 6",
];

const MAX_OUTPUT_LENGTH = 50000;
const COMMAND_TIMEOUT = 30000;

router.post("/code-terminal/exec", async (req, res): Promise<void> => {
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

router.post("/code-terminal/read-file", async (req, res): Promise<void> => {
  const { path: filePath } = req.body;
  if (!filePath || typeof filePath !== "string") {
    res.status(400).json({ error: "path is required" });
    return;
  }

  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(filePath, "utf-8");
    res.json({ content: content.slice(0, MAX_OUTPUT_LENGTH) });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.post("/code-terminal/write-file", async (req, res): Promise<void> => {
  const { path: filePath, content } = req.body;
  if (!filePath || typeof filePath !== "string") {
    res.status(400).json({ error: "path is required" });
    return;
  }
  if (typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    res.json({ success: true, path: filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/code-terminal/list-files", async (req, res): Promise<void> => {
  const { path: dirPath = "." } = req.body;

  try {
    const fs = await import("fs/promises");
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    })).sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ files });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
