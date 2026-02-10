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
}

export interface CausalDAG {
  nodes: Set<string>;
  edges: Map<string, Map<string, {
    weight: number;
    pValue: number;
    lagDays: number;
    lastUpdated: Date;
    sampleSize: number;
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
    incrementalWindowDays = 14
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

  return {
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

        const newWeight = result.effectSize;
        const oldWeight = currentEdge?.weight;

        graph.edges.get(source)!.set(target, {
          weight: newWeight,
          pValue: result.pValue,
          lagDays: result.optimalLag,
          lastUpdated: new Date(),
          sampleSize: result.sampleSize
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
     * Apply evidence decay to all edges
     */
    applyEvidenceDecay(): GraphUpdate[] {
      const updates: GraphUpdate[] = [];
      const now = new Date();

      for (const [source, targets] of graph.edges) {
        for (const [target, edge] of targets) {
          const daysSinceUpdate = (now.getTime() - edge.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSinceUpdate > incrementalWindowDays) {
            const decayedWeight = edge.weight * Math.pow(evidenceDecayFactor, daysSinceUpdate / incrementalWindowDays);

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
              edge.weight = decayedWeight;
              updates.push({
                updateType: 'edge_weaken',
                source,
                target,
                oldWeight: edge.weight,
                newWeight: decayedWeight,
                evidence: `Evidence decay after ${daysSinceUpdate.toFixed(0)} days`,
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
  const edges = new Map<string, Map<string, {
    weight: number;
    pValue: number;
    lagDays: number;
    lastUpdated: Date;
    sampleSize: number;
  }>>();

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
      sampleSize: rel.sample_size || 100
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
