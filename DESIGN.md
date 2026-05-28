# Design notes

This document explains why `reliability-eval` is built the way it is. It is about the reasoning behind the decisions, not the API surface; for usage, see the README and the docs.

## The problem it solves

Most LLM evaluation tooling answers one question: how often is the model right? That is necessary but not sufficient. In a production system, a model that is right 90% of the time and *knows* which 10% it is unsure about is far more useful than one that is right 90% of the time and is equally, loudly confident about everything. The first model lets you route low-confidence cases to a human or a fallback. The second gives you no signal to act on.

That gap between a model's stated confidence and its actual accuracy is calibration, and it is the thing this library is built around. Accuracy tells you whether to trust the answer. Calibration tells you whether to trust the model's sense of its own answer, which is what you actually need when you are deciding where to put a human in the loop.

The existing JavaScript eval libraries treat calibration as an afterthought at best. None of them ship the paired statistical tests you need to make a defensible claim that one model or prompt is genuinely better than another rather than better by noise. That is the space this fills.

## Principles

A few ideas run through every decision below.

**Reproducible over clever.** Anything statistical is validated against `scipy.stats`, the reference implementation most people will check against. If a result here disagrees with scipy, that is a bug, not a feature. This is what makes the numbers trustworthy enough to put in a paper or a decision document.

**Small and honest over broad and vague.** v0.1 does a few things and says plainly what it does not do. A focused library that is correct is more useful than a sprawling one that is approximately right in many directions.

**No hidden dependencies on a provider's roadmap.** The library talks to model APIs over plain HTTP and keeps the provider interface tiny, so it does not break when an SDK changes and does not lock anyone into a particular vendor.

## Why these metrics

The library reports accuracy, expected calibration error, and Brier score.

Accuracy is the baseline everyone already understands. Expected calibration error (ECE) is the headline calibration number: it bins predictions by stated confidence and measures, within each bin, how far the model's confidence sits from its actual accuracy. A well-calibrated model that says "80% confident" is right about 80% of the time, and ECE near zero reflects that. Brier score is the complementary view, a single proper scoring rule over confidence and correctness that rewards being both accurate and appropriately confident at the item level.

Three metrics, deliberately. Log-loss, maximum calibration error, and post-hoc recalibration methods like Platt scaling are all reasonable additions, but they are refinements on the same idea. Shipping the core three correctly matters more than shipping ten that nobody has checked.

## Why these statistical tests

Comparing two models on the same dataset is a paired problem: each item is scored by both models, so the comparison is within-item, not between two independent groups. The Wilcoxon signed-rank test is the right tool for that. It is non-parametric, so it makes no assumption that score differences are normally distributed, which matters because eval scores are usually discrete and skewed rather than Gaussian. The effect size reported alongside the p-value is the rank-biserial correlation, because a p-value alone tells you whether a difference is real, not whether it is large enough to care about.

Spearman rank correlation answers a different question: does the model's confidence actually track whether it was right? A positive Spearman rho between confidence and correctness is the rank-based, outlier-robust way of saying the model's confidence carries real signal. If that correlation is near zero, the confidence numbers are decorative.

Both implementations are checked against scipy reference values committed in the test fixtures, to within 1e-4. That validation is the reason to trust this over a hand-rolled formula.

## The Wilcoxon implementation

The signed-rank test has more edge cases than its textbook formula suggests, so the implementation dispatches across three paths depending on the input:

When there are no tied absolute differences, the exact null distribution is computed with a subset-sum dynamic program over the integer ranks. This is exact at any practical sample size without the exponential blowup of enumerating every sign assignment, and it matches scipy's exact mode. At moderate sample sizes the normal approximation still carries a tail error large enough to matter, so computing the exact distribution is worth the small cost.

When there are ties but the sample is small, the exact distribution is computed by enumerating sign assignments over the actual fractional ranks, since ties break the clean integer structure the dynamic program relies on.

Otherwise (ties at larger sample sizes, or any zero differences), the normal approximation is used, with the standard tie correction in the variance. Worth noting: the tie correction divides by 48, which is specific to the signed-rank test. The superficially similar Mann-Whitney correction divides by 12, and conflating the two is a common and silent source of wrong answers.

One deliberate choice about that approximation: it does not apply a continuity correction, which matches the default behavior of `scipy.stats.wilcoxon`. Since most users will sanity-check results against scipy, matching its defaults is more valuable than following the textbook continuity-corrected form and producing numbers that look wrong by comparison.

## Why direct HTTP instead of provider SDKs

Each provider is reached with a direct `fetch` call rather than the official Anthropic or OpenAI SDK. SDKs pull in their own dependency trees, change on their own schedules, and would couple this library's release cycle to theirs. The actual request and response shapes are stable and simple. Keeping them in-house means the install is tiny, there is nothing to break on an SDK major version, and the surface that touches credentials is small enough to audit. API keys are read from environment variables, never logged, and never placed in the raw response objects the library hands back.

## Why the provider interface is small

A provider is essentially one method: take a prompt, return text plus the raw response. That minimalism is intentional. It means plugging in a local model through Ollama or vLLM, or any custom endpoint, takes a few lines and no permission from this library. A calibration tool is far more useful if it can evaluate whatever you are actually running, not only the two hosted vendors that ship today.

## On confidence elicitation, honestly

The default way the library obtains a confidence value is to append a short instruction asking the model to state a number between 0 and 1, then parse it. This is the simplest thing that works, and it is also known to be poorly calibrated on most current models, which tend to cluster near the top of the scale regardless of whether they are right.

That limitation is documented prominently rather than hidden, because a calibration library that pretended verbal confidence was reliable would be undermining its own premise. The honest framing is the point: the library gives you the machinery to measure calibration, and elicitation strategy is a knob you are expected to think about. Sampling-based agreement and token log-probabilities are better signals where they are available, and the provider interface is open enough to support them.

## A note on the scoring convention

A score of exactly 1 counts as correct; anything less counts as incorrect for the accuracy metric. Scorers may return continuous values in the unit interval, and that raw value is preserved on each item for use in the paired comparison, but the binary accuracy figure uses the strict cutoff. This keeps accuracy unambiguous while still letting a continuous scorer feed the significance test.

## Scope, and what is intentionally left out

v0.1 ships three metrics, two statistical tests, one exact-match scorer, and two hosted providers, with no CLI and no streaming. Everything excluded was excluded on purpose. The failure mode for a project like this is to keep adding surface area until nothing is solid; the discipline of shipping a small correct core first is itself a design decision.

Likely directions for later versions, roughly in order: bootstrap confidence intervals around the metrics, log-loss and maximum calibration error, a fuzzy and an LLM-as-judge scorer, sampling-based and log-probability-based confidence elicitation, and a thin CLI for running evals from a config file. None of these change the core contract; they build on it.
