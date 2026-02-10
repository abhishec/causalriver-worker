/**
 * Advanced Causal Discovery Methods
 *
 * Ported from the CausalRivers benchmark (scripts/benchmarks/causalrivers/nexusbrain_granger.py)
 * where these techniques achieved strong AUROC scores against the VAR baseline.
 *
 * Methods included:
 * 1. Cascade-Aware Scoring — penalizes indirect/mediated paths
 * 2. Calibrated Ensemble — weighted voting across multiple methods
 * 3. Greedy Causal Peeling — iterative graph refinement via OMP
 * 4. Multi-Resolution Temporal Pyramids — multi-scale Granger fusion
 * 5. Anomaly-Conditioned Scoring — causal effects strongest during extremes
 * 6. Regime-Conditional Scoring — separate VAR for normal vs anomaly periods
 * 7. NexusBrain Final — self-tuning VAR + cascade + p-value + asymmetry
 * 8. runAdvancedDiscovery — unified dispatcher (default: calibrated_ensemble)
 *
 * All methods return PairwiseScoreMatrix with scores[i][j] = evidence that j causes i.
 */

import {
  testAllPairs,
  selectOptimalLag,
  computeConditionalGranger,
  testAllPairsConditional,
  ordinaryLeastSquares,
  type GrangerResult,
  type GrangerTestConfig,
} from './granger-causality';

import { fTestPValue } from './statistical-tests';
import { counterfactualKnockout } from './counterfactual-knockout';

import {
  normalizeScores,
  computeAgreementBonus,
  computeOlsRSS,
  zeroMatrix,
  zeroDiagonal,
  applyBonus,
} from './multivariate-var';

// ============================================================================
// TYPES
// ============================================================================

export type AdvancedDiscoveryMethod =
  | 'pairwise'
  | 'conditional'
  | 'cascade_aware'
  | 'calibrated_ensemble'
  | 'greedy_peeling'
  | 'multi_resolution'
  | 'anomaly_conditioned'
  | 'regime_conditional'
  | 'nexusbrain_final'
  | 'apex';

export interface AdvancedDiscoveryConfig {
  method: AdvancedDiscoveryMethod;
  maxLag: number;
  lagSelectionCriterion: 'AIC' | 'BIC' | 'HQ';
  alpha: number;
  // Cascade-aware scoring
  cascadeLagTolerance: number;
  cascadeIndirectPenalty: number;
  // Calibrated ensemble weights
  ensembleWeights: {
    conditional: number;
    cascade: number;
    pairwise: number;
    pvalue: number;
  };
  // Greedy peeling
  peelingIterations: number;
  peelingPruneThreshold: number;
  // Multi-resolution
  downsampleFactors: number[];
  includeDifferenced: boolean;
  // Anomaly-conditioned
  anomalyZThreshold: number;
  anomalyWeight: number;
  // Regime-conditional
  regimeAnomalyAlpha: number;
  // NexusBrain Final
  useSigned: 'auto' | 'signed' | 'absolute';
  // Apex method (CausalRivers-proven: VAR + F-test + CF knockout + sign prior)
  apexFTestWeight: number;
  apexCfShuffles: number;
  apexCfPenalty: number;
  apexCfBoost: number;
  apexCfMinorBoost: number;
  apexSignPriorPositive: number;
  apexSignPriorNegative: number;
  apexSignPriorMode: 'positive' | 'negative' | 'none';
}

export interface PairwiseScoreMatrix {
  domains: string[];
  scores: number[][];
  optimalLags: number[][];
  pValues: number[][];
  // Confounder detection metadata (populated by apex method)
  knockoutScores?: number[][];
  confounderFlags?: boolean[][];
  signMatrix?: number[][];
}

export const DEFAULT_ADVANCED_CONFIG: AdvancedDiscoveryConfig = {
  method: 'apex',
  maxLag: 14,
  lagSelectionCriterion: 'AIC',
  alpha: 0.05,
  cascadeLagTolerance: 0.3,
  cascadeIndirectPenalty: 0.3,
  ensembleWeights: { conditional: 3.0, cascade: 1.5, pairwise: 1.0, pvalue: 0.8 },
  peelingIterations: 3,
  peelingPruneThreshold: 0.01,
  downsampleFactors: [4, 28],
  includeDifferenced: true,
  anomalyZThreshold: 2.0,
  anomalyWeight: 0.7,
  regimeAnomalyAlpha: 0.6,
  useSigned: 'auto',
  apexFTestWeight: 0.01,
  apexCfShuffles: 5,
  apexCfPenalty: 0.85,
  apexCfBoost: 1.08,
  apexCfMinorBoost: 1.05,
  apexSignPriorPositive: 1.04,
  apexSignPriorNegative: 0.96,
  apexSignPriorMode: 'positive',
};

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function toArrays(data: Record<string, number[]>): { domains: string[]; values: number[][] } {
  const domains = Object.keys(data);
  const values = domains.map(d => data[d]);
  return { domains, values };
}

