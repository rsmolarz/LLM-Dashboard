import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { loginAsFixtureUser } from "./helpers/auth";
import {
  fillSshConfig,
  sshConnectButton,
  sshConnectedBadge,
  sshModeTab,
  sshAITextarea,
  sendSshAIPrompt,
} from "./helpers/ssh-panel";
import { fulfillSse, assertEncodableEvents } from "./helpers/sse";

/**
 * End-to-end coverage for the workbench SSH AI chat (`/ssh/ai-chat`).
 * Both the SSH-test endpoint and the AI chat endpoint are mocked
 * because (a) we don't have a real VPS to dial out to from the
 * Playwright runner, and (b) the AI chat endpoint streams from
 * Anthropic upstream which we don't want to rely on in CI.
 *
 * Flow under test:
 *   1. Pin the SSH panel into the right slot.
 *   2. Pre-set `wb-ssh-mode` to "ai" so the panel lands directly on
 *      the AI tab once `connected` flips true.
 *   3. Fill the connection form, click Connect — `/ssh/test` is
 *      mocked to return success, which trips the panel's
 *      `connected` state.
 *   4. Send an AI prompt; assert the streamed text + the
 *      "command" + "command_result" frames render in the transcript.
 */

test.describe("Workbench SSH AI chat", () => {
  test.beforeEach(async ({ context, request }) => {
    const userId = `e2e_sshai_${randomBytes(4).toString("hex")}`;
    await loginAsFixtureUser(request, context, userId);
    await context.addInitScript(() => {
      try {
        localStorage.setItem("wb-right-panel", JSON.stringify("ssh"));
        localStorage.setItem("wb-ssh-mode", JSON.stringify("ai"));
        localStorage.removeItem("wb-ssh-history");
        localStorage.removeItem("wb-ssh-cmds");
        localStorage.removeItem("wb-ssh-ai-messages");
        // No selected project — keeps the AI textarea on its
        // canonical "Ask AI to run commands, or attach files..."
        // placeholder so our selector matches.
        localStorage.removeItem("workbench-selected-project");
      } catch {}
    });
  });

  test("connects, switches to AI mode, and streams a tool-using reply", async ({ page }) => {
    const tag = randomBytes(3).toString("hex");
    const host = "10.0.0.99";
    const username = `e2e_${tag}`;
    const prompt = `Show me the disk usage on /var (#${tag})`;
    const replyText = `I'll run df for you, tagged ${tag}.`;
    const cmd = "df -h /var";
    const stdout = "Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        40G   12G   26G  32% /";

    // Mock /ssh/test — the panel's `testMutation` POSTs to this and
    // flips `connected` to true on a 200 with `{ ok: true }`.
    await page.route("**/api/workbench/ssh/test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, output: "uid=0(root)" }),
      });
    });

    // Mock /ssh/ai-chat with a multi-frame SSE stream covering the
    // text / command / command_result / done events the panel
    // branches on. (`tool_error` is a separate code path not
    // exercised here.)
    const events = [
      { type: "text", content: replyText },
      { type: "command", command: cmd },
      { type: "command_result", command: cmd, stdout, stderr: "", exitCode: 0 },
      { type: "done" },
    ];
    assertEncodableEvents(events);

    let captured: { body: any } | null = null;
    await page.route("**/api/workbench/ssh/ai-chat", async (route) => {
      const raw = route.request().postData() || "";
      try { captured = { body: JSON.parse(raw) }; } catch { captured = { body: raw }; }
      await fulfillSse(route, events);
    });

    await page.goto("/workbench");
    // The SSH panel is pinned via localStorage; wait for its
    // header to render before driving the form.
    await expect(page.locator('span.font-mono:text-is("SSH")').first()).toBeVisible({ timeout: 10_000 });

    // The connection-config form is visible by default before the
    // first connect, so the inputs should be ready.
    await fillSshConfig(page, { host, username, password: "hunter2" });

    // Click Connect — the connected state is the source of truth
    // here (waitForResponse flakes when the SSH panel is co-mounted
    // with the code-chat panel and they race on hot-reload).
    await sshConnectButton(page).click();

    // The connected badge should appear in the header once the
    // testMutation succeeds.
    await expect(sshConnectedBadge(page, username, host)).toBeVisible({ timeout: 15_000 });

    // The AI tab is pre-selected via localStorage; the AI textarea
    // becomes visible once `connected` is true.
    await expect(sshModeTab(page, "AI")).toBeVisible();
    await expect(sshAITextarea(page)).toBeVisible();

    // Send the AI prompt — the panel POSTs /ssh/ai-chat which our
    // SSE mock fulfills with text + a command + a command_result.
    await sendSshAIPrompt(page, prompt);

    // Assert the assistant's text rendered. The reply contains a
    // unique per-test tag, so a page-wide text match is enough.
    await expect(page.getByText(replyText)).toBeVisible({ timeout: 10_000 });
    // The command line is rendered inside a `<code>` block that
    // shows the verbatim command text.
    await expect(page.locator(`code:has-text("${cmd}")`).first()).toBeVisible();
    // The command_result stdout lands in a `<pre>` block alongside
    // the command box.
    await expect(page.locator("pre", { hasText: "Filesystem" }).first()).toBeVisible();
    // The "ok" badge replaces the spinner once exitCode === 0 lands.
    await expect(page.locator('span:text-is("ok")').first()).toBeVisible();

    // The panel posted the prompt body — sanity-check we wired the
    // right host/username through.
    expect(captured, "the panel must have hit /api/workbench/ssh/ai-chat").not.toBeNull();
    expect(captured!.body).toMatchObject({
      prompt,
      host,
      username,
    });
  });
});
