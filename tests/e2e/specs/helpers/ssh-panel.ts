import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Helpers for driving the workbench `SSHPanel`. The panel is NOT
 * mounted by default in any slot (the layout's defaults are
 * `code-chat` / `files` / `shell` / `git`), so specs must pin it
 * into a slot via localStorage before navigating, e.g.:
 *
 *   await context.addInitScript(() => {
 *     localStorage.setItem("wb-right-panel", JSON.stringify("ssh"));
 *     localStorage.setItem("wb-ssh-mode", JSON.stringify("ai"));
 *   });
 *
 * Selector reminders:
 *   - The connection-config form is hidden until the user clicks
 *     the Key icon, OR is shown by default before the first
 *     successful connect. The form lives inside a `<div>` with
 *     class `p-3 border-b border-[#313244] bg-[#181825]/50`.
 *   - The Host / Username / Password inputs match by placeholder
 *     ("192.168.1.100", "root", "••••••••" — the bullet glyph is
 *     U+2022).
 *   - The mode tabs are three small buttons with the visible labels
 *     "Terminal" / "AI" / "Files". They only appear once `connected`
 *     flips true.
 *   - The AI textarea placeholder varies depending on attached
 *     files / project context. Default state (no project, no
 *     attachments) uses "Ask AI to run commands, or attach files...".
 */

export function sshHostInput(page: Page): Locator {
  return page.locator('input[placeholder="192.168.1.100"]');
}
export function sshUsernameInput(page: Page): Locator {
  return page.locator('input[placeholder="root"]');
}
export function sshPasswordInput(page: Page): Locator {
  return page.locator('input[placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"]');
}

export function sshConnectButton(page: Page): Locator {
  // The connect button reads "Connect" (with a Server icon) when
  // idle, or "Connecting..." (with a spinner) while pending. The
  // rendered textContent has surrounding whitespace from the JSX
  // formatting (`<><Server /> Connect</>`), so we anchor on a
  // loose substring + scope to the per-panel SSH config form to
  // avoid colliding with unrelated buttons.
  return page.locator("button", { hasText: /Connect/ }).filter({ hasNotText: /Code|chat/i }).first();
}

export function sshConnectedBadge(page: Page, username: string, host: string): Locator {
  // The connected badge is `<span>{username}@{host}</span>` inside
  // the panel header.
  return page.locator(`span:text-is("${username}@${host}")`);
}

export function sshModeTab(page: Page, label: "Terminal" | "AI" | "Files"): Locator {
  // The mode tabs are three small `<button>` elements rendered
  // inline in the header, all with `text-[9px]` and exact label
  // text. Match by exact text to avoid colliding with similarly-
  // named labels elsewhere on the page (e.g. the panel selector
  // already prints "SSH" but never "Terminal" / "AI" / "Files"
  // alone).
  return page.locator("button", { hasText: new RegExp(`^${label}$`) }).first();
}

export function sshAITextarea(page: Page): Locator {
  return page.locator(
    'textarea[placeholder="Ask AI to run commands, or attach files..."], textarea[placeholder^="Ask AI ("], textarea[placeholder^="Ask about the uploaded files"]',
  );
}

export async function fillSshConfig(page: Page, opts: { host: string; username: string; password: string }): Promise<void> {
  await sshHostInput(page).fill(opts.host);
  await sshUsernameInput(page).fill(opts.username);
  // Default authType is "password" and the password input is the
  // only `[type=password]` rendered when "password" is active.
  await sshPasswordInput(page).fill(opts.password);
}

export async function sendSshAIPrompt(page: Page, prompt: string): Promise<void> {
  const ta = sshAITextarea(page);
  await expect(ta).toBeVisible();
  await ta.click();
  await ta.fill(prompt);
  await ta.press("Enter");
  // The panel clears `aiInput` on submit.
  await expect(ta).toHaveValue("");
}
