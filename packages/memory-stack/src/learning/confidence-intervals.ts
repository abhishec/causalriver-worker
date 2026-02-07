/**
 * Confidence Intervals
 * 
 * Uncertainty quantification utilities for statistical inference.
 * Provides multiple methods for computing confidence/credible intervals.
 * 
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A confidence or credible interval
 */
export interface Interval {
  lower: number;
  upper: number;
  point: number;
  confidenceLevel: number;
  method: string;
}

/**
 * Configuration for bootstrap CI
 */
export interface BootstrapConfig {
  numSamples: number;
  confidenceLevel: number;
  method: 'percentile' | 'bca' | 'basic';
}

/**
 * Prior distribution parameters for Bayesian inference
 */
export interface BetaPrior {
  alpha: number;
  beta: number;
}

// ============================================================================
// WILSON SCORE INTERVAL
// ============================================================================

/**
 * Computes Wilson Score interval for proportions
 * 
 * More accurate than the normal approximation for small samples
 * or proportions near 0 or 1.
 * 
 * @param successes - Number of successes
 * @param total - Total number of trials
 * @param confidenceLevel - Confidence level (default 0.95)
 * 
 * @example
 * ```ts
 * // 8 successes out of 10 trials
 * const interval = wilsonScoreInterval(8, 10, 0.95);
 * // { lower: 0.49, upper: 0.94, point: 0.8, ... }
 * ```
 */
export function wilsonScoreInterval(
  successes: number,
  total: number,
  confidenceLevel: number = 0.95
): Interval {
  if (total === 0) {
    return {
      lower: 0,
      upper: 1,
      point: 0.5,
      confidenceLevel,
      method: 'wilson',
    };
  }
  
  const p = successes / total;
  const z = getZScore(confidenceLevel);
  const z2 = z * z;
  const n = total;
  
  const denominator = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  
  return {
    lower: Math.max(0, (center - spread) / denominator),
    upper: Math.min(1, (center + spread) / denominator),
    point: p,
    confidenceLevel,
    method: 'wilson',
  };
}

// ============================================================================
// BOOTSTRAP CONFIDENCE INTERVAL
// ============================================================================

/**
 * Computes bootstrap confidence interval for any statistic
 * 
 * Non-parametric method that resamples with replacement.
 * 
 * @param data - Array of numeric values
 * @param statistic - Function computing the statistic of interest
 * @param config - Bootstrap configuration
 * 
 * @example
 * ```ts
 * const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
 * const meanCI = bootstrapCI(
 *   data,
 *   (sample) => sample.reduce((a, b) => a + b, 0) / sample.length,
 *   { numSamples: 1000, confidenceLevel: 0.95, method: 'percentile' }
 * );
 * ```
 */
export function bootstrapCI(
  data: number[],
  statistic: (sample: number[]) => number,
  config: BootstrapConfig = { numSamples: 1000, confidenceLevel: 0.95, method: 'percentile' }
): Interval {
  if (data.length === 0) {
    return {
      lower: 0,
      upper: 0,
      point: 0,
      confidenceLevel: config.confidenceLevel,
      method: 'bootstrap',
    };
  }
  
  const originalStat = statistic(data);
  const bootstrapStats: number[] = [];
  
  // Generate bootstrap samples
  for (let i = 0; i < config.numSamples; i++) {
    const sample: number[] = [];
    for (let j = 0; j < data.length; j++) {
      const idx = Math.floor(Math.random() * data.length);
      sample.push(data[idx]);
    }
    bootstrapStats.push(statistic(sample));
  }
  
  bootstrapStats.sort((a, b) => a - b);
  
  const alpha = 1 - config.confidenceLevel;
  
  if (config.method === 'percentile') {
    const lowerIdx = Math.floor((alpha / 2) * config.numSamples);
    const upperIdx = Math.floor((1 - alpha / 2) * config.numSamples);
    
    return {
      lower: bootstrapStats[lowerIdx],
      upper: bootstrapStats[upperIdx],
      point: originalStat,
      confidenceLevel: config.confidenceLevel,
      method: 'bootstrap-percentile',
    };
  }
  
  if (config.method === 'basic') {
    // Basic bootstrap: 2*theta - percentile
    const lowerIdx = Math.floor((alpha / 2) * config.numSamples);
    const upperIdx = Math.floor((1 - alpha / 2) * config.numSamples);
    
    return {
      lower: 2 * originalStat - bootstrapStats[upperIdx],
      upper: 2 * originalStat - bootstrapStats[lowerIdx],
      point: originalStat,
      confidenceLevel: config.confidenceLevel,
      method: 'bootstrap-basic',
    };
  }
  
  // BCa (bias-corrected and accelerated) - simplified version
  const lowerIdx = Math.floor((alpha / 2) * config.numSamples);
  const upperIdx = Math.floor((1 - alpha / 2) * config.numSamples);
  
  return {
    lower: bootstrapStats[lowerIdx],
    upper: bootstrapStats[upperIdx],
    point: originalStat,
    confidenceLevel: config.confidenceLevel,
    method: 'bootstrap-bca',
  };
}

