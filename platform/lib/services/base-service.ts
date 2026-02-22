/**
 * Base Service Class
 * ==================
 * Standardized service layer pattern ported from NexusOS.
 *
 * Provides consistent:
 *   - Structured logging with service name context
 *   - Error handling (throw vs. fallback for non-critical ops)
 *   - Supabase client access
 *   - Date formatting utilities
 *   - Request deduplication integration
 *
 * Usage:
 *   class ClientService extends BaseService {
 *     async getAll(orgId: string) {
 *       return this.withFallback("getAll", [], async () => {
 *         const { data, error } = await this.supabase()
 *           .from("clients")
 *           .select("*")
 *           .eq("organization_id", orgId);
 *         if (error) throw error;
 *         return data;
 *       });
 *     }
 *   }
 */

import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { requestDeduplicator } from "@/lib/request-deduplicator";
import type { SupabaseClient } from "@supabase/supabase-js";

export abstract class BaseService {
  /** Service name for logging context (auto-derived from class name) */
  protected abstract readonly serviceName: string;

  /**
   * Get a Supabase service-role client.
   * Note: Each call creates a fresh client (Next.js RSC pattern).
   */
  protected async supabase(): Promise<SupabaseClient> {
    return createServiceClient();
  }

  // ── Logging ───────────────────────────────────────────────────────────────

  protected log(operation: string, details?: unknown): void {
    logger.info(`[${this.serviceName}] ${operation}`, details || "");
  }

  protected logWarn(operation: string, details?: unknown): void {
    logger.warn(`[${this.serviceName}] ${operation}`, details || "");
  }

  protected logError(operation: string, error: unknown): void {
    logger.error(`[${this.serviceName}] Error during ${operation}:`, error);
  }

  // ── Error Handling ────────────────────────────────────────────────────────

  /**
   * Handle an error by logging and re-throwing.
   * Use for critical operations that must succeed.
   */
  protected handleError(operation: string, error: unknown): never {
    this.logError(operation, error);
    throw error;
  }

  /**
   * Handle an error by logging and returning fallback data.
   * Use for non-critical operations where degraded results are acceptable.
   */
  protected handleErrorWithFallback<T>(operation: string, error: unknown, fallback: T): T {
    this.logError(operation, error);
    this.logWarn(operation, `Returning fallback data`);
    return fallback;
  }

  /**
   * Execute an operation with automatic fallback on error.
   * Combines try/catch + logging + fallback in one call.
   *
   * @param operation  Name of the operation (for logging)
   * @param fallback   Default value to return on error
   * @param fn         The async function to execute
   */
  protected async withFallback<T>(
    operation: string,
    fallback: T,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      return this.handleErrorWithFallback(operation, error, fallback);
    }
  }

  /**
   * Execute an operation that must succeed (throws on error).
   * Adds consistent logging around the operation.
   */
  protected async withThrow<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.handleError(operation, error);
    }
  }

  // ── Request Deduplication ─────────────────────────────────────────────────

  /**
   * Execute with request deduplication.
   * Identical cache keys share the same in-flight promise + cached result.
   *
   * @param cacheKey  Unique key for this request
   * @param fn        Async function to execute
   * @param ttlMs     Cache TTL in ms (default: 30s)
   */
  protected async deduplicated<T>(
    cacheKey: string,
    fn: () => Promise<T>,
    ttlMs: number = 30_000,
  ): Promise<T> {
    return requestDeduplicator.deduplicate(
      `${this.serviceName}:${cacheKey}`,
      fn,
      ttlMs,
    );
  }

  /**
   * Invalidate deduplicated cache entries for this service.
   *
   * @param pattern  Optional substring to match (e.g., "clients")
   */
  protected invalidateCache(pattern?: string): void {
    requestDeduplicator.clearCache(
      pattern ? `${this.serviceName}:${pattern}` : this.serviceName,
    );
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Format a Date for Supabase (YYYY-MM-DD).
   */
  protected formatDateForSupabase(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  /**
   * Format a Date as ISO timestamp for Supabase.
   */
  protected formatTimestampForSupabase(date: Date): string {
    return date.toISOString();
  }
}
