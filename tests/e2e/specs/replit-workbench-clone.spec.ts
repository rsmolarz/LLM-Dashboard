import { test, expect, type Route } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { loginAsFixtureUser } from "./helpers/auth";
import {
  defaultFakeReplitProject,
  preselectReplitProject,
  notClonedBadge,
  clonedBadge,
  updatedAgeBadge,
  localEditsBadge,
  pullFilesForEditingButton,
  pullLatestButton,
  dirtyPromptStashButton,
  dirtyPromptDiscardButton,
  dirtyPromptKeepButton,
  makeCloneInfo,
  waitForBadgeText,
} from "./helpers/replit-workbench";

/**
 * Coverage for the `/replit-workbench` clone-status badge
 * transitions. We mock every backend touchpoint the page reaches
 * for so the spec doesn't depend on having a real Replit project
 * available to clone (and so the test runs deterministically in
 * any environment):
 *
 *   * `/api/auth/user` — already covered by the fixture-user login
 *     cookie.
 *   * `/api/code-terminal/projects`, `/api/workbench/vps-projects`,
 *     `/api/workbench/replit-projects` — the project sidebar polls
 *     these every 30-120s; mocked to return empty so a refetch
 *     during the test doesn't paint a "Loading…" spinner over our
 *     assertions.
 *   * `/api/project-context/clone-info` — the page's primary
 *     status source. We swap the response across the test to drive
 *     the not-cloned → cloned → stale → dirty transitions.
 *   * `/api/project-context/ensure-clone` — clicked through the
 *     "Pull files for editing" button.
 *   * `/api/project-context/pull` — clicked through "Pull latest"
 *     AND auto-pulled by the page's stale-state effect; we keep
 *     the response stable so neither path moves the test off the
 *     stale state we're asserting on.
 */

