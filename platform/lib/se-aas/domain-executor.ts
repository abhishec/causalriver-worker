/**
 * SE-aaS Domain Executor
 * ========================
 * Wrapper that:
 * 1. Creates ActionDomainContext from API request
 * 2. Calls the domain's execute() function
 * 3. Saves result as artifact
 * 4. Returns result + artifactId
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { saveArtifact } from "./job-queue";

// Import all 8 SE-aaS domains
import {
  testDataGeneratorDomain,
  sqlAnalyzerDomain,
  testCaseGeneratorDomain,
  tddCodeGeneratorDomain,
  incidentDiagnosisDomain,
  impactAnalysisDomain,
  dataLineageDomain,
  logQueryDomain,
} from "@nexus-ai/memory-stack";

// ============================================================================
// DOMAIN REGISTRY
// ============================================================================

const DOMAIN_MAP: Record<string, { domain: any; sync: boolean }> = {
  "test-data-generator": { domain: testDataGeneratorDomain, sync: true },
  "sql-analyzer": { domain: sqlAnalyzerDomain, sync: true },
  "test-case-generator": { domain: testCaseGeneratorDomain, sync: false },
  "tdd-code-generator": { domain: tddCodeGeneratorDomain, sync: false },
  "incident-diagnosis": { domain: incidentDiagnosisDomain, sync: false },
  "impact-analysis": { domain: impactAnalysisDomain, sync: false },
  "data-lineage": { domain: dataLineageDomain, sync: true },
  "log-query": { domain: logQueryDomain, sync: false },
};

export function getDomainInfo(domainType: string): { domain: any; sync: boolean } | null {
  return DOMAIN_MAP[domainType] ?? null;
}

export function isSync(domainType: string): boolean {
  return DOMAIN_MAP[domainType]?.sync ?? false;
}

// ============================================================================
// DOMAIN EXECUTION
// ============================================================================

export interface ExecuteDomainParams {
  domainType: string;
  request: Record<string, unknown>;
  organizationId: string;
  userId: string;
  anthropicApiKey?: string;
}

export interface ExecuteDomainResult {
  result: Record<string, unknown>;
  artifactId: string;
}

/**
 * Execute an SE-aaS domain and persist the result as an artifact.
 */
export async function executeDomain(
  supabase: SupabaseClient,
  params: ExecuteDomainParams
): Promise<ExecuteDomainResult> {
  const info = getDomainInfo(params.domainType);
  if (!info) {
    throw new Error(`Unknown domain: ${params.domainType}`);
  }

  // Build ActionDomainContext (matches the pattern used in domain tests)
  const ctx = {
    organizationId: params.organizationId,
    userId: params.userId,
    input: {
      ...params.request,
      anthropicApiKey: params.anthropicApiKey,
    },
    brain: {} as any,
    supabase,
  };

  const startMs = Date.now();
  const result = await info.domain.execute(ctx);
  const durationMs = Date.now() - startMs;

  // Save artifact
  const { artifactId } = await saveArtifact(supabase, {
    organizationId: params.organizationId,
    domainType: params.domainType,
    artifactData: result,
    metadata: {
      durationMs,
      userId: params.userId,
      claudePowered: result.data?.claudePowered ?? false,
    },
    createdBy: params.userId,
  });

  return {
    result: { ...result, timing: { totalMs: durationMs } },
    artifactId,
  };
}
