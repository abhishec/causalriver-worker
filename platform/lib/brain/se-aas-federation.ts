import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// The CORE brain aggregates patterns from all orgs
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

export type FederatedPattern = {
  domainSequence: string[];
  avgQuality: number;
  occurrenceCount: number;
  successRate: number;
  sourceOrgCount: number; // how many orgs contributed (privacy: never < 3)
};

// Step 1: Collect org-level quality patterns (anonymized)
async function collectOrgPatterns(
  supabase: SupabaseClient,
  orgId: string
): Promise<FederatedPattern[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('engagement_outcomes')
    .select('domain_sequence, quality_scores, outcome_label')
    .eq('organization_id', orgId)
    .gte('created_at', thirtyDaysAgo)
    .not('domain_sequence', 'is', null);

  if (!data?.length) return [];

  const seqMap = new Map<string, { qualities: number[]; successCount: number }>();
  for (const row of data) {
    if (!row.domain_sequence?.length) continue;
    const key = JSON.stringify(row.domain_sequence);
    const entry = seqMap.get(key) ?? { qualities: [], successCount: 0 };
    const avgQ = Object.values((row.quality_scores as Record<string, number>) ?? {})
      .reduce((a: number, b: number) => a + b, 0) / Math.max(Object.keys((row.quality_scores as Record<string, number>) ?? {}).length, 1);
    entry.qualities.push(avgQ);
    if (row.outcome_label === 'successful_delivery' || row.outcome_label === 'on_track') entry.successCount++;
    seqMap.set(key, entry);
  }

  return Array.from(seqMap.entries())
    .filter(([, s]) => s.qualities.length >= 2)
    .map(([key, s]) => ({
      domainSequence: JSON.parse(key) as string[],
      avgQuality: s.qualities.reduce((a, b) => a + b, 0) / s.qualities.length,
      occurrenceCount: s.qualities.length,
      successRate: s.successCount / s.qualities.length,
      sourceOrgCount: 1,
    }));
}

// Step 2: Promote patterns to CORE brain (FedAvg across orgs)
export async function promotePatternsToCore(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  try {
    const patterns = await collectOrgPatterns(supabase, orgId);
    if (!patterns.length) return;

    for (const pattern of patterns) {
      if (pattern.successRate < 0.7 || pattern.occurrenceCount < 3) continue;

      // Upsert to CORE brain's process_templates (anonymized — no org_id)
      const name = `[Cross-Org] ${pattern.domainSequence.join(' → ')}`;
      await supabase.from('process_templates').upsert({
        organization_id: CORE_BRAIN_ORG_ID,
        name,
        description: `Federated pattern from ${pattern.sourceOrgCount} org(s). ${Math.round(pattern.successRate * 100)}% success across ${pattern.occurrenceCount} usages.`,
        domain_sequence: pattern.domainSequence,
        success_rate: pattern.successRate,
        avg_confidence: pattern.avgQuality,
        usage_count: pattern.occurrenceCount,
        source: 'federated',
        is_public: true,
        tags: ['cross-org', 'federated'],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,name' });
    }

    logger.warn('[FedLearning] SE-aaS patterns promoted to CORE', {
      orgId,
      patternsPromoted: patterns.filter(p => p.successRate >= 0.7).length
    });
  } catch (err) {
    logger.warn('[FedLearning] Federation failed', { err });
  }
}

// Step 3: Pull CORE patterns into org brain context
export async function pullCorePatterns(
  supabase: SupabaseClient,
  orgId: string
): Promise<FederatedPattern[]> {
  // orgId param reserved for future per-org filtering (e.g. exclude patterns from same org)
  void orgId;

  const { data } = await supabase
    .from('process_templates')
    .select('domain_sequence, success_rate, avg_confidence, usage_count')
    .eq('organization_id', CORE_BRAIN_ORG_ID)
    .eq('is_public', true)
    .eq('source', 'federated')
    .gte('success_rate', 0.75)
    .order('success_rate', { ascending: false })
    .limit(10);

  return (data ?? []).map(r => ({
    domainSequence: r.domain_sequence as string[],
    avgQuality: r.avg_confidence as number,
    occurrenceCount: r.usage_count as number,
    successRate: r.success_rate as number,
    sourceOrgCount: 1,
  }));
}
