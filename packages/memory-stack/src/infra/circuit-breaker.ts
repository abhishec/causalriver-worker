/**
 * Circuit Breaker
 *
 * Zero-dependency circuit breaker for protecting external services
 * (Supabase, OpenAI embeddings, etc.) from cascading failures.
 *
 * State machine: CLOSED → OPEN → HALF-OPEN → CLOSED
 *
 *   CLOSED (normal):
 *     All calls go through. Failures tracked.
 *     After N failures → transitions to OPEN.
 *
 *   OPEN (tripped):
 *     All calls fail immediately with CircuitOpenError.
 *     After resetTimeoutMs → transitions to HALF-OPEN.
 *
 *   HALF-OPEN (probing):
 *     Allows calls through one at a time.
 *     After N successes → transitions to CLOSED.
 *     On any failure → transitions back to OPEN.
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 60000 });
 * const result = await breaker.execute(() => supabase.from('table').select('*'));
 * console.log(breaker.getState()); // 'closed' | 'open' | 'half-open'
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before trying half-open after tripping (default: 60000) */
  resetTimeoutMs: number;
  /** Number of successes in half-open state before closing (default: 2) */
  halfOpenSuccesses: number;
  /** Optional label for logging */
  label?: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalTrips: number;
  lastFailureTime: number | null;
  lastTransition: string | null;
}

export class CircuitOpenError extends Error {
  constructor(label?: string) {
    super(`Circuit breaker${label ? ` [${label}]` : ''} is OPEN — calls blocked to protect downstream service`);
    this.name = 'CircuitOpenError';
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a circuit breaker.
 */
export function createCircuitBreaker(config: Partial<CircuitBreakerConfig> = {}) {
  const {
    failureThreshold = 5,
    resetTimeoutMs = 60000,
    halfOpenSuccesses = 2,
    label,
  } = config;

  let state: CircuitState = 'closed';
  let failureCount = 0;
  let successCount = 0;
  let totalTrips = 0;
  let lastFailureTime: number | null = null;
  let lastTransition: string | null = null;

  function transition(newState: CircuitState): void {
    if (state !== newState) {
      lastTransition = `${state} → ${newState} at ${new Date().toISOString()}`;
      state = newState;
    }
  }

  return {
    /**
     * Execute a function through the circuit breaker.
     * @throws CircuitOpenError if the circuit is open
     * @throws The function's error if it fails
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      // Check if we should transition from OPEN to HALF-OPEN
      if (state === 'open') {
        if (lastFailureTime && Date.now() - lastFailureTime >= resetTimeoutMs) {
          transition('half-open');
          successCount = 0;
        } else {
          throw new CircuitOpenError(label);
        }
      }

      try {
        const result = await fn();

        // On success
        if (state === 'half-open') {
          successCount++;
          if (successCount >= halfOpenSuccesses) {
            transition('closed');
            failureCount = 0;
            successCount = 0;
          }
        } else if (state === 'closed') {
          // Reset failure count on success in closed state
          failureCount = 0;
        }

        return result;
      } catch (err) {
        failureCount++;
        lastFailureTime = Date.now();

        if (state === 'half-open') {
          // Any failure in half-open → back to open
          transition('open');
          totalTrips++;
        } else if (state === 'closed' && failureCount >= failureThreshold) {
          // Threshold reached → open
          transition('open');
          totalTrips++;
        }

        throw err;
      }
    },

    /** Get current circuit state */
    getState(): CircuitState {
      // Check for automatic OPEN → HALF-OPEN transition
      if (state === 'open' && lastFailureTime && Date.now() - lastFailureTime >= resetTimeoutMs) {
        return 'half-open';
      }
      return state;
    },

    /** Get failure count */
    getFailureCount(): number {
      return failureCount;
    },

    /** Get detailed stats */
    getStats(): CircuitBreakerStats {
      return {
        state: this.getState(),
        failureCount,
        successCount,
        totalTrips,
        lastFailureTime,
        lastTransition,
      };
    },

    /** Force-reset the circuit breaker to closed state */
    reset(): void {
      transition('closed');
      failureCount = 0;
      successCount = 0;
      lastFailureTime = null;
    },
  };
}
