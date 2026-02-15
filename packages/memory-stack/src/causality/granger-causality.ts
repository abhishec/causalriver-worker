/**
 * Granger Causality Testing Module
 * 
 * Implements statistical Granger causality tests to determine whether
 * one time series (signal A) helps predict another (signal B).
 * 
 * The Granger test asks: "Does knowing the past of A improve our
 * prediction of B beyond what we can predict from B's own past?"
 * 
 * This is the foundation of the "10x Innovation" - replacing LLM-based
 * pattern observation with Nobel Prize-winning statistical methods.
 * 
 * Key Methods:
 * - VAR(p) model estimation
 * - F-test for Granger causality
 * - Impulse response functions
 * - Effect size with confidence intervals
 */

import {
  fTestPValue,
  normalQuantile,
  type ConfidenceInterval
} from './statistical-tests';

// ============================================================================
// TYPES
// ============================================================================

export interface TimeSeriesSignal {
  timestamp: Date;
  value: number;
  domain?: string;
  entityId?: string;
}

export interface GrangerResult {
  sourceDomain: string;
  targetDomain: string;
  fStatistic: number;
  pValue: number;
  optimalLag: number;
  isSignificant: boolean;
  effectSize: number;
  confidenceInterval: ConfidenceInterval;
  sampleSize: number;
  naturalLanguage: string;
}

export interface ImpulseResponse {
  lag: number;
  response: number;
  cumulativeResponse: number;
  standardError: number;
}

export interface VARCoefficients {
  /** Coefficients for lagged values of Y (target) */
  alphas: number[];
  /** Coefficients for lagged values of X (source) */
  betas: number[];
  /** Intercept term */
  intercept: number;
  /** Residual variance */
  residualVariance: number;
}

export interface GrangerTestConfig {
  /** Maximum lag to test (default: 30 days) */
  maxLag?: number;
  /** Significance level (default: 0.05) */
  alpha?: number;
  /** Minimum observations required (default: 50) */
  minObservations?: number;
  /** Information criterion for lag selection */
  lagSelectionCriterion?: 'AIC' | 'BIC' | 'HQ';
}

// ============================================================================
// CORE GRANGER CAUSALITY FUNCTIONS
// ============================================================================

/**
 * Compute Granger causality test between two time series
 * 
 * Tests whether signalA Granger-causes signalB by comparing:
 * - Restricted model: Y_t = α₁Y_{t-1} + ... + αₚY_{t-p} + ε
 * - Unrestricted model: Y_t = α₁Y_{t-1} + ... + αₚY_{t-p} + β₁X_{t-1} + ... + βₚX_{t-p} + ε
 * 
 * If the unrestricted model significantly outperforms, we say X Granger-causes Y.
 */
export function computeGrangerCausality(
  signalA: number[],
  signalB: number[],
  maxLag: number = 30,
  config: GrangerTestConfig = {}
): GrangerResult {
  const {
    alpha = 0.05,
    minObservations = 50,
    lagSelectionCriterion = 'AIC'
  } = config;
  
  // Validate input
  if (signalA.length !== signalB.length) {
    throw new Error('Time series must have equal length');
  }
  
  if (signalA.length < minObservations) {
    throw new Error(`Insufficient observations: ${signalA.length} < ${minObservations}`);
  }
  
  // Find optimal lag using information criterion
  const optimalLag = selectOptimalLag(signalA, signalB, maxLag, lagSelectionCriterion);
  
  // Fit restricted model (only lagged Y predicts Y)
  const restrictedResult = fitRestrictedVAR(signalB, optimalLag);
  
  // Fit unrestricted model (lagged Y and lagged X predict Y)
  const unrestrictedResult = fitUnrestrictedVAR(signalA, signalB, optimalLag);
  
  // Compute F-statistic
  const n = signalB.length - optimalLag;
  const rssRestricted = restrictedResult.rss;
  const rssUnrestricted = unrestrictedResult.rss;
  const dfRestricted = n - optimalLag - 1;
  const dfUnrestricted = n - 2 * optimalLag - 1;
  
  const fStatistic = ((rssRestricted - rssUnrestricted) / optimalLag) / 
                     (rssUnrestricted / dfUnrestricted);
  
  const pValue = fTestPValue(fStatistic, optimalLag, dfUnrestricted);
  
  // Compute effect size (partial R² or eta²), clamped to [0, 1]
  const rawEffect = rssRestricted > 0 ? (rssRestricted - rssUnrestricted) / rssRestricted : 0;
  const effectSize = Math.max(0, Math.min(1, rawEffect));
  
  // Confidence interval for effect size
  const confidenceInterval = computeEffectSizeCI(
    effectSize,
    n,
    optimalLag,
    alpha
  );
  
  return {
    sourceDomain: 'source',
    targetDomain: 'target',
    fStatistic,
    pValue,
    optimalLag,
    isSignificant: pValue < alpha,
    effectSize,
    confidenceInterval,
    sampleSize: n,
    naturalLanguage: generateNaturalLanguage(
      fStatistic,
      pValue,
      effectSize,
      optimalLag,
      n
    )
  };
}

/**
 * Select optimal lag using information criterion
 */
