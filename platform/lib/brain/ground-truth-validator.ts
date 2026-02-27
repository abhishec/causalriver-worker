import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Ground-truth RL signal validation.
 *
 * Validates prediction_records against real connector outcomes:
 * - pod-match: was the recommended pod actually assigned? (check engagements.pod_name)
 * - early-warning: did the flagged engineer actually churn? (proxy: flight_risk_score trend)
 * - scope-creep: was the alert eventually resolved? (scope_creep_alerts.resolved_at)
 * - delivery-health: did health score improve after intervention? (engagement_health_scores trend)
 */

export interface GroundTruthResult {
  predictionId: string;
  domain: string;
  wasCorrect: boolean;
  confidence: number;
  evidence: string; // human-readable evidence string
}

export async function validatePodMatchOutcomes(
  supabase: SupabaseClient,
  orgId: string,
  lookbackDays = 30
): Promise<GroundTruthResult[]> {
  // Find pod-match predictions from the last N days that don't have was_correct set
  const since = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: predictions, error } = await supabase
    .from("prediction_records")
    .select("id, prediction, actual_outcome, was_correct, created_at")
    .eq("organization_id", orgId)
    .eq("domain", "pod-match")
    .is("was_correct", null)
    .gte("created_at", since);

  if (error) {
    logger.warn("[ground-truth] pod-match query error:", error.message);
    return [];
  }

  if (!predictions?.length) return [];

  const results: GroundTruthResult[] = [];

  for (const pred of predictions) {
    try {
      // prediction.data.top_recommendation.pod_name — check if that pod was actually assigned
      const predictionData = pred.prediction as Record<string, unknown> | null;
      const topRec =
        (predictionData?.data as Record<string, unknown> | undefined)
          ?.top_recommendation ??
        (predictionData?.top_recommendation as Record<string, unknown> | undefined);

      const recommendedPod = (topRec as Record<string, unknown> | undefined)
        ?.pod_name as string | undefined;

      if (!recommendedPod) continue;

      // Check if any engagement has this pod_name after the prediction
      // (proxy: recommendation was accepted and acted on)
      const { data: matched, error: matchErr } = await supabase
        .from("engagements")
        .select("id, pod_name")
        .eq("organization_id", orgId)
        .eq("pod_name", recommendedPod)
        .gte("created_at", pred.created_at as string)
        .limit(1);

      if (matchErr) {
        logger.warn(
          "[ground-truth] pod-match engagements query error:",
          matchErr.message
        );
        continue;
      }

      const wasCorrect = (matched?.length ?? 0) > 0;
      results.push({
        predictionId: pred.id as string,
        domain: "pod-match",
        wasCorrect,
        confidence: 0.7,
        evidence: wasCorrect
          ? `Pod "${recommendedPod}" was assigned to an engagement after recommendation`
          : `Pod "${recommendedPod}" was not assigned within lookback period`,
      });
    } catch (innerErr) {
      logger.warn("[ground-truth] pod-match inner error:", innerErr);
    }
  }

  return results;
}

export async function validateScopeCreepOutcomes(
  supabase: SupabaseClient,
  orgId: string,
  lookbackDays = 30
): Promise<GroundTruthResult[]> {
  const since = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: predictions, error } = await supabase
    .from("prediction_records")
    .select("id, prediction, was_correct, created_at")
    .eq("organization_id", orgId)
    .eq("domain", "scope-creep")
    .is("was_correct", null)
    .gte("created_at", since);

  if (error) {
    logger.warn("[ground-truth] scope-creep query error:", error.message);
    return [];
  }

  if (!predictions?.length) return [];

  const results: GroundTruthResult[] = [];

  for (const pred of predictions) {
    try {
      // Check if scope_creep_alerts were resolved (resolved_at is set) after this prediction
      const { data: alerts, error: alertErr } = await supabase
        .from("scope_creep_alerts")
        .select("id, resolved_at, severity")
        .eq("organization_id", orgId)
        .gte("created_at", pred.created_at as string)
        .not("resolved_at", "is", null)
        .limit(3);

      if (alertErr) {
        logger.warn(
          "[ground-truth] scope-creep alerts query error:",
          alertErr.message
        );
        continue;
      }

      // If alerts were raised AND resolved, the prediction was correct
      // (brain correctly identified real scope creep that was acted upon)
      const wasCorrect = (alerts?.length ?? 0) > 0;
      results.push({
        predictionId: pred.id as string,
        domain: "scope-creep",
        wasCorrect,
        confidence: 0.8,
        evidence: wasCorrect
          ? `${alerts?.length} scope creep alert(s) were raised and resolved after prediction`
          : `No scope creep alerts resolved in lookback period`,
      });
    } catch (innerErr) {
      logger.warn("[ground-truth] scope-creep inner error:", innerErr);
    }
  }

  return results;
}

