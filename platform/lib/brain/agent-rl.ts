/**
 * Agent RL — DB-backed reinforcement learning for domain execution
 *
 * Extends rl-agent-loop.ts (file-based case-log) with database-backed:
 * - Outcome recording (prediction_records + cross_domain_signals)
 * - Learning stats aggregation
 *
 * All functions are fire-and-forget safe — never throw, only logger.warn on failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentOutcomeParams {
  /** Agent or domain instance ID */
  agentId: string;
  /** The SE-aaS domain (e.g. "pod-match", "early-warning") */
  domain: string;
  /** One-line description of what the task was */
  taskDescription: string;
  /** Stringified result (first 500 chars) */
  resultSummary: string;
  /** Quality score 0–1 */
  quality: number;
  /** Execution duration in ms */
  executionMs: number;
  organizationId: string;
  userId: string;
}

export interface LearningStats {
  totalTasks: number;
  successRate: number;       // 0–1: fraction with quality >= 0.7
  avgQuality: number;        // 0–1
  topDomain: string | null;  // domain with most executions
  learningVelocity: number;  // tasks completed in last 24h
  pendingFeedback: number;   // brain_feedback_queue pending count
  helpfulFeedback: number;   // copilot_response_feedback helpful count (7d)
  notHelpfulFeedback: number;
}

// ── Quality Heuristic ──────────────────────────────────────────────────────

/**
 * Compute a quality score (0–1) from execution results.
 *
 * Replaces the old heuristic that scored based on curly-brace presence,
 * which caused nearly all executions to score ~0.95 regardless of result
 * quality — corrupting all downstream RL signals.
 *
 * New approach:
 * - Conservative baseline (0.5) — quality must be earned, not assumed
 * - Rewards actual data records (non-empty `data` array)
 * - Penalises empty `data` arrays (the most common failure mode)
 * - Penalises known error patterns and recovery fallbacks
 * - Optionally domain-aware for future per-domain calibration
 *
 * Fast, synchronous — no DB calls needed.
 */
export function computeAgentQuality(
  result: string,
  error: Error | null,
  executionMs: number,
  domain?: string
): number {
  if (error) return 0;
  if (!result || result.length < 50) return 0.3;

  // Conservative baseline — prevents inflated RL signals from bare JSON wrappers
  let score = 0.5;

  // ── Execution speed ──────────────────────────────────────────────────────
  if (executionMs < 5_000)       score += 0.1;   // Fast = likely cached or simple
  else if (executionMs < 30_000) score += 0.05;  // Normal range
  else if (executionMs > 60_000) score -= 0.1;   // Too slow = something went wrong

  // ── Result richness ──────────────────────────────────────────────────────
  if (result.length > 500)  score += 0.1;
  if (result.length > 1500) score += 0.05;

  // ── Structured data analysis ─────────────────────────────────────────────
  // Parse the JSON result and check for meaningful content in the `data` field.
  // An empty `data: []` is the most common false-positive in SE-aaS domains.
  try {
    const parsed: Record<string, unknown> = JSON.parse(result);

    const data = parsed?.data;
    if (Array.isArray(data)) {
      if (data.length > 0) {
        // Has actual records — core success indicator
        score += 0.2;
        if (data.length >= 3) score += 0.05; // Multiple records = richer result
      } else {
        // Empty array is a failure: domain ran but found nothing
        score -= 0.25;
      }
    } else if (data && typeof data === "object" && Object.keys(data).length > 0) {
      // Object result with fields (e.g. single-record domains)
      score += 0.15;
    }

    // Recovery flag — acceptable but not ideal quality
    if (parsed?._recoveryUsed) score -= 0.05;

    // Domain-specific success signals
    if (domain) {
      if (domain === "pod-match" && parsed?.top_recommendation) score += 0.1;
      if (domain === "early-warning" && Array.isArray(parsed?.alerts) && (parsed.alerts as unknown[]).length > 0) score += 0.1;
      if (domain === "delivery-intelligence" && parsed?.summary) score += 0.1;
    }
  } catch {
    // Non-JSON result — penalise (SE-aaS should always return structured data)
    score -= 0.15;
  }

  // ── Error pattern detection ──────────────────────────────────────────────
  const lower = result.toLowerCase();
  if ((lower.includes('"error"') || lower.includes('"status":"error"')) && result.length < 300) {
    score -= 0.3;
  }
  if (lower.includes("no data found") || lower.includes("no results") || lower.includes("not found")) {
    score -= 0.15;
  }

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

// ── Outcome Recording ──────────────────────────────────────────────────────

/**
 * Record agent task outcome to prediction_records + cross_domain_signals.
 * Fire-and-forget safe — swallows all errors.
 */
export async function recordAgentOutcome(
  supabase: SupabaseClient,
  params: AgentOutcomeParams
): Promise<void> {
  const wasSuccess = params.quality >= 0.7;

  try {
    // Insert to prediction_records (L4 Causal layer)
    await supabase.from("prediction_records").insert({
      organization_id: params.organizationId,
      domain: params.domain,
      prediction_type: "agent_task_outcome",
      entity_type: "agent",
      entity_id: params.agentId,
      predicted_outcome: params.taskDescription.slice(0, 200),
      actual_outcome: params.resultSummary.slice(0, 500),
      confidence: params.quality,
      was_correct: wasSuccess,
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("[agent-rl] prediction_records insert failed:", err);
  }

  try {
    // Emit RL signal to cross_domain_signals (L1 Ingestion layer)
    // Maps quality → neurotransmitter: dopamine (reward) or gaba (inhibitory)
    const signalType = wasSuccess ? "dopamine" : "gaba";
    const signalValue = wasSuccess ? params.quality : -(1 - params.quality);

    const now = new Date().toISOString();
    await supabase.from("cross_domain_signals").insert({
      organization_id: params.organizationId,
      source_domain: `se-aas.${params.domain}`,
      signal_type: signalType,
      signal_value: signalValue,
      entity_type: "agent",
      entity_id: params.agentId,
      signal_metadata: {
        quality: params.quality,
        executionMs: params.executionMs,
        taskDescription: params.taskDescription.slice(0, 100),
        wasSuccess,
      },
      // signal_timestamp is required for rl-status hourly/daily/weekly window queries.
      // created_at alone is not sufficient — rl-status filters by signal_timestamp.
      signal_timestamp: now,
      created_at: now,
    });
  } catch (err) {
    logger.warn("[agent-rl] cross_domain_signals insert failed:", err);
  }
}

// ── Recent Quality Patterns ────────────────────────────────────────────────

/**
 * Returns recent quality patterns for brain context injection.
 * Called by getBrainContext() to inform every LLM decision with RL history.
 *
 * Uses the actual prediction_records schema:
 *   - "confidence" column (not "quality_score" — that column does not exist)
 *   - "domain" column (not "task_type" — that column is on agent_queue)
 */
export async function getRecentQualityPatterns(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ avgQuality: number; topPatterns: string[]; sampleSize: number }> {
  try {
    const { data } = await supabase
      .from("prediction_records")
      .select("confidence, domain, metadata")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data || data.length === 0) {
      return { avgQuality: 0, topPatterns: [], sampleSize: 0 };
    }

    const avgQuality =
      data.reduce((sum, r) => sum + (typeof r.confidence === "number" ? r.confidence : 0), 0) /
      data.length;

    // Extract patterns from high-quality (>= 0.75) responses using domain as the pattern key
    const highQuality = data.filter(r => (typeof r.confidence === "number" ? r.confidence : 0) >= 0.75);
    const patternMap = new Map<string, number>();
    for (const r of highQuality) {
      const key = (r.domain as string | null) ?? "general";
      patternMap.set(key, (patternMap.get(key) ?? 0) + 1);
    }
    const topPatterns = [...patternMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pattern]) => pattern);

    return { avgQuality, topPatterns, sampleSize: data.length };
  } catch {
    return { avgQuality: 0, topPatterns: [], sampleSize: 0 };
  }
}

