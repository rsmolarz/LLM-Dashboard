import { Router } from "express";
import type { IRouter, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  socialContentCalendarTable, socialPostsTable, viralHooksTable,
  socialAnalyticsTable, brandVoiceTable,
  hashtagStrategyTable, competitorAnalysisTable, engagementPredictorTable,
  captionWriterTable, reelScriptsTable, audiencePersonasTable,
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

router.get("/social/hashtag-strategy", async (_req, res): Promise<void> => {
  const rows = await db.select().from(hashtagStrategyTable).orderBy(desc(hashtagStrategyTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/social/hashtag-strategy/generate", requireAuth, async (req, res): Promise<void> => {
  const { niche, platform, model } = req.body;
  if (!niche) { res.status(400).json({ error: "niche required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llama3.2:latest";
  const prompt = `You are a social media hashtag strategist. Create an optimal hashtag strategy for:

Niche: ${niche}
Platform: ${platform || "Instagram"}

Provide 3 tiers of hashtags:
1. Primary (5 high-volume, niche-specific)
2. Secondary (8 medium-volume, targeted)
3. Trending (5 currently trending, relevant)

Also estimate reach potential for each tier.
Respond in JSON: { "primary": ["..."], "secondary": ["..."], "trending": ["..."], "reachEstimate": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(hashtagStrategyTable).values({
      niche, platform: platform || "Instagram",
      primaryHashtags: JSON.stringify(parsed.primary || []),
      secondaryHashtags: JSON.stringify(parsed.secondary || []),
      trendingHashtags: JSON.stringify(parsed.trending || []),
      reachEstimate: parsed.reachEstimate || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/social/competitor-analysis", async (_req, res): Promise<void> => {
  const rows = await db.select().from(competitorAnalysisTable).orderBy(desc(competitorAnalysisTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/social/competitor-analysis/analyze", requireAuth, async (req, res): Promise<void> => {
  const { competitorHandle, platform, model } = req.body;
  if (!competitorHandle) { res.status(400).json({ error: "competitorHandle required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llama3.2:latest";
  const prompt = `Analyze this social media competitor for a medical influencer:

Competitor: ${competitorHandle}
Platform: ${platform || "Instagram"}

Provide:
1. Content strategy analysis (what type of content they post, frequency, themes)
2. Top performing content categories
3. Weaknesses and gaps in their strategy
4. Opportunities to differentiate from them
5. What to learn from them

Respond in JSON: { "contentStrategy": "...", "topPerforming": ["..."], "weaknesses": ["..."], "opportunities": ["..."], "lessonsToLearn": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(competitorAnalysisTable).values({
      competitorHandle, platform: platform || "Instagram",
      contentStrategy: parsed.contentStrategy || response,
      topPerforming: JSON.stringify(parsed.topPerforming || []),
      weaknesses: JSON.stringify(parsed.weaknesses || []),
      opportunities: JSON.stringify(parsed.opportunities || []),
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/social/engagement-predictor", async (_req, res): Promise<void> => {
  const rows = await db.select().from(engagementPredictorTable).orderBy(desc(engagementPredictorTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/social/engagement-predictor/predict", requireAuth, async (req, res): Promise<void> => {
  const { content, platform, postType, model } = req.body;
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llama3.2:latest";
  const prompt = `Predict social media engagement for this content:

Content: "${content}"
Platform: ${platform || "Instagram"}
Post Type: ${postType || "image"}

Predict:
1. Estimated likes, comments, shares (for a medical influencer with 10k-50k followers)
2. Viral probability (0.0-1.0)
3. Suggestions to improve engagement

Respond in JSON: { "predictedLikes": 0, "predictedComments": 0, "predictedShares": 0, "viralProbability": 0.0-1.0, "suggestions": ["..."] }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(engagementPredictorTable).values({
      content, platform: platform || "Instagram", postType: postType || "image",
      predictedLikes: parsed.predictedLikes || null,
      predictedComments: parsed.predictedComments || null,
      predictedShares: parsed.predictedShares || null,
      viralProbability: parsed.viralProbability || null,
      suggestions: JSON.stringify(parsed.suggestions || []),
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/social/captions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(captionWriterTable).orderBy(desc(captionWriterTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/social/captions/generate", requireAuth, async (req, res): Promise<void> => {
  const { imageDescription, platform, tone, model } = req.body;
  if (!imageDescription) { res.status(400).json({ error: "imageDescription required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llama3.2:latest";
  const prompt = `Write social media captions for this image/post:

Image Description: ${imageDescription}
Platform: ${platform || "Instagram"}
Tone: ${tone || "professional yet approachable"}

Provide:
1. Primary caption (platform-optimized length)
2. 3 alternative caption variations
3. Relevant hashtags
4. Call to action

Respond in JSON: { "caption": "...", "altCaptions": ["..."], "hashtags": ["..."], "cta": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { caption: response }; }
    const [row] = await db.insert(captionWriterTable).values({
      imageDescription, platform: platform || "Instagram", tone: tone || "professional",
      caption: parsed.caption || response,
      altCaptions: JSON.stringify(parsed.altCaptions || []),
      hashtags: JSON.stringify(parsed.hashtags || []),
      cta: parsed.cta || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/social/reel-scripts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(reelScriptsTable).orderBy(desc(reelScriptsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/social/reel-scripts/generate", requireAuth, async (req, res): Promise<void> => {
  const { topic, platform, duration, model } = req.body;
  if (!topic) { res.status(400).json({ error: "topic required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llama3.2:latest";
  const prompt = `Write a short-form video script for a medical influencer:

Topic: ${topic}
Platform: ${platform || "Instagram Reels"}
Duration: ${duration || "30 seconds"}

Include:
1. Hook (first 3 seconds - must stop scrolling)
2. Script with timing cues
3. Visual direction cues (text overlays, b-roll, transitions)
4. Call to action
5. Trending audio suggestion

Respond in JSON: { "hook": "...", "script": "...", "visualCues": [{"timestamp": "0:00", "visual": "...", "text": "..."}], "callToAction": "...", "trendingAudio": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { script: response }; }
    const [row] = await db.insert(reelScriptsTable).values({
      topic, platform: platform || "Instagram Reels", duration: duration || "30s",
      hook: parsed.hook || null,
      script: parsed.script || response,
      visualCues: JSON.stringify(parsed.visualCues || []),
      callToAction: parsed.callToAction || null,
      trendingAudio: parsed.trendingAudio || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/social/audience-personas", async (_req, res): Promise<void> => {
  const rows = await db.select().from(audiencePersonasTable).orderBy(desc(audiencePersonasTable.createdAt)).limit(20);
  res.json(rows);
});

router.post("/social/audience-personas/generate", requireAuth, async (req, res): Promise<void> => {
  const { niche, model } = req.body;
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "llama3.2:latest";
  const prompt = `Create a detailed audience persona for a medical influencer/ENT doctor content creator.

Niche focus: ${niche || "medical education + lifestyle + finance"}

Build a detailed persona including:
1. Demographics (age, gender, location, income)
2. Interests and hobbies
3. Pain points and challenges
4. Content preferences (format, length, topics)
5. Preferred platforms and usage patterns
6. Engagement behavior patterns

Respond in JSON: { "name": "...", "demographics": "...", "interests": ["..."], "painPoints": ["..."], "contentPreferences": "...", "platforms": ["..."], "engagementPatterns": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { name: "Persona", demographics: response }; }
    const [row] = await db.insert(audiencePersonasTable).values({
      name: parsed.name || "Audience Persona",
      demographics: parsed.demographics || null,
      interests: JSON.stringify(parsed.interests || []),
      painPoints: JSON.stringify(parsed.painPoints || []),
      contentPreferences: parsed.contentPreferences || null,
      platforms: JSON.stringify(parsed.platforms || []),
      engagementPatterns: parsed.engagementPatterns || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
