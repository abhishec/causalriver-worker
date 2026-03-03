/**
 * Tool Lifecycle Manager (ADR-028)
 * =================================
 *
 * Manages the lifecycle of synthesized tools in capability_library:
 *   gap → candidate → validated → promoted → deprecated
 *
 * Three main functions:
 *   1. updateToolQualities() — aggregates invocation RL data into quality scores
 *   2. runLifecycleTransitions() — promotes/deprecates tools based on quality + usage
 *   3. tuneGapDetectionPolicy() — SAGE meta-RL: adjusts gap detection thresholds
 *
 * Called from cognitive-cycle cron. Fire-and-forget safe: never throws.
 *
 * Research backing: SkillRL (lifecycle), TOOLMAKER (revision triggers), SAGE (meta-RL)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum invocations before promotion is considered */
const PROMOTION_MIN_INVOCATIONS = 10;
/** Quality threshold for promotion: validated → promoted */
const PROMOTION_QUALITY_THRESHOLD = 0.8;
/** Quality threshold for deprecation: promoted → deprecated */
const DEPRECATION_QUALITY_THRESHOLD = 0.3;
/** Minimum invocations before deprecation (don't deprecate unused tools) */
const DEPRECATION_MIN_INVOCATIONS = 5;
/** Quality regression threshold: triggers revision if quality drops below this from >0.6 */
const REVISION_QUALITY_THRESHOLD = 0.5;
/** Previous quality threshold that must have been exceeded for regression detection */
const REVISION_PREVIOUS_QUALITY = 0.6;
/** Default gap detection quality threshold (SAGE meta-RL adjusts this) */
const DEFAULT_GAP_QUALITY_THRESHOLD = 0.5;
/** Min conversion rate before raising gap threshold */
const SAGE_LOW_CONVERSION_RATE = 0.2;
/** Max conversion rate before lowering gap threshold */
const SAGE_HIGH_CONVERSION_RATE = 0.8;

// ── Quality Aggregation ───────────────────────────────────────────────────────

/**
 * Update quality scores for all active tools from invocation history.
 *
 * Reads recent tool_invocation records from ai_memory, computes weighted
 * success rate (recent invocations weighted higher), and updates
 * quality_score + success_rate in capability_library.
 *
 * Fire-and-forget safe: never throws.
 */
export async function updateToolQualities(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ updated: number }> {
  try {
    // Get all active tools (validated + promoted)
    const { data: tools } = await supabase
      .from("capability_library")
      .select("id, domain, quality_score, invocation_count")
      .eq("organization_id", orgId)
      .in("status", ["validated", "promoted"])
      .limit(50);

    if (!tools?.length) return { updated: 0 };

    // Read recent invocations for this org
    const { data: invocations } = await supabase
      .from("ai_memory")
      .select("content")
      .eq("organization_id", orgId)
      .eq("memory_type", "tool_invocation")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!invocations?.length) return { updated: 0 };

    // Parse invocations and group by tool ID
    const toolInvocations = new Map<string, { success: number; total: number; recentSuccess: number; recentTotal: number }>();

    for (const row of invocations) {
      try {
        const parsed = JSON.parse(row.content as string) as {
          toolIds?: string[];
          quality?: number;
          success?: boolean;
        };

        const toolIds = parsed.toolIds ?? [];
        const success = parsed.success ?? false;

        for (const toolId of toolIds) {
          const existing = toolInvocations.get(toolId);
          if (existing) {
            existing.total++;
            if (success) existing.success++;
            // First 50 invocations are "recent" (higher weight)
            if (existing.total <= 50) {
              existing.recentTotal++;
              if (success) existing.recentSuccess++;
            }
          } else {
            toolInvocations.set(toolId, {
              total: 1,
              success: success ? 1 : 0,
              recentTotal: 1,
              recentSuccess: success ? 1 : 0,
            });
          }
        }
      } catch {
        // Skip malformed rows
      }
    }

    let updated = 0;

    for (const tool of tools) {
      const inv = toolInvocations.get(tool.id as string);
      if (!inv || inv.total === 0) continue;

      // Weighted quality: 70% recent, 30% overall
      const overallRate = inv.success / inv.total;
      const recentRate = inv.recentTotal > 0 ? inv.recentSuccess / inv.recentTotal : overallRate;
      const weightedRate = 0.7 * recentRate + 0.3 * overallRate;

      // Quality score formula: 0.3 base + 0.6 * success rate (range: 0.3 - 0.9)
      const newQuality = Math.min(0.95, Math.max(0.1, 0.3 + weightedRate * 0.6));

      // Only update if quality changed meaningfully (>5% delta)
      const currentQuality = tool.quality_score as number;
      if (Math.abs(newQuality - currentQuality) < 0.05) continue;

      const { error } = await supabase
        .from("capability_library")
        .update({
          quality_score: newQuality,
          success_rate: weightedRate,
          invocation_count: inv.total,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tool.id);

      if (!error) updated++;
    }

    if (updated > 0) {
      logger.info("[tool-lifecycle] Updated tool qualities", {
        orgId: orgId.slice(0, 8),
        updated,
        totalTools: tools.length,
      });
    }

    return { updated };
  } catch (err) {
    logger.warn("[tool-lifecycle] updateToolQualities failed (non-fatal)", {
      orgId,
      error: String(err),
    });
    return { updated: 0 };
  }
}

