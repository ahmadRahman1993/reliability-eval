import type { Provider, ProviderResponse } from "../types.js";
import { ProviderError } from "../types.js";
import type { ProviderOptions } from "./types.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const res = await fetch(url, init);
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(`Anthropic API error ${res.status}`, res.status, body);
    }
    lastError = new ProviderError(
      `Anthropic API error ${res.status} (attempt ${attempt + 1})`,
      res.status,
      await res.text().catch(() => ""),
    );
  }
  throw lastError ?? new Error("Unknown fetch error");
}

export function anthropic(opts: ProviderOptions): Provider {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";

  return {
    name: "anthropic",
    model: opts.model,

    async generate(
      prompt: string,
      genOpts?: { maxTokens?: number; temperature?: number },
    ): Promise<ProviderResponse> {
      const body = JSON.stringify({
        model: opts.model,
        max_tokens: genOpts?.maxTokens ?? 1024,
        ...(genOpts?.temperature !== undefined ? { temperature: genOpts.temperature } : {}),
        messages: [{ role: "user", content: prompt }],
      });

      const res = await fetchWithRetry(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body,
      });

      const data = (await res.json()) as Record<string, unknown>;
      const content = data.content;
      if (!Array.isArray(content) || content.length === 0) {
        throw new ProviderError("Unexpected Anthropic response shape", 200, data);
      }
      const block = content[0] as Record<string, unknown>;
      const text = typeof block.text === "string" ? block.text : "";

      return {
        text,
        raw: { model: data.model, usage: data.usage, stop_reason: data.stop_reason },
      };
    },
  };
}
