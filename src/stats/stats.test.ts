import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EvaluateResult, ResultItem } from "../types.js";
import { normalCdf, tCdf } from "./distributions.js";
import { spearmanTest } from "./spearman.js";
import { wilcoxonTest } from "./wilcoxon.js";

interface ReferenceStats {
  wilcoxon: Array<{
    name: string;
    a: number[];
    b: number[];
    expected: { statistic: number; pValue: number; n: number; effectSize: number };
  }>;
  spearman: Array<{
    name: string;
    x: number[];
    y: number[];
    expected: { rho: number; pValue: number; n: number };
  }>;
}

function loadReference(): ReferenceStats {
  const fixturePath = join(
    new URL(".", import.meta.url).pathname,
    "../../tests/fixtures/reference-stats.json",
  );
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ReferenceStats;
}

function makeResultFromScores(scores: number[], ids?: string[]): EvaluateResult {
  const items: ResultItem[] = scores.map((s, i) => ({
    id: ids ? (ids[i] ?? String(i)) : String(i),
    input: `q${i}`,
    expected: "x",
    predicted: "x",
    confidence: s,
    correct: s >= 0.5,
    score: s,
    raw: null,
  }));
  return {
    items,
    metrics: { accuracy: 0, ece: 0, brier: null, n: items.length },
    calibrationCurve: [],
    meta: {
      provider: "test",
      model: "test",
      startedAt: "",
      finishedAt: "",
      durationMs: 0,
    },
  };
}

describe("normalCdf accuracy (vs scipy, tolerance 1e-4)", () => {
  const cases: Array<[number, number]> = [
    [0, 0.5],
    [0.5, 0.69146246],
    [1.0, 0.84134475],
    [1.5, 0.9331928],
    [2.0, 0.97724987],
    [2.5, 0.99379033],
    [3.0, 0.9986501],
    [-1.0, 0.15865525],
    [-2.0, 0.02275013],
  ];
  for (const [z, expected] of cases) {
    it(`normalCdf(${z}) ≈ ${expected}`, () => {
      expect(normalCdf(z)).toBeCloseTo(expected, 4);
    });
  }
});

describe("tCdf accuracy (vs scipy, tolerance 1e-4)", () => {
  const cases: Array<[number, number, number]> = [
    [1.0, 4, 0.81304952],
    [1.0, 10, 0.82955343],
    [2.0, 10, 0.96330598],
    [2.42, 10, 0.9819692],
    [3.0, 18, 0.99615729],
    [1.0, 50, 0.83893718],
  ];
  for (const [t, df, expected] of cases) {
    it(`tCdf(${t}, ${df}) ≈ ${expected}`, () => {
      expect(tCdf(t, df)).toBeCloseTo(expected, 4);
    });
  }
});

describe("Wilcoxon signed-rank vs scipy reference (tolerance 1e-4)", () => {
  const ref = loadReference();

  for (const c of ref.wilcoxon) {
    it(`case: ${c.name}`, () => {
      const ids = c.a.map((_, i) => String(i));
      const resultA = makeResultFromScores(c.a, ids);
      const resultB = makeResultFromScores(c.b, ids);

      const result = wilcoxonTest(resultA, resultB, { test: "wilcoxon", metric: "score" });

      expect(result.n).toBe(c.expected.n);
      expect(result.pValue).toBeCloseTo(c.expected.pValue, 4);
      expect(result.effectSize).toBeCloseTo(c.expected.effectSize, 4);
    });
  }
});

