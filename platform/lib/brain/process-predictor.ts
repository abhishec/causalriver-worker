/**
 * Process Predictor — Predictive Escalation Intelligence
 * =======================================================
 *
 * Predicts failure risk at each FSM state transition BEFORE the state executes,
 * using historical RL signals from cross_domain_signals and service_health.
 *
 * Called at the START of each FSM state in domain-executor.ts (pre-execution hook).
 * Returns a risk assessment that the FSM uses to pre-emptively escalate or
 * adjust execution parameters.
 *
 * Prediction algorithm:
 *   1. Load state-level fail rates from service_health (process-engine summary)
 *   2. Look up the current processType + state combo
 *   3. If failRate > HIGH_RISK_THRESHOLD (0.7): recommend immediate escalation
 *   4. If failRate > MEDIUM_RISK_THRESHOLD (0.4): recommend extra caution (longer timeout)
 *   5. Low risk: proceed normally
 *
 * Risk factors also include:
 *   - Recent failure streak: last 3 executions of this template all failed → +0.3 risk
 *   - Process age: template evolution_generation = 0 AND usage_count < 5 → +0.2 risk (new template)
 *   - Time of day: execution during weekend/night → +0.1 risk (less human oversight)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

const HIGH_RISK_THRESHOLD = 0.7;
const MEDIUM_RISK_THRESHOLD = 0.4;

/**
 * Module-level risk profile cache: 30s TTL per org.
 * Same pattern as _crossOrgPatternsCache in brain-context.ts.
 * Avoids hitting service_health + process_templates on every state transition.
 */
const _orgRiskProfileCache = new Map<
  string,
  { data: Record<string, number>; expiry: number }
>();
const ORG_RISK_PROFILE_TTL_MS = 30_000; // 30 seconds

/**
 * Per-(org, processType) cache for recent failure streak and template age.
 * These are the two additional DB queries fired by predictStateRisk() on every
 * FSM state transition.  They change slowly (at most once per process run),
 * so a 60s TTL is safe and eliminates the per-state hot-path overhead.
 */
interface PredictorAuxCache {
  recentFailStreak: number;
  isNewTemplate: boolean;
  expiry: number;
}
const _predictorAuxCache = new Map<string, PredictorAuxCache>();
const PREDICTOR_AUX_TTL_MS = 60_000; // 60 seconds

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PredictionResult {
  processType: string;
  state: string;
  riskLevel: "low" | "medium" | "high";
  riskScore: number;           // 0–1
  failRateHistorical: number;  // from service_health statePatterns
  recommendation: "proceed" | "caution" | "escalate";
  reasoning: string;           // human-readable, surfaced in brain context
}

