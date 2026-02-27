/**
 * MCP Tool: brainos_pod_match
 * Returns pod matching recommendations for an organization.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface PodMatchInput {
  organizationId: string;
  requirements?: string;
}

export async function podMatch(input: PodMatchInput): Promise<Record<string, unknown>> {
  const { organizationId, requirements } = input;

  if (!organizationId) {
    throw new Error("brainos_pod_match: organizationId is required");
  }

  const supabase = getAdminClient();

  try {
    let query = supabase
      .from("pod_match_history")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: matches, error } = await query;

    if (error) {
      logger.warn("[mcp/pod-match] Query failed", { error: error.message });
      throw new Error(`pod match query failed: ${error.message}`);
    }

    const topMatch = matches?.[0] ?? null;

    return {
      success: true,
      organizationId,
      requirements: requirements ?? null,
      topRecommendation: topMatch
        ? {
            podName: topMatch.recommended_pod_name,
            confidence: topMatch.confidence,
            matchedAt: topMatch.created_at,
          }
        : null,
      allMatches: (matches ?? []).map((m) => ({
        podName: m.recommended_pod_name,
        confidence: m.confidence,
        matchedAt: m.created_at,
      })),
    };
  } catch (err) {
    logger.warn("[mcp/pod-match] Failed", { error: String(err) });
    throw err instanceof Error ? err : new Error(String(err));
  }
}
