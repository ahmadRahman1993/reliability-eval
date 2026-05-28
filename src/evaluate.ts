import { defaultConfidenceElicitor } from "./elicitation/index.js";
import { computeAccuracy, computeBrier, computeCalibration } from "./metrics/index.js";
import type {
  ConfidenceElicitor,
  EvaluateOptions,
  EvaluateResult,
  ResultItem,
} from "./types.js";

async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  onDone?: (done: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]!();
      done++;
      onDone?.(done, tasks.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function evaluate<TInput = string, TExpected = string>(
  opts: EvaluateOptions<TInput, TExpected>,
): Promise<EvaluateResult> {
  const {
    provider,
    dataset,
    scorer,
    elicitConfidence = false,
    bins = 10,
    concurrency = 4,
    onProgress,
  } = opts;

  let elicitor: ConfidenceElicitor | null = null;
  if (elicitConfidence === true) {
    elicitor = defaultConfidenceElicitor();
  } else if (elicitConfidence !== false && elicitConfidence !== undefined) {
    elicitor = elicitConfidence;
  }

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const tasks = dataset.map((row) => async (): Promise<ResultItem> => {
    const rawPrompt =
      typeof row.input === "string" ? row.input : JSON.stringify(row.input);
    const prompt = elicitor ? elicitor.buildPrompt(rawPrompt) : rawPrompt;

    const response = await provider.generate(prompt);

    let predicted: string;
    let confidence: number | null = null;

    if (elicitor) {
      const parsed = elicitor.parse(response.text);
      predicted = parsed.answer;
      confidence = parsed.confidence;
    } else {
      predicted = response.text;
    }

    const score = scorer.score(predicted, row.expected);
    const correct = score >= 1;

    return {
      id: row.id,
      input: row.input,
      expected: row.expected,
      predicted,
      confidence,
      correct,
      score,
      raw: response.raw,
    };
  });

  const items = await runConcurrent(tasks, concurrency, onProgress);

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const accuracy = computeAccuracy(items);
  const brier = computeBrier(items);
  const { ece, curve } = computeCalibration(items, bins);

  return {
    metrics: { accuracy, ece, brier, n: items.length },
    calibrationCurve: curve,
    items,
    meta: {
      provider: provider.name,
      model: provider.model,
      startedAt,
      finishedAt,
      durationMs,
    },
  };
}
