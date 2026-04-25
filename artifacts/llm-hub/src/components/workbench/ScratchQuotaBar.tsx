import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HardDrive, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Event name used by panels that observe live quota changes (e.g. the
// shell mutation response carries the latest snapshot) to broadcast the
// new value to other surfaces — most notably the top-bar badge that
// otherwise only refetches on its own polling interval.
export const SCRATCH_QUOTA_EVENT = "workbench:scratch-quota";

/**
 * Helper for any panel that just got a fresh quota snapshot from the
 * server (e.g. via the shell, upload, or git endpoints) and wants the
 * top-bar badge to reflect the new value immediately, without waiting
 * for the badge's next poll.
 */
export function broadcastScratchQuota(quota: ScratchQuota): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SCRATCH_QUOTA_EVENT, { detail: quota }));
}

export type ScratchQuota = {
  usedBytes: number;
  capBytes: number;
  remainingBytes: number;
};

export function parseScratchQuota(raw: unknown): ScratchQuota | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.usedBytes !== "number") return undefined;
  if (typeof r.capBytes !== "number") return undefined;
  if (typeof r.remainingBytes !== "number") return undefined;
  return {
    usedBytes: r.usedBytes,
    capBytes: r.capBytes,
    remainingBytes: r.remainingBytes,
  };
}

function formatScratchBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const k = 1024;
  const sizes = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const v = bytes / Math.pow(k, i);
  const rounded = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${rounded} ${sizes[i]}`;
}

const CLEAR_COMMAND = "rm -rf -- ./* ./.[!.]*";

/**
 * Footer affordance for the workbench shell panel that surfaces the
 * user's per-scratch-dir disk usage. Task #51 added a hard 1 GiB cap
 * enforced server-side; this component reads the `quota` snapshot the
 * shell/git endpoints already attach to every response and renders it
 * so users can self-manage their scratch dir before they get blocked.
 *
 * Visual states:
 *   - < 80%   neutral grey
 *   - >= 80%  warning yellow
 *   - == 100% blocking red + "clear scratch" affordance with a copy-able
 *             rm command (we don't run the rm ourselves; users always
 *             stay in control of destructive shell commands).
 *
 * The bar also fetches an initial quota snapshot via GET /quota so it
 * shows up immediately on mount, before the user has run any command.
 */
export function ScratchQuotaBar({
  apiBase,
  quota,
  onCopyClear,
}: {
  apiBase: string;
  quota: ScratchQuota | null;
  onCopyClear?: (command: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  // Initial load: fetch the user's current quota so the indicator
  // appears before any shell command. After the first shell response
  // the parent passes `quota` and we ignore the GET result.
  const initial = useQuery<ScratchQuota | null>({
    queryKey: ["workbench-quota", apiBase],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/workbench/quota`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const body = await res.json().catch(() => ({}));
      return parseScratchQuota((body as any)?.quota) ?? null;
    },
    enabled: !quota,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const effective = quota ?? initial.data ?? null;
  if (!effective) return null;

  const { usedBytes, capBytes } = effective;
  const ratio = capBytes > 0 ? Math.min(1, usedBytes / capBytes) : 0;
  const pct = Math.round(ratio * 100);
  const atCap = usedBytes >= capBytes && capBytes > 0;
  const warn = !atCap && ratio >= 0.8;

  const barColor = atCap
    ? "bg-[#f38ba8]"
    : warn
      ? "bg-[#f9e2af]"
      : "bg-[#89b4fa]";
  const textColor = atCap
    ? "text-[#f38ba8]"
    : warn
      ? "text-[#f9e2af]"
      : "text-[#a6adc8]";
  const borderColor = atCap
    ? "border-[#f38ba8]/30"
    : warn
      ? "border-[#f9e2af]/30"
      : "border-[#313244]";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CLEAR_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      if (onCopyClear) onCopyClear(CLEAR_COMMAND);
    } catch {
      // Clipboard can fail in non-secure contexts; users still see the
      // command in the button label, so they can copy by hand.
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 border-t bg-[#181825] text-[10px] font-mono",
        borderColor,
      )}
      data-testid="scratch-quota-bar"
      role="status"
      aria-label={
        atCap
          ? `Scratch space full: ${formatScratchBytes(usedBytes)} of ${formatScratchBytes(capBytes)} used`
          : `Scratch space ${pct}% used: ${formatScratchBytes(usedBytes)} of ${formatScratchBytes(capBytes)}`
      }
    >
      <HardDrive className={cn("h-3 w-3 shrink-0", textColor)} />
      <span className={cn("shrink-0", textColor)}>
        {formatScratchBytes(usedBytes)} / {formatScratchBytes(capBytes)}
        <span className="ml-1 text-[#6c7086]">({pct}%)</span>
      </span>
      <div className="flex-1 h-1.5 bg-[#313244] rounded overflow-hidden min-w-[40px]">
        <div
          className={cn("h-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
          data-testid="scratch-quota-bar-fill"
          data-state={atCap ? "full" : warn ? "warn" : "ok"}
        />
      </div>
      {atCap ? (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 border transition-colors",
            "border-[#f38ba8]/40 text-[#f38ba8] hover:bg-[#f38ba8]/10",
          )}
          title={`Copy a command that clears your scratch dir (${CLEAR_COMMAND})`}
          data-testid="scratch-quota-clear-button"
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          <span>{copied ? "Copied" : "Copy clear cmd"}</span>
        </button>
      ) : warn ? (
        <span className="shrink-0 text-[#f9e2af]" data-testid="scratch-quota-warn-label">
          Approaching cap
        </span>
      ) : null}
    </div>
  );
}

