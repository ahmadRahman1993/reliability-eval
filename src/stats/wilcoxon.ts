import type { CompareOptions, CompareResult, EvaluateResult, ResultItem } from "../types.js";
import { normalCdf } from "./distributions.js";
import { averageRanks, tieCorrection } from "./ranking.js";

function extractMetric(
  item: ResultItem,
  metric: CompareOptions["metric"],
): number | null {
  if (typeof metric === "function") return metric(item);
  if (metric === "score") return item.score;
  if (metric === "confidence") return item.confidence;
  if (metric === "brier") {
    if (item.confidence === null) return null;
    const outcome = item.correct ? 1 : 0;
    const diff = item.confidence - outcome;
    return diff * diff;
  }
  return null;
}

// Exact Wilcoxon distribution for small n (n <= 20) via dynamic programming.
// Returns P(W+ >= w | H0) for the upper tail, then doubled for two-sided.
function exactWilcoxonPValue(w: number, n: number): number {
  // dp[s] = number of ways to achieve W+ = s from first k ranks.
  // Total combinations = 2^n.
  const totalRanks = (n * (n + 1)) / 2;
  const dp = new Float64Array(totalRanks + 1);
  dp[0] = 1;

  for (let rank = 1; rank <= n; rank++) {
    for (let s = totalRanks; s >= rank; s--) {
      dp[s] = (dp[s] ?? 0) + (dp[s - rank] ?? 0);
    }
  }

  const total = Math.pow(2, n);
  // Two-sided: P(W+ >= max(w, n*(n+1)/2 - w))
  const wMirror = totalRanks - w;
  const wMax = Math.max(w, wMirror);
  let tail = 0;
  for (let s = wMax; s <= totalRanks; s++) {
    tail += dp[s] ?? 0;
  }
  // Multiply by 2 for two-sided, but cap at 1.
  return Math.min(1, (2 * tail) / total);
}

export function wilcoxonTest(
  a: EvaluateResult,
  b: EvaluateResult,
  opts: CompareOptions,
): CompareResult {
  const alpha = opts.alpha ?? 0.05;

  if (a.items.length !== b.items.length) {
    throw new Error("Results must have the same number of items for a paired test.");
  }
  for (let i = 0; i < a.items.length; i++) {
    if (a.items[i]!.id !== b.items[i]!.id) {
      throw new Error(
        `Item id mismatch at index ${i}: "${a.items[i]!.id}" vs "${b.items[i]!.id}". ` +
          "Paired test requires items in the same order with matching ids.",
      );
    }
  }

  const diffs: number[] = [];
  for (let i = 0; i < a.items.length; i++) {
    const va = extractMetric(a.items[i]!, opts.metric);
    const vb = extractMetric(b.items[i]!, opts.metric);
    if (va === null || vb === null) continue;
    const d = va - vb;
    if (d !== 0) diffs.push(d);
  }

  const n = diffs.length;
  if (n === 0) {
    return {
      test: "wilcoxon",
      statistic: 0,
      pValue: 1,
      significant: false,
      n: 0,
      effectSize: 0,
      alpha,
    };
  }

  const absDiffs = diffs.map(Math.abs);
  const ranks = averageRanks(absDiffs);

  let wPlus = 0;
  let wMinus = 0;
  for (let i = 0; i < diffs.length; i++) {
    if ((diffs[i] ?? 0) > 0) wPlus += ranks[i] ?? 0;
    else wMinus += ranks[i] ?? 0;
  }

  const W = wPlus;
  const effectSize = (wPlus - wMinus) / (wPlus + wMinus);

  let pValue: number;

  if (n < 20) {
    pValue = exactWilcoxonPValue(Math.round(W), n);
  } else {
    const mean = (n * (n + 1)) / 4;
    const tieCorr = tieCorrection(ranks);
    const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorr;
    const sign = W > mean ? 1 : -1;
    const z = (W - mean - 0.5 * sign) / Math.sqrt(variance);
    pValue = 2 * (1 - normalCdf(Math.abs(z)));
  }

  return {
    test: "wilcoxon",
    statistic: W,
    pValue,
    significant: pValue < alpha,
    n,
    effectSize,
    alpha,
  };
}
