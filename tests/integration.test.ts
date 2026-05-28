import { describe, expect, it, vi } from "vitest";
import { compare, correlate, evaluate } from "../src/index.js";
import { exact } from "../src/scorers/index.js";
import type { Provider } from "../src/types.js";

// Deterministic mock provider that returns the "correct" answer for even-indexed
// items and a wrong answer for odd-indexed items, with a confidence value.
function makeMockProvider(answers: Array<{ text: string }>): Provider {
  let callIndex = 0;
  return {
    name: "mock",
    model: "mock-model",
    async generate(_prompt: string) {
      const answer = answers[callIndex % answers.length];
      callIndex++;
      return {
        text: answer?.text ?? "",
        raw: { mock: true },
      };
    },
  };
}

const DATASET = [
  { id: "q0", input: "What is 1+1?", expected: "2" },
  { id: "q1", input: "What is 2+2?", expected: "4" },
  { id: "q2", input: "What is 3+3?", expected: "6" },
  { id: "q3", input: "What is 4+4?", expected: "8" },
  { id: "q4", input: "What is 5+5?", expected: "10" },
];

const CORRECT_ANSWERS = DATASET.map((d) => ({ text: d.expected }));
const MIXED_ANSWERS = DATASET.map((d, i) => ({
  text: i % 2 === 0 ? d.expected : "wrong",
}));

describe("evaluate() end-to-end", () => {
  it("returns correct shape for all-correct provider", async () => {
    const provider = makeMockProvider(CORRECT_ANSWERS);
    const result = await evaluate({
      provider,
      dataset: DATASET,
      scorer: exact(),
    });

    expect(result.metrics.accuracy).toBe(1);
    expect(result.metrics.n).toBe(5);
    expect(result.metrics.brier).toBeNull();
    expect(result.items).toHaveLength(5);
    expect(result.calibrationCurve).toHaveLength(10);
    expect(result.meta.provider).toBe("mock");
    expect(result.meta.model).toBe("mock-model");
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.meta.startedAt).toMatch(/^\d{4}-/);
  });

  it("computes correct accuracy for mixed answers", async () => {
    const provider = makeMockProvider(MIXED_ANSWERS);
    const result = await evaluate({
      provider,
      dataset: DATASET,
      scorer: exact(),
    });

    expect(result.metrics.accuracy).toBe(0.6); // 3 correct out of 5 (indices 0,2,4)
    expect(result.items.filter((i) => i.correct)).toHaveLength(3);
  });

  it("elicits and parses confidence", async () => {
    const provider: Provider = {
      name: "mock",
      model: "mock-model",
      async generate() {
        return {
          text: "ANSWER: 2\nCONFIDENCE: 0.9",
          raw: {},
        };
      },
    };
    const result = await evaluate({
      provider,
      dataset: [{ id: "q0", input: "What is 1+1?", expected: "2" }],
      scorer: exact(),
      elicitConfidence: true,
    });

    expect(result.items[0]?.confidence).toBeCloseTo(0.9);
    expect(result.items[0]?.predicted).toBe("2");
    expect(result.metrics.brier).toBeCloseTo(0.01); // (0.9-1)^2 = 0.01
    expect(result.metrics.ece).toBeGreaterThanOrEqual(0);
  });

  it("sets confidence=null when response lacks CONFIDENCE field", async () => {
    const provider: Provider = {
      name: "mock",
      model: "mock-model",
      async generate() {
        return { text: "just an answer", raw: {} };
      },
    };
    const result = await evaluate({
      provider,
      dataset: [{ id: "q0", input: "Q", expected: "A" }],
      scorer: exact(),
      elicitConfidence: true,
    });
    expect(result.items[0]?.confidence).toBeNull();
    expect(result.metrics.brier).toBeNull();
  });

  it("calls onProgress for each completed item", async () => {
    const progressCalls: Array<[number, number]> = [];
    const provider = makeMockProvider(CORRECT_ANSWERS);
    await evaluate({
      provider,
      dataset: DATASET,
      scorer: exact(),
      onProgress: (done, total) => progressCalls.push([done, total]),
    });

    expect(progressCalls).toHaveLength(5);
    expect(progressCalls[4]).toEqual([5, 5]);
    for (const [done, total] of progressCalls) {
      expect(total).toBe(5);
      expect(done).toBeGreaterThan(0);
    }
  });

  it("respects concurrency option", async () => {
    const callOrder: number[] = [];
    const dataset = Array.from({ length: 6 }, (_, i) => ({
      id: `q${i}`,
      input: `Q${i}`,
      expected: "A",
    }));
    const provider: Provider = {
      name: "mock",
      model: "mock-model",
      async generate(prompt) {
        callOrder.push(Number(prompt.replace("Q", "")));
        return { text: "A", raw: {} };
      },
    };
    await evaluate({ provider, dataset, scorer: exact(), concurrency: 2 });
    expect(callOrder).toHaveLength(6);
  });
});

