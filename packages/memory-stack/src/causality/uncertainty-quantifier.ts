/**
 * Uncertainty Quantifier
 *
 * LLM-level cognitive capability: the brain has p-values on individual edges
 * but no way to propagate uncertainty through multi-hop chains. LLMs implicitly
 * track confidence. This module adds explicit Bayesian uncertainty bounds.
 *
 * Features:
 * - Per-edge uncertainty scoring (sample size, staleness, validation, confounding)
 * - Uncertainty propagation through multi-hop paths (compounds per hop)
 * - 68% and 95% confidence bounds on path predictions
 * - Confidence calibration via Platt scaling using feedback loop history
 * - Decomposition of uncertainty sources for explainability
 *
 * @example
 * ```typescript
 * const quantifier = createUncertaintyQuantifier();
 * const bounds = quantifier.propagateUncertainty(path, dag);
 * console.log(bounds.prediction, bounds.lower95, bounds.upper95);
 * // 0.35, 0.12, 0.58
 * console.log(bounds.sources[0]);
 * // { source: 'low_sample_size', contribution: 0.45 }
 * ```
 *
 * @packageDocumentation
 */

import type { CausalDAG } from './continuous-learner';
import type { ReasoningPath } from './multi-hop-reasoner';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Uncertainty assessment for a single edge
 */
export interface EdgeUncertainty {
  /** Source domain */
  source: string;
  /** Target domain */
  target: string;
  /** Overall uncertainty score (0-1): 0 = certain, 1 = maximally uncertain */
  uncertainty: number;
  /** Uncertainty category */
  category: 'low' | 'medium' | 'high' | 'very_high';
  /** Individual uncertainty sources */
  sources: Array<{
    source: string;
    contribution: number;
    description: string;
  }>;
  /** How many more samples would reduce uncertainty meaningfully */
  sampleSizeDeficit?: number;
  /** Days since last update */
  staleDays?: number;
}

/**
 * Uncertainty bounds for a path prediction
 */
export interface UncertaintyBounds {
  /** Point prediction (path confidence) */
  prediction: number;
  /** Lower bound of 95% confidence interval */
  lower95: number;
  /** Upper bound of 95% confidence interval */
  upper95: number;
  /** Lower bound of 68% confidence interval */
  lower68: number;
  /** Upper bound of 68% confidence interval */
  upper68: number;
  /** Combined uncertainty score for the path (0-1) */
  pathUncertainty: number;
  /** Path uncertainty category */
  category: 'low' | 'medium' | 'high' | 'very_high';
  /** Decomposition of uncertainty sources */
  sources: Array<{
    source: string;
    contribution: number;
    hopIndex?: number;
    description: string;
  }>;
  /** Per-hop uncertainty breakdown */
  hopUncertainties: EdgeUncertainty[];
}

/**
 * Calibration result from Platt scaling
 */
export interface CalibrationResult {
  /** Original (raw) confidence */
  rawConfidence: number;
  /** Calibrated confidence after Platt scaling */
  calibratedConfidence: number;
  /** Calibration error (difference between raw and calibrated) */
  calibrationError: number;
  /** How many historical predictions the calibration is based on */
  sampleSize: number;
  /** Whether calibration is reliable (enough samples) */
  isReliable: boolean;
}

/**
 * Historical accuracy record for calibration
 */
export interface AccuracyRecord {
  /** Predicted confidence bucket (e.g., 0.7-0.8) */
  predictedConfidence: number;
  /** Actual outcome rate for predictions in this bucket */
  actualOutcomeRate: number;
  /** Number of predictions in this bucket */
  sampleCount: number;
}

/**
 * Configuration for the uncertainty quantifier
 */
