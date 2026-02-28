/**
 * RL Outcome Recorder
 * ====================
 *
 * Central hub for recording SE-aaS job outcomes into the RL closed-loop.
 *
 * Responsibilities:
 *  1. Write outcome to brain_agent_tasks (status, quality, duration, artifact generated)
 *  2. Emit prediction_records + cross_domain_signals via recordAgentOutcome()
 *  3. Update brain_evolution_snapshots accuracy for the org's today-snapshot
 *  4. Aggregate per-domain success rates for classifier routing improvement
 *
 * All writes are fire-and-forget: callers wrap in .catch(() => {}) so a DB
 * hiccup NEVER breaks the domain response returned to the user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { recordAgentOutcome, computeAgentQuality, extractStructuredMemory } from "@/lib/brain/agent-rl";

// ── Types ──────────────────────────────────────────────────────────────────

export interface JobOutcomeParams {
  /** Unique identifier for this job execution (used as agent_id in RL tables) */
  jobId: string;
  /** SE-aaS domain that ran (e.g. "pod-match", "early-warning") */
  domain: string;
  /** Organization that owns the job */
  organizationId: string;
  /** User who triggered the job */
  userId: string;
  /** Stringified task description / request payload (first 200 chars) */
  taskDescription: string;
  /** Stringified result (first 500 chars) */
  resultSummary: string;
  /** Pre-computed quality 0–1, or null to auto-compute from resultSummary */
  quality?: number;
  /** Total execution time in milliseconds */
  executionMs: number;
  /** Whether a persistent artifact was generated */
  artifactGenerated: boolean;
  /** Artifact ID if generated */
  artifactId?: string | null;
  /**
   * Optional: AI worker UUID from ai_workers table (ADR-020).
   * When provided, written to RL tables to enable per-worker threshold adaptation.
   */
  aiWorkerId?: string;
}

export interface DomainRLStats {
  domain: string;
  totalOutcomes: number;
  successCount: number;
  successRate: number;     // 0–1
  avgQuality: number;      // 0–1
  avgDurationMs: number;
  lastOutcomeAt: string | null;
}

export interface OrgRLSummary {
  organizationId: string;
  totalOutcomes: number;
  overallSuccessRate: number;
  overallAvgQuality: number;
  byDomain: DomainRLStats[];
  recentOutcomes: Array<{
    domain: string;
    quality: number;
    wasSuccess: boolean;
    executionMs: number;
    createdAt: string;
  }>;
  updatedAt: string;
}

// ── Core: Record a completed job outcome ───────────────────────────────────

/**
 * Record a SE-aaS job outcome into the RL closed-loop.
 *
 * Writes to:
 *  - brain_agent_tasks (upsert by jobId as prompt+agent_type key)
 *  - prediction_records + cross_domain_signals (via recordAgentOutcome)
 *  - brain_evolution_snapshots today-row (accuracy update)
 *
 * Safe to fire-and-forget: swallows all errors with logger.warn.
 */
