import { Router, type IRouter } from "express";
import { getUncachableGmailClient, driveProxyJson, driveProxyText } from "./google-clients";

const router: IRouter = Router();

router.post("/scan/gmail", async (req, res): Promise<void> => {
  const { query, maxResults } = req.body as { query?: string; maxResults?: number };
  const searchQuery = query || "database OR dataset OR API OR data source";
  const limit = Math.min(maxResults || 20, 50);

  try {
    const gmail = await getUncachableGmailClient();

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: searchQuery,
      maxResults: limit,
    });

    const messages = listRes.data.messages || [];
    const results: Array<{
      id: string;
      subject: string;
      from: string;
      date: string;
      snippet: string;
      labels: string[];
    }> = [];

    for (const msg of messages.slice(0, limit)) {
      try {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find(h => h.name === "Subject")?.value || "(No Subject)";
        const from = headers.find(h => h.name === "From")?.value || "";
        const date = headers.find(h => h.name === "Date")?.value || "";
        const snippet = detail.data.snippet || "";
        const labels = detail.data.labelIds || [];

        results.push({
          id: msg.id!,
          subject,
          from,
          date,
          snippet,
          labels,
        });
      } catch {
        continue;
      }
    }

    res.json({
      source: "gmail",
      query: searchQuery,
      total: results.length,
      results,
    });
  } catch (err: any) {
    res.status(502).json({ error: `Gmail scan failed: ${err?.message ?? "Unknown error"}` });
  }
});

router.post("/scan/gmail/message", async (req, res): Promise<void> => {
  const { messageId } = req.body as { messageId?: string };
  if (!messageId) {
    res.status(400).json({ error: "messageId is required" });
    return;
  }

  try {
    const gmail = await getUncachableGmailClient();

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = detail.data.payload?.headers || [];
    const subject = headers.find(h => h.name === "Subject")?.value || "(No Subject)";
    const from = headers.find(h => h.name === "From")?.value || "";
    const date = headers.find(h => h.name === "Date")?.value || "";

    let body = "";
    const payload = detail.data.payload;

    function extractText(part: any): string {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      if (part.parts) {
        return part.parts.map(extractText).join("\n");
      }
      return "";
    }

    if (payload) {
      body = extractText(payload);
    }

    if (!body && detail.data.snippet) {
      body = detail.data.snippet;
    }

    res.json({
      id: messageId,
      subject,
      from,
      date,
      body: body.slice(0, 50000),
      bodyLength: body.length,
    });
  } catch (err: any) {
    res.status(502).json({ error: `Failed to read message: ${err?.message ?? "Unknown error"}` });
  }
});

router.post("/scan/drive", async (req, res): Promise<void> => {
  const { query, maxResults } = req.body as { query?: string; maxResults?: number };
  const limit = Math.min(maxResults || 20, 50);

  let driveQuery = "trashed=false";
  if (query) {
    driveQuery = `fullText contains '${query.replace(/'/g, "\\'")}' and trashed=false`;
  }

  try {
    const data = await driveProxyJson(
      `/drive/v3/files?q=${encodeURIComponent(driveQuery)}&pageSize=${limit}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,owners)&orderBy=modifiedTime desc`
    );

    const files = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      size: f.size ? parseInt(f.size) : null,
      webViewLink: f.webViewLink,
      owner: f.owners?.[0]?.displayName || "",
    }));

    res.json({
      source: "drive",
      query: query || "(recent files)",
      total: files.length,
      results: files,
    });
  } catch (err: any) {
    res.status(502).json({ error: `Drive scan failed: ${err?.message ?? "Unknown error"}` });
  }
});

router.post("/scan/drive/content", async (req, res): Promise<void> => {
  const { fileId } = req.body as { fileId?: string };
  if (!fileId) {
    res.status(400).json({ error: "fileId is required" });
    return;
  }

  try {
    const metadata = await driveProxyJson(`/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime`);

    let content = "";

    if (metadata.mimeType === "application/vnd.google-apps.document") {
      content = await driveProxyText(`/drive/v3/files/${fileId}/export?mimeType=text/plain`);
    } else if (metadata.mimeType === "application/vnd.google-apps.spreadsheet") {
      content = await driveProxyText(`/drive/v3/files/${fileId}/export?mimeType=text/csv`);
    } else if (metadata.mimeType?.startsWith("text/") || metadata.mimeType === "application/json") {
      content = await driveProxyText(`/drive/v3/files/${fileId}?alt=media`);
    } else {
      res.json({
        id: fileId,
        name: metadata.name,
        mimeType: metadata.mimeType,
        content: null,
        message: "File type not supported for text extraction. Supported: Google Docs, Sheets, text files, JSON.",
      });
      return;
    }

    res.json({
      id: fileId,
      name: metadata.name,
      mimeType: metadata.mimeType,
      content: content.slice(0, 100000),
      contentLength: content.length,
    });
  } catch (err: any) {
    res.status(502).json({ error: `Failed to read file: ${err?.message ?? "Unknown error"}` });
  }
});

export default router;