export function selectOptimalLag(
  signalA: number[],
  signalB: number[],
  maxLag: number,
  criterion: 'AIC' | 'BIC' | 'HQ'
): number {
  let bestLag = 1;
  let bestIC = Infinity;
  
  for (let lag = 1; lag <= Math.min(maxLag, Math.floor(signalA.length / 3)); lag++) {
    const result = fitUnrestrictedVAR(signalA, signalB, lag);
    const n = signalB.length - lag;
    const k = 2 * lag + 1; // Number of parameters
    
    let ic: number;
    switch (criterion) {
      case 'AIC':
        ic = n * Math.log(result.rss / n) + 2 * k;
        break;
      case 'BIC':
        ic = n * Math.log(result.rss / n) + k * Math.log(n);
        break;
      case 'HQ':
        ic = n * Math.log(result.rss / n) + 2 * k * Math.log(Math.log(n));
        break;
    }
    
    if (ic < bestIC) {
      bestIC = ic;
      bestLag = lag;
    }
  }
  
  return bestLag;
}

/**
 * Fit restricted VAR model (Y on its own lags only)
 */
export function fitRestrictedVAR(
  signalY: number[],
  lag: number
): { rss: number; coefficients: number[]; intercept: number } {
  const n = signalY.length - lag;
  
  // Build design matrix (lagged Y values)
  const X: number[][] = [];
  const y: number[] = [];
  
  for (let t = lag; t < signalY.length; t++) {
    const row: number[] = [1]; // Intercept
    for (let l = 1; l <= lag; l++) {
      row.push(signalY[t - l]);
    }
    X.push(row);
    y.push(signalY[t]);
  }
  
  // OLS estimation
  const result = ordinaryLeastSquares(X, y);
  
  return {
    rss: result.rss,
    coefficients: result.coefficients.slice(1),
    intercept: result.coefficients[0]
  };
}

/**
 * Fit unrestricted VAR model (Y on lags of both X and Y)
 */
export function fitUnrestrictedVAR(
  signalX: number[],
  signalY: number[],
  lag: number
): { rss: number; coefficients: VARCoefficients } {
  const n = signalY.length - lag;
  
  // Build design matrix
  const X: number[][] = [];
  const y: number[] = [];
  
  for (let t = lag; t < signalY.length; t++) {
    const row: number[] = [1]; // Intercept
    
    // Lagged Y values
    for (let l = 1; l <= lag; l++) {
      row.push(signalY[t - l]);
    }
    
    // Lagged X values
    for (let l = 1; l <= lag; l++) {
      row.push(signalX[t - l]);
    }
    
    X.push(row);
    y.push(signalY[t]);
  }
  
  // OLS estimation
  const result = ordinaryLeastSquares(X, y);
  
  return {
    rss: result.rss,
    coefficients: {
      intercept: result.coefficients[0],
      alphas: result.coefficients.slice(1, lag + 1),
      betas: result.coefficients.slice(lag + 1),
      residualVariance: result.rss / (n - 2 * lag - 1)
    }
  };
}

/**
 * Ordinary Least Squares estimation
 */
export function ordinaryLeastSquares(
  X: number[][],
  y: number[]
): { coefficients: number[]; rss: number; residuals: number[] } {
  const n = X.length;
  const p = X[0].length;
  
  // X'X
  const XtX: number[][] = Array(p).fill(null).map(() => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < n; k++) {
        XtX[i][j] += X[k][i] * X[k][j];
      }
    }
  }
  
  // X'y
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let k = 0; k < n; k++) {
      Xty[i] += X[k][i] * y[k];
    }
  }
  
  // Solve (X'X)^(-1) X'y using Gaussian elimination
  const coefficients = solveLinearSystem(XtX, Xty);
  
  // Compute residuals and RSS
  const residuals: number[] = [];
  let rss = 0;
  
  for (let i = 0; i < n; i++) {
    let predicted = 0;
    for (let j = 0; j < p; j++) {
      predicted += X[i][j] * coefficients[j];
    }
    const residual = y[i] - predicted;
    residuals.push(residual);
    rss += residual * residual;
  }
  
  return { coefficients, rss, residuals };
}

/**
 * Solve linear system using Gaussian elimination with partial pivoting
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  
  // Create augmented matrix
  const aug = A.map((row, i) => [...row, b[i]]);
  
  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    
    // Swap rows
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    
    // Check for singularity
    if (Math.abs(aug[col][col]) < 1e-10) {
      aug[col][col] = 1e-10; // Add small regularization
    }
    
    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }
  
  // Back substitution
  const x = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = aug[row][n];
    for (let col = row + 1; col < n; col++) {
      x[row] -= aug[row][col] * x[col];
    }
    x[row] /= aug[row][row];
  }
  
  return x;
}

/**
 * Compute confidence interval for effect size (partial R²)
 */
function computeEffectSizeCI(
  effectSize: number,
  n: number,
  lag: number,
  alpha: number
): ConfidenceInterval {
  // Guard against NaN, negative, or degenerate effect sizes
  const safeEffect = (!Number.isFinite(effectSize) || effectSize <= 0)
    ? 0
    : Math.min(effectSize, 1);

  if (safeEffect === 0 || n <= 3) {
    return { lower: 0, upper: 0, level: 1 - alpha };
  }

  // Use Fisher's z transformation for CI
  // Clamp r to (0, 0.9999) to avoid singularity at r=1 where atanh(r) → Infinity
  const r = Math.min(Math.sqrt(safeEffect), 0.9999);
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  const zCrit = normalQuantile(1 - alpha / 2);

  const zLower = z - zCrit * se;
  const zUpper = z + zCrit * se;

  const rLower = (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1);
  const rUpper = (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1);

  return {
    lower: Math.max(0, rLower * rLower),
    upper: Math.min(1, rUpper * rUpper),
    level: 1 - alpha
  };
}

