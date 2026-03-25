import { type Request, type Response, type NextFunction } from "express";

interface RateWindow {
  timestamps: number[];
}

const userWindows = new Map<string, RateWindow>();

const CLEANUP_INTERVAL = 60000;
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [key, window] of userWindows) {
    window.timestamps = window.timestamps.filter(t => t > cutoff);
    if (window.timestamps.length === 0) userWindows.delete(key);
  }
}, CLEANUP_INTERVAL);

export function rateLimiter(maxRequests: number, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id || req.ip || "anonymous";
    const key = `${userId}:${req.route?.path || req.path}:${maxRequests}`;
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
