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
 * Fast, synchronous — no DB calls needed.
 */
export function computeAgentQuality(
  result: string,
  error: Error | null,
  executionMs: number
): number {
  if (error) return 0;
  if (!result || result.length < 50) return 0.3;

  let score = 0.8;

  // Penalise very slow execution (> 30s suggests something went wrong)
  if (executionMs > 30_000) score *= 0.85;

  // Bonus: result contains structured data (JSON, numbers, table markers)
  const hasStructure = /\{|\[|\d{2,}|\|/.test(result);
  if (hasStructure) score = Math.min(1, score + 0.15);

  // Penalty: result is an error message
  if (/"error"/.test(result.toLowerCase()) && result.length < 200) score *= 0.5;

  return Math.round(score * 100) / 100;
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
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("[agent-rl] cross_domain_signals insert failed:", err);
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
