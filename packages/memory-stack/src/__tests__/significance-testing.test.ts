/**
 * Nexus Memory Stack - Significance Testing Module Tests
 *
 * Comprehensive tests for the significance-testing module covering:
 * chi-squared test, Fisher's exact test, Welch's t-test, effect size
 * computation, Bonferroni correction, Benjamini-Hochberg FDR,
 * natural language interpretation, and auto test selection.
 */

import { describe, it, expect } from 'vitest';
import {
  chiSquaredTest,
  fisherExactTest,
  tTest,
  computeEffectSize,
  applyBonferroniCorrection,
  computeFDR,
  generateNaturalLanguageResult,
  testPatternSignificance,
} from '../learning/significance-testing';
import type { ContingencyTable, SignificanceTestResult } from '../learning/significance-testing';

// ============================================================================
// HELPERS
// ============================================================================

/** Build a minimal SignificanceTestResult for correction / NL tests. */
function makeResult(overrides: Partial<SignificanceTestResult>): SignificanceTestResult {
  return {
    hypothesis: 'test',
    testType: 'chi-squared',
    pValue: 0.5,
    testStatistic: 0,
    effectSize: 1,
    effectSizeType: 'odds-ratio',
    effectSizeCI: [0.5, 2],
    sampleSizes: [100],
    isSignificant: false,
    interpretation: '',
    ...overrides,
  };
}

// ============================================================================
// CHI-SQUARED TEST
// ============================================================================

describe('chiSquaredTest', () => {
  it('should detect a significant association in a strongly skewed table', () => {
    const table: ContingencyTable = { exposed: [30, 10], notExposed: [10, 30] };
    const result = chiSquaredTest(table);

    expect(result.testType).toBe('chi-squared');
    expect(result.hypothesis).toBe('Variables are independent');
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.isSignificant).toBe(true);
    expect(result.degreesOfFreedom).toBe(1);
    expect(result.effectSizeType).toBe('odds-ratio');
    // OR = (30*30)/(10*10) = 9
    expect(result.effectSize).toBeCloseTo(9, 1);
    expect(result.sampleSizes).toEqual([80]);
  });

  it('should not detect significance when rows are proportional (no association)', () => {
    const table: ContingencyTable = { exposed: [50, 50], notExposed: [50, 50] };
    const result = chiSquaredTest(table);

    expect(result.testStatistic).toBeCloseTo(0, 5);
    expect(result.pValue).toBeGreaterThan(0.05);
    expect(result.isSignificant).toBe(false);
    // OR = (50*50)/(50*50) = 1
    expect(result.effectSize).toBeCloseTo(1, 5);
  });

  it('should return a valid confidence interval for the odds ratio', () => {
    const table: ContingencyTable = { exposed: [20, 10], notExposed: [10, 20] };
    const result = chiSquaredTest(table);

    expect(result.effectSizeCI[0]).toBeLessThan(result.effectSize);
    expect(result.effectSizeCI[1]).toBeGreaterThan(result.effectSize);
    expect(result.effectSizeCI[0]).toBeGreaterThan(0);
  });
});

// ============================================================================
// FISHER'S EXACT TEST
// ============================================================================

