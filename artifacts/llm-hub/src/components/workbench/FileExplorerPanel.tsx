import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronRight, Copy, File, FileCode, FilePlus2, Folder, Loader2, RefreshCw,
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

  const items: FileItem[] = data?.items || [];
  const fileScope: FileScope = (data?.scope && typeof data.scope === "object") ? data.scope : {};
  const breadcrumbs = currentPath === "." ? ["root"] : ["root", ...currentPath.split("/").filter(Boolean)];

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
        <button
          className={cn("p-1 rounded text-[#6c7086] hover:text-[#cdd6f4]", styles.refreshBtnHover)}
          onClick={() => refetch()}
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-1/3 border-r border-[#313244] overflow-y-auto">
          <div className="p-1">
            <ScratchModeBanner scope={fileScope} />
            {showCopyAffordance && copyError && copyError.path !== selectedFile && (
              <div className="mx-1 mb-1 px-2 py-1 text-[10px] rounded border border-[#f38ba8]/40 bg-[#f38ba8]/10 text-[#f38ba8]">
                Couldn&apos;t copy <span className="font-mono">{copyError.path}</span>: {copyError.message}
              </div>
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
                return (
                  <div
                    key={item.path}
                    className={cn(
                      "group flex items-center w-full",
                      selectedFile === item.path && styles.selectedRowBg
                    )}
                  >
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
                    {canCopy && (
                      <button
                        type="button"
                        title="Make a private copy in your scratch dir"
                        aria-label={`Make a private copy of ${item.name}`}
                        className="ml-1 mr-1 p-1 rounded text-[#89b4fa] hover:bg-[#313244] hover:text-[#a6e3a1] disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 focus:opacity-100"
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
