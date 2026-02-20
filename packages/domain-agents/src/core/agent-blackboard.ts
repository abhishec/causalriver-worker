/**
 * Agent Blackboard - Distributed Inter-Agent Communication (Redis-Backed)
 *
 * Implements the Blackboard Architecture Pattern for enterprise AI agents.
 * Allows agents to share discoveries mid-execution, enabling true collaborative
 * intelligence like Manus-style multi-agent systems.
 *
 * Phase 8.3: Enterprise AI Agent Transformation
 * Week 4 (Fix #3): Redis-backed distributed blackboard replaces in-memory LRU.
 *
 * Architecture:
 *   REDIS_URL set → Redis HSET for entries, PUBLISH/SUBSCRIBE for notifications
 *   REDIS_URL not set → In-memory LRU cache fallback (dev mode)
 *
 * Both modes expose the EXACT same public API — callers don't need to know
 * which backend is active.
 */

import { createLRUCache, type LRUCacheInstance } from '@nexus-ai/memory-stack';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of entries in the blackboard before LRU eviction kicks in */
const MAX_BLACKBOARD_ENTRIES = 10_000;

/** TTL for blackboard entries in seconds (30 minutes) */
const ENTRY_TTL_SECONDS = 1800;

/** Redis key prefix for blackboard entries */
const REDIS_BB_PREFIX = 'nexus:bb:';

/** Redis Pub/Sub channel for blackboard notifications */
const REDIS_BB_CHANNEL = 'nexus:bb:notify';

// ============================================================================
// TYPES
// ============================================================================

export type EntryType = 'discovery' | 'alert' | 'hypothesis' | 'question' | 'insight' | 'warning';

export type EntryPriority = 'critical' | 'high' | 'medium' | 'low';

export interface BlackboardEntry {
  id: string;
  agentId: string;
  domain: string;
  entryType: EntryType;
  priority: EntryPriority;
  content: Record<string, any>;
  metadata: {
    confidence: number;
    source?: string;
    relatedEntities?: string[];
  };
  timestamp: Date;
  relevantDomains: string[];
  consumed: boolean;
  consumedBy: string[];
}

export interface SubscriptionHandler {
  domain: string;
  handler: (entry: BlackboardEntry) => void | Promise<void>;
  filter?: (entry: BlackboardEntry) => boolean;
}

export interface BlackboardStats {
  totalEntries: number;
  entriesByType: Record<EntryType, number>;
  entriesByDomain: Record<string, number>;
  consumptionRate: number;
  averageLatency: number;
}

export interface BlackboardConfig {
  /** Organization ID for Redis key namespacing. When set, entries are scoped per-org. */
  organizationId?: string;
  /** Force in-memory mode even if REDIS_URL is available */
  forceInMemory?: boolean;
}

// ============================================================================
// AGENT BLACKBOARD CLASS — Dual-Backend (Redis or In-Memory)
// ============================================================================

class AgentBlackboard {
  private cache: LRUCacheInstance<BlackboardEntry>;
  private subscribers: Map<string, SubscriptionHandler[]> = new Map();
  private entryCounter: number = 0;
  private creationTimes: Map<string, number> = new Map();
  private consumptionTimes: Map<string, number[]> = new Map();

  // Redis backend (lazy-initialized)
  private redis: any = null;
  private redisSubscriber: any = null;
  private useRedis = false;
  private orgId = '';

  constructor(config?: BlackboardConfig) {
    this.orgId = config?.organizationId || '';

    // In-memory LRU cache — always available as primary (no Redis) or fallback
    this.cache = createLRUCache<BlackboardEntry>({
      maxSize: MAX_BLACKBOARD_ENTRIES,
      defaultTTLSeconds: ENTRY_TTL_SECONDS,
      namespace: 'blackboard',
      onEvict: (key: string) => {
        this.creationTimes.delete(key);
        this.consumptionTimes.delete(key);
      },
    });

    // Attempt Redis connection if configured and not forced to in-memory
    if (!config?.forceInMemory && typeof process !== 'undefined' && process.env?.REDIS_URL) {
      this.initRedis().catch((err) => {
        console.warn('[Blackboard] Redis init failed, using in-memory fallback:', err.message);
        this.useRedis = false;
      });
    }
  }

