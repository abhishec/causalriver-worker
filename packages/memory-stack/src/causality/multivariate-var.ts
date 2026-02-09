/**
 * Multivariate VAR Utilities
 *
 * Shared linear algebra functions for advanced causal discovery methods.
 * Provides design matrix construction, OLS RSS computation, score normalization,
 * and agreement-based ensemble voting.
 *
 * Used by: advanced-discovery.ts, granger-causality.ts
 */

import { ordinaryLeastSquares } from './granger-causality';

// ============================================================================
// DESIGN MATRIX CONSTRUCTION
// ============================================================================

/**
 * Build multivariate design matrix for a target variable.
 *
 * Columns: [intercept, target_lags, ...predictor_lags]
 * Optionally exclude certain predictor indices.
 */
export function buildMultivariateDesignMatrix(
  targetValues: number[],
  allSeriesValues: number[][],
  lag: number,
  excludeIndices?: number[]
): { X: number[][]; y: number[] } {
  const T = targetValues.length;
  const nObs = T - lag;
  const exclude = new Set(excludeIndices ?? []);

  const X: number[][] = [];
  for (let t = lag; t < T; t++) {
    const row: number[] = [1]; // intercept
    // Target own lags
    for (let l = 1; l <= lag; l++) {
      row.push(targetValues[t - l]);
    }
    // Other variable lags
    for (let v = 0; v < allSeriesValues.length; v++) {
      if (exclude.has(v)) continue;
      for (let l = 1; l <= lag; l++) {
        row.push(allSeriesValues[v][t - l]);
      }
    }
    X.push(row);
  }

  const y = targetValues.slice(lag);
  return { X, y };
}

// ============================================================================
// OLS UTILITIES
// ============================================================================

/**
 * Compute OLS residual sum of squares for a design matrix and response vector.
 */
export function computeOlsRSS(X: number[][], y: number[]): number {
  const result = ordinaryLeastSquares(X, y);
  return result.rss;
}

/**
 * Fit OLS and return coefficients along with RSS.
 */
export function fitOLS(X: number[][], y: number[]): { coefficients: number[]; rss: number } {
  const result = ordinaryLeastSquares(X, y);
  return { coefficients: result.coefficients, rss: result.rss };
}

// ============================================================================
// SCORE NORMALIZATION
// ============================================================================

/**
 * Normalize a 2D score matrix to [0, 1] range (min-max normalization).
 */
export function normalizeScores(scores: number[][]): number[][] {
  const n = scores.length;
  if (n === 0) return [];

  let sMin = Infinity;
  let sMax = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < scores[i].length; j++) {
      const v = scores[i][j];
      if (!isFinite(v)) continue; // Skip NaN/Infinity
      if (v < sMin) sMin = v;
      if (v > sMax) sMax = v;
    }
  }

  // Guard: all values were NaN/Infinity or matrix was constant
  if (!isFinite(sMin) || !isFinite(sMax) || sMax - sMin < 1e-15) {
    return scores.map(row => row.map(() => 0));
  }

  const range = sMax - sMin;
  return scores.map(row => row.map(v => isFinite(v) ? (v - sMin) / range : 0));
}

// ============================================================================
// AGREEMENT VOTING
// ============================================================================

/**
 * Compute agreement bonus across multiple method score matrices.
 *
 * For each method, identifies the top-K fraction of edges.
 * Edges agreed upon by 3+ methods get a boost.
 */
export function computeAgreementBonus(
  methodScores: Map<string, number[][]>,
  topKFraction: number = 0.25,
  minMethodsForBonus: number = 3,
  bonusMagnitude: number = 0.5
): number[][] {
  const methods = Array.from(methodScores.values());
  if (methods.length === 0) return [];

  const n = methods[0].length;
  const nEdges = n * (n - 1);
  if (nEdges === 0) return methods[0].map(row => row.map(() => 0));

  const topK = Math.max(1, Math.floor(nEdges * topKFraction));
  const agreement: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (const scores of methods) {
    // Flatten and find threshold for top-K
    const flat: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) flat.push(scores[i][j]);
      }
    }
    flat.sort((a, b) => a - b);
    const threshold = flat.length > topK ? flat[flat.length - topK] : 0;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && scores[i][j] >= threshold) {
          agreement[i][j] += 1;
        }
      }
    }
  }

  // Convert to bonus multiplier
  const bonus: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (agreement[i][j] >= minMethodsForBonus) {
        bonus[i][j] = bonusMagnitude;
      }
    }
  }

  return bonus;
}

// ============================================================================
// MATRIX UTILITIES
// ============================================================================

/**
 * Create a zero-filled n x n matrix.
 */
export function zeroMatrix(n: number): number[][] {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

/**
 * Zero out the diagonal of a matrix (in-place).
 */
export function zeroDiagonal(matrix: number[][]): void {
  for (let i = 0; i < matrix.length; i++) {
    if (i < matrix[i].length) matrix[i][i] = 0;
  }
}

/**
 * Apply a multiplier matrix element-wise: result[i][j] = base[i][j] * (1 + bonus[i][j]).
 */
export function applyBonus(base: number[][], bonus: number[][]): number[][] {
  return base.map((row, i) => row.map((v, j) => v * (1 + (bonus[i]?.[j] ?? 0))));
}

export const MultivariateVAR = {
  buildMultivariateDesignMatrix,
  computeOlsRSS,
  fitOLS,
  normalizeScores,
  computeAgreementBonus,
  zeroMatrix,
  zeroDiagonal,
  applyBonus,
};
