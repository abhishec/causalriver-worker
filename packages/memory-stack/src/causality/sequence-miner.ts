/**
 * Nexus Memory Stack - Temporal Sequence Mining
 *
 * L4: Causal Graph Engine - Chain Detection (A→B→C)
 *
 * Discovers causal chains: sequences of domain events that propagate
 * through the organization. Instead of just pairwise A→B relationships,
 * finds full propagation paths like Finance→CS→AM→Revenue.
 *
 * Uses SPADE-like algorithm for frequent sequence mining,
 * validated against the causal DAG structure.
 */

import { type CausalEvent } from './event-bus';
import { type CausalDAG } from './continuous-learner';

// ============================================================================
// TYPES
// ============================================================================

export interface CausalChain {
  /** Nodes in the chain: ['finance', 'cs', 'am'] */
  nodes: string[];
  /** Cumulative lag across the chain */
  totalLagDays: number;
  /** Product of edge strengths */
  chainStrength: number;
  /** Frequency of observing this chain */
  support: number;
  /** P(C | A and B) */
  confidence: number;
  /** How much more likely than random */
  lift: number;
  /** Has this chain been validated with actual cascades? */
  isValidated: boolean;
  /** Number of times this chain was observed */
  observationCount: number;
}

export interface SequenceMiningConfig {
  /** Maximum chain length (default: 4) */
  maxChainLength: number;
  /** Minimum frequency to keep pattern (default: 0.01) */
  minSupport: number;
  /** Minimum conditional probability (default: 0.3) */
  minConfidence: number;
  /** Maximum cumulative lag in days (default: 90) */
  maxTotalLag: number;
  /** Time window for sequence detection in hours (default: 168 = 1 week) */
  sequenceWindowHours: number;
}

interface EventSequence {
  entityId: string;
  events: Array<{
    domain: string;
    timestamp: Date;
    signalValue: number;
  }>;
}

// ============================================================================
// SEQUENCE MINER FACTORY
// ============================================================================

/**
 * Create a sequence miner for discovering causal chains
 *
 * @example
 * ```typescript
 * const miner = createSequenceMiner(dag, {
 *   maxChainLength: 4,
 *   minSupport: 0.01
 * });
 *
 * const chains = miner.mineSequences(events);
 * console.log(chains[0]);
 * // {
 * //   nodes: ['finance', 'cs', 'am'],
 * //   totalLagDays: 21,
 * //   chainStrength: 0.42,
 * //   support: 0.15,
 * //   confidence: 0.65
 * // }
 * ```
 */
