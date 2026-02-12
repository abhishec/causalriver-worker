/**
 * Multi-Hop Reasoning Engine
 *
 * LLM-level cognitive capability: the brain can see A→B and B→C edges,
 * but until now it could not reason about A→B→C chains with combined
 * confidence. This module adds that critical reasoning layer.
 *
 * Features:
 * - BFS/DFS path finding with cycle detection
 * - Confidence composition across hops (product of edge weights)
 * - Path impact attenuation (signal weakens across hops)
 * - Length penalty (shorter paths preferred for equal confidence)
 * - Natural language explanation generation per path
 * - Critical edge detection (bottleneck analysis)
 *
 * @example
 * ```typescript
 * const reasoner = createMultiHopReasoner();
 * const prediction = reasoner.reason(dag, 'engineering', 'revenue');
 * console.log(prediction.bestPath.explanation);
 * // "engineering → customer_success (weight: 0.7, 14d lag) → revenue (weight: 0.5, 7d lag)"
 * console.log(prediction.bestPath.pathConfidence); // 0.35
 * ```
 *
 * @packageDocumentation
 */

import type { CausalDAG } from './continuous-learner';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single reasoning path through the causal graph
 */
export interface ReasoningPath {
  /** Ordered list of domain nodes in the path */
  nodes: string[];
  /** Edge weights for each hop (length = nodes.length - 1) */
  hopWeights: number[];
  /** Lag days for each hop */
  hopLagDays: number[];
  /** p-values for each hop */
  hopPValues: number[];
  /** Whether each hop edge is knockout-validated */
  hopValidated: boolean[];
  /** Whether each hop edge is possibly confounded */
  hopConfounded: boolean[];
  /** Combined path confidence = ∏(edge weights) × length penalty */
  pathConfidence: number;
  /** Raw product of edge weights (no length penalty) */
  rawConfidence: number;
  /** Total lag days across all hops */
  totalLagDays: number;
  /** Expected impact magnitude at the end of the path (attenuates per hop) */
  expectedImpact: number;
  /** Number of hops */
  hopCount: number;
  /** Natural language explanation of this reasoning path */
  explanation: string;
}

/**
 * Result of multi-hop reasoning about a connection between two domains
 */
export interface MultiHopPrediction {
  /** Source domain */
  source: string;
  /** Target domain */
  target: string;
  /** Direct path (1 hop) if it exists */
  directPath: ReasoningPath | null;
  /** All alternative paths (sorted by confidence, descending) */
  alternativePaths: ReasoningPath[];
  /** Best path overall (highest confidence) */
  bestPath: ReasoningPath | null;
  /** Total number of paths found */
  totalPaths: number;
  /** Reasoning metadata */
  reasoning: {
    /** Overall confidence in the connection (from best path) */
    confidence: number;
    /** Overall explanation combining best path + alternatives */
    explanation: string;
    /** Key uncertainties in the reasoning */
    uncertainties: string[];
    /** Alternative explanations from other paths */
    alternativeExplanations: string[];
  };
}

/**
 * A critical edge whose removal would most impact graph connectivity
 */
export interface CriticalEdge {
  /** Source domain */
  source: string;
  /** Target domain */
  target: string;
  /** Edge weight */
  weight: number;
  /** Criticality score (0-1): higher = more critical to remove */
  criticality: number;
  /** How many paths through the graph depend on this edge */
  pathsDependingOnEdge: number;
  /** Total confidence loss across all paths if this edge were removed */
  totalConfidenceLoss: number;
  /** Domains that would become disconnected if this edge were removed */
  domainsAffected: string[];
}

/**
 * Configuration for the multi-hop reasoner
 */