  /** Lazy Redis initialization */
  private async initRedis(): Promise<void> {
    try {
      const { createRedisClient } = await import('@nexus-ai/memory-stack');
      this.redis = createRedisClient({
        keyPrefix: this.orgId ? `${REDIS_BB_PREFIX}${this.orgId}:` : REDIS_BB_PREFIX,
      });

      // Test connection
      await this.redis.ping();
      this.useRedis = true;

      // Subscribe to notifications for real-time cross-instance updates
      this.redisSubscriber = createRedisClient({
        keyPrefix: '', // Pub/Sub doesn't use key prefix
      });

      const channel = this.orgId ? `${REDIS_BB_CHANNEL}:${this.orgId}` : REDIS_BB_CHANNEL;
      await this.redisSubscriber.subscribe(channel, (message: string) => {
        try {
          const entry = JSON.parse(message) as BlackboardEntry;
          entry.timestamp = new Date(entry.timestamp);
          // Notify local subscribers for cross-instance entries
          this.notifySubscribers(entry);
        } catch {
          // Malformed message, skip
        }
      });

      console.log(`[Blackboard] Redis connected (org: ${this.orgId || 'global'})`);
    } catch (err) {
      this.useRedis = false;
      throw err;
    }
  }

  /** Get all current entries */
  private get entries(): BlackboardEntry[] {
    // Redis mode: entries are in Redis, but we maintain a local cache for fast reads
    // The LRU cache serves as L1 cache in Redis mode too
    return this.cache.entries().map(e => e.value);
  }

  /**
   * Post a new entry to the blackboard.
   * Notifies all relevant subscribers immediately.
   * In Redis mode, also publishes to Pub/Sub for cross-instance notification.
   */
  post(entry: Omit<BlackboardEntry, 'id' | 'consumed' | 'consumedBy'>): string {
    const id = `bb_${Date.now()}_${++this.entryCounter}`;

    const fullEntry: BlackboardEntry = {
      ...entry,
      id,
      consumed: false,
      consumedBy: []
    };

    // Always write to L1 (LRU cache)
    this.cache.set(id, fullEntry);
    this.creationTimes.set(id, Date.now());

    // Redis L2: write to hash + publish notification
    if (this.useRedis && this.redis) {
      const serialized = JSON.stringify({
        ...fullEntry,
        timestamp: fullEntry.timestamp.toISOString(),
      });

      // Non-blocking Redis write
      Promise.all([
        this.redis.hset('entries', id, serialized),
        this.redis.expire('entries', ENTRY_TTL_SECONDS),
        this.redis.publish(
          this.orgId ? `${REDIS_BB_CHANNEL}:${this.orgId}` : REDIS_BB_CHANNEL,
          serialized
        ),
      ]).catch((err: Error) => {
        console.warn('[Blackboard] Redis write error (non-fatal):', err.message);
      });
    }

    // Notify local subscribers
    this.notifySubscribers(fullEntry);

    return id;
  }

  /**
   * Subscribe to blackboard updates for a specific domain
   */
  subscribe(
    domain: string,
    handler: (entry: BlackboardEntry) => void | Promise<void>,
    filter?: (entry: BlackboardEntry) => boolean
  ): () => void {
    const subscription: SubscriptionHandler = { domain, handler, filter };

    const existing = this.subscribers.get(domain) || [];
    existing.push(subscription);
    this.subscribers.set(domain, existing);

    // Return unsubscribe function
    return () => {
      const handlers = this.subscribers.get(domain) || [];
      const index = handlers.indexOf(subscription);
      if (index > -1) {
        handlers.splice(index, 1);
        this.subscribers.set(domain, handlers);
      }
    };
  }

  /**
   * Get all entries relevant to a specific domain.
   * Marks entries as consumed by that domain.
   */
  getRelevantEntries(domain: string, markConsumed: boolean = true): BlackboardEntry[] {
    const relevant = this.entries.filter(e =>
      e.relevantDomains.includes(domain) || e.relevantDomains.includes('all')
    );

    if (markConsumed) {
      for (const entry of relevant) {
        if (!entry.consumedBy.includes(domain)) {
          entry.consumedBy.push(domain);

          // Track consumption latency
          const creationTime = this.creationTimes.get(entry.id);
          if (creationTime) {
            const latency = Date.now() - creationTime;
            const times = this.consumptionTimes.get(entry.id) || [];
            times.push(latency);
            this.consumptionTimes.set(entry.id, times);
          }

          // Mark as consumed if all relevant domains have consumed
          if (entry.consumedBy.length >= entry.relevantDomains.length) {
            entry.consumed = true;
          }

          // Update in Redis
          if (this.useRedis && this.redis) {
            this.redis.hset('entries', entry.id, JSON.stringify({
              ...entry,
              timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
            })).catch(() => {});
          }
        }
      }
    }

    return relevant;
  }

  /**
   * Get unconsumed entries for a domain (new entries since last check)
   */
  getNewEntries(domain: string): BlackboardEntry[] {
    return this.entries.filter(e =>
      (e.relevantDomains.includes(domain) || e.relevantDomains.includes('all')) &&
      !e.consumedBy.includes(domain)
    );
  }