describe('fisherExactTest', () => {
  it('should detect significance in a perfectly separated small table', () => {
    const table: ContingencyTable = { exposed: [5, 0], notExposed: [0, 5] };
    const result = fisherExactTest(table);

    expect(result.testType).toBe('fisher-exact');
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.isSignificant).toBe(true);
  });

  it('should not detect significance in a balanced small table', () => {
    const table: ContingencyTable = { exposed: [3, 3], notExposed: [3, 3] };
    const result = fisherExactTest(table);

    expect(result.pValue).toBeGreaterThan(0.05);
    expect(result.isSignificant).toBe(false);
  });

  it('should produce p-value between 0 and 1', () => {
    const table: ContingencyTable = { exposed: [4, 1], notExposed: [2, 5] };
    const result = fisherExactTest(table);

    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it('should compute odds ratio as effect size', () => {
    const table: ContingencyTable = { exposed: [8, 2], notExposed: [2, 8] };
    const result = fisherExactTest(table);

    // OR = (8*8)/(2*2) = 16
    expect(result.effectSize).toBeCloseTo(16, 0);
    expect(result.effectSizeType).toBe('odds-ratio');
  });
});

// ============================================================================
// T-TEST (WELCH'S)
// ============================================================================

describe('tTest', () => {
  it('should return insufficient-sample result when a group has fewer than 2 elements', () => {
    const result = tTest([5], [10, 20, 30]);

    expect(result.pValue).toBe(1);
    expect(result.testStatistic).toBe(0);
    expect(result.degreesOfFreedom).toBe(0);
    expect(result.effectSize).toBe(0);
    expect(result.isSignificant).toBe(false);
    expect(result.interpretation).toBe('Insufficient sample size for t-test');
    expect(result.sampleSizes).toEqual([1, 3]);
  });

  it('should detect significance for groups with very different means', () => {
    const group1 = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118];
    const group2 = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
    const result = tTest(group1, group2);

    expect(result.testType).toBe('t-test');
    expect(result.pValue).toBeLessThan(0.001);
    expect(result.isSignificant).toBe(true);
    expect(result.testStatistic).toBeGreaterThan(0);
    expect(result.effectSizeType).toBe('cohens-d');
    expect(result.sampleSizes).toEqual([10, 10]);
  });

  it('should not detect significance for identical groups', () => {
    const group = [10, 20, 30, 40, 50];
    const result = tTest(group, group);

    expect(result.testStatistic).toBeCloseTo(0, 5);
    expect(result.pValue).toBeGreaterThan(0.05);
    expect(result.isSignificant).toBe(false);
    expect(result.effectSize).toBeCloseTo(0, 5);
  });

  it('should compute Welch-Satterthwaite degrees of freedom for unequal variances', () => {
    const group1 = [10, 11, 12, 13, 14]; // low variance
    const group2 = [5, 15, 25, 35, 45];  // high variance
    const result = tTest(group1, group2);

    // Welch df should be less than n1+n2-2 = 8 for unequal variances
    expect(result.degreesOfFreedom).toBeDefined();
    expect(result.degreesOfFreedom!).toBeGreaterThan(0);
    expect(result.degreesOfFreedom!).toBeLessThanOrEqual(8);
  });

  it('should produce a negative t-statistic when group1 mean < group2 mean', () => {
    const group1 = [1, 2, 3, 4, 5];
    const group2 = [10, 11, 12, 13, 14];
    const result = tTest(group1, group2);

    expect(result.testStatistic).toBeLessThan(0);
    expect(result.effectSize).toBeLessThan(0);
  });
});

// ============================================================================
// EFFECT SIZE COMPUTATION
// ============================================================================

describe('computeEffectSize', () => {
  it('should compute odds ratio for chi-squared test type', () => {
    const table: ContingencyTable = { exposed: [30, 10], notExposed: [10, 30] };
    const result = computeEffectSize('chi-squared', { table });

    expect(result.type).toBe('odds-ratio');
    // OR = (30*30)/(10*10) = 9 => large
    expect(result.effectSize).toBeCloseTo(9, 1);
    expect(result.magnitude).toBe('large');
  });

  it('should compute odds ratio for fisher-exact test type', () => {
    const table: ContingencyTable = { exposed: [10, 8], notExposed: [9, 11] };
    const result = computeEffectSize('fisher-exact', { table });

    expect(result.type).toBe('odds-ratio');
    expect(result.effectSize).toBeGreaterThan(0);
  });

  it('should classify small odds ratio correctly', () => {
    // OR close to 1 => small
    const table: ContingencyTable = { exposed: [50, 45], notExposed: [48, 47] };
    const result = computeEffectSize('chi-squared', { table });

    expect(result.magnitude).toBe('small');
  });

  it('should compute Cohen\'s d for t-test type', () => {
    const group1 = [100, 102, 104, 106, 108];
    const group2 = [10, 12, 14, 16, 18];
    const result = computeEffectSize('t-test', { group1, group2 });

    expect(result.type).toBe('cohens-d');
    expect(Math.abs(result.effectSize)).toBeGreaterThan(0.8);
    expect(result.magnitude).toBe('large');
  });

  it('should compute Pearson r for correlation test type', () => {
    const result = computeEffectSize('correlation', { correlation: 0.6 });

    expect(result.type).toBe('pearson-r');
    expect(result.effectSize).toBe(0.6);
    expect(result.magnitude).toBe('large');
  });

  it('should classify medium correlation correctly', () => {
    const result = computeEffectSize('correlation', { correlation: 0.35 });
    expect(result.magnitude).toBe('medium');
  });

  it('should return unknown when data is missing', () => {
    const result = computeEffectSize('chi-squared', {});

    expect(result.effectSize).toBe(0);
    expect(result.type).toBe('unknown');
    expect(result.magnitude).toBe('unknown');
  });
});

// ============================================================================
// BONFERRONI CORRECTION
// ============================================================================

