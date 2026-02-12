/**
 * Explanation Chain Generator
 *
 * LLM-level cognitive capability: the brain can compute predictions but
 * cannot explain HOW it reached them. LLMs excel at explanation. This module
 * generates natural language reasoning chains with evidence citations.
 *
 * Features:
 * - Step-by-step reasoning chains with evidence at each step
 * - Anomaly root cause explanation (trace upstream through DAG)
 * - Daily intelligence briefing generation
 * - Uncertainty flagging with impact assessment
 * - Suggested follow-up actions based on intervention opportunities
 *
 * @example
 * ```typescript
 * const generator = createExplanationGenerator();
 * const explanation = generator.explainPrediction(prediction, dag);
 * console.log(explanation.steps[0]);
 * // { stepNum: 1, inference: "Engineering deploy velocity dropped",
 * //   evidenceType: "validated_edge", confidence: 0.85, ... }
 * console.log(explanation.suggestedActions);
 * // ["Investigate CS ticket backlog (7-day lag from engineering)"]
 * ```
 *
 * @packageDocumentation
 */

import type { CausalDAG } from './continuous-learner';
import type { MultiHopPrediction, ReasoningPath } from './multi-hop-reasoner';
import type { UncertaintyBounds, EdgeUncertainty } from './uncertainty-quantifier';
import { createUncertaintyQuantifier } from './uncertainty-quantifier';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single step in an explanation chain
 */
export interface ExplanationStep {
  /** Step number (1-indexed) */
  stepNum: number;
  /** Human-readable inference at this step */
  inference: string;
  /** Type of evidence supporting this step */
  evidenceType: 'validated_edge' | 'statistical_edge' | 'confounded_edge' | 'no_edge' | 'multi_hop';
  /** Edge cited (if applicable) */
  edgeCited?: { source: string; target: string; weight: number; lagDays: number };
  /** Confidence in this step (0-1) */
  confidence: number;
  /** Uncertainty at this step */
  uncertainty?: EdgeUncertainty;
  /** Alternative explanations at this step */
  alternatives?: string[];
}

/**
 * Full explanation chain for a prediction
 */
export interface ExplanationChain {
  /** The question being answered */
  question: string;
  /** Concise answer */
  answer: string;
  /** Overall confidence in the explanation */
  confidence: number;
  /** Step-by-step reasoning */
  steps: ExplanationStep[];
  /** Key uncertainties that affect the conclusion */
  uncertainties: Array<{
    description: string;
    impact: 'low' | 'medium' | 'high';
  }>;
  /** Suggested follow-up actions */
  suggestedActions: string[];
  /** Full narrative (all steps combined into prose) */
  narrative: string;
}

/**
 * Anomaly explanation result
 */
export interface AnomalyExplanation {
  /** The anomaly being explained */
  anomaly: { domain: string; metric: string; deviation: number; detectedAt: Date };
  /** Most likely upstream cause */
  mostLikelyCause: {
    domain: string;
    confidence: number;
    lagDays: number;
    explanation: string;
  } | null;
  /** Alternative candidate causes */
  alternativeCauses: Array<{
    domain: string;
    confidence: number;
    lagDays: number;
    explanation: string;
  }>;
  /** Whether the anomaly is explainable from the causal graph */
  isExplainable: boolean;
  /** Full narrative */
  narrative: string;
}

/**
 * Daily intelligence briefing
 */
export interface IntelligenceBriefing {
  /** Briefing date */
  date: Date;
  /** Executive summary (1-3 sentences) */
  executiveSummary: string;
  /** Top causal insights */
  topInsights: Array<{
    title: string;
    description: string;
    confidence: number;
    category: 'causal_discovery' | 'anomaly' | 'prediction' | 'risk' | 'opportunity';
  }>;
  /** Risk assessment */
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: Array<{ factor: string; severity: number; description: string }>;
  };
  /** Graph health metrics */
  graphHealth: {
    totalEdges: number;
    validatedEdges: number;
    staleEdges: number;
    highUncertaintyEdges: number;
    overallQuality: number;
  };
  /** Recommended actions */
  recommendedActions: string[];
}

