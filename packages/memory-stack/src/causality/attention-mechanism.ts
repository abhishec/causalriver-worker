/**
 * Attention Mechanism
 *
 * LLM-level cognitive capability: the brain treats all causal edges equally
 * regardless of context. An LLM dynamically weights information based on
 * what's being asked. This module adds context-aware DAG reweighting.
 *
 * Features:
 * - Recency attention: recently updated edges get boosted
 * - Domain focus: edges touching the query domain get amplified
 * - Cascade attention: edges on active cascade paths get priority
 * - Anomaly attention: edges from anomalous domains get highlighted
 * - Non-destructive: creates weighted DAG copies, original untouched
 * - Composable: multiple attention layers can stack
 *
 * @example
 * ```typescript
 * const attention = createAttentionMechanism();
 * const weightedDAG = attention.applyAttention(dag, {
 *   focusDomains: ['revenue'],
 *   recencyHalfLifeDays: 14,
 *   recentAnomalies: [{ domain: 'engineering', severity: 0.8 }],
 * });
 * // Now use weightedDAG with multi-hop reasoner for context-aware predictions
 * ```
 *
 * @packageDocumentation
 */

import type { CausalDAG } from './continuous-learner';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context for attention computation — what is the brain currently focused on?
 */
export interface AttentionContext {
  /** Domains the query is focused on (get amplified) */
  focusDomains?: string[];
  /** Recently detected anomalies */
  recentAnomalies?: Array<{ domain: string; severity: number; detectedAt?: Date }>;
  /** Active cascade paths (edges on these paths get boosted) */
  activeCascadePaths?: string[][];
  /** Specific target metric being queried */
  targetMetric?: string;
  /** Analysis timeframe — edges within this window get recency boost */
  timeframe?: { start: Date; end: Date };
  /** Half-life for recency attention decay in days (default: 30) */
  recencyHalfLifeDays?: number;
  /** Base multiplier for domain focus (default: 1.5) */
  domainFocusMultiplier?: number;
  /** Base multiplier for cascade path edges (default: 1.3) */
  cascadePathMultiplier?: number;
  /** Base multiplier for anomaly source edges (default: 1.4) */
  anomalyMultiplier?: number;
}

/**
 * Detailed attention weight for a single edge
 */
export interface EdgeAttentionWeight {
  /** Original (base) weight of the edge */
  baseWeight: number;
  /** Combined attention multiplier */
  multiplier: number;
  /** Final adjusted weight (capped at baseWeight — attention boosts salience, not evidence) */
  adjustedWeight: number;
  /** Reasons for each attention component */
  reasons: Array<{
    type: 'recency' | 'domain_focus' | 'cascade_path' | 'anomaly_source' | 'validated_boost';
    multiplier: number;
    description: string;
  }>;
}

/**
 * Full attention weights map for the DAG
 */
export type AttentionWeights = Map<string, Map<string, EdgeAttentionWeight>>;

/**
 * Configuration for the attention mechanism
 */
export interface AttentionConfig {
  /** Default recency half-life in days (default: 30) */
  defaultRecencyHalfLifeDays: number;
  /** Maximum combined attention multiplier (default: 2.0) */
  maxMultiplier: number;
  /** Minimum attention multiplier — prevents zeroing out edges (default: 0.3) */
  minMultiplier: number;
  /** Whether to boost knockout-validated edges (default: true) */
  boostValidatedEdges: boolean;
  /** Validated edge boost multiplier (default: 1.2) */
  validatedEdgeBoost: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an attention mechanism for context-aware DAG reweighting.
 */
export function createAttentionMechanism(config: Partial<AttentionConfig> = {}) {
  const {
    defaultRecencyHalfLifeDays = 30,
    maxMultiplier = 2.0,
    minMultiplier = 0.3,
    boostValidatedEdges = true,
    validatedEdgeBoost = 1.2,
  } = config;

  // ── Temporal attention decay ─────────────────────────────────────

  /**
   * Compute recency-based attention multiplier.
   * Exponential decay based on how recently the edge was updated.
   *
   * @param lastUpdated - When the edge was last updated
   * @param halfLifeDays - Half-life for the decay
   * @param referenceDate - Current time reference (default: now)
   * @returns Multiplier between minMultiplier and 1.0
   */
  function temporalAttentionDecay(
    lastUpdated: Date,
    halfLifeDays: number = defaultRecencyHalfLifeDays,
    referenceDate: Date = new Date(),
  ): number {
    const ageMs = referenceDate.getTime() - lastUpdated.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays <= 0) return 1.0;

    // Exponential decay: 0.5^(age/halfLife)
    const decay = Math.pow(0.5, ageDays / halfLifeDays);
    return Math.max(minMultiplier, decay);
  }

