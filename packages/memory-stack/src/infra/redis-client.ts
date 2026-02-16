/**
 * Redis Client — Unified Redis connection manager for NexusBrain
 *
 * Provides a single Redis client factory with:
 * - Connection pooling with auto-reconnect
 * - Health checking
 * - Graceful shutdown
 * - Namespace isolation per org
 *
 * Used by: Event Bus (Streams), LLM Cache, CORE Snapshot, Agent Blackboard, BullMQ
 */

import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  keyPrefix?: string;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  tls?: boolean;
  logger?: NexusLogger;
}

export interface RedisClientInstance {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number; px?: number; nx?: boolean }): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  incrBy(key: string, increment: number): Promise<number>;
  // Hash operations
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  hlen(key: string): Promise<number>;
  // List operations
  lpush(key: string, ...values: string[]): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lpop(key: string): Promise<string | null>;
  rpop(key: string): Promise<string | null>;
  llen(key: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  // Set operations
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, member: string): Promise<number>;
  // Sorted set operations
  zadd(key: string, score: number, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrangebyscore(key: string, min: number | string, max: number | string, options?: { limit?: { offset: number; count: number } }): Promise<string[]>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zcard(key: string): Promise<number>;
  // Stream operations (Redis Streams)
  xadd(key: string, id: string, fields: Record<string, string>): Promise<string>;
  xlen(key: string): Promise<number>;
  xread(options: { count?: number; block?: number; streams: string[]; ids: string[] }): Promise<Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null>;
  xreadgroup(options: { group: string; consumer: string; count?: number; block?: number; streams: string[]; ids: string[] }): Promise<Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null>;
  xgroup(command: 'CREATE' | 'DESTROY', key: string, groupName: string, id?: string, mkstream?: boolean): Promise<string>;
  xack(key: string, group: string, ...ids: string[]): Promise<number>;
  xtrim(key: string, strategy: 'MAXLEN' | 'MINID', threshold: number | string): Promise<number>;
  xpending(key: string, group: string): Promise<{ pending: number; minId: string; maxId: string; consumers: Array<{ name: string; pending: number }> }>;
  // Scripting
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  // Pub/Sub
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, callback: (message: string) => void): Promise<void>;
  // Utility
  ping(): Promise<string>;
  info(section?: string): Promise<string>;
  dbsize(): Promise<number>;
  flushdb(): Promise<string>;
  keys(pattern: string): Promise<string[]>;
  scan(cursor: number, options?: { match?: string; count?: number }): Promise<{ cursor: number; keys: string[] }>;
  // Pipeline/Multi
  pipeline(): RedisPipeline;
  multi(): RedisPipeline;
  // Lifecycle
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConfig(): RedisConfig;
}

export interface RedisPipeline {
  get(key: string): RedisPipeline;
  set(key: string, value: string, options?: { ex?: number }): RedisPipeline;
  del(...keys: string[]): RedisPipeline;
  hset(key: string, field: string, value: string): RedisPipeline;
  hget(key: string, field: string): RedisPipeline;
  xadd(key: string, id: string, fields: Record<string, string>): RedisPipeline;
  expire(key: string, seconds: number): RedisPipeline;
  exec(): Promise<Array<[Error | null, unknown]>>;
}

export interface RedisHealthStatus {
  connected: boolean;
  latencyMs: number;
  memoryUsedMB: number;
  memoryMaxMB: number;
  connectedClients: number;
  opsPerSec: number;
  uptimeSeconds: number;
  /**
   * CTO Audit Fix (Gap #4): Indicates whether this is the in-memory fallback.
   * When true, data is NOT persisted and will be lost on restart.
   * For production at 10M+ scale, set REDIS_URL env var.
   */
  isInMemoryFallback: boolean;
  /** Warning message when using in-memory fallback */
  warning?: string;
}

// ============================================================================
// IN-MEMORY REDIS IMPLEMENTATION (Development / Testing)
// ============================================================================

