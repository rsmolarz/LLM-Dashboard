import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitBranch, GitCommit, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PanelLoadError,
  PanelQueryError,
  asPanelQueryError,
} from "@/components/workbench/PanelLoadError";
import { SandboxBlockedNotice } from "@/components/workbench/SandboxNotices";

export type GitPanelVariant = "default" | "claude";

// Visual-only differences between the standard Workbench and the
// Claude Workbench. The two surfaces use the same Catppuccin chrome
// for most things, but the branch icon hue and the change-status
// pill colors differ slightly. Centralising them here keeps the
// component itself variant-agnostic.
type VariantStyles = {
  branchIcon: string;
  statusModified: string;
  statusAdded: string;
  statusDeleted: string;
  statusOther: string;
};

const VARIANT_STYLES: Record<GitPanelVariant, VariantStyles> = {
  default: {
    branchIcon: "text-orange-400",
    statusModified: "text-yellow-500 border-yellow-500/30",
    statusAdded: "text-green-500 border-green-500/30",
    statusDeleted: "text-red-500 border-red-500/30",
    statusOther: "text-[#6c7086] border-[#313244]",
  },
  claude: {
    branchIcon: "text-[#fab387]",
    statusModified: "text-[#f9e2af] border-[#f9e2af]/30",
    statusAdded: "text-[#a6e3a1] border-[#a6e3a1]/30",
    statusDeleted: "text-[#f38ba8] border-[#f38ba8]/30",
    statusOther: "text-[#6c7086] border-[#313244]",
  },
};

export type GitPanelProps = {
  // localStorage / react-query namespace prefix. Use "wb" for the
  // standard workbench and "cw" for the Claude workbench so the two
  // surfaces keep independent caches per-tab.
  storagePrefix: string;
  // Visual variant — toggles between the orange branch icon used by
  // the standard workbench and the peach Catppuccin tone used by the
  // Claude workbench.
  variant?: GitPanelVariant;
  // When true, surfaces inline `sandboxBlocked` reasons returned by
  // the git mutation endpoint (re-using the same notice the Shell
  // panel uses). Without this, a quota-exceeded `git pull` looks
  // silently no-op'd to the user. The standard Workbench opts in;
  // the Claude Workbench currently does not.
  surfaceSandboxNotice?: boolean;
};

type GitChange = { status: string; file: string };
type GitCommitEntry = { hash?: string; message?: string; date?: string };
type GitStatusData = {
  currentBranch?: string;
  changes?: GitChange[];
  commits?: GitCommitEntry[];
  error?: string;
  code?: string;
};