export interface UncertaintyConfig {
  /** Minimum sample size for "well-sampled" edge (default: 30) */
  minSampleSize: number;
  /** Days before an edge is considered stale (default: 60) */
  staleDays: number;
  /** Weight for sample-size uncertainty (default: 0.3) */
  sampleSizeWeight: number;
  /** Weight for staleness uncertainty (default: 0.2) */
  stalenessWeight: number;
  /** Weight for validation uncertainty (default: 0.25) */
  validationWeight: number;
  /** Weight for confounding uncertainty (default: 0.25) */
  confoundingWeight: number;
  /** Minimum accuracy records for reliable calibration (default: 10) */
  minCalibrationSamples: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an uncertainty quantifier.
 */
export function createUncertaintyQuantifier(config: Partial<UncertaintyConfig> = {}) {
  const {
    minSampleSize = 30,
    staleDays = 60,
    sampleSizeWeight = 0.3,
    stalenessWeight = 0.2,
    validationWeight = 0.25,
    confoundingWeight = 0.25,
    minCalibrationSamples = 10,
  } = config;

  // ── Per-edge uncertainty ──────────────────────────────────────────

  /**
   * Compute uncertainty for a single edge in the DAG.
   */
  function computeEdgeUncertainty(
    source: string,
    target: string,
    edge: {
      weight: number;
      pValue: number;
      lagDays: number;
      lastUpdated: Date;
      sampleSize: number;
      knockoutScore?: number;
      isLikelyConfounded?: boolean;
      predictionAccuracy?: number;
      predictionCount?: number;
    },
    referenceDate: Date = new Date(),
  ): EdgeUncertainty {
    const sources: EdgeUncertainty['sources'] = [];
    let totalUncertainty = 0;

    // 1. Sample size uncertainty
    const sampleDeficit = Math.max(0, minSampleSize - edge.sampleSize);
    const sampleUncertainty = sampleDeficit > 0
      ? Math.min(1, sampleDeficit / minSampleSize) * sampleSizeWeight
      : 0;
    if (sampleUncertainty > 0.01) {
      sources.push({
        source: 'low_sample_size',
        contribution: sampleUncertainty,
        description: `Only ${edge.sampleSize} samples (need ${minSampleSize} for confidence)`,
      });
      totalUncertainty += sampleUncertainty;
    }

    // 2. Staleness uncertainty
    const ageMs = referenceDate.getTime() - edge.lastUpdated.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const stalenessUncertainty = ageDays > staleDays
      ? Math.min(1, (ageDays - staleDays) / staleDays) * stalenessWeight
      : (ageDays / staleDays) * stalenessWeight * 0.3; // Small base staleness
    if (stalenessUncertainty > 0.01) {
      sources.push({
        source: 'staleness',
        contribution: stalenessUncertainty,
        description: `Edge ${Math.round(ageDays)}d old${ageDays > staleDays ? ' (STALE)' : ''}`,
      });
      totalUncertainty += stalenessUncertainty;
    }

    // 3. Validation uncertainty (lack of knockout validation)
    const isValidated = (edge.knockoutScore ?? 0) > 0.5 && !edge.isLikelyConfounded;
    const validationUncertainty = isValidated ? 0 : validationWeight;
    if (validationUncertainty > 0.01) {
      sources.push({
        source: 'unvalidated',
        contribution: validationUncertainty,
        description: edge.knockoutScore === undefined
          ? 'Edge not knockout-tested — causal direction unconfirmed'
          : `Knockout score ${edge.knockoutScore.toFixed(2)} — weak causal evidence`,
      });
      totalUncertainty += validationUncertainty;
    }

    // 4. Confounding uncertainty
    const confoundingUncertainty = edge.isLikelyConfounded ? confoundingWeight : 0;
    if (confoundingUncertainty > 0.01) {
      sources.push({
        source: 'confounded',
        contribution: confoundingUncertainty,
        description: 'Edge is likely confounded — correlation may not be causation',
      });
      totalUncertainty += confoundingUncertainty;
    }

    // 5. p-value based uncertainty (statistical significance)
    if (edge.pValue > 0.05) {
      const pValueUncertainty = Math.min(0.15, (edge.pValue - 0.05) * 2);
      sources.push({
        source: 'low_significance',
        contribution: pValueUncertainty,
        description: `p-value ${edge.pValue.toFixed(3)} > 0.05 — not statistically significant`,
      });
      totalUncertainty += pValueUncertainty;
    }

    // 6. Prediction accuracy (if available from feedback loop)
    if (edge.predictionCount !== undefined && edge.predictionCount >= 3 && edge.predictionAccuracy !== undefined) {
      const accuracyUncertainty = (1 - edge.predictionAccuracy) * 0.15;
      if (accuracyUncertainty > 0.01) {
        sources.push({
          source: 'prediction_history',
          contribution: accuracyUncertainty,
          description: `Historical prediction accuracy ${(edge.predictionAccuracy * 100).toFixed(0)}% (${edge.predictionCount} predictions)`,
        });
        totalUncertainty += accuracyUncertainty;
      }
    }

    // Clamp total uncertainty
    totalUncertainty = Math.min(1, totalUncertainty);

    // Categorize
    const category: EdgeUncertainty['category'] =
      totalUncertainty < 0.2 ? 'low' :
      totalUncertainty < 0.4 ? 'medium' :
      totalUncertainty < 0.7 ? 'high' : 'very_high';

    return {
      source,
      target,
      uncertainty: Math.round(totalUncertainty * 1000) / 1000,
      category,
      sources,
      sampleSizeDeficit: sampleDeficit > 0 ? sampleDeficit : undefined,
      staleDays: ageDays > staleDays ? Math.round(ageDays) : undefined,
    };
  }

  // ── Path uncertainty propagation ──────────────────────────────────

  /**
   * Propagate uncertainty through a multi-hop path.
   * Uncertainty compounds across hops (worse case of any hop dominates).
   */
  function propagateUncertainty(
    path: ReasoningPath,
    dag: CausalDAG,
    referenceDate: Date = new Date(),
  ): UncertaintyBounds {
    const hopUncertainties: EdgeUncertainty[] = [];
    const allSources: UncertaintyBounds['sources'] = [];

    // Compute uncertainty for each hop
    for (let i = 0; i < path.nodes.length - 1; i++) {
      const src = path.nodes[i];
      const tgt = path.nodes[i + 1];
      const edge = dag.edges.get(src)?.get(tgt);

      if (!edge) {
        // Edge disappeared — maximum uncertainty
        hopUncertainties.push({
          source: src, target: tgt,
          uncertainty: 1.0, category: 'very_high',
          sources: [{ source: 'missing_edge', contribution: 1.0, description: 'Edge no longer exists in DAG' }],
        });
        continue;
      }

      const hu = computeEdgeUncertainty(src, tgt, edge, referenceDate);
      hopUncertainties.push(hu);

      // Collect sources with hop index
      for (const s of hu.sources) {
        allSources.push({
          ...s,
          hopIndex: i,
          description: `Hop ${i + 1} (${src}→${tgt}): ${s.description}`,
        });
      }
    }

    // Combine uncertainties across hops
    // Method: 1 - ∏(1 - hop_uncertainty) — uncertainty from ANY hop propagates
    const combinedCertainty = hopUncertainties.reduce(
      (cert, hu) => cert * (1 - hu.uncertainty), 1.0
    );
    const pathUncertainty = Math.min(1, 1 - combinedCertainty);

    // Compute confidence bounds
    // Width scales with uncertainty and number of hops
    const prediction = path.pathConfidence;
    const halfWidth95 = prediction * pathUncertainty * 1.96; // ~95% z-score
    const halfWidth68 = prediction * pathUncertainty * 1.0;  // ~68% z-score

    const lower95 = Math.max(0, prediction - halfWidth95);
    const upper95 = Math.min(1, prediction + halfWidth95);
    const lower68 = Math.max(0, prediction - halfWidth68);
    const upper68 = Math.min(1, prediction + halfWidth68);

    const category: UncertaintyBounds['category'] =
      pathUncertainty < 0.2 ? 'low' :
      pathUncertainty < 0.4 ? 'medium' :
      pathUncertainty < 0.7 ? 'high' : 'very_high';

    // Sort sources by contribution
    allSources.sort((a, b) => b.contribution - a.contribution);

    return {
      prediction,
      lower95: Math.round(lower95 * 1000) / 1000,
      upper95: Math.round(upper95 * 1000) / 1000,
      lower68: Math.round(lower68 * 1000) / 1000,
      upper68: Math.round(upper68 * 1000) / 1000,
      pathUncertainty: Math.round(pathUncertainty * 1000) / 1000,
      category,
      sources: allSources,
      hopUncertainties,
    };
  }

  // ── Confidence calibration ────────────────────────────────────────

  /**
   * Calibrate a predicted confidence using historical accuracy (Platt scaling).
   *
   * If we historically predict 80% but actual is 60%, the calibration
   * learns to adjust future 80% predictions downward.
   *
   * Uses simple linear interpolation between accuracy buckets.
   */
  function calibrateConfidence(
    rawConfidence: number,
    accuracyRecords: AccuracyRecord[],
  ): CalibrationResult {
    if (accuracyRecords.length === 0 || accuracyRecords.reduce((s, r) => s + r.sampleCount, 0) < minCalibrationSamples) {
      return {
        rawConfidence,
        calibratedConfidence: rawConfidence,
        calibrationError: 0,
        sampleSize: accuracyRecords.reduce((s, r) => s + r.sampleCount, 0),
        isReliable: false,
      };
    }

    // Sort by predicted confidence
    const sorted = [...accuracyRecords].sort((a, b) => a.predictedConfidence - b.predictedConfidence);

    // Find bracketing buckets for interpolation
    let lower = sorted[0];
    let upper = sorted[sorted.length - 1];

    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].predictedConfidence <= rawConfidence && sorted[i + 1].predictedConfidence >= rawConfidence) {
        lower = sorted[i];
        upper = sorted[i + 1];
        break;
      }
    }

    // Linear interpolation
    let calibrated: number;
    if (lower.predictedConfidence === upper.predictedConfidence) {
      calibrated = lower.actualOutcomeRate;
    } else {
      const t = (rawConfidence - lower.predictedConfidence) / (upper.predictedConfidence - lower.predictedConfidence);
      calibrated = lower.actualOutcomeRate + t * (upper.actualOutcomeRate - lower.actualOutcomeRate);
    }

    calibrated = Math.max(0, Math.min(1, calibrated));
    const totalSamples = accuracyRecords.reduce((s, r) => s + r.sampleCount, 0);

    return {
      rawConfidence,
      calibratedConfidence: Math.round(calibrated * 1000) / 1000,
      calibrationError: Math.round(Math.abs(rawConfidence - calibrated) * 1000) / 1000,
      sampleSize: totalSamples,
      isReliable: totalSamples >= minCalibrationSamples,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    /**
     * Compute uncertainty for a single edge.
     */
    computeEdgeUncertainty(
      source: string,
      target: string,
      dag: CausalDAG,
      referenceDate?: Date,
    ): EdgeUncertainty | null {
      const edge = dag.edges.get(source)?.get(target);
      if (!edge) return null;
      return computeEdgeUncertainty(source, target, edge, referenceDate);
    },

    /**
     * Compute uncertainty for all edges in the DAG.
     */
    computeAllEdgeUncertainties(
      dag: CausalDAG,
      referenceDate?: Date,
    ): EdgeUncertainty[] {
      const results: EdgeUncertainty[] = [];
      for (const [src, neighbors] of dag.edges) {
        for (const [tgt, edge] of neighbors) {
          results.push(computeEdgeUncertainty(src, tgt, edge, referenceDate));
        }
      }
      return results.sort((a, b) => b.uncertainty - a.uncertainty);
    },

    /**
     * Propagate uncertainty through a multi-hop reasoning path.
     * Returns confidence bounds at 68% and 95% levels.
     */
    propagateUncertainty(
      path: ReasoningPath,
      dag: CausalDAG,
      referenceDate?: Date,
    ): UncertaintyBounds {
      return propagateUncertainty(path, dag, referenceDate);
    },

    /**
     * Calibrate a predicted confidence using historical accuracy records.
     * Uses simple Platt scaling (linear interpolation between accuracy buckets).
     */
    calibrateConfidence(
      rawConfidence: number,
      accuracyRecords: AccuracyRecord[],
    ): CalibrationResult {
      return calibrateConfidence(rawConfidence, accuracyRecords);
    },

    /**
     * Identify the edges with the highest uncertainty in the DAG.
     * Useful for targeting data collection to reduce uncertainty.
     */
    findHighestUncertaintyEdges(
      dag: CausalDAG,
      topN: number = 10,
      referenceDate?: Date,
    ): EdgeUncertainty[] {
      return this.computeAllEdgeUncertainties(dag, referenceDate).slice(0, topN);
    },

    /**
     * Get the overall "confidence quality" score for the DAG.
     * Returns 0-1: higher = less uncertainty across all edges.
     */
    computeDAGConfidenceQuality(
      dag: CausalDAG,
      referenceDate?: Date,
    ): { quality: number; category: string; edgeCount: number; highUncertaintyCount: number } {
      const uncertainties = this.computeAllEdgeUncertainties(dag, referenceDate);
      if (uncertainties.length === 0) return { quality: 1, category: 'no_edges', edgeCount: 0, highUncertaintyCount: 0 };

      const avgUncertainty = uncertainties.reduce((s, u) => s + u.uncertainty, 0) / uncertainties.length;
      const quality = Math.round((1 - avgUncertainty) * 1000) / 1000;
      const highUncertaintyCount = uncertainties.filter(u => u.category === 'high' || u.category === 'very_high').length;

      const category =
        quality > 0.8 ? 'excellent' :
        quality > 0.6 ? 'good' :
        quality > 0.4 ? 'moderate' :
        quality > 0.2 ? 'poor' : 'unreliable';

      return { quality, category, edgeCount: uncertainties.length, highUncertaintyCount };
    },

    /**
     * Get the configuration.
     */
    getConfig(): UncertaintyConfig {
      return {
        minSampleSize, staleDays, sampleSizeWeight, stalenessWeight,
        validationWeight, confoundingWeight, minCalibrationSamples,
      };
    },
  };
}
