import { spearmanTest } from "./stats/index.js";
import { wilcoxonTest } from "./stats/index.js";
import type {
  CompareOptions,
  CompareResult,
  CorrelateOptions,
  CorrelateResult,
  EvaluateResult,
} from "./types.js";

export function compare(a: EvaluateResult, b: EvaluateResult, opts: CompareOptions): CompareResult {
  return wilcoxonTest(a, b, opts);
}

export function correlate(result: EvaluateResult, opts: CorrelateOptions): CorrelateResult {
  return spearmanTest(result, opts);
}
