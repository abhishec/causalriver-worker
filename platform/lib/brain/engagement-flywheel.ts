/**
 * Engagement Data Flywheel
 * ========================
 * Every engagement milestone deposits structured outcome data — the primary moat.
 *
 * Called from:
 * - domain-executor.ts (Step 8) after every delivery intelligence domain execution
 * - Future: engagement lifecycle hooks (start, sprint complete, close)
 *
 * The flywheel compounds over time:
 * 500 engagements → benchmark data → "here's what healthy delivery looks like"
 * That dataset is impossible to replicate without running the product.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export type MilestoneType =
  | "engagement_start"
  | "sprint_complete"
  | "flight_risk_detected"
  | "scope_creep_alert"
  | "pod_matched"
  | "engagement_complete";

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
  qualityScores?: Record<string, number>;
  outcomeLabel?: "successful_delivery" | "at_risk" | "churned" | "on_track";
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
      quality_scores: milestone.qualityScores ?? {},
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

/**
 * Convenience helper: deposit after a delivery intelligence domain execution completes.
 * Maps domain type → milestone type. Non-delivery domains are silently skipped.
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
    qualityScores: { [params.domainType]: params.qualityScore },
    flightRiskCount,
    scopeCreepDetected,
    podName,
  });
}
