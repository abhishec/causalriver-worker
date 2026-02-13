/**
 * Rate Limiter for NexusBrain API
 *
 * Enforces per-API-key rate limits using a sliding window counter
 * stored in the api_rate_limits table. Falls back to in-memory
 * limiting if the DB call fails (fail-open with conservative limit).
 *
 * Usage:
 *   const result = await checkRateLimit(keyHash, rateLimitPerMinute);
 *   if (!result.allowed) {
 *     return NextResponse.json({ error: result.error }, { status: 429 });
 *   }
 */

import { createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  error?: string;
}

// In-memory fallback for when DB is unavailable
const memoryWindows = new Map<string, { count: number; windowStart: number }>();

/**
 * Check rate limit for an API key.
 *
 * @param keyHash  SHA-256 hash of the API key
 * @param limitPerMinute  Max requests per minute for this key
 * @returns  Whether the request is allowed, remaining quota, and reset time
 */
export async function checkRateLimit(
  keyHash: string,
  limitPerMinute: number
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  const resetAt = new Date(windowStart.getTime() + 60_000);

  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("check_rate_limit", {
      p_key_hash: keyHash,
      p_limit_per_minute: limitPerMinute,
    });

    if (error) {
      // Fail open with in-memory fallback
      return checkRateLimitMemory(keyHash, limitPerMinute, resetAt);
    }

    const remaining = typeof data === "number" ? data : 0;

    if (remaining < 0) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        error: `Rate limit exceeded. ${limitPerMinute} requests/minute allowed. Retry after ${resetAt.toISOString()}.`,
      };
    }

    return { allowed: true, remaining, resetAt };
  } catch {
    // DB unavailable — use memory fallback
    return checkRateLimitMemory(keyHash, limitPerMinute, resetAt);
  }
}

/**
 * In-memory rate limiter fallback (conservative: 50% of DB limit).
 * Used when Supabase RPC is unavailable.
 */
function checkRateLimitMemory(
  keyHash: string,
  limitPerMinute: number,
  resetAt: Date
): RateLimitResult {
  const now = Date.now();
  const windowMs = 60_000;
  const conservativeLimit = Math.max(Math.floor(limitPerMinute * 0.5), 5);
  const key = keyHash.substring(0, 16); // Truncate for memory efficiency

  const existing = memoryWindows.get(key);
  if (!existing || now - existing.windowStart > windowMs) {
    memoryWindows.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: conservativeLimit - 1, resetAt };
  }

  existing.count++;
  if (existing.count > conservativeLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      error: `Rate limit exceeded (fallback mode). Retry after ${resetAt.toISOString()}.`,
    };
  }

  return { allowed: true, remaining: conservativeLimit - existing.count, resetAt };
}

/**
 * Hash a raw API key for rate limit lookup.
 */
export function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Set rate limit headers on a response.
 */
export function setRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult,
  limit: number
): void {
  headers.set("X-RateLimit-Limit", String(limit));
  headers.set("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
  headers.set("X-RateLimit-Reset", String(Math.floor(result.resetAt.getTime() / 1000)));
}
