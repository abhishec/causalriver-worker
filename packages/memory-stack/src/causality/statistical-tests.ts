/**
 * Statistical Tests Utility Module
 * 
 * Core statistical functions for hypothesis testing, effect size calculation,
 * and confidence interval computation. Used across all causality modules.
 * 
 * Implements:
 * - F-statistic computation for Granger causality
 * - Chi-squared and Fisher's exact tests
 * - Cohen's d and odds ratio effect sizes
 * - Confidence interval calculations
 * - Bonferroni correction for multiple testing
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SignificanceResult {
  statistic: number;
  pValue: number;
  isSignificant: boolean;
  testType: TestType;
  degreesOfFreedom?: number;
}

export interface EffectSizeResult {
  effectSize: number;
  effectType: EffectSizeType;
  interpretation: EffectInterpretation;
  confidenceInterval: ConfidenceInterval;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number; // 0.95 for 95% CI
}

export type TestType = 
  | 'f_test'
  | 'chi_squared'
  | 'fisher_exact'
  | 't_test'
  | 'mann_whitney'
  | 'granger';

export type EffectSizeType = 
  | 'cohens_d'
  | 'cohens_h'
  | 'odds_ratio'
  | 'relative_risk'
  | 'eta_squared'
  | 'partial_eta_squared';

export type EffectInterpretation = 
  | 'negligible'
  | 'small'
  | 'medium'
  | 'large'
  | 'very_large';

// ============================================================================
// STATISTICAL DISTRIBUTIONS
// ============================================================================

/**
 * Compute the cumulative distribution function for F-distribution
 * Using approximation suitable for edge function runtime
 */
export function fDistributionCDF(
  fValue: number,
  df1: number,
  df2: number
): number {
  // Regularized incomplete beta function approximation
  const x = df2 / (df2 + df1 * fValue);
  return 1 - incompleteBeta(df2 / 2, df1 / 2, x);
}

/**
 * Compute p-value for F-test
 */
export function fTestPValue(
  fStatistic: number,
  df1: number,
  df2: number
): number {
  if (fStatistic <= 0) return 1;
  return 1 - fDistributionCDF(fStatistic, df1, df2);
}

/**
 * Chi-squared distribution CDF
 */
export function chiSquaredCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  return gammaCDF(df / 2, x / 2);
}

/**
 * Compute p-value for chi-squared test
 */
export function chiSquaredPValue(statistic: number, df: number): number {
  return 1 - chiSquaredCDF(statistic, df);
}

/**
 * Normal distribution CDF (Φ function)
 */
export function normalCDF(x: number): number {
  // Approximation using error function
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * Inverse normal CDF (quantile function)
 */
export function normalQuantile(p: number): number {
  // Rational approximation for inverse normal
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  
  // Coefficients for rational approximation
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];
  
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  
  let q: number, r: number;
  
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Error function approximation
 */
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return sign * y;
}

/**
 * Incomplete beta function approximation
 */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;
  
  // Use continued fraction for better accuracy
  const bt = Math.exp(
    gammaLn(a + b) - gammaLn(a) - gammaLn(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );
  
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(a, b, x) / a;
  } else {
    return 1 - bt * betaCF(b, a, 1 - x) / b;
  }
}

/**
 * Continued fraction for incomplete beta
 */
function betaCF(a: number, b: number, x: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;
  
  let m = 1;
  let aa: number, del: number;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  
  if (Math.abs(d) < epsilon) d = epsilon;
  d = 1 / d;
  let h = d;
  
  for (m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    
    aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    h *= d * c;
    
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    del = d * c;
    h *= del;
    
    if (Math.abs(del - 1) < epsilon) break;
  }
  
  return h;
}

/**
 * Log gamma function (Lanczos approximation)
 */
function gammaLn(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaLn(1 - x);
  }
  
  x -= 1;
  let a = c[0];
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  const t = x + g + 0.5;
  
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Gamma CDF for chi-squared
 */