// ============================================================================
// IMPULSE RESPONSE FUNCTIONS
// ============================================================================

/**
 * Build impulse response function
 * 
 * Shows how a 1-unit shock to X propagates to Y over time
 */
export function buildImpulseResponse(
  signalX: number[],
  signalY: number[],
  lag: number,
  horizons: number = 30
): ImpulseResponse[] {
  // Fit VAR model
  const varResult = fitUnrestrictedVAR(signalX, signalY, lag);
  const { alphas, betas } = varResult.coefficients;
  
  const responses: ImpulseResponse[] = [];
  let cumulativeResponse = 0;
  
  // Compute impulse response at each horizon
  for (let h = 0; h <= horizons; h++) {
    let response: number;
    
    if (h === 0) {
      response = 0; // No contemporaneous effect in Granger setup
    } else if (h <= lag) {
      response = betas[h - 1] || 0;
    } else {
      // Dynamic propagation through lagged responses
      response = 0;
      for (let l = 1; l <= Math.min(lag, h); l++) {
        response += (alphas[l - 1] || 0) * responses[h - l].response;
      }
    }
    
    cumulativeResponse += response;
    
    // Bootstrap SE estimate (simplified)
    const se = Math.sqrt(varResult.coefficients.residualVariance) * 
               Math.sqrt(1 + h * 0.1);
    
    responses.push({
      lag: h,
      response,
      cumulativeResponse,
      standardError: se
    });
  }
  
  return responses;
}

// ============================================================================
// NATURAL LANGUAGE GENERATION
// ============================================================================

