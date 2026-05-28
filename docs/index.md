---
layout: home

hero:
  name: reliability-eval
  text: Calibration-first LLM evaluation
  tagline: Not just "did the model get it right?" but "can you trust how confident it was?"
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/

features:
  - title: Calibration metrics
    details: Expected Calibration Error (ECE) and Brier score alongside accuracy, computed per-run with per-bin breakdown.
  - title: Rigorous comparison
    details: Wilcoxon signed-rank test for paired model comparisons; Spearman rank correlation for confidence vs. accuracy. Both validated against scipy.stats reference values.
  - title: Zero heavy dependencies
    details: Providers use raw fetch (no SDK). Statistics are pure TypeScript. The core package has no runtime dependencies.
---
