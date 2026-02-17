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
import { createPIISanitizer, type PIISanitizerConfig, type SanitizationResult } from './pii-sanitizer';
import { createFederationApprovalManager } from './federation-approval-manager';
import { checkSemanticNovelty, domainSimilarity } from './semantic-federation';

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
  /** Items queued for manual approval (when require_approval=true) */
  itemsQueued: number;
  /** Items auto-approved by threshold (when require_approval=true) */
  itemsAutoApproved: number;
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

/** Optional observability callback for federation operations */
export interface UpstreamPromoterObservability {
  onFederationOperation?: (data: {
    operationType: 'upstream_promotion';
    itemsProcessed: number;
    itemsPromoted: number;
    itemsRejected: number;
    piiRedacted: number;
    durationMs: number;
  }) => void;
}

export function createUpstreamPromoter(
  supabase: SupabaseClient,
  organizationId: string,
  config?: UpstreamPromoterConfig,
  observability?: UpstreamPromoterObservability,
) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const sanitizer = createPIISanitizer(config?.sanitizerConfig);

  /**
   * Promote anonymized org knowledge to the core brain.
   */
  async function promoteKnowledge(): Promise<UpstreamPromotionResult> {
    const _promoteStartMs = Date.now();

    // Don't promote from the core brain to itself
    if (organizationId === CORE_BRAIN_ORG_ID) {
      return emptyResult();
    }

    // 1. Check federation settings
    const { data: settingsRow } = await supabase
      .from('organization_federation_settings')
      .select('contribute_to_core_brain, excluded_domains, require_approval')
      .eq('organization_id', organizationId)
      .single();

    // Default is ON if no settings row exists
    const contributeEnabled = settingsRow?.contribute_to_core_brain ?? true;
    const excludedDomains = new Set<string>(settingsRow?.excluded_domains || []);
    const requireApproval = settingsRow?.require_approval ?? false;

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
      itemsQueued: 0,
      itemsAutoApproved: 0,
    };

    let totalPromoted = 0;

    // If approval is required, route through approval manager instead of direct promotion
    const approvalManager = requireApproval
      ? createFederationApprovalManager(supabase, organizationId)
      : null;

    // 2. Promote relationships
    totalPromoted += await promoteRelationships(excludedDomains, result, approvalManager);

    // 3. Promote memories (if under limit)
    if (totalPromoted < cfg.maxItemsPerRun) {
      totalPromoted += await promoteMemories(excludedDomains, result, cfg.maxItemsPerRun - totalPromoted, approvalManager);
    }

    // 4. Promote rules (if under limit)
    if (totalPromoted < cfg.maxItemsPerRun) {
      await promoteRules(excludedDomains, result, cfg.maxItemsPerRun - totalPromoted, approvalManager);
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

    // OBSERVABILITY WIRE: Record upstream promotion to obs_* tables
    if (observability?.onFederationOperation) {
      try {
        const totalPromotedCount = result.relationshipsPromoted + result.memoriesPromoted + result.rulesPromoted;
        observability.onFederationOperation({
          operationType: 'upstream_promotion',
          itemsProcessed: totalPromotedCount + result.itemsSkippedPII + result.itemsSkippedDuplicate + result.itemsSkippedExcluded,
          itemsPromoted: totalPromotedCount,
          itemsRejected: result.itemsSkippedPII + result.itemsSkippedExcluded,
          piiRedacted: result.itemsSkippedPII,
          durationMs: Date.now() - _promoteStartMs,
        });
      } catch { /* observability never breaks federation */ }
    }

    return result;
  }

  /**
   * Promote high-confidence causal relationships.
   */
  async function promoteRelationships(
    excludedDomains: Set<string>,
    result: UpstreamPromotionResult,
    approvalManager?: ReturnType<typeof createFederationApprovalManager> | null,
  ): Promise<number> {
    const { data: orgRels } = await supabase
      .from('causal_relationships_statistical')
      .select('id, source_domain, target_domain, effect_size, sample_size, evidence_weight, natural_language, is_significant, optimal_lag_days')
      .eq('organization_id', organizationId)
      .eq('is_significant', true)
      .gte('effect_size', cfg.minEffectSize)
      .gte('sample_size', cfg.minSampleSize)
      .order('effect_size', { ascending: false })
      .limit(cfg.maxItemsPerRun);

    if (!orgRels || orgRels.length === 0) return 0;

    // Fetch existing core brain relationships for dedup (semantic + exact)
    const { data: coreRels } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, natural_language')
      .eq('organization_id', CORE_BRAIN_ORG_ID)
      .limit(2000);

    const coreKeys = new Set(
      (coreRels || []).map((r: any) => `${r.source_domain}::${r.target_domain}`)
    );

    // Build semantic comparison texts from existing CORE relationships
    const coreRelTexts = (coreRels || []).map((r: any) => ({
      text: `${r.source_domain} causes ${r.target_domain} ${r.natural_language || ''}`.trim(),
    }));

    let promoted = 0;

    for (const rel of orgRels) {
      // Check excluded domains (also check semantic domain similarity for excluded)
      const isExcluded = Array.from(excludedDomains).some(excluded =>
        rel.source_domain === excluded ||
        rel.target_domain === excluded ||
        domainSimilarity(rel.source_domain, excluded) > 0.85 ||
        domainSimilarity(rel.target_domain, excluded) > 0.85
      );
      if (isExcluded) {
        result.itemsSkippedExcluded++;
        continue;
      }

      // Check dedup: exact string match first, then semantic novelty
      const key = `${rel.source_domain}::${rel.target_domain}`;
      if (coreKeys.has(key)) {
        result.itemsSkippedDuplicate++;
        continue;
      }

      // Semantic novelty: "eng → churn" and "engineering → customer_loss" are the same insight
      if (coreRelTexts.length > 0) {
        const relText = `${rel.source_domain} causes ${rel.target_domain} ${rel.natural_language || ''}`.trim();
        const novelty = checkSemanticNovelty(relText, coreRelTexts);
        if (!novelty.isNovel) {
          result.itemsSkippedDuplicate++;
          continue;
        }
      }

      // Sanitize
      const { sanitized, report, skip } = sanitizer.sanitizeRelationship(rel);
      if (skip) {
        result.itemsSkippedPII++;
        continue;
      }

      // Route through approval queue or promote directly
      if (approvalManager) {
        const queueResult = await approvalManager.queueForApproval([{
          dataType: 'relationship',
          originalRecordId: rel.id,
          originalData: rel,
          sanitizedData: sanitized,
          sanitizationReport: report,
          sourceDomains: [rel.source_domain, rel.target_domain],
          effectSize: rel.effect_size,
          confidence: rel.evidence_weight,
          sampleSize: rel.sample_size,
          naturalLanguage: sanitized.natural_language,
        }]);
        result.itemsQueued += queueResult.queued;
        result.itemsAutoApproved += queueResult.autoApproved;
        if (queueResult.autoApproved > 0) {
          result.relationshipsPromoted++;
          promoted++;
        }
      } else {
        // Direct promotion (no approval required)
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
    approvalManager?: ReturnType<typeof createFederationApprovalManager> | null,
  ): Promise<number> {
    const { data: orgMems } = await supabase
      .from('ai_memory')
      .select('id, domain, content, title, memory_type, importance, organization_id')
      .eq('organization_id', organizationId)
      .gte('importance', cfg.minConfidence)
      .order('importance', { ascending: false })
      .limit(limit);

    if (!orgMems || orgMems.length === 0) return 0;

    // Fetch existing core brain memories for semantic dedup
    const { data: coreMems } = await supabase
      .from('ai_memory')
      .select('domain, content, title')
      .eq('organization_id', CORE_BRAIN_ORG_ID)
      .limit(200);

    // Build semantic comparison corpus from CORE memories
    const coreMemTexts = (coreMems || []).map((m: any) => ({
      text: `${m.title || ''} ${m.domain || ''} ${
        typeof m.content === 'string' ? m.content.substring(0, 200) : JSON.stringify(m.content || '').substring(0, 200)
      }`.trim(),
    }));

    let promoted = 0;

    for (const mem of orgMems) {
      // Check excluded domains (with semantic domain similarity)
      if (mem.domain) {
        const isExcluded = Array.from(excludedDomains).some(excluded =>
          mem.domain === excluded || domainSimilarity(mem.domain, excluded) > 0.85
        );
        if (isExcluded) {
          result.itemsSkippedExcluded++;
          continue;
        }
      }

      // Sanitize
      const { sanitized, report, skip } = sanitizer.sanitizeMemory(mem);
      if (skip) {
        result.itemsSkippedPII++;
        continue;
      }

      // Semantic novelty check (replaces string-based dedup)
      if (coreMemTexts.length > 0) {
        const memText = `${sanitized.title || mem.title || ''} ${sanitized.domain || ''} ${
          typeof sanitized.content === 'string' ? sanitized.content.substring(0, 200) : JSON.stringify(sanitized.content || '').substring(0, 200)
        }`.trim();
        const novelty = checkSemanticNovelty(memText, coreMemTexts);
        if (!novelty.isNovel) {
          result.itemsSkippedDuplicate++;
          continue;
        }
      }

      if (approvalManager) {
        const queueResult = await approvalManager.queueForApproval([{
          dataType: 'memory',
          originalRecordId: mem.id,
          originalData: mem,
          sanitizedData: sanitized,
          sanitizationReport: report,
          sourceDomains: mem.domain ? [mem.domain] : [],
          confidence: mem.importance,
          naturalLanguage: sanitized.content,
        }]);
        result.itemsQueued += queueResult.queued;
        result.itemsAutoApproved += queueResult.autoApproved;
        if (queueResult.autoApproved > 0) {
          result.memoriesPromoted++;
          promoted++;
        }
      } else {
        // Direct promotion
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

          await logPromotion('memory', mem.id, report);
        }
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
    approvalManager?: ReturnType<typeof createFederationApprovalManager> | null,
  ): Promise<number> {
    const { data: orgRules } = await supabase
      .from('brain_grammar_rules')
      .select('id, domain, rule_type, natural_language, confidence, is_active, organization_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .gte('confidence', cfg.minConfidence)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (!orgRules || orgRules.length === 0) return 0;

    // Fetch existing core brain rules for semantic dedup
    const { data: coreRules } = await supabase
      .from('brain_grammar_rules')
      .select('domain, rule_type, natural_language')
      .eq('organization_id', CORE_BRAIN_ORG_ID)
      .limit(200);

    // Build semantic comparison corpus from CORE rules
    const coreRuleTexts = (coreRules || []).map((r: any) => ({
      text: `${r.rule_type || ''} ${r.domain || ''} ${r.natural_language || ''}`.trim(),
    }));

    let promoted = 0;

    for (const rule of orgRules) {
      // Check excluded domains (with semantic domain similarity)
      if (rule.domain) {
        const isExcluded = Array.from(excludedDomains).some(excluded =>
          rule.domain === excluded || domainSimilarity(rule.domain, excluded) > 0.85
        );
        if (isExcluded) {
          result.itemsSkippedExcluded++;
          continue;
        }
      }

      // Sanitize
      const { sanitized, report, skip } = sanitizer.sanitizeRule(rule);
      if (skip) {
        result.itemsSkippedPII++;
        continue;
      }

      // Semantic novelty check (replaces string-based dedup)
      if (coreRuleTexts.length > 0) {
        const ruleText = `${sanitized.rule_type || ''} ${sanitized.domain || ''} ${sanitized.natural_language || ''}`.trim();
        const novelty = checkSemanticNovelty(ruleText, coreRuleTexts);
        if (!novelty.isNovel) {
          result.itemsSkippedDuplicate++;
          continue;
        }
      }

      if (approvalManager) {
        const queueResult = await approvalManager.queueForApproval([{
          dataType: 'rule',
          originalRecordId: rule.id,
          originalData: rule,
          sanitizedData: sanitized,
          sanitizationReport: report,
          sourceDomains: rule.domain ? [rule.domain] : [],
          confidence: rule.confidence,
          naturalLanguage: sanitized.natural_language,
        }]);
        result.itemsQueued += queueResult.queued;
        result.itemsAutoApproved += queueResult.autoApproved;
        if (queueResult.autoApproved > 0) {
          result.rulesPromoted++;
          promoted++;
        }
      } else {
        // Direct promotion
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

          await logPromotion('rule', rule.id, report);
        }
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
    itemsQueued: 0,
    itemsAutoApproved: 0,
  };
}
