import { Shield } from "lucide-react";

export type EntryPrivacy = "private" | "shared";

export type ShellScope = { origin?: string; path?: string; mode?: string };

export type FileScope = {
  origin?: string;
  mode?: "scratch" | "host";
  scratchPath?: string;
  dirPrivacy?: EntryPrivacy | "mixed";
};

export type SandboxContainmentNotice = {
  reason: "readonly" | "permission";
  path: string;
  message: string;
};

export function parseSandboxContainment(raw: unknown): SandboxContainmentNotice | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const reason = r.reason === "readonly" || r.reason === "permission" ? r.reason : null;
  const path = typeof r.path === "string" ? r.path : null;
  const message = typeof r.message === "string" ? r.message : null;
  if (!reason || !path || !message) return undefined;
  return { reason, path, message };
}

/**
 * Inline notice surfaced under a shell entry whenever the API reports
 * that the OS-level sandbox refused a write that escaped the project
 * boundary. The raw stderr (e.g. `cp: cannot create regular file
 * '/etc/x': Read-only file system`) is still shown above this notice
 * for users who want the technical detail; the notice itself uses
 * non-technical wording so the new posture is observable rather than
 * mysterious.
 */
export function SandboxContainedNotice({ notice }: { notice: SandboxContainmentNotice }) {
  return (
    <div className="ml-3 mt-1 rounded border border-[#f9e2af]/30 bg-[#f9e2af]/5 px-2 py-1.5 flex items-start gap-2">
      <Shield className="h-3 w-3 text-[#f9e2af] mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-[#f9e2af] font-medium">
          Sandbox kept this command inside the project
        </div>
        <div className="text-[11px] text-[#cdd6f4] mt-0.5 leading-relaxed break-words">
          {notice.message}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline notice rendered after a shell command whose write was
 * refused by the per-user sandbox. Translates the engine's reason
 * (e.g. "escapes sandbox via symlink") into plain language and
 * points at the two ways forward:
 *   1) write to a private path inside the user's scratch dir, or
 *   2) re-run with a `project` descriptor so the command targets a
 *      project-scoped working tree instead of the host workspace.
 */
export function SandboxBlockedNotice({
  reason,
  scope,
  hasProject,
}: {
  reason: string;
  scope?: ShellScope;
  hasProject: boolean;
}) {
  return (
    <div className="ml-3 mt-1 mb-1 rounded border border-[#f9e2af]/40 bg-[#f9e2af]/10 p-2 text-[11px] leading-relaxed">
      <div className="flex items-center gap-1.5 text-[#f9e2af]">
        <Shield className="h-3 w-3" />
        <span className="font-semibold">Sandbox blocked this write</span>
      </div>
      <div className="mt-1 text-[#cdd6f4]">{reason}</div>
      <div className="mt-2 text-[#a6adc8]">
        Files like <span className="font-mono">package.json</span>,{" "}
        <span className="font-mono">artifacts/</span>, etc. are <strong>shared</strong> with
        every user — your shell sees them through read-only links into the host workspace, and writes through them are refused so two people can&apos;t step on each other.
      </div>
      <div className="mt-2 text-[#a6adc8]">
        <span className="text-[#cdd6f4] font-semibold">What you can do:</span>
        <ul className="mt-1 ml-3 list-disc space-y-0.5">
          <li>
            Create the file inside your <strong>private scratch</strong> instead — anything you{" "}
            <span className="font-mono">touch</span>, <span className="font-mono">mkdir</span>, or
            <span className="font-mono">{" >"}redirect</span> at a fresh path stays just for you.
          </li>
          {!hasProject && (
            <li>
              Pick a project from the sidebar to run with a project descriptor — those commands target the project&apos;s own working tree (where edits are allowed and tracked).
            </li>
          )}
        </ul>
      </div>
      {scope?.path && (
        <div className="mt-2 text-[10px] text-[#585b70] font-mono break-all">
          scratch dir: {scope.path}
        </div>
      )}
    </div>
  );
}

/**
 * Compact pill rendered next to each entry in the file browser to
 * tell the user "this row is your private scratch file" vs. "this
 * is a shared host symlink — read-only here, ask the project shell
 * to edit it." Omitted entirely for entries without a privacy tag
 * (anonymous host listings, project-scoped listings).
 */
export function PrivacyBadge({ privacy }: { privacy?: EntryPrivacy }) {
  if (!privacy) return null;
  if (privacy === "private") {
    return (
      <span
        className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-[#a6e3a1]/15 text-[#a6e3a1] border border-[#a6e3a1]/30"
        title="Private to you — lives in your per-user scratch dir."
      >
        Private
      </span>
    );
  }
  return (
    <span
      className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-[#89b4fa]/15 text-[#89b4fa] border border-[#89b4fa]/30"
      title="Shared with the project — read-only here. Use the project shell to edit."
    >
      Shared
    </span>
  );
}

/**
 * Banner shown above the entry list when the workbench is browsing
 * the user's per-user scratch dir. Explains the two-coloured world
 * (your private files vs. shared host symlinks) and primes the user
 * for the sandbox refusals they'll hit if they try to write through
 * a shared entry.
 */
export function ScratchModeBanner({ scope }: { scope: FileScope }) {
  if (scope.mode !== "scratch") return null;
  return (
    <div className="px-2 py-1.5 mb-1 text-[10px] leading-snug text-[#a6adc8] border-l-2 border-[#89b4fa] bg-[#181825]">
      You&apos;re browsing your <strong className="text-[#a6e3a1]">private scratch</strong>.{" "}
      <span className="text-[#a6e3a1]">Private</span> entries are yours alone;{" "}
      <span className="text-[#89b4fa]">Shared</span> entries are read-only links into the host workspace — pick a project to edit them.
    </div>
  );
}
