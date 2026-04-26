import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Helpers for driving the workbench `FileExplorerPanel`. The panel
 * is the default occupant of the right slot on `/workbench` (key
 * `wb-right-panel: "files"`) and now exposes inline create / rename
 * / delete affordances, so specs can drive the full CRUD flow
 * through the UI without ever shelling out.
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
 *   - Mutating affordances (toolbar `+File`/`+Folder`, per-row
 *     pencil/trash buttons, the inline create/rename forms, and
 *     the write-error banner) all carry stable `data-testid`s so
 *     specs don't have to chase tailwind class churn.
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

// =============================================================================
// CRUD affordances (toolbar + per-row inline forms)
// =============================================================================

export function newFileButton(page: Page): Locator {
  return page.getByTestId("file-explorer-new-file");
}

export function newFolderButton(page: Page): Locator {
  return page.getByTestId("file-explorer-new-folder");
}

export function createForm(page: Page): Locator {
  return page.getByTestId("file-explorer-create-form");
}

export function createInput(page: Page): Locator {
  return page.getByTestId("file-explorer-create-input");
}

export function createSubmit(page: Page): Locator {
  return page.getByTestId("file-explorer-create-submit");
}

export function renameForm(page: Page): Locator {
  return page.getByTestId("file-explorer-rename-form");
}

export function renameInput(page: Page): Locator {
  return page.getByTestId("file-explorer-rename-input");
}

export function renameSubmit(page: Page): Locator {
  return page.getByTestId("file-explorer-rename-submit");
}

export function renameButton(page: Page, name: string): Locator {
  return page.getByTestId(`file-explorer-rename-${name}`);
}

export function deleteButton(page: Page, name: string): Locator {
  return page.getByTestId(`file-explorer-delete-${name}`);
}

export function deleteConfirmButton(page: Page, name: string): Locator {
  return page.getByTestId(`file-explorer-delete-confirm-${name}`);
}

export function writeErrorBanner(page: Page): Locator {
  return page.getByTestId("file-explorer-write-error");
}

export function uploadButton(page: Page): Locator {
  return page.getByTestId("file-explorer-upload");
}

export function uploadInput(page: Page): Locator {
  return page.getByTestId("file-explorer-upload-input");
}

/**
 * Drive the toolbar Upload affordance. Playwright's `setInputFiles`
 * works on the hidden `<input type=file>` directly, which fires the
 * same `onChange` handler the toolbar button would (we don't need to
 * actually click the button — clicking `<input type=file>` opens the
 * native picker, which Playwright cannot drive). The mutation
 * onSuccess refetches the listing, so callers can immediately assert
 * the new row appears.
 *
 * Each file is `{ name, contents }` where `contents` is either a
 * string or a Buffer; `setInputFiles` fabricates a real File object
 * with the right name + bytes so the multipart upload round-trips
 * end-to-end through `/api/workbench/files/upload`.
 */
export async function uploadFilesViaUI(
  page: Page,
  files: Array<{ name: string; contents: string | Buffer; mimeType?: string }>,
): Promise<void> {
  await uploadInput(page).setInputFiles(
    files.map((f) => ({
      name: f.name,
      mimeType: f.mimeType ?? "application/octet-stream",
      buffer: typeof f.contents === "string" ? Buffer.from(f.contents) : f.contents,
    })),
  );
}

export function fileRowContainer(page: Page, name: string): Locator {
  // Outer row container — carries the drag/drop handlers and a
  // stable testid keyed off the entry name. We anchor against this
  // (rather than the inner click-button returned by `fileRow`) when
  // dispatching HTML5 drag events so the events fire on the element
  // that actually has the listeners.
  return page.getByTestId(`file-explorer-row-${name}`);
}

export function parentRow(page: Page): Locator {
  return page.getByTestId("file-explorer-parent-row");
}

/**
 * Dispatch an HTML5 drag-and-drop sequence (dragstart → dragover →
 * drop) from `source` onto `target`, sharing a single DataTransfer
 * across the events so handlers that read `e.dataTransfer` see a
 * coherent payload. Playwright's built-in `locator.dragTo()`
 * synthesises mouse moves but does not fire HTML5 dnd events on
 * every browser, so the explicit dispatch is the reliable path.
 *
 * We skip the trailing `dragend` dispatch on purpose: a successful
 * drop in the FileExplorerPanel triggers a mutation whose
 * onSuccess refetches the listing and removes the dragged row from
 * the DOM, racing the dragend dispatch into a 60s wait-for-element
 * timeout. The component clears its drag state inside the same
 * mutation onSuccess / onError / rejectDrop paths, so omitting
 * dragend keeps the panel correct without the flake.
 *
 * The small yield between dispatches lets React 18 process the
 * setDraggedItem state update from `dragstart` before we fire the
 * follow-on dragover/drop — handlers are bound at render time, and
 * without the yield the drop handler sometimes still sees the
 * pre-dragstart `draggedItem === null` closure.
 */
export async function dragAndDrop(page: Page, source: Locator, target: Locator): Promise<void> {
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer: dt });
  await page.waitForTimeout(50);
  await target.dispatchEvent("dragover", { dataTransfer: dt });
  await target.dispatchEvent("drop", { dataTransfer: dt });
  await dt.dispose();
}

/**
 * Drive the `+File` toolbar: open the inline form, type the name,
 * submit, and wait for the form to close. The successful path also
 * auto-selects the newly-created file in the panel.
 */
export async function createFileViaUI(page: Page, name: string): Promise<void> {
  await newFileButton(page).click();
  const input = createInput(page);
  await expect(input).toBeVisible();
  await input.fill(name);
  await createSubmit(page).click();
  // The mutation onSuccess closes the form; wait for that as the
  // signal that the create round-tripped.
  await expect(createForm(page)).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Drive the `+Folder` toolbar — same shape as `createFileViaUI`,
 * but no auto-selection (directories are click-to-navigate).
 */
export async function createFolderViaUI(page: Page, name: string): Promise<void> {
  await newFolderButton(page).click();
  const input = createInput(page);
  await expect(input).toBeVisible();
  await input.fill(name);
  await createSubmit(page).click();
  await expect(createForm(page)).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Drive the per-row pencil button → inline rename form → submit.
 * We hover the row first so the hover-only pencil button becomes
 * visible (Playwright's `.click()` will scroll-and-click anyway,
 * but hovering keeps the visual state in sync if the spec dumps
 * a screenshot on failure).
 */
export async function renameViaUI(page: Page, fromName: string, toName: string): Promise<void> {
  await fileRow(page, fromName).hover();
  await renameButton(page, fromName).click();
  const input = renameInput(page);
  await expect(input).toBeVisible();
  await input.fill(toName);
  await renameSubmit(page).click();
  await expect(renameForm(page)).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Drive the per-row trash button → confirm-prompt → confirm. The
 * UI uses a two-click confirm to guard against fat-fingered
 * deletes; both clicks happen here so callers don't have to repeat
 * the testid.
 */
export async function deleteViaUI(page: Page, name: string): Promise<void> {
  await fileRow(page, name).hover();
  await deleteButton(page, name).click();
  await deleteConfirmButton(page, name).click();
  // The mutation onSuccess removes the row; wait on that signal so
  // the spec can immediately assert against a stable DOM.
  await expect(fileRow(page, name)).toHaveCount(0, { timeout: 10_000 });
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
