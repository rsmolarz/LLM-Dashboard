import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronRight, Copy, File, FileCode, FilePlus, FilePlus2, Folder, FolderPlus, Loader2, Pencil, RefreshCw, Trash2, Upload, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useSelectedProject } from "@/hooks/useSelectedProject";
import { WorkbenchErrorView } from "@/components/workbench/WorkbenchErrorView";
import {
  PrivacyBadge,
  ScratchModeBanner,
  type EntryPrivacy,
  type FileScope,
} from "@/components/workbench/SandboxNotices";

export type FileExplorerPanelVariant = "default" | "claude";

type FileItem = {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  // Present only when the server resolves a per-user scratch dir
  // (authenticated, host mode). "shared" = host-workspace symlink
  // mirrored into scratch (read-only here; writes are sandboxed).
  // "private" = a file/dir the user created in their scratch.
  privacy?: EntryPrivacy;
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["ts", "tsx", "js", "jsx"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#89b4fa]" />;
  if (["json", "yaml", "yml", "toml"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#f9e2af]" />;
  if (["py"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#a6e3a1]" />;
  if (["css", "scss"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-[#f5c2e7]" />;
  return <File className="h-3.5 w-3.5 text-[#6c7086]" />;
}

// Variant-specific styling. The two host pages (Workbench and
// ClaudeWorkbench) have slightly different chrome — the standard
// workbench uses Catppuccin surface tokens while the Claude workbench
// leans on translucent white overlays for the toolbar and a darker
// header for the file viewer. We absorb that difference here so the
// rest of the component stays variant-agnostic.
type VariantStyles = {
  refreshBtnHover: string;
  folderIcon: string;
  selectedRowBg: string;
  viewerHeaderBg: string;
  viewerCopyBtnHover: string;
  emptyIcon: string;
  emptyText: string;
  viewerLoading: "skeletons" | "spinner";
};

const VARIANT_STYLES: Record<FileExplorerPanelVariant, VariantStyles> = {
  default: {
    refreshBtnHover: "hover:bg-[#313244]",
    folderIcon: "text-yellow-500",
    selectedRowBg: "bg-[#45475a]",
    viewerHeaderBg: "bg-[#313244]",
    viewerCopyBtnHover: "hover:bg-[#45475a]",
    emptyIcon: "text-[#45475a]",
    emptyText: "Select a file to view its contents",
    viewerLoading: "skeletons",
  },
  claude: {
    refreshBtnHover: "hover:bg-white/5",
    folderIcon: "text-[#fab387]",
    selectedRowBg: "bg-[#313244]",
    viewerHeaderBg: "bg-[#181825]",
    viewerCopyBtnHover: "hover:bg-[#313244]",
    emptyIcon: "opacity-30",
    emptyText: "Select a file",
    viewerLoading: "spinner",
  },
};

export type FileExplorerPanelProps = {
  // localStorage namespace prefix. Use "wb" for the standard workbench
  // and "cw" for the Claude workbench so the two surfaces keep
  // independent open paths and selected-file caches per-tab. Also
  // becomes part of the react-query cache key, so re-renders never
  // smash the two transcripts together.
  storagePrefix: string;
  // Visual variant — toggles between the Catppuccin chrome used by
  // the standard workbench and the translucent-white chrome used by
  // the Claude workbench.
  variant?: FileExplorerPanelVariant;
  // When true, exposes the "Make a private copy" affordance — a row
  // hover button next to each `shared` file plus a button in the
  // open-file header — that calls the workbench copy-to-scratch
  // endpoint. Off by default; the Claude workbench currently opts
  // out so its file panel stays read-only.
  enableCopyToScratch?: boolean;
};

export function FileExplorerPanel({
  storagePrefix,
  variant = "default",
  enableCopyToScratch = false,
}: FileExplorerPanelProps) {
  const styles = VARIANT_STYLES[variant];

  const [currentPath, setCurrentPath] = usePersistedState(`${storagePrefix}-file-path`, ".");
  const [selectedFile, setSelectedFile] = usePersistedState<string | null>(`${storagePrefix}-file-selected`, null);
  const { project } = useSelectedProject();
  const projectKey = project ? JSON.stringify(project) : "";
  const projectQuery = project ? `&project=${encodeURIComponent(JSON.stringify(project))}` : "";
  const [copyError, setCopyError] = useState<{ path: string; message: string } | null>(null);
  const [pendingCopyPath, setPendingCopyPath] = useState<string | null>(null);
  // Inline create / rename / delete state. The "create" form lives at
  // the top of the listing; "rename" replaces the row's name span with
  // an input; "delete" surfaces a confirm-then-action affordance per
  // row. All three share a single error slot — only one mutation is
  // ever in flight at a time so a single banner is enough.
  const [createMode, setCreateMode] = useState<"file" | "directory" | null>(null);
  const [createName, setCreateName] = useState("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  // Drag-drop upload state. `dragDepth` tracks nested dragenter /
  // dragleave events from child elements so the overlay only hides
  // once the cursor has actually left the panel — relying on a single
  // boolean flickers as the cursor moves between rows.
  const [dragDepth, setDragDepth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: [`${storagePrefix}-files`, currentPath, projectKey],
    queryFn: async () => {
      const res = await fetch(`/api/workbench/files?path=${encodeURIComponent(currentPath)}${projectQuery}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: fileContent, isLoading: contentLoading, refetch: refetchContent } = useQuery<any>({
    queryKey: [`${storagePrefix}-file-content`, selectedFile, projectKey],
    queryFn: async () => {
      const res = await fetch(`/api/workbench/file-content?path=${encodeURIComponent(selectedFile!)}${projectQuery}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!selectedFile,
  });

  useEffect(() => {
    if (fileContent?.code === "NOT_FOUND" && selectedFile) {
      refetch();
    }
  }, [fileContent?.code, selectedFile, refetch]);

  // "Make a private copy" — calls the workbench copy-to-scratch
  // endpoint, which materialises the shared host file into the user's
  // own scratch dir at the same relative path. We refetch the file
  // listing AND the open file content (if any) so the row in the
  // browser flips its Privacy badge from Shared → Private and the
  // viewer header updates in place. The mutation is project-scoped
  // out (sharedness only applies to the per-user scratch view of the
  // host workspace; project descriptors have their own writeable
  // working trees).
  const copyToScratchMutation = useMutation<
    { ok: boolean; path: string },
    Error,
    string
  >({
    mutationFn: async (filePath: string) => {
      setPendingCopyPath(filePath);
      let res: Response;
      try {
        res = await fetch(`/api/workbench/copy-to-scratch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ path: filePath }),
        });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        throw new Error(reason);
      }
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof (body as any)?.error === "string"
          ? (body as any).error
          : `Copy failed (HTTP ${res.status})`;
        throw new Error(reason);
      }
      return { ok: true, path: filePath };
    },
    onSuccess: (_, filePath) => {
      setCopyError(null);
      setPendingCopyPath(null);
      void refetch();
      if (selectedFile === filePath) {
        void refetchContent();
      }
    },
    onError: (err, filePath) => {
      setPendingCopyPath(null);
      setCopyError({ path: filePath, message: err.message || "Copy failed" });
    },
  });

  const handleCopyToScratch = (filePath: string) => {
    if (!enableCopyToScratch) return;
    if (project) return; // not applicable when a project descriptor is active
    setCopyError(null);
    copyToScratchMutation.mutate(filePath);
  };

  // Inline create / rename / delete. All three are scratch-only on the
  // backend (the route returns INVALID_INPUT when a project descriptor
  // is set), so we hide the affordances when the user has selected a
  // project. Errors get parsed off the JSON body — the route returns a
  // stable `error` + `code` shape.
  async function readError(res: Response, fallback: string): Promise<string> {
    try {
      const body = await res.json();
      if (typeof body?.error === "string") return body.error;
    } catch { /* not JSON */ }
    return `${fallback} (HTTP ${res.status})`;
  }

  const createMutation = useMutation<
    { createdPath: string; type: "file" | "directory" },
    Error,
    { name: string; type: "file" | "directory" }
  >({
    mutationFn: async ({ name, type }) => {
      const subPath = currentPath === "." || !currentPath ? name : `${currentPath}/${name}`;
      const res = await fetch(`/api/workbench/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: subPath, type }),
      });
      if (!res.ok) throw new Error(await readError(res, "Create failed"));
      return res.json();
    },
    onSuccess: (data) => {
      setWriteError(null);
      setCreateMode(null);
      setCreateName("");
      void refetch();
      // For files, auto-select so the user can confirm the create
      // landed. For directories, leave selection alone — the user
      // probably wants to navigate in next.
      if (data.type === "file") {
        setSelectedFile(data.createdPath);
      }
    },
    onError: (err) => {
      setWriteError(err.message || "Create failed");
    },
  });

  const renameMutation = useMutation<
    { fromPath: string; toPath: string },
    Error,
    { fromPath: string; toName: string }
  >({
    mutationFn: async ({ fromPath, toName }) => {
      const parent = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
      const toPath = parent ? `${parent}/${toName}` : toName;
      const res = await fetch(`/api/workbench/files`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: fromPath, newPath: toPath }),
      });
      if (!res.ok) throw new Error(await readError(res, "Rename failed"));
      return res.json();
    },
    onSuccess: (data) => {
      setWriteError(null);
      setRenameTarget(null);
      setRenameValue("");
      // Keep the viewer in sync if the user just renamed the open file.
      if (selectedFile === data.fromPath) setSelectedFile(data.toPath);
      void refetch();
    },
    onError: (err) => {
      setWriteError(err.message || "Rename failed");
    },
  });

  const deleteMutation = useMutation<
    { deletedPath: string },
    Error,
    string
  >({
    mutationFn: async (filePath) => {
      const res = await fetch(`/api/workbench/files?path=${encodeURIComponent(filePath)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readError(res, "Delete failed"));
      return res.json();
    },
    onSuccess: (data) => {
      setWriteError(null);
      setPendingDeletePath(null);
      // Clear the viewer if the open file was just deleted.
      if (selectedFile === data.deletedPath) setSelectedFile(null);
      void refetch();
    },
    onError: (err) => {
      setPendingDeletePath(null);
      setWriteError(err.message || "Delete failed");
    },
  });

  // File upload — backs both the toolbar Upload button (which opens
  // a hidden <input type=file>) and the drag-drop overlay below. We
  // POST to /api/workbench/files/upload as multipart/form-data with
  // the current dir as `path` so files land in whichever folder the
  // user has open. The server enforces the per-user scratch quota
  // and refuses uploads into a "shared" subfolder; both surface in
  // the existing write-error banner via `setWriteError`.
  const uploadMutation = useMutation<
    { uploaded: number },
    Error,
    FileList | File[]
  >({
    mutationFn: async (filesArg) => {
      const fileArray = Array.from(filesArg);
      if (fileArray.length === 0) throw new Error("No files selected");
      const fd = new FormData();
      // Server defaults `""` to the scratch root — same convention
      // the listing uses, so passing `currentPath` works at every
      // depth (including `.` for the root).
      fd.append("path", currentPath);
      for (const f of fileArray) fd.append("files", f, f.name);
      const res = await fetch(`/api/workbench/files/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error(await readError(res, "Upload failed"));
      return res.json();
    },
    onSuccess: () => {
      setWriteError(null);
      void refetch();
    },
    onError: (err) => {
      setWriteError(err.message || "Upload failed");
      // Refetch anyway: a partial-success batch (some files written
      // before one failed) leaves real bytes on disk that the user
      // should see in the listing.
      void refetch();
    },
    onSettled: () => {
      // Clear the input value so re-uploading the same file path
      // (after a quota fix, etc.) re-triggers the change handler.
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  function openFilePicker() {
    setCreateMode(null);
    setRenameTarget(null);
    setPendingDeletePath(null);
    setWriteError(null);
    fileInputRef.current?.click();
  }

  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    uploadMutation.mutate(files);
  }

  const items: FileItem[] = data?.items || [];
  const fileScope: FileScope = (data?.scope && typeof data.scope === "object") ? data.scope : {};
  const breadcrumbs = currentPath === "." ? ["root"] : ["root", ...currentPath.split("/").filter(Boolean)];

  // The write affordances live inside the per-user scratch view. When
  // the user has picked a project descriptor we route file ops through
  // the project's own clone, which doesn't share the scope guards —
  // hide the buttons entirely so we don't dangle disabled chrome.
  // Inside scratch, "shared" subdirs are read-only by design (writes
  // through the host symlinks would escape the scratch dir), so we
  // only allow creates when the listing is in the user's private tree.
  const canWrite =
    !project &&
    fileScope.mode === "scratch" &&
    fileScope.dirPrivacy !== "shared";

  function startCreate(type: "file" | "directory") {
    setRenameTarget(null);
    setPendingDeletePath(null);
    setWriteError(null);
    setCreateMode(type);
    setCreateName("");
  }

  function startRename(item: FileItem) {
    setCreateMode(null);
    setPendingDeletePath(null);
    setWriteError(null);
    setRenameTarget(item.path);
    setRenameValue(item.name);
  }

  function submitCreate() {
    const name = createName.trim();
    if (!name || !createMode) return;
    if (name.includes("/") || name === "." || name === "..") {
      setWriteError("Name can't contain '/', '.', or '..'");
      return;
    }
    createMutation.mutate({ name, type: createMode });
  }

  function submitRename() {
    const newName = renameValue.trim();
    if (!newName || !renameTarget) return;
    if (newName.includes("/") || newName === "." || newName === "..") {
      setWriteError("Name can't contain '/', '.', or '..'");
      return;
    }
    const currentName = renameTarget.includes("/")
      ? renameTarget.slice(renameTarget.lastIndexOf("/") + 1)
      : renameTarget;
    if (newName === currentName) {
      setRenameTarget(null);
      setRenameValue("");
      return;
    }
    renameMutation.mutate({ fromPath: renameTarget, toName: newName });
  }

  const handleClick = (item: FileItem) => {
    if (item.type === "directory") {
      setCurrentPath(item.path || item.name);
      setSelectedFile(null);
    } else {
      setSelectedFile(item.path);
    }
  };

  const showCopyAffordance = enableCopyToScratch && !project;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-1 text-xs text-[#6c7086] overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <button
                className="hover:text-[#cdd6f4] transition-colors"
                onClick={() => {
                  if (i === 0) setCurrentPath(".");
                  else setCurrentPath(breadcrumbs.slice(1, i + 1).join("/"));
                  setSelectedFile(null);
                }}
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {canWrite && (
            <>
              <button
                type="button"
                title="New file in this folder"
                aria-label="New file"
                data-testid="file-explorer-new-file"
                className={cn(
                  "p-1 rounded text-[#6c7086] hover:text-[#cdd6f4]",
                  styles.refreshBtnHover,
                  createMode === "file" && "text-[#a6e3a1]",
                )}
                onClick={() => startCreate("file")}
              >
                <FilePlus className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="New folder in this folder"
                aria-label="New folder"
                data-testid="file-explorer-new-folder"
                className={cn(
                  "p-1 rounded text-[#6c7086] hover:text-[#cdd6f4]",
                  styles.refreshBtnHover,
                  createMode === "directory" && "text-[#a6e3a1]",
                )}
                onClick={() => startCreate("directory")}
              >
                <FolderPlus className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Upload files into this folder"
                aria-label="Upload files"
                data-testid="file-explorer-upload"
                disabled={uploadMutation.isPending}
                className={cn(
                  "p-1 rounded text-[#6c7086] hover:text-[#cdd6f4] disabled:opacity-50 disabled:cursor-not-allowed",
                  styles.refreshBtnHover,
                )}
                onClick={openFilePicker}
              >
                {uploadMutation.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Upload className="h-3 w-3" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                aria-hidden
                data-testid="file-explorer-upload-input"
                onChange={handleFilesPicked}
              />
            </>
          )}
          <button
            className={cn("p-1 rounded text-[#6c7086] hover:text-[#cdd6f4]", styles.refreshBtnHover)}
            onClick={() => refetch()}
            aria-label="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <div
          className="w-1/3 border-r border-[#313244] overflow-y-auto relative"
          data-testid="file-explorer-list-pane"
          onDragEnter={(e) => {
            if (!canWrite || uploadMutation.isPending) return;
            // Only react to file drags from the OS, not row text drags.
            if (!e.dataTransfer?.types?.includes("Files")) return;
            e.preventDefault();
            setDragDepth((d) => d + 1);
          }}
          onDragOver={(e) => {
            if (!canWrite || uploadMutation.isPending) return;
            if (!e.dataTransfer?.types?.includes("Files")) return;
            e.preventDefault();
            // Show "copy" cursor — matches what users expect for an
            // explorer drop target.
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!canWrite || uploadMutation.isPending) return;
            if (!e.dataTransfer?.types?.includes("Files")) return;
            setDragDepth((d) => Math.max(0, d - 1));
          }}
          onDrop={(e) => {
            if (!canWrite || uploadMutation.isPending) return;
            if (!e.dataTransfer?.types?.includes("Files")) return;
            e.preventDefault();
            setDragDepth(0);
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
              uploadMutation.mutate(files);
            }
          }}
        >
          {canWrite && dragDepth > 0 && (
            <div
              data-testid="file-explorer-drop-overlay"
              className="absolute inset-0 z-10 flex items-center justify-center bg-[#1e1e2e]/80 border-2 border-dashed border-[#a6e3a1] pointer-events-none"
            >
              <div className="flex flex-col items-center gap-1 text-[#a6e3a1] text-xs font-medium">
                <Upload className="h-5 w-5" />
                <span>Drop to upload into this folder</span>
              </div>
            </div>
          )}
          <div className="p-1">
            <ScratchModeBanner scope={fileScope} />
            {showCopyAffordance && copyError && copyError.path !== selectedFile && (
              <div className="mx-1 mb-1 px-2 py-1 text-[10px] rounded border border-[#f38ba8]/40 bg-[#f38ba8]/10 text-[#f38ba8]">
                Couldn&apos;t copy <span className="font-mono">{copyError.path}</span>: {copyError.message}
              </div>
            )}
            {writeError && (
              <div
                role="alert"
                data-testid="file-explorer-write-error"
                className="mx-1 mb-1 px-2 py-1 text-[10px] rounded border border-[#f38ba8]/40 bg-[#f38ba8]/10 text-[#f38ba8] flex items-start gap-1.5"
              >
                <span className="flex-1">{writeError}</span>
                <button
                  type="button"
                  aria-label="Dismiss error"
                  className="text-[#f38ba8]/70 hover:text-[#f38ba8]"
                  onClick={() => setWriteError(null)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {createMode && canWrite && (
              <form
                data-testid="file-explorer-create-form"
                className="flex items-center gap-1 px-2 py-1 mx-1 mb-1 rounded bg-[#313244]/60"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCreate();
                }}
              >
                {createMode === "directory"
                  ? <Folder className={cn("h-3.5 w-3.5 shrink-0", styles.folderIcon)} />
                  : <File className="h-3.5 w-3.5 text-[#6c7086] shrink-0" />}
                <input
                  autoFocus
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setCreateMode(null);
                      setCreateName("");
                      setWriteError(null);
                    }
                  }}
                  placeholder={createMode === "directory" ? "folder name" : "file name"}
                  aria-label={createMode === "directory" ? "New folder name" : "New file name"}
                  data-testid="file-explorer-create-input"
                  className="flex-1 min-w-0 bg-[#1e1e2e] border border-[#45475a] rounded px-1.5 py-0.5 text-xs text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                  disabled={createMutation.isPending}
                />
                <button
                  type="submit"
                  data-testid="file-explorer-create-submit"
                  disabled={createMutation.isPending || !createName.trim()}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[#a6e3a1]/40 text-[#a6e3a1] hover:bg-[#a6e3a1]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                </button>
                <button
                  type="button"
                  aria-label="Cancel new entry"
                  className="p-0.5 rounded text-[#6c7086] hover:text-[#cdd6f4]"
                  onClick={() => {
                    setCreateMode(null);
                    setCreateName("");
                    setWriteError(null);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </form>
            )}
            {currentPath !== "." && (
              <button
                className="w-full text-left px-2 py-1 text-xs hover:bg-[#313244] rounded flex items-center gap-1.5"
                onClick={() => {
                  const parts = currentPath.split("/");
                  parts.pop();
                  setCurrentPath(parts.length ? parts.join("/") : ".");
                  setSelectedFile(null);
                }}
              >
                <Folder className={cn("h-3.5 w-3.5", styles.folderIcon)} />
                <span className="text-[#6c7086]">..</span>
              </button>
            )}
            {isLoading ? (
              <div className="p-2 space-y-1">{[1,2,3,4].map(i => <div key={i} className="h-5 w-full bg-[#313244] rounded animate-pulse" />)}</div>
            ) : data?.error || data?.code ? (
              <WorkbenchErrorView
                payload={{ error: data.error, code: data.code, size: data.size }}
                context="files"
                onRetry={() => refetch()}
              />
            ) : (
              items.map(item => {
                const canCopy =
                  showCopyAffordance &&
                  item.type === "file" &&
                  item.privacy === "shared";
                const isCopying = pendingCopyPath === item.path && copyToScratchMutation.isPending;
                // Write affordances apply to private entries only.
                // Inside a "private" subdir every entry inherits the
                // private privacy by classification; at the scratch
                // root the per-entry classifier flags symlinks as
                // "shared". When `dirPrivacy` isn't supplied (project
                // mode), `item.privacy` is undefined and `canMutate`
                // stays false — `canWrite` already gates that case
                // anyway.
                const canMutate = canWrite && item.privacy !== "shared";
                const isRenaming = renameTarget === item.path;
                const isDeleting = pendingDeletePath === item.path && deleteMutation.isPending;
                const isAwaitingDeleteConfirm = pendingDeletePath === item.path && !deleteMutation.isPending;
                return (
                  <div
                    key={item.path}
                    className={cn(
                      "group flex items-center w-full",
                      selectedFile === item.path && styles.selectedRowBg
                    )}
                  >
                    {isRenaming ? (
                      <form
                        data-testid="file-explorer-rename-form"
                        className="flex-1 flex items-center gap-1 px-2 py-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitRename();
                        }}
                      >
                        {item.type === "directory"
                          ? <Folder className={cn("h-3.5 w-3.5 shrink-0", styles.folderIcon)} />
                          : getFileIcon(item.name)}
                        <input
                          autoFocus
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setRenameTarget(null);
                              setRenameValue("");
                              setWriteError(null);
                            }
                          }}
                          aria-label={`Rename ${item.name}`}
                          data-testid="file-explorer-rename-input"
                          className="flex-1 min-w-0 bg-[#1e1e2e] border border-[#45475a] rounded px-1.5 py-0.5 text-xs text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                          disabled={renameMutation.isPending}
                        />
                        <button
                          type="submit"
                          data-testid="file-explorer-rename-submit"
                          disabled={renameMutation.isPending || !renameValue.trim()}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-[#a6e3a1]/40 text-[#a6e3a1] hover:bg-[#a6e3a1]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {renameMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Rename"}
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel rename"
                          className="p-0.5 rounded text-[#6c7086] hover:text-[#cdd6f4]"
                          onClick={() => {
                            setRenameTarget(null);
                            setRenameValue("");
                            setWriteError(null);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </form>
                    ) : (
                      <button
                        className="flex-1 text-left px-2 py-1 text-xs hover:bg-[#313244] rounded flex items-center gap-1.5 min-w-0"
                        onClick={() => handleClick(item)}
                      >
                        {item.type === "directory"
                          ? <Folder className={cn("h-3.5 w-3.5", styles.folderIcon)} />
                          : getFileIcon(item.name)}
                        <span className="truncate flex-1 text-[#cdd6f4]">{item.name}</span>
                        <PrivacyBadge privacy={item.privacy} />
                        {item.size !== undefined && <span className="text-[10px] text-[#585b70]">{formatBytes(item.size)}</span>}
                      </button>
                    )}
                    {!isRenaming && canCopy && (
                      <button
                        type="button"
                        title="Make a private copy in your scratch dir"
                        aria-label={`Make a private copy of ${item.name}`}
                        className="ml-1 p-1 rounded text-[#89b4fa] hover:bg-[#313244] hover:text-[#a6e3a1] disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 focus:opacity-100"
                        disabled={isCopying}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyToScratch(item.path);
                        }}
                      >
                        {isCopying
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <FilePlus2 className="h-3 w-3" />}
                      </button>
                    )}
                    {!isRenaming && canMutate && (
                      <>
                        <button
                          type="button"
                          title="Rename"
                          aria-label={`Rename ${item.name}`}
                          data-testid={`file-explorer-rename-${item.name}`}
                          className="ml-1 p-1 rounded text-[#6c7086] hover:bg-[#313244] hover:text-[#89b4fa] opacity-0 group-hover:opacity-100 focus:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(item);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        {isAwaitingDeleteConfirm ? (
                          <span className="ml-1 mr-1 flex items-center gap-1">
                            <button
                              type="button"
                              data-testid={`file-explorer-delete-confirm-${item.name}`}
                              aria-label={`Confirm delete ${item.name}`}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-[#f38ba8]/40 text-[#f38ba8] hover:bg-[#f38ba8]/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMutation.mutate(item.path);
                              }}
                            >
                              Delete?
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel delete"
                              className="p-0.5 rounded text-[#6c7086] hover:text-[#cdd6f4]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDeletePath(null);
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            title="Delete"
                            aria-label={`Delete ${item.name}`}
                            data-testid={`file-explorer-delete-${item.name}`}
                            disabled={isDeleting}
                            className="ml-1 mr-1 p-1 rounded text-[#6c7086] hover:bg-[#313244] hover:text-[#f38ba8] opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWriteError(null);
                              setPendingDeletePath(item.path);
                            }}
                          >
                            {isDeleting
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Trash2 className="h-3 w-3" />}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {selectedFile ? (
            contentLoading ? (
              styles.viewerLoading === "skeletons" ? (
                <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-4 bg-[#313244] rounded animate-pulse" style={{ width: `${70 - i * 15}%` }} />)}</div>
              ) : (
                <div className="p-4"><Loader2 className="h-4 w-4 animate-spin text-[#6c7086]" /></div>
              )
            ) : fileContent?.error || fileContent?.code ? (
              <WorkbenchErrorView
                payload={{ error: fileContent.error, code: fileContent.code, size: fileContent.size }}
                context="content"
                onRetry={() => refetchContent()}
                onClear={() => setSelectedFile(null)}
                downloadHref={selectedFile ? `/api/workbench/file-download?path=${encodeURIComponent(selectedFile)}${projectQuery}` : undefined}
              />
            ) : (
              <div className="relative">
                <div className={cn("flex items-center justify-between px-3 py-1 border-b border-[#313244] sticky top-0", styles.viewerHeaderBg)}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-mono text-[#6c7086] truncate">{selectedFile}</span>
                    <PrivacyBadge privacy={fileContent?.scope?.privacy as EntryPrivacy | undefined} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {showCopyAffordance && fileContent?.scope?.privacy === "shared" && selectedFile && (
                      <button
                        type="button"
                        title="Copy this shared file into your private scratch dir so you can edit it from the workbench shell."
                        aria-label="Make a private copy of the open file"
                        className="text-[10px] px-1.5 py-0.5 rounded border border-[#a6e3a1]/40 text-[#a6e3a1] hover:bg-[#a6e3a1]/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        disabled={
                          copyToScratchMutation.isPending && pendingCopyPath === selectedFile
                        }
                        onClick={() => handleCopyToScratch(selectedFile)}
                      >
                        {copyToScratchMutation.isPending && pendingCopyPath === selectedFile
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <FilePlus2 className="h-3 w-3" />}
                        Make a private copy
                      </button>
                    )}
                    <span className="text-[10px] text-[#585b70]">{formatBytes(fileContent?.size || 0)}</span>
                    <button
                      className={cn("p-0.5 rounded", styles.viewerCopyBtnHover)}
                      onClick={() => navigator.clipboard.writeText(fileContent?.content || "")}
                    >
                      <Copy className="h-3 w-3 text-[#6c7086]" />
                    </button>
                  </div>
                </div>
                {showCopyAffordance && fileContent?.scope?.privacy === "shared" && (
                  <div className="px-3 py-1 text-[10px] text-[#a6adc8] bg-[#181825] border-b border-[#313244]">
                    Shared with the project — read-only here. Click <strong>Make a private copy</strong> to drop a writeable copy into your scratch, or pick a project to use the project-aware shell.
                  </div>
                )}
                {showCopyAffordance && copyError && copyError.path === selectedFile && (
                  <div className="px-3 py-1 text-[10px] text-[#f38ba8] bg-[#1e1e2e] border-b border-[#313244]">
                    Couldn&apos;t make a private copy: {copyError.message}
                  </div>
                )}
                <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all text-[#cdd6f4] select-text cursor-text">{fileContent?.content}</pre>
              </div>
            )
          ) : (
            <div className="p-8 text-center text-sm text-[#585b70]">
              <FileCode className={cn("h-8 w-8 mx-auto mb-2", styles.emptyIcon)} />
              {styles.emptyText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
