import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Code2, Folder, ChevronLeft, ChevronRight,
  Circle, Server, Package, Loader2, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface Project {
  name: string;
  path: string;
  source: string;
  hasPackageJson: boolean;
  isGit: boolean;
  description: string;
  language?: string;
  status?: "live" | "paused" | "completed";
  origin?: "replit" | "vps";
}

function detectLanguage(project: Project): string {
  if (project.path.includes("python") || project.name.toLowerCase().includes("python")) return "Python";
  if (project.hasPackageJson) return "TypeScript";
  return "Project";
}

function getInitialColor(name: string): string {
  const colors = [
    "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
    "bg-orange-500", "bg-violet-500", "bg-pink-500", "bg-lime-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

type Filter = "all" | "active" | "paused" | "completed";

interface ProjectSidebarProps {
  onSelectProject?: (project: Project) => void;
  selectedProjectPath?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function ProjectSidebar({
  onSelectProject,
  selectedProjectPath,
  collapsed = false,
  onToggleCollapse,
}: ProjectSidebarProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data: localProjects, isLoading: loadingLocal } = useQuery<Project[]>({
    queryKey: ["sidebar-projects-local"],
    queryFn: async () => {
      const res = await fetch(`/api/code-terminal/projects`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.projects || []).map((p: any) => ({
        ...p,
        language: detectLanguage(p),
        status: "live" as const,
        origin: "replit" as const,
      }));
    },
    refetchInterval: 30000,
  });

  const { data: vpsProjects, isLoading: loadingVps } = useQuery<Project[]>({
    queryKey: ["sidebar-projects-vps"],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/workbench/vps-projects`, { credentials: "include" });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.projects || []).map((p: any) => ({
          ...p,
          origin: "vps" as const,
          status: "live" as const,
        }));
      } catch {
        return [];
      }
    },
    refetchInterval: 60000,
  });

  const allProjects = useMemo(() => {
    const local = localProjects || [];
    const vps = vpsProjects || [];
    return [...local, ...vps];
  }, [localProjects, vpsProjects]);

  const filtered = useMemo(() => {
    let list = allProjects;
    if (filter !== "all") {
      list = list.filter(p => p.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    }
    return list;
  }, [allProjects, filter, search]);

  const isLoading = loadingLocal || loadingVps;

  if (collapsed) {
    return (
      <div className="w-10 flex flex-col items-center py-3 border-r border-[#313244] bg-[#181825] shrink-0">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
          title="Expand projects"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="mt-3 flex flex-col items-center gap-2">
          <Code2 className="h-4 w-4 text-[#6c7086]" />
          <span className="text-[9px] text-[#6c7086] writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>
            Projects
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex flex-col border-r border-[#313244] bg-[#181825] shrink-0 min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-[#cdd6f4]" />
          <span className="text-sm font-semibold text-[#cdd6f4]">Projects</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#313244] text-[#a6adc8] font-medium">
            {allProjects.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[#313244]">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#1e1e2e] border border-[#313244] focus-within:border-[#6c7086] transition-colors">
          <Search className="h-3.5 w-3.5 text-[#6c7086] shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="flex-1 bg-transparent text-xs text-[#cdd6f4] placeholder:text-[#6c7086] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#313244]">
        {(["all", "active", "paused", "completed"] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors",
              filter === f
                ? "bg-[#89b4fa] text-[#1e1e2e]"
                : "text-[#6c7086] hover:text-[#a6adc8] hover:bg-[#313244]"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#6c7086]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[#6c7086]">
            <Folder className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs">No projects found</p>
          </div>
        ) : (
          <div className="py-1">
            {filtered.map(project => (
              <button
                key={`${project.origin}-${project.path}`}
                onClick={() => onSelectProject?.(project)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#313244]/60",
                  selectedProjectPath === project.path && "bg-[#313244]/80"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0",
                  getInitialColor(project.name)
                )}>
                  {project.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-[#cdd6f4] font-medium truncate">{project.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[#a6adc8]">{project.language || "Project"}</span>
                    {project.origin === "vps" && (
                      <span className="flex items-center gap-0.5 text-[10px] text-[#fab387]">
                        <Server className="h-2.5 w-2.5" /> VPS
                      </span>
                    )}
                    {project.status === "live" && (
                      <span className="flex items-center gap-0.5 text-[10px] text-[#a6e3a1]">
                        <Circle className="h-2 w-2 fill-current" /> live
                      </span>
                    )}
                    {project.status === "paused" && (
                      <span className="flex items-center gap-0.5 text-[10px] text-[#fab387]">
                        <Circle className="h-2 w-2 fill-current" /> paused
                      </span>
                    )}
                    {project.status === "completed" && (
                      <span className="flex items-center gap-0.5 text-[10px] text-[#6c7086]">
                        <Circle className="h-2 w-2 fill-current" /> done
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
