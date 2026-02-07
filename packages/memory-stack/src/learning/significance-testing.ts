/**
 * Significance Testing
 * 
 * Hypothesis testing framework for validating discovered patterns.
 * Includes multiple testing correction to control false discovery rate.
 * 
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of a significance test
 */
export interface SignificanceTestResult {
  /** The hypothesis being tested */
  hypothesis: string;
  /** Test type used */
  testType: 'chi-squared' | 'fisher-exact' | 't-test' | 'mann-whitney' | 'correlation';
  /** Raw p-value */
  pValue: number;
  /** Corrected p-value (after multiple testing adjustment) */
  correctedPValue?: number;
  /** Test statistic */
  testStatistic: number;
  /** Degrees of freedom (if applicable) */
  degreesOfFreedom?: number;
  /** Effect size measure */
  effectSize: number;
  /** Effect size type (Cohen's d, odds ratio, etc.) */
  effectSizeType: string;
  /** Confidence interval for effect size */
  effectSizeCI: [number, number];
  /** Sample sizes */
  sampleSizes: number[];
  /** Statistical power (if calculable) */
  power?: number;
  /** Whether result is significant at alpha=0.05 */
  isSignificant: boolean;
  /** Natural language interpretation */
  interpretation: string;
}

/**
 * Contingency table for chi-squared/Fisher's exact tests
 */
export interface ContingencyTable {
  /** [exposed & outcome, exposed & no outcome] */
  exposed: [number, number];
  /** [not exposed & outcome, not exposed & no outcome] */
  notExposed: [number, number];
}

// ============================================================================
// CHI-SQUARED TEST
// ============================================================================

/**
 * Performs chi-squared test for independence
 * 
 * Tests whether two categorical variables are independent.
 * Use for large samples (expected counts > 5 in each cell).
 */
export function chiSquaredTest(table: ContingencyTable): SignificanceTestResult {
  const a = table.exposed[0];
  const b = table.exposed[1];
  const c = table.notExposed[0];
  const d = table.notExposed[1];
  const n = a + b + c + d;
  
  // Expected values
  const rowTotals = [a + b, c + d];
  const colTotals = [a + c, b + d];
  
  const expected = [
    [rowTotals[0] * colTotals[0] / n, rowTotals[0] * colTotals[1] / n],
    [rowTotals[1] * colTotals[0] / n, rowTotals[1] * colTotals[1] / n],
  ];
  
  // Chi-squared statistic
  const observed = [[a, b], [c, d]];
  let chiSq = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      if (expected[i][j] > 0) {
        chiSq += Math.pow(observed[i][j] - expected[i][j], 2) / expected[i][j];
      }
    }
  }
  
  // P-value (df = 1 for 2x2 table)
  const pValue = 1 - chiSquaredCDF(chiSq, 1);
  
  // Odds ratio as effect size
  const oddsRatio = (a * d) / (b * c) || 0;
  const logOR = Math.log(oddsRatio || 0.001);
  const seLogOR = Math.sqrt(1/a + 1/b + 1/c + 1/d);
  
  const effectSizeCI: [number, number] = [
    Math.exp(logOR - 1.96 * seLogOR),
    Math.exp(logOR + 1.96 * seLogOR),
  ];
  
  return {
    hypothesis: 'Variables are independent',
    testType: 'chi-squared',
    pValue,
    testStatistic: chiSq,
    degreesOfFreedom: 1,
    effectSize: oddsRatio,
    effectSizeType: 'odds-ratio',
    effectSizeCI,
    sampleSizes: [n],
    isSignificant: pValue < 0.05,
    interpretation: generateInterpretation('chi-squared', pValue, oddsRatio, n),
  };
}

/**
 * Chi-squared CDF
 */
function chiSquaredCDF(x: number, df: number): number {
  if (x < 0) return 0;
  return gammaCDF(x / 2, df / 2);
}

function gammaCDF(x: number, k: number): number {
  // Incomplete gamma function / gamma function
  if (x <= 0) return 0;
  
  let sum = 0;
  let term = 1 / k;
  sum = term;
  
  for (let n = 1; n < 100; n++) {
    term *= x / (k + n);
    sum += term;
    if (term < 1e-10) break;
  }
  
  const result = Math.pow(x, k) * Math.exp(-x) * sum;
  return Math.min(1, Math.max(0, result / gamma(k)));
}

function gamma(n: number): number {
  if (n < 0.5) {
    return Math.PI / (Math.sin(Math.PI * n) * gamma(1 - n));
  }
  n -= 1;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = c[0];
  for (let i = 1; i < 9; i++) {
    x += c[i] / (n + i);
  }
  const t = n + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
}

