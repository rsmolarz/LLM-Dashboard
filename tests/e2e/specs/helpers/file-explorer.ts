import { type Locator, type Page, type APIRequestContext, expect } from "@playwright/test";

/**
 * Helpers for driving the workbench `FileExplorerPanel`. The panel is
 * the default occupant of the right slot on `/workbench` (key
 * `wb-right-panel: "files"`), so specs only need to login + navigate
 * there. The shell endpoint (`POST /api/workbench/shell`) is the
 * easiest way to mutate the user's per-fixture scratch dir from a
 * spec — we wrap the create / read / update / delete flow here so
 * the test reads top-down.
 *
 * Selector reminders:
 *   - File rows are nested `<button>` elements with the file name
 *     rendered inside a `<span class="truncate">`. We anchor by
 *     exact name text (the explorer normalises display strings, so
 *     no escaping is needed for our ASCII-only test files).
 *   - The breadcrumb is rendered as separate `<button>` siblings
 *     under a flex row at the top of the panel. The "root" crumb
 *     is unique per page and is the easiest anchor for asserting
 *     the panel mounted.
 *   - There is no public delete affordance in the UI, so we drive
 *     deletes through the shell endpoint.
 */

export function fileExplorerRoot(page: Page): Locator {
  // The panel header always renders a "root" breadcrumb button;
  // there is one such button per panel mount. Asserting visibility
  // is a reliable mounted-and-rendered signal.
  return page.locator("button", { hasText: /^root$/ }).first();
}

export function fileRow(page: Page, name: string): Locator {
  // Each row is structured as `<button><svg/><span class="truncate">{name}</span>...</button>`.
  // We match the inner span (unique per row) by exact text, then
  // climb to the parent button so callers can `.click()` to select.
  return page
    .locator("button", { has: page.locator(`span.truncate:text-is("${name.replace(/"/g, '\\"')}")`) })
    .first();
}

export function selectedFileHeader(page: Page, path: string): Locator {
  // The viewer's header sticks the open path inside a
  // `<span class="text-xs font-mono text-[#6c7086] truncate">`.
  // The `font-mono` + `text-xs` combo is unique to this header
  // within the panel.
  return page.locator(`span.font-mono.truncate:text-is("${path.replace(/"/g, '\\"')}")`).first();
}

export function fileContentBody(page: Page): Locator {
  // The file viewer renders content inside a `<pre>` block. The
  // panel may render `<pre>` skeletons elsewhere, but this one is
  // the visible (non-truncated) content area.
  return page.locator("pre").first();
}

/**
 * Run a short shell command in the user's scratch dir via the api-
 * server's `/api/workbench/shell` endpoint. Used by specs to set up
 * fixture files without going through the file explorer UI itself
 * (which has no inline create/delete affordance).
 *
 * The endpoint requires auth — pass an `APIRequestContext` that has
 * already been logged in via `loginAsFixtureUser`.
 */
export async function runScratchShell(
  request: APIRequestContext,
  command: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const res = await request.post(`/api/workbench/shell`, {
    data: { command },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status(), `POST /api/workbench/shell ('${command}') should succeed`).toBe(200);
  const body = await res.json();
  return {
    exitCode: typeof body.exitCode === "number" ? body.exitCode : -1,
    stdout: typeof body.stdout === "string" ? body.stdout : "",
    stderr: typeof body.stderr === "string" ? body.stderr : "",
  };
}

/**
 * Re-issue the file-listing query the panel makes on mount. Reload
 * is the only fully-public refresh affordance — the in-panel
 * RefreshCw icon button is unlabeled and would force selectors
 * brittle to lucide-react's rendering details.
 */
export async function refreshFileExplorer(page: Page): Promise<void> {
  await page.reload();
  await expect(fileExplorerRoot(page)).toBeVisible();
}
