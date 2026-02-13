/**
 * Nexus Memory Stack - Continuous Causal Graph Learning
 *
 * L4: Causal Graph Engine - Real-Time Graph Updates
 *
 * Updates the causal graph incrementally as new data arrives,
 * rather than recomputing from scratch periodically.
 *
 * Key Features:
 * - Process events and update edge weights in real-time
 * - Apply evidence decay to old relationships
 * - Detect when relationships become stale or invalid
 * - Track graph update history for auditing
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { type CausalEvent } from './event-bus';
import { type GrangerResult, computeGrangerCausality } from './granger-causality';

// ============================================================================
// TYPES
// ============================================================================

export interface GraphUpdate {
  updateType: 'edge_add' | 'edge_remove' | 'edge_strengthen' | 'edge_weaken';
  source: string;
  target: string;
  oldWeight?: number;
  newWeight: number;
  evidence: string;
  timestamp: Date;
  confidence: number;
}

export interface LearningConfig {
  /** Minimum events before updating edge weight */
  minEventsForUpdate: number;
  /** Exponential decay factor for old evidence (0-1) */
  evidenceDecayFactor: number;
  /** Threshold for removing edges (p-value) */
  edgeRemovalThreshold: number;
  /** Threshold for adding edges (p-value) */
  edgeAdditionThreshold: number;
  /** Window for incremental Granger updates (days) */
  incrementalWindowDays: number;
  /** Minimum prediction accuracy to slow decay (default: 0.6) */
  accuracyDecayThreshold: number;
  /** Decay reduction factor for accurate edges: 0-1, lower = slower decay (default: 0.5) */
  accuracyDecayReduction: number;
}

export interface CausalDAG {
  nodes: Set<string>;
  edges: Map<string, Map<string, {
    weight: number;
    pValue: number;
    lagDays: number;
    lastUpdated: Date;
    sampleSize: number;
    /** Counterfactual knockout score from apex discovery (0-1, higher = stronger causal evidence) */
    knockoutScore?: number;
    /** Whether this edge is likely confounded (high VAR + low knockout) */
    isLikelyConfounded?: boolean;
    /** Sign of the causal coefficient (+1 / -1) */
    coefficientSign?: number;
    /** Prediction accuracy from feedback loop (0-1) — used for accuracy-weighted decay */
    predictionAccuracy?: number;
    /** Number of predictions made using this edge — needs ≥3 for accuracy-weighted decay */
    predictionCount?: number;
  }>>;
}

// ============================================================================
// CONTINUOUS LEARNER FACTORY
// ============================================================================

/**
 * Create a continuous learner for real-time graph updates
 */
