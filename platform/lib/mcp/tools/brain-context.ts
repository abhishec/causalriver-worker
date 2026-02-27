/**
 * MCP Tool: brainos_brain_context
 * Returns the current brain state for an organization.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { getBrainContext } from "@/lib/brain/brain-context";
import { logger } from "@/lib/logger";

export interface BrainContextInput {
  organizationId: string;
}

export async function brainContext(input: BrainContextInput): Promise<Record<string, unknown>> {
  const { organizationId } = input;

  if (!organizationId) {
    throw new Error("brainos_brain_context: organizationId is required");
  }

  const supabase = getAdminClient();

  try {
    const ctx = await getBrainContext(supabase, organizationId);

    return {
      success: true,
      organizationId,
      brainIq: ctx.brainIq,
      brainState: ctx.brainState,
      signalCount: ctx.signalCount,
      recentQuality: ctx.recentQuality,
      activeJobCount: ctx.activeJobCount,
      pendingJobCount: ctx.pendingJobCount,
      lastJobStatus: ctx.lastJobStatus,
      smartRouterRecommendation: ctx.smartRouterRecommendation,
      topPatterns: ctx.topPatterns,
      qualityPatternsSummary: ctx.qualityPatternsSummary,
      contextSummary: ctx.contextSummary,
      strategicObjectives: ctx.strategicObjectives ?? null,
      monitorAlerts: ctx.monitorAlerts ?? [],
    };
  } catch (err) {
    logger.warn("[mcp/brain-context] Failed", { error: String(err) });
    throw err instanceof Error ? err : new Error(String(err));
  }
}
