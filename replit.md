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
    -   **RAG (Retrieval Augmented Generation)**: Vector-powered knowledge retrieval using pgvector on PostgreSQL. Supports Ollama embedding models (nomic-embed-text) with keyword-hash fallback. Ingests PubMed articles, ENT training knowledge, document chunks, and custom documents. HNSW index for fast cosine similarity search. Integrated into chat via `prepareRagMessages` — vector search is attempted first, falls back to TF-IDF keyword matching. Management UI at `/rag` with ingestion controls, test search, and source breakdown.
    -   **Analytics & Monitoring**: Provides dashboards for usage, model performance, VPS stats, and real-time system health metrics.
    -   **Workflow Automation**: Schedules recurring tasks like research, training, backups, and benchmarks.
    -   **Real-time Notifications**: SSE-based system for user notifications.
    -   **Specialized AI Domains**: Dedicated modules for Clinical ENT AI (15 tabs), Social Media AI (11 tabs), Hedge Fund AI (14 tabs), Database Training Agent (5 tabs), and Voice Agent Hub (8 tabs) with comprehensive features tailored to each domain.
    -   **LLM Training Pipeline**: Includes features like fine-tuning, RLHF feedback loops from chat ratings, knowledge distillation, few-shot prompt libraries, and evaluation/benchmarking.
-   **Authentication**: Replit Auth (OIDC PKCE) for user authentication and session management, ensuring per-user data scoping.
-   **Auto-Collector & Continuous Training Pipeline**: An in-memory scheduler for data collection (Gmail, Google Drive, chat conversations, etc.) and continuous training data generation across specific domains (ENT, Social, Hedge Fund) using model rotation and sub-topic rotation. It handles streaming API responses and robust JSON parsing.
-   **Domain-Specific Training Pipelines**:
    -   **ENT Training Pipeline**: Collects data from PubMed, PMC, ClinicalTrials.gov, OpenAlex, and internal VPS training, categorizing it across 20 ENT categories for fine-tuning Meditron-based models. Includes 10 built-in knowledge modules for RAG.
    -   **Hedge Fund Training Pipeline**: Gathers data from SEC EDGAR, OpenAlex Finance, FRED Macro, and synthetic scenarios, categorized across 18 finance categories to train deepseek-r1-based models.

## External Dependencies
-   **Ollama**: Self-hosted LLM server (VPS IP: 72.60.167.64, port 11434, v0.18.0). Model creation uses new `from`/`system`/`parameters` API format (not legacy `modelfile` string).
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