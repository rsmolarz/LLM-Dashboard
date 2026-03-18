import { Router } from "express";
import { db } from "@workspace/db";
import { voiceAgentProvidersTable, voiceConversationsTable, voiceBenchmarksTable, voiceFlowsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any, next: any) { next(); }

function sanitizeProvider(p: any) {
  const { apiKey, ...rest } = p;
  return { ...rest, hasApiKey: !!apiKey };
}

async function getServerUrl(): Promise<string | null> {
  const url = process.env.OLLAMA_BASE_URL || process.env.VPS_OLLAMA_URL;
  if (url) return url;
  const vpsIp = process.env.VPS_IP || "72.60.167.64";
  return `http://${vpsIp}:11434`;
}

async function queryOllama(serverUrl: string, model: string, prompt: string): Promise<string> {
  const r = await fetch(`${serverUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  const data = await r.json();
  return data.response || "";
}

const PROVIDERS_REGISTRY = [
  { name: "Amazon Lex", provider: "amazon_lex", category: "cloud", capabilities: ["NLU", "ASR", "Dialog Management", "Multi-language", "Lambda Integration"], model: "lex-v2" },
  { name: "ElevenLabs", provider: "elevenlabs", category: "cloud", capabilities: ["TTS", "Voice Cloning", "Multi-language", "Emotion Control", "Real-time Streaming"], model: "eleven_multilingual_v2" },
  { name: "OpenAI Voice", provider: "openai_voice", category: "cloud", capabilities: ["TTS", "STT", "Whisper ASR", "GPT-4o Realtime", "Multi-language"], model: "gpt-4o-audio" },
  { name: "Google Dialogflow", provider: "google_dialogflow", category: "cloud", capabilities: ["NLU", "Intent Detection", "Entity Extraction", "Multi-language", "Fulfillment Webhooks"], model: "dialogflow-cx" },
  { name: "Microsoft Azure Speech", provider: "azure_speech", category: "cloud", capabilities: ["TTS", "STT", "Speaker Recognition", "Custom Voice", "Real-time Translation"], model: "azure-neural-tts" },
  { name: "IBM Watson Assistant", provider: "ibm_watson", category: "cloud", capabilities: ["NLU", "Dialog Management", "Intent Classification", "Entity Extraction", "Actions"], model: "watson-assistant-v2" },
  { name: "Rasa", provider: "rasa", category: "local", capabilities: ["NLU", "Dialog Management", "Custom Actions", "Entity Extraction", "Self-hosted"], model: "rasa-3.x" },
  { name: "DeepPavlov", provider: "deeppavlov", category: "local", capabilities: ["NLU", "QA", "Named Entity Recognition", "Intent Classification", "Pre-trained Models"], model: "deeppavlov-dream" },
  { name: "OpenVoice (OVO)", provider: "openvoice", category: "local", capabilities: ["TTS", "Voice Cloning", "Zero-shot Cloning", "Tone Control", "Multi-language"], model: "openvoice-v2" },
  { name: "Mycroft", provider: "mycroft", category: "local", capabilities: ["STT", "TTS", "Skills Framework", "Privacy-focused", "Wake Word"], model: "mycroft-mimic3" },
  { name: "Local LLM (Ollama)", provider: "ollama_local", category: "local", capabilities: ["Conversational AI", "Multi-model", "Self-hosted", "Fine-tunable", "Domain-specific"], model: "qwen2.5:7b" },
  { name: "Coqui TTS", provider: "coqui", category: "local", capabilities: ["TTS", "Voice Cloning", "Multi-language", "XTTS", "Fine-tunable"], model: "xtts-v2" },
];

router.get("/voice-agent/providers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(voiceAgentProvidersTable).orderBy(voiceAgentProvidersTable.category);
  res.json(rows.map(sanitizeProvider));
});

router.get("/voice-agent/registry", async (_req, res): Promise<void> => {
  res.json(PROVIDERS_REGISTRY);
});

router.post("/voice-agent/providers", requireAuth, async (req, res): Promise<void> => {
  const { name, provider, category, endpoint, apiKey, model, config, capabilities } = req.body;
  if (!name || !provider) { res.status(400).json({ error: "name and provider required" }); return; }
  const [row] = await db.insert(voiceAgentProvidersTable).values({
    name, provider, category: category || "cloud",
    endpoint, apiKey, model,
    config: config ? JSON.stringify(config) : "{}",
    capabilities: capabilities ? JSON.stringify(capabilities) : "[]",
    status: "configured",
  }).returning();
  res.json(row);
});

router.post("/voice-agent/providers/init-all", requireAuth, async (_req, res): Promise<void> => {
  const existing = await db.select().from(voiceAgentProvidersTable);
  const existingProviders = new Set(existing.map(e => e.provider));
  const toInsert = PROVIDERS_REGISTRY.filter(p => !existingProviders.has(p.provider));
  if (toInsert.length === 0) { res.json({ message: "All providers already initialized", count: 0 }); return; }
  const rows = await db.insert(voiceAgentProvidersTable).values(
    toInsert.map(p => ({
      name: p.name, provider: p.provider, category: p.category,
      model: p.model, capabilities: JSON.stringify(p.capabilities), status: "configured",
    }))
  ).returning();
  res.json({ message: `Initialized ${rows.length} providers`, count: rows.length, providers: rows });
});

router.put("/voice-agent/providers/:id", requireAuth, async (req, res): Promise<void> => {
  const { endpoint, apiKey, model, config, status } = req.body;
  const updates: any = {};
  if (endpoint !== undefined) updates.endpoint = endpoint;
  if (apiKey !== undefined) updates.apiKey = apiKey;
  if (model !== undefined) updates.model = model;
  if (config !== undefined) updates.config = JSON.stringify(config);
  if (status !== undefined) updates.status = status;
  const [row] = await db.update(voiceAgentProvidersTable).set(updates).where(eq(voiceAgentProvidersTable.id, parseInt(req.params.id))).returning();
  res.json(row);
});

router.delete("/voice-agent/providers/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(voiceAgentProvidersTable).where(eq(voiceAgentProvidersTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

router.post("/voice-agent/chat", requireAuth, async (req, res): Promise<void> => {
  const { providerId, providerName, message, model } = req.body;
  if (!message) { res.status(400).json({ error: "message required" }); return; }

  const provider = providerName || "ollama_local";
  const startTime = Date.now();
  let agentResponse = "";
  let intentDetected = "";
  let confidence = 0;

  try {
    if (provider === "ollama_local" || provider === "Local LLM (Ollama)") {
      const serverUrl = await getServerUrl();
      if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }
      const useModel = model || "qwen2.5:7b";
      const prompt = "You are a helpful voice assistant. Respond conversationally and concisely. Keep responses natural and suitable for text-to-speech.\n\nUser: " + message + "\n\nAssistant:";
      agentResponse = await queryOllama(serverUrl, useModel, prompt);
      intentDetected = "conversation";
      confidence = 0.9;
    } else {
      agentResponse = `[${provider}] This provider requires API configuration. Please set up the endpoint and API key in the Providers tab to enable live responses. Simulated response for: "${message}"`;
      intentDetected = "simulated";
      confidence = 0.5;
    }
  } catch (e: any) {
    agentResponse = `Error: ${e.message}`;
    confidence = 0;
  }

  const responseTimeMs = Date.now() - startTime;

  const [conversation] = await db.insert(voiceConversationsTable).values({
    providerId, providerName: provider,
    userMessage: message, agentResponse,
    responseTimeMs, intentDetected, confidence,
  }).returning();

  res.json(conversation);
});

router.get("/voice-agent/conversations", async (req, res): Promise<void> => {
  const providerName = req.query.provider as string | undefined;
  let query = db.select().from(voiceConversationsTable).orderBy(desc(voiceConversationsTable.createdAt)).limit(50);
  const rows = await query;
  const filtered = providerName ? rows.filter(r => r.providerName === providerName) : rows;
  res.json(filtered);
});

router.post("/voice-agent/benchmark", requireAuth, async (req, res): Promise<void> => {
  const { name, testPrompts } = req.body;
  if (!name || !testPrompts?.length) { res.status(400).json({ error: "name and testPrompts required" }); return; }

  const [benchmark] = await db.insert(voiceBenchmarksTable).values({
    name, testPrompts: JSON.stringify(testPrompts), status: "running",
  }).returning();

  const providers = await db.select().from(voiceAgentProvidersTable);
  const results: Record<string, any[]> = {};
  const providerScores: Record<string, { totalTime: number; count: number }> = {};

  for (const prompt of testPrompts) {
    for (const prov of providers) {
      const startTime = Date.now();
      let response = "";
      try {
        if (prov.provider === "ollama_local") {
          const serverUrl = await getServerUrl();
          if (serverUrl) {
            const ollamaPrompt = "You are a helpful voice assistant. Respond concisely.\n\nUser: " + prompt + "\n\nAssistant:";
            response = await queryOllama(serverUrl, prov.model || "qwen2.5:7b", ollamaPrompt);
          }
        } else {
          response = `[Simulated ${prov.name}] Response to: "${prompt}"`;
        }
      } catch (e: any) {
        response = `Error: ${e.message}`;
      }
      const elapsed = Date.now() - startTime;
      if (!results[prov.name]) results[prov.name] = [];
      results[prov.name].push({ prompt, response, timeMs: elapsed });
      if (!providerScores[prov.name]) providerScores[prov.name] = { totalTime: 0, count: 0 };
      providerScores[prov.name].totalTime += elapsed;
      providerScores[prov.name].count += 1;
    }
  }

  const rankings = Object.entries(providerScores)
    .map(([name, s]) => ({ name, avgTime: Math.round(s.totalTime / s.count) }))
    .sort((a, b) => a.avgTime - b.avgTime);

  const [updated] = await db.update(voiceBenchmarksTable).set({
    results: JSON.stringify(results),
    winners: JSON.stringify(rankings),
    status: "completed",
  }).where(eq(voiceBenchmarksTable.id, benchmark.id)).returning();

  res.json(updated);
});

router.get("/voice-agent/benchmarks", async (_req, res): Promise<void> => {
  const rows = await db.select().from(voiceBenchmarksTable).orderBy(desc(voiceBenchmarksTable.createdAt));
  res.json(rows);
});

router.get("/voice-agent/flows", async (_req, res): Promise<void> => {
  const rows = await db.select().from(voiceFlowsTable).orderBy(desc(voiceFlowsTable.createdAt));
  res.json(rows);
});

router.post("/voice-agent/flows", requireAuth, async (req, res): Promise<void> => {
  const { name, description, providerId, flowType, nodes, edges } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(voiceFlowsTable).values({
    name, description, providerId,
    flowType: flowType || "linear",
    nodes: nodes ? JSON.stringify(nodes) : "[]",
    edges: edges ? JSON.stringify(edges) : "[]",
  }).returning();
  res.json(row);
});

router.post("/voice-agent/flows/:id/generate", requireAuth, async (req, res): Promise<void> => {
  const flow = await db.select().from(voiceFlowsTable).where(eq(voiceFlowsTable.id, parseInt(req.params.id)));
  if (!flow.length) { res.status(404).json({ error: "Flow not found" }); return; }

  const serverUrl = await getServerUrl();
  if (!serverUrl) { res.status(503).json({ error: "Ollama not configured" }); return; }

  const prompt = `Design a conversational voice agent flow for: "${flow[0].name}"
${flow[0].description ? "Description: " + flow[0].description : ""}

Create a dialog flow with nodes and edges. Each node should have:
- id, type (start/prompt/response/condition/end), content, and optional intents

Return JSON: { "nodes": [...], "edges": [{ "from": "id1", "to": "id2", "condition": "..." }] }`;

  const response = await queryOllama(serverUrl, "qwen2.5:7b", prompt);
  let parsed: any = { nodes: [], edges: [] };
  try { const m = response.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch { parsed = { raw: response }; }

  const [updated] = await db.update(voiceFlowsTable).set({
    nodes: JSON.stringify(parsed.nodes || []),
    edges: JSON.stringify(parsed.edges || []),
    status: "generated",
  }).where(eq(voiceFlowsTable.id, flow[0].id)).returning();

  res.json({ ...updated, parsed });
});

router.delete("/voice-agent/flows/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(voiceFlowsTable).where(eq(voiceFlowsTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

router.get("/voice-agent/dashboard", async (_req, res): Promise<void> => {
  const [providers, conversations, benchmarks, flows] = await Promise.all([
    db.select().from(voiceAgentProvidersTable),
    db.select().from(voiceConversationsTable).orderBy(desc(voiceConversationsTable.createdAt)).limit(20),
    db.select().from(voiceBenchmarksTable).orderBy(desc(voiceBenchmarksTable.createdAt)).limit(5),
    db.select().from(voiceFlowsTable),
  ]);

  const cloudProviders = providers.filter(p => p.category === "cloud");
  const localProviders = providers.filter(p => p.category === "local");
  const avgResponseTime = conversations.length > 0
    ? Math.round(conversations.reduce((s, c) => s + (c.responseTimeMs || 0), 0) / conversations.length)
    : 0;

  res.json({
    totalProviders: providers.length,
    cloudProviders: cloudProviders.length,
    localProviders: localProviders.length,
    totalConversations: conversations.length,
    avgResponseTime,
    totalBenchmarks: benchmarks.length,
    totalFlows: flows.length,
    recentConversations: conversations.slice(0, 5),
    providers: providers.map(sanitizeProvider),
  });
});

export default router;