function pairwiseScoresMatrix(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig>,
  scoring: 'effect_size' | 'neg_log_pvalue' = 'effect_size'
): { domains: string[]; scores: number[][]; lags: number[][]; pvals: number[][] } {
  const { domains, values } = toArrays(data);
  const n = domains.length;
  const scores = zeroMatrix(n);
  const lags = zeroMatrix(n);
  const pvals: number[][] = Array.from({ length: n }, () => Array(n).fill(1));
  const maxLag = config.maxLag ?? 14;
  const criterion = config.lagSelectionCriterion ?? 'AIC';

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const y = values[i];
      const x = values[j];
      if (std(x) < 1e-10 || std(y) < 1e-10) continue;
      if (hasNaN(x) || hasNaN(y)) continue;

      try {
        const optLag = selectOptimalLag(x, y, maxLag, criterion);
        const result = grangerFTest(x, y, optLag);
        lags[i][j] = optLag;
        pvals[i][j] = result.pValue;

        if (scoring === 'neg_log_pvalue') {
          scores[i][j] = -Math.log10(Math.max(result.pValue, 1e-300));
        } else {
          scores[i][j] = result.effectSize;
        }
      } catch {
        scores[i][j] = 0;
      }
    }
  }

  return { domains, scores, lags, pvals };
}

function conditionalScoresMatrix(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig>
): number[][] {
  const { domains, values } = toArrays(data);
  const n = domains.length;
  const scores = zeroMatrix(n);
  const maxLag = config.maxLag ?? 14;
  const criterion = config.lagSelectionCriterion ?? 'AIC';

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (std(values[j]) < 1e-10 || std(values[i]) < 1e-10) continue;
      if (hasNaN(values[j]) || hasNaN(values[i])) continue;

      try {
        const optLag = selectOptimalLag(values[j], values[i], maxLag, criterion);
        const result = computeConditionalGranger(j, i, values, optLag, {
          alpha: config.alpha ?? 0.05,
          lagSelectionCriterion: criterion,
        });
        scores[i][j] = result.effectSize;
      } catch {
        scores[i][j] = 0;
      }
    }
  }

  return scores;
}

/** Inline F-test (mirrors Python granger_f_test) */
function grangerFTest(x: number[], y: number[], lag: number): { fStatistic: number; pValue: number; effectSize: number } {
  const T = y.length;
  const nObs = T - lag;

  // Restricted: Y on own lags
  const Xr: number[][] = [];
  for (let t = lag; t < T; t++) {
    const row: number[] = [1];
    for (let l = 1; l <= lag; l++) row.push(y[t - l]);
    Xr.push(row);
  }
  // Unrestricted: Y on Y lags + X lags
  const Xu: number[][] = [];
  for (let t = lag; t < T; t++) {
    const row: number[] = [1];
    for (let l = 1; l <= lag; l++) row.push(y[t - l]);
    for (let l = 1; l <= lag; l++) row.push(x[t - l]);
    Xu.push(row);
  }
  const yVec = y.slice(lag);
  const rssR = computeOlsRSS(Xr, yVec);
  const rssU = computeOlsRSS(Xu, yVec);

  const dfDen = nObs - 2 * lag - 1;
  if (dfDen <= 0 || rssU <= 0 || rssR <= 0) {
    return { fStatistic: 0, pValue: 1, effectSize: 0 };
  }

  const fStat = Math.max(0, ((rssR - rssU) / lag) / (rssU / dfDen));
  const pValue = fTestPValue(fStat, lag, dfDen);
  const effectSize = Math.max(0, Math.min(1, (rssR - rssU) / rssR));

  return { fStatistic: fStat, pValue, effectSize };
}

function std(arr: number[]): number {
  const n = arr.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  const mean = sum / n;
  let v = 0;
  for (const x of arr) v += (x - mean) * (x - mean);
  return Math.sqrt(v / n);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function hasNaN(arr: number[]): boolean {
  for (const v of arr) if (isNaN(v)) return true;
  return false;
}

function downsample(values: number[], factor: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i += factor) {
    let sum = 0;
    let count = 0;
    for (let j = i; j < Math.min(i + factor, values.length); j++) {
      sum += values[j];
      count++;
    }
    result.push(sum / count);
  }
  return result;
}

function difference(values: number[]): number[] {
  const result: number[] = [];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] - values[i - 1]);
  }
  return result;
}

// ============================================================================
// METHOD 1: CASCADE-AWARE SCORING
// ============================================================================

/**
 * Cascade-aware causal scoring with confound detection.
 *
 * For every significant edge A→B, checks if a mediator C exists
 * where A→C and C→B are both significant AND lag(A→B) ≈ lag(A→C) + lag(C→B).
 * If so, A→B is likely indirect — downweight it.
 */
export function cascadeAwareScoring(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig> = {}
): PairwiseScoreMatrix {
  const fullConfig = { ...DEFAULT_ADVANCED_CONFIG, ...config };
  const { domains, scores, lags, pvals } = pairwiseScoresMatrix(data, fullConfig);
  const n = domains.length;

  if (n < 2) return { domains, scores, optimalLags: lags, pValues: pvals };

  // Apply cascade penalty
  const penalized = scores.map(row => [...row]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j || pvals[i][j] > 0.05) continue;

      const lagJI = lags[i][j];
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        if (pvals[k][j] > 0.1 || pvals[i][k] > 0.1) continue;

        const expectedLag = lags[k][j] + lags[i][k];
        if (expectedLag > 0 && Math.abs(lagJI - expectedLag) / expectedLag <= fullConfig.cascadeLagTolerance) {
          penalized[i][j] *= fullConfig.cascadeIndirectPenalty;
          break; // One mediator is enough
        }
      }
    }
  }

  return { domains, scores: penalized, optimalLags: lags, pValues: pvals };
}

