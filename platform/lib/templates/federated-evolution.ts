/**
 * Federated Template Evolution
 * ============================
 *
 * Extends the template system with cross-org intelligence:
 *   - Templates auto-update prompts based on success rate
 *   - High-performing templates can be promoted to shared/public
 *   - Cross-org aggregation of best-performing templates
 *   - Federated learning: collective intelligence improves all orgs
 *
 * Architecture:
 *   1. Performance Tracker detects low-performing template
 *   2. Evolution Advisor generates improved prompt variant
 *   3. A/B Test Manager runs experiment
 *   4. Winner is promoted; if success rate > threshold, offered for sharing
 *   5. Shared templates appear in template gallery for other orgs
 *   6. Usage signals from all orgs flow back to improve shared templates
 *
 * This sits on top of:
 *   - performance-tracker.ts (detects when to evolve)
 *   - version-manager.ts (tracks version history)
 *   - ab-test-manager.ts (runs experiments)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export type PromotionTier = "org_private" | "org_shared" | "platform_featured";

export interface FederatedTemplate {
  id: string;
  source_template_id: string;
  source_organization_id: string;
  name: string;
  description: string;
  service_vertical: string;
  prompt: string;
  agent_config: Record<string, unknown>;
  /** Performance metrics from the source org */
  performance: FederatedPerformance;
  /** Promotion status */
  promotion_tier: PromotionTier;
  /** How many orgs have adopted this template */
  adoption_count: number;
  /** Aggregate performance across all adopters */
  aggregate_success_rate: number;
  /** Tags for discovery */
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface FederatedPerformance {
  total_runs: number;
  success_rate: number;
  avg_confidence: number;
  improvement_over_baseline: number; // percentage improvement
  ab_test_win_count: number;
}

