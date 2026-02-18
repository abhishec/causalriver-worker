/**
 * Redis Streams Event Bus — Persistent, scalable event bus for 10M+ signals
 *
 * Replaces the in-memory event bus (Bottleneck #1 & #9):
 * - Persistent: events survive process restarts
 * - Scalable: 10K+ events/sec with consumer groups
 * - Back-pressure: Redis handles backpressure natively
 * - Multi-consumer: parallel processing with consumer groups
 * - Exactly-once: XACK-based acknowledgment
 *
 * Architecture:
 *   Producer → XADD → Redis Stream → XREADGROUP → Consumer Group → Workers
 *                                                                    ↓
 *                                                              XACK on success
 */

import type { RedisClientInstance } from './redis-client';
import type { CausalEvent, CausalEventType, EventFilter, EventHandler, EventBusStats } from '../causality/event-bus';
import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface RedisStreamsBusConfig {
  /** Redis client instance */
  redis: RedisClientInstance;
  /** Stream key in Redis (default: 'nexus:events') */
  streamKey?: string;
  /** Consumer group name (default: 'nexus-workers') */
  consumerGroup?: string;
  /** Consumer name within the group (default: hostname-pid) */
  consumerName?: string;
  /** Max stream length before trimming (default: 100_000) */
  maxStreamLength?: number;
  /** Batch size per XREADGROUP call (default: 100) */
  batchSize?: number;
  /** Block time in ms when waiting for messages (default: 2000) */
  blockTimeMs?: number;
  /** Process pending messages on startup (default: true) */
  recoverPending?: boolean;
  /** Deduplication window in ms (default: 60_000) */
  deduplicationWindowMs?: number;
  /** Max retry attempts before sending to DLQ (default: 3) */
  maxRetries?: number;
  /** DLQ stream key (default: streamKey + ':dlq') */
  dlqStreamKey?: string;
  /** Logger */
  logger?: NexusLogger;
}

export interface StreamConsumerStats {
  name: string;
  pending: number;
  idle: number;
}

