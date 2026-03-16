# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── llm-hub/            # LLM Hub dashboard (React + Vite)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers
  - `health.ts` — `GET /api/healthz`
  - `llm-config.ts` — `GET/PUT /api/llm/config`, `GET /api/llm/setup-script`
  - `llm-proxy.ts` — `GET /api/llm/status`, `GET/POST /api/llm/models`, `POST /api/llm/chat` (with RAG context injection)
  - `chat.ts` — Conversation/message CRUD at `/api/chat/conversations`, message rating
  - `model-profiles.ts` — CRUD + deploy to Ollama via Modelfile API
  - `training-data.ts` — Training data CRUD, collect from conversations, export as JSONL
  - `rag.ts` — Document CRUD, auto-chunking, keyword-based similarity search
  - `openclaw.ts` — OpenClaw Gateway config, agent CRUD, agent chat via gateway, activity logs, fleet stats, VPS setup script
  - `scan.ts` — Gmail and Google Drive scanning (`/scan/gmail`, `/scan/gmail/message`, `/scan/drive`, `/scan/drive/content`)
  - `google-clients.ts` — Gmail (googleapis) and Google Drive (Replit connectors-sdk proxy) client helpers
  - `vps-database.ts` — VPS PostgreSQL config CRUD, connectivity test, setup script generator (`/vps-database/config`, `/vps-database/test`, `/vps-database/setup-script`)
  - `vps-training.ts` — VPS training data management: init tables on VPS, CRUD training sources, stats, export (`/vps-training/init`, `/vps-training/sources`, `/vps-training/stats`, `/vps-training/export`)
- Depends on: `@workspace/db`, `@workspace/api-zod`, `googleapis`, `@replit/connectors-sdk`, `pg`

### `artifacts/llm-hub` (`@workspace/llm-hub`)

LLM Hub dashboard — React + Vite web app for managing a self-hosted Ollama server on a VPS (72.60.167.64).

Features:
- **Local LLM Tab**: Status dashboard (server health, available/running models, default model), configuration panel, model management (pull/delete), setup script generator (Ollama + OpenWebUI), quick setup guide, local chat sandbox, **VPS PostgreSQL** panel (config, connectivity test, setup script generator for installing PostgreSQL on VPS)
- **Chat Tab**: Full chat interface with conversation sidebar, model selector (from Ollama), message history, thumbs up/down rating, RAG toggle for knowledge-base-augmented responses
- **Training Tab** (5 sub-tabs):
  - **Model Profiles**: Create custom model configs (system prompt, temperature, topP, topK, context length, repeat penalty), deploy to Ollama as Modelfiles
  - **Training Data**: Collect training pairs from conversations, add manually, rate quality, export as JSONL (OpenAI, Alpaca, ShareGPT formats)
  - **Knowledge Base (RAG)**: Upload documents, auto-chunk for retrieval, keyword-based search, context injection into chat, URL fetching (server-side HTML→text with SSRF protection), bulk import (markdown-header-separated), curated example knowledge bases (48 sources across 9 categories: Market Data, Medical/ENT, Hedge Funds, Alternative Data, Influencer, Research, Code & Dev, Security, Business) with category filter pills, **Discovery Agent** (AI-powered, uses Ollama LLM to continuously find new databases/APIs/data sources, approve/reject/import workflow, category-targeted or custom prompt discovery), **Context Scanner** (Gmail + Google Drive search integration — scan emails and Drive files to find relevant context for discovery priorities, **Save All to VPS** button to store scanned results directly to VPS PostgreSQL training database)
  - **VPS Training**: Remote training data dashboard stored on VPS PostgreSQL (72.60.167.64). Init tables, view/filter/manage collected sources (Gmail, Drive, web), update status (collected→reviewed→processed→rejected), rate quality (1-5 stars), export as JSONL (OpenAI, Alpaca, raw formats). Stats cards show totals by type and status. **Auto-Collector Engine**: Automated scheduled pipeline that continuously collects training data from all sources (Gmail with rotating search queries, Drive file extraction, chat conversation pairs, Discovery Agent approved/pending sources, Knowledge Base documents). Configurable interval (5-1440 min), per-source enable/disable toggles, custom search queries. **LLM Processing**: Uses Ollama to auto-analyze collected content — generates summaries, Q&A pairs, quality ratings, and category tags. Run manually or as part of auto-collection. Full run history with per-source result counts and error tracking.
  - **Fine-tuning**: Guided pipeline with step tracker, instructions for Unsloth/Axolotl/cloud GPU providers