export interface PredictorParams {
  supabase: SupabaseClient;
  orgId: string;
  processType: string;
  currentState: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when the current time is off-hours:
 * weekends (Sat/Sun) or nights (00:00–06:59 UTC).
 * Less human oversight during these windows increases risk.
 */
function isOffHours(): boolean {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sun, 6 = Sat
  const hourUTC = now.getUTCHours();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isNight = hourUTC < 7; // 00:00–06:59 UTC
  return isWeekend || isNight;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function riskLevelFromScore(score: number): "low" | "medium" | "high" {
  if (score > HIGH_RISK_THRESHOLD) return "high";
  if (score > MEDIUM_RISK_THRESHOLD) return "medium";
  return "low";
}

function recommendationFromLevel(level: "low" | "medium" | "high"): "proceed" | "caution" | "escalate" {
  if (level === "high") return "escalate";
  if (level === "medium") return "caution";
  return "proceed";
}

// ── State Pattern Loader ──────────────────────────────────────────────────────

/**
 * Load statePatterns from service_health for this org's process-engine service.
 * Returns a Record<"processType.state", failRate> built from the JSONB summary.
 * Returns empty map on failure (non-fatal).
 */
async function loadStatePatterns(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, number>> {
  try {
    // service_health table is not yet in generated Supabase types (migration pending).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase as any).from("service_health")
      .select("summary, updated_at")
      .eq("organization_id", orgId)
      .eq("service_type", "process-engine")
      .maybeSingle();

    const row = result.data as {
      summary: {
        statePatterns?: Array<{
          processType: string;
          state: string;
          failRate: number;
          sampleSize: number;
        }>;
      } | null;
      updated_at: string;
    } | null;

    if (!row?.summary?.statePatterns) return {};

    const patterns: Record<string, number> = {};
    for (const p of row.summary.statePatterns) {
      if (typeof p.processType === "string" && typeof p.state === "string" && typeof p.failRate === "number") {
        patterns[`${p.processType}.${p.state}`] = p.failRate;
      }
    }
    return patterns;
  } catch {
    return {};
  }
}

// ── Main Export: predictStateRisk ─────────────────────────────────────────────

/**
 * Predict failure risk for a specific processType + FSM state combo.
 *
 * Algorithm:
 *   1. Load historical fail rates from service_health statePatterns (written by process-jobs cron)
 *   2. Look up the current processType.state key
 *   3. Load last 5 bpaas_process_instances for recent failure streak detection
 *   4. Load process_templates for new-template risk (evolution_generation = 0, usage_count < 5)
 *   5. Compute composite risk score and return PredictionResult
 *
 * Non-fatal: if any sub-query fails, proceeds with conservative defaults.
 * Never throws — caller must never be blocked by predictor failure.
 */
export async function predictStateRisk(
  params: PredictorParams
): Promise<PredictionResult> {
  const { supabase, orgId, processType, currentState } = params;

  // Conservative defaults when data is unavailable
  const defaultResult: PredictionResult = {
    processType,
    state: currentState,
    riskLevel: "low",
    riskScore: 0,
    failRateHistorical: 0,
    recommendation: "proceed",
    reasoning: "No historical data available — proceeding with default low risk.",
  };

  try {
    // ── 1. Load historical fail rate from service_health ──────────────────────
    const statePatterns = await loadStatePatterns(supabase, orgId);
    const patternKey = `${processType}.${currentState}`;
    const historicalFailRate = statePatterns[patternKey] ?? 0;

    // ── 2. Load recent failure streak + template age (cached per org+processType) ──
    // These two queries fired on every FSM state transition (several times per
    // process run). They change at most once per process run, so a 60s cache
    // eliminates hot-path overhead without meaningfully reducing freshness.
    const auxCacheKey = `${orgId}:${processType}`;
    const cachedAux = _predictorAuxCache.get(auxCacheKey);

    let recentFailStreak: number;
    let isNewTemplate: boolean;

    if (cachedAux && Date.now() < cachedAux.expiry) {
      recentFailStreak = cachedAux.recentFailStreak;
      isNewTemplate = cachedAux.isNewTemplate;
    } else {
      recentFailStreak = 0;
      isNewTemplate = false;

      // ── 2a. Recent failure streak ─────────────────────────────────────────
      try {
        const { data: recentInstances } = await supabase
          .from("bpaas_process_instances")
          .select("status, created_at")
          .eq("organization_id", orgId)
          .eq("process_type", processType)
          .order("created_at", { ascending: false })
          .limit(5);

        if (recentInstances && recentInstances.length >= 3) {
          const last3 = (recentInstances as Array<{ status: string }>).slice(0, 3);
          const allFailed = last3.every(
            (inst) => inst.status === "failed" || inst.status === "escalated"
          );
          if (allFailed) recentFailStreak = 3;
        }
      } catch {
        // Non-fatal — skip streak detection
      }

      // ── 2b. Template age risk ─────────────────────────────────────────────
      try {
        const { data: templateRow } = await supabase
          .from("process_templates")
          .select("evolution_generation, usage_count")
          .eq("organization_id", orgId)
          .eq("process_type", processType)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (templateRow) {
          const row = templateRow as { evolution_generation: number | null; usage_count: number | null };
          const generation = row.evolution_generation ?? 0;
          const usageCount = row.usage_count ?? 0;
          isNewTemplate = generation === 0 && usageCount < 5;
        }
      } catch {
        // Non-fatal — skip template age risk
      }

      // Write aux results to cache
      _predictorAuxCache.set(auxCacheKey, {
        recentFailStreak,
        isNewTemplate,
        expiry: Date.now() + PREDICTOR_AUX_TTL_MS,
      });
    }

    // ── 4. Compute composite risk score ───────────────────────────────────────
    let riskScore = historicalFailRate;
    riskScore += recentFailStreak >= 3 ? 0.3 : 0;
    riskScore += isNewTemplate ? 0.2 : 0;
    riskScore += isOffHours() ? 0.1 : 0;
    riskScore = clamp(riskScore, 0, 1);

    // ── 5. Map score → level → recommendation → reasoning ────────────────────
    const riskLevel = riskLevelFromScore(riskScore);
    const recommendation = recommendationFromLevel(riskLevel);

    const reasoningParts: string[] = [];
    if (historicalFailRate > 0) {
      reasoningParts.push(`Historical fail rate: ${Math.round(historicalFailRate * 100)}%`);
    }
    if (recentFailStreak >= 3) {
      reasoningParts.push("Recent failure streak: last 3 executions failed (+30%)");
    }
    if (isNewTemplate) {
      reasoningParts.push("New template (generation=0, usage<5) (+20%)");
    }
    if (isOffHours()) {
      reasoningParts.push("Off-hours execution (weekend/night, less human oversight) (+10%)");
    }
    if (reasoningParts.length === 0) {
      reasoningParts.push("No risk factors detected");
    }

    const reasoning = `${processType}.${currentState}: risk=${Math.round(riskScore * 100)}% (${riskLevel}). ${reasoningParts.join("; ")}.`;

    return {
      processType,
      state: currentState,
      riskLevel,
      riskScore: Math.round(riskScore * 100) / 100,
      failRateHistorical: Math.round(historicalFailRate * 100) / 100,
      recommendation,
      reasoning,
    };
  } catch (err) {
    logger.warn("[ProcessPredictor] predictStateRisk failed (non-fatal)", {
      processType,
      currentState,
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return defaultResult;
  }
}

// ── getOrgRiskProfile ─────────────────────────────────────────────────────────

/**
 * Returns a map of "processType.state" → riskScore for all known state patterns
 * in the org's process-engine service_health summary.
 *
 * Used by brain-context.ts L28e to surface top high-risk states in the context summary.
 *
 * Risk score per pattern = historicalFailRate only (no streak/template adjustments,
 * since this is a portfolio view, not a per-execution prediction).
 *
 * Results are cached per orgId with a 30s TTL to avoid hammering service_health
 * on every brain context assembly.
 */
export async function getOrgRiskProfile(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, number>> {
  // Check module-level cache
  const cached = _orgRiskProfileCache.get(orgId);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  try {
    const patterns = await loadStatePatterns(supabase, orgId);

    // Augment with off-hours risk factor for a richer portfolio view
    const offHours = isOffHours();
    const riskProfile: Record<string, number> = {};
    for (const [key, failRate] of Object.entries(patterns)) {
      let score = failRate;
      if (offHours) score += 0.1;
      riskProfile[key] = clamp(Math.round(score * 100) / 100, 0, 1);
    }

    // Store in cache
    _orgRiskProfileCache.set(orgId, {
      data: riskProfile,
      expiry: Date.now() + ORG_RISK_PROFILE_TTL_MS,
    });

    return riskProfile;
  } catch (err) {
    logger.warn("[ProcessPredictor] getOrgRiskProfile failed (non-fatal)", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Cache empty result to prevent thundering herd on repeated failures
    _orgRiskProfileCache.set(orgId, { data: {}, expiry: Date.now() + ORG_RISK_PROFILE_TTL_MS });
    return {};
  }
}