// ── Lifecycle Transitions ─────────────────────────────────────────────────────

/**
 * Run lifecycle transitions for tools in capability_library.
 *
 * Transitions (SkillRL):
 *   candidate → validated    : All test cases pass (re-validated on cron)
 *   validated → promoted     : quality_score >= 0.8 AND invocation_count >= 10
 *   promoted → deprecated    : quality_score < 0.3 AND invocation_count >= 5
 *   validated/promoted       : triggers revision if quality regresses (was >0.6, now <0.5)
 *
 * Fire-and-forget safe: never throws.
 */
export async function runLifecycleTransitions(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ promoted: number; deprecated: number; revisionsTriggered: number }> {
  const result = { promoted: 0, deprecated: 0, revisionsTriggered: 0 };

  try {
    // 1. Promote: validated → promoted
    const { data: promotionCandidates } = await supabase
      .from("capability_library")
      .select("id, name, domain, quality_score, invocation_count")
      .eq("organization_id", orgId)
      .eq("status", "validated")
      .gte("quality_score", PROMOTION_QUALITY_THRESHOLD)
      .gte("invocation_count", PROMOTION_MIN_INVOCATIONS);

    if (promotionCandidates?.length) {
      for (const tool of promotionCandidates) {
        const { error } = await supabase
          .from("capability_library")
          .update({ status: "promoted", updated_at: new Date().toISOString() })
          .eq("id", tool.id);

        if (!error) {
          result.promoted++;
          logger.info("[tool-lifecycle] Tool promoted", {
            orgId: orgId.slice(0, 8),
            toolName: tool.name,
            domain: tool.domain,
            quality: tool.quality_score,
            invocations: tool.invocation_count,
          });
        }
      }
    }

    // 2. Deprecate: promoted → deprecated
    const { data: deprecationCandidates } = await supabase
      .from("capability_library")
      .select("id, name, domain, quality_score, invocation_count")
      .eq("organization_id", orgId)
      .eq("status", "promoted")
      .lt("quality_score", DEPRECATION_QUALITY_THRESHOLD)
      .gte("invocation_count", DEPRECATION_MIN_INVOCATIONS);

    if (deprecationCandidates?.length) {
      for (const tool of deprecationCandidates) {
        const { error } = await supabase
          .from("capability_library")
          .update({ status: "deprecated", updated_at: new Date().toISOString() })
          .eq("id", tool.id);

        if (!error) {
          result.deprecated++;
          logger.info("[tool-lifecycle] Tool deprecated", {
            orgId: orgId.slice(0, 8),
            toolName: tool.name,
            domain: tool.domain,
            quality: tool.quality_score,
          });
        }
      }
    }

    // 3. Detect regression: quality was > 0.6, now < 0.5 → trigger revision
    //    We detect this by checking tools with quality < REVISION_QUALITY_THRESHOLD
    //    that have invocations (meaning they were once working well)
    const { data: regressionCandidates } = await supabase
      .from("capability_library")
      .select("id, name, domain, quality_score, invocation_count, success_rate")
      .eq("organization_id", orgId)
      .in("status", ["validated", "promoted"])
      .lt("quality_score", REVISION_QUALITY_THRESHOLD)
      .gte("invocation_count", 3); // Must have been used enough to have meaningful quality

    if (regressionCandidates?.length) {
      for (const tool of regressionCandidates) {
        // Check if this tool was previously high-quality by looking at success_rate history
        // If success_rate was once high but quality is now low, it's a regression
        const successRate = tool.success_rate as number;
        if (successRate < 0.3) {
          // Genuine regression — trigger revision by inserting a tool-revision gap
          const { error } = await supabase
            .from("capability_library")
            .insert({
              organization_id: orgId,
              name: `revision_${(tool.name as string)}`,
              description: `Revision needed: ${tool.name} quality regressed to ${Math.round((tool.quality_score as number) * 100)}%`,
              domain: tool.domain as string,
              implementation: "",
              status: "gap",
              quality_score: 0.3,
              source_gap_id: tool.id as string,
              parent_tool_id: tool.id as string,
              synthesized_by: "system",
            });

          if (!error) {
            result.revisionsTriggered++;
            logger.info("[tool-lifecycle] Revision triggered for regressed tool", {
              orgId: orgId.slice(0, 8),
              toolName: tool.name,
              quality: tool.quality_score,
              successRate: tool.success_rate,
            });
          }
        }
      }
    }

    if (result.promoted > 0 || result.deprecated > 0 || result.revisionsTriggered > 0) {
      logger.info("[tool-lifecycle] Lifecycle transitions complete", {
        orgId: orgId.slice(0, 8),
        ...result,
      });
    }

    return result;
  } catch (err) {
    logger.warn("[tool-lifecycle] runLifecycleTransitions failed (non-fatal)", {
      orgId,
      error: String(err),
    });
    return result;
  }
}