- **Agents Tab**: OpenClaw-powered agent fleet management
  - **Fleet Dashboard**: Real-time agent grid with stats (total, active, idle, messages, tasks), category filters (General, Research, Customer Service, Code & Dev, Business Ops, Content, Security), search
  - **Agent Creation**: Name, emoji, category, system prompt, model, channels, temperature/maxTokens config
  - **Agent Detail**: Chat with individual agents via OpenClaw Gateway, activity logs, configuration JSON view, edit/delete
  - **Gateway Settings**: Configure OpenClaw Gateway URL, HTTP URL, and auth token
  - **VPS Setup Script**: Auto-generated bash script to install OpenClaw Gateway on VPS with systemd service
  - **Agent Memory**: Per-agent persistent memory (facts, summaries, preferences) with add/delete/filter, auto-injected as context during chat
  - **Task Orchestration**: Create/assign/complete tasks, status filters (pending/in-progress/completed/failed), priority levels (low/medium/high/urgent)
  - **Smart Task Router**: Auto-assigns tasks to best-suited agents based on category match, workload, and capabilities

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

Tables:
- `llm_config` — Ollama server configuration (serverUrl, port, gpuEnabled, defaultModel)
- `conversations` — Chat conversations with title and model
- `chat_messages` — Messages within conversations (role, content, rating)
- `model_profiles` — Custom model configurations (name, baseModel, systemPrompt, temperature, topP, topK, contextLength, repeatPenalty, deployed)
- `training_data` — Training pairs (inputText, outputText, systemPrompt, category, quality, source)
- `documents` — RAG knowledge base documents (title, content, category, chunksCount)
- `document_chunks` — Auto-generated text chunks from documents (documentId, content, chunkIndex)
- `openclaw_config` — OpenClaw Gateway connection settings (gatewayUrl, httpUrl, authToken)
- `agents` — AI agent definitions (agentId, name, emoji, model, systemPrompt, category, status, channels, temperature, maxTokens, tasksCompleted, totalMessages)
- `agent_logs` — Agent activity audit trail (agentId, level, message, metadata)
- `agent_memories` — Persistent agent memory (agentId, memoryType [fact/summary/preference], content, source, importance 1-10, tags)
- `agent_tasks` — Task orchestration (title, description, assignedAgentId, status [pending/in-progress/completed/failed], priority [low/medium/high/urgent], category, result, dueAt, completedAt)
- `vps_database_config` — VPS PostgreSQL connection settings (host, port, database, username, password, sslEnabled, isActive, lastTestedAt, lastTestResult)

**VPS-hosted tables** (on 72.60.167.64, db: llmhub):
- `training_sources` — Collected training data from Gmail/Drive/web (source_type, source_id, title, sender, content, content_preview, metadata JSONB, status, quality)
- `training_datasets` — Named dataset configurations for export (name, description, format, source_filter, min_quality, entry_count)

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec. Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

## Key Design Decisions

- **Ollama as LLM backend** (not llama.cpp): Default port 11434, uses `/api/tags`, `/api/ps`, `/api/version`, `/api/pull`, `/api/delete`, `/api/chat` (stream: false), `/api/create` (for Modelfile deployment)
- **VPS IP**: 72.60.167.64 — serverUrl stored as full URL like `http://72.60.167.64:11434`
- **RAG implementation**: PostgreSQL-based keyword matching (no vector DB). Documents auto-chunked at ~500 chars with 50-word overlap. Search uses word frequency scoring.
- **Training data export formats**: OpenAI (ChatML), Alpaca (instruction/input/output), ShareGPT (for Unsloth/Axolotl)
- **Auto-Collector Engine**: Scheduled pipeline collecting from Gmail, Drive, chat, Discovery Agent, Knowledge Base → VPS PostgreSQL. LLM processing via Ollama generates summaries, Q&A pairs, quality scores. In-memory scheduler (resets on restart).
- **Vite config defaults**: PORT and BASE_PATH have fallback defaults so builds succeed without env vars set
- **Deep Research**: Multi-model research engine at `/research`. "Deep" mode fans out to all local Ollama models in parallel; "Extensive" mode adds Claude (Sonnet 4-6) and GPT (5.2) via Replit AI Integrations. Results synthesized into a unified analysis.
- **AI Integrations**: OpenAI (gpt-5.2) via `@workspace/integrations-openai-ai-server`, Anthropic (claude-sonnet-4-6) via `@workspace/integrations-anthropic-ai`. Both use Replit AI Integrations proxy (no user API keys needed, billed to Replit credits).
- **Vision Studio**: `/vision` page with image generation (GPT-Image-1) and vision analysis (llava:13b on VPS). Domain presets for Medical/ENT (audiograms, scopes, CT), Finance/Hedge Fund (charts, documents), Social Media (posts, competitors), Real Estate (properties, staging). Express body limit set to 20MB for image uploads.
- **VPS models**: qwen2.5:7b, deepseek-r1:8b, meditron:7b, mistral:latest, llama3.2:latest, llava:13b (vision)