// ============================================================================
// FISHER'S EXACT TEST
// ============================================================================

/**
 * Performs Fisher's exact test for small samples
 * 
 * Use when expected counts < 5 in any cell.
 */
export function fisherExactTest(table: ContingencyTable): SignificanceTestResult {
  const a = table.exposed[0];
  const b = table.exposed[1];
  const c = table.notExposed[0];
  const d = table.notExposed[1];
  
  // Calculate p-value using hypergeometric distribution
  const pValue = fisherPValue(a, b, c, d);
  
  // Odds ratio
  const oddsRatio = (a * d) / (b * c) || 0;
  const n = a + b + c + d;
  
  // Confidence interval (Woolf method)
  const logOR = Math.log(oddsRatio || 0.001);
  const se = Math.sqrt(1/(a+0.5) + 1/(b+0.5) + 1/(c+0.5) + 1/(d+0.5));
  
  const effectSizeCI: [number, number] = [
    Math.exp(logOR - 1.96 * se),
    Math.exp(logOR + 1.96 * se),
  ];
  
  return {
    hypothesis: 'Variables are independent',
    testType: 'fisher-exact',
    pValue,
    testStatistic: oddsRatio,
    effectSize: oddsRatio,
    effectSizeType: 'odds-ratio',
    effectSizeCI,
    sampleSizes: [n],
    isSignificant: pValue < 0.05,
    interpretation: generateInterpretation('fisher-exact', pValue, oddsRatio, n),
  };
}

function fisherPValue(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  const row1 = a + b;
  const col1 = a + c;
  
  // Calculate probability of observed table
  const pObserved = hypergeometricPMF(a, n, row1, col1);
  
  // Sum probabilities of all tables at least as extreme
  let pValue = 0;
  const minA = Math.max(0, row1 + col1 - n);
  const maxA = Math.min(row1, col1);
  
  for (let x = minA; x <= maxA; x++) {
    const p = hypergeometricPMF(x, n, row1, col1);
    if (p <= pObserved + 1e-10) {
      pValue += p;
    }
  }
  
  return Math.min(1, pValue);
}

function hypergeometricPMF(k: number, N: number, K: number, n: number): number {
  // P(X = k) = C(K,k) * C(N-K, n-k) / C(N, n)
  return Math.exp(
    logCombination(K, k) + 
    logCombination(N - K, n - k) - 
    logCombination(N, n)
  );
}

function logCombination(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  let result = 0;
  for (let i = 2; i <= n; i++) {
    result += Math.log(i);
  }
  return result;
}

// ============================================================================
// T-TEST
// ============================================================================

/**
 * Performs two-sample t-test
 * 
 * Tests whether two groups have different means.
 */
export function tTest(
  group1: number[],
  group2: number[]
): SignificanceTestResult {
  const n1 = group1.length;
  const n2 = group2.length;
  
  if (n1 < 2 || n2 < 2) {
    return {
      hypothesis: 'Group means are equal',
      testType: 't-test',
      pValue: 1,
      testStatistic: 0,
      degreesOfFreedom: 0,
      effectSize: 0,
      effectSizeType: 'cohens-d',
      effectSizeCI: [0, 0],
      sampleSizes: [n1, n2],
      isSignificant: false,
      interpretation: 'Insufficient sample size for t-test',
    };
  }
  
  const mean1 = group1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = group2.reduce((a, b) => a + b, 0) / n2;
  
  const var1 = group1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
  const var2 = group2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);
  
  // Welch's t-test (unequal variances)
  const se = Math.sqrt(var1 / n1 + var2 / n2);
  const t = (mean1 - mean2) / se;
  
  // Welch-Satterthwaite degrees of freedom
  const num = Math.pow(var1 / n1 + var2 / n2, 2);
  const denom = Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1);
  const df = num / denom;
  
  // Two-tailed p-value
  const pValue = 2 * (1 - tCDF(Math.abs(t), df));
  
  // Cohen's d effect size
  const pooledStd = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
  const cohensD = (mean1 - mean2) / pooledStd;
  
  // CI for Cohen's d
  const seD = Math.sqrt((n1 + n2) / (n1 * n2) + Math.pow(cohensD, 2) / (2 * (n1 + n2)));
  const effectSizeCI: [number, number] = [
    cohensD - 1.96 * seD,
    cohensD + 1.96 * seD,
  ];
  
  return {
    hypothesis: 'Group means are equal',
    testType: 't-test',
    pValue,
    testStatistic: t,
    degreesOfFreedom: df,
    effectSize: cohensD,
    effectSizeType: 'cohens-d',
    effectSizeCI,
    sampleSizes: [n1, n2],
    isSignificant: pValue < 0.05,
    interpretation: generateInterpretation('t-test', pValue, cohensD, n1 + n2),
  };
}

