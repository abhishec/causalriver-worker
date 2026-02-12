/**
 * Temporal Forecaster
 *
 * LLM-level cognitive capability: the brain can trace causal paths and
 * estimate structural confidence, but cannot produce quantitative forecasts.
 * This module adds time-series forecasting with DAG-informed lag structure.
 *
 * Features:
 * - Exponential smoothing (Holt-Winters) for single-domain forecasting
 * - DAG-informed forecasting: upstream signals predict downstream values
 * - Ensemble prediction: combines structural (multi-hop) and statistical forecasts
 * - Probabilistic prediction intervals from residual distribution
 * - Backtesting harness for forecast validation
 * - Automatic horizon determination from causal lag structure
 *
 * @example
 * ```typescript
 * const forecaster = createTemporalForecaster();
 * const forecast = forecaster.forecast(timeSeries, dag, 'revenue', 14);
 * console.log(forecast.predictions[0]);
 * // { date: '2025-02-20', value: 0.72, lower95: 0.45, upper95: 0.99, method: 'ensemble' }
 * ```
 *
 * @packageDocumentation
 */

import type { CausalDAG } from './continuous-learner';
import type { DailyTimeSeries } from './signal-to-timeseries';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single forecast point
 */
export interface ForecastPoint {
  /** ISO date string */
  date: string;
  /** Predicted value */
  value: number;
  /** Lower bound of 95% prediction interval */
  lower95: number;
  /** Upper bound of 95% prediction interval */
  upper95: number;
  /** Lower bound of 68% prediction interval */
  lower68: number;
  /** Upper bound of 68% prediction interval */
  upper68: number;
  /** Which method produced this forecast */
  method: 'exponential_smoothing' | 'dag_informed' | 'autoregressive' | 'ensemble';
}

/**
 * Full forecast result for a domain
 */
export interface ForecastResult {
  /** Target domain being forecast */
  domain: string;
  /** Forecast horizon in days */
  horizonDays: number;
  /** Point forecasts with intervals */
  predictions: ForecastPoint[];
  /** Forecast accuracy metrics from backtesting (if available) */
  backtestMetrics?: BacktestMetrics;
  /** Upstream domains used in DAG-informed forecasting */
  upstreamDrivers: Array<{
    domain: string;
    weight: number;
    lagDays: number;
    contribution: number;
  }>;
  /** Overall forecast confidence (0-1) */
  confidence: number;
  /** Natural language summary */
  summary: string;
}

/**
 * Backtest validation metrics
 */
export interface BacktestMetrics {
  /** Mean Absolute Error */
  mae: number;
  /** Root Mean Squared Error */
  rmse: number;
  /** Mean Absolute Percentage Error */
  mape: number;
  /** Directional accuracy (% of days where predicted direction was correct) */
  directionalAccuracy: number;
  /** Coverage of 95% prediction intervals */
  intervalCoverage95: number;
  /** Number of backtest periods used */
  periodsEvaluated: number;
}

/**
 * Configuration for the temporal forecaster
 */