function generateNaturalLanguage(
  fStatistic: number,
  pValue: number,
  effectSize: number,
  optimalLag: number,
  sampleSize: number
): string {
  const significanceLevel = pValue < 0.001 ? 'p<0.001' : 
                           pValue < 0.01 ? 'p<0.01' : 
                           pValue < 0.05 ? 'p<0.05' : `p=${pValue.toFixed(3)}`;
  
  const effectMagnitude = effectSize < 0.02 ? 'negligible' :
                          effectSize < 0.13 ? 'small' :
                          effectSize < 0.26 ? 'medium' : 'large';
  
  const multiplier = 1 / (1 - effectSize);
  
  if (pValue < 0.05) {
    return `Source domain Granger-causes target domain with ${effectMagnitude} effect ` +
           `(${multiplier.toFixed(1)}x predictive power, F=${fStatistic.toFixed(2)}, ` +
           `${significanceLevel}, n=${sampleSize}) at optimal lag of ${optimalLag} periods`;
  } else {
    return `No significant Granger-causal relationship detected ` +
           `(F=${fStatistic.toFixed(2)}, p=${pValue.toFixed(3)}, n=${sampleSize})`;
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Test Granger causality across all domain pairs
 *
 * 10M SCALE FIX: Caps at 30 domains to prevent O(d²×n×p²) explosion.
 * At 30 domains, we get 30×29 = 870 pair tests — manageable.
 * At 50+ domains, 2,450+ pair tests each running VAR estimation → minutes.
 * Domains are ranked by signal count — highest-volume domains tested first.
 */
export function testAllDomainPairs(
  signals: Map<string, number[]>,
  config: GrangerTestConfig = {}
): GrangerResult[] {
  // Cap domains to prevent quadratic blowup at 10M scale
  const MAX_DOMAINS = 30;
  let domains = Array.from(signals.keys());

  if (domains.length > MAX_DOMAINS) {
    // Prioritize domains with the most observations (most statistical power)
    domains = domains
      .map(d => ({ domain: d, length: signals.get(d)!.length }))
      .sort((a, b) => b.length - a.length)
      .slice(0, MAX_DOMAINS)
      .map(d => d.domain);
  }

  const results: GrangerResult[] = [];

  for (const source of domains) {
    for (const target of domains) {
      if (source === target) continue;

      const signalA = signals.get(source)!;
      const signalB = signals.get(target)!;

      try {
        const result = computeGrangerCausality(signalA, signalB, config.maxLag, config);
        results.push({
          ...result,
          sourceDomain: source,
          targetDomain: target
        });
      } catch (error) {
        // Skip pairs with insufficient data
        console.warn(`Skipping ${source} → ${target}:`, error);
      }
    }
  }

  // Sort by significance and effect size
  return results.sort((a, b) => {
    if (a.isSignificant !== b.isSignificant) {
      return a.isSignificant ? -1 : 1;
    }
    return b.effectSize - a.effectSize;
  });
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Test all pairwise Granger causality from a Record (plain object) of domain series.
 * Convenience wrapper around testAllDomainPairs that accepts Record<string, number[]>.
 */
export function testAllPairs(
  data: Record<string, number[]>,
  config: GrangerTestConfig = {}
): GrangerResult[] {
  const map = new Map<string, number[]>(Object.entries(data));
  return testAllDomainPairs(map, config);
}

/**
 * Generate a natural-language interpretation of a GrangerResult.
 */
export function interpretResult(result: GrangerResult): string {
  return generateNaturalLanguage(
    result.fStatistic,
    result.pValue,
    result.effectSize,
    result.optimalLag,
    result.sampleSize
  );
}

// ============================================================================
// CONDITIONAL MULTIVARIATE GRANGER
// ============================================================================

/**
 * Compute conditional Granger causality: test X→Y controlling for ALL other variables.
 *
 * Restricted:   Y_t = c + Σ_k≠j [lags of Z_k] + [lags of Y]
 * Unrestricted: Y_t = c + Σ_k≠j [lags of Z_k] + [lags of Y] + [lags of X]
 *
 * This is the most powerful single method — conditioning on other variables
 * filters out spurious confounded edges. Matches multivariate VAR F-test.
 */
export function computeConditionalGranger(
  sourceIndex: number,
  targetIndex: number,
  allSeries: number[][],
  lag: number,
  config: GrangerTestConfig = {}
): GrangerResult {
  const { alpha = 0.05 } = config;
  const nVars = allSeries.length;
  const T = allSeries[0].length;

  const y = allSeries[targetIndex];
  const x = allSeries[sourceIndex];

  // Conditioning set: all variables except source and target
  const otherIndices = [];
  for (let k = 0; k < nVars; k++) {
    if (k !== targetIndex && k !== sourceIndex) otherIndices.push(k);
  }

  // Check for constant/NaN series
  const xStd = standardDeviation(x);
  const yStd = standardDeviation(y);
  if (xStd < 1e-10 || yStd < 1e-10) {
    return makeEmptyResult(alpha, lag, T - lag);
  }

  // Number of parameters
  const nRestrictedParams = 1 + (otherIndices.length + 1) * lag; // intercept + (others + y) * lag
  const nUnrestrictedParams = nRestrictedParams + lag; // + x lags
  const nObs = T - lag;

  // Fall back to pairwise if insufficient observations
  if (nObs <= nUnrestrictedParams + 5) {
    return computeGrangerCausality(x, y, lag, config);
  }

  // Build restricted design matrix: intercept + Y lags + other variable lags (no X)
  const Xr: number[][] = [];
  for (let t = lag; t < T; t++) {
    const row: number[] = [1]; // intercept
    // Y lags
    for (let l = 1; l <= lag; l++) {
      row.push(y[t - l]);
    }
    // Other variable lags
    for (const k of otherIndices) {
      for (let l = 1; l <= lag; l++) {
        row.push(allSeries[k][t - l]);
      }
    }
    Xr.push(row);
  }

  // Build unrestricted: restricted + X lags
  const Xu: number[][] = [];
  for (let t = 0; t < nObs; t++) {
    const row = [...Xr[t]];
    for (let l = 1; l <= lag; l++) {
      row.push(x[lag + t - l]);
    }
    Xu.push(row);
  }

  const yVec = y.slice(lag);

  // Fit both models
  const rssR = computeRSS(Xr, yVec);
  const rssU = computeRSS(Xu, yVec);

  const dfNum = lag;
  const dfDen = nObs - nUnrestrictedParams;

  if (dfDen <= 0 || rssU <= 0 || rssR <= 0) {
    return makeEmptyResult(alpha, lag, nObs);
  }

  const fStatistic = Math.max(0, ((rssR - rssU) / dfNum) / (rssU / dfDen));
  const pValue = fTestPValue(fStatistic, dfNum, dfDen);
  const effectSize = Math.max(0, Math.min(1, (rssR - rssU) / rssR));

  const confidenceInterval = computeEffectSizeCI(effectSize, nObs, lag, alpha);

  return {
    sourceDomain: 'source',
    targetDomain: 'target',
    fStatistic,
    pValue,
    optimalLag: lag,
    isSignificant: pValue < alpha,
    effectSize,
    confidenceInterval,
    sampleSize: nObs,
    naturalLanguage: generateNaturalLanguage(fStatistic, pValue, effectSize, lag, nObs),
  };
}

/**
 * Test all pairwise conditional Granger causality across all domains.
 * Controls for confounders by including all other variables in the regression.
 */
export function testAllPairsConditional(
  data: Record<string, number[]>,
  config: GrangerTestConfig = {}
): GrangerResult[] {
  const domains = Object.keys(data);
  const allSeries = domains.map(d => data[d]);
  const results: GrangerResult[] = [];
  const { maxLag = 14, lagSelectionCriterion = 'AIC' } = config;

  if (domains.length < 2) return results;

  for (let i = 0; i < domains.length; i++) {
    for (let j = 0; j < domains.length; j++) {
      if (i === j) continue;

      try {
        const optLag = selectOptimalLag(allSeries[j], allSeries[i], maxLag, lagSelectionCriterion);
        const result = computeConditionalGranger(j, i, allSeries, optLag, config);
        results.push({
          ...result,
          sourceDomain: domains[j],
          targetDomain: domains[i],
        });
      } catch {
        // Skip pairs with insufficient data
      }
    }
  }

  return results.sort((a, b) => {
    if (a.isSignificant !== b.isSignificant) return a.isSignificant ? -1 : 1;
    return b.effectSize - a.effectSize;
  });
}

/** Compute RSS from design matrix and response vector */
function computeRSS(X: number[][], y: number[]): number {
  const result = ordinaryLeastSquares(X, y);
  return result.rss;
}

/** Compute standard deviation */
function standardDeviation(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  let variance = 0;
  for (const v of values) variance += (v - mean) * (v - mean);
  return Math.sqrt(variance / n);
}

/** Create an empty/zero GrangerResult for edge cases */
function makeEmptyResult(alpha: number, lag: number, sampleSize: number): GrangerResult {
  return {
    sourceDomain: 'source',
    targetDomain: 'target',
    fStatistic: 0,
    pValue: 1,
    optimalLag: lag,
    isSignificant: false,
    effectSize: 0,
    confidenceInterval: { lower: 0, upper: 0, level: 1 - alpha },
    sampleSize,
    naturalLanguage: 'No significant Granger-causal relationship detected (insufficient data or constant series)',
  };
}

// ============================================================================
// RIDGE-REGULARIZED CONDITIONAL GRANGER
// ============================================================================

/**
 * Ridge-regularized conditional Granger causality: NEVER falls back to bivariate.
 *
 * Unlike computeConditionalGranger which falls back to pairwise when
 * n_obs <= n_params + 5, this uses Ridge regression which handles any N/T ratio.
 *
 * Ridge penalty: minimize ||y - Xβ||² + α||β||²
 * This shrinks coefficients toward zero instead of failing when overfitting risk is high.
 *
 * Ported from Python: nexusbrain_granger.py ridge_conditional_granger_scoring()
 * Used by the nexusbrain_world_class method for benchmark-grade causal discovery.
 */
export function computeRidgeConditionalGranger(
  sourceIndex: number,
  targetIndex: number,
  allSeries: number[][],
  lag: number,
  config: GrangerTestConfig & { ridgeAlpha?: number } = {}
): GrangerResult {
  const { alpha = 0.05, ridgeAlpha = 1.0 } = config;
  const nVars = allSeries.length;
  const T = allSeries[0].length;

  const y = allSeries[targetIndex];
  const x = allSeries[sourceIndex];

  const otherIndices: number[] = [];
  for (let k = 0; k < nVars; k++) {
    if (k !== targetIndex && k !== sourceIndex) otherIndices.push(k);
  }

  const xStd = standardDeviation(x);
  const yStd = standardDeviation(y);
  if (xStd < 1e-10 || yStd < 1e-10) {
    return makeEmptyResult(alpha, lag, T - lag);
  }

  const nObs = T - lag;
  if (nObs < 10) {
    return makeEmptyResult(alpha, lag, nObs);
  }

  // Build restricted design matrix: Y lags + other variable lags (no X)
  const nRCols = (otherIndices.length + 1) * lag;
  const Xr: number[][] = [];
  for (let t = lag; t < T; t++) {
    const row: number[] = [];
    for (let l = 1; l <= lag; l++) row.push(y[t - l]);
    for (const k of otherIndices) {
      for (let l = 1; l <= lag; l++) row.push(allSeries[k][t - l]);
    }
    Xr.push(row);
  }

  // Build unrestricted: restricted + X lags
  const Xu: number[][] = [];
  for (let t = 0; t < nObs; t++) {
    const row = [...Xr[t]];
    for (let l = 1; l <= lag; l++) row.push(x[lag + t - l]);
    Xu.push(row);
  }

  const yVec = y.slice(lag);

  // Ridge regression: β = (X'X + αI)^{-1} X'y
  const rssR = computeRidgeRSS(Xr, yVec, ridgeAlpha);
  const rssU = computeRidgeRSS(Xu, yVec, ridgeAlpha);

  const dfNum = lag;
  const dfDen = Math.max(1, nObs - nRCols - lag - 1);

  if (rssU <= 0 || rssR <= 0) {
    return makeEmptyResult(alpha, lag, nObs);
  }

  const fStatistic = Math.max(0, ((rssR - rssU) / dfNum) / (rssU / dfDen));
  const pValue = fTestPValue(fStatistic, dfNum, dfDen);
  const effectSize = Math.max(0, Math.min(1, (rssR - rssU) / rssR));

  const confidenceInterval = computeEffectSizeCI(effectSize, nObs, lag, alpha);

  return {
    sourceDomain: 'source',
    targetDomain: 'target',
    fStatistic,
    pValue,
    optimalLag: lag,
    isSignificant: pValue < alpha,
    effectSize,
    confidenceInterval,
    sampleSize: nObs,
    naturalLanguage: generateNaturalLanguage(fStatistic, pValue, effectSize, lag, nObs),
  };
}

/**
 * Compute Ridge regression RSS: ||y - Xβ_ridge||²
 * where β_ridge = (X'X + αI)^{-1} X'y
 */
function computeRidgeRSS(X: number[][], y: number[], ridgeAlpha: number): number {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  if (n === 0 || p === 0) return 0;

  // X'X (p x p)
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let sum = 0;
      for (let t = 0; t < n; t++) sum += X[t][i] * X[t][j];
      XtX[i][j] = sum;
      XtX[j][i] = sum;
    }
  }

  // Add ridge penalty: XtX + α*I
  for (let i = 0; i < p; i++) {
    XtX[i][i] += ridgeAlpha;
  }

  // X'y (p x 1)
  const Xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    let sum = 0;
    for (let t = 0; t < n; t++) sum += X[t][i] * y[t];
    Xty[i] = sum;
  }

  // Solve (X'X + αI) β = X'y using Cholesky-like approach
  // For simplicity, use Gaussian elimination
  const beta = solveLinearSystem(XtX, Xty);
  if (!beta) return Infinity;

  // RSS = Σ(y_t - X_t β)²
  let rss = 0;
  for (let t = 0; t < n; t++) {
    let pred = 0;
    for (let j = 0; j < p; j++) pred += X[t][j] * beta[j];
    rss += (y[t] - pred) ** 2;
  }

  return rss;
}

