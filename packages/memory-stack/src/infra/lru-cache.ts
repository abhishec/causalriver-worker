/**
 * LRU Cache — Bounded in-memory cache with TTL support
 *
 * Fixes Bottleneck #2: Agent blackboard unbounded array causing OOM
 * Also used for: LLM semantic cache, CORE snapshot cache, fast-path cache
 *
 * Features:
 * - O(1) get/set/delete via Map + doubly-linked list
 * - Configurable max capacity with LRU eviction
 * - Optional TTL per entry
 * - Hit/miss statistics
 * - Namespace isolation
 * - Redis-backed persistence (optional)
 */

import type { RedisClientInstance } from './redis-client';
import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface LRUCacheConfig {
  /** Maximum number of entries (default: 10_000) */
  maxSize: number;
  /** Default TTL in seconds (default: 3600 = 1hr, 0 = no TTL) */
  defaultTTLSeconds?: number;
  /** Namespace prefix for isolation */
  namespace?: string;
  /** Redis client for persistence (optional — enables write-through) */
  redis?: RedisClientInstance;
  /** Redis TTL for persisted entries (default: same as defaultTTLSeconds) */
  redisTTLSeconds?: number;
  /** Logger */
  logger?: NexusLogger;
  /** Eviction callback */
  onEvict?: (key: string, value: unknown) => void;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: number;
  namespace: string;
}

export interface LRUCacheInstance<V = unknown> {
  /** Get a value by key */
  get(key: string): V | undefined;
  /** Get with async Redis fallback */
  getAsync(key: string): Promise<V | undefined>;
  /** Set a value with optional TTL override */
  set(key: string, value: V, ttlSeconds?: number): void;
  /** Set with async Redis persistence */
  setAsync(key: string, value: V, ttlSeconds?: number): Promise<void>;
  /** Check if key exists */
  has(key: string): boolean;
  /** Delete a key */
  delete(key: string): boolean;
  /** Clear all entries */
  clear(): void;
  /** Get cache statistics */
  getStats(): CacheStats;
  /** Get all keys */
  keys(): string[];
  /** Get number of entries */
  size(): number;
  /** Get entries as array (most recent first) */
  entries(): Array<{ key: string; value: V; ttl: number | null }>;
  /** Peek at a value without updating LRU order */
  peek(key: string): V | undefined;
  /** Destroy the cache */
  destroy(): void;
}

// ============================================================================
// DOUBLY-LINKED LIST NODE
// ============================================================================

interface LRUNode<V> {
  key: string;
  value: V;
  expiresAt: number | null;
  prev: LRUNode<V> | null;
  next: LRUNode<V> | null;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createLRUCache<V = unknown>(config: LRUCacheConfig): LRUCacheInstance<V> {
  const {
    maxSize,
    defaultTTLSeconds = 3600,
    namespace = 'default',
    redis,
    redisTTLSeconds = defaultTTLSeconds,
    onEvict,
  } = config;

  const logger = config.logger ?? getDefaultLogger().child({ module: 'lru-cache', namespace });

  // Map for O(1) lookup
  const map = new Map<string, LRUNode<V>>();

  // Sentinel nodes for doubly-linked list
  const head: LRUNode<V> = { key: '__head__', value: undefined as V, expiresAt: null, prev: null, next: null };
  const tail: LRUNode<V> = { key: '__tail__', value: undefined as V, expiresAt: null, prev: null, next: null };
  head.next = tail;
  tail.prev = head;

  // Stats
  let stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
  };

