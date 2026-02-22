/**
 * Adaptive Retry Engine
 *
 * Retries failed operations with learned adjustments based on error patterns.
 * Integrates with the Error Pattern Learner for strategy selection.
 *
 * Strategy selection:
 *   1. Check error against known patterns → use learned strategy
 *   2. If unknown, classify heuristically → apply default strategy
 *   3. Record outcome → update pattern success rates
 *
 * Retry behaviors:
 *   - retry:              Exponential backoff (100ms, 200ms, 400ms)
 *   - retry_with_changes: Adjust parameters, then retry
 *   - auto_fix:           Apply known fix, then retry
 *   - skip:               Skip this operation, continue workflow
 *   - escalate:           Fail immediately, alert human
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOptimalStrategy,
  recordHealingOutcome,
} from "./error-pattern-learner";
import type { HealingStrategy, HealingDecision } from "./error-pattern-learner";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RetryConfig {
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms (default: 100) */
  baseDelayMs?: number;
  /** Maximum delay in ms (default: 10000) */
  maxDelayMs?: number;
  /** Jitter factor (0-1, default: 0.2) */
  jitterFactor?: number;
  /** Organization ID for pattern matching */
  organizationId: string;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  strategy: HealingStrategy;
  decision: HealingDecision;
  totalDelayMs: number;
}

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<Omit<RetryConfig, "organizationId">> = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 10000,
  jitterFactor: 0.2,
};

// ── Main Retry Function ────────────────────────────────────────────────────

/**
 * Execute an operation with adaptive retry.
 *
 * The retry strategy is selected based on the error message:
 *   - Known patterns use learned strategies
 *   - Unknown patterns use heuristic classification
 *   - Outcomes are recorded to improve future decisions
 */
export async function adaptiveRetry<T>(
  supabase: SupabaseClient,
  operation: () => Promise<T>,
  config: RetryConfig,
): Promise<RetryResult<T>> {
  const {
    maxRetries = DEFAULT_CONFIG.maxRetries,
    baseDelayMs = DEFAULT_CONFIG.baseDelayMs,
    maxDelayMs = DEFAULT_CONFIG.maxDelayMs,
    jitterFactor = DEFAULT_CONFIG.jitterFactor,
    organizationId,
  } = config;

  let attempts = 0;
  let totalDelayMs = 0;
  let lastError: string = "";
  let decision: HealingDecision = {
    strategy: "retry",
    confidence: 0.5,
    patternId: null,
    patternCategory: null,
    reason: "Initial attempt",
  };

  // First attempt — no retry needed
  try {
    const data = await operation();
    return {
      success: true,
      data,
      attempts: 1,
      strategy: "retry",
      decision,
      totalDelayMs: 0,
    };
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    attempts = 1;
  }

  // Get optimal strategy based on the error
  decision = await getOptimalStrategy(supabase, lastError, organizationId);

  // Handle non-retryable strategies
  if (decision.strategy === "escalate") {
    await recordHealingOutcome(
      supabase, organizationId, decision.patternId, "escalate",
      false, lastError, { reason: "escalated_to_human" },
    );
    return {
      success: false,
      error: lastError,
      attempts: 1,
      strategy: "escalate",
      decision,
      totalDelayMs: 0,
    };
  }

  if (decision.strategy === "skip") {
    await recordHealingOutcome(
      supabase, organizationId, decision.patternId, "skip",
      true, lastError, { reason: "skipped_non_critical" },
    );
    return {
      success: true, // Skipped = treated as success
      attempts: 1,
      strategy: "skip",
      decision,
      totalDelayMs: 0,
    };
  }

  // Retry loop
  for (let retry = 0; retry < maxRetries; retry++) {
    // Calculate delay with exponential backoff + jitter
    const exponentialDelay = Math.min(
      baseDelayMs * Math.pow(2, retry),
      maxDelayMs,
    );
    const jitter = exponentialDelay * jitterFactor * (Math.random() * 2 - 1);
    const delay = Math.max(0, Math.round(exponentialDelay + jitter));

    // Special handling for rate limits
    if (decision.patternCategory === "rate_limit") {
      const rateLimitDelay = Math.max(delay, 2000 * (retry + 1)); // At least 2s * attempt
      totalDelayMs += rateLimitDelay;
      await sleep(rateLimitDelay);
    } else {
      totalDelayMs += delay;
      await sleep(delay);
    }

    attempts++;

    try {
      const data = await operation();

      // Success! Record it
      await recordHealingOutcome(
        supabase, organizationId, decision.patternId, decision.strategy,
        true, lastError, { attempts, total_delay_ms: totalDelayMs },
      );

      logger.warn(
        `[AdaptiveRetry] Success after ${attempts} attempts (${decision.strategy}, ${totalDelayMs}ms)`,
      );

      return {
        success: true,
        data,
        attempts,
        strategy: decision.strategy,
        decision,
        totalDelayMs,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Check if the error changed (different root cause)
      const newDecision = await getOptimalStrategy(supabase, lastError, organizationId);
      if (newDecision.strategy === "escalate") {
        // New error requires escalation — stop retrying
        break;
      }
    }
  }

  // All retries exhausted
  await recordHealingOutcome(
    supabase, organizationId, decision.patternId, decision.strategy,
    false, lastError, { attempts, total_delay_ms: totalDelayMs, exhausted: true },
  );

  logger.error(
    `[AdaptiveRetry] Failed after ${attempts} attempts (${decision.strategy}, ${totalDelayMs}ms): ${lastError.slice(0, 200)}`,
  );

  return {
    success: false,
    error: lastError,
    attempts,
    strategy: decision.strategy,
    decision,
    totalDelayMs,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