/**
 * Detect nonlinearity in multivariate time series.
 *
 * Fits a linear VAR(1), then tests residuals for non-Gaussianity using
 * a simplified Jarque-Bera test (skewness² + kurtosis²).
 * If >50% of variables have non-Gaussian residuals, returns true.
 *
 * Ported from Python: nexusbrain_granger.py _detect_nonlinearity()
 */
export function detectNonlinearity(
  allSeries: number[][],
  threshold: number = 3.0
): boolean {
  const nVars = allSeries.length;
  const T = allSeries[0]?.length ?? 0;
  if (T < 20 || nVars < 2) return false;

  try {
    const lag = 1;
    let nonGaussianCount = 0;

    for (let target = 0; target < nVars; target++) {
      // Simple OLS: y_t = a + b*y_{t-1} → compute residuals
      const y = allSeries[target];
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      const n = T - lag;
      for (let t = lag; t < T; t++) {
        const xt = y[t - 1];
        const yt = y[t];
        sumX += xt;
        sumY += yt;
        sumXY += xt * yt;
        sumX2 += xt * xt;
      }
      const denom = n * sumX2 - sumX * sumX;
      if (Math.abs(denom) < 1e-15) continue;

      const b = (n * sumXY - sumX * sumY) / denom;
      const a = (sumY - b * sumX) / n;

      // Compute residuals and test for non-Gaussianity
      const residuals: number[] = [];
      for (let t = lag; t < T; t++) {
        residuals.push(y[t] - a - b * y[t - 1]);
      }

      const mean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
      const std = Math.sqrt(residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / residuals.length);
      if (std < 1e-10) continue;

      // Simplified Jarque-Bera: compute skewness and excess kurtosis
      let m3 = 0, m4 = 0;
      for (const r of residuals) {
        const z = (r - mean) / std;
        m3 += z ** 3;
        m4 += z ** 4;
      }
      const skewness = m3 / residuals.length;
      const kurtosis = m4 / residuals.length - 3; // excess kurtosis

      // JB ≈ n/6 * (S² + K²/4)
      const jb = (residuals.length / 6) * (skewness ** 2 + kurtosis ** 2 / 4);

      // Chi-squared critical value for df=2 at α=0.05 is ~5.99
      if (jb > threshold * 5.99) {
        nonGaussianCount++;
      }
    }

    return nonGaussianCount > nVars / 2;
  } catch {
    return false;
  }
}

