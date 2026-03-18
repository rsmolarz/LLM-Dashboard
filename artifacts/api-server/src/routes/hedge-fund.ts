import { Router } from "express";
import type { IRouter, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  stockScreenerTable, portfolioTable, portfolioAnalysisTable,
  marketSentimentTable, tradeJournalTable, earningsAnalysisTable,
  aiPerformanceTrackingTable,
  optionsStrategyTable, sectorRotationTable, dividendAnalysisTable,
  technicalPatternsTable, macroDashboardTable, insiderActivityTable, cryptoAnalysisTable,
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

router.get("/finance/screener", async (_req, res): Promise<void> => {
  const rows = await db.select().from(stockScreenerTable).orderBy(desc(stockScreenerTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/screener/analyze", requireAuth, async (req, res): Promise<void> => {
  const { ticker, sector, model } = req.body;
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "deepseek-r1:8b";
  const prompt = `You are a quantitative analyst at a hedge fund specializing in ${sector || "healthcare/biotech"} stocks.

Analyze ${ticker.toUpperCase()}:
1. Fundamental analysis (revenue growth, margins, PE ratio, debt)
2. Technical analysis (trend, support/resistance, momentum)
3. Sector-specific factors (regulatory, pipeline, market share)
4. Risk factors and catalysts
5. Overall signal: STRONG BUY / BUY / HOLD / SELL / STRONG SELL
6. Confidence score 0-1

Respond in JSON: { "ticker": "${ticker}", "companyName": "...", "fundamentals": {"revenue": "...", "margins": "...", "pe": "...", "debt": "..."}, "technicals": {"trend": "...", "support": "...", "resistance": "...", "momentum": "..."}, "signal": "...", "confidence": 0.0-1.0, "catalysts": ["..."], "risks": ["..."], "priceTarget": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { ticker, signal: "HOLD", confidence: 0.5, raw: response }; }

    const [row] = await db.insert(stockScreenerTable).values({
      ticker: ticker.toUpperCase(),
      companyName: parsed.companyName || null,
      sector: sector || "healthcare",
      analysis: response,
      fundamentals: JSON.stringify(parsed.fundamentals || {}),
      technicals: JSON.stringify(parsed.technicals || {}),
      aiSignal: parsed.signal || "HOLD",
      confidenceScore: parsed.confidence || null,
      model: useModel,
    }).returning();

    await db.insert(aiPerformanceTrackingTable).values({
      domain: "finance", feature: "stock_screener",
      model: useModel, predictionType: "signal",
      prediction: parsed.signal || "HOLD",
    });

    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/portfolio", async (_req, res): Promise<void> => {
  const rows = await db.select().from(portfolioTable).orderBy(desc(portfolioTable.updatedAt));
  res.json(rows);
});

router.post("/finance/portfolio", requireAuth, async (req, res): Promise<void> => {
  const { ticker, shares, avgCost, currentPrice, sector } = req.body;
  if (!ticker || !shares) { res.status(400).json({ error: "ticker and shares required" }); return; }
  const [row] = await db.insert(portfolioTable).values({
    ticker: ticker.toUpperCase(), shares, avgCost: avgCost || 0,
    currentPrice: currentPrice || null, sector: sector || "healthcare",
  }).returning();
  res.json(row);
});

router.put("/finance/portfolio/:id", requireAuth, async (req, res): Promise<void> => {
  const { shares, avgCost, currentPrice } = req.body;
  const [row] = await db.update(portfolioTable)
    .set({ shares, avgCost, currentPrice, updatedAt: new Date() })
    .where(eq(portfolioTable.id, parseInt(req.params.id)))
    .returning();
  res.json(row);
});

router.delete("/finance/portfolio/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(portfolioTable).where(eq(portfolioTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

router.get("/finance/portfolio/analysis", async (_req, res): Promise<void> => {
  const rows = await db.select().from(portfolioAnalysisTable).orderBy(desc(portfolioAnalysisTable.createdAt)).limit(10);
  res.json(rows);
});

router.post("/finance/portfolio/analyze", requireAuth, async (req, res): Promise<void> => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const holdings = await db.select().from(portfolioTable);
  if (!holdings.length) { res.status(400).json({ error: "No portfolio holdings to analyze" }); return; }

  const totalValue = holdings.reduce((sum, h) => sum + (h.currentPrice || h.avgCost) * h.shares, 0);
  const holdingsWithAlloc = holdings.map(h => ({
    ticker: h.ticker, shares: h.shares,
    value: (h.currentPrice || h.avgCost) * h.shares,
    allocation: ((h.currentPrice || h.avgCost) * h.shares / totalValue * 100).toFixed(1) + "%",
    sector: h.sector,
    pnl: h.currentPrice ? ((h.currentPrice - h.avgCost) * h.shares).toFixed(2) : "N/A",
  }));

  const prompt = `You are a hedge fund risk manager. Analyze this portfolio:

Holdings: ${JSON.stringify(holdingsWithAlloc)}
Total Value: $${totalValue.toFixed(2)}

Provide:
1. Risk score (0-10, 10 = highest risk)
2. Diversification score (0-1)
3. Concentration risk analysis
4. Sector exposure breakdown
5. Maximum drawdown estimate
6. Sharpe ratio estimate
7. Actionable recommendations

Respond in JSON: { "riskScore": 0-10, "sharpeRatio": 0.0, "maxDrawdown": "-X%", "diversificationScore": 0.0-1.0, "recommendations": ["..."], "sectorExposure": {"sector": "X%"} }`;

  try {
    const response = await queryOllama(serverUrl, "deepseek-r1:8b", prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { riskScore: 5, recommendations: [response] }; }

    const [row] = await db.insert(portfolioAnalysisTable).values({
      totalValue,
      riskScore: parsed.riskScore || null,
      sharpeRatio: parsed.sharpeRatio || null,
      drawdownMax: parsed.maxDrawdown ? parseFloat(String(parsed.maxDrawdown).replace(/[-%]/g, "")) : null,
      diversificationScore: parsed.diversificationScore || null,
      aiRecommendations: JSON.stringify(parsed.recommendations || []),
      correlationMatrix: JSON.stringify(parsed.sectorExposure || {}),
      model: "deepseek-r1:8b",
    }).returning();
    res.json({ ...row, parsed, holdings: holdingsWithAlloc });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/sentiment", async (_req, res): Promise<void> => {
  const rows = await db.select().from(marketSentimentTable).orderBy(desc(marketSentimentTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/sentiment/analyze", requireAuth, async (req, res): Promise<void> => {
  const { topic, source, model } = req.body;
  if (!topic) { res.status(400).json({ error: "topic required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "deepseek-r1:8b";
  const prompt = `Analyze market sentiment for: "${topic}"
Source context: ${source || "general market news"}

Provide:
1. Overall sentiment (bullish/bearish/neutral)
2. Sentiment score (-1.0 to 1.0)
3. Key drivers of sentiment
4. Healthcare sector relevance (0-1)
5. Trading implications

Respond in JSON: { "sentiment": "...", "score": -1.0 to 1.0, "drivers": ["..."], "healthcareRelevance": 0.0-1.0, "tradingImplications": "...", "summary": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { sentiment: "neutral", score: 0, summary: response }; }

    const [row] = await db.insert(marketSentimentTable).values({
      source: source || "general", topic,
      sentiment: parsed.sentiment || "neutral",
      score: parsed.score || 0,
      summary: parsed.summary || response,
      healthcareRelevance: parsed.healthcareRelevance || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/journal", async (_req, res): Promise<void> => {
  const rows = await db.select().from(tradeJournalTable).orderBy(desc(tradeJournalTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/journal", requireAuth, async (req, res): Promise<void> => {
  const { ticker, action, shares, price, reasoning, emotionalState } = req.body;
  if (!ticker || !action || !shares || !price) {
    res.status(400).json({ error: "ticker, action, shares, price required" }); return;
  }
  const [row] = await db.insert(tradeJournalTable).values({
    ticker: ticker.toUpperCase(), action, shares, price,
    reasoning: reasoning || null,
    emotionalState: emotionalState || null,
  }).returning();
  res.json(row);
});

router.post("/finance/journal/:id/analyze", requireAuth, async (req, res): Promise<void> => {
  const [trade] = await db.select().from(tradeJournalTable).where(eq(tradeJournalTable.id, parseInt(req.params.id)));
  if (!trade) { res.status(404).json({ error: "Trade not found" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }

  const prompt = `Analyze this trade decision as a hedge fund trading psychologist:

Ticker: ${trade.ticker}, Action: ${trade.action}, Shares: ${trade.shares}, Price: $${trade.price}
Reasoning: ${trade.reasoning || "not provided"}
Emotional State: ${trade.emotionalState || "not provided"}
${trade.outcome ? `Outcome: ${trade.outcome}` : ""}
${trade.pnl !== null ? `P&L: $${trade.pnl}` : ""}

Provide:
1. Decision quality assessment
2. Cognitive biases detected
3. Emotional trading indicators
4. Pattern recognition vs previous trades
5. Lesson to internalize

Respond in JSON: { "analysis": "...", "biases": ["..."], "lessonLearned": "...", "qualityScore": 0.0-1.0 }`;

  try {
    const response = await queryOllama(serverUrl, "deepseek-r1:8b", prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { analysis: response }; }

    await db.update(tradeJournalTable).set({
      aiAnalysis: parsed.analysis || response,
      lessonLearned: parsed.lessonLearned || null,
    }).where(eq(tradeJournalTable.id, trade.id));
    res.json(parsed);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/earnings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(earningsAnalysisTable).orderBy(desc(earningsAnalysisTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/earnings/analyze", requireAuth, async (req, res): Promise<void> => {
  const { ticker, quarter, keyMetrics, model } = req.body;
  if (!ticker || !quarter) { res.status(400).json({ error: "ticker and quarter required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "deepseek-r1:8b";
  const prompt = `Analyze earnings for ${ticker.toUpperCase()} for ${quarter}:
${keyMetrics ? `Key metrics: ${keyMetrics}` : "Provide general analysis based on typical healthcare earnings."}

As a hedge fund analyst specializing in healthcare:
1. Revenue and earnings assessment
2. Guidance analysis (raised/maintained/lowered)
3. Pipeline and growth drivers
4. Competitive positioning
5. Healthcare industry implications
6. Investment recommendation

Respond in JSON: { "summary": "...", "sentiment": "positive/neutral/negative", "guidanceAnalysis": "...", "healthcareInsights": "...", "recommendation": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { summary: response, sentiment: "neutral" }; }

    const [row] = await db.insert(earningsAnalysisTable).values({
      ticker: ticker.toUpperCase(),
      quarter, keyMetrics: keyMetrics || null,
      aiSummary: parsed.summary || response,
      sentiment: parsed.sentiment || "neutral",
      guidanceAnalysis: parsed.guidanceAnalysis || null,
      healthcareInsights: parsed.healthcareInsights || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/ai-performance", async (_req, res): Promise<void> => {
  const rows = await db.select().from(aiPerformanceTrackingTable).orderBy(desc(aiPerformanceTrackingTable.createdAt)).limit(100);
  res.json(rows);
});

router.post("/finance/ai-performance/record", requireAuth, async (req, res): Promise<void> => {
  const { domain, feature, model, predictionType, prediction, actual, accuracy, latencyMs } = req.body;
  if (!domain || !feature || !model || !predictionType) {
    res.status(400).json({ error: "domain, feature, model, predictionType required" }); return;
  }
  const [row] = await db.insert(aiPerformanceTrackingTable).values({
    domain, feature, model, predictionType,
    prediction: prediction || null, actual: actual || null,
    accuracy: accuracy || null, latencyMs: latencyMs || null,
  }).returning();
  res.json(row);
});

router.get("/finance/dashboard", async (_req, res): Promise<void> => {
  const [portfolio, sentiment, trades, screener, performance] = await Promise.all([
    db.select().from(portfolioTable),
    db.select().from(marketSentimentTable).orderBy(desc(marketSentimentTable.createdAt)).limit(5),
    db.select().from(tradeJournalTable).orderBy(desc(tradeJournalTable.createdAt)).limit(5),
    db.select().from(stockScreenerTable).orderBy(desc(stockScreenerTable.createdAt)).limit(5),
    db.select().from(aiPerformanceTrackingTable).orderBy(desc(aiPerformanceTrackingTable.createdAt)).limit(10),
  ]);

  const totalValue = portfolio.reduce((sum, h) => sum + (h.currentPrice || h.avgCost) * h.shares, 0);
  const totalPnl = portfolio.reduce((sum, h) => sum + (h.currentPrice ? (h.currentPrice - h.avgCost) * h.shares : 0), 0);

  res.json({
    portfolio: { holdings: portfolio.length, totalValue, totalPnl },
    recentSentiment: sentiment,
    recentTrades: trades,
    recentScreener: screener,
    aiPerformance: performance,
  });
});

router.get("/finance/options", async (_req, res): Promise<void> => {
  const rows = await db.select().from(optionsStrategyTable).orderBy(desc(optionsStrategyTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/options/analyze", requireAuth, async (req, res): Promise<void> => {
  const { ticker, strategyType, model } = req.body;
  if (!ticker || !strategyType) { res.status(400).json({ error: "ticker and strategyType required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "deepseek-r1:8b";
  const prompt = `You are a derivatives strategist. Analyze an options strategy:

Ticker: ${ticker.toUpperCase()}
Strategy: ${strategyType} (e.g. covered call, bull call spread, iron condor, straddle, protective put)

Provide:
1. Strategy legs with strike prices and premiums
2. Max profit and max loss scenarios
3. Breakeven points
4. Greeks exposure (delta, gamma, theta, vega)
5. When this strategy is optimal
6. Risk/reward assessment

Respond in JSON: { "legs": [{"type": "call/put", "action": "buy/sell", "strike": 0, "premium": 0, "expiry": "..."}], "maxProfit": 0, "maxLoss": 0, "breakeven": "...", "greeks": {"delta": 0, "gamma": 0, "theta": 0, "vega": 0}, "analysis": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(optionsStrategyTable).values({
      ticker: ticker.toUpperCase(), strategyType,
      legs: JSON.stringify(parsed.legs || []),
      maxProfit: parsed.maxProfit || null, maxLoss: parsed.maxLoss || null,
      breakeven: parsed.breakeven || null,
      greeks: JSON.stringify(parsed.greeks || {}),
      aiAnalysis: parsed.analysis || response,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/sector-rotation", async (_req, res): Promise<void> => {
  const rows = await db.select().from(sectorRotationTable).orderBy(desc(sectorRotationTable.createdAt)).limit(20);
  res.json(rows);
});

router.post("/finance/sector-rotation/analyze", requireAuth, async (req, res): Promise<void> => {
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const prompt = `As a macro strategist, analyze current sector rotation:

Analyze all 11 GICS sectors for:
1. Current phase in business cycle (early/mid/late/recession)
2. Leading sectors (outperforming)
3. Lagging sectors (underperforming)
4. Rotation signals and recommendations
5. Healthcare sector specific outlook

Respond in JSON: { "sectors": [{"name": "...", "performance": "leading/neutral/lagging", "outlook": "..."}], "currentPhase": "...", "leadingSectors": ["..."], "laggingSectors": ["..."], "recommendations": ["..."], "economicCycle": "..." }`;

  try {
    const response = await queryOllama(serverUrl, "deepseek-r1:8b", prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(sectorRotationTable).values({
      sectors: JSON.stringify(parsed.sectors || []),
      currentPhase: parsed.currentPhase || null,
      leadingSectors: JSON.stringify(parsed.leadingSectors || []),
      laggingSectors: JSON.stringify(parsed.laggingSectors || []),
      recommendations: JSON.stringify(parsed.recommendations || []),
      economicCycle: parsed.economicCycle || null,
      model: "deepseek-r1:8b",
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/dividends", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dividendAnalysisTable).orderBy(desc(dividendAnalysisTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/dividends/analyze", requireAuth, async (req, res): Promise<void> => {
  const { ticker, model } = req.body;
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "deepseek-r1:8b";
  const prompt = `Analyze dividend profile for ${ticker.toUpperCase()}:

Provide:
1. Current dividend yield
2. Payout ratio and sustainability
3. Dividend growth rate (5-year CAGR)
4. Dividend safety score (0-1)
5. Ex-dividend date and next payment
6. Comparison to sector average

Respond in JSON: { "dividendYield": 0, "payoutRatio": 0, "growthRate": 0, "safetyScore": 0.0-1.0, "exDivDate": "...", "analysis": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(dividendAnalysisTable).values({
      ticker: ticker.toUpperCase(),
      dividendYield: parsed.dividendYield || null,
      payoutRatio: parsed.payoutRatio || null,
      growthRate: parsed.growthRate || null,
      exDivDate: parsed.exDivDate || null,
      safetyScore: parsed.safetyScore || null,
      aiAnalysis: parsed.analysis || response,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/technical-patterns", async (_req, res): Promise<void> => {
  const rows = await db.select().from(technicalPatternsTable).orderBy(desc(technicalPatternsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/technical-patterns/analyze", requireAuth, async (req, res): Promise<void> => {
  const { ticker, timeframe, model } = req.body;
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "deepseek-r1:8b";
  const prompt = `Analyze technical chart patterns for ${ticker.toUpperCase()} on ${timeframe || "daily"} timeframe:

Identify:
1. Active chart patterns (head & shoulders, double top/bottom, flags, wedges, triangles)
2. Key support and resistance levels
3. Trend direction and strength
4. Volume analysis
5. Price prediction with confidence

Respond in JSON: { "patterns": [{"name": "...", "type": "bullish/bearish", "reliability": 0.0-1.0}], "supportLevels": ["..."], "resistanceLevels": ["..."], "trendDirection": "up/down/sideways", "prediction": "...", "confidence": 0.0-1.0 }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(technicalPatternsTable).values({
      ticker: ticker.toUpperCase(), timeframe: timeframe || "daily",
      patterns: JSON.stringify(parsed.patterns || []),
      supportLevels: JSON.stringify(parsed.supportLevels || []),
      resistanceLevels: JSON.stringify(parsed.resistanceLevels || []),
      trendDirection: parsed.trendDirection || null,
      aiPrediction: parsed.prediction || response,
      confidence: parsed.confidence || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/macro", async (_req, res): Promise<void> => {
  const rows = await db.select().from(macroDashboardTable).orderBy(desc(macroDashboardTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/macro/analyze", requireAuth, async (req, res): Promise<void> => {
  const { indicator, model } = req.body;
  if (!indicator) { res.status(400).json({ error: "indicator required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "deepseek-r1:8b";
  const prompt = `Analyze this macroeconomic indicator: ${indicator}

Provide:
1. Current estimated value and recent trend
2. Impact on equity markets
3. Specific impact on healthcare sector
4. Historical context
5. Forward outlook

Respond in JSON: { "currentValue": "...", "previousValue": "...", "trend": "rising/falling/stable", "impact": "...", "healthcareImpact": "...", "commentary": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(macroDashboardTable).values({
      indicator, currentValue: parsed.currentValue || null,
      previousValue: parsed.previousValue || null,
      trend: parsed.trend || null,
      impact: parsed.impact || response,
      healthcareImpact: parsed.healthcareImpact || null,
      aiCommentary: parsed.commentary || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/insider-activity", async (_req, res): Promise<void> => {
  const rows = await db.select().from(insiderActivityTable).orderBy(desc(insiderActivityTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/insider-activity/analyze", requireAuth, async (req, res): Promise<void> => {
  const { ticker, insiderName, title, transactionType, shares, price, model } = req.body;
  if (!ticker || !transactionType) { res.status(400).json({ error: "ticker and transactionType required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "deepseek-r1:8b";
  const totalValue = (shares || 0) * (price || 0);
  const prompt = `Analyze this insider transaction for investment significance:

Ticker: ${ticker.toUpperCase()}
Insider: ${insiderName || "Unknown"} (${title || "Executive"})
Transaction: ${transactionType} (buy/sell)
Shares: ${shares || "N/A"}, Price: $${price || "N/A"}, Total: $${totalValue || "N/A"}

Assess:
1. Significance of this transaction
2. Historical insider trading patterns for this company
3. Signal strength (bullish/bearish/neutral)
4. Recommended action based on insider activity

Respond in JSON: { "significance": "high/medium/low", "signal": "bullish/bearish/neutral", "analysis": "...", "recommendation": "..." }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(insiderActivityTable).values({
      ticker: ticker.toUpperCase(), insiderName, title,
      transactionType, shares, price, totalValue,
      aiSignificance: parsed.analysis || response,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance/crypto", async (_req, res): Promise<void> => {
  const rows = await db.select().from(cryptoAnalysisTable).orderBy(desc(cryptoAnalysisTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/finance/crypto/analyze", requireAuth, async (req, res): Promise<void> => {
  const { symbol, model } = req.body;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
  const useModel = model || "deepseek-r1:8b";
  const prompt = `Analyze cryptocurrency ${symbol.toUpperCase()} as a hedge fund analyst:

Provide:
1. Fundamental analysis (use case, adoption, team, tokenomics)
2. Technical analysis (trend, key levels, momentum)
3. On-chain metrics assessment
4. Market sentiment
5. Risk level (low/medium/high/extreme)
6. Signal (buy/hold/sell)

Respond in JSON: { "analysis": "...", "sentiment": "bullish/bearish/neutral", "technicals": "...", "onChainMetrics": "...", "riskLevel": "...", "signal": "buy/hold/sell" }`;

  try {
    const response = await queryOllama(serverUrl, useModel, prompt);
    let parsed: any = {};
    try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }
    const [row] = await db.insert(cryptoAnalysisTable).values({
      symbol: symbol.toUpperCase(),
      analysis: parsed.analysis || response,
      sentiment: parsed.sentiment || null,
      technicals: parsed.technicals || null,
      onChainMetrics: parsed.onChainMetrics || null,
      riskLevel: parsed.riskLevel || null,
      aiSignal: parsed.signal || null,
      model: useModel,
    }).returning();
    res.json({ ...row, parsed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
