import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Shield, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL || "/";
const SANDBOX_URL = `${BASE.replace(/\/$/, "")}/api/monitor/sandbox`;

interface SandboxPosture {
  posture: "kernel-jail" | "fallback";
  osIsolation: { kind: "bwrap" | "firejail" | "nsjail"; bin: string } | null;
  setpriv: string | null;
  prlimit: string | null;
}

export function SandboxStatusBadge({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<SandboxPosture | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const fetchPosture = async () => {
      try {
        const res = await fetch(SANDBOX_URL, { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) {
            setError(true);
            setData(null);
          }
          return;
        }
        const json = (await res.json()) as SandboxPosture;
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setData(null);
        }
      }
    };
    fetchPosture();
    const iv = setInterval(fetchPosture, 30000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [isAdmin]);

  if (!isAdmin) return null;
  if (error || !data) return null;

  const isStrong = data.posture === "kernel-jail";
  const Icon = isStrong ? Shield : ShieldAlert;
  const tooltip = isStrong
    ? `Sandbox: kernel-jail (${data.osIsolation?.kind ?? "active"}) — click for details`
    : "Sandbox: fallback (no kernel-enforced jail) — click for details";

  return (
    <Link
      href="/monitor#sandbox"
      title={tooltip}
      data-testid="sandbox-status-badge"
      data-posture={data.posture}
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors",
        isStrong
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
          : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20",
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="hidden sm:inline">
        Sandbox: <span className="font-semibold">{data.posture}</span>
      </span>
    </Link>
  );
}