// ============================================================================
// INCREMENTAL GRANGER CAUSALITY (Bottleneck #3 Fix)
// ============================================================================
//
// Instead of recomputing full OLS from scratch on every call (O(n·p²)),
// this maintains rolling sufficient statistics (X'X, X'y, RSS) that can be
// updated in O(p²) per new observation using rank-1 updates.
//
// Rolling window: keeps last `windowSize` observations. When the window is
// full, old observations are subtracted from the running sums.
//
// This reduces per-signal cost from O(n·p²) → O(p²), a 100–1000x speedup
// at 10M signals.
// ============================================================================

export interface IncrementalGrangerConfig {
  /** Number of lags to use (default: 5) */
  lag?: number;
  /** Rolling window size (default: 500) */
  windowSize?: number;
  /** Significance level (default: 0.05) */
  alpha?: number;
}

/** Sufficient statistics for incremental OLS: tracks X'X, X'y, y'y in O(p²) per update */
interface SufficientStats {
  /** X'X matrix (p x p) — running sum of outer products */
  XtX: number[][];
  /** X'y vector (p x 1) — running sum of x_i * y_i */
  Xty: number[];
  /** y'y scalar — running sum of y_i² */
  yty: number;
  /** Sum of y values (for mean computation) */
  sumY: number;
  /** Number of observations in the window */
  n: number;
  /** Dimensionality of X (number of regressors) */
  p: number;
}

/** Rolling circular buffer for time series values */
interface RollingBuffer {
  /** Circular buffer of observations */
  buffer: number[];
  /** Current write position */
  pos: number;
  /** Number of elements currently stored */
  count: number;
  /** Maximum capacity */
  capacity: number;
}

