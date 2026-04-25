import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Helpers for driving the workbench `ShellPanel` component. The same
 * panel ships in two pages (`/workbench` and `/claude-workbench`) with
 * identical user-facing behavior, so the helpers take a `Page` and
 * locate elements relative to it instead of hard-coding either route.
 *
 * Layout reminders:
 *   - The shell input is the only `<input>` whose placeholder is
 *     "Enter command..." (or "Search history..." while a Ctrl-R search
 *     overlay is open).
 *   - The trash-can clear button has
 *     `title="Clear transcript and saved command history"`.
 *   - The reverse-i-search overlay has `data-testid="shell-reverse-search"`.
 */

export function shellInput(page: Page): Locator {
  return page.locator(
    'input[placeholder="Enter command..."], input[placeholder="Search history..."]',
  );
}

export function reverseSearchOverlay(page: Page): Locator {
  return page.getByTestId("shell-reverse-search");
}

export function clearShellHistoryButton(page: Page): Locator {
  return page.locator('button[title="Clear transcript and saved command history"]');
}

/**
 * Locator for a single transcript entry whose command exactly matches.
 *
 * The panel renders each entry as
 *   <div><span>$</span><span>{command}</span></div>
 *   (optional <pre>{stdout}</pre>)
 * so `getByText('$ <cmd>')` doesn't match — `$` and the command live in
 * separate spans. We instead match the inner command span (which is
 * unique to each row, the only place the verbatim command string is
 * rendered) by exact text.
 */
export function transcriptEntry(page: Page, command: string): Locator {
  return page.locator(`span:text-is("${command.replace(/"/g, '\\"')}")`);
}

/**
 * Type a command into the shell input, press Enter, and wait for the
 * server response to land in the transcript.
 */
export async function runShellCommand(page: Page, command: string, expectedStdout?: string): Promise<void> {
  const input = shellInput(page);
  await expect(input).toBeVisible();
  await input.click();
  await input.fill(command);
  await input.press("Enter");
  // Wait until the command appears in the transcript.
  await expect(transcriptEntry(page, command).first()).toBeVisible();
  if (expectedStdout !== undefined) {
    await expect(page.getByText(expectedStdout, { exact: false }).first()).toBeVisible();
  }
  // Wait for the input to be re-enabled (the panel sets `disabled`
  // while the mutation is in flight) so the next command isn't sent
  // into a still-pending request.
  await expect(input).toBeEnabled();
  // Re-focus for the next interaction; running a command blurs the
  // input on slower machines.
  await input.focus();
}