export function createSequenceMiner(
  dag: CausalDAG,
  config: Partial<SequenceMiningConfig> = {}
) {
  const {
    maxChainLength = 4,
    minSupport = 0.01,
    minConfidence = 0.3,
    maxTotalLag = 90,
    sequenceWindowHours = 168
  } = config;

  // Track discovered chains
  const discoveredChains: CausalChain[] = [];

  return {
    /**
     * Mine temporal sequences from events
     */
    mineSequences(events: CausalEvent[]): CausalChain[] {
      // Group events by entity
      const entitySequences = groupEventsByEntity(events, sequenceWindowHours);

      // Count sequence frequencies
      const sequenceCounts = countSequences(entitySequences, maxChainLength);

      // Calculate support, confidence, lift
      const totalEntities = entitySequences.length;
      const chains: CausalChain[] = [];

      for (const [sequenceKey, count] of sequenceCounts) {
        const nodes = sequenceKey.split('→');
        const support = count / totalEntities;

        if (support < minSupport) continue;
        if (nodes.length < 2) continue;

        // Calculate confidence: P(last | previous)
        const prefixKey = nodes.slice(0, -1).join('→');
        const prefixCount = sequenceCounts.get(prefixKey) || count;
        const confidence = count / prefixCount;

        if (confidence < minConfidence) continue;

        // Validate against DAG
        if (!isValidChainInDAG(nodes, dag)) continue;

        // Calculate chain strength and lag from DAG
        const { chainStrength, totalLagDays } = calculateChainMetrics(nodes, dag);

        if (totalLagDays > maxTotalLag) continue;

        // Calculate lift
        const expectedSupport = nodes.reduce((acc, node) => {
          const nodeSupport = countNodeOccurrences(entitySequences, node) / totalEntities;
          return acc * nodeSupport;
        }, 1);
        const lift = support / Math.max(expectedSupport, 0.001);

        chains.push({
          nodes,
          totalLagDays,
          chainStrength,
          support,
          confidence,
          lift,
          isValidated: false,
          observationCount: count
        });
      }

      // Sort by lift * support
      chains.sort((a, b) => (b.lift * b.support) - (a.lift * a.support));

      // Store and return
      discoveredChains.push(...chains);
      return chains;
    },

    /**
     * Validate chains against observed cascades
     */
    validateChains(
      observedCascades: Array<{ path: string[]; completed: boolean }>
    ): void {
      for (const chain of discoveredChains) {
        const matchingCascades = observedCascades.filter(cascade => {
          return chain.nodes.every((node, i) => cascade.path[i] === node);
        });

        if (matchingCascades.length > 0) {
          chain.isValidated = true;
          chain.observationCount += matchingCascades.filter(c => c.completed).length;
        }
      }
    },

    /**
     * Get all discovered chains
     */
    getChains(options?: {
      minSupport?: number;
      minConfidence?: number;
      validatedOnly?: boolean;
    }): CausalChain[] {
      let result = [...discoveredChains];

      if (options?.minSupport) {
        result = result.filter(c => c.support >= options.minSupport);
      }
      if (options?.minConfidence) {
        result = result.filter(c => c.confidence >= options.minConfidence);
      }
      if (options?.validatedOnly) {
        result = result.filter(c => c.isValidated);
      }

      return result;
    },

    /**
     * Find chains starting from a domain
     */
    findChainsFrom(domain: string): CausalChain[] {
      return discoveredChains.filter(c => c.nodes[0] === domain);
    },

    /**
     * Find chains ending at a domain
     */
    findChainsTo(domain: string): CausalChain[] {
      return discoveredChains.filter(c => c.nodes[c.nodes.length - 1] === domain);
    },

    /**
     * Predict next domain in a partial sequence
     */
    predictNext(partialSequence: string[]): Array<{
      domain: string;
      probability: number;
      expectedLag: number;
    }> {
      const predictions: Map<string, { count: number; totalLag: number }> = new Map();

      for (const chain of discoveredChains) {
        // Check if chain starts with partial sequence
        const matches = partialSequence.every((node, i) => chain.nodes[i] === node);
        if (!matches) continue;

        // Get next node
        const nextIndex = partialSequence.length;
        if (nextIndex >= chain.nodes.length) continue;

        const nextNode = chain.nodes[nextIndex];
        const current = predictions.get(nextNode) || { count: 0, totalLag: 0 };

        current.count += chain.observationCount;
        current.totalLag += chain.totalLagDays / chain.nodes.length; // Average lag per step

        predictions.set(nextNode, current);
      }

      // Convert to probability
      const total = Array.from(predictions.values()).reduce((sum, p) => sum + p.count, 0);

      return Array.from(predictions.entries())
        .map(([domain, data]) => ({
          domain,
          probability: data.count / total,
          expectedLag: data.totalLag / data.count
        }))
        .sort((a, b) => b.probability - a.probability);
    },

    /**
     * Export chains to database format
     */
    exportForDatabase(organizationId: string): Array<{
      organization_id: string;
      chain_nodes: string[];
      chain_length: number;
      total_lag_days: number;
      chain_strength: number;
      support: number;
      confidence: number;
      lift: number;
      is_validated: boolean;
    }> {
      return discoveredChains.map(chain => ({
        organization_id: organizationId,
        chain_nodes: chain.nodes,
        chain_length: chain.nodes.length,
        total_lag_days: chain.totalLagDays,
        chain_strength: chain.chainStrength,
        support: chain.support,
        confidence: chain.confidence,
        lift: chain.lift,
        is_validated: chain.isValidated
      }));
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Group events by entity into sequences
 */
function groupEventsByEntity(
  events: CausalEvent[],
  windowHours: number
): EventSequence[] {
  const entityGroups = new Map<string, EventSequence>();

  for (const event of events) {
    const key = `${event.entityType}:${event.entityId}`;

    if (!entityGroups.has(key)) {
      entityGroups.set(key, {
        entityId: event.entityId,
        events: []
      });
    }

    const signalValue = (event.payload as { signal_value?: number }).signal_value || 0;

    entityGroups.get(key)!.events.push({
      domain: event.domain,
      timestamp: event.timestamp,
      signalValue
    });
  }

  // Sort events by timestamp and filter to window
  const windowMs = windowHours * 60 * 60 * 1000;

  for (const sequence of entityGroups.values()) {
    sequence.events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Group into windows
    const windowed: typeof sequence.events = [];
    let windowStart = sequence.events[0]?.timestamp.getTime() || 0;

    for (const event of sequence.events) {
      if (event.timestamp.getTime() - windowStart <= windowMs) {
        windowed.push(event);
      } else {
        windowStart = event.timestamp.getTime();
        windowed.length = 0;
        windowed.push(event);
      }
    }

    sequence.events = windowed;
  }

  return Array.from(entityGroups.values());
}

/**
 * Count sequence occurrences
 */
function countSequences(
  sequences: EventSequence[],
  maxLength: number
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const sequence of sequences) {
    const domains = sequence.events.map(e => e.domain);

    // Generate all subsequences up to maxLength
    for (let start = 0; start < domains.length; start++) {
      for (let end = start + 1; end <= Math.min(start + maxLength, domains.length); end++) {
        const subseq = domains.slice(start, end);
        const key = subseq.join('→');

        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }

  return counts;
}

/**
 * Count occurrences of a single node
 */
function countNodeOccurrences(sequences: EventSequence[], node: string): number {
  let count = 0;
  for (const sequence of sequences) {
    if (sequence.events.some(e => e.domain === node)) {
      count++;
    }
  }
  return count;
}

/**
 * Check if chain is valid according to DAG
 */
function isValidChainInDAG(nodes: string[], dag: CausalDAG): boolean {
  for (let i = 0; i < nodes.length - 1; i++) {
    const source = nodes[i];
    const target = nodes[i + 1];

    // Check if edge exists in DAG
    const targetEdges = dag.edges.get(source);
    if (!targetEdges || !targetEdges.has(target)) {
      return false;
    }
  }
  return true;
}

/**
 * Calculate chain metrics from DAG
 */
function calculateChainMetrics(
  nodes: string[],
  dag: CausalDAG
): { chainStrength: number; totalLagDays: number } {
  let chainStrength = 1;
  let totalLagDays = 0;

  for (let i = 0; i < nodes.length - 1; i++) {
    const source = nodes[i];
    const target = nodes[i + 1];

    const edge = dag.edges.get(source)?.get(target);
    if (edge) {
      chainStrength *= edge.weight;
      totalLagDays += edge.lagDays;
    }
  }

  return { chainStrength, totalLagDays };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const SequenceMiner = {
  createSequenceMiner
};
