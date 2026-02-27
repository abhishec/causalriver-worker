/**
 * MCP Tool: brainos_early_warning
 * Returns at-risk engineers detected via flight-risk and velocity analysis.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface EarlyWarningInput {
  organizationId: string;
}

export async function earlyWarning(input: EarlyWarningInput): Promise<Record<string, unknown>> {
  const { organizationId } = input;

  if (!organizationId) {
    throw new Error("brainos_early_warning: organizationId is required");
  }

  const supabase = getAdminClient();

  try {
    const { data: snapshots, error } = await supabase
      .from("engineer_health_snapshots")
      .select(
        "github_login, review_burden, velocity_index, flight_risk_score, overallocation_flag, created_at"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      logger.warn("[mcp/early-warning] Query failed", { error: error.message });
      throw new Error(`early warning query failed: ${error.message}`);
    }

    const engineers = snapshots ?? [];
    const atRisk = engineers.filter(
      (e) => (e.flight_risk_score ?? 0) > 0.6 || e.overallocation_flag === true
    );
    const velocityIssues = engineers.filter((e) => (e.velocity_index ?? 1) < 0.4);

    return {
      success: true,
      organizationId,
      totalEngineers: engineers.length,
      flightRiskCount: atRisk.length,
      velocityIssueCount: velocityIssues.length,
      atRiskEngineers: atRisk.map((e) => ({
        githubLogin: e.github_login,
        flightRiskScore: e.flight_risk_score,
        velocityIndex: e.velocity_index,
        reviewBurden: e.review_burden,
        overallocated: e.overallocation_flag,
      })),
      velocityIssues: velocityIssues.map((e) => ({
        githubLogin: e.github_login,
        velocityIndex: e.velocity_index,
        reviewBurden: e.review_burden,
      })),
    };
  } catch (err) {
    logger.warn("[mcp/early-warning] Failed", { error: String(err) });
    throw err instanceof Error ? err : new Error(String(err));
  }
}
