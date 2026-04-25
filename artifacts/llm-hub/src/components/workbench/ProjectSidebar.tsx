import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Code2, Folder, ChevronLeft, ChevronRight,
  Server, Package, Loader2, Globe, Lock,
  ExternalLink, GripVertical, ChevronUp, ChevronDown,
  ArrowUpToLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "project-sidebar-order";

interface Project {
  name: string;
  path: string;
  source: string;
  hasPackageJson: boolean;
  isGit: boolean;
  description: string;
  language?: string;
  status?: "live" | "paused" | "completed";
  origin?: "replit" | "vps" | "local";
  visibility?: "public" | "private";
  owner?: string;
  url?: string;
}

function projectKey(p: Project): string {
  return `${p.origin || "unknown"}::${p.path}`;
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

function loadSavedOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveOrder(order: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {}
}

type SourceFilter = "all" | "replit" | "vps" | "local";

interface ProjectSidebarProps {
  onSelectProject?: (project: Project) => void;
  selectedProjectPath?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface ProjectRowProps {
  project: Project;
  projectKey: string;
  isFirst: boolean;
  isLast: boolean;
  isSearching: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  selectedProjectPath?: string | null;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToTop: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function ProjectRow({
  project,
  isFirst,
  isLast,
  isSearching,
  isDragging,
  isDragOver,
  selectedProjectPath,
  onSelect,
  onMoveUp,
  onMoveDown,
  onMoveToTop,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ProjectRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      draggable={!isSearching}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "flex items-center transition-all",
        isDragOver && !isDragging && "border-t-2 border-[#89b4fa]",
        isDragging && "opacity-40",
      )}
    >
      <div
        className="flex flex-col items-center justify-center shrink-0 py-1 transition-all duration-150"
        style={{
          width: hovered && !isSearching ? 24 : 0,
          opacity: hovered && !isSearching ? 1 : 0,
          overflow: "hidden",
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onMoveToTop(); }}
          disabled={isFirst}
          className={cn(
            "p-0.5 rounded transition-colors",
            isFirst ? "text-[#313244] cursor-default" : "text-[#a6e3a1] hover:text-[#cdd6f4] hover:bg-[#313244]"
          )}
          title="Move to top"
        >
          <ArrowUpToLine className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst}
          className={cn(
            "p-0.5 rounded transition-colors",
            isFirst ? "text-[#313244] cursor-default" : "text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244]"
          )}
          title="Move up"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast}
          className={cn(
            "p-0.5 rounded transition-colors",
            isLast ? "text-[#313244] cursor-default" : "text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244]"
          )}
          title="Move down"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <button
        onClick={onSelect}
        className={cn(
          "flex-1 flex items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-[#313244]/60",
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
            {project.origin === "replit" && hovered && (
              <ExternalLink className="h-3 w-3 text-[#6c7086] shrink-0" />
            )}
          </div>
          {project.description && (
            <p className="text-[10px] text-[#6c7086] truncate mt-0.5">{project.description}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-[#a6adc8]">{project.language || "Project"}</span>
            {project.origin === "vps" && (
              <span className="flex items-center gap-0.5 text-[10px] text-[#fab387]">
                <Server className="h-2.5 w-2.5" /> VPS
              </span>
            )}
            {project.origin === "local" && (
              <span className="flex items-center gap-0.5 text-[10px] text-[#89b4fa]">
                <Package className="h-2.5 w-2.5" /> Local
              </span>
            )}
            {project.origin === "replit" && project.visibility === "public" && (
              <span className="flex items-center gap-0.5 text-[10px] text-[#a6e3a1]">
                <Globe className="h-2.5 w-2.5" /> Public
              </span>
            )}
            {project.origin === "replit" && project.visibility === "private" && (
              <span className="flex items-center gap-0.5 text-[10px] text-[#6c7086]">
                <Lock className="h-2.5 w-2.5" /> Private
              </span>
            )}
            {project.owner && project.owner !== "rsmolarz" && (
              <span className="text-[10px] text-[#6c7086]">{project.owner}</span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

export default function ProjectSidebar({
  onSelectProject,
  selectedProjectPath,
  collapsed = false,
  onToggleCollapse,
}: ProjectSidebarProps) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [customOrder, setCustomOrder] = useState<string[]>(loadSavedOrder);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const draggedRef = useRef<string | null>(null);

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
        origin: "local" as const,
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

  const { data: replitProjects, isLoading: loadingReplit } = useQuery<Project[]>({
    queryKey: ["sidebar-projects-replit"],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/workbench/replit-projects`, { credentials: "include" });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.projects || []).map((p: any) => ({
          ...p,
          origin: "replit" as const,
        }));
      } catch {
        return [];
      }
    },
    refetchInterval: 120000,
  });

  const allProjects = useMemo(() => {
    const local = localProjects || [];
    const vps = vpsProjects || [];
    const replit = replitProjects || [];
    return [...local, ...vps, ...replit];
  }, [localProjects, vpsProjects, replitProjects]);

  const counts = useMemo(() => ({
    all: allProjects.length,
    replit: (replitProjects || []).length,
    vps: (vpsProjects || []).length,
    local: (localProjects || []).length,
  }), [allProjects, replitProjects, vpsProjects, localProjects]);

  const sortedProjects = useMemo(() => {
    if (customOrder.length === 0) return allProjects;
    const orderMap = new Map<string, number>();
    customOrder.forEach((key, idx) => orderMap.set(key, idx));
    return [...allProjects].sort((a, b) => {
      const aIdx = orderMap.get(projectKey(a));
      const bIdx = orderMap.get(projectKey(b));
      if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
      if (aIdx !== undefined) return -1;
      if (bIdx !== undefined) return 1;
      return 0;
    });
  }, [allProjects, customOrder]);

  const filtered = useMemo(() => {
    let list = sortedProjects;
    if (sourceFilter !== "all") {
      list = list.filter(p => p.origin === sourceFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    }
    return list;
  }, [sortedProjects, sourceFilter, search]);

  const updateOrder = useCallback((newOrder: string[]) => {
    setCustomOrder(newOrder);
    saveOrder(newOrder);
  }, []);

  const moveProject = useCallback((key: string, direction: "up" | "down") => {
    const keys = sortedProjects.map(projectKey);
    const idx = keys.indexOf(key);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= keys.length) return;
    const newKeys = [...keys];
    [newKeys[idx], newKeys[targetIdx]] = [newKeys[targetIdx], newKeys[idx]];
    updateOrder(newKeys);
  }, [sortedProjects, updateOrder]);

  const moveToTop = useCallback((key: string) => {
    const keys = sortedProjects.map(projectKey);
    const idx = keys.indexOf(key);
    if (idx <= 0) return;
    const newKeys = [...keys];
    newKeys.splice(idx, 1);
    newKeys.unshift(key);
    updateOrder(newKeys);
  }, [sortedProjects, updateOrder]);

  const handleDragStart = useCallback((key: string) => {
    draggedRef.current = key;
    setDraggedKey(key);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, key: string) => {
    e.preventDefault();
    setDragOverKey(key);
  }, []);

  const handleDrop = useCallback((targetKey: string) => {
    const srcKey = draggedRef.current;
    if (!srcKey || srcKey === targetKey) {
      setDragOverKey(null);
      setDraggedKey(null);
      return;
    }
    const keys = sortedProjects.map(projectKey);
    const srcIdx = keys.indexOf(srcKey);
    const targetIdx = keys.indexOf(targetKey);
    if (srcIdx < 0 || targetIdx < 0) {
      setDragOverKey(null);
      setDraggedKey(null);
      return;
    }
    const newKeys = [...keys];
    newKeys.splice(srcIdx, 1);
    newKeys.splice(targetIdx, 0, srcKey);
    updateOrder(newKeys);
    setDragOverKey(null);
    setDraggedKey(null);
    draggedRef.current = null;
  }, [sortedProjects, updateOrder]);

  const handleDragEnd = useCallback(() => {
    setDragOverKey(null);
    setDraggedKey(null);
    draggedRef.current = null;
  }, []);

  const isLoading = loadingLocal || loadingVps || loadingReplit;
  const isSearching = search.trim().length > 0;

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
          <span className="text-[9px] text-[#6c7086]" style={{ writingMode: "vertical-rl" }}>
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
          {customOrder.length > 0 && (
            <button
              onClick={() => updateOrder([])}
              className="px-1.5 py-0.5 rounded text-[9px] text-[#f38ba8] hover:bg-[#313244] transition-colors"
              title="Reset custom order"
            >
              Reset
            </button>
          )}
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
        {([
          { key: "all" as SourceFilter, label: "All", count: counts.all },
          { key: "replit" as SourceFilter, label: "Replit", count: counts.replit },
          { key: "vps" as SourceFilter, label: "VPS", count: counts.vps },
          { key: "local" as SourceFilter, label: "Local", count: counts.local },
        ]).map(s => (
          <button
            key={s.key}
            onClick={() => setSourceFilter(s.key)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
              sourceFilter === s.key
                ? "bg-[#89b4fa] text-[#1e1e2e]"
                : "text-[#6c7086] hover:text-[#a6adc8] hover:bg-[#313244]"
            )}
          >
            {s.label} {s.count > 0 && <span className="opacity-70">{s.count}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && allProjects.length === 0 ? (
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
            {filtered.map((project, idx) => {
              const key = projectKey(project);
              return (
                <ProjectRow
                  key={key}
                  project={project}
                  projectKey={key}
                  isFirst={idx === 0}
                  isLast={idx === filtered.length - 1}
                  isSearching={isSearching}
                  isDragging={draggedKey === key}
                  isDragOver={dragOverKey === key && draggedKey !== key}
                  selectedProjectPath={selectedProjectPath}
                  onSelect={() => {
                    onSelectProject?.(project);
                  }}
                  onMoveUp={() => moveProject(key, "up")}
                  onMoveDown={() => moveProject(key, "down")}
                  onMoveToTop={() => moveToTop(key)}
                  onDragStart={() => handleDragStart(key)}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDrop={() => handleDrop(key)}
                  onDragEnd={handleDragEnd}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
