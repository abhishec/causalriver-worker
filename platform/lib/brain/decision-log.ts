/**
 * Brain Decision Log — EU AI Act Article 13 Compliance
 * ======================================================
 *
 * Every autonomous AI decision the brain makes is logged here for:
 * - Full explainability (why did the system choose X?)
 * - Audit trails (what decisions were made, when, by which model?)
 * - Regulatory compliance (EU AI Act Article 13 — transparency for high-risk AI)
 *
 * Usage: fire-and-forget. Never throw, never block callers.
 *
 *   void logDecision(adminClient, { ... });
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export type DecisionType =
  | "domain_routing"
  | "model_selection"
  | "agent_dispatch"
  | "hitl_override"
  | "policy_blocked"
  | "circuit_breaker";

export interface DecisionLogEntry {
  organizationId: string;
  decisionType: DecisionType;
  inputContext: Record<string, unknown>;
  decisionMade: Record<string, unknown>;
  rationale?: string;
  confidence?: number;
  modelUsed?: string;
  domain?: string;
  jobId?: string;
  userId?: string;
}

/**
 * Log an AI decision for EU AI Act Article 13 compliance.
 * Fire-and-forget: never throws, never blocks callers.
 */
export async function logDecision(
  supabase: SupabaseClient,
  entry: DecisionLogEntry
): Promise<void> {
  try {
    await supabase.from("brain_decision_log").insert({
      organization_id: entry.organizationId,
      decision_type: entry.decisionType,
      input_context: entry.inputContext,
      decision_made: entry.decisionMade,
      rationale: entry.rationale ?? null,
      confidence: entry.confidence ?? null,
      model_used: entry.modelUsed ?? null,
      domain: entry.domain ?? null,
      job_id: entry.jobId ?? null,
      user_id: entry.userId ?? null,
    });
  } catch (err) {
    logger.warn("[decision-log] failed to write decision log:", err);
  }
}

/**
 * Query decision log for an org (for dashboard / audit export).
 */
export async function getDecisionLog(
  supabase: SupabaseClient,
  organizationId: string,
  options: {
    limit?: number;
    domain?: string;
    decisionType?: DecisionType;
    since?: Date;
  } = {}
) {
  let query = supabase
    .from("brain_decision_log")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.domain) query = query.eq("domain", options.domain);
  if (options.decisionType) query = query.eq("decision_type", options.decisionType);
  if (options.since) query = query.gte("created_at", options.since.toISOString());

  const { data, error } = await query;
  if (error) {
    logger.warn("[decision-log] query error:", error);
    return [];
  }
  return data ?? [];
}