// ============================================================================
// METHOD 2: CALIBRATED ENSEMBLE
// ============================================================================

/**
 * Calibrated ensemble: run multiple methods and weight by reliability.
 *
 * Conditional Granger (3.0) + cascade-aware (1.5) + pairwise effect_size (1.0)
 * + pairwise neg_log_pvalue (0.8) + agreement voting (top-25% boost).
 */
export function calibratedEnsembleScoring(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig> = {}
): PairwiseScoreMatrix {
  const fullConfig = { ...DEFAULT_ADVANCED_CONFIG, ...config };
  const { domains } = toArrays(data);
  const n = domains.length;

  if (n < 2) {
    const empty = zeroMatrix(n);
    return { domains, scores: empty, optimalLags: empty, pValues: empty.map(r => r.map(() => 1)) };
  }

  // Run 4 component methods
  const sConditional = conditionalScoresMatrix(data, fullConfig);
  const cascadeResult = cascadeAwareScoring(data, fullConfig);
  const sCascade = cascadeResult.scores;
  const { scores: sPairwise, lags, pvals } = pairwiseScoresMatrix(data, fullConfig, 'effect_size');
  const { scores: sPvalue } = pairwiseScoresMatrix(data, fullConfig, 'neg_log_pvalue');

  // Normalize each to [0, 1]
  const methods = new Map<string, number[][]>();
  methods.set('conditional', normalizeScores(sConditional));
  methods.set('cascade', normalizeScores(sCascade));
  methods.set('pairwise', normalizeScores(sPairwise));
  methods.set('pvalue', normalizeScores(sPvalue));

  const weights = fullConfig.ensembleWeights;
  const totalWeight = weights.conditional + weights.cascade + weights.pairwise + weights.pvalue;

  // Weighted combination
  const fused = zeroMatrix(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      fused[i][j] =
        (weights.conditional * methods.get('conditional')![i][j] +
         weights.cascade * methods.get('cascade')![i][j] +
         weights.pairwise * methods.get('pairwise')![i][j] +
         weights.pvalue * methods.get('pvalue')![i][j]) / totalWeight;
    }
  }

  // Agreement bonus
  const bonus = computeAgreementBonus(methods, 0.25, 3, 0.5);
  const finalScores = applyBonus(fused, bonus);
  zeroDiagonal(finalScores);

  return { domains, scores: finalScores, optimalLags: lags, pValues: pvals };
}

// ============================================================================
// METHOD 3: GREEDY CAUSAL PEELING
// ============================================================================

/**
 * Greedy Causal Peeling: orthogonal matching pursuit for causal graph learning.
 *
 * Iteratively fits multivariate regression with all active parents,
 * computes marginal contribution of each, and prunes below threshold.
 * Converges to a sparse deconfounded causal graph.
 */
export function greedyCausalPeeling(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig> = {}
): PairwiseScoreMatrix {
  const fullConfig = { ...DEFAULT_ADVANCED_CONFIG, ...config };
  const { domains, values } = toArrays(data);
  const n = domains.length;
  const T = values[0]?.length ?? 0;

  const scores = zeroMatrix(n);
  const optLags = zeroMatrix(n);
  const pVals: number[][] = Array.from({ length: n }, () => Array(n).fill(1));

  if (n < 2 || T < 10) {
    return { domains, scores, optimalLags: optLags, pValues: pVals };
  }

  // Active edges: start dense (all except diagonal)
  const activeEdges: boolean[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => i !== j)
  );

  const baseLag = Math.min(fullConfig.maxLag, Math.floor(T / (3 * n + 1)));

  for (let iteration = 0; iteration < fullConfig.peelingIterations; iteration++) {
    const newScores = zeroMatrix(n);
    let edgesPruned = 0;

    for (let target = 0; target < n; target++) {
      const y = values[target];
      if (std(y) < 1e-10) continue;

      // Get current parent set
      const parents: number[] = [];
      for (let p = 0; p < n; p++) {
        if (activeEdges[target][p]) parents.push(p);
      }
      if (parents.length === 0) continue;

      let lag = Math.min(baseLag, Math.max(1, Math.floor(T / (3 * parents.length + 5))));
      let nObs = T - lag;
      let nParamsFull = 1 + (parents.length + 1) * lag;

      if (nObs <= nParamsFull + 5) {
        lag = Math.max(1, Math.floor((nObs - 5) / (parents.length + 2)));
        nParamsFull = 1 + (parents.length + 1) * lag;
        if (nObs <= nParamsFull + 2) continue;
      }

      nObs = T - lag;
      const yVec = y.slice(lag);

      // Build full design matrix: intercept + own lags + parent lags
      const XFull: number[][] = [];
      const parentColStart: Map<number, number> = new Map();
      for (let t = lag; t < T; t++) {
        const row: number[] = [1];
        for (let l = 1; l <= lag; l++) row.push(y[t - l]);
        for (const p of parents) {
          if (t === lag) parentColStart.set(p, row.length);
          for (let l = 1; l <= lag; l++) row.push(values[p][t - l]);
        }
        XFull.push(row);
      }

      const rssFull = computeOlsRSS(XFull, yVec);
      if (rssFull <= 0) continue;

      // Compute marginal contribution of each parent
      for (const p of parents) {
        let XWithout: number[][];

        if (parents.length === 1) {
          // Only one parent: compare with self-only model
          XWithout = [];
          for (let t = lag; t < T; t++) {
            const row: number[] = [1];
            for (let l = 1; l <= lag; l++) row.push(y[t - l]);
            XWithout.push(row);
          }
        } else {
          // Remove parent p's columns and refit
          const otherParents = parents.filter(pp => pp !== p);
          XWithout = [];
          for (let t = lag; t < T; t++) {
            const row: number[] = [1];
            for (let l = 1; l <= lag; l++) row.push(y[t - l]);
            for (const pp of otherParents) {
              for (let l = 1; l <= lag; l++) row.push(values[pp][t - l]);
            }
            XWithout.push(row);
          }
        }

        const rssWithout = computeOlsRSS(XWithout, yVec);
        const marginal = rssWithout > 0 ? (rssWithout - rssFull) / rssWithout : 0;
        newScores[target][p] = Math.max(0, marginal);

        if (marginal < fullConfig.peelingPruneThreshold) {
          activeEdges[target][p] = false;
          edgesPruned++;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        scores[i][j] = newScores[i][j];
      }
    }

    if (edgesPruned === 0) break; // Converged
  }

  return { domains, scores, optimalLags: optLags, pValues: pVals };
}

