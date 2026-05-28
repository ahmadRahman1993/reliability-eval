import type { Scorer } from "../types.js";

export function exact(opts?: { caseSensitive?: boolean; trim?: boolean }): Scorer<string> {
  const caseSensitive = opts?.caseSensitive ?? false;
  const trim = opts?.trim ?? true;

  return {
    name: "exact",
    score(predicted: string, expected: string): number {
      let p = predicted;
      let e = expected;
      if (trim) {
        p = p.trim();
        e = e.trim();
      }
      if (!caseSensitive) {
        p = p.toLowerCase();
        e = e.toLowerCase();
      }
      return p === e ? 1 : 0;
    },
  };
}
