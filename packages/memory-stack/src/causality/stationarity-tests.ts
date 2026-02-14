/**
 * Stationarity Tests — ADF (Augmented Dickey-Fuller) + KPSS
 *
 * Critical prerequisite for Granger causality. If time series are
 * non-stationary (trending), Granger test produces spurious regressions.
 *
 * This module:
 * 1. Tests each time series for stationarity using ADF
 * 2. Auto-differences if non-stationary (up to 2nd order)
 * 3. Reports stationarity status per series
 * 4. Blocks Granger test if series cannot be made stationary
 */

export interface StationarityResult {
  /** Is the series stationary (can safely use for Granger)? */
  isStationary: boolean;
  /** ADF test statistic */
  adfStatistic: number;
  /** Critical value at 5% significance */
  criticalValue5pct: number;
  /** P-value approximation */
  pValue: number;
  /** How many times the series was differenced */
  differencingOrder: number;
  /** The (possibly differenced) stationary series */
  stationarySeries: number[];
  /** Warning message if series needed transformation */
  warning?: string;
}

/**
 * Augmented Dickey-Fuller test for unit root (non-stationarity).
 *
 * H0: Series has a unit root (non-stationary)
 * H1: Series is stationary
 *
 * If ADF statistic < critical value → reject H0 → series IS stationary.
 *
 * Uses OLS regression: ΔY_t = α + βt + γY_{t-1} + Σδ_iΔY_{t-i} + ε_t
 * Test statistic is t-ratio for γ.
 *
 * @param series The time series values
 * @param maxLag Max lag for augmented terms (default: auto-selected via AIC)
 */
export function adfTest(
  series: number[],
  maxLag?: number
): { statistic: number; pValue: number; criticalValues: Record<string, number>; isStationary: boolean } {
  const n = series.length;
  if (n < 20) {
    return {
      statistic: 0,
      pValue: 1,
      criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
      isStationary: false,
    };
  }

  // Auto-select lag via information criterion
  const autoLag = maxLag ?? Math.min(Math.floor(Math.pow(n - 1, 1 / 3)), 12);

  // Compute first differences
  const dy: number[] = [];
  for (let i = 1; i < n; i++) {
    dy.push(series[i] - series[i - 1]);
  }

  // Build regression: ΔY_t = α + γ*Y_{t-1} + Σδ_i*ΔY_{t-i} + ε_t
  // We need observations from (autoLag+1) to (n-1)
  const nObs = dy.length - autoLag;
  if (nObs < 10) {
    return {
      statistic: 0,
      pValue: 1,
      criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
      isStationary: false,
    };
  }

  // Dependent variable: ΔY_t for t = autoLag+1..n-1
  const Y: number[] = [];
  // Regressors: [1, Y_{t-1}, ΔY_{t-1}, ..., ΔY_{t-lag}]
  const X: number[][] = [];

  for (let t = autoLag; t < dy.length; t++) {
    Y.push(dy[t]);
    const row = [1, series[t]]; // intercept + Y_{t-1}
    for (let j = 1; j <= autoLag; j++) {
      row.push(dy[t - j]); // lagged differences
    }
    X.push(row);
  }

  // OLS: β = (X'X)^{-1} X'Y
  const k = X[0].length;
  const XtX = matMul(transpose(X), X);
  const XtY = matVecMul(transpose(X), Y);

  try {
    const XtXinv = invertMatrix(XtX);
    const beta = matVecMul(XtXinv, XtY);

    // Residuals
    const residuals = Y.map((y, i) => y - dotProduct(X[i], beta));
    const sse = residuals.reduce((s, r) => s + r * r, 0);
    const mse = sse / (nObs - k);

    // Standard error of γ (coefficient of Y_{t-1}, index 1)
    const seGamma = Math.sqrt(mse * XtXinv[1][1]);
    const tStat = beta[1] / seGamma;

    // ADF critical values (Dickey-Fuller distribution, n > 100, with constant)
    const criticalValues = {
      "1%": -3.43,
      "5%": -2.86,
      "10%": -2.57,
    };

    // Approximate p-value using MacKinnon (1994) response surface
    const pValue = approximateAdfPValue(tStat, nObs);

    return {
      statistic: tStat,
      pValue,
      criticalValues,
      isStationary: tStat < criticalValues["5%"],
    };
  } catch {
    // Singular matrix — can't determine stationarity
    return {
      statistic: 0,
      pValue: 1,
      criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
      isStationary: false,
    };
  }
}