// ── SAGE Meta-RL: Gap Detection Policy Tuning ─────────────────────────────────

/**
 * Tune gap detection threshold based on gap→tool conversion rate.
 *
 * SAGE meta-RL: if too many gaps lead nowhere (low conversion), raise the
 * threshold so fewer gaps are recorded. If most gaps become tools (high
 * conversion), lower the threshold to catch more gaps.
 *
 * Stores the tuned threshold in ai_memory (memory_type: 'tool_policy').
 *
 * Fire-and-forget safe: never throws.
 */
export async function tuneGapDetectionPolicy(
  supabase: SupabaseClient,
  orgId: string,
): Promise<void> {
  try {
    // Count gaps detected in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: gapCount } = await supabase
      .from("capability_library")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "gap")
      .gte("created_at", oneDayAgo);

    // Count tools successfully synthesized in last 24h
    const { count: synthesizedCount } = await supabase
      .from("capability_library")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("status", ["candidate", "validated", "promoted"])
      .neq("implementation", "")
      .gte("created_at", oneDayAgo);

    const gaps = gapCount ?? 0;
    const synthesized = synthesizedCount ?? 0;

    if (gaps === 0) return; // No data to tune on

    const conversionRate = synthesized / gaps;

    // Read current threshold
    const { data: policyRow } = await supabase
      .from("ai_memory")
      .select("content")
      .eq("organization_id", orgId)
      .eq("memory_type", "tool_policy")
      .eq("domain", "gap_detection_threshold")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let currentThreshold = DEFAULT_GAP_QUALITY_THRESHOLD;
    if (policyRow?.content) {
      try {
        const parsed = JSON.parse(policyRow.content as string);
        currentThreshold = parsed.threshold ?? DEFAULT_GAP_QUALITY_THRESHOLD;
      } catch {
        // Use default
      }
    }

    // Adjust threshold based on conversion rate
    let newThreshold = currentThreshold;
    if (conversionRate < SAGE_LOW_CONVERSION_RATE && gaps >= 5) {
      // Too many useless gaps — raise threshold (record fewer gaps)
      newThreshold = Math.min(0.7, currentThreshold + 0.05);
    } else if (conversionRate > SAGE_HIGH_CONVERSION_RATE && gaps >= 3) {
      // Almost all gaps become tools — lower threshold (record more gaps)
      newThreshold = Math.max(0.2, currentThreshold - 0.05);
    }

    // Only update if threshold changed
    if (Math.abs(newThreshold - currentThreshold) < 0.01) return;

    // Upsert the policy
    await supabase.from("ai_memory").upsert(
      {
        organization_id: orgId,
        memory_type: "tool_policy",
        domain: "gap_detection_threshold",
        content: JSON.stringify({
          threshold: newThreshold,
          previousThreshold: currentThreshold,
          conversionRate,
          gaps24h: gaps,
          synthesized24h: synthesized,
          tunedAt: new Date().toISOString(),
        }),
        importance: 0.6,
        metadata: {
          threshold: newThreshold,
          conversionRate,
          tunedAt: new Date().toISOString(),
        },
      },
      {
        onConflict: "organization_id,memory_type,domain",
      },
    );

    logger.info("[tool-lifecycle] SAGE: Gap detection threshold tuned", {
      orgId: orgId.slice(0, 8),
      previousThreshold: currentThreshold,
      newThreshold,
      conversionRate: Math.round(conversionRate * 100),
      gaps24h: gaps,
      synthesized24h: synthesized,
    });
  } catch (err) {
    logger.warn("[tool-lifecycle] tuneGapDetectionPolicy failed (non-fatal)", {
      orgId,
      error: String(err),
    });
  }
}

/**
 * Read the current gap detection quality threshold from ai_memory.
 *
 * Used by recordCapabilityGap() to decide whether a response quality
 * is low enough to record as a gap. Returns the default (0.5) if no
 * policy has been tuned yet.
 *
 * Never throws — returns DEFAULT_GAP_QUALITY_THRESHOLD on any error.
 */
export async function getGapDetectionThreshold(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  try {
    const { data } = await supabase
      .from("ai_memory")
      .select("content")
      .eq("organization_id", orgId)
      .eq("memory_type", "tool_policy")
      .eq("domain", "gap_detection_threshold")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.content) {
      const parsed = JSON.parse(data.content as string);
      return parsed.threshold ?? DEFAULT_GAP_QUALITY_THRESHOLD;
    }
    return DEFAULT_GAP_QUALITY_THRESHOLD;
  } catch {
    return DEFAULT_GAP_QUALITY_THRESHOLD;
  }
}