describe("compare() integration", () => {
  async function runWithScores(
    scores: number[],
  ): Promise<import("../src/types.js").EvaluateResult> {
    const dataset = scores.map((_, i) => ({
      id: `q${i}`,
      input: `Q${i}`,
      expected: "1",
    }));
    const provider: Provider = {
      name: "mock",
      model: "mock-model",
      async generate(_prompt, _opts) {
        const idx = dataset.findIndex((d) => _prompt.includes(d.input));
        const s = scores[idx] ?? 0;
        return { text: s >= 0.5 ? "1" : "0", raw: {} };
      },
    };
    return evaluate({ provider, dataset, scorer: exact() });
  }

  it("returns a CompareResult with expected shape", async () => {
    const aScores = [1, 1, 1, 0, 1, 0, 1, 1, 0, 1];
    const bScores = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0];

    // Build results directly to avoid ordering issues with async
    const makeResult = (sc: number[]) => {
      const items = sc.map((s, i) => ({
        id: `q${i}`,
        input: `Q${i}`,
        expected: "1",
        predicted: s >= 0.5 ? "1" : "0",
        confidence: null as number | null,
        correct: s >= 0.5,
        score: s,
        raw: null,
      }));
      return {
        items,
        metrics: { accuracy: 0, ece: 0, brier: null, n: sc.length },
        calibrationCurve: [],
        meta: { provider: "m", model: "m", startedAt: "", finishedAt: "", durationMs: 0 },
      };
    };

    const a = makeResult(aScores);
    const b = makeResult(bScores);
    const result = compare(a, b, { test: "wilcoxon", metric: "score" });

    expect(result.test).toBe("wilcoxon");
    expect(result.statistic).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
    expect(result.n).toBeGreaterThan(0);
    expect(typeof result.effectSize).toBe("number");
    expect(result.alpha).toBe(0.05);
  });

  it("throws when ids do not match", () => {
    const makeResult = (ids: string[]) => ({
      items: ids.map((id) => ({
        id,
        input: id,
        expected: "x",
        predicted: "x",
        confidence: null as number | null,
        correct: true,
        score: 1,
        raw: null,
      })),
      metrics: { accuracy: 1, ece: 0, brier: null, n: ids.length },
      calibrationCurve: [],
      meta: { provider: "", model: "", startedAt: "", finishedAt: "", durationMs: 0 },
    });
    const a = makeResult(["q0", "q1", "q2"]);
    const b = makeResult(["q0", "q2", "q1"]);
    expect(() => compare(a, b, { test: "wilcoxon", metric: "score" })).toThrow(/id/);
  });
});

describe("correlate() integration", () => {
  it("returns a CorrelateResult with expected shape", async () => {
    const provider: Provider = {
      name: "mock",
      model: "mock-model",
      async generate() {
        return { text: "ANSWER: yes\nCONFIDENCE: 0.8", raw: {} };
      },
    };
    const result = await evaluate({
      provider,
      dataset: DATASET,
      scorer: exact(),
      elicitConfidence: true,
    });

    const corrResult = correlate(result, {
      test: "spearman",
      x: "confidence",
      y: "score",
    });

    expect(corrResult.test).toBe("spearman");
    expect(corrResult.rho).toBeGreaterThanOrEqual(-1);
    expect(corrResult.rho).toBeLessThanOrEqual(1);
    expect(corrResult.pValue).toBeGreaterThanOrEqual(0);
    expect(corrResult.pValue).toBeLessThanOrEqual(1);
    expect(corrResult.alpha).toBe(0.05);
  });
});