/**
 * Compact, top-bar variant of {@link ScratchQuotaBar}. Task #65 put the
 * full bar inside the Shell panel footer, but file-upload, git, and
 * create-project flows count against the same per-user 1 GiB cap and
 * users get no warning until a write fails. This badge promotes the
 * indicator into the workbench top bar so it's visible no matter which
 * panel is active.
 *
 * Visual states match the footer bar (neutral / warn at >= 80% / red
 * at 100%). Clicking the badge calls `onFocusShell` so the parent can
 * open / focus the shell panel where the full bar (with the clear-cmd
 * affordance) lives.
 *
 * The badge fetches its own snapshot via GET /quota with a 30s poll so
 * background activity (uploads, git clones) keeps it roughly fresh,
 * and also listens for {@link SCRATCH_QUOTA_EVENT} so the shell panel's
 * fresher post-mutation snapshots flow in immediately.
 */
export function ScratchQuotaBadge({
  apiBase,
  onFocusShell,
}: {
  apiBase: string;
  onFocusShell?: () => void;
}) {
  const [override, setOverride] = useState<ScratchQuota | null>(null);

  const initial = useQuery<ScratchQuota | null>({
    queryKey: ["workbench-quota", apiBase],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/workbench/quota`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const body = await res.json().catch(() => ({}));
      return parseScratchQuota((body as any)?.quota) ?? null;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      const parsed = parseScratchQuota(detail);
      if (parsed) setOverride(parsed);
    };
    window.addEventListener(SCRATCH_QUOTA_EVENT, handler);
    return () => window.removeEventListener(SCRATCH_QUOTA_EVENT, handler);
  }, []);

  const effective = override ?? initial.data ?? null;
  if (!effective) return null;

  const { usedBytes, capBytes } = effective;
  const ratio = capBytes > 0 ? Math.min(1, usedBytes / capBytes) : 0;
  const pct = Math.round(ratio * 100);
  const atCap = usedBytes >= capBytes && capBytes > 0;
  const warn = !atCap && ratio >= 0.8;

  const stateClass = atCap
    ? "border-[#f38ba8]/50 bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20"
    : warn
      ? "border-[#f9e2af]/50 bg-[#f9e2af]/10 text-[#f9e2af] hover:bg-[#f9e2af]/20"
      : "border-[#313244] text-[#a6adc8] hover:bg-[#313244]";

  const titleText = atCap
    ? `Scratch space full: ${formatScratchBytes(usedBytes)} of ${formatScratchBytes(capBytes)} used. Click to open the shell.`
    : `Scratch ${pct}% used: ${formatScratchBytes(usedBytes)} of ${formatScratchBytes(capBytes)}. Click to open the shell.`;

  return (
    <button
      type="button"
      onClick={onFocusShell}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-mono border transition-colors",
        stateClass,
      )}
      title={titleText}
      aria-label={
        atCap
          ? `Scratch space full: ${formatScratchBytes(usedBytes)} of ${formatScratchBytes(capBytes)} used`
          : `Scratch space ${pct}% used: ${formatScratchBytes(usedBytes)} of ${formatScratchBytes(capBytes)}`
      }
      data-testid="scratch-quota-badge"
      data-state={atCap ? "full" : warn ? "warn" : "ok"}
    >
      <HardDrive className="h-3 w-3 shrink-0" />
      <span>
        Scratch: {formatScratchBytes(usedBytes)} / {formatScratchBytes(capBytes)}
      </span>
    </button>
  );
}