/**
 * In-memory Redis implementation for development and testing.
 * Drop-in replacement — swap with ioredis in production.
 *
 * This allows the codebase to work without a Redis server while maintaining
 * the same interface. In production, replace with createRedisClient using ioredis.
 */
export function createInMemoryRedis(config: Partial<RedisConfig> = {}): RedisClientInstance {
  const logger = config.logger ?? getDefaultLogger().child({ module: 'redis-memory' });
  const prefix = config.keyPrefix ?? '';

  const store = new Map<string, { value: unknown; expiresAt?: number }>();
  const hashStore = new Map<string, Map<string, string>>();
  const listStore = new Map<string, string[]>();
  const setStore = new Map<string, Set<string>>();
  const sortedSetStore = new Map<string, Array<{ score: number; member: string }>>();
  const streamStore = new Map<string, Array<{ id: string; message: Record<string, string> }>>();
  const streamGroups = new Map<string, Map<string, { lastDeliveredId: string; consumers: Map<string, string[]> }>>();
  const subscribers = new Map<string, Array<(message: string) => void>>();

  let connected = true;
  let streamIdCounter = 0;

  const k = (key: string) => prefix ? `${prefix}:${key}` : key;

  const isExpired = (key: string): boolean => {
    const entry = store.get(key);
    if (!entry?.expiresAt) return false;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return true;
    }
    return false;
  };

  const client: RedisClientInstance = {
    async get(key: string) {
      const fk = k(key);
      if (isExpired(fk)) return null;
      const entry = store.get(fk);
      return entry ? String(entry.value) : null;
    },

    async set(key: string, value: string, options?: { ex?: number; px?: number; nx?: boolean }) {
      const fk = k(key);
      if (options?.nx && store.has(fk) && !isExpired(fk)) return null;
      const expiresAt = options?.ex
        ? Date.now() + options.ex * 1000
        : options?.px
          ? Date.now() + options.px
          : undefined;
      store.set(fk, { value, expiresAt });
      return 'OK';
    },

    async del(...keys: string[]) {
      let count = 0;
      for (const key of keys) {
        const fk = k(key);
        if (store.delete(fk)) count++;
        hashStore.delete(fk);
        listStore.delete(fk);
        setStore.delete(fk);
        sortedSetStore.delete(fk);
        streamStore.delete(fk);
      }
      return count;
    },

    async exists(...keys: string[]) {
      let count = 0;
      for (const key of keys) {
        const fk = k(key);
        if (!isExpired(fk) && (store.has(fk) || hashStore.has(fk) || listStore.has(fk) || setStore.has(fk))) {
          count++;
        }
      }
      return count;
    },

    async expire(key: string, seconds: number) {
      const fk = k(key);
      const entry = store.get(fk);
      if (entry) {
        entry.expiresAt = Date.now() + seconds * 1000;
        return 1;
      }
      return 0;
    },

    async ttl(key: string) {
      const fk = k(key);
      const entry = store.get(fk);
      if (!entry) return -2;
      if (!entry.expiresAt) return -1;
      return Math.ceil((entry.expiresAt - Date.now()) / 1000);
    },

    async incr(key: string) {
      const fk = k(key);
      const entry = store.get(fk);
      const val = entry ? parseInt(String(entry.value), 10) + 1 : 1;
      store.set(fk, { value: String(val), expiresAt: entry?.expiresAt });
      return val;
    },

    async incrBy(key: string, increment: number) {
      const fk = k(key);
      const entry = store.get(fk);
      const val = entry ? parseInt(String(entry.value), 10) + increment : increment;
      store.set(fk, { value: String(val), expiresAt: entry?.expiresAt });
      return val;
    },

    // Hash operations
    async hget(key: string, field: string) {
      return hashStore.get(k(key))?.get(field) ?? null;
    },

    async hset(key: string, field: string, value: string) {
      const fk = k(key);
      if (!hashStore.has(fk)) hashStore.set(fk, new Map());
      const isNew = !hashStore.get(fk)!.has(field);
      hashStore.get(fk)!.set(field, value);
      return isNew ? 1 : 0;
    },

    async hgetall(key: string) {
      const map = hashStore.get(k(key));
      return map ? Object.fromEntries(map) : {};
    },

    async hdel(key: string, ...fields: string[]) {
      const map = hashStore.get(k(key));
      if (!map) return 0;
      let count = 0;
      for (const f of fields) { if (map.delete(f)) count++; }
      return count;
    },

    async hlen(key: string) {
      return hashStore.get(k(key))?.size ?? 0;
    },

    // List operations
    async lpush(key: string, ...values: string[]) {
      const fk = k(key);
      if (!listStore.has(fk)) listStore.set(fk, []);
      const list = listStore.get(fk)!;
      list.unshift(...values.reverse());
      return list.length;
    },

    async rpush(key: string, ...values: string[]) {
      const fk = k(key);
      if (!listStore.has(fk)) listStore.set(fk, []);
      const list = listStore.get(fk)!;
      list.push(...values);
      return list.length;
    },

    async lpop(key: string) {
      return listStore.get(k(key))?.shift() ?? null;
    },

    async rpop(key: string) {
      return listStore.get(k(key))?.pop() ?? null;
    },

    async llen(key: string) {
      return listStore.get(k(key))?.length ?? 0;
    },

    async lrange(key: string, start: number, stop: number) {
      const list = listStore.get(k(key)) ?? [];
      const end = stop === -1 ? list.length : stop + 1;
      return list.slice(start, end);
    },

    // Set operations
    async sadd(key: string, ...members: string[]) {
      const fk = k(key);
      if (!setStore.has(fk)) setStore.set(fk, new Set());
      const s = setStore.get(fk)!;
      let added = 0;
      for (const m of members) { if (!s.has(m)) { s.add(m); added++; } }
      return added;
    },

    async srem(key: string, ...members: string[]) {
      const s = setStore.get(k(key));
      if (!s) return 0;
      let removed = 0;
      for (const m of members) { if (s.delete(m)) removed++; }
      return removed;
    },

    async smembers(key: string) {
      return Array.from(setStore.get(k(key)) ?? []);
    },

    async sismember(key: string, member: string) {
      return setStore.get(k(key))?.has(member) ? 1 : 0;
    },

    // Sorted set operations
    async zadd(key: string, score: number, member: string) {
      const fk = k(key);
      if (!sortedSetStore.has(fk)) sortedSetStore.set(fk, []);
      const zset = sortedSetStore.get(fk)!;
      const existing = zset.findIndex(e => e.member === member);
      if (existing >= 0) {
        zset[existing].score = score;
        zset.sort((a, b) => a.score - b.score);
        return 0;
      }
      zset.push({ score, member });
      zset.sort((a, b) => a.score - b.score);
      return 1;
    },

    async zrange(key: string, start: number, stop: number) {
      const zset = sortedSetStore.get(k(key)) ?? [];
      const end = stop === -1 ? zset.length : stop + 1;
      return zset.slice(start, end).map(e => e.member);
    },

    async zrangebyscore(key: string, min: number | string, max: number | string, options?: { limit?: { offset: number; count: number } }) {
      const zset = sortedSetStore.get(k(key)) ?? [];
      const minVal = min === '-inf' ? -Infinity : Number(min);
      const maxVal = max === '+inf' ? Infinity : Number(max);
      let result = zset.filter(e => e.score >= minVal && e.score <= maxVal);
      if (options?.limit) {
        result = result.slice(options.limit.offset, options.limit.offset + options.limit.count);
      }
      return result.map(e => e.member);
    },

    async zrem(key: string, ...members: string[]) {
      const zset = sortedSetStore.get(k(key));
      if (!zset) return 0;
      let removed = 0;
      for (const m of members) {
        const idx = zset.findIndex(e => e.member === m);
        if (idx >= 0) { zset.splice(idx, 1); removed++; }
      }
      return removed;
    },

    async zcard(key: string) {
      return sortedSetStore.get(k(key))?.length ?? 0;
    },

    // Stream operations
    async xadd(key: string, id: string, fields: Record<string, string>) {
      const fk = k(key);
      if (!streamStore.has(fk)) streamStore.set(fk, []);
      const stream = streamStore.get(fk)!;
      const actualId = id === '*' ? `${Date.now()}-${streamIdCounter++}` : id;
      stream.push({ id: actualId, message: fields });
      return actualId;
    },

    async xlen(key: string) {
      return streamStore.get(k(key))?.length ?? 0;
    },

    async xread(options) {
      const results: Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> = [];
      for (let i = 0; i < options.streams.length; i++) {
        const fk = k(options.streams[i]);
        const lastId = options.ids[i];
        const stream = streamStore.get(fk) ?? [];
        const messages = stream.filter(m => {
          if (lastId === '0' || lastId === '0-0') return true;
          return m.id > lastId;
        });
        const limited = options.count ? messages.slice(0, options.count) : messages;
        if (limited.length > 0) {
          results.push({ name: options.streams[i], messages: limited });
        }
      }
      return results.length > 0 ? results : null;
    },

    async xreadgroup(options) {
      const results: Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> = [];
      for (let i = 0; i < options.streams.length; i++) {
        const fk = k(options.streams[i]);
        const stream = streamStore.get(fk) ?? [];
        const groupMap = streamGroups.get(fk);
        const group = groupMap?.get(options.group);
        if (!group) continue;

        const lastDelivered = group.lastDeliveredId;
        const pending = options.ids[i] === '>' ?
          stream.filter(m => m.id > lastDelivered) :
          stream.filter(m => (group.consumers.get(options.consumer) ?? []).includes(m.id));

        const limited = options.count ? pending.slice(0, options.count) : pending;
        if (limited.length > 0) {
          // Track consumer pending entries
          if (!group.consumers.has(options.consumer)) {
            group.consumers.set(options.consumer, []);
          }
          const consumerPending = group.consumers.get(options.consumer)!;
          for (const msg of limited) {
            consumerPending.push(msg.id);
            if (msg.id > group.lastDeliveredId) {
              group.lastDeliveredId = msg.id;
            }
          }
          results.push({ name: options.streams[i], messages: limited });
        }
      }
      return results.length > 0 ? results : null;
    },

    async xgroup(command, key, groupName, id = '0', mkstream = true) {
      const fk = k(key);
      if (command === 'CREATE') {
        if (!streamGroups.has(fk)) streamGroups.set(fk, new Map());
        if (mkstream && !streamStore.has(fk)) streamStore.set(fk, []);
        streamGroups.get(fk)!.set(groupName, {
          lastDeliveredId: id,
          consumers: new Map(),
        });
        return 'OK';
      }
      if (command === 'DESTROY') {
        streamGroups.get(fk)?.delete(groupName);
        return 'OK';
      }
      return 'OK';
    },

    async xack(key: string, group: string, ...ids: string[]) {
      const fk = k(key);
      const groupMap = streamGroups.get(fk);
      const g = groupMap?.get(group);
      if (!g) return 0;
      let acked = 0;
      for (const consumer of g.consumers.values()) {
        for (const id of ids) {
          const idx = consumer.indexOf(id);
          if (idx >= 0) {
            consumer.splice(idx, 1);
            acked++;
          }
        }
      }
      return acked;
    },

    async xtrim(key: string, _strategy, threshold) {
      const fk = k(key);
      const stream = streamStore.get(fk);
      if (!stream) return 0;
      const maxLen = typeof threshold === 'number' ? threshold : parseInt(String(threshold), 10);
      if (stream.length <= maxLen) return 0;
      const trimmed = stream.length - maxLen;
      stream.splice(0, trimmed);
      return trimmed;
    },

    async xpending(key: string, group: string) {
      const fk = k(key);
      const g = streamGroups.get(fk)?.get(group);
      if (!g) return { pending: 0, minId: '', maxId: '', consumers: [] };
      const consumers: Array<{ name: string; pending: number }> = [];
      let allPending: string[] = [];
      for (const [name, pending] of g.consumers) {
        consumers.push({ name, pending: pending.length });
        allPending = allPending.concat(pending);
      }
      allPending.sort();
      return {
        pending: allPending.length,
        minId: allPending[0] ?? '',
        maxId: allPending[allPending.length - 1] ?? '',
        consumers,
      };
    },

    // Scripting (simplified in-memory eval for lock release pattern)
    async eval(script: string, options: { keys: string[]; arguments: string[] }) {
      // Support the common "compare-and-delete" pattern for distributed locks
      // Script: if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end
      if (script.includes('get') && script.includes('del')) {
        const keyVal = await client.get(options.keys[0]);
        if (keyVal === options.arguments[0]) {
          await client.del(options.keys[0]);
          return 1;
        }
        return 0;
      }
      return 0;
    },

    // Pub/Sub
    async publish(channel: string, message: string) {
      const handlers = subscribers.get(channel) ?? [];
      for (const handler of handlers) {
        try { handler(message); } catch { /* ignore subscriber errors */ }
      }
      return handlers.length;
    },

    async subscribe(channel: string, callback: (message: string) => void) {
      if (!subscribers.has(channel)) subscribers.set(channel, []);
      subscribers.get(channel)!.push(callback);
    },

    // Utility
    async ping() { return 'PONG'; },

    async info(_section?: string) {
      const totalKeys = store.size + hashStore.size + listStore.size + setStore.size;
      return `# Memory\r\nused_memory:${totalKeys * 256}\r\nused_memory_human:${Math.round(totalKeys * 256 / 1024)}K\r\nmaxmemory:536870912\r\n# Clients\r\nconnected_clients:1\r\n# Stats\r\ninstantaneous_ops_per_sec:0\r\n# Server\r\nuptime_in_seconds:${Math.round(process.uptime())}`;
    },

    async dbsize() {
      return store.size + hashStore.size + listStore.size + setStore.size;
    },

    async flushdb() {
      store.clear();
      hashStore.clear();
      listStore.clear();
      setStore.clear();
      sortedSetStore.clear();
      streamStore.clear();
      streamGroups.clear();
      return 'OK';
    },

    async keys(pattern: string) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      const allKeys = [
        ...store.keys(),
        ...hashStore.keys(),
        ...listStore.keys(),
        ...setStore.keys(),
        ...sortedSetStore.keys(),
        ...streamStore.keys(),
      ];
      return [...new Set(allKeys)].filter(key => regex.test(key));
    },

    async scan(cursor: number, options?: { match?: string; count?: number }) {
      const allKeys = await client.keys(options?.match ?? '*');
      const count = options?.count ?? 10;
      const start = cursor;
      const end = Math.min(start + count, allKeys.length);
      return {
        cursor: end >= allKeys.length ? 0 : end,
        keys: allKeys.slice(start, end),
      };
    },

    // Pipeline
    pipeline(): RedisPipeline {
      const ops: Array<() => Promise<unknown>> = [];
      const pipe: RedisPipeline = {
        get(key: string) { ops.push(() => client.get(key)); return pipe; },
        set(key: string, value: string, options?: { ex?: number }) { ops.push(() => client.set(key, value, options)); return pipe; },
        del(...keys: string[]) { ops.push(() => client.del(...keys)); return pipe; },
        hset(key: string, field: string, value: string) { ops.push(() => client.hset(key, field, value)); return pipe; },
        hget(key: string, field: string) { ops.push(() => client.hget(key, field)); return pipe; },
        xadd(key: string, id: string, fields: Record<string, string>) { ops.push(() => client.xadd(key, id, fields)); return pipe; },
        expire(key: string, seconds: number) { ops.push(() => client.expire(key, seconds)); return pipe; },
        async exec() {
          const results: Array<[Error | null, unknown]> = [];
          for (const op of ops) {
            try {
              const result = await op();
              results.push([null, result]);
            } catch (err) {
              results.push([err instanceof Error ? err : new Error(String(err)), null]);
            }
          }
          return results;
        },
      };
      return pipe;
    },

    multi(): RedisPipeline {
      return client.pipeline();
    },

    async disconnect() {
      connected = false;
      store.clear();
      hashStore.clear();
      listStore.clear();
      setStore.clear();
      sortedSetStore.clear();
      streamStore.clear();
      streamGroups.clear();
      subscribers.clear();
      logger.info('Redis (in-memory) disconnected');
    },

    isConnected() { return connected; },

    getConfig() {
      return {
        host: config.host ?? 'localhost',
        port: config.port ?? 6379,
        keyPrefix: prefix,
        ...config,
      };
    },
  };

  logger.info('Redis (in-memory) initialized', { prefix });
  return client;
}