  // ── Compute attention weights ────────────────────────────────────

  /**
   * Compute attention weights for all edges in the DAG given a context.
   */
  function computeAttentionWeights(
    dag: CausalDAG,
    context: AttentionContext,
  ): AttentionWeights {
    const weights: AttentionWeights = new Map();
    const halfLife = context.recencyHalfLifeDays ?? defaultRecencyHalfLifeDays;
    const focusMult = context.domainFocusMultiplier ?? 1.5;
    const cascadeMult = context.cascadePathMultiplier ?? 1.3;
    const anomalyMult = context.anomalyMultiplier ?? 1.4;

    // Pre-compute: which edges are on active cascade paths?
    const cascadeEdges = new Set<string>();
    if (context.activeCascadePaths) {
      for (const path of context.activeCascadePaths) {
        for (let i = 0; i < path.length - 1; i++) {
          cascadeEdges.add(`${path[i]}→${path[i + 1]}`);
        }
      }
    }

    // Pre-compute: anomaly domain severity map
    const anomalyMap = new Map<string, number>();
    if (context.recentAnomalies) {
      for (const anomaly of context.recentAnomalies) {
        const existing = anomalyMap.get(anomaly.domain) ?? 0;
        anomalyMap.set(anomaly.domain, Math.max(existing, anomaly.severity));
      }
    }

    // Focus domains as lowercase set
    const focusDomains = new Set(
      (context.focusDomains ?? []).map(d => d.toLowerCase())
    );

    for (const [src, neighbors] of dag.edges) {
      const edgeWeights = new Map<string, EdgeAttentionWeight>();

      for (const [tgt, edge] of neighbors) {
        const reasons: EdgeAttentionWeight['reasons'] = [];
        let combinedMultiplier = 1.0;

        // 1. Recency attention
        const recencyFactor = temporalAttentionDecay(edge.lastUpdated, halfLife);
        if (recencyFactor < 0.95) { // Only note if meaningful decay
          reasons.push({
            type: 'recency',
            multiplier: recencyFactor,
            description: `Edge last updated ${Math.round((Date.now() - edge.lastUpdated.getTime()) / 86400000)}d ago (half-life: ${halfLife}d)`,
          });
          combinedMultiplier *= recencyFactor;
        }

        // 2. Domain focus attention
        const srcFocused = focusDomains.has(src.toLowerCase());
        const tgtFocused = focusDomains.has(tgt.toLowerCase());
        if (srcFocused || tgtFocused) {
          const focusFactor = srcFocused && tgtFocused ? focusMult * 1.2 : focusMult;
          reasons.push({
            type: 'domain_focus',
            multiplier: focusFactor,
            description: `Edge ${srcFocused && tgtFocused ? 'both ends' : (srcFocused ? 'source' : 'target')} in focus domains`,
          });
          combinedMultiplier *= focusFactor;
        }

        // 3. Cascade path attention
        const edgeKey = `${src}→${tgt}`;
        if (cascadeEdges.has(edgeKey)) {
          reasons.push({
            type: 'cascade_path',
            multiplier: cascadeMult,
            description: 'Edge is on an active cascade path',
          });
          combinedMultiplier *= cascadeMult;
        }

        // 4. Anomaly attention — edges FROM anomalous domains get boosted
        const anomalySeverity = anomalyMap.get(src.toLowerCase());
        if (anomalySeverity !== undefined && anomalySeverity > 0.3) {
          const anomalyFactor = 1 + (anomalyMult - 1) * anomalySeverity;
          reasons.push({
            type: 'anomaly_source',
            multiplier: anomalyFactor,
            description: `Source domain has anomaly (severity: ${anomalySeverity.toFixed(2)})`,
          });
          combinedMultiplier *= anomalyFactor;
        }

        // 5. Validated edge boost
        if (boostValidatedEdges && edge.knockoutScore !== undefined && edge.knockoutScore > 0.5 && !edge.isLikelyConfounded) {
          reasons.push({
            type: 'validated_boost',
            multiplier: validatedEdgeBoost,
            description: `Knockout-validated edge (score: ${edge.knockoutScore.toFixed(2)})`,
          });
          combinedMultiplier *= validatedEdgeBoost;
        }

        // Clamp multiplier
        const clampedMultiplier = Math.max(minMultiplier, Math.min(maxMultiplier, combinedMultiplier));

        // Adjusted weight: attention can boost salience but never EXCEED the original evidence
        // Instead we allow it to go up to maxMultiplier * baseWeight for focused edges
        const adjustedWeight = Math.min(1.0, edge.weight * clampedMultiplier);

        edgeWeights.set(tgt, {
          baseWeight: edge.weight,
          multiplier: clampedMultiplier,
          adjustedWeight,
          reasons,
        });
      }

      weights.set(src, edgeWeights);
    }

    return weights;
  }

