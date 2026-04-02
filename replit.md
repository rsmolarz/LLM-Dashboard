# LLM Hub — AI Agent Orchestration Platform

## Overview
LLM Hub is a full-stack monorepo serving as an AI agent orchestration platform. It manages a self-hosted Ollama LLM server and provides functionalities for local LLM management, multi-conversation chat, advanced AI training pipelines, deep research capabilities, and specialized AI agents for various domains (e.g., clinical ENT, social media, hedge funds). The platform aims to offer a robust, scalable, and customizable environment for developing, deploying, and monitoring AI solutions, addressing the growing demand for flexible and powerful AI integration across diverse industries.

## User Preferences
I want iterative development.
I prefer detailed explanations.
I want to be asked before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
The project is structured as a pnpm monorepo with distinct artifacts for the frontend, backend, and shared libraries.

-   **Frontend**: React and Vite-based (`artifacts/llm-hub`) with a mobile-responsive design and specialized dashboards (Vision Studio, Analytics, Agent Orchestration, Clinical AI, Social Media AI, Hedge Fund AI).
-   **Backend**: Express.js server (`artifacts/api-server`).
-   **Database**: PostgreSQL with Drizzle ORM.
-   **API Design**: Zod schemas for validation (`lib/api-zod`) and Orval-generated React Query hooks (`lib/api-client-react`).
-   **Core Features**:
    -   **LLM Management**: Connects to a self-hosted Ollama server for model management and chat interactions.
    -   **Chat System**: Multi-conversation chat with model selection, message rating, and "Model Profiles" for specialized AI coaches.
    -   **Training & Customization**: Tools for Model Profiles, Training Data, Knowledge Base, fine-tuning, and Project Brain.
    -   **Deep Research Engine**: Multi-model research across local Ollama models and external services (Claude, GPT) with session saving and citations.
    -   **Vision Studio**: Integrates image generation (GPT-Image-1) and vision analysis (llava:13b) with domain-specific presets.
    -   **Agent Orchestration**: Manages AI agents with fleet management, task routing, memories, tool definitions, and step-by-step execution logs. Supports agent-to-agent communication via delegation.
    -   **RAG (Retrieval Augmented Generation)**: Vector-powered knowledge retrieval using pgvector on PostgreSQL (28,178 embedded chunks across 13 categories). Uses Ollama nomic-embed-text for embeddings with keyword-hash fallback. Management UI available. Includes Book & Document Ingestion tab for uploading Kindle exports (EPUB), text, markdown, and HTML files. Files are parsed, chunked (800 chars with 100 overlap), embedded, and stored as `source_type='book'`. Backend routes: `POST /api/rag-pipeline/ingest/book` (multipart file upload), `GET /api/rag-pipeline/books`, `DELETE /api/rag-pipeline/books/:sourceRef`.
    -   **Analytics & Monitoring**: Recharts-powered dashboard for usage metrics, model performance, and RAG statistics.
    -   **Model Evaluation Benchmarks**: Benchmarking page for LLM models across various categories with metrics and historical comparisons.
    -   **Health Check Monitoring**: Background monitoring of Ollama, VPS DB, and local DB with SSE alerts.
    -   **Theme Toggle**: Dark/Light theme with persistence.
    -   **Conversation Search & Filter**: Search and filter capabilities for chat conversations.
    -   **Workflow Automations**: UI for configuring and managing automated tasks with execution history and real-time status updates.
    -   **Voice Agent Hub**: Integrates 12 voice providers (6 cloud, 6 local) including OpenAI Voice and Local LLM (Ollama) for live audio interactions (TTS/STT, voice chat).
    -   **Real-time Notifications**: SSE-based system for user notifications and health alerts.
    -   **AgentFlow Integration**: Connects to an external AgentFlow platform for managing agents, workflows, and templates.
    -   **Prompt Library**: CRUD management for prompts with categories, tags, search, and usage tracking.
    -   **Model Compare**: Side-by-side comparison of Ollama model responses to a single prompt, including latency and token counts.
    -   **Reports & Digests**: Configuration for scheduled email digests with content selection and historical views.
    -   **API Playground**: Interactive frontend tool for testing platform API endpoints.
    -   **Conversation Memory**: Persistent key-value memory store for long-term context with categories and confidence scores.
    -   **Cost & Usage Tracker**: Token usage analytics, estimated costs, and budget alerts per model.
    -   **Team Collaboration**: Features for shared conversations, task management, and activity feeds.
    -   **HIPAA Compliance Dashboard**: Admin-only `/compliance` page with 3 tabs: Overview (13 compliance checks across Technical/Administrative/Physical safeguards, scored as compliant/warning/action-required), Audit Log (paginated, filterable by PHI-only, shows user/action/status/IP), PHI Access Report (30-day user-level PHI access summary). Backend: `GET /api/compliance/status|audit-logs|audit-stats|phi-access-report|activity-timeline` (all admin-only). Route: `routes/compliance.ts`.
    -   **HIPAA Audit Logging**: Global middleware (`middlewares/auditLog.ts`) logging every API request to `audit_logs` PostgreSQL table. Captures: user_id, user_email, action (method+path), resource, IP address, user_agent, PHI flag (auto-detected from route path), status code, duration. PHI routes: `/api/clinical`, `/api/voice-agent`, `/api/memory`, `/api/chat`, `/api/rag`, `/api/research`, `/api/data-agent`. Skips SSE/health-check endpoints. Non-blocking (async insert, errors logged not thrown).
    -   **Session Timeout**: Auto-logout after 15 minutes of inactivity (HIPAA requirement). Warning dialog appears at 13 minutes with countdown timer and "Continue Session" button. Resets on mouse/keyboard/scroll/touch activity (throttled to 5s). Hook: `hooks/useSessionTimeout.ts`.
    -   **Database Persistence**: Prompts, Memory, and Costs data now stored in PostgreSQL (not in-memory). Tables: `prompts`, `memory_entries`, `cost_usage`, `budget_alerts`, `audit_logs`, `compliance_reviews`, `compliance_deadlines`. Drizzle schema: `lib/db/src/schema/hipaa.ts`. Data survives server restarts. Seed functions populate initial data only on first run.
    -   **HIPAA Template Documents (12 total)**: BAA, Security Risk Assessment, Incident Response Plan, Workforce Training Policy, Physical Safeguards Policy, Notice of Privacy Practices, Data Backup & Disaster Recovery Plan, Encryption & Data Protection Policy, Sanctions Policy, Contingency Plan, Data Disposal & Media Sanitization Policy, Access Management & Termination Procedures, Minimum Necessary Standard Policy. Each document has multiple sections with fill-in-the-blank fields, tables, forms, and checklists. Viewable inline with expandable sections, copy-to-clipboard per section, and export as text file. API: `GET /api/compliance/documents` and `GET /api/compliance/documents/:id`.
    -   **Compliance Schedule & Calendar**: Quarterly review system with 8 recurring review types (quarterly compliance review, annual risk assessment, annual training, annual policy review, annual contingency test, monthly audit log review, annual BAA review, annual key rotation). Key HIPAA deadlines displayed (breach notification timelines, BAA requirements, workforce training deadlines, documentation retention periods, patient rights response deadlines). API: `GET /api/compliance/schedule`, `GET/POST /api/compliance/reviews`, `PATCH /api/compliance/reviews/:id`. DB tables: `compliance_reviews`, `compliance_deadlines`.
    -   **Specialized AI Domains**: Dedicated modules for Clinical ENT AI, Social Media AI, Hedge Fund AI, and Database Training Agent with tailored functionalities.
    -   **LLM Training Pipeline**: Includes fine-tuning, RLHF, knowledge distillation, and evaluation features.
