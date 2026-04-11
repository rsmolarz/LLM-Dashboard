import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Upload, FolderPlus, FileArchive, FileCode, FileText,
  Loader2, X, Check, Trash2, ChevronDown, ChevronRight,
  FolderTree, Clock, Layers, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Template = "blank" | "node" | "express" | "react" | "python" | "html";

const TEMPLATES: { id: Template; label: string; description: string; icon: typeof FileCode }[] = [
  { id: "blank", label: "Blank", description: "Empty project with README", icon: FileText },
  { id: "node", label: "Node.js", description: "Basic Node.js project", icon: FileCode },
  { id: "express", label: "Express", description: "Express.js API server", icon: Layers },
  { id: "react", label: "React", description: "React + Vite frontend", icon: FileCode },
  { id: "python", label: "Python", description: "Python project", icon: FileCode },
  { id: "html", label: "HTML/CSS/JS", description: "Static website", icon: FileText },
];

interface UploadResult {
  name: string;
  type: "file" | "zip";
  path?: string;
  extractedTo?: string;
  fileCount?: number;
  files?: string[];
  size?: number;
  mimetype?: string;
  error?: string;
}

interface ProjectManagerProps {
  catppuccin?: boolean;
}

function CreateProjectForm({ catppuccin, onCreated }: { catppuccin?: boolean; onCreated?: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<Template>("blank");
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; template: string; description: string }) => {
      const res = await fetch(`/api/workbench/create-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wb-projects"] });
      setName("");
      setDescription("");
      setTemplate("blank");
      onCreated?.();
    },
  });

  const bg = catppuccin ? "bg-[#1e1e2e]" : "bg-background";
  const border = catppuccin ? "border-[#313244]" : "border-border";
  const text = catppuccin ? "text-[#cdd6f4]" : "text-foreground";
  const textMuted = catppuccin ? "text-[#6c7086]" : "text-muted-foreground";
  const inputBg = catppuccin ? "bg-[#181825]" : "bg-background";
  const accent = catppuccin ? "bg-[#fab387] text-[#1e1e2e] hover:bg-[#f9e2af]" : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <div className="space-y-3">
      <div>
        <label className={cn("text-xs font-medium mb-1 block", textMuted)}>Project Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="my-new-app"
          className={cn("w-full h-8 text-xs px-3 rounded-lg border outline-none focus:ring-1", border, inputBg, text,
            catppuccin ? "placeholder:text-[#585b70] focus:ring-[#cba6f7]" : "placeholder:text-muted-foreground focus:ring-ring"
          )}
        />
      </div>
      <div>
        <label className={cn("text-xs font-medium mb-1 block", textMuted)}>Description (optional)</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="A brief description..."
          className={cn("w-full h-8 text-xs px-3 rounded-lg border outline-none focus:ring-1", border, inputBg, text,
            catppuccin ? "placeholder:text-[#585b70] focus:ring-[#cba6f7]" : "placeholder:text-muted-foreground focus:ring-ring"
          )}
        />
      </div>
      <div>
        <label className={cn("text-xs font-medium mb-1.5 block", textMuted)}>Template</label>
        <div className="grid grid-cols-3 gap-1.5">
          {TEMPLATES.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={cn("flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all",
                  border,
                  template === t.id
                    ? catppuccin ? "border-[#fab387] bg-[#fab387]/10" : "border-primary bg-primary/5"
                    : catppuccin ? "hover:bg-[#313244]" : "hover:bg-muted"
                )}
              >
                <Icon className={cn("h-4 w-4",
                  template === t.id
                    ? catppuccin ? "text-[#fab387]" : "text-primary"
                    : textMuted
                )} />
                <span className={cn("text-[10px] font-medium", text)}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        onClick={() => createMutation.mutate({ name, template, description })}
        disabled={!name.trim() || createMutation.isPending}
        className={cn("w-full h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-40", accent)}
      >
        {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderPlus className="h-3 w-3" />}
        Create Project
      </button>
      {createMutation.isError && (
        <div className={cn("text-xs p-2 rounded-lg border flex items-center gap-1.5",
          catppuccin ? "border-[#f38ba8]/30 bg-[#f38ba8]/5 text-[#f38ba8]" : "border-destructive/30 bg-destructive/5 text-destructive"
        )}>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {(createMutation.error as Error).message}
        </div>
      )}
      {createMutation.isSuccess && (
        <div className={cn("text-xs p-2 rounded-lg border flex items-center gap-1.5",
          catppuccin ? "border-[#a6e3a1]/30 bg-[#a6e3a1]/5 text-[#a6e3a1]" : "border-green-500/30 bg-green-500/5 text-green-600"
        )}>
          <Check className="h-3 w-3 shrink-0" />
          Project "{createMutation.data?.project?.slug}" created!
        </div>
      )}
    </div>
  );
}

export function UploadArea({ catppuccin, onUploaded }: { catppuccin?: boolean; onUploaded?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadPath, setUploadPath] = useState("projects");
  const [results, setResults] = useState<UploadResult[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList | File[]) => {
      const formData = new FormData();
      formData.append("path", uploadPath);
      Array.from(files).forEach(f => formData.append("files", f));
      const res = await fetch(`/api/workbench/upload`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        let errMsg = `Upload failed (${res.status})`;
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data.files || []);
      queryClient.invalidateQueries({ queryKey: ["wb-projects"] });
      onUploaded?.();
    },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      setPendingCount(e.dataTransfer.files.length);
      uploadMutation.mutate(e.dataTransfer.files);
    }
  }, [uploadPath]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setPendingCount(e.target.files.length);
      uploadMutation.mutate(e.target.files);
      e.target.value = "";
    }
  }, [uploadPath]);

  const border = catppuccin ? "border-[#313244]" : "border-border";
  const text = catppuccin ? "text-[#cdd6f4]" : "text-foreground";
  const textMuted = catppuccin ? "text-[#6c7086]" : "text-muted-foreground";
  const inputBg = catppuccin ? "bg-[#181825]" : "bg-background";

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
      />
      <div>
        <label className={cn("text-xs font-medium mb-1 block", textMuted)}>Upload Destination</label>
        <input
          value={uploadPath}
          onChange={e => setUploadPath(e.target.value)}
          placeholder="projects"
          className={cn("w-full h-7 text-xs px-3 rounded-lg border outline-none focus:ring-1 font-mono", border, inputBg, text,
            catppuccin ? "placeholder:text-[#585b70] focus:ring-[#cba6f7]" : "placeholder:text-muted-foreground focus:ring-ring"
          )}
        />
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleFileSelect}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all",
          isDragging
            ? catppuccin ? "border-[#fab387] bg-[#fab387]/10" : "border-primary bg-primary/5"
            : catppuccin ? "border-[#45475a] hover:border-[#6c7086] hover:bg-[#313244]/30" : "border-border hover:border-primary/50 hover:bg-muted/30",
          uploadMutation.isPending && "pointer-events-none opacity-60"
        )}
      >
        {uploadMutation.isPending ? (
          <Loader2 className={cn("h-8 w-8 animate-spin", catppuccin ? "text-[#fab387]" : "text-primary")} />
        ) : (
          <div className={cn("h-12 w-12 rounded-full flex items-center justify-center",
            isDragging
              ? catppuccin ? "bg-[#fab387]/20" : "bg-primary/10"
              : catppuccin ? "bg-[#313244]" : "bg-muted"
          )}>
            <Upload className={cn("h-5 w-5",
              isDragging
                ? catppuccin ? "text-[#fab387]" : "text-primary"
                : textMuted
            )} />
          </div>
        )}
        <div className="text-center">
          <p className={cn("text-sm font-medium", text)}>
            {uploadMutation.isPending ? `Uploading${pendingCount > 0 ? ` ${pendingCount} file${pendingCount > 1 ? "s" : ""}` : ""}...` : isDragging ? "Drop files here" : "Drop files or click to upload"}
          </p>
          <p className={cn("text-[10px] mt-0.5", textMuted)}>
            Multiple files supported | ZIP files auto-extract | Select or drag several at once
          </p>
        </div>
        <div className={cn("flex items-center gap-2 mt-1", textMuted)}>
          <div className="flex items-center gap-1 text-[9px]"><FileArchive className="h-3 w-3" /> Multiple ZIPs</div>
          <span className="text-[9px]">|</span>
          <div className="flex items-center gap-1 text-[9px]"><FileCode className="h-3 w-3" /> Code</div>
          <span className="text-[9px]">|</span>
          <div className="flex items-center gap-1 text-[9px]"><FileText className="h-3 w-3" /> Configs</div>
        </div>
      </div>

      {uploadMutation.isError && (
        <div className={cn("text-xs p-2 rounded-lg border flex items-center gap-1.5",
          catppuccin ? "border-[#f38ba8]/30 bg-[#f38ba8]/5 text-[#f38ba8]" : "border-destructive/30 bg-destructive/5 text-destructive"
        )}>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {(uploadMutation.error as Error).message}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className={cn("text-xs font-medium", catppuccin ? "text-[#a6e3a1]" : "text-green-600")}>
              {results.length} file{results.length > 1 ? "s" : ""} uploaded successfully
            </span>
            <button onClick={() => setResults([])} className={cn("text-[10px] hover:underline", textMuted)}>Clear</button>
          </div>
          {results.map((r, i) => (
            <div key={i} className={cn("flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs", border,
              catppuccin ? "bg-[#181825]" : "bg-muted/30"
            )}>
              {r.type === "zip" ? <FileArchive className={cn("h-3.5 w-3.5 shrink-0", catppuccin ? "text-[#f9e2af]" : "text-amber-500")} /> :
                <FileCode className={cn("h-3.5 w-3.5 shrink-0", catppuccin ? "text-[#89b4fa]" : "text-blue-500")} />}
              <div className="min-w-0 flex-1">
                <span className={cn("font-medium", text)}>{r.name}</span>
                {r.type === "zip" && r.fileCount !== undefined && (
                  <span className={cn("ml-1.5 text-[10px]", textMuted)}>{r.fileCount} files extracted → {r.extractedTo}</span>
                )}
                {r.size !== undefined && r.type === "file" && (
                  <span className={cn("ml-1.5 text-[10px]", textMuted)}>{(r.size / 1024).toFixed(1)} KB</span>
                )}
                {r.note && (
                  <span className={cn("ml-1.5 text-[10px]", catppuccin ? "text-[#f9e2af]" : "text-amber-500")}>{r.note}</span>
                )}
              </div>
              <Check className={cn("h-3 w-3 shrink-0", catppuccin ? "text-[#a6e3a1]" : "text-green-500")} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsList({ catppuccin }: { catppuccin?: boolean }) {
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading } = useQuery<any[]>({
    queryKey: ["wb-projects"],
    queryFn: async () => { const res = await fetch(`/api/workbench/projects`, { credentials: "include" }); return res.json(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await fetch(`/api/workbench/projects/${slug}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wb-projects"] }),
  });

  const border = catppuccin ? "border-[#313244]" : "border-border";
  const text = catppuccin ? "text-[#cdd6f4]" : "text-foreground";
  const textMuted = catppuccin ? "text-[#6c7086]" : "text-muted-foreground";

  if (isLoading) return <div className="p-3"><Loader2 className={cn("h-4 w-4 animate-spin", textMuted)} /></div>;
  if (projects.length === 0) return <div className={cn("p-4 text-center text-xs", textMuted)}>No projects yet. Create one above!</div>;

  return (
    <div className="space-y-1">
      {projects.map((p: any) => (
        <div key={p.slug} className={cn("flex items-center gap-2 px-2 py-1.5 rounded-lg border group", border,
          catppuccin ? "hover:bg-[#313244]" : "hover:bg-muted/50"
        )}>
          <FolderTree className={cn("h-3.5 w-3.5 shrink-0", catppuccin ? "text-[#fab387]" : "text-amber-500")} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={cn("text-xs font-medium", text)}>{p.name}</span>
              <span className={cn("text-[8px] px-1 rounded", catppuccin ? "bg-[#313244] text-[#a6adc8]" : "bg-muted text-muted-foreground")}>{p.template}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-[10px] font-mono", textMuted)}>{p.path}</span>
              <span className={cn("text-[10px]", textMuted)}>{p.fileCount} files</span>
            </div>
          </div>
          <button
            onClick={() => { if (confirm(`Delete project "${p.name}"?`)) deleteMutation.mutate(p.slug); }}
            className={cn("opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity",
              catppuccin ? "hover:bg-[#f38ba8]/20 text-[#f38ba8]" : "hover:bg-destructive/10 text-destructive"
            )}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ProjectManager({ catppuccin = false }: ProjectManagerProps) {
  const [tab, setTab] = useState<"create" | "upload" | "projects">("create");

  const bg = catppuccin ? "bg-[#1e1e2e]" : "bg-background";
  const border = catppuccin ? "border-[#313244]" : "border-border";
  const text = catppuccin ? "text-[#cdd6f4]" : "text-foreground";
  const textMuted = catppuccin ? "text-[#6c7086]" : "text-muted-foreground";
  const headerBg = catppuccin ? "bg-[#181825]" : "bg-muted/30";
  const activeTab = catppuccin ? "bg-[#fab387] text-[#1e1e2e]" : "bg-primary text-primary-foreground";
  const inactiveTab = catppuccin ? "text-[#6c7086] hover:bg-[#313244]" : "text-muted-foreground hover:bg-muted";

  return (
    <div className={cn("flex flex-col h-full rounded-lg overflow-hidden", bg)}>
      <div className={cn("flex items-center justify-between px-3 py-1.5 border-b", border, headerBg)}>
        <div className="flex items-center gap-2">
          <FolderPlus className={cn("h-3.5 w-3.5", catppuccin ? "text-[#fab387]" : "text-primary")} />
          <span className={cn("text-xs font-medium", text)}>Project Manager</span>
        </div>
      </div>
      <div className={cn("px-2 py-1.5 border-b flex gap-1", border)}>
        {([
          { id: "create" as const, label: "New App", icon: Plus },
          { id: "upload" as const, label: "Upload", icon: Upload },
          { id: "projects" as const, label: "Projects", icon: FolderTree },
        ]).map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors",
                tab === t.id ? activeTab : inactiveTab
              )}
            >
              <Icon className="h-3 w-3" />{t.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "create" && <CreateProjectForm catppuccin={catppuccin} />}
        {tab === "upload" && <UploadArea catppuccin={catppuccin} />}
        {tab === "projects" && <ProjectsList catppuccin={catppuccin} />}
      </div>
    </div>
  );
}
