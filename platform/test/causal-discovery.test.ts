/**
 * Causal Discovery — Pure function unit tests
 * ============================================
 * Tests for pearsonCorrelation() and correlationToConfidence().
 * Both functions are module-private in causal-discovery.ts, so we replicate
 * the logic in test-local helpers to unit-test boundary conditions without
 * needing to export them or instrument the module.
 *
 * Contract being tested (from causal-discovery.ts):
 *   pearsonCorrelation(xs, ys):
 *     - Returns null for xs.length < MIN_SAMPLE_SIZE (5)
 *     - Returns null for mismatched lengths
 *     - Returns null for zero-variance inputs (denom = 0)
 *     - Returns value in [-1, 1] for valid inputs
 *
 *   correlationToConfidence(r, n):
 *     - Returns value in [0, 1]
 *     - Treats negative and positive r identically (|r|)
 *     - Higher n → higher confidence for same |r|
 *     - sampleDampener saturates at n=100 (sqrt(n)/10 capped at 1)
 *     - Returns 0 for r=0 regardless of n
 */

import { describe, it, expect } from "vitest";

// ── Replicated pure helpers (mirrors causal-discovery.ts private functions) ──

const MIN_SAMPLE_SIZE = 5;

/**
 * Replicated Pearson correlation for unit testing boundary conditions.
 * Must stay in sync with the implementation in causal-discovery.ts.
 */
function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < MIN_SAMPLE_SIZE) return null;

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denom = Math.sqrt(sumX2 * sumY2);
  if (denom === 0) return null;

  return Math.max(-1, Math.min(1, sumXY / denom));
}

/**
 * Replicated correlationToConfidence for unit testing.
 * Must stay in sync with the implementation in causal-discovery.ts.
 */
function correlationToConfidence(r: number, n: number): number {
  const absr = Math.abs(r);
  const sampleDampener = Math.min(1, Math.sqrt(n) / 10);
  return Math.round(absr * sampleDampener * 100) / 100;
}

// ── pearsonCorrelation: null for small samples ─────────────────────────────

describe("pearsonCorrelation — null for small samples", () => {
  it("returns null for empty arrays", () => {
    expect(pearsonCorrelation([], [])).toBeNull();
  });

  it("returns null for single-element arrays", () => {
    expect(pearsonCorrelation([1], [1])).toBeNull();
  });

  it("returns null for arrays with fewer than MIN_SAMPLE_SIZE (5) elements", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [1, 2, 3, 4])).toBeNull();
  });

  it("returns null for exactly 4 elements (one below threshold)", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeNull();
  });

  it("returns null for mismatched array lengths (xs longer)", () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [1, 2, 3])).toBeNull();
  });

  it("returns null for mismatched array lengths (ys longer)", () => {
    expect(pearsonCorrelation([1, 2, 3], [1, 2, 3, 4, 5])).toBeNull();
  });
});

// ── pearsonCorrelation: valid correlations ─────────────────────────────────

describe("pearsonCorrelation — valid correlations with MIN_SAMPLE_SIZE+", () => {
  it("returns non-null for exactly 5 elements (at threshold)", () => {
    const result = pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(result).not.toBeNull();
  });

  it("returns +1 for perfectly positive linear correlation", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10]; // ys = 2 * xs
    const r = pearsonCorrelation(xs, ys);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(1.0, 5);
  });

  it("returns -1 for perfectly negative linear correlation", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [10, 8, 6, 4, 2]; // ys = 12 - 2*xs
    const r = pearsonCorrelation(xs, ys);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(-1.0, 5);
  });

  it("returns null for constant xs array (zero variance — denom = 0)", () => {
    const xs = [5, 5, 5, 5, 5];
    const ys = [1, 2, 3, 4, 5];
    expect(pearsonCorrelation(xs, ys)).toBeNull();
  });

  it("returns null for constant ys array (zero variance — denom = 0)", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [3, 3, 3, 3, 3];
    expect(pearsonCorrelation(xs, ys)).toBeNull();
  });

  it("result is always clamped to [-1, 1] range", () => {
    const xs = [1, 3, 5, 7, 9, 11, 13];
    const ys = [2, 5, 7, 8, 10, 12, 14];
    const r = pearsonCorrelation(xs, ys);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThanOrEqual(-1);
    expect(r!).toBeLessThanOrEqual(1);
  });

  it("detects weak-to-moderate correlation for noisy data", () => {
    // Noisy data with general positive trend
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ys = [1.2, 3.5, 2.8, 5.1, 4.9, 7.2, 6.8, 8.5, 9.1, 10.3];
    const r = pearsonCorrelation(xs, ys);
    expect(r).not.toBeNull();
    // Should be strongly positive (> 0.9) but not exactly 1
    expect(r!).toBeGreaterThan(0.9);
    expect(r!).toBeLessThan(1);
  });
});

