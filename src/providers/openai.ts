import type { Provider, ProviderResponse } from "../types.js";
import { ProviderError } from "../types.js";
import type { ProviderOptions } from "./types.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

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
      throw new ProviderError(`OpenAI API error ${res.status}`, res.status, body);
    }
    lastError = new ProviderError(
      `OpenAI API error ${res.status} (attempt ${attempt + 1})`,
      res.status,
      await res.text().catch(() => ""),
    );
  }
  throw lastError ?? new Error("Unknown fetch error");
}

export function openai(opts: ProviderOptions): Provider {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? "";

  return {
    name: "openai",
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

      const res = await fetchWithRetry(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });

      const data = (await res.json()) as Record<string, unknown>;
      const choices = data.choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        throw new ProviderError("Unexpected OpenAI response shape", 200, data);
      }
      const choice = choices[0] as Record<string, unknown>;
      const message = choice.message as Record<string, unknown> | undefined;
      const text = typeof message?.content === "string" ? message.content : "";

      return {
        text,
        raw: {
          model: data.model,
          usage: data.usage,
          finish_reason: choice.finish_reason,
        },
      };
    },
  };
}