describe("Spearman correlation vs scipy reference (tolerance 1e-4)", () => {
  const ref = loadReference();

  for (const c of ref.spearman) {
    it(`case: ${c.name}`, () => {
      const items: ResultItem[] = c.x.map((x, i) => ({
        id: String(i),
        input: `q${i}`,
        expected: "x",
        predicted: "x",
        confidence: x,
        correct: (c.y[i] ?? 0) >= 0.5,
        score: c.y[i] ?? 0,
        raw: null,
      }));
      const result_: EvaluateResult = {
        items,
        metrics: { accuracy: 0, ece: 0, brier: null, n: items.length },
        calibrationCurve: [],
        meta: {
          provider: "test",
          model: "test",
          startedAt: "",
          finishedAt: "",
          durationMs: 0,
        },
      };

      const result = spearmanTest(result_, {
        test: "spearman",
        x: "confidence",
        y: "score",
      });

      expect(result.n).toBe(c.expected.n);
      expect(result.rho).toBeCloseTo(c.expected.rho, 4);
      // p-value near 0 or 1 gets less strict tolerance
      if (c.expected.pValue > 0.001 && c.expected.pValue < 0.999) {
        expect(result.pValue).toBeCloseTo(c.expected.pValue, 4);
      } else {
        expect(result.pValue).toBeLessThan(0.001);
      }
    });
  }
});

describe("wilcoxonTest - pairing validation", () => {
  it("throws when item counts differ", () => {
    const a = makeResultFromScores([1, 0, 1]);
    const b = makeResultFromScores([0, 1]);
    expect(() => wilcoxonTest(a, b, { test: "wilcoxon", metric: "score" })).toThrow();
  });

  it("throws when item ids mismatch", () => {
    const a = makeResultFromScores([1, 0], ["a", "b"]);
    const b = makeResultFromScores([1, 0], ["a", "c"]);
    expect(() => wilcoxonTest(a, b, { test: "wilcoxon", metric: "score" })).toThrow(/id/);
  });

  it("returns p=1 n=0 when all diffs are zero", () => {
    const scores = [0.5, 0.7, 0.3];
    const a = makeResultFromScores(scores);
    const b = makeResultFromScores(scores);
    const result = wilcoxonTest(a, b, { test: "wilcoxon", metric: "score" });
    expect(result.pValue).toBe(1);
    expect(result.n).toBe(0);
  });
});

describe("wilcoxonTest - metric variants", () => {
  it("works with metric: confidence", () => {
    const makeConfResult = (confs: number[]) => ({
      items: confs.map((c, i) => ({
        id: String(i),
        input: `q${i}`,
        expected: "x",
        predicted: "x",
        confidence: c,
        correct: c >= 0.5,
        score: c >= 0.5 ? 1 : 0,
        raw: null,
      })),
      metrics: { accuracy: 0, ece: 0, brier: null, n: confs.length },
      calibrationCurve: [],
      meta: { provider: "", model: "", startedAt: "", finishedAt: "", durationMs: 0 },
    });
    const a = makeConfResult([0.9, 0.8, 0.7, 0.6]);
    const b = makeConfResult([0.5, 0.4, 0.3, 0.2]);
    const result = wilcoxonTest(a, b, { test: "wilcoxon", metric: "confidence" });
    expect(result.n).toBeGreaterThan(0);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
  });

  it("works with metric: brier", () => {
    const makeConfResult = (confs: Array<{ c: number; correct: boolean }>) => ({
      items: confs.map((x, i) => ({
        id: String(i),
        input: `q${i}`,
        expected: "x",
        predicted: x.correct ? "x" : "y",
        confidence: x.c,
        correct: x.correct,
        score: x.correct ? 1 : 0,
        raw: null,
      })),
      metrics: { accuracy: 0, ece: 0, brier: null, n: confs.length },
      calibrationCurve: [],
      meta: { provider: "", model: "", startedAt: "", finishedAt: "", durationMs: 0 },
    });
    const a = makeConfResult([
      { c: 0.9, correct: true },
      { c: 0.8, correct: true },
    ]);
    const b = makeConfResult([
      { c: 0.4, correct: false },
      { c: 0.3, correct: false },
    ]);
    const result = wilcoxonTest(a, b, { test: "wilcoxon", metric: "brier" });
    expect(typeof result.pValue).toBe("number");
  });

  it("works with custom metric function", () => {
    const a = makeResultFromScores([0.9, 0.8, 0.7]);
    const b = makeResultFromScores([0.4, 0.3, 0.2]);
    const result = wilcoxonTest(a, b, {
      test: "wilcoxon",
      metric: (item) => (item.correct ? 1 : 0),
    });
    expect(typeof result.pValue).toBe("number");
  });

  it("skips pairs where metric returns null (null confidence)", () => {
    const makeNullConf = (scores: number[]) => ({
      items: scores.map((s, i) => ({
        id: String(i),
        input: `q${i}`,
        expected: "x",
        predicted: "x",
        confidence: null as number | null,
        correct: s >= 0.5,
        score: s,
        raw: null,
      })),
      metrics: { accuracy: 0, ece: 0, brier: null, n: scores.length },
      calibrationCurve: [],
      meta: { provider: "", model: "", startedAt: "", finishedAt: "", durationMs: 0 },
    });
    const a = makeNullConf([0.9, 0.8]);
    const b = makeNullConf([0.5, 0.4]);
    const result = wilcoxonTest(a, b, { test: "wilcoxon", metric: "confidence" });
    expect(result.n).toBe(0);
  });
});