export function createContinuousLearner(
  initialGraph: CausalDAG,
  config: Partial<LearningConfig> = {}
) {
  const {
    minEventsForUpdate = 100,
    evidenceDecayFactor = 0.95,
    edgeRemovalThreshold = 0.1,
    edgeAdditionThreshold = 0.05,
    incrementalWindowDays = 14,
    accuracyDecayThreshold = 0.6,
    accuracyDecayReduction = 0.5,
  } = config;

  // Clone the initial graph
  const graph: CausalDAG = {
    nodes: new Set(initialGraph.nodes),
    edges: new Map()
  };

  for (const [source, targets] of initialGraph.edges) {
    graph.edges.set(source, new Map(targets));
  }

  // Event buffer for incremental updates
  const eventBuffer: Map<string, number[]> = new Map();
  const updateHistory: GraphUpdate[] = [];

  const api = {
    /**
     * Process a new causal event and potentially update the graph
     */
    processEvent(event: CausalEvent): GraphUpdate | null {
      const { domain, payload } = event;

      // Add to buffer
      if (!eventBuffer.has(domain)) {
        eventBuffer.set(domain, []);
      }

      const signalValue = (payload as { signal_value?: number }).signal_value || 0;
      eventBuffer.get(domain)!.push(signalValue);

      // Check if we have enough data for update
      const bufferSize = eventBuffer.get(domain)!.length;
      if (bufferSize < minEventsForUpdate) {
        return null;
      }

      // Try incremental update with other domains
      for (const [otherDomain, otherBuffer] of eventBuffer) {
        if (otherDomain === domain) continue;
        if (otherBuffer.length < minEventsForUpdate) continue;

        // Test for causal relationship
        try {
          const result = computeGrangerCausality(
            eventBuffer.get(domain)!.slice(-minEventsForUpdate),
            otherBuffer.slice(-minEventsForUpdate),
            Math.min(14, Math.floor(minEventsForUpdate / 3))
          );

          const update = this.updateEdgeFromGranger(domain, otherDomain, result);
          if (update) {
            updateHistory.push(update);
            return update;
          }
        } catch {
          // Not enough data for Granger test
        }
      }

      return null;
    },

    /**
     * Update an edge based on Granger causality result
     */
    updateEdgeFromGranger(
      source: string,
      target: string,
      result: GrangerResult
    ): GraphUpdate | null {
      const currentEdge = graph.edges.get(source)?.get(target);

      if (result.isSignificant && result.pValue < edgeAdditionThreshold) {
        // Add or strengthen edge
        if (!graph.edges.has(source)) {
          graph.edges.set(source, new Map());
        }

        // Bayesian weight blending: blend new evidence with prior (existing) weight
        // to prevent oscillation and smooth updates. New orgs get raw weight; existing edges
        // use 60% prior + 40% new evidence for stability.
        const rawWeight = result.effectSize;
        const newWeight = currentEdge
          ? currentEdge.weight * 0.6 + rawWeight * 0.4
          : rawWeight;
        const oldWeight = currentEdge?.weight;

        // Edge lifecycle: candidate → confirmed → validated (based on knockout evidence)
        const lifecycleState: 'candidate' | 'confirmed' | 'validated' = currentEdge
          ? ((currentEdge.knockoutScore ?? 0) > 0.5 && !currentEdge.isLikelyConfounded
              ? 'validated'
              : 'confirmed')
          : 'candidate';

        graph.edges.get(source)!.set(target, {
          weight: newWeight,
          pValue: result.pValue,
          lagDays: result.optimalLag,
          lastUpdated: new Date(),
          sampleSize: result.sampleSize,
          // Preserve knockout and confounding metadata from prior edge
          knockoutScore: currentEdge?.knockoutScore,
          isLikelyConfounded: currentEdge?.isLikelyConfounded,
          coefficientSign: currentEdge?.coefficientSign,
          predictionAccuracy: currentEdge?.predictionAccuracy,
          predictionCount: currentEdge?.predictionCount,
        });

        return {
          updateType: currentEdge ? 'edge_strengthen' : 'edge_add',
          source,
          target,
          oldWeight,
          newWeight,
          evidence: result.naturalLanguage,
          timestamp: new Date(),
          confidence: 1 - result.pValue
        };
      } else if (currentEdge && result.pValue > edgeRemovalThreshold) {
        // Remove edge
        graph.edges.get(source)!.delete(target);

        return {
          updateType: 'edge_remove',
          source,
          target,
          oldWeight: currentEdge.weight,
          newWeight: 0,
          evidence: `Relationship no longer significant (p=${result.pValue.toFixed(3)})`,
          timestamp: new Date(),
          confidence: result.pValue
        };
      }

      return null;
    },

    /**
     * Apply accuracy-weighted evidence decay to all edges.
     *
     * Accurate edges (≥60% accuracy, 3+ predictions) decay at half rate.
     * Inaccurate edges (<30% accuracy) decay at squared rate (faster removal).
     * Unknown accuracy (no predictions yet) decays at normal rate.
     */
    applyEvidenceDecay(): GraphUpdate[] {
      const updates: GraphUpdate[] = [];
      const now = new Date();

      for (const [source, targets] of graph.edges) {
        for (const [target, edge] of targets) {
          const daysSinceUpdate = (now.getTime() - edge.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSinceUpdate > incrementalWindowDays) {
            // Accuracy-weighted decay: accurate edges decay slower
            let effectiveDecayFactor = evidenceDecayFactor;

            if (
              edge.predictionAccuracy !== undefined &&
              edge.predictionCount !== undefined &&
              edge.predictionCount >= 3
            ) {
              if (edge.predictionAccuracy >= accuracyDecayThreshold) {
                // Accurate edge: slow down decay (e.g., 0.95 → 0.975)
                effectiveDecayFactor = 1 - (1 - evidenceDecayFactor) * accuracyDecayReduction;
              } else if (edge.predictionAccuracy < 0.3) {
                // Inaccurate edge: speed up decay (squared factor)
                effectiveDecayFactor = evidenceDecayFactor * evidenceDecayFactor;
              }
            }

            const decayedWeight = edge.weight * Math.pow(effectiveDecayFactor, daysSinceUpdate / incrementalWindowDays);

            if (decayedWeight < 0.01) {
              // Remove edge
              targets.delete(target);
              updates.push({
                updateType: 'edge_remove',
                source,
                target,
                oldWeight: edge.weight,
                newWeight: 0,
                evidence: 'Evidence decayed below threshold',
                timestamp: now,
                confidence: 0.5
              });
            } else {
              // Weaken edge
              const oldWeight = edge.weight;
              edge.weight = decayedWeight;
              updates.push({
                updateType: 'edge_weaken',
                source,
                target,
                oldWeight,
                newWeight: decayedWeight,
                evidence: `Evidence decay after ${daysSinceUpdate.toFixed(0)} days (accuracy-weighted)`,
                timestamp: now,
                confidence: decayedWeight
              });
            }
          }
        }
      }

      updateHistory.push(...updates);
      return updates;
    },

    /**
     * Update prediction accuracy for an edge (called by feedback loop).
     * This data is used to weight evidence decay — accurate edges decay slower.
     */
    updateEdgeAccuracy(source: string, target: string, accuracy: number, predictionCount: number): void {
      const edge = graph.edges.get(source)?.get(target);
      if (edge) {
        edge.predictionAccuracy = accuracy;
        edge.predictionCount = predictionCount;
      }
    },

    /**
     * Load a DAG into the learner, merging with or replacing the current graph.
     * Used to bootstrap the learner from a database-loaded DAG after creation.
     */
    loadGraph(dag: CausalDAG): void {
      // Merge nodes
      for (const node of dag.nodes) {
        graph.nodes.add(node);
      }

      // Merge edges (loaded edges take precedence)
      for (const [source, targets] of dag.edges) {
        if (!graph.edges.has(source)) {
          graph.edges.set(source, new Map());
        }
        const currentTargets = graph.edges.get(source)!;
        for (const [target, edge] of targets) {
          currentTargets.set(target, { ...edge });
        }
      }
    },

    /**
     * Get current graph state
     */
    getGraph(): CausalDAG {
      return graph;
    },

    /**
     * Get update history
     */
    getUpdateHistory(since?: Date): GraphUpdate[] {
      if (!since) return [...updateHistory];
      return updateHistory.filter(u => u.timestamp >= since);
    },

    /**
     * Clear event buffers
     */
    clearBuffers(): void {
      eventBuffer.clear();
    },

    /**
     * Prune stale subgraphs — remove edges below weight/freshness threshold
     * and disconnected nodes. Mimics memory consolidation where the brain
     * forgets irrelevant connections to reduce cognitive load.
     *
     * @param maxAgeDays - Remove edges not updated within this many days (default: 90)
     * @param minWeight - Remove edges below this weight (default: 0.02)
     * @param removeOrphanNodes - Remove nodes with no edges (default: true)
     * @returns Summary of what was pruned
     */
    pruneStaleSubgraph(
      maxAgeDays: number = 90,
      minWeight: number = 0.02,
      removeOrphanNodes: boolean = true,
    ): { edgesRemoved: number; nodesRemoved: number; reasons: Array<{ source: string; target: string; reason: string }> } {
      const now = new Date();
      const reasons: Array<{ source: string; target: string; reason: string }> = [];
      let edgesRemoved = 0;

      for (const [src, targets] of graph.edges) {
        const toRemove: string[] = [];

        for (const [tgt, edge] of targets) {
          let shouldPrune = false;
          let reason = '';

          // 1. Weight below threshold
          if (Math.abs(edge.weight) < minWeight) {
            shouldPrune = true;
            reason = `Weight ${edge.weight.toFixed(4)} below threshold ${minWeight}`;
          }

          // 2. Stale — not updated within maxAgeDays
          if (!shouldPrune && edge.lastUpdated) {
            const ageDays = (now.getTime() - edge.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
            if (ageDays > maxAgeDays) {
              // BUT: don't prune validated edges that are still strong
              const isValidated = (edge.knockoutScore ?? 0) > 0.5 && !edge.isLikelyConfounded;
              if (!isValidated || Math.abs(edge.weight) < 0.1) {
                shouldPrune = true;
                reason = `Stale: ${Math.round(ageDays)}d since last update (max: ${maxAgeDays}d)`;
              }
            }
          }

          // 3. Confounded + weak — unreliable evidence
          if (!shouldPrune && edge.isLikelyConfounded && Math.abs(edge.weight) < 0.15 && (edge.sampleSize ?? 0) < 20) {
            shouldPrune = true;
            reason = 'Confounded + weak (weight < 0.15, sampleSize < 20)';
          }

          // 4. Consistently inaccurate predictions
          if (!shouldPrune && (edge.predictionCount ?? 0) >= 5 && (edge.predictionAccuracy ?? 1) < 0.2) {
            shouldPrune = true;
            reason = `Consistently inaccurate: ${((edge.predictionAccuracy ?? 0) * 100).toFixed(0)}% accuracy over ${edge.predictionCount} predictions`;
          }

          if (shouldPrune) {
            toRemove.push(tgt);
            reasons.push({ source: src, target: tgt, reason });
          }
        }

        for (const tgt of toRemove) {
          targets.delete(tgt);
          edgesRemoved++;
        }

        // Clean up empty target maps
        if (targets.size === 0) {
          graph.edges.delete(src);
        }
      }

      // Remove orphan nodes (no incoming or outgoing edges)
      let nodesRemoved = 0;
      if (removeOrphanNodes && edgesRemoved > 0) {
        const connectedNodes = new Set<string>();
        for (const [src, targets] of graph.edges) {
          connectedNodes.add(src);
          for (const tgt of targets.keys()) {
            connectedNodes.add(tgt);
          }
        }

        const orphans: string[] = [];
        for (const node of graph.nodes) {
          if (!connectedNodes.has(node)) {
            orphans.push(node);
          }
        }

        for (const orphan of orphans) {
          graph.nodes.delete(orphan);
          nodesRemoved++;
        }
      }

      if (edgesRemoved > 0) {
        updateHistory.push({
          type: 'edge_weakened',
          source: 'system',
          target: 'pruning',
          timestamp: now,
          details: { edgesRemoved, nodesRemoved, reason: 'stale_subgraph_pruning' },
        } as any);
      }

      return { edgesRemoved, nodesRemoved, reasons };
    },

    /**
     * Compact the graph by merging parallel weak-but-consistent paths.
     * If A→X→B and A→Y→B both exist and are consistently validated,
     * strengthen the direct A→B edge (creating it if needed) and optionally
     * archive the intermediaries.
     *
     * This is analogous to hippocampal replay where repeated activations
     * consolidate indirect memories into direct associations.
     *
     * @param minIntermediaryWeight - Minimum weight for intermediary edges to be considered (default: 0.1)
     * @param minValidation - Minimum knockout score for intermediary edges (default: 0.3)
     * @returns Summary of compaction results
     */
    compactParallelPaths(
      minIntermediaryWeight: number = 0.1,
      minValidation: number = 0.3,
    ): { pathsCompacted: number; edgesCreated: number; edgesStrengthened: number; details: Array<{ from: string; via: string; to: string; newWeight: number }> } {
      let pathsCompacted = 0;
      let edgesCreated = 0;
      let edgesStrengthened = 0;
      const details: Array<{ from: string; via: string; to: string; newWeight: number }> = [];

      // Find all 2-hop paths A→X→B
      for (const [src, srcTargets] of graph.edges) {
        for (const [mid, srcToMid] of srcTargets) {
          // Skip weak/unvalidated intermediary edges
          if (Math.abs(srcToMid.weight) < minIntermediaryWeight) continue;
          if ((srcToMid.knockoutScore ?? 0) < minValidation && !srcToMid.isLikelyConfounded) continue;

          const midTargets = graph.edges.get(mid);
          if (!midTargets) continue;

          for (const [tgt, midToTgt] of midTargets) {
            if (tgt === src) continue; // Skip cycles

            // Skip weak/unvalidated second hop
            if (Math.abs(midToTgt.weight) < minIntermediaryWeight) continue;
            if ((midToTgt.knockoutScore ?? 0) < minValidation && !midToTgt.isLikelyConfounded) continue;

            // Compute compound weight (product with length penalty)
            const compoundWeight = srcToMid.weight * midToTgt.weight * 0.9; // 0.9 = 2-hop penalty
            if (Math.abs(compoundWeight) < 0.05) continue; // Too weak to consolidate

            // Check existing direct edge
            const directEdge = srcTargets.get(tgt);

            if (!directEdge) {
              // Create new summary edge
              srcTargets.set(tgt, {
                weight: compoundWeight,
                pValue: Math.max(srcToMid.pValue, midToTgt.pValue), // Worst p-value
                lagDays: srcToMid.lagDays + midToTgt.lagDays,
                lastUpdated: new Date(),
                sampleSize: Math.min(srcToMid.sampleSize ?? 0, midToTgt.sampleSize ?? 0),
                knockoutScore: Math.min(srcToMid.knockoutScore ?? 0, midToTgt.knockoutScore ?? 0) * 0.8,
                isLikelyConfounded: srcToMid.isLikelyConfounded || midToTgt.isLikelyConfounded,
                coefficientSign: (srcToMid.coefficientSign ?? 1) * (midToTgt.coefficientSign ?? 1),
              });
              edgesCreated++;
            } else {
              // Strengthen existing direct edge with indirect evidence
              // Only if compound evidence agrees with direct edge
              if ((compoundWeight > 0) === (directEdge.weight > 0)) {
                const blended = directEdge.weight * 0.7 + compoundWeight * 0.3;
                directEdge.weight = Math.min(1, Math.max(-1, blended));
                directEdge.lastUpdated = new Date();
                edgesStrengthened++;
              }
            }

            pathsCompacted++;
            details.push({
              from: src,
              via: mid,
              to: tgt,
              newWeight: directEdge ? directEdge.weight : compoundWeight,
            });
          }
        }
      }

      // 3-hop compaction: A → X → Y → B
      // Captures longer indirect chains (e.g., engineering → cs → revenue → churn)
      for (const [src, srcTargets] of graph.edges) {
        for (const [mid1, srcToMid1] of srcTargets) {
          if (Math.abs(srcToMid1.weight) < minIntermediaryWeight) continue;
          const mid1Targets = graph.edges.get(mid1);
          if (!mid1Targets) continue;

          for (const [mid2, mid1ToMid2] of mid1Targets) {
            if (mid2 === src) continue;
            if (Math.abs(mid1ToMid2.weight) < minIntermediaryWeight) continue;
            const mid2Targets = graph.edges.get(mid2);
            if (!mid2Targets) continue;

            for (const [tgt, mid2ToTgt] of mid2Targets) {
              if (tgt === src || tgt === mid1) continue;
              if (Math.abs(mid2ToTgt.weight) < minIntermediaryWeight) continue;

              // Compound weight with extra penalty for longer chain (0.85)
              const compound3 = srcToMid1.weight * mid1ToMid2.weight * mid2ToTgt.weight * 0.85;
              if (Math.abs(compound3) < 0.05) continue;

              const directEdge = srcTargets.get(tgt);
              if (!directEdge) {
                srcTargets.set(tgt, {
                  weight: compound3,
                  pValue: Math.max(srcToMid1.pValue, mid1ToMid2.pValue, mid2ToTgt.pValue),
                  lagDays: srcToMid1.lagDays + mid1ToMid2.lagDays + mid2ToTgt.lagDays,
                  lastUpdated: new Date(),
                  sampleSize: Math.min(srcToMid1.sampleSize ?? 0, mid1ToMid2.sampleSize ?? 0, mid2ToTgt.sampleSize ?? 0),
                  knockoutScore: Math.min(srcToMid1.knockoutScore ?? 0, mid1ToMid2.knockoutScore ?? 0, mid2ToTgt.knockoutScore ?? 0) * 0.7,
                  isLikelyConfounded: srcToMid1.isLikelyConfounded || mid1ToMid2.isLikelyConfounded || mid2ToTgt.isLikelyConfounded,
                  coefficientSign: (srcToMid1.coefficientSign ?? 1) * (mid1ToMid2.coefficientSign ?? 1) * (mid2ToTgt.coefficientSign ?? 1),
                });
                edgesCreated++;
              } else if ((compound3 > 0) === (directEdge.weight > 0)) {
                directEdge.weight = Math.min(1, Math.max(-1, directEdge.weight * 0.75 + compound3 * 0.25));
                directEdge.lastUpdated = new Date();
                edgesStrengthened++;
              }
              pathsCompacted++;
              details.push({ from: src, via: `${mid1}→${mid2}`, to: tgt, newWeight: compound3 });
            }
          }
        }
      }

      return { pathsCompacted, edgesCreated, edgesStrengthened, details };
    },

    /**
     * Get graph health statistics for memory management.
     */
    getGraphStats(): {
      nodeCount: number;
      edgeCount: number;
      avgWeight: number;
      staleEdgeCount: number;
      weakEdgeCount: number;
      confoundedEdgeCount: number;
      validatedEdgeCount: number;
    } {
      const now = new Date();
      let edgeCount = 0;
      let weightSum = 0;
      let stale = 0;
      let weak = 0;
      let confounded = 0;
      let validated = 0;

      for (const [, targets] of graph.edges) {
        for (const [, edge] of targets) {
          edgeCount++;
          weightSum += Math.abs(edge.weight);
          if (edge.lastUpdated) {
            const ageDays = (now.getTime() - edge.lastUpdated.getTime()) / 86400000;
            if (ageDays > 60) stale++;
          }
          if (Math.abs(edge.weight) < 0.05) weak++;
          if (edge.isLikelyConfounded) confounded++;
          if ((edge.knockoutScore ?? 0) > 0.5 && !edge.isLikelyConfounded) validated++;
        }
      }

      return {
        nodeCount: graph.nodes.size,
        edgeCount,
        avgWeight: edgeCount > 0 ? weightSum / edgeCount : 0,
        staleEdgeCount: stale,
        weakEdgeCount: weak,
        confoundedEdgeCount: confounded,
        validatedEdgeCount: validated,
      };
    },

    /**
     * Auto-consolidation: run pruning + compaction if graph exceeds size/staleness thresholds.
     * Analogous to sleep-driven hippocampal replay — runs when the graph is "bloated" or "stale."
     *
     * @param maxEdges - Trigger pruning if edge count exceeds this (default: 200)
     * @param maxStaleRatio - Trigger if stale edges exceed this fraction (default: 0.4)
     * @returns Consolidation summary, or null if no action needed
     */
    autoConsolidate(
      maxEdges: number = 200,
      maxStaleRatio: number = 0.4,
    ): {
      triggered: boolean;
      pruneResult?: { edgesRemoved: number; nodesRemoved: number; reasons: Array<{ source: string; target: string; reason: string }> };
      compactResult?: { pathsCompacted: number; edgesCreated: number; edgesStrengthened: number };
    } {
      // Inline stats check to avoid circular reference to self
      const now = new Date();
      let edgeCount = 0;
      let staleCount = 0;
      for (const [, targets] of graph.edges) {
        for (const [, edge] of targets) {
          edgeCount++;
          if (edge.lastUpdated) {
            const ageDays = (now.getTime() - edge.lastUpdated.getTime()) / 86400000;
            if (ageDays > 60) staleCount++;
          }
        }
      }
      const staleRatio = edgeCount > 0 ? staleCount / edgeCount : 0;
      const shouldConsolidate = edgeCount > maxEdges || staleRatio > maxStaleRatio;

      if (!shouldConsolidate) return { triggered: false };

      const pruneResult = api.pruneStaleSubgraph();
      const compactResult = api.compactParallelPaths();

      return { triggered: true, pruneResult, compactResult };
    },

    /**
     * Export graph for visualization
     */
    exportForVisualization(): {
      nodes: Array<{ id: string }>;
      edges: Array<{ source: string; target: string; weight: number; pValue: number }>;
    } {
      const nodes = Array.from(graph.nodes).map(id => ({ id }));
      const edges: Array<{ source: string; target: string; weight: number; pValue: number }> = [];

      for (const [source, targets] of graph.edges) {
        for (const [target, edge] of targets) {
          edges.push({
            source,
            target,
            weight: edge.weight,
            pValue: edge.pValue
          });
        }
      }

      return { nodes, edges };
    }
  };

  return api;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create an empty DAG
 */
export function createEmptyDAG(nodes: string[]): CausalDAG {
  return {
    nodes: new Set(nodes),
    edges: new Map()
  };
}

/**
 * Core brain org ID — duplicated here to avoid circular import.
 */
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

/**
 * Create DAG from database relationships.
 * When `includeCoreDAG` is true, merges core brain relationships into the DAG.
 * Org edges take priority over core brain edges for the same source→target pair.
 */
export async function loadDAGFromDatabase(
  supabase: SupabaseClient,
  organizationId: string,
  options?: { includeCoreDAG?: boolean }
): Promise<CausalDAG> {
  const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;
  const includeCoreDAG = options?.includeCoreDAG ?? false;

  // Fetch org relationships
  const { data: relationships, error } = await supabase
    .from('causal_relationships_statistical')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_significant', true);

  if (error) {
    throw new Error(`Failed to load DAG: ${error.message}`);
  }

  // Optionally fetch core brain relationships
  let coreRelationships: any[] = [];
  if (includeCoreDAG && !isCoreBrain) {
    const { data: coreData } = await supabase
      .from('causal_relationships_statistical')
      .select('*')
      .eq('organization_id', CORE_BRAIN_ORG_ID)
      .eq('is_significant', true);
    coreRelationships = coreData || [];
  }

  const nodes = new Set<string>();
  const edges: CausalDAG['edges'] = new Map();

  // Helper to add a relationship to the DAG
  function addEdge(rel: any) {
    nodes.add(rel.source_domain);
    nodes.add(rel.target_domain);

    if (!edges.has(rel.source_domain)) {
      edges.set(rel.source_domain, new Map());
    }

    edges.get(rel.source_domain)!.set(rel.target_domain, {
      weight: rel.effect_size || 0,
      pValue: rel.granger_p_value || 0.05,
      lagDays: rel.optimal_lag_days || 7,
      lastUpdated: new Date(rel.last_computed_at || rel.created_at),
      sampleSize: rel.sample_size || 100,
      knockoutScore: rel.knockout_score ?? undefined,
      isLikelyConfounded: rel.is_likely_confounded ?? undefined,
      coefficientSign: rel.coefficient_sign ?? undefined,
    });
  }

  // Load core brain edges first (lower priority)
  for (const rel of coreRelationships) {
    addEdge(rel);
  }

  // Load org edges second (overwrite core brain edges for same pair — org takes priority)
  for (const rel of relationships || []) {
    addEdge(rel);
  }

  return { nodes, edges };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ContinuousLearner = {
  createContinuousLearner,
  createEmptyDAG,
  loadDAGFromDatabase
};
