/**
 * Redis Client — Upstash HTTP-based Redis for Vercel Serverless
 *
 * Uses @upstash/redis (HTTP, no persistent connections — ideal for serverless).
 * Falls back to in-memory Map when UPSTASH_REDIS_REST_URL is not configured.
 *
 * Usage:
 *   import { redis } from "@/lib/redis";
 *   await redis.incr("key");
 *   await redis.get<string>("key");
 *   await redis.set("key", "value", { ex: 60 }); // 60s TTL
 */

import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────

interface RedisAdapter {
  get<T = string>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  ttl(key: string): Promise<number>;
  /** Identify which backend is active */
  backend: "upstash" | "memory";
}

// ── In-Memory Fallback ───────────────────────────────────────────────

interface MemEntry {
  value: unknown;
  expiresAt: number | null; // null = no TTL
}

class InMemoryRedis implements RedisAdapter {
  readonly backend = "memory" as const;
  private store = new Map<string, MemEntry>();

  private isExpired(entry: MemEntry): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  async get<T = string>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) {
      if (entry) this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : null,
    });
  }

  async incr(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) {
      this.store.set(key, { value: 1, expiresAt: entry?.expiresAt ?? null });
      return 1;
    }
    const next = (typeof entry.value === "number" ? entry.value : parseInt(String(entry.value)) || 0) + 1;
    entry.value = next;
    return next;
  }

  async expire(key: string, seconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
    }
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) {
      if (entry) this.store.delete(key);
      return false;
    }
    return true;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }
}

// ── Upstash Redis Adapter ────────────────────────────────────────────

class UpstashRedisAdapter implements RedisAdapter {
  readonly backend = "upstash" as const;
  private client: import("@upstash/redis").Redis | null = null;

  private async getClient(): Promise<import("@upstash/redis").Redis> {
    if (!this.client) {
      const { Redis } = await import("@upstash/redis");
      this.client = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
    }
    return this.client;
  }

  async get<T = string>(key: string): Promise<T | null> {
    const c = await this.getClient();
    return c.get<T>(key);
  }

  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
    const c = await this.getClient();
    if (opts?.ex) {
      await c.set(key, value, { ex: opts.ex });
    } else {
      await c.set(key, value);
    }
  }

  async incr(key: string): Promise<number> {
    const c = await this.getClient();
    return c.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    const c = await this.getClient();
    await c.expire(key, seconds);
  }

  async del(key: string): Promise<void> {
    const c = await this.getClient();
    await c.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const c = await this.getClient();
    const result = await c.exists(key);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    const c = await this.getClient();
    return c.ttl(key);
  }
}

// ── Factory ──────────────────────────────────────────────────────────

function createRedis(): RedisAdapter {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    logger.warn("[Redis] Using Upstash Redis (production)");
    return new UpstashRedisAdapter();
  }
  logger.warn("[Redis] No UPSTASH_REDIS_REST_URL — using in-memory fallback");
  return new InMemoryRedis();
}

/** Singleton Redis client for the platform */
export const redis: RedisAdapter = createRedis();

// ── Rate Limiting Helpers ────────────────────────────────────────────

/**
 * Sliding window rate limiter backed by Redis.
 * Returns { allowed, remaining, resetAt }.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number = 60,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

  const count = await redis.incr(windowKey);

  // Set TTL on first request in window
  if (count === 1) {
    await redis.expire(windowKey, windowSeconds + 1); // +1s buffer
  }

  const remaining = Math.max(0, maxRequests - count);
  const resetAt = (Math.floor(Date.now() / (windowSeconds * 1000)) + 1) * windowSeconds * 1000;

  return {
    allowed: count <= maxRequests,
    remaining,
    resetAt,
  };
}

/**
 * Request deduplication backed by Redis.
 * Returns the cached result if a duplicate request was made within ttlSeconds.
 */
export async function deduplicateRequest<T>(
  key: string,
  ttlSeconds: number = 5,
  fn: () => Promise<T>,
): Promise<T> {
  const cacheKey = `dedup:${key}`;

  // Check if we have a cached result
  const cached = await redis.get<string>(cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // Corrupted cache entry, proceed with fresh execution
    }
  }

  // Execute and cache
  const result = await fn();
  await redis.set(cacheKey, JSON.stringify(result), { ex: ttlSeconds });
  return result;
}