  // TTL cleanup interval
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, node] of map) {
      if (node.expiresAt && now > node.expiresAt) {
        removeNode(node);
        map.delete(key);
      }
    }
  }, Math.max(defaultTTLSeconds * 250, 5000)); // Check at 1/4 of TTL, minimum 5s

  // Linked list operations
  function addToFront(node: LRUNode<V>): void {
    node.prev = head;
    node.next = head.next;
    head.next!.prev = node;
    head.next = node;
  }

  function removeNode(node: LRUNode<V>): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    node.prev = null;
    node.next = null;
  }

  function moveToFront(node: LRUNode<V>): void {
    removeNode(node);
    addToFront(node);
  }

  function evictLRU(): void {
    const lru = tail.prev;
    if (!lru || lru === head) return;

    removeNode(lru);
    map.delete(lru.key);
    stats.evictions++;

    if (onEvict) {
      try { onEvict(lru.key, lru.value); } catch { /* ignore */ }
    }
  }

  // Namespaced key
  const nk = (key: string) => `${namespace}:${key}`;

  const instance: LRUCacheInstance<V> = {
    get(key: string): V | undefined {
      const node = map.get(key);
      if (!node) {
        stats.misses++;
        return undefined;
      }

      // Check TTL
      if (node.expiresAt && Date.now() > node.expiresAt) {
        removeNode(node);
        map.delete(key);
        stats.misses++;
        return undefined;
      }

      // Move to front (most recently used)
      moveToFront(node);
      stats.hits++;
      return node.value;
    },

    async getAsync(key: string): Promise<V | undefined> {
      // Try local cache first
      const local = instance.get(key);
      if (local !== undefined) return local;

      // Try Redis
      if (redis) {
        try {
          const raw = await redis.get(nk(key));
          if (raw) {
            const value = JSON.parse(raw) as V;
            // Warm local cache
            instance.set(key, value);
            stats.hits++; // Count as hit since we found it
            stats.misses--; // Undo the miss from instance.get
            return value;
          }
        } catch { /* Redis unavailable, return undefined */ }
      }

      return undefined;
    },

    set(key: string, value: V, ttlSeconds?: number): void {
      const ttl = ttlSeconds ?? defaultTTLSeconds;
      const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : null;

      const existing = map.get(key);
      if (existing) {
        existing.value = value;
        existing.expiresAt = expiresAt;
        moveToFront(existing);
      } else {
        // Evict if at capacity
        while (map.size >= maxSize) {
          evictLRU();
        }

        const node: LRUNode<V> = { key, value, expiresAt, prev: null, next: null };
        addToFront(node);
        map.set(key, node);
      }

      stats.sets++;
    },

    async setAsync(key: string, value: V, ttlSeconds?: number): Promise<void> {
      instance.set(key, value, ttlSeconds);

      // Write-through to Redis
      if (redis) {
        try {
          const ttl = ttlSeconds ?? redisTTLSeconds;
          const serialized = JSON.stringify(value);
          if (ttl > 0) {
            await redis.set(nk(key), serialized, { ex: ttl });
          } else {
            await redis.set(nk(key), serialized);
          }
        } catch (err) {
          logger.warn('Redis write-through failed', { key, error: err instanceof Error ? err.message : String(err) });
        }
      }
    },

    has(key: string): boolean {
      const node = map.get(key);
      if (!node) return false;
      if (node.expiresAt && Date.now() > node.expiresAt) {
        removeNode(node);
        map.delete(key);
        return false;
      }
      return true;
    },

    delete(key: string): boolean {
      const node = map.get(key);
      if (!node) return false;
      removeNode(node);
      map.delete(key);
      return true;
    },

    clear(): void {
      map.clear();
      head.next = tail;
      tail.prev = head;
    },

    getStats(): CacheStats {
      const total = stats.hits + stats.misses;
      return {
        hits: stats.hits,
        misses: stats.misses,
        sets: stats.sets,
        evictions: stats.evictions,
        size: map.size,
        maxSize,
        hitRate: total > 0 ? stats.hits / total : 0,
        namespace,
      };
    },

    keys(): string[] {
      return Array.from(map.keys());
    },

    size(): number {
      return map.size;
    },

    entries(): Array<{ key: string; value: V; ttl: number | null }> {
      const result: Array<{ key: string; value: V; ttl: number | null }> = [];
      let current = head.next;
      while (current && current !== tail) {
        const ttl = current.expiresAt ? Math.max(0, Math.ceil((current.expiresAt - Date.now()) / 1000)) : null;
        result.push({ key: current.key, value: current.value, ttl });
        current = current.next;
      }
      return result;
    },

    peek(key: string): V | undefined {
      const node = map.get(key);
      if (!node) return undefined;
      if (node.expiresAt && Date.now() > node.expiresAt) {
        removeNode(node);
        map.delete(key);
        return undefined;
      }
      return node.value;
    },

    destroy(): void {
      clearInterval(cleanupInterval);
      map.clear();
      head.next = tail;
      tail.prev = head;
      stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
    },
  };

  return instance;
}

// ============================================================================
// SPECIALIZED CACHES
// ============================================================================

/**
 * Create a bounded agent blackboard (Bottleneck #2 fix)
 * LRU cache with 10K capacity for agent context data
 */
export function createAgentBlackboard<V = unknown>(
  redis?: RedisClientInstance,
  maxSize = 10_000,
): LRUCacheInstance<V> {
  return createLRUCache<V>({
    maxSize,
    defaultTTLSeconds: 1800, // 30 min
    namespace: 'blackboard',
    redis,
  });
}

/**
 * Create a CORE brain snapshot cache (Bottleneck #8 fix)
 * Caches the CORE brain's pre-computed snapshot for <1ms reads
 */
export function createCoreSnapshotCache<V = unknown>(
  redis?: RedisClientInstance,
): LRUCacheInstance<V> {
  return createLRUCache<V>({
    maxSize: 100,
    defaultTTLSeconds: 300, // 5 min
    namespace: 'core-snapshot',
    redis,
  });
}

/**
 * Create a fast-path query cache
 * Caches compiled fast-path queries for sub-1ms lookups
 */
export function createFastPathCache<V = unknown>(
  redis?: RedisClientInstance,
): LRUCacheInstance<V> {
  return createLRUCache<V>({
    maxSize: 5_000,
    defaultTTLSeconds: 600, // 10 min
    namespace: 'fast-path',
    redis,
  });
}
