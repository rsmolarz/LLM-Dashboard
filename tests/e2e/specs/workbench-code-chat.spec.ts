import { test, expect, request as playwrightRequest } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { loginAsFixtureUser } from "./helpers/auth";
import { chatTextarea, chatTranscript, sendPrompt } from "./helpers/code-chat";
import { fulfillSse, encodeSseBody, assertEncodableEvents } from "./helpers/sse";

/**
 * Coverage for the workbench `CodeChatPanel`. The panel POSTs to
 * `/api/workbench/code-chat` and reads back an SSE stream, so the
 * happy-path spec mocks the route and asserts that:
 *
 *   * the textarea clears after submit,
 *   * the chunk events render as visible message text, and
 *   * the request body the panel sent matches what we expect
 *     (correct prompt, no project / no writeMode for the default
 *     state).
 *
 * The 401 spec drives the route directly with an unauthenticated
 * request context. `requireAuth` doesn't gate `/code-chat` — only the
 * `writeMode === true` branch does — so the test must include a
 * project descriptor to exercise the write path. We assert the
 * status + a substring of the canonical error message.
 */

test.describe("Workbench code chat", () => {
  test.beforeEach(async ({ context, request }) => {
    const userId = `e2e_codechat_${randomBytes(4).toString("hex")}`;
    await loginAsFixtureUser(request, context, userId);
    // The left slot already defaults to "code-chat", but pin it
    // explicitly so a stale localStorage state from a previous dev
    // session can't redirect us.
    await context.addInitScript(() => {
      try {
        localStorage.setItem("wb-left-panel", JSON.stringify("code-chat"));
        localStorage.removeItem("wb-chat-messages");
        localStorage.removeItem("wb-chat-file-edits");
        // Make sure no stray selected project triggers writeMode +
        // pulls in a project context warmup we'd have to mock.
        localStorage.removeItem("workbench-selected-project");
      } catch {}
    });
  });

  test("happy path streams chunks into the transcript", async ({ page }) => {
    const tag = randomBytes(3).toString("hex");
    const prompt = `What does the foo function return? (#${tag})`;
    const reply = `The foo function returns 42 — tagged ${tag}.`;

    const events = [
      { type: "chunk", content: reply.slice(0, 20) },
      { type: "chunk", content: reply.slice(20) },
      { type: "done" },
    ];
    assertEncodableEvents(events);

    let captured: { body: any } | null = null;
    await page.route("**/api/workbench/code-chat", async (route) => {
      const raw = route.request().postData() || "";
      try { captured = { body: JSON.parse(raw) }; } catch { captured = { body: raw }; }
      await fulfillSse(route, events);
    });

    await page.goto("/workbench");
    await expect(chatTextarea(page)).toBeVisible();
    await sendPrompt(page, prompt);

    // Assert the streamed assistant text lands in the transcript.
    // The user bubble also contains the prompt text, so we look for
    // the reply text specifically.
    await expect(chatTranscript(page)).toContainText(reply, { timeout: 10_000 });

    // The panel posted the prompt body as JSON.
    expect(captured, "the panel must have hit /api/workbench/code-chat").not.toBeNull();
    expect(captured!.body).toMatchObject({
      prompt,
      // No selected project => writeMode flag should be falsy and
      // the project field should be absent / undefined.
      writeMode: false,
    });
    // History should be an array (empty on the first turn).
    expect(Array.isArray(captured!.body.messages)).toBe(true);
  });

  test("AI_NOT_CONFIGURED falls back to the inline help bubble", async ({ page }) => {
    // Mock the endpoint to mimic the route's 503 fallback when the
    // upstream Anthropic env vars aren't set. This covers the error
    // pathway the panel branches on (`code === "AI_NOT_CONFIGURED"`)
    // without relying on env-var state in the dev container.
    await page.route("**/api/workbench/code-chat", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Anthropic AI integration not configured",
          code: "AI_NOT_CONFIGURED",
        }),
      });
    });

    await page.goto("/workbench");
    await expect(chatTextarea(page)).toBeVisible();
    await sendPrompt(page, "tell me something");

    // The inline branch surfaces a unique button label that doesn't
    // appear elsewhere on the page.
    await expect(page.getByRole("button", { name: /^Open Env Vars panel$/ })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Workbench code chat (auth gate)", () => {
  test("POST /api/workbench/code-chat with writeMode=true returns 401 when unauthenticated", async ({ baseURL }) => {
    // Build a fresh API context that has NO cookies, so the request
    // hits the route as an anonymous caller.
    const anon = await playwrightRequest.newContext({ baseURL });
    try {
      const res = await anon.post(`/api/workbench/code-chat`, {
        headers: { "Content-Type": "application/json" },
        data: {
          prompt: "make a change",
          messages: [],
          writeMode: true,
          // Any project descriptor is fine — the route only inspects
          // `writeMode` for the auth gate (the project + AI_NOT_CONFIGURED
          // checks live below the auth check, and we never get past
          // the auth check).
          project: { origin: "local", path: "fixture/e2e-anon" },
        },
      });
      expect(
        res.status(),
        "anonymous writeMode chat must be rejected before reaching upstream",
      ).toBe(401);
      const body = await res.json().catch(() => ({}));
      // The route's literal response body has the canonical phrase.
      expect(body.error || "").toMatch(/Authentication required for writeMode chat/i);
    } finally {
      await anon.dispose();
    }
  });
});

// Touch a couple of imports so unused-symbol lints don't fire when a
// reviewer trims the spec — these are exercised inside the SSE mock
// for the happy-path test.
void encodeSseBody;
