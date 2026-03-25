# LLM Hub — AI Agent Orchestration Platform

## Overview
LLM Hub is a full-stack monorepo designed to be a comprehensive AI agent orchestration platform. It manages a self-hosted Ollama LLM server, offering functionalities ranging from local LLM management and multi-conversation chat to advanced AI training pipelines, deep research capabilities, and specialized AI agents for various domains like clinical ENT, social media, and hedge funds. The platform aims to provide a robust, scalable, and customizable environment for developing, deploying, and monitoring AI solutions.

## User Preferences
I want iterative development.
I prefer detailed explanations.
I want to be asked before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
The project is structured as a pnpm monorepo with distinct artifacts for the frontend and backend, and shared libraries.

-   **Frontend**: Built with React and Vite (`artifacts/llm-hub`). It features a mobile-responsive design with a hamburger menu, responsive grid layouts, and touch-friendly controls. UI/UX includes various specialized dashboards and studios (e.g., Vision Studio, Analytics Dashboard, Agent Orchestration, Clinical AI, Social Media AI, Hedge Fund AI).
-   **Backend**: An Express.js server (`artifacts/api-server`).
-   **Database**: Utilizes Drizzle ORM with PostgreSQL.
-   **API Design**: Zod schemas for API validation (`lib/api-zod`) and React Query hooks for client-side data fetching (`lib/api-client-react`) are generated using Orval.
-   **Core Features**:
    -   **LLM Management**: Connects to a self-hosted Ollama server on a VPS for model management (pull/delete), chat interactions, and streaming responses.
    -   **Chat System**: Supports multi-conversation chats, model selection, message rating, and integrates "Model Profiles" to inject system prompts for specialized AI coaches.
    -   **Training & Customization**: Comprehensive suite of tools across 10 tabs including Model Profiles, Training Data management, Knowledge Base, fine-tuning, and Project Brain.
    -   **Deep Research Engine**: Facilitates multi-model research, fanning out queries to local Ollama models ("Deep" mode) and external services like Claude and GPT ("Extensive" mode), with session saving and source citations.
    -   **Vision Studio**: Integrates image generation (GPT-Image-1) and vision analysis (llava:13b) with domain-specific presets (Medical/ENT, Finance, Social Media, Real Estate).
    -   **Agent Orchestration**: Manages AI agents with fleet management, task routing, memories, tool definitions, and category filtering. Features step-by-step execution logs.
    -   **RAG (Retrieval Augmented Generation)**: Vector-powered knowledge retrieval using pgvector on PostgreSQL. 28,178 embedded chunks across 13 source categories (PubMed 19,436 / SEC Edgar 2,824 / ClinicalTrials 2,343 / OpenAlex Finance 1,881 / PMC 789 / OpenAlex 363 / Knowledge Base 263 / auto-generated 133 / HF Synthetic 64 / FRED Macro 46 / ENT Training 35 / Custom 1). Supports Ollama nomic-embed-text with keyword-hash fallback (cached Ollama availability check, 60s TTL). HNSW index for fast cosine similarity search. Integrated into chat via `prepareRagMessages`. Management UI at `/rag` with 3 tabs (Knowledge Sources, Test Search, Ingest Data).
    -   **Analytics & Monitoring**: Interactive Recharts-powered dashboard with area charts (Messages Over Time), pie charts (Model Usage Distribution), bar charts (Ratings, Benchmarks). Stat cards for Conversations, Messages, RAG Documents, RAG Chunks. Refresh button. VPS training data panel.
    -   **Model Evaluation Benchmarks**: `/evaluation` page for benchmarking LLM models across 5 categories (General, Coding, Reasoning, Medical, Finance). Run benchmarks, view latency/tokens-per-second metrics, score responses 1-10, compare models with charts. Backend: `GET /api/evaluation/categories`, `POST /api/evaluation/run`, `POST /api/evaluation/score`, `GET /api/evaluation/history`.
    -   **Health Check Monitoring**: Background health monitor checking Ollama, VPS DB, and local DB every 60 seconds. SSE alerts via `/api/health/events` when services go down or recover. Status endpoint: `GET /api/health/status`, history: `GET /api/health/history`.
    -   **Dark/Light Theme Toggle**: Sun/Moon icon in header. Theme persisted in localStorage. CSS variables for both themes defined in `index.css`. `.light` class applied to `<html>`.
    -   **Conversation Search & Filter**: Search bar and model filter in Chat sidebar. Filters conversations by title text and model name. Clear button and active filter badge.
    -   **RAG Embedding Statistics**: `GET /api/rag-pipeline/embedding-stats` shows semantic vs keyword-hash breakdown with progress bar. Displayed in RAG Ingest tab above re-embedding section.
    -   **Workflow Automation**: Schedules recurring tasks like research, training, backups, and benchmarks.
    -   **Real-time Notifications**: SSE-based system for user notifications and health alerts.
    -   **Specialized AI Domains**: Dedicated modules for Clinical ENT AI (15 tabs), Social Media AI (11 tabs), Hedge Fund AI (14 tabs), Database Training Agent (5 tabs), and Voice Agent Hub (8 tabs) with comprehensive features tailored to each domain.
    -   **LLM Training Pipeline**: Includes features like fine-tuning, RLHF feedback loops from chat ratings, knowledge distillation, few-shot prompt libraries, and evaluation/benchmarking.
