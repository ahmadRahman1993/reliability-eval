# Build `reliability-eval`: Claude Code Instructions

You are building an open-source TypeScript npm package called `reliability-eval`. This document is your full spec. Follow it precisely. Where it says "decide for yourself," use your judgment. Where it specifies, do not deviate.

---

## 1. Mission

Ship a calibration-first LLM evaluation library for Node/TypeScript. The gap in the ecosystem is that existing JS eval tools (promptfoo, evalite, autoevals) focus on accuracy and pass/fail. None of them treat calibration as a first-class concern, and none ship the paired non-parametric tests needed to make rigorous "model A is significantly better than model B" claims. We are filling that gap.

Target user: applied ML engineers and researchers running LLMs in production who need to evaluate not just whether the model is right, but whether its confidence is trustworthy.

---

## 2. Tech Stack (Decided, Do Not Change)

- **Language:** TypeScript, strict mode, ESM output with CJS compat via tsup
- **Node:** >= 22 (Node 20 reached end-of-life April 30 2026; 22 is the oldest supported LTS, 24 is the current Active LTS). Set `"engines": { "node": ">=22" }` in package.json.
- **Package manager:** pnpm
- **Bundler:** tsup
- **Tests:** Vitest
- **Lint/format:** Biome (single tool, not ESLint+Prettier)
- **Versioning/release:** Changesets
- **Docs site:** Vitepress
- **CI:** GitHub Actions
- **License:** MIT

Do not add Zod, Effect, or other heavy runtime dependencies. Keep the core dependency footprint near zero. Statistics must be implemented in pure TypeScript, not by wrapping a Python or C library.

---

## 3. Pre-flight Checklist

Before generating any code:

1. Check npm registry for name availability via `npm view reliability-eval`. If taken, try in order: `llm-calibration`, `calibration-eval`, `reliability-bench`. Use the first available. Document the choice.
2. Confirm Node >= 22 in the environment (Node 20 is EOL as of April 30 2026). Prefer Node 24, the current Active LTS, for development.
3. Set up a fresh git repo with `main` as the default branch.

---

## 4. Repo Structure

Create exactly this layout:

```
reliability-eval/
├── src/
│   ├── index.ts              # Public API surface
│   ├── evaluate.ts           # Main evaluate() function
│   ├── compare.ts            # compare() and correlate()
│   ├── types.ts              # Shared types
│   ├── metrics/
│   │   ├── index.ts
│   │   ├── accuracy.ts
│   │   ├── brier.ts
│   │   ├── calibration.ts    # ECE + reliability bins
│   │   └── metrics.test.ts
│   ├── stats/
│   │   ├── index.ts
│   │   ├── wilcoxon.ts
│   │   ├── spearman.ts
│   │   ├── ranking.ts        # shared rank helpers
│   │   └── stats.test.ts
│   ├── providers/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── anthropic.ts
│   │   └── openai.ts
│   ├── scorers/
│   │   ├── index.ts
│   │   ├── exact.ts
│   │   └── scorers.test.ts
│   ├── elicitation/
│   │   ├── index.ts
│   │   └── confidence.ts     # confidence elicitation prompt + parser
│   └── plot/
│       ├── index.ts
│       └── calibration.ts    # SVG reliability diagram
├── tests/
│   ├── integration.test.ts   # mocked provider end-to-end
│   └── fixtures/
│       └── reference-stats.json   # scipy-validated reference values
├── scripts/
│   └── generate-reference-stats.py # produces reference-stats.json via scipy
├── examples/
│   ├── basic.ts
│   ├── compare-models.ts
│   └── from-csv.ts
├── docs/                     # Vitepress site
│   ├── .vitepress/config.ts
│   ├── index.md
│   ├── guide/
│   │   ├── getting-started.md
│   │   ├── calibration.md
│   │   └── comparing-models.md
│   └── api/
│       └── index.md
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── release.yml
│       └── docs.yml
├── .changeset/
│   └── config.json
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── biome.json
├── .gitignore
├── .npmignore
├── LICENSE
├── README.md
└── CONTRIBUTING.md
```

---

## 5. Public API Contract

The exported API must match these signatures exactly. This is the contract; users will depend on it.

### `evaluate`