/**
 * Configuration for the explanation generator
 */
export interface ExplanationConfig {
  /** Maximum upstream hops for anomaly root cause analysis (default: 4) */
  maxUpstreamHops: number;
  /** Include uncertainty details in explanations (default: true) */
  includeUncertainty: boolean;
  /** Maximum suggested actions per explanation (default: 5) */
  maxSuggestedActions: number;
  /** Staleness threshold in days for graph health (default: 60) */
  staleEdgeDays: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an explanation chain generator.
 */
export function createExplanationGenerator(config: Partial<ExplanationConfig> = {}) {
  const {
    maxUpstreamHops = 4,
    includeUncertainty = true,
    maxSuggestedActions = 5,
    staleEdgeDays = 60,
  } = config;

  const uncertaintyQuantifier = createUncertaintyQuantifier();

  // ── Helpers ────────────────────────────────────────────────────────

  function evidenceTypeForEdge(edge: {
    knockoutScore?: number;
    isLikelyConfounded?: boolean;
  }): ExplanationStep['evidenceType'] {
    if (edge.isLikelyConfounded) return 'confounded_edge';
    if ((edge.knockoutScore ?? 0) > 0.5) return 'validated_edge';
    return 'statistical_edge';
  }

  function evidenceLabel(type: ExplanationStep['evidenceType']): string {
    switch (type) {
      case 'validated_edge': return 'knockout-validated causal link';
      case 'statistical_edge': return 'statistically significant correlation';
      case 'confounded_edge': return 'potentially confounded correlation';
      case 'multi_hop': return 'multi-hop inference chain';
      default: return 'inferred relationship';
    }
  }

  function formatConfidence(c: number): string {
    if (c >= 0.8) return 'high confidence';
    if (c >= 0.5) return 'moderate confidence';
    if (c >= 0.3) return 'low confidence';
    return 'very low confidence';
  }

  // ── Explain a prediction ───────────────────────────────────────────

  /**
   * Generate a full explanation chain for a multi-hop prediction.
   */
  function explainPrediction(
    prediction: MultiHopPrediction,
    dag: CausalDAG,
    context?: { recentSignals?: Array<{ domain: string; signalType: string; value: number; timestamp: Date }> },
  ): ExplanationChain {
    const steps: ExplanationStep[] = [];
    const uncertainties: ExplanationChain['uncertainties'] = [];
    const suggestedActions: string[] = [];

    const bestPath = prediction.bestPath;

    if (!bestPath) {
      return {
        question: `How does ${prediction.source} affect ${prediction.target}?`,
        answer: `No causal path found from ${prediction.source} to ${prediction.target}.`,
        confidence: 0,
        steps: [],
        uncertainties: [{ description: 'No causal connection detected in the current graph', impact: 'high' }],
        suggestedActions: [`Collect more cross-domain data between ${prediction.source} and ${prediction.target}`],
        narrative: `The brain found no causal path from ${prediction.source} to ${prediction.target}. This could mean there is no relationship, or insufficient data has been collected to detect one.`,
      };
    }

    // Build step-by-step reasoning
    for (let i = 0; i < bestPath.nodes.length - 1; i++) {
      const src = bestPath.nodes[i];
      const tgt = bestPath.nodes[i + 1];
      const edge = dag.edges.get(src)?.get(tgt);

      if (!edge) continue;

      const eType = evidenceTypeForEdge(edge);
      const eu = includeUncertainty
        ? uncertaintyQuantifier.computeEdgeUncertainty(src, tgt, dag)
        : undefined;

      const step: ExplanationStep = {
        stepNum: i + 1,
        inference: i === 0
          ? `Change in ${src} triggers downstream effect on ${tgt} (${evidenceLabel(eType)}, weight: ${edge.weight.toFixed(2)}, ${edge.lagDays}-day lag)`
          : `${src} effect propagates to ${tgt} (${evidenceLabel(eType)}, weight: ${edge.weight.toFixed(2)}, ${edge.lagDays}-day lag)`,
        evidenceType: eType,
        edgeCited: { source: src, target: tgt, weight: edge.weight, lagDays: edge.lagDays },
        confidence: edge.weight,
        uncertainty: eu ?? undefined,
      };

      // Add alternatives if this hop has low confidence
      if (edge.weight < 0.4) {
        step.alternatives = [`This ${src} → ${tgt} link is weak (weight: ${edge.weight.toFixed(2)}) — the effect may not propagate`];
      }

      steps.push(step);

      // Track uncertainties
      if (eu && (eu.category === 'high' || eu.category === 'very_high')) {
        uncertainties.push({
          description: `Hop ${i + 1} (${src}→${tgt}): ${eu.sources[0]?.description ?? 'High uncertainty'}`,
          impact: eu.category === 'very_high' ? 'high' : 'medium',
        });
      }

      if (edge.isLikelyConfounded) {
        uncertainties.push({
          description: `${src}→${tgt} may be confounded — correlation does not imply causation`,
          impact: 'medium',
        });
      }
    }

    // Suggested actions
    if (bestPath.hopCount > 1) {
      // Find intermediate nodes that could be monitored
      const intermediates = bestPath.nodes.slice(1, -1);
      for (const node of intermediates) {
        suggestedActions.push(`Monitor ${node} for early detection (intermediate in the causal chain)`);
      }
    }

    // If confounded hops, suggest validation
    const confoundedHops = bestPath.nodes.slice(0, -1).filter((_, i) => bestPath.hopConfounded[i]);
    if (confoundedHops.length > 0) {
      suggestedActions.push(`Run controlled experiments to validate confounded edges: ${confoundedHops.join(', ')}`);
    }

    // If high lag, suggest proactive monitoring
    if (bestPath.totalLagDays > 14) {
      suggestedActions.push(`Set up early warning alerts — total cascade lag is ${bestPath.totalLagDays} days`);
    }

    // Cap actions
    const finalActions = suggestedActions.slice(0, maxSuggestedActions);

    // Build narrative
    const narrativeParts = [
      `The brain predicts that ${prediction.source} affects ${prediction.target} with ${formatConfidence(prediction.reasoning.confidence)} (${(prediction.reasoning.confidence * 100).toFixed(1)}%).`,
    ];

    if (bestPath.hopCount === 1) {
      narrativeParts.push(`This is a direct causal link.`);
    } else {
      narrativeParts.push(`This is a ${bestPath.hopCount}-hop chain: ${bestPath.nodes.join(' → ')}.`);
    }

    narrativeParts.push(`Total expected lag: ${bestPath.totalLagDays} days.`);

    if (prediction.alternativePaths.length > 0) {
      narrativeParts.push(`${prediction.alternativePaths.length} alternative path(s) also exist.`);
    }

    if (uncertainties.length > 0) {
      narrativeParts.push(`Key uncertainties: ${uncertainties.map(u => u.description).join('; ')}.`);
    }

    return {
      question: `How does ${prediction.source} affect ${prediction.target}?`,
      answer: prediction.reasoning.explanation,
      confidence: prediction.reasoning.confidence,
      steps,
      uncertainties,
      suggestedActions: finalActions,
      narrative: narrativeParts.join(' '),
    };
  }

  // ── Explain an anomaly ─────────────────────────────────────────────

  /**
   * Explain why an anomaly occurred by tracing upstream causes through the DAG.
   */
  function explainAnomaly(
    anomaly: { domain: string; metric: string; deviation: number; detectedAt: Date },
    dag: CausalDAG,
    recentSignals?: Array<{ domain: string; signalType: string; value: number; timestamp: Date }>,
  ): AnomalyExplanation {
    // Find all upstream domains that could have caused this anomaly
    // Reverse BFS: look for edges that point TO the anomaly domain
    const candidates: Array<{
      domain: string;
      confidence: number;
      lagDays: number;
      path: string[];
      isValidated: boolean;
    }> = [];

    // Build reverse adjacency for tracing upstream
    const reverseEdges = new Map<string, Map<string, {
      weight: number; lagDays: number;
      knockoutScore?: number; isLikelyConfounded?: boolean;
    }>>();

    for (const [src, neighbors] of dag.edges) {
      for (const [tgt, edge] of neighbors) {
        if (!reverseEdges.has(tgt)) reverseEdges.set(tgt, new Map());
        reverseEdges.get(tgt)!.set(src, edge);
      }
    }

    // BFS upstream from anomaly domain
    const visited = new Set<string>();
    const queue: Array<{ node: string; confidence: number; lagDays: number; path: string[] }> = [
      { node: anomaly.domain, confidence: 1, lagDays: 0, path: [anomaly.domain] },
    ];

    while (queue.length > 0) {
      const { node, confidence, lagDays, path } = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);

      if (node !== anomaly.domain) {
        // Check if there's a recent signal from this domain within the lag window
        let signalMatch = false;
        if (recentSignals) {
          for (const signal of recentSignals) {
            if (signal.domain.toLowerCase() === node.toLowerCase()) {
              const signalAge = (anomaly.detectedAt.getTime() - signal.timestamp.getTime()) / (1000 * 60 * 60 * 24);
              if (signalAge >= 0 && signalAge <= lagDays * 1.5) {
                signalMatch = true;
                break;
              }
            }
          }
        }

        const upstreamEdge = reverseEdges.get(path[path.length - 2])?.get(node)
          ?? reverseEdges.get(anomaly.domain)?.get(node);
        const isValidated = upstreamEdge
          ? (upstreamEdge.knockoutScore ?? 0) > 0.5 && !upstreamEdge.isLikelyConfounded
          : false;

        // Boost confidence if signal matches timing
        const adjustedConfidence = signalMatch ? confidence * 1.3 : confidence;

        candidates.push({
          domain: node,
          confidence: Math.min(1, adjustedConfidence),
          lagDays,
          path: [...path].reverse(),
          isValidated,
        });
      }

      if (path.length - 1 >= maxUpstreamHops) continue;

      const upstream = reverseEdges.get(node);
      if (!upstream) continue;

      for (const [upNode, edge] of upstream) {
        if (visited.has(upNode)) continue;
        queue.push({
          node: upNode,
          confidence: confidence * edge.weight * 0.9,
          lagDays: lagDays + edge.lagDays,
          path: [...path, upNode],
        });
      }
    }

    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);

