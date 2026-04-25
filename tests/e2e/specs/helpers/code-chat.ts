import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Helpers for driving the workbench `CodeChatPanel`. The panel is
 * the default occupant of the left slot on `/workbench` (key
 * `wb-left-panel: "code-chat"`), so specs only need to login +
 * navigate there.
 *
 * Selector reminders:
 *   - The send-prompt textarea has a verbatim placeholder of
 *     `"Ask about code... (Enter to send, Shift+Enter for newline)"`.
 *     Anchoring by `^="Ask about code..."` keeps the selector
 *     resilient to copy tweaks.
 *   - Messages are rendered as `<pre>` blocks inside the message
 *     bubbles. Asserting on substring text inside the panel is the
 *     simplest way to verify chunks landed.
 *   - The "AI not configured" branch surfaces an inline "Open Env
 *     Vars panel" button — useful for sanity-checking the error
 *     pathway without running through the env panel deep-link.
 */

export function chatTextarea(page: Page): Locator {
  return page.locator('textarea[placeholder^="Ask about code..."]');
}

export function chatTranscript(page: Page): Locator {
  // The messages container is the only `[ref=scrollRef]` div in the
  // panel that has class `flex-1 overflow-y-auto p-3`. We don't have
  // a testid, so anchor to a known descendant: every message bubble
  // renders a `<pre>` with `font-mono leading-relaxed`.
  return page.locator("div.flex-1.overflow-y-auto.p-3").first();
}

/**
 * Type a prompt + press Enter. The panel sends on Enter (without
 * Shift) and clears the textarea on submit, so we can resolve once
 * the textarea is empty again.
 */
export async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const ta = chatTextarea(page);
  await expect(ta).toBeVisible();
  await ta.click();
  await ta.fill(prompt);
  await ta.press("Enter");
  // The panel clears `input` on submit — wait for that so the spec
  // doesn't race the network.
  await expect(ta).toHaveValue("");
}
