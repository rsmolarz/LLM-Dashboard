import { type APIRequestContext, type BrowserContext, expect } from "@playwright/test";

/**
 * Sign the current browser context in as a deterministic fixture user by
 * hitting the dev-only `/api/__test__/login` endpoint.
 *
 * The endpoint mints a real session cookie (httpOnly, Secure, SameSite=Lax
 * on the api-server side); we then copy that cookie into the Playwright
 * BrowserContext so subsequent page navigations are authenticated.
 *
 * The `userId` is forced to a per-test prefix so two specs that race the
 * same fixture user don't trample each other's shell history.
 */
export async function loginAsFixtureUser(
  request: APIRequestContext,
  context: BrowserContext,
  userId: string,
): Promise<{ userId: string }> {
  const res = await request.post(`/api/__test__/login`, {
    data: { userId, email: `${userId}@e2e.local` },
  });
  expect(
    res.status(),
    `POST /api/__test__/login should succeed (is WORKBENCH_E2E_AUTH=1 set on the api-server?)`,
  ).toBe(200);
  const cookies = await request.storageState();
  // Forward the `sid` cookie into the browser context so navigation in
  // the page inherits the session. We strip cookies the test didn't set
  // to avoid leaking unrelated state from a re-used storage state file.
  const sidCookie = cookies.cookies.find((c) => c.name === "sid");
  expect(sidCookie, `expected /api/__test__/login to set the 'sid' cookie`).toBeTruthy();
  await context.addCookies([sidCookie!]);
  return { userId };
}

/** Wipe the fixture user's persisted shell history server-side. */
export async function clearShellHistory(request: APIRequestContext): Promise<void> {
  const res = await request.delete(`/api/workbench/shell-history`);
  expect(res.status(), "DELETE /api/workbench/shell-history should succeed").toBe(200);
}
