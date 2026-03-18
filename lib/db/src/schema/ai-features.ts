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

export const surgicalPlanningTable = pgTable("surgical_planning", {
  id: serial("id").primaryKey(),
  procedureName: text("procedure_name").notNull(),
  patientAge: integer("patient_age"),
  diagnosis: text("diagnosis").notNull(),
  comorbidities: text("comorbidities"),
  preOpChecklist: text("pre_op_checklist"),
  surgicalSteps: text("surgical_steps"),
  riskAssessment: text("risk_assessment"),
  postOpPlan: text("post_op_plan"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const treatmentOutcomesTable = pgTable("treatment_outcomes", {
  id: serial("id").primaryKey(),
  condition: text("condition").notNull(),
  treatment: text("treatment").notNull(),
  outcome: text("outcome").notNull(),
  followUpWeeks: integer("follow_up_weeks"),
  complications: text("complications"),
  patientSatisfaction: real("patient_satisfaction"),
  aiAnalysis: text("ai_analysis"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const literatureSearchTable = pgTable("literature_search", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  specialty: text("specialty").notNull().default("otolaryngology"),
  results: text("results").notNull().default("[]"),
  summary: text("summary"),
  clinicalRelevance: text("clinical_relevance"),
  evidenceLevel: text("evidence_level"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const symptomTimelineTable = pgTable("symptom_timeline", {
  id: serial("id").primaryKey(),
  patientId: text("patient_id"),
  symptoms: text("symptoms").notNull(),
  timeline: text("timeline").notNull().default("[]"),
  progression: text("progression"),
  aiProjection: text("ai_projection"),
  alerts: text("alerts"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const referralLettersTable = pgTable("referral_letters", {
  id: serial("id").primaryKey(),
  referTo: text("refer_to").notNull(),
  diagnosis: text("diagnosis").notNull(),
  clinicalHistory: text("clinical_history"),
  findings: text("findings"),
  urgency: text("urgency").notNull().default("routine"),
  letterContent: text("letter_content"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dosageCalculatorTable = pgTable("dosage_calculator", {
  id: serial("id").primaryKey(),
  medication: text("medication").notNull(),
  indication: text("indication").notNull(),
  patientWeight: real("patient_weight"),
  patientAge: integer("patient_age"),
  renalFunction: text("renal_function"),
  calculatedDose: text("calculated_dose"),
  warnings: text("warnings"),
  alternatives: text("alternatives"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voiceDisorderTable = pgTable("voice_disorders", {
  id: serial("id").primaryKey(),
  symptoms: text("symptoms").notNull(),
  voiceQuality: text("voice_quality"),
  onsetDuration: text("onset_duration"),
  occupation: text("occupation"),
  diagnosis: text("diagnosis"),
  vocalHygiene: text("vocal_hygiene"),
  treatmentPlan: text("treatment_plan"),
  model: text("model").notNull().default("meditron:7b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hashtagStrategyTable = pgTable("hashtag_strategy", {
  id: serial("id").primaryKey(),
  niche: text("niche").notNull(),
  platform: text("platform").notNull(),
  primaryHashtags: text("primary_hashtags").notNull().default("[]"),
  secondaryHashtags: text("secondary_hashtags").notNull().default("[]"),
  trendingHashtags: text("trending_hashtags").notNull().default("[]"),
  reachEstimate: text("reach_estimate"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitorAnalysisTable = pgTable("competitor_analysis", {
  id: serial("id").primaryKey(),
  competitorHandle: text("competitor_handle").notNull(),
  platform: text("platform").notNull(),
  contentStrategy: text("content_strategy"),
  topPerforming: text("top_performing"),
  weaknesses: text("weaknesses"),
  opportunities: text("opportunities"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const engagementPredictorTable = pgTable("engagement_predictor", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  platform: text("platform").notNull(),
  postType: text("post_type").notNull().default("image"),
  predictedLikes: integer("predicted_likes"),
  predictedComments: integer("predicted_comments"),
  predictedShares: integer("predicted_shares"),
  viralProbability: real("viral_probability"),
  suggestions: text("suggestions"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const captionWriterTable = pgTable("caption_writer", {
  id: serial("id").primaryKey(),
  imageDescription: text("image_description").notNull(),
  platform: text("platform").notNull(),
  tone: text("tone").notNull().default("professional"),
  caption: text("caption"),
  altCaptions: text("alt_captions").notNull().default("[]"),
  hashtags: text("hashtags"),
  cta: text("cta"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reelScriptsTable = pgTable("reel_scripts", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  platform: text("platform").notNull(),
  duration: text("duration").notNull().default("30s"),
  hook: text("hook"),
  script: text("script"),
  visualCues: text("visual_cues").notNull().default("[]"),
  callToAction: text("call_to_action"),
  trendingAudio: text("trending_audio"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const audiencePersonasTable = pgTable("audience_personas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  demographics: text("demographics"),
  interests: text("interests"),
  painPoints: text("pain_points"),
  contentPreferences: text("content_preferences"),
  platforms: text("platforms"),
  engagementPatterns: text("engagement_patterns"),
  model: text("model").notNull().default("llama3.2:latest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const optionsStrategyTable = pgTable("options_strategy", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  strategyType: text("strategy_type").notNull(),
  legs: text("legs").notNull().default("[]"),
  maxProfit: real("max_profit"),
  maxLoss: real("max_loss"),
  breakeven: text("breakeven"),
  greeks: text("greeks"),
  aiAnalysis: text("ai_analysis"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sectorRotationTable = pgTable("sector_rotation", {
  id: serial("id").primaryKey(),
  sectors: text("sectors").notNull().default("[]"),
  currentPhase: text("current_phase"),
  leadingSectors: text("leading_sectors"),
  laggingSectors: text("lagging_sectors"),
  recommendations: text("recommendations"),
  economicCycle: text("economic_cycle"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dividendAnalysisTable = pgTable("dividend_analysis", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  dividendYield: real("dividend_yield"),
  payoutRatio: real("payout_ratio"),
  growthRate: real("growth_rate"),
  exDivDate: text("ex_div_date"),
  safetyScore: real("safety_score"),
  aiAnalysis: text("ai_analysis"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const technicalPatternsTable = pgTable("technical_patterns", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  timeframe: text("timeframe").notNull().default("daily"),
  patterns: text("patterns").notNull().default("[]"),
  supportLevels: text("support_levels"),
  resistanceLevels: text("resistance_levels"),
  trendDirection: text("trend_direction"),
  aiPrediction: text("ai_prediction"),
  confidence: real("confidence"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const macroDashboardTable = pgTable("macro_dashboard", {
  id: serial("id").primaryKey(),
  indicator: text("indicator").notNull(),
  currentValue: text("current_value"),
  previousValue: text("previous_value"),
  trend: text("trend"),
  impact: text("impact"),
  healthcareImpact: text("healthcare_impact"),
  aiCommentary: text("ai_commentary"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insiderActivityTable = pgTable("insider_activity", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  insiderName: text("insider_name"),
  title: text("title"),
  transactionType: text("transaction_type").notNull(),
  shares: real("shares"),
  price: real("price"),
  totalValue: real("total_value"),
  aiSignificance: text("ai_significance"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cryptoAnalysisTable = pgTable("crypto_analysis", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  analysis: text("analysis"),
  sentiment: text("sentiment"),
  technicals: text("technicals"),
  onChainMetrics: text("on_chain_metrics"),
  riskLevel: text("risk_level"),
  aiSignal: text("ai_signal"),
  model: text("model").notNull().default("deepseek-r1:8b"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingDataSourcesTable = pgTable("training_data_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  sourceType: text("source_type").notNull(),
  url: text("url"),
  config: text("config").notNull().default("{}"),
  schedule: text("schedule").notNull().default("daily"),
  lastRun: timestamp("last_run", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  totalRecords: integer("total_records").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingDataJobsTable = pgTable("training_data_jobs", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id"),
  domain: text("domain").notNull(),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("pending"),
  recordsCollected: integer("records_collected").notNull().default(0),
  recordsProcessed: integer("records_processed").notNull().default(0),
  outputFormat: text("output_format").notNull().default("jsonl"),
  outputPath: text("output_path"),
  aiSummary: text("ai_summary"),
  errorLog: text("error_log"),
  model: text("model").notNull().default("qwen2.5:7b"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voiceAgentProvidersTable = pgTable("voice_agent_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  category: text("category").notNull().default("cloud"),
  status: text("status").notNull().default("configured"),
  endpoint: text("endpoint"),
  apiKey: text("api_key"),
  model: text("model"),
  config: text("config").default("{}"),
  capabilities: text("capabilities").default("[]"),
  latencyMs: integer("latency_ms"),
  qualityScore: real("quality_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voiceConversationsTable = pgTable("voice_conversations", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id"),
  providerName: text("provider_name").notNull(),
  userMessage: text("user_message").notNull(),
  agentResponse: text("agent_response"),
  responseTimeMs: integer("response_time_ms"),
  audioUrl: text("audio_url"),
  sentiment: text("sentiment"),
  intentDetected: text("intent_detected"),
  confidence: real("confidence"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voiceBenchmarksTable = pgTable("voice_benchmarks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  testPrompts: text("test_prompts").notNull().default("[]"),
  results: text("results").default("{}"),
  winners: text("winners"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voiceFlowsTable = pgTable("voice_flows", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  providerId: integer("provider_id"),
  flowType: text("flow_type").notNull().default("linear"),
  nodes: text("nodes").notNull().default("[]"),
  edges: text("edges").notNull().default("[]"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingDatasetsTable = pgTable("training_datasets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  format: text("format").notNull().default("jsonl"),
  totalSamples: integer("total_samples").notNull().default(0),
  qualityScore: real("quality_score"),
  sampleData: text("sample_data"),
  metadata: text("metadata"),
  status: text("status").notNull().default("building"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