function gammaCDF(shape: number, x: number): number {
  if (x <= 0) return 0;
  
  // Lower incomplete gamma function / gamma(shape)
  return lowerIncompleteGamma(shape, x) / Math.exp(gammaLn(shape));
}

/**
 * Lower incomplete gamma function
 */
function lowerIncompleteGamma(a: number, x: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;
  
  if (x < a + 1) {
    // Series expansion
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < maxIterations; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < epsilon * Math.abs(sum)) break;
    }
    return Math.exp(-x + a * Math.log(x) - gammaLn(a)) * sum;
  } else {
    // Continued fraction
    return Math.exp(gammaLn(a)) - upperIncompleteGamma(a, x);
  }
}

/**
 * Upper incomplete gamma function
 */
function upperIncompleteGamma(a: number, x: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;
  
  let b = x + 1 - a;
  let c = 1 / epsilon;
  let d = 1 / b;
  let h = d;
  
  for (let i = 1; i <= maxIterations; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = b + an / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < epsilon) break;
  }
  
  return Math.exp(-x + a * Math.log(x) - gammaLn(a)) * h;
}

// ============================================================================
// SIGNIFICANCE TESTS
// ============================================================================

/**
 * Perform F-test for comparing variances or regression models
 */
export function performFTest(
  rssRestricted: number,
  rssUnrestricted: number,
  dfRestricted: number,
  dfUnrestricted: number,
  alpha: number = 0.05
): SignificanceResult {
  const df1 = dfRestricted - dfUnrestricted;
  const df2 = dfUnrestricted;
  
  const fStatistic = ((rssRestricted - rssUnrestricted) / df1) / (rssUnrestricted / df2);
  const pValue = fTestPValue(fStatistic, df1, df2);
  
  return {
    statistic: fStatistic,
    pValue,
    isSignificant: pValue < alpha,
    testType: 'f_test',
    degreesOfFreedom: df1
  };
}

/**
 * Chi-squared test for independence
 */
export function performChiSquaredTest(
  observed: number[][],
  alpha: number = 0.05
): SignificanceResult {
  const rows = observed.length;
  const cols = observed[0].length;
  
  // Calculate row and column totals
  const rowTotals = observed.map(row => row.reduce((a, b) => a + b, 0));
  const colTotals = Array(cols).fill(0);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) {
      colTotals[j] += observed[i][j];
    }
  }
  const total = rowTotals.reduce((a, b) => a + b, 0);
  
  // Calculate chi-squared statistic
  let chiSquared = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const expected = (rowTotals[i] * colTotals[j]) / total;
      if (expected > 0) {
        chiSquared += Math.pow(observed[i][j] - expected, 2) / expected;
      }
    }
  }
  
  const df = (rows - 1) * (cols - 1);
  const pValue = chiSquaredPValue(chiSquared, df);
  
  return {
    statistic: chiSquared,
    pValue,
    isSignificant: pValue < alpha,
    testType: 'chi_squared',
    degreesOfFreedom: df
  };
}

/**
 * Fisher's exact test for 2x2 contingency tables
 */
export function performFisherExactTest(
  a: number,
  b: number,
  c: number,
  d: number,
  alpha: number = 0.05
): SignificanceResult {
  const n = a + b + c + d;
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const col2 = b + d;
  
  // Calculate probability of observed table
  const pObserved = hypergeometricPMF(a, row1, col1, n);
  
  // Sum probabilities of all tables as or more extreme
  let pValue = 0;
  for (let x = 0; x <= Math.min(row1, col1); x++) {
    const p = hypergeometricPMF(x, row1, col1, n);
    if (p <= pObserved + 1e-10) {
      pValue += p;
    }
  }
  
  return {
    statistic: pObserved,
    pValue: Math.min(pValue, 1),
    isSignificant: pValue < alpha,
    testType: 'fisher_exact'
  };
}

/**
 * Hypergeometric probability mass function
 */
