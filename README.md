# reliability-eval

[![npm version](https://img.shields.io/npm/v/reliability-eval)](https://www.npmjs.com/package/reliability-eval)
[![CI](https://github.com/ahmadRahman1993/reliability-eval/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmadRahman1993/reliability-eval/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Calibration-first LLM evaluation for Node/TypeScript.** Most eval tools measure accuracy and call it done. `reliability-eval` adds the question that matters in production: *can you trust the model's confidence?* It ships ECE, Brier score, and the paired non-parametric tests (Wilcoxon signed-rank, Spearman rank correlation) needed to make rigorous "model A is significantly better than model B" claims.

Wilcoxon and Spearman implementations are validated against `scipy.stats` reference values; see [tests/fixtures/reference-stats.json](tests/fixtures/reference-stats.json).

---

## Install

```bash
npm install reliability-eval
# or
pnpm add reliability-eval
```

**Node >= 22 required.**

---

## 30-second quickstart

```ts
import { evaluate, compare, providers, scorers } from "reliability-eval";

const dataset = [
  { id: "q0", input: "Capital of France?", expected: "Paris" },
  { id: "q1", input: "2 + 2?",             expected: "4" },
  // ...
];

// Evaluate model A
const resultA = await evaluate({
  provider: providers.anthropic({ model: "claude-3-haiku-20240307" }),
  dataset,
  scorer: scorers.exact({ caseSensitive: false }),
  elicitConfidence: true,   // appends a confidence prompt and parses the response
});

console.log(resultA.metrics);
// { accuracy: 0.9, ece: 0.08, brier: 0.12, n: 10 }

// Evaluate model B on the same dataset
const resultB = await evaluate({
  provider: providers.openai({ model: "gpt-4o-mini" }),
  dataset,
  scorer: scorers.exact({ caseSensitive: false }),
});

// Paired significance test
const test = compare(resultA, resultB, { test: "wilcoxon", metric: "score" });
console.log(test.pValue, test.significant, test.effectSize);

// Confidence-accuracy correlation
import { correlate } from "reliability-eval";
const corr = correlate(resultA, { test: "spearman", x: "confidence", y: "score" });
console.log(corr.rho, corr.pValue);

// Reliability diagram (SVG string, no file I/O)
import { plotCalibration } from "reliability-eval/plot";
const svg = plotCalibration(resultA, { title: "My Model", width: 600, height: 600 });
```

---

## Docs

**[reliability-eval.pages.dev](https://reliability-eval.pages.dev)**

- [Getting started](https://reliability-eval.pages.dev/guide/getting-started)
- [What is calibration?](https://reliability-eval.pages.dev/guide/calibration)
- [Comparing models](https://reliability-eval.pages.dev/guide/comparing-models)
- [API reference](https://reliability-eval.pages.dev/api/)

---

## v0.1 limitations

This is a focused v0.1. The following are explicitly out of scope and planned for later:

- **No CLI.** Library only.
- **One scorer:** `exact`. No fuzzy match, no LLM-as-judge, no ROUGE/BLEU.
- **Two stat tests:** Wilcoxon and Spearman only. No t-tests, bootstrap CIs, or ANOVA.
- **Three metrics:** accuracy, ECE, Brier only. No log-loss, MCE, Platt scaling.
- **Single-string outputs only.** No multi-class, no structured outputs.
- **Confidence elicitation is verbal** (appended prompt). This is known to be poorly calibrated on most current models. See [docs/guide/calibration.md](docs/guide/calibration.md) for caveats and alternatives.
- **No streaming.** Each `generate()` call waits for the full response.

---

## License

MIT
