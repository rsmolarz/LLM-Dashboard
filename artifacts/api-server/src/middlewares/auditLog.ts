import { type Request, type Response, type NextFunction } from "express";
import { db, auditLogsTable } from "@workspace/db";

const PHI_ROUTES = new Set([
  "/api/clinical",
  "/api/voice-agent",
  "/api/memory",
  "/api/chat",
  "/api/rag",
  "/api/research",
  "/api/data-agent",
]);

const SKIP_ROUTES = new Set([
  "/api/health/events",
  "/api/llm/status",
]);

function isPHIRoute(path: string): boolean {
  for (const route of PHI_ROUTES) {
    if (path.startsWith(route)) return true;
  }
  return false;
}

function shouldSkip(path: string, method: string): boolean {
  if (!path.startsWith("/api/")) return true;
  if (SKIP_ROUTES.has(path)) return true;
  if (method === "OPTIONS") return true;
  return false;
}

export function auditLog(req: Request, res: Response, next: NextFunction) {
  if (shouldSkip(req.path, req.method)) {
    next();
    return;
  }

  const startTime = Date.now();
  const user = req.user as any;

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const phiAccessed = isPHIRoute(req.path);

    db.insert(auditLogsTable)
      .values({
        userId: user?.id || null,
        userEmail: user?.email || null,
        action: `${req.method} ${req.path}`,
        resource: req.path.split("/").slice(2, 4).join("/") || req.path,
        resourceId: req.params?.id || null,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null,
        userAgent: req.headers["user-agent"]?.substring(0, 512) || null,
        phiAccessed,
        details: {
          method: req.method,
          statusCode: res.statusCode,
          durationMs: duration,
          queryParams: Object.keys(req.query).length > 0 ? req.query : undefined,
        },
      })
      .catch((err) => {
        console.error("[audit-log] Failed to write audit log:", err.message);
      });
  });

  next();
}

export async function getAuditLogs(options: {
  limit?: number;
  offset?: number;
  userId?: string;
  phiOnly?: boolean;
  startDate?: Date;
  endDate?: Date;
}) {
  const { limit = 50, offset = 0 } = options;

  let query = `SELECT * FROM audit_logs WHERE 1=1`;
  const params: any[] = [];
  let paramIdx = 1;

  if (options.userId) {
    query += ` AND user_id = $${paramIdx++}`;
    params.push(options.userId);
  }
  if (options.phiOnly) {
    query += ` AND phi_accessed = TRUE`;
  }
  if (options.startDate) {
    query += ` AND created_at >= $${paramIdx++}`;
    params.push(options.startDate);
  }
  if (options.endDate) {
    query += ` AND created_at <= $${paramIdx++}`;
    params.push(options.endDate);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(limit, offset);

  const { pool } = await import("@workspace/db");
  const result = await pool.query(query, params);

  const countQuery = query.replace(/SELECT \*/, "SELECT COUNT(*)").replace(/ORDER BY.*$/, "");
  const countResult = await pool.query(countQuery, params.slice(0, -2));

  return {
    logs: result.rows,
    total: parseInt(countResult.rows[0].count),
    limit,
    offset,
  };
}

export async function getAuditStats() {
  const { pool } = await import("@workspace/db");

  const [total, phiAccess, last24h, uniqueUsers] = await Promise.all([
    pool.query("SELECT COUNT(*) FROM audit_logs"),
    pool.query("SELECT COUNT(*) FROM audit_logs WHERE phi_accessed = TRUE"),
    pool.query("SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours'"),
    pool.query("SELECT COUNT(DISTINCT user_id) FROM audit_logs WHERE user_id IS NOT NULL"),
  ]);

  return {
    totalEvents: parseInt(total.rows[0].count),
    phiAccessEvents: parseInt(phiAccess.rows[0].count),
    last24hEvents: parseInt(last24h.rows[0].count),
    uniqueUsers: parseInt(uniqueUsers.rows[0].count),
  };
}