```ts
export interface EvaluateOptions<TInput = string, TExpected = string> {
  provider: Provider;
  dataset: Array<{ id: string; input: TInput; expected: TExpected }>;
  scorer: Scorer<TExpected>;
  elicitConfidence?: boolean | ConfidenceElicitor;
  bins?: number;                 // default 10
  concurrency?: number;          // default 4
  onProgress?: (done: number, total: number) => void;
}

export interface EvaluateResult {
  metrics: {
    accuracy: number;            // [0, 1]
    ece: number;                 // expected calibration error, [0, 1]
    brier: number | null;        // null if no confidence elicited
    n: number;
  };
  calibrationCurve: Array<{
    bin: number;                 // 0..bins-1
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
    score: number;               // typically 0 or 1, but scorers can return continuous
    raw: unknown;                // raw provider response
  }>;
  meta: {
    provider: string;
    model: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  };
}

export function evaluate(opts: EvaluateOptions): Promise<EvaluateResult>;
```

### `compare`

```ts
export interface CompareOptions {
  test: 'wilcoxon';              // v0.1 ships only Wilcoxon
  metric: 'score' | 'brier' | 'confidence' | ((item: ResultItem) => number);
  alpha?: number;                // default 0.05
}

export interface CompareResult {
  test: 'wilcoxon';
  statistic: number;             // W
  pValue: number;                // two-sided
  significant: boolean;
  n: number;                     // pairs after dropping zero-diffs
  effectSize: number;            // rank-biserial correlation
  alpha: number;
}

export function compare(a: EvaluateResult, b: EvaluateResult, opts: CompareOptions): CompareResult;
```

Must throw if `a` and `b` don't share the same item ids in the same order (paired test requires pairing).

### `correlate`

```ts
export interface CorrelateOptions {
  test: 'spearman';              // v0.1 ships only Spearman
  x: 'confidence' | ((item: ResultItem) => number);
  y: 'correct' | 'score' | ((item: ResultItem) => number);
  alpha?: number;
}

export interface CorrelateResult {
  test: 'spearman';
  rho: number;                   // [-1, 1]
  pValue: number;
  significant: boolean;
  n: number;
  alpha: number;
}

export function correlate(result: EvaluateResult, opts: CorrelateOptions): CorrelateResult;
```

### Providers

```ts
export interface ProviderResponse {
  text: string;
  raw: unknown;
}

export interface Provider {
  name: string;
  model: string;
  generate(prompt: string, opts?: { maxTokens?: number; temperature?: number }): Promise<ProviderResponse>;
}

// Factory functions
providers.anthropic({ model: string; apiKey?: string }): Provider
providers.openai({ model: string; apiKey?: string }): Provider
```

Providers must read API keys from env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) by default. Never log keys. Never include keys in `raw` responses.

### Scorers

```ts
export interface Scorer<TExpected = unknown> {
  name: string;
  score(predicted: string, expected: TExpected): number; // [0, 1]
}

scorers.exact(opts?: { caseSensitive?: boolean; trim?: boolean }): Scorer<string>
```

### Plot

Separate subpath import so the core stays light:

```ts
import { plotCalibration } from 'reliability-eval/plot';

plotCalibration(result: EvaluateResult, opts: {
  title?: string;
  width?: number;       // default 600
  height?: number;      // default 600
}): string;             // returns SVG string
```

No file I/O in the plot function. Caller writes to disk if they want.

---

## 6. Implementation Notes (Critical Details)

### 6.1 Metrics

**Expected Calibration Error (ECE):** Standard binned ECE. Equal-width bins over [0, 1]. For each bin, |meanConfidence - accuracy| weighted by bin count. Return weighted mean. Items with `confidence === null` are excluded from ECE and Brier; return `ece: 0, brier: null` if no items have confidence.

**Brier Score:** Mean squared error between confidence and correctness (1 or 0). Only over items with confidence.

**Accuracy:** Mean of `correct` over all items.

### 6.2 Statistics

**Wilcoxon signed-rank (paired, two-sided):**
- Compute differences `d_i = a_i - b_i`
- Drop zero differences (Pratt or Wilcoxon variant: use Wilcoxon variant, i.e. exclude zeros)
- Rank `|d_i|`, handling ties via average rank
- W = sum of ranks where d_i > 0 (W+)
- For n >= 20 use normal approximation with continuity correction:
  - mean = n(n+1)/4
  - var = n(n+1)(2n+1)/24, minus tie correction
  - z = (W - mean - 0.5*sign) / sqrt(var)
  - two-sided p = 2 * (1 - Phi(|z|))
- For n < 20 use exact distribution. Implement via recursion or precompute up to n=20.
- Effect size: rank-biserial correlation = (W+ - W-) / (W+ + W-)