  /**
   * Get entries by type across all domains
   */
  getEntriesByType(type: EntryType): BlackboardEntry[] {
    return this.entries.filter(e => e.entryType === type);
  }

  /**
   * Get high priority entries that need immediate attention
   */
  getCriticalEntries(): BlackboardEntry[] {
    return this.entries.filter(e =>
      e.priority === 'critical' && !e.consumed
    );
  }

  /**
   * Query the blackboard with custom filters
   */
  query(predicate: (entry: BlackboardEntry) => boolean): BlackboardEntry[] {
    return this.entries.filter(predicate);
  }

  /**
   * Get blackboard statistics for monitoring
   */
  getStats(): BlackboardStats {
    const entriesByType: Record<string, number> = {};
    const entriesByDomain: Record<string, number> = {};

    for (const entry of this.entries) {
      entriesByType[entry.entryType] = (entriesByType[entry.entryType] || 0) + 1;
      entriesByDomain[entry.domain] = (entriesByDomain[entry.domain] || 0) + 1;
    }

    const consumedCount = this.entries.filter(e => e.consumed).length;
    const consumptionRate = this.entries.length > 0
      ? consumedCount / this.entries.length
      : 0;

    // Calculate average consumption latency
    let totalLatency = 0;
    let latencyCount = 0;
    for (const times of this.consumptionTimes.values()) {
      for (const time of times) {
        totalLatency += time;
        latencyCount++;
      }
    }
    const averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

    return {
      totalEntries: this.cache.size(),
      entriesByType: entriesByType as Record<EntryType, number>,
      entriesByDomain,
      consumptionRate,
      averageLatency
    };
  }

  /**
   * v11.5.1: Persist all blackboard entries to cross_domain_signals + ai_memory
   * so discoveries survive beyond the batch run and feed future agent reasoning.
   */
  async persistToDatabase(
    supabase: any,
    organizationId: string
  ): Promise<{ signalsStored: number; patternsStored: number }> {
    if (this.cache.size() === 0) return { signalsStored: 0, patternsStored: 0 };

    const { getClientForTableInEdge } = await import('./get-brain-client.ts');
    const brainClient = getClientForTableInEdge('cross_domain_signals');
    const memoryClient = getClientForTableInEdge('ai_memory');

    let signalsStored = 0;
    let patternsStored = 0;

    // Store all entries as cross_domain_signals
    const signalRows = this.entries.map(entry => ({
      organization_id: organizationId,
      source_domain: entry.domain,
      signal_type: `blackboard_${entry.entryType}`,
      signal_value: entry.metadata.confidence,
      entity_type: 'blackboard_entry',
      metadata: {
        agent_id: entry.agentId,
        priority: entry.priority,
        content: entry.content,
        relevant_domains: entry.relevantDomains,
        consumed_by: entry.consumedBy,
        timestamp: entry.timestamp
      }
    }));

    const { error: signalError } = await brainClient
      .from('cross_domain_signals')
      .insert(signalRows);

    if (!signalError) {
      signalsStored = signalRows.length;
    } else {
      console.error('[Blackboard] Signal persist error:', signalError);
    }

    // Store high-confidence discoveries/insights as ai_memory patterns
    const valuableEntries = this.entries.filter(e =>
      (e.entryType === 'discovery' || e.entryType === 'insight' || e.entryType === 'hypothesis') &&
      e.metadata.confidence >= 0.7
    );

    for (const entry of valuableEntries) {
      const { error: memError } = await memoryClient.from('ai_memory').insert({
        organization_id: organizationId,
        memory_type: entry.entryType === 'hypothesis' ? 'hypothesis' : 'pattern',
        entity_type: 'blackboard_discovery',
        title: `[${entry.domain}] ${JSON.stringify(entry.content).substring(0, 100)}`,
        content: {
          ...entry.content,
          source_domain: entry.domain,
          source_agent: entry.agentId,
          relevant_domains: entry.relevantDomains,
          priority: entry.priority
        },
        confidence: entry.metadata.confidence,
        severity: entry.priority === 'critical' ? 'critical' : entry.priority === 'high' ? 'high' : 'info',
        is_active: true
      });

      if (!memError) patternsStored++;
    }

    console.log(`[Blackboard] Persisted ${signalsStored} signals + ${patternsStored} patterns to brain`);
    return { signalsStored, patternsStored };
  }

  /**
   * Clear all entries (used between batch runs)
   */
  clear(): void {
    this.cache.clear();
    this.creationTimes.clear();
    this.consumptionTimes.clear();
    this.entryCounter = 0;

    // Clear Redis entries too
    if (this.useRedis && this.redis) {
      this.redis.del('entries').catch(() => {});
    }
  }

