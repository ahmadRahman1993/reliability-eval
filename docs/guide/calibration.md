# Calibration

## What is calibration?

A model is **well-calibrated** if, when it says it is 70% confident, it is correct about 70% of the time. Calibration is a property of confidence scores, not just accuracy. A model can be highly accurate while being badly calibrated (always outputting confidence 0.99) or badly accurate while being well-calibrated (always outputting confidence 0.3 when it is wrong 70% of the time).

## Expected Calibration Error (ECE)

ECE is the most common summary statistic for calibration. It works by partitioning predictions into confidence bins, measuring the gap between mean confidence and accuracy in each bin, and taking a weighted average.

```
ECE = sum_b (|b| / n) * |mean_confidence(b) - accuracy(b)|
```

- `|b|` is the number of items in bin `b`
- `n` is the total number of items with a confidence value
- The sum is over all non-empty bins

**Interpretation:** An ECE of 0 means the model is perfectly calibrated. An ECE of 0.1 means that on average, the model's stated confidence is off by 10 percentage points. Values above 0.15 are generally considered poor calibration.

Items with `confidence: null` are excluded from ECE. If no items have a confidence value, ECE is returned as 0.

## Brier Score

The Brier score is the mean squared error between the model's confidence and the true outcome (1 for correct, 0 for wrong):

```
Brier = (1/n) * sum_i (confidence_i - outcome_i)^2
```

**Interpretation:** Lower is better. A perfect score is 0. A model that always outputs 0.5 scores 0.25. The maximum is 1. The Brier score penalizes both poor calibration and wrong predictions. Unlike ECE, it is a proper scoring rule: the score is minimized when and only when the confidence equals the true probability.

Items with `confidence: null` are excluded. If no items have confidence, `brier` is returned as `null`.

## Verbal confidence elicitation: an important caveat

When you set `elicitConfidence: true`, `reliability-eval` appends this to the user's prompt:

```
Respond in this exact format:
ANSWER: <your answer>
CONFIDENCE: <a number between 0 and 1 representing how confident you are>
```

**This approach is known to produce poorly calibrated confidence scores on most current LLMs.** Verbal self-reported confidence tends to be overconfident and inconsistent across phrasings. Use it as a rough signal, not a reliable probability estimate.

For production calibration work, consider these alternatives, which are not yet built into v0.1:

- **Sampling-based:** Generate N completions with temperature > 0, use the fraction that agree as the confidence estimate.
- **Logprob-based:** Where supported by the API, use the log-probability of the first token of the answer as a proxy for confidence. This is more principled but only works for constrained answer spaces.
- **Bring your own elicitor:** Pass a custom `ConfidenceElicitor` object instead of `true` to `elicitConfidence`.

## Reliability diagram

The reliability diagram (produced by `plotCalibration`) plots mean confidence on the x-axis against accuracy on the y-axis for each bin. A perfectly calibrated model falls on the diagonal. Points above the diagonal mean the model is underconfident; points below mean overconfident.

```ts
import { plotCalibration } from "reliability-eval/plot";

const svg = plotCalibration(result, { title: "My Model" });
// Write to disk:
import { writeFileSync } from "fs";
writeFileSync("reliability.svg", svg);
```
