/**
 * Admin endpoints for managing Workbench scratch-disk caps and viewing
 * usage. Mounted under `/api/admin/...` in `routes/index.ts`.
 *
 * - GET  /api/admin/workbench-quotas  → current per-user + host caps
 *                                       (plus compile-time defaults).
 * - PUT  /api/admin/workbench-quotas  → update either / both caps at
 *                                       runtime. Pass `null` for a
 *                                       field to restore its default.
 * - GET  /api/admin/workbench-usage   → host total usage + per-user
 *                                       breakdown (largest-first).
 * - POST /api/admin/workbench-evict   → run the cleanup + host-cap
 *                                       eviction sweep on demand and
 *                                       return the report.
 *
 * All routes require admin role (gated by `requireAdmin`). Updates to
 * the caps are in-memory only — they take effect immediately on the
 * running process but do NOT persist across restarts. The intended
 * workflow is "incident response now, redeploy with new env-var
 * defaults later".
 */

import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/rateLimiter";
import {
  getUserQuotaBytes,
  getHostQuotaBytes,
  getQuotaDefaults,
  setUserQuotaBytes,
  setHostQuotaBytes,
  getHostUsageInfo,
  cleanupAbandonedScratchDirs,
} from "../lib/user-workspace";

const router: IRouter = Router();

router.get("/admin/workbench-quotas", requireAdmin, (_req, res) => {
  res.json({
    userQuotaBytes: getUserQuotaBytes(),
    hostQuotaBytes: getHostQuotaBytes(),
    defaults: getQuotaDefaults(),
  });
});

/**
 * PUT body shape:
 *   { userQuotaBytes?: number | null, hostQuotaBytes?: number | null }
 * - omitted field → leave unchanged
 * - explicit null → restore the env-var-or-compile-time default
 * - positive integer → use as the new live cap
 *
 * Validation is deliberately strict: a fat-fingered "1024.5" or "-1"
 * would be a recipe for incident-on-top-of-incident, so we reject
 * anything that isn't a positive integer (or null) up front.
 */
router.put("/admin/workbench-quotas", requireAdmin, (req, res) => {
  const body = (req.body ?? {}) as {
    userQuotaBytes?: number | null;
    hostQuotaBytes?: number | null;
  };

  const hasUser = Object.prototype.hasOwnProperty.call(body, "userQuotaBytes");
  const hasHost = Object.prototype.hasOwnProperty.call(body, "hostQuotaBytes");
  if (!hasUser && !hasHost) {
    res.status(400).json({ error: "Provide userQuotaBytes and/or hostQuotaBytes" });
    return;
  }

  function isValid(v: unknown): v is number | null {
    if (v === null) return true;
    return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v > 0;
  }

  if (hasUser && !isValid(body.userQuotaBytes)) {
    res.status(400).json({ error: "userQuotaBytes must be a positive integer or null" });
    return;
  }
  if (hasHost && !isValid(body.hostQuotaBytes)) {
    res.status(400).json({ error: "hostQuotaBytes must be a positive integer or null" });
    return;
  }

  try {
    if (hasUser) setUserQuotaBytes(body.userQuotaBytes ?? null);
    if (hasHost) setHostQuotaBytes(body.hostQuotaBytes ?? null);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "failed to update quotas" });
    return;
  }

  res.json({
    userQuotaBytes: getUserQuotaBytes(),
    hostQuotaBytes: getHostQuotaBytes(),
    defaults: getQuotaDefaults(),
  });
});

router.get("/admin/workbench-usage", requireAdmin, (_req, res) => {
  res.json(getHostUsageInfo());
});

/**
 * Trigger the same cleanup sweep that normally runs hourly: TTL
 * removal first, then largest-first eviction until the host tree
 * fits the host cap. Returns the report (lists of removed/evicted
 * `<hash>` names + any errors) so operators can confirm what just
 * happened.
 */
router.post("/admin/workbench-evict", requireAdmin, (_req, res) => {
  try {
    const report = cleanupAbandonedScratchDirs();
    res.json({
      removed: report.removed,
      evicted: report.evicted,
      kept: report.kept,
      errors: report.errors,
      usage: getHostUsageInfo(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "eviction sweep failed" });
  }
});

export default router;
