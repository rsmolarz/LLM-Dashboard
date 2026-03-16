import { Link, useLocation } from "wouter";
import { Server, MessageSquare, Brain, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetLlmStatus } from "@workspace/api-client-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: status } = useGetLlmStatus({ query: { refetchInterval: 15000 } });

  const navItems = [
    { href: "/", label: "Local LLM", icon: Server },
    { href: "/chat", label: "Chat", icon: MessageSquare },
    { href: "/training", label: "Training", icon: Brain },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1920&q=80')] opacity-[0.02] mix-blend-overlay object-cover" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 h-16 glass-panel border-b border-white/5 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-display font-bold text-xl tracking-tight text-white">
            LLM <span className="text-primary">Hub</span>
          </h1>
        </div>

        <nav className="flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-black/40 border border-white/5">
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              status?.online ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
            )} />
            <span className={status?.online ? "text-green-400" : "text-red-400"}>
              {status?.online ? "Core Online" : "Core Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        {children}
      </main>
    </div>
  );
}
