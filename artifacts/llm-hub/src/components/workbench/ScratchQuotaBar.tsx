import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HardDrive, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