describe('applyBonferroniCorrection', () => {
  it('should multiply p-values by number of tests', () => {
    const results = [
      makeResult({ pValue: 0.01 }),
      makeResult({ pValue: 0.03 }),
      makeResult({ pValue: 0.10 }),
    ];
    const corrected = applyBonferroniCorrection(results);

    expect(corrected[0].correctedPValue).toBeCloseTo(0.03, 5);
    expect(corrected[1].correctedPValue).toBeCloseTo(0.09, 5);
    expect(corrected[2].correctedPValue).toBeCloseTo(0.30, 5);
  });

  it('should cap corrected p-values at 1', () => {
    const results = [
      makeResult({ pValue: 0.5 }),
      makeResult({ pValue: 0.8 }),
    ];
    const corrected = applyBonferroniCorrection(results);

    expect(corrected[0].correctedPValue).toBe(1);
    expect(corrected[1].correctedPValue).toBe(1);
  });

  it('should update isSignificant based on corrected threshold', () => {
    const results = [
      makeResult({ pValue: 0.01, isSignificant: true }),
      makeResult({ pValue: 0.04, isSignificant: true }),
    ];
    const corrected = applyBonferroniCorrection(results, 0.05);

    // 0.01 * 2 = 0.02 < 0.05 => significant
    expect(corrected[0].isSignificant).toBe(true);
    // 0.04 * 2 = 0.08 >= 0.05 => not significant
    expect(corrected[1].isSignificant).toBe(false);
  });

  it('should not alter a single test result', () => {
    const results = [makeResult({ pValue: 0.03 })];
    const corrected = applyBonferroniCorrection(results);

    expect(corrected[0].correctedPValue).toBeCloseTo(0.03, 5);
    expect(corrected[0].isSignificant).toBe(true);
  });
});

// ============================================================================
// BENJAMINI-HOCHBERG FDR
// ============================================================================

