/**
 * Retry Utility with Exponential Backoff
 *
 * Zero-dependency retry for transient failures (DB timeouts, network blips).
 * Follows the codebase's createX() factory pattern.
 *
 * Features:
 * - Exponential backoff with configurable base, multiplier, and cap
 * - Jitter (10% default) to prevent thundering herd
 * - Optional retryOn predicate for selective retry
 * - Attempt tracking for observability
 *
 * @example
 * ```typescript
 * const retry = createRetry({ maxRetries: 3, baseDelayMs: 1000 });
 * const result = await retry.execute(() => supabase.from('table').select('*'), 'db-read');
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RetryConfig {
  /** Maximum retry attempts after initial try (default: 3) */
  maxRetries: number;
  /** Base delay in ms before first retry (default: 1000) */
  baseDelayMs: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs: number;
  /** Jitter factor 0-1 to randomize delay (default: 0.1) */
  jitterFactor: number;
  /** Optional predicate: only retry if this returns true for the error */
  retryOn?: (error: Error) => boolean;
}

export interface RetryStats {
  totalAttempts: number;
  totalRetries: number;
  totalFailures: number;
  lastError: string | null;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a retry utility with exponential backoff.
 */
export function createRetry(config: Partial<RetryConfig> = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 30000,
    jitterFactor = 0.1,
    retryOn,
  } = config;

  let totalAttempts = 0;
  let totalRetries = 0;
  let totalFailures = 0;
  let lastError: string | null = null;

  /**
   * Compute delay for attempt N with jitter.
   */
  function computeDelay(attempt: number): number {
    const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
    const jitter = cappedDelay * jitterFactor * Math.random();
    return cappedDelay + jitter;
  }

  return {
    /**
     * Execute a function with retry logic.
     * @param fn - Async function to execute
     * @param label - Optional label for logging/debugging
     * @returns The function's result
     * @throws The last error if all retries exhausted
     */
    async execute<T>(fn: () => Promise<T>, label?: string): Promise<T> {
      let lastErr: Error = new Error('No attempts made');

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        totalAttempts++;

        try {
          return await fn();
        } catch (err: any) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          lastError = `${label ? `[${label}] ` : ''}${lastErr.message}`;

          // Check if we should retry this error
          if (retryOn && !retryOn(lastErr)) {
            totalFailures++;
            throw lastErr;
          }

          // If last attempt, don't delay — just throw
          if (attempt === maxRetries) {
            totalFailures++;
            throw lastErr;
          }

          // Wait with exponential backoff + jitter
          totalRetries++;
          const delay = computeDelay(attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // Should never reach here, but TypeScript needs it
      totalFailures++;
      throw lastErr;
    },

    /**
     * Get retry statistics.
     */
    getStats(): RetryStats {
      return {
        totalAttempts,
        totalRetries,
        totalFailures,
        lastError,
      };
    },

    /**
     * Reset statistics.
     */
    resetStats(): void {
      totalAttempts = 0;
      totalRetries = 0;
      totalFailures = 0;
      lastError = null;
    },
  };
}
