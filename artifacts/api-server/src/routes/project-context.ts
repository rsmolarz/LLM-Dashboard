import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/rateLimiter";
import {
  resolveDescriptor,
  ensureCloned,
  listFiles,
  readFile,
  writeFile,
  execCommand,
  getSummary,
  getCloneInfo,
  pullLatest,
  type ProjectDescriptor,
} from "../lib/project-context";

const router: IRouter = Router();

function parseDescriptor(body: any): ProjectDescriptor | null {
  const d = body?.project;
  if (!d || typeof d !== "object") return null;
  if (!d.origin || !["local", "vps", "replit"].includes(d.origin)) return null;
  if (typeof d.path !== "string" || !d.path) return null;
  return {
    origin: d.origin,
    path: d.path,
    name: typeof d.name === "string" ? d.name : undefined,
    url: typeof d.url === "string" ? d.url : undefined,
    ssh: d.ssh && typeof d.ssh === "object" ? d.ssh : undefined,
  };
}

function gateVps(req: any, res: any, desc: ProjectDescriptor): boolean {
  if (desc.origin === "vps" && !req.user) {
    res.status(401).json({ error: "Authentication required for VPS-origin project access" });
    return false;
  }
  return true;
}

router.post("/summary", async (req, res): Promise<void> => {
  const desc = parseDescriptor(req.body);
  if (!desc) { res.status(400).json({ error: "project descriptor required" }); return; }
  if (!gateVps(req, res, desc)) return;
  try {
    const resolved = await resolveDescriptor(desc);
    if (!resolved) { res.status(400).json({ error: "could not resolve project" }); return; }
    const tokenBudget = typeof req.body.tokenBudget === "number" ? req.body.tokenBudget : 3000;
    const summary = await getSummary(resolved, { tokenBudget });
    res.json({
      summary,
      origin: resolved.origin,
      localPath: resolved.localPath,
      remotePath: resolved.remotePath,
      cloned: resolved.cloned,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/list", async (req, res): Promise<void> => {
  const desc = parseDescriptor(req.body);
  if (!desc) { res.status(400).json({ error: "project descriptor required" }); return; }
  if (!gateVps(req, res, desc)) return;
  try {
    const resolved = await resolveDescriptor(desc);
    if (!resolved) { res.status(400).json({ error: "could not resolve project" }); return; }
    const subPath = typeof req.body.subPath === "string" ? req.body.subPath : ".";
    const entries = await listFiles(resolved, subPath);
    res.json({ entries, origin: resolved.origin, subPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/read", async (req, res): Promise<void> => {
  const desc = parseDescriptor(req.body);
  if (!desc) { res.status(400).json({ error: "project descriptor required" }); return; }
  if (!gateVps(req, res, desc)) return;
  const filePath = typeof req.body.filePath === "string" ? req.body.filePath : "";
  if (!filePath) { res.status(400).json({ error: "filePath required" }); return; }
  try {
    const resolved = await resolveDescriptor(desc);
    if (!resolved) { res.status(400).json({ error: "could not resolve project" }); return; }
    const r = await readFile(resolved, filePath);
    res.json({ ...r, filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/write", requireAuth, async (req, res): Promise<void> => {
  const desc = parseDescriptor(req.body);
  if (!desc) { res.status(400).json({ error: "project descriptor required" }); return; }
  const filePath = typeof req.body.filePath === "string" ? req.body.filePath : "";
  const content = typeof req.body.content === "string" ? req.body.content : null;
  if (!filePath) { res.status(400).json({ error: "filePath required" }); return; }
  if (content === null) { res.status(400).json({ error: "content required" }); return; }
  try {
    const resolved = await resolveDescriptor(desc);
    if (!resolved) { res.status(400).json({ error: "could not resolve project" }); return; }
    const r = await writeFile(resolved, filePath, content);
    res.json({ ...r, filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/exec", requireAuth, async (req, res): Promise<void> => {
  const desc = parseDescriptor(req.body);
  if (!desc) { res.status(400).json({ error: "project descriptor required" }); return; }
  const command = typeof req.body.command === "string" ? req.body.command : "";
  if (!command) { res.status(400).json({ error: "command required" }); return; }
  try {
    const resolved = await resolveDescriptor(desc);
    if (!resolved) { res.status(400).json({ error: "could not resolve project" }); return; }
    const r = await execCommand(resolved, command);
    res.json(r);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ensure-clone", requireAuth, async (req, res): Promise<void> => {
  const desc = parseDescriptor(req.body);
  if (!desc) { res.status(400).json({ error: "project descriptor required" }); return; }
  if (desc.origin !== "replit") { res.status(400).json({ error: "ensure-clone only valid for replit projects" }); return; }
  try {
    const r = await ensureCloned(desc);
    let info = null;
    try { info = await getCloneInfo(desc); } catch {}
    res.json({ ...r, info });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/clone-info", async (req, res): Promise<void> => {
  const desc = parseDescriptor(req.body);
  if (!desc) { res.status(400).json({ error: "project descriptor required" }); return; }
  if (desc.origin !== "replit") { res.status(400).json({ error: "clone-info only valid for replit projects" }); return; }
  try {
    const info = await getCloneInfo(desc);
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/pull", requireAuth, async (req, res): Promise<void> => {
  const desc = parseDescriptor(req.body);
  if (!desc) { res.status(400).json({ error: "project descriptor required" }); return; }
  if (desc.origin !== "replit") { res.status(400).json({ error: "pull only valid for replit projects" }); return; }
  const discardLocal = req.body?.discardLocal === true;
  const stashAndReapply = req.body?.stashAndReapply === true;
  try {
    const r = await pullLatest(desc, { discardLocal, stashAndReapply });
    res.json(r);
  } catch (err: any) {
    if (err?.code === "DIRTY_WORKING_TREE") {
      res.status(409).json({ error: err.message, code: "DIRTY_WORKING_TREE", dirtyFiles: err.dirtyFiles || [] });
      return;
    }
    if (err?.code === "PULL_FAILED_AFTER_STASH") {
      res.status(500).json({
        error: err.message,
        code: "PULL_FAILED_AFTER_STASH",
        stashKept: !!err.stashKept,
        stashRef: err.stashRef || null,
        stashedFiles: err.stashedFiles || [],
      });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