// ============================================================================
// METHOD 4: MULTI-RESOLUTION TEMPORAL PYRAMIDS
// ============================================================================

/**
 * Run Granger tests at multiple temporal resolutions and fuse with inverse-variance weighting.
 *
 * Resolutions: raw, 4x downsampled, 28x downsampled, first-differenced.
 */
export function multiResolutionScoring(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig> = {}
): PairwiseScoreMatrix {
  const fullConfig = { ...DEFAULT_ADVANCED_CONFIG, ...config };
  const { domains } = toArrays(data);
  const n = domains.length;
  const T = Object.values(data)[0]?.length ?? 0;

  if (n < 2) {
    const empty = zeroMatrix(n);
    return { domains, scores: empty, optimalLags: empty, pValues: empty.map(r => r.map(() => 1)) };
  }

  const resolutionScores: number[][][] = [];

  // Resolution 1: Raw data
  const { scores: s1, lags, pvals } = pairwiseScoresMatrix(data, fullConfig, 'effect_size');
  resolutionScores.push(s1);

  // Resolution 2: 4x downsampled
  if (T >= 40) {
    const ds4: Record<string, number[]> = {};
    for (const [d, v] of Object.entries(data)) ds4[d] = downsample(v, 4);
    const { scores: s2 } = pairwiseScoresMatrix(ds4, fullConfig, 'effect_size');
    resolutionScores.push(s2);
  }

  // Resolution 3: 28x downsampled
  if (T >= 280) {
    const ds28: Record<string, number[]> = {};
    for (const [d, v] of Object.entries(data)) ds28[d] = downsample(v, 28);
    const ds28Config = { ...fullConfig, maxLag: Math.min(fullConfig.maxLag, Math.floor(Object.values(ds28)[0].length / 4)) };
    const { scores: s3 } = pairwiseScoresMatrix(ds28, ds28Config, 'effect_size');
    resolutionScores.push(s3);
  }

  // Resolution 4: First-differenced
  if (fullConfig.includeDifferenced) {
    const diffData: Record<string, number[]> = {};
    for (const [d, v] of Object.entries(data)) diffData[d] = difference(v);
    const { scores: s4 } = pairwiseScoresMatrix(diffData, fullConfig, 'effect_size');
    resolutionScores.push(s4);
  }

  // Inverse-variance fusion
  const fused = zeroMatrix(n);
  let totalWeight = 0;

  for (const s of resolutionScores) {
    const flat: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && s[i][j] > 0) flat.push(s[i][j]);
      }
    }
    let weight = 1.0;
    if (flat.length > 1) {
      const m = mean(flat);
      let variance = 0;
      for (const v of flat) variance += (v - m) * (v - m);
      variance /= flat.length;
      weight = 1.0 / (variance + 1e-10);
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        fused[i][j] += weight * s[i][j];
      }
    }
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        fused[i][j] /= totalWeight;
      }
    }
  }

  return { domains, scores: fused, optimalLags: lags, pValues: pvals };
}

// ============================================================================
// METHOD 5: ANOMALY-CONDITIONED SCORING
// ============================================================================

/**
 * Anomaly-conditioned causal scoring.
 *
 * Causal effects are strongest during extreme events.
 * Computes anomaly alignment score: if source has anomaly at t,
 * does target have anomaly at t+lag? Weighted blend with baseline Granger.
 */
