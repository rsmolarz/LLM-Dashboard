import { Link } from "wouter";
import {
  AlertTriangle, Cloud, Download, FileQuestion, FolderX, Lock, RefreshCw,
  Shield, FileWarning, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkbenchErrorContext = "files" | "content";

export type WorkbenchErrorPayload = {
  error?: string;
  code?: string;
  size?: number;
};

type Props = {
  payload: WorkbenchErrorPayload;
  context: WorkbenchErrorContext;
  onRetry?: () => void;
  onClear?: () => void;
  /**
   * When provided alongside a FILE_TOO_LARGE error, the card shows a
   * "Download instead" link that hits /api/workbench/file-download with
   * the same path & project descriptor used for the failed preview.
   */
  downloadHref?: string;
  className?: string;
};

function formatBytes(bytes: number) {
  if (!bytes || bytes < 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

type Variant = {
  tone: "info" | "warn" | "danger";
  icon: typeof AlertTriangle;
  title: string;
  body?: string;
};

const TONE_CLASSES: Record<Variant["tone"], { wrap: string; icon: string; title: string }> = {
  info: {
    wrap: "border-[#89b4fa]/25 bg-[#89b4fa]/5",
    icon: "text-[#89b4fa]",
    title: "text-[#cdd6f4]",
  },
  warn: {
    wrap: "border-[#f9e2af]/25 bg-[#f9e2af]/5",
    icon: "text-[#f9e2af]",
    title: "text-[#cdd6f4]",
  },
  danger: {
    wrap: "border-[#f38ba8]/25 bg-[#f38ba8]/5",
    icon: "text-[#f38ba8]",
    title: "text-[#cdd6f4]",
  },
};

function describe(payload: WorkbenchErrorPayload, context: WorkbenchErrorContext): Variant {
  const code = payload.code;
  switch (code) {
    case "PROJECT_NOT_PULLED":
      return {
        tone: "info",
        icon: Cloud,
        title: "Project files aren't pulled yet",
        body: "Pull this Replit project locally so you can browse and edit its files.",
      };
    case "PATH_TRAVERSAL":
      return {
        tone: "danger",
        icon: Shield,
        title: "That path is outside the project",
        body: "We blocked this request because the path tried to escape the project folder.",
      };
    case "NOT_FOUND":
      return context === "content"
        ? {
            tone: "info",
            icon: FileQuestion,
            title: "File not found",
            body: "It may have been moved or deleted. Refreshing the file list…",
          }
        : {
            tone: "info",
            icon: FolderX,
            title: "Folder not found",
            body: "It may have been moved or deleted. Try going back or refreshing.",
          };
    case "FILE_TOO_LARGE": {
      const size = payload.size;
      const sizeStr = size ? formatBytes(size) : "the maximum preview size";
      return {
        tone: "warn",
        icon: FileWarning,
        title: "File is too large to preview",
        body: `This file is ${sizeStr} (preview limit is 500 KB). Open it in the shell with \`head\` or \`tail\` to inspect part of it.`,
      };
    }
    case "PROJECT_UNRESOLVED":
      return {
        tone: "warn",
        icon: AlertTriangle,
        title: "Couldn't find this project",
        body: "Try picking the project again from the sidebar.",
      };
    case "AUTH_REQUIRED":
      return {
        tone: "warn",
        icon: Lock,
        title: "Sign-in required",
        body: "Please sign in to open files for this project.",
      };
    case "INVALID_PROJECT":
      return {
        tone: "warn",
        icon: AlertTriangle,
        title: "Project info couldn't be read",
        body: "Refresh the page and try selecting the project again.",
      };
    case "MISSING_PATH":
      return {
        tone: "warn",
        icon: AlertTriangle,
        title: "No file path was provided",
      };
    default:
      return {
        tone: "danger",
        icon: AlertTriangle,
        title: context === "content" ? "Couldn't load this file" : "Couldn't load these files",
        body: "Something went wrong on our end. Try again in a moment.",
      };
  }
}

export function WorkbenchErrorView({ payload, context, onRetry, onClear, downloadHref, className }: Props) {
  const variant = describe(payload, context);
  const Icon = variant.icon;
  const tone = TONE_CLASSES[variant.tone];

  const showRawDetails =
    payload.code === "INTERNAL_ERROR" || !payload.code;

  return (
    <div className={cn("p-4", className)}>
      <div className={cn("rounded-lg border p-3", tone.wrap)}>
        <div className="flex items-start gap-2.5">
          <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", tone.icon)} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-xs font-medium", tone.title)}>{variant.title}</p>
            {variant.body && (
              <p className="text-[11px] text-[#a6adc8] mt-1 leading-relaxed">{variant.body}</p>
            )}

            {showRawDetails && payload.error && (
              <details className="mt-2">
                <summary className="text-[10px] text-[#6c7086] cursor-pointer hover:text-[#a6adc8]">
                  Show details
                </summary>
                <pre className="mt-1 text-[10px] text-[#6c7086] whitespace-pre-wrap break-all font-mono">
                  {payload.error}
                </pre>
              </details>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {payload.code === "PROJECT_NOT_PULLED" && (
                <Link
                  href="/replit-workbench"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[#89b4fa]/15 text-[#89b4fa] hover:bg-[#89b4fa]/25"
                >
                  Pull files for editing <ExternalLink className="h-3 w-3" />
                </Link>
              )}
              {payload.code === "AUTH_REQUIRED" && (
                <a
                  href={`/api/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[#f9e2af]/15 text-[#f9e2af] hover:bg-[#f9e2af]/25"
                >
                  Sign in
                </a>
              )}
              {payload.code === "FILE_TOO_LARGE" && downloadHref && (
                <a
                  href={downloadHref}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[#f9e2af]/15 text-[#f9e2af] hover:bg-[#f9e2af]/25"
                >
                  <Download className="h-3 w-3" /> Download instead
                </a>
              )}
              {payload.code === "FILE_TOO_LARGE" && onClear && (
                <button
                  onClick={onClear}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-[#313244] text-[#cdd6f4] hover:bg-[#313244]"
                >
                  Choose another file
                </button>
              )}
              {onRetry && payload.code !== "PATH_TRAVERSAL" && payload.code !== "PROJECT_NOT_PULLED" && (
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
