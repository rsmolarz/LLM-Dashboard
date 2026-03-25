import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, conversationsTable, chatMessagesTable } from "@workspace/db";
import { researchSessionsTable, researchFollowUpsTable } from "@workspace/db/schema";

const router: IRouter = Router();

function escapeMarkdown(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

router.get("/export/conversation/:id/markdown", async (req, res): Promise<void> => {
  try {
    const [conversation] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, parseInt(req.params.id)));
    if (!conversation) { res.status(404).json({ error: "Conversation not found" }); return; }

    const messages = await db.select().from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, parseInt(req.params.id)))
      .orderBy(asc(chatMessagesTable.createdAt));

    let md = `# ${conversation.title || "Untitled Conversation"}\n\n`;
    md += `**Model:** ${conversation.model || "default"}\n`;
    md += `**Date:** ${new Date(conversation.createdAt).toLocaleDateString()}\n\n---\n\n`;

    for (const msg of messages) {
      const role = msg.role === "user" ? "**You**" : msg.role === "assistant" ? "**Assistant**" : `**${msg.role}**`;
      const time = new Date(msg.createdAt).toLocaleTimeString();
      md += `### ${role} — ${time}\n\n${msg.content}\n\n---\n\n`;
    }

    md += `\n*Exported from LLM Hub on ${new Date().toISOString()}*\n`;

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="conversation-${req.params.id}.md"`);
    res.send(md);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/export/conversation/:id/html", async (req, res): Promise<void> => {
  try {
    const [conversation] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, parseInt(req.params.id)));
    if (!conversation) { res.status(404).json({ error: "Conversation not found" }); return; }

    const messages = await db.select().from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, parseInt(req.params.id)))
      .orderBy(asc(chatMessagesTable.createdAt));

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeMarkdown(conversation.title || "Conversation")}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;background:#0a0a0f;color:#e0e0e0}
h1{color:#00e5ff;border-bottom:2px solid #1a1a2e;padding-bottom:16px}
.meta{color:#888;margin-bottom:24px;font-size:14px}
.message{margin:16px 0;padding:16px;border-radius:8px;border:1px solid #1a1a2e}
.user{background:#0d1b2a;border-left:4px solid #00e5ff}
.assistant{background:#1a1a2e;border-left:4px solid #7c4dff}
.role{font-weight:bold;color:#00e5ff;margin-bottom:8px;font-size:13px}
.assistant .role{color:#7c4dff}
.content{white-space:pre-wrap;line-height:1.6}
.time{color:#666;font-size:12px;margin-top:8px}
.footer{color:#555;font-size:12px;margin-top:40px;border-top:1px solid #1a1a2e;padding-top:16px}
</style></head><body>`;

    html += `<h1>${escapeMarkdown(conversation.title || "Untitled Conversation")}</h1>`;
    html += `<div class="meta">Model: ${conversation.model || "default"} | ${new Date(conversation.createdAt).toLocaleDateString()}</div>`;

    for (const msg of messages) {
      const cls = msg.role === "user" ? "user" : "assistant";
      const roleName = msg.role === "user" ? "You" : msg.role === "assistant" ? "Assistant" : msg.role;
      html += `<div class="message ${cls}"><div class="role">${roleName}</div><div class="content">${escapeMarkdown(msg.content)}</div><div class="time">${new Date(msg.createdAt).toLocaleTimeString()}</div></div>`;
    }

    html += `<div class="footer">Exported from LLM Hub on ${new Date().toISOString()}</div></body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="conversation-${req.params.id}.html"`);
    res.send(html);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/export/research/:id/markdown", async (req, res): Promise<void> => {
  try {
    const [session] = await db.select().from(researchSessionsTable).where(eq(researchSessionsTable.id, parseInt(req.params.id)));
    if (!session) { res.status(404).json({ error: "Research session not found" }); return; }

    const followUps = await db.select().from(researchFollowUpsTable)
      .where(eq(researchFollowUpsTable.sessionId, parseInt(req.params.id)))
      .orderBy(asc(researchFollowUpsTable.createdAt));

    let md = `# Research Report\n\n`;
    md += `**Query:** ${session.prompt}\n`;
    md += `**Mode:** ${session.mode || "standard"}\n`;
    md += `**Date:** ${new Date(session.createdAt).toLocaleDateString()}\n\n---\n\n`;
    md += `## Synthesis\n\n${session.synthesis || "No synthesis generated."}\n\n`;

    const responses = typeof session.responses === "string" ? JSON.parse(session.responses || "[]") : (session.responses || []);
    if (Array.isArray(responses) && responses.length > 0) {
      md += `## Model Responses\n\n`;
      for (const resp of responses) {
        md += `### ${resp.model || "Unknown Model"}\n\n${resp.response || resp.content || ""}\n\n---\n\n`;
      }
    }

    if (followUps.length > 0) {
      md += `## Follow-up Questions\n\n`;
      for (const fu of followUps) {
        md += `### Q: ${fu.question}\n\n${fu.answer || "No answer."}\n\n---\n\n`;
      }
    }

    md += `\n*Research report exported from LLM Hub on ${new Date().toISOString()}*\n`;

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="research-${req.params.id}.md"`);
    res.send(md);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/export/research/:id/html", async (req, res): Promise<void> => {
  try {
    const [session] = await db.select().from(researchSessionsTable).where(eq(researchSessionsTable.id, parseInt(req.params.id)));
    if (!session) { res.status(404).json({ error: "Research session not found" }); return; }

    const followUps = await db.select().from(researchFollowUpsTable)
      .where(eq(researchFollowUpsTable.sessionId, parseInt(req.params.id)))
      .orderBy(asc(researchFollowUpsTable.createdAt));

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Research Report</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;background:#0a0a0f;color:#e0e0e0}
h1{color:#00e5ff;border-bottom:2px solid #1a1a2e;padding-bottom:16px}
h2{color:#7c4dff;margin-top:32px}
h3{color:#00bcd4}
.meta{color:#888;margin-bottom:24px;font-size:14px}
.synthesis{background:#0d1b2a;padding:20px;border-radius:8px;border-left:4px solid #00e5ff;margin:16px 0;white-space:pre-wrap;line-height:1.6}
.model-response{background:#1a1a2e;padding:16px;border-radius:8px;margin:12px 0;border-left:4px solid #7c4dff;white-space:pre-wrap;line-height:1.6}
.followup{background:#1a1a2e;padding:16px;border-radius:8px;margin:12px 0;border-left:4px solid #ff9800}
.footer{color:#555;font-size:12px;margin-top:40px;border-top:1px solid #1a1a2e;padding-top:16px}
</style></head><body>`;

    html += `<h1>Research Report</h1>`;
    html += `<div class="meta"><strong>Query:</strong> ${escapeMarkdown(session.prompt)}<br>`;
    html += `<strong>Mode:</strong> ${session.mode || "standard"} | ${new Date(session.createdAt).toLocaleDateString()}</div>`;
    html += `<h2>Synthesis</h2><div class="synthesis">${escapeMarkdown(session.synthesis || "No synthesis generated.")}</div>`;

    const responses = typeof session.responses === "string" ? JSON.parse(session.responses || "[]") : (session.responses || []);
    if (Array.isArray(responses) && responses.length > 0) {
      html += `<h2>Model Responses</h2>`;
      for (const resp of responses) {
        html += `<h3>${escapeMarkdown(resp.model || "Unknown")}</h3><div class="model-response">${escapeMarkdown(resp.response || resp.content || "")}</div>`;
      }
    }

    if (followUps.length > 0) {
      html += `<h2>Follow-up Questions</h2>`;
      for (const fu of followUps) {
        html += `<div class="followup"><strong>Q: ${escapeMarkdown(fu.question)}</strong><br><br>${escapeMarkdown(fu.answer || "No answer.")}</div>`;
      }
    }

    html += `<div class="footer">Research report exported from LLM Hub on ${new Date().toISOString()}</div></body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="research-${req.params.id}.html"`);
    res.send(html);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
