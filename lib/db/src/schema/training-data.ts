import { pgTable, text, serial, integer, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trainingDataTable = pgTable("training_data", {
  id: serial("id").primaryKey(),
  inputText: text("input_text").notNull(),
  outputText: text("output_text").notNull(),
  systemPrompt: text("system_prompt").notNull().default(""),
  category: text("category").notNull().default("general"),
  quality: integer("quality").notNull().default(3),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTrainingDataSchema = createInsertSchema(trainingDataTable).omit({ id: true, createdAt: true });
export type InsertTrainingData = z.infer<typeof insertTrainingDataSchema>;
export type TrainingData = typeof trainingDataTable.$inferSelect;

export const fineTuningJobsTable = pgTable("fine_tuning_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  baseModel: text("base_model").notNull(),
  outputModel: text("output_model").notNull(),
  status: text("status").notNull().default("pending"),
  systemPrompt: text("system_prompt").notNull().default(""),
  datasetFilter: text("dataset_filter").notNull().default(""),
  samplesCount: integer("samples_count").notNull().default(0),
  modelfileContent: text("modelfile_content").notNull().default(""),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const rlhfPairsTable = pgTable("rlhf_pairs", {
  id: serial("id").primaryKey(),
  prompt: text("prompt").notNull(),
  chosenResponse: text("chosen_response").notNull(),
  rejectedResponse: text("rejected_response").notNull(),
  model: text("model").notNull().default(""),
  category: text("category").notNull().default("general"),
  source: text("source").notNull().default("chat_ratings"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fewShotLibrariesTable = pgTable("few_shot_libraries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("general"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fewShotExamplesTable = pgTable("few_shot_examples", {
  id: serial("id").primaryKey(),
  libraryId: integer("library_id").notNull().references(() => fewShotLibrariesTable.id, { onDelete: "cascade" }),
  userMessage: text("user_message").notNull(),
  assistantResponse: text("assistant_response").notNull(),
  keywords: text("keywords").notNull().default(""),
  priority: integer("priority").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalBenchmarksTable = pgTable("eval_benchmarks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("general"),
  questionsCount: integer("questions_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalQuestionsTable = pgTable("eval_questions", {
  id: serial("id").primaryKey(),
  benchmarkId: integer("benchmark_id").notNull().references(() => evalBenchmarksTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  expectedAnswer: text("expected_answer").notNull(),
  category: text("category").notNull().default("general"),
  difficulty: text("difficulty").notNull().default("medium"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalRunsTable = pgTable("eval_runs", {
  id: serial("id").primaryKey(),
  benchmarkId: integer("benchmark_id").notNull().references(() => evalBenchmarksTable.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  status: text("status").notNull().default("pending"),
  totalQuestions: integer("total_questions").notNull().default(0),
  completedQuestions: integer("completed_questions").notNull().default(0),
  avgScore: real("avg_score"),
  avgLatencyMs: real("avg_latency_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const evalResultsTable = pgTable("eval_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => evalRunsTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => evalQuestionsTable.id, { onDelete: "cascade" }),
  modelAnswer: text("model_answer").notNull(),
  score: real("score").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const distillationJobsTable = pgTable("distillation_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  teacherModel: text("teacher_model").notNull(),
  studentModel: text("student_model").notNull(),
  status: text("status").notNull().default("pending"),
  category: text("category").notNull().default("general"),
  prompts: text("prompts").notNull().default("[]"),
  promptsCount: integer("prompts_count").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  pairsGenerated: integer("pairs_generated").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
