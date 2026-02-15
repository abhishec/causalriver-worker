/**
 * Context-Aware Reasoner
 *
 * LLM-level cognitive capability: wires the attention mechanism into the
 * multi-hop reasoning and counterfactual simulation hot paths. Adds
 * LLM-polished explanation generation by combining structured reasoning
 * chains with rich narrative templates.
 *
 * This is the "frontal cortex" — the integration layer that makes all
 * cognitive modules work together contextually:
 * - Applies attention-weighted DAGs before reasoning
 * - Adds uncertainty bounds to all predictions
 * - Generates executive-ready explanations
 * - Provides single-call "think about X" API
 *
 * @example
 * ```typescript
 * const reasoner = createContextAwareReasoner();
 * const insight = reasoner.analyzeConnection(dag, 'engineering', 'revenue', {
 *   focusDomains: ['revenue'],
 *   recentAnomalies: [{ domain: 'engineering', severity: 0.8 }],
 * });
 * console.log(insight.executiveSummary);
 * // "Engineering changes are likely to affect revenue through a 3-hop chain
 * //  (confidence: 67%, 95% CI: 42-92%). The strongest path runs through
 * //  customer_success. Warning: 1 hop has high uncertainty due to low sample size."
 * ```
 *
 * @packageDocumentation
 */

import type { CausalDAG } from './continuous-learner';
import type { DailyTimeSeries } from './signal-to-timeseries';
import { createMultiHopReasoner, type MultiHopPrediction, type ReasoningPath } from './multi-hop-reasoner';
import { createCounterfactualSimulator, type CounterfactualIntervention, type CounterfactualResult } from './counterfactual-simulator';
import { createAttentionMechanism, type AttentionContext, type AttentionWeights } from './attention-mechanism';
import { createUncertaintyQuantifier, type UncertaintyBounds } from './uncertainty-quantifier';
import { createExplanationGenerator, type ExplanationChain, type AnomalyExplanation, type IntelligenceBriefing } from './explanation-generator';
import { createTemporalForecaster, type ForecastResult } from './temporal-forecaster';
import { createDoCalculusEstimator, type CausalDAG as DoCalcDAG } from './do-calculus';
import type { PCAlgorithmResult } from './pc-algorithm';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A comprehensive analysis of a connection between two domains
 */
export interface ConnectionAnalysis {
  /** Source domain */
  source: string;
  /** Target domain */
  target: string;
  /** Multi-hop prediction (on attention-weighted DAG) */
  prediction: MultiHopPrediction;
  /** Uncertainty bounds on the best path */
  uncertaintyBounds: UncertaintyBounds | null;
  /** Attention weights applied */
  attentionApplied: boolean;
  /** Full explanation chain */
  explanation: ExplanationChain;
  /** Executive summary (1-3 sentences) */
  executiveSummary: string;
  /** Forecast for the target domain (if time series available) */
  forecast: ForecastResult | null;
  /** Overall confidence (calibrated) */
  confidence: number;
}

/**
 * A comprehensive what-if analysis
 */
export interface WhatIfAnalysis {
  /** The intervention analyzed */
  intervention: CounterfactualIntervention;
  /** Counterfactual result */
  result: CounterfactualResult;
  /** Uncertainty assessment */
  confidenceLevel: 'low' | 'medium' | 'high';
  /** Executive summary */
  executiveSummary: string;
  /** Recommended action */
  recommendation: string;
}

/**
 * Full brain intelligence report
 */
export interface IntelligenceReport {
  /** Intelligence briefing */
  briefing: IntelligenceBriefing;
  /** Top connection insights (strongest indirect paths) */
  topConnections: ConnectionAnalysis[];
  /** Top leverage points (edges with highest downstream impact) */
  topLeveragePoints: Array<{
    source: string;
    target: string;
    leverageScore: number;
    explanation: string;
  }>;
  /** Domain forecasts */
  forecasts: Map<string, ForecastResult>;
  /** Executive summary */
  executiveSummary: string;
}

/**
 * A strategic intervention plan produced by the full cognitive stack
 */
