import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { loginAsFixtureUser } from "./helpers/auth";
import {
  fileExplorerRoot,
  fileRow,
  selectedFileHeader,
  fileContentBody,
  runScratchShell,
  refreshFileExplorer,
} from "./helpers/file-explorer";

/**
 * End-to-end coverage for the workbench `FileExplorerPanel`. The
 * panel is read-only from the UI's perspective (no inline create /
 * delete affordances), so the spec drives the C/U/D side of the
 * CRUD flow through the per-user shell endpoint and verifies the R
 * side end-to-end:
 *
 *   * list — the initial mount fetches `/api/workbench/files?path=.`
 *     and renders one row per entry. Asserting the breadcrumb
 *     "root" plus our newly-created scratch file proves the round
 *     trip works.
 *   * view — clicking a file row swaps the right pane to show its
 *     contents, fetched via `/api/workbench/file-content`.
 *   * update — overwriting the file via the shell + a re-click
 *     proves the content viewer doesn't cache stale bytes past a
 *     selection toggle.
 *   * delete — `rm`ing the file from the shell and reloading
 *     proves the listing reflects deletes.
 *
 * The fixture user is unique per spec (`e2e_fexpl_*`) so deletes
 * don't race other tests' setup.
 */

let userId: string;

test.describe("Workbench file explorer CRUD", () => {
  test.beforeEach(async ({ context, request }) => {
    userId = `e2e_fexpl_${randomBytes(4).toString("hex")}`;
    await loginAsFixtureUser(request, context, userId);
    // The right slot already defaults to "files" and the path
    // defaults to "." — and a freshly-minted Playwright context
    // starts with empty localStorage, so we don't need to scrub
    // stale state. We DO pin the right panel explicitly so a
    // future default change doesn't silently break the test.
    await context.addInitScript(() => {
      try {
        localStorage.setItem("wb-right-panel", JSON.stringify("files"));
      } catch {}
    });
  });

  test("creates, reads, updates, and deletes a file via shell + UI", async ({ page, request }) => {
    const tag = randomBytes(4).toString("hex");
    const fileName = `e2e-${tag}.txt`;
    const initialContent = `hello-from-${tag}`;
    const updatedContent = `goodbye-from-${tag}`;

    // C: create the file in the user's scratch dir.
    const createRes = await runScratchShell(request, `printf '%s' '${initialContent}' > ${fileName}`);
    expect(createRes.exitCode, "shell create should succeed").toBe(0);

    // R (list): the file explorer mounts, hits /files, and the row
    // appears.
    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();
    await expect(fileRow(page, fileName)).toBeVisible({ timeout: 10_000 });

    // R (view): clicking the row selects the file and the viewer
    // loads its bytes through /file-content.
    await fileRow(page, fileName).click();
    await expect(selectedFileHeader(page, fileName)).toBeVisible();
    await expect(fileContentBody(page)).toContainText(initialContent);

    // U: rewrite the file from the shell. The file-content query
    // is keyed by `selectedFile` (and TanStack caches it), so a
    // simple shell-write doesn't invalidate the in-memory copy.
    // Force a fresh fetch by deselecting (click "root" breadcrumb)
    // then re-selecting the row — that toggles the query key and
    // re-issues `/api/workbench/file-content`.
    const updateRes = await runScratchShell(request, `printf '%s' '${updatedContent}' > ${fileName}`);
    expect(updateRes.exitCode, "shell update should succeed").toBe(0);
    await fileExplorerRoot(page).click();
    await fileRow(page, fileName).click();
    await expect(selectedFileHeader(page, fileName)).toBeVisible();
    await expect(fileContentBody(page)).toContainText(updatedContent);
    // The pre-update bytes must NOT be visible after the re-fetch.
    await expect(fileContentBody(page)).not.toContainText(initialContent);

    // D: rm the file. Reload to invalidate the directory listing
    // cache + assert the row is gone.
    const deleteRes = await runScratchShell(request, `rm ${fileName}`);
    expect(deleteRes.exitCode, "shell delete should succeed").toBe(0);
    await refreshFileExplorer(page);
    await expect(fileRow(page, fileName)).toHaveCount(0);
  });

  test("navigates into a subdirectory and back via the breadcrumb", async ({ page, request }) => {
    const tag = randomBytes(4).toString("hex");
    const dirName = `e2e-dir-${tag}`;
    const childName = `child-${tag}.txt`;
    const childContent = `inside-${tag}`;

    await runScratchShell(request, `mkdir -p ${dirName} && printf '%s' '${childContent}' > ${dirName}/${childName}`);

    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();

    // The directory row appears at the root listing.
    const dirRow = fileRow(page, dirName);
    await expect(dirRow).toBeVisible({ timeout: 10_000 });
    await dirRow.click();

    // After navigating in, the breadcrumb gains a second crumb
    // matching the directory name.
    const dirCrumb = page.locator("button", { hasText: new RegExp(`^${dirName}$`) }).first();
    await expect(dirCrumb).toBeVisible();
    await expect(fileRow(page, childName)).toBeVisible();

    // Open the child file — viewer swaps in.
    await fileRow(page, childName).click();
    await expect(fileContentBody(page)).toContainText(childContent);

    // Click the "root" breadcrumb to walk back up; the directory
    // row should be visible again.
    await fileExplorerRoot(page).click();
    await expect(fileRow(page, dirName)).toBeVisible();

    // Cleanup so the spec doesn't leave debris in the per-user
    // scratch dir.
    await runScratchShell(request, `rm -rf ${dirName}`);
  });
});
