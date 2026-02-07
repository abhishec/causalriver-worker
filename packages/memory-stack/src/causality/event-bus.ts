/**
 * Nexus Memory Stack - Real-Time Causal Event Bus
 *
 * L4: Causal Graph Engine - Event Streaming Foundation
 *
 * Provides real-time event streaming for causal intelligence with:
 * - Event deduplication using eventId
 * - Debounced batching for database efficiency
 * - Priority queue for critical events
 * - Lamport vector clocks for event ordering
 * - Backpressure handling for high-volume streams
 *
 * This replaces the hourly batch processing with sub-minute signal detection.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A causal event that flows through the system
 */
export interface CausalEvent {
  /** Unique identifier for deduplication */
  eventId: string;
  /** Organization this event belongs to (multi-tenant isolation) */
  organizationId: string;
  /** Domain that generated this event */
  domain: string;
  /** Type of entity this event relates to */
  entityType: string;
  /** ID of the affected entity */
  entityId: string;
  /** Optional client ID for client-scoped events */
  clientId?: string;
  /** Type of event */
  eventType: CausalEventType;
  /** Event payload data */
  payload: Record<string, unknown>;
  /** When this event occurred */
  timestamp: Date;
  /** Lamport vector clock for ordering */
  vectorClock: number;
  /** Priority for processing (1 = highest, 5 = lowest) */
  priority?: number;
}

export type CausalEventType =
  | 'signal'
  | 'intervention'
  | 'outcome'
  | 'relationship_update'
  | 'cascade_trigger'
  | 'cascade_propagation'
  | 'prediction'
  | 'feedback';

/**
 * Configuration for the event bus
 */
export interface EventBusConfig {
  /** Debounce window in milliseconds before flushing (default: 500ms) */
  debounceMs: number;
  /** Maximum events per batch (default: 50) */
  batchSize: number;
  /** Maximum wait time before forced flush (default: 5000ms) */
  flushIntervalMs: number;
  /** Enable event deduplication (default: true) */
  enableDeduplication: boolean;
  /** Time window for deduplication in ms (default: 60000ms = 1 minute) */
  deduplicationWindowMs: number;
  /** Maximum queue size before backpressure (default: 1000) */
  maxQueueSize: number;
}

/**
 * Event handler callback type
 */
export type EventHandler = (events: CausalEvent[]) => Promise<void>;

/**
 * Event filter for selective subscriptions
 */
export interface EventFilter {
  domains?: string[];
  eventTypes?: CausalEventType[];
  organizationId?: string;
  minPriority?: number;
}

/**
 * Subscription to event bus
 */
export interface EventSubscription {
  id: string;
  filter: EventFilter;
  handler: EventHandler;
}

/**
 * Event bus statistics
 */
export interface EventBusStats {
  totalEventsReceived: number;
  totalEventsFlushed: number;
  totalEventsDropped: number;
  duplicatesFiltered: number;
  currentQueueSize: number;
  averageFlushSize: number;
  lastFlushTime: Date | null;
  vectorClockValue: number;
}

// ============================================================================
// LAMPORT CLOCK
// ============================================================================

/**
 * Lamport logical clock for event ordering
 */
class LamportClock {
  private value: number = 0;

  tick(): number {
    return ++this.value;
  }

  update(receivedValue: number): number {
    this.value = Math.max(this.value, receivedValue) + 1;
    return this.value;
  }

  getValue(): number {
    return this.value;
  }
}

// ============================================================================
// EVENT BUS IMPLEMENTATION
// ============================================================================

