# API Reference

## `evaluate(opts)`

Runs a dataset through a provider and returns metrics, calibration data, and per-item results.

```ts
import { evaluate } from "reliability-eval";

const result = await evaluate(opts: EvaluateOptions): Promise<EvaluateResult>;
```

### `EvaluateOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `provider` | `Provider` | required | Model wrapper |
| `dataset` | `Array<{id: string, input: TInput, expected: TExpected}>` | required | Items to evaluate |
| `scorer` | `Scorer<TExpected>` | required | Scoring function |
| `elicitConfidence` | `boolean \| ConfidenceElicitor` | `false` | Append confidence prompt |
| `bins` | `number` | `10` | Calibration bins |
| `concurrency` | `number` | `4` | Max parallel provider calls |
| `onProgress` | `(done: number, total: number) => void` | - | Progress callback |

### `EvaluateResult`

```ts
interface EvaluateResult {
  metrics: {
    accuracy: number;        // [0, 1]
    ece: number;             // expected calibration error, [0, 1]
    brier: number | null;    // null if no confidence elicited
    n: number;
  };
  calibrationCurve: Array<{
    bin: number;
    binLowerBound: number;
    binUpperBound: number;
    meanConfidence: number;
    accuracy: number;
    count: number;
  }>;
  items: Array<{
    id: string;
    input: unknown;
    expected: unknown;
    predicted: unknown;
    confidence: number | null;
    correct: boolean;
    score: number;
    raw: unknown;
  }>;
  meta: {
    provider: string;
    model: string;
    startedAt: string;   // ISO 8601
    finishedAt: string;
    durationMs: number;
  };
}
```

---

## `compare(a, b, opts)`

Wilcoxon signed-rank test comparing two paired `EvaluateResult` objects.

```ts
import { compare } from "reliability-eval";

const result = compare(a: EvaluateResult, b: EvaluateResult, opts: CompareOptions): CompareResult;
```

Throws if `a` and `b` do not have the same item ids in the same order.

### `CompareOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `test` | `"wilcoxon"` | required | Test type (only Wilcoxon in v0.1) |
| `metric` | `"score" \| "brier" \| "confidence" \| (item) => number` | required | Per-item value to compare |
| `alpha` | `number` | `0.05` | Significance threshold |

### `CompareResult`

```ts
interface CompareResult {
  test: "wilcoxon";
  statistic: number;    // W+ (sum of positive ranks)
  pValue: number;       // two-sided
  significant: boolean;
  n: number;            // pairs after dropping zero differences
  effectSize: number;   // rank-biserial correlation, [-1, 1]
  alpha: number;
}
```

---

## `correlate(result, opts)`

Spearman rank correlation between two per-item quantities.

```ts
import { correlate } from "reliability-eval";

const result = correlate(result: EvaluateResult, opts: CorrelateOptions): CorrelateResult;
```

### `CorrelateOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `test` | `"spearman"` | required | Correlation type (only Spearman in v0.1) |
| `x` | `"confidence" \| (item) => number` | required | X variable |
| `y` | `"correct" \| "score" \| (item) => number` | required | Y variable |
| `alpha` | `number` | `0.05` | Significance threshold |

### `CorrelateResult`

```ts
interface CorrelateResult {
  test: "spearman";
  rho: number;          // [-1, 1]
  pValue: number;
  significant: boolean;
  n: number;
  alpha: number;
}
```

---

## `providers`

Factory functions returning a `Provider`. API keys are read from environment variables by default.

```ts
import { providers } from "reliability-eval";

// reads ANTHROPIC_API_KEY from env
const p = providers.anthropic({ model: "claude-3-haiku-20240307" });

// reads OPENAI_API_KEY from env
const p = providers.openai({ model: "gpt-4o-mini" });

// override key explicitly
const p = providers.anthropic({ model: "claude-3-5-sonnet-20241022", apiKey: "sk-..." });
```

Both providers retry on HTTP 429 and 5xx with exponential backoff (max 3 retries). They throw a `ProviderError` on permanent failures.

### `Provider` interface

```ts
interface Provider {
  name: string;
  model: string;
  generate(
    prompt: string,
    opts?: { maxTokens?: number; temperature?: number }
  ): Promise<ProviderResponse>;
}

interface ProviderResponse {
  text: string;
  raw: unknown;  // sanitized metadata (no API keys)
}
```

---

## `scorers`

```ts
import { scorers } from "reliability-eval";

scorers.exact(opts?: {
  caseSensitive?: boolean;  // default false
  trim?: boolean;           // default true
}): Scorer<string>
```

Returns 1 if `predicted === expected` (after applying case and trim normalization), 0 otherwise.

---

## `plotCalibration(result, opts)` (subpath import)

Returns an SVG string. No file I/O is performed.

```ts
import { plotCalibration } from "reliability-eval/plot";

const svg: string = plotCalibration(result, {
  title?: string;   // default "Reliability Diagram"
  width?: number;   // default 600
  height?: number;  // default 600
});
```

---

## `ProviderError`

Thrown by providers on non-retryable HTTP errors.

```ts
import { ProviderError } from "reliability-eval";

try {
  await provider.generate("...");
} catch (err) {
  if (err instanceof ProviderError) {
    console.log(err.status, err.body);
  }
}
```