    const mostLikely = candidates[0] ?? null;
    const alternatives = candidates.slice(1, 4);

    // Build narrative
    const narrativeParts: string[] = [];
    narrativeParts.push(
      `Anomaly detected in ${anomaly.domain} (${anomaly.metric}): deviation of ${anomaly.deviation.toFixed(2)} standard deviations.`
    );

    if (mostLikely) {
      narrativeParts.push(
        `Most likely upstream cause: ${mostLikely.domain} (${(mostLikely.confidence * 100).toFixed(0)}% confidence, ${mostLikely.lagDays}-day expected lag${mostLikely.isValidated ? ', knockout-validated' : ''}).`
      );
      narrativeParts.push(`Path: ${mostLikely.path.join(' → ')}.`);
    } else {
      narrativeParts.push(
        `No clear upstream cause found in the causal graph — this anomaly may be exogenous (external factor).`
      );
    }

    if (alternatives.length > 0) {
      narrativeParts.push(
        `Alternative explanations: ${alternatives.map(a => `${a.domain} (${(a.confidence * 100).toFixed(0)}%)`).join(', ')}.`
      );
    }

    return {
      anomaly,
      mostLikelyCause: mostLikely ? {
        domain: mostLikely.domain,
        confidence: mostLikely.confidence,
        lagDays: mostLikely.lagDays,
        explanation: `${mostLikely.domain} change propagated to ${anomaly.domain} via ${mostLikely.path.join(' → ')}`,
      } : null,
      alternativeCauses: alternatives.map(a => ({
        domain: a.domain,
        confidence: a.confidence,
        lagDays: a.lagDays,
        explanation: `${a.domain} change propagated to ${anomaly.domain} via ${a.path.join(' → ')}`,
      })),
      isExplainable: mostLikely !== null,
      narrative: narrativeParts.join(' '),
    };
  }

  // ── Generate intelligence briefing ─────────────────────────────────

  /**
   * Generate a daily intelligence briefing summarizing what the brain knows.
   */
  function generateBriefing(
    dag: CausalDAG,
    recentChanges?: Array<{
      type: 'edge_add' | 'edge_remove' | 'edge_strengthen' | 'edge_weaken';
      source: string; target: string; weight: number; timestamp: Date;
    }>,
    topInsights?: Array<{
      title: string; description: string; confidence: number;
      category: 'causal_discovery' | 'anomaly' | 'prediction' | 'risk' | 'opportunity';
    }>,
  ): IntelligenceBriefing {
    const now = new Date();

    // Graph health metrics
    let totalEdges = 0;
    let validatedEdges = 0;
    let staleEdges = 0;
    const staleThreshold = staleEdgeDays * 24 * 60 * 60 * 1000;

    for (const [, neighbors] of dag.edges) {
      for (const [, edge] of neighbors) {
        totalEdges++;
        if ((edge.knockoutScore ?? 0) > 0.5 && !edge.isLikelyConfounded) {
          validatedEdges++;
        }
        if (now.getTime() - edge.lastUpdated.getTime() > staleThreshold) {
          staleEdges++;
        }
      }
    }

    const dagQuality = uncertaintyQuantifier.computeDAGConfidenceQuality(dag);

    const graphHealth = {
      totalEdges,
      validatedEdges,
      staleEdges,
      highUncertaintyEdges: dagQuality.highUncertaintyCount,
      overallQuality: dagQuality.quality,
    };

    // Risk assessment
    const riskFactors: IntelligenceBriefing['riskAssessment']['riskFactors'] = [];

    if (staleEdges > totalEdges * 0.3) {
      riskFactors.push({
        factor: 'stale_edges',
        severity: 0.7,
        description: `${staleEdges} of ${totalEdges} edges are stale (>${staleEdgeDays} days old)`,
      });
    }
    if (dagQuality.highUncertaintyCount > totalEdges * 0.2) {
      riskFactors.push({
        factor: 'high_uncertainty',
        severity: 0.6,
        description: `${dagQuality.highUncertaintyCount} edges have high uncertainty — predictions may be unreliable`,
      });
    }
    if (validatedEdges < totalEdges * 0.3 && totalEdges > 0) {
      riskFactors.push({
        factor: 'low_validation',
        severity: 0.5,
        description: `Only ${validatedEdges} of ${totalEdges} edges are knockout-validated`,
      });
    }

    const maxSeverity = riskFactors.reduce((m, r) => Math.max(m, r.severity), 0);
    const overallRisk: IntelligenceBriefing['riskAssessment']['overallRisk'] =
      maxSeverity >= 0.8 ? 'critical' :
      maxSeverity >= 0.6 ? 'high' :
      maxSeverity >= 0.3 ? 'medium' : 'low';

    // Recommended actions
    const actions: string[] = [];
    if (staleEdges > 0) {
      actions.push(`Refresh ${staleEdges} stale edge(s) by collecting new cross-domain signals`);
    }
    if (totalEdges > 0 && validatedEdges / totalEdges < 0.5) {
      actions.push(`Run knockout validation on unvalidated edges to confirm causal direction`);
    }
    if (dagQuality.highUncertaintyCount > 0) {
      actions.push(`Investigate ${dagQuality.highUncertaintyCount} high-uncertainty edge(s) — may need more data or controlled experiments`);
    }
    if (recentChanges && recentChanges.filter(c => c.type === 'edge_add').length > 0) {
      const newEdges = recentChanges.filter(c => c.type === 'edge_add');
      actions.push(`Review ${newEdges.length} newly discovered causal relationship(s)`);
    }

    // Executive summary
    const summaryParts: string[] = [];
    summaryParts.push(`The causal graph has ${totalEdges} edge(s) across ${dag.nodes.size} domain(s)`);
    summaryParts.push(`overall quality: ${dagQuality.category}`);
    if (recentChanges && recentChanges.length > 0) {
      summaryParts.push(`${recentChanges.length} graph change(s) since last briefing`);
    }
    if (topInsights && topInsights.length > 0) {
      summaryParts.push(`${topInsights.length} top insight(s) to review`);
    }

    return {
      date: now,
      executiveSummary: summaryParts.join('. ') + '.',
      topInsights: topInsights ?? [],
      riskAssessment: {
        overallRisk,
        riskFactors,
      },
      graphHealth,
      recommendedActions: actions.slice(0, maxSuggestedActions),
    };
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    /**
     * Generate a full explanation chain for a multi-hop prediction.
     * Step-by-step reasoning with evidence citations and uncertainty flags.
     */
    explainPrediction(
      prediction: MultiHopPrediction,
      dag: CausalDAG,
      context?: { recentSignals?: Array<{ domain: string; signalType: string; value: number; timestamp: Date }> },
    ): ExplanationChain {
      return explainPrediction(prediction, dag, context);
    },

    /**
     * Explain why an anomaly occurred by tracing upstream causes.
     */
    explainAnomaly(
      anomaly: { domain: string; metric: string; deviation: number; detectedAt: Date },
      dag: CausalDAG,
      recentSignals?: Array<{ domain: string; signalType: string; value: number; timestamp: Date }>,
    ): AnomalyExplanation {
      return explainAnomaly(anomaly, dag, recentSignals);
    },

    /**
     * Generate a daily intelligence briefing.
     */
    generateBriefing(
      dag: CausalDAG,
      recentChanges?: Array<{
        type: 'edge_add' | 'edge_remove' | 'edge_strengthen' | 'edge_weaken';
        source: string; target: string; weight: number; timestamp: Date;
      }>,
      topInsights?: Array<{
        title: string; description: string; confidence: number;
        category: 'causal_discovery' | 'anomaly' | 'prediction' | 'risk' | 'opportunity';
      }>,
    ): IntelligenceBriefing {
      return generateBriefing(dag, recentChanges, topInsights);
    },

    /**
     * Quick one-liner explanation for a reasoning path (for UI tooltips).
     */
    summarizePath(path: ReasoningPath): string {
      if (path.hopCount === 1) {
        return `Direct link: ${path.nodes[0]} → ${path.nodes[1]} (${(path.pathConfidence * 100).toFixed(0)}% confidence, ${path.totalLagDays}d lag)`;
      }
      return `${path.hopCount}-hop chain: ${path.nodes.join(' → ')} (${(path.pathConfidence * 100).toFixed(0)}% confidence, ${path.totalLagDays}d total lag)`;
    },

    /**
     * Generate uncertainty narrative for a path.
     */
    explainUncertainty(bounds: UncertaintyBounds): string {
      const parts = [
        `Prediction: ${(bounds.prediction * 100).toFixed(1)}% (95% CI: ${(bounds.lower95 * 100).toFixed(1)}%–${(bounds.upper95 * 100).toFixed(1)}%).`,
      ];

      if (bounds.category === 'high' || bounds.category === 'very_high') {
        parts.push(`Warning: ${bounds.category.replace('_', ' ')} uncertainty.`);
      }

      if (bounds.sources.length > 0) {
        const topSource = bounds.sources[0];
        parts.push(`Main uncertainty source: ${topSource.description}.`);
      }

      return parts.join(' ');
    },

    /**
     * Get the configuration.
     */
    getConfig(): ExplanationConfig {
      return { maxUpstreamHops, includeUncertainty, maxSuggestedActions, staleEdgeDays };
    },
  };
}
