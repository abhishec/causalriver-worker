/**
 * Bridge 1: Signal Collector → Event Bus
 *
 * Transforms collected signals into CausalEvents and publishes
 * them to the event bus. This is the entry point for all external
 * data flowing into the causal intelligence pipeline.
 *
 * Accepts both CrossDomainSignal (from signal collectors) and
 * ConnectorSignal (from external connectors) formats.
 */

import type { CrossDomainSignal } from '../causality/signal-collector';
import { createSignalEvent, generateEventId } from '../causality/event-bus';

type EventBusInstance = {
  emit: (event: any) => boolean;
};

/**
 * Flexible input type that accepts signals from any source.
 * CrossDomainSignal fields are optional to support connector signals too.
 */
export interface BridgeSignalInput {
  organization_id?: string;
  source_domain: string;
  signal_type: string;
  signal_value: number;
  entity_type?: string;
  entity_id?: string;
  client_id?: string;
  feature_vector?: Record<string, number>;
  signal_metadata?: Record<string, any>;
  lookback_window_days?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create a signal bridge that publishes signals to the event bus.
 *
 * Usage:
 * ```ts
 * const bridge = createSignalBridge(eventBus);
 * const collector = createSignalCollector({
 *   collectors: [...],
 *   onSignalsCollected: bridge.onSignalsCollected,
 * });
 * ```
 */
export function createSignalBridge(eventBus: EventBusInstance) {
  let totalSignalsPublished = 0;

  const onSignalsCollected = (signals: BridgeSignalInput[]) => {
    for (const signal of signals) {
      const orgId = signal.organization_id || 'default';
      const event = createSignalEvent(orgId, {
        signal_type: signal.signal_type,
        source_domain: signal.source_domain,
        entity_type: signal.entity_type || 'unknown',
        entity_id: signal.entity_id || generateEventId('ent'),
        client_id: signal.client_id,
        signal_value: signal.signal_value,
        feature_vector: signal.feature_vector || {},
        signal_metadata: signal.signal_metadata || signal.metadata || {},
      });

      eventBus.emit(event);
      totalSignalsPublished++;
    }
  };

  return {
    onSignalsCollected,
    getStats() {
      return { totalSignalsPublished };
    },
  };
}