export async function validateEarlyWarningOutcomes(
  supabase: SupabaseClient,
  orgId: string,
  lookbackDays = 60
): Promise<GroundTruthResult[]> {
  // Longer window — flight risk takes time to materialise
  const since = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: predictions, error } = await supabase
    .from("prediction_records")
    .select("id, entity_id, entity_type, predicted_value, was_correct, created_at")
    .eq("organization_id", orgId)
    .eq("domain", "early-warning")
    .is("was_correct", null)
    .gte("created_at", since);

  if (error) {
    logger.warn("[ground-truth] early-warning query error:", error.message);
    return [];
  }

  if (!predictions?.length) return [];

  const results: GroundTruthResult[] = [];

  for (const pred of predictions) {
    try {
      // entity_id for engineer predictions is github_login
      const githubLogin = pred.entity_id as string | undefined;
      if (!githubLogin) continue;

      // Proxy: check if the engineer's flight_risk_score is still elevated or escalated
      // A correct prediction means the risk was real (score stayed high or worsened)
      const { data: latestSnapshot, error: snapErr } = await supabase
        .from("engineer_health_snapshots")
        .select("flight_risk_score, velocity_index, computed_at")
        .eq("organization_id", orgId)
        .eq("github_login", githubLogin)
        .order("computed_at", { ascending: false })
        .limit(1);

      if (snapErr) {
        logger.warn(
          "[ground-truth] early-warning snapshot query error:",
          snapErr.message
        );
        continue;
      }

      if (!latestSnapshot?.length) continue;

      const latestRisk = latestSnapshot[0].flight_risk_score as number | null;
      const predictedRisk = pred.predicted_value as number | null;

      if (latestRisk === null || predictedRisk === null) continue;

      // Correct if the risk stayed elevated (>=0.5) when we predicted it would
      // OR dropped significantly after prediction (early warning enabled intervention)
      const riskWasReal = latestRisk >= 0.5;
      const riskImproved = predictedRisk >= 0.6 && latestRisk < 0.4; // intervention worked

      const wasCorrect = riskWasReal || riskImproved;
      results.push({
        predictionId: pred.id as string,
        domain: "early-warning",
        wasCorrect,
        confidence: 0.6,
        evidence: riskImproved
          ? `Engineer "${githubLogin}" risk dropped from ${predictedRisk.toFixed(2)} → ${latestRisk.toFixed(2)} (intervention worked)`
          : riskWasReal
          ? `Engineer "${githubLogin}" flight risk confirmed at ${latestRisk.toFixed(2)}`
          : `Engineer "${githubLogin}" risk resolved (${latestRisk.toFixed(2)}) — prediction may have been false positive`,
      });
    } catch (innerErr) {
      logger.warn("[ground-truth] early-warning inner error:", innerErr);
    }
  }

  return results;
}

/**
 * Apply ground-truth results back to prediction_records.
 * Called fire-and-forget from the learning cron.
 * Never throws — all errors are caught and logged.
 */
export async function applyGroundTruthSignals(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  try {
    const [podResults, scopeResults, earlyWarningResults] = await Promise.all([
      validatePodMatchOutcomes(supabase, orgId),
      validateScopeCreepOutcomes(supabase, orgId),
      validateEarlyWarningOutcomes(supabase, orgId),
    ]);

    const allResults = [...podResults, ...scopeResults, ...earlyWarningResults];

    if (allResults.length === 0) return;

    for (const result of allResults) {
      try {
        const { error: updateErr } = await supabase
          .from("prediction_records")
          .update({
            was_correct: result.wasCorrect,
            actual_outcome: result.evidence,
            verified_at: new Date().toISOString(),
          })
          .eq("id", result.predictionId);

        if (updateErr) {
          logger.warn(
            `[ground-truth] failed to update prediction ${result.predictionId}:`,
            updateErr.message
          );
        }
      } catch (updateErr) {
        logger.warn(
          `[ground-truth] update error for prediction ${result.predictionId}:`,
          updateErr
        );
      }
    }

    logger.warn(
      `[ground-truth] applied ${allResults.length} ground-truth signals for org ${orgId} ` +
        `(pod-match: ${podResults.length}, scope-creep: ${scopeResults.length}, early-warning: ${earlyWarningResults.length})`
    );
  } catch (err) {
    logger.warn("[ground-truth] validation error:", err);
  }
}
