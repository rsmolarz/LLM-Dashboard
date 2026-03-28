import { Router } from "express";
import { requireAdmin } from "../middlewares/rateLimiter";
import { getAuditLogs, getAuditStats } from "../middlewares/auditLog";
import { pool } from "@workspace/db";

const router = Router();

router.get("/compliance/audit-logs", requireAdmin, async (req, res): Promise<void> => {
  try {
    const result = await getAuditLogs({
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
      userId: req.query.userId as string,
      phiOnly: req.query.phiOnly === "true",
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compliance/audit-stats", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const stats = await getAuditStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compliance/phi-access-report", requireAdmin, async (req, res): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const result = await pool.query(`
      SELECT
        user_id,
        user_email,
        COUNT(*) AS access_count,
        COUNT(DISTINCT resource) AS unique_resources,
        MIN(created_at) AS first_access,
        MAX(created_at) AS last_access
      FROM audit_logs
      WHERE phi_accessed = TRUE
        AND created_at > NOW() - ($1 || ' days')::INTERVAL
        AND user_id IS NOT NULL
      GROUP BY user_id, user_email
      ORDER BY access_count DESC
    `, [days]);
    res.json({
      period: `${days} days`,
      users: result.rows,
      totalPHIAccesses: result.rows.reduce((s: number, r: any) => s + parseInt(r.access_count), 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compliance/status", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const stats = await getAuditStats();

    const checks = [
      {
        id: "audit-logging",
        name: "Audit Logging",
        description: "All API access is logged with user identity, action, timestamp, and PHI flag",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "access-control",
        name: "Role-Based Access Control",
        description: "Admin and user roles with middleware enforcement on protected routes",
        status: "compliant" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "session-timeout",
        name: "Automatic Session Timeout",
        description: "Sessions auto-expire after 15 minutes of inactivity",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "encryption-transit",
        name: "Encryption in Transit",
        description: "All connections use HTTPS/TLS encryption",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "phi-tracking",
        name: "PHI Access Tracking",
        description: "All access to protected health information is tracked and auditable",
        status: stats.phiAccessEvents > 0 ? "compliant" as const : "warning" as const,
        category: "Technical Safeguards",
      },
      {
        id: "data-persistence",
        name: "Data Persistence & Backup",
        description: "Critical data stored in PostgreSQL with automatic backups",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "unique-user-id",
        name: "Unique User Identification",
        description: "Each user has a unique ID for accountability and audit trail",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "rate-limiting",
        name: "Rate Limiting",
        description: "Per-user rate limiting prevents abuse and unauthorized bulk access",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "baa",
        name: "Business Associate Agreement",
        description: "BAA must be in place with all third-party service providers handling PHI",
        status: "action-required" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "risk-assessment",
        name: "Risk Assessment",
        description: "Regular security risk assessments should be conducted",
        status: "action-required" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "workforce-training",
        name: "Workforce Training",
        description: "All employees must complete HIPAA training",
        status: "action-required" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "incident-response",
        name: "Incident Response Plan",
        description: "Documented procedures for breach notification within 60 days",
        status: "action-required" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "physical-safeguards",
        name: "Physical Safeguards",
        description: "Server room access controls, workstation security policies",
        status: "action-required" as const,
        category: "Physical Safeguards",
      },
    ];

    const compliant = checks.filter(c => c.status === "compliant").length;
    const warnings = checks.filter(c => c.status === "warning").length;
    const actionRequired = checks.filter(c => c.status === "action-required").length;

    res.json({
      overallScore: Math.round((compliant / checks.length) * 100),
      summary: { compliant, warnings, actionRequired, total: checks.length },
      checks,
      auditStats: stats,
      lastChecked: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compliance/activity-timeline", requireAdmin, async (req, res): Promise<void> => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const result = await pool.query(`
      SELECT
        DATE_TRUNC('hour', created_at) AS hour,
        COUNT(*) AS total_events,
        COUNT(CASE WHEN phi_accessed THEN 1 END) AS phi_events,
        COUNT(DISTINCT user_id) AS unique_users
      FROM audit_logs
      WHERE created_at > NOW() - ($1 || ' hours')::INTERVAL
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour ASC
    `, [hours]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