export interface MultiHopConfig {
  /** Maximum number of hops to explore (default: 5) */
  maxHops: number;
  /** Minimum path confidence to include (default: 0.01) */
  minPathConfidence: number;
  /** Length penalty per hop — multiplied: confidence × (penalty ^ hops) (default: 0.9) */
  lengthPenalty: number;
  /** Maximum paths to return per query (default: 20) */
  maxPaths: number;
  /** Assume trigger signal magnitude for impact calculation (default: 1.0) */
  defaultTriggerMagnitude: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a multi-hop reasoning engine.
 */
export function createMultiHopReasoner(config: Partial<MultiHopConfig> = {}) {
  const {
    maxHops = 5,
    minPathConfidence = 0.01,
    lengthPenalty = 0.9,
    maxPaths = 20,
    defaultTriggerMagnitude = 1.0,
  } = config;

  // ── Path finding: DFS with cycle detection ────────────────────────

  /**
   * Find all paths from source to target in the DAG.
   * Uses DFS with visited set for cycle prevention.
   */
  function findAllPaths(
    dag: CausalDAG,
    source: string,
    target: string,
  ): ReasoningPath[] {
    const paths: ReasoningPath[] = [];
    const visited = new Set<string>();

    function dfs(
      current: string,
      pathNodes: string[],
      hopWeights: number[],
      hopLagDays: number[],
      hopPValues: number[],
      hopValidated: boolean[],
      hopConfounded: boolean[],
    ): void {
      // Found target
      if (current === target && pathNodes.length > 1) {
        const rawConfidence = hopWeights.reduce((a, b) => a * b, 1);
        const hopCount = hopWeights.length;
        const pathConfidence = rawConfidence * Math.pow(lengthPenalty, hopCount);

        if (pathConfidence >= minPathConfidence) {
          const totalLagDays = hopLagDays.reduce((a, b) => a + b, 0);
          const expectedImpact = defaultTriggerMagnitude * rawConfidence;

          paths.push({
            nodes: [...pathNodes],
            hopWeights: [...hopWeights],
            hopLagDays: [...hopLagDays],
            hopPValues: [...hopPValues],
            hopValidated: [...hopValidated],
            hopConfounded: [...hopConfounded],
            pathConfidence,
            rawConfidence,
            totalLagDays,
            expectedImpact,
            hopCount,
            explanation: buildPathExplanation(
              pathNodes, hopWeights, hopLagDays, hopValidated, hopConfounded,
            ),
          });
        }
        return;
      }

      // Max depth reached
      if (pathNodes.length - 1 >= maxHops) return;

      // Explore neighbors
      const neighbors = dag.edges.get(current);
      if (!neighbors) return;

      for (const [neighbor, edge] of neighbors) {
        if (visited.has(neighbor)) continue; // Cycle prevention

        visited.add(neighbor);
        dfs(
          neighbor,
          [...pathNodes, neighbor],
          [...hopWeights, edge.weight],
          [...hopLagDays, edge.lagDays],
          [...hopPValues, edge.pValue],
          [...hopValidated, (edge.knockoutScore ?? 0) > 0.5 && !edge.isLikelyConfounded],
          [...hopConfounded, edge.isLikelyConfounded ?? false],
        );
        visited.delete(neighbor);
      }
    }

    visited.add(source);
    dfs(source, [source], [], [], [], [], []);
    visited.delete(source);

    // Sort by confidence descending, cap at maxPaths
    paths.sort((a, b) => b.pathConfidence - a.pathConfidence);
    return paths.slice(0, maxPaths);
  }

  // ── Explanation builder ────────────────────────────────────────────

  function buildPathExplanation(
    nodes: string[],
    weights: number[],
    lagDays: number[],
    validated: boolean[],
    confounded: boolean[],
  ): string {
    const parts: string[] = [];
    for (let i = 0; i < weights.length; i++) {
      const validTag = validated[i] ? ' [VALIDATED]' : (confounded[i] ? ' [CONFOUNDED]' : '');
      parts.push(
        `${nodes[i]} → ${nodes[i + 1]} (weight: ${weights[i].toFixed(2)}, ${lagDays[i]}d lag)${validTag}`
      );
    }
    return parts.join(' → ');
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    /**
     * Find all paths between two domains in the causal graph.
     */
    findAllPaths(dag: CausalDAG, source: string, target: string): ReasoningPath[] {
      if (!dag.nodes.has(source) || !dag.nodes.has(target)) return [];
      if (source === target) return [];
      return findAllPaths(dag, source, target);
    },

    /**
     * Reason about the causal connection between two domains.
     * Returns the best path, alternatives, and natural language explanation.
     */
    reason(dag: CausalDAG, source: string, target: string): MultiHopPrediction {
      const allPaths = this.findAllPaths(dag, source, target);

      // Separate direct (1-hop) from multi-hop
      const directPath = allPaths.find(p => p.hopCount === 1) || null;
      const alternativePaths = allPaths.filter(p => p !== directPath);
      const bestPath = allPaths.length > 0 ? allPaths[0] : null;

      // Build reasoning
      const uncertainties: string[] = [];
      const alternativeExplanations: string[] = [];

      if (bestPath) {
        // Flag confounded hops
        const confoundedHops = bestPath.nodes
          .slice(0, -1)
          .filter((_, i) => bestPath.hopConfounded[i]);
        if (confoundedHops.length > 0) {
          uncertainties.push(
            `${confoundedHops.length} hop(s) in the best path may be confounded — correlation, not necessarily causation`
          );
        }

        // Flag low-weight hops
        const weakHops = bestPath.hopWeights.filter(w => w < 0.3);
        if (weakHops.length > 0) {
          uncertainties.push(
            `${weakHops.length} hop(s) have weak evidence (weight < 0.3) — path may not hold`
          );
        }

        // Flag if no hops are validated
        if (!bestPath.hopValidated.some(v => v)) {
          uncertainties.push(
            'No edges in this path are knockout-validated — causal direction unconfirmed'
          );
        }
      }

      // Alternative explanations from other paths
      for (const alt of alternativePaths.slice(0, 3)) {
        alternativeExplanations.push(
          `Via ${alt.nodes.join(' → ')} (confidence: ${(alt.pathConfidence * 100).toFixed(1)}%, ${alt.totalLagDays}d total lag)`
        );
      }

      // Build overall explanation
      let explanation: string;
      if (!bestPath) {
        explanation = `No causal path found from ${source} to ${target} in the current graph.`;
      } else if (directPath && directPath === bestPath) {
        explanation = `Direct causal link: ${bestPath.explanation}. Confidence: ${(bestPath.pathConfidence * 100).toFixed(1)}%.`;
        if (alternativePaths.length > 0) {
          explanation += ` Also ${alternativePaths.length} indirect path(s) found.`;
        }
      } else {
        explanation = `Best path (${bestPath.hopCount} hops): ${bestPath.explanation}. Confidence: ${(bestPath.pathConfidence * 100).toFixed(1)}%.`;
        if (directPath) {
          explanation += ` A weaker direct link also exists (${(directPath.pathConfidence * 100).toFixed(1)}%).`;
        }
      }

      return {
        source,
        target,
        directPath,
        alternativePaths,
        bestPath,
        totalPaths: allPaths.length,
        reasoning: {
          confidence: bestPath?.pathConfidence ?? 0,
          explanation,
          uncertainties,
          alternativeExplanations,
        },
      };
    },

    /**
     * Find all reachable domains from a source (breadth-first).
     * Returns domains sorted by combined confidence of the best path to each.
     */
    findReachableDomains(
      dag: CausalDAG,
      source: string,
    ): Array<{ domain: string; confidence: number; hops: number; lagDays: number }> {
      const reachable = new Map<string, { confidence: number; hops: number; lagDays: number }>();
      const visited = new Set<string>();
      const queue: Array<{ node: string; confidence: number; hops: number; lagDays: number }> = [
        { node: source, confidence: 1, hops: 0, lagDays: 0 },
      ];

      while (queue.length > 0) {
        const { node, confidence, hops, lagDays } = queue.shift()!;
        if (visited.has(node)) continue;
        visited.add(node);

        if (node !== source) {
          const existing = reachable.get(node);
          if (!existing || confidence > existing.confidence) {
            reachable.set(node, { confidence, hops, lagDays });
          }
        }

        if (hops >= maxHops) continue;

        const neighbors = dag.edges.get(node);
        if (!neighbors) continue;

        for (const [neighbor, edge] of neighbors) {
          if (visited.has(neighbor)) continue;
          const newConfidence = confidence * edge.weight * lengthPenalty;
          if (newConfidence >= minPathConfidence) {
            queue.push({
              node: neighbor,
              confidence: newConfidence,
              hops: hops + 1,
              lagDays: lagDays + edge.lagDays,
            });
          }
        }
      }

      return Array.from(reachable.entries())
        .map(([domain, stats]) => ({ domain, ...stats }))
        .sort((a, b) => b.confidence - a.confidence);
    },

    /**
     * Find critical edges — edges whose removal causes the most damage
     * to connectivity toward the specified target domains.
     */
    findCriticalEdges(
      dag: CausalDAG,
      targets: string[],
    ): CriticalEdge[] {
      // Collect all edges in the DAG
      const allEdges: Array<{ source: string; target: string; weight: number }> = [];
      for (const [source, neighbors] of dag.edges) {
        for (const [target, edge] of neighbors) {
          allEdges.push({ source, target, weight: edge.weight });
        }
      }

      const criticalEdges: CriticalEdge[] = [];

      // For each edge, measure the impact of removing it
      for (const { source: edgeSrc, target: edgeTgt, weight } of allEdges) {
        // Clone DAG without this edge
        const clonedDAG: CausalDAG = {
          nodes: new Set(dag.nodes),
          edges: new Map(),
        };
        for (const [src, neighbors] of dag.edges) {
          const clonedNeighbors = new Map(neighbors);
          if (src === edgeSrc) {
            clonedNeighbors.delete(edgeTgt);
          }
          if (clonedNeighbors.size > 0) {
            clonedDAG.edges.set(src, clonedNeighbors);
          }
        }

        // Measure total confidence loss toward all targets
        let totalConfidenceLoss = 0;
        let pathsDependingOnEdge = 0;
        const domainsAffected = new Set<string>();

        for (const node of dag.nodes) {
          for (const targetDomain of targets) {
            if (node === targetDomain) continue;

            const originalPaths = findAllPaths(dag, node, targetDomain);
            const modifiedPaths = findAllPaths(clonedDAG, node, targetDomain);

            const originalBest = originalPaths[0]?.pathConfidence ?? 0;
            const modifiedBest = modifiedPaths[0]?.pathConfidence ?? 0;

            const loss = originalBest - modifiedBest;
            if (loss > 0.001) {
              totalConfidenceLoss += loss;
              pathsDependingOnEdge++;
              domainsAffected.add(node);
            }
          }
        }

        if (totalConfidenceLoss > 0) {
          criticalEdges.push({
            source: edgeSrc,
            target: edgeTgt,
            weight,
            criticality: Math.min(1, totalConfidenceLoss / targets.length),
            pathsDependingOnEdge,
            totalConfidenceLoss,
            domainsAffected: [...domainsAffected],
          });
        }
      }

      return criticalEdges.sort((a, b) => b.criticality - a.criticality);
    },

    /**
     * Backward reasoning: given an EFFECT domain, find all upstream causes.
     * Traverses the DAG in reverse (incoming edges) to trace what caused this effect.
     * Essential for "what caused this revenue drop?" type queries.
     */
    reasonBackward(
      dag: CausalDAG,
      effect: string,
    ): Array<{
      cause: string;
      path: ReasoningPath;
      diagnosisConfidence: number;
    }> {
      if (!dag.nodes.has(effect)) return [];

      // Build reverse adjacency (target → sources)
      const reverseEdges = new Map<string, Map<string, {
        weight: number; pValue: number; lagDays: number;
        knockoutScore?: number; isLikelyConfounded?: boolean;
        coefficientSign?: number; predictionAccuracy?: number; predictionCount?: number;
        lastUpdated: Date; sampleSize: number;
      }>>();

      for (const [src, neighbors] of dag.edges) {
        for (const [tgt, edge] of neighbors) {
          if (!reverseEdges.has(tgt)) reverseEdges.set(tgt, new Map());
          reverseEdges.get(tgt)!.set(src, edge);
        }
      }

      // Build a reverse DAG for path finding
      const reverseDAG: CausalDAG = {
        nodes: new Set(dag.nodes),
        edges: reverseEdges,
      };

      // Find all backward paths from effect to each potential cause
      const results: Array<{ cause: string; path: ReasoningPath; diagnosisConfidence: number }> = [];

      for (const node of dag.nodes) {
        if (node === effect) continue;
        const paths = findAllPaths(reverseDAG, effect, node);
        if (paths.length > 0) {
          const bestPath = paths[0];
          // Reverse the path nodes so it reads cause → ... → effect
          const forwardPath: ReasoningPath = {
            ...bestPath,
            nodes: [...bestPath.nodes].reverse(),
            hopWeights: [...bestPath.hopWeights].reverse(),
            hopLagDays: [...bestPath.hopLagDays].reverse(),
            hopPValues: [...bestPath.hopPValues].reverse(),
            hopValidated: [...bestPath.hopValidated].reverse(),
            hopConfounded: [...bestPath.hopConfounded].reverse(),
          };
          // Regenerate explanation in forward direction
          const parts: string[] = [];
          for (let i = 0; i < forwardPath.nodes.length - 1; i++) {
            parts.push(
              `${forwardPath.nodes[i]} → ${forwardPath.nodes[i + 1]} (w:${forwardPath.hopWeights[i].toFixed(2)}, ${forwardPath.hopLagDays[i]}d)`
            );
          }
          forwardPath.explanation = parts.join(' → ');

          results.push({
            cause: node,
            path: forwardPath,
            diagnosisConfidence: bestPath.pathConfidence,
          });
        }
      }

      return results.sort((a, b) => b.diagnosisConfidence - a.diagnosisConfidence);
    },

    /**
     * Diagnose an anomaly: given an effect and its severity,
     * rank upstream causes by likelihood of having caused it.
     */
    diagnose(
      dag: CausalDAG,
      effect: string,
      anomalyMagnitude: number = 1.0,
    ): {
      topCauses: Array<{ cause: string; likelihood: number; lagDays: number; path: string[]; explanation: string }>;
      isExplainable: boolean;
      narrative: string;
    } {
      const backward = this.reasonBackward(dag, effect);

      const topCauses = backward.slice(0, 10).map(b => ({
        cause: b.cause,
        likelihood: Math.min(1, b.diagnosisConfidence * Math.abs(anomalyMagnitude)),
        lagDays: b.path.totalLagDays,
        path: b.path.nodes,
        explanation: `${b.cause} → ${effect} via ${b.path.hopCount} hop(s): ${b.path.explanation}`,
      }));

      const narrative = topCauses.length > 0
        ? `Most likely cause of anomaly in ${effect}: ${topCauses[0].cause} (${(topCauses[0].likelihood * 100).toFixed(0)}% likelihood, ${topCauses[0].lagDays}-day lag). ${topCauses.length > 1 ? `${topCauses.length - 1} alternative cause(s) also identified.` : ''}`
        : `No upstream causes found for anomaly in ${effect} — it may be exogenous.`;

      return {
        topCauses,
        isExplainable: topCauses.length > 0,
        narrative,
      };
    },

    /**
     * Get the configuration used by this reasoner.
     */
    getConfig(): MultiHopConfig {
      return { maxHops, minPathConfidence, lengthPenalty, maxPaths, defaultTriggerMagnitude };
    },
  };
}
