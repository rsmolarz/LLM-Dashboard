import { Router } from "express";

const router = Router();

interface Platform {
  id: string;
  name: string;
  type: "twitter" | "linkedin" | "instagram" | "tiktok" | "youtube" | "facebook";
  connected: boolean;
  handle: string;
  followers: number;
  lastSync: string | null;
}

interface DailyMetric {
  date: string;
  platform: string;
  impressions: number;
  engagement: number;
  clicks: number;
  followers: number;
  posts: number;
}

interface Post {
  id: string;
  platform: string;
  content: string;
  publishedAt: string;
  impressions: number;
  engagement: number;
  clicks: number;
  shares: number;
  type: "text" | "image" | "video" | "carousel";
}

const platforms: Platform[] = [
  { id: "tw-1", name: "Twitter/X", type: "twitter", connected: true, handle: "@alphafactory", followers: 12400, lastSync: new Date().toISOString() },
  { id: "li-1", name: "LinkedIn", type: "linkedin", connected: true, handle: "Alpha Factory AI", followers: 8200, lastSync: new Date().toISOString() },
  { id: "ig-1", name: "Instagram", type: "instagram", connected: false, handle: "", followers: 0, lastSync: null },
  { id: "yt-1", name: "YouTube", type: "youtube", connected: true, handle: "Alpha Factory", followers: 3100, lastSync: new Date().toISOString() },
];

const metrics: DailyMetric[] = [];
const posts: Post[] = [];

function seedMetrics() {
  const now = new Date();
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    for (const p of platforms.filter(p => p.connected)) {
      metrics.push({
        date,
        platform: p.type,
        impressions: Math.floor(Math.random() * 5000) + 1000,
        engagement: Math.floor(Math.random() * 500) + 50,
        clicks: Math.floor(Math.random() * 200) + 20,
        followers: p.followers + Math.floor(Math.random() * 50) - 10,
        posts: Math.floor(Math.random() * 3),
      });
    }
  }

  const postTypes: Post["type"][] = ["text", "image", "video", "carousel"];
  for (let i = 0; i < 20; i++) {
    const p = platforms.filter(p => p.connected)[i % 3];
    posts.push({
      id: `post_${i}`,
      platform: p.type,
      content: `Sample post #${i + 1} about AI trading signals and market analysis`,
      publishedAt: new Date(now.getTime() - Math.random() * 30 * 86400000).toISOString(),
      impressions: Math.floor(Math.random() * 10000) + 500,
      engagement: Math.floor(Math.random() * 1000) + 50,
      clicks: Math.floor(Math.random() * 500) + 10,
      shares: Math.floor(Math.random() * 100),
      type: postTypes[Math.floor(Math.random() * postTypes.length)],
    });
  }
}
seedMetrics();

router.get("/social-media/platforms", (_req, res) => {
  res.json({ platforms });
});

router.post("/social-media/platforms", (req, res) => {
  const { name, type, handle } = req.body;
  if (!name || !type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }
  const platform: Platform = {
    id: `${type}-${Date.now()}`,
    name,
    type,
    connected: true,
    handle: handle || "",
    followers: 0,
    lastSync: new Date().toISOString(),
  };
  platforms.push(platform);
  res.json({ platform, message: "Platform connected" });
});

router.get("/social-media/overview", (_req, res) => {
  const connected = platforms.filter(p => p.connected);
  const totalFollowers = connected.reduce((sum, p) => sum + p.followers, 0);
  const last7Days = metrics.filter(m => {
    const d = new Date(m.date);
    return Date.now() - d.getTime() < 7 * 86400000;
  });

  const totalImpressions = last7Days.reduce((sum, m) => sum + m.impressions, 0);
  const totalEngagement = last7Days.reduce((sum, m) => sum + m.engagement, 0);
  const totalClicks = last7Days.reduce((sum, m) => sum + m.clicks, 0);
  const engagementRate = totalImpressions > 0
    ? parseFloat((totalEngagement / totalImpressions * 100).toFixed(2))
    : 0;

  res.json({
    connectedPlatforms: connected.length,
    totalFollowers,
    weeklyImpressions: totalImpressions,
    weeklyEngagement: totalEngagement,
    weeklyClicks: totalClicks,
    engagementRate,
    topPlatform: connected.sort((a, b) => b.followers - a.followers)[0]?.type || null,
  });
});

router.get("/social-media/metrics", (req, res) => {
  const { platform, days } = req.query;
  const dayCount = Number(days) || 30;
  const cutoff = new Date(Date.now() - dayCount * 86400000).toISOString().slice(0, 10);

  let filtered = metrics.filter(m => m.date >= cutoff);
  if (platform) filtered = filtered.filter(m => m.platform === platform);

  filtered.sort((a, b) => a.date.localeCompare(b.date));

  res.json({ metrics: filtered, count: filtered.length });
});

router.get("/social-media/timeline", (req, res) => {
  const { metric, days } = req.query;
  const dayCount = Number(days) || 30;
  const cutoff = new Date(Date.now() - dayCount * 86400000).toISOString().slice(0, 10);
  const metricKey = (metric as string) || "impressions";

  const filtered = metrics.filter(m => m.date >= cutoff);
  const byDate: Record<string, number> = {};
  for (const m of filtered) {
    byDate[m.date] = (byDate[m.date] || 0) + ((m as any)[metricKey] || 0);
  }

  const series = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  res.json({ metric: metricKey, series });
});

router.get("/social-media/posts", (req, res) => {
  const { platform, limit, offset, sort } = req.query;
  let filtered = [...posts];
  if (platform) filtered = filtered.filter(p => p.platform === platform);

  const sortKey = (sort as string) || "engagement";
  filtered.sort((a, b) => ((b as any)[sortKey] || 0) - ((a as any)[sortKey] || 0));

  const total = filtered.length;
  const off = Number(offset) || 0;
  const lim = Math.min(Number(limit) || 20, 100);

  res.json({ posts: filtered.slice(off, off + lim), total });
});

router.post("/social-media/sync", (_req, res) => {
  for (const p of platforms.filter(p => p.connected)) {
    p.lastSync = new Date().toISOString();
    p.followers += Math.floor(Math.random() * 20) - 5;
  }
  res.json({ message: "Sync completed", syncedAt: new Date().toISOString() });
});

export default router;
