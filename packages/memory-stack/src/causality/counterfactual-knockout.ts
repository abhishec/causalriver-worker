/**
 * Counterfactual Knockout: Causal Discovery via Permutation Importance
 *
 * Ported from the CausalRivers benchmark (nexusbrain_granger.py) where this
 * method was key to beating the VAR baseline on confounder datasets.
 *
 * Algorithm:
 * 1. Fit full multivariate VAR model → get baseline MSE per target
 * 2. For each source: block-shuffle its time series (preserves marginal
 *    distribution but breaks temporal dependencies)
 * 3. Refit VAR on counterfactual data
 * 4. Apply counterfactual coefficients to ORIGINAL lagged matrix
 * 5. Causal effect = max(0, (cf_MSE - full_MSE) / full_MSE)
 *
 * Key advantage for confounders:
 * - If A and B are confounded by hidden C, shuffling A won't hurt B's
 *   prediction much because B's dynamics are driven by C (still intact)
 * - If A truly causes B, shuffling A WILL hurt B's prediction significantly
 */

import { ordinaryLeastSquares } from './granger-causality';
import { zeroMatrix } from './multivariate-var';

// ============================================================================
// TYPES
// ============================================================================

export interface CounterfactualKnockoutConfig {
  maxLag: number;
  nShuffles: number;
  seed: number;
}

export const DEFAULT_CF_KNOCKOUT_CONFIG: CounterfactualKnockoutConfig = {
  maxLag: 3,
  nShuffles: 5,
  seed: 42,
};

// ============================================================================
// BLOCK SHUFFLE
// ============================================================================

/**
 * Simple seeded PRNG (Mulberry32) for reproducible shuffling.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using a seeded PRNG.
 */
function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Block-shuffle a time series: divide into blocks, permute blocks.
 * Preserves marginal distribution and local autocorrelation structure
 * within blocks, but breaks long-range temporal dependencies.
 */
function blockShuffle(
  series: number[],
  blockSize: number,
  rng: () => number
): number[] {
  const n = series.length;
  const blocks: number[][] = [];
  for (let i = 0; i < n; i += blockSize) {
    blocks.push(series.slice(i, i + blockSize));
  }
  const shuffled = seededShuffle(blocks, rng);
  const result: number[] = [];
  for (const block of shuffled) {
    for (const v of block) result.push(v);
  }
  return result.slice(0, n);
}

// ============================================================================
// FULL MULTIVARIATE VAR FIT
// ============================================================================

interface VARFitResult {
  /** Coefficient matrix: params[col] = coefficients for that target equation */
  params: number[][];
  /** Residuals: resid[t][var] */
  residuals: number[][];
  /** Per-variable MSE */
  msePerVariable: number[];
  /** Number of lags used */
  lag: number;
}

/**
 * Fit a full multivariate VAR(lag) model.
 * For each target variable, fits OLS: y_target = intercept + sum(all_var_lags) + eps
 *
 * Returns the coefficient matrix and residuals.
 */
function fitFullVAR(values: number[][], nVars: number, lag: number): VARFitResult | null {
  const T = values[0].length;
  const nObs = T - lag;
  const nParams = 1 + nVars * lag; // intercept + all variable lags

  if (nObs <= nParams + 2) return null;

  // Build shared lagged matrix (same X for all target equations)
  const X: number[][] = [];
  for (let t = lag; t < T; t++) {
    const row: number[] = [1]; // intercept
    for (let l = 1; l <= lag; l++) {
      for (let v = 0; v < nVars; v++) {
        row.push(values[v][t - l]);
      }
    }
    X.push(row);
  }

  const params: number[][] = [];
  const residuals: number[][] = Array.from({ length: nObs }, () => Array(nVars).fill(0));
  const msePerVariable: number[] = [];

  for (let target = 0; target < nVars; target++) {
    const y = values[target].slice(lag);
    try {
      const result = ordinaryLeastSquares(X, y);
      params.push(result.coefficients);

      // Compute residuals
      let sumSqErr = 0;
      for (let t = 0; t < nObs; t++) {
        let pred = 0;
        for (let k = 0; k < result.coefficients.length; k++) {
          pred += result.coefficients[k] * X[t][k];
        }
        const err = y[t] - pred;
        residuals[t][target] = err;
        sumSqErr += err * err;
      }
      msePerVariable.push(sumSqErr / nObs);
    } catch {
      params.push(Array(nParams).fill(0));
      msePerVariable.push(Infinity);
    }
  }

  return { params, residuals, msePerVariable, lag };
}