export function anomalyConditionedScoring(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig> = {}
): PairwiseScoreMatrix {
  const fullConfig = { ...DEFAULT_ADVANCED_CONFIG, ...config };
  const { domains, values } = toArrays(data);
  const n = domains.length;
  const T = values[0]?.length ?? 0;

  if (n < 2) {
    const empty = zeroMatrix(n);
    return { domains, scores: empty, optimalLags: empty, pValues: empty.map(r => r.map(() => 1)) };
  }

  // Detect anomalies per column using Z-score
  const anomalyMask: boolean[][] = Array.from({ length: T }, () => Array(n).fill(false));
  for (let j = 0; j < n; j++) {
    const col = values[j];
    const m = mean(col);
    const s = std(col);
    if (s > 1e-10) {
      for (let t = 0; t < T; t++) {
        anomalyMask[t][j] = Math.abs((col[t] - m) / s) > fullConfig.anomalyZThreshold;
      }
    }
  }

  // Baseline Granger on full data
  const { scores: sFull, lags, pvals } = pairwiseScoresMatrix(data, fullConfig, 'effect_size');

  // Anomaly alignment score
  const alignment = zeroMatrix(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      // For each anomaly in source j, check if target i has anomaly within lag window
      const jAnomalies: number[] = [];
      for (let t = 0; t < T; t++) {
        if (anomalyMask[t][j]) jAnomalies.push(t);
      }
      if (jAnomalies.length === 0) continue;

      let hits = 0;
      const lagWindow = fullConfig.maxLag;
      for (const t of jAnomalies) {
        for (let dt = 1; dt <= Math.min(lagWindow, T - t - 1); dt++) {
          if (anomalyMask[t + dt][i]) {
            hits++;
            break;
          }
        }
      }
      alignment[i][j] = hits / jAnomalies.length;
    }
  }

  // Combined: weighted blend
  const w = fullConfig.anomalyWeight;
  const combined = zeroMatrix(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      combined[i][j] = (1 - w) * sFull[i][j] + w * alignment[i][j];
    }
  }

  return { domains, scores: combined, optimalLags: lags, pValues: pvals };
}

// ============================================================================
// METHOD 6: REGIME-CONDITIONAL SCORING
// ============================================================================

/**
 * Regime-conditional scoring: separate conditional Granger for normal vs anomaly periods.
 *
 * Anomaly periods get higher weight because causal effects are more visible
 * during extreme events (better signal-to-noise ratio).
 */
export function regimeConditionalScoring(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig> = {}
): PairwiseScoreMatrix {
  const fullConfig = { ...DEFAULT_ADVANCED_CONFIG, ...config };
  const { domains, values } = toArrays(data);
  const n = domains.length;
  const T = values[0]?.length ?? 0;

  if (n < 2) {
    const empty = zeroMatrix(n);
    return { domains, scores: empty, optimalLags: empty, pValues: empty.map(r => r.map(() => 1)) };
  }

  // Detect anomaly periods
  const anomalyMask: boolean[] = Array(T).fill(false);
  for (let j = 0; j < n; j++) {
    const col = values[j];
    const m = mean(col);
    const s = std(col);
    if (s > 1e-10) {
      for (let t = 0; t < T; t++) {
        if (Math.abs((col[t] - m) / s) > fullConfig.anomalyZThreshold) {
          anomalyMask[t] = true;
        }
      }
    }
  }

  const normalCount = anomalyMask.filter(v => !v).length;
  const anomalyCount = anomalyMask.filter(v => v).length;
  const minObsPerRegime = Math.max(3 * n * fullConfig.maxLag + 10, 50);

  // Always run conditional on full data as fallback
  const scoresFull = conditionalScoresMatrix(data, fullConfig);
  const { lags, pvals } = pairwiseScoresMatrix(data, fullConfig);

  // Only do regime-specific if enough data in both regimes
  if (normalCount < minObsPerRegime || anomalyCount < minObsPerRegime) {
    return { domains, scores: scoresFull, optimalLags: lags, pValues: pvals };
  }

  // Count contiguous runs in each regime to assess temporal integrity.
  // Non-contiguous regime data breaks the lag structure assumption in Granger.
  // We measure the largest contiguous block to decide how much to trust regime estimates.
  let maxNormalRun = 0;
  let maxAnomalyRun = 0;
  let curNormal = 0;
  let curAnomaly = 0;
  for (let t = 0; t < T; t++) {
    if (anomalyMask[t]) {
      curAnomaly++;
      curNormal = 0;
      if (curAnomaly > maxAnomalyRun) maxAnomalyRun = curAnomaly;
    } else {
      curNormal++;
      curAnomaly = 0;
      if (curNormal > maxNormalRun) maxNormalRun = curNormal;
    }
  }

  // If anomaly/normal periods are highly fragmented, regime estimates are unreliable.
  // Fall back to full-data estimates when the largest contiguous block is too short.
  const minContiguousBlock = 3 * n + 10;
  if (maxNormalRun < minContiguousBlock || maxAnomalyRun < minContiguousBlock) {
    return { domains, scores: scoresFull, optimalLags: lags, pValues: pvals };
  }

  // Extract regime data (note: non-contiguous timepoints are packed together,
  // which approximates the lag structure; contiguity check above ensures most
  // data comes from long runs where this approximation is reasonable)
  const normalData: Record<string, number[]> = {};
  const anomalyData: Record<string, number[]> = {};
  for (let d = 0; d < n; d++) {
    normalData[domains[d]] = [];
    anomalyData[domains[d]] = [];
    for (let t = 0; t < T; t++) {
      if (anomalyMask[t]) {
        anomalyData[domains[d]].push(values[d][t]);
      } else {
        normalData[domains[d]].push(values[d][t]);
      }
    }
  }

  const regimeLag = Math.min(fullConfig.maxLag, Math.max(1, Math.floor(Math.min(normalCount, anomalyCount) / (3 * n + 1))));
  const regimeConfig = { ...fullConfig, maxLag: regimeLag };

  let scoresNormal: number[][];
  let scoresAnomaly: number[][];

  try {
    scoresNormal = conditionalScoresMatrix(normalData, regimeConfig);
  } catch {
    scoresNormal = scoresFull;
  }

  try {
    scoresAnomaly = conditionalScoresMatrix(anomalyData, regimeConfig);
  } catch {
    scoresAnomaly = scoresFull;
  }

  // Combine: weight anomaly periods higher
  const alpha = fullConfig.regimeAnomalyAlpha;
  const normAnom = normalizeScores(scoresAnomaly);
  const normNorm = normalizeScores(scoresNormal);
  const normFull = normalizeScores(scoresFull);

  const final = zeroMatrix(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const regimeBlend = alpha * normAnom[i][j] + (1 - alpha) * normNorm[i][j];
      final[i][j] = 0.5 * normFull[i][j] + 0.5 * regimeBlend;
    }
  }
  zeroDiagonal(final);

  return { domains, scores: final, optimalLags: lags, pValues: pvals };
}

