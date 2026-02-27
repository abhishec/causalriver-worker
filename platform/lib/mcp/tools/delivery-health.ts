/**
 * MCP Tool: brainos_delivery_health
 * Returns a delivery health snapshot from engagement_health_latest view.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface DeliveryHealthInput {
  organizationId: string;
}

export async function deliveryHealth(input: DeliveryHealthInput): Promise<Record<string, unknown>> {
  const { organizationId } = input;

  if (!organizationId) {
    throw new Error("brainos_delivery_health: organizationId is required");
  }

  const supabase = getAdminClient();

  try {
    const { data: engagements, error } = await supabase
      .from("engagement_health_latest")
      .select("*")
      .eq("organization_id", organizationId)
      .order("computed_at", { ascending: false })
      .limit(20);

    if (error) {
      logger.warn("[mcp/delivery-health] Query failed", { error: error.message });
      throw new Error(`delivery health query failed: ${error.message}`);
    }

    const count = engagements?.length ?? 0;
    const avgHealth = count > 0
      ? (engagements!.reduce((sum, e) => sum + (e.health_score ?? 0), 0) / count)
      : null;

    const atRisk = engagements?.filter((e) => (e.health_score ?? 1) < 0.5) ?? [];

    return {
      success: true,
      organizationId,
      totalEngagements: count,
      averageHealthScore: avgHealth !== null ? Math.round(avgHealth * 100) / 100 : null,
      atRiskCount: atRisk.length,
      engagements: engagements ?? [],
    };
  } catch (err) {
    logger.warn("[mcp/delivery-health] Failed", { error: String(err) });
    throw err instanceof Error ? err : new Error(String(err));
  }
}
