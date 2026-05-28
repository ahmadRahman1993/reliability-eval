/**
 * Compare two models on the same dataset using the Wilcoxon signed-rank test.
 *
 * Run: pnpm tsx examples/compare-models.ts
 * Requires: ANTHROPIC_API_KEY and OPENAI_API_KEY env vars
 */

import { compare, evaluate, providers, scorers } from "reliability-eval";

const dataset = [
  { id: "q0", input: "What is the capital of France?", expected: "Paris" },
  { id: "q1", input: "What is 2 + 2?", expected: "4" },
  { id: "q2", input: "What color is the sky on a clear day?", expected: "blue" },
  { id: "q3", input: "How many days are in a week?", expected: "7" },
  { id: "q4", input: "What is the chemical symbol for water?", expected: "H2O" },
  { id: "q5", input: "What planet is closest to the Sun?", expected: "Mercury" },
  { id: "q6", input: "What is the square root of 9?", expected: "3" },
  { id: "q7", input: "How many sides does a triangle have?", expected: "3" },
  { id: "q8", input: "What is the boiling point of water in Celsius?", expected: "100" },
  { id: "q9", input: "What is the largest ocean?", expected: "Pacific" },
];

async function main() {
  const missingKeys: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) missingKeys.push("ANTHROPIC_API_KEY");
  if (!process.env.OPENAI_API_KEY) missingKeys.push("OPENAI_API_KEY");
  if (missingKeys.length > 0) {
    console.error(`Set these env vars to run this example: ${missingKeys.join(", ")}`);
    process.exit(1);
  }

  const scorer = scorers.exact({ caseSensitive: false });

  const anthropicProvider = providers.anthropic({ model: "claude-3-haiku-20240307" });
  const openaiProvider = providers.openai({ model: "gpt-4o-mini" });

  console.log("Evaluating with Anthropic claude-3-haiku...");
  const resultA = await evaluate({
    provider: anthropicProvider,
    dataset,
    scorer,
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  });
  console.log(`\n  Accuracy: ${(resultA.metrics.accuracy * 100).toFixed(1)}%`);

  console.log("\nEvaluating with OpenAI gpt-4o-mini...");
  const resultB = await evaluate({
    provider: openaiProvider,
    dataset,
    scorer,
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  });
  console.log(`\n  Accuracy: ${(resultB.metrics.accuracy * 100).toFixed(1)}%`);

  console.log("\nWilcoxon signed-rank test (paired, two-sided):");
  const comparison = compare(resultA, resultB, {
    test: "wilcoxon",
    metric: "score",
    alpha: 0.05,
  });

  console.log(`  W statistic:  ${comparison.statistic.toFixed(4)}`);
  console.log(`  p-value:      ${comparison.pValue.toFixed(4)}`);
  console.log(`  Effect size:  ${comparison.effectSize.toFixed(4)} (rank-biserial r)`);
  console.log(`  n pairs:      ${comparison.n}`);
  console.log(
    `  Significant:  ${comparison.significant ? "YES" : "NO"} (alpha=${comparison.alpha})`,
  );

  if (comparison.significant) {
    const better = comparison.effectSize > 0 ? anthropicProvider.model : openaiProvider.model;
    console.log(`\n  ${better} is significantly better at alpha=${comparison.alpha}.`);
  } else {
    console.log("\n  No statistically significant difference detected.");
  }
}

main().catch(console.error);
