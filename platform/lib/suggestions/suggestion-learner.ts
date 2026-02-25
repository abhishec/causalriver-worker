/**
 * Suggestion Learner — Closes the RL loop for smart suggestions
 *
 * Learns which suggestions users find helpful:
 *   - Accepted → positive signal → boost priority
 *   - Dismissed → negative signal → reduce priority
 *   - "Not relevant" → suppress for this user/org
 *
 * Integrates with the brain's cross_domain_signals for RL:
 *   - Emits brain.suggestions.accepted/dismissed signals
 *   - These are picked up by the RL system to adjust future behavior
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export type FeedbackAction = "accepted" | "dismissed" | "helpful" | "not_relevant";

export interface SuggestionFeedbackInput {
  organizationId: string;
  userId: string;
  suggestionType: string;
  action: FeedbackAction;
  suggestionData?: Record<string, unknown>;
}

export interface SuggestionEffectiveness {
  suggestionType: string;
  totalFeedback: number;
  acceptedCount: number;
  dismissedCount: number;
  acceptanceRate: number;
  notRelevantCount: number;
}

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Record user feedback on a suggestion.
 * Also emits an RL signal for the brain to learn from.
 */
export async function recordSuggestionFeedback(
  supabase: SupabaseClient,
  input: SuggestionFeedbackInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Store feedback in DB
    const { error: insertError } = await supabase.from("suggestion_feedback").insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      suggestion_type: input.suggestionType,
      action_taken: input.action,
      suggestion_data: input.suggestionData ?? {},
    });

    if (insertError) {
      logger.error("[SuggestionLearner] Failed to record feedback:", insertError);
      return { success: false, error: insertError.message };
    }

    // 2. Emit RL signal
    const signalValue = input.action === "accepted" || input.action === "helpful" ? 0.8 : -0.3;
    const signalType = input.action === "accepted" || input.action === "helpful"
      ? "suggestion_accepted"
      : input.action === "not_relevant"
        ? "suggestion_not_relevant"
        : "suggestion_dismissed";

    try {
      await supabase.from("cross_domain_signals").insert({
        organization_id: input.organizationId,
        source_domain: "brain.suggestions",
        signal_type: signalType,
        signal_value: signalValue,
        signal_timestamp: new Date().toISOString(),
        entity_type: "suggestion_feedback",
        signal_metadata: {
          suggestion_type: input.suggestionType,
          action: input.action,
          user_id: input.userId,
          recorded_at: new Date().toISOString(),
        },
      });
    } catch {
      // Non-critical: RL signal failure shouldn't block feedback recording
    }

    return { success: true };
  } catch (err) {
    logger.error("[SuggestionLearner] Error:", err);
    return { success: false, error: "Failed to record suggestion feedback" };
  }
}

/**
 * Get effectiveness metrics for a suggestion type within an org.
 * Used to adjust suggestion priority dynamically.
 */
export async function getSuggestionEffectiveness(
  supabase: SupabaseClient,
  organizationId: string,
  suggestionType: string,
): Promise<SuggestionEffectiveness> {
  try {
    const { data: feedback } = await supabase
      .from("suggestion_feedback")
      .select("action_taken")
      .eq("organization_id", organizationId)
      .eq("suggestion_type", suggestionType)
      .order("created_at", { ascending: false })
      .limit(50); // Last 50 interactions

    if (!feedback || feedback.length === 0) {
      return {
        suggestionType,
        totalFeedback: 0,
        acceptedCount: 0,
        dismissedCount: 0,
        acceptanceRate: 0.5, // Neutral default
        notRelevantCount: 0,
      };
    }

    const accepted = feedback.filter((f: { action_taken: string }) =>
      f.action_taken === "accepted" || f.action_taken === "helpful",
    ).length;
    const dismissed = feedback.filter((f: { action_taken: string }) =>
      f.action_taken === "dismissed",
    ).length;
    const notRelevant = feedback.filter((f: { action_taken: string }) =>
      f.action_taken === "not_relevant",
    ).length;

    return {
      suggestionType,
      totalFeedback: feedback.length,
      acceptedCount: accepted,
      dismissedCount: dismissed,
      acceptanceRate: feedback.length > 0 ? accepted / feedback.length : 0.5,
      notRelevantCount: notRelevant,
    };
  } catch {
    return {
      suggestionType,
      totalFeedback: 0,
      acceptedCount: 0,
      dismissedCount: 0,
      acceptanceRate: 0.5,
      notRelevantCount: 0,
    };
  }
}

/**
 * Get priority multipliers for all suggestion types based on learned effectiveness.
 * Higher multiplier = show more often. Lower = show less.
 *
 * Returns Map<suggestionType, multiplier>:
 *   - 1.0 = neutral (no learning yet)
 *   - 0.0 = suppressed (user marked "not relevant" 3+ times)
 *   - 1.5 = boosted (high acceptance rate)
 */
export async function adjustSuggestionPriority(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Map<string, number>> {
  const priorities = new Map<string, number>();

  try {
    // Get all feedback for this org, grouped by type
    const { data: feedback } = await supabase
      .from("suggestion_feedback")
      .select("suggestion_type, action_taken")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!feedback || feedback.length === 0) return priorities;

    // Group by type
    const byType = new Map<string, Array<{ action_taken: string }>>();
    for (const f of feedback as Array<{ suggestion_type: string; action_taken: string }>) {
      if (!byType.has(f.suggestion_type)) byType.set(f.suggestion_type, []);
      byType.get(f.suggestion_type)!.push(f);
    }

    // Calculate multiplier per type
    for (const [type, actions] of byType) {
      const notRelevantCount = actions.filter(a => a.action_taken === "not_relevant").length;
      const acceptedCount = actions.filter(a => a.action_taken === "accepted" || a.action_taken === "helpful").length;
      const total = actions.length;

      if (notRelevantCount >= 3) {
        // User strongly dislikes this type → suppress
        priorities.set(type, 0.0);
      } else if (total >= 5 && acceptedCount / total > 0.6) {
        // High acceptance rate → boost
        priorities.set(type, 1.5);
      } else if (total >= 5 && acceptedCount / total < 0.2) {
        // Low acceptance rate → reduce
        priorities.set(type, 0.3);
      } else {
        priorities.set(type, 1.0);
      }
    }
  } catch {
    // Non-critical
  }

  return priorities;
}

/**
 * Get recent dismissal timestamps for cooldown enforcement.
 * Returns Map<suggestionType, lastDismissedTimestamp>.
 */
export async function getRecentDismissals(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<Map<string, number>> {
  const dismissals = new Map<string, number>();

  try {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("suggestion_feedback")
      .select("suggestion_type, created_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .in("action_taken", ["dismissed", "not_relevant"])
      .gte("created_at", fourHoursAgo)
      .order("created_at", { ascending: false });

    if (data) {
      for (const row of data as Array<{ suggestion_type: string; created_at: string }>) {
        if (!dismissals.has(row.suggestion_type)) {
          dismissals.set(row.suggestion_type, new Date(row.created_at).getTime());
        }
      }
    }
  } catch {
    // Non-critical
  }

  return dismissals;
}