function hypergeometricPMF(k: number, n1: number, n2: number, N: number): number {
  return Math.exp(
    logBinomial(n1, k) + 
    logBinomial(N - n1, n2 - k) - 
    logBinomial(N, n2)
  );
}

/**
 * Log binomial coefficient
 */
function logBinomial(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return gammaLn(n + 1) - gammaLn(k + 1) - gammaLn(n - k + 1);
}

/**
 * Two-sample t-test
 */
export function performTTest(
  group1: number[],
  group2: number[],
  alpha: number = 0.05
): SignificanceResult {
  const n1 = group1.length;
  const n2 = group2.length;
  
  const mean1 = group1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = group2.reduce((a, b) => a + b, 0) / n2;
  
  const var1 = group1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
  const var2 = group2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);
  
  // Pooled variance
  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const se = Math.sqrt(pooledVar * (1/n1 + 1/n2));
  
  const tStatistic = (mean1 - mean2) / se;
  const df = n1 + n2 - 2;
  
  // Approximate p-value using normal distribution for large df
  const pValue = 2 * (1 - normalCDF(Math.abs(tStatistic)));
  
  return {
    statistic: tStatistic,
    pValue,
    isSignificant: pValue < alpha,
    testType: 't_test',
    degreesOfFreedom: df
  };
}

// ============================================================================
// EFFECT SIZE CALCULATIONS
// ============================================================================

/**
 * Compute Cohen's d effect size
 */
export function computeCohensD(
  group1: number[],
  group2: number[],
  confidenceLevel: number = 0.95
): EffectSizeResult {
  const n1 = group1.length;
  const n2 = group2.length;
  
  const mean1 = group1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = group2.reduce((a, b) => a + b, 0) / n2;
  
  const var1 = group1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
  const var2 = group2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);
  
  // Pooled standard deviation
  const pooledSD = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
  
  const d = (mean1 - mean2) / pooledSD;
  
  // Confidence interval for Cohen's d
  const se = Math.sqrt((n1 + n2) / (n1 * n2) + (d * d) / (2 * (n1 + n2)));
  const z = normalQuantile(1 - (1 - confidenceLevel) / 2);
  
  return {
    effectSize: d,
    effectType: 'cohens_d',
    interpretation: interpretCohensD(Math.abs(d)),
    confidenceInterval: {
      lower: d - z * se,
      upper: d + z * se,
      level: confidenceLevel
    }
  };
}

/**
 * Interpret Cohen's d magnitude
 */
function interpretCohensD(d: number): EffectInterpretation {
  if (d < 0.2) return 'negligible';
  if (d < 0.5) return 'small';
  if (d < 0.8) return 'medium';
  if (d < 1.2) return 'large';
  return 'very_large';
}

/**
 * Compute odds ratio
 */
export function computeOddsRatio(
  a: number, // exposed & outcome
  b: number, // exposed & no outcome
  c: number, // not exposed & outcome
  d: number, // not exposed & no outcome
  confidenceLevel: number = 0.95
): EffectSizeResult {
  // Add small constant to avoid division by zero
  const epsilon = 0.5;
  const or = ((a + epsilon) * (d + epsilon)) / ((b + epsilon) * (c + epsilon));
  
  // Log odds ratio and SE for CI
  const logOR = Math.log(or);
  const seLogOR = Math.sqrt(1/(a + epsilon) + 1/(b + epsilon) + 1/(c + epsilon) + 1/(d + epsilon));
  const z = normalQuantile(1 - (1 - confidenceLevel) / 2);
  
  return {
    effectSize: or,
    effectType: 'odds_ratio',
    interpretation: interpretOddsRatio(or),
    confidenceInterval: {
      lower: Math.exp(logOR - z * seLogOR),
      upper: Math.exp(logOR + z * seLogOR),
      level: confidenceLevel
    }
  };
}

/**
 * Interpret odds ratio magnitude
 */
