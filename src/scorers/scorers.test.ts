import { describe, expect, it } from "vitest";
import { exact } from "./exact.js";

describe("exact scorer", () => {
  it("returns 1 for exact match", () => {
    const scorer = exact();
    expect(scorer.score("hello", "hello")).toBe(1);
  });

  it("returns 0 for non-match", () => {
    const scorer = exact();
    expect(scorer.score("hello", "world")).toBe(0);
  });

  it("is case-insensitive by default", () => {
    const scorer = exact();
    expect(scorer.score("Hello", "hello")).toBe(1);
    expect(scorer.score("WORLD", "world")).toBe(1);
  });

  it("trims whitespace by default", () => {
    const scorer = exact();
    expect(scorer.score("  hello  ", "hello")).toBe(1);
    expect(scorer.score("hello", "  hello  ")).toBe(1);
    expect(scorer.score("  hello  ", "  hello  ")).toBe(1);
  });

  it("respects caseSensitive=true", () => {
    const scorer = exact({ caseSensitive: true });
    expect(scorer.score("Hello", "hello")).toBe(0);
    expect(scorer.score("hello", "hello")).toBe(1);
  });

  it("respects trim=false", () => {
    const scorer = exact({ trim: false });
    expect(scorer.score("  hello  ", "hello")).toBe(0);
    expect(scorer.score("  hello  ", "  hello  ")).toBe(1);
  });

  it("handles empty strings", () => {
    const scorer = exact();
    expect(scorer.score("", "")).toBe(1);
    expect(scorer.score("", "hello")).toBe(0);
    expect(scorer.score("hello", "")).toBe(0);
  });

  it("handles whitespace-only strings with trim", () => {
    const scorer = exact();
    expect(scorer.score("   ", "")).toBe(1);
    expect(scorer.score("", "   ")).toBe(1);
  });

  it("has name 'exact'", () => {
    const scorer = exact();
    expect(scorer.name).toBe("exact");
  });
});
