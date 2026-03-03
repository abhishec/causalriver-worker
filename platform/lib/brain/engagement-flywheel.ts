/**
 * Brain Training Flywheel (ADR-025)
 * ==================================
 * Every AI Worker execution deposits structured outcome data — the primary moat.
 *
 * Called from:
 * - ALL domain executors (SE-aaS, AaaS, PM-aaS, Process Engine) via recordBrainLearning()
 * - overnight-executor.ts (code-agent jobs) via recordBrainLearning()
 * - Future: any new execution path that produces quality-scored output
 *
 * The flywheel compounds over time:
 * 500 executions → benchmark data → "here's what good AI worker output looks like"
 * That dataset is impossible to replicate without running the product.
 *
 * Generic by design: NO service-specific whitelists. Any domain contributes.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export type MilestoneType =
  | "engagement_start"
  | "sprint_complete"
  | "flight_risk_detected"
  | "scope_creep_alert"
  | "pod_matched"
  | "engagement_complete"
  // ADR-025: Dynamic domain-derived types (e.g., "code_agent_complete", "bookkeeper_complete")
  // Any string is valid — new domains generate milestone types automatically.
  | (string & {});

export type EngagementMilestone = {
  organizationId: string;
  engagementId?: string;
  milestoneType: MilestoneType;
  milestoneData: Record<string, unknown>;
  teamComposition?: { size?: number; roles?: string[]; techStack?: string[] };
  velocityPattern?: {
    avgVelocity?: number;
    trend?: "improving" | "declining" | "stable";
  };
  healthScore?: number;
  flightRiskCount?: number;
  scopeCreepDetected?: boolean;
  podName?: string;
  domainSequence?: string[];
  confidence?: number;
  outcomeLabel?: "successful_delivery" | "at_risk" | "churned" | "on_track" | "success" | "partial" | "failed";
};

/**
 * Deposit a structured milestone record into engagement_outcomes.
 * Fire-and-forget safe — caller should use void and never await in hot paths.
 */
export async function depositEngagementMilestone(
  supabase: SupabaseClient,
  milestone: EngagementMilestone
): Promise<void> {
  try {
    const { error } = await supabase.from("engagement_outcomes").insert({
      organization_id: milestone.organizationId,
      engagement_id: milestone.engagementId ?? null,
      milestone_type: milestone.milestoneType,
      milestone_data: milestone.milestoneData,
      team_composition: milestone.teamComposition ?? null,
      velocity_pattern: milestone.velocityPattern ?? null,
      health_score: milestone.healthScore ?? null,
      flight_risk_count: milestone.flightRiskCount ?? 0,
      scope_creep_detected: milestone.scopeCreepDetected ?? false,
      pod_name: milestone.podName ?? null,
      domain_sequence: milestone.domainSequence ?? [],
      confidence: milestone.confidence ?? 0,
      outcome_label: milestone.outcomeLabel ?? null,
    });

    if (error) {
      logger.warn("[DataFlywheel] Insert error", {
        code: error.code,
        message: error.message,
        orgId: milestone.organizationId,
        type: milestone.milestoneType,
      });
      return;
    }

    logger.warn("[DataFlywheel] Milestone deposited", {
      orgId: milestone.organizationId,
      type: milestone.milestoneType,
    });
  } catch (err) {
    logger.warn("[DataFlywheel] Failed to deposit milestone", { err });
  }
}

// ── Generic Brain Training (ADR-025) ──────────────────────────────────────────

/**
 * Record a brain learning outcome for ANY domain execution.
 *
 * This is the generic replacement for depositDomainExecutionOutcome(). It works
 * for ALL AI Worker execution types — SE-aaS, AaaS, PM-aaS, Process Engine,
 * overnight agents, and any future execution path.
 *
 * NO whitelist. Every domain contributes to the brain's learning flywheel.
 *
 * Milestone type is derived dynamically from the domain name:
 *   "pod-match" → "pod_match_complete"
 *   "code-agent" → "code_agent_complete"
 *   "brain-bookkeeper" → "brain_bookkeeper_complete"
 *
 * Fire-and-forget safe — callers should use `void` and never await in hot paths.
 */
