/**
 * Upstream Promoter — Anonymized Org→Core Brain Knowledge Federation
 *
 * Promotes high-confidence, org-discovered knowledge to the core brain
 * after anonymizing all PII. This enables collective intelligence:
 * patterns discovered by one org benefit all orgs via the core brain.
 *
 * Safety guarantees:
 *   - All text fields are sanitized via PII sanitizer (zero API calls)
 *   - organization_id is always replaced with CORE_BRAIN_ORG_ID
 *   - Items with >50% PII density are skipped entirely
 *   - Per-org opt-out via organization_federation_settings.contribute_to_core_brain
 *   - All promotions are logged to federation_upstream_log for audit
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createPIISanitizer, type PIISanitizerConfig } from './pii-sanitizer';

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// TYPES
// ============================================================================

export interface UpstreamPromotionResult {
  relationshipsPromoted: number;
  memoriesPromoted: number;
  rulesPromoted: number;
  itemsSkippedPII: number;
  itemsSkippedDuplicate: number;
  itemsSkippedExcluded: number;
}

export interface UpstreamPromoterConfig {
  /** Minimum effect size for relationships (default: 0.15) */
  minEffectSize?: number;
  /** Minimum confidence/importance for memories and rules (default: 0.7) */
  minConfidence?: number;
  /** Minimum sample size for relationships (default: 30) */
  minSampleSize?: number;
  /** Max items to promote per run (default: 20) */
  maxItemsPerRun?: number;
  /** PII sanitizer config */
  sanitizerConfig?: PIISanitizerConfig;
}

const DEFAULT_CONFIG: Required<Omit<UpstreamPromoterConfig, 'sanitizerConfig'>> = {
  minEffectSize: 0.15,
  minConfidence: 0.7,
  minSampleSize: 30,
  maxItemsPerRun: 20,
};

// ============================================================================
// FACTORY
// ============================================================================

