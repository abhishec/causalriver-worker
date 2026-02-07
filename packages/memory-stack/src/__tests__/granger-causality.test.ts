/**
 * Nexus Memory Stack - Granger Causality Module Tests
 *
 * Comprehensive tests for Granger causality testing, impulse response
 * computation, and batch domain-pair testing.
 *
 * Test data is generated inline using deterministic formulas:
 * sine waves, linear trends, random walks (seeded), and constant series.
 */

import { describe, it, expect } from 'vitest';
import {
  computeGrangerCausality,
  buildImpulseResponse,
  testAllDomainPairs,
} from '../causality/granger-causality';
import type {
  GrangerResult,
  ImpulseResponse,
  GrangerTestConfig,
} from '../causality/granger-causality';

// ============================================================================
// HELPERS: Deterministic test data generators
// ============================================================================

/** Simple seeded PRNG (mulberry32) for reproducible "random" series. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a sine wave of length n with given frequency and amplitude. */
function sineWave(n: number, frequency: number = 0.1, amplitude: number = 1): number[] {
  return Array.from({ length: n }, (_, i) => amplitude * Math.sin(2 * Math.PI * frequency * i));
}

/** Generate a linear trend: value = slope * i + intercept. */
function linearTrend(n: number, slope: number = 0.5, intercept: number = 0): number[] {
  return Array.from({ length: n }, (_, i) => slope * i + intercept);
}

/** Generate a random walk with a seeded PRNG. */
function randomWalk(n: number, seed: number = 42): number[] {
  const rng = seededRandom(seed);
  const series: number[] = [0];
  for (let i = 1; i < n; i++) {
    series.push(series[i - 1] + (rng() - 0.5));
  }
  return series;
}

/** Generate a constant series. */
function constantSeries(n: number, value: number = 5): number[] {
  return Array(n).fill(value);
}

/**
 * Generate a causal pair: seriesB[t] = alpha * seriesA[t - lag] + noise.
 * This constructs a scenario where A Granger-causes B at the given lag.
 */
function causalPair(
  n: number,
  lag: number = 2,
  alpha: number = 0.8,
  noiseSeed: number = 99
): { seriesA: number[]; seriesB: number[] } {
  const rng = seededRandom(noiseSeed);
  const seriesA: number[] = [];
  const seriesB: number[] = [];

  // Generate seriesA as a random walk
  const rngA = seededRandom(noiseSeed + 1);
  seriesA.push(0);
  for (let i = 1; i < n; i++) {
    seriesA.push(seriesA[i - 1] + (rngA() - 0.5));
  }

  // Generate seriesB as a function of lagged seriesA plus noise
  for (let i = 0; i < n; i++) {
    const laggedA = i >= lag ? seriesA[i - lag] : 0;
    seriesB.push(alpha * laggedA + (rng() - 0.5) * 0.3);
  }

  return { seriesA, seriesB };
}

// Default config overrides for faster tests (lower observation threshold)
const FAST_CONFIG: GrangerTestConfig = { minObservations: 20 };

// ============================================================================
// computeGrangerCausality
// ============================================================================