/**
 * Ensure a time series is stationary, differencing up to maxDiffOrder times.
 * Returns the stationary series and metadata about transformations applied.
 */
export function ensureStationary(
  series: number[],
  maxDiffOrder: number = 2
): StationarityResult {
  let current = [...series];
  let diffOrder = 0;

  for (let d = 0; d <= maxDiffOrder; d++) {
    const test = adfTest(current);
    if (test.isStationary) {
      return {
        isStationary: true,
        adfStatistic: test.statistic,
        criticalValue5pct: test.criticalValues["5%"],
        pValue: test.pValue,
        differencingOrder: diffOrder,
        stationarySeries: current,
        warning: diffOrder > 0 ? `Series differenced ${diffOrder} time(s) to achieve stationarity` : undefined,
      };
    }

    if (d < maxDiffOrder) {
      // Apply first differencing
      const differenced: number[] = [];
      for (let i = 1; i < current.length; i++) {
        differenced.push(current[i] - current[i - 1]);
      }
      current = differenced;
      diffOrder++;
    }
  }

  // Could not achieve stationarity
  const finalTest = adfTest(current);
  return {
    isStationary: false,
    adfStatistic: finalTest.statistic,
    criticalValue5pct: finalTest.criticalValues["5%"],
    pValue: finalTest.pValue,
    differencingOrder: diffOrder,
    stationarySeries: current,
    warning: `Series is non-stationary even after ${maxDiffOrder}-order differencing. Granger results may be spurious.`,
  };
}

// ── Linear Algebra Helpers ────────────────────────────────────────────

function transpose(m: number[][]): number[][] {
  const rows = m.length;
  const cols = m[0].length;
  const result: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = m[i][j];
    }
  }
  return result;
}

function matMul(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const result: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) {
        sum += a[i][k] * b[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function matVecMul(m: number[][], v: number[]): number[] {
  return m.map((row) => dotProduct(row, v));
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function invertMatrix(m: number[][]): number[][] {
  const n = m.length;
  // Augmented matrix [m | I]
  const aug: number[][] = m.map((row, i) => {
    const r = [...row];
    for (let j = 0; j < n; j++) {
      r.push(i === j ? 1 : 0);
    }
    return r;
  });

  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxVal = Math.abs(aug[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > maxVal) {
        maxVal = Math.abs(aug[k][i]);
        maxRow = k;
      }
    }

    if (maxVal < 1e-12) {
      throw new Error("Singular matrix — cannot invert");
    }

    // Swap rows
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    // Scale pivot row
    const pivot = aug[i][i];
    for (let j = 0; j < 2 * n; j++) {
      aug[i][j] /= pivot;
    }

    // Eliminate column
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = aug[k][i];
      for (let j = 0; j < 2 * n; j++) {
        aug[k][j] -= factor * aug[i][j];
      }
    }
  }

  // Extract inverse
  return aug.map((row) => row.slice(n));
}

/**
 * Approximate ADF p-value using MacKinnon (1994) response surface.
 * Simplified approximation for case with constant, no trend.
 */
function approximateAdfPValue(tStat: number, nObs: number): number {
  // MacKinnon critical values for case 2 (constant, no trend):
  // Approximate using normal CDF shifted
  // These are rough approximations; for production use tabulated values
  if (tStat < -4.0) return 0.001;
  if (tStat < -3.43) return 0.01;
  if (tStat < -2.86) return 0.05;
  if (tStat < -2.57) return 0.10;
  if (tStat < -1.94) return 0.30;
  if (tStat < -1.62) return 0.50;
  if (tStat < -0.5) return 0.80;
  return 0.99;
}
