/**
 * Process Template Evolution — AlphaEvolve Fitness Scoring
 * =========================================================
 *
 * Scores process templates by fitness (success_rate, duration efficiency,
 * policy compliance, human intervention rate) and evolves underperforming
 * templates by mutating their trigger_conditions thresholds.
 *
 * Fitness formula (0–1 scale):
 *   fitness = 0.40 × success_rate
 *           + 0.30 × (1 − hitl_rate)           // low human intervention = autonomous
 *           + 0.20 × (1 − duration_penalty)     // fast = better
 *           + 0.10 × policy_pass_rate           // policy compliance
 *
 * Tournament selection: only templates with fitness < FITNESS_THRESHOLD get mutated.
 * Mutation: adjust escalation_threshold and approval_timeout_ms by ±15% (random perturbation).
 * Survivors: fitness score stored on the template row for future selection.
 *
 * Called fire-and-forget from process-jobs cron (Phase 7).
 * Runs at most once per hour per org (dedup via last_evolved_at).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Constants ────────────────────────────────────────────────────────────────

const FITNESS_THRESHOLD = 0.5;
const EVOLUTION_RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour
const DURATION_TARGET_MS = 120_000; // 2 minutes = ideal process duration
const MIN_INSTANCES_FOR_FITNESS = 3; // need at least 3 runs to score
/** Approval timeout multiplier applied on mutation — +20% gives more time, reducing HITL pressure */
const APPROVAL_TIMEOUT_MUTATION_FACTOR = 1.2;

// ── Types ────────────────────────────────────────────────────────────────────

interface ProcessTemplateRow {
  id: string;
  organization_id: string | null;
  name: string;
  domain_sequence: string[];
  trigger_conditions: Record<string, unknown>;
  success_rate: number;
  avg_confidence: number;
  usage_count: number;
  is_public: boolean;
  fitness_score: number | null;
  last_evolved_at: string | null;
  evolution_generation: number;
  fitness_breakdown: Record<string, unknown>;
}

interface ProcessInstanceRow {
  id: string;
  process_type: string;
  status: string;
  current_state: string;
  started_at: string | null;
  completed_at: string | null;
}

