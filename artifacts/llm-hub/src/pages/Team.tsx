import { useState, useEffect, useCallback } from "react";
import { Users, Plus, MessageSquare, CheckCircle, Clock, AlertCircle, Loader2, Send, Trash2, ChevronDown, ChevronRight, Share2 } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface TeamTask {
  id: string;
  title: string;
  description: string;
  assignee: string;
  assignedBy: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in-progress" | "review" | "completed";
  dueDate: number | null;
  comments: { id: string; author: string; content: string; createdAt: number }[];
  createdAt: number;
  updatedAt: number;
}

interface TeamMember { id: string; username: string; role: string; status: string; lastSeen: number; }
interface SharedConv { id: string; conversationId: string; title: string; sharedBy: string; sharedWith: string[]; permissions: string; createdAt: number; }
interface Activity { type: string; action: string; subject: string; actor: string; timestamp: number; }

type Tab = "tasks" | "shared" | "activity";

export default function Team() {
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [shared, setShared] = useState<SharedConv[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("tasks");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [form, setForm] = useState({ title: "", description: "", assignee: "admin", priority: "medium" as string, dueDate: "" });

  const fetchAll = useCallback(async () => {
    try {
      const [t, m, s, a] = await Promise.all([
        fetch(`${API}/team/tasks`).then(r => r.json()),
        fetch(`${API}/team/members`).then(r => r.json()),
        fetch(`${API}/team/shared`).then(r => r.json()),
        fetch(`${API}/team/activity`).then(r => r.json()),
      ]);
      setTasks(t);
      setMembers(m);
      setShared(s);
      setActivity(a);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createTask = async () => {
    if (!form.title.trim()) return;
    await fetch(`${API}/team/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, dueDate: form.dueDate ? new Date(form.dueDate).getTime() : null }),
    });
    setShowCreate(false);
    setForm({ title: "", description: "", assignee: "admin", priority: "medium", dueDate: "" });
    fetchAll();
  };

  const updateTaskStatus = async (id: string, status: string) => {
    await fetch(`${API}/team/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    fetchAll();
  };

  const deleteTask = async (id: string) => {
    await fetch(`${API}/team/tasks/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const addComment = async (taskId: string) => {
    if (!commentText.trim()) return;
    await fetch(`${API}/team/tasks/${taskId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: commentText }) });
    setCommentText("");
    fetchAll();
  };

  const unshare = async (id: string) => {
    await fetch(`${API}/team/shared/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const priorityColor = (p: string) => {
    const m: Record<string, string> = { low: "bg-gray-500/10 text-gray-400", medium: "bg-blue-500/10 text-blue-400", high: "bg-amber-500/10 text-amber-400", urgent: "bg-red-500/10 text-red-400" };
    return m[p] || m.medium;
  };

  const statusIcon = (s: string) => {
    if (s === "completed") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (s === "in-progress") return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    if (s === "review") return <AlertCircle className="w-4 h-4 text-amber-400" />;
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const statusCounts = { pending: tasks.filter(t => t.status === "pending").length, inProgress: tasks.filter(t => t.status === "in-progress").length, review: tasks.filter(t => t.status === "review").length, completed: tasks.filter(t => t.status === "completed").length };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Team</h1>
            <p className="text-xs text-muted-foreground">{members.length} members, {tasks.length} tasks</p>
          </div>
          <div className="flex gap-1 ml-3">
            {members.map(m => (
              <div key={m.id} className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center" title={`${m.username} (${m.status})`}>
                <span className="text-[10px] font-bold text-primary">{m.username[0].toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {(["tasks", "shared", "activity"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${tab === t ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "text-muted-foreground hover:text-white bg-white/5"}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {tab === "tasks" && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="glass-panel rounded-xl p-3 border border-white/5 text-center">
                <div className="text-lg font-bold text-white">{statusCounts.pending}</div>
                <div className="text-[10px] text-muted-foreground">Pending</div>
              </div>
              <div className="glass-panel rounded-xl p-3 border border-blue-500/20 text-center">
                <div className="text-lg font-bold text-blue-400">{statusCounts.inProgress}</div>
                <div className="text-[10px] text-muted-foreground">In Progress</div>
              </div>
              <div className="glass-panel rounded-xl p-3 border border-amber-500/20 text-center">
                <div className="text-lg font-bold text-amber-400">{statusCounts.review}</div>
                <div className="text-[10px] text-muted-foreground">In Review</div>
              </div>
              <div className="glass-panel rounded-xl p-3 border border-green-500/20 text-center">
                <div className="text-lg font-bold text-green-400">{statusCounts.completed}</div>
                <div className="text-[10px] text-muted-foreground">Completed</div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Tasks</h2>
              <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 text-xs text-sky-300 hover:bg-sky-500/30">
                <Plus className="w-3.5 h-3.5" />New Task
              </button>
            </div>

            {showCreate && (
              <div className="glass-panel rounded-xl p-4 border border-sky-500/20 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Task title" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-sky-500/50" />
                  <div className="grid grid-cols-3 gap-2">
                    <input value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} placeholder="Assignee" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none" />
                    <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    <input value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} type="date" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none" />
                  </div>
                </div>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description..." rows={2} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none resize-none" />
                <button onClick={createTask} disabled={!form.title.trim()} className="px-4 py-2 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600 disabled:opacity-50">Create Task</button>
              </div>
            )}

            <div className="space-y-3">
              {tasks.map(t => (
                <div key={t.id} className="glass-panel rounded-xl border border-white/5 overflow-hidden">
                  <div className="p-4 flex items-start gap-3 cursor-pointer" onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}>
                    {statusIcon(t.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white">{t.title}</h4>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityColor(t.priority)}`}>{t.priority}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span>@{t.assignee}</span>
                        {t.dueDate && <span>Due: {new Date(t.dueDate).toLocaleDateString()}</span>}
                        {t.comments.length > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{t.comments.length}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {expandedTask === t.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {expandedTask === t.id && (
                    <div className="border-t border-white/5 p-4 space-y-3">
                      <div className="flex gap-2 flex-wrap">
                        {["pending", "in-progress", "review", "completed"].map(s => (
                          <button key={s} onClick={() => updateTaskStatus(t.id, s)} className={`px-2 py-1 rounded text-[10px] capitalize ${t.status === s ? "bg-sky-500/20 text-sky-300" : "bg-white/5 text-muted-foreground hover:text-white"}`}>{s}</button>
                        ))}
                        <button onClick={() => deleteTask(t.id)} className="px-2 py-1 rounded text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20 ml-auto"><Trash2 className="w-3 h-3 inline mr-0.5" />Delete</button>
                      </div>

                      {t.comments.length > 0 && (
                        <div className="space-y-2">
                          {t.comments.map(c => (
                            <div key={c.id} className="flex gap-2 p-2 rounded-lg bg-white/5">
                              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0"><span className="text-[8px] font-bold text-primary">{c.author[0].toUpperCase()}</span></div>
                              <div>
                                <div className="text-[10px] text-muted-foreground"><span className="text-white font-medium">{c.author}</span> · {new Date(c.createdAt).toLocaleString()}</div>
                                <p className="text-xs text-white/80 mt-0.5">{c.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === "Enter" && addComment(t.id)} placeholder="Add a comment..." className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:outline-none" />
                        <button onClick={() => addComment(t.id)} disabled={!commentText.trim()} className="px-3 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 text-xs hover:bg-sky-500/30 disabled:opacity-50"><Send className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "shared" && (
          <>
            <h2 className="text-lg font-bold text-white">Shared Conversations</h2>
            {shared.length === 0 ? (
              <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
                <Share2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No Shared Conversations</h3>
                <p className="text-xs text-muted-foreground">Share a conversation from the Chat page to collaborate with team members.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {shared.map(s => (
                  <div key={s.id} className="glass-panel rounded-xl p-4 border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{s.title}</div>
                      <div className="text-[10px] text-muted-foreground">Shared by {s.sharedBy} · {s.permissions} access · {new Date(s.createdAt).toLocaleDateString()}</div>
                    </div>
                    <button onClick={() => unshare(s.id)} className="p-1.5 rounded hover:bg-white/10"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "activity" && (
          <>
            <h2 className="text-lg font-bold text-white">Activity Feed</h2>
            {activity.length === 0 ? (
              <div className="glass-panel rounded-xl p-8 border border-white/5 text-center">
                <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No Activity</h3>
                <p className="text-xs text-muted-foreground">Team activity will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-bold text-sky-400">{a.actor[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1">
                      <span className="text-xs"><span className="text-white font-medium">{a.actor}</span> <span className="text-muted-foreground">{a.action}</span> <span className="text-white">{a.subject}</span></span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{new Date(a.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