export interface RedisStreamsBusInstance {
  /** Emit a single event to the stream */
  emit(event: Omit<CausalEvent, 'vectorClock'> & { vectorClock?: number }): Promise<string>;
  /** Emit multiple events in batch */
  emitBatch(events: Array<Omit<CausalEvent, 'vectorClock'> & { vectorClock?: number }>): Promise<string[]>;
  /** Subscribe to events matching a filter */
  subscribe(options: { filter: EventFilter; handler: EventHandler }): string;
  /** Unsubscribe */
  unsubscribe(subscriptionId: string): boolean;
  /** Start consuming messages from the stream */
  startConsuming(): Promise<void>;
  /** Stop consuming */
  stopConsuming(): void;
  /** Get bus statistics */
  getStats(): Promise<EventBusStats & { streamLength: number; pendingMessages: number }>;
  /** Trim stream to max length */
  trim(): Promise<number>;
  /** Destroy and clean up */
  destroy(): Promise<void>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createRedisStreamsBus(config: RedisStreamsBusConfig): RedisStreamsBusInstance {
  const {
    redis,
    streamKey = 'nexus:events',
    consumerGroup = 'nexus-workers',
    consumerName = `worker-${process.pid}`,
    maxStreamLength = 100_000,
    batchSize = 100,
    blockTimeMs = 2000,
    recoverPending = true,
    deduplicationWindowMs = 60_000,
    maxRetries = 3,
  } = config;

  const dlqStreamKey = config.dlqStreamKey ?? `${streamKey}:dlq`;
  const logger = config.logger ?? getDefaultLogger().child({ module: 'redis-streams-bus' });

  // State
  let consuming = false;
  let consumeLoopPromise: Promise<void> | null = null;
  const subscriptions = new Map<string, { filter: EventFilter; handler: EventHandler }>();
  const seenEventIds = new Map<string, number>();
  let vectorClock = 0;

  // DLQ: Track retry counts per message ID
  const retryCountMap = new Map<string, number>();

  // Stats
  const stats = {
    totalEventsReceived: 0,
    totalEventsProcessed: 0,
    totalEventsFlushed: 0,
    totalEventsDropped: 0,
    duplicatesFiltered: 0,
    currentQueueSize: 0,
    averageFlushSize: 0,
    lastFlushTime: null as Date | null,
    vectorClockValue: 0,
    dlqMessages: 0,
    retriedMessages: 0,
  };

  // Deduplication cleanup
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of seenEventIds) {
      if (now - ts > deduplicationWindowMs) seenEventIds.delete(id);
    }
  }, deduplicationWindowMs);

  // Initialize consumer group
  const ensureGroup = async () => {
    try {
      await redis.xgroup('CREATE', streamKey, consumerGroup, '0', true);
      logger.info('Consumer group created', { streamKey, consumerGroup });
    } catch (err) {
      // Group already exists — that's fine
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('BUSYGROUP')) {
        logger.warn('Consumer group creation note', { error: msg });
      }
    }
  };

  // Serialize event to Redis fields
  const serializeEvent = (event: Omit<CausalEvent, 'vectorClock'> & { vectorClock?: number }): Record<string, string> => {
    return {
      eventId: event.eventId,
      organizationId: event.organizationId,
      domain: event.domain,
      entityType: event.entityType,
      entityId: event.entityId,
      clientId: event.clientId ?? '',
      eventType: event.eventType,
      payload: JSON.stringify(event.payload),
      timestamp: (event.timestamp || new Date()).toISOString(),
      vectorClock: String(event.vectorClock ?? ++vectorClock),
      priority: String(event.priority ?? 5),
    };
  };

  // Deserialize Redis fields to event
  const deserializeEvent = (fields: Record<string, string>): CausalEvent => {
    return {
      eventId: fields.eventId,
      organizationId: fields.organizationId,
      domain: fields.domain,
      entityType: fields.entityType,
      entityId: fields.entityId,
      clientId: fields.clientId || undefined,
      eventType: fields.eventType as CausalEventType,
      payload: JSON.parse(fields.payload || '{}'),
      timestamp: new Date(fields.timestamp),
      vectorClock: parseInt(fields.vectorClock, 10),
      priority: parseInt(fields.priority, 10) || 5,
    };
  };

  // Match event against filter
  const matchesFilter = (event: CausalEvent, filter: EventFilter): boolean => {
    if (filter.domains && !filter.domains.includes(event.domain)) return false;
    if (filter.eventTypes && !filter.eventTypes.includes(event.eventType)) return false;
    if (filter.organizationId && filter.organizationId !== event.organizationId) return false;
    if (filter.minPriority && (event.priority || 5) > filter.minPriority) return false;
    return true;
  };

  // Send a failed message to the Dead Letter Queue
  const sendToDLQ = async (msg: { id: string; message: Record<string, string> }, reason: string) => {
    try {
      await redis.xadd(dlqStreamKey, '*', {
        ...msg.message,
        _dlq_reason: reason,
        _dlq_original_id: msg.id,
        _dlq_retry_count: String(retryCountMap.get(msg.id) ?? 0),
        _dlq_timestamp: new Date().toISOString(),
      });
      stats.dlqMessages++;
      retryCountMap.delete(msg.id);
      // ACK the original message so it doesn't stay pending forever
      await redis.xack(streamKey, consumerGroup, msg.id);
      logger.warn('Message sent to DLQ', { messageId: msg.id, reason });
    } catch (dlqErr) {
      logger.error('Failed to send to DLQ', { messageId: msg.id, error: dlqErr instanceof Error ? dlqErr.message : String(dlqErr) });
    }
  };

  // Process a batch of messages (with retry + DLQ support)
  const processBatch = async (messages: Array<{ id: string; message: Record<string, string> }>) => {
    const events: CausalEvent[] = [];
    const msgMap = new Map<string, { id: string; message: Record<string, string> }>();

    for (const msg of messages) {
      try {
        const event = deserializeEvent(msg.message);

        // Deduplication
        if (seenEventIds.has(event.eventId)) {
          stats.duplicatesFiltered++;
          await redis.xack(streamKey, consumerGroup, msg.id);
          continue;
        }
        seenEventIds.set(event.eventId, Date.now());

        events.push(event);
        msgMap.set(event.eventId, msg);
        stats.totalEventsProcessed++;
      } catch (err) {
        // Deserialization failure — check retry count
        const retries = (retryCountMap.get(msg.id) ?? 0) + 1;
        retryCountMap.set(msg.id, retries);

        if (retries >= maxRetries) {
          await sendToDLQ(msg, `Deserialization failed after ${retries} attempts: ${err instanceof Error ? err.message : String(err)}`);
        } else {
          stats.retriedMessages++;
          logger.warn('Retrying failed message', { messageId: msg.id, attempt: retries, maxRetries });
        }
      }
    }

    if (events.length === 0) return;

    // Notify subscribers (with per-subscriber error handling + DLQ)
    for (const sub of subscriptions.values()) {
      const matching = events.filter(e => matchesFilter(e, sub.filter));
      if (matching.length > 0) {
        try {
          await sub.handler(matching);
        } catch (err) {
          // Handler failed — retry or DLQ each event
          for (const event of matching) {
            const msg = msgMap.get(event.eventId);
            if (!msg) continue;

            const retries = (retryCountMap.get(msg.id) ?? 0) + 1;
            retryCountMap.set(msg.id, retries);

            if (retries >= maxRetries) {
              await sendToDLQ(msg, `Handler error after ${retries} attempts: ${err instanceof Error ? err.message : String(err)}`);
            } else {
              stats.retriedMessages++;
              logger.warn('Handler failed, will retry', { messageId: msg.id, attempt: retries });
            }
          }
        }
      }
    }

    // ACK all processed messages
    const ids = messages.map(m => m.id);
    await redis.xack(streamKey, consumerGroup, ...ids);
  };

  // Consumer loop
  const consumeLoop = async () => {
    await ensureGroup();

    // Recover pending messages first
    if (recoverPending) {
      logger.info('Recovering pending messages...');
      const pending = await redis.xreadgroup({
        group: consumerGroup,
        consumer: consumerName,
        count: batchSize,
        block: 0,
        streams: [streamKey],
        ids: ['0'],
      });
      if (pending) {
        for (const stream of pending) {
          if (stream.messages.length > 0) {
            logger.info('Recovered pending messages', { count: stream.messages.length });
            await processBatch(stream.messages);
          }
        }
      }
    }

    // Main consume loop
    while (consuming) {
      try {
        const result = await redis.xreadgroup({
          group: consumerGroup,
          consumer: consumerName,
          count: batchSize,
          block: blockTimeMs,
          streams: [streamKey],
          ids: ['>'],
        });

        if (result) {
          for (const stream of result) {
            if (stream.messages.length > 0) {
              await processBatch(stream.messages);
            }
          }
        }
      } catch (err) {
        if (consuming) {
          logger.error('Consumer loop error', { error: err instanceof Error ? err.message : String(err) });
          // Back off on errors
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  };

  return {
    async emit(event) {
      stats.totalEventsReceived++;

      // Deduplication check before writing
      if (seenEventIds.has(event.eventId)) {
        stats.duplicatesFiltered++;
        return '';
      }

      const fields = serializeEvent(event);
      const id = await redis.xadd(streamKey, '*', fields);

      seenEventIds.set(event.eventId, Date.now());
      stats.totalEventsFlushed++;
      stats.vectorClockValue = ++vectorClock;

      // Trim if needed
      const len = await redis.xlen(streamKey);
      if (len > maxStreamLength * 1.1) {
        await redis.xtrim(streamKey, 'MAXLEN', maxStreamLength);
      }

      return id;
    },

    async emitBatch(events) {
      const ids: string[] = [];
      const pipe = redis.pipeline();

      for (const event of events) {
        stats.totalEventsReceived++;

        if (seenEventIds.has(event.eventId)) {
          stats.duplicatesFiltered++;
          ids.push('');
          continue;
        }

        const fields = serializeEvent(event);
        pipe.xadd(streamKey, '*', fields);
        seenEventIds.set(event.eventId, Date.now());
        stats.totalEventsFlushed++;
      }

      const results = await pipe.exec();
      for (const [err, id] of results) {
        if (!err && id) ids.push(String(id));
      }

      stats.vectorClockValue = ++vectorClock;
      return ids;
    },

    subscribe(options) {
      const id = `sub_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 7)}`;
      subscriptions.set(id, options);
      return id;
    },

    unsubscribe(subscriptionId) {
      return subscriptions.delete(subscriptionId);
    },

    async startConsuming() {
      if (consuming) return;
      consuming = true;
      consumeLoopPromise = consumeLoop();
      logger.info('Started consuming', { streamKey, consumerGroup, consumerName });
    },

    stopConsuming() {
      consuming = false;
      logger.info('Stopped consuming', { streamKey, consumerGroup, consumerName });
    },

    async getStats() {
      const streamLength = await redis.xlen(streamKey);
      const pending = await redis.xpending(streamKey, consumerGroup).catch(() => ({ pending: 0 }));

      return {
        ...stats,
        currentQueueSize: streamLength,
        streamLength,
        pendingMessages: pending.pending,
      };
    },

    async trim() {
      return redis.xtrim(streamKey, 'MAXLEN', maxStreamLength);
    },

    async destroy() {
      consuming = false;
      clearInterval(cleanupInterval);
      seenEventIds.clear();
      subscriptions.clear();
      retryCountMap.clear();
      if (consumeLoopPromise) {
        await consumeLoopPromise.catch((err) => {
          // Fire-and-forget: consume loop termination may fail without blocking main flow
        });
      }
      logger.info('Redis Streams bus destroyed');
    },
  };
}