**Spearman rank correlation:**
- Rank x and y separately, average ranks for ties
- rho = Pearson correlation on ranks
- For n >= 10, p-value via t = rho * sqrt((n-2)/(1-rho^2)) ~ t(n-2)
- Two-sided p

**Normal and t-distribution CDFs:** Implement in pure TS. For normal CDF use Abramowitz & Stegun 7.1.26 approximation or erf via series. For t CDF use the incomplete beta function. Accuracy target: agree with scipy to 4 decimal places.

### 6.3 Reference validation

Write `scripts/generate-reference-stats.py` that uses scipy to compute Wilcoxon and Spearman on a fixed set of inputs and writes `tests/fixtures/reference-stats.json`. Commit both the script and the JSON. The TypeScript tests load the JSON and assert your implementations match scipy to within 1e-4 absolute tolerance.

Include at minimum these test cases:
- Small n (8 pairs), no ties
- Medium n (50 pairs), with ties
- Large n (500 pairs), with ties
- Spearman with perfectly monotonic data (rho = 1)
- Spearman with anti-correlated data (rho = -1)
- Spearman with random data and ties

This is the most important quality signal in the project. If reviewers find your stats are wrong, the package dies. Do this rigorously.

### 6.4 Confidence elicitation

Default elicitor when `elicitConfidence: true`:

Append to the user's prompt:

```
Respond in this exact format:
ANSWER: <your answer>
CONFIDENCE: <a number between 0 and 1 representing how confident you are>
```

Parser extracts both fields with tolerant regex. If CONFIDENCE is missing or unparseable, set `confidence: null` on the item and continue (do not throw).

Document clearly in `docs/guide/calibration.md` that verbal-confidence elicitation is known to be poorly calibrated for most current models and that users should consider alternative strategies (sampling-based, logprob-based) for production use. This honesty is a feature.

### 6.5 Concurrency

Implement via a small in-house p-limit equivalent. Do not add `p-limit` as a dependency. Each provider call is one unit of concurrency. Respect `onProgress` callback after each completed item.

### 6.6 Providers

Implement using `fetch` (stable built-in since Node 18, fully stable in 22+). No `@anthropic-ai/sdk` or `openai` SDK dependencies, since those would balloon install size and create version coupling. Direct HTTP calls only.

- Anthropic: POST to `https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01` header
- OpenAI: POST to `https://api.openai.com/v1/chat/completions`

Retry on 429 and 5xx with exponential backoff, max 3 retries. Throw a typed `ProviderError` on permanent failures with status code and body.

### 6.7 Plot

Pure SVG string generation, no D3 or other deps. Reliability diagram with:
- Diagonal reference line (perfect calibration)
- Points for each bin sized by count
- Connected line between bin points
- Axis labels, title, gridlines

Use a clean, minimal aesthetic. Inline styles in the SVG so it renders anywhere.

---

## 7. Tests Required

The package must ship with these tests passing:

1. **Stats validation** against scipy reference JSON (1e-4 tolerance)
2. **Metrics correctness** with hand-computed small examples (e.g., 4-item dataset where ECE and Brier are computable on paper)
3. **Scorer behavior** for exact match including edge cases (whitespace, case, empty strings)
4. **Provider tests** using `msw` or a manual fetch mock. Do not hit real APIs in CI. Test retry behavior and error handling.
5. **Integration test** using a mock provider, asserting end-to-end shape of `EvaluateResult` and that `compare` and `correlate` produce sane outputs.

Coverage target: 85%+ on `src/metrics`, `src/stats`, `src/scorers`. Lower bar acceptable for providers (mocking limits true coverage).

---

## 8. CI/CD

### `.github/workflows/ci.yml`
- Triggers: PR to main, push to main
- Matrix: Node 22, 24 on ubuntu-latest
- Steps: pnpm install, biome check, tsc --noEmit, vitest run with coverage, upload coverage artifact

### `.github/workflows/release.yml`
- Triggers: push to main
- Uses `changesets/action@v1`
- When a Version Packages PR is merged, auto-publish to npm using `NPM_TOKEN` secret
- Auto-create GitHub Release

### `.github/workflows/docs.yml`
- Triggers: push to main affecting `docs/**`
- Builds Vitepress, deploys to Cloudflare Pages (use `cloudflare/pages-action`) — leave deployment placeholder credentials as commented TODO since the user will configure this manually

