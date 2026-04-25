import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
  type RenderResult,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

vi.mock("@workspace/replit-auth-web", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useSelectedProject", () => ({
  useSelectedProject: () => ({ project: null, setProject: () => undefined }),
  projectDescriptorFromSidebar: (p: unknown) => p,
}));

vi.mock("@/components/workbench/ScratchQuotaBar", () => ({
  ScratchQuotaBar: () => null,
  parseScratchQuota: () => null,
  broadcastScratchQuota: () => undefined,
}));

vi.mock("@/components/workbench/SandboxNotices", () => ({
  PrivacyBadge: () => null,
  ScratchModeBanner: () => null,
  SandboxBlockedNotice: () => null,
  SandboxContainedNotice: () => null,
  parseSandboxContainment: () => undefined,
}));

vi.mock("@/components/workbench/PanelLoadError", () => ({
  PanelLoadError: () => null,
  PanelQueryError: class PanelQueryError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  asPanelQueryError: () => null,
}));

vi.mock("@/components/workbench/ScratchPanel", () => ({
  ScratchPanel: () => null,
}));

vi.mock("@/components/workbench/ProjectManager", () => ({
  default: () => null,
  UploadArea: () => null,
}));

vi.mock("@/components/workbench/ProjectSidebar", () => ({
  default: () => null,
}));

vi.mock("@/components/workbench/FileEditCard", () => ({
  FileEditCard: () => null,
}));

vi.mock("@/components/workbench/FileEditSummary", () => ({
  FileEditSummary: () => null,
}));

vi.mock("@/components/workbench/ProjectContextHeader", () => ({
  ProjectContextHeader: () => null,
}));

vi.mock("@/components/workbench/WorkbenchErrorView", () => ({
  WorkbenchErrorView: () => null,
}));

import { useAuth } from "@workspace/replit-auth-web";
import { ShellPanel } from "@/components/workbench/ShellPanel";

const mockedUseAuth = useAuth as unknown as Mock;

type AuthState = {
  user: null | {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    role: string;
  };
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: () => void;
  logout: () => void;
};

