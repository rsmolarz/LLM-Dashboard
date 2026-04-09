# LLM Hub — AI Agent Orchestration Platform

## Overview
LLM Hub is a full-stack monorepo designed as an AI agent orchestration platform. It manages a self-hosted Ollama LLM server, offering functionalities for local LLM management, multi-conversation chat, advanced AI training pipelines, deep research, and specialized AI agents. The platform aims to provide a scalable and customizable environment for developing, deploying, and monitoring AI solutions across various industries, including clinical ENT, social media, and hedge funds.

## User Preferences
I want iterative development.
I prefer detailed explanations.
I want to be asked before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
The project is a pnpm monorepo with separate artifacts for the frontend, backend, and shared libraries.

-   **Frontend**: React and Vite-based (`artifacts/llm-hub`) with mobile-responsive design and specialized dashboards (Vision Studio, Analytics, Agent Orchestration, Clinical AI, Social Media AI, Hedge Fund AI, Code Agent, Claw Code Agent, Coding Workbench, LLM Manager).
-   **Backend**: Express.js server (`artifacts/api-server`).
-   **Database**: PostgreSQL with Drizzle ORM.
-   **API Design**: Zod schemas for validation and Orval-generated React Query hooks.
-   **Core Features**:
    -   **LLM Management**: Connects to a self-hosted Ollama server for model management and chat.
    -   **Chat System**: Multi-conversation chat with model selection, message rating, and "Model Profiles" for specialized AI coaches. Supports importing conversations from various sources.
    -   **Training & Customization**: Tools for Model Profiles, Training Data, Knowledge Base, fine-tuning, and Project Brain.
    -   **Deep Research Engine**: Multi-model research across local Ollama models and external services with session saving and citations.
    -   **Vision Studio**: Integrates image generation and vision analysis with domain-specific presets.
    -   **Agent Orchestration**: Manages AI agents with fleet management, task routing, memories, tool definitions, and step-by-step execution logs, supporting agent-to-agent communication.
    -   **RAG (Retrieval Augmented Generation)**: Vector-powered knowledge retrieval using pgvector on PostgreSQL (28,178 embedded chunks). Includes management UI and book/document ingestion.
    -   **Analytics & Monitoring**: Dashboard for usage metrics, model performance, and RAG statistics.
    -   **Model Evaluation Benchmarks**: Benchmarking page for LLM models.
    -   **Health Check Monitoring**: Background monitoring of Ollama, VPS DB, and local DB with SSE alerts.
    -   **Workflow Automations**: UI for configuring and managing automated tasks.
    -   **Voice Agent Hub**: Integrates 12 voice providers for live audio interactions (TTS/STT, voice chat).
    -   **Real-time Notifications**: SSE-based system for user notifications and health alerts.
    -   **Prompt Library**: CRUD management for prompts with categories, tags, search, and usage tracking.
    -   **Model Compare**: Side-by-side comparison of Ollama model responses.
    -   **Conversation Memory**: Persistent key-value memory store for long-term context.
    -   **Cost & Usage Tracker**: Token usage analytics, estimated costs, and budget alerts per model.
    -   **Team Collaboration**: Features for shared conversations, task management, and activity feeds.
    -   **HIPAA Compliance**: Dashboard, audit logging for all API requests, session timeout, and database persistence for sensitive data. Includes HIPAA template documents and a compliance schedule/calendar.
    -   **Code Agent**: AI coding assistant with chat, file explorer, code editor, integrated terminal, model selector, code block actions, and repository cloning.
    -   **Claw Code Agent**: Integration of the Claw Code Agent Python framework with overview, source browser, and configuration.
    -   **Coding Workbench**: Multi-panel IDE-like workbench with AI code chat, shell terminal, file explorer, Git panel, database explorer, and environment variables viewer.
    -   **Specialized AI Domains**: Dedicated modules for Clinical ENT AI, Social Media AI, Hedge Fund AI, and Database Training Agent.
    -   **LLM Training Pipeline**: Includes fine-tuning, RLHF, knowledge distillation, and evaluation features.
-   **Authentication & Authorization**: Replit Auth (OIDC PKCE) with role-based access control.
-   **Rate Limiting**: Per-user sliding window rate limiting.
-   **Export System**: Conversation and research session export.
-   **SSL/TLS**: Full SSL configuration for VPS PostgreSQL.
-   **Auto-Collector & Continuous Training Pipeline**: In-memory scheduler for data collection and continuous training.
-   **Platform API Gateway**: OpenAI-compatible API gateway (`/platform-api`) with key management, rate limiting, and usage tracking, supporting 12 Ollama VPS models and 350+ OpenRouter models.
    -   **Browser Extension Integration**: Dedicated page for connecting browser extensions to the platform's models, including API key generation and configuration instructions.

## External Dependencies
-   **Ollama**: Self-hosted LLM server (v0.18.0) for local models and embeddings.
-   **PostgreSQL**: Database hosted on Replit.
-   **OpenAI**: Integrated for advanced AI capabilities (e.g., GPT-5.2, GPT-Image-1).
-   **Anthropic**: Integrated for advanced AI capabilities (e.g., Claude-Sonnet-4-6).
-   **OpenRouter**: AI model aggregator providing 350+ models (Claude, GPT, Gemini, Llama, DeepSeek, Mistral, etc.) via Replit AI Integrations proxy.
-   **NCBI PubMed**: API for automated literature collection.
-   **Google Drive**: Used by the Auto-Collector for data ingestion.
-   **Alpha Factory**: External platform integrated via API for trading signals and market data.
-   **Various Voice AI Providers**: Integrated in the Voice Agent Hub (e.g., Amazon Lex, ElevenLabs, OpenAI Voice, Google Dialogflow, Azure Speech).