export interface TemporalForecasterConfig {
  /** Default forecast horizon in days (default: 14) */
  defaultHorizonDays: number;
  /** Smoothing alpha for level (default: 0.3) */
  smoothingAlpha: number;
  /** Smoothing beta for trend (default: 0.1) */
  smoothingBeta: number;
  /** Number of AR lags (default: 7) */
  arLags: number;
  /** Minimum data points for forecasting (default: 14) */
  minDataPoints: number;
  /** Backtest holdout fraction (default: 0.2) */
  backtestFraction: number;
  /** Weight for structural (DAG) forecast in ensemble (default: 0.4) */
  dagWeight: number;
  /** Weight for statistical forecast in ensemble (default: 0.6) */
  statisticalWeight: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a temporal forecaster.
 */
export function createTemporalForecaster(config: Partial<TemporalForecasterConfig> = {}) {
  const {
    defaultHorizonDays = 14,
    smoothingAlpha = 0.3,
    smoothingBeta = 0.1,
    arLags = 7,
    minDataPoints = 14,
    backtestFraction = 0.2,
    dagWeight = 0.4,
    statisticalWeight = 0.6,
  } = config;

  // ── Pre-processing: Outlier clipping + Regime detection + Seasonality ──

  /**
   * Clip outliers using 1.5× IQR fencing.
   * Replaces outliers with fence values to prevent model corruption.
   */
  function outlierClip(values: number[]): number[] {
    if (values.length < 4) return [...values];
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    return values.map(v => Math.max(lowerFence, Math.min(upperFence, v)));
  }

  /**
   * Detect regime changes using CUSUM (Cumulative Sum Control Chart).
   * Returns indices where regime shifts occurred.
   */
  function detectRegimeChange(values: number[]): { changePoints: number[]; regimeLabels: number[] } {
    if (values.length < 10) return { changePoints: [], regimeLabels: Array(values.length).fill(0) };

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    if (std < 1e-10) return { changePoints: [], regimeLabels: Array(values.length).fill(0) };

    const threshold = std * 2.5; // Sensitivity threshold
    const drift = std * 0.5;    // Allowable drift
    let cusumPos = 0;
    let cusumNeg = 0;
    const changePoints: number[] = [];

    for (let i = 1; i < values.length; i++) {
      const z = (values[i] - mean);
      cusumPos = Math.max(0, cusumPos + z - drift);
      cusumNeg = Math.max(0, cusumNeg - z - drift);

      if (cusumPos > threshold || cusumNeg > threshold) {
        changePoints.push(i);
        cusumPos = 0;
        cusumNeg = 0;
      }
    }

    // Assign regime labels
    const regimeLabels = Array(values.length).fill(0);
    let regime = 0;
    let cpIdx = 0;
    for (let i = 0; i < values.length; i++) {
      if (cpIdx < changePoints.length && i >= changePoints[cpIdx]) {
        regime++;
        cpIdx++;
      }
      regimeLabels[i] = regime;
    }

    return { changePoints, regimeLabels };
  }

  /**
   * Classical seasonal decomposition (additive).
   * Extracts trend + seasonal + residual components.
   */
  function seasonalDecompose(
    values: number[],
    period: number = 7, // Default: weekly seasonality
  ): { trend: number[]; seasonal: number[]; residual: number[] } {
    if (values.length < period * 2) {
      return {
        trend: [...values],
        seasonal: Array(values.length).fill(0),
        residual: Array(values.length).fill(0),
      };
    }

    // 1. Moving average for trend
    const trend = Array(values.length).fill(0);
    const halfWindow = Math.floor(period / 2);
    for (let i = halfWindow; i < values.length - halfWindow; i++) {
      let sum = 0;
      for (let j = -halfWindow; j <= halfWindow; j++) {
        sum += values[i + j];
      }
      trend[i] = sum / (2 * halfWindow + 1);
    }
    // Extend edges
    for (let i = 0; i < halfWindow; i++) trend[i] = trend[halfWindow];
    for (let i = values.length - halfWindow; i < values.length; i++) trend[i] = trend[values.length - halfWindow - 1];

    // 2. Detrended values
    const detrended = values.map((v, i) => v - trend[i]);

    // 3. Average seasonal component per position
    const seasonalAvg = Array(period).fill(0);
    const seasonalCount = Array(period).fill(0);
    for (let i = 0; i < detrended.length; i++) {
      seasonalAvg[i % period] += detrended[i];
      seasonalCount[i % period]++;
    }
    for (let i = 0; i < period; i++) {
      seasonalAvg[i] /= Math.max(1, seasonalCount[i]);
    }

    // 4. Normalize seasonal to zero-mean
    const seasonalMean = seasonalAvg.reduce((s, v) => s + v, 0) / period;
    const seasonal = values.map((_, i) => seasonalAvg[i % period] - seasonalMean);

    // 5. Residual
    const residual = values.map((v, i) => v - trend[i] - seasonal[i]);

    return { trend, seasonal, residual };
  }

  // ── Exponential Smoothing (Holt's linear trend) ──────────────────

  /**
   * Holt's double exponential smoothing.
   * Produces level + trend decomposition, then extrapolates.
   */
  function exponentialSmoothing(
    values: number[],
    horizonDays: number,
  ): { forecasts: number[]; level: number; trend: number; residuals: number[] } {
    if (values.length < 2) {
      const last = values[0] ?? 0;
      return {
        forecasts: Array(horizonDays).fill(last),
        level: last,
        trend: 0,
        residuals: [],
      };
    }

    // Initialize
    let level = values[0];
    let trend = values[1] - values[0];
    const residuals: number[] = [];

    // Fit
    for (let t = 1; t < values.length; t++) {
      const prevLevel = level;
      level = smoothingAlpha * values[t] + (1 - smoothingAlpha) * (prevLevel + trend);
      trend = smoothingBeta * (level - prevLevel) + (1 - smoothingBeta) * trend;
      const fitted = prevLevel + trend;
      residuals.push(values[t] - fitted);
    }

    // Forecast
    const forecasts: number[] = [];
    for (let h = 1; h <= horizonDays; h++) {
      forecasts.push(level + h * trend);
    }

    return { forecasts, level, trend, residuals };
  }

  // ── Autoregressive model (AR(p)) ────────────────────────────────

  /**
   * Simple AR model using OLS on lagged values.
   */
  function autoregressive(
    values: number[],
    horizonDays: number,
    lags: number = arLags,
  ): { forecasts: number[]; residuals: number[]; coefficients: number[] } {
    const p = Math.min(lags, Math.floor(values.length / 3));
    if (p < 1 || values.length < p + 2) {
      return {
        forecasts: Array(horizonDays).fill(values[values.length - 1] ?? 0),
        residuals: [],
        coefficients: [],
      };
    }

    // Build design matrix X and response y
    const n = values.length - p;
    const X: number[][] = [];
    const y: number[] = [];

    for (let i = p; i < values.length; i++) {
      const row: number[] = [1]; // intercept
      for (let j = 1; j <= p; j++) {
        row.push(values[i - j]);
      }
      X.push(row);
      y.push(values[i]);
    }

    // OLS: β = (X'X)^-1 X'y  — using simplified normal equations
    const dim = p + 1;
    const XtX: number[][] = Array.from({ length: dim }, () => Array(dim).fill(0));
    const Xty: number[] = Array(dim).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < dim; j++) {
        for (let k = 0; k < dim; k++) {
          XtX[j][k] += X[i][j] * X[i][k];
        }
        Xty[j] += X[i][j] * y[i];
      }
    }

