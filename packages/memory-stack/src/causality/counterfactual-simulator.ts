/**
 * Counterfactual Simulator
 *
 * LLM-level cognitive capability: the brain can see what IS but cannot
 * reason about "what if X hadn't happened?" or "what if we changed this edge?"
 * This module adds counterfactual reasoning — essential for intervention planning.
 *
 * Features:
 * - Deep-clone DAG and apply interventions (remove, weaken, strengthen edges)
 * - Inject hypothetical signals and trace downstream effects
 * - Compare baseline vs counterfactual predictions across all paths
 * - Generate natural language narrative of expected consequences
 * - Identify which interventions have the highest leverage
 *
 * @example
 * ```typescript
 * const simulator = createCounterfactualSimulator();
 * const result = simulator.whatIf(dag, {
 *   type: 'weaken_edge',
 *   source: 'engineering',
 *   target: 'customer_success',
 *   newWeight: 0.1,
 * });
 * console.log(result.narrative);
 * // "Weakening engineering → customer_success from 0.7 to 0.1 would reduce
 * //  downstream impact on revenue by 57%, with 3 paths affected."
 * ```
 *
 * @packageDocumentation
 */

import type { CausalDAG } from './continuous-learner';
import { createMultiHopReasoner, type MultiHopPrediction, type ReasoningPath } from './multi-hop-reasoner';

// ============================================================================
// TYPES
// ============================================================================

/**
 * An intervention to apply to the DAG for counterfactual analysis
 */
export interface CounterfactualIntervention {
  /** Type of intervention */
  type: 'remove_edge' | 'weaken_edge' | 'strengthen_edge' | 'inject_signal' | 'remove_node';
  /** Source domain of the edge (for edge interventions) */
  source?: string;
  /** Target domain of the edge (for edge interventions) */
  target?: string;
  /** New weight for the edge (for weaken/strengthen) */
  newWeight?: number;
  /** Signal value to inject (for inject_signal) */
  signalValue?: number;
  /** Node to remove (for remove_node) */
  node?: string;
  /** Human-readable description of this intervention */
  description?: string;
}

/**
 * Impact delta on a specific domain pair
 */
export interface PredictionDelta {
  /** Source domain */
  source: string;
  /** Target domain */
  target: string;
  /** Baseline best-path confidence */
  baselineConfidence: number;
  /** Counterfactual best-path confidence */
  counterfactualConfidence: number;
  /** Absolute change in confidence */
  confidenceDelta: number;
  /** Percentage change in confidence */
  confidenceChangePct: number;
  /** Number of paths lost */
  pathsLost: number;
  /** Number of paths gained */
  pathsGained: number;
  /** Whether connection is completely severed */
  connectionSevered: boolean;
}

/**
 * Result of a counterfactual simulation
 */
export interface CounterfactualResult {
  /** The intervention that was applied */
  intervention: CounterfactualIntervention;
  /** Predictions in the baseline (original) DAG */
  baselinePredictions: MultiHopPrediction[];
  /** Predictions in the counterfactual (modified) DAG */
  counterfactualPredictions: MultiHopPrediction[];
  /** Impact deltas for each domain pair */
  impactDeltas: PredictionDelta[];
  /** Domains that lost connectivity */
  disconnectedDomains: string[];
  /** Overall impact score (0-1): higher = more impact from the intervention */
  impactScore: number;
  /** Natural language narrative of consequences */
  narrative: string;
}

/**
 * A leverage point — an edge whose modification has outsized impact
 */
export interface LeveragePoint {
  /** Source domain */
  source: string;
  /** Target domain */
  target: string;
  /** Current edge weight */
  currentWeight: number;
  /** Leverage score: how much total downstream impact changes per unit weight change */
  leverageScore: number;
  /** Number of downstream domains affected */
  downstreamCount: number;
  /** Domains most affected by changing this edge */
  mostAffected: Array<{ domain: string; sensitivityPct: number }>;
  /** Natural language explanation */
  explanation: string;
}

/**
 * Configuration for the counterfactual simulator
 */