function authState(authenticated: boolean): AuthState {
  return authenticated
    ? {
        user: {
          id: "u1",
          email: null,
          firstName: null,
          lastName: null,
          profileImageUrl: null,
          role: "user",
        },
        isLoading: false,
        isAuthenticated: true,
        isAdmin: false,
        login: () => undefined,
        logout: () => undefined,
      }
    : {
        user: null,
        isLoading: false,
        isAuthenticated: false,
        isAdmin: false,
        login: () => undefined,
        logout: () => undefined,
      };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function renderWithClient(node: ReactElement): RenderResult {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

let fetchMock: Mock;

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

// The Workbench and ClaudeWorkbench surfaces now render the same
// shared ShellPanel component, parameterised by `storagePrefix` (and
// the standard Workbench additionally opts in to `surfaceQuotaExceeded`).
// Only the localStorage keys differ between the two surfaces, so we
// parameterise the privacy-critical assertions over both prefixes
// to catch regressions in either tab.
const variants: Array<{
  label: string;
  storagePrefix: "wb" | "cw";
  surfaceQuotaExceeded?: boolean;
  variant?: "default" | "claude";
  cmdKey: string;
  histKey: string;
}> = [
  {
    label: "Workbench",
    storagePrefix: "wb",
    surfaceQuotaExceeded: true,
    cmdKey: "wb-shell-cmds",
    histKey: "wb-shell-history",
  },
  {
    label: "ClaudeWorkbench",
    storagePrefix: "cw",
    variant: "claude",
    cmdKey: "cw-shell-cmds",
    histKey: "cw-shell-history",
  },
];

describe.each(variants)(
  "$label ShellPanel sign-in / sign-out hydrate",
  ({ storagePrefix, surfaceQuotaExceeded, variant, cmdKey, histKey }) => {
    const Component = (): ReactElement => (
      <ShellPanel
        storagePrefix={storagePrefix}
        {...(surfaceQuotaExceeded ? { surfaceQuotaExceeded: true } : {})}
        {...(variant ? { variant } : {})}
      />
    );
    it("hydrates the saved up-arrow / sidebar history when the user signs in mid-session", async () => {
      // Start signed-out. The mount-time silent hydrate hits the API
      // first; the server politely refuses with 401 so the local
      // cmd/transcript caches stay untouched.
      mockedUseAuth.mockReturnValue(authState(false));
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

      const { rerender } = renderWithClient(<Component />);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/workbench/shell-history?limit=500",
        expect.objectContaining({ credentials: "include" }),
      );
      // No history should have been persisted yet.
      expect(window.localStorage.getItem(cmdKey)).toBeNull();

      // The user signs in mid-session. The effect should re-fetch the
      // server-side history without a page refresh, populate the
      // up-arrow cache (localStorage) and feed the History sidebar.
      const savedCommands = [
        { id: 1, command: "ls -la", createdAt: "2026-01-01T00:00:00Z" },
        { id: 2, command: "git status", createdAt: "2026-01-01T00:00:01Z" },
      ];
      fetchMock.mockResolvedValueOnce(jsonResponse({ history: savedCommands }));
      mockedUseAuth.mockReturnValue(authState(true));

      rerender(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Component />
        </QueryClientProvider>,
      );

      // The hydrate fetch should have fired again (now succeeds).
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      // The up-arrow / Ctrl-R buffer is mirrored to localStorage by
      // usePersistedState; once hydration completes it should match
      // the freshly-fetched commands.
      await waitFor(() => {
        expect(JSON.parse(window.localStorage.getItem(cmdKey) ?? "[]")).toEqual([
          "ls -la",
          "git status",
        ]);
      });

      // Pressing Up should now surface the most recent saved command
      // straight into the input, proving the up-arrow buffer hydrated
      // without a page reload.
      const input = screen.getByPlaceholderText("Enter command...") as HTMLInputElement;
      fireEvent.keyDown(input, { key: "ArrowUp" });
      expect(input.value).toBe("ls -la");

      // Ctrl-R reverse-i-search should walk the same hydrated buffer:
      // entering search mode and typing a substring should surface the
      // matching command in the reverse-search bar. This proves the
      // hydrate also fed the Ctrl-R cache, not just up-arrow.
      fireEvent.keyDown(input, { key: "r", ctrlKey: true });
      const searchBar = await screen.findByTestId("shell-reverse-search");
      const searchInput = screen.getByPlaceholderText("Search history...") as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "git" } });
      await waitFor(() => {
        expect(searchBar.textContent).toContain("git status");
      });

      // Open the History sidebar — it should render the freshly-loaded
      // entries without firing another network call (refresh-on-open
      // is its own non-silent fetch which we mock here).
      fetchMock.mockResolvedValueOnce(jsonResponse({ history: savedCommands }));
      fireEvent.click(screen.getByTestId("shell-history-toggle"));

      await waitFor(() => {
        const sidebar = screen.getByTestId("shell-history-sidebar");
        const entries = within(sidebar).getAllByTestId("shell-history-entry");
        expect(entries).toHaveLength(2);
        expect(entries[0].textContent).toContain("ls -la");
        expect(entries[1].textContent).toContain("git status");
      });
    });

    it("clears the on-screen transcript and up-arrow buffer when the user signs out", async () => {
      // Pre-seed localStorage as if a previous user had run commands
      // in this browser. This simulates the "shared laptop" privacy
      // scenario the hydrate effect was written to defend.
      window.localStorage.setItem(
        cmdKey,
        JSON.stringify(["secret-command", "rm -rf /tmp/old"]),
      );
      window.localStorage.setItem(
        histKey,
        JSON.stringify([
          {
            command: "secret-command",
            stdout: "secret-output",
            stderr: "",
            exitCode: 0,
            timestamp: 0,
          },
        ]),
      );

      mockedUseAuth.mockReturnValue(authState(true));
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          history: [
            { id: 99, command: "secret-command", createdAt: "2026-01-01T00:00:00Z" },
          ],
        }),
      );

      const { rerender } = renderWithClient(<Component />);

      // Wait for the initial hydrate so we know the component finished
      // its first render cycle before we flip auth.
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      // The pre-seeded transcript should be visible right away (the
      // cmd input row also shows a `$` prompt, so use within().
      const transcriptCmd = await screen.findByText("secret-command");
      expect(transcriptCmd).toBeTruthy();
      expect(screen.getByText("secret-output")).toBeTruthy();

      // The user signs out (e.g. clicks "log out", or their session
      // is invalidated). The hydrate effect should wipe both the
      // in-memory transcript and the persisted up-arrow cache so the
      // next signed-in user on this browser does not see the previous
      // user's commands.
      mockedUseAuth.mockReturnValue(authState(false));
      rerender(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Component />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(JSON.parse(window.localStorage.getItem(cmdKey) ?? "null")).toEqual([]);
        expect(JSON.parse(window.localStorage.getItem(histKey) ?? "null")).toEqual([]);
      });

      // The transcript line and its stdout output should both be gone
      // from the DOM — the previous user's commands are no longer
      // visible to whoever is sitting at this browser now.
      expect(screen.queryByText("secret-command")).toBeNull();
      expect(screen.queryByText("secret-output")).toBeNull();

      // The up-arrow buffer should be empty too. Pressing Up must not
      // surface any of the previous user's commands.
      const input = screen.getByPlaceholderText("Enter command...") as HTMLInputElement;
      expect(input.value).toBe("");
      fireEvent.keyDown(input, { key: "ArrowUp" });
      expect(input.value).toBe("");

      // The sign-out branch must NOT trigger a fresh hydrate fetch.
      // (Only the initial mount fetch should have fired.)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  },
);
