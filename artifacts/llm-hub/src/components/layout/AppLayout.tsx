import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Server, MessageSquare, Brain, Terminal, Bot, Search, Eye, BarChart3, LineChart, Zap, Menu, X, Shield, LogIn, LogOut, User, Stethoscope, Share2, TrendingUp, Database, Mic, HardDrive, BookOpen, Beaker, FlaskConical, Key, Library, Sun, Moon, Trophy, Workflow, GitCompareArrows, FileText, BrainCircuit, DollarSign, Users, Puzzle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetLlmStatus } from "@workspace/api-client-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@workspace/replit-auth-web";

function useThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("llm-hub-theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem("llm-hub-theme", theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");
  return { theme, toggle };
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: status } = useGetLlmStatus({ query: { refetchInterval: 15000 } as any });
  const { user, isLoading: authLoading, isAuthenticated, isAdmin, login, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useThemeToggle();

  const navItems = [
    { href: "/", label: "Local LLM", icon: Server, adminOnly: false },
    { href: "/chat", label: "Chat", icon: MessageSquare, adminOnly: false },
    { href: "/training", label: "Training", icon: Brain, adminOnly: false },
    { href: "/research", label: "Research", icon: Search, adminOnly: false },
    { href: "/vision", label: "Vision", icon: Eye, adminOnly: false },
    { href: "/agents", label: "Agents", icon: Bot, adminOnly: false },
    { href: "/analytics", label: "Analytics", icon: LineChart, adminOnly: false },
    { href: "/automations", label: "Automations", icon: Zap, adminOnly: false },
    { href: "/agentflow", label: "AgentFlow", icon: Workflow, adminOnly: false },
    { href: "/prompts", label: "Prompts", icon: BookOpen, adminOnly: false },
    { href: "/compare", label: "Compare", icon: GitCompareArrows, adminOnly: false },
    { href: "/memory", label: "Memory", icon: BrainCircuit, adminOnly: false },
    { href: "/costs", label: "Costs", icon: DollarSign, adminOnly: false },
    { href: "/team", label: "Team", icon: Users, adminOnly: false },
    { href: "/reports", label: "Reports", icon: FileText, adminOnly: false },
    { href: "/playground", label: "Playground", icon: Terminal, adminOnly: false },
    { href: "/clinical", label: "Clinical", icon: Stethoscope, adminOnly: false },
    { href: "/social", label: "Social", icon: Share2, adminOnly: false },
    { href: "/finance", label: "Finance", icon: TrendingUp, adminOnly: false },
    { href: "/data-agent", label: "Data Agent", icon: Database, adminOnly: false },
    { href: "/voice-agent", label: "Voice Agent", icon: Mic, adminOnly: false },
    { href: "/databases", label: "Databases", icon: HardDrive, adminOnly: false },
    { href: "/pubmed", label: "PubMed", icon: BookOpen, adminOnly: false },
    { href: "/pipeline", label: "Pipeline", icon: Beaker, adminOnly: false },
    { href: "/platform-api", label: "Platform API", icon: Key, adminOnly: false },
    { href: "/extension", label: "Extension", icon: Puzzle, adminOnly: false },
    { href: "/rag", label: "RAG", icon: Library, adminOnly: false },
    { href: "/evaluation", label: "Benchmarks", icon: Trophy, adminOnly: false },
    { href: "/research-pipeline", label: "Research", icon: FlaskConical, adminOnly: false },
    { href: "/compliance", label: "HIPAA", icon: Shield, adminOnly: false },
    { href: "/monitor", label: "Monitor", icon: BarChart3, adminOnly: false },
    { href: "/admin", label: "Admin", icon: Shield, adminOnly: false },
  ];

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1920&q=80')] opacity-[0.02] mix-blend-overlay object-cover" />
      </div>

      <header className="relative z-10 glass-panel border-b border-white/5">
        <div className="h-14 md:h-12 flex items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-white/5"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
            </button>
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <Terminal className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <h1 className="font-display font-bold text-lg md:text-xl tracking-tight text-white">
              LLM <span className="text-primary">Hub</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <NotificationBell />
            <div className="flex items-center gap-2 text-xs font-medium px-2 md:px-3 py-1.5 rounded-full bg-black/40 border border-white/5">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                status?.online ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
              )} />
              <span className={cn("hidden sm:inline", status?.online ? "text-green-400" : "text-red-400")}>
                {status?.online ? "Core Online" : "Core Offline"}
              </span>
            </div>
            {!authLoading && (
              isAuthenticated ? (
                <div className="flex items-center gap-2">
                  {user?.profileImageUrl ? (
                    <img src={user.profileImageUrl} alt="" className="w-6 h-6 rounded-full border border-white/20" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                      <User className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <span className="hidden lg:inline text-xs text-muted-foreground">
                    {user?.username}
                    {isAdmin && <span className="ml-1 text-[10px] text-amber-400 font-semibold">(Admin)</span>}
                  </span>
                  <button onClick={logout} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors" title="Log out">
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button onClick={login} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/30 transition-colors">
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </button>
              )
            )}
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-0.5 px-3 md:px-6 pb-2 overflow-x-auto scrollbar-hide flex-wrap">
          {visibleNavItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 whitespace-nowrap",
                  isActive
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className={cn("w-3 h-3", isActive ? "text-primary" : "")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-14 z-20 bg-black/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <nav className="bg-background border-r border-white/5 w-64 h-full p-4 space-y-1" onClick={(e) => e.stopPropagation()}>
            {visibleNavItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <main className="relative z-10 flex-1 flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-5.5rem)] overflow-hidden">
        {children}
      </main>
    </div>
  );
}
