import { Link2, FolderOpen, Server, Cloud, X } from "lucide-react";
import { useSelectedProject } from "@/hooks/useSelectedProject";

export function ProjectContextHeader({ compact = false }: { compact?: boolean }) {
  const { project, setProject } = useSelectedProject();
  if (!project) {
    return (
      <div className={`px-3 ${compact ? "py-1" : "py-1.5"} border-b border-[#313244] bg-[#181825] flex items-center gap-2 text-[11px] text-[#6c7086]`}>
        <Link2 className="h-3 w-3" />
        <span>No project selected — pick one from the sidebar to scope file ops, shell, and AI to that app.</span>
      </div>
    );
  }
  const Icon = project.origin === "vps" ? Server : project.origin === "replit" ? Cloud : FolderOpen;
  const tone =
    project.origin === "vps" ? "text-[#fab387] border-[#fab387]/40" :
    project.origin === "replit" ? "text-[#89b4fa] border-[#89b4fa]/40" :
    "text-[#a6e3a1] border-[#a6e3a1]/40";
  return (
    <div className={`px-3 ${compact ? "py-1" : "py-1.5"} border-b border-[#313244] bg-[#181825] flex items-center gap-2`}>
      <Icon className={`h-3 w-3 ${tone.split(" ")[0]}`} />
      <span className="text-[11px] text-[#6c7086]">Now working on</span>
      <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded border ${tone}`}>
        {project.origin}
      </span>
      <span className="text-[11px] text-[#cdd6f4] font-mono truncate" title={project.path}>
        {project.name || project.path}
      </span>
      {project.url && (
        <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#89b4fa] hover:underline">open ↗</a>
      )}
      <button
        onClick={() => setProject(null)}
        className="ml-auto p-0.5 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4]"
        title="Clear selection"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