describe('computeFDR', () => {
  it('should return empty array for empty input', () => {
    const result = computeFDR([]);
    expect(result).toEqual([]);
  });

  it('should compute adjusted p-values and preserve original order', () => {
    const results = [
      makeResult({ pValue: 0.04 }),
      makeResult({ pValue: 0.01 }),
      makeResult({ pValue: 0.10 }),
    ];
    const corrected = computeFDR(results);

    // Original order must be preserved
    expect(corrected.length).toBe(3);
    // The result at index 1 (pValue 0.01) should have the smallest corrected p
    expect(corrected[1].correctedPValue).toBeLessThanOrEqual(corrected[0].correctedPValue!);
    expect(corrected[0].correctedPValue).toBeLessThanOrEqual(corrected[2].correctedPValue!);
  });

  it('should be less conservative than Bonferroni', () => {
    const results = [
      makeResult({ pValue: 0.005 }),
      makeResult({ pValue: 0.015 }),
      makeResult({ pValue: 0.030 }),
      makeResult({ pValue: 0.040 }),
      makeResult({ pValue: 0.100 }),
    ];
    const fdr = computeFDR(results);
    const bonf = applyBonferroniCorrection(results);

    const fdrSignificant = fdr.filter(r => r.isSignificant).length;
    const bonfSignificant = bonf.filter(r => r.isSignificant).length;
    expect(fdrSignificant).toBeGreaterThanOrEqual(bonfSignificant);
  });

  it('should cap corrected p-values at 1', () => {
    const results = [
      makeResult({ pValue: 0.80 }),
      makeResult({ pValue: 0.90 }),
    ];
    const corrected = computeFDR(results);

    for (const r of corrected) {
      expect(r.correctedPValue).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// NATURAL LANGUAGE RESULT
// ============================================================================

describe('generateNaturalLanguageResult', () => {
  it('should indicate significance when result is significant', () => {
    const result = makeResult({
      pValue: 0.001,
      isSignificant: true,
      effectSize: 3.5,
      effectSizeType: 'odds-ratio',
      sampleSizes: [200],
    });
    const text = generateNaturalLanguageResult(result);

    expect(text).toContain('statistically significant');
    expect(text).toContain('p=0.0010');
    expect(text).toContain('higher');
    expect(text).toContain('3.50x');
  });

  it('should indicate non-significance when result is not significant', () => {
    const result = makeResult({
      pValue: 0.25,
      isSignificant: false,
      effectSize: 1.1,
      effectSizeType: 'odds-ratio',
      sampleSizes: [200],
    });
    const text = generateNaturalLanguageResult(result);

    expect(text).toContain('not statistically significant');
  });

  it('should report lower odds when effect size < 1', () => {
    const result = makeResult({
      pValue: 0.01,
      isSignificant: true,
      effectSize: 0.25,
      effectSizeType: 'odds-ratio',
      sampleSizes: [100],
    });
    const text = generateNaturalLanguageResult(result);

    expect(text).toContain('lower');
  });

  it('should report standard deviations for Cohen\'s d', () => {
    const result = makeResult({
      pValue: 0.02,
      isSignificant: true,
      effectSize: 0.85,
      effectSizeType: 'cohens-d',
      sampleSizes: [50],
    });
    const text = generateNaturalLanguageResult(result);

    expect(text).toContain('standard deviations');
    expect(text).toContain('0.85');
  });

  it('should add a small-sample caution when n < 30', () => {
    const result = makeResult({
      pValue: 0.03,
      isSignificant: true,
      effectSize: 2.0,
      effectSizeType: 'odds-ratio',
      sampleSizes: [20],
    });
    const text = generateNaturalLanguageResult(result);

    expect(text).toContain('small sample size');
  });

  it('should not add small-sample caution when n >= 30', () => {
    const result = makeResult({
      pValue: 0.03,
      isSignificant: true,
      effectSize: 2.0,
      effectSizeType: 'odds-ratio',
      sampleSizes: [100],
    });
    const text = generateNaturalLanguageResult(result);

    expect(text).not.toContain('small sample size');
  });
});

// ============================================================================
// testPatternSignificance (AUTO TEST SELECTION)
// ============================================================================

describe('testPatternSignificance', () => {
  it('should select t-test when group data is provided', () => {
    const result = testPatternSignificance({
      group1: [10, 20, 30, 40, 50],
      group2: [60, 70, 80, 90, 100],
    });

    expect(result.testType).toBe('t-test');
    expect(result.isSignificant).toBe(true);
  });

  it('should select Fisher\'s exact test for small contingency tables in auto mode', () => {
    // Total = 12 (< 40), so auto should pick Fisher's exact
    const table: ContingencyTable = { exposed: [3, 2], notExposed: [1, 6] };
    const result = testPatternSignificance({ table });

    expect(result.testType).toBe('fisher-exact');
  });

  it('should select chi-squared test for large contingency tables in auto mode', () => {
    // Total = 200 (>= 40), large expected counts
    const table: ContingencyTable = { exposed: [60, 40], notExposed: [40, 60] };
    const result = testPatternSignificance({ table });

    expect(result.testType).toBe('chi-squared');
  });

  it('should honour explicit fisher-exact test type override', () => {
    const table: ContingencyTable = { exposed: [60, 40], notExposed: [40, 60] };
    const result = testPatternSignificance({ table }, { testType: 'fisher-exact' });

    expect(result.testType).toBe('fisher-exact');
  });

  it('should return insufficient-data result when no data is provided', () => {
    const result = testPatternSignificance({});

    expect(result.pValue).toBe(1);
    expect(result.isSignificant).toBe(false);
    expect(result.interpretation).toBe('Insufficient data for significance testing');
    expect(result.sampleSizes).toEqual([0]);
  });

  it('should prefer group data over table when both are provided', () => {
    const table: ContingencyTable = { exposed: [30, 10], notExposed: [10, 30] };
    const result = testPatternSignificance({
      table,
      group1: [1, 2, 3],
      group2: [4, 5, 6],
    });

    // The function checks group data first
    expect(result.testType).toBe('t-test');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('chiSquaredTest should handle a table with a zero cell', () => {
    const table: ContingencyTable = { exposed: [10, 0], notExposed: [5, 15] };
    const result = chiSquaredTest(table);

    expect(result.testType).toBe('chi-squared');
    expect(isFinite(result.testStatistic)).toBe(true);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it('fisherExactTest should handle zero cells gracefully', () => {
    const table: ContingencyTable = { exposed: [0, 5], notExposed: [5, 0] };
    const result = fisherExactTest(table);

    expect(result.pValue).toBeLessThan(0.05);
    expect(result.isSignificant).toBe(true);
    // OR should be 0 since a=0 => a*d = 0
    expect(result.effectSize).toBe(0);
  });

  it('tTest should handle groups that are both empty (< 2 elements)', () => {
    const result = tTest([], []);

    expect(result.pValue).toBe(1);
    expect(result.isSignificant).toBe(false);
    expect(result.interpretation).toBe('Insufficient sample size for t-test');
  });

  it('tTest with identical constant values in both groups should handle zero variance', () => {
    const result = tTest([7, 7, 7, 7, 7], [7, 7, 7, 7, 7]);

    // 0/0 produces NaN for t; implementation may vary
    expect(result.testType).toBe('t-test');
    expect(result.sampleSizes).toEqual([5, 5]);
  });

  it('applyBonferroniCorrection with large number of tests makes significance harder', () => {
    const results = Array.from({ length: 100 }, () => makeResult({ pValue: 0.04 }));
    const corrected = applyBonferroniCorrection(results, 0.05);

    // 0.04 * 100 = 4.0 >> 0.05 so none should be significant
    for (const r of corrected) {
      expect(r.isSignificant).toBe(false);
      expect(r.correctedPValue).toBe(1);
    }
  });

  it('computeEffectSize for t-test with insufficient sample returns small/zero', () => {
    const result = computeEffectSize('t-test', { group1: [5], group2: [10] });

    // tTest returns effectSize=0 for insufficient sample
    expect(result.type).toBe('cohens-d');
    expect(result.effectSize).toBe(0);
    expect(result.magnitude).toBe('small');
  });
});
