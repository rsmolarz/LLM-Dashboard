import { type Request, type Response, type NextFunction } from "express";

interface RateWindow {
  timestamps: number[];
}

interface RateLimitMetric {
  endpoint: string;
  totalRequests: number;
  rejectedRequests: number;
  uniqueUsers: Set<string>;
  lastHit: number;
}

const userWindows = new Map<string, RateWindow>();
const rateLimitMetrics = new Map<string, RateLimitMetric>();

const CLEANUP_INTERVAL = 60000;
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [key, window] of userWindows) {
    window.timestamps = window.timestamps.filter(t => t > cutoff);
    if (window.timestamps.length === 0) userWindows.delete(key);
  }
}, CLEANUP_INTERVAL);

export function getRateLimitMetrics() {
  const result: Array<{
    endpoint: string;
    totalRequests: number;
    rejectedRequests: number;
    uniqueUsers: number;
    lastHit: string;
    acceptRate: string;
  }> = [];

  for (const [, metric] of rateLimitMetrics) {
    result.push({
      endpoint: metric.endpoint,
      totalRequests: metric.totalRequests,
      rejectedRequests: metric.rejectedRequests,
      uniqueUsers: metric.uniqueUsers.size,
      lastHit: new Date(metric.lastHit).toISOString(),
      acceptRate: metric.totalRequests > 0
        ? ((1 - metric.rejectedRequests / metric.totalRequests) * 100).toFixed(1) + "%"
        : "100%",
    });
  }

  return result.sort((a, b) => b.totalRequests - a.totalRequests);
}

export function getActiveWindows() {
  return userWindows.size;
}

function trackMetric(endpoint: string, userId: string, rejected: boolean) {
  let metric = rateLimitMetrics.get(endpoint);
  if (!metric) {
    metric = { endpoint, totalRequests: 0, rejectedRequests: 0, uniqueUsers: new Set(), lastHit: Date.now() };
    rateLimitMetrics.set(endpoint, metric);
  }
  metric.totalRequests++;
  if (rejected) metric.rejectedRequests++;
  metric.uniqueUsers.add(userId);
  metric.lastHit = Date.now();
}

export function rateLimiter(maxRequests: number, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id || req.ip || "anonymous";
    const key = `${userId}:${req.route?.path || req.path}:${maxRequests}`;
    const endpoint = req.route?.path || req.path;
    const now = Date.now();
    const cutoff = now - windowMs;

    let window = userWindows.get(key);
    if (!window) {
      window = { timestamps: [] };
      userWindows.set(key, window);
    }

    window.timestamps = window.timestamps.filter(t => t > cutoff);

    if (window.timestamps.length >= maxRequests) {
      const oldestInWindow = window.timestamps[0]!;
      const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      res.set("X-RateLimit-Limit", String(maxRequests));
      res.set("X-RateLimit-Remaining", "0");
      trackMetric(endpoint, userId, true);
      res.status(429).json({
        error: "Too many requests",
        retryAfter,
        limit: maxRequests,
        windowMs,
      });
      return;
    }

    window.timestamps.push(now);
    res.set("X-RateLimit-Limit", String(maxRequests));
    res.set("X-RateLimit-Remaining", String(maxRequests - window.timestamps.length));
    trackMetric(endpoint, userId, false);
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if ((req.user as any).role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
