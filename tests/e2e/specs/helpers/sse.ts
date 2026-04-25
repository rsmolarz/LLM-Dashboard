import { type Route, expect } from "@playwright/test";

/**
 * Helpers for fulfilling Server-Sent-Events (SSE) responses with
 * Playwright's `page.route()`. The chat endpoints we exercise from
 * specs (`/api/workbench/code-chat`, `/api/workbench/ssh/ai-chat`)
 * stream `data: <json>\n\n` frames over `text/event-stream`. The
 * frontend reads the body as a stream, but it tolerates the entire
 * payload arriving in one chunk — Playwright fulfills the request
 * with a buffered body, which the browser still surfaces to the
 * `getReader()` loop frame-by-frame.
 *
 * Encoding the entire stream upfront also matches what most
 * production SSE clients do once the upstream finishes — the only
 * thing we lose by pre-buffering is the per-chunk pacing, which the
 * specs intentionally don't assert on.
 */

export type SseEvent = Record<string, unknown>;

/** Encode a sequence of JSON events as an SSE response body. */
export function encodeSseBody(events: SseEvent[]): string {
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join("");
}

/**
 * Fulfill a route with a successful SSE response. Use inside a
 * `page.route()` handler — the browser sees the body as a single
 * pre-buffered stream that still parses cleanly through the
 * frontend's `data: ` reader loop.
 */
export async function fulfillSse(route: Route, events: SseEvent[]): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
    body: encodeSseBody(events),
  });
}

/**
 * Sanity-check that an event payload roundtrips through `encodeSseBody`
 * — used by specs that build complicated multi-event streams to fail
 * fast on JSON-encoding mistakes (e.g. embedded NULs) before driving
 * the page.
 */
export function assertEncodableEvents(events: SseEvent[]): void {
  const encoded = encodeSseBody(events);
  expect(encoded.length, "SSE body must encode without throwing").toBeGreaterThan(0);
  for (const line of encoded.split("\n\n").filter(Boolean)) {
    expect(line.startsWith("data: "), `every SSE frame must begin with 'data: ' (got: ${line.slice(0, 40)}…)`).toBe(true);
  }
}