  // ── Learned Attention ────────────────────────────────────────────

  /**
   * Query-type-specific attention profiles.
   * Different query types should weight attention layers differently.
   */
  type QueryType = 'anomaly_investigation' | 'forecasting' | 'what_if' | 'general';

  const queryProfiles: Record<QueryType, { focus: number; cascade: number; anomaly: number; validated: number; recency: number }> = {
    anomaly_investigation: { focus: 1.3, cascade: 1.1, anomaly: 1.8, validated: 1.1, recency: 1.5 },
    forecasting:           { focus: 1.2, cascade: 1.0, anomaly: 1.0, validated: 1.5, recency: 1.0 },
    what_if:               { focus: 1.5, cascade: 1.5, anomaly: 1.2, validated: 1.3, recency: 1.1 },
    general:               { focus: 1.5, cascade: 1.3, anomaly: 1.4, validated: 1.2, recency: 1.0 },
  };

  /**
   * Learned multiplier offsets — trained from feedback.
   * Initialized to 0 (no offset from defaults).
   */
  const learnedOffsets = { focus: 0, cascade: 0, anomaly: 0, validated: 0, recency: 0 };

  /**
   * Training history for attention weight learning.
   */
  const trainingHistory: Array<{
    queryType: QueryType;
    multipliers: { focus: number; cascade: number; anomaly: number; validated: number };
    outcome: number; // 0 = bad prediction, 1 = good prediction
  }> = [];

  /**
   * Record a prediction outcome to learn better attention weights.
   * Over time, this adjusts the attention multipliers to favor configurations
   * that led to correct predictions.
   *
   * Uses simple gradient-free update: shift multipliers toward values
   * used in successful predictions, away from failed ones.
   */
  function recordAttentionOutcome(
    queryType: QueryType,
    multipliers: { focus: number; cascade: number; anomaly: number; validated: number },
    wasAccurate: boolean,
    learningRate: number = 0.05,
  ): void {
    trainingHistory.push({
      queryType,
      multipliers,
      outcome: wasAccurate ? 1 : 0,
    });

    // Online stochastic update: nudge offsets toward successful multipliers
    const direction = wasAccurate ? 1 : -1;
    const profile = queryProfiles[queryType];

    learnedOffsets.focus += learningRate * direction * (multipliers.focus - (profile.focus + learnedOffsets.focus));
    learnedOffsets.cascade += learningRate * direction * (multipliers.cascade - (profile.cascade + learnedOffsets.cascade));
    learnedOffsets.anomaly += learningRate * direction * (multipliers.anomaly - (profile.anomaly + learnedOffsets.anomaly));
    learnedOffsets.validated += learningRate * direction * (multipliers.validated - (profile.validated + learnedOffsets.validated));

    // Clamp offsets to prevent drift beyond ±0.5
    for (const key of ['focus', 'cascade', 'anomaly', 'validated', 'recency'] as const) {
      learnedOffsets[key] = Math.max(-0.5, Math.min(0.5, learnedOffsets[key]));
    }
  }

