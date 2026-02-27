/**
 * PlanCache — Process Intelligence Memoization Layer
 * ====================================================
 * Module-level in-memory cache (process-scoped, 5-minute TTL) that prevents
 * redundant domain-executor calls for identical requests within the same
 * Lambda instance.
 *
 * Cache key = SHA-256( orgId + ":" + domain + ":" + queryKey ).slice(16 hex chars)
 * queryKey   = normalised message (first 100 chars, lowercased, trimmed)
 *
 * Signal-aware invalidation:
 *   getCachedPlan() accepts an optional supabase client. When provided it runs
 *   checkSignalFreshness() before returning the cached value. If new signals
 *   have arrived since the plan was cached the entry is evicted and null is
 *   returned so the caller re-executes the domain.
 *
 * Usage in domain-executor:
 *   const cached = await getCachedPlan<ResultType>(orgId, domain, queryKey, supabase);
 *   if (cached) return cached;
 *   const result = await runDomain(...);
 *   setCachedPlan(orgId, domain, queryKey, result);
 *   return result;
 *
 * Cache is never shared across Lambda instances — this is intentional.
 * Cross-instance deduplication belongs at the DB layer (not this module).
 */

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Module-level state ────────────────────────────────────────────────────────

interface CacheEntry {
  result: unknown;
  expiresAt: number;
  cachedAt: number; // Unix ms — used for signal-freshness comparisons
  orgId: string;    // Stored so invalidateOnNewSignal can do prefix matching
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
// Max entries: cap at 1000 to prevent unbounded growth in long-running Lambdas.
// Each entry is keyed by a 16-hex hash; at most ~1000 active plan contexts is safe.
const PLAN_CACHE_MAX = 1000;

/** Evict expired entries; if still over max, evict oldest-expiry entries. */
function _evictPlanCache(): void {
  const now = Date.now();
  for (const [k, v] of _cache) {
    if (v.expiresAt <= now) _cache.delete(k);
  }
  if (_cache.size > PLAN_CACHE_MAX) {
    const sorted = [..._cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toEvict = sorted.slice(0, _cache.size - PLAN_CACHE_MAX);
    for (const [k] of toEvict) _cache.delete(k);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashKey(orgId: string, domain: string, queryKey: string): string {
  return crypto
    .createHash("sha256")
    .update(`${orgId}:${domain}:${queryKey}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Normalise a raw user message into a stable cache query key.
 * Lowercases, trims whitespace, and caps at 100 chars to prevent
 * unbounded key sizes while keeping enough context to avoid false hits.
 */
export function normaliseQueryKey(message: string): string {
  return message.toLowerCase().trim().slice(0, 100);
}

// ── Signal freshness check ────────────────────────────────────────────────────

/**
 * Check if any new signals have arrived since the plan was cached.
 * If yes, the cache entry is stale and should be bypassed.
 *
 * Returns true  → cache is still fresh (safe to serve)
 * Returns false → new signal arrived; caller must evict and re-execute
 */
async function checkSignalFreshness(
  supabase: SupabaseClient,
  orgId: string,
  cachedAt: number, // Unix ms timestamp
  domain: string
): Promise<boolean> {
  const cachedAtISO = new Date(cachedAt).toISOString();

  try {
    // Check for new engagement health signals (relevant to delivery/health domains)
    if (domain === "delivery-health" || domain === "early-warning") {
      const { data } = await supabase
        .from("engagement_health_scores")
        .select("id")
        .eq("organization_id", orgId)
        .gte("computed_at", cachedAtISO)
        .limit(1);
      if (data?.length) {
        logger.warn("[PlanCache] Signal freshness: new engagement_health_scores row detected — cache stale", {
          orgId,
          domain,
          cachedAt: cachedAtISO,
        });
        return false; // new signal arrived, cache is stale
      }
    }

    // Check for new connector signals (applies to all domains)
    const { data: signals } = await supabase
      .from("connector_signals")
      .select("id")
      .eq("organization_id", orgId)
      .gte("created_at", cachedAtISO)
      .limit(1);
    if (signals?.length) {
      logger.warn("[PlanCache] Signal freshness: new connector_signals row detected — cache stale", {
        orgId,
        domain,
        cachedAt: cachedAtISO,
      });
      return false; // new connector data, cache is stale
    }
  } catch (err: unknown) {
    // Freshness check is non-blocking — if DB query fails, serve the cached value
    // rather than causing a cascading failure.
    logger.warn("[PlanCache] Signal freshness check failed (non-fatal) — serving cached value", {
      orgId,
      domain,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return true; // cache is fresh
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return a previously cached plan, or null on miss / expiry / stale signal.
 *
 * When `supabase` is provided the function runs a lightweight signal-freshness
 * check against engagement_health_scores and connector_signals before returning
 * the cached value. If new data has arrived since the plan was cached the entry
 * is evicted and null is returned so the caller re-executes the domain.
 *
 * When `supabase` is omitted (or undefined) the function falls back to TTL-only
 * semantics — identical to the original behaviour.
 */
export async function getCachedPlan<T>(
  orgId: string,
  domain: string,
  queryKey: string,
  supabase?: SupabaseClient
): Promise<T | null> {
  const key = hashKey(orgId, domain, queryKey);
  const cached = _cache.get(key);

  if (!cached || cached.expiresAt <= Date.now()) {
    // Expired or missing entry — evict eagerly
    _cache.delete(key);
    return null;
  }

  // If a Supabase client is available, verify signal freshness before serving
  if (supabase) {
    const isFresh = await checkSignalFreshness(supabase, orgId, cached.cachedAt, domain);
    if (!isFresh) {
      _cache.delete(key);
      logger.warn("[PlanCache] Cache entry evicted due to stale signal", {
        orgId,
        domain,
        cachedAt: new Date(cached.cachedAt).toISOString(),
      });
      return null;
    }
  }

  return cached.result as T;
}

/**
 * Store a plan result in cache with a 5-minute TTL.
 */
export function setCachedPlan<T>(
  orgId: string,
  domain: string,
  queryKey: string,
  result: T
): void {
  const key = hashKey(orgId, domain, queryKey);
  const now = Date.now();
  _cache.set(key, {
    result,
    expiresAt: now + CACHE_TTL_MS,
    cachedAt: now,
    orgId,
  });
  // Evict oversized cache after each write to prevent OOM in long-running Lambdas
  if (_cache.size > PLAN_CACHE_MAX) _evictPlanCache();
}

/**
 * Invalidate all cached plans for an org when a new signal arrives from a
 * connector sync route. Because cache keys are opaque hashes we iterate the
 * map and match on the stored orgId field (O(n) but the cache is tiny — at most
 * a few dozen entries per Lambda instance).
 *
 * This is the immediate-invalidation complement to the lazy checkSignalFreshness
 * path: connector sync routes call this so the very next request for this org
 * gets a fresh domain execution without waiting for the TTL to expire.
 */
export function invalidateOnNewSignal(orgId: string): void {
  let evicted = 0;
  for (const [key, entry] of _cache.entries()) {
    if (entry.orgId === orgId) {
      _cache.delete(key);
      evicted++;
    }
  }
  if (evicted > 0) {
    logger.warn("[PlanCache] invalidateOnNewSignal: evicted stale entries", {
      orgId,
      evicted,
    });
  }
}

/**
 * Invalidate all cached plans for an org (e.g. after data-mutating operations).
 * Delegates to invalidateOnNewSignal() which performs targeted per-org eviction.
 *
 * @deprecated prefer invalidateOnNewSignal() for connector-triggered invalidation.
 *   This function is kept for backward compatibility.
 */
export function invalidateCacheForOrg(orgId: string): void {
  invalidateOnNewSignal(orgId);
  logger.warn("[PlanCache] Cache cleared on invalidation request", { orgId });
}

/**
 * Return lightweight cache stats for monitoring / health endpoints.
 */
export function getCacheStats(): { size: number } {
  return { size: _cache.size };
}
