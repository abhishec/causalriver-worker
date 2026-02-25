/**
 * Self-Healing Workflow Engine Extension
 * =======================================
 *
 * Extends the base workflow engine with:
 *   - Adaptive retry with exponential backoff + jitter
 *   - Error classification and pattern tracking
 *   - Failure prediction based on historical patterns
 *   - Circuit breaker for persistently failing steps
 *   - Intelligent retry strategies per error type
 *
 * This module is used by the main engine when a step fails,
 * replacing the simple retry_once with intelligent recovery.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Error Classification ───────────────────────────────────────────────────

export type ErrorCategory =
  | "transient"        // Temporary failures (network, rate limit, timeout)
  | "data_quality"     // Bad/missing input data
  | "resource"         // Out of memory, disk full, API quota
  | "logic"            // Agent produced invalid output
  | "dependency"       // External service unavailable
  | "permission"       // Auth/authorization failure
  | "unknown";         // Unclassifiable

export interface ClassifiedError {
  category: ErrorCategory;
  originalMessage: string;
  retryable: boolean;
  suggestedStrategy: RetryStrategy;
  confidence: number;
}

export type RetryStrategy =
  | "exponential_backoff"  // Increasing delays
  | "immediate_retry"      // Retry right away (flaky errors)
  | "fallback_agent"       // Try a different agent
  | "skip_and_continue"    // Accept the loss
  | "halt_and_notify"      // Stop and alert human
  | "decompose_task";      // Break into smaller sub-tasks

// ── Error Classification Patterns ──────────────────────────────────────────

const ERROR_PATTERNS: {
  pattern: RegExp;
  category: ErrorCategory;
  retryable: boolean;
  strategy: RetryStrategy;
}[] = [
  // Transient
  { pattern: /timeout|timed out|ETIMEDOUT/i, category: "transient", retryable: true, strategy: "exponential_backoff" },
  { pattern: /rate.?limit|429|too many requests/i, category: "transient", retryable: true, strategy: "exponential_backoff" },
  { pattern: /ECONNRESET|ECONNREFUSED|EPIPE/i, category: "transient", retryable: true, strategy: "immediate_retry" },
  { pattern: /network|fetch failed|dns/i, category: "transient", retryable: true, strategy: "exponential_backoff" },
  { pattern: /502|503|504|service unavailable/i, category: "dependency", retryable: true, strategy: "exponential_backoff" },

  // Data quality
  { pattern: /null|undefined|missing.?field|required/i, category: "data_quality", retryable: false, strategy: "skip_and_continue" },
  { pattern: /parse|json|syntax|invalid.*format/i, category: "data_quality", retryable: true, strategy: "immediate_retry" },
  { pattern: /empty.*response|no.*data|not.*found/i, category: "data_quality", retryable: false, strategy: "fallback_agent" },

  // Resource
  { pattern: /quota|limit.*exceeded|credit/i, category: "resource", retryable: false, strategy: "halt_and_notify" },
  { pattern: /out of memory|OOM|heap/i, category: "resource", retryable: false, strategy: "halt_and_notify" },
  { pattern: /token.*limit|context.*length/i, category: "resource", retryable: true, strategy: "decompose_task" },

  // Permission
  { pattern: /401|403|unauthorized|forbidden|not.*authorized/i, category: "permission", retryable: false, strategy: "halt_and_notify" },
  { pattern: /authentication|auth.*failed|invalid.*token/i, category: "permission", retryable: false, strategy: "halt_and_notify" },

  // Logic
  { pattern: /assertion|invariant|unexpected/i, category: "logic", retryable: true, strategy: "fallback_agent" },
  { pattern: /confidence.*low|quality.*check/i, category: "logic", retryable: true, strategy: "fallback_agent" },
];

/**
 * Classify an error message into a category with retry recommendation.
 */
export function classifyError(errorMessage: string): ClassifiedError {
  for (const p of ERROR_PATTERNS) {
    if (p.pattern.test(errorMessage)) {
      return {
        category: p.category,
        originalMessage: errorMessage,
        retryable: p.retryable,
        suggestedStrategy: p.strategy,
        confidence: 0.85,
      };
    }
  }

  return {
    category: "unknown",
    originalMessage: errorMessage,
    retryable: true,
    suggestedStrategy: "exponential_backoff",
    confidence: 0.3,
  };
}

// ── Adaptive Retry ─────────────────────────────────────────────────────────

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number; // 0.0 = no jitter, 1.0 = full jitter
  strategy: RetryStrategy;
}

const DEFAULT_RETRY_CONFIG: Record<RetryStrategy, RetryConfig> = {
  exponential_backoff: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitterFactor: 0.5, strategy: "exponential_backoff" },
  immediate_retry: { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 500, jitterFactor: 0.1, strategy: "immediate_retry" },
  fallback_agent: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0, jitterFactor: 0, strategy: "fallback_agent" },
  skip_and_continue: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0, jitterFactor: 0, strategy: "skip_and_continue" },
  halt_and_notify: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0, jitterFactor: 0, strategy: "halt_and_notify" },
  decompose_task: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0, jitterFactor: 0, strategy: "decompose_task" },
};

/**
 * Calculate delay for the nth retry with exponential backoff + jitter.
 */
export function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, config.maxDelayMs);
  const jitter = capped * config.jitterFactor * Math.random();
  return Math.round(capped + jitter);
}

/**
 * Get retry configuration for an error.
 */
export function getRetryConfig(error: ClassifiedError): RetryConfig {
  return DEFAULT_RETRY_CONFIG[error.suggestedStrategy] || DEFAULT_RETRY_CONFIG.exponential_backoff;
}