function interpretOddsRatio(or: number): EffectInterpretation {
  const deviation = Math.max(or, 1/or);
  if (deviation < 1.5) return 'negligible';
  if (deviation < 2.5) return 'small';
  if (deviation < 4) return 'medium';
  if (deviation < 6) return 'large';
  return 'very_large';
}

/**
 * Compute Cohen's h for proportions
 */
export function computeCohensH(
  p1: number,
  p2: number,
  n1: number,
  n2: number,
  confidenceLevel: number = 0.95
): EffectSizeResult {
  // Arcsine transformation
  const phi1 = 2 * Math.asin(Math.sqrt(p1));
  const phi2 = 2 * Math.asin(Math.sqrt(p2));
  
  const h = phi1 - phi2;
  
  // SE for confidence interval
  const se = Math.sqrt(1/n1 + 1/n2);
  const z = normalQuantile(1 - (1 - confidenceLevel) / 2);
  
  return {
    effectSize: h,
    effectType: 'cohens_h',
    interpretation: interpretCohensH(Math.abs(h)),
    confidenceInterval: {
      lower: h - z * se,
      upper: h + z * se,
      level: confidenceLevel
    }
  };
}

/**
 * Interpret Cohen's h magnitude
 */
function interpretCohensH(h: number): EffectInterpretation {
  if (h < 0.2) return 'negligible';
  if (h < 0.5) return 'small';
  if (h < 0.8) return 'medium';
  if (h < 1.2) return 'large';
  return 'very_large';
}

// ============================================================================
// MULTIPLE TESTING CORRECTION
// ============================================================================

/**
 * Bonferroni correction for multiple hypothesis testing
 */
export function bonferroniCorrection(
  pValues: number[],
  alpha: number = 0.05
): { adjustedPValues: number[]; significantIndices: number[] } {
  const m = pValues.length;
  const adjustedPValues = pValues.map(p => Math.min(p * m, 1));
  const significantIndices = adjustedPValues
    .map((p, i) => p < alpha ? i : -1)
    .filter(i => i !== -1);
  
  return { adjustedPValues, significantIndices };
}

/**
 * Benjamini-Hochberg procedure for FDR control
 */
export function benjaminiHochberg(
  pValues: number[],
  alpha: number = 0.05
): { adjustedPValues: number[]; significantIndices: number[] } {
  const m = pValues.length;
  
  // Sort p-values and keep track of original indices
  const sorted = pValues
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p - b.p);
  
  // Calculate adjusted p-values
  const adjustedPValues = new Array(m);
  let minSoFar = 1;
  
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = sorted[rank - 1];
    const adjusted = Math.min((p * m) / rank, minSoFar);
    adjustedPValues[i] = adjusted;
    minSoFar = adjusted;
  }
  
  const significantIndices = adjustedPValues
    .map((p, i) => p < alpha ? i : -1)
    .filter(i => i !== -1);
  
  return { adjustedPValues, significantIndices };
}

// ============================================================================
// CONFIDENCE INTERVALS
// ============================================================================

/**
 * Compute confidence interval for a mean
 */
export function meanConfidenceInterval(
  data: number[],
  confidenceLevel: number = 0.95
): ConfidenceInterval {
  const n = data.length;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  const z = normalQuantile(1 - (1 - confidenceLevel) / 2);
  
  return {
    lower: mean - z * se,
    upper: mean + z * se,
    level: confidenceLevel
  };
}

/**
 * Compute confidence interval for a proportion
 */
export function proportionConfidenceInterval(
  successes: number,
  total: number,
  confidenceLevel: number = 0.95
): ConfidenceInterval {
  const p = successes / total;
  const z = normalQuantile(1 - (1 - confidenceLevel) / 2);
  
  // Wilson score interval
  const denominator = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));
  
  return {
    lower: Math.max(0, centre - margin),
    upper: Math.min(1, centre + margin),
    level: confidenceLevel
  };
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export const StatisticalTests = {
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
  fTestPValue,
  chiSquaredPValue,
  normalCDF,
  normalQuantile
};
