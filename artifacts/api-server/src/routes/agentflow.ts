import { Router } from "express";
import { requireAuth, requireAdmin } from "../middlewares/rateLimiter";

const router = Router();

const AGENTFLOW_BASE = "https://omni-agent-core.replit.app";
const FETCH_TIMEOUT_MS = 15000;

async function agentflowFetch(path: string, options?: RequestInit) {
  const url = `${AGENTFLOW_BASE}/api${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
    if (!r.ok) {
      throw new Error(`Upstream returned ${r.status}`);
    }
    return r.json();
  } finally {
    clearTimeout(timeout);
  }
}

router.get("/agentflow/status", async (_req, res): Promise<void> => {
  try {
    const [agents, workflows, executions, templates] = await Promise.all([
      agentflowFetch("/agents"),
      agentflowFetch("/workflows"),
      agentflowFetch("/executions"),
      agentflowFetch("/templates"),
    ]);
    res.json({
      connected: true,
      url: AGENTFLOW_BASE,
      agents: Array.isArray(agents) ? agents.length : 0,
      workflows: Array.isArray(workflows) ? workflows.length : 0,
      executions: executions?.total ?? 0,
      templates: Array.isArray(templates) ? templates.length : 0,
    });
  } catch {
    res.json({ connected: false, url: AGENTFLOW_BASE, error: "Unable to connect to AgentFlow" });
  }
});

router.get("/agentflow/agents", async (_req, res): Promise<void> => {
  try {
    const agents = await agentflowFetch("/agents");
    res.json(agents);
  } catch {
    res.status(502).json({ error: "Failed to fetch agents from AgentFlow" });
  }
});

router.post("/agentflow/agents", requireAdmin, async (req, res): Promise<void> => {
  try {
    const agent = await agentflowFetch("/agents", {
      method: "POST",
      body: JSON.stringify(req.body),
    });
    res.json(agent);
  } catch {
    res.status(502).json({ error: "Failed to create agent on AgentFlow" });
  }
});

router.get("/agentflow/workflows", async (_req, res): Promise<void> => {
  try {
    const workflows = await agentflowFetch("/workflows");
    res.json(workflows);
  } catch {
    res.status(502).json({ error: "Failed to fetch workflows from AgentFlow" });
  }
});

router.post("/agentflow/workflows", requireAdmin, async (req, res): Promise<void> => {
  try {
    const workflow = await agentflowFetch("/workflows", {
      method: "POST",
      body: JSON.stringify(req.body),
    });
    res.json(workflow);
  } catch {
    res.status(502).json({ error: "Failed to create workflow on AgentFlow" });
  }
});

router.post("/agentflow/workflows/:id/execute", requireAdmin, async (req, res): Promise<void> => {
  try {
    const execution = await agentflowFetch(`/workflows/${req.params.id}/execute`, {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });
    res.json(execution);
  } catch {
    res.status(502).json({ error: "Failed to execute workflow on AgentFlow" });
  }
});

router.get("/agentflow/executions", async (req, res): Promise<void> => {
  try {
    const limit = req.query.limit || "50";
    const executions = await agentflowFetch(`/executions?limit=${limit}`);
    res.json(executions);
  } catch {
    res.status(502).json({ error: "Failed to fetch executions from AgentFlow" });
  }
});

router.get("/agentflow/executions/:id", async (req, res): Promise<void> => {
  try {
    const execution = await agentflowFetch(`/executions/${req.params.id}`);
    res.json(execution);
  } catch {
    res.status(502).json({ error: "Failed to fetch execution details" });
  }
});

router.get("/agentflow/templates", async (_req, res): Promise<void> => {
  try {
    const templates = await agentflowFetch("/templates");
    res.json(templates);
  } catch {
    res.status(502).json({ error: "Failed to fetch templates from AgentFlow" });
  }
});

router.post("/agentflow/templates/:id/apply", requireAdmin, async (req, res): Promise<void> => {
  try {
    const template = await agentflowFetch(`/templates/${req.params.id}/apply`, {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });
    res.json(template);
  } catch {
    res.status(502).json({ error: "Failed to apply template on AgentFlow" });
  }
});

router.get("/agentflow/knowledge-bases", async (_req, res): Promise<void> => {
  try {
    const kbs = await agentflowFetch("/knowledge-bases");
    res.json(kbs);
  } catch {
    res.status(502).json({ error: "Failed to fetch knowledge bases from AgentFlow" });
  }
});

router.get("/agentflow/settings", async (_req, res): Promise<void> => {
  try {
    const settings = await agentflowFetch("/settings");
    res.json(settings);
  } catch {
    res.status(502).json({ error: "Failed to fetch settings from AgentFlow" });
  }
});

export default router;
