import { Router } from "express";

const router = Router();

interface SharedConversation {
  id: string;
  conversationId: string;
  title: string;
  sharedBy: string;
  sharedWith: string[];
  permissions: "view" | "comment" | "edit";
  createdAt: number;
}

interface TeamTask {
  id: string;
  title: string;
  description: string;
  assignee: string;
  assignedBy: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in-progress" | "review" | "completed";
  dueDate: number | null;
  comments: Comment[];
  createdAt: number;
  updatedAt: number;
}

interface Comment {
  id: string;
  author: string;
  content: string;
  createdAt: number;
}

interface TeamMember {
  id: string;
  username: string;
  role: string;
  status: "online" | "away" | "offline";
  lastSeen: number;
}

const sharedConversations: SharedConversation[] = [];
const tasks: TeamTask[] = [
  {
    id: "tt-1",
    title: "Review RAG pipeline performance",
    description: "Analyze embedding quality and retrieval accuracy for the knowledge base. Check if nomic-embed-text is producing good results.",
    assignee: "admin",
    assignedBy: "system",
    priority: "high",
    status: "in-progress",
    dueDate: Date.now() + 86400000 * 3,
    comments: [
      { id: "c-1", author: "system", content: "Initial benchmark shows 78% retrieval accuracy. May need to re-embed with updated parameters.", createdAt: Date.now() - 86400000 },
    ],
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: "tt-2",
    title: "Set up production deployment",
    description: "Configure the production environment, set up SSL, and deploy the latest version of LLM Hub.",
    assignee: "admin",
    assignedBy: "system",
    priority: "medium",
    status: "pending",
    dueDate: Date.now() + 86400000 * 7,
    comments: [],
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: "tt-3",
    title: "Fine-tune clinical ENT model",
    description: "Prepare training data from PubMed collector and run fine-tuning on the ENT clinical dataset.",
    assignee: "admin",
    assignedBy: "system",
    priority: "low",
    status: "pending",
    dueDate: Date.now() + 86400000 * 14,
    comments: [],
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
  },
];

const teamMembers: TeamMember[] = [
  { id: "tm-1", username: "admin", role: "admin", status: "online", lastSeen: Date.now() },
];

let shareCounter = 0;
let taskCounter = tasks.length;
let commentCounter = 1;

router.get("/team/members", (_req, res): void => {
  res.json(teamMembers);
});

router.get("/team/shared", (_req, res): void => {
  res.json(sharedConversations);
});

router.post("/team/share", (req, res): void => {
  const { conversationId, title, sharedWith, permissions } = req.body;
  if (!conversationId || !title) { res.status(400).json({ error: "conversationId and title required" }); return; }
  shareCounter++;
  const shared: SharedConversation = {
    id: `sc-${shareCounter}`,
    conversationId,
    title,
    sharedBy: (req as any).user?.username || "admin",
    sharedWith: sharedWith || [],
    permissions: permissions || "view",
    createdAt: Date.now(),
  };
  sharedConversations.push(shared);
  res.json(shared);
});

router.delete("/team/shared/:id", (req, res): void => {
  const idx = sharedConversations.findIndex(s => s.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Share not found" }); return; }
  sharedConversations.splice(idx, 1);
  res.json({ success: true });
});

router.get("/team/tasks", (_req, res): void => {
  res.json(tasks);
});

router.post("/team/tasks", (req, res): void => {
  const { title, description, assignee, priority, dueDate } = req.body;
  if (!title) { res.status(400).json({ error: "Title required" }); return; }
  taskCounter++;
  const task: TeamTask = {
    id: `tt-${taskCounter}`,
    title,
    description: description || "",
    assignee: assignee || "unassigned",
    assignedBy: (req as any).user?.username || "admin",
    priority: priority || "medium",
    status: "pending",
    dueDate: dueDate || null,
    comments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.push(task);
  res.json(task);
});

router.patch("/team/tasks/:id", (req, res): void => {
  const t = tasks.find(t => t.id === req.params.id);
  if (!t) { res.status(404).json({ error: "Task not found" }); return; }
  if (req.body.title !== undefined) t.title = req.body.title;
  if (req.body.description !== undefined) t.description = req.body.description;
  if (req.body.assignee !== undefined) t.assignee = req.body.assignee;
  if (req.body.priority !== undefined) t.priority = req.body.priority;
  if (req.body.status !== undefined) t.status = req.body.status;
  if (req.body.dueDate !== undefined) t.dueDate = req.body.dueDate;
  t.updatedAt = Date.now();
  res.json(t);
});

router.delete("/team/tasks/:id", (req, res): void => {
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Task not found" }); return; }
  tasks.splice(idx, 1);
  res.json({ success: true });
});

router.post("/team/tasks/:id/comments", (req, res): void => {
  const t = tasks.find(t => t.id === req.params.id);
  if (!t) { res.status(404).json({ error: "Task not found" }); return; }
  const { content } = req.body;
  if (!content) { res.status(400).json({ error: "Content required" }); return; }
  commentCounter++;
  const comment: Comment = {
    id: `c-${commentCounter}`,
    author: (req as any).user?.username || "admin",
    content,
    createdAt: Date.now(),
  };
  t.comments.push(comment);
  t.updatedAt = Date.now();
  res.json(t);
});

router.get("/team/activity", (_req, res): void => {
  const activities = [
    ...tasks.map(t => ({ type: "task", action: t.status === "completed" ? "completed" : "updated", subject: t.title, actor: t.assignee, timestamp: t.updatedAt })),
    ...sharedConversations.map(s => ({ type: "share", action: "shared", subject: s.title, actor: s.sharedBy, timestamp: s.createdAt })),
  ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  res.json(activities);
});

export default router;
