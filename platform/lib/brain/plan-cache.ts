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
 * Usage in domain-executor:
 *   const cached = await getCachedPlan<ResultType>(orgId, domain, queryKey);
 *   if (cached) return cached;
 *   const result = await runDomain(...);
 *   setCachedPlan(orgId, domain, queryKey, result);
 *   return result;
 *
 * Cache is never shared across Lambda instances — this is intentional.
 * Cross-instance deduplication belongs at the DB layer (not this module).
 */

import crypto from "crypto";
import { logger } from "@/lib/logger";

// ── Module-level state ────────────────────────────────────────────────────────

const _cache = new Map<string, { result: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return a previously cached plan, or null on miss / expiry.
 */
export function getCachedPlan<T>(
  orgId: string,
  domain: string,
  queryKey: string
): T | null {
  const key = hashKey(orgId, domain, queryKey);
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result as T;
  }
  // Expired entry — evict eagerly
  _cache.delete(key);
  return null;
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
  _cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Invalidate all cached plans for an org (e.g. after data-mutating operations).
 * Because keys are opaque hashes we cannot filter by orgId prefix — we clear
 * the entire cache. This is intentionally conservative; caches repopulate
 * quickly from fresh domain calls.
 */
export function invalidateCacheForOrg(orgId: string): void {
  _cache.clear();
  logger.warn("[PlanCache] Cache cleared on invalidation request", { orgId });
}

/**
 * Return lightweight cache stats for monitoring / health endpoints.
 */
export function getCacheStats(): { size: number } {
  return { size: _cache.size };
}
