export interface ProviderResponse {
  text: string;
  raw: unknown;
}

export interface Provider {
  name: string;
  model: string;
  generate(
    prompt: string,
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<ProviderResponse>;
}

export interface Scorer<TExpected = unknown> {
  name: string;
  score(predicted: string, expected: TExpected): number;
}

export interface ConfidenceElicitor {
  buildPrompt(original: string): string;
  parse(response: string): { answer: string; confidence: number | null };
}

export interface CalibrationBin {
  bin: number;
  binLowerBound: number;
  binUpperBound: number;
  meanConfidence: number;
  accuracy: number;
  count: number;
}

export interface ResultItem {
  id: string;
  input: unknown;
  expected: unknown;
  predicted: unknown;
  confidence: number | null;
  correct: boolean;
  score: number;
  raw: unknown;
}

export interface EvaluateMetrics {
  accuracy: number;
  ece: number;
  brier: number | null;
  n: number;
}

export interface EvaluateMeta {
  provider: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface EvaluateResult {
  metrics: EvaluateMetrics;
  calibrationCurve: CalibrationBin[];
  items: ResultItem[];
  meta: EvaluateMeta;
}

export interface EvaluateOptions<TInput = string, TExpected = string> {
  provider: Provider;
  dataset: Array<{ id: string; input: TInput; expected: TExpected }>;
  scorer: Scorer<TExpected>;
  elicitConfidence?: boolean | ConfidenceElicitor;
  bins?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface CompareOptions {
  test: "wilcoxon";
  metric: "score" | "brier" | "confidence" | ((item: ResultItem) => number);
  alpha?: number;
}

export interface CompareResult {
  test: "wilcoxon";
  statistic: number;
  pValue: number;
  significant: boolean;
  n: number;
  effectSize: number;
  alpha: number;
}

export interface CorrelateOptions {
  test: "spearman";
  x: "confidence" | ((item: ResultItem) => number);
  y: "correct" | "score" | ((item: ResultItem) => number);
  alpha?: number;
}

export interface CorrelateResult {
  test: "spearman";
  rho: number;
  pValue: number;
  significant: boolean;
  n: number;
  alpha: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
