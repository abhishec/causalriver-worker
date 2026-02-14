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
    };
  }
}

/**
 * Create the default Redis client.
 * In production, this should use ioredis.
 * For now, uses the in-memory implementation.
 */
export function createRedisClient(config: Partial<RedisConfig> = {}): RedisClientInstance {
  return createInMemoryRedis(config);
}
