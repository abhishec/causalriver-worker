/**
 * Bridge 2: Event Bus → Causal Discovery
 *
 * Subscribes to 'signal' events on the bus. Supports two paths:
 *   - Batch: Buffers signals then runs full Granger discovery
 *   - Incremental: Feeds each event into the ContinuousLearner
 *
 * Discovered relationships are emitted back as 'relationship_update'
 * events, feeding downstream bridges.
 */

import type { CausalEvent } from '../causality/event-bus';
import { generateEventId } from '../causality/event-bus';
import {
  runCausalDiscovery,
  type CausalRelationship,
} from '../causality/causal-discovery-runner';
import type { RawSignal } from '../causality/signal-to-timeseries';

type EventBusInstance = {
  emit: (event: any) => boolean;
  subscribe: (options: {
    filter: any;
    handler: (events: CausalEvent[]) => Promise<void>;
  }) => string;
};

type ContinuousLearnerInstance = {
  processEvent: (event: any) => any;
};

export interface CausalSubscriberConfig {
  /** Minimum signals before batch causal discovery (default: 200) */
  batchThreshold: number;
  /** Enable incremental per-event learning (default: true) */
  enableIncrementalLearning: boolean;
  /** ContinuousLearner instance for real-time updates */
  continuousLearner?: ContinuousLearnerInstance;
}

const DEFAULT_CONFIG: CausalSubscriberConfig = {
  batchThreshold: 200,
  enableIncrementalLearning: true,
};

/**
 * Subscribe to signal events and drive causal discovery
 */
export function createCausalSubscriber(
  eventBus: EventBusInstance,
  config: Partial<CausalSubscriberConfig> = {}
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Buffer for batch discovery
  const signalBuffer = new Map<string, RawSignal[]>(); // orgId -> signals
  let totalSignalsProcessed = 0;
  let totalRelationshipsDiscovered = 0;
  let totalBatchRuns = 0;

  const subscriptionId = eventBus.subscribe({
    filter: { eventTypes: ['signal'] as any },
    handler: async (events: CausalEvent[]) => {
      for (const event of events) {
        totalSignalsProcessed++;
        const orgId = event.organizationId;

        // Path 1: Incremental learning
        if (fullConfig.enableIncrementalLearning && fullConfig.continuousLearner) {
          const update = fullConfig.continuousLearner.processEvent(event);
          if (update && update.edgesUpdated > 0) {
            // Emit relationship updates for downstream bridges
            eventBus.emit({
              eventId: generateEventId('rel'),
              organizationId: orgId,
              domain: event.domain,
              entityType: 'relationship',
              entityId: `${event.domain}_incremental`,
              eventType: 'relationship_update' as any,
              payload: {
                source: 'incremental_learner',
                source_domain: event.domain,
                ...update,
              },
              timestamp: new Date(),
              priority: 3,
            });
          }
        }

        // Path 2: Buffer for batch discovery
        if (!signalBuffer.has(orgId)) {
          signalBuffer.set(orgId, []);
        }

        signalBuffer.get(orgId)!.push({
          organization_id: orgId,
          source_domain: event.domain,
          signal_type: (event.payload.signal_type as string) || 'unknown',
          signal_value: (event.payload.signal_value as number) || 0,
          signal_timestamp: event.timestamp,
        });

        // Run batch discovery when threshold reached
        const buffer = signalBuffer.get(orgId)!;
        if (buffer.length >= fullConfig.batchThreshold) {
          totalBatchRuns++;

          try {
            const result = runCausalDiscovery(
              buffer.map(s => ({
                source_domain: s.source_domain,
                signal_type: s.signal_type,
                signal_value: s.signal_value,
                signal_timestamp: s.signal_timestamp,
              })),
              orgId
            );

            // Emit each discovered relationship
            for (const rel of result.discovered_relationships) {
              totalRelationshipsDiscovered++;
              eventBus.emit({
                eventId: generateEventId('rel'),
                organizationId: orgId,
                domain: rel.source_domain,
                entityType: 'relationship',
                entityId: `${rel.source_domain}_${rel.target_domain}`,
                eventType: 'relationship_update' as any,
                payload: {
                  source: 'batch_discovery',
                  source_domain: rel.source_domain,
                  target_domain: rel.target_domain,
                  granger_f_statistic: rel.granger_f_statistic,
                  granger_p_value: rel.granger_p_value,
                  optimal_lag_days: rel.optimal_lag_days,
                  effect_size: rel.effect_size,
                  natural_language: rel.natural_language,
                  is_significant: rel.is_significant,
                  sample_size: rel.sample_size,
                },
                timestamp: new Date(),
                priority: 2,
              });
            }
          } catch {
            // Not enough data for discovery yet
          }

          // Clear buffer after processing
          signalBuffer.set(orgId, []);
        }
      }
    },
  });

  return {
    subscriptionId,
    getStats() {
      return {
        totalSignalsProcessed,
        totalRelationshipsDiscovered,
        totalBatchRuns,
        bufferedSignals: Object.fromEntries(
          Array.from(signalBuffer.entries()).map(([k, v]) => [k, v.length])
        ),
      };
    },
  };
}