/**
 * Get Redis health status
 */
export async function getRedisHealth(redis: RedisClientInstance): Promise<RedisHealthStatus> {
  const start = Date.now();
  const isInMemoryFallback = redis.getConfig().host === 'in-memory';

  try {
    await redis.ping();
    const latencyMs = Date.now() - start;
    const infoStr = await redis.info();

    const parseField = (field: string): number => {
      const match = infoStr.match(new RegExp(`${field}:(\\d+)`));
      return match ? parseInt(match[1], 10) : 0;
    };

    return {
      connected: true,
      latencyMs,
      memoryUsedMB: Math.round(parseField('used_memory') / 1024 / 1024),
      memoryMaxMB: Math.round(parseField('maxmemory') / 1024 / 1024) || 512,
      connectedClients: parseField('connected_clients'),
      opsPerSec: parseField('instantaneous_ops_per_sec'),
      uptimeSeconds: parseField('uptime_in_seconds'),
      isInMemoryFallback,
      warning: isInMemoryFallback
        ? 'Using in-memory Redis fallback (REDIS_URL not set). Data will NOT persist across restarts. For production at 10M+ scale, configure a real Redis instance.'
        : undefined,
    };
  } catch {
    return {
      connected: false,
      latencyMs: -1,
      memoryUsedMB: 0,
      memoryMaxMB: 0,
      connectedClients: 0,
      opsPerSec: 0,
      uptimeSeconds: 0,
      isInMemoryFallback,
      warning: isInMemoryFallback
        ? 'Using in-memory Redis fallback (REDIS_URL not set). Data will NOT persist across restarts.'
        : 'Redis connection failed.',
    };
  }
}

