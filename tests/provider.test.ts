import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anthropic } from "../src/providers/anthropic.js";
import { openai } from "../src/providers/openai.js";
import { ProviderError } from "../src/types.js";

// Manual fetch mock that replaces the global fetch with a configurable stub.
type FetchHandler = (url: string, init: RequestInit) => Promise<Response>;
let mockFetch: FetchHandler | null = null;

function makeResponse(body: unknown, status = 200): Response {
  const json = JSON.stringify(body);
  return new Response(json, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  // @ts-expect-error - replacing global fetch for test isolation
  global.fetch = vi.fn((url: string, init: RequestInit) => {
    if (!mockFetch) throw new Error("mockFetch not set");
    return mockFetch(url, init);
  });
});

afterEach(() => {
  mockFetch = null;
  vi.restoreAllMocks();
});

describe("anthropic provider", () => {
  it("calls the correct API endpoint", async () => {
    let capturedUrl = "";
    mockFetch = async (url) => {
      capturedUrl = url;
      return makeResponse({
        content: [{ type: "text", text: "Hello" }],
        model: "claude-3-haiku-20240307",
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
      });
    };
    const provider = anthropic({ model: "claude-3-haiku-20240307", apiKey: "test-key" });
    await provider.generate("Hello");
    expect(capturedUrl).toBe("https://api.anthropic.com/v1/messages");
  });

  it("sends correct headers and body", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    mockFetch = async (_url, init) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers as HeadersInit).entries());
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return makeResponse({
        content: [{ text: "response" }],
        model: "test",
        usage: {},
        stop_reason: "end_turn",
      });
    };

    const provider = anthropic({ model: "claude-3-haiku-20240307", apiKey: "sk-test" });
    await provider.generate("Test prompt", { maxTokens: 512, temperature: 0.5 });

    expect(capturedHeaders["x-api-key"]).toBe("sk-test");
    expect(capturedHeaders["anthropic-version"]).toBe("2023-06-01");
    expect(capturedBody.model).toBe("claude-3-haiku-20240307");
    expect(capturedBody.max_tokens).toBe(512);
    expect(capturedBody.temperature).toBe(0.5);
    expect(capturedBody.messages).toEqual([{ role: "user", content: "Test prompt" }]);
  });

  it("extracts text from response", async () => {
    mockFetch = async () =>
      makeResponse({
        content: [{ type: "text", text: "The answer is 42" }],
        model: "test",
        usage: {},
        stop_reason: "end_turn",
      });

    const provider = anthropic({ model: "test", apiKey: "key" });
    const result = await provider.generate("q");
    expect(result.text).toBe("The answer is 42");
  });

  it("does not include API key in raw response", async () => {
    mockFetch = async () =>
      makeResponse({
        content: [{ text: "answer" }],
        model: "test",
        usage: { input_tokens: 5, output_tokens: 2 },
        stop_reason: "end_turn",
      });

    const provider = anthropic({ model: "test", apiKey: "secret-key-123" });
    const result = await provider.generate("q");
    const rawStr = JSON.stringify(result.raw);
    expect(rawStr).not.toContain("secret-key-123");
  });

  it("throws ProviderError on 400 without retry", async () => {
    let callCount = 0;
    mockFetch = async () => {
      callCount++;
      return makeResponse({ error: { message: "bad request" } }, 400);
    };

    const provider = anthropic({ model: "test", apiKey: "key" });
    await expect(provider.generate("q")).rejects.toBeInstanceOf(ProviderError);
    expect(callCount).toBe(1); // No retry on 4xx (except 429)
  });

  it("retries on 429 up to maxRetries times", async () => {
    let callCount = 0;
    mockFetch = async () => {
      callCount++;
      if (callCount <= 2) return makeResponse({ error: "rate limited" }, 429);
      return makeResponse({
        content: [{ text: "ok" }],
        model: "test",
        usage: {},
        stop_reason: "end_turn",
      });
    };

    // Patch setTimeout to avoid actual delays in tests
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn) => {
      (fn as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const provider = anthropic({ model: "test", apiKey: "key" });
    const result = await provider.generate("q");
    expect(result.text).toBe("ok");
    expect(callCount).toBe(3);
  });
});

describe("openai provider", () => {
  it("calls the correct API endpoint", async () => {
    let capturedUrl = "";
    mockFetch = async (url) => {
      capturedUrl = url;
      return makeResponse({
        choices: [{ message: { content: "Hello" }, finish_reason: "stop" }],
        model: "gpt-4o-mini",
        usage: {},
      });
    };
    const provider = openai({ model: "gpt-4o-mini", apiKey: "test" });
    await provider.generate("Hi");
    expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("sends Bearer auth header", async () => {
    let authHeader = "";
    mockFetch = async (_url, init) => {
      authHeader = new Headers(init.headers as HeadersInit).get("authorization") ?? "";
      return makeResponse({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        model: "test",
        usage: {},
      });
    };
    const provider = openai({ model: "gpt-4o-mini", apiKey: "sk-openai-test" });
    await provider.generate("q");
    expect(authHeader).toBe("Bearer sk-openai-test");
  });

  it("extracts text from choices[0].message.content", async () => {
    mockFetch = async () =>
      makeResponse({
        choices: [{ message: { content: "42" }, finish_reason: "stop" }],
        model: "test",
        usage: {},
      });
    const provider = openai({ model: "test", apiKey: "key" });
    const result = await provider.generate("q");
    expect(result.text).toBe("42");
  });

  it("throws ProviderError on 401", async () => {
    mockFetch = async () => makeResponse({ error: { message: "unauthorized" } }, 401);
    const provider = openai({ model: "test", apiKey: "bad-key" });
    await expect(provider.generate("q")).rejects.toBeInstanceOf(ProviderError);
  });

  it("name and model are correctly set", () => {
    const provider = openai({ model: "gpt-4o", apiKey: "key" });
    expect(provider.name).toBe("openai");
    expect(provider.model).toBe("gpt-4o");
  });
});