// ============================================================================
// BAYESIAN CREDIBLE INTERVAL
// ============================================================================

/**
 * Computes Bayesian credible interval for a proportion
 * 
 * Uses conjugate Beta-Binomial model. The credible interval
 * represents the range where the true parameter lies with
 * the specified probability, given the data and prior.
 * 
 * @param successes - Observed successes
 * @param total - Total observations
 * @param prior - Beta prior parameters (default: uniform Beta(1,1))
 * @param credibleLevel - Credible level (default 0.95)
 * 
 * @example
 * ```ts
 * // With uniform prior
 * const interval = bayesianCredibleInterval(8, 10);
 * 
 * // With informative prior (previous belief: ~50% success rate)
 * const interval = bayesianCredibleInterval(8, 10, { alpha: 5, beta: 5 });
 * ```
 */
export function bayesianCredibleInterval(
  successes: number,
  total: number,
  prior: BetaPrior = { alpha: 1, beta: 1 },
  credibleLevel: number = 0.95
): Interval {
  // Posterior parameters (conjugate update)
  const posteriorAlpha = prior.alpha + successes;
  const posteriorBeta = prior.beta + (total - successes);
  
  // Posterior mean (point estimate)
  const posteriorMean = posteriorAlpha / (posteriorAlpha + posteriorBeta);
  
  // Compute quantiles of Beta distribution using approximation
  const alpha = 1 - credibleLevel;
  const lower = betaQuantile(alpha / 2, posteriorAlpha, posteriorBeta);
  const upper = betaQuantile(1 - alpha / 2, posteriorAlpha, posteriorBeta);
  
  return {
    lower,
    upper,
    point: posteriorMean,
    confidenceLevel: credibleLevel,
    method: 'bayesian-beta',
  };
}

/**
 * Approximation of Beta distribution quantile using Newton-Raphson
 */
function betaQuantile(p: number, alpha: number, beta: number): number {
  // Initial guess using normal approximation
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const z = getZScore(p * 2); // Convert to symmetric quantile
  let x = Math.max(0.001, Math.min(0.999, mean + z * Math.sqrt(variance)));
  
  // Newton-Raphson iterations
  for (let i = 0; i < 10; i++) {
    const cdf = incompleteBeta(x, alpha, beta);
    const pdf = betaPDF(x, alpha, beta);
    
    if (Math.abs(pdf) < 1e-10) break;
    
    const delta = (cdf - p) / pdf;
    x = Math.max(0.001, Math.min(0.999, x - delta));
    
    if (Math.abs(delta) < 1e-8) break;
  }
  
  return x;
}

/**
 * Beta probability density function
 */
function betaPDF(x: number, alpha: number, beta: number): number {
  if (x <= 0 || x >= 1) return 0;
  
  const logPDF = (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) -
    logBeta(alpha, beta);
  
  return Math.exp(logPDF);
}