  /**
   * Export entries for persistence
   */
  export(): BlackboardEntry[] {
    return [...this.entries];
  }

  /**
   * Notify all relevant subscribers of a new entry
   */
  private async notifySubscribers(entry: BlackboardEntry): Promise<void> {
    const relevantDomains = [...entry.relevantDomains];
    if (!relevantDomains.includes('all')) {
      relevantDomains.push('all'); // Also notify 'all' subscribers
    }

    for (const domain of relevantDomains) {
      const handlers = this.subscribers.get(domain) || [];
      for (const sub of handlers) {
        // Apply filter if specified
        if (sub.filter && !sub.filter(entry)) {
          continue;
        }

        try {
          await sub.handler(entry);
        } catch (error) {
          console.error(`[Blackboard] Handler error for ${domain}:`, error);
        }
      }
    }
  }

  /** Check if Redis backend is active */
  isDistributed(): boolean {
    return this.useRedis;
  }

  /** Disconnect Redis (cleanup) */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect?.();
    }
    if (this.redisSubscriber) {
      await this.redisSubscriber.disconnect?.();
    }
  }
}

// ============================================================================
// FACTORY FUNCTION — Creates org-scoped or global blackboard
// ============================================================================

/**
 * Create a new blackboard instance, optionally scoped to an organization.
 * When REDIS_URL is set, the blackboard uses Redis for cross-instance sharing.
 * When REDIS_URL is not set, falls back to in-memory LRU (dev mode).
 */
export function createBlackboard(config?: BlackboardConfig): AgentBlackboard {
  return new AgentBlackboard(config);
}

// ============================================================================
// SINGLETON INSTANCE (backward-compatible)
// ============================================================================

/**
 * Global blackboard instance for inter-agent communication.
 * This is shared across all domain agents during a batch run.
 * For org-scoped blackboards, use createBlackboard({ organizationId }).
 */
export const blackboard = new AgentBlackboard();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convenience function to post a discovery
 */
export function postDiscovery(
  agentId: string,
  domain: string,
  content: Record<string, any>,
  relevantDomains: string[],
  priority: EntryPriority = 'medium',
  confidence: number = 0.8
): string {
  return blackboard.post({
    agentId,
    domain,
    entryType: 'discovery',
    priority,
    content,
    metadata: { confidence },
    timestamp: new Date(),
    relevantDomains
  });
}

/**
 * Convenience function to post a cross-domain alert
 */
export function postAlert(
  agentId: string,
  domain: string,
  alertType: string,
  message: string,
  relevantDomains: string[],
  relatedEntities: string[] = []
): string {
  return blackboard.post({
    agentId,
    domain,
    entryType: 'alert',
    priority: 'high',
    content: { alertType, message },
    metadata: {
      confidence: 1.0,
      relatedEntities
    },
    timestamp: new Date(),
    relevantDomains
  });
}

/**
 * Convenience function to post a hypothesis for other agents to validate
 */
export function postHypothesis(
  agentId: string,
  domain: string,
  hypothesis: string,
  evidence: any[],
  relevantDomains: string[],
  confidence: number = 0.6
): string {
  return blackboard.post({
    agentId,
    domain,
    entryType: 'hypothesis',
    priority: 'medium',
    content: { hypothesis, evidence },
    metadata: { confidence },
    timestamp: new Date(),
    relevantDomains
  });
}

/**
 * Format blackboard entries for inclusion in agent context
 */
export function formatBlackboardContext(domain: string): string {
  const entries = blackboard.getNewEntries(domain);

  if (entries.length === 0) {
    return '';
  }

  let context = '\n\n## Cross-Domain Intelligence (Real-Time Blackboard)\n';
  context += 'Other agents have discovered the following relevant information:\n\n';

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  entries.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  for (const entry of entries.slice(0, 10)) {
    const icon = entry.entryType === 'alert' ? '[ALERT]' :
                 entry.entryType === 'discovery' ? '[DISCOVERY]' :
                 entry.entryType === 'hypothesis' ? '[HYPOTHESIS]' :
                 entry.entryType === 'warning' ? '[WARNING]' : '[INSIGHT]';

    context += `${icon} **${entry.domain.toUpperCase()} Agent** (${entry.priority}):\n`;
    context += `   ${JSON.stringify(entry.content).substring(0, 200)}\n`;

    if (entry.metadata.relatedEntities?.length) {
      context += `   Related: ${entry.metadata.relatedEntities.slice(0, 3).join(', ')}\n`;
    }

    context += '\n';
  }

  return context;
}

// ============================================================================
// EXPORT
// ============================================================================

export default blackboard;
