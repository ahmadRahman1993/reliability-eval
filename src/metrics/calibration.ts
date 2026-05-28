import type { CalibrationBin, ResultItem } from "../types.js";

export function computeCalibration(
  items: ResultItem[],
  numBins: number,
): { ece: number; curve: CalibrationBin[] } {
  const confident = items.filter((item) => item.confidence !== null);

  const bins: CalibrationBin[] = Array.from({ length: numBins }, (_, i) => ({
    bin: i,
    binLowerBound: i / numBins,
    binUpperBound: (i + 1) / numBins,
    meanConfidence: 0,
    accuracy: 0,
    count: 0,
  }));

  const binSums: Array<{ confSum: number; correctSum: number; count: number }> =
    Array.from({ length: numBins }, () => ({ confSum: 0, correctSum: 0, count: 0 }));

  for (const item of confident) {
    const conf = item.confidence as number;
    const clipped = Math.min(Math.max(conf, 0), 1);
    let binIdx = Math.floor(clipped * numBins);
    if (binIdx === numBins) binIdx = numBins - 1;
    const s = binSums[binIdx];
    if (s) {
      s.confSum += clipped;
      s.correctSum += item.correct ? 1 : 0;
      s.count += 1;
    }
  }

  for (let i = 0; i < numBins; i++) {
    const s = binSums[i];
    const b = bins[i];
    if (!s || !b) continue;
    if (s.count > 0) {
      b.meanConfidence = s.confSum / s.count;
      b.accuracy = s.correctSum / s.count;
      b.count = s.count;
    }
  }

  if (confident.length === 0) {
    return { ece: 0, curve: bins };
  }

  let ece = 0;
  for (let i = 0; i < numBins; i++) {
    const b = bins[i];
    if (!b || b.count === 0) continue;
    ece += (b.count / confident.length) * Math.abs(b.meanConfidence - b.accuracy);
  }

  return { ece, curve: bins };
}