export function GitPanel({
  storagePrefix,
  variant = "default",
  surfaceSandboxNotice = false,
}: GitPanelProps) {
  const styles = VARIANT_STYLES[variant];

  const { data, isLoading, error, refetch } = useQuery<GitStatusData, PanelQueryError>({
    queryKey: [`${storagePrefix}-git-status`],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`/api/workbench/git-status`, { credentials: "include" });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Network error";
        throw new PanelQueryError(reason, "NETWORK_ERROR");
      }
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const reason = typeof body?.error === "string"
          ? body.error
          : `Failed to load git status (HTTP ${res.status})`;
        const code = typeof body?.code === "string" ? body.code : `HTTP_${res.status}`;
        throw new PanelQueryError(reason, code);
      }
      return body as GitStatusData;
    },
    retry: false,
  });
  const queryError = asPanelQueryError(error);
  const dataError = (data as { error?: string; code?: string } | undefined) ?? undefined;
  const errorMessage = queryError?.message ?? dataError?.error ?? null;
  const errorCode = queryError?.code ?? dataError?.code ?? null;

  // Git mutation results: previously discarded entirely on the
  // standard workbench, which meant a quota-exceeded `git pull`
  // looked silently no-op'd to the user. When `surfaceSandboxNotice`
  // is on, we render any `sandboxBlocked` reason inline (re-using
  // the same notice the Shell panel uses), so the one-click "free
  // space" affordance shows up under the Git toolbar buttons too.
  const [gitNotice, setGitNotice] = useState<{
    command: string;
    reason: string;
    quotaExceeded: boolean;
  } | null>(null);

  const gitMutation = useMutation({
    mutationFn: async (command: string) => {
      const res = await fetch(`/api/workbench/git`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        credentials: "include",
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      return { command, body };
    },
    onSuccess: ({ command, body }) => {
      const sandboxBlocked = surfaceSandboxNotice && typeof body?.sandboxBlocked === "string"
        ? body.sandboxBlocked
        : null;
      if (sandboxBlocked) {
        setGitNotice({
          command,
          reason: sandboxBlocked,
          quotaExceeded: body?.quotaExceeded === true,
        });
      } else {
        setGitNotice(null);
        refetch();
      }
    },
  });

  const statusClass = (status: string) => {
    if (status === "M") return styles.statusModified;
    if (status === "A" || status === "??") return styles.statusAdded;
    if (status === "D") return styles.statusDeleted;
    return styles.statusOther;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <GitBranch className={cn("h-3.5 w-3.5", styles.branchIcon)} />
          <span className="text-xs font-medium text-[#cdd6f4]">Git</span>
          {data?.currentBranch && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#313244] text-[#a6adc8]">{data.currentBranch}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="px-2 py-0.5 text-[10px] rounded hover:bg-[#313244] text-[#6c7086]"
            onClick={() => gitMutation.mutate("git pull")}
            disabled={gitMutation.isPending}
          >Pull</button>
          <button
            className="px-2 py-0.5 text-[10px] rounded hover:bg-[#313244] text-[#6c7086]"
            onClick={() => gitMutation.mutate("git fetch")}
            disabled={gitMutation.isPending}
          >Fetch</button>
          <button
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086]"
            onClick={() => refetch()}
          ><RefreshCw className="h-3 w-3" /></button>
        </div>
      </div>
      {gitNotice && (
        <div className="p-2 border-b border-[#313244] bg-[#181825]">
          <div className="flex items-center gap-1 text-[11px] font-mono">
            <span className={styles.branchIcon}>$</span>
            <span className="text-[#cdd6f4] flex-1 truncate">{gitNotice.command}</span>
            <button
              className="text-[10px] text-[#6c7086] hover:text-[#a6adc8]"
              onClick={() => setGitNotice(null)}
              title="Dismiss"
            >
              Dismiss
            </button>
          </div>
          <SandboxBlockedNotice
            reason={gitNotice.reason}
            hasProject={false}
            quotaExceeded={gitNotice.quotaExceeded}
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">{[1, 2, 3].map(i => (
            <div key={i} className="h-6 w-full bg-[#313244] rounded animate-pulse" />
          ))}</div>
        ) : errorMessage ? (
          <PanelLoadError what="git status" message={errorMessage} code={errorCode} onRetry={() => refetch()} />
        ) : (
          <div className="p-2 space-y-3">
            {data?.changes && data.changes.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-[#6c7086] mb-1 px-1">Changes ({data.changes.length})</h4>
                <div className="space-y-0.5">
                  {data.changes.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-1 py-0.5 rounded text-xs hover:bg-[#313244]">
                      <span className={cn("text-[9px] px-1 rounded border", statusClass(c.status))}>{c.status}</span>
                      <span className="truncate font-mono text-[11px] text-[#a6adc8]">{c.file}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data?.changes && data.changes.length === 0 && (
              <div className="text-xs text-center text-[#585b70] py-2">Working tree clean</div>
            )}
            <div className="h-px bg-[#313244]" />
            <div>
              <h4 className="text-xs font-medium text-[#6c7086] mb-1 px-1">Recent Commits</h4>
              <div className="space-y-0.5">
                {data?.commits?.slice(0, 15).map((c, i) => (
                  <div key={i} className="flex items-start gap-1.5 px-1 py-1 rounded text-xs hover:bg-[#313244]">
                    <GitCommit className="h-3 w-3 mt-0.5 text-[#585b70] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-[#a6adc8]">{c.message}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#585b70] font-mono">{c.hash?.substring(0, 7)}</span>
                        <span className="text-[10px] text-[#585b70]">{c.date}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
