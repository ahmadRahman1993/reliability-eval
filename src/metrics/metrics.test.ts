import { describe, expect, it } from "vitest";
import type { ResultItem } from "../types.js";
import { computeAccuracy } from "./accuracy.js";
import { computeBrier } from "./brier.js";
import { computeCalibration } from "./calibration.js";

function makeItem(id: string, correct: boolean, confidence: number | null = null): ResultItem {
  return {
    id,
    input: id,
    expected: "x",
    predicted: correct ? "x" : "y",
    confidence,
    correct,
    score: correct ? 1 : 0,
    raw: null,
  };
}

describe("computeAccuracy", () => {
  it("returns 0 for empty array", () => {
    expect(computeAccuracy([])).toBe(0);
  });

  it("computes correct fraction", () => {
    const items = [
      makeItem("1", true),
      makeItem("2", false),
      makeItem("3", true),
      makeItem("4", true),
    ];
    expect(computeAccuracy(items)).toBe(0.75);
  });

  it("returns 1 for all correct", () => {
    const items = [makeItem("1", true), makeItem("2", true)];
    expect(computeAccuracy(items)).toBe(1);
  });

  it("returns 0 for all wrong", () => {
    const items = [makeItem("1", false), makeItem("2", false)];
    expect(computeAccuracy(items)).toBe(0);
  });
});

describe("computeBrier", () => {
  it("returns null when no items have confidence", () => {
    const items = [makeItem("1", true), makeItem("2", false)];
    expect(computeBrier(items)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(computeBrier([])).toBeNull();
  });

  it("computes Brier score correctly", () => {
    // perfect: conf=1, correct=1 -> diff^2=0; conf=0, correct=0 -> 0
    const items = [makeItem("1", true, 1.0), makeItem("2", false, 0.0)];
    expect(computeBrier(items)).toBe(0);
  });

  it("computes hand-calculated Brier score", () => {
    // Item 1: conf=0.8, correct=1 -> (0.8-1)^2 = 0.04
    // Item 2: conf=0.4, correct=0 -> (0.4-0)^2 = 0.16
    // Mean = 0.10
    const items = [makeItem("1", true, 0.8), makeItem("2", false, 0.4)];
    expect(computeBrier(items)).toBeCloseTo(0.1, 10);
  });

  it("skips items with null confidence", () => {
    const items = [makeItem("1", true, 0.9), makeItem("2", false, null)];
    // Only item 1: (0.9-1)^2 = 0.01
    const result = computeBrier(items);
    expect(result).toBeCloseTo(0.01, 10);
  });
});

describe("computeCalibration (ECE)", () => {
  it("returns ECE=0 and empty bins for no confident items", () => {
    const items = [makeItem("1", true), makeItem("2", false)];
    const { ece, curve } = computeCalibration(items, 5);
    expect(ece).toBe(0);
    expect(curve).toHaveLength(5);
    expect(curve.every((b) => b.count === 0)).toBe(true);
  });

  it("returns ECE=0 for perfectly calibrated model", () => {
    // Two bins: [0, 0.5) and [0.5, 1]
    // conf=0.25, correct -> bin 0: meanConf=0.25, accuracy=1 -> |0.25-1|*1 = 0.75
    // Actually perfect calibration is meanConf == accuracy per bin.
    // Let's put exactly 50% items in [0.5, 1] bin with accuracy=0.5
    const items = [makeItem("1", true, 0.75), makeItem("2", false, 0.75)];
    const { ece } = computeCalibration(items, 2);
    // Both in bin 1: meanConf=0.75, accuracy=0.5, |0.75-0.5|=0.25
    expect(ece).toBeCloseTo(0.25, 10);
  });

  it("ECE is 0 when confidence matches accuracy perfectly", () => {
    // 4 items: all in one bin [0.4, 0.5) with 40% accuracy... hard to get exact.
    // Instead: all conf=0.5, all correct -> meanConf=0.5, accuracy=1.0, ece=0.5
    // Actually perfect calibration means the mean confidence in a bin equals the accuracy.
    // Let's put 2 items in bin [0, 0.5): conf=0.25, 1 correct, 1 wrong -> meanConf=0.25, acc=0.5
    // That's NOT perfect. Perfect would be conf=0.5, acc=0.5 in a single bin.
    const items = [makeItem("1", true, 0.5), makeItem("2", false, 0.5)];
    // They both land in bin index 5 (for 10 bins: [0.5, 0.6))
    // meanConf = 0.5, accuracy = 0.5, |diff| = 0 -> ECE = 0
    const { ece } = computeCalibration(items, 10);
    expect(ece).toBeCloseTo(0, 10);
  });

  it("bins confidence=1.0 into last bin", () => {
    const items = [makeItem("1", true, 1.0)];
    const { curve } = computeCalibration(items, 10);
    expect(curve[9]?.count).toBe(1);
  });

  it("computes ECE for hand-verified 4-item dataset", () => {
    // 4 items, 10 bins:
    // Item1: conf=0.1, correct -> bin 1 (actually bin index 1 is [0.1,0.2))
    //   Wait: floor(0.1 * 10) = 1, so bin 1: conf=0.1, correct=true
    // Item2: conf=0.2, correct -> floor(0.2*10)=2, bin 2: conf=0.2, correct=true
    // Item3: conf=0.8, wrong -> floor(0.8*10)=8, bin 8: conf=0.8, correct=false
    // Item4: conf=0.9, wrong -> floor(0.9*10)=9, bin 9: conf=0.9, correct=false
    //
    // ECE = sum over bins: (count/4) * |meanConf - accuracy|
    // bin1: (1/4)*|0.1 - 1.0| = 0.225
    // bin2: (1/4)*|0.2 - 1.0| = 0.2
    // bin8: (1/4)*|0.8 - 0.0| = 0.2
    // bin9: (1/4)*|0.9 - 0.0| = 0.225
    // ECE = 0.225 + 0.2 + 0.2 + 0.225 = 0.85
    const items = [
      makeItem("1", true, 0.1),
      makeItem("2", true, 0.2),
      makeItem("3", false, 0.8),
      makeItem("4", false, 0.9),
    ];
    const { ece } = computeCalibration(items, 10);
    expect(ece).toBeCloseTo(0.85, 5);
  });
});
