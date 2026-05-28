import type { CompareOptions, CompareResult, EvaluateResult, ResultItem } from "../types.js";
import { normalCdf } from "./distributions.js";
import { averageRanks, tieCorrection } from "./ranking.js";

function extractMetric(item: ResultItem, metric: CompareOptions["metric"]): number | null {
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

// Exact p-value via DP for the no-ties case (integer ranks 1..n).
// dp[w] = #{subsets of {1..n} summing to w}. O(n * maxW) = O(n^3) time.
// Matches scipy.stats.wilcoxon(method="exact") for no-zeros, no-ties data.
function exactNTiesPValue(wPlus: number, n: number): number {
  const maxW = (n * (n + 1)) / 2;
  const wMinus = maxW - wPlus;
  const wMax = Math.max(wPlus, wMinus);

  const dp = new Float64Array(maxW + 1);
  dp[0] = 1;
  for (let k = 1; k <= n; k++) {
    for (let w = maxW; w >= k; w--) {
      dp[w] = (dp[w] ?? 0) + (dp[w - k] ?? 0);
    }
  }

  const total = 2 ** n;
  let count = 0;
  for (let w = wMax; w <= maxW; w++) {
    count += dp[w] ?? 0;
  }

  return Math.min(1, (2 * count) / total);
}

// Exact p-value via enumeration of all 2^n sign assignments.
// Uses actual (possibly fractional) rank values; handles tied ranks correctly.
// Feasible for n < 20 since 2^19 ~ 500K iterations.
function exactEnumPValue(wPlus: number, n: number, ranks: number[]): number {
  const totalRanks = ranks.reduce((s, r) => s + r, 0);
  const wMinus = totalRanks - wPlus;
  const wMax = Math.max(wPlus, wMinus);

  const total = 1 << n;
  let count = 0;

  for (let mask = 0; mask < total; mask++) {
    let w = 0;
    for (let i = 0; i < n; i++) {
      if ((mask >> i) & 1) w += ranks[i] ?? 0;
    }
    if (w >= wMax - 1e-10) count++;
  }

  return Math.min(1, (2 * count) / total);
}

// Normal approximation WITHOUT continuity correction.
// Used when zero differences exist (scipy also uses approx without correction
// in this case) or when no-zeros data has ties and n >= 20.
function normalApproxPValue(wPlus: number, n: number, ranks: number[]): number {
  const mean = (n * (n + 1)) / 4;
  const tieCorr = tieCorrection(ranks);
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorr;
  if (variance <= 0) return 1;
  const z = (wPlus - mean) / Math.sqrt(variance);
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
}

function detectTies(absDiffs: number[]): boolean {
  const seen = new Set<number>();
  for (const d of absDiffs) {
    if (seen.has(d)) return true;
    seen.add(d);
  }
  return false;
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
    if (a.items[i]?.id !== b.items[i]?.id) {
      throw new Error(
        `Item id mismatch at index ${i}: "${a.items[i]?.id}" vs "${b.items[i]?.id}". Paired test requires items in the same order with matching ids.`,
      );
    }
  }

  let hadZeros = false;
  const nonZeroDiffs: number[] = [];

  for (let i = 0; i < a.items.length; i++) {
    const itemA = a.items[i];
    const itemB = b.items[i];
    if (!itemA || !itemB) continue;
    const va = extractMetric(itemA, opts.metric);
    const vb = extractMetric(itemB, opts.metric);
    if (va === null || vb === null) continue;
    const d = va - vb;
    if (d === 0) {
      hadZeros = true;
    } else {
      nonZeroDiffs.push(d);
    }
  }

  const n = nonZeroDiffs.length;
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

  const absDiffs = nonZeroDiffs.map(Math.abs);
  const ranks = averageRanks(absDiffs);

  let wPlus = 0;
  let wMinus = 0;
  for (let i = 0; i < nonZeroDiffs.length; i++) {
    if ((nonZeroDiffs[i] ?? 0) > 0) wPlus += ranks[i] ?? 0;
    else wMinus += ranks[i] ?? 0;
  }

  const W = wPlus;
  const totalW = wPlus + wMinus;
  const effectSize = totalW > 0 ? (wPlus - wMinus) / totalW : 0;

  // P-value selection:
  // 1. No zeros, no ties in |d_i|: exact DP over integer ranks 1..n.
  //    Matches scipy.stats.wilcoxon(method="exact") for n <= 50 no-zeros data.
  //    O(n^3) so fast for any practical n.
  // 2. No zeros, has ties, n < 20: exact enumeration with actual fractional ranks.
  // 3. No zeros, has ties, n >= 20: normal approximation without continuity correction.
  // 4. Has zeros: normal approximation without continuity correction.
  //    scipy falls back to approx (no correction) when zeros are dropped.
  let pValue: number;
  if (!hadZeros && !detectTies(absDiffs)) {
    pValue = exactNTiesPValue(Math.round(wPlus), n);
  } else if (!hadZeros && n < 20) {
    pValue = exactEnumPValue(wPlus, n, ranks);
  } else {
    pValue = normalApproxPValue(wPlus, n, ranks);
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
