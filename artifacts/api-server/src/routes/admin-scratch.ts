/**
 * Admin endpoints for inspecting and managing other users' scratch
 * dirs. Mounted under `/api/admin/...` in `routes/index.ts`.
 *
 * - GET    /api/admin/scratch                          → host total + per-user
 *                                                       overview (largest first;
 *                                                       same payload as
 *                                                       `GET /api/admin/workbench-usage`).
 * - GET    /api/admin/scratch?userIdHash=…[&path=…]   → list contents of one
 *                                                       user's scratch dir,
 *                                                       same shape as
 *                                                       `GET /api/workbench/scratch`.
 * - DELETE /api/admin/scratch?userIdHash=…&path=…     → delete a single entry
 *                                                       inside one user's
 *                                                       scratch dir.
 * - POST   /api/admin/scratch/clear?userIdHash=…      → wipe all real entries
 *                                                       in one user's scratch
 *                                                       and re-sync the
 *                                                       host-mirror symlinks.
 *
 * All routes are gated by `requireAdmin`. The on-disk dir name is
 * the SHA-256-truncated `<hash>` of the user's id (see
 * `lib/user-workspace.ts`); admins identify users by the same
 * `userIdHash` that the listing endpoint returns. Operating by raw
 * userId is intentionally unsupported because the hash is one-way
 * and the listing only ever surfaces hashes — keeping the surface
 * hash-only avoids ambiguity about which encoding the caller is
 * passing.
 */

import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/rateLimiter";
import {
  getHostUsageInfo,
  listScratchEntriesByHash,
  deleteScratchEntryByHash,
  clearScratchDirByHash,
} from "../lib/user-workspace";

const router: IRouter = Router();

/**
 * Map a `ScratchPathError.code` to a HTTP status. Mirrors
 * `scratchErrorStatus` in `routes/workbench.ts` so the per-user and
 * admin endpoints surface identical errors for identical conditions.
 */
function scratchErrorStatus(code: string | undefined): number {
  switch (code) {
    case "ESCAPE": return 400;
    case "EROOT": return 400;
    case "ESYMLINK": return 400;
    case "ENOTDIR": return 400;
    case "EARG": return 400;
    case "ENOENT": return 404;
    default: return 500;
  }
}

router.get("/admin/scratch", requireAdmin, (req, res) => {
  const userIdHash = typeof req.query.userIdHash === "string" ? req.query.userIdHash : "";
  // No `userIdHash` → return the same host-wide overview the
  // workbench-usage endpoint returns. This keeps a single REST
  // surface for "list every user's scratch dir" and "list one
  // user's scratch contents" so the admin UI can paginate one→many
  // with one query param flip.
  if (!userIdHash) {
    res.json(getHostUsageInfo());
    return;
  }
  const subPath = typeof req.query.path === "string" ? req.query.path : "";
  try {
    const result = listScratchEntriesByHash(userIdHash, subPath);
    res.json(result);
  } catch (err: any) {
    const code = typeof err?.code === "string" ? err.code : undefined;
    res.status(scratchErrorStatus(code)).json({
      error: err?.message || "Failed to list scratch dir",
      code: code || "INTERNAL_ERROR",
    });
  }
});

router.delete("/admin/scratch", requireAdmin, (req, res) => {
  const userIdHash = typeof req.query.userIdHash === "string" ? req.query.userIdHash : "";
  const subPath = typeof req.query.path === "string" ? req.query.path : "";
  if (!userIdHash) {
    res.status(400).json({ error: "userIdHash query param is required", code: "EARG" });
    return;
  }
  if (!subPath) {
    res.status(400).json({ error: "path query param is required", code: "EARG" });
    return;
  }
  try {
    const result = deleteScratchEntryByHash(userIdHash, subPath);
    res.json(result);
  } catch (err: any) {
    const code = typeof err?.code === "string" ? err.code : undefined;
    res.status(scratchErrorStatus(code)).json({
      error: err?.message || "Failed to delete scratch entry",
      code: code || "INTERNAL_ERROR",
    });
  }
});

router.post("/admin/scratch/clear", requireAdmin, (req, res) => {
  const userIdHash = typeof req.query.userIdHash === "string" ? req.query.userIdHash : "";
  if (!userIdHash) {
    res.status(400).json({ error: "userIdHash query param is required", code: "EARG" });
    return;
  }
  try {
    const result = clearScratchDirByHash(userIdHash);
    res.json(result);
  } catch (err: any) {
    const code = typeof err?.code === "string" ? err.code : undefined;
    res.status(scratchErrorStatus(code)).json({
      error: err?.message || "Failed to clear scratch dir",
      code: code || "INTERNAL_ERROR",
    });
  }
});

export default router;