test.describe("Replit workbench clone status badges", () => {
  let cloneInfoBody: any;
  let pullBody: any;
  let ensureCloneBody: any;

  test.beforeEach(async ({ context, request, page }) => {
    const userId = `e2e_repclone_${randomBytes(4).toString("hex")}`;
    await loginAsFixtureUser(request, context, userId);
    await preselectReplitProject(context, defaultFakeReplitProject());

    // Sidebar mocks — return empty arrays so the sidebar's
    // `isLoading` settles fast and doesn't repaint over the page.
    await context.route("**/api/code-terminal/projects", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ projects: [] }) });
    });
    await context.route("**/api/workbench/vps-projects", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ projects: [] }) });
    });
    await context.route("**/api/workbench/replit-projects", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ projects: [defaultFakeReplitProject()] }) });
    });

    // Initial clone-info: not cloned yet. Specs reach into
    // `cloneInfoBody` to mutate the in-memory response between
    // assertions.
    cloneInfoBody = { exists: false, localPath: null, lastFetchedAt: null, ageMs: null, stale: false, dirty: false, dirtyFiles: [], branch: null };
    await context.route("**/api/project-context/clone-info", async (route: Route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cloneInfoBody) });
    });

    // Default ensure-clone response — produces a freshly-cloned
    // tree. Tests can override `ensureCloneBody` if they need to
    // exercise an error path.
    ensureCloneBody = { ok: true, localPath: "/tmp/e2e-clone", cloned: true, info: makeCloneInfo() };
    await context.route("**/api/project-context/ensure-clone", async (route: Route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ensureCloneBody) });
    });

    // Default pull response — "already up to date". The page's
    // auto-pull effect can fire 400ms after a stale info lands;
    // by returning the SAME `cloneInfoBody.info` we keep the
    // visible badge state stable across the auto-pull round-trip.
    pullBody = { ok: true, pulled: false, info: makeCloneInfo() };
    await context.route("**/api/project-context/pull", async (route: Route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...pullBody, info: cloneInfoBody }) });
    });

    // Quiet a chatty request that the FileTree subcomponent
    // makes the moment a clone exists — we don't assert on its
    // results in this spec.
    await context.route("**/api/project-context/list", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [] }) });
    });

    // Suppress the implicit favicon request noise.
    void page;
  });

  test("transitions: not cloned → cloned → stale → dirty", async ({ page }) => {
    await page.goto("/replit-workbench");

    // 1. Initial: not cloned.
    await expect(notClonedBadge(page)).toBeVisible({ timeout: 10_000 });
    await expect(pullFilesForEditingButton(page)).toBeVisible();

    // 2. Click "Pull files for editing" — the ensure-clone mock
    //    returns a fresh, clean clone. Update cloneInfoBody so the
    //    next clone-info refresh (the page calls it after the auto-
    //    pull settles) keeps the cloned state.
    cloneInfoBody = makeCloneInfo();
    ensureCloneBody = { ok: true, localPath: "/tmp/e2e-clone", cloned: true, info: cloneInfoBody };
    await Promise.all([
      page.waitForResponse(r =>
        r.url().includes("/api/project-context/ensure-clone") && r.status() === 200,
      ),
      pullFilesForEditingButton(page).click(),
    ]);

    await expect(clonedBadge(page)).toBeVisible({ timeout: 10_000 });
    await expect(pullLatestButton(page)).toBeVisible();
    // The freshness badge should appear (5s ago — the helper writes
    // ageMs: 5000 by default).
    await waitForBadgeText(page, /^updated\s+5s ago$/);

    // 3. Switch the clone-info mock to a stale response and click
    //    the small refresh button next to "Pull latest" so the page
    //    re-issues `clone-info` immediately. (The refresh button is
    //    icon-only and unlabeled, so we trigger the same effect by
    //    re-mounting the page via reload — which fires the same
    //    `refreshInfo` on `useEffect`.)
    cloneInfoBody = makeCloneInfo({ stale: true, ageMs: 7_200_000, lastFetchedAt: Date.now() - 7_200_000 });
    pullBody = { ok: true, pulled: false, info: cloneInfoBody };
    await page.reload();

    await expect(clonedBadge(page)).toBeVisible({ timeout: 10_000 });
    // The badge text rounds ms→hours; 7,200,000ms == 2h.
    await waitForBadgeText(page, /^updated\s+2h ago$/);

    // 4. Switch to a dirty working tree and reload so the page
    //    re-fetches clone-info. Dirty short-circuits the auto-pull
    //    (the effect predicate requires `!info.dirty`), so the
    //    dirty badge stays visible without us having to race the
    //    auto-pull timer.
    cloneInfoBody = makeCloneInfo({
      dirty: true,
      dirtyFiles: ["src/index.ts", "README.md"],
      stale: false,
      ageMs: 30_000,
      lastFetchedAt: Date.now() - 30_000,
    });
    await page.reload();

    await expect(localEditsBadge(page)).toBeVisible({ timeout: 10_000 });
    // The dirty-tree prompt only renders after a pull attempt — but
    // the per-file local-edits badge is what the page header shows
    // unconditionally on dirty info. Verify the badge text is
    // rendering both files via the count.
    await expect(page.locator('span:text-is("2 local edit(s)")')).toBeVisible();
  });

  test("dirty pull surfaces the stash / discard / keep prompt", async ({ page }) => {
    // Start from a cloned, dirty state directly so we can drive
    // the pull-blocked-by-dirty branch in one shot.
    cloneInfoBody = makeCloneInfo({
      dirty: true,
      dirtyFiles: ["src/index.ts"],
      ageMs: 60_000,
      lastFetchedAt: Date.now() - 60_000,
    });
    // Make /pull respond with the route's documented dirty-tree
    // response — `409 + code: "DIRTY_WORKING_TREE"` triggers the
    // panel's `setDirtyPrompt` side effect.
    await page.route("**/api/project-context/pull", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Local changes would be overwritten.",
          code: "DIRTY_WORKING_TREE",
          dirtyFiles: ["src/index.ts"],
        }),
      });
    });

    await page.goto("/replit-workbench");
    await expect(clonedBadge(page)).toBeVisible({ timeout: 10_000 });
    await expect(localEditsBadge(page)).toBeVisible();

    // Click "Pull latest" — the 409 lands and the prompt opens.
    await pullLatestButton(page).click();

    await expect(dirtyPromptStashButton(page)).toBeVisible({ timeout: 10_000 });
    await expect(dirtyPromptDiscardButton(page)).toBeVisible();
    await expect(dirtyPromptKeepButton(page)).toBeVisible();

    // "Keep local edits" dismisses the prompt without sending
    // another /pull request.
    await dirtyPromptKeepButton(page).click();
    await expect(dirtyPromptStashButton(page)).toBeHidden();
  });
});