// ============================================================================
// METHOD 7: NEXUSBRAIN FINAL
// ============================================================================

/**
 * NexusBrain Final: self-tuning VAR + cascade penalty + p-value weighting + asymmetry bonus.
 *
 * The "best default" method: automatically picks signed vs absolute VAR coefficients
 * based on separation quality, then applies cascade penalty, p-value significance
 * boost, and directional asymmetry bonus.
 */
export function nexusBrainFinalMethod(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig> = {}
): PairwiseScoreMatrix {
  const fullConfig = { ...DEFAULT_ADVANCED_CONFIG, ...config };
  const { domains, values } = toArrays(data);
  const n = domains.length;
  const T = values[0]?.length ?? 0;

  if (n < 2) {
    const empty = zeroMatrix(n);
    return { domains, scores: empty, optimalLags: empty, pValues: empty.map(r => r.map(() => 1)) };
  }

  // Step 1: Fit multivariate VAR with both signed and absolute modes
  const varAbsolute = varCoefficientScoring(values, n, T, fullConfig.maxLag, true);
  const varSigned = varCoefficientScoring(values, n, T, fullConfig.maxLag, false);

  // Step 2: Pick better mode based on separation quality
  const sepAbs = separationScore(varAbsolute, n);
  const sepSigned = separationScore(varSigned, n);
  const baseScores = sepSigned > sepAbs * 1.1 ? varSigned : varAbsolute;

  // Step 3: Get cascade-aware confound penalty
  const cascadeResult = cascadeAwareScoring(data, fullConfig);
  const sCascade = cascadeResult.scores;

  // Step 4: Get pairwise p-values
  const { lags, pvals } = pairwiseScoresMatrix(data, fullConfig);

  // Step 5: Normalize
  const baseN = normalizeScores(baseScores);
  const cascadeN = normalizeScores(sCascade);

  // Step 6: Apply modifiers per edge
  const final = zeroMatrix(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;

      const varScore = baseN[i][j];
      const cascadeScore = cascadeN[i][j];

      // Cascade modifier
      let modifier = 1.0;
      if (varScore > 0.3 && cascadeScore < varScore * 0.3) {
        modifier = 0.7; // Likely indirect
      } else if (cascadeScore > 0.5 && varScore > 0.3) {
        modifier = 1.1; // Both agree
      }

      // P-value significance bonus
      const p = pvals[i][j];
      let pBonus = 1.0;
      if (p < 0.001) {
        pBonus = 1.0 + 0.3 * Math.min(-Math.log10(p + 1e-300) / 10, 1.5);
      } else if (p < 0.05) {
        pBonus = 1.0 + 0.1 * Math.min(-Math.log10(p + 1e-300) / 5, 0.5);
      } else {
        pBonus = 0.9;
      }

      // Asymmetry bonus
      const forward = baseScores[i][j];
      const reverse = baseScores[j]?.[i] ?? 0;
      let asymBonus = 1.0;
      if (forward > 0) {
        const ratio = forward / (reverse + 1e-10);
        if (ratio > 2.0) {
          asymBonus = 1.0 + 0.2 * Math.min(ratio / 5, 1.0);
        } else if (ratio < 0.5) {
          asymBonus = 0.85;
        }
      }

      final[i][j] = baseScores[i][j] * modifier * pBonus * asymBonus;
    }
  }

  return { domains, scores: final, optimalLags: lags, pValues: pvals };
}

