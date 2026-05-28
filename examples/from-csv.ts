/**
 * Load a dataset from CSV, evaluate it, and write a calibration SVG to disk.
 *
 * Expected CSV format (with header row):
 *   id,input,expected
 *   q0,"What is the capital of France?",Paris
 *   ...
 *
 * Run: pnpm tsx examples/from-csv.ts --csv path/to/data.csv --out calibration.svg
 * Requires: ANTHROPIC_API_KEY env var
 */

import { readFileSync, writeFileSync } from "node:fs";
import { evaluate, providers, scorers } from "reliability-eval";
import { plotCalibration } from "reliability-eval/plot";

function parseCsv(content: string): Array<{ id: string; input: string; expected: string }> {
  const lines = content.trim().split("\n");
  const header = lines[0]?.split(",") ?? [];
  const idIdx = header.indexOf("id");
  const inputIdx = header.indexOf("input");
  const expectedIdx = header.indexOf("expected");

  if (idIdx === -1 || inputIdx === -1 || expectedIdx === -1) {
    throw new Error("CSV must have columns: id, input, expected");
  }

  return lines.slice(1).map((line, i) => {
    // Simple CSV parse: handles quoted fields with embedded commas.
    const cols = parseCSVLine(line);
    return {
      id: cols[idIdx] ?? `row${i}`,
      input: cols[inputIdx] ?? "",
      expected: cols[expectedIdx] ?? "",
    };
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseArgs(argv: string[]): { csv: string; out: string } {
  const csvIdx = argv.indexOf("--csv");
  const outIdx = argv.indexOf("--out");
  const csv = csvIdx !== -1 ? (argv[csvIdx + 1] ?? "") : "";
  const out = outIdx !== -1 ? (argv[outIdx + 1] ?? "calibration.svg") : "calibration.svg";
  if (!csv) {
    console.error("Usage: pnpm tsx examples/from-csv.ts --csv <path> [--out <path>]");
    process.exit(1);
  }
  return { csv, out };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY to run this example.");
    process.exit(1);
  }

  const { csv, out } = parseArgs(process.argv.slice(2));

  const content = readFileSync(csv, "utf8");
  const dataset = parseCsv(content);
  console.log(`Loaded ${dataset.length} items from ${csv}`);

  const provider = providers.anthropic({ model: "claude-3-haiku-20240307" });

  const result = await evaluate({
    provider,
    dataset,
    scorer: scorers.exact({ caseSensitive: false }),
    elicitConfidence: true,
    bins: 10,
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  });

  console.log("\n\nMetrics:");
  console.log(`  Accuracy: ${(result.metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`  ECE:      ${result.metrics.ece.toFixed(4)}`);
  console.log(
    `  Brier:    ${result.metrics.brier !== null ? result.metrics.brier.toFixed(4) : "N/A"}`,
  );

  const svg = plotCalibration(result, {
    title: `Reliability Diagram - ${provider.model}`,
    width: 600,
    height: 600,
  });

  writeFileSync(out, svg, "utf8");
  console.log(`\nCalibration diagram written to ${out}`);
}

main().catch(console.error);