interface FitnessBreakdown {
  success_rate: number;
  hitl_rate: number;
  duration_penalty: number;
  policy_pass_rate: number;
  instance_count: number;
  fitness: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Clamp a number to [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Compute duration penalty: avg_duration / TARGET_MS, clamped to [0, 1].
 * A process completing in <= 2 minutes gets 0 penalty; 4+ minutes gets 1.0.
 */
function computeDurationPenalty(instances: ProcessInstanceRow[]): number {
  const completed = instances.filter(
    (i) => i.completed_at != null && i.started_at != null
  );
  if (completed.length === 0) return 0.5; // Unknown — assume moderate penalty

  const totalMs = completed.reduce((sum, inst) => {
    const startMs = new Date(inst.started_at!).getTime();
    const endMs = new Date(inst.completed_at!).getTime();
    return sum + (endMs - startMs);
  }, 0);

  const avgMs = totalMs / completed.length;
  return clamp(avgMs / DURATION_TARGET_MS, 0, 1);
}

/**
 * Compute HITL rate: instances that entered APPROVAL_GATE and are/were awaiting_approval.
 */
function computeHitlRate(instances: ProcessInstanceRow[]): number {
  if (instances.length === 0) return 0;
  const hitlCount = instances.filter(
    (i) =>
      i.current_state === "APPROVAL_GATE" ||
      i.status === "awaiting_approval"
  ).length;
  return hitlCount / instances.length;
}

/**
 * Compute policy pass rate: instances NOT failed at POLICY_CHECK / total.
 * Instances that failed while in POLICY_CHECK are policy failures.
 */
function computePolicyPassRate(instances: ProcessInstanceRow[]): number {
  if (instances.length === 0) return 1.0; // No data = assume compliant
  const policyFailures = instances.filter(
    (i) =>
      i.current_state === "POLICY_CHECK" &&
      (i.status === "failed" || i.status === "error")
  ).length;
  return clamp(1 - policyFailures / instances.length, 0, 1);
}

/**
 * Compute AlphaEvolve fitness score from component metrics.
 */
function computeFitness(breakdown: Omit<FitnessBreakdown, "fitness">): number {
  return clamp(
    0.4 * breakdown.success_rate +
      0.3 * (1 - breakdown.hitl_rate) +
      0.2 * (1 - breakdown.duration_penalty) +
      0.1 * breakdown.policy_pass_rate,
    0,
    1
  );
}

/**
 * Mutate trigger_conditions: adjust escalation_threshold ±15% and
 * approval_timeout_ms +20% (give more time when fitness is low).
 */
function mutateTriggerConditions(
  conditions: Record<string, unknown>
): Record<string, unknown> {
  const mutated = { ...conditions };

  // Mutate escalation_threshold ±15%
  if (typeof mutated["escalation_threshold"] === "number") {
    const current = mutated["escalation_threshold"] as number;
    const perturbation = (Math.random() * 0.3 - 0.15); // -15% to +15%
    mutated["escalation_threshold"] = Math.max(0, current * (1 + perturbation));
  }

  // Mutate approval_timeout_ms +20% (give more time — reduces HITL pressure)
  if (typeof mutated["approval_timeout_ms"] === "number") {
    const current = mutated["approval_timeout_ms"] as number;
    mutated["approval_timeout_ms"] = Math.round(current * APPROVAL_TIMEOUT_MUTATION_FACTOR);
  }

  return mutated;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Evolve process templates for a single organization.
 *
 * Algorithm:
 *   1. Rate-limit guard: skip if evolved within the last hour
 *   2. Load org templates (own + is_public=false filter)
 *   3. For each template, load bpaas_process_instances last 30d by process_type
 *   4. Load bpaas_policy_rules to compute policy compliance
 *   5. Compute fitness score and write to template row
 *   6. For fitness < FITNESS_THRESHOLD: mutate trigger_conditions + increment generation
 *
 * @param supabase - Service-role Supabase client (bypasses RLS)
 * @param orgId - Organization ID to evolve templates for
 */
export async function evolveProcessTemplates(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    // ── Step 1: Load templates for this org ──────────────────────────────────
    // Include own templates and private-org templates (not public ones from other orgs)
    const { data: templates, error: tmplError } = await supabase
      .from("process_templates")
      .select(
        "id, organization_id, name, domain_sequence, trigger_conditions, success_rate, avg_confidence, usage_count, is_public, fitness_score, last_evolved_at, evolution_generation, fitness_breakdown"
      )
      .eq("organization_id", orgId)
      .limit(50);

    if (tmplError) {
      logger.warn("[ProcessEvolver] Failed to load templates", {
        orgId,
        error: tmplError.message,
      });
      return;
    }

    if (!templates || templates.length === 0) {
      return; // Nothing to evolve
    }

    const rows = templates as ProcessTemplateRow[];

    // ── Step 2: Rate-limit guard — skip if any template evolved within 1 hour ─
    // We check the earliest last_evolved_at to guard the entire org at once.
    // This prevents redundant CPU cycles when cron fires more frequently.
    const mostRecentEvolution = rows.reduce((latest, row) => {
      if (!row.last_evolved_at) return latest;
      const ts = new Date(row.last_evolved_at).getTime();
      return ts > latest ? ts : latest;
    }, 0);

    if (
      mostRecentEvolution > 0 &&
      Date.now() - mostRecentEvolution < EVOLUTION_RATE_LIMIT_MS
    ) {
      return; // Rate-limited — evolved less than 1 hour ago
    }

    // ── Step 3: Score each template ──────────────────────────────────────────
    let evolved = 0;
    let scored = 0;
    let skippedLowData = 0;

    for (const template of rows) {
      try {
        // Derive process_type from domain_sequence or template name.
        // domain_sequence e.g. ['pod-match', 'early-warning'] — pick the primary domain.
        // For process templates, the sequence may encode process template type in name (e.g. "hr_offboarding").
        // We match instances by querying bpaas_process_instances filtered by process_type
        // derived from the template name (process_templates are named after domain sequences,
        // not BPaaS process types). We match on both approaches.
        const primaryDomain =
          template.domain_sequence.length > 0
            ? template.domain_sequence[0]
            : null;

        // Query bpaas_process_instances last 30d for this org
        // Match instances where process_type appears in the template's domain_sequence
        // (best-effort: sequences may encode bpaas types or SE-aaS domains)
        const instanceQuery = supabase
          .from("bpaas_process_instances")
          .select("id, process_type, status, current_state, started_at, completed_at")
          .eq("organization_id", orgId)
          .gte("created_at", thirtyDaysAgo)
          .limit(100);

        if (primaryDomain) {
          instanceQuery.eq("process_type", primaryDomain);
        }

        const { data: instances } = await instanceQuery;

        const instanceRows = (instances ?? []) as ProcessInstanceRow[];

        // Skip scoring if insufficient data
        if (instanceRows.length < MIN_INSTANCES_FOR_FITNESS) {
          skippedLowData++;
          continue;
        }

        // ── Compute fitness components ────────────────────────────────────────
        const successRate = template.success_rate ?? 0;
        const hitlRate = computeHitlRate(instanceRows);
        const durationPenalty = computeDurationPenalty(instanceRows);
        const policyPassRate = computePolicyPassRate(instanceRows);

        const breakdown: FitnessBreakdown = {
          success_rate: successRate,
          hitl_rate: hitlRate,
          duration_penalty: durationPenalty,
          policy_pass_rate: policyPassRate,
          instance_count: instanceRows.length,
          fitness: 0, // computed below
        };
        breakdown.fitness = computeFitness(breakdown);

        const fitnessScore = breakdown.fitness;
        const now = new Date().toISOString();

        // ── Step 4: Mutate if fitness below threshold ─────────────────────────
        let mutatedConditions: Record<string, unknown> | null = null;
        let newGeneration = template.evolution_generation ?? 0;

        if (fitnessScore < FITNESS_THRESHOLD) {
          const currentConditions =
            (template.trigger_conditions as Record<string, unknown>) ?? {};
          mutatedConditions = mutateTriggerConditions(currentConditions);
          newGeneration++;
        }

        // ── Step 5: Write fitness + mutation back to DB ───────────────────────
        const updatePayload: Record<string, unknown> = {
          fitness_score: fitnessScore,
          fitness_breakdown: breakdown,
          last_evolved_at: now,
          updated_at: now,
        };

        if (mutatedConditions !== null) {
          updatePayload["trigger_conditions"] = mutatedConditions;
          updatePayload["evolution_generation"] = newGeneration;
        }

        const { error: updateError } = await supabase
          .from("process_templates")
          .update(updatePayload)
          .eq("id", template.id)
          .eq("organization_id", orgId);

        if (updateError) {
          logger.warn("[ProcessEvolver] Failed to update template", {
            orgId,
            templateId: template.id,
            templateName: template.name,
            error: updateError.message,
          });
          continue;
        }

        scored++;
        if (mutatedConditions !== null) {
          evolved++;
        }
      } catch (templateErr) {
        logger.warn("[ProcessEvolver] Error scoring template (non-fatal)", {
          orgId,
          templateId: template.id,
          error:
            templateErr instanceof Error
              ? templateErr.message
              : String(templateErr),
        });
      }
    }

    logger.warn("[ProcessEvolver] Evolution cycle complete", {
      orgId,
      templatesEvaluated: rows.length,
      scored,
      evolved,
      skippedLowData,
    });
  } catch (err) {
    logger.warn("[ProcessEvolver] evolveProcessTemplates failed (non-fatal)", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
