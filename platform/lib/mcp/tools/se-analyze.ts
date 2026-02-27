/**
 * MCP Tool: brainos_se_analyze
 * SE-aaS domain execution — analyzes code, SQL, test data, and more.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { executeDomain } from "@/lib/se-aas/domain-executor";
import { logger } from "@/lib/logger";

export interface SeAnalyzeInput {
  query: string;
  domain: string;
  organizationId: string;
}

export async function seAnalyze(input: SeAnalyzeInput): Promise<Record<string, unknown>> {
  const { query, domain, organizationId } = input;

  if (!query || !domain || !organizationId) {
    throw new Error("brainos_se_analyze: query, domain, and organizationId are required");
  }

  const supabase = getAdminClient();

  try {
    const result = await executeDomain(supabase, {
      domainType: domain,
      request: { query, userMessage: query },
      organizationId,
      userId: "mcp-agent",
    });

    return {
      success: true,
      domain,
      result: result.result,
      artifactId: result.artifactId,
    };
  } catch (err) {
    logger.warn("[mcp/se-analyze] Domain execution failed", { domain, error: String(err) });
    throw new Error(`SE-aaS domain execution failed: ${String(err)}`);
  }
}
