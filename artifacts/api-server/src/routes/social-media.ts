import { Router } from "express";
import type { IRouter, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  socialContentCalendarTable, socialPostsTable, viralHooksTable,
  socialAnalyticsTable, brandVoiceTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { llmConfigTable } from "@workspace/db/schema";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) { next(); }

async function getServerUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  return config?.serverUrl || null;
}

async function queryOllama(serverUrl: string, model: string, prompt: string): Promise<string> {
  const resp = await fetch(`${serverUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!resp.ok) throw new Error(`Ollama returned ${resp.status}: ${await resp.text().catch(() => "unknown")}`);
  const data = await resp.json() as any;
  return data.response || "";
}

router.get("/social/calendar", async (_req, res): Promise<void> => {
  const rows = await db.select().from(socialContentCalendarTable).orderBy(desc(socialContentCalendarTable.createdAt)).limit(100);
  res.json(rows);
});

router.post("/social/calendar/generate", requireAuth, async (req, res): Promise<void> => {
  const { platform, niche, weekStart, postsPerWeek, model } = req.body;
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llama3.2:latest";
  const count = postsPerWeek || 5;
  const prompt = `You are a social media strategist for a medical professional who is also a social media influencer and hedge fund manager.

Create a ${count}-post content calendar for ${platform || "Instagram"} starting ${weekStart || "this week"}.
Niche: ${niche || "ENT doctor / medical education / finance"}

For each post include:
- Day and time to post
- Content type (reel, carousel, story, post, thread)
- Topic
- Brief content outline
- Hashtags (5-10)

Mix content: 40% medical education, 30% personal brand/lifestyle, 20% finance/investing tips, 10% engagement/trending.

Respond in JSON: { "posts": [{"day": "...", "time": "...", "contentType": "...", "topic": "...", "outline": "...", "hashtags": ["..."]}] }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = { posts: [] };
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { posts: [{ day: "Monday", contentType: "post", topic: niche || "medical education", outline: response, hashtags: [] }] }; }

    const results = [];
    for (const post of (parsed.posts || []).slice(0, count)) {
      const [row] = await db.insert(socialContentCalendarTable).values({
        weekStart: weekStart || new Date().toISOString().split("T")[0],
        platform: platform || "Instagram",
        contentType: post.contentType || "post",
        topic: post.topic || "general",
        scheduledDate: post.day || null,
        content: post.outline || "",
        hashtags: JSON.stringify(post.hashtags || []),
        model: useModel,
      }).returning();
      results.push(row);
    }
    res.json({ calendar: results, aiResponse: parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/social/posts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(socialPostsTable).orderBy(desc(socialPostsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/social/posts/generate", requireAuth, async (req, res): Promise<void> => {
  const { platform, contentType, topic, brandVoice, model } = req.body;
  if (!topic) { res.status(400).json({ error: "topic required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llama3.2:latest";

  let voiceGuidance = "";
  if (brandVoice) {
    const [voice] = await db.select().from(brandVoiceTable).where(eq(brandVoiceTable.id, parseInt(brandVoice))).limit(1);
    if (voice) voiceGuidance = `\nBrand voice: ${voice.guidelines || voice.description || "professional yet approachable"}`;
  }

  const prompt = `Write a ${platform || "Instagram"} ${contentType || "post"} about: ${topic}

You are a doctor (ENT specialist) who is also a social media influencer.
${voiceGuidance}

Include:
1. Attention-grabbing hook (first line)
2. Main content (educational + engaging)
3. Call to action
4. 8-12 relevant hashtags
5. Engagement hooks (questions, polls)

Make it feel authentic, not salesy. Mix medical authority with relatable personality.

Respond in JSON: { "content": "...", "hook": "...", "hashtags": ["..."], "callToAction": "...", "engagementScore": 0.0-1.0 }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { content: response, hashtags: [], engagementScore: 0.5 }; }

    const [row] = await db.insert(socialPostsTable).values({
      platform: platform || "Instagram",
      contentType: contentType || "post",
      topic, content: parsed.content || response,
      hashtags: JSON.stringify(parsed.hashtags || []),
      hooks: parsed.hook || null,
      engagementScore: parsed.engagementScore || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/social/posts/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(socialPostsTable).where(eq(socialPostsTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

router.get("/social/hooks", async (_req, res): Promise<void> => {
  const rows = await db.select().from(viralHooksTable).orderBy(desc(viralHooksTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/social/hooks/analyze", requireAuth, async (req, res): Promise<void> => {
  const { topic, platform, model } = req.body;
  if (!topic) { res.status(400).json({ error: "topic required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llama3.2:latest";
  const prompt = `As a viral content expert for a medical influencer on ${platform || "all platforms"}, analyze this topic for viral potential: "${topic}"

Provide:
1. 5 viral hook variations (opening lines that stop scrolling)
2. Trending score (0-1 based on current relevance)
3. Medical accuracy risk assessment
4. Best platform for this content
5. Engagement potential score

Respond in JSON: { "hooks": [{"hook": "...", "style": "curiosity/shock/educational/emotional"}], "trendingScore": 0.0-1.0, "medicalAccuracy": 0.0-1.0, "engagementPotential": 0.0-1.0, "bestPlatform": "...", "reasoning": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { hooks: [{ hook: response }], trendingScore: 0.5, medicalAccuracy: 0.8, engagementPotential: 0.6 }; }

    const [row] = await db.insert(viralHooksTable).values({
      topic, platform: platform || "multi",
      hooks: JSON.stringify(parsed.hooks || []),
      trendingScore: parsed.trendingScore || null,
      medicalAccuracy: parsed.medicalAccuracy || null,
      engagementPotential: parsed.engagementPotential || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/social/analytics", async (_req, res): Promise<void> => {
  const rows = await db.select().from(socialAnalyticsTable).orderBy(desc(socialAnalyticsTable.createdAt)).limit(100);
  res.json(rows);
});

router.post("/social/analytics/track", requireAuth, async (req, res): Promise<void> => {
  const { platform, metric, value, period } = req.body;
  if (!platform || !metric || value === undefined) { res.status(400).json({ error: "platform, metric, value required" }); return; }
  const [row] = await db.insert(socialAnalyticsTable).values({
    platform, metric, value, period: period || "daily",
  }).returning();
  res.json(row);
});

router.post("/social/analytics/insights", requireAuth, async (req, res): Promise<void> => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const metrics = await db.select().from(socialAnalyticsTable).orderBy(desc(socialAnalyticsTable.createdAt)).limit(50);
  const prompt = `Analyze these social media metrics for a medical influencer and provide strategic insights:

Metrics: ${JSON.stringify(metrics.map(m => ({ platform: m.platform, metric: m.metric, value: m.value, period: m.period })))}

Provide: top 3 insights, content strategy recommendations, optimal posting times, growth opportunities.
Respond in JSON: { "insights": ["..."], "recommendations": ["..."], "growthOpportunities": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, "llama3.2:latest", prompt);
    res.json({ insights: response, metricsCount: metrics.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/social/brand-voice", async (_req, res): Promise<void> => {
  const rows = await db.select().from(brandVoiceTable).orderBy(desc(brandVoiceTable.createdAt)).limit(20);
  res.json(rows);
});

router.post("/social/brand-voice", requireAuth, async (req, res): Promise<void> => {
  const { name, description, toneAttributes, sampleContent, guidelines } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(brandVoiceTable).values({
    name, description: description || "",
    toneAttributes: JSON.stringify(toneAttributes || []),
    sampleContent: JSON.stringify(sampleContent || []),
    guidelines: guidelines || "",
  }).returning();
  res.json(row);
});

router.post("/social/brand-voice/:id/score", requireAuth, async (req, res): Promise<void> => {
  const { content } = req.body;
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  const [voice] = await db.select().from(brandVoiceTable).where(eq(brandVoiceTable.id, parseInt(req.params.id)));
  if (!voice) { res.status(404).json({ error: "Brand voice not found" }); return; }

  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }

  const prompt = `Score this content for brand voice consistency.

Brand voice: ${voice.name}
Guidelines: ${voice.guidelines}
Tone: ${voice.toneAttributes}
Sample content: ${voice.sampleContent}

Content to score: "${content}"

Rate 0.0-1.0 for consistency with the brand voice. Provide specific feedback.
Respond in JSON: { "score": 0.0-1.0, "feedback": "...", "suggestions": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, "llama3.2:latest", prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { score: 0.7, feedback: response }; }
    res.json(parsed);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/social/brand-voice/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(brandVoiceTable).where(eq(brandVoiceTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

export default router;
