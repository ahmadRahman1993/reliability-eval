import type { CorrelateOptions, CorrelateResult, EvaluateResult, ResultItem } from "../types.js";
import { tCdf } from "./distributions.js";
import { averageRanks } from "./ranking.js";

function extractX(item: ResultItem, x: CorrelateOptions["x"]): number | null {
  if (typeof x === "function") return x(item);
  if (x === "confidence") return item.confidence;
  return null;
}

function extractY(item: ResultItem, y: CorrelateOptions["y"]): number | null {
  if (typeof y === "function") return y(item);
  if (y === "correct") return item.correct ? 1 : 0;
  if (y === "score") return item.score;
  return null;
}

export function spearmanTest(result: EvaluateResult, opts: CorrelateOptions): CorrelateResult {
  const alpha = opts.alpha ?? 0.05;

  const pairs: Array<{ x: number; y: number }> = [];
  for (const item of result.items) {
    const x = extractX(item, opts.x);
    const y = extractY(item, opts.y);
    if (x !== null && y !== null) {
      pairs.push({ x, y });
    }
  }

  const n = pairs.length;
  if (n < 2) {
    return { test: "spearman", rho: 0, pValue: 1, significant: false, n, alpha };
  }

  const xRanks = averageRanks(pairs.map((p) => p.x));
  const yRanks = averageRanks(pairs.map((p) => p.y));

  const xMean = xRanks.reduce((a, b) => a + b, 0) / n;
  const yMean = yRanks.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let xVar = 0;
  let yVar = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xRanks[i] ?? 0) - xMean;
    const dy = (yRanks[i] ?? 0) - yMean;
    cov += dx * dy;
    xVar += dx * dx;
    yVar += dy * dy;
  }

  const denom = Math.sqrt(xVar * yVar);
  if (denom === 0) {
    return { test: "spearman", rho: 0, pValue: 1, significant: false, n, alpha };
  }

  const rho = cov / denom;

  let pValue: number;
  if (n < 10) {
    // For very small n, use normal approximation (less accurate but acceptable).
    const z = rho * Math.sqrt(n - 1);
    pValue = 2 * (1 - normalApprox(Math.abs(z)));
  } else {
    const tStat = rho * Math.sqrt((n - 2) / (1 - rho * rho));
    const upper = tCdf(Math.abs(tStat), n - 2);
    pValue = 2 * (1 - upper);
  }
  pValue = Math.max(0, Math.min(1, pValue));

  return {
    test: "spearman",
    rho,
    pValue,
    significant: pValue < alpha,
    n,
    alpha,
  };
}

// Simple standard normal CDF via erf series (used for tiny-n fallback).
function normalApprox(z: number): number {
  if (z < 0) return 1 - normalApprox(-z);
  const t = 1 / (1 + 0.2316419 * z);
  const poly =
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  return 1 - pdf * poly;
}