export function createUpstreamPromoter(
  supabase: SupabaseClient,
  organizationId: string,
  config?: UpstreamPromoterConfig,
) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const sanitizer = createPIISanitizer(config?.sanitizerConfig);

  /**
   * Promote anonymized org knowledge to the core brain.
   */
  async function promoteKnowledge(): Promise<UpstreamPromotionResult> {
    // Don't promote from the core brain to itself
    if (organizationId === CORE_BRAIN_ORG_ID) {
      return emptyResult();
    }

    // 1. Check federation settings
    const { data: settingsRow } = await supabase
      .from('organization_federation_settings')
      .select('contribute_to_core_brain, excluded_domains')
      .eq('organization_id', organizationId)
      .single();

    // Default is ON if no settings row exists
    const contributeEnabled = settingsRow?.contribute_to_core_brain ?? true;
    const excludedDomains = new Set<string>(settingsRow?.excluded_domains || []);

    if (!contributeEnabled) {
      return emptyResult();
    }

    const result: UpstreamPromotionResult = {
      relationshipsPromoted: 0,
      memoriesPromoted: 0,
      rulesPromoted: 0,
      itemsSkippedPII: 0,
      itemsSkippedDuplicate: 0,
      itemsSkippedExcluded: 0,
    };

    let totalPromoted = 0;

    // 2. Promote relationships
    totalPromoted += await promoteRelationships(excludedDomains, result);

    // 3. Promote memories (if under limit)
    if (totalPromoted < cfg.maxItemsPerRun) {
      totalPromoted += await promoteMemories(excludedDomains, result, cfg.maxItemsPerRun - totalPromoted);
    }

    // 4. Promote rules (if under limit)
    if (totalPromoted < cfg.maxItemsPerRun) {
      await promoteRules(excludedDomains, result, cfg.maxItemsPerRun - totalPromoted);
    }

    // 5. Update federation settings with promotion timestamp
    await supabase
      .from('organization_federation_settings')
      .upsert(
        {
          organization_id: organizationId,
          last_upstream_at: new Date().toISOString(),
          upstream_items_contributed:
            (settingsRow as any)?.upstream_items_contributed
              ? (settingsRow as any).upstream_items_contributed + totalPromoted
              : totalPromoted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' }
      );

    return result;
  }

  /**
   * Promote high-confidence causal relationships.
   */
  async function promoteRelationships(
    excludedDomains: Set<string>,
    result: UpstreamPromotionResult,
  ): Promise<number> {
    const { data: orgRels } = await supabase
      .from('causal_relationships_statistical')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_significant', true)
      .gte('effect_size', cfg.minEffectSize)
      .gte('sample_size', cfg.minSampleSize)
      .order('effect_size', { ascending: false })
      .limit(cfg.maxItemsPerRun);

    if (!orgRels || orgRels.length === 0) return 0;

    // Fetch existing core brain relationships for dedup
    const { data: coreRels } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain')
      .eq('organization_id', CORE_BRAIN_ORG_ID);

    const coreKeys = new Set(
      (coreRels || []).map((r: any) => `${r.source_domain}::${r.target_domain}`)
    );

    let promoted = 0;

    for (const rel of orgRels) {
      // Check excluded domains
      if (excludedDomains.has(rel.source_domain) || excludedDomains.has(rel.target_domain)) {
        result.itemsSkippedExcluded++;
        continue;
      }

      // Check dedup
      const key = `${rel.source_domain}::${rel.target_domain}`;
      if (coreKeys.has(key)) {
        result.itemsSkippedDuplicate++;
        continue;
      }

      // Sanitize
      const { sanitized, report, skip } = sanitizer.sanitizeRelationship(rel);
      if (skip) {
        result.itemsSkippedPII++;
        continue;
      }

      // Insert into core brain
      const { error } = await supabase
        .from('causal_relationships_statistical')
        .upsert(
          {
            ...sanitized,
            organization_id: CORE_BRAIN_ORG_ID,
            last_computed_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,source_domain,target_domain' }
        );

      if (!error) {
        result.relationshipsPromoted++;
        promoted++;
        coreKeys.add(key);

        // Audit log
        await logPromotion('relationship', rel.id, report);
      }
    }

    return promoted;
  }

  /**
   * Promote high-importance memories.
   */
  async function promoteMemories(
    excludedDomains: Set<string>,
    result: UpstreamPromotionResult,
    limit: number,
  ): Promise<number> {
    const { data: orgMems } = await supabase
      .from('ai_memory')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('importance', cfg.minConfidence)
      .order('importance', { ascending: false })
      .limit(limit);

    if (!orgMems || orgMems.length === 0) return 0;

    // Fetch existing core brain memories for dedup
    const { data: coreMems } = await supabase
      .from('ai_memory')
      .select('domain, content')
      .eq('organization_id', CORE_BRAIN_ORG_ID);

    const coreKeys = new Set(
      (coreMems || []).map((m: any) => `${m.domain}::${(m.content || '').substring(0, 80)}`)
    );

    let promoted = 0;

    for (const mem of orgMems) {
      // Check excluded domains
      if (mem.domain && excludedDomains.has(mem.domain)) {
        result.itemsSkippedExcluded++;
        continue;
      }

      // Sanitize
      const { sanitized, report, skip } = sanitizer.sanitizeMemory(mem);
      if (skip) {
        result.itemsSkippedPII++;
        continue;
      }

      // Check dedup (after sanitization, since content changes)
      const key = `${sanitized.domain}::${(sanitized.content || '').substring(0, 80)}`;
      if (coreKeys.has(key)) {
        result.itemsSkippedDuplicate++;
        continue;
      }

      // Insert into core brain
      const { error } = await supabase
        .from('ai_memory')
        .insert({
          ...sanitized,
          organization_id: CORE_BRAIN_ORG_ID,
          created_at: new Date().toISOString(),
        });

      if (!error) {
        result.memoriesPromoted++;
        promoted++;
        coreKeys.add(key);

        await logPromotion('memory', mem.id, report);
      }
    }

    return promoted;
  }

  /**
   * Promote high-confidence brain grammar rules.
   */
  async function promoteRules(
    excludedDomains: Set<string>,
    result: UpstreamPromotionResult,
    limit: number,
  ): Promise<number> {
    const { data: orgRules } = await supabase
      .from('brain_grammar_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .gte('confidence', cfg.minConfidence)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (!orgRules || orgRules.length === 0) return 0;

    // Fetch existing core brain rules for dedup
    const { data: coreRules } = await supabase
      .from('brain_grammar_rules')
      .select('domain, rule_type, natural_language')
      .eq('organization_id', CORE_BRAIN_ORG_ID);

    const coreKeys = new Set(
      (coreRules || []).map(
        (r: any) => `${r.domain}::${r.rule_type}::${(r.natural_language || '').substring(0, 50)}`
      )
    );

    let promoted = 0;

    for (const rule of orgRules) {
      // Check excluded domains
      if (rule.domain && excludedDomains.has(rule.domain)) {
        result.itemsSkippedExcluded++;
        continue;
      }

      // Sanitize
      const { sanitized, report, skip } = sanitizer.sanitizeRule(rule);
      if (skip) {
        result.itemsSkippedPII++;
        continue;
      }

      // Check dedup (after sanitization)
      const key = `${sanitized.domain}::${sanitized.rule_type}::${(sanitized.natural_language || '').substring(0, 50)}`;
      if (coreKeys.has(key)) {
        result.itemsSkippedDuplicate++;
        continue;
      }

      // Insert into core brain
      const { error } = await supabase
        .from('brain_grammar_rules')
        .insert({
          ...sanitized,
          organization_id: CORE_BRAIN_ORG_ID,
          created_at: new Date().toISOString(),
        });

      if (!error) {
        result.rulesPromoted++;
        promoted++;
        coreKeys.add(key);

        await logPromotion('rule', rule.id, report);
      }
    }

    return promoted;
  }

  /**
   * Log a promotion event to the audit table.
   */
  async function logPromotion(
    dataType: string,
    originalRecordId: string | undefined,
    report: { entitiesRedacted: number; redactionReport: { type: string; count: number }[] } | null,
  ): Promise<void> {
    await supabase.from('federation_upstream_log').insert({
      source_organization_id: organizationId,
      data_type: dataType,
      original_record_id: originalRecordId || null,
      sanitization_report: report
        ? { entitiesRedacted: report.entitiesRedacted, details: report.redactionReport }
        : {},
    });
  }

  return { promoteKnowledge };
}

function emptyResult(): UpstreamPromotionResult {
  return {
    relationshipsPromoted: 0,
    memoriesPromoted: 0,
    rulesPromoted: 0,
    itemsSkippedPII: 0,
    itemsSkippedDuplicate: 0,
    itemsSkippedExcluded: 0,
  };
}
