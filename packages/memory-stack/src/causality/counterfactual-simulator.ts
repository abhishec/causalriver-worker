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
  /** Monte Carlo confidence interval on impact score (from edge weight perturbation) */
  impactCI?: { mean: number; lower95: number; upper95: number; std: number };
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

  // ── Monte Carlo sensitivity analysis ──────────────────────────────

  /**
   * Streaming Monte Carlo sensitivity analysis with early convergence.
   *
   * Perturbs edge weights by ±10% to produce a distribution of impact scores.
   * Uses adaptive stopping: terminates early when the standard error of the mean
   * falls below a precision threshold, avoiding wasted computation on trivial or
   * highly stable interventions.
   *
   * @param dag - The original DAG
   * @param intervention - The counterfactual intervention to test
   * @param maxSamples - Maximum Monte Carlo samples (default 50)
   * @param precisionThreshold - Stop early when SE(mean) < this (default 0.02)
   * @param minSamples - Minimum samples before convergence check (default 10)
   * @returns CI on the impact score: { mean, lower95, upper95, std, samplesUsed }
   */
  function monteCarloImpactCI(
    dag: CausalDAG,
    intervention: CounterfactualIntervention,
    maxSamples: number = 50,
    precisionThreshold: number = 0.02,
    minSamples: number = 10,
  ): { mean: number; lower95: number; upper95: number; std: number; samplesUsed?: number } {
    const scores: number[] = [];

    // Streaming statistics: running mean and variance (Welford's algorithm)
    let runningMean = 0;
    let runningM2 = 0;

    for (let i = 0; i < maxSamples; i++) {
      // Clone and perturb all edge weights by ±10%
      const perturbedDAG = cloneDAG(dag);
      for (const [, neighbors] of perturbedDAG.edges) {
        for (const [tgt, edge] of neighbors) {
          const noise = (Math.random() - 0.5) * 0.2 * edge.weight;
          neighbors.set(tgt, { ...edge, weight: Math.max(0.01, Math.min(1, edge.weight + noise)) });
        }
      }

      // Run simulation on perturbed DAG
      const pairs = getAllDomainPairs(perturbedDAG);
      let totalBase = 0;
      let totalCf = 0;

      for (const { source, target } of pairs) {
        const basePred = reasoner.reason(perturbedDAG, source, target);
        if (basePred.totalPaths > 0) totalBase += basePred.reasoning.confidence;
      }

      const cfDAG = applyIntervention(cloneDAG(perturbedDAG), intervention);
      for (const { source, target } of pairs) {
        const cfPred = reasoner.reason(cfDAG, source, target);
        if (cfPred.totalPaths > 0) totalCf += cfPred.reasoning.confidence;
      }

      const score = totalBase > 0 ? Math.min(1, Math.abs(totalBase - totalCf) / totalBase) : 0;
      scores.push(score);

      // Welford's online variance algorithm
      const n = scores.length;
      const delta = score - runningMean;
      runningMean += delta / n;
      const delta2 = score - runningMean;
      runningM2 += delta * delta2;

      // Early convergence check: stop if standard error is below precision threshold
      if (n >= minSamples) {
        const variance = runningM2 / (n - 1);
        const standardError = Math.sqrt(variance / n);
        if (standardError < precisionThreshold) {
          break; // Converged early — CI is precise enough
        }
      }
    }

    scores.sort((a, b) => a - b);
    const n = scores.length;
    const mean = scores.reduce((s, v) => s + v, 0) / n;
    const std = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / n);

    return {
      mean: Math.round(mean * 1000) / 1000,
      lower95: Math.round((scores[Math.floor(n * 0.025)] ?? 0) * 1000) / 1000,
      upper95: Math.round((scores[Math.floor(n * 0.975)] ?? 0) * 1000) / 1000,
      std: Math.round(std * 1000) / 1000,
      samplesUsed: n,
    };
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

      // 7. Monte Carlo confidence interval on impact score
      const impactCI = monteCarloImpactCI(dag, intervention);

      // 8. Generate narrative
      const narrative = generateNarrative(intervention, impactDeltas, disconnectedDomains);

      return {
        intervention,
        baselinePredictions,
        counterfactualPredictions,
        impactDeltas,
        disconnectedDomains,
        impactScore,
        impactCI,
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
     * Simulate compound interventions: apply MULTIPLE interventions to a single DAG.
     * Unlike compareInterventions() which tests each independently, this captures
     * interaction effects between simultaneous changes.
     */
    simulateCompound(
      dag: CausalDAG,
      interventions: CounterfactualIntervention[],
      schedule?: { durationDays: number; decayRate: number },
    ): CounterfactualResult {
      // Apply all interventions to a single cloned DAG
      let cfDAG = cloneDAG(dag);
      for (const intervention of interventions) {
        cfDAG = applyIntervention(cfDAG, intervention);
      }

      // If temporal schedule provided, apply time-decay to the interventions
      // (simulates interventions that fade over time)
      if (schedule && schedule.decayRate > 0) {
        for (const intervention of interventions) {
          if (intervention.type === 'weaken_edge' || intervention.type === 'strengthen_edge') {
            const neighbors = cfDAG.edges.get(intervention.source!);
            if (neighbors) {
              const edge = neighbors.get(intervention.target!);
              if (edge) {
                // Original weight from the base DAG
                const originalEdge = dag.edges.get(intervention.source!)?.get(intervention.target!);
                if (originalEdge) {
                  // Decay intervention effect: weight moves back toward original over durationDays
                  const decayFactor = Math.exp(-schedule.decayRate * schedule.durationDays / 30);
                  edge.weight = edge.weight * decayFactor + originalEdge.weight * (1 - decayFactor);
                }
              }
            }
          }
        }
      }

      // Run baseline predictions
      const pairs = getAllDomainPairs(dag);
      const baselinePredictions: MultiHopPrediction[] = [];
      for (const { source, target } of pairs) {
        const pred = reasoner.reason(dag, source, target);
        if (pred.totalPaths > 0) baselinePredictions.push(pred);
      }

      // Run counterfactual predictions
      const counterfactualPredictions: MultiHopPrediction[] = [];
      for (const { source, target } of pairs) {
        const pred = reasoner.reason(cfDAG, source, target);
        if (pred.totalPaths > 0) counterfactualPredictions.push(pred);
      }

      const impactDeltas = comparePredictions(baselinePredictions, counterfactualPredictions);

      // Disconnected domains
      const baseConnected = new Set<string>();
      for (const p of baselinePredictions) { baseConnected.add(p.source); baseConnected.add(p.target); }
      const cfConnected = new Set<string>();
      for (const p of counterfactualPredictions) { cfConnected.add(p.source); cfConnected.add(p.target); }
      const disconnectedDomains = Array.from(baseConnected).filter(d => !cfConnected.has(d));

      // Overall impact
      const totalBaseConf = baselinePredictions.reduce((s, p) => s + p.reasoning.confidence, 0);
      const totalCfConf = counterfactualPredictions.reduce((s, p) => s + p.reasoning.confidence, 0);
      const impactScore = totalBaseConf > 0
        ? Math.min(1, Math.abs(totalBaseConf - totalCfConf) / totalBaseConf)
        : 0;

      // Compound narrative
      const interventionDescs = interventions.map(i => {
        switch (i.type) {
          case 'remove_edge': return `remove ${i.source}→${i.target}`;
          case 'weaken_edge': return `weaken ${i.source}→${i.target} to ${i.newWeight?.toFixed(2)}`;
          case 'strengthen_edge': return `strengthen ${i.source}→${i.target} to ${i.newWeight?.toFixed(2)}`;
          case 'inject_signal': return `inject signal into ${i.source}`;
          case 'remove_node': return `remove ${i.node}`;
          default: return i.description ?? 'unknown';
        }
      });
      const narrative = `Compound intervention (${interventions.length} actions: ${interventionDescs.join(', ')}): ${impactDeltas.length} path(s) affected, impact score ${impactScore.toFixed(2)}.${schedule ? ` Temporal decay over ${schedule.durationDays} days (rate: ${schedule.decayRate}).` : ''}`;

      return {
        intervention: interventions[0], // Primary intervention
        baselinePredictions,
        counterfactualPredictions,
        impactDeltas,
        disconnectedDomains,
        impactScore,
        narrative,
      };
    },

    /**
     * Test causal sufficiency: are the observed variables sufficient to
     * explain the target, or are there likely unobserved confounders?
     */
    testCausalSufficiency(
      dag: CausalDAG,
      target: string,
    ): {
      isSufficient: boolean;
      sufficiencyScore: number;
      missingConfounders: Array<{ edge: string; reason: string }>;
      narrative: string;
    } {
      const confounders: Array<{ edge: string; reason: string }> = [];
      let totalEdges = 0;
      let confoundedEdges = 0;
      let unvalidatedEdges = 0;

      // Check all edges pointing TO the target
      for (const [src, neighbors] of dag.edges) {
        const edge = neighbors.get(target);
        if (!edge) continue;
        totalEdges++;

        if (edge.isLikelyConfounded) {
          confoundedEdges++;
          confounders.push({
            edge: `${src}→${target}`,
            reason: `Likely confounded — the ${src}→${target} correlation may be driven by an unobserved common cause`,
          });
        }

        if ((edge.knockoutScore ?? 0) < 0.3) {
          unvalidatedEdges++;
          if (!edge.isLikelyConfounded) {
            confounders.push({
              edge: `${src}→${target}`,
              reason: `Not knockout-validated (score: ${(edge.knockoutScore ?? 0).toFixed(2)}) — causal direction unconfirmed`,
            });
          }
        }
      }

      // Also check 2-hop upstream for confounding
      for (const [src1, neighbors1] of dag.edges) {
        for (const [src2, edge2] of neighbors1) {
          if (src2 !== target) continue;
          // Check parents of src1
          for (const [grandparent, gpNeighbors] of dag.edges) {
            const gpEdge = gpNeighbors.get(src1);
            if (gpEdge && gpEdge.isLikelyConfounded) {
              confounders.push({
                edge: `${grandparent}→${src1}→${target}`,
                reason: `Upstream edge ${grandparent}→${src1} is confounded — may distort predictions through ${src1}`,
              });
            }
          }
        }
      }

      const sufficiencyScore = totalEdges > 0
        ? Math.max(0, 1 - (confoundedEdges + unvalidatedEdges * 0.5) / totalEdges)
        : 0;

      const isSufficient = sufficiencyScore > 0.6 && confoundedEdges === 0;

      const narrative = isSufficient
        ? `Causal sufficiency for ${target}: SUFFICIENT (score: ${(sufficiencyScore * 100).toFixed(0)}%). All incoming edges are validated and unconfounded.`
        : `Causal sufficiency for ${target}: INSUFFICIENT (score: ${(sufficiencyScore * 100).toFixed(0)}%). ${confounders.length} potential confounder(s) detected — counterfactual predictions may be unreliable.`;

      return { isSufficient, sufficiencyScore, missingConfounders: confounders, narrative };
    },

    /**
     * Simulate a temporal counterfactual: "What if this edge had been different
     * N days ago? What cascade would have propagated by now?"
     *
     * Models cascade propagation through the DAG using lag structure:
     * - Intervention at time T on edge A→B
     * - B's downstream effects propagate with lag delays
     * - At time T + sum(lags), the final target is impacted
     *
     * Returns a timeline of when each domain would have been affected.
     */
    simulateTemporal(
      dag: CausalDAG,
      intervention: CounterfactualIntervention,
      daysAgo: number,
    ): {
      timeline: Array<{ day: number; domain: string; estimatedImpact: number; cumulativeDecay: number }>;
      totalPropagationDays: number;
      domainsAffected: number;
      narrative: string;
    } {
      const modifiedDAG = cloneDAG(dag);
      applyIntervention(modifiedDAG, intervention);

      // BFS through the DAG starting from intervention target, tracking cumulative lag
      const visited = new Map<string, { day: number; impact: number; decay: number }>();
      const queue: Array<{ domain: string; cumulativeDays: number; cumulativeWeight: number }> = [];

      // Find the starting domain(s) of the intervention
      let startDomains: string[] = [];
      if (intervention.type === 'inject_signal' && intervention.target) {
        startDomains = [intervention.target];
      } else if (intervention.source && intervention.target) {
        startDomains = [intervention.target];
      } else if (intervention.type === 'remove_node' && intervention.node) {
        // All neighbors of removed node
        for (const [src, targets] of dag.edges) {
          if (targets.has(intervention.node)) {
            startDomains.push(src);
          }
        }
      }

      for (const domain of startDomains) {
        queue.push({ domain, cumulativeDays: 0, cumulativeWeight: 1.0 });
        visited.set(domain, { day: 0, impact: 1.0, decay: 1.0 });
      }

      while (queue.length > 0) {
        const { domain, cumulativeDays, cumulativeWeight } = queue.shift()!;
        const neighbors = modifiedDAG.edges.get(domain);
        if (!neighbors) continue;

        for (const [tgt, edge] of neighbors) {
          const arrivalDay = cumulativeDays + edge.lagDays;
          const propagatedWeight = cumulativeWeight * Math.abs(edge.weight);

          // Temporal decay: signal weakens with time (half-life = 30 days)
          const temporalDecay = Math.pow(0.5, arrivalDay / 30);
          const effectiveImpact = propagatedWeight * temporalDecay;

          if (effectiveImpact < 0.01) continue; // Too weak to matter
          if (arrivalDay > daysAgo) continue; // Hasn't propagated yet

          const existing = visited.get(tgt);
          if (!existing || effectiveImpact > existing.impact) {
            visited.set(tgt, { day: arrivalDay, impact: effectiveImpact, decay: temporalDecay });
            queue.push({ domain: tgt, cumulativeDays: arrivalDay, cumulativeWeight: propagatedWeight });
          }
        }
      }

      // Build timeline sorted by day
      const timeline: Array<{ day: number; domain: string; estimatedImpact: number; cumulativeDecay: number }> = [];
      let maxDay = 0;

      for (const [domain, { day, impact, decay }] of visited) {
        timeline.push({
          day,
          domain,
          estimatedImpact: Math.round(impact * 1000) / 1000,
          cumulativeDecay: Math.round(decay * 1000) / 1000,
        });
        maxDay = Math.max(maxDay, day);
      }

      timeline.sort((a, b) => a.day - b.day);

      // Narrative
      const affected = timeline.filter(t => t.day > 0);
      const narrativeParts = [
        `Temporal counterfactual: if the ${intervention.type} intervention had occurred ${daysAgo} days ago,`,
      ];
      if (affected.length === 0) {
        narrativeParts.push('no downstream domains would have been affected yet.');
      } else {
        narrativeParts.push(
          `${affected.length} domain(s) would be affected over ${maxDay} days.`,
        );
        const strongest = affected.sort((a, b) => b.estimatedImpact - a.estimatedImpact)[0];
        if (strongest) {
          narrativeParts.push(
            `Strongest impact: ${strongest.domain} at day ${strongest.day} (${(strongest.estimatedImpact * 100).toFixed(0)}% of original signal).`,
          );
        }
      }

      return {
        timeline,
        totalPropagationDays: maxDay,
        domainsAffected: affected.length,
        narrative: narrativeParts.join(' '),
      };
    },

    /**
     * Get the configuration.
     */
    /**
     * Causal Intervention Planner: given a target outcome (e.g., "increase revenue"),
     * automatically enumerate, simulate, and rank intervention strategies.
     *
     * This is the brain's strategic planning capability — it:
     * 1. Identifies all upstream edges that influence the target domain
     * 2. Generates candidate interventions (strengthen, weaken, inject) for each
     * 3. Simulates each with Monte Carlo CIs
     * 4. Ranks by expected impact and cost-efficiency
     * 5. Returns a prioritized action plan
     *
     * @param dag - The causal DAG
     * @param targetDomain - Domain to improve (e.g., 'revenue', 'customer_satisfaction')
     * @param direction - 'increase' or 'decrease' the target
     * @param maxStrategies - Max strategies to return (default 5)
     */
    planInterventions(
      dag: CausalDAG,
      targetDomain: string,
      direction: 'increase' | 'decrease' = 'increase',
      maxStrategies: number = 5,
    ): Array<{
      rank: number;
      intervention: CounterfactualIntervention;
      impactScore: number;
      impactCI: { mean: number; lower95: number; upper95: number; std: number };
      affectedDomains: number;
      costEfficiency: number;
      narrative: string;
    }> {
      // 1. Find all upstream edges that influence the target domain
      const upstreamEdges: Array<{ source: string; target: string; weight: number }> = [];
      for (const [src, neighbors] of dag.edges) {
        const edge = neighbors.get(targetDomain);
        if (edge) {
          upstreamEdges.push({ source: src, target: targetDomain, weight: edge.weight });
        }
        // Also check 2-hop upstream: A → X → target
        for (const [mid, midEdge] of neighbors) {
          const toTarget = dag.edges.get(mid)?.get(targetDomain);
          if (toTarget && mid !== targetDomain) {
            upstreamEdges.push({ source: src, target: mid, weight: midEdge.weight * toTarget.weight });
          }
        }
      }

      if (upstreamEdges.length === 0) {
        return [];
      }

      // 2. Generate candidate interventions for each upstream edge
      const candidates: CounterfactualIntervention[] = [];
      for (const edge of upstreamEdges) {
        const currentWeight = dag.edges.get(edge.source)?.get(edge.target)?.weight ?? edge.weight;
        const delta = direction === 'increase' ? sensitivityDelta : -sensitivityDelta;

        // Strategy: strengthen the positive-influence edge
        if ((direction === 'increase' && currentWeight > 0) || (direction === 'decrease' && currentWeight < 0)) {
          candidates.push({
            type: 'strengthen_edge',
            source: edge.source,
            target: edge.target,
            newWeight: Math.min(1, Math.abs(currentWeight) + delta),
          });
        }

        // Strategy: inject a positive signal into the source domain
        candidates.push({
          type: 'inject_signal',
          source: edge.source,
          target: edge.source,
          signalValue: direction === 'increase' ? 1.5 : 0.5,
        });
      }

      // Deduplicate by intervention key
      const seen = new Set<string>();
      const uniqueCandidates = candidates.filter(c => {
        const key = `${c.type}:${c.source}:${c.target}:${c.newWeight ?? c.signalValue ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // 3. Simulate each candidate (limit to avoid performance issues)
      const limitedCandidates = uniqueCandidates.slice(0, maxStrategies * 3);
      const results: Array<{
        intervention: CounterfactualIntervention;
        result: CounterfactualResult;
      }> = [];

      for (const intervention of limitedCandidates) {
        const result = this.simulate(dag, intervention);
        results.push({ intervention, result });
      }

      // 4. Rank by impact on target domain specifically
      const ranked = results
        .map(({ intervention, result }) => {
          const targetDelta = result.impactDeltas.find(
            d => d.target === targetDomain || d.source === targetDomain
          );
          const targetImpact = targetDelta
            ? Math.abs(targetDelta.confidenceDelta)
            : result.impactScore;
          // Cost efficiency: impact per unit of intervention magnitude
          const interventionMagnitude = intervention.newWeight
            ? Math.abs(intervention.newWeight - (dag.edges.get(intervention.source!)?.get(intervention.target!)?.weight ?? 0))
            : intervention.signalValue ? Math.abs(intervention.signalValue - 1) : sensitivityDelta;
          const costEfficiency = interventionMagnitude > 0
            ? targetImpact / interventionMagnitude
            : 0;

          return {
            intervention,
            impactScore: Math.round(targetImpact * 1000) / 1000,
            impactCI: result.impactCI ?? { mean: targetImpact, lower95: 0, upper95: targetImpact, std: 0 },
            affectedDomains: result.impactDeltas.length,
            costEfficiency: Math.round(costEfficiency * 1000) / 1000,
            narrative: result.narrative,
          };
        })
        .sort((a, b) => b.impactScore - a.impactScore)
        .slice(0, maxStrategies)
        .map((item, idx) => ({ ...item, rank: idx + 1 }));

      return ranked;
    },

    getConfig(): CounterfactualConfig {
      return { maxHops, minPathConfidence, sensitivityDelta, maxPairsToAnalyze };
    },
  };
}