    // Add small ridge penalty for stability
    for (let j = 0; j < dim; j++) {
      XtX[j][j] += 0.01;
    }

    // Solve via Gauss elimination
    const coefficients = solveLinearSystem(XtX, Xty);

    // Compute residuals
    const residuals: number[] = [];
    for (let i = 0; i < n; i++) {
      let predicted = 0;
      for (let j = 0; j < dim; j++) {
        predicted += coefficients[j] * X[i][j];
      }
      residuals.push(y[i] - predicted);
    }

    // Forecast
    const forecasts: number[] = [];
    const buffer = [...values.slice(-p)];

    for (let h = 0; h < horizonDays; h++) {
      let pred = coefficients[0]; // intercept
      for (let j = 1; j <= p; j++) {
        pred += coefficients[j] * buffer[buffer.length - j];
      }
      forecasts.push(pred);
      buffer.push(pred);
    }

    return { forecasts, residuals, coefficients };
  }

  /**
   * Gauss elimination for small linear systems.
   */
  function solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = b.length;
    const aug = A.map((row, i) => [...row, b[i]]);

    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Partial pivoting
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
      }
      [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

      if (Math.abs(aug[i][i]) < 1e-10) continue;

      for (let k = i + 1; k < n; k++) {
        const factor = aug[k][i] / aug[i][i];
        for (let j = i; j <= n; j++) {
          aug[k][j] -= factor * aug[i][j];
        }
      }
    }

    // Back substitution
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      if (Math.abs(aug[i][i]) < 1e-10) continue;
      x[i] = aug[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= aug[i][j] * x[j];
      }
      x[i] /= aug[i][i];
    }

    return x;
  }

  // ── DAG-informed forecasting ─────────────────────────────────────

  /**
   * Use upstream causal parents to forecast a domain.
   * Each parent's recent values predict the target with the known lag.
   */
  function dagInformedForecast(
    targetDomain: string,
    allSeries: Map<string, DailyTimeSeries>,
    dag: CausalDAG,
    horizonDays: number,
  ): {
    forecasts: number[];
    drivers: ForecastResult['upstreamDrivers'];
  } {
    // Find upstream parents (domains with edges pointing TO targetDomain)
    const parents: Array<{ domain: string; weight: number; lagDays: number }> = [];
    for (const [src, neighbors] of dag.edges) {
      const edge = neighbors.get(targetDomain);
      if (edge) {
        parents.push({ domain: src, weight: edge.weight, lagDays: edge.lagDays });
      }
    }

    if (parents.length === 0) {
      return { forecasts: Array(horizonDays).fill(0), drivers: [] };
    }

    // Weighted combination of upstream signals with lag offset
    const targetSeries = allSeries.get(targetDomain);
    const forecasts = Array(horizonDays).fill(0);
    let totalWeight = 0;
    const drivers: ForecastResult['upstreamDrivers'] = [];

    for (const parent of parents) {
      const parentSeries = allSeries.get(parent.domain);
      if (!parentSeries || parentSeries.values.length < 3) continue;

      // Use recent parent values to predict target
      // Parent values at time (now - lag) predict target at time (now)
      // So parent values at time (now) predict target at time (now + lag)
      const parentRecent = parentSeries.values.slice(-horizonDays);
      const contribution = parent.weight;

      for (let h = 0; h < horizonDays; h++) {
        // Parent value at h predicts target at h + lag
        // For forecasting next `horizonDays`, use available parent data
        const parentIdx = Math.min(h, parentRecent.length - 1);
        const parentVal = parentRecent[parentIdx] ?? 0;

        // Weight by causal strength, attenuated by lag difference
        const lagFit = h < parent.lagDays ? 1.0 : Math.exp(-(h - parent.lagDays) / parent.lagDays);
        forecasts[h] += parentVal * contribution * lagFit;
      }

      totalWeight += contribution;
      drivers.push({
        domain: parent.domain,
        weight: parent.weight,
        lagDays: parent.lagDays,
        contribution,
      });
    }

    // Normalize by total weight
    if (totalWeight > 0) {
      for (let h = 0; h < horizonDays; h++) {
        forecasts[h] /= totalWeight;
      }
    }

    // Blend with target's own mean (DAG alone may not capture baseline)
    if (targetSeries && targetSeries.values.length > 0) {
      const targetMean = targetSeries.values.reduce((s, v) => s + v, 0) / targetSeries.values.length;
      for (let h = 0; h < horizonDays; h++) {
        forecasts[h] = forecasts[h] * 0.6 + targetMean * 0.4; // Anchor to historical mean
      }
    }

    return { forecasts, drivers };
  }

  // ── Prediction intervals ─────────────────────────────────────────

  /**
   * Compute prediction intervals from residuals.
   */
  function computeIntervals(
    forecasts: number[],
    residuals: number[],
    horizonDays: number,
  ): Array<{ lower95: number; upper95: number; lower68: number; upper68: number }> {
    // Compute residual standard deviation
    const n = residuals.length;
    if (n < 3) {
      // Fallback: 20% of absolute forecast value
      return forecasts.map(f => ({
        lower95: f - Math.abs(f) * 0.4,
        upper95: f + Math.abs(f) * 0.4,
        lower68: f - Math.abs(f) * 0.2,
        upper68: f + Math.abs(f) * 0.2,
      }));
    }

    const mean = residuals.reduce((s, r) => s + r, 0) / n;
    const variance = residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
    const std = Math.sqrt(variance);

    return forecasts.map((f, h) => {
      // Widen intervals as horizon increases (uncertainty grows with √h)
      const horizonScale = Math.sqrt(1 + h / horizonDays);
      const adjStd = std * horizonScale;

      return {
        lower95: f - 1.96 * adjStd,
        upper95: f + 1.96 * adjStd,
        lower68: f - 1.0 * adjStd,
        upper68: f + 1.0 * adjStd,
      };
    });
  }

  // ── Backtesting ──────────────────────────────────────────────────

  /**
   * Backtest a forecasting method on historical data.
   */
  function backtest(
    values: number[],
    forecastFn: (vals: number[], horizon: number) => number[],
    horizonDays: number,
  ): BacktestMetrics {
    const holdout = Math.max(horizonDays, Math.floor(values.length * backtestFraction));
    const trainEnd = values.length - holdout;

    if (trainEnd < minDataPoints) {
      return {
        mae: Infinity, rmse: Infinity, mape: Infinity,
        directionalAccuracy: 0, intervalCoverage95: 0, periodsEvaluated: 0,
      };
    }

    const trainData = values.slice(0, trainEnd);
    const testData = values.slice(trainEnd);
    const forecasts = forecastFn(trainData, testData.length);

    const periods = Math.min(forecasts.length, testData.length);
    let sumAE = 0, sumSE = 0, sumAPE = 0;
    let directionCorrect = 0;

    for (let i = 0; i < periods; i++) {
      const error = testData[i] - forecasts[i];
      sumAE += Math.abs(error);
      sumSE += error ** 2;
      if (Math.abs(testData[i]) > 1e-6) {
        sumAPE += Math.abs(error / testData[i]);
      }

      // Directional accuracy: did we predict the right direction of change?
      if (i > 0) {
        const actualDir = testData[i] - testData[i - 1];
        const predDir = forecasts[i] - forecasts[i - 1];
        if (actualDir * predDir >= 0) directionCorrect++;
      }
    }

    return {
      mae: sumAE / periods,
      rmse: Math.sqrt(sumSE / periods),
      mape: sumAPE / periods,
      directionalAccuracy: periods > 1 ? directionCorrect / (periods - 1) : 0,
      intervalCoverage95: 0, // Computed separately if intervals available
      periodsEvaluated: periods,
    };
  }

  // ── Adaptive Ensemble Weighting ────────────────────────────────────

  /**
   * Softmax function for converting scores to weights.
   * Temperature controls sharpness: lower = more peaked on best method.
   */
  function softmax(scores: number[], temperature: number = 1.0): number[] {
    const maxScore = Math.max(...scores);
    const exps = scores.map(s => Math.exp((s - maxScore) / temperature));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / (sumExp || 1));
  }

  /**
   * K-Nearest Neighbors forecaster — simple nonlinear model.
   * Uses lag features to find similar historical patterns and average their outcomes.
   */
  function knnForecast(
    values: number[],
    horizonDays: number,
    k: number = 5,
    patternLength: number = 7,
  ): number[] {
    if (values.length < patternLength + horizonDays + k) {
      // Fallback: return last value repeated
      const lastVal = values[values.length - 1] ?? 0;
      return Array(horizonDays).fill(lastVal);
    }

    // Build the query pattern (most recent patternLength values)
    const query = values.slice(-patternLength);
    const queryMean = query.reduce((s, v) => s + v, 0) / query.length;
    const queryNorm = query.map(v => v - queryMean);

    // Find k nearest historical patterns using normalized euclidean distance
    const candidates: Array<{ startIdx: number; distance: number }> = [];
    const maxStart = values.length - patternLength - horizonDays;

    for (let i = 0; i < maxStart; i++) {
      const pattern = values.slice(i, i + patternLength);
      const patternMean = pattern.reduce((s, v) => s + v, 0) / pattern.length;
      const patternNorm = pattern.map(v => v - patternMean);

      let dist = 0;
      for (let j = 0; j < patternLength; j++) {
        dist += (queryNorm[j] - patternNorm[j]) ** 2;
      }
      candidates.push({ startIdx: i, distance: Math.sqrt(dist) });
    }

    // Select top-k nearest neighbors
    candidates.sort((a, b) => a.distance - b.distance);
    const neighbors = candidates.slice(0, Math.min(k, candidates.length));

    if (neighbors.length === 0) {
      const lastVal = values[values.length - 1] ?? 0;
      return Array(horizonDays).fill(lastVal);
    }

    // Average the outcomes of nearest neighbors (adjusted for level shift)
    const forecasts: number[] = [];
    for (let h = 0; h < horizonDays; h++) {
      let sum = 0;
      let wSum = 0;
      for (const { startIdx, distance } of neighbors) {
        const futureIdx = startIdx + patternLength + h;
        if (futureIdx < values.length) {
          // Inverse distance weighting
          const w = 1 / (distance + 0.001);
          // Level-adjust: shift the neighbor's future by the level difference
          const neighborPattern = values.slice(startIdx, startIdx + patternLength);
          const neighborMean = neighborPattern.reduce((s, v) => s + v, 0) / neighborPattern.length;
          const levelShift = queryMean - neighborMean;
          sum += (values[futureIdx] + levelShift) * w;
          wSum += w;
        }
      }
      forecasts.push(wSum > 0 ? sum / wSum : (values[values.length - 1] ?? 0));
    }

    return forecasts;
  }

  /**
   * Compute adaptive ensemble weights from per-method backtesting.
   * Returns weights that sum to 1.0, favoring methods with lower RMSE.
   */
  function computeAdaptiveWeights(
    values: number[],
    horizonDays: number,
  ): { esWeight: number; arWeight: number; knnWeight: number; dagWeight: number } {
    const btHorizon = Math.min(horizonDays, Math.floor(values.length * backtestFraction));

    if (values.length < minDataPoints + btHorizon) {
      // Not enough data to backtest — use defaults
      return { esWeight: 0.25, arWeight: 0.25, knnWeight: 0.1, dagWeight: 0.4 };
    }

    // Backtest each method
    const esRmse = backtest(values, (v, h) => exponentialSmoothing(v, h).forecasts, btHorizon).rmse;
    const arRmse = backtest(values, (v, h) => autoregressive(v, h).forecasts, btHorizon).rmse;
    const knnRmse = backtest(values, (v, h) => knnForecast(v, h), btHorizon).rmse;

    // Convert RMSE to weights via softmax of inverse RMSE
    // (lower RMSE = higher inverse = higher weight)
    const inverseRmses = [
      1 / (esRmse + 0.001),
      1 / (arRmse + 0.001),
      1 / (knnRmse + 0.001),
    ];

    const statWeights = softmax(inverseRmses, 1.0);

    // DAG weight is separate — it's structural, not statistical.
    // Scale statistical weights to leave room for DAG.
    const dagW = dagWeight; // from config
    const statScale = 1 - dagW;

    return {
      esWeight: statWeights[0] * statScale,
      arWeight: statWeights[1] * statScale,
      knnWeight: statWeights[2] * statScale,
      dagWeight: dagW,
    };
  }

  /**
   * Quantile regression via weighted residual sorting.
   * Estimates prediction intervals without assuming Gaussian residuals.
   */
  function quantileIntervals(
    forecasts: number[],
    residuals: number[],
    horizonDays: number,
  ): Array<{ lower95: number; upper95: number; lower68: number; upper68: number }> {
    if (residuals.length < 5) {
      return forecasts.map(v => ({
        lower95: v * 0.5, upper95: v * 1.5,
        lower68: v * 0.75, upper68: v * 1.25,
      }));
    }

    const sortedRes = [...residuals].sort((a, b) => a - b);
    const n = sortedRes.length;

    // Empirical quantiles of residuals
    const q025 = sortedRes[Math.floor(n * 0.025)];
    const q975 = sortedRes[Math.floor(n * 0.975)];
    const q16 = sortedRes[Math.floor(n * 0.16)];
    const q84 = sortedRes[Math.floor(n * 0.84)];

    return forecasts.map((val, i) => {
      // Widen intervals with horizon (uncertainty grows with forecast distance)
      const horizonMult = 1 + 0.05 * Math.min(i, 30);
      return {
        lower95: Math.round((val + q025 * horizonMult) * 1000) / 1000,
        upper95: Math.round((val + q975 * horizonMult) * 1000) / 1000,
        lower68: Math.round((val + q16 * horizonMult) * 1000) / 1000,
        upper68: Math.round((val + q84 * horizonMult) * 1000) / 1000,
      };
    });
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    /**
     * Forecast a domain's future values using ensemble of methods.
     */
    forecast(
      allSeries: Map<string, DailyTimeSeries>,
      dag: CausalDAG,
      targetDomain: string,
      horizonDays: number = defaultHorizonDays,
    ): ForecastResult {
      const series = allSeries.get(targetDomain);
      const values = series?.values ?? [];

      if (values.length < minDataPoints) {
        return {
          domain: targetDomain,
          horizonDays,
          predictions: [],
          upstreamDrivers: [],
          confidence: 0,
          summary: `Insufficient data for ${targetDomain} — need at least ${minDataPoints} data points (have ${values.length}).`,
        };
      }

      // Pre-processing: clip outliers, detect regime changes, decompose seasonality
      const clippedValues = outlierClip(values);
      const regime = detectRegimeChange(clippedValues);
      const lastChangePoint = regime.changePoints.length > 0
        ? regime.changePoints[regime.changePoints.length - 1]
        : 0;
      // Use only post-regime-change data for fitting (minimum 14 points)
      const fitValues = lastChangePoint > 0 && clippedValues.length - lastChangePoint >= minDataPoints
        ? clippedValues.slice(lastChangePoint)
        : clippedValues;

      // Seasonal decomposition (7-day weekly cycle)
      const decomp = seasonalDecompose(fitValues, 7);
      const deseasonalizedValues = fitValues.map((_, i) => decomp.trend[i] + decomp.residual[i]);

      // 1. Exponential smoothing on deseasonalized data
      const es = exponentialSmoothing(deseasonalizedValues, horizonDays);

      // 2. Autoregressive model on deseasonalized data
      const ar = autoregressive(deseasonalizedValues, horizonDays);

      // Re-add seasonal component to forecasts
      for (let h = 0; h < horizonDays; h++) {
        const seasonalIdx = (fitValues.length + h) % 7;
        const seasonalAdj = decomp.seasonal.length > seasonalIdx ? decomp.seasonal[seasonalIdx] : 0;
        es.forecasts[h] += seasonalAdj;
        ar.forecasts[h] += seasonalAdj;
      }

      // 3. KNN nonlinear forecast on deseasonalized data
      const knnRaw = knnForecast(deseasonalizedValues, horizonDays);
      // Re-add seasonal component to KNN forecasts
      for (let h = 0; h < horizonDays; h++) {
        const seasonalIdx = (fitValues.length + h) % 7;
        const seasonalAdj = decomp.seasonal.length > seasonalIdx ? decomp.seasonal[seasonalIdx] : 0;
        knnRaw[h] += seasonalAdj;
      }

      // 4. DAG-informed forecast
      const dagFc = dagInformedForecast(targetDomain, allSeries, dag, horizonDays);

      // 5. Adaptive ensemble weighting — weights learned from per-method backtesting
      const adaptiveWeights = computeAdaptiveWeights(fitValues, horizonDays);
      const hasDagForecasts = dagFc.drivers.length > 0;

      const ensembleForecasts = es.forecasts.map((esVal, i) => {
        const arVal = ar.forecasts[i] ?? esVal;
        const knnVal = knnRaw[i] ?? esVal;

        if (!hasDagForecasts) {
          // No DAG data — redistribute DAG weight proportionally to statistical methods
          const totalStatW = adaptiveWeights.esWeight + adaptiveWeights.arWeight + adaptiveWeights.knnWeight + adaptiveWeights.dagWeight;
          return (esVal * adaptiveWeights.esWeight + arVal * adaptiveWeights.arWeight + knnVal * adaptiveWeights.knnWeight +
                  ((esVal + arVal + knnVal) / 3) * adaptiveWeights.dagWeight) / totalStatW;
        }

        const dagVal = dagFc.forecasts[i] ?? esVal;
        return esVal * adaptiveWeights.esWeight +
               arVal * adaptiveWeights.arWeight +
               knnVal * adaptiveWeights.knnWeight +
               dagVal * adaptiveWeights.dagWeight;
      });

      // 6. Compute prediction intervals using quantile regression (distribution-free)
      const allResiduals = [...es.residuals, ...ar.residuals];
      const intervals = quantileIntervals(ensembleForecasts, allResiduals, horizonDays);

      // 7. Build date sequence
      const lastDate = series?.dates?.[series.dates.length - 1];
      const baseDate = lastDate ? new Date(lastDate) : new Date();

      const predictions: ForecastPoint[] = ensembleForecasts.map((value, i) => {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + i + 1);
        return {
          date: date.toISOString().split('T')[0],
          value: Math.round(value * 1000) / 1000,
          lower95: Math.round(intervals[i].lower95 * 1000) / 1000,
          upper95: Math.round(intervals[i].upper95 * 1000) / 1000,
          lower68: Math.round(intervals[i].lower68 * 1000) / 1000,
          upper68: Math.round(intervals[i].upper68 * 1000) / 1000,
          method: hasDagForecasts ? 'ensemble' : 'autoregressive',
        };
      });

      // 8. Backtest for confidence estimation
      const btMetrics = backtest(values, (v, h) => {
        const esResult = exponentialSmoothing(v, h);
        const arResult = autoregressive(v, h);
        return esResult.forecasts.map((e, j) => (e + (arResult.forecasts[j] ?? e)) / 2);
      }, Math.min(horizonDays, Math.floor(values.length * backtestFraction)));

      // 9. Confidence from backtest quality
      const confidence = btMetrics.periodsEvaluated > 0
        ? Math.max(0, Math.min(1, 1 - btMetrics.mape)) * (hasDagForecasts ? 1.1 : 1.0)
        : 0.3;

      // 10. Summary
      const trendDir = es.trend > 0.01 ? 'upward' : (es.trend < -0.01 ? 'downward' : 'stable');
      const summaryParts = [
        `${targetDomain} forecast: ${trendDir} trend over next ${horizonDays} days.`,
      ];
      if (hasDagForecasts) {
        summaryParts.push(
          `DAG-informed by ${dagFc.drivers.length} upstream driver(s): ${dagFc.drivers.map(d => d.domain).join(', ')}.`
        );
      }
      if (btMetrics.periodsEvaluated > 0) {
        summaryParts.push(
          `Backtest: MAE=${btMetrics.mae.toFixed(3)}, directional accuracy=${(btMetrics.directionalAccuracy * 100).toFixed(0)}%.`
        );
      }

      return {
        domain: targetDomain,
        horizonDays,
        predictions,
        backtestMetrics: btMetrics.periodsEvaluated > 0 ? btMetrics : undefined,
        upstreamDrivers: dagFc.drivers,
        confidence: Math.min(1, Math.round(confidence * 100) / 100),
        summary: summaryParts.join(' '),
      };
    },

    /**
     * Forecast all domains in the DAG.
     */
    forecastAll(
      allSeries: Map<string, DailyTimeSeries>,
      dag: CausalDAG,
      horizonDays: number = defaultHorizonDays,
    ): Map<string, ForecastResult> {
      const results = new Map<string, ForecastResult>();
      for (const domain of dag.nodes) {
        results.set(domain, this.forecast(allSeries, dag, domain, horizonDays));
      }
      return results;
    },

    /**
     * Backtest the forecasting method on a specific domain.
     */
    backtest(
      values: number[],
      horizonDays: number = defaultHorizonDays,
    ): BacktestMetrics {
      return backtest(values, (v, h) => {
        const esResult = exponentialSmoothing(v, h);
        const arResult = autoregressive(v, h);
        return esResult.forecasts.map((e, j) => (e + (arResult.forecasts[j] ?? e)) / 2);
      }, horizonDays);
    },

    /**
     * Get optimal forecast horizon from DAG lag structure.
     * Returns the maximum lag across all edges touching the domain.
     */
    getOptimalHorizon(dag: CausalDAG, targetDomain: string): number {
      let maxLag = defaultHorizonDays;
      for (const [, neighbors] of dag.edges) {
        const edge = neighbors.get(targetDomain);
        if (edge) {
          maxLag = Math.max(maxLag, edge.lagDays * 2); // 2x lag for full cascade
        }
      }
      return Math.min(90, maxLag); // Cap at 90 days
    },

    /**
     * Detect regime changes in a time series using CUSUM.
     */
    detectRegimeChange(values: number[]): { changePoints: number[]; regimeLabels: number[] } {
      return detectRegimeChange(values);
    },

    /**
     * Decompose a time series into trend + seasonal + residual.
     */
    seasonalDecompose(values: number[], period?: number) {
      return seasonalDecompose(values, period);
    },

    /**
     * Clip outliers using IQR fencing.
     */
    outlierClip(values: number[]): number[] {
      return outlierClip(values);
    },

    /**
     * Compute adaptive ensemble weights for a time series.
     * Uses per-method backtesting with softmax weighting.
     */
    computeAdaptiveWeights(values: number[], horizonDays?: number) {
      return computeAdaptiveWeights(values, horizonDays ?? defaultHorizonDays);
    },

    /**
     * KNN nonlinear forecast — pattern-matching based prediction.
     */
    knnForecast(values: number[], horizonDays: number, k?: number) {
      return knnForecast(values, horizonDays, k);
    },

    /**
     * Get configuration.
     */
    getConfig(): TemporalForecasterConfig {
      return {
        defaultHorizonDays, smoothingAlpha, smoothingBeta, arLags,
        minDataPoints, backtestFraction, dagWeight, statisticalWeight,
      };
    },
  };
}
