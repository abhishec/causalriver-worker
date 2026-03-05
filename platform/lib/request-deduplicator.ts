/**
 * Request Deduplicator
 * ====================
 * Prevents duplicate concurrent API requests and provides in-memory caching.
 *
 * Ported from NexusOS pattern, adapted for BrainOS Next.js (SSR-safe).
 *
 * Features:
 *   - Deduplicates identical in-flight requests (same key → same promise)
 *   - TTL-based cache (avoids refetching recently fetched data)
 *   - Pattern-based cache invalidation (e.g., clearCache("clients"))
 *   - Stats introspection for debugging
 *   - Singleton pattern (one instance per runtime)
 *
 * Usage:
 *   import { requestDeduplicator } from "@/lib/request-deduplicator";
 *
 *   const data = await requestDeduplicator.deduplicate(
 *     "clients-all",
 *     () => supabase.from("clients").select("*"),
 *     30_000, // 30s cache
 *   );
 *
 *   // Invalidate after mutation
 *   requestDeduplicator.clearCache("clients");
 */

import { logger } from "@/lib/logger";

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
}

class RequestDeduplicator {
  private static instance: RequestDeduplicator;
  private pendingRequests = new Map<string, Promise<unknown>>();
  private cache = new Map<string, CacheEntry>();

  static getInstance(): RequestDeduplicator {
    if (!RequestDeduplicator.instance) {
      RequestDeduplicator.instance = new RequestDeduplicator();
    }
    return RequestDeduplicator.instance;
  }

  /**
   * Deduplicate a request by key.
   *
   * If the same key is already in-flight, returns the existing promise.
   * If a cached result exists within TTL, returns it immediately.
   * Otherwise, executes requestFn and caches the result.
   *
   * @param key       Unique cache key (e.g., "clients-all", "brain-health-org123")
   * @param requestFn Async function that performs the actual request
   * @param ttl       Cache TTL in milliseconds (default: 5 minutes)
   */
  async deduplicate<T>(
    key: string,
    requestFn: () => Promise<T>,
    ttl: number = 5 * 60 * 1000,
  ): Promise<T> {
    // 1. Check cache
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }

    // 2. Check if request is already in-flight
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)! as Promise<T>;
    }

    // 3. Execute new request
    const requestPromise = requestFn()
      .then((data) => {
        // Cap cache size before inserting new entry to prevent unbounded OOM growth
        const MAX_CACHE_SIZE = 500;
        if (this.cache.size >= MAX_CACHE_SIZE) {
          const now = Date.now();
          for (const [k, e] of this.cache) {
            if (now > e.timestamp + e.ttl) this.cache.delete(k);
          }
          // If still too big after TTL eviction, delete oldest entry
          if (this.cache.size >= MAX_CACHE_SIZE) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
          }
        }
        this.cache.set(key, { data, timestamp: Date.now(), ttl });
        return data;
      })
      .catch((error) => {
        logger.error(`[RequestDeduplicator] Request failed for "${key}":`, error);
        throw error;
      })
      .finally(() => {
        this.pendingRequests.delete(key);
      });

    this.pendingRequests.set(key, requestPromise);
    return requestPromise;
  }

  /**
   * Clear cached entries matching a pattern.
   * If no pattern provided, clears the entire cache.
   *
   * @param pattern  Substring to match against cache keys
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Clear pending in-flight requests matching a pattern.
   * Useful when navigating away or cancelling operations.
   */
  clearPending(pattern?: string): void {
    if (pattern) {
      for (const key of this.pendingRequests.keys()) {
        if (key.includes(pattern)) {
          this.pendingRequests.delete(key);
        }
      }
    } else {
      this.pendingRequests.clear();
    }
  }

  /**
   * Get cache & pending request stats for debugging.
   */
  getStats(): {
    pendingRequests: number;
    cachedItems: number;
    cacheKeys: string[];
    pendingKeys: string[];
  } {
    return {
      pendingRequests: this.pendingRequests.size,
      cachedItems: this.cache.size,
      cacheKeys: Array.from(this.cache.keys()),
      pendingKeys: Array.from(this.pendingRequests.keys()),
    };
  }
}

export const requestDeduplicator = RequestDeduplicator.getInstance();
