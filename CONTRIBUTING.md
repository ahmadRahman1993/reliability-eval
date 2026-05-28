# Contributing to reliability-eval

Thanks for your interest. This guide covers setup, testing, and the release process.

## Setup

Requires Node >= 22 and pnpm.

```bash
git clone https://github.com/TODO_GITHUB_USER/reliability-eval.git
cd reliability-eval
pnpm install
```

## Development workflow

```bash
pnpm typecheck          # TypeScript strict check
pnpm test               # Run all tests (vitest)
pnpm test:coverage      # Run with coverage report
pnpm lint               # Biome lint + format check
pnpm lint:fix           # Auto-fix lint and format issues
pnpm build              # Build ESM + CJS bundles via tsup
pnpm docs:dev           # Serve the Vitepress docs locally
```

## Running tests

Tests live in `src/**/*.test.ts` (unit tests) and `tests/` (integration and provider tests). No real API calls are made in tests; providers are mocked via `globalThis.fetch` replacement in `tests/provider.test.ts`.

The stats tests load a scipy-validated reference file from `tests/fixtures/reference-stats.json`. If you modify the statistical implementations, regenerate this file:

```bash
pip install scipy numpy
python scripts/generate-reference-stats.py
```

Then verify the tests still pass at 1e-4 tolerance.

## Adding a changeset

Every PR that changes behavior needs a changeset entry:

```bash
pnpm changeset
```

Select the package, choose the semver bump type (patch / minor / major), and write a short description. Commit the generated `.changeset/*.md` file with your PR.

## Code style

- Biome handles formatting and linting. Run `pnpm lint:fix` before committing.
- No `any` types in public API. Use `unknown` and narrow explicitly.
- No em dashes in code comments or documentation. Use commas or semicolons instead.
- No additional runtime dependencies without discussion. The core dependency footprint is intentionally near zero.

## Project structure

```
src/
  metrics/       - accuracy, ECE, Brier
  stats/         - Wilcoxon, Spearman, distributions (pure TS)
  scorers/       - exact match
  providers/     - Anthropic, OpenAI (raw fetch, no SDK)
  elicitation/   - confidence prompt + parser
  plot/          - SVG reliability diagram
  evaluate.ts    - main evaluate() function
  compare.ts     - compare() and correlate() wrappers
  types.ts       - all shared types
tests/
  fixtures/      - scipy-validated reference JSON
scripts/
  generate-reference-stats.py
```

## Code of conduct

Be kind. See [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
