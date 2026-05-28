import type { ResultItem } from "../types.js";

export function computeBrier(items: ResultItem[]): number | null {
  const confident = items.filter((item) => item.confidence !== null);
  if (confident.length === 0) return null;
  const sum = confident.reduce((acc, item) => {
    const outcome = item.correct ? 1 : 0;
    const diff = (item.confidence as number) - outcome;
    return acc + diff * diff;
  }, 0);
  return sum / confident.length;
}
