export { evaluate } from "./evaluate.js";
export { compare, correlate } from "./compare.js";

export * as providers from "./providers/index.js";
export * as scorers from "./scorers/index.js";

export type {
  Provider,
  ProviderResponse,
  Scorer,
  ConfidenceElicitor,
  EvaluateOptions,
  EvaluateResult,
  EvaluateMetrics,
  EvaluateMeta,
  CalibrationBin,
  ResultItem,
  CompareOptions,
  CompareResult,
  CorrelateOptions,
  CorrelateResult,
} from "./types.js";

export { ProviderError } from "./types.js";