export interface EvolutionAdvice {
  shouldEvolve: boolean;
  reason: string;
  suggestedChanges: string[];
  /** Prompt improvement suggestions based on failure analysis */
  promptImprovements?: string[];
  /** Confidence that evolution will improve performance */
  improvementConfidence: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Minimum success rate to be eligible for sharing */
const SHARING_THRESHOLD = 0.85;

/** Minimum runs before considering for promotion */
const MIN_RUNS_FOR_PROMOTION = 25;

/** Minimum A/B test wins before promoting */
const MIN_AB_WINS_FOR_PROMOTION = 2;

/** Maximum age (days) before re-evaluating shared templates */
const MAX_STALE_DAYS = 30;

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Evaluate whether a template is ready for promotion to shared tier.
 */
export async function evaluateForPromotion(
  supabase: SupabaseClient,
  templateId: string,
  organizationId: string,
): Promise<{
  eligible: boolean;
  currentTier: PromotionTier;
  nextTier: PromotionTier | null;
  reason: string;
  metrics: FederatedPerformance | null;
}> {
  try {
    // Fetch template + performance data
    const { data: template } = await supabase
      .from("agent_templates")
      .select("*, organization_id")
      .eq("id", templateId)
      .eq("organization_id", organizationId)
      .single();

    if (!template) {
      return { eligible: false, currentTier: "org_private", nextTier: null, reason: "Template not found", metrics: null };
    }

    // Calculate performance metrics
    const { data: tasks } = await supabase
      .from("brain_agent_tasks")
      .select("status, confidence_score")
      .eq("agent_template_id", templateId)
      .eq("organization_id", organizationId)
      .in("status", ["completed", "failed", "rejected"])
      .limit(200);

    if (!tasks || tasks.length < MIN_RUNS_FOR_PROMOTION) {
      return {
        eligible: false,
        currentTier: "org_private",
        nextTier: null,
        reason: `Need ${MIN_RUNS_FOR_PROMOTION} runs, have ${tasks?.length || 0}`,
        metrics: null,
      };
    }

    const totalRuns = tasks.length;
    const successRuns = tasks.filter(t => t.status === "completed").length;
    const successRate = successRuns / totalRuns;
    const avgConfidence = tasks
      .filter(t => t.confidence_score)
      .reduce((sum, t) => sum + (t.confidence_score || 0), 0) / Math.max(tasks.filter(t => t.confidence_score).length, 1);

    // Count A/B test wins
    let abWins = 0;
    try {
      const { data: abTests } = await supabase
        .from("ab_tests")
        .select("winner")
        .eq("template_id", templateId)
        .eq("status", "completed");

      abWins = abTests?.filter(t => t.winner === "b").length || 0;
    } catch {
      // ab_tests table might not exist
    }

    const performance: FederatedPerformance = {
      total_runs: totalRuns,
      success_rate: successRate,
      avg_confidence: avgConfidence,
      improvement_over_baseline: 0,
      ab_test_win_count: abWins,
    };

    // Check promotion eligibility
    const currentTier: PromotionTier = template.is_public ? "org_shared" : "org_private";

    if (currentTier === "org_private" && successRate >= SHARING_THRESHOLD && abWins >= MIN_AB_WINS_FOR_PROMOTION) {
      return {
        eligible: true,
        currentTier,
        nextTier: "org_shared",
        reason: `Success rate ${(successRate * 100).toFixed(0)}% exceeds ${(SHARING_THRESHOLD * 100)}% threshold with ${abWins} A/B wins`,
        metrics: performance,
      };
    }

    if (currentTier === "org_shared" && totalRuns >= 100 && successRate >= 0.9) {
      return {
        eligible: true,
        currentTier,
        nextTier: "platform_featured",
        reason: `High-performing shared template: ${totalRuns} runs, ${(successRate * 100).toFixed(0)}% success`,
        metrics: performance,
      };
    }

    return {
      eligible: false,
      currentTier,
      nextTier: null,
      reason: successRate < SHARING_THRESHOLD
        ? `Success rate ${(successRate * 100).toFixed(0)}% below ${(SHARING_THRESHOLD * 100)}% threshold`
        : `Need ${MIN_AB_WINS_FOR_PROMOTION} A/B wins, have ${abWins}`,
      metrics: performance,
    };
  } catch (err) {
    logger.error("[FederatedEvolution] evaluateForPromotion error:", err);
    return { eligible: false, currentTier: "org_private", nextTier: null, reason: "Error evaluating", metrics: null };
  }
}

/**
 * Promote a template to the next tier (org_private → org_shared → platform_featured).
 */
export async function promoteTemplate(
  supabase: SupabaseClient,
  templateId: string,
  organizationId: string,
  nextTier: PromotionTier,
): Promise<boolean> {
  try {
    if (nextTier === "org_shared") {
      // Make template discoverable by other orgs
      await supabase
        .from("agent_templates")
        .update({
          is_public: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId)
        .eq("organization_id", organizationId);

      // Also store in federated registry via ai_memory
      const { data: template } = await supabase
        .from("agent_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (template) {
        await supabase.from("ai_memory").insert({
          organization_id: organizationId,
          memory_type: "federated_template",
          content: JSON.stringify({
            templateId,
            name: template.label || template.command_id,
            service: template.service,
            prompt: template.prompt?.slice(0, 500),
            promotionTier: nextTier,
            promotedAt: new Date().toISOString(),
          }),
          source: "federated-evolution",
          confidence: 1.0,
        });
      }
    }

    // Emit promotion signal
    await supabase.from("cross_domain_signals").insert({
      organization_id: organizationId,
      source_domain: "brain.templates",
      signal_type: "template_promoted",
      signal_value: nextTier === "platform_featured" ? 1.0 : 0.7,
      entity_type: "agent_template",
      entity_id: templateId,
      signal_metadata: {
        promotionTier: nextTier,
        templateId,
      },
    });

    return true;
  } catch (err) {
    logger.error("[FederatedEvolution] promoteTemplate error:", err);
    return false;
  }
}

/**
 * Discover high-performing shared templates from other organizations.
 * Returns templates that match the requested service vertical.
 */
export async function discoverSharedTemplates(
  supabase: SupabaseClient,
  params: {
    serviceVertical?: string;
    excludeOrgId?: string;
    limit?: number;
  },
): Promise<FederatedTemplate[]> {
  try {
    let query = supabase
      .from("agent_templates")
      .select("*")
      .eq("is_public", true)
      .eq("is_template", true)
      .order("total_runs", { ascending: false })
      .limit(params.limit || 20);

    if (params.serviceVertical) {
      query = query.eq("service", params.serviceVertical);
    }

    if (params.excludeOrgId) {
      query = query.neq("organization_id", params.excludeOrgId);
    }

    const { data: templates } = await query;

    if (!templates) return [];

    return templates.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      source_template_id: t.id as string,
      source_organization_id: t.organization_id as string,
      name: (t.label || t.command_id || "Unnamed") as string,
      description: (t.description || "") as string,
      service_vertical: (t.service || "general") as string,
      prompt: (t.prompt || "") as string,
      agent_config: (t.agent_config || {}) as Record<string, unknown>,
      performance: {
        total_runs: (t.total_runs || 0) as number,
        success_rate: 0, // Would need to calculate
        avg_confidence: 0,
        improvement_over_baseline: 0,
        ab_test_win_count: 0,
      },
      promotion_tier: "org_shared" as PromotionTier,
      adoption_count: 0,
      aggregate_success_rate: 0,
      tags: [],
      created_at: (t.created_at || "") as string,
      updated_at: (t.updated_at || "") as string,
    }));
  } catch (err) {
    logger.error("[FederatedEvolution] discoverSharedTemplates error:", err);
    return [];
  }
}

/**
 * Fork (adopt) a shared template into an organization.
 * Creates a private copy linked to the source for future updates.
 */