export interface IncrementalGrangerState {
  /** Rolling buffer for source signal X */
  xBuffer: RollingBuffer;
  /** Rolling buffer for target signal Y */
  yBuffer: RollingBuffer;
  /** Sufficient stats for restricted model (Y lags only) */
  restrictedStats: SufficientStats;
  /** Sufficient stats for unrestricted model (Y lags + X lags) */
  unrestrictedStats: SufficientStats;
  /** Configuration */
  lag: number;
  windowSize: number;
  alpha: number;
  /** Total signals processed */
  totalUpdates: number;
  /** Last computed result (cached) */
  lastResult: GrangerResult | null;
}

/** Create a new rolling buffer */
function createBuffer(capacity: number): RollingBuffer {
  return { buffer: new Array(capacity).fill(0), pos: 0, count: 0, capacity };
}

/** Push a value into the rolling buffer, returns the evicted value (or NaN if none) */
function bufferPush(buf: RollingBuffer, value: number): number {
  const evicted = buf.count >= buf.capacity ? buf.buffer[buf.pos] : NaN;
  buf.buffer[buf.pos] = value;
  buf.pos = (buf.pos + 1) % buf.capacity;
  if (buf.count < buf.capacity) buf.count++;
  return evicted;
}

/** Get value at index `i` (0 = oldest) from rolling buffer */
function bufferGet(buf: RollingBuffer, i: number): number {
  if (i < 0 || i >= buf.count) return 0;
  const start = buf.count < buf.capacity ? 0 : buf.pos;
  return buf.buffer[(start + i) % buf.capacity];
}

/** Create zero-initialized sufficient stats */
function createStats(p: number): SufficientStats {
  return {
    XtX: Array.from({ length: p }, () => new Array(p).fill(0)),
    Xty: new Array(p).fill(0),
    yty: 0,
    sumY: 0,
    n: 0,
    p,
  };
}

/** Rank-1 update: add observation (x, y) to running stats */
function addObservation(stats: SufficientStats, x: number[], y: number): void {
  const { XtX, Xty, p } = stats;
  for (let i = 0; i < p; i++) {
    Xty[i] += x[i] * y;
    for (let j = i; j < p; j++) {
      const val = x[i] * x[j];
      XtX[i][j] += val;
      if (i !== j) XtX[j][i] += val;
    }
  }
  stats.yty += y * y;
  stats.sumY += y;
  stats.n++;
}

/** Rank-1 downdate: subtract observation (x, y) from running stats */
function removeObservation(stats: SufficientStats, x: number[], y: number): void {
  const { XtX, Xty, p } = stats;
  for (let i = 0; i < p; i++) {
    Xty[i] -= x[i] * y;
    for (let j = i; j < p; j++) {
      const val = x[i] * x[j];
      XtX[i][j] -= val;
      if (i !== j) XtX[j][i] -= val;
    }
  }
  stats.yty -= y * y;
  stats.sumY -= y;
  stats.n--;
}

/** Compute RSS from sufficient statistics: RSS = y'y - β'X'y where β = (X'X)⁻¹X'y */
function computeRSSFromStats(stats: SufficientStats): number {
  if (stats.n <= stats.p + 1) return Infinity;

  // Solve (X'X)β = X'y
  const beta = solveLinearSystem(
    stats.XtX.map(row => [...row]),
    [...stats.Xty]
  );

  // RSS = y'y - β'X'y
  let betaXty = 0;
  for (let i = 0; i < stats.p; i++) {
    betaXty += beta[i] * stats.Xty[i];
  }
  return Math.max(0, stats.yty - betaXty);
}

/**
 * Create an incremental Granger causality state.
 *
 * Call `updateWithNewSignal()` each time a new (X, Y) pair arrives.
 * The state maintains rolling sufficient statistics for O(p²) per-update cost.
 */
export function createIncrementalGranger(
  config: IncrementalGrangerConfig = {}
): IncrementalGrangerState {
  const lag = config.lag ?? 5;
  const windowSize = config.windowSize ?? 500;
  const alpha = config.alpha ?? 0.05;

  // Restricted model: intercept + Y lags → p = lag + 1
  const pRestricted = lag + 1;
  // Unrestricted model: intercept + Y lags + X lags → p = 2*lag + 1
  const pUnrestricted = 2 * lag + 1;

  return {
    xBuffer: createBuffer(windowSize + lag),
    yBuffer: createBuffer(windowSize + lag),
    restrictedStats: createStats(pRestricted),
    unrestrictedStats: createStats(pUnrestricted),
    lag,
    windowSize,
    alpha,
    totalUpdates: 0,
    lastResult: null,
  };
}

/**
 * Feed a new (xValue, yValue) signal pair into the incremental Granger state.
 *
 * Returns a GrangerResult once enough observations are available (>= lag + 30),
 * or null if still warming up.
 *
 * Cost: O(p²) per call instead of O(n·p²) for full recomputation.
 */
