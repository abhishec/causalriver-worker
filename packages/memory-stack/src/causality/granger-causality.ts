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
  
  // Compute effect size (partial R² or eta²)
  const effectSize = (rssRestricted - rssUnrestricted) / rssRestricted;
  
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
function selectOptimalLag(
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
function fitRestrictedVAR(
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
function fitUnrestrictedVAR(
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
function ordinaryLeastSquares(
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
function solveLinearSystem(A: number[][], b: number[]): number[] {
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
  // Use Fisher's z transformation for CI
  const r = Math.sqrt(effectSize);
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
 */
export function testAllDomainPairs(
  signals: Map<string, number[]>,
  config: GrangerTestConfig = {}
): GrangerResult[] {
  const domains = Array.from(signals.keys());
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
// EXPORTS
// ============================================================================

export const GrangerCausality = {
  computeGrangerCausality,
  buildImpulseResponse,
  testAllDomainPairs,
  testAllPairs,
  interpretResult,
  selectOptimalLag
};
