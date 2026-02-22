/**
 * Error Pattern Learning System
 *
 * Learns from workflow/agent failures to improve retry strategies.
 * Uses a DB-backed pattern registry (not hardcoded) that evolves
 * based on observed success/failure rates.
 *
 * Pattern matching:
 *   - Matches error messages against known regex patterns
 *   - Returns the optimal healing strategy based on success rate
 *   - Records outcomes to update success rates (exponential moving average)
 *
 * Integration:
 *   - Called by the workflow engine on step failures
 *   - Called by the adaptive retry engine for strategy selection
 *   - Emits RL signals for the brain to learn from
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export type HealingStrategy = "retry" | "retry_with_changes" | "skip" | "escalate" | "auto_fix";

export interface ErrorPattern {
  id: string;
  organizationId: string | null;
  pattern: string;
  category: string;
  healingStrategy: HealingStrategy;
  successRate: number;
  successCount: number;
  failureCount: number;
  lastSeen: string | null;
}

export interface HealingDecision {
  strategy: HealingStrategy;
  confidence: number;
  patternId: string | null;
  patternCategory: string | null;
  reason: string;
}

// ── In-Memory Pattern Cache ────────────────────────────────────────────────

interface CachedPatterns {
  patterns: ErrorPattern[];
  fetchedAt: number;
}

const patternCache = new Map<string, CachedPatterns>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Match an error message against known patterns.
 * Returns the best matching pattern, or null if unknown.
 */
export async function matchErrorPattern(
  supabase: SupabaseClient,
  errorMessage: string,
  organizationId: string,
): Promise<ErrorPattern | null> {
  const patterns = await getPatterns(supabase, organizationId);

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.pattern, "i");
      if (regex.test(errorMessage)) {
        // Update last_seen timestamp (non-blocking)
        Promise.resolve(
          supabase
            .from("error_patterns")
            .update({ last_seen: new Date().toISOString() })
            .eq("id", pattern.id),
        ).catch(() => {});

        return pattern;
      }
    } catch {
      // Invalid regex — skip this pattern
    }
  }

  return null;
}

/**
 * Get the optimal healing strategy for an error message.
 * If the pattern is known, uses the learned strategy.
 * If unknown, returns a safe default.
 */
export async function getOptimalStrategy(
  supabase: SupabaseClient,
  errorMessage: string,
  organizationId: string,
): Promise<HealingDecision> {
  const pattern = await matchErrorPattern(supabase, errorMessage, organizationId);

  if (pattern) {
    // Known pattern — use learned strategy
    if (pattern.successRate > 0.5) {
      return {
        strategy: pattern.healingStrategy,
        confidence: pattern.successRate,
        patternId: pattern.id,
        patternCategory: pattern.category,
        reason: `Known pattern (${pattern.category}): ${pattern.healingStrategy} has ${Math.round(pattern.successRate * 100)}% success rate`,
      };
    }

    // Known pattern but low success rate — escalate instead
    if (pattern.successRate < 0.3 && pattern.successCount + pattern.failureCount >= 5) {
      return {
        strategy: "escalate",
        confidence: 0.7,
        patternId: pattern.id,
        patternCategory: pattern.category,
        reason: `Known pattern (${pattern.category}): ${pattern.healingStrategy} only ${Math.round(pattern.successRate * 100)}% effective, escalating`,
      };
    }

    // Moderate success — try the strategy but with lower confidence
    return {
      strategy: pattern.healingStrategy,
      confidence: pattern.successRate,
      patternId: pattern.id,
      patternCategory: pattern.category,
      reason: `Known pattern (${pattern.category}): trying ${pattern.healingStrategy} (${Math.round(pattern.successRate * 100)}% success)`,
    };
  }

  // Unknown pattern — heuristic classification
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes("timeout") || lowerError.includes("econnrefused") || lowerError.includes("econnreset")) {
    return {
      strategy: "retry",
      confidence: 0.6,
      patternId: null,
      patternCategory: "transient",
      reason: "Appears to be a transient network error",
    };
  }

  if (lowerError.includes("rate limit") || lowerError.includes("429") || lowerError.includes("too many requests")) {
    return {
      strategy: "retry_with_changes",
      confidence: 0.8,
      patternId: null,
      patternCategory: "rate_limit",
      reason: "Rate limit error — will retry with backoff",
    };
  }

  if (lowerError.includes("401") || lowerError.includes("403") || lowerError.includes("unauthorized")) {
    return {
      strategy: "escalate",
      confidence: 0.7,
      patternId: null,
      patternCategory: "auth",
      reason: "Authentication/authorization error — needs human intervention",
    };
  }

  // Default: try once, learn from outcome
  return {
    strategy: "retry",
    confidence: 0.3,
    patternId: null,
    patternCategory: "unknown",
    reason: "Unknown error pattern — trying retry once to learn",
  };
}

