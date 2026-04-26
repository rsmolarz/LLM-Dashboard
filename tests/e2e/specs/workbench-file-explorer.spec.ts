import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { loginAsFixtureUser } from "./helpers/auth";
import {
  fileExplorerRoot,
  fileRow,
  fileRowContainer,
  parentRow,
  selectedFileHeader,
  fileContentBody,
  refreshFileExplorer,
  createFileViaUI,
  createFolderViaUI,
  renameViaUI,
  deleteViaUI,
  dragAndDrop,
  newFileButton,
  createInput,
  createSubmit,
  writeErrorBanner,
  uploadButton,
  uploadFilesViaUI,
} from "./helpers/file-explorer";

/**
 * End-to-end coverage for the workbench `FileExplorerPanel`. The
 * panel now exposes inline create / rename / delete affordances on
 * the per-user scratch dir, so this spec exercises the full CRUD
 * loop through the UI alone — no shell side-effects.
 *
 *   * create — `+File` toolbar opens the inline form, the new file
 *     auto-selects in the viewer.
 *   * rename — per-row pencil opens the inline rename form, the
 *     viewer's open-file header tracks the new name.
 *   * delete — per-row trash → confirm prompt removes the row and
 *     clears the viewer when the open file goes away.
 *   * folders — `+Folder` creates a directory; clicking it
 *     navigates in, and the breadcrumb gains a second crumb.
 *   * guards — duplicate names raise the inline write-error
 *     banner without throwing the row away.
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

  test("creates, renames, and deletes a file entirely through the UI", async ({ page }) => {
    const tag = randomBytes(4).toString("hex");
    const fileName = `e2e-${tag}.txt`;
    const renamedName = `renamed-${tag}.txt`;

    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();

    // C: drive the +File toolbar. The mutation auto-selects the
    // new file, so the viewer header should switch to it.
    await createFileViaUI(page, fileName);
    await expect(fileRow(page, fileName)).toBeVisible({ timeout: 10_000 });
    await expect(selectedFileHeader(page, fileName)).toBeVisible();
    // A freshly-created file is zero bytes; the viewer renders the
    // empty body without crashing. We just assert the row + header
    // are wired up — content assertions are covered below where
    // the file actually has bytes.

    // U: drive the inline rename form via the per-row pencil. The
    // mutation onSuccess updates `selectedFile`, so the viewer
    // header tracks the new name.
    await renameViaUI(page, fileName, renamedName);
    await expect(fileRow(page, renamedName)).toBeVisible();
    await expect(fileRow(page, fileName)).toHaveCount(0);
    await expect(selectedFileHeader(page, renamedName)).toBeVisible();

    // D: drive the per-row trash → confirm prompt. The mutation
    // onSuccess clears the viewer when the open file is removed.
    await deleteViaUI(page, renamedName);
    await expect(fileRow(page, renamedName)).toHaveCount(0);
    await expect(selectedFileHeader(page, renamedName)).toHaveCount(0);
  });

  test("creates a folder, navigates into it, and creates a child file inside", async ({ page }) => {
    const tag = randomBytes(4).toString("hex");
    const dirName = `e2e-dir-${tag}`;
    const childName = `child-${tag}.txt`;

    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();

    // Create a directory at the root.
    await createFolderViaUI(page, dirName);
    const dirRow = fileRow(page, dirName);
    await expect(dirRow).toBeVisible({ timeout: 10_000 });

    // Navigate in: the breadcrumb gains a second crumb matching
    // the directory name.
    await dirRow.click();
    const dirCrumb = page.locator("button", { hasText: new RegExp(`^${dirName}$`) }).first();
    await expect(dirCrumb).toBeVisible();

    // Inside the new dir, create a child file via the same +File
    // toolbar. The new file auto-selects so the viewer header
    // must render the nested path.
    await createFileViaUI(page, childName);
    await expect(fileRow(page, childName)).toBeVisible();
    await expect(selectedFileHeader(page, `${dirName}/${childName}`)).toBeVisible();

    // Walk back up to the root via the "root" crumb; the dir row
    // should still be visible (the panel re-fetches on path
    // change so we don't need an explicit reload).
    await fileExplorerRoot(page).click();
    await expect(fileRow(page, dirName)).toBeVisible();

    // Delete the directory from the root listing — the trash
    // affordance handles non-empty dirs by recursive-rm, matching
    // the existing scratch-delete semantics.
    await deleteViaUI(page, dirName);
    await expect(fileRow(page, dirName)).toHaveCount(0);
  });

  test("uploads a file via the toolbar Upload button and lists the new row", async ({ page }) => {
    const tag = randomBytes(4).toString("hex");
    const name = `upload-${tag}.txt`;
    const body = `hello-from-upload-${tag}`;

    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();

    // The Upload toolbar button is gated on `canWrite` (scratch mode,
    // not in a shared subfolder). On the default panel mount we land
    // at the scratch root, so the button must be available.
    await expect(uploadButton(page)).toBeVisible();

    await uploadFilesViaUI(page, [{ name, contents: body }]);

    // Mutation onSuccess refetches the listing — the new row should
    // appear without any manual refresh.
    await expect(fileRow(page, name)).toBeVisible({ timeout: 10_000 });

    // Selecting the row should display the bytes we uploaded; this
    // is the most direct end-to-end signal that the multipart route
    // wrote the right contents (not just an empty placeholder).
    await fileRow(page, name).click();
    await expect(selectedFileHeader(page, name)).toBeVisible();
    await expect(fileContentBody(page)).toContainText(body);

    // Cleanup so a flaky retry doesn't run into EEXIST.
    await deleteViaUI(page, name);
  });

  test("uploads a multi-file batch and lists every new row", async ({ page }) => {
    const tag = randomBytes(4).toString("hex");
    const a = `upload-a-${tag}.txt`;
    const b = `upload-b-${tag}.bin`;

    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();

    await uploadFilesViaUI(page, [
      { name: a, contents: "alpha" },
      { name: b, contents: Buffer.from([1, 2, 3, 4]) },
    ]);

    await expect(fileRow(page, a)).toBeVisible({ timeout: 10_000 });
    await expect(fileRow(page, b)).toBeVisible();

    await refreshFileExplorer(page);
    await deleteViaUI(page, a);
    await deleteViaUI(page, b);
  });

  test("surfaces a duplicate-upload error in the inline write-error banner", async ({ page }) => {
    const tag = randomBytes(4).toString("hex");
    const name = `dup-upload-${tag}.txt`;

    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();

    // First upload succeeds and the row appears.
    await uploadFilesViaUI(page, [{ name, contents: "first" }]);
    await expect(fileRow(page, name)).toBeVisible({ timeout: 10_000 });

    // Re-uploading the same name (no overwrite flag from the picker)
    // hits the create-style EEXIST guard. The route returns 409 and
    // the panel must surface it through the same write-error banner
    // the +File flow uses, so the user sees a concrete reason
    // instead of a silent failure.
    await uploadFilesViaUI(page, [{ name, contents: "second" }]);
    await expect(writeErrorBanner(page)).toBeVisible({ timeout: 10_000 });
    await expect(writeErrorBanner(page)).toContainText(/already exists/i);

    // The original row must still be there with its original bytes;
    // the failed second upload must not have clobbered it.
    await fileRow(page, name).click();
    await expect(fileContentBody(page)).toContainText("first");

    await refreshFileExplorer(page);
    await deleteViaUI(page, name);
  });

  test("moves a file into a folder via drag-and-drop and tracks the open viewer", async ({ page }) => {
    const tag = randomBytes(4).toString("hex");
    const fileName = `e2e-move-${tag}.txt`;
    const dirName = `dir-${tag}`;

    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();

    // Set up the source file + destination folder at the scratch
    // root. The create flow auto-selects the file in the viewer, so
    // the moved-file header assertion below has a known starting
    // state.
    await createFolderViaUI(page, dirName);
    await createFileViaUI(page, fileName);
    await expect(fileRow(page, fileName)).toBeVisible();
    await expect(fileRow(page, dirName)).toBeVisible();
    await expect(selectedFileHeader(page, fileName)).toBeVisible();

    // Drag the file row onto the folder row. The mutation onSuccess
    // refetches the listing AND retargets `selectedFile`, so the
    // file disappears from the root listing and the viewer header
    // updates to the nested path in a single round-trip.
    await dragAndDrop(page, fileRowContainer(page, fileName), fileRowContainer(page, dirName));
    await expect(fileRow(page, fileName)).toHaveCount(0, { timeout: 10_000 });
    await expect(selectedFileHeader(page, `${dirName}/${fileName}`)).toBeVisible();

    // Walk into the folder and confirm the moved file is present
    // under its new parent. Navigating into a directory clears the
    // viewer selection (handleClick → setSelectedFile(null)) so we
    // re-select the file here; otherwise the move-tracking onSuccess
    // hook would have nothing to retarget and the header assertion
    // below would never resolve.
    await fileRow(page, dirName).click();
    await expect(fileRow(page, fileName)).toBeVisible();
    await fileRow(page, fileName).click();
    await expect(selectedFileHeader(page, `${dirName}/${fileName}`)).toBeVisible();

    // Drop the file onto the `..` row to move it back to the root.
    // The header tracks the new (root) path the same way. We
    // intentionally don't navigate back to the root + delete the
    // file/folder here because that would push us over the global
    // 10/min `/api` rate limit (each scratch mutation triggers a
    // refetch). The file/dir use a random tag so leftover scratch
    // entries don't collide between runs.
    await dragAndDrop(page, fileRowContainer(page, fileName), parentRow(page));
    await expect(fileRow(page, fileName)).toHaveCount(0, { timeout: 10_000 });
    await expect(selectedFileHeader(page, fileName)).toBeVisible();
  });

  test("rejects a drag-drop onto a shared folder with the inline error banner", async ({ page }) => {
    const tag = randomBytes(4).toString("hex");
    const fileName = `e2e-drop-shared-${tag}.txt`;

    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();

    await createFileViaUI(page, fileName);
    await expect(fileRow(page, fileName)).toBeVisible();

    // The scratch root mirrors the host workspace via top-level
    // symlinks; `artifacts/` is one of them and is flagged
    // `privacy: "shared"` by the listing endpoint. A drop onto a
    // shared folder must surface the same inline write-error banner
    // the create/rename flow uses, without round-tripping to the
    // server.
    const sharedTarget = fileRowContainer(page, "artifacts");
    await expect(sharedTarget).toBeVisible();
    await dragAndDrop(page, fileRowContainer(page, fileName), sharedTarget);
    await expect(writeErrorBanner(page)).toBeVisible({ timeout: 10_000 });
    await expect(writeErrorBanner(page)).toContainText(/shared/i);
    // The source file must still be at the root (the move was
    // refused before any PATCH was issued).
    await expect(fileRow(page, fileName)).toBeVisible();

    await deleteViaUI(page, fileName);
  });

  test("displays a clear error when creating a duplicate file name", async ({ page }) => {
    const tag = randomBytes(4).toString("hex");
    const name = `dup-${tag}.txt`;

    await page.goto("/workbench");
    await expect(fileExplorerRoot(page)).toBeVisible();

    // First create succeeds and closes the form.
    await createFileViaUI(page, name);
    await expect(fileRow(page, name)).toBeVisible();

    // Second create with the same name surfaces the inline error
    // banner (EEXIST → 409). The form stays open so the user can
    // adjust the name without reopening the toolbar.
    await newFileButton(page).click();
    await createInput(page).fill(name);
    await createSubmit(page).click();
    await expect(writeErrorBanner(page)).toBeVisible({ timeout: 10_000 });
    await expect(writeErrorBanner(page)).toContainText(/already exists/i);
    await expect(fileRow(page, name)).toHaveCount(1);

    // Cleanup so the scratch dir doesn't accumulate debris across
    // a flaky retry — refresh first to drop the open form.
    await refreshFileExplorer(page);
    await deleteViaUI(page, name);
  });
});
