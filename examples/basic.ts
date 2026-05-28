/**
 * Basic example: evaluate a 10-item dataset with Anthropic and print metrics.
 *
 * Run: pnpm tsx examples/basic.ts
 * Requires: ANTHROPIC_API_KEY env var (or set apiKey directly below)
 */

import { evaluate, providers, scorers } from "reliability-eval";

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
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY to run this example.");
    process.exit(1);
  }

  const provider = providers.anthropic({
    model: "claude-3-haiku-20240307",
  });

  console.log(`Evaluating ${dataset.length} items with ${provider.model}...`);

  const result = await evaluate({
    provider,
    dataset,
    scorer: scorers.exact({ caseSensitive: false }),
    elicitConfidence: true,
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  });

  console.log("\n\nMetrics:");
  console.log(`  Accuracy:  ${(result.metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`  ECE:       ${result.metrics.ece.toFixed(4)}`);
  console.log(
    `  Brier:     ${result.metrics.brier !== null ? result.metrics.brier.toFixed(4) : "N/A"}`,
  );
  console.log(`  n:         ${result.metrics.n}`);
  console.log(`  Duration:  ${result.meta.durationMs}ms`);

  console.log("\nPer-item results:");
  for (const item of result.items) {
    const conf = item.confidence !== null ? `(conf=${item.confidence.toFixed(2)})` : "";
    const mark = item.correct ? "✓" : "✗";
    console.log(`  ${mark} [${item.id}] predicted="${item.predicted}" ${conf}`);
  }
}

main().catch(console.error);