/**
 * Create a real-time causal event bus
 *
 * @example
 * ```typescript
 * const eventBus = createEventBus({
 *   debounceMs: 500,
 *   batchSize: 50,
 *   flushIntervalMs: 5000
 * });
 *
 * // Subscribe to finance signals
 * eventBus.subscribe({
 *   filter: { domains: ['finance'], eventTypes: ['signal'] },
 *   handler: async (events) => {
 *     console.log('Finance signals:', events.length);
 *   }
 * });
 *
 * // Emit an event
 * eventBus.emit({
 *   eventId: 'evt_123',
 *   organizationId: 'org_456',
 *   domain: 'finance',
 *   entityType: 'client',
 *   entityId: 'client_789',
 *   eventType: 'signal',
 *   payload: { signal_type: 'payment_velocity_declining', signal_value: -0.5 },
 *   timestamp: new Date(),
 *   vectorClock: 0
 * });
 *
 * // Flush to database
 * await eventBus.flush(supabase);
 * ```
 */
export function createEventBus(config: Partial<EventBusConfig> = {}) {
  const {
    debounceMs = 500,
    batchSize = 50,
    flushIntervalMs = 5000,
    enableDeduplication = true,
    deduplicationWindowMs = 60000,
    maxQueueSize = 1000
  } = config;

  // Internal state
  const clock = new LamportClock();
  const eventQueue: CausalEvent[] = [];
  const seenEventIds = new Map<string, number>(); // eventId -> timestamp
  const subscriptions = new Map<string, EventSubscription>();

  // Stats
  let stats: EventBusStats = {
    totalEventsReceived: 0,
    totalEventsFlushed: 0,
    totalEventsDropped: 0,
    duplicatesFiltered: 0,
    currentQueueSize: 0,
    averageFlushSize: 0,
    lastFlushTime: null,
    vectorClockValue: 0
  };

  // Timers
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let flushInterval: ReturnType<typeof setInterval> | null = null;
  let pendingFlush: Promise<void> | null = null;

  // Clean up old deduplication entries periodically
  const cleanupDeduplicationCache = () => {
    const now = Date.now();
    for (const [eventId, timestamp] of seenEventIds.entries()) {
      if (now - timestamp > deduplicationWindowMs) {
        seenEventIds.delete(eventId);
      }
    }
  };

  // Start cleanup interval
  const cleanupInterval = setInterval(cleanupDeduplicationCache, deduplicationWindowMs);

  /**
   * Check if an event passes a filter
   */
  const matchesFilter = (event: CausalEvent, filter: EventFilter): boolean => {
    if (filter.domains && !filter.domains.includes(event.domain)) {
      return false;
    }
    if (filter.eventTypes && !filter.eventTypes.includes(event.eventType)) {
      return false;
    }
    if (filter.organizationId && filter.organizationId !== event.organizationId) {
      return false;
    }
    if (filter.minPriority && (event.priority || 5) > filter.minPriority) {
      return false;
    }
    return true;
  };

  /**
   * Notify subscribers of events
   */
  const notifySubscribers = async (events: CausalEvent[]) => {
    const promises: Promise<void>[] = [];

    for (const subscription of subscriptions.values()) {
      const matchingEvents = events.filter(e => matchesFilter(e, subscription.filter));
      if (matchingEvents.length > 0) {
        promises.push(
          subscription.handler(matchingEvents).catch(error => {
            console.error(`[EventBus] Subscriber ${subscription.id} error:`, error);
          })
        );
      }
    }

    await Promise.all(promises);
  };

  /**
   * Flush events to database and notify subscribers
   */
  const doFlush = async (supabase: SupabaseClient) => {
    if (eventQueue.length === 0) return;

    // Take events from queue
    const eventsToFlush = eventQueue.splice(0, batchSize);

    // Sort by priority then vector clock
    eventsToFlush.sort((a, b) => {
      const priorityDiff = (a.priority || 5) - (b.priority || 5);
      if (priorityDiff !== 0) return priorityDiff;
      return a.vectorClock - b.vectorClock;
    });

    // Map to database format
    const dbRecords = eventsToFlush.map(event => ({
      id: event.eventId,
      organization_id: event.organizationId,
      event_type: event.eventType,
      domain: event.domain,
      entity_type: event.entityType,
      entity_id: event.entityId,
      client_id: event.clientId || null,
      payload: event.payload,
      vector_clock: event.vectorClock,
      priority: event.priority || 5,
      created_at: event.timestamp.toISOString(),
      processing_status: 'pending'
    }));

    // Insert to database
    const { error } = await supabase
      .from('causal_event_stream')
      .upsert(dbRecords, {
        onConflict: 'id',
        ignoreDuplicates: true
      });

    if (error) {
      console.error('[EventBus] Database flush error:', error);
      // Put events back in queue on failure
      eventQueue.unshift(...eventsToFlush);
      throw error;
    }

    // Update stats
    stats.totalEventsFlushed += eventsToFlush.length;
    stats.currentQueueSize = eventQueue.length;
    stats.lastFlushTime = new Date();
    stats.averageFlushSize =
      (stats.averageFlushSize * (stats.totalEventsFlushed - eventsToFlush.length) +
        eventsToFlush.length) /
      stats.totalEventsFlushed;

    // Notify subscribers
    await notifySubscribers(eventsToFlush);
  };

  /**
   * Schedule a debounced flush
   */
  const scheduleFlush = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
    }, debounceMs);
  };

  return {
    /**
     * Emit a causal event to the bus
     */
    emit(event: Omit<CausalEvent, 'vectorClock'> & { vectorClock?: number }): boolean {
      stats.totalEventsReceived++;

      // Check for duplicates
      if (enableDeduplication && seenEventIds.has(event.eventId)) {
        stats.duplicatesFiltered++;
        return false;
      }

      // Check queue capacity (backpressure)
      if (eventQueue.length >= maxQueueSize) {
        stats.totalEventsDropped++;
        console.warn('[EventBus] Queue full, dropping event:', event.eventId);
        return false;
      }

      // Assign vector clock
      const vectorClock = event.vectorClock
        ? clock.update(event.vectorClock)
        : clock.tick();

      // Add to queue
      const fullEvent: CausalEvent = {
        ...event,
        vectorClock,
        timestamp: event.timestamp || new Date()
      };

      eventQueue.push(fullEvent);
      stats.currentQueueSize = eventQueue.length;
      stats.vectorClockValue = clock.getValue();

      // Track for deduplication
      if (enableDeduplication) {
        seenEventIds.set(event.eventId, Date.now());
      }

      // Schedule flush
      scheduleFlush();

      return true;
    },

    /**
     * Emit multiple events in batch
     */
    emitBatch(events: Array<Omit<CausalEvent, 'vectorClock'> & { vectorClock?: number }>): number {
      let emitted = 0;
      for (const event of events) {
        if (this.emit(event)) {
          emitted++;
        }
      }
      return emitted;
    },

    /**
     * Flush events to database
     */
    async flush(supabase: SupabaseClient): Promise<void> {
      // Prevent concurrent flushes
      if (pendingFlush) {
        await pendingFlush;
      }

      pendingFlush = doFlush(supabase);
      try {
        await pendingFlush;
      } finally {
        pendingFlush = null;
      }
    },

    /**
     * Subscribe to events matching a filter
     */
    subscribe(options: {
      filter: EventFilter;
      handler: EventHandler;
    }): string {
      const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      subscriptions.set(id, {
        id,
        filter: options.filter,
        handler: options.handler
      });
      return id;
    },

    /**
     * Unsubscribe from events
     */
    unsubscribe(subscriptionId: string): boolean {
      return subscriptions.delete(subscriptionId);
    },

    /**
     * Start automatic periodic flushing
     */
    startAutoFlush(supabase: SupabaseClient): void {
      if (flushInterval) {
        clearInterval(flushInterval);
      }

      flushInterval = setInterval(async () => {
        if (eventQueue.length > 0) {
          try {
            await this.flush(supabase);
          } catch (error) {
            console.error('[EventBus] Auto-flush error:', error);
          }
        }
      }, flushIntervalMs);
    },

    /**
     * Stop automatic flushing
     */
    stopAutoFlush(): void {
      if (flushInterval) {
        clearInterval(flushInterval);
        flushInterval = null;
      }
    },

    /**
     * Get current event bus statistics
     */
    getStats(): EventBusStats {
      return { ...stats, currentQueueSize: eventQueue.length };
    },

    /**
     * Get current queue size
     */
    getQueueSize(): number {
      return eventQueue.length;
    },

    /**
     * Get current vector clock value
     */
    getVectorClock(): number {
      return clock.getValue();
    },

    /**
     * Clear all pending events (use with caution)
     */
    clear(): void {
      eventQueue.length = 0;
      stats.currentQueueSize = 0;
    },

    /**
     * Destroy the event bus and clean up resources
     */
    destroy(): void {
      this.stopAutoFlush();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      clearInterval(cleanupInterval);
      eventQueue.length = 0;
      seenEventIds.clear();
      subscriptions.clear();
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique event ID
 */
export function generateEventId(prefix: string = 'evt'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a signal event from a CrossDomainSignal
 */
export function createSignalEvent(
  organizationId: string,
  signal: {
    signal_type: string;
    source_domain: string;
    entity_type: string;
    entity_id: string;
    client_id?: string;
    signal_value: number;
    feature_vector: Record<string, number>;
    signal_metadata: Record<string, unknown>;
  }
): Omit<CausalEvent, 'vectorClock'> {
  return {
    eventId: generateEventId('sig'),
    organizationId,
    domain: signal.source_domain,
    entityType: signal.entity_type,
    entityId: signal.entity_id,
    clientId: signal.client_id,
    eventType: 'signal',
    payload: {
      signal_type: signal.signal_type,
      signal_value: signal.signal_value,
      feature_vector: signal.feature_vector,
      ...signal.signal_metadata
    },
    timestamp: new Date(),
    priority: signal.signal_value < -0.7 ? 1 : signal.signal_value < -0.4 ? 2 : 3
  };
}

/**
 * Create an intervention event
 */
export function createInterventionEvent(
  organizationId: string,
  intervention: {
    entity_type: string;
    entity_id: string;
    client_id?: string;
    intervention_type: string;
    description?: string;
    triggered_by_signal_id?: string;
  }
): Omit<CausalEvent, 'vectorClock'> {
  return {
    eventId: generateEventId('int'),
    organizationId,
    domain: 'interventions',
    entityType: intervention.entity_type,
    entityId: intervention.entity_id,
    clientId: intervention.client_id,
    eventType: 'intervention',
    payload: {
      intervention_type: intervention.intervention_type,
      description: intervention.description,
      triggered_by_signal_id: intervention.triggered_by_signal_id
    },
    timestamp: new Date(),
    priority: 2
  };
}

/**
 * Create an outcome event
 */
export function createOutcomeEvent(
  organizationId: string,
  outcome: {
    entity_type: string;
    entity_id: string;
    client_id?: string;
    metric_name: string;
    metric_value: number;
    intervention_id?: string;
    prediction_id?: string;
  }
): Omit<CausalEvent, 'vectorClock'> {
  return {
    eventId: generateEventId('out'),
    organizationId,
    domain: 'outcomes',
    entityType: outcome.entity_type,
    entityId: outcome.entity_id,
    clientId: outcome.client_id,
    eventType: 'outcome',
    payload: {
      metric_name: outcome.metric_name,
      metric_value: outcome.metric_value,
      intervention_id: outcome.intervention_id,
      prediction_id: outcome.prediction_id
    },
    timestamp: new Date(),
    priority: 3
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const EventBus = {
  createEventBus,
  generateEventId,
  createSignalEvent,
  createInterventionEvent,
  createOutcomeEvent
};
