import type { ResultItem } from "../types.js";

export function computeAccuracy(items: ResultItem[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, item) => acc + (item.correct ? 1 : 0), 0);
  return sum / items.length;
}