-   **Authentication & Authorization**: Replit Auth (OIDC PKCE) with role-based access control (admin/user roles). `requireAuth` and `requireAdmin` middleware for protected routes. Admin user management endpoints (`GET /api/auth/users`, `PUT /api/auth/users/:id/role`). First user should be promoted to admin via SQL. Admin-only pages (Monitor, Admin) have both frontend `isAdmin` guards and backend `requireAdmin` middleware. Admin-only nav tabs: Databases, Pipeline, Platform API, Monitor, Admin.
-   **Rate Limiting**: Per-user sliding window rate limiter middleware with different tiers: LLM chat (30 req/min), deep research (10 req/min), training (60 req/min). Returns 429 with `Retry-After` and `X-RateLimit-*` headers.
-   **Agent-to-Agent Communication**: Agents can delegate subtasks to specialized agents via `POST /api/agents/:agentId/delegate`. Inter-agent message bus (`agent_messages` table) with request/response pattern. Delegation chain tracking via `parentTaskId` and `delegatedByAgentId` fields.
-   **Export System**: Conversation and research session export in Markdown and HTML formats. Routes: `GET /api/export/conversation/:id/(markdown|html)`, `GET /api/export/research/:id/(markdown|html)`. Export buttons in Chat header and Research session list.
-   **SSL/TLS for VPS PostgreSQL**: Full SSL configuration for VPS database connections including CA cert, client cert/key, SSL mode, and `rejectUnauthorized` options. Stored in `vps_database_config` table.
-   **Semantic RAG Re-Embedding**: `POST /api/rag-pipeline/re-embed` endpoint to batch-upgrade keyword-hash embeddings to semantic vectors using Ollama nomic-embed-text. UI button in RAG Ingest tab.
-   **Auto-Collector & Continuous Training Pipeline**: An in-memory scheduler for data collection (Gmail, Google Drive, chat conversations, etc.) and continuous training data generation across specific domains (ENT, Social, Hedge Fund) using model rotation and sub-topic rotation. It handles streaming API responses and robust JSON parsing.
-   **Domain-Specific Training Pipelines**:
    -   **ENT Training Pipeline**: Collects data from PubMed, PMC, ClinicalTrials.gov, OpenAlex, and internal VPS training, categorizing it across 20 ENT categories for fine-tuning Meditron-based models. Includes 10 built-in knowledge modules for RAG.
    -   **Hedge Fund Training Pipeline**: Gathers data from SEC EDGAR, OpenAlex Finance, FRED Macro, and synthetic scenarios, categorized across 18 finance categories to train deepseek-r1-based models.

