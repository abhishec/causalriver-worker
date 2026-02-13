/**
 * Brain Loader — Parallel Supabase queries to load org brain knowledge
 * ═══════════════════════════════════════════════════════════════════════
 * Mirrors the exact same DB queries from the copilot route (route.ts lines 256-295).
 * Loads: causal edges, business rules, patterns, cascade rules.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TrainedCausalEdge,
  TrainedRule,
  TrainedPattern,
  TrainedCascadeRule,
} from '@nexus-ai/memory-stack';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BrainKnowledge {
  causalEdges: TrainedCausalEdge[];
  rules: TrainedRule[];
  patterns: TrainedPattern[];
  cascadeRules: TrainedCascadeRule[];
}

// ═══════════════════════════════════════════════════════════════
// LOADER
// ═══════════════════════════════════════════════════════════════

/**
 * Load brain knowledge from Supabase — same tables and filters as the web copilot route.
 * Queries org-specific data + shared core data in parallel.
 */
export async function loadBrainKnowledge(
  supabase: SupabaseClient,
  orgId: string,
  coreOrgId: string,
): Promise<BrainKnowledge> {
  // Build org filter: user's org + shared core org (deduped)
  const orgIds = [...new Set([orgId, coreOrgId])];
  const orgFilter = orgIds.map((id) => `organization_id.eq.${id}`).join(',');

  // Parallel DB queries — identical to copilot route
  const [causalResult, rulesResult, cascadeResult, patternsResult] = await Promise.all([
    // Full causal graph (significant edges, ordered by effect size)
    supabase
      .from('causal_relationships_statistical')
      .select(
        'source_domain, target_domain, effect_size, granger_p_value, optimal_lag_days, granger_f_statistic, sample_size, confidence_interval_lower, confidence_interval_upper, natural_language, is_significant'
      )
      .or(orgFilter)
      .eq('is_significant', true)
      .order('effect_size', { ascending: false })
      .limit(300),

    // Business rules
    supabase
      .from('ai_memory')
      .select('content, importance, domain, metadata')
      .or(orgFilter)
      .eq('memory_type', 'rule')
      .order('importance', { ascending: false })
      .limit(100),

    // Cascade rules (active only)
    supabase
      .from('org_cascade_rules')
      .select('rule_name, trigger_domain, trigger_signal_type, propagation_chain, is_active')
      .or(orgFilter)
      .eq('is_active', true)
      .limit(50),

    // Patterns
    supabase
      .from('ai_memory')
      .select('content, domain, importance, llm_pattern_name, llm_pattern_description, metadata')
      .or(orgFilter)
      .eq('memory_type', 'pattern')
      .order('importance', { ascending: false })
      .limit(100),
  ]);

  return {
    causalEdges: (causalResult.data || []) as TrainedCausalEdge[],
    rules: (rulesResult.data || []) as TrainedRule[],
    patterns: (patternsResult.data || []) as TrainedPattern[],
    cascadeRules: (cascadeResult.data || []) as TrainedCascadeRule[],
  };
}

/**
 * Check if the org has an active GitHub connector with ingested code.
 * Returns ingestion stats if code has been ingested, null otherwise.
 */
export async function checkCodeIngestion(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ filesProcessed: number; symbolsFound: number } | null> {
  const { data: ghConnector } = await supabase
    .from('org_connectors')
    .select('config')
    .eq('organization_id', orgId)
    .eq('connector_type', 'github')
    .eq('status', 'active')
    .maybeSingle();

  if (!ghConnector) return null;

  const stats = (ghConnector.config as Record<string, any>)?.ingestion_progress?.stats;
  if (!stats || !stats.filesProcessed || stats.filesProcessed === 0) return null;

  return {
    filesProcessed: stats.filesProcessed,
    symbolsFound: stats.symbolsFound || 0,
  };
}