export interface CounterfactualConfig {
  /** Max hops for multi-hop reasoning (default: 5) */
  maxHops: number;
  /** Min path confidence for inclusion (default: 0.01) */
  minPathConfidence: number;
  /** Perturbation delta for sensitivity analysis (default: 0.1) */
  sensitivityDelta: number;
  /** Max domain pairs to analyze (default: 100) */
  maxPairsToAnalyze: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a counterfactual simulator.
 */
export function createCounterfactualSimulator(config: Partial<CounterfactualConfig> = {}) {
  const {
    maxHops = 5,
    minPathConfidence = 0.01,
    sensitivityDelta = 0.1,
    maxPairsToAnalyze = 100,
  } = config;

  const reasoner = createMultiHopReasoner({ maxHops, minPathConfidence });

  // ── DAG cloning ────────────────────────────────────────────────────

  /**
   * Deep-clone a CausalDAG so mutations don't affect the original.
   */
  function cloneDAG(dag: CausalDAG): CausalDAG {
    const cloned: CausalDAG = {
      nodes: new Set(dag.nodes),
      edges: new Map(),
    };
    for (const [src, neighbors] of dag.edges) {
      const clonedNeighbors = new Map<string, typeof neighbors extends Map<string, infer V> ? V : never>();
      for (const [tgt, edge] of neighbors) {
        clonedNeighbors.set(tgt, { ...edge });
      }
      cloned.edges.set(src, clonedNeighbors);
    }
    return cloned;
  }

  // ── Apply intervention to a DAG ────────────────────────────────────

  /**
   * Apply a counterfactual intervention to a cloned DAG.
   * Returns the modified DAG (mutates in place — always clone first).
   */
  function applyIntervention(dag: CausalDAG, intervention: CounterfactualIntervention): CausalDAG {
    switch (intervention.type) {
      case 'remove_edge': {
        const neighbors = dag.edges.get(intervention.source!);
        if (neighbors) {
          neighbors.delete(intervention.target!);
          if (neighbors.size === 0) {
            dag.edges.delete(intervention.source!);
          }
        }
        break;
      }

      case 'weaken_edge':
      case 'strengthen_edge': {
        const neighbors = dag.edges.get(intervention.source!);
        if (neighbors) {
          const edge = neighbors.get(intervention.target!);
          if (edge) {
            edge.weight = Math.max(0, Math.min(1, intervention.newWeight ?? edge.weight));
          }
        }
        break;
      }

      case 'remove_node': {
        const node = intervention.node!;
        dag.nodes.delete(node);
        dag.edges.delete(node); // Remove outgoing edges
        // Remove incoming edges
        for (const [, neighbors] of dag.edges) {
          neighbors.delete(node);
        }
        break;
      }

      case 'inject_signal': {
        // For signal injection, we strengthen all outgoing edges from source
        // proportionally to the signal value (simulating "what if this domain spiked")
        const neighbors = dag.edges.get(intervention.source!);
        if (neighbors) {
          const signalMultiplier = Math.min(2, 1 + Math.abs(intervention.signalValue ?? 1));
          for (const [, edge] of neighbors) {
            edge.weight = Math.min(1, edge.weight * signalMultiplier);
          }
        }
        break;
      }
    }
    return dag;
  }

  // ── Collect all domain pairs ───────────────────────────────────────

  function getAllDomainPairs(dag: CausalDAG): Array<{ source: string; target: string }> {
    const pairs: Array<{ source: string; target: string }> = [];
    const nodes = Array.from(dag.nodes);
    for (let i = 0; i < nodes.length && pairs.length < maxPairsToAnalyze; i++) {
      for (let j = 0; j < nodes.length && pairs.length < maxPairsToAnalyze; j++) {
        if (i !== j) {
          pairs.push({ source: nodes[i], target: nodes[j] });
        }
      }
    }
    return pairs;
  }

  // ── Compare predictions ────────────────────────────────────────────

  function comparePredictions(
    baseline: MultiHopPrediction[],
    counterfactual: MultiHopPrediction[],
  ): PredictionDelta[] {
    const cfMap = new Map<string, MultiHopPrediction>();
    for (const p of counterfactual) {
      cfMap.set(`${p.source}→${p.target}`, p);
    }

    const deltas: PredictionDelta[] = [];
    for (const bp of baseline) {
      const key = `${bp.source}→${bp.target}`;
      const cp = cfMap.get(key);

      const baseConf = bp.reasoning.confidence;
      const cfConf = cp?.reasoning.confidence ?? 0;
      const delta = cfConf - baseConf;

      if (Math.abs(delta) > 0.001 || (baseConf > 0 && cfConf === 0)) {
        deltas.push({
          source: bp.source,
          target: bp.target,
          baselineConfidence: baseConf,
          counterfactualConfidence: cfConf,
          confidenceDelta: delta,
          confidenceChangePct: baseConf > 0 ? (delta / baseConf) * 100 : (cfConf > 0 ? 100 : 0),
          pathsLost: bp.totalPaths - (cp?.totalPaths ?? 0),
          pathsGained: Math.max(0, (cp?.totalPaths ?? 0) - bp.totalPaths),
          connectionSevered: baseConf > 0 && cfConf === 0,
        });
      }
    }

    return deltas.sort((a, b) => Math.abs(b.confidenceDelta) - Math.abs(a.confidenceDelta));
  }

  // ── Generate narrative ─────────────────────────────────────────────

  function generateNarrative(
    intervention: CounterfactualIntervention,
    deltas: PredictionDelta[],
    disconnected: string[],
  ): string {
    const parts: string[] = [];

    // Describe the intervention
    switch (intervention.type) {
      case 'remove_edge':
        parts.push(`If the ${intervention.source} → ${intervention.target} relationship were removed:`);
        break;
      case 'weaken_edge':
        parts.push(`If the ${intervention.source} → ${intervention.target} relationship weakened to ${intervention.newWeight?.toFixed(2)}:`);
        break;
      case 'strengthen_edge':
        parts.push(`If the ${intervention.source} → ${intervention.target} relationship strengthened to ${intervention.newWeight?.toFixed(2)}:`);
        break;
      case 'inject_signal':
        parts.push(`If a signal of magnitude ${intervention.signalValue?.toFixed(1)} were injected into ${intervention.source}:`);
        break;
      case 'remove_node':
        parts.push(`If ${intervention.node} were removed from the system:`);
        break;
    }

    // Describe impact
    const severed = deltas.filter(d => d.connectionSevered);
    const weakened = deltas.filter(d => d.confidenceDelta < -0.01 && !d.connectionSevered);
    const strengthened = deltas.filter(d => d.confidenceDelta > 0.01);

    if (severed.length > 0) {
      parts.push(`${severed.length} connection(s) would be completely severed: ${severed.map(d => `${d.source}→${d.target}`).join(', ')}.`);
    }
    if (weakened.length > 0) {
      const avgWeakening = weakened.reduce((s, d) => s + Math.abs(d.confidenceChangePct), 0) / weakened.length;
      parts.push(`${weakened.length} connection(s) would weaken by an average of ${avgWeakening.toFixed(1)}%.`);
    }
    if (strengthened.length > 0) {
      parts.push(`${strengthened.length} connection(s) would strengthen.`);
    }
    if (disconnected.length > 0) {
      parts.push(`Domains at risk of isolation: ${disconnected.join(', ')}.`);
    }
    if (deltas.length === 0) {
      parts.push('No significant impact detected — the intervention affects no active paths.');
    }

    return parts.join(' ');
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    /**
     * Simulate a counterfactual scenario on the DAG.
     * Compares baseline vs modified DAG and returns impact analysis.
     */
    simulate(dag: CausalDAG, intervention: CounterfactualIntervention): CounterfactualResult {
      // 1. Run baseline predictions on all reachable domain pairs
      const pairs = getAllDomainPairs(dag);
      const baselinePredictions: MultiHopPrediction[] = [];
      for (const { source, target } of pairs) {
        const pred = reasoner.reason(dag, source, target);
        if (pred.totalPaths > 0) {
          baselinePredictions.push(pred);
        }
      }

      // 2. Clone DAG and apply intervention
      const cfDAG = applyIntervention(cloneDAG(dag), intervention);

      // 3. Run counterfactual predictions on same pairs
      const counterfactualPredictions: MultiHopPrediction[] = [];
      for (const { source, target } of pairs) {
        const pred = reasoner.reason(cfDAG, source, target);
        if (pred.totalPaths > 0) {
          counterfactualPredictions.push(pred);
        }
      }

      // 4. Compute deltas
      const impactDeltas = comparePredictions(baselinePredictions, counterfactualPredictions);

      // 5. Find disconnected domains (present in baseline but missing in CF)
      const baseConnected = new Set<string>();
      for (const p of baselinePredictions) {
        baseConnected.add(p.source);
        baseConnected.add(p.target);
      }
      const cfConnected = new Set<string>();
      for (const p of counterfactualPredictions) {
        cfConnected.add(p.source);
        cfConnected.add(p.target);
      }
      const disconnectedDomains = Array.from(baseConnected).filter(d => !cfConnected.has(d));

      // 6. Compute overall impact score
      const totalBaseConf = baselinePredictions.reduce((s, p) => s + p.reasoning.confidence, 0);
      const totalCfConf = counterfactualPredictions.reduce((s, p) => s + p.reasoning.confidence, 0);
      const impactScore = totalBaseConf > 0
        ? Math.min(1, Math.abs(totalBaseConf - totalCfConf) / totalBaseConf)
        : 0;

      // 7. Generate narrative
      const narrative = generateNarrative(intervention, impactDeltas, disconnectedDomains);

      return {
        intervention,
        baselinePredictions,
        counterfactualPredictions,
        impactDeltas,
        disconnectedDomains,
        impactScore,
        narrative,
      };
    },

    /**
     * User-facing "What if?" analysis.
     * Wraps simulate() with a more intuitive interface.
     */
    whatIf(
      dag: CausalDAG,
      intervention: CounterfactualIntervention,
    ): CounterfactualResult {
      return this.simulate(dag, intervention);
    },

    /**
     * Find the highest-leverage edges in the DAG.
     * Tests each edge with a small perturbation and measures total downstream impact.
     */
    findLeveragePoints(
      dag: CausalDAG,
      targetDomains?: string[],
    ): LeveragePoint[] {
      const leveragePoints: LeveragePoint[] = [];
      const targets = targetDomains ?? Array.from(dag.nodes);

      for (const [src, neighbors] of dag.edges) {
        for (const [tgt, edge] of neighbors) {
          // Simulate weakening this edge by sensitivityDelta
          const weakenedWeight = Math.max(0, edge.weight - sensitivityDelta);
          const result = this.simulate(dag, {
            type: 'weaken_edge',
            source: src,
            target: tgt,
            newWeight: weakenedWeight,
          });

          // Filter to only target domains
          const relevantDeltas = targetDomains
            ? result.impactDeltas.filter(d => targets.includes(d.target))
            : result.impactDeltas;

          if (relevantDeltas.length === 0) continue;

          const totalDelta = relevantDeltas.reduce(
            (s, d) => s + Math.abs(d.confidenceDelta), 0
          );
          const leverageScore = totalDelta / sensitivityDelta; // Impact per unit weight change

          const affectedDomains = new Set<string>();
          for (const d of relevantDeltas) {
            affectedDomains.add(d.target);
          }

          const mostAffected = relevantDeltas
            .slice(0, 5)
            .map(d => ({
              domain: d.target,
              sensitivityPct: Math.abs(d.confidenceChangePct),
            }));

          leveragePoints.push({
            source: src,
            target: tgt,
            currentWeight: edge.weight,
            leverageScore,
            downstreamCount: affectedDomains.size,
            mostAffected,
            explanation: `${src} → ${tgt} (weight: ${edge.weight.toFixed(2)}): changing by ${sensitivityDelta} affects ${affectedDomains.size} domain(s) with total impact ${totalDelta.toFixed(3)}.`,
          });
        }
      }

      return leveragePoints.sort((a, b) => b.leverageScore - a.leverageScore);
    },

    /**
     * Compare multiple interventions to find the best one.
     * Returns results sorted by impact score.
     */
    compareInterventions(
      dag: CausalDAG,
      interventions: CounterfactualIntervention[],
    ): CounterfactualResult[] {
      const results = interventions.map(intervention => this.simulate(dag, intervention));
      return results.sort((a, b) => b.impactScore - a.impactScore);
    },

    /**
     * Get the configuration.
     */
    getConfig(): CounterfactualConfig {
      return { maxHops, minPathConfidence, sensitivityDelta, maxPairsToAnalyze };
    },
  };
}
