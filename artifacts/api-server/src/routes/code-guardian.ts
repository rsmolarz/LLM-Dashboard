import { Router } from "express";

const router = Router();

interface GuardianFeedItem {
  id: string;
  type: "vulnerability" | "dependency" | "code_quality" | "security_alert";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  source: string;
  status: "new" | "acknowledged" | "resolved" | "ignored";
  createdAt: string;
}

interface Upgrade {
  id: string;
  package: string;
  currentVersion: string;
  targetVersion: string;
  type: "patch" | "minor" | "major";
  risk: "low" | "medium" | "high";
  status: "pending" | "approved" | "applied" | "rejected";
  createdAt: string;
}

interface Broadcast {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  sentAt: string;
  recipients: string[];
}

const feedItems: GuardianFeedItem[] = [];
const upgrades: Upgrade[] = [];
const broadcasts: Broadcast[] = [];
let idCounter = 1;

function gid(prefix: string): string {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

router.get("/code-guardian/health", (_req, res) => {
  res.json({
    status: "healthy",
    feedItems: feedItems.length,
    pendingUpgrades: upgrades.filter(u => u.status === "pending").length,
    recentBroadcasts: broadcasts.length,
    lastScan: feedItems.length > 0
      ? feedItems[feedItems.length - 1].createdAt
      : null,
    uptime: process.uptime(),
    version: "1.0.0",
  });
});

router.get("/code-guardian/feed", (req, res) => {
  let filtered = [...feedItems];
  const { type, severity, status, limit, offset } = req.query;

  if (type) filtered = filtered.filter(f => f.type === type);
  if (severity) filtered = filtered.filter(f => f.severity === severity);
  if (status) filtered = filtered.filter(f => f.status === status);

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = filtered.length;
  const off = Number(offset) || 0;
  const lim = Math.min(Number(limit) || 50, 200);

  res.json({
    items: filtered.slice(off, off + lim),
    total,
    severityCounts: {
      critical: feedItems.filter(f => f.severity === "critical").length,
      high: feedItems.filter(f => f.severity === "high").length,
      medium: feedItems.filter(f => f.severity === "medium").length,
      low: feedItems.filter(f => f.severity === "low").length,
    },
  });
});

router.post("/code-guardian/feed", (req, res) => {
  const { type, severity, title, description, source } = req.body;
  if (!title || !type) {
    res.status(400).json({ error: "title and type are required" });
    return;
  }

  const item: GuardianFeedItem = {
    id: gid("feed"),
    type: type || "security_alert",
    severity: severity || "medium",
    title,
    description: description || "",
    source: source || "manual",
    status: "new",
    createdAt: new Date().toISOString(),
  };

  feedItems.push(item);
  res.json({ item, message: "Feed item added" });
});

router.get("/code-guardian/upgrades", (req, res) => {
  let filtered = [...upgrades];
  const { status, risk } = req.query;

  if (status) filtered = filtered.filter(u => u.status === status);
  if (risk) filtered = filtered.filter(u => u.risk === risk);

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    upgrades: filtered,
    total: filtered.length,
    pendingCount: upgrades.filter(u => u.status === "pending").length,
  });
});

router.post("/code-guardian/upgrades", (req, res) => {
  const { package: pkg, currentVersion, targetVersion, type, risk } = req.body;
  if (!pkg || !currentVersion || !targetVersion) {
    res.status(400).json({ error: "package, currentVersion, and targetVersion are required" });
    return;
  }

  const upgrade: Upgrade = {
    id: gid("upg"),
    package: pkg,
    currentVersion,
    targetVersion,
    type: type || "patch",
    risk: risk || "low",
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  upgrades.push(upgrade);
  res.json({ upgrade, message: "Upgrade queued" });
});

router.get("/code-guardian/broadcasts", (_req, res) => {
  const sorted = [...broadcasts].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  res.json({ broadcasts: sorted, total: sorted.length });
});

router.post("/code-guardian/broadcasts", (req, res) => {
  const { title, message, severity, recipients } = req.body;
  if (!title || !message) {
    res.status(400).json({ error: "title and message are required" });
    return;
  }

  const broadcast: Broadcast = {
    id: gid("bcast"),
    title,
    message,
    severity: severity || "info",
    sentAt: new Date().toISOString(),
    recipients: recipients || ["all"],
  };

  broadcasts.push(broadcast);
  res.json({ broadcast, message: "Broadcast sent" });
});

export default router;
