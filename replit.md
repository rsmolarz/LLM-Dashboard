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
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `artifacts/llm-hub` (`@workspace/llm-hub`)

LLM Hub dashboard — React + Vite web app for managing a self-hosted Ollama server on a VPS (72.60.167.64).

Features:
- **Local LLM Tab**: Status dashboard (server health, available/running models, default model), configuration panel, model management (pull/delete), setup script generator (Ollama + OpenWebUI), quick setup guide, local chat sandbox
- **Chat Tab**: Full chat interface with conversation sidebar, model selector (from Ollama), message history, thumbs up/down rating, RAG toggle for knowledge-base-augmented responses
- **Training Tab** (4 sub-tabs):
  - **Model Profiles**: Create custom model configs (system prompt, temperature, topP, topK, context length, repeat penalty), deploy to Ollama as Modelfiles
  - **Training Data**: Collect training pairs from conversations, add manually, rate quality, export as JSONL (OpenAI, Alpaca, ShareGPT formats)
  - **Knowledge Base (RAG)**: Upload documents, auto-chunk for retrieval, keyword-based search, context injection into chat
  - **Fine-tuning**: Guided pipeline with step tracker, instructions for Unsloth/Axolotl/cloud GPU providers

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
