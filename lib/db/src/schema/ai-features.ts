import { pgTable, serial, text, integer, timestamp, real, jsonb } from "drizzle-orm/pg-core";

export const clinicalCasesTable = pgTable("clinical_cases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("general"),
  presentation: text("presentation").notNull(),
  differentials: text("differentials").notNull().default("[]"),
  diagnosis: text("diagnosis"),
  workup: text("workup"),
  management: text("management"),
  difficulty: text("difficulty").notNull().default("intermediate"),
  generatedBy: text("generated_by").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clinicalDecisionsTable = pgTable("clinical_decisions", {
  id: serial("id").primaryKey(),
  symptoms: text("symptoms").notNull(),
  history: text("history"),
  findings: text("findings"),
  differentials: text("differentials").notNull().default("[]"),
  recommendedWorkup: text("recommended_workup"),
  urgencyLevel: text("urgency_level").notNull().default("routine"),
  model: text("model").notNull().default("meditron:7b"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const audiogramAnalysesTable = pgTable("audiogram_analyses", {
  id: serial("id").primaryKey(),
  patientAge: integer("patient_age"),
  frequencies: text("frequencies").notNull().default("{}"),
  hearingLossType: text("hearing_loss_type"),
  severity: text("severity"),
  aiInterpretation: text("ai_interpretation"),
  recommendations: text("recommendations"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medicalReportsTable = pgTable("medical_reports", {
  id: serial("id").primaryKey(),
  reportType: text("report_type").notNull(),
  templateName: text("template_name"),
  inputData: text("input_data").notNull(),
  generatedReport: text("generated_report"),
  model: text("model").notNull().default("meditron:7b"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drugInteractionsTable = pgTable("drug_interactions", {
  id: serial("id").primaryKey(),
  drugs: text("drugs").notNull(),
  interactions: text("interactions"),
  severity: text("severity"),
  entRelevance: text("ent_relevance"),
  alternatives: text("alternatives"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const patientEducationTable = pgTable("patient_education", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  category: text("category").notNull().default("general"),
  content: text("content").notNull(),
  readingLevel: text("reading_level").notNull().default("6th grade"),
  language: text("language").notNull().default("english"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const imageAnnotationsTable = pgTable("image_annotations", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url"),
  imageType: text("image_type").notNull().default("endoscopy"),
  annotations: text("annotations").notNull().default("[]"),
  structures: text("structures"),
  pathologyFindings: text("pathology_findings"),
  model: text("model").notNull().default("llava:13b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clinicalProtocolsTable = pgTable("clinical_protocols", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  condition: text("condition").notNull(),
  category: text("category").notNull().default("diagnostic"),
  steps: text("steps").notNull().default("[]"),
  evidenceLevel: text("evidence_level"),
  references: text("references"),
  model: text("model").notNull().default("meditron:7b"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const socialContentCalendarTable = pgTable("social_content_calendar", {
  id: serial("id").primaryKey(),
  weekStart: text("week_start").notNull(),
  platform: text("platform").notNull(),
  contentType: text("content_type").notNull(),
  topic: text("topic").notNull(),
  scheduledDate: text("scheduled_date"),
  status: text("status").notNull().default("planned"),
  content: text("content"),
  hashtags: text("hashtags"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const socialPostsTable = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  contentType: text("content_type").notNull().default("educational"),
  topic: text("topic").notNull(),
  content: text("content").notNull(),
  hashtags: text("hashtags"),
  hooks: text("hooks"),
  engagementScore: real("engagement_score"),
  status: text("status").notNull().default("draft"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const viralHooksTable = pgTable("viral_hooks", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  platform: text("platform").notNull(),
  hooks: text("hooks").notNull().default("[]"),
  trendingScore: real("trending_score"),
  medicalAccuracy: real("medical_accuracy"),
  engagementPotential: real("engagement_potential"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const socialAnalyticsTable = pgTable("social_analytics", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  metric: text("metric").notNull(),
  value: real("value").notNull().default(0),
  period: text("period").notNull(),
  aiInsights: text("ai_insights"),
  recommendations: text("recommendations"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brandVoiceTable = pgTable("brand_voice", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  toneAttributes: text("tone_attributes").notNull().default("[]"),
  sampleContent: text("sample_content").notNull().default("[]"),
  guidelines: text("guidelines"),
  consistencyScore: real("consistency_score"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockScreenerTable = pgTable("stock_screener", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  companyName: text("company_name"),
  sector: text("sector").notNull().default("healthcare"),
  analysis: text("analysis"),
  fundamentals: text("fundamentals"),
  technicals: text("technicals"),
  aiSignal: text("ai_signal"),
  confidenceScore: real("confidence_score"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioTable = pgTable("portfolio_holdings", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  shares: real("shares").notNull().default(0),
  avgCost: real("avg_cost").notNull().default(0),
  currentPrice: real("current_price"),
  sector: text("sector"),
  allocation: real("allocation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioAnalysisTable = pgTable("portfolio_analysis", {
  id: serial("id").primaryKey(),
  totalValue: real("total_value"),
  riskScore: real("risk_score"),
  sharpeRatio: real("sharpe_ratio"),
  drawdownMax: real("drawdown_max"),
  diversificationScore: real("diversification_score"),
  aiRecommendations: text("ai_recommendations"),
  correlationMatrix: text("correlation_matrix"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const marketSentimentTable = pgTable("market_sentiment", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  topic: text("topic").notNull(),
  sentiment: text("sentiment").notNull(),
  score: real("score").notNull().default(0),
  summary: text("summary"),
  healthcareRelevance: real("healthcare_relevance"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tradeJournalTable = pgTable("trade_journal", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  action: text("action").notNull(),
  shares: real("shares").notNull(),
  price: real("price").notNull(),
  reasoning: text("reasoning"),
  outcome: text("outcome"),
  pnl: real("pnl"),
  aiAnalysis: text("ai_analysis"),
  emotionalState: text("emotional_state"),
  lessonLearned: text("lesson_learned"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const earningsAnalysisTable = pgTable("earnings_analysis", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  companyName: text("company_name"),
  quarter: text("quarter").notNull(),
  keyMetrics: text("key_metrics"),
  aiSummary: text("ai_summary"),
  sentiment: text("sentiment"),
  guidanceAnalysis: text("guidance_analysis"),
  healthcareInsights: text("healthcare_insights"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiPerformanceTrackingTable = pgTable("ai_performance_tracking", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  feature: text("feature").notNull(),
  model: text("model").notNull(),
  predictionType: text("prediction_type").notNull(),
  prediction: text("prediction"),
  actual: text("actual"),
  accuracy: real("accuracy"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