export async function recordBrainLearning(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    aiWorkerId?: string;
    domain: string;
    taskDescription: string;
    qualityScore: number;
    executionMs: number;
    result: unknown;
    outcomeLabel?: "success" | "partial" | "failed";
  }
): Promise<void> {
  try {
    // Derive milestone type from domain: "pod-match" → "pod_match_complete"
    const milestoneType = params.domain.replace(/-/g, "_").replace(/\./g, "_") + "_complete";

    // Derive outcome label from quality if not provided
    const outcomeLabel: EngagementMilestone["outcomeLabel"] = params.outcomeLabel
      ?? (params.qualityScore >= 0.7 ? "success" : params.qualityScore >= 0.4 ? "partial" : "failed");

    // Serialize result summary (max 500 chars for milestone_data)
    let resultSummary: string;
    try {
      const full = JSON.stringify(params.result);
      resultSummary = full.length > 500 ? full.slice(0, 497) + "..." : full;
    } catch {
      resultSummary = String(params.result);
    }

    await depositEngagementMilestone(supabase, {
      organizationId: params.organizationId,
      milestoneType,
      milestoneData: {
        domain: params.domain,
        taskDescription: params.taskDescription.slice(0, 200),
        qualityScore: params.qualityScore,
        executionMs: params.executionMs,
        aiWorkerId: params.aiWorkerId,
        resultSummary,
      },
      domainSequence: [params.domain],
      confidence: params.qualityScore,
      outcomeLabel,
    });
  } catch (err) {
    logger.warn("[BrainTraining] recordBrainLearning failed (non-fatal)", {
      domain: params.domain,
      orgId: params.organizationId,
      err: String(err),
    });
  }
}

// ── Legacy SE-aaS Specific Deposit (deprecated) ──────────────────────────────

/**
 * @deprecated Use recordBrainLearning() instead. This function is SE-aaS specific
 * and only deposits for 3 hardcoded domains. Kept for backward compatibility.
 */
export async function depositDomainExecutionOutcome(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    engagementId?: string;
    domainType: string;
    qualityScore: number;
    result: unknown;
  }
): Promise<void> {
  const milestoneTypeMap: Record<string, MilestoneType> = {
    "pod-match": "pod_matched",
    "early-warning": "flight_risk_detected",
    "scope-creep": "scope_creep_alert",
  };

  const milestoneType = milestoneTypeMap[params.domainType];
  if (!milestoneType) return; // Only deposit for key delivery domains

  // Extract structured signals from result for richer flywheel data
  const resultObj = params.result as Record<string, unknown> | null;
  const resultData = (resultObj?.data as Record<string, unknown>) ?? {};

  const flightRiskScore =
    typeof resultData.flight_risk_score === "number"
      ? resultData.flight_risk_score
      : undefined;
  const flightRiskCount =
    typeof flightRiskScore === "number" && flightRiskScore > 0.5 ? 1 : 0;

  const scopeCreepDetected =
    params.domainType === "scope-creep" &&
    Array.isArray(resultData.alerts) &&
    (resultData.alerts as unknown[]).length > 0;

  const podName =
    params.domainType === "pod-match"
      ? (resultData.top_recommendation as string | undefined) ??
        (resultData.recommended_pod_name as string | undefined)
      : undefined;

  await depositEngagementMilestone(supabase, {
    organizationId: params.organizationId,
    engagementId: params.engagementId,
    milestoneType,
    milestoneData: {
      domainType: params.domainType,
      quality: params.qualityScore,
    },
    domainSequence: [params.domainType],
    confidence: params.qualityScore,
    flightRiskCount,
    scopeCreepDetected,
    podName,
  });
}
