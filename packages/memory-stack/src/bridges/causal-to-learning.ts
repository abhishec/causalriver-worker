/**
 * Bridge 3: Causal Relationships → Pattern Learning
 *
 * Subscribes to 'relationship_update' events.
 * Transforms causal edges into transactions for Apriori mining.
 * Emits discovered patterns as 'prediction' events.
 */

import type { CausalEvent } from '../causality/event-bus';
import { generateEventId } from '../causality/event-bus';
import { mineAssociationRules } from '../learning/pattern-detector';

type EventBusInstance = {
  emit: (event: any) => boolean;
  subscribe: (options: {
    filter: any;
    handler: (events: CausalEvent[]) => Promise<void>;
  }) => string;
};

export interface LearningBridgeConfig {
  /** Minimum relationships before running pattern mining (default: 5) */
  minRelationshipsForMining: number;
  /** Minimum support for association rules (default: 0.1) */
  minSupport: number;
  /** Minimum confidence for association rules (default: 0.5) */
  minConfidence: number;
  /** Minimum lift for association rules (default: 1.5) */
  minLift: number;
}

const DEFAULT_CONFIG: LearningBridgeConfig = {
  minRelationshipsForMining: 5,
  minSupport: 0.1,
  minConfidence: 0.5,
  minLift: 1.5,
};

/**
 * Subscribe to causal relationship updates and mine patterns
 */
export function createLearningBridge(
  eventBus: EventBusInstance,
  config: Partial<LearningBridgeConfig> = {}
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Track relationships per org for pattern mining
  const relationshipBuffers = new Map<
    string,
    Array<{
      source_domain: string;
      target_domain: string;
      effect_size: number;
      is_significant: boolean;
    }>
  >();

  let totalPatternsDiscovered = 0;
  let totalRelationshipsReceived = 0;

  const subscriptionId = eventBus.subscribe({
    filter: { eventTypes: ['relationship_update'] as any },
    handler: async (events: CausalEvent[]) => {
      for (const event of events) {
        totalRelationshipsReceived++;
        const orgId = event.organizationId;

        if (!relationshipBuffers.has(orgId)) {
          relationshipBuffers.set(orgId, []);
        }

        const payload = event.payload as any;
        relationshipBuffers.get(orgId)!.push({
          source_domain: payload.source_domain || event.domain,
          target_domain: payload.target_domain || payload.target || '',
          effect_size: payload.effect_size || payload.weight || 0,
          is_significant: payload.is_significant !== false,
        });

        // Mine patterns when we have enough relationships
        const buffer = relationshipBuffers.get(orgId)!;
        if (buffer.length >= fullConfig.minRelationshipsForMining) {
          const transactions = buildTransactionsFromRelationships(buffer);

          if (transactions.length > 0) {
            try {
              const rules = mineAssociationRules(transactions, {
                minSupport: fullConfig.minSupport,
                minConfidence: fullConfig.minConfidence,
                minLift: fullConfig.minLift,
              });

              for (const rule of rules) {
                totalPatternsDiscovered++;
                eventBus.emit({
                  eventId: generateEventId('pat'),
                  organizationId: orgId,
                  domain: rule.antecedent[0] || 'cross-domain',
                  entityType: 'pattern',
                  entityId: `rule_${rule.antecedent.join('_')}_${rule.consequent.join('_')}`,
                  eventType: 'prediction' as any,
                  payload: {
                    type: 'association_rule',
                    antecedent: rule.antecedent,
                    consequent: rule.consequent,
                    support: rule.support,
                    confidence: rule.confidence,
                    lift: rule.lift,
                    naturalLanguage: `When ${rule.antecedent.join(' and ')} occur, ${rule.consequent.join(' and ')} follow with ${(rule.confidence * 100).toFixed(0)}% confidence (lift: ${rule.lift.toFixed(2)})`,
                  },
                  timestamp: new Date(),
                  priority: rule.lift > 3 ? 1 : rule.lift > 2 ? 2 : 3,
                });
              }
            } catch {
              // Not enough data for meaningful mining yet
            }
          }
        }
      }
    },
  });

  return {
    subscriptionId,
    getStats() {
      return {
        totalRelationshipsReceived,
        totalPatternsDiscovered,
        bufferedRelationships: Object.fromEntries(
          Array.from(relationshipBuffers.entries()).map(([k, v]) => [k, v.length])
        ),
      };
    },
  };
}

/**
 * Transform causal relationships into transaction format for Apriori.
 * Each connected component of domains becomes a transaction.
 */
function buildTransactionsFromRelationships(
  relationships: Array<{
    source_domain: string;
    target_domain: string;
    is_significant: boolean;
  }>
): string[][] {
  const significant = relationships.filter(
    (r) => r.is_significant && r.target_domain
  );

  const adjacency = new Map<string, Set<string>>();
  for (const rel of significant) {
    if (!adjacency.has(rel.source_domain)) {
      adjacency.set(rel.source_domain, new Set());
    }
    adjacency.get(rel.source_domain)!.add(rel.target_domain);
  }

  const transactions: string[][] = [];
  const visited = new Set<string>();

  for (const domain of adjacency.keys()) {
    if (visited.has(domain)) continue;

    const component: string[] = [];
    const queue = [domain];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);

      const neighbors = adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    if (component.length >= 2) {
      transactions.push(component.sort());
    }
  }

  // Also add individual relationships as 2-item transactions
  for (const rel of significant) {
    transactions.push([rel.source_domain, rel.target_domain].sort());
  }

  return transactions;
}