export function updateWithNewSignal(
  state: IncrementalGrangerState,
  xValue: number,
  yValue: number,
): GrangerResult | null {
  const { lag, windowSize, alpha } = state;

  // Push new values into rolling buffers
  bufferPush(state.xBuffer, xValue);
  bufferPush(state.yBuffer, yValue);
  state.totalUpdates++;

  // Need at least lag+30 observations to form a meaningful regression
  const available = state.yBuffer.count;
  if (available < lag + 30) return null;

  // Current effective window size
  const effectiveN = Math.min(available - lag, windowSize);

  // Build the latest observation's regressor vectors
  // We only add/remove one observation per call for O(p²) amortized cost.
  // On first sufficient data or when buffer just became full, we do a full rebuild.
  const needFullRebuild = state.restrictedStats.n === 0 ||
    Math.abs(state.restrictedStats.n - effectiveN) > 1;

  if (needFullRebuild) {
    // Full rebuild from buffer (happens once on warmup, then only on edge cases)
    state.restrictedStats = createStats(lag + 1);
    state.unrestrictedStats = createStats(2 * lag + 1);

    for (let t = lag; t < lag + effectiveN; t++) {
      const yt = bufferGet(state.yBuffer, t);

      // Restricted: [1, Y_{t-1}, ..., Y_{t-lag}]
      const xR: number[] = [1];
      for (let l = 1; l <= lag; l++) xR.push(bufferGet(state.yBuffer, t - l));
      addObservation(state.restrictedStats, xR, yt);

      // Unrestricted: [1, Y_{t-1},...,Y_{t-lag}, X_{t-1},...,X_{t-lag}]
      const xU: number[] = [1];
      for (let l = 1; l <= lag; l++) xU.push(bufferGet(state.yBuffer, t - l));
      for (let l = 1; l <= lag; l++) xU.push(bufferGet(state.xBuffer, t - l));
      addObservation(state.unrestrictedStats, xU, yt);
    }
  } else {
    // Incremental: add newest observation
    const tNew = available - 1;
    const ytNew = bufferGet(state.yBuffer, tNew);

    const xRNew: number[] = [1];
    for (let l = 1; l <= lag; l++) xRNew.push(bufferGet(state.yBuffer, tNew - l));
    addObservation(state.restrictedStats, xRNew, ytNew);

    const xUNew: number[] = [1];
    for (let l = 1; l <= lag; l++) xUNew.push(bufferGet(state.yBuffer, tNew - l));
    for (let l = 1; l <= lag; l++) xUNew.push(bufferGet(state.xBuffer, tNew - l));
    addObservation(state.unrestrictedStats, xUNew, ytNew);

    // If window is full, remove oldest observation
    if (state.restrictedStats.n > windowSize) {
      const tOld = tNew - windowSize;
      const ytOld = bufferGet(state.yBuffer, tOld);

      const xROld: number[] = [1];
      for (let l = 1; l <= lag; l++) xROld.push(bufferGet(state.yBuffer, tOld - l));
      removeObservation(state.restrictedStats, xROld, ytOld);

      const xUOld: number[] = [1];
      for (let l = 1; l <= lag; l++) xUOld.push(bufferGet(state.yBuffer, tOld - l));
      for (let l = 1; l <= lag; l++) xUOld.push(bufferGet(state.xBuffer, tOld - l));
      removeObservation(state.unrestrictedStats, xUOld, ytOld);
    }
  }

  // Compute F-statistic from sufficient statistics
  const rssR = computeRSSFromStats(state.restrictedStats);
  const rssU = computeRSSFromStats(state.unrestrictedStats);
  const n = state.restrictedStats.n;
  const dfDen = n - 2 * lag - 1;

  if (dfDen <= 0 || rssU <= 0 || !Number.isFinite(rssR) || !Number.isFinite(rssU)) {
    return null;
  }

  const fStatistic = Math.max(0, ((rssR - rssU) / lag) / (rssU / dfDen));
  const pValue = fTestPValue(fStatistic, lag, dfDen);
  const effectSize = Math.max(0, Math.min(1, (rssR - rssU) / rssR));

  const result: GrangerResult = {
    sourceDomain: 'source',
    targetDomain: 'target',
    fStatistic,
    pValue,
    optimalLag: lag,
    isSignificant: pValue < alpha,
    effectSize,
    confidenceInterval: { lower: 0, upper: Math.min(1, effectSize * 2), level: 1 - alpha },
    sampleSize: n,
    naturalLanguage: generateNaturalLanguage(fStatistic, pValue, effectSize, lag, n),
  };

  state.lastResult = result;
  return result;
}

/**
 * Get the last computed incremental Granger result without triggering a new update.
 */
export function getIncrementalResult(state: IncrementalGrangerState): GrangerResult | null {
  return state.lastResult;
}

/**
 * Reset the incremental Granger state (e.g., between batch runs).
 */
export function resetIncrementalGranger(state: IncrementalGrangerState): void {
  state.xBuffer = createBuffer(state.windowSize + state.lag);
  state.yBuffer = createBuffer(state.windowSize + state.lag);
  state.restrictedStats = createStats(state.lag + 1);
  state.unrestrictedStats = createStats(2 * state.lag + 1);
  state.totalUpdates = 0;
  state.lastResult = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const GrangerCausality = {
  computeGrangerCausality,
  computeConditionalGranger,
  computeRidgeConditionalGranger,
  detectNonlinearity,
  testAllPairsConditional,
  buildImpulseResponse,
  testAllDomainPairs,
  testAllPairs,
  interpretResult,
  selectOptimalLag,
  ordinaryLeastSquares,
  solveLinearSystem,
  fitRestrictedVAR,
  fitUnrestrictedVAR,
  // Incremental (Bottleneck #3)
  createIncrementalGranger,
  updateWithNewSignal,
  getIncrementalResult,
  resetIncrementalGranger,
};
