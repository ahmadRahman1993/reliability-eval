import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/metrics/**", "src/stats/**", "src/scorers/**"],
      thresholds: {
        lines: 85,
        functions: 85,
        // Remaining uncovered branches are unreachable safety guards in
        // lgamma (x<0.5 with df>=2 args) and TypeScript-constrained null
        // returns. Statements/lines/functions all exceed 95%.
        branches: 80,
        statements: 85,
      },
    },
  },
});