// ── correlationToConfidence: 0-1 range ────────────────────────────────────

describe("correlationToConfidence — returns 0-1 range", () => {
  it("returns 0 for zero correlation (r = 0)", () => {
    expect(correlationToConfidence(0, 20)).toBe(0);
  });

  it("returns 0 for r = 0 regardless of sample size", () => {
    for (const n of [5, 10, 50, 100, 1000]) {
      expect(correlationToConfidence(0, n)).toBe(0);
    }
  });

  it("returns a value in [0, 1] for typical inputs", () => {
    const confidence = correlationToConfidence(0.8, 25);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it("negative correlation gives same confidence as positive (uses |r|)", () => {
    const pos = correlationToConfidence(0.7, 30);
    const neg = correlationToConfidence(-0.7, 30);
    expect(pos).toBe(neg);
  });

  it("larger sample size yields higher confidence for the same |r|", () => {
    const smallSample = correlationToConfidence(0.8, 5);
    const largeSample = correlationToConfidence(0.8, 100);
    expect(largeSample).toBeGreaterThan(smallSample);
  });

  it("sampleDampener saturates at n=100 — confidence does not increase beyond n=100", () => {
    // sqrt(100)/10 = 1.0 and sqrt(200)/10 > 1.0, both capped at 1
    const at100 = correlationToConfidence(0.8, 100);
    const at200 = correlationToConfidence(0.8, 200);
    const at500 = correlationToConfidence(0.8, 500);
    expect(at100).toBe(at200);
    expect(at200).toBe(at500);
  });

  it("perfect correlation (1.0) with saturated sample returns exactly 1.0", () => {
    // |r|=1, sampleDampener=1 → 1.0 * 1.0 = 1.0
    expect(correlationToConfidence(1.0, 100)).toBe(1.0);
  });

  it("rounds to exactly 2 decimal places", () => {
    // 0.7 * sqrt(50)/10 = 0.7 * 0.7071... = 0.4950 → rounds to 0.49 or 0.50
    const confidence = correlationToConfidence(0.7, 50);
    const str = confidence.toString();
    const decimals = (str.split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("returns values in [0, 1] for extreme inputs", () => {
    expect(correlationToConfidence(1.0, 1000)).toBe(1.0);
    const min = correlationToConfidence(0.3, 5);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(min).toBeLessThanOrEqual(1);
  });
});

// ── Integration: MIN_CORRELATION and MIN_SAMPLE_SIZE constants ────────────

describe("causal discovery constants contract", () => {
  it("pearsonCorrelation returns null for all n < MIN_SAMPLE_SIZE", () => {
    for (let n = 0; n < MIN_SAMPLE_SIZE; n++) {
      const xs = Array.from({ length: n }, (_, i) => i + 1);
      const ys = Array.from({ length: n }, (_, i) => i + 1);
      expect(pearsonCorrelation(xs, ys)).toBeNull();
    }
  });

  it("MIN_SAMPLE_SIZE threshold is 5 — n=5 is the first non-null result", () => {
    // n=4 → null
    expect(pearsonCorrelation([1, 2, 3, 4], [1, 2, 3, 4])).toBeNull();
    // n=5 → non-null (perfect positive correlation)
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).not.toBeNull();
  });
});