describe("spearmanTest - edge cases", () => {
  it("returns rho=1 for perfectly monotonic data", () => {
    const items: ResultItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      input: i,
      expected: "x",
      predicted: "x",
      confidence: i / 9,
      correct: true,
      score: i / 9,
      raw: null,
    }));
    const result_: EvaluateResult = {
      items,
      metrics: { accuracy: 1, ece: 0, brier: null, n: 10 },
      calibrationCurve: [],
      meta: { provider: "", model: "", startedAt: "", finishedAt: "", durationMs: 0 },
    };
    const result = spearmanTest(result_, { test: "spearman", x: "confidence", y: "score" });
    expect(result.rho).toBeCloseTo(1, 4);
    expect(result.pValue).toBeLessThan(0.001);
  });

  it("handles small n (< 10) via normal approximation", () => {
    const items: ResultItem[] = [0.9, 0.1, 0.8, 0.2, 0.7].map((c, i) => ({
      id: String(i),
      input: i,
      expected: "x",
      predicted: "x",
      confidence: c,
      correct: c >= 0.5,
      score: c >= 0.5 ? 1 : 0,
      raw: null,
    }));
    const result_: EvaluateResult = {
      items,
      metrics: { accuracy: 0, ece: 0, brier: null, n: 5 },
      calibrationCurve: [],
      meta: { provider: "", model: "", startedAt: "", finishedAt: "", durationMs: 0 },
    };
    const result = spearmanTest(result_, { test: "spearman", x: "confidence", y: "correct" });
    expect(result.n).toBe(5);
    expect(typeof result.rho).toBe("number");
    expect(typeof result.pValue).toBe("number");
  });

  it("works with custom x and y functions", () => {
    const items: ResultItem[] = [0.8, 0.4, 0.9, 0.3].map((c, i) => ({
      id: String(i),
      input: i,
      expected: "x",
      predicted: "x",
      confidence: c,
      correct: c >= 0.5,
      score: c,
      raw: null,
    }));
    const result_: EvaluateResult = {
      items,
      metrics: { accuracy: 0, ece: 0, brier: null, n: 4 },
      calibrationCurve: [],
      meta: { provider: "", model: "", startedAt: "", finishedAt: "", durationMs: 0 },
    };
    const result = spearmanTest(result_, {
      test: "spearman",
      x: (item) => item.score,
      y: (item) => (item.correct ? 1 : 0),
    });
    expect(result.n).toBe(4);
  });

  it("returns n=0 when no items have confidence", () => {
    const items: ResultItem[] = [
      {
        id: "1",
        input: "a",
        expected: "x",
        predicted: "x",
        confidence: null,
        correct: true,
        score: 1,
        raw: null,
      },
    ];
    const result_: EvaluateResult = {
      items,
      metrics: { accuracy: 1, ece: 0, brier: null, n: 1 },
      calibrationCurve: [],
      meta: { provider: "", model: "", startedAt: "", finishedAt: "", durationMs: 0 },
    };
    const result = spearmanTest(result_, { test: "spearman", x: "confidence", y: "score" });
    expect(result.n).toBe(0);
  });
});