describe('computeGrangerCausality', () => {
  // --------------------------------------------------------------------------
  // Basic contract and return shape
  // --------------------------------------------------------------------------

  it('should return all required fields in the result object', () => {
    const n = 100;
    const a = sineWave(n, 0.05);
    const b = sineWave(n, 0.07);

    const result = computeGrangerCausality(a, b, 5, FAST_CONFIG);

    expect(result).toHaveProperty('sourceDomain');
    expect(result).toHaveProperty('targetDomain');
    expect(result).toHaveProperty('fStatistic');
    expect(result).toHaveProperty('pValue');
    expect(result).toHaveProperty('optimalLag');
    expect(result).toHaveProperty('isSignificant');
    expect(result).toHaveProperty('effectSize');
    expect(result).toHaveProperty('confidenceInterval');
    expect(result).toHaveProperty('sampleSize');
    expect(result).toHaveProperty('naturalLanguage');
  });

  it('should produce finite numeric values for F-statistic and p-value', () => {
    const n = 100;
    const a = randomWalk(n, 1);
    const b = randomWalk(n, 2);

    const result = computeGrangerCausality(a, b, 5, FAST_CONFIG);

    expect(isFinite(result.fStatistic)).toBe(true);
    expect(isFinite(result.pValue)).toBe(true);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it('should set isSignificant consistently with pValue and alpha', () => {
    const n = 100;
    const a = randomWalk(n, 10);
    const b = randomWalk(n, 20);

    const alpha = 0.05;
    const result = computeGrangerCausality(a, b, 5, { ...FAST_CONFIG, alpha });

    expect(result.isSignificant).toBe(result.pValue < alpha);
  });

  // --------------------------------------------------------------------------
  // Causal vs non-causal series
  // --------------------------------------------------------------------------

  it('should detect significance when A genuinely Granger-causes B', () => {
    const n = 200;
    const { seriesA, seriesB } = causalPair(n, 2, 0.9, 42);

    const result = computeGrangerCausality(seriesA, seriesB, 10, {
      ...FAST_CONFIG,
      alpha: 0.05,
    });

    // With a strong causal link (alpha=0.9), we expect significance
    expect(result.isSignificant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.effectSize).toBeGreaterThan(0);
  });

  it('should not find significance between two independent random walks', () => {
    const n = 200;
    const a = randomWalk(n, 111);
    const b = randomWalk(n, 222);

    const result = computeGrangerCausality(a, b, 5, {
      ...FAST_CONFIG,
      alpha: 0.05,
    });

    // Independent series should usually not be significant
    // (There is a small probability of false positive, but with independent seeds it is unlikely)
    expect(result.pValue).toBeGreaterThan(0.01);
  });

  it('should produce a larger effect size for stronger causal links', () => {
    const n = 200;
    const weak = causalPair(n, 2, 0.3, 50);
    const strong = causalPair(n, 2, 0.9, 50);

    const resultWeak = computeGrangerCausality(
      weak.seriesA, weak.seriesB, 5, FAST_CONFIG
    );
    const resultStrong = computeGrangerCausality(
      strong.seriesA, strong.seriesB, 5, FAST_CONFIG
    );

    expect(resultStrong.effectSize).toBeGreaterThan(resultWeak.effectSize);
  });

  // --------------------------------------------------------------------------
  // Confidence interval properties
  // --------------------------------------------------------------------------

  it('should produce a confidence interval that brackets the effect size', () => {
    const n = 150;
    const { seriesA, seriesB } = causalPair(n, 2, 0.7, 77);

    const result = computeGrangerCausality(seriesA, seriesB, 5, FAST_CONFIG);

    expect(result.confidenceInterval.lower).toBeLessThanOrEqual(result.effectSize);
    expect(result.confidenceInterval.upper).toBeGreaterThanOrEqual(result.effectSize);
    expect(result.confidenceInterval.level).toBe(0.95);
  });

  it('should produce a valid CI with lower <= upper and bounds in [0, 1]', () => {
    const n = 100;
    const a = sineWave(n, 0.05);
    const b = sineWave(n, 0.1);

    const result = computeGrangerCausality(a, b, 5, FAST_CONFIG);

    expect(result.confidenceInterval.lower).toBeLessThanOrEqual(result.confidenceInterval.upper);
    expect(result.confidenceInterval.lower).toBeGreaterThanOrEqual(0);
    expect(result.confidenceInterval.upper).toBeLessThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // Natural language output
  // --------------------------------------------------------------------------

  it('should include F-statistic and p-value in naturalLanguage when significant', () => {
    const n = 200;
    const { seriesA, seriesB } = causalPair(n, 2, 0.9, 10);

    const result = computeGrangerCausality(seriesA, seriesB, 10, {
      ...FAST_CONFIG,
      alpha: 0.05,
    });

    if (result.isSignificant) {
      expect(result.naturalLanguage).toContain('Granger-causes');
      expect(result.naturalLanguage).toContain('F=');
    }
  });

  it('should indicate no significance in naturalLanguage when not significant', () => {
    const n = 100;
    const a = randomWalk(n, 300);
    const b = randomWalk(n, 400);

    const result = computeGrangerCausality(a, b, 3, FAST_CONFIG);

    if (!result.isSignificant) {
      expect(result.naturalLanguage).toContain('No significant');
    }
  });

  // --------------------------------------------------------------------------
  // Input validation
  // --------------------------------------------------------------------------

  it('should throw when time series have unequal lengths', () => {
    const a = sineWave(100);
    const b = sineWave(80);

    expect(() => computeGrangerCausality(a, b, 5)).toThrow('equal length');
  });

  it('should throw when observations are fewer than minObservations', () => {
    const a = sineWave(10);
    const b = sineWave(10);

    expect(() =>
      computeGrangerCausality(a, b, 5, { minObservations: 50 })
    ).toThrow('Insufficient observations');
  });

  // --------------------------------------------------------------------------
  // sampleSize correctness
  // --------------------------------------------------------------------------

  it('should report sampleSize equal to n minus optimalLag', () => {
    const n = 120;
    const a = randomWalk(n, 55);
    const b = randomWalk(n, 66);

    const result = computeGrangerCausality(a, b, 10, FAST_CONFIG);

    expect(result.sampleSize).toBe(n - result.optimalLag);
  });
});

// ============================================================================
// Lag selection criteria (AIC, BIC, HQ)
// ============================================================================

describe('Lag Selection Criteria', () => {
  const n = 200;
  const { seriesA, seriesB } = causalPair(n, 3, 0.7, 88);

  it('should select a lag >= 1 with AIC criterion', () => {
    const result = computeGrangerCausality(seriesA, seriesB, 10, {
      ...FAST_CONFIG,
      lagSelectionCriterion: 'AIC',
    });
    expect(result.optimalLag).toBeGreaterThanOrEqual(1);
  });

  it('should select a lag >= 1 with BIC criterion', () => {
    const result = computeGrangerCausality(seriesA, seriesB, 10, {
      ...FAST_CONFIG,
      lagSelectionCriterion: 'BIC',
    });
    expect(result.optimalLag).toBeGreaterThanOrEqual(1);
  });

  it('should select a lag >= 1 with HQ criterion', () => {
    const result = computeGrangerCausality(seriesA, seriesB, 10, {
      ...FAST_CONFIG,
      lagSelectionCriterion: 'HQ',
    });
    expect(result.optimalLag).toBeGreaterThanOrEqual(1);
  });

  it('BIC should select a lag no larger than AIC (BIC penalises more)', () => {
    const resultAIC = computeGrangerCausality(seriesA, seriesB, 15, {
      ...FAST_CONFIG,
      lagSelectionCriterion: 'AIC',
    });
    const resultBIC = computeGrangerCausality(seriesA, seriesB, 15, {
      ...FAST_CONFIG,
      lagSelectionCriterion: 'BIC',
    });

    // BIC penalises complexity more heavily, so its optimal lag should be <= AIC's
    expect(resultBIC.optimalLag).toBeLessThanOrEqual(resultAIC.optimalLag);
  });

  it('should not exceed maxLag or floor(n/3) in the selected lag', () => {
    const maxLag = 8;
    const result = computeGrangerCausality(seriesA, seriesB, maxLag, {
      ...FAST_CONFIG,
      lagSelectionCriterion: 'AIC',
    });

    const upperBound = Math.min(maxLag, Math.floor(seriesA.length / 3));
    expect(result.optimalLag).toBeLessThanOrEqual(upperBound);
  });
});

// ============================================================================
// buildImpulseResponse
// ============================================================================

describe('buildImpulseResponse', () => {
  it('should return an array of ImpulseResponse objects of length horizons + 1', () => {
    const n = 100;
    const a = randomWalk(n, 7);
    const b = randomWalk(n, 8);
    const horizons = 20;

    const responses = buildImpulseResponse(a, b, 3, horizons);

    expect(responses).toHaveLength(horizons + 1);
    responses.forEach((r) => {
      expect(r).toHaveProperty('lag');
      expect(r).toHaveProperty('response');
      expect(r).toHaveProperty('cumulativeResponse');
      expect(r).toHaveProperty('standardError');
    });
  });

  it('should have zero contemporaneous response at lag 0', () => {
    const n = 100;
    const { seriesA, seriesB } = causalPair(n, 2, 0.8, 33);

    const responses = buildImpulseResponse(seriesA, seriesB, 3, 10);

    expect(responses[0].lag).toBe(0);
    expect(responses[0].response).toBe(0);
  });

  it('should accumulate cumulativeResponse correctly', () => {
    const n = 120;
    const a = sineWave(n, 0.03);
    const b = linearTrend(n, 0.1);

    const responses = buildImpulseResponse(a, b, 2, 15);

    let runningSum = 0;
    for (const r of responses) {
      runningSum += r.response;
      expect(r.cumulativeResponse).toBeCloseTo(runningSum, 8);
    }
  });

  it('should have increasing standard errors over the horizon', () => {
    const n = 100;
    const a = randomWalk(n, 55);
    const b = randomWalk(n, 56);

    const responses = buildImpulseResponse(a, b, 3, 20);

    // SE formula includes sqrt(1 + h * 0.1), so SE grows with h
    for (let i = 1; i < responses.length; i++) {
      expect(responses[i].standardError).toBeGreaterThanOrEqual(
        responses[i - 1].standardError - 1e-10
      );
    }
  });

  it('should produce non-zero responses for a causal pair', () => {
    const n = 200;
    const { seriesA, seriesB } = causalPair(n, 2, 0.9, 44);

    const responses = buildImpulseResponse(seriesA, seriesB, 3, 10);

    // At least one response beyond lag 0 should be non-zero
    const nonZeroResponses = responses.slice(1).filter((r) => Math.abs(r.response) > 1e-8);
    expect(nonZeroResponses.length).toBeGreaterThan(0);
  });

  it('should have lag indices from 0 to horizons', () => {
    const n = 80;
    const a = linearTrend(n, 0.2);
    const b = linearTrend(n, 0.3, 1);
    const horizons = 12;

    const responses = buildImpulseResponse(a, b, 2, horizons);

    responses.forEach((r, idx) => {
      expect(r.lag).toBe(idx);
    });
  });
});

// ============================================================================
// testAllDomainPairs
// ============================================================================

describe('testAllDomainPairs', () => {
  it('should test all ordered pairs (excluding self-pairs)', () => {
    const signals = new Map<string, number[]>();
    signals.set('sales', randomWalk(100, 1));
    signals.set('marketing', randomWalk(100, 2));
    signals.set('support', randomWalk(100, 3));

    const results = testAllDomainPairs(signals, { ...FAST_CONFIG, maxLag: 5 });

    // 3 domains => 3 * 2 = 6 ordered pairs
    expect(results).toHaveLength(6);
  });

  it('should label sourceDomain and targetDomain correctly', () => {
    const signals = new Map<string, number[]>();
    signals.set('A', randomWalk(80, 10));
    signals.set('B', randomWalk(80, 20));

    const results = testAllDomainPairs(signals, { ...FAST_CONFIG, maxLag: 5 });

    const pairs = results.map((r) => `${r.sourceDomain}->${r.targetDomain}`);
    expect(pairs).toContain('A->B');
    expect(pairs).toContain('B->A');
    // Should not contain self-pairs
    expect(pairs).not.toContain('A->A');
    expect(pairs).not.toContain('B->B');
  });

  it('should sort results with significant pairs first, then by descending effect size', () => {
    const n = 150;
    const { seriesA, seriesB } = causalPair(n, 2, 0.9, 60);
    const independent = randomWalk(n, 500);

    const signals = new Map<string, number[]>();
    signals.set('cause', seriesA);
    signals.set('effect', seriesB);
    signals.set('noise', independent);

    const results = testAllDomainPairs(signals, { ...FAST_CONFIG, maxLag: 5 });

    // Verify sort order: significant results come first
    for (let i = 1; i < results.length; i++) {
      if (results[i - 1].isSignificant && !results[i].isSignificant) {
        // This transition is allowed (significant before non-significant)
        continue;
      }
      if (!results[i - 1].isSignificant && results[i].isSignificant) {
        // This would violate the sort order
        expect(true).toBe(false); // Force fail
      }
      if (results[i - 1].isSignificant === results[i].isSignificant) {
        // Within the same significance group, effect sizes should be descending
        expect(results[i - 1].effectSize).toBeGreaterThanOrEqual(
          results[i].effectSize - 1e-10
        );
      }
    }
  });

  it('should skip pairs that throw errors and still return valid results', () => {
    const signals = new Map<string, number[]>();
    signals.set('short', [1, 2, 3]); // Too short, will throw
    signals.set('long', randomWalk(100, 77));

    // With default minObservations=50, the short series should cause errors
    const results = testAllDomainPairs(signals, { maxLag: 5 });

    // Both pairs involving 'short' should have been skipped
    // so we expect 0 results (both pairs fail: short->long and long->short
    // because the series must have equal length for computeGrangerCausality,
    // and here they do not)
    expect(results).toHaveLength(0);
  });

  it('should return an empty array for a single-domain input', () => {
    const signals = new Map<string, number[]>();
    signals.set('only', randomWalk(100, 1));

    const results = testAllDomainPairs(signals, { ...FAST_CONFIG, maxLag: 5 });
    expect(results).toHaveLength(0);
  });

  it('should return an empty array for an empty Map', () => {
    const signals = new Map<string, number[]>();
    const results = testAllDomainPairs(signals);
    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle constant series without crashing', () => {
    const n = 60;
    const a = constantSeries(n, 5);
    const b = constantSeries(n, 10);

    // Constant series have zero variance; OLS may produce degenerate results
    // but should not throw (regularization handles singularity)
    const result = computeGrangerCausality(a, b, 3, FAST_CONFIG);
    expect(isFinite(result.fStatistic) || isNaN(result.fStatistic)).toBe(true);
  });

  it('should handle identical series (A === B) without crashing', () => {
    const n = 80;
    const series = randomWalk(n, 123);

    const result = computeGrangerCausality(series, [...series], 5, FAST_CONFIG);

    expect(result).toHaveProperty('fStatistic');
    expect(result).toHaveProperty('pValue');
  });

  it('should handle very short series at the minObservations boundary', () => {
    const n = 20;
    const a = sineWave(n, 0.1);
    const b = sineWave(n, 0.15);

    // With minObservations=20 and maxLag=2, this should just barely work
    const result = computeGrangerCausality(a, b, 2, { minObservations: 20 });

    expect(result.sampleSize).toBe(n - result.optimalLag);
    expect(result.sampleSize).toBeGreaterThan(0);
  });

  it('should throw for a single-element series', () => {
    expect(() =>
      computeGrangerCausality([1], [2], 1, { minObservations: 1 })
    ).toThrow();
  });

  it('should handle series with a linear trend without crashing', () => {
    const n = 100;
    const a = linearTrend(n, 1.0);
    const b = linearTrend(n, 0.5, 10);

    const result = computeGrangerCausality(a, b, 3, FAST_CONFIG);

    expect(isFinite(result.pValue) || isNaN(result.pValue)).toBe(true);
  });

  it('should handle maxLag of 1', () => {
    const n = 100;
    const a = randomWalk(n, 77);
    const b = randomWalk(n, 88);

    const result = computeGrangerCausality(a, b, 1, FAST_CONFIG);

    expect(result.optimalLag).toBe(1);
  });

  it('should handle maxLag larger than n/3 by capping internally', () => {
    const n = 60;
    const a = randomWalk(n, 11);
    const b = randomWalk(n, 22);

    // maxLag = 50 is greater than floor(60/3) = 20
    const result = computeGrangerCausality(a, b, 50, FAST_CONFIG);

    // The selected lag should not exceed floor(n/3) = 20
    expect(result.optimalLag).toBeLessThanOrEqual(Math.floor(n / 3));
  });

  it('should produce effectSize between 0 and 1 (partial R-squared)', () => {
    const n = 150;
    const a = randomWalk(n, 33);
    const b = randomWalk(n, 44);

    const result = computeGrangerCausality(a, b, 5, FAST_CONFIG);

    expect(result.effectSize).toBeGreaterThanOrEqual(0);
    expect(result.effectSize).toBeLessThanOrEqual(1);
  });
});
