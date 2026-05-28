# Comparing Models

## The problem with comparing accuracy

Suppose model A gets 73% accuracy and model B gets 71%. Is model A better? Maybe, but without a significance test you cannot tell. The difference might be noise, especially on small datasets.

`reliability-eval` ships two non-parametric tests for making rigorous claims:

- `compare()`: Wilcoxon signed-rank test for paired samples (are two models different?)
- `correlate()`: Spearman rank correlation (does confidence track correctness?)

## Wilcoxon signed-rank test

The Wilcoxon test is a paired, non-parametric alternative to the paired t-test. Non-parametric means it does not assume that the differences are normally distributed, which matters when your metric values are discrete (0 or 1 per item).

**Requirements:** Both results must have the same item ids in the same order. The test pairs items by id position, so the order must match.

```ts
import { compare } from "reliability-eval";

const result = compare(resultA, resultB, {
  test: "wilcoxon",
  metric: "score",   // or "brier", "confidence", or a custom function
  alpha: 0.05,
});

console.log(result);
// {
//   test: "wilcoxon",
//   statistic: 42,       // W+ (sum of positive ranks)
//   pValue: 0.031,
//   significant: true,
//   n: 38,               // pairs after dropping zero differences
//   effectSize: 0.42,    // rank-biserial correlation, range [-1, 1]
//   alpha: 0.05
// }
```

**Interpreting the result:**

- `pValue`: the probability of observing this test statistic or more extreme under the null hypothesis (no difference). Standard threshold is 0.05.
- `significant`: `true` if `pValue < alpha`.
- `effectSize`: rank-biserial correlation. Values near 1 mean model A almost always scores higher; values near -1 mean model B almost always scores higher; values near 0 mean no consistent direction.
- `n`: the number of item pairs that had a non-zero difference. If `n` is small (less than 10), results are unreliable.

**Choosing a metric:**

| Metric | When to use |
|---|---|
| `"score"` | When you care about which model gets the right answer more often |
| `"confidence"` | When you want to compare calibration behavior (requires confidence elicitation) |
| `"brier"` | When you want a combined accuracy + calibration comparison |
| Custom function | For any derived per-item quantity |

**Exact vs. normal approximation:**

For small n (< 20) with no dropped zero-differences, the implementation uses the exact permutation distribution. For larger n or when zero differences were dropped, it uses a normal approximation with tie correction, matching scipy.stats behavior.

## Spearman rank correlation

Spearman's rho measures the monotonic association between two per-item quantities. The most useful application is testing whether a model's confidence actually tracks its accuracy.

```ts
import { correlate } from "reliability-eval";

const result = correlate(evalResult, {
  test: "spearman",
  x: "confidence",  // or a custom function
  y: "score",       // or "correct", or a custom function
  alpha: 0.05,
});

console.log(result);
// {
//   test: "spearman",
//   rho: 0.34,          // rank correlation, range [-1, 1]
//   pValue: 0.021,
//   significant: true,
//   n: 50,
//   alpha: 0.05
// }
```

**Interpreting rho:**

- `rho > 0`: items where the model is more confident tend to be the ones it gets right.
- `rho = 0`: confidence is unrelated to correctness. The model does not know what it does not know.
- `rho < 0`: higher confidence predicts worse accuracy (actively miscalibrated).

A model can have high accuracy and low rho (it gets things right but not because it is confident), or low accuracy and high rho (it knows what it does not know, but does not know much).

For n >= 10, the p-value uses the t-distribution approximation: `t = rho * sqrt((n-2)/(1-rho^2))` with n-2 degrees of freedom.

## Dataset size considerations

| n (items) | Notes |
|---|---|
| < 10 | Results are unreliable; treat as exploratory only |
| 10 - 50 | Adequate for large effects; may miss moderate ones |
| 50 - 200 | Good statistical power for moderate effects |
| 200+ | Can detect small effects reliably |

For calibration metrics (ECE, Brier), you generally need at least 100 items with confidence values to get stable per-bin estimates.
