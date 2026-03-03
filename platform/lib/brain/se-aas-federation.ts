/**
 * Brain Federation (ADR-025)
 * ==========================
 * Collects quality patterns from engagement_outcomes across all AI Worker
 * executions (SE-aaS, AaaS, PM-aaS, Process Engine, overnight agents) and
 * promotes high-quality patterns to the CORE brain for cross-org federation.
 *
 * Previously: SE-aaS-specific (only pod-match, early-warning, scope-creep).
 * Now: Generic — any domain that calls recordBrainLearning() contributes.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { CORE_BRAIN_ORG_ID, ensureCoreBrain } from "@/lib/brain/core-brain";

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
    .select('domain_sequence, confidence, outcome_label')
    .eq('organization_id', orgId)
    .gte('created_at', thirtyDaysAgo)
    .not('domain_sequence', 'is', null)
    .neq('domain_sequence', '[]');  // ADR-025: skip legacy empty arrays

  if (!data?.length) return [];

  const seqMap = new Map<string, { confidences: number[]; successCount: number }>();
  for (const row of data) {
    if (!row.domain_sequence?.length) continue;
    const key = JSON.stringify(row.domain_sequence);
    const entry = seqMap.get(key) ?? { confidences: [], successCount: 0 };
    // confidence is a scalar float (0-1) stored directly on the row
    const conf = typeof row.confidence === 'number' ? row.confidence : 0;
    entry.confidences.push(conf);
    if (row.outcome_label === 'success' || row.outcome_label === 'successful_delivery' || row.outcome_label === 'on_track') entry.successCount++;
    seqMap.set(key, entry);
  }

  return Array.from(seqMap.entries())
    .filter(([, s]) => s.confidences.length >= 2)
    .map(([key, s]) => ({
      domainSequence: JSON.parse(key) as string[],
      avgQuality: s.confidences.reduce((a, b) => a + b, 0) / s.confidences.length,
      occurrenceCount: s.confidences.length,
      successRate: s.successCount / s.confidences.length,
      sourceOrgCount: 1,
    }));
}

// Step 2: Promote patterns to CORE brain (FedAvg across orgs)
export async function promotePatternsToCore(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  try {
    // Ensure CORE brain org exists before attempting to write to it
    const coreOk = await ensureCoreBrain(supabase);
    if (!coreOk) {
      logger.warn("[FedLearning] CORE brain org unavailable — skipping federation for org", { orgId });
      return;
    }

    const patterns = await collectOrgPatterns(supabase, orgId);
    if (!patterns.length) return;

    for (const pattern of patterns) {
      if (pattern.successRate < 0.5 || pattern.occurrenceCount < 2) continue;

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

    logger.warn('[FedLearning] Brain patterns promoted to CORE', {
      orgId,
      patternsPromoted: patterns.filter(p => p.successRate >= 0.5).length
    });
  } catch (err) {
    logger.warn('[FedLearning] Federation failed', { err });
  }
}

/**
 * Promotes repeated negative (gaba) signals into federated_knowledge as warning entries.
 * These are written with confidence=0.75 so buildRLPrimer() picks them up and warns the LLM.
 * Content is prefixed with "⚠️ AVOID PATTERN:" so the LLM understands these are anti-patterns.
 *
 * Criteria: domain has 2+ gaba/norepinephrine signals in last 14 days.
 */
export async function promoteGabaPatternsToKnowledge(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('cross_domain_signals')
      .select('target_domain, signal_value, signal_strength, payload')
      .eq('organization_id', orgId)
      .in('signal_value', ['gaba', 'norepinephrine'])
      .gte('created_at', fourteenDaysAgo)
      .limit(100);

    if (!data?.length) return 0;

    // Group by domain and count gaba occurrences
    const domainGabaMap = new Map<string, { count: number; payloads: unknown[] }>();
    for (const row of data) {
      const domain = row.target_domain as string;
      const entry = domainGabaMap.get(domain) ?? { count: 0, payloads: [] };
      entry.count++;
      if (row.payload) entry.payloads.push(row.payload);
      domainGabaMap.set(domain, entry);
    }

    let promoted = 0;
    for (const [domain, { count, payloads }] of domainGabaMap) {
      if (count < 2) continue; // Need at least 2 negative signals before warning

      // Extract common failure patterns from payloads
      const failureHints = payloads
        .slice(0, 3)
        .map(p => {
          if (!p || typeof p !== 'object') return null;
          const payload = p as Record<string, unknown>;
          return payload.errorMessage ?? payload.task_description ?? payload.resultSummary ?? null;
        })
        .filter(Boolean)
        .join('; ')
        .slice(0, 200);

      const content = `⚠️ AVOID PATTERN: The domain "${domain}" has received ${count} negative feedback signal(s) recently. ${failureHints ? `Common issues: ${failureHints}` : 'Users found responses unhelpful or incorrect.'} Consider being more cautious, asking clarifying questions, or admitting uncertainty for this domain.`;

      // SELECT-first approach — avoids dependency on a unique constraint
      const { data: existing } = await supabase
        .from('federated_knowledge')
        .select('id, created_at')
        .eq('organization_id', orgId)
        .eq('domain', domain)
        .eq('source', 'gaba_promotion')
        .maybeSingle();

      if (existing) {
        // Update existing warning entry
        await supabase
          .from('federated_knowledge')
          .update({ content, confidence: 0.75, created_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        // Insert new warning entry
        await supabase.from('federated_knowledge').insert({
          organization_id: orgId,
          domain,
          content,
          confidence: 0.75,
          source: 'gaba_promotion',
        });
      }

      promoted++;
    }

    if (promoted > 0) {
      logger.warn('[FedLearning] promoteGabaPatternsToKnowledge: promoted gaba patterns', {
        orgId,
        promoted,
      });
    }

    return promoted;
  } catch (err) {
    logger.warn('[FedLearning] promoteGabaPatternsToKnowledge failed', { err, orgId });
    return 0;
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
