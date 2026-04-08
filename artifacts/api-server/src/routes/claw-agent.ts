import { Router, type IRouter } from "express";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative, extname } from "path";

const router: IRouter = Router();

const AGENT_ROOT = join(process.cwd(), "..", "..", "claw-code-agent");

const ALLOWED_EXTENSIONS = new Set([
  ".py", ".json", ".toml", ".md", ".txt", ".sh", ".yaml", ".yml", ".cfg", ".ini", ".gitignore",
]);

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
  children?: FileNode[];
}

async function buildTree(dirPath: string, basePath: string, depth = 0): Promise<FileNode[]> {
  if (depth > 5) return [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    const sorted = entries
      .filter(e => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "__pycache__" && e.name !== ".git")
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of sorted) {
      const fullPath = join(dirPath, entry.name);
      const relPath = relative(basePath, fullPath);

      if (entry.isDirectory()) {
        const children = await buildTree(fullPath, basePath, depth + 1);
        nodes.push({ name: entry.name, path: relPath, type: "directory", children });
      } else {
        const ext = extname(entry.name).toLowerCase();
        if (ALLOWED_EXTENSIONS.has(ext) || entry.name === ".gitignore") {
          const stats = await stat(fullPath);
          nodes.push({ name: entry.name, path: relPath, type: "file", size: stats.size, extension: ext });
        }
      }
    }
    return nodes;
  } catch {
    return [];
  }
}

router.get("/claw-agent/tree", async (_req, res): Promise<void> => {
  try {
    const tree = await buildTree(AGENT_ROOT, AGENT_ROOT);
    res.json({ success: true, tree });
  } catch (err) {
    res.json({ success: false, tree: [], error: err instanceof Error ? err.message : "Failed to read directory" });
  }
});

router.get("/claw-agent/file", async (req, res): Promise<void> => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ success: false, error: "path query parameter required" });
    return;
  }

  const normalized = filePath.replace(/\.\./g, "");
  const fullPath = join(AGENT_ROOT, normalized);

  if (!fullPath.startsWith(AGENT_ROOT)) {
    res.status(403).json({ success: false, error: "Access denied" });
    return;
  }

  try {
    const content = await readFile(fullPath, "utf-8");
    const ext = extname(fullPath).toLowerCase();
    res.json({ success: true, content, path: normalized, extension: ext });
  } catch (err) {
    res.status(404).json({ success: false, error: "File not found" });
  }
});

router.get("/claw-agent/info", async (_req, res): Promise<void> => {
  try {
    const pyprojectPath = join(AGENT_ROOT, "pyproject.toml");
    let pyproject = "";
    try {
      pyproject = await readFile(pyprojectPath, "utf-8");
    } catch {}

    const nameMatch = pyproject.match(/name\s*=\s*"([^"]+)"/);
    const versionMatch = pyproject.match(/version\s*=\s*"([^"]+)"/);
    const descMatch = pyproject.match(/description\s*=\s*"([^"]+)"/);

    const srcDir = join(AGENT_ROOT, "src");
    let fileCount = 0;
    try {
      const srcFiles = await readdir(srcDir);
      fileCount = srcFiles.filter(f => f.endsWith(".py")).length;
    } catch {}

    res.json({
      success: true,
      name: nameMatch?.[1] || "claw-code-agent",
      version: versionMatch?.[1] || "0.1.0",
      description: descMatch?.[1] || "Python reimplementation of Claude Code agent",
      pythonFiles: fileCount,
      features: [
        "Interactive Chat Mode",
        "Streaming Output",
        "Plugin Runtime",
        "Nested Agent Delegation",
        "Cost Tracking & Budgets",
        "Context Compaction",
        "Ollama Support",
        "MCP Transport",
        "Task & Plan Runtime",
        "Workflow Runtime",
      ],
    });
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : "Failed to read info" });
  }
});

export default router;