/**
 * Student's t CDF approximation
 */
function tCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  
  const bt = Math.exp(
    a * Math.log(x) + b * Math.log(1 - x) - 
    logGamma(a) - logGamma(b) + logGamma(a + b)
  );
  
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(x, a, b) / a;
  }
  return 1 - bt * betaCF(1 - x, b, a) / b;
}

function betaCF(x: number, a: number, b: number): number {
  const maxIter = 100;
  const eps = 1e-10;
  
  let am = 1, bm = 1, az = 1, bz = 1 - (a + b) * x / (a + 1);
  
  for (let m = 1; m <= maxIter; m++) {
    const em = m;
    const d1 = em * (b - em) * x / ((a + 2 * em - 1) * (a + 2 * em));
    const ap = az + d1 * am;
    const bp = bz + d1 * bm;
    
    const d2 = -(a + em) * (a + b + em) * x / ((a + 2 * em) * (a + 2 * em + 1));
    const app = ap + d2 * az;
    const bpp = bp + d2 * bz;
    
    const aold = az;
    am = ap / bpp;
    bm = bp / bpp;
    az = app / bpp;
    bz = 1;
    
    if (Math.abs(az - aold) < eps * Math.abs(az)) break;
  }
  
  return az;
}

function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];
  
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  
  for (let j = 0; j < 6; j++) {
    ser += c[j] / ++y;
  }
  
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// ============================================================================
// EFFECT SIZE COMPUTATION
// ============================================================================

/**
 * Computes appropriate effect size for different test types
 */
export function computeEffectSize(
  testType: SignificanceTestResult['testType'],
  data: {
    table?: ContingencyTable;
    group1?: number[];
    group2?: number[];
    correlation?: number;
  }
): { effectSize: number; type: string; magnitude: string } {
  if (testType === 'chi-squared' || testType === 'fisher-exact') {
    if (!data.table) return { effectSize: 0, type: 'unknown', magnitude: 'unknown' };
    
    const { exposed, notExposed } = data.table;
    const oddsRatio = (exposed[0] * notExposed[1]) / (exposed[1] * notExposed[0]) || 0;
    
    return {
      effectSize: oddsRatio,
      type: 'odds-ratio',
      magnitude: oddsRatio < 0.5 || oddsRatio > 2 ? 'large' :
                 oddsRatio < 0.7 || oddsRatio > 1.5 ? 'medium' : 'small',
    };
  }
  
  if (testType === 't-test' && data.group1 && data.group2) {
    const result = tTest(data.group1, data.group2);
    const d = Math.abs(result.effectSize);
    
    return {
      effectSize: result.effectSize,
      type: 'cohens-d',
      magnitude: d >= 0.8 ? 'large' : d >= 0.5 ? 'medium' : 'small',
    };
  }
  
  if (testType === 'correlation' && data.correlation !== undefined) {
    const r = Math.abs(data.correlation);
    return {
      effectSize: data.correlation,
      type: 'pearson-r',
      magnitude: r >= 0.5 ? 'large' : r >= 0.3 ? 'medium' : 'small',
    };
  }
  
  return { effectSize: 0, type: 'unknown', magnitude: 'unknown' };
}

// ============================================================================
// MULTIPLE TESTING CORRECTION
// ============================================================================

/**
 * Applies Bonferroni correction to p-values
 * 
 * Most conservative correction: p_adjusted = p * n_tests
 */
export function applyBonferroniCorrection(
  results: SignificanceTestResult[],
  alpha: number = 0.05
): SignificanceTestResult[] {
  const numTests = results.length;
  
  return results.map(r => ({
    ...r,
    correctedPValue: Math.min(1, r.pValue * numTests),
    isSignificant: r.pValue * numTests < alpha,
  }));
}

/**
 * Applies Benjamini-Hochberg FDR correction
 * 
 * Less conservative than Bonferroni, controls false discovery rate.
 */
export function computeFDR(
  results: SignificanceTestResult[],
  alpha: number = 0.05
): SignificanceTestResult[] {
  const n = results.length;
  if (n === 0) return [];
  
  // Sort by p-value
  const sorted = results
    .map((r, i) => ({ ...r, originalIndex: i }))
    .sort((a, b) => a.pValue - b.pValue);
  
  // Compute adjusted p-values
  const adjusted = sorted.map((r, i) => {
    const rank = i + 1;
    const bhThreshold = (rank / n) * alpha;
    return {
      ...r,
      correctedPValue: Math.min(1, r.pValue * n / rank),
      isSignificant: r.pValue <= bhThreshold,
    };
  });
  
  // Restore original order
  const result = new Array(n);
  for (const r of adjusted) {
    result[r.originalIndex] = r;
    delete (r as { originalIndex?: number }).originalIndex;
  }
  
  return result;
}