## External Dependencies
-   **Ollama**: Self-hosted LLM server (VPS IP: 72.60.167.64, port 11434, v0.18.0). 12 models including nomic-embed-text for embeddings. Model creation uses new `from`/`system`/`parameters` API format (not legacy `modelfile` string).
-   **PostgreSQL**: Database hosted on Replit (VPS IP: 72.60.167.64, port 5432).
-   **OpenClaw**: (VPS IP: 72.60.167.64, port 18789) for conversation history handling.
-   **OpenAI**: Integrated for advanced AI capabilities (e.g., gpt-5.2, GPT-Image-1) via Replit AI Integrations proxy.
-   **Anthropic**: Integrated for advanced AI capabilities (e.g., claude-sonnet-4-6) via Replit AI Integrations proxy.
-   **NCBI PubMed**: Free API for automated literature collection.
-   **Google Drive**: Used by the Auto-Collector for data ingestion.
-   **Alpha Factory (Market Inefficiency Agents)**: External platform integrated via API for trading signals, dashboard KPIs, HF analytics, agent status, and market data (proxied from `marketinefficiencyagents.com`).
-   **Various Voice AI Providers**: Integrated and benchmarked in the Voice Agent Hub (e.g., Amazon Lex, ElevenLabs, OpenAI Voice, Google Dialogflow, Azure Speech, IBM Watson, Rasa, DeepPavlov, OpenVoice/OVO, Mycroft, Coqui TTS).

## Platform API Gateway
OpenAI-compatible API gateway (`/platform-api`) enabling external applications to access VPS LLM models:
-   **OpenAI-Compatible Endpoints**: `GET /api/v1/models` (list models), `POST /api/v1/chat/completions` (chat with streaming support) — works with any OpenAI SDK by pointing `base_url` at this server.
-   **API Key Management**: Generate, activate/deactivate, and delete API keys. Keys use SHA-256 hashing (only shown once on creation). Stored in `api_keys` PostgreSQL table.
-   **Rate Limiting**: Per-key configurable rate limits (requests/minute) with in-memory sliding window.
-   **Usage Tracking**: Atomic SQL-increment counters for total requests and tokens per key.
-   **Management UI**: 3-tab interface (API Keys, Documentation, Usage) with key creation form, copy-to-clipboard, toggle/delete controls, and auto-generated code examples (Python, JS/TS, curl).
-   **Route**: `artifacts/api-server/src/routes/platform-api.ts`; DB schema: `lib/db/src/schema/api-keys.ts`; Frontend: `artifacts/llm-hub/src/pages/PlatformApi.tsx`.

## Research Pipeline
The ENT Clinical AI Research Pipeline (`/research-pipeline`) is a comprehensive clinical research management section sourced from 4 uploaded DOCX documents:
-   **REDCap Data Schema**: 6 instruments (Enrollment, Clinical Presentation, Diagnosis, Imaging, Voice Data, Treatment Outcomes) with 55+ fields using canonical REDCap data dictionary types (`text`, `radio`, `checkbox`, `dropdown`, `slider`, `file`) and coded choices (e.g., `1, Male | 2, Female`). Exportable as REDCap-importable CSV.
-   **IRB Protocol**: 8 protocol sections covering Title, Background, Aims, Design, Population, Data Management, Risk Assessment, and Consent. Editable status tracking (draft/review/approved/submitted).
-   **Outreach Email Templates**: 3 pre-written templates for recruiting ML collaborators (Faculty, Informatics Team, Grad Student/Postdoc).
-   **Patient Consent Addendum**: 6-section HIPAA-compliant consent form template.
-   **Task Tracker**: 17 tasks across 6 phases (IRB & Compliance, Infrastructure, Data Collection, Collaboration, ML Development, Publication) with status management.
-   **API Routes**: All under `/api/research-pipeline/*` with input validation on PUT endpoints. Data is in-memory (resets on server restart).