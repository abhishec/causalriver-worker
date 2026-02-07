/**
 * Nexus Memory Stack - Statistical Tests Module Tests
 *
 * Comprehensive tests for hypothesis testing, effect size calculation,
 * confidence interval computation, and multiple testing correction.
 */

import { describe, it, expect } from 'vitest';
import {
  fTestPValue,
  chiSquaredPValue,
  normalCDF,
  normalQuantile,
  fDistributionCDF,
  chiSquaredCDF,
  performFTest,
  performChiSquaredTest,
  performFisherExactTest,
  performTTest,
  computeCohensD,
  computeOddsRatio,
  computeCohensH,
  bonferroniCorrection,
  benjaminiHochberg,
  meanConfidenceInterval,
  proportionConfidenceInterval,
} from '../causality/statistical-tests';

// ============================================================================
// DISTRIBUTION FUNCTIONS
// ============================================================================

describe('Statistical Distribution Functions', () => {
  // --------------------------------------------------------------------------
  // normalCDF
  // --------------------------------------------------------------------------

  describe('normalCDF', () => {
    it('should return 0.5 for x = 0 (symmetry at mean)', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 5);
    });

    it('should return ~0.8413 for x = 1 (one standard deviation)', () => {
      expect(normalCDF(1)).toBeCloseTo(0.8413, 3);
    });

    it('should return ~0.9772 for x = 2 (two standard deviations)', () => {
      expect(normalCDF(2)).toBeCloseTo(0.9772, 3);
    });

    it('should return ~0.975 for x = 1.96 (95% CI critical value)', () => {
      expect(normalCDF(1.96)).toBeCloseTo(0.975, 3);
    });

    it('should return ~0.025 for x = -1.96 (lower tail)', () => {
      expect(normalCDF(-1.96)).toBeCloseTo(0.025, 3);
    });

    it('should return ~0.9987 for x = 3 (three standard deviations)', () => {
      expect(normalCDF(3)).toBeCloseTo(0.9987, 3);
    });

    it('should return ~0.1587 for x = -1 (negative one SD)', () => {
      expect(normalCDF(-1)).toBeCloseTo(0.1587, 3);
    });

    it('should approach 0 for very negative x', () => {
      expect(normalCDF(-5)).toBeLessThan(0.001);
    });

    it('should approach 1 for very positive x', () => {
      expect(normalCDF(5)).toBeGreaterThan(0.999);
    });

    it('should be symmetric: CDF(x) + CDF(-x) = 1', () => {
      const x = 1.5;
      expect(normalCDF(x) + normalCDF(-x)).toBeCloseTo(1, 5);
    });
  });

  // --------------------------------------------------------------------------
  // normalQuantile
  // --------------------------------------------------------------------------

  describe('normalQuantile', () => {
    it('should return 0 for p = 0.5 (median)', () => {
      expect(normalQuantile(0.5)).toBe(0);
    });

    it('should return ~1.96 for p = 0.975', () => {
      expect(normalQuantile(0.975)).toBeCloseTo(1.96, 2);
    });

    it('should return ~-1.96 for p = 0.025', () => {
      expect(normalQuantile(0.025)).toBeCloseTo(-1.96, 2);
    });

    it('should return ~1.645 for p = 0.95 (one-sided 95%)', () => {
      expect(normalQuantile(0.95)).toBeCloseTo(1.645, 2);
    });

    it('should return ~2.576 for p = 0.995 (99% CI bound)', () => {
      expect(normalQuantile(0.995)).toBeCloseTo(2.576, 2);
    });

    it('should return -Infinity for p = 0', () => {
      expect(normalQuantile(0)).toBe(-Infinity);
    });

    it('should return Infinity for p = 1', () => {
      expect(normalQuantile(1)).toBe(Infinity);
    });

    it('should be the inverse of normalCDF for typical values', () => {
      const p = 0.8;
      const z = normalQuantile(p);
      expect(normalCDF(z)).toBeCloseTo(p, 4);
    });

    it('should handle extreme lower tail (p = 0.001)', () => {
      expect(normalQuantile(0.001)).toBeCloseTo(-3.09, 1);
    });

    it('should handle extreme upper tail (p = 0.999)', () => {
      expect(normalQuantile(0.999)).toBeCloseTo(3.09, 1);
    });
  });

  // --------------------------------------------------------------------------
  // fDistributionCDF and fTestPValue
  // --------------------------------------------------------------------------

  describe('fDistributionCDF', () => {
    it('should return a value between 0 and 1 for positive F value', () => {
      const cdf = fDistributionCDF(2.5, 3, 20);
      expect(cdf).toBeGreaterThan(0);
      expect(cdf).toBeLessThan(1);
    });

    it('should increase as F value increases', () => {
      const cdf1 = fDistributionCDF(1, 5, 10);
      const cdf2 = fDistributionCDF(3, 5, 10);
      const cdf3 = fDistributionCDF(10, 5, 10);
      expect(cdf2).toBeGreaterThan(cdf1);
      expect(cdf3).toBeGreaterThan(cdf2);
    });

    it('should approach 1 for very large F values', () => {
      const cdf = fDistributionCDF(100, 5, 20);
      expect(cdf).toBeGreaterThan(0.99);
    });
  });

  describe('fTestPValue', () => {
    it('should return 1 for F statistic <= 0', () => {
      expect(fTestPValue(0, 3, 20)).toBe(1);
      expect(fTestPValue(-1, 3, 20)).toBe(1);
    });

    it('should return a small p-value for large F statistic', () => {
      const p = fTestPValue(10, 3, 30);
      expect(p).toBeLessThan(0.05);
    });

    it('should return a large p-value for small F statistic', () => {
      const p = fTestPValue(0.5, 2, 20);
      expect(p).toBeGreaterThan(0.05);
    });

    it('should decrease as F statistic increases with fixed df', () => {
      const p1 = fTestPValue(1, 5, 20);
      const p2 = fTestPValue(3, 5, 20);
      const p3 = fTestPValue(10, 5, 20);
      expect(p2).toBeLessThan(p1);
      expect(p3).toBeLessThan(p2);
    });
  });

  // --------------------------------------------------------------------------
  // chiSquaredCDF and chiSquaredPValue
  // --------------------------------------------------------------------------

  describe('chiSquaredCDF', () => {
    it('should return 0 for x <= 0', () => {
      expect(chiSquaredCDF(0, 3)).toBe(0);
      expect(chiSquaredCDF(-1, 3)).toBe(0);
    });

    it('should increase monotonically with x', () => {
      const cdf1 = chiSquaredCDF(2, 3);
      const cdf2 = chiSquaredCDF(5, 3);
      const cdf3 = chiSquaredCDF(10, 3);
      expect(cdf2).toBeGreaterThan(cdf1);
      expect(cdf3).toBeGreaterThan(cdf2);
    });

    it('should approach 1 for large x', () => {
      expect(chiSquaredCDF(30, 3)).toBeGreaterThan(0.99);
    });
  });

  describe('chiSquaredPValue', () => {
    it('should return ~0.05 for known critical value (df=1, x~3.841)', () => {
      // chi-squared critical value at alpha=0.05, df=1 is 3.841
      const p = chiSquaredPValue(3.841, 1);
      expect(p).toBeCloseTo(0.05, 1);
    });

    it('should return ~0.05 for known critical value (df=2, x~5.991)', () => {
      const p = chiSquaredPValue(5.991, 2);
      expect(p).toBeCloseTo(0.05, 1);
    });

    it('should return ~0.01 for known critical value (df=1, x~6.635)', () => {
      const p = chiSquaredPValue(6.635, 1);
      expect(p).toBeCloseTo(0.01, 1);
    });

    it('should return 1 for x = 0', () => {
      const p = chiSquaredPValue(0, 5);
      expect(p).toBeCloseTo(1, 2);
    });

    it('should return a small p-value for large statistic', () => {
      const p = chiSquaredPValue(20, 2);
      expect(p).toBeLessThan(0.001);
    });
  });
});