/** Extract VAR coefficient magnitudes for each target equation */
function varCoefficientScoring(
  values: number[][],
  nVars: number,
  T: number,
  maxLag: number,
  absoluteValues: boolean
): number[][] {
  const scores = zeroMatrix(nVars);

  for (let i = 0; i < nVars; i++) {
    const y = values[i];

    // Select optimal lag via AIC
    let bestLag = 1;
    let bestIC = Infinity;
    const upper = Math.min(maxLag, Math.floor(T / (3 * nVars + 1)));

    for (let lag = 1; lag <= Math.max(upper, 1); lag++) {
      const nObs = T - lag;
      const nParams = 1 + nVars * lag;
      if (nObs <= nParams + 5) continue;

      const X: number[][] = [];
      for (let t = lag; t < T; t++) {
        const row: number[] = [1];
        for (let v = 0; v < nVars; v++) {
          for (let l = 1; l <= lag; l++) {
            row.push(values[v][t - l]);
          }
        }
        X.push(row);
      }
      const rss = computeOlsRSS(X, y.slice(lag));
      if (rss <= 0 || !isFinite(rss)) continue;

      const ic = nObs * Math.log(Math.max(rss, 1e-300) / nObs) + 2 * nParams;
      if (ic < bestIC) {
        bestIC = ic;
        bestLag = lag;
      }
    }

    // Fit full multivariate model
    const lag = bestLag;
    const nObs = T - lag;
    const nParams = 1 + nVars * lag;
    if (nObs <= nParams + 2) continue;

    const X: number[][] = [];
    const paramMap: Map<string, number> = new Map();
    for (let t = lag; t < T; t++) {
      const row: number[] = [1];
      let colIdx = 1;
      for (let v = 0; v < nVars; v++) {
        for (let l = 1; l <= lag; l++) {
          if (t === lag) paramMap.set(`${v}_${l}`, colIdx);
          row.push(values[v][t - l]);
          colIdx++;
        }
      }
      X.push(row);
    }

    try {
      const result = ordinaryLeastSquares(X, y.slice(lag));
      const beta = result.coefficients;

      for (let j = 0; j < nVars; j++) {
        if (j === i) continue;
        let maxCoeff = 0;
        for (let l = 1; l <= lag; l++) {
          const col = paramMap.get(`${j}_${l}`);
          if (col !== undefined && col < beta.length) {
            const coeff = absoluteValues ? Math.abs(beta[col]) : beta[col];
            maxCoeff = Math.max(maxCoeff, coeff);
          }
        }
        scores[i][j] = maxCoeff;
      }
    } catch {
      // Skip if OLS fails
    }
  }

  return scores;
}

/** Compute separation quality: ratio of top-k mean to rest mean */
function separationScore(scores: number[][], n: number): number {
  const offDiag: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) offDiag.push(scores[i][j]);
    }
  }

  if (offDiag.length === 0) return 0;
  const maxVal = Math.max(...offDiag);
  if (maxVal === 0) return 0;

  offDiag.sort((a, b) => b - a);
  const k = Math.max(1, Math.floor(offDiag.length / 3));
  const topMean = mean(offDiag.slice(0, k));
  const restMean = k < offDiag.length ? mean(offDiag.slice(k)) : 0;

  return topMean / (restMean + 1e-10);
}

// ============================================================================
// METHOD 9: APEX (CausalRivers-Proven: VAR + F-test + CF Knockout + Sign Prior)
// ============================================================================

/**
 * Apex scoring: the CausalRivers submission method.
 *
 * Combines four complementary signals:
 * 1. VAR Coefficients: max(|coef|) across lags — proven strong baseline
 * 2. Granger F-test: small additive signal (alpha=0.01) to break ties
 * 3. Counterfactual Knockout: penalizes confounded edges, boosts validated ones
 * 4. Sign Prior: configurable domain-specific coefficient sign preference
 *
 * Beat the VAR baseline on ALL 6 CausalRivers benchmark datasets.
 */
