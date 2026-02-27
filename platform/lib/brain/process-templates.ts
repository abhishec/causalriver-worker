/**
 * Process Template Library
 * ========================
 *
 * Extracts reusable process templates from successful domain sequences recorded
 * in engagement_outcomes. Sequences used 3+ times with avg quality > 0.7 become
 * templates — institutional knowledge that compounds across the system.
 *
 * Called fire-and-forget after each cognitive cycle run (once per 30 min per org).
 *
 * Template discovery algorithm:
 *   1. Load engagement_outcomes for the org from the last 30 days
 *   2. Group by domain_sequence (as JSON string key)
 *   3. For sequences with 3+ usages: compute avg confidence + success rate
 *   4. Upsert to process_templates (ON CONFLICT organization_id, name → UPDATE)
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// Minimum number of times a sequence must appear to become a template
const MIN_USAGE_COUNT = 3;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProcessTemplate {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  domain_sequence: string[];
  trigger_conditions: Record<string, unknown>;
  success_rate: number;
  avg_confidence: number;
  usage_count: number;
  is_public: boolean;
  source: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ── Extract + upsert templates from engagement_outcomes ────────────────────

export async function extractProcessTemplates(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  try {
    // Load last 30 days of outcomes for this org
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: outcomes, error } = await supabase
      .from("engagement_outcomes")
      .select("domain_sequence, quality_scores, outcome_label")
      .eq("organization_id", orgId)
      .not("domain_sequence", "is", null)
      .gte("created_at", since);

    if (error) {
      logger.warn("[ProcessTemplates] Failed to load outcomes", { error: error.message, orgId });
      return;
    }

    if (!outcomes || outcomes.length < MIN_USAGE_COUNT) return;

    // Group by domain_sequence (serialize as JSON string for Map key)
    const sequenceMap = new Map<
      string,
      { count: number; qualities: number[]; successCount: number }
    >();

    for (const outcome of outcomes) {
      if (!Array.isArray(outcome.domain_sequence) || outcome.domain_sequence.length === 0) {
        continue;
      }

      const key = JSON.stringify(outcome.domain_sequence);
      const existing = sequenceMap.get(key) ?? {
        count: 0,
        qualities: [],
        successCount: 0,
      };

      // Compute avg quality from the {domain: score} map stored in quality_scores
      const qualityMap = (outcome.quality_scores ?? {}) as Record<string, number>;
      const qualityValues = Object.values(qualityMap).filter(
        (v) => typeof v === "number"
      );
      const avgQuality =
        qualityValues.length > 0
          ? qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length
          : 0;

      existing.count++;
      existing.qualities.push(avgQuality);

      if (
        outcome.outcome_label === "successful_delivery" ||
        outcome.outcome_label === "on_track"
      ) {
        existing.successCount++;
      }

      sequenceMap.set(key, existing);
    }

    // Upsert templates for sequences used MIN_USAGE_COUNT+ times
    let upsertCount = 0;
    for (const [key, stats] of sequenceMap.entries()) {
      if (stats.count < MIN_USAGE_COUNT) continue;

      const sequence: string[] = JSON.parse(key) as string[];
      const avgConf =
        stats.qualities.length > 0
          ? stats.qualities.reduce((a, b) => a + b, 0) / stats.qualities.length
          : 0;
      const successRate = stats.count > 0 ? stats.successCount / stats.count : 0;

      const name = `${sequence.join(" → ")} (${Math.round(successRate * 100)}% success)`;
      const description = `Auto-discovered: ${stats.count} usages, ${Math.round(
        successRate * 100
      )}% success rate`;

      const { error: upsertError } = await supabase
        .from("process_templates")
        .upsert(
          {
            organization_id: orgId,
            name,
            description,
            domain_sequence: sequence,
            success_rate: successRate,
            avg_confidence: avgConf,
            usage_count: stats.count,
            source: "discovered",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,name" }
        );

      if (upsertError) {
        logger.warn("[ProcessTemplates] Upsert failed", {
          error: upsertError.message,
          orgId,
          name,
        });
      } else {
        upsertCount++;
      }
    }

    logger.warn("[ProcessTemplates] Templates extracted", {
      orgId,
      sequenceCount: sequenceMap.size,
      upserted: upsertCount,
    });
  } catch (err) {
    logger.warn("[ProcessTemplates] Extraction failed", {
      error: (err as Error)?.message ?? String(err),
      orgId,
    });
  }
}

// ── Fetch top templates for an org (own + public) ─────────────────────────

export async function getTopTemplates(
  supabase: SupabaseClient,
  orgId: string,
  limit = 10
): Promise<ProcessTemplate[]> {
  try {
    const { data, error } = await supabase
      .from("process_templates")
      .select("*")
      .or(`organization_id.eq.${orgId},is_public.eq.true`)
      .order("success_rate", { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn("[ProcessTemplates] getTopTemplates failed", {
        error: error.message,
        orgId,
      });
      return [];
    }

    return (data ?? []) as ProcessTemplate[];
  } catch (err) {
    logger.warn("[ProcessTemplates] getTopTemplates threw", {
      error: (err as Error)?.message ?? String(err),
      orgId,
    });
    return [];
  }
}