/**
 * Create the default Redis client.
 *
 * Behavior:
 * - If REDIS_URL env var is set → uses ioredis (production)
 * - Otherwise → uses in-memory implementation (development/testing)
 *
 * The in-memory implementation is fully compatible with production,
 * allowing local development without a Redis server.
 */
export function createRedisClient(config: Partial<RedisConfig> = {}): RedisClientInstance {
  const redisUrl = typeof process !== 'undefined' && process.env?.REDIS_URL;
  if (redisUrl) {
    // Production: use ioredis (lazy import to avoid bundling in dev)
    return createIoRedisAdapter(redisUrl, config);
  }

  // CTO Audit Fix (Gap #4): Warn when using in-memory fallback
  console.warn(
    '[NexusBrain] ⚠️  REDIS_URL not configured — using in-memory Redis fallback.\n' +
    '  This is fine for development and <100K signals.\n' +
    '  For production (10M+ signals), set REDIS_URL environment variable.\n' +
    '  In-memory Redis: no persistence, no pub/sub, will OOM at scale.'
  );

  return createInMemoryRedis(config);
}


/**
 * Create an ioredis adapter that implements RedisClientInstance.
 * Only used when REDIS_URL is set (production environments).
 */
function createIoRedisAdapter(url: string, config: Partial<RedisConfig> = {}): RedisClientInstance {
  // ioredis is a peer dependency — only required in production
  let ioredis: any;
  try {
    ioredis = require('ioredis');
  } catch {
    console.warn('[NexusBrain] ioredis not installed — falling back to in-memory Redis');
    return createInMemoryRedis(config);
  }

  const logger = config.logger ?? getDefaultLogger().child({ module: 'redis-ioredis' });
  const client = new ioredis(url, {
    maxRetriesPerRequest: config.maxRetries ?? 3,
    retryStrategy: (times: number) => Math.min(times * (config.retryDelayMs ?? 200), 5000),
    connectTimeout: config.connectTimeoutMs ?? 10000,
    commandTimeout: config.commandTimeoutMs ?? 5000,
    keyPrefix: config.keyPrefix ?? '',
    tls: config.tls ? {} : undefined,
    lazyConnect: false,
  });

  client.on('connect', () => logger.info('Redis connected', {}));
  client.on('error', (err: Error) => logger.error('Redis error', { error: err.message }));
  client.on('reconnecting', () => logger.warn('Redis reconnecting', {}));

  let connected = true;
  client.on('close', () => { connected = false; });

  const redisConfig: RedisConfig = {
    host: config.host ?? 'localhost',
    port: config.port ?? 6379,
    password: config.password,
    ...config,
  };

  // Wrap ioredis methods to match RedisClientInstance interface exactly
  const instance: RedisClientInstance = {
    get: (key: string) => client.get(key),
    set: (key: string, value: string, options?: { ex?: number; px?: number; nx?: boolean }) => {
      if (options?.ex) return client.set(key, value, 'EX', options.ex);
      if (options?.px) return client.set(key, value, 'PX', options.px);
      if (options?.nx) return client.set(key, value, 'NX');
      return client.set(key, value);
    },
    del: (...keys: string[]) => client.del(...keys),
    exists: (...keys: string[]) => client.exists(...keys),
    expire: (key: string, seconds: number) => client.expire(key, seconds),
    ttl: (key: string) => client.ttl(key),
    incr: (key: string) => client.incr(key),
    incrBy: (key: string, increment: number) => client.incrby(key, increment),
    hget: (key: string, field: string) => client.hget(key, field),
    hset: (key: string, field: string, value: string) => client.hset(key, field, value),
    hgetall: (key: string) => client.hgetall(key),
    hdel: (key: string, ...fields: string[]) => client.hdel(key, ...fields),
    hlen: (key: string) => client.hlen(key),
    lpush: (key: string, ...values: string[]) => client.lpush(key, ...values),
    rpush: (key: string, ...values: string[]) => client.rpush(key, ...values),
    lpop: (key: string) => client.lpop(key),
    rpop: (key: string) => client.rpop(key),
    llen: (key: string) => client.llen(key),
    lrange: (key: string, start: number, stop: number) => client.lrange(key, start, stop),
    sadd: (key: string, ...members: string[]) => client.sadd(key, ...members),
    srem: (key: string, ...members: string[]) => client.srem(key, ...members),
    smembers: (key: string) => client.smembers(key),
    sismember: (key: string, member: string) => client.sismember(key, member),
    zadd: (key: string, score: number, member: string) => client.zadd(key, score, member),
    zrange: (key: string, start: number, stop: number) => client.zrange(key, start, stop),
    zrangebyscore: (key: string, min: number | string, max: number | string, options?: { limit?: { offset: number; count: number } }) => {
      if (options?.limit) return client.zrangebyscore(key, min, max, 'LIMIT', options.limit.offset, options.limit.count);
      return client.zrangebyscore(key, min, max);
    },
    zrem: (key: string, ...members: string[]) => client.zrem(key, ...members),
    zcard: (key: string) => client.zcard(key),
    xadd: (key: string, id: string, fields: Record<string, string>) => {
      const args: string[] = [];
      for (const [k, v] of Object.entries(fields)) { args.push(k, v); }
      return (client.xadd as any)(key, id, ...args);
    },
    xlen: (key: string) => client.xlen(key),
    xread: (options: any) => (client.xread as any)(options),
    xreadgroup: (options: any) => (client.xreadgroup as any)(options),
    xgroup: (...args: any[]) => (client.xgroup as any)(...args),
    xack: (key: string, group: string, ...ids: string[]) => (client.xack as any)(key, group, ...ids),
    xtrim: (key: string, strategy: 'MAXLEN' | 'MINID', threshold: number | string) => (client.xtrim as any)(key, strategy, threshold),
    xpending: (key: string, group: string) => (client.xpending as any)(key, group),
    eval: (script: string, options: { keys: string[]; arguments: string[] }) =>
      client.eval(script, options.keys.length, ...options.keys, ...options.arguments),
    publish: (channel: string, message: string) => client.publish(channel, message),
    subscribe: (channel: string, callback: (message: string) => void) => {
      const sub = client.duplicate();
      sub.subscribe(channel);
      sub.on('message', (_ch: string, msg: string) => callback(msg));
      return Promise.resolve();
    },
    ping: () => client.ping(),
    info: (section?: string) => section ? client.info(section) : client.info(),
    dbsize: () => client.dbsize(),
    flushdb: () => client.flushdb(),
    keys: (pattern: string) => client.keys(pattern),
    scan: async (cursor: number, options?: { match?: string; count?: number }) => {
      const args: any[] = [cursor];
      if (options?.match) args.push('MATCH', options.match);
      if (options?.count) args.push('COUNT', options.count);
      const [nextCursor, keys] = await client.scan(...args);
      return { cursor: parseInt(nextCursor, 10), keys };
    },
    pipeline: () => {
      const pipe = client.pipeline();
      return {
        get: (key: string) => { pipe.get(key); return pipe as any; },
        set: (key: string, value: string, options?: { ex?: number }) => {
          if (options?.ex) pipe.set(key, value, 'EX', options.ex);
          else pipe.set(key, value);
          return pipe as any;
        },
        del: (...keys: string[]) => { pipe.del(...keys); return pipe as any; },
        hset: (key: string, field: string, value: string) => { pipe.hset(key, field, value); return pipe as any; },
        hget: (key: string, field: string) => { pipe.hget(key, field); return pipe as any; },
        xadd: (key: string, id: string, fields: Record<string, string>) => {
          const args: string[] = [];
          for (const [k, v] of Object.entries(fields)) { args.push(k, v); }
          (pipe.xadd as any)(key, id, ...args);
          return pipe as any;
        },
        expire: (key: string, seconds: number) => { pipe.expire(key, seconds); return pipe as any; },
        exec: () => pipe.exec().then((results: any) => results?.map((r: any) => [r[0], r[1]]) ?? []),
      } as RedisPipeline;
    },
    multi: () => {
      const multi = client.multi();
      return {
        get: (key: string) => { multi.get(key); return multi as any; },
        set: (key: string, value: string, options?: { ex?: number }) => {
          if (options?.ex) multi.set(key, value, 'EX', options.ex);
          else multi.set(key, value);
          return multi as any;
        },
        del: (...keys: string[]) => { multi.del(...keys); return multi as any; },
        hset: (key: string, field: string, value: string) => { multi.hset(key, field, value); return multi as any; },
        hget: (key: string, field: string) => { multi.hget(key, field); return multi as any; },
        xadd: (key: string, id: string, fields: Record<string, string>) => {
          const args: string[] = [];
          for (const [k, v] of Object.entries(fields)) { args.push(k, v); }
          (multi.xadd as any)(key, id, ...args);
          return multi as any;
        },
        expire: (key: string, seconds: number) => { multi.expire(key, seconds); return multi as any; },
        exec: () => multi.exec().then((results: any) => results?.map((r: any) => [r[0], r[1]]) ?? []),
      } as RedisPipeline;
    },
    disconnect: () => client.quit().then(() => { connected = false; }),
    isConnected: () => connected,
    getConfig: () => redisConfig,
  };

  return instance;
}