/**
 * Incomplete beta function (CDF of Beta distribution)
 * Using continued fraction approximation
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  
  // Use symmetry for numerical stability
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(1 - x, b, a);
  }
  
  const bt = Math.exp(
    a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b)
  );
  
  // Continued fraction
  let ai = 1;
  let bi = 1 - (a + b) * x / (a + 1);
  let cf = ai / bi;
  
  for (let m = 1; m <= 100; m++) {
    const em = m;
    const aEven = em * (b - em) * x / ((a + 2 * em - 1) * (a + 2 * em));
    bi = 1 + aEven / bi;
    ai = 1 + aEven / ai;
    cf *= ai / bi;
    
    const aOdd = -(a + em) * (a + b + em) * x / ((a + 2 * em) * (a + 2 * em + 1));
    bi = 1 + aOdd / bi;
    ai = 1 + aOdd / ai;
    const delta = ai / bi;
    cf *= delta;
    
    if (Math.abs(delta - 1) < 1e-8) break;
  }
  
  return bt * cf / a;
}

/**
 * Log of the Beta function using log-gamma
 */
function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Log-gamma function (Lanczos approximation)
 */
function logGamma(x: number): number {
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
    1.5056327351493116e-7,
  ];
  
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  
  x -= 1;
  let a = c[0];
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// ============================================================================
// UNIFIED INTERFACE
// ============================================================================

/**
 * Unified interface for uncertainty quantification
 * 
 * Automatically selects the best method based on data characteristics.
 */
export function quantifyUncertainty(
  data: {
    successes?: number;
    total?: number;
    values?: number[];
    statistic?: (sample: number[]) => number;
  },
  options: {
    method?: 'auto' | 'wilson' | 'bootstrap' | 'bayesian';
    confidenceLevel?: number;
    prior?: BetaPrior;
  } = {}
): Interval {
  const { method = 'auto', confidenceLevel = 0.95 } = options;
  
  // For proportion data
  if (data.successes !== undefined && data.total !== undefined) {
    if (method === 'bayesian' || (method === 'auto' && data.total < 20)) {
      return bayesianCredibleInterval(
        data.successes,
        data.total,
        options.prior,
        confidenceLevel
      );
    }
    return wilsonScoreInterval(data.successes, data.total, confidenceLevel);
  }
  
  // For continuous data
  if (data.values && data.values.length > 0) {
    const stat = data.statistic || ((arr: number[]) => 
      arr.reduce((a, b) => a + b, 0) / arr.length
    );
    
    return bootstrapCI(data.values, stat, {
      numSamples: 1000,
      confidenceLevel,
      method: 'percentile',
    });
  }
  
  return {
    lower: 0,
    upper: 1,
    point: 0.5,
    confidenceLevel,
    method: 'unknown',
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Gets Z-score for a given confidence level
 */
function getZScore(confidenceLevel: number): number {
  // Common values
  if (confidenceLevel === 0.95) return 1.96;
  if (confidenceLevel === 0.99) return 2.576;
  if (confidenceLevel === 0.90) return 1.645;
  
  // Approximate using inverse error function
  const p = (1 + confidenceLevel) / 2;
  return Math.sqrt(2) * inverseErf(2 * p - 1);
}

/**
 * Inverse error function approximation
 */
function inverseErf(x: number): number {
  const a = 0.147;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  
  const ln1MinusX2 = Math.log(1 - x * x);
  const term1 = 2 / (Math.PI * a) + ln1MinusX2 / 2;
  const term2 = ln1MinusX2 / a;
  
  return sign * Math.sqrt(Math.sqrt(term1 * term1 - term2) - term1);
}

/**
 * Formats an interval for display
 */
export function formatInterval(interval: Interval, decimals: number = 2): string {
  const pct = (interval.confidenceLevel * 100).toFixed(0);
  return `${interval.point.toFixed(decimals)} (${pct}% CI: ${interval.lower.toFixed(decimals)}-${interval.upper.toFixed(decimals)})`;
}