// ============================================================================
// COUNTERFACTUAL KNOCKOUT
// ============================================================================

/**
 * Counterfactual Knockout scoring for causal discovery.
 *
 * For each source variable, block-shuffles its time series, refits the VAR model,
 * and measures how much the prediction of each target variable degrades.
 *
 * High score = shuffling the source hurts prediction → source is a true cause.
 * Low score = shuffling the source doesn't hurt → likely confounded or independent.
 *
 * @param data - Record<string, number[]> mapping domain names to time series values
 * @param config - Configuration (maxLag, nShuffles, seed)
 * @returns PairwiseKnockoutResult with scores[target][source] = prediction degradation
 */
export function counterfactualKnockout(
  data: Record<string, number[]>,
  config: Partial<CounterfactualKnockoutConfig> = {}
): { domains: string[]; scores: number[][] } {
  const fullConfig = { ...DEFAULT_CF_KNOCKOUT_CONFIG, ...config };
  const domains = Object.keys(data);
  const nVars = domains.length;

  if (nVars < 2) {
    return { domains, scores: zeroMatrix(nVars) };
  }

  const values = domains.map(d => data[d]);
  const T = values[0]?.length ?? 0;

  // Determine lag (same heuristic as Python)
  const lag = Math.max(1, Math.min(fullConfig.maxLag, Math.floor(T / (3 * nVars))));

  // Step 1: Fit full VAR model and get baseline MSE
  const fullFit = fitFullVAR(values, nVars, lag);
  if (!fullFit) {
    return { domains, scores: zeroMatrix(nVars) };
  }

  const fullMSE = fullFit.msePerVariable;
  const scores = zeroMatrix(nVars);

  // Step 2: For each source variable, create counterfactual and measure effect
  for (let source = 0; source < nVars; source++) {
    const cfMseDeltas = Array(nVars).fill(0);

    for (let shuffleIdx = 0; shuffleIdx < fullConfig.nShuffles; shuffleIdx++) {
      const rng = mulberry32(fullConfig.seed + source * 100 + shuffleIdx);

      // Block-shuffle the source variable
      const blockSize = Math.max(lag * 3, 50);
      const shuffledSource = blockShuffle(values[source], blockSize, rng);

      // Create counterfactual data
      const cfValues = values.map((v, i) => (i === source ? shuffledSource : v));

      // Refit VAR on counterfactual data
      const cfFit = fitFullVAR(cfValues, nVars, lag);
      if (!cfFit) continue;

      // Apply counterfactual model's coefficients to ORIGINAL lagged matrix
      // This measures: with cf coefficients, how well can we predict original targets?
      const nObs = T - lag;
      const nParams = 1 + nVars * lag;

      // Build lagged matrix from ORIGINAL data
      const XOrig: number[][] = [];
      for (let t = lag; t < T; t++) {
        const row: number[] = [1];
        for (let l = 1; l <= lag; l++) {
          for (let v = 0; v < nVars; v++) {
            row.push(values[v][t - l]);
          }
        }
        XOrig.push(row);
      }

      // Predict each target using cf coefficients on original data
      for (let target = 0; target < nVars; target++) {
        if (target === source) continue;

        const yOrig = values[target].slice(lag);
        const cfCoeffs = cfFit.params[target];
        if (!cfCoeffs || cfCoeffs.length === 0) continue;

        let cfMSE = 0;
        for (let t = 0; t < nObs; t++) {
          let pred = 0;
          for (let k = 0; k < Math.min(cfCoeffs.length, XOrig[t].length); k++) {
            pred += cfCoeffs[k] * XOrig[t][k];
          }
          const err = yOrig[t] - pred;
          cfMSE += err * err;
        }
        cfMSE /= nObs;

        // Delta: how much worse is prediction for this target?
        if (fullMSE[target] > 1e-15) {
          const delta = (cfMSE - fullMSE[target]) / fullMSE[target];
          cfMseDeltas[target] += Math.max(0, delta);
        }
      }
    }

    // Average across shuffles
    for (let target = 0; target < nVars; target++) {
      if (target === source) continue;
      scores[target][source] = cfMseDeltas[target] / Math.max(fullConfig.nShuffles, 1);
    }
  }

  return { domains, scores };
}

export const CounterfactualKnockout = {
  counterfactualKnockout,
  blockShuffle,
};