export function apexScoring(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig> = {}
): PairwiseScoreMatrix {
  const fullConfig = { ...DEFAULT_ADVANCED_CONFIG, ...config };
  const { domains, values } = toArrays(data);
  const n = domains.length;
  const T = values[0]?.length ?? 0;

  if (n < 2) {
    const empty = zeroMatrix(n);
    return { domains, scores: empty, optimalLags: empty, pValues: empty.map(r => r.map(() => 1)) };
  }

  // ── Component 1: VAR coefficients + sign extraction ──
  const varScores = zeroMatrix(n);
  const signMatrix = zeroMatrix(n);
  const optLags = zeroMatrix(n);

  for (let target = 0; target < n; target++) {
    const y = values[target];

    // Select optimal lag via AIC
    let bestLag = 1;
    let bestIC = Infinity;
    const upper = Math.min(fullConfig.maxLag, Math.floor(T / (3 * n + 1)));

    for (let lag = 1; lag <= Math.max(upper, 1); lag++) {
      const nObs = T - lag;
      const nParams = 1 + n * lag;
      if (nObs <= nParams + 5) continue;

      const X: number[][] = [];
      for (let t = lag; t < T; t++) {
        const row: number[] = [1];
        for (let v = 0; v < n; v++) {
          for (let l = 1; l <= lag; l++) row.push(values[v][t - l]);
        }
        X.push(row);
      }
      const rss = computeOlsRSS(X, y.slice(lag));
      if (rss <= 0 || !isFinite(rss)) continue;

      const ic = nObs * Math.log(Math.max(rss, 1e-300) / nObs) + 2 * nParams;
      if (ic < bestIC) { bestIC = ic; bestLag = lag; }
    }

    const lag = bestLag;
    const nObs = T - lag;
    const nParams = 1 + n * lag;
    if (nObs <= nParams + 2) continue;

    const X: number[][] = [];
    for (let t = lag; t < T; t++) {
      const row: number[] = [1];
      for (let v = 0; v < n; v++) {
        for (let l = 1; l <= lag; l++) row.push(values[v][t - l]);
      }
      X.push(row);
    }

    try {
      const result = ordinaryLeastSquares(X, y.slice(lag));
      const beta = result.coefficients;

      for (let source = 0; source < n; source++) {
        if (source === target) continue;

        // Extract max absolute coefficient and sign of strongest lag
        let maxAbsCoeff = 0;
        let signOfBest = 0;
        let bestLagIdx = 0;

        for (let l = 1; l <= lag; l++) {
          const colIdx = 1 + source * lag + (l - 1);
          if (colIdx < beta.length) {
            const coeff = beta[colIdx];
            if (Math.abs(coeff) > maxAbsCoeff) {
              maxAbsCoeff = Math.abs(coeff);
              signOfBest = coeff > 0 ? 1 : -1;
              bestLagIdx = l;
            }
          }
        }

        varScores[target][source] = maxAbsCoeff;
        signMatrix[target][source] = signOfBest;
        optLags[target][source] = bestLagIdx;
      }
    } catch {
      // Skip if OLS fails
    }
  }

  // ── Component 2: Granger F-test (pairwise) ──
  const fScores = zeroMatrix(n);
  const pValues = zeroMatrix(n).map(r => r.map(() => 1));

  for (let target = 0; target < n; target++) {
    for (let source = 0; source < n; source++) {
      if (target === source) continue;
      const lag = optLags[target][source] || 1;
      try {
        const result = grangerFTest(values[source], values[target], lag);
        fScores[target][source] = result.fStatistic;
        pValues[target][source] = result.pValue;
      } catch {
        // Keep defaults
      }
    }
  }

  const fNormalized = normalizeScores(fScores);

  // ── Component 3: Counterfactual knockout ──
  const cfResult = counterfactualKnockout(data, {
    maxLag: Math.max(1, Math.min(fullConfig.maxLag, Math.floor(T / (3 * n)))),
    nShuffles: fullConfig.apexCfShuffles,
  });
  const cfScores = cfResult.scores;

  // ── Normalize for ranking comparison ──
  const varNormalized = normalizeScores(varScores);
  const cfNormalized = normalizeScores(cfScores);

  // ── Build final scores ──
  const finalScores = zeroMatrix(n);
  const confounderFlags: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;

      // Start from VAR coefficient
      let score = varScores[i][j];

      // Add F-test signal (small additive contribution)
      score += fullConfig.apexFTestWeight * fNormalized[i][j];

      // Counterfactual agreement modifier
      const varRank = varNormalized[i][j];
      const cfRank = cfNormalized[i][j];

      if (varRank > 0.5 && cfRank < 0.3) {
        // VAR says causal but CF disagrees → likely confounded
        score *= fullConfig.apexCfPenalty;
        confounderFlags[i][j] = true;
      } else if (varRank > 0.5 && cfRank > 0.5) {
        // Both agree → boost
        score *= fullConfig.apexCfBoost;
      } else if (varRank < 0.3 && cfRank > 0.5) {
        // CF sees something VAR misses → small boost
        score *= fullConfig.apexCfMinorBoost;
      }

      // Sign prior
      if (fullConfig.apexSignPriorMode !== 'none') {
        const sign = signMatrix[i][j];
        const expectPositive = fullConfig.apexSignPriorMode === 'positive';
        if ((expectPositive && sign > 0) || (!expectPositive && sign < 0)) {
          score *= fullConfig.apexSignPriorPositive;
        } else if ((expectPositive && sign < 0) || (!expectPositive && sign > 0)) {
          score *= fullConfig.apexSignPriorNegative;
        }
      }

      finalScores[i][j] = score;
    }
  }

  return {
    domains,
    scores: finalScores,
    optimalLags: optLags,
    pValues,
    knockoutScores: cfScores,
    confounderFlags,
    signMatrix,
  };
}

// ============================================================================
// METHOD 10: UNIFIED DISPATCHER
// ============================================================================

/**
 * Run advanced causal discovery using the specified method.
 *
 * Default method: 'apex' (beat VAR baseline on ALL 6 CausalRivers benchmark datasets).
 */
export function runAdvancedDiscovery(
  data: Record<string, number[]>,
  config: Partial<AdvancedDiscoveryConfig> = {}
): PairwiseScoreMatrix {
  const method = config.method ?? DEFAULT_ADVANCED_CONFIG.method;
  const { domains } = toArrays(data);
  const n = domains.length;

  switch (method) {
    case 'pairwise': {
      const { scores, lags, pvals } = pairwiseScoresMatrix(data, config, 'effect_size');
      return { domains, scores, optimalLags: lags, pValues: pvals };
    }
    case 'conditional': {
      const scores = conditionalScoresMatrix(data, config);
      const { lags, pvals } = pairwiseScoresMatrix(data, config);
      return { domains, scores, optimalLags: lags, pValues: pvals };
    }
    case 'cascade_aware':
      return cascadeAwareScoring(data, config);
    case 'calibrated_ensemble':
      return calibratedEnsembleScoring(data, config);
    case 'greedy_peeling':
      return greedyCausalPeeling(data, config);
    case 'multi_resolution':
      return multiResolutionScoring(data, config);
    case 'anomaly_conditioned':
      return anomalyConditionedScoring(data, config);
    case 'regime_conditional':
      return regimeConditionalScoring(data, config);
    case 'nexusbrain_final':
      return nexusBrainFinalMethod(data, config);
    case 'apex':
      return apexScoring(data, config);
    default: {
      // Unknown method: fall back to calibrated ensemble
      return calibratedEnsembleScoring(data, config);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const AdvancedDiscovery = {
  runAdvancedDiscovery,
  cascadeAwareScoring,
  calibratedEnsembleScoring,
  greedyCausalPeeling,
  multiResolutionScoring,
  anomalyConditionedScoring,
  regimeConditionalScoring,
  nexusBrainFinalMethod,
  apexScoring,
};