/**
 * Record the outcome of a healing attempt.
 * Updates the pattern's success rate using exponential moving average.
 */
export async function recordHealingOutcome(
  supabase: SupabaseClient,
  organizationId: string,
  patternId: string | null,
  strategyUsed: HealingStrategy,
  success: boolean,
  errorMessage: string,
  context?: Record<string, unknown>,
): Promise<void> {
  // 1. Record the outcome
  await supabase.from("healing_outcomes").insert({
    error_pattern_id: patternId,
    organization_id: organizationId,
    strategy_used: strategyUsed,
    success,
    error_message: errorMessage,
    context: context ?? {},
  });

  // 2. Update pattern success rate if known
  if (patternId) {
    const { data: pattern } = await supabase
      .from("error_patterns")
      .select("success_count, failure_count, success_rate")
      .eq("id", patternId)
      .single();

    if (pattern) {
      const newSuccessCount = (pattern.success_count || 0) + (success ? 1 : 0);
      const newFailureCount = (pattern.failure_count || 0) + (success ? 0 : 1);
      const total = newSuccessCount + newFailureCount;

      // Exponential moving average (alpha = 0.3) — recent outcomes weighted more
      const alpha = 0.3;
      const newRate = alpha * (success ? 1 : 0) + (1 - alpha) * (pattern.success_rate || 0.5);

      await supabase
        .from("error_patterns")
        .update({
          success_count: newSuccessCount,
          failure_count: newFailureCount,
          success_rate: Math.round(newRate * 1000) / 1000,
          last_seen: new Date().toISOString(),
        })
        .eq("id", patternId);

      // Invalidate cache
      patternCache.delete(organizationId);
      patternCache.delete("global");
    }
  }

  // 3. If unknown pattern was successful, consider creating a new pattern
  if (!patternId && success && errorMessage.length > 10) {
    // Auto-learn: extract a regex-safe version of the error message
    const safePattern = errorMessage
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .slice(0, 100); // Limit pattern length

    try {
      await supabase.from("error_patterns").insert({
        organization_id: organizationId,
        pattern: safePattern,
        category: "auto_learned",
        healing_strategy: strategyUsed,
        success_count: 1,
        failure_count: 0,
        success_rate: 0.7, // Start optimistic since it just succeeded
        last_seen: new Date().toISOString(),
      });
      logger.warn(`[ErrorPatternLearner] Auto-learned new pattern: ${safePattern.slice(0, 50)}...`);
    } catch {
      // May fail on duplicate — that's fine
    }
  }

  // 4. Emit RL signal
  try {
    await supabase.from("cross_domain_signals").insert({
      organization_id: organizationId,
      source_domain: "brain.self_healing",
      signal_type: success ? "healing_success" : "healing_failure",
      signal_value: success ? 0.8 : -0.3,
      entity_type: "healing_outcome",
      signal_metadata: {
        pattern_id: patternId,
        strategy: strategyUsed,
        success,
        error_preview: errorMessage.slice(0, 200),
        healed_at: new Date().toISOString(),
      },
    });
  } catch {
    // Non-critical
  }
}