export async function forkTemplate(
  supabase: SupabaseClient,
  sourceTemplateId: string,
  targetOrgId: string,
  userId: string,
): Promise<string | null> {
  try {
    const { data: source } = await supabase
      .from("agent_templates")
      .select("*")
      .eq("id", sourceTemplateId)
      .eq("is_public", true)
      .single();

    if (!source) return null;

    const { data: forked, error } = await supabase
      .from("agent_templates")
      .insert({
        organization_id: targetOrgId,
        created_by: userId,
        command_id: `${source.command_id}_forked`,
        label: `${source.label || source.command_id} (Forked)`,
        description: source.description,
        prompt: source.prompt,
        service: source.service,
        agent_config: source.agent_config,
        gathering_schema: source.gathering_schema,
        is_public: false,
        is_template: false,
        source_template_id: sourceTemplateId,
        evolution_status: "forked",
        variant_label: `Fork of ${source.label || source.command_id}`,
      })
      .select("id")
      .single();

    if (error || !forked) {
      logger.error("[FederatedEvolution] Fork error:", error?.message);
      return null;
    }

    // Track adoption
    await supabase.from("cross_domain_signals").insert({
      organization_id: targetOrgId,
      source_domain: "brain.templates",
      signal_type: "template_forked",
      signal_value: 0.5,
      entity_type: "agent_template",
      entity_id: forked.id,
      signal_metadata: {
        sourceTemplateId,
        sourceOrgId: source.organization_id,
        forkedTemplateId: forked.id,
      },
    });

    return forked.id;
  } catch (err) {
    logger.error("[FederatedEvolution] forkTemplate error:", err);
    return null;
  }
}

/**
 * Generate evolution advice for a template based on its performance history.
 * Analyzes failure patterns and suggests prompt improvements.
 */
export async function getEvolutionAdvice(
  supabase: SupabaseClient,
  templateId: string,
  organizationId: string,
): Promise<EvolutionAdvice> {
  try {
    // Get recent task outcomes
    const { data: recentTasks } = await supabase
      .from("brain_agent_tasks")
      .select("status, error_message, confidence_score, prompt")
      .eq("agent_template_id", templateId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!recentTasks || recentTasks.length < 5) {
      return {
        shouldEvolve: false,
        reason: "Not enough data (need 5+ runs)",
        suggestedChanges: [],
        improvementConfidence: 0,
      };
    }

    const totalRuns = recentTasks.length;
    const failures = recentTasks.filter(t => t.status === "failed" || t.status === "rejected");
    const failureRate = failures.length / totalRuns;
    const avgConfidence = recentTasks
      .filter(t => t.confidence_score)
      .reduce((sum, t) => sum + (t.confidence_score || 0), 0) / Math.max(recentTasks.filter(t => t.confidence_score).length, 1);

    const shouldEvolve = failureRate > 0.3 || avgConfidence < 0.6;

    // Analyze failure patterns
    const errorPatterns = new Map<string, number>();
    for (const task of failures) {
      const msg = (task.error_message || "unknown").slice(0, 100);
      errorPatterns.set(msg, (errorPatterns.get(msg) || 0) + 1);
    }

    const suggestedChanges: string[] = [];
    const promptImprovements: string[] = [];

    if (failureRate > 0.5) {
      suggestedChanges.push("Consider major prompt rewrite — over 50% failure rate");
      promptImprovements.push("Add more specific instructions and examples");
    }
    if (avgConfidence < 0.5) {
      suggestedChanges.push("Add confidence-boosting context — avg confidence below 50%");
      promptImprovements.push("Include domain-specific constraints and validation criteria");
    }

    // Check for common error patterns
    for (const [pattern, count] of errorPatterns) {
      if (count >= 3) {
        suggestedChanges.push(`Recurring error (${count}x): "${pattern}"`);
        if (pattern.includes("timeout") || pattern.includes("token")) {
          promptImprovements.push("Reduce prompt length or break into smaller tasks");
        }
        if (pattern.includes("parse") || pattern.includes("format")) {
          promptImprovements.push("Add explicit output format instructions with examples");
        }
      }
    }

    return {
      shouldEvolve,
      reason: shouldEvolve
        ? `Failure rate: ${(failureRate * 100).toFixed(0)}%, Avg confidence: ${(avgConfidence * 100).toFixed(0)}%`
        : `Performance acceptable: ${((1 - failureRate) * 100).toFixed(0)}% success rate`,
      suggestedChanges,
      promptImprovements,
      improvementConfidence: shouldEvolve ? 0.7 : 0.3,
    };
  } catch (err) {
    logger.error("[FederatedEvolution] getEvolutionAdvice error:", err);
    return {
      shouldEvolve: false,
      reason: "Error analyzing performance",
      suggestedChanges: [],
      improvementConfidence: 0,
    };
  }
}
