# Overview

This project is a pnpm monorepo using TypeScript, designed to manage and interact with self-hosted Large Language Models (LLMs), primarily through Ollama, on a Virtual Private Server (VPS). It provides a comprehensive dashboard, API server, and a suite of tools for LLM management, training data collection and processing, agent orchestration, and deep research capabilities. The core vision is to offer a robust, customizable, and locally-controlled environment for leveraging LLMs, with a focus on data privacy and application-specific intelligence. Key capabilities include:

-   **LLM Management**: Deploying, configuring, and interacting with Ollama-hosted LLMs.
-   **Training Data Pipeline**: Automated collection, processing, and export of diverse training data from various sources (Gmail, Google Drive, web, chat conversations).
-   **AI Agent Orchestration**: Managing a fleet of OpenClaw-powered AI agents with memory, task assignment, and smart routing.
-   **Knowledge Base / RAG**: Building and utilizing a retrieval-augmented generation system with document chunking and keyword-based search.
-   **Advanced AI Features**: Deep research engine, image generation and vision analysis studio, and a robust backup system.
-   **System Monitoring**: Real-time dashboard for monitoring the health and activity of the LLM ecosystem.

The project aims to empower users with full control over their AI infrastructure, enabling tailored AI solutions for specific domains like ENT training, finance, and general business operations.

# User Preferences

I prefer iterative development and ask before making major changes. I do not want any changes to be made to the file `replit.nix`. I prefer detailed explanations for complex features.

# System Architecture

The project is structured as a pnpm monorepo with several packages: `artifacts` (deployable applications like `api-server` and `llm-hub`), `lib` (shared libraries like `db`, `api-spec`, `api-zod`, `api-client-react`), and `scripts` (utility scripts).

**UI/UX Decisions:**
The `llm-hub` frontend is built with React, Vite, Tailwind CSS, and shadcn/ui. It features a tab-based navigation for Local LLM management, Chat, Training, and Agents. The UI includes dashboards for system monitoring, agent fleet management, and remote training data. The visual design emphasizes clarity, with status indicators, interactive tables, and configuration panels. Color schemes and component styling follow shadcn/ui defaults, ensuring a modern and consistent look. Specific domain presets are available for Vision Studio (e.g., Medical/ENT, Finance) and curated knowledge bases.

**Technical Implementations:**

-   **Monorepo Tooling**: pnpm workspaces manage packages, with Node.js 24 and TypeScript 5.9.
-   **API Framework**: Express 5 for the `api-server`, handling routes and interacting with the database and external services.
-   **Database**: PostgreSQL with Drizzle ORM is used for persistence. The `lib/db` package defines schema models and the Drizzle client. VPS-hosted tables on `72.60.167.64` store remote training data.
-   **Validation**: Zod (v4) with `drizzle-zod` for API request/response validation.
-   **API Codegen**: Orval generates React Query hooks (`lib/api-client-react`) and Zod schemas (`lib/api-zod`) from an OpenAPI 3.1 specification (`lib/api-spec/openapi.yaml`).
-   **Build System**: `esbuild` for CJS bundling and `Vite` for the React frontend.
-   **TypeScript Configuration**: All packages use `composite: true` and project references for efficient cross-package type checking and build order management.
-   **LLM Backend**: Ollama is the primary LLM backend, configured to run on a VPS (`72.60.167.64:11434`).
-   **RAG System**: Implemented using PostgreSQL-based keyword matching. Documents are auto-chunked (approx. 500 chars with 50-word overlap), and search uses word frequency scoring.
-   **Training Data Pipeline**: An in-memory auto-collector engine (auto-starts 15 seconds after server boot, runs every 30 minutes) gathers data from configured sources (Gmail, Drive, chat, Discovery Agent, Knowledge Base) and stores it in VPS PostgreSQL. Ollama is used for LLM processing to generate summaries, Q&A pairs, and quality scores.
-   **Agent Orchestration**: Utilizes OpenClaw Gateway for managing AI agent fleets. Agents have persistent memory, task orchestration, and smart task routing.
-   **Deep Research Engine**: Supports multi-model research using local Ollama models in parallel, with options to extend to Claude and GPT via Replit AI Integrations.
-   **Vision Studio**: Integrates GPT-Image-1 for image generation and llava:13b (on VPS) for vision analysis, with domain-specific presets.
-   **Backup System**: Snapshots Replit DB, VPS DB, Ollama inventory, and training data, storing records on the VPS.
-   **System Monitor**: A dedicated dashboard (`/monitor`) provides real-time system health, auto-collector status, database statistics, and LLM usage.

**Feature Specifications:**

-   **`api-server`**: Provides RESTful endpoints for LLM configuration, proxying, chat, model profiles, training data, RAG, OpenClaw, and Google service integrations (Gmail, Drive).
-   **`llm-hub`**: A comprehensive dashboard featuring:
    -   **Local LLM Tab**: Ollama status, model management, setup scripts, chat sandbox, VPS PostgreSQL config.
    -   **Chat Tab**: Full conversation UI with RAG toggle, message rating.
    -   **Training Tab**: Model Profiles (Modelfiles), Training Data (collection, export), Knowledge Base (document upload, URL fetching, bulk import, Discovery Agent, Context Scanner for Gmail/Drive), VPS Training (remote data management, Auto-Collector Engine, LLM Processing), Fine-tuning guidance.
    -   **Agents Tab**: OpenClaw fleet dashboard, agent creation/detail, Gateway settings, agent memory, task orchestration.

# External Dependencies

-   **Monorepo Orchestration**: pnpm
-   **Node.js Runtime**: Node.js 24
-   **TypeScript Compiler**: TypeScript 5.9
-   **API Framework**: Express 5
-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Validation**: Zod, drizzle-zod
-   **API Codegen**: Orval
-   **Bundler**: esbuild
-   **Frontend Framework**: React
-   **Build Tool (Frontend)**: Vite
-   **CSS Framework**: Tailwind CSS
-   **UI Components**: shadcn/ui
-   **LLM Runtime**: Ollama
-   **Google APIs**: `googleapis` (for Gmail), `@replit/connectors-sdk` (for Google Drive proxy)
-   **PostgreSQL Client**: `pg`
-   **AI Integrations**: OpenAI (gpt-5.2) and Anthropic (claude-sonnet-4-6) via Replit AI Integrations proxy.
-   **AI Agent Framework**: OpenClaw Gateway