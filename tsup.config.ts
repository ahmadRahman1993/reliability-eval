import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "node22",
  },
  {
    entry: { "plot/index": "src/plot/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    target: "node22",
  },
]);
