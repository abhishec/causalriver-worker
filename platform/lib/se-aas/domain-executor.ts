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
      brainAugmented: result.data?.brainAugmented ?? brainContext.cognitiveStackAvailable,
      brainCausalEdgesUsed: brainContext.causalEdges?.length ?? 0,
      brainPatternsUsed: brainContext.patterns?.length ?? 0,
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
 * THE CRITICAL DIFFERENTIATOR: This is what makes NexusBrain's P1 domains
 * "Brain-augmented Claude" instead of "stateless Claude".
 *
 * Loads the FULL cognitive stack from the Brain:
 * - L4: Causal edges (what causes what in THIS organization)
 * - L5: Grammar rules / discovered patterns
 * - P0: Velocity snapshots + bottleneck risk
 * - L1: Recent cross-domain engineering signals
 * - Brain insights: Recent AI-generated organizational insights
 * - Cascade rules: Known cascade chains the Brain has learned
 *
 * Domains that don't need Brain context gracefully ignore it
 * (the context is additive, never blocking).
 */
async function assembleBrainContext(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Record<string, any>> {
  try {
    // Parallel load: FULL cognitive stack for Brain-augmented Claude
    const [
      causalEdgesRes,
      patternsRes,
      velocityRes,
      bottleneckRes,
      recentSignalsRes,
      brainInsightsRes,
      cascadeRulesRes,
    ] = await Promise.all([
      // L4: Causal relationships Brain has learned
      supabase
        .from('causal_relationships_statistical')
        .select('source_signal, target_signal, strength, confidence, lag, p_value')
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(50),

      // L5: Grammar rules / patterns Brain has discovered
      supabase
        .from('brain_grammar_rules')
        .select('rule_name, rule_body, confidence, domain')
        .eq('organization_id', organizationId)
        .gte('confidence', 0.5)
        .order('confidence', { ascending: false })
        .limit(20),

      // Cross-domain: latest velocity snapshot (P0 engineering metrics)
      supabase
        .from('velocity_snapshots')
        .select('prs_merged, mean_pr_cycle_time_hours, pr_cycle_time_variance, open_pr_count, prs_per_engineer, snapshot_date')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1),

      // Cross-domain: latest bottleneck snapshot (P0 bottleneck risk)
      supabase
        .from('bottleneck_snapshots')
        .select('bottleneck_risk_score, risk_level, reviewer_gini_coefficient, reviewer_hhi, top_reviewer_share, max_betweenness_centrality')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1),

      // Cross-domain: recent engineering signals (for incident diagnosis context)
      supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, signal_metadata, created_at')
        .eq('organization_id', organizationId)
        .eq('source_domain', 'engineering')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(50),

      // Brain insights: Recent AI-generated organizational insights (from ai_memory)
      supabase
        .from('ai_memory')
        .select('content, memory_type, cognitive_layer, metadata, created_at')
        .eq('organization_id', organizationId)
        .in('memory_type', ['insight', 'pattern', 'prediction'])
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),

      // Cascade rules: Known cascade chains the Brain has learned
      supabase
        .from('brain_cascade_rules')
        .select('source_domain, target_domain, cascade_type, severity, confidence, description')
        .eq('organization_id', organizationId)
        .gte('confidence', 0.5)
        .order('confidence', { ascending: false })
        .limit(15),
    ]);

    return {
      organizationId,
      causalEdges: causalEdgesRes.data || [],
      patterns: patternsRes.data || [],
      cognitiveStackAvailable: true,
      // Cross-domain context for SE-aaS domains
      crossDomainContext: {
        engineering: {
          velocity: velocityRes.data?.[0] || null,
          bottleneck: bottleneckRes.data?.[0] || null,
          recentSignals: (recentSignalsRes.data || []).slice(0, 20),
          signalCount: recentSignalsRes.data?.length || 0,
        },
      },
      // Brain insights (recent organizational intelligence)
      brainInsights: (brainInsightsRes.data || []).slice(0, 5),
      // Cascade rules (cross-domain chains)
      cascadeRules: cascadeRulesRes.data || [],
    };
  } catch {
    // Non-blocking: domains work without Brain context (degraded mode)
    return {
      organizationId,
      causalEdges: [],
      patterns: [],
      cognitiveStackAvailable: false,
      crossDomainContext: {},
      brainInsights: [],
      cascadeRules: [],
    };
  }
}