// ============================================================================
// NATURAL LANGUAGE GENERATION
// ============================================================================

/**
 * Generates natural language interpretation of test results
 */
export function generateNaturalLanguageResult(
  result: SignificanceTestResult
): string {
  const parts: string[] = [];
  
  // Significance statement
  if (result.isSignificant) {
    parts.push(`The result is statistically significant (p=${result.pValue.toFixed(4)}).`);
  } else {
    parts.push(`The result is not statistically significant (p=${result.pValue.toFixed(4)}).`);
  }
  
  // Effect size interpretation
  const effectMag = getEffectMagnitude(result.effectSize, result.effectSizeType);
  if (result.effectSizeType === 'odds-ratio') {
    if (result.effectSize > 1) {
      parts.push(`The odds are ${result.effectSize.toFixed(2)}x higher (${effectMag} effect).`);
    } else {
      parts.push(`The odds are ${(1/result.effectSize).toFixed(2)}x lower (${effectMag} effect).`);
    }
  } else if (result.effectSizeType === 'cohens-d') {
    parts.push(`The difference is ${result.effectSize.toFixed(2)} standard deviations (${effectMag} effect).`);
  }
  
  // Sample size note
  if (result.sampleSizes[0] < 30) {
    parts.push('Caution: small sample size may limit reliability.');
  }
  
  return parts.join(' ');
}

function getEffectMagnitude(effectSize: number, type: string): string {
  if (type === 'odds-ratio') {
    const or = Math.max(effectSize, 1 / effectSize);
    if (or >= 3) return 'large';
    if (or >= 1.5) return 'medium';
    return 'small';
  }
  
  const absEffect = Math.abs(effectSize);
  if (type === 'cohens-d') {
    if (absEffect >= 0.8) return 'large';
    if (absEffect >= 0.5) return 'medium';
    return 'small';
  }
  
  // Correlation
  if (absEffect >= 0.5) return 'large';
  if (absEffect >= 0.3) return 'medium';
  return 'small';
}

function generateInterpretation(
  testType: string,
  pValue: number,
  effectSize: number,
  n: number
): string {
  const significant = pValue < 0.05;
  const effectMag = getEffectMagnitude(effectSize, 
    testType === 't-test' ? 'cohens-d' : 'odds-ratio'
  );
  
  if (!significant) {
    return `No significant association detected (p=${pValue.toFixed(3)}, n=${n})`;
  }
  
  if (testType === 't-test') {
    const direction = effectSize > 0 ? 'higher' : 'lower';
    return `Significant difference: Group 1 is ${direction} (d=${effectSize.toFixed(2)}, ${effectMag} effect, p=${pValue.toFixed(4)})`;
  }
  
  const direction = effectSize > 1 ? 'increased' : 'decreased';
  return `Significant association: ${direction} odds (OR=${effectSize.toFixed(2)}, ${effectMag} effect, p=${pValue.toFixed(4)})`;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Tests significance of a pattern
 */
export function testPatternSignificance(
  data: {
    table?: ContingencyTable;
    group1?: number[];
    group2?: number[];
  },
  options: {
    testType?: 'auto' | 'chi-squared' | 'fisher-exact' | 't-test';
  } = {}
): SignificanceTestResult {
  const { testType = 'auto' } = options;
  
  if (data.group1 && data.group2) {
    return tTest(data.group1, data.group2);
  }
  
  if (data.table) {
    const total = data.table.exposed[0] + data.table.exposed[1] + 
                  data.table.notExposed[0] + data.table.notExposed[1];
    
    // Use Fisher's exact for small samples
    const minExpected = Math.min(
      (data.table.exposed[0] + data.table.exposed[1]) * 
      (data.table.exposed[0] + data.table.notExposed[0]) / total,
      5
    );
    
    if (testType === 'fisher-exact' || (testType === 'auto' && (total < 40 || minExpected < 5))) {
      return fisherExactTest(data.table);
    }
    
    return chiSquaredTest(data.table);
  }
  
  return {
    hypothesis: 'Unknown',
    testType: 'chi-squared',
    pValue: 1,
    testStatistic: 0,
    effectSize: 0,
    effectSizeType: 'unknown',
    effectSizeCI: [0, 0],
    sampleSizes: [0],
    isSignificant: false,
    interpretation: 'Insufficient data for significance testing',
  };
}