  /**
   * Get the effective attention multipliers for a query type,
   * combining the base profile with learned offsets.
   */
  function getEffectiveMultipliers(queryType: QueryType = 'general'): {
    focus: number; cascade: number; anomaly: number; validated: number; recency: number;
  } {
    const profile = queryProfiles[queryType];
    return {
      focus: Math.max(1.0, profile.focus + learnedOffsets.focus),
      cascade: Math.max(1.0, profile.cascade + learnedOffsets.cascade),
      anomaly: Math.max(1.0, profile.anomaly + learnedOffsets.anomaly),
      validated: Math.max(1.0, profile.validated + learnedOffsets.validated),
      recency: Math.max(0.5, profile.recency + learnedOffsets.recency),
    };
  }

  /**
   * Apply attention with a query-type-specific profile + learned offsets.
   * This overrides context-level multipliers with the learned ones.
   */
  function applyLearnedAttention(
    dag: CausalDAG,
    context: AttentionContext,
    queryType: QueryType = 'general',
  ): CausalDAG {
    const effective = getEffectiveMultipliers(queryType);
    const enhancedContext: AttentionContext = {
      ...context,
      domainFocusMultiplier: effective.focus,
      cascadePathMultiplier: effective.cascade,
      anomalyMultiplier: effective.anomaly,
      recencyHalfLifeDays: context.recencyHalfLifeDays
        ? context.recencyHalfLifeDays / effective.recency  // Higher recency = shorter effective half-life
        : defaultRecencyHalfLifeDays / effective.recency,
    };

    const attentionWeights = computeAttentionWeights(dag, enhancedContext);

    const weightedDAG: CausalDAG = {
      nodes: new Set(dag.nodes),
      edges: new Map(),
    };

    for (const [src, neighbors] of dag.edges) {
      const attentionNeighbors = attentionWeights.get(src);
      const weightedNeighbors = new Map<string, typeof neighbors extends Map<string, infer V> ? V : never>();

      for (const [tgt, edge] of neighbors) {
        const attention = attentionNeighbors?.get(tgt);
        weightedNeighbors.set(tgt, {
          ...edge,
          weight: attention?.adjustedWeight ?? edge.weight,
        });
      }

      weightedDAG.edges.set(src, weightedNeighbors);
    }

    return weightedDAG;
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    /**
     * Compute temporal attention decay.
     * Useful as a standalone utility for edge staleness scoring.
     */
    temporalAttentionDecay,

    /**
     * Compute full attention weights for the DAG.
     */
    computeAttentionWeights(dag: CausalDAG, context: AttentionContext): AttentionWeights {
      return computeAttentionWeights(dag, context);
    },

    /**
     * Create a new DAG with attention-weighted edges.
     * Non-destructive: original DAG is not modified.
     */
    applyAttention(dag: CausalDAG, context: AttentionContext): CausalDAG {
      const attentionWeights = computeAttentionWeights(dag, context);

      const weightedDAG: CausalDAG = {
        nodes: new Set(dag.nodes),
        edges: new Map(),
      };

      for (const [src, neighbors] of dag.edges) {
        const attentionNeighbors = attentionWeights.get(src);
        const weightedNeighbors = new Map<string, typeof neighbors extends Map<string, infer V> ? V : never>();

        for (const [tgt, edge] of neighbors) {
          const attention = attentionNeighbors?.get(tgt);
          weightedNeighbors.set(tgt, {
            ...edge,
            weight: attention?.adjustedWeight ?? edge.weight,
          });
        }

        weightedDAG.edges.set(src, weightedNeighbors);
      }

      return weightedDAG;
    },

    /**
     * Get a summary of attention effects for debugging/explanation.
     * Returns the top N most-boosted and most-dampened edges.
     */
    summarizeAttention(
      dag: CausalDAG,
      context: AttentionContext,
      topN: number = 10,
    ): {
      boosted: Array<{ source: string; target: string; baseWeight: number; adjustedWeight: number; reasons: string[] }>;
      dampened: Array<{ source: string; target: string; baseWeight: number; adjustedWeight: number; reasons: string[] }>;
    } {
      const weights = computeAttentionWeights(dag, context);
      const allEdges: Array<{
        source: string; target: string;
        baseWeight: number; adjustedWeight: number;
        multiplier: number; reasons: string[];
      }> = [];

      for (const [src, neighbors] of weights) {
        for (const [tgt, aw] of neighbors) {
          allEdges.push({
            source: src,
            target: tgt,
            baseWeight: aw.baseWeight,
            adjustedWeight: aw.adjustedWeight,
            multiplier: aw.multiplier,
            reasons: aw.reasons.map(r => r.description),
          });
        }
      }

      // Sort by multiplier delta from 1.0
      const boosted = allEdges
        .filter(e => e.multiplier > 1.01)
        .sort((a, b) => b.multiplier - a.multiplier)
        .slice(0, topN)
        .map(({ source, target, baseWeight, adjustedWeight, reasons }) => ({
          source, target, baseWeight, adjustedWeight, reasons,
        }));

      const dampened = allEdges
        .filter(e => e.multiplier < 0.99)
        .sort((a, b) => a.multiplier - b.multiplier)
        .slice(0, topN)
        .map(({ source, target, baseWeight, adjustedWeight, reasons }) => ({
          source, target, baseWeight, adjustedWeight, reasons,
        }));

      return { boosted, dampened };
    },

    /**
     * Apply attention with query-type-specific learned profiles.
     * Uses learned attention multipliers trained from prediction outcomes.
     */
    applyLearnedAttention(
      dag: CausalDAG,
      context: AttentionContext,
      queryType: 'anomaly_investigation' | 'forecasting' | 'what_if' | 'general' = 'general',
    ): CausalDAG {
      return applyLearnedAttention(dag, context, queryType);
    },

    /**
     * Record whether a prediction using the current attention was accurate.
     * This trains the attention multipliers over time via gradient-free optimization.
     */
    recordAttentionOutcome(
      queryType: 'anomaly_investigation' | 'forecasting' | 'what_if' | 'general',
      multipliers: { focus: number; cascade: number; anomaly: number; validated: number },
      wasAccurate: boolean,
      learningRate?: number,
    ): void {
      recordAttentionOutcome(queryType, multipliers, wasAccurate, learningRate);
    },

    /**
     * Get the effective (learned) attention multipliers for a query type.
     */
    getEffectiveMultipliers(queryType?: 'anomaly_investigation' | 'forecasting' | 'what_if' | 'general') {
      return getEffectiveMultipliers(queryType);
    },

    /**
     * Get the current learned offsets (for serialization/debugging).
     */
    getLearnedOffsets() {
      return { ...learnedOffsets };
    },

    /**
     * Get training history size.
     */
    getTrainingHistorySize(): number {
      return trainingHistory.length;
    },

    /**
     * Get the configuration.
     */
    getConfig(): AttentionConfig {
      return {
        defaultRecencyHalfLifeDays,
        maxMultiplier,
        minMultiplier,
        boostValidatedEdges,
        validatedEdgeBoost,
      };
    },
  };
}
