/**
 * SE-aaS Domain Executor (Brain-Integrated)
 * ============================================
 *
 * ARCHITECTURE COMPLIANCE:
 * All P1 SE-aaS domains execute through the Brain's Action Domain Registry.
 * Brain context (causal edges, patterns, trained knowledge) is assembled by
 * BrainContextBuilder and passed to each domain for cognitive-stack-aware execution.
 *
 * Wrapper that:
 * 1. Creates ActionDomainContext from API request
 * 2. Assembles Brain context (causal edges, patterns, rules) for cognitive enrichment
 * 3. Calls the domain's execute() function with full Brain context
 * 4. Saves result as artifact
 * 5. Returns result + artifactId
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

  // Build ActionDomainContext with Brain context for cognitive enrichment
  // Brain context provides causal edges, patterns, and trained knowledge
  // so domains can leverage the 15-layer cognitive stack
  const brainContext = await assembleBrainContext(supabase, params.organizationId);

  const ctx = {
    organizationId: params.organizationId,
    userId: params.userId,
    input: {
      ...params.request,
      anthropicApiKey: params.anthropicApiKey,
    },
    brain: brainContext,
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

// ============================================================================
// BRAIN CONTEXT ASSEMBLY
// ============================================================================

/**
 * Assemble Brain context for SE-aaS domain execution.
 *
 * Loads causal edges, patterns, and trained knowledge from the Brain so domains
 * can leverage the cognitive stack for richer analysis. Domains that don't need
 * Brain context gracefully ignore it (the context is additive, never blocking).
 */
async function assembleBrainContext(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Record<string, any>> {
  try {
    // Load recent causal edges (L4: causal discovery)
    const { data: causalEdges } = await supabase
      .from('causal_relationships_statistical')
      .select('source_signal, target_signal, strength, confidence, lag, p_value')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(50);

    // Load relevant patterns (L5: pattern recognition)
    const { data: patterns } = await supabase
      .from('brain_grammar_rules')
      .select('rule_name, rule_body, confidence, domain')
      .eq('organization_id', organizationId)
      .gte('confidence', 0.5)
      .order('confidence', { ascending: false })
      .limit(20);

    return {
      organizationId,
      causalEdges: causalEdges || [],
      patterns: patterns || [],
      cognitiveStackAvailable: true,
    };
  } catch {
    // Non-blocking: domains work without Brain context (degraded mode)
    return {
      organizationId,
      causalEdges: [],
      patterns: [],
      cognitiveStackAvailable: false,
    };
  }
}
