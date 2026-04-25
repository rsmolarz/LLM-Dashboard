import assert from "node:assert/strict";

// Shared helpers for the disconnect-aware AbortController contract:
// long-running upstream AI fetches must combine their AbortSignal.timeout
// with a per-request AbortController fired from res.on("close").
// These helpers spy on the signal the route attached to its upstream
// fetch and assert it fires when the client disconnects.

export type DisconnectAbortProvider =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "ollama";

export interface DisconnectAbortFixture {
  upstreamSignal: AbortSignal | null;
  signalAborted: boolean;
  signalAbortedPromise: Promise<void>;
  upstreamFetchStartedPromise: Promise<void>;
  restore: () => void;
}

interface ProviderConfig {
  envKeys: string[];
  defaultBaseUrl: string;
  // URL fragments that identify an upstream LLM call. Anything matching
  // ANY of these (or the upstream host derived from the base URL) is
  // treated as the call we want to spy on.
  pathFragments: string[];
}

const PROVIDER_CONFIG: Record<DisconnectAbortProvider, ProviderConfig> = {
  anthropic: {
    envKeys: ["AI_INTEGRATIONS_ANTHROPIC_BASE_URL", "AI_INTEGRATIONS_ANTHROPIC_API_KEY"],
    defaultBaseUrl: "http://127.0.0.1:1/anthropic-stub",
    pathFragments: ["/v1/messages"],
  },
  openai: {
    envKeys: ["AI_INTEGRATIONS_OPENAI_BASE_URL", "AI_INTEGRATIONS_OPENAI_API_KEY"],
    defaultBaseUrl: "http://127.0.0.1:1/openai-stub",
    pathFragments: ["/v1/chat/completions"],
  },
  openrouter: {
    envKeys: ["AI_INTEGRATIONS_OPENROUTER_BASE_URL", "AI_INTEGRATIONS_OPENROUTER_API_KEY"],
    defaultBaseUrl: "http://127.0.0.1:1/openrouter-stub",
    // OpenRouter callers in this codebase use `${baseUrl}/chat/completions`
    // (no /v1 prefix because the env baseUrl already ends in /v1).
    pathFragments: ["/chat/completions"],
  },
  ollama: {
    envKeys: [],
    defaultBaseUrl: "http://127.0.0.1:1/ollama-stub",
    pathFragments: ["/api/chat", "/api/generate"],
  },
};

export interface InstallDisconnectAbortStubOpts {
  // When true, the stub yields a streaming response so SSE routes can
  // read at least one byte before aborting. When false, the body stream
  // stays open with no bytes, hanging non-streaming `response.json()`
  // consumers.
  ssePreamble: boolean;
  // Which upstream provider's env vars / URL pattern to set up.
  provider?: DisconnectAbortProvider;
}

export function installDisconnectAbortStub(
  opts: InstallDisconnectAbortStubOpts,
): DisconnectAbortFixture {
  const provider = opts.provider ?? "anthropic";
  const config = PROVIDER_CONFIG[provider];

  const prevEnv: Record<string, string | undefined> = {};
  for (const key of config.envKeys) {
    prevEnv[key] = process.env[key];
  }

  // Populate stub env vars for providers that read them so the route's
  // pre-fetch validation doesn't bail out before issuing the call.
  if (config.envKeys.length === 2) {
    const [baseUrlKey, apiKeyKey] = config.envKeys;
    process.env[baseUrlKey] = process.env[baseUrlKey] || config.defaultBaseUrl;
    process.env[apiKeyKey] = process.env[apiKeyKey] || "test-fake-key";
  }

  let upstreamHost: string | null = null;
  if (config.envKeys.length === 2) {
    try {
      upstreamHost = new URL(process.env[config.envKeys[0]]!).host;
    } catch {
      upstreamHost = null;
    }
  }

  const realFetch = globalThis.fetch;

  const fixture: DisconnectAbortFixture = {
    upstreamSignal: null,
    signalAborted: false,
    signalAbortedPromise: undefined as unknown as Promise<void>,
    upstreamFetchStartedPromise: undefined as unknown as Promise<void>,
    restore: () => {
      globalThis.fetch = realFetch;
      for (const key of config.envKeys) {
        if (prevEnv[key] === undefined) delete process.env[key];
        else process.env[key] = prevEnv[key]!;
      }
    },
  };

  let resolveSignal!: () => void;
  fixture.signalAbortedPromise = new Promise<void>((resolve) => {
    resolveSignal = resolve;
  });
  let resolveStarted!: () => void;
  fixture.upstreamFetchStartedPromise = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });

  const matchesUpstream = (url: string): boolean => {
    if (upstreamHost && url.includes(upstreamHost)) return true;
    return config.pathFragments.some((p) => url.includes(p));
  };

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    if (matchesUpstream(url)) {
      // Capture the signal the route attached so we can assert it
      // fires on client disconnect (not just on the per-route timeout).
      fixture.upstreamSignal = init?.signal ?? null;
      if (fixture.upstreamSignal) {
        if (fixture.upstreamSignal.aborted) {
          fixture.signalAborted = true;
          resolveSignal();
        } else {
          fixture.upstreamSignal.addEventListener("abort", () => {
            fixture.signalAborted = true;
            resolveSignal();
          });
        }
      }
      resolveStarted();
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (opts.ssePreamble) {
            // Write a couple of bytes that look right for whatever
            // provider we're stubbing so the route's parse logic
            // doesn't choke before we get a chance to abort.
            if (provider === "ollama") {
              // Ollama streams NDJSON, not SSE.
              controller.enqueue(encoder.encode(
                JSON.stringify({ message: { content: "in-progress reply" }, done: false }) + "\n",
              ));
            } else if (provider === "openai" || provider === "openrouter") {
              controller.enqueue(encoder.encode(
                'data: {"choices":[{"delta":{"content":"in-progress reply"}}]}\n\n',
              ));
            } else {
              controller.enqueue(encoder.encode(
                'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
              ));
              controller.enqueue(encoder.encode(
                'data: {"type":"content_block_delta","index":0,"delta":{"text":"in-progress reply"}}\n\n',
              ));
            }
          }
          // Intentionally not closed — the only way the route stops is
          // by observing the abort.
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": opts.ssePreamble
            ? (provider === "ollama" ? "application/x-ndjson" : "text/event-stream")
            : "application/json",
        },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;

  return fixture;
}

export async function awaitSignalAbort(
  fixture: DisconnectAbortFixture,
  routeLabel: string,
  timeoutMs = 5000,
): Promise<void> {
  await Promise.race([
    fixture.signalAbortedPromise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `timed out waiting for the upstream fetch's signal to fire after client disconnect on ${routeLabel}`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
  assert.equal(
    fixture.signalAborted,
    true,
    `expected the upstream fetch's signal on ${routeLabel} to fire on client disconnect so the upstream HTTP request is actually torn down`,
  );
}
