import { useState, useEffect, useRef } from "react";
import { Bell, Check, X, Info, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

const BASE = import.meta.env.BASE_URL || "/";
const api = (path: string) => `${BASE}api${path}`;

const typeIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

const typeColors = {
  info: "text-blue-400",
  success: "text-green-400",
  warning: "text-yellow-400",
  error: "text-red-400",
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(api("/notifications"))
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});

    const evtSource = new EventSource(api("/notifications/stream"));
    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "connected") return;
        setNotifications((prev) => [data, ...prev].slice(0, 50));
      } catch {}
    };
    return () => evtSource.close();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    await fetch(api(`/notifications/${id}/read`), { method: "POST" });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    await fetch(api("/notifications/read-all"), { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const dismiss = async (id: string) => {
    await fetch(api(`/notifications/${id}`), { method: "DELETE" });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-white/5 transition-colors"
      >
        <Bell className="w-4 h-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 max-h-96 overflow-y-auto glass-panel rounded-xl border border-white/10 shadow-2xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            notifications.slice(0, 20).map((n) => {
              const Icon = typeIcons[n.type];
              return (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-white/5 flex gap-3 hover:bg-white/5 transition-colors ${!n.read ? "bg-white/[0.02]" : ""}`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${typeColors[n.type]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white">{n.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{formatTime(n.timestamp)}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); dismiss(n.id); }} className="p-1 hover:bg-white/10 rounded">
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
