# Getting Started

## Requirements

- Node >= 22
- An Anthropic or OpenAI API key (for the built-in providers)

## Install

```bash
npm install reliability-eval
# or
pnpm add reliability-eval
```

## Your first evaluation

```ts
import { evaluate, providers, scorers } from "reliability-eval";

const dataset = [
  { id: "q0", input: "Capital of France?", expected: "Paris" },
  { id: "q1", input: "2 + 2?",             expected: "4" },
  { id: "q2", input: "Largest ocean?",     expected: "Pacific" },
];

const result = await evaluate({
  provider: providers.anthropic({ model: "claude-3-haiku-20240307" }),
  dataset,
  scorer: scorers.exact({ caseSensitive: false }),
});

console.log(result.metrics);
// { accuracy: 1, ece: 0, brier: null, n: 3 }
```

The `provider` field accepts any object with a `generate(prompt, opts?)` method, so you can wrap any model.

## Eliciting confidence

Pass `elicitConfidence: true` to append a structured prompt asking for a confidence score:

```ts
const result = await evaluate({
  provider: providers.anthropic({ model: "claude-3-haiku-20240307" }),
  dataset,
  scorer: scorers.exact({ caseSensitive: false }),
  elicitConfidence: true,
});

console.log(result.metrics);
// { accuracy: 0.9, ece: 0.11, brier: 0.14, n: 3 }
```

Each item will have a `confidence` field (0-1) or `null` if the model did not follow the format. See the [Calibration guide](./calibration) for important caveats about verbal confidence elicitation.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | `Provider` | required | Model to call |
| `dataset` | `Array<{id, input, expected}>` | required | Items to evaluate |
| `scorer` | `Scorer` | required | Function mapping (predicted, expected) to [0,1] |
| `elicitConfidence` | `boolean \| ConfidenceElicitor` | `false` | Append confidence prompt |
| `bins` | `number` | `10` | Number of calibration bins |
| `concurrency` | `number` | `4` | Parallel provider calls |
| `onProgress` | `(done, total) => void` | - | Progress callback |

## The result shape

```ts
{
  metrics: {
    accuracy: number;      // fraction of correct items
    ece: number;           // expected calibration error
    brier: number | null;  // mean squared error of confidence (null if no confidence)
    n: number;             // total items
  },
  calibrationCurve: Array<{
    bin: number;
    binLowerBound: number;
    binUpperBound: number;
    meanConfidence: number;
    accuracy: number;
    count: number;
  }>,
  items: Array<{
    id: string;
    input: unknown;
    expected: unknown;
    predicted: unknown;
    confidence: number | null;
    correct: boolean;
    score: number;
    raw: unknown;
  }>,
  meta: {
    provider: string;
    model: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  }
}
```
