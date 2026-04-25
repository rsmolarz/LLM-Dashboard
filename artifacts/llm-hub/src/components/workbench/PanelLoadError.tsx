import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Typed error thrown by Workbench panel queryFns so React Query
 * surfaces a structured value instead of forcing `any` casts.
 */
export class PanelQueryError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PanelQueryError";
    this.code = code;
  }
}

/**
 * Narrow a React Query `error` value (typed as `unknown` /
 * `Error | null` depending on options) into our enriched shape.
 */
export function asPanelQueryError(err: unknown): PanelQueryError | null {
  if (err instanceof PanelQueryError) return err;
  if (err instanceof Error) return new PanelQueryError(err.message, "UNKNOWN");
  return null;
}

type Props = {
  /** Short human label of what failed to load (e.g. "git status", "agent activity"). */
  what: string;
  /** Backend-supplied error message, if any. */
  message?: string | null;
  /** Backend-supplied error code, if any (e.g. AUTH_REQUIRED). */
  code?: string | null;
  onRetry?: () => void;
  className?: string;
};

/**
 * Inline error card for Workbench side panels (Git, Agent Activity)
 * whose JSON shape is different from the file/content panels handled
 * by `WorkbenchErrorView`. Renders an unmistakable error state instead
 * of silently falling back to "no data".
 */
export function PanelLoadError({ what, message, code, onRetry, className }: Props) {
  const isAuth = code === "AUTH_REQUIRED";
  const Icon = isAuth ? Lock : AlertTriangle;
  const tone = isAuth
    ? { wrap: "border-[#f9e2af]/25 bg-[#f9e2af]/5", icon: "text-[#f9e2af]" }
    : { wrap: "border-[#f38ba8]/25 bg-[#f38ba8]/5", icon: "text-[#f38ba8]" };

  const title = isAuth ? `Sign-in required to load ${what}` : `Couldn't load ${what}`;
  const fallback = "Something went wrong on our end. Try again in a moment.";
  const body = isAuth
    ? "Please sign in and try again."
    : message || fallback;
  // For auth, show the raw backend message as collapsible details so the
  // user-facing copy stays clean but the technical reason is still
  // accessible. For other failures the body already IS the message, so
  // there is nothing extra to reveal.
  const detailMessage = isAuth && message ? message : null;

  return (
    <div className={cn("p-4", className)}>
      <div className={cn("rounded-lg border p-3", tone.wrap)}>
        <div className="flex items-start gap-2.5">
          <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", tone.icon)} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#cdd6f4]">{title}</p>
            <p className="text-[11px] text-[#a6adc8] mt-1 leading-relaxed break-words">{body}</p>
            {detailMessage && (
              <details className="mt-2">
                <summary className="text-[10px] text-[#6c7086] cursor-pointer hover:text-[#a6adc8]">
                  Show details
                </summary>
                <pre className="mt-1 text-[10px] text-[#6c7086] whitespace-pre-wrap break-all font-mono">
                  {detailMessage}
                </pre>
              </details>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {isAuth && (
                <a
                  href={`/api/login?returnTo=${encodeURIComponent(
                    typeof window !== "undefined"
                      ? window.location.pathname + window.location.search
                      : "/"
                  )}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[#f9e2af]/15 text-[#f9e2af] hover:bg-[#f9e2af]/25"
                >
                  Sign in
                </a>
              )}
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-[#313244] text-[#a6adc8] hover:bg-[#313244]"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
