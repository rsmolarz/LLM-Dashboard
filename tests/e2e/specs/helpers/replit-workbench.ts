import { type BrowserContext, type Locator, type Page, expect } from "@playwright/test";

/**
 * Helpers for driving the `/replit-workbench` page. The page only
 * renders its main pane once `useSelectedProject` returns a project
 * with `origin === "replit"`, so specs preload the selection via
 * `localStorage` before navigating.
 *
 * The clone-status badge and action buttons live in the top header
 * row; selectors anchor to the verbatim badge / button text rendered
 * by `ReplitWorkbench.tsx` so a copy tweak is the only change that
 * would force these helpers to update.
 *
 * Selector reminders:
 *   - "not cloned" / "cloned" / "N local edit(s)" / "updated Xm ago"
 *     are all `<span>` badges in the same flex row.
 *   - "Pull files for editing" is the initial-clone button (visible
 *     only when `!cloned`); "Pull latest" replaces it once the clone
 *     exists. Both have a Sign-in disabled state — the fixture user
 *     login already satisfies the `useAuth()` guard.
 *   - The dirty-working-tree prompt shows three action buttons with
 *     the labels "Stash, pull, then re-apply", "Discard local & pull",
 *     and "Keep local edits".
 */

export interface FakeReplitProject {
  origin: "replit";
  path: string;
  name: string;
  url: string;
}

export function defaultFakeReplitProject(): FakeReplitProject {
  return {
    origin: "replit",
    path: "fixture/e2e-clone",
    name: "e2e-clone",
    url: "https://replit.com/@fixture/e2e-clone",
  };
}

/**
 * Pre-set `workbench-selected-project` so that `useSelectedProject`
 * returns the fake project on first read. Must be installed BEFORE
 * the page navigates (call from `test.beforeEach`).
 */
export async function preselectReplitProject(
  context: BrowserContext,
  project: FakeReplitProject,
): Promise<void> {
  await context.addInitScript((p) => {
    try {
      localStorage.setItem("workbench-selected-project", JSON.stringify(p));
      // Pin to "edit" mode so the clone-status header + chat pane
      // render (instead of the iframe view).
      localStorage.setItem("rw-mode", JSON.stringify("edit"));
      // Collapse the project sidebar — its TanStack queries trigger
      // a refetchInterval, and we don't want their loading states
      // racing the assertions on the main pane.
      localStorage.setItem("rw-sidebar-collapsed", "true");
    } catch {}
  }, project);
}

export function notClonedBadge(page: Page): Locator {
  return page.locator('span:text-is("not cloned")');
}

export function clonedBadge(page: Page): Locator {
  // The "cloned" badge text always begins with the literal word
  // "cloned" (it's followed by an optional ` · <localPath tail>`
  // suffix). We match the prefix to stay tolerant of either form.
  return page.locator('span', { hasText: /^cloned(\s·\s.+)?$/ }).first();
}

export function updatedAgeBadge(page: Page): Locator {
  // "updated Xs ago" / "updated Xm ago" / etc. — the only badge
  // whose text begins with "updated ".
  return page.locator('span', { hasText: /^updated\s+\d+[smhd] ago$/ }).first();
}

export function localEditsBadge(page: Page): Locator {
  // "N local edit(s)" — singular and plural forms both end with
  // "local edit(s)" in the rendered string.
  return page.locator('span', { hasText: /^\d+ local edit\(s\)$/ }).first();
}

export function pullFilesForEditingButton(page: Page): Locator {
  return page.locator('button', { hasText: /^Pull files for editing$/ }).first();
}

export function pullLatestButton(page: Page): Locator {
  return page.locator('button', { hasText: /^Pull latest$/ }).first();
}

export function dirtyPromptStashButton(page: Page): Locator {
  return page.locator('button', { hasText: /^Stash, pull, then re-apply$/ }).first();
}

export function dirtyPromptDiscardButton(page: Page): Locator {
  return page.locator('button', { hasText: /^Discard local & pull$/ }).first();
}

export function dirtyPromptKeepButton(page: Page): Locator {
  return page.locator('button', { hasText: /^Keep local edits$/ }).first();
}

/**
 * Build a `CloneInfo` payload matching the shape `clone-info` returns.
 * Defaults to a freshly-cloned, clean working tree.
 */
export function makeCloneInfo(overrides: Partial<{
  exists: boolean;
  localPath: string | null;
  lastFetchedAt: number | null;
  ageMs: number | null;
  stale: boolean;
  dirty: boolean;
  dirtyFiles: string[];
  branch: string | null;
}> = {}) {
  const now = Date.now();
  return {
    exists: true,
    localPath: "/tmp/e2e-clone",
    lastFetchedAt: now,
    ageMs: 5_000,
    stale: false,
    dirty: false,
    dirtyFiles: [],
    branch: "main",
    ...overrides,
  };
}

/**
 * Wait until the `<span>` badge text matches the predicate. Useful
 * because the auto-pull effect (fires 400ms after a stale info
 * lands) can briefly mutate the visible badge state, and we want to
 * wait for the eventual steady state instead of asserting on a
 * transient frame.
 */
export async function waitForBadgeText(page: Page, regex: RegExp, timeout = 8000): Promise<void> {
  await expect.poll(async () => {
    const spans = await page.locator("span").allTextContents();
    return spans.find(t => regex.test(t.trim())) || "";
  }, { timeout, message: `expected a badge matching ${regex}` }).not.toBe("");
}
