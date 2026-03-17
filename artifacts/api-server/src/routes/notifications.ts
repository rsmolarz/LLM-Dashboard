import { Router, type IRouter, type Response } from "express";

const router: IRouter = Router();

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

const notifications: Notification[] = [];
const sseClients: Set<Response> = new Set();
let notifCounter = 0;

export function pushNotification(type: Notification["type"], title: string, message: string) {
  const notif: Notification = {
    id: `notif-${++notifCounter}`,
    type,
    title,
    message,
    timestamp: Date.now(),
    read: false,
  };
  notifications.unshift(notif);
  if (notifications.length > 100) notifications.pop();

  for (const client of sseClients) {
    try {
      client.write(`data: ${JSON.stringify(notif)}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
  return notif;
}

router.get("/notifications/stream", (req, res): void => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

router.get("/notifications", (_req, res): void => {
  res.json({ notifications: notifications.slice(0, 50) });
});

router.post("/notifications/:id/read", (req, res): void => {
  const notif = notifications.find((n) => n.id === req.params.id);
  if (notif) notif.read = true;
  res.json({ success: true });
});

router.post("/notifications/read-all", (_req, res): void => {
  for (const n of notifications) n.read = true;
  res.json({ success: true });
});

router.delete("/notifications/:id", (req, res): void => {
  const idx = notifications.findIndex((n) => n.id === req.params.id);
  if (idx >= 0) notifications.splice(idx, 1);
  res.json({ success: true });
});

export default router;
