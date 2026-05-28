export function averageRanks(values: number[]): number[] {
  const n = values.length;
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && indexed[j]!.v === indexed[i]!.v) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[indexed[k]!.i] = avgRank;
    }
    i = j;
  }
  return ranks;
}

export function tieCorrection(ranks: number[]): number {
  const counts = new Map<number, number>();
  for (const r of ranks) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let correction = 0;
  for (const [, count] of counts) {
    if (count > 1) {
      correction += (count * count * count - count) / 12;
    }
  }
  return correction;
}