export async function recordJobOutcome(
  supabase: SupabaseClient,
  params: JobOutcomeParams
): Promise<void> {
  const quality =
    params.quality ??
    computeAgentQuality(params.resultSummary, null, params.executionMs);

  const wasSuccess = quality >= 0.7;

  // ── 1. Write to brain_agent_tasks ─────────────────────────────────────
  try {
    await supabase.from("brain_agent_tasks").insert({
      organization_id: params.organizationId,
      created_by: params.userId,
      prompt: params.taskDescription.slice(0, 500),
      agent_type: params.domain,
      status: wasSuccess ? "completed" : "failed",
      confidence_score: quality,
      result_summary: params.resultSummary.slice(0, 1000),
      result_artifacts: params.artifactId
        ? [{ id: params.artifactId, type: "se_aas_artifact", domain: params.domain }]
        : [],
      result_metadata: {
        jobId: params.jobId,
        executionMs: params.executionMs,
        artifactGenerated: params.artifactGenerated,
        artifactId: params.artifactId ?? null,
        quality,
        wasSuccess,
      },
      started_at: new Date(Date.now() - params.executionMs).toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("[outcome-recorder] brain_agent_tasks insert failed:", err);
  }

  // ── 2. Emit RL signals: prediction_records + cross_domain_signals ─────
  await recordAgentOutcome(supabase, {
    agentId: params.jobId,
    domain: params.domain,
    taskDescription: params.taskDescription,
    resultSummary: params.resultSummary,
    quality,
    executionMs: params.executionMs,
    organizationId: params.organizationId,
    userId: params.userId,
    aiWorkerId: params.aiWorkerId ?? undefined,
  });

  // ── 2b. Mem0-style structured memory extraction ────────────────────────
  // Fire-and-forget: calls Haiku to extract what worked/failed/pattern.
  // MUST NOT block the job result — wrap in void + catch.
  void extractStructuredMemory(supabase, {
    organizationId: params.organizationId,
    domain: params.domain,
    inputQuery: params.taskDescription,
    resultSummary: params.resultSummary,
    quality,
  }).catch(() => { /* non-fatal */ });

  // ── 3. Update brain_evolution_snapshots today-row ─────────────────────
  // We upsert the today snapshot and update accuracy as a rolling average.
  // accuracy = (existing_accuracy * (total_predictions - 1) + new_quality) / total_predictions
  // We use a simple DB-side upsert with incremental update to avoid race conditions.
  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Fetch the existing snapshot for today
    const { data: existing } = await supabase
      .from("brain_evolution_snapshots")
      .select("accuracy, total_predictions")
      .eq("organization_id", params.organizationId)
      .eq("snapshot_date", today)
      .maybeSingle();

    if (existing) {
      // Rolling average update
      const prevTotal = existing.total_predictions ?? 0;
      const prevAccuracy = existing.accuracy ?? 0.5;
      const newTotal = prevTotal + 1;
      const newAccuracy =
        newTotal > 1
          ? (prevAccuracy * prevTotal + quality) / newTotal
          : quality;

      await supabase
        .from("brain_evolution_snapshots")
        .update({
          accuracy: Math.round(newAccuracy * 10000) / 10000,
          total_predictions: newTotal,
        })
        .eq("organization_id", params.organizationId)
        .eq("snapshot_date", today);
    } else {
      // Create today's snapshot row
      await supabase.from("brain_evolution_snapshots").insert({
        organization_id: params.organizationId,
        snapshot_date: today,
        accuracy: quality,
        total_predictions: 1,
        intelligence_score: quality * 100,
        learning_velocity_score: quality,
      });
    }
  } catch (err) {
    logger.warn("[outcome-recorder] brain_evolution_snapshots update failed:", err);
  }
}

// ── Per-domain RL stats aggregation ───────────────────────────────────────

/**
 * Compute per-domain RL statistics for an organization.
 *
 * Reads from prediction_records (agent_task_outcome type).
 * Returns domain-level success rates + recent outcomes.
 * Returns null on failure — callers should handle gracefully.
 */
export async function getOrgRLSummary(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackDays = 30
): Promise<OrgRLSummary | null> {
  try {
    const since = new Date(
      Date.now() - lookbackDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: records, error } = await supabase
      .from("prediction_records")
      .select("domain, confidence, was_correct, created_at")
      .eq("organization_id", organizationId)
      .eq("prediction_type", "agent_task_outcome")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      logger.warn("[outcome-recorder] prediction_records fetch failed:", error.message);
      return null;
    }

    const all = records ?? [];

    if (all.length === 0) {
      return {
        organizationId,
        totalOutcomes: 0,
        overallSuccessRate: 0,
        overallAvgQuality: 0,
        byDomain: [],
        recentOutcomes: [],
        updatedAt: new Date().toISOString(),
      };
    }

    // Aggregate by domain
    const domainMap: Record<
      string,
      { total: number; success: number; qualitySum: number; durationSum: number; lastAt: string }
    > = {};

    for (const r of all) {
      const d = r.domain ?? "unknown";
      if (!domainMap[d]) {
        domainMap[d] = { total: 0, success: 0, qualitySum: 0, durationSum: 0, lastAt: r.created_at };
      }
      domainMap[d].total++;
      if (r.was_correct === true) domainMap[d].success++;
      domainMap[d].qualitySum += r.confidence ?? 0;
      // created_at is a proxy for lastAt
      if (r.created_at > domainMap[d].lastAt) domainMap[d].lastAt = r.created_at;
    }

    const byDomain: DomainRLStats[] = Object.entries(domainMap)
      .map(([domain, stats]) => ({
        domain,
        totalOutcomes: stats.total,
        successCount: stats.success,
        successRate: Math.round((stats.success / stats.total) * 100) / 100,
        avgQuality: Math.round((stats.qualitySum / stats.total) * 100) / 100,
        avgDurationMs: 0, // not stored in prediction_records, omit
        lastOutcomeAt: stats.lastAt,
      }))
      .sort((a, b) => b.totalOutcomes - a.totalOutcomes);

    // Overall metrics
    const totalOutcomes = all.length;
    const successCount = all.filter((r) => r.was_correct === true).length;
    const overallSuccessRate = Math.round((successCount / totalOutcomes) * 100) / 100;
    const overallAvgQuality =
      Math.round((all.reduce((s, r) => s + (r.confidence ?? 0), 0) / totalOutcomes) * 100) / 100;

    // Recent 10 outcomes
    const recentOutcomes = all.slice(0, 10).map((r) => ({
      domain: r.domain ?? "unknown",
      quality: r.confidence ?? 0,
      wasSuccess: r.was_correct === true,
      executionMs: 0, // not stored in prediction_records
      createdAt: r.created_at,
    }));

    return {
      organizationId,
      totalOutcomes,
      overallSuccessRate,
      overallAvgQuality,
      byDomain,
      recentOutcomes,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn("[outcome-recorder] getOrgRLSummary failed:", err);
    return null;
  }
}
