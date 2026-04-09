import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  Server,
  MessageSquare,
  Brain,
  Terminal,
  Bot,
  Search,
  Eye,
  BarChart3,
  LineChart,
  Zap,
  Menu,
  X,
  Shield,
  LogIn,
  LogOut,
  User,
  Stethoscope,
  Share2,
  TrendingUp,
  Database,
  Mic,
  HardDrive,
  BookOpen,
  Beaker,
  FlaskConical,
  Key,
  Library,
  Sun,
  Moon,
  Trophy,
  Workflow,
  GitCompareArrows,
  FileText,
  BrainCircuit,
  DollarSign,
  Users,
  Puzzle,
  Code2,
  Download,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Settings2,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetLlmStatus } from "@workspace/api-client-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@workspace/replit-auth-web";

function useThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("llm-hub-theme") as "dark" | "light") || "dark"
      );
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

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}

interface NavItem {
  href: string;
  label: string;
  icon: any;
  adminOnly: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Core",
    items: [
      { href: "/", label: "Dashboard", icon: Server, adminOnly: false },
      { href: "/chat", label: "Chat", icon: MessageSquare, adminOnly: false },
      {
        href: "/chat-import",
        label: "Chat Import",
        icon: Download,
        adminOnly: false,
      },
      { href: "/code", label: "Code Agent", icon: Code2, adminOnly: false },
      { href: "/claw-agent", label: "Claw Agent", icon: Bot, adminOnly: false },
      {
        href: "/playground",
        label: "Playground",
        icon: Terminal,
        adminOnly: false,
      },
    ],
  },
  {
    title: "AI Tools",
    items: [
      { href: "/agents", label: "Agents", icon: Bot, adminOnly: false },
      {
        href: "/agentflow",
        label: "AgentFlow",
        icon: Workflow,
        adminOnly: false,
      },
      {
        href: "/automations",
        label: "Automations",
        icon: Zap,
        adminOnly: false,
      },
      { href: "/prompts", label: "Prompts", icon: BookOpen, adminOnly: false },
      {
        href: "/compare",
        label: "Compare",
        icon: GitCompareArrows,
        adminOnly: false,
      },
      { href: "/vision", label: "Vision", icon: Eye, adminOnly: false },
      { href: "/research", label: "Research", icon: Search, adminOnly: false },
      {
        href: "/research-pipeline",
        label: "Pipeline",
        icon: FlaskConical,
        adminOnly: false,
      },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { href: "/rag", label: "RAG", icon: Library, adminOnly: false },
      {
        href: "/memory",
        label: "Memory",
        icon: BrainCircuit,
        adminOnly: false,
      },
      { href: "/training", label: "Training", icon: Brain, adminOnly: false },
      {
        href: "/pipeline",
        label: "Data Pipeline",
        icon: Beaker,
        adminOnly: false,
      },
      { href: "/pubmed", label: "PubMed", icon: BookOpen, adminOnly: false },
    ],
  },
  {
    title: "Domains",
    items: [
      {
        href: "/clinical",
        label: "Clinical",
        icon: Stethoscope,
        adminOnly: false,
      },
      { href: "/social", label: "Social", icon: Share2, adminOnly: false },
      {
        href: "/finance",
        label: "Finance",
        icon: TrendingUp,
        adminOnly: false,
      },
      {
        href: "/data-agent",
        label: "Data Agent",
        icon: Database,
        adminOnly: false,
      },
      {
        href: "/voice-agent",
        label: "Voice Agent",
        icon: Mic,
        adminOnly: false,
      },
    ],
  },
  {
    title: "Analytics",
    items: [
      {
        href: "/analytics",
        label: "Analytics",
        icon: LineChart,
        adminOnly: false,
      },
      { href: "/monitor", label: "Monitor", icon: BarChart3, adminOnly: false },
      { href: "/costs", label: "Costs", icon: DollarSign, adminOnly: false },
      {
        href: "/evaluation",
        label: "Benchmarks",
        icon: Trophy,
        adminOnly: false,
      },
      { href: "/reports", label: "Reports", icon: FileText, adminOnly: false },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/team", label: "Team", icon: Users, adminOnly: false },
      {
        href: "/llm-manager",
        label: "LLM Manager",
        icon: Settings2,
        adminOnly: false,
      },
      {
        href: "/create-llm",
        label: "Create LLM",
        icon: Brain,
        adminOnly: false,
      },
      {
        href: "/databases",
        label: "Databases",
        icon: HardDrive,
        adminOnly: false,
      },
      {
        href: "/platform-api",
        label: "Platform API",
        icon: Key,
        adminOnly: false,
      },
      {
        href: "/extension",
        label: "Extension",
        icon: Puzzle,
        adminOnly: false,
      },
      { href: "/compliance", label: "HIPAA", icon: Shield, adminOnly: false },
      { href: "/admin", label: "Admin", icon: Shield, adminOnly: false },
    ],
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: status } = useGetLlmStatus({
    query: { refetchInterval: 15000 } as any,
  });
  const {
    user,
    isLoading: authLoading,
    isAuthenticated,
    isAdmin,
    login,
    logout,
  } = useAuth();
  const { theme, toggle: toggleTheme } = useThemeToggle();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("llm-hub-sidebar-collapsed") === "true";
    }
    return false;
  });

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => {
      const defaults: Record<string, boolean> = {};
      navSections.forEach((s) => {
        defaults[s.title] = true;
      });
      return defaults;
    },
  );

  useEffect(() => {
    localStorage.setItem("llm-hub-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const filteredSections = useMemo(() => {
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.adminOnly || isAdmin),
      }))
      .filter((section) => section.items.length > 0);
  }, [isAdmin]);

  return (
    <div className="min-h-screen h-screen bg-background text-foreground flex font-sans overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[120px]" />
      </div>

      <aside
        className={cn(
          "hidden md:flex flex-col relative z-20 border-r border-white/5 bg-background/80 backdrop-blur-xl transition-all duration-300 ease-in-out shrink-0",
          collapsed ? "w-[52px]" : "w-[220px]",
        )}
      >
        <div
          className={cn(
            "h-14 flex items-center border-b border-white/5 shrink-0",
            collapsed ? "justify-center px-0" : "px-4 gap-3",
          )}
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
            <Terminal className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <h1 className="font-display font-bold text-base tracking-tight text-white whitespace-nowrap">
              LLM <span className="text-primary">Hub</span>
            </h1>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 scrollbar-hide">
          {filteredSections.map((section) => (
            <div key={section.title} className="mb-1">
              {!collapsed && (
                <button
                  onClick={() => toggleSection(section.title)}
                  className="flex items-center justify-between w-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  {section.title}
                  {openSections[section.title] ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>
              )}
              {(collapsed || openSections[section.title]) && (
                <div className={cn("space-y-0.5", collapsed ? "px-1" : "px-2")}>
                  {section.items.map((item) => {
                    const isActive = location === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                          collapsed ? "justify-center p-2" : "px-3 py-1.5",
                          isActive
                            ? "bg-primary/15 text-white"
                            : "text-muted-foreground hover:text-white hover:bg-white/5",
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon
                          className={cn(
                            "w-4 h-4 shrink-0",
                            isActive ? "text-primary" : "",
                          )}
                        />
                        {!collapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "border-t border-white/5 p-2 shrink-0",
            collapsed ? "flex justify-center" : "",
          )}
        >
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="relative z-10 border-b border-white/5 bg-background/60 backdrop-blur-xl shrink-0">
          <div className="h-14 flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-white/5"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5 text-white" />
                ) : (
                  <Menu className="w-5 h-5 text-white" />
                )}
              </button>
              <div className="md:hidden flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-white" />
                </div>
                <span className="font-display font-bold text-base text-white">
                  LLM <span className="text-primary">Hub</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
                title={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>
              <NotificationBell />
              <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-black/40 border border-white/5">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full animate-pulse",
                    status?.online
                      ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                      : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]",
                  )}
                />
                <span
                  className={cn(
                    "hidden sm:inline",
                    status?.online ? "text-green-400" : "text-red-400",
                  )}
                >
                  {status?.online ? "Online" : "Offline"}
                </span>
              </div>
              {!authLoading &&
                (isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    {user?.profileImageUrl ? (
                      <img
                        src={user.profileImageUrl}
                        alt=""
                        className="w-7 h-7 rounded-full border border-white/20"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                    <span className="hidden lg:inline text-xs text-muted-foreground">
                      {user?.username}
                      {isAdmin && (
                        <span className="ml-1 text-[10px] text-amber-400 font-semibold">
                          (Admin)
                        </span>
                      )}
                    </span>
                    <button
                      onClick={logout}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
                      title="Log out"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={login}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Sign In
                  </button>
                ))}
            </div>
          </div>
        </header>

        {mobileMenuOpen && (
          <div
            className="md:hidden fixed inset-0 top-14 z-30 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          >
            <nav
              className="bg-background border-r border-white/5 w-64 h-full overflow-y-auto py-4"
              onClick={(e) => e.stopPropagation()}
            >
              {filteredSections.map((section) => (
                <div key={section.title} className="mb-2">
                  <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {section.title}
                  </div>
                  <div className="space-y-0.5 px-2">
                    {section.items.map((item) => {
                      const isActive = location === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-primary/15 text-white"
                              : "text-muted-foreground hover:text-white hover:bg-white/5",
                          )}
                        >
                          <item.icon
                            className={cn(
                              "w-4 h-4",
                              isActive ? "text-primary" : "",
                            )}
                          />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        )}

        <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