// ── Circuit Breaker ────────────────────────────────────────────────────────

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  /** Number of consecutive failures before opening */
  threshold: number;
  /** Time to wait before half-open (ms) */
  cooldownMs: number;
}

/**
 * Check if a step's circuit breaker is open (too many failures).
 */
export function isCircuitOpen(state: CircuitBreakerState): boolean {
  if (!state.isOpen) return false;
  // Check if cooldown has elapsed → move to half-open
  if (Date.now() - state.lastFailure > state.cooldownMs) {
    return false; // Allow one retry (half-open)
  }
  return true;
}

/**
 * Record a failure in the circuit breaker.
 */
export function recordCircuitFailure(state: CircuitBreakerState): CircuitBreakerState {
  const failures = state.failures + 1;
  return {
    ...state,
    failures,
    lastFailure: Date.now(),
    isOpen: failures >= state.threshold,
  };
}

/**
 * Reset circuit breaker on success.
 */
export function resetCircuit(state: CircuitBreakerState): CircuitBreakerState {
  return { ...state, failures: 0, isOpen: false };
}

// ── Error Pattern Tracking ─────────────────────────────────────────────────

/**
 * Record an error pattern to the database for learning.
 */
export async function recordErrorPattern(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    workflowId?: string;
    stepOrder?: number;
    agentType: string;
    error: ClassifiedError;
    retryAttempt: number;
    resolved: boolean;
  },
): Promise<void> {
  try {
    await supabase.from("cross_domain_signals").insert({
      organization_id: params.organizationId,
      source_domain: "brain.self_healing",
      signal_type: params.resolved ? "error_resolved" : "error_occurred",
      signal_value: params.resolved ? 0.5 : -0.5,
      signal_timestamp: new Date().toISOString(),
      entity_type: "workflow_error",
      entity_id: `${params.workflowId || "unknown"}_step_${params.stepOrder || 0}`,
      signal_metadata: {
        agentType: params.agentType,
        errorCategory: params.error.category,
        errorMessage: params.error.originalMessage.slice(0, 300),
        retryStrategy: params.error.suggestedStrategy,
        retryAttempt: params.retryAttempt,
        resolved: params.resolved,
        confidence: params.error.confidence,
      },
    });
  } catch {
    // Non-critical
  }
}

/**
 * Query historical error patterns for a step/agent to predict failures.
 * Returns the most common error category and recommended strategy.
 */
export async function predictFailurePattern(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    agentType: string;
    lookbackHours?: number;
  },
): Promise<{
  likelyCategory: ErrorCategory | null;
  failureRate: number;
  suggestedPreemption: string | null;
} | null> {
  try {
    const cutoff = new Date(Date.now() - (params.lookbackHours || 24) * 60 * 60 * 1000).toISOString();

    const { data: signals } = await supabase
      .from("cross_domain_signals")
      .select("signal_metadata, signal_type")
      .eq("organization_id", params.organizationId)
      .eq("source_domain", "brain.self_healing")
      .gte("created_at", cutoff)
      .limit(100);

    if (!signals || signals.length === 0) return null;

    // Count errors by category for this agent type
    const categoryCount = new Map<string, number>();
    let totalErrors = 0;
    let totalResolved = 0;

    for (const s of signals) {
      const meta = s.signal_metadata as Record<string, unknown>;
      if (meta?.agentType !== params.agentType) continue;

      if (s.signal_type === "error_occurred") {
        totalErrors++;
        const cat = (meta?.errorCategory as string) || "unknown";
        categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
      } else if (s.signal_type === "error_resolved") {
        totalResolved++;
      }
    }

    if (totalErrors === 0) return null;

    const failureRate = totalErrors / (totalErrors + totalResolved) || 0;

    // Find most common category
    let maxCategory: string | null = null;
    let maxCount = 0;
    for (const [cat, count] of categoryCount) {
      if (count > maxCount) {
        maxCount = count;
        maxCategory = cat;
      }
    }

    // Suggest preemption
    let suggestedPreemption: string | null = null;
    if (failureRate > 0.7) {
      suggestedPreemption = `High failure rate (${(failureRate * 100).toFixed(0)}%) for ${params.agentType}. Consider using a different agent or adding guardrails.`;
    } else if (maxCategory === "resource") {
      suggestedPreemption = "Frequent resource errors. Consider reducing prompt size or batch size.";
    } else if (maxCategory === "transient") {
      suggestedPreemption = "Frequent transient errors. Network/API stability may be degraded.";
    }

    return {
      likelyCategory: maxCategory as ErrorCategory | null,
      failureRate,
      suggestedPreemption,
    };
  } catch {
    return null;
  }
}

// ── Fallback Agent Resolution ──────────────────────────────────────────────

/**
 * Map of agent types to their fallback alternatives.
 * When primary agent fails, try the fallback.
 */
const AGENT_FALLBACKS: Record<string, string[]> = {
  "code-review": ["general", "codebase-qa"],
  "impact-analysis": ["codebase-qa", "general"],
  "tdd": ["test-case-generator", "general"],
  "pr-review": ["code-review", "general"],
  "incident-diagnosis": ["log-query", "general"],
  "performance-profiler": ["sql-analyzer", "general"],
  "tech-debt-audit": ["dead-code-detector", "general"],
  "design-doc-generator": ["architecture-extractor", "general"],
};

/**
 * Get fallback agent types for a given agent.
 */
export function getFallbackAgents(agentType: string): string[] {
  return AGENT_FALLBACKS[agentType] || ["general"];
}
