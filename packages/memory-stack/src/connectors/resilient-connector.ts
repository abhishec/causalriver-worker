/**
 * Resilient Connector Wrapper — Circuit Breaker + Retry per connector.
 *
 * Wraps any NexusConnector with:
 * 1. Circuit breaker (prevents cascade failures when external APIs are down)
 * 2. Automatic retry with exponential backoff
 * 3. Per-connector health tracking
 * 4. Timeout enforcement
 *
 * Usage:
 *   const resilientHubspot = createResilientConnector(hubspotConnector, {
 *     circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 30000 },
 *     retry: { maxRetries: 2, baseDelayMs: 1000 },
 *     timeoutMs: 30000,
 *   });
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NexusConnector, ConnectorSyncResult } from "./connector-framework";
import { createCircuitBreaker, CircuitOpenError, type CircuitBreakerConfig } from "../infra/circuit-breaker";
import { createRetry, type RetryConfig } from "../infra/retry";

export interface ResilientConnectorConfig {
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  retry?: Partial<RetryConfig>;
  timeoutMs?: number;
  onCircuitOpen?: (connectorId: string) => void;
  onCircuitClose?: (connectorId: string) => void;
  verbose?: boolean;
}

export interface ResilientConnector extends NexusConnector {
  /** Get the circuit breaker state */
  getCircuitState(): "CLOSED" | "OPEN" | "HALF_OPEN";
  /** Get health stats */
  getHealthStats(): {
    circuitState: string;
    totalSyncs: number;
    totalFailures: number;
    lastFailure?: Date;
    retryStats: { totalAttempts: number; totalRetries: number; totalFailures: number };
  };
  /** Manually trip the circuit (for admin use) */
  tripCircuit(): void;
  /** Manually reset the circuit */
  resetCircuit(): void;
}

const DEFAULT_TIMEOUT = 60_000; // 60 seconds

export function createResilientConnector(
  inner: NexusConnector,
  config: ResilientConnectorConfig = {}
): ResilientConnector {
  const cb = createCircuitBreaker({
    failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
    resetTimeoutMs: config.circuitBreaker?.resetTimeoutMs ?? 60_000,
    halfOpenSuccesses: config.circuitBreaker?.halfOpenSuccesses ?? 2,
  });

  const retry = createRetry({
    maxRetries: config.retry?.maxRetries ?? 2,
    baseDelayMs: config.retry?.baseDelayMs ?? 1_000,
    backoffMultiplier: config.retry?.backoffMultiplier ?? 2,
    maxDelayMs: config.retry?.maxDelayMs ?? 15_000,
    jitterFactor: 0.1,
  });

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;
  let totalSyncs = 0;
  let totalFailures = 0;
  let lastFailure: Date | undefined;

  async function withResilience<T>(fn: () => Promise<T>, label: string): Promise<T> {
    totalSyncs++;
    try {
      return await cb.execute(async () => {
        return await retry.execute(async () => {
          // Enforce timeout
          return await Promise.race([
            fn(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
            ),
          ]);
        }, label);
      });
    } catch (err) {
      totalFailures++;
      lastFailure = new Date();

      if (err instanceof CircuitOpenError) {
        config.onCircuitOpen?.(inner.id);
        if (config.verbose) {
          console.warn(`[ResilientConnector] Circuit OPEN for ${inner.id}: ${err.message}`);
        }
      }

      throw err;
    }
  }

  return {
    id: inner.id,
    name: `${inner.name} (resilient)`,
    domain: inner.domain,

    async fullSync(supabase: SupabaseClient, organizationId: string): Promise<ConnectorSyncResult> {
      return withResilience(
        () => inner.fullSync(supabase, organizationId),
        `${inner.id}.fullSync`
      );
    },

    async incrementalSync(supabase: SupabaseClient, organizationId: string, since: Date): Promise<ConnectorSyncResult> {
      return withResilience(
        () => inner.incrementalSync(supabase, organizationId, since),
        `${inner.id}.incrementalSync`
      );
    },

    handleWebhook: inner.handleWebhook
      ? (payload: unknown) => inner.handleWebhook!(payload)
      : undefined,

    getCircuitState() {
      return cb.getStats().state as "CLOSED" | "OPEN" | "HALF_OPEN";
    },

    getHealthStats() {
      const cbStats = cb.getStats();
      return {
        circuitState: cbStats.state,
        totalSyncs,
        totalFailures,
        lastFailure,
        retryStats: retry.getStats(),
      };
    },

    tripCircuit() {
      // Force failures to trip the circuit
      for (let i = 0; i < 10; i++) {
        try { cb.execute(() => { throw new Error("manual trip"); }); } catch {}
      }
    },

    resetCircuit() {
      cb.reset();
    },
  };
}