-   **Authentication & Authorization**: Replit Auth (OIDC PKCE) with role-based access control (admin/user roles).
-   **Rate Limiting**: Per-user sliding window rate limiting for different API tiers.
-   **Export System**: Conversation and research session export in Markdown and HTML.
-   **SSL/TLS**: Full SSL configuration for VPS PostgreSQL.
-   **Auto-Collector & Continuous Training Pipeline**: In-memory scheduler for data collection and continuous training data generation across specific domains using model rotation.
-   **Domain-Specific Training Pipelines**: Dedicated pipelines for ENT and Hedge Fund, collecting and categorizing data from various sources for model fine-tuning.
-   **Platform API Gateway**: OpenAI-compatible API gateway (`/platform-api`) with key management, rate limiting, and usage tracking for external applications to access VPS LLM models. Merged model catalog: 12 Ollama VPS models + 350+ OpenRouter models (Claude, GPT, Gemini, Llama, DeepSeek, Mistral). OpenRouter models fetched from public API with 5-minute cache; requests with `/` in model name route to OpenRouter (billed to Replit credits), others go to Ollama VPS.
    -   **Browser Extension Integration**: Dedicated `/extension` page with step-by-step setup guide for connecting browser extensions (Chatbox, Page Assist, Smart Sidebar, LLM-X) to 360+ models. Two connection modes: (A) OpenAI-compatible via Platform API with API key for full model catalog + audit/analytics, (B) Direct Ollama connection to VPS for free self-hosted models. Includes inline API key generation, curated OpenRouter model recommendations with tier badges (premium/fast/free/budget), VPS model listing, and per-extension configuration instructions.

## External Dependencies
-   **Ollama**: Self-hosted LLM server (v0.18.0) for local models and embeddings.
-   **PostgreSQL**: Database hosted on Replit.
-   **OpenClaw**: For conversation history handling.
-   **OpenAI**: Integrated for advanced AI capabilities (e.g., gpt-5.2, GPT-Image-1).
-   **Anthropic**: Integrated for advanced AI capabilities (e.g., claude-sonnet-4-6).
-   **NCBI PubMed**: API for automated literature collection.
-   **Google Drive**: Used by the Auto-Collector for data ingestion.
-   **Alpha Factory**: External platform integrated via API for trading signals and market data.
-   **Various Voice AI Providers**: Integrated in the Voice Agent Hub (e.g., Amazon Lex, ElevenLabs, OpenAI Voice, Google Dialogflow, Azure Speech).
-   **OpenRouter**: AI model aggregator providing 350+ models (Claude, GPT, Gemini, Llama, DeepSeek, Mistral, etc.) via Replit AI Integrations proxy. Billed to Replit credits. Env vars: `AI_INTEGRATIONS_OPENROUTER_BASE_URL`, `AI_INTEGRATIONS_OPENROUTER_API_KEY`.