// ── Learning Stats ─────────────────────────────────────────────────────────

/**
 * Aggregate learning statistics for an organisation across all agent tasks.
 * Returns null on failure (caller should handle gracefully).
 */
export async function getLearningStats(
  supabase: SupabaseClient,
  organizationId: string
): Promise<LearningStats | null> {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // All agent task outcomes for this org
    const { data: records } = await supabase
      .from("prediction_records")
      .select("domain, confidence, was_correct, created_at")
      .eq("organization_id", organizationId)
      .eq("prediction_type", "agent_task_outcome")
      .order("created_at", { ascending: false })
      .limit(500);

    const all = records ?? [];
    const totalTasks = all.length;

    // Quality metrics
    const successCount = all.filter(r => r.was_correct === true).length;
    const successRate = totalTasks > 0 ? successCount / totalTasks : 0;
    const avgQuality =
      totalTasks > 0
        ? all.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / totalTasks
        : 0;

    // Top domain by execution count
    const domainCounts: Record<string, number> = {};
    for (const r of all) {
      domainCounts[r.domain] = (domainCounts[r.domain] ?? 0) + 1;
    }
    const topDomain =
      Object.keys(domainCounts).sort((a, b) => domainCounts[b] - domainCounts[a])[0] ?? null;

    // Learning velocity: tasks in last 24h
    const learningVelocity = all.filter(r => r.created_at >= since24h).length;

    // Pending feedback
    const { count: pendingFeedback } = await supabase
      .from("brain_feedback_queue")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending");

    // Recent helpful / not_helpful (7d)
    const { data: recentFeedback } = await supabase
      .from("copilot_response_feedback")
      .select("rating")
      .eq("organization_id", organizationId)
      .gte("created_at", since7d);

    const fb = recentFeedback ?? [];
    const helpfulFeedback = fb.filter(f => f.rating === "helpful").length;
    const notHelpfulFeedback = fb.filter(f => f.rating === "not_helpful").length;

    return {
      totalTasks,
      successRate: Math.round(successRate * 100) / 100,
      avgQuality: Math.round(avgQuality * 100) / 100,
      topDomain,
      learningVelocity,
      pendingFeedback: pendingFeedback ?? 0,
      helpfulFeedback,
      notHelpfulFeedback,
    };
  } catch (err) {
    logger.warn("[agent-rl] getLearningStats failed:", err);
    return null;
  }
}