/**
 * Register a new error pattern.
 */
export async function addErrorPattern(
  supabase: SupabaseClient,
  organizationId: string | null,
  pattern: string,
  category: string,
  strategy: HealingStrategy,
  initialSuccessRate = 0.5,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("error_patterns")
    .insert({
      organization_id: organizationId,
      pattern,
      category,
      healing_strategy: strategy,
      success_rate: initialSuccessRate,
    })
    .select("id")
    .single();

  if (error) {
    logger.error("[ErrorPatternLearner] Failed to add pattern:", error);
    return null;
  }

  // Invalidate cache
  if (organizationId) patternCache.delete(organizationId);
  patternCache.delete("global");

  return data?.id ?? null;
}

// ── Pattern Loading (Cached) ───────────────────────────────────────────────

async function getPatterns(supabase: SupabaseClient, organizationId: string): Promise<ErrorPattern[]> {
  // Check cache
  const cached = patternCache.get(organizationId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.patterns;
  }

  // Fetch org-specific + global patterns
  const { data: rows } = await supabase
    .from("error_patterns")
    .select("*")
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .order("success_rate", { ascending: false });

  const patterns: ErrorPattern[] = (rows || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    organizationId: r.organization_id as string | null,
    pattern: r.pattern as string,
    category: r.category as string,
    healingStrategy: r.healing_strategy as HealingStrategy,
    successRate: (r.success_rate as number) || 0.5,
    successCount: (r.success_count as number) || 0,
    failureCount: (r.failure_count as number) || 0,
    lastSeen: r.last_seen as string | null,
  }));

  patternCache.set(organizationId, { patterns, fetchedAt: Date.now() });

  return patterns;
}

// ── Initial Pattern Seeding ────────────────────────────────────────────────

/**
 * Seed initial error patterns from CI Healer's known patterns.
 * Call once per org setup, idempotent (won't duplicate).
 */
export async function seedInitialPatterns(supabase: SupabaseClient): Promise<number> {
  const INITIAL_PATTERNS: Array<{ pattern: string; category: string; strategy: HealingStrategy; rate: number }> = [
    { pattern: "lockfile.*out of date|lockfile.*conflict", category: "lockfile", strategy: "auto_fix", rate: 0.95 },
    { pattern: "ERESOLVE|could not resolve|peer dep", category: "dependency", strategy: "auto_fix", rate: 0.7 },
    { pattern: "eslint.*error|Parsing error|no-unused-vars", category: "eslint", strategy: "auto_fix", rate: 0.8 },
    { pattern: "TypeError|ReferenceError|SyntaxError", category: "typescript", strategy: "escalate", rate: 0.2 },
    { pattern: "test.*fail|FAIL.*test|expect.*toBe", category: "test_failure", strategy: "escalate", rate: 0.1 },
    { pattern: "ECONNREFUSED|ECONNRESET|ETIMEDOUT", category: "transient", strategy: "retry", rate: 0.85 },
    { pattern: "ENOMEM|out of memory|heap.*limit", category: "resource", strategy: "retry_with_changes", rate: 0.6 },
    { pattern: "429|rate limit|too many requests", category: "rate_limit", strategy: "retry_with_changes", rate: 0.95 },
    { pattern: "docker.*fail|dockerfile.*error", category: "docker", strategy: "retry", rate: 0.6 },
    { pattern: "permission denied|EACCES", category: "permission", strategy: "escalate", rate: 0.15 },
  ];

  let seeded = 0;
  for (const p of INITIAL_PATTERNS) {
    const { error } = await supabase.from("error_patterns").insert({
      organization_id: null, // Global patterns
      pattern: p.pattern,
      category: p.category,
      healing_strategy: p.strategy,
      success_rate: p.rate,
    });

    if (!error) seeded++;
  }

  logger.warn(`[ErrorPatternLearner] Seeded ${seeded} initial patterns`);
  return seeded;
}