Include a `.changeset/config.json` with `"access": "public"` and main branch.

---

## 9. Documentation

### README.md must include
- One-paragraph pitch
- Install instructions
- 30-second quickstart code block
- Link to docs site
- Calibration reference: "Wilcoxon and Spearman implementations validated against scipy.stats reference values; see tests/fixtures/reference-stats.json"
- License badge, npm version badge, CI status badge
- Honest "v0.1 limitations" section listing what is NOT yet supported

### Vitepress docs
- `index.md`: landing page
- `guide/getting-started.md`: install, first eval
- `guide/calibration.md`: what ECE means, what Brier means, the elicitation caveat
- `guide/comparing-models.md`: when to use Wilcoxon, interpreting effect sizes
- `api/index.md`: full API reference (can be auto-generated from JSDoc later, but for v0.1 write by hand)

Tone: clear, technical, no hype. Assume the reader knows what an LLM is. Do not assume they remember undergraduate stats. Define ECE and Brier in plain language.

### CONTRIBUTING.md
Standard contributor guide: how to set up, how to run tests, how to add a changeset, code of conduct link.

---

## 10. Examples

Three runnable example files in `examples/`:

1. `basic.ts`: 10-item dataset, evaluate with Anthropic, print metrics
2. `compare-models.ts`: same dataset, evaluate with Anthropic and OpenAI, compare with Wilcoxon, print result
3. `from-csv.ts`: load dataset from CSV, evaluate, write calibration SVG to disk

Examples should run via `pnpm tsx examples/basic.ts`. Add `tsx` to devDependencies.

---

## 11. Hard Constraints (Do Not Violate)

- **No Python runtime dependency** at install time. The scipy validation is a build-time / dev-only check.
- **No SDK dependencies** for providers. Raw fetch only.
- **No additional metrics beyond accuracy, ECE, Brier in v0.1.** No MCE, no logloss, no Platt scaling. Resist scope creep.
- **No additional stat tests beyond Wilcoxon and Spearman in v0.1.** No t-tests, no bootstrap CIs. These are explicit v0.2 candidates.
- **No multi-class.** Inputs are single-string answers, scorers return [0,1].
- **No CLI yet.** Library only.
- **No `any` types in public API.** Use `unknown` and let users narrow.
- **No em dashes in any documentation or code comments.** Use commas, semicolons, or sentence breaks.

---

## 12. Acceptance Criteria

When you are done, all of these must be true:

- [ ] `pnpm install && pnpm test` passes from a clean clone
- [ ] `pnpm build` produces ESM and CJS bundles plus type declarations
- [ ] `pnpm typecheck` passes with strict mode
- [ ] `pnpm biome check` passes with no warnings
- [ ] `node -e "require('reliability-eval')"` works after build (CJS smoke test)
- [ ] All three example files run with mocked providers (or skip if no API key, but typecheck must pass)
- [ ] `pnpm docs:dev` serves the Vitepress site
- [ ] Stats tests assert match against scipy reference within 1e-4
- [ ] Coverage report shows >= 85% on metrics, stats, scorers
- [ ] README has a working 30-second quickstart
- [ ] A first changeset exists for the initial v0.1.0 release
- [ ] `git log` shows clean, atomic commits with conventional commit messages

---

## 13. After You Finish

Do not publish to npm yourself. Leave the repo at a state where the user can:

1. Review the code
2. Update `package.json` author field (currently set to "TODO: Ahmad")
3. Push to a new GitHub repo
4. Add the `NPM_TOKEN` secret to that repo
5. Merge the first Version Packages PR that Changesets opens, which will trigger the v0.1.0 publish

Write a final `HANDOFF.md` at the repo root listing exactly these steps, plus any decisions you made that the user should know about (e.g., final package name if `reliability-eval` was taken, any deviations from this spec with reasoning).

---

## 14. Working Style

- Commit incrementally. Don't do everything in one giant commit. Aim for one logical unit per commit (e.g., "feat(stats): implement Wilcoxon signed-rank", "test(stats): add scipy reference validation").
- Use conventional commits.
- When you hit a design question not covered here, make a defensible choice and note it in HANDOFF.md.
- Stop and ask the user only if a decision could meaningfully change the package's public API.

Start by running the pre-flight checklist in section 3. Then create the repo skeleton. Then implement bottom-up: types, metrics, stats, scorers, providers, evaluate, compare, plot, examples, docs, CI/CD. Tests as you go, not at the end.