export interface StrategicInterventionPlan {
  /** Target domain we're trying to influence */
  targetDomain: string;
  /** Direction of desired change */
  direction: 'increase' | 'decrease';
  /** Ranked interventions from counterfactual planner */
  interventions: Array<{
    rank: number;
    intervention: CounterfactualIntervention;
    impactScore: number;
    impactCI: { mean: number; lower95: number; upper95: number; std: number };
    affectedDomains: number;
    costEfficiency: number;
    narrative: string;
    /** Do-calculus identifiability (if PC structure available) */
    doCalcIdentifiable?: boolean;
    /** Do-calculus estimated ATE (if estimable) */
    doCalcATE?: number;
  }>;
  /** Multi-hop reasoning about the target domain's upstream connections */
  upstreamAnalysis: ConnectionAnalysis[];
  /** DAG quality assessment */
  dagQuality: ReturnType<ReturnType<typeof createUncertaintyQuantifier>['computeDAGConfidenceQuality']>;
  /** Executive summary */
  executiveSummary: string;
}

/**
 * Configuration for the context-aware reasoner
 */
export interface ContextAwareReasonerConfig {
  /** Max hops for multi-hop reasoning (default: 5) */
  maxHops: number;
  /** Default recency half-life for attention (default: 30) */
  recencyHalfLifeDays: number;
  /** Default forecast horizon (default: 14) */
  forecastHorizonDays: number;
  /** Max connections to analyze in full reports (default: 10) */
  maxConnectionsToAnalyze: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a context-aware reasoner — the integration layer.
 */
export function createContextAwareReasoner(config: Partial<ContextAwareReasonerConfig> = {}) {
  const {
    maxHops = 5,
    recencyHalfLifeDays = 30,
    forecastHorizonDays = 14,
    maxConnectionsToAnalyze = 10,
  } = config;

  // Instantiate all cognitive modules
  const reasoner = createMultiHopReasoner({ maxHops });
  const cfSimulator = createCounterfactualSimulator({ maxHops });
  const attention = createAttentionMechanism({ defaultRecencyHalfLifeDays: recencyHalfLifeDays });
  const uncertainty = createUncertaintyQuantifier();
  const explainer = createExplanationGenerator();
  const forecaster = createTemporalForecaster({ defaultHorizonDays: forecastHorizonDays });

  // ── Executive summary generation ─────────────────────────────────

  function generateExecutiveSummary(
    prediction: MultiHopPrediction,
    bounds: UncertaintyBounds | null,
    attentionApplied: boolean,
  ): string {
    if (!prediction.bestPath) {
      return `No causal connection found between ${prediction.source} and ${prediction.target} in the current knowledge graph.`;
    }

    const path = prediction.bestPath;
    const confPct = (prediction.reasoning.confidence * 100).toFixed(0);
    const parts: string[] = [];

    // Main finding
    if (path.hopCount === 1) {
      parts.push(
        `${prediction.source} directly affects ${prediction.target} with ${confPct}% confidence.`
      );
    } else {
      const intermediates = path.nodes.slice(1, -1).join(' → ');
      parts.push(
        `${prediction.source} affects ${prediction.target} through a ${path.hopCount}-hop chain via ${intermediates} (${confPct}% confidence).`
      );
    }

    // Uncertainty bounds
    if (bounds) {
      parts.push(
        `95% CI: ${(bounds.lower95 * 100).toFixed(0)}%–${(bounds.upper95 * 100).toFixed(0)}%.`
      );
    }

    // Timing
    parts.push(`Expected lag: ${path.totalLagDays} days.`);

    // Warnings
    if (prediction.reasoning.uncertainties.length > 0) {
      parts.push(`Warning: ${prediction.reasoning.uncertainties[0]}.`);
    }

    // Alternatives
    if (prediction.alternativePaths.length > 0) {
      parts.push(`${prediction.alternativePaths.length} alternative path(s) also exist.`);
    }

    if (attentionApplied) {
      parts.push(`(Analysis uses context-aware attention weighting.)`);
    }

    return parts.join(' ');
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    /**
     * Analyze a connection between two domains with full cognitive stack.
     * Applies attention → multi-hop reasoning → uncertainty → explanation.
     */
    analyzeConnection(
      dag: CausalDAG,
      source: string,
      target: string,
      context?: AttentionContext,
      timeSeries?: Map<string, DailyTimeSeries>,
    ): ConnectionAnalysis {
      // 1. Apply attention weighting if context provided
      const effectiveDAG = context
        ? attention.applyAttention(dag, context)
        : dag;
      const attentionApplied = !!context;

      // 2. Multi-hop reasoning on (possibly attention-weighted) DAG
      const prediction = reasoner.reason(effectiveDAG, source, target);

      // 3. Uncertainty bounds on best path
      let bounds: UncertaintyBounds | null = null;
      if (prediction.bestPath) {
        bounds = uncertainty.propagateUncertainty(prediction.bestPath, dag); // Use original DAG for uncertainty
      }

      // 4. Explanation chain
      const explanation = explainer.explainPrediction(prediction, dag);

      // 5. Executive summary
      const executiveSummary = generateExecutiveSummary(prediction, bounds, attentionApplied);

      // 6. Forecast (if time series available)
      let forecast: ForecastResult | null = null;
      if (timeSeries) {
        forecast = forecaster.forecast(timeSeries, dag, target, forecastHorizonDays);
      }

      // 7. Calibrated confidence
      const rawConfidence = prediction.reasoning.confidence;
      const uncertaintyPenalty = bounds ? bounds.pathUncertainty * 0.3 : 0;
      const confidence = Math.max(0, Math.min(1, rawConfidence - uncertaintyPenalty));

      return {
        source,
        target,
        prediction,
        uncertaintyBounds: bounds,
        attentionApplied,
        explanation,
        executiveSummary,
        forecast,
        confidence: Math.round(confidence * 100) / 100,
      };
    },

    /**
     * What-if analysis with full cognitive stack.
     */
    whatIf(
      dag: CausalDAG,
      intervention: CounterfactualIntervention,
      context?: AttentionContext,
    ): WhatIfAnalysis {
      const effectiveDAG = context
        ? attention.applyAttention(dag, context)
        : dag;

      const result = cfSimulator.simulate(effectiveDAG, intervention);

      // Confidence level based on impact score and number of affected paths
      const confLevel: WhatIfAnalysis['confidenceLevel'] =
        result.impactDeltas.length >= 5 && result.impactScore > 0.3 ? 'high' :
        result.impactDeltas.length >= 2 ? 'medium' : 'low';

      // Recommendation
      let recommendation: string;
      if (result.impactScore > 0.5) {
        recommendation = `This intervention has high impact (score: ${result.impactScore.toFixed(2)}). Proceed with caution and monitor downstream domains.`;
      } else if (result.impactScore > 0.2) {
        recommendation = `This intervention has moderate impact (score: ${result.impactScore.toFixed(2)}). Consider testing in a controlled setting first.`;
      } else {
        recommendation = `This intervention has low impact (score: ${result.impactScore.toFixed(2)}). It can likely be applied safely.`;
      }

      return {
        intervention,
        result,
        confidenceLevel: confLevel,
        executiveSummary: result.narrative,
        recommendation,
      };
    },

    /**
     * Explain an anomaly with full cognitive stack.
     */
    explainAnomaly(
      anomaly: { domain: string; metric: string; deviation: number; detectedAt: Date },
      dag: CausalDAG,
      recentSignals?: Array<{ domain: string; signalType: string; value: number; timestamp: Date }>,
      context?: AttentionContext,
    ): AnomalyExplanation {
      const effectiveDAG = context
        ? attention.applyAttention(dag, {
            ...context,
            recentAnomalies: [
              ...(context.recentAnomalies ?? []),
              { domain: anomaly.domain, severity: Math.min(1, Math.abs(anomaly.deviation) / 3) },
            ],
          })
        : dag;

      return explainer.explainAnomaly(anomaly, effectiveDAG, recentSignals);
    },

    /**
     * Generate a full intelligence report.
     */
    generateReport(
      dag: CausalDAG,
      context?: AttentionContext,
      timeSeries?: Map<string, DailyTimeSeries>,
      recentChanges?: Array<{
        type: 'edge_add' | 'edge_remove' | 'edge_strengthen' | 'edge_weaken';
        source: string; target: string; weight: number; timestamp: Date;
      }>,
    ): IntelligenceReport {
      // 1. Intelligence briefing
      const briefing = explainer.generateBriefing(dag, recentChanges);

      // 2. Find top indirect connections
      const domains = Array.from(dag.nodes);
      const connections: ConnectionAnalysis[] = [];

      for (let i = 0; i < Math.min(domains.length, 10); i++) {
        for (let j = 0; j < Math.min(domains.length, 10); j++) {
          if (i === j) continue;
          const analysis = this.analyzeConnection(dag, domains[i], domains[j], context, timeSeries);
          if (analysis.prediction.bestPath && analysis.prediction.bestPath.hopCount > 1) {
            connections.push(analysis);
          }
        }
      }
      connections.sort((a, b) => b.confidence - a.confidence);
      const topConnections = connections.slice(0, maxConnectionsToAnalyze);

      // 3. Find leverage points
      const leveragePoints = cfSimulator.findLeveragePoints(dag);
      const topLeveragePoints = leveragePoints.slice(0, 5).map(lp => ({
        source: lp.source,
        target: lp.target,
        leverageScore: lp.leverageScore,
        explanation: lp.explanation,
      }));

      // 4. Forecasts
      const forecasts = timeSeries
        ? forecaster.forecastAll(timeSeries, dag, forecastHorizonDays)
        : new Map<string, ForecastResult>();

      // 5. Executive summary
      const summaryParts = [briefing.executiveSummary];
      if (topConnections.length > 0) {
        summaryParts.push(
          `Top indirect connection: ${topConnections[0].source} → ${topConnections[0].target} (${(topConnections[0].confidence * 100).toFixed(0)}% confidence).`
        );
      }
      if (topLeveragePoints.length > 0) {
        summaryParts.push(
          `Highest leverage edge: ${topLeveragePoints[0].source} → ${topLeveragePoints[0].target}.`
        );
      }

      return {
        briefing,
        topConnections,
        topLeveragePoints,
        forecasts,
        executiveSummary: summaryParts.join(' '),
      };
    },

    /**
     * Strategic Intervention Planner — the brain's highest-level reasoning.
     *
     * Combines: attention-weighted DAG → counterfactual intervention planner →
     * multi-hop upstream analysis → do-calculus identifiability check →
     * uncertainty quantification → executive narrative.
     *
     * This is what separates an LLM-grade brain from a statistical engine:
     * it doesn't just predict, it recommends actions with causal justification.
     *
     * @param dag - The causal DAG
     * @param targetDomain - Domain to improve
     * @param direction - 'increase' or 'decrease'
     * @param context - Attention context for reweighting
     * @param pcResult - Optional PC algorithm result for do-calculus ATE estimates
     * @param timeSeries - Optional time series for forecasting
     */
    planStrategy(
      dag: CausalDAG,
      targetDomain: string,
      direction: 'increase' | 'decrease' = 'increase',
      context?: AttentionContext,
      pcResult?: PCAlgorithmResult,
      timeSeries?: Map<string, DailyTimeSeries>,
    ): StrategicInterventionPlan {
      // 1. Apply attention weighting
      const effectiveDAG = context
        ? attention.applyAttention(dag, context)
        : dag;

      // 2. Get counterfactual intervention plan
      const rawInterventions = cfSimulator.planInterventions(
        effectiveDAG, targetDomain, direction, 7
      );

      // 3. Optionally enhance with do-calculus identifiability
      let doCalcEstimator: ReturnType<typeof createDoCalculusEstimator> | null = null;
      if (pcResult) {
        try {
          doCalcEstimator = createDoCalculusEstimator(pcResult);
        } catch (err) {
          // PC result may not be compatible; continue without do-calculus: structural graph conversion may fail
        }
      }

      const enrichedInterventions = rawInterventions.map(item => {
        const enriched: StrategicInterventionPlan['interventions'][0] = { ...item };

        if (doCalcEstimator && item.intervention.source && item.intervention.target) {
          const identifiable = doCalcEstimator.isIdentifiable({
            treatment: item.intervention.source,
            treatmentValue: item.intervention.newWeight ?? item.intervention.signalValue ?? 1,
            outcome: targetDomain,
          });
          enriched.doCalcIdentifiable = identifiable;
        }

        return enriched;
      });

      // 4. Analyze upstream connections to the target
      const domains = Array.from(dag.nodes);
      const upstreamAnalysis: ConnectionAnalysis[] = [];
      for (const domain of domains) {
        if (domain === targetDomain) continue;
        const analysis = this.analyzeConnection(dag, domain, targetDomain, context, timeSeries);
        if (analysis.prediction.bestPath) {
          upstreamAnalysis.push(analysis);
        }
      }
      upstreamAnalysis.sort((a, b) => b.confidence - a.confidence);

      // 5. DAG quality assessment
      const dagQuality = uncertainty.computeDAGConfidenceQuality(dag);

      // 6. Executive summary
      const summaryParts: string[] = [];
      summaryParts.push(
        `Strategic plan to ${direction} ${targetDomain}: ${enrichedInterventions.length} interventions identified.`
      );

      if (enrichedInterventions.length > 0) {
        const best = enrichedInterventions[0];
        const bestLabel = best.intervention.type === 'inject_signal'
          ? `inject signal into ${best.intervention.source}`
          : `${best.intervention.type.replace('_', ' ')} ${best.intervention.source} → ${best.intervention.target}`;
        summaryParts.push(
          `Top strategy: ${bestLabel} (impact: ${best.impactScore.toFixed(2)}, CI: [${best.impactCI.lower95.toFixed(2)}, ${best.impactCI.upper95.toFixed(2)}]).`
        );
        if (best.doCalcIdentifiable !== undefined) {
          summaryParts.push(
            best.doCalcIdentifiable
              ? 'Do-calculus confirms this effect is causally identifiable from data.'
              : 'Warning: do-calculus cannot confirm identifiability — potential confounders.'
          );
        }
      }

      if (upstreamAnalysis.length > 0) {
        summaryParts.push(
          `${upstreamAnalysis.length} upstream domains influence ${targetDomain}; strongest: ${upstreamAnalysis[0].source} (${(upstreamAnalysis[0].confidence * 100).toFixed(0)}% confidence).`
        );
      }

      return {
        targetDomain,
        direction,
        interventions: enrichedInterventions,
        upstreamAnalysis: upstreamAnalysis.slice(0, 5),
        dagQuality,
        executiveSummary: summaryParts.join(' '),
      };
    },

    /**
     * Convert the continuous-learner's CausalDAG to do-calculus format.
     * Utility for modules that need Pearl's do-operator.
     */
    convertToDoCalcDAG(dag: CausalDAG): DoCalcDAG {
      const nodes = Array.from(dag.nodes);
      const children = new Map<string, string[]>();
      const parents = new Map<string, string[]>();

      for (const node of nodes) {
        children.set(node, []);
        parents.set(node, []);
      }

      for (const [src, neighbors] of dag.edges) {
        for (const [tgt] of neighbors) {
          children.get(src)?.push(tgt);
          parents.get(tgt)?.push(src);
        }
      }

      return { nodes, children, parents };
    },

    /**
     * Get attention summary for a given context.
     */
    getAttentionSummary(dag: CausalDAG, context: AttentionContext) {
      return attention.summarizeAttention(dag, context);
    },

    /**
     * Get DAG quality assessment.
     */
    assessDAGQuality(dag: CausalDAG) {
      return uncertainty.computeDAGConfidenceQuality(dag);
    },

    /**
     * Get the configuration.
     */
    getConfig(): ContextAwareReasonerConfig {
      return { maxHops, recencyHalfLifeDays, forecastHorizonDays, maxConnectionsToAnalyze };
    },
  };
}
