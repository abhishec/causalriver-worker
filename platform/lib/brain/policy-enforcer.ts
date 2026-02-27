/**
 * PolicyEnforcer — Process Intelligence Gate
 * ============================================
 * Evaluates per-org constraints before dispatching agent jobs.
 * Two default policies:
 *   1. max-concurrent-jobs  — blocks when ≥ 10 jobs are running for the org
 *   2. rate-limit-per-hour  — blocks when ≥ 100 jobs were created in the last hour
 *
 * All policies are tried in order. First failure short-circuits and returns
 * { allowed: false, reason, policyName }. Non-blocking: a policy check
 * error allows the job through (fail-open, non-fatal).
 *
 * To add new policies: push a new entry onto DEFAULT_POLICIES. Each policy
 * receives the Supabase service client and the org's UUID.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { logDecision } from "@/lib/brain/decision-log";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PolicyResult = {
  allowed: boolean;
  reason?: string;
  policyName?: string;
};

type PolicyDefinition = {
  name: string;
  check: (supabase: SupabaseClient, orgId: string) => Promise<PolicyResult>;
};

// ── Default Policies ──────────────────────────────────────────────────────────

const DEFAULT_POLICIES: PolicyDefinition[] = [
  {
    name: "max-concurrent-jobs",
    check: async (supabase: SupabaseClient, orgId: string): Promise<PolicyResult> => {
      const { count } = await supabase
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "running");

      const running = count ?? 0;
      if (running >= 10) {
        return {
          allowed: false,
          reason: `Max concurrent jobs (10) reached. Running: ${running}`,
          policyName: "max-concurrent-jobs",
        };
      }
      return { allowed: true };
    },
  },
  {
    name: "rate-limit-per-hour",
    check: async (supabase: SupabaseClient, orgId: string): Promise<PolicyResult> => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("created_at", oneHourAgo);

      const jobsThisHour = count ?? 0;
      if (jobsThisHour >= 100) {
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${jobsThisHour} jobs in last hour (max 100)`,
          policyName: "rate-limit-per-hour",
        };
      }
      return { allowed: true };
    },
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate all default policies for `orgId`.
 * Returns { allowed: true } if all pass.
 * Returns { allowed: false, reason, policyName } on the first violation.
 * Policy check errors are swallowed (fail-open) — a broken policy check
 * must never block legitimate jobs.
 */
export async function evaluateConstraints(
  supabase: SupabaseClient,
  orgId: string
): Promise<PolicyResult> {
  for (const policy of DEFAULT_POLICIES) {
    try {
      const result = await policy.check(supabase, orgId);
      if (!result.allowed) {
        logger.warn("[PolicyEnforcer] Constraint violation", {
          orgId,
          policy: policy.name,
          reason: result.reason,
        });
        void logDecision(supabase, {
          organizationId: orgId,
          decisionType: "policy_blocked",
          inputContext: { policy: policy.name },
          decisionMade: { blocked: true, policy: policy.name },
          rationale: result.reason,
        });
        return result;
      }
    } catch (err) {
      // Fail-open: a broken policy check must not block the job
      logger.warn("[PolicyEnforcer] Policy check threw, allowing through (fail-open)", {
        policy: policy.name,
        orgId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { allowed: true };
}
