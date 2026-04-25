import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { loginAsFixtureUser, clearShellHistory } from "./helpers/auth";
import {
  shellInput,
  reverseSearchOverlay,
  clearShellHistoryButton,
  runShellCommand,
  transcriptEntry,
} from "./helpers/shell-panel";

// Both pages render the same `ShellPanel` component with the same
// behavior. The tests are parameterised so a regression in either
// (Workbench / ClaudeWorkbench) shows up as a separate failure with
// its own page URL in the report.
const PAGES = [
  { label: "Workbench", path: "/workbench" },
  { label: "ClaudeWorkbench", path: "/claude-workbench" },
] as const;

for (const target of PAGES) {
  test.describe(`${target.label} shell history persistence`, () => {
    let userId: string;

    test.beforeEach(async ({ context, request }) => {
      // A fresh user per test prevents two specs that race the same
      // fixture from polluting each other's history.
      userId = `e2e_${randomBytes(4).toString("hex")}`;
      await loginAsFixtureUser(request, context, userId);
      await clearShellHistory(request);
      // Wipe the shell panel's localStorage cache too — the panel only
      // overwrites the cache when the server returns a non-empty list,
      // so leftover values from a previous spec would otherwise satisfy
      // the up-arrow assertion without ever exercising the hydrate.
      //
      // Also flip `*-show-bottom` to true and pin the bottom panel to
      // "shell" so the ShellPanel actually renders (both pages collapse
      // their bottom dock by default and remember whatever tab the
      // user last picked).
      await context.addInitScript(() => {
        try {
          window.localStorage.removeItem("wb-shell-history");
          window.localStorage.removeItem("wb-shell-cmds");
          window.localStorage.removeItem("cw-shell-history");
          window.localStorage.removeItem("cw-shell-cmds");
          window.localStorage.setItem("wb-show-bottom", "true");
          window.localStorage.setItem("cw-show-bottom", "true");
          window.localStorage.setItem("wb-bottom-panel", JSON.stringify("shell"));
          window.localStorage.setItem("cw-bottom-panel", JSON.stringify("shell"));
        } catch {}
      });
    });

    test("hydrates from server, walks up-arrow, and survives reload", async ({ page }) => {
      // Run three commands so we have something to walk through.
      await page.goto(target.path);
      await expect(shellInput(page)).toBeVisible();
      await runShellCommand(page, "echo first", "first");
      await runShellCommand(page, "echo second", "second");
      await runShellCommand(page, "echo third", "third");

      // Reload — the in-memory React state is gone, the panel's
      // `useEffect` must re-fetch `/api/workbench/shell-history` and
      // re-populate the up-arrow walk.
      await page.reload();
      await expect(shellInput(page)).toBeVisible();
      // Wait for hydrate to complete: the request fires once on mount
      // and the list returned is `["echo third", "echo second",
      // "echo first"]`. We can't observe localStorage directly without
      // an evaluation step because the panel only re-renders on user
      // input, but pressing ArrowUp drives directly through the cache,
      // so we let the assertion below be the implicit sync.
      await expect.poll(async () => {
        return await page.evaluate(() => {
          try {
            const wb = JSON.parse(localStorage.getItem("wb-shell-cmds") || "[]");
            const cw = JSON.parse(localStorage.getItem("cw-shell-cmds") || "[]");
            return [...wb, ...cw][0] || "";
          } catch {
            return "";
          }
        });
      }, { timeout: 10_000, message: "shell history should hydrate from server" }).toBe("echo third");

      const input = shellInput(page);
      await input.click();
      await input.press("ArrowUp");
      await expect(input).toHaveValue("echo third");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("echo second");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("echo first");
      // ArrowDown walks back toward the most-recent / empty.
      await input.press("ArrowDown");
      await expect(input).toHaveValue("echo second");
      // Esc-clear input by selecting and deleting before next test step.
      await input.press("Escape");
    });

    test("Ctrl-R reverse search shows the matching command and Enter runs it", async ({ page, browserName }) => {
      await page.goto(target.path);
      await expect(shellInput(page)).toBeVisible();
      // Use distinct, easily-findable substrings.
      const tag = randomBytes(3).toString("hex");
      await runShellCommand(page, `echo apple-${tag}`, `apple-${tag}`);
      await runShellCommand(page, `echo banana-${tag}`, `banana-${tag}`);
      await runShellCommand(page, `echo cherry-${tag}`, `cherry-${tag}`);

      const input = shellInput(page);
      await input.click();
      // The shell panel listens for `Control+R` OR `Meta+R`. WebKit on
      // macOS reserves Cmd-R for reload, so we always use Control here.
      await input.press("Control+r");
      const overlay = reverseSearchOverlay(page);
      await expect(overlay).toBeVisible();
      // Type a substring that uniquely matches the second command.
      await input.fill(`banana-${tag}`);
      await expect(overlay).toContainText(`(reverse-i-search)\`banana-${tag}'`);
      await expect(overlay).toContainText(`echo banana-${tag}`);

      // Pressing Enter while the overlay is open accepts the highlighted
      // match and runs it as a real command (not the typed query).
      await input.press("Enter");
      // The transcript already contains one `echo banana-${tag}` row
      // from the seeding step, so we expect exactly two now.
      await expect(transcriptEntry(page, `echo banana-${tag}`)).toHaveCount(2);
      // The overlay closes after Enter.
      await expect(overlay).toBeHidden();
      // Sanity: the input is empty again (the panel resets `input`
      // inside `runCommand`).
      await expect(input).toHaveValue("");
      // Use browserName to keep the lint happy and record which engine
      // exercised this path in the report metadata.
      expect(["chromium", "firefox", "webkit"]).toContain(browserName);
    });

    test("Esc cancels the reverse-search overlay without running anything", async ({ page }) => {
      await page.goto(target.path);
      await runShellCommand(page, "echo only-once");
      const input = shellInput(page);
      await input.click();
      await input.press("Control+r");
      await expect(reverseSearchOverlay(page)).toBeVisible();
      await input.fill("only-once");
      await expect(reverseSearchOverlay(page)).toContainText("echo only-once");
      await input.press("Escape");
      await expect(reverseSearchOverlay(page)).toBeHidden();
      // Still exactly one transcript line — Esc must NOT run the match.
      await expect(transcriptEntry(page, "echo only-once")).toHaveCount(1);
    });

    test("Tab accepts the reverse-search match into the input without running it", async ({ page }) => {
      await page.goto(target.path);
      await runShellCommand(page, "echo accept-with-tab");
      const input = shellInput(page);
      await input.click();
      await input.press("Control+r");
      await input.fill("accept-with-tab");
      await expect(reverseSearchOverlay(page)).toContainText("echo accept-with-tab");
      await input.press("Tab");
      await expect(reverseSearchOverlay(page)).toBeHidden();
      await expect(input).toHaveValue("echo accept-with-tab");
      // Tab must NOT have run the command — still exactly one in
      // transcript from the seeding step.
      await expect(transcriptEntry(page, "echo accept-with-tab")).toHaveCount(1);
    });

    test("trash icon clears server history; next reload comes back empty", async ({ page, request }) => {
      await page.goto(target.path);
      await runShellCommand(page, "echo will-be-cleared", "will-be-cleared");
      await runShellCommand(page, "echo also-cleared", "also-cleared");

      // Sanity: server has the rows before we click clear.
      const beforeRes = await request.get(`/api/workbench/shell-history?limit=50`);
      expect(beforeRes.status()).toBe(200);
      const beforeBody = await beforeRes.json();
      const beforeCmds: string[] = (beforeBody.history || []).map((h: any) => h.command);
      expect(beforeCmds).toContain("echo will-be-cleared");

      const clearBtn = clearShellHistoryButton(page);
      await expect(clearBtn).toBeVisible();
      // The panel fires `DELETE /api/workbench/shell-history` from
      // `clearAll`; wait for that response to make sure the click
      // actually round-tripped before we reload.
      await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes("/api/workbench/shell-history") && res.request().method() === "DELETE" && res.status() === 200,
        ),
        clearBtn.click(),
      ]);

      // Reload and assert: the panel's hydrate fetch returns an empty
      // list, so localStorage stays empty (the panel only overwrites
      // the cache on a non-empty server response — but we wiped the
      // cache in `clearAll` too) and ArrowUp leaves the input blank.
      await page.reload();
      await expect(shellInput(page)).toBeVisible();
      // Confirm server side is empty too.
      const afterRes = await request.get(`/api/workbench/shell-history?limit=50`);
      expect(afterRes.status()).toBe(200);
      const afterBody = await afterRes.json();
      expect(afterBody.history).toEqual([]);

      const input = shellInput(page);
      await input.click();
      await input.press("ArrowUp");
      // No history → input remains empty.
      await expect(input).toHaveValue("");
      // The pre-clear transcript entries should also be gone (the panel
      // wiped its in-memory `history` state in `clearAll`, and there's
      // nothing in the server-side history endpoint to restore them).
      await expect(transcriptEntry(page, "echo will-be-cleared")).toHaveCount(0);
    });
  });
}