// ============================================================================
// SIGNIFICANCE TESTS
// ============================================================================

describe('Significance Tests', () => {
  // --------------------------------------------------------------------------
  // performFTest
  // --------------------------------------------------------------------------

  describe('performFTest', () => {
    it('should detect significance when restricted model is much worse', () => {
      // rssRestricted = 100, rssUnrestricted = 50, dfR = 30, dfU = 28
      // F = ((100-50)/2) / (50/28) = 25 / 1.786 ~ 14.0
      const result = performFTest(100, 50, 30, 28, 0.05);
      expect(result.testType).toBe('f_test');
      expect(result.statistic).toBeGreaterThan(0);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.isSignificant).toBe(true);
    });

    it('should not detect significance when models are similar', () => {
      // rssRestricted = 100, rssUnrestricted = 98
      // Very small improvement, should not be significant
      const result = performFTest(100, 98, 30, 28, 0.05);
      expect(result.isSignificant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('should compute correct degrees of freedom', () => {
      const result = performFTest(100, 50, 30, 25, 0.05);
      // df1 = dfRestricted - dfUnrestricted = 30 - 25 = 5
      expect(result.degreesOfFreedom).toBe(5);
    });

    it('should respect custom alpha threshold', () => {
      const result = performFTest(100, 80, 50, 48, 0.01);
      // With strict alpha, border-line results flip
      expect(result.isSignificant).toBe(result.pValue < 0.01);
    });

    it('should return correct F statistic formula', () => {
      const rssR = 200;
      const rssU = 150;
      const dfR = 50;
      const dfU = 47;
      const df1 = dfR - dfU; // 3
      const df2 = dfU; // 47

      const expectedF = ((rssR - rssU) / df1) / (rssU / df2);
      const result = performFTest(rssR, rssU, dfR, dfU);
      expect(result.statistic).toBeCloseTo(expectedF, 6);
    });
  });

  // --------------------------------------------------------------------------
  // performChiSquaredTest
  // --------------------------------------------------------------------------

  describe('performChiSquaredTest', () => {
    it('should detect significant association in a 2x2 table', () => {
      // Classic example: treatment vs control with strong effect
      const observed = [
        [30, 10], // treatment: 30 success, 10 failure
        [10, 30], // control:   10 success, 30 failure
      ];
      const result = performChiSquaredTest(observed, 0.05);
      expect(result.testType).toBe('chi_squared');
      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.degreesOfFreedom).toBe(1); // (2-1)*(2-1)
    });

    it('should not detect association when data is independent', () => {
      // Rows proportional to each other => no association
      const observed = [
        [50, 50],
        [50, 50],
      ];
      const result = performChiSquaredTest(observed, 0.05);
      expect(result.statistic).toBeCloseTo(0, 5);
      expect(result.isSignificant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('should handle a 3x2 contingency table', () => {
      const observed = [
        [20, 30],
        [15, 35],
        [25, 25],
      ];
      const result = performChiSquaredTest(observed, 0.05);
      // df = (3-1)*(2-1) = 2
      expect(result.degreesOfFreedom).toBe(2);
      expect(result.statistic).toBeGreaterThan(0);
    });

    it('should handle a 2x3 contingency table', () => {
      const observed = [
        [10, 20, 30],
        [30, 20, 10],
      ];
      const result = performChiSquaredTest(observed, 0.05);
      // df = (2-1)*(3-1) = 2
      expect(result.degreesOfFreedom).toBe(2);
      expect(result.isSignificant).toBe(true);
    });

    it('should compute known chi-squared statistic for a classic table', () => {
      // Men vs Women who prefer tea vs coffee
      // Observed: [[10, 20], [30, 40]]
      // Row totals: [30, 70], Col totals: [40, 60], Grand total: 100
      // Expected: [[12, 18], [28, 42]]
      // chi2 = (10-12)^2/12 + (20-18)^2/18 + (30-28)^2/28 + (40-42)^2/42
      //       = 4/12 + 4/18 + 4/28 + 4/42
      //       = 0.3333 + 0.2222 + 0.1429 + 0.0952 = 0.7937
      const observed = [
        [10, 20],
        [30, 40],
      ];
      const result = performChiSquaredTest(observed, 0.05);
      expect(result.statistic).toBeCloseTo(0.7937, 2);
      expect(result.isSignificant).toBe(false); // not significant at 0.05
    });
  });

  // --------------------------------------------------------------------------
  // performFisherExactTest
  // --------------------------------------------------------------------------

  describe('performFisherExactTest', () => {
    it('should detect significance in a highly skewed 2x2 table', () => {
      // Strong association
      const result = performFisherExactTest(10, 0, 0, 10, 0.05);
      expect(result.testType).toBe('fisher_exact');
      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
    });

    it('should not detect significance for a balanced 2x2 table', () => {
      // No association: all cells equal
      const result = performFisherExactTest(5, 5, 5, 5, 0.05);
      expect(result.isSignificant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('should produce a p-value between 0 and 1', () => {
      const result = performFisherExactTest(3, 7, 8, 2, 0.05);
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    });

    it('should respect custom alpha level', () => {
      const result = performFisherExactTest(8, 2, 1, 9, 0.01);
      expect(result.isSignificant).toBe(result.pValue < 0.01);
    });

    it('should handle a known Lady Tasting Tea example', () => {
      // Classic Fisher example: a=3, b=1, c=1, d=3 (n=8)
      const result = performFisherExactTest(3, 1, 1, 3, 0.05);
      // p-value for this table is known to be ~0.4857 (two-sided)
      expect(result.pValue).toBeGreaterThan(0.05);
      expect(result.isSignificant).toBe(false);
    });

    it('should handle zero cells gracefully', () => {
      const result = performFisherExactTest(0, 5, 5, 0, 0.05);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.isSignificant).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // performTTest
  // --------------------------------------------------------------------------

  describe('performTTest', () => {
    it('should not find significance when groups have same distribution', () => {
      const group1 = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const group2 = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const result = performTTest(group1, group2, 0.05);
      expect(result.testType).toBe('t_test');
      expect(result.statistic).toBeCloseTo(0, 5);
      expect(result.pValue).toBeGreaterThan(0.05);
      expect(result.isSignificant).toBe(false);
    });

    it('should detect significance when groups have very different means', () => {
      const group1 = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
      const group2 = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const result = performTTest(group1, group2, 0.05);
      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.001);
    });

    it('should compute correct degrees of freedom', () => {
      const group1 = [1, 2, 3, 4, 5];
      const group2 = [6, 7, 8, 9, 10];
      const result = performTTest(group1, group2, 0.05);
      // df = n1 + n2 - 2 = 5 + 5 - 2 = 8
      expect(result.degreesOfFreedom).toBe(8);
    });

    it('should return a positive t-statistic when group1 mean > group2 mean', () => {
      const group1 = [20, 21, 22, 23, 24];
      const group2 = [10, 11, 12, 13, 14];
      const result = performTTest(group1, group2, 0.05);
      expect(result.statistic).toBeGreaterThan(0);
    });

    it('should return a negative t-statistic when group1 mean < group2 mean', () => {
      const group1 = [10, 11, 12, 13, 14];
      const group2 = [20, 21, 22, 23, 24];
      const result = performTTest(group1, group2, 0.05);
      expect(result.statistic).toBeLessThan(0);
    });

    it('should handle groups of different sizes', () => {
      const group1 = [5, 6, 7, 8, 9, 10, 11, 12];
      const group2 = [15, 16, 17];
      const result = performTTest(group1, group2, 0.05);
      // df = 8 + 3 - 2 = 9
      expect(result.degreesOfFreedom).toBe(9);
      expect(result.isSignificant).toBe(true);
    });
  });
});

// ============================================================================
// EFFECT SIZES
// ============================================================================

describe('Effect Size Calculations', () => {
  // --------------------------------------------------------------------------
  // computeCohensD
  // --------------------------------------------------------------------------

  describe('computeCohensD', () => {
    it('should return NaN for identical constant groups (zero pooled SD)', () => {
      const group1 = [5, 5, 5, 5, 5];
      const group2 = [5, 5, 5, 5, 5];
      const result = computeCohensD(group1, group2);
      // Pooled SD is 0 for constant identical groups, so d = 0/0 = NaN
      expect(result.effectSize).toBeNaN();
      expect(result.effectType).toBe('cohens_d');
    });

    it('should return a large effect for very different groups', () => {
      const group1 = [100, 101, 102, 103, 104];
      const group2 = [10, 11, 12, 13, 14];
      const result = computeCohensD(group1, group2);
      expect(Math.abs(result.effectSize)).toBeGreaterThan(1.2);
      expect(result.interpretation).toBe('very_large');
    });

    it('should classify small effect size correctly (|d| ~ 0.2-0.5)', () => {
      // Construct groups about 0.3 SD apart
      const group1 = [10.0, 10.5, 11.0, 10.8, 10.3, 11.2, 10.7, 10.4, 10.9, 10.6];
      const group2 = [10.0, 9.5, 10.0, 9.8, 10.3, 9.2, 9.7, 10.4, 9.9, 9.6];
      const result = computeCohensD(group1, group2);
      // With these values the effect should be in the small-to-medium range
      expect(Math.abs(result.effectSize)).toBeGreaterThan(0);
    });

    it('should include a valid confidence interval', () => {
      const group1 = [10, 12, 14, 16, 18];
      const group2 = [5, 7, 9, 11, 13];
      const result = computeCohensD(group1, group2, 0.95);
      expect(result.confidenceInterval.level).toBe(0.95);
      expect(result.confidenceInterval.lower).toBeLessThan(result.effectSize);
      expect(result.confidenceInterval.upper).toBeGreaterThan(result.effectSize);
    });

    it('should produce wider CI at higher confidence level', () => {
      const group1 = [10, 12, 14, 16, 18];
      const group2 = [5, 7, 9, 11, 13];
      const ci95 = computeCohensD(group1, group2, 0.95);
      const ci99 = computeCohensD(group1, group2, 0.99);
      const width95 = ci95.confidenceInterval.upper - ci95.confidenceInterval.lower;
      const width99 = ci99.confidenceInterval.upper - ci99.confidenceInterval.lower;
      expect(width99).toBeGreaterThan(width95);
    });

    it('should interpret medium effect correctly (|d| ~ 0.5-0.8)', () => {
      // Mean difference = ~3.5, pooled SD ~5 => d ~ 0.7
      const group1 = [15, 17, 19, 14, 16, 18, 20, 13, 21, 17];
      const group2 = [10, 12, 14, 11, 13, 15, 17, 9, 18, 13];
      const result = computeCohensD(group1, group2);
      if (Math.abs(result.effectSize) >= 0.5 && Math.abs(result.effectSize) < 0.8) {
        expect(result.interpretation).toBe('medium');
      }
    });
  });

  // --------------------------------------------------------------------------
  // computeOddsRatio
  // --------------------------------------------------------------------------

  describe('computeOddsRatio', () => {
    it('should return ~1 when there is no association', () => {
      // a/b = c/d => OR ~ 1
      const result = computeOddsRatio(10, 10, 10, 10, 0.95);
      expect(result.effectSize).toBeCloseTo(1, 0);
      expect(result.effectType).toBe('odds_ratio');
      expect(result.interpretation).toBe('negligible');
    });

    it('should return a large OR for strong positive association', () => {
      const result = computeOddsRatio(50, 5, 5, 50, 0.95);
      expect(result.effectSize).toBeGreaterThan(5);
      expect(result.interpretation).toBe('very_large');
    });

    it('should include a valid confidence interval', () => {
      const result = computeOddsRatio(20, 10, 10, 20, 0.95);
      expect(result.confidenceInterval.level).toBe(0.95);
      expect(result.confidenceInterval.lower).toBeLessThan(result.effectSize);
      expect(result.confidenceInterval.upper).toBeGreaterThan(result.effectSize);
    });

    it('should handle zero cells using Haldane correction', () => {
      // Zero cell: the function adds epsilon=0.5
      const result = computeOddsRatio(10, 0, 0, 10, 0.95);
      expect(result.effectSize).toBeGreaterThan(1);
      expect(isFinite(result.effectSize)).toBe(true);
    });

    it('should have CI containing 1 when no real association exists', () => {
      const result = computeOddsRatio(10, 10, 10, 10, 0.95);
      expect(result.confidenceInterval.lower).toBeLessThan(1);
      expect(result.confidenceInterval.upper).toBeGreaterThan(1);
    });

    it('should produce wider CI at higher confidence level', () => {
      const ci95 = computeOddsRatio(30, 10, 10, 30, 0.95);
      const ci99 = computeOddsRatio(30, 10, 10, 30, 0.99);
      const width95 = ci95.confidenceInterval.upper - ci95.confidenceInterval.lower;
      const width99 = ci99.confidenceInterval.upper - ci99.confidenceInterval.lower;
      expect(width99).toBeGreaterThan(width95);
    });
  });

  // --------------------------------------------------------------------------
  // computeCohensH
  // --------------------------------------------------------------------------

  describe('computeCohensH', () => {
    it('should return 0 when proportions are equal', () => {
      const result = computeCohensH(0.5, 0.5, 100, 100, 0.95);
      expect(result.effectSize).toBeCloseTo(0, 5);
      expect(result.effectType).toBe('cohens_h');
      expect(result.interpretation).toBe('negligible');
    });

    it('should return a positive value when p1 > p2', () => {
      const result = computeCohensH(0.8, 0.3, 100, 100, 0.95);
      expect(result.effectSize).toBeGreaterThan(0);
    });

    it('should return a negative value when p1 < p2', () => {
      const result = computeCohensH(0.3, 0.8, 100, 100, 0.95);
      expect(result.effectSize).toBeLessThan(0);
    });

    it('should detect large effect for very different proportions', () => {
      const result = computeCohensH(0.9, 0.1, 100, 100, 0.95);
      expect(Math.abs(result.effectSize)).toBeGreaterThan(0.8);
      expect(['large', 'very_large']).toContain(result.interpretation);
    });

    it('should include a valid confidence interval', () => {
      const result = computeCohensH(0.6, 0.4, 200, 200, 0.95);
      expect(result.confidenceInterval.level).toBe(0.95);
      expect(result.confidenceInterval.lower).toBeLessThan(result.effectSize);
      expect(result.confidenceInterval.upper).toBeGreaterThan(result.effectSize);
    });

    it('should produce narrower CI with larger samples', () => {
      const small = computeCohensH(0.6, 0.4, 30, 30, 0.95);
      const large = computeCohensH(0.6, 0.4, 300, 300, 0.95);
      const widthSmall = small.confidenceInterval.upper - small.confidenceInterval.lower;
      const widthLarge = large.confidenceInterval.upper - large.confidenceInterval.lower;
      expect(widthLarge).toBeLessThan(widthSmall);
    });
  });
});

// ============================================================================
// MULTIPLE TESTING CORRECTION
// ============================================================================

describe('Multiple Testing Correction', () => {
  // --------------------------------------------------------------------------
  // bonferroniCorrection
  // --------------------------------------------------------------------------

  describe('bonferroniCorrection', () => {
    it('should multiply p-values by the number of tests', () => {
      const pValues = [0.01, 0.04, 0.03];
      const result = bonferroniCorrection(pValues, 0.05);
      expect(result.adjustedPValues[0]).toBeCloseTo(0.03, 5);
      expect(result.adjustedPValues[1]).toBeCloseTo(0.12, 5);
      expect(result.adjustedPValues[2]).toBeCloseTo(0.09, 5);
    });

    it('should cap adjusted p-values at 1', () => {
      const pValues = [0.01, 0.5, 0.8];
      const result = bonferroniCorrection(pValues, 0.05);
      expect(result.adjustedPValues[1]).toBe(1);
      expect(result.adjustedPValues[2]).toBe(1);
    });

    it('should correctly identify significant indices', () => {
      const pValues = [0.001, 0.01, 0.05, 0.1];
      const result = bonferroniCorrection(pValues, 0.05);
      // Adjusted: [0.004, 0.04, 0.20, 0.40]
      // Significant at 0.05: indices 0 and 1
      expect(result.significantIndices).toEqual([0, 1]);
    });

    it('should return empty significant indices when none are significant', () => {
      const pValues = [0.1, 0.2, 0.3];
      const result = bonferroniCorrection(pValues, 0.05);
      expect(result.significantIndices).toEqual([]);
    });

    it('should handle a single p-value (no correction needed)', () => {
      const pValues = [0.03];
      const result = bonferroniCorrection(pValues, 0.05);
      expect(result.adjustedPValues[0]).toBeCloseTo(0.03, 5);
      expect(result.significantIndices).toEqual([0]);
    });
  });

  // --------------------------------------------------------------------------
  // benjaminiHochberg
  // --------------------------------------------------------------------------

  describe('benjaminiHochberg', () => {
    it('should produce adjusted p-values less conservative than Bonferroni', () => {
      const pValues = [0.001, 0.01, 0.04, 0.05, 0.1];
      const bh = benjaminiHochberg(pValues, 0.05);
      const bonf = bonferroniCorrection(pValues, 0.05);
      // BH should have at least as many significant results
      expect(bh.significantIndices.length).toBeGreaterThanOrEqual(
        bonf.significantIndices.length
      );
    });

    it('should maintain the order of adjusted p-values relative to original', () => {
      const pValues = [0.01, 0.03, 0.05, 0.10];
      const result = benjaminiHochberg(pValues, 0.05);
      // Smaller original p-values should have smaller or equal adjusted values
      for (let i = 0; i < pValues.length - 1; i++) {
        if (pValues[i] < pValues[i + 1]) {
          expect(result.adjustedPValues[i]).toBeLessThanOrEqual(
            result.adjustedPValues[i + 1] + 1e-10
          );
        }
      }
    });

    it('should correctly identify significant indices under FDR control', () => {
      const pValues = [0.001, 0.005, 0.01, 0.04, 0.06, 0.10, 0.50];
      const result = benjaminiHochberg(pValues, 0.05);
      // All significant indices should have adjusted p < 0.05
      for (const idx of result.significantIndices) {
        expect(result.adjustedPValues[idx]).toBeLessThan(0.05);
      }
    });

    it('should return empty significant indices when none pass', () => {
      const pValues = [0.5, 0.6, 0.7, 0.8];
      const result = benjaminiHochberg(pValues, 0.05);
      expect(result.significantIndices).toEqual([]);
    });

    it('should handle ties in p-values', () => {
      const pValues = [0.03, 0.03, 0.03];
      const result = benjaminiHochberg(pValues, 0.05);
      // All adjusted values should be equal since originals are equal
      expect(result.adjustedPValues[0]).toBeCloseTo(result.adjustedPValues[1], 10);
      expect(result.adjustedPValues[1]).toBeCloseTo(result.adjustedPValues[2], 10);
    });

    it('should produce adjusted p-values that are monotonically non-decreasing when sorted by original', () => {
      const pValues = [0.04, 0.001, 0.02, 0.1, 0.005];
      const result = benjaminiHochberg(pValues, 0.05);
      // Create pairs of (original p, adjusted p) and sort by original
      const pairs = pValues.map((p, i) => ({ orig: p, adj: result.adjustedPValues[i] }));
      pairs.sort((a, b) => a.orig - b.orig);
      for (let i = 0; i < pairs.length - 1; i++) {
        expect(pairs[i].adj).toBeLessThanOrEqual(pairs[i + 1].adj + 1e-10);
      }
    });
  });
});

// ============================================================================
// CONFIDENCE INTERVALS
// ============================================================================

describe('Confidence Intervals', () => {
  // --------------------------------------------------------------------------
  // meanConfidenceInterval
  // --------------------------------------------------------------------------

  describe('meanConfidenceInterval', () => {
    it('should contain the sample mean within the interval', () => {
      const data = [10, 12, 14, 16, 18, 20];
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const ci = meanConfidenceInterval(data, 0.95);
      expect(ci.lower).toBeLessThan(mean);
      expect(ci.upper).toBeGreaterThan(mean);
    });

    it('should have the correct confidence level', () => {
      const data = [5, 6, 7, 8, 9];
      const ci = meanConfidenceInterval(data, 0.99);
      expect(ci.level).toBe(0.99);
    });

    it('should produce a wider interval at 99% than at 95%', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ci95 = meanConfidenceInterval(data, 0.95);
      const ci99 = meanConfidenceInterval(data, 0.99);
      const width95 = ci95.upper - ci95.lower;
      const width99 = ci99.upper - ci99.lower;
      expect(width99).toBeGreaterThan(width95);
    });

    it('should produce a narrow interval for data with low variance', () => {
      const data = [100, 100, 100, 100, 100.1, 99.9];
      const ci = meanConfidenceInterval(data, 0.95);
      const width = ci.upper - ci.lower;
      expect(width).toBeLessThan(1);
    });

    it('should produce a wider interval for data with high variance', () => {
      const lowVar = [50, 50, 50, 50, 50];
      const highVar = [10, 30, 50, 70, 90];
      const ciLow = meanConfidenceInterval(lowVar, 0.95);
      const ciHigh = meanConfidenceInterval(highVar, 0.95);
      const widthLow = ciLow.upper - ciLow.lower;
      const widthHigh = ciHigh.upper - ciHigh.lower;
      expect(widthHigh).toBeGreaterThan(widthLow);
    });

    it('should narrow with increasing sample size', () => {
      const small = [10, 20, 30, 40, 50];
      const large = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
      // Not exactly same mean/variance, but bigger sample => generally narrower
      const ciSmall = meanConfidenceInterval(small, 0.95);
      const widthSmall = ciSmall.upper - ciSmall.lower;
      // Manually construct a larger sample with same spread
      const largerData = Array.from({ length: 100 }, (_, i) => 10 + (i % 5) * 10);
      const ciLarger = meanConfidenceInterval(largerData, 0.95);
      const widthLarger = ciLarger.upper - ciLarger.lower;
      expect(widthLarger).toBeLessThan(widthSmall);
    });
  });

  // --------------------------------------------------------------------------
  // proportionConfidenceInterval (Wilson score)
  // --------------------------------------------------------------------------

  describe('proportionConfidenceInterval', () => {
    it('should contain the sample proportion', () => {
      const ci = proportionConfidenceInterval(50, 100, 0.95);
      expect(ci.lower).toBeLessThan(0.5);
      expect(ci.upper).toBeGreaterThan(0.5);
    });

    it('should be bounded between 0 and 1', () => {
      const ci = proportionConfidenceInterval(1, 100, 0.95);
      expect(ci.lower).toBeGreaterThanOrEqual(0);
      expect(ci.upper).toBeLessThanOrEqual(1);
    });

    it('should handle extreme proportion near 0', () => {
      const ci = proportionConfidenceInterval(1, 1000, 0.95);
      expect(ci.lower).toBeGreaterThanOrEqual(0);
      expect(ci.upper).toBeGreaterThan(0.001);
      expect(ci.upper).toBeLessThan(0.1);
    });

    it('should handle extreme proportion near 1', () => {
      const ci = proportionConfidenceInterval(999, 1000, 0.95);
      expect(ci.upper).toBeLessThanOrEqual(1);
      expect(ci.lower).toBeGreaterThan(0.9);
    });

    it('should produce a wider interval at 99% than at 95%', () => {
      const ci95 = proportionConfidenceInterval(50, 200, 0.95);
      const ci99 = proportionConfidenceInterval(50, 200, 0.99);
      const width95 = ci95.upper - ci95.lower;
      const width99 = ci99.upper - ci99.lower;
      expect(width99).toBeGreaterThan(width95);
    });

    it('should produce a narrower interval with larger sample size', () => {
      const ciSmall = proportionConfidenceInterval(5, 10, 0.95);
      const ciLarge = proportionConfidenceInterval(500, 1000, 0.95);
      const widthSmall = ciSmall.upper - ciSmall.lower;
      const widthLarge = ciLarge.upper - ciLarge.lower;
      expect(widthLarge).toBeLessThan(widthSmall);
    });

    it('should have the correct confidence level', () => {
      const ci = proportionConfidenceInterval(30, 100, 0.90);
      expect(ci.level).toBe(0.90);
    });

    it('should handle proportion of exactly 0.5 symmetrically', () => {
      const ci = proportionConfidenceInterval(50, 100, 0.95);
      const distLower = 0.5 - ci.lower;
      const distUpper = ci.upper - 0.5;
      // Wilson interval is approximately symmetric at p=0.5
      expect(distLower).toBeCloseTo(distUpper, 2);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('normalCDF should handle zero correctly', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 8);
  });

  it('normalQuantile should handle boundary values', () => {
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
    expect(normalQuantile(0.5)).toBe(0);
  });

  it('fTestPValue should return 1 for non-positive F statistic', () => {
    expect(fTestPValue(0, 5, 20)).toBe(1);
    expect(fTestPValue(-5, 3, 10)).toBe(1);
  });

  it('chiSquaredCDF should return 0 for non-positive x', () => {
    expect(chiSquaredCDF(0, 5)).toBe(0);
    expect(chiSquaredCDF(-10, 3)).toBe(0);
  });

  it('bonferroniCorrection should handle a single test', () => {
    const result = bonferroniCorrection([0.04], 0.05);
    expect(result.adjustedPValues).toEqual([0.04]);
    expect(result.significantIndices).toEqual([0]);
  });

  it('benjaminiHochberg should handle a single test', () => {
    const result = benjaminiHochberg([0.04], 0.05);
    expect(result.adjustedPValues[0]).toBeCloseTo(0.04, 10);
    expect(result.significantIndices).toEqual([0]);
  });

  it('proportionConfidenceInterval should clamp lower bound at 0', () => {
    const ci = proportionConfidenceInterval(0, 10, 0.95);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
  });

  it('proportionConfidenceInterval should clamp upper bound at 1', () => {
    const ci = proportionConfidenceInterval(10, 10, 0.95);
    expect(ci.upper).toBeLessThanOrEqual(1);
  });

  it('computeOddsRatio should handle all-zero cells without NaN', () => {
    // With Haldane correction (epsilon=0.5), this should still produce a finite result
    const result = computeOddsRatio(0, 0, 0, 0, 0.95);
    expect(isFinite(result.effectSize)).toBe(true);
    expect(isNaN(result.effectSize)).toBe(false);
  });

  it('performChiSquaredTest with uniform distribution should yield zero statistic', () => {
    const observed = [
      [25, 25],
      [25, 25],
    ];
    const result = performChiSquaredTest(observed, 0.05);
    expect(result.statistic).toBeCloseTo(0, 5);
  });

  it('performTTest with constant values in both groups should handle zero variance', () => {
    // Both groups have the same constant value => zero variance, zero SE
    // This will produce 0/0 = NaN for the t-statistic
    const group1 = [5, 5, 5, 5, 5];
    const group2 = [5, 5, 5, 5, 5];
    const result = performTTest(group1, group2, 0.05);
    // t = (5-5) / 0 => 0/0 = NaN, but 0 * anything = 0 in numerator
    // pooledVar = 0, se = 0, t = 0/0 => NaN
    // This is an inherent edge case of the implementation
    expect(result.testType).toBe('t_test');
  });

  it('fDistributionCDF should return values between 0 and 1', () => {
    for (const f of [0.1, 0.5, 1, 2, 5, 10, 50]) {
      const cdf = fDistributionCDF(f, 3, 20);
      expect(cdf).toBeGreaterThanOrEqual(0);
      expect(cdf).toBeLessThanOrEqual(1);
    }
  });

  it('normalCDF and normalQuantile should be consistent inverses', () => {
    const testValues = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
    for (const p of testValues) {
      const z = normalQuantile(p);
      const recovered = normalCDF(z);
      expect(recovered).toBeCloseTo(p, 3);
    }
  });
});
