/**
 * Federation Approval Manager — Governance Layer for Corpus Callosum
 *
 * Provides a queue-based approval workflow for org→core brain knowledge
 * federation. When an org has `require_approval = true`, items are staged
 * in `federation_pending` instead of being auto-promoted.
 *
 * Admin can then:
 *   - List pending items with sanitization previews
 *   - Approve/reject individual items
 *   - Bulk approve items above a confidence threshold
 *   - View promotion history and audit trail
 *   - Adjust per-org federation settings
 *
 * Integrates with the existing UpstreamPromoter — when approval is required,
 * the promoter queues items here instead of writing directly to core brain.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createPIISanitizer, type SanitizationResult } from './pii-sanitizer';

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// TYPES
// ============================================================================

export interface PendingItem {
  id: string;
  organization_id: string;
  data_type: 'relationship' | 'memory' | 'rule';
  original_record_id: string | null;
  original_data: Record<string, unknown>;
  sanitized_data: Record<string, unknown>;
  sanitization_report: { entitiesRedacted: number; details: { type: string; count: number }[] };
  risk_level: 'safe' | 'warn' | 'block';
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'expired';
  source_domains: string[];
  effect_size: number | null;
  confidence: number | null;
  sample_size: number | null;
  natural_language: string | null;
  queued_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  expires_at: string;
}

export interface ApprovalDecision {
  itemId: string;
  decision: 'approved' | 'rejected';
  decidedBy: string;
  reason?: string;
}

export interface QueueResult {
  queued: number;
  autoApproved: number;
  skippedPII: number;
  skippedDuplicate: number;
  skippedExcluded: number;
}

export interface ApprovalResult {
  itemId: string;
  decision: 'approved' | 'rejected';
  promotedToCore: boolean;
  promotionError?: string;
}

export interface FederationSettings {
  organizationId: string;
  contributeToCoreBrain: boolean;
  requireApproval: boolean;
  approvalThreshold: 'conservative' | 'balanced' | 'aggressive';
  excludedDomains: string[];
  lastUpstreamAt: string | null;
  upstreamItemsContributed: number;
}

export interface FederationHistory {
  items: {
    id: string;
    data_type: string;
    decision: string;
    decided_by: string | null;
    decision_reason: string | null;
    promoted_to_core: boolean;
    created_at: string;
  }[];
  total: number;
}

export interface FederationApprovalManagerConfig {
  verbose?: boolean;
}

// Auto-approval thresholds
const THRESHOLDS = {
  conservative: { minEffectSize: 0.3, minConfidence: 0.9, minSampleSize: 100 },
  balanced: { minEffectSize: 0.2, minConfidence: 0.8, minSampleSize: 50 },
  aggressive: { minEffectSize: 0.15, minConfidence: 0.7, minSampleSize: 30 },
};

// ============================================================================
// FACTORY
// ============================================================================

export function createFederationApprovalManager(
  supabase: SupabaseClient,
  organizationId: string,
  config?: FederationApprovalManagerConfig,
) {
  const verbose = config?.verbose ?? false;
  const sanitizer = createPIISanitizer();

  function log(msg: string): void {
    if (verbose) console.log(`[FederationApproval] ${msg}`);
  }

  // ── Settings ──────────────────────────────────────────────────────────

  /**
   * Get federation settings for this org.
   */
  async function getSettings(): Promise<FederationSettings> {
    const { data } = await supabase
      .from('organization_federation_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    return {
      organizationId,
      contributeToCoreBrain: data?.contribute_to_core_brain ?? true,
      requireApproval: data?.require_approval ?? false,
      approvalThreshold: data?.approval_threshold ?? 'balanced',
      excludedDomains: data?.excluded_domains ?? [],
      lastUpstreamAt: data?.last_upstream_at ?? null,
      upstreamItemsContributed: data?.upstream_items_contributed ?? 0,
    };
  }

  /**
   * Update federation settings for this org.
   */
  async function updateSettings(updates: Partial<{
    contributeToCoreBrain: boolean;
    requireApproval: boolean;
    approvalThreshold: 'conservative' | 'balanced' | 'aggressive';
    excludedDomains: string[];
  }>): Promise<FederationSettings> {
    const upsertData: Record<string, unknown> = {
      organization_id: organizationId,
      updated_at: new Date().toISOString(),
    };

    if (updates.contributeToCoreBrain !== undefined) {
      upsertData.contribute_to_core_brain = updates.contributeToCoreBrain;
    }
    if (updates.requireApproval !== undefined) {
      upsertData.require_approval = updates.requireApproval;
    }
    if (updates.approvalThreshold !== undefined) {
      upsertData.approval_threshold = updates.approvalThreshold;
    }
    if (updates.excludedDomains !== undefined) {
      upsertData.excluded_domains = updates.excludedDomains;
    }

    await supabase
      .from('organization_federation_settings')
      .upsert(upsertData, { onConflict: 'organization_id' });

    return getSettings();
  }

  // ── Queue ─────────────────────────────────────────────────────────────

  /**
   * Queue items for approval (called by upstream promoter when require_approval=true).
   */
  async function queueForApproval(items: {
    dataType: 'relationship' | 'memory' | 'rule';
    originalRecordId?: string;
    originalData: Record<string, unknown>;
    sanitizedData: Record<string, unknown>;
    sanitizationReport: SanitizationResult | null;
    sourceDomains: string[];
    effectSize?: number;
    confidence?: number;
    sampleSize?: number;
    naturalLanguage?: string;
  }[]): Promise<QueueResult> {
    const settings = await getSettings();
    const threshold = THRESHOLDS[settings.approvalThreshold];
    const excludedDomains = new Set(settings.excludedDomains);

    const result: QueueResult = {
      queued: 0,
      autoApproved: 0,
      skippedPII: 0,
      skippedDuplicate: 0,
      skippedExcluded: 0,
    };

    for (const item of items) {
      // Check excluded domains
      if (item.sourceDomains.some(d => excludedDomains.has(d))) {
        result.skippedExcluded++;
        continue;
      }

      // Determine risk level
      const report = item.sanitizationReport;
      let riskLevel: 'safe' | 'warn' | 'block' = 'safe';
      if (report && report.entitiesRedacted > 5) {
        riskLevel = 'block';
      } else if (report && report.entitiesRedacted > 0) {
        riskLevel = 'warn';
      }

      if (riskLevel === 'block') {
        result.skippedPII++;
        continue;
      }

      // Check if this should auto-approve based on threshold
      const meetsAutoApproval = checkAutoApproval(item, threshold);

      const status = meetsAutoApproval ? 'auto_approved' : 'pending';

      // Build diff preview
      const previewDiff = buildPreviewDiff(item.originalData, item.sanitizedData);

      // Insert into pending queue
      const { error } = await supabase.from('federation_pending').insert({
        organization_id: organizationId,
        data_type: item.dataType,
        original_record_id: item.originalRecordId || null,
        original_data: item.originalData,
        sanitized_data: item.sanitizedData,
        sanitization_report: report
          ? { entitiesRedacted: report.entitiesRedacted, details: report.redactionReport }
          : {},
        preview_diff: previewDiff,
        risk_level: riskLevel,
        status,
        source_domains: item.sourceDomains,
        effect_size: item.effectSize ?? null,
        confidence: item.confidence ?? null,
        sample_size: item.sampleSize ?? null,
        natural_language: item.naturalLanguage ?? null,
        decided_at: meetsAutoApproval ? new Date().toISOString() : null,
        decided_by: meetsAutoApproval ? 'auto' : null,
      });

      if (!error) {
        if (meetsAutoApproval) {
          result.autoApproved++;
          // Auto-approved items get promoted immediately
          await promoteToCore(item.dataType, item.sanitizedData);
        } else {
          result.queued++;
        }
      }
    }

    log(`Queued ${result.queued}, auto-approved ${result.autoApproved}, skipped PII=${result.skippedPII} excluded=${result.skippedExcluded}`);
    return result;
  }

  function checkAutoApproval(
    item: { effectSize?: number; confidence?: number; sampleSize?: number },
    threshold: { minEffectSize: number; minConfidence: number; minSampleSize: number },
  ): boolean {
    const effectSize = item.effectSize ?? 0;
    const confidence = item.confidence ?? 0;
    const sampleSize = item.sampleSize ?? 0;

    return (
      effectSize >= threshold.minEffectSize &&
      confidence >= threshold.minConfidence &&
      sampleSize >= threshold.minSampleSize
    );
  }

  function buildPreviewDiff(
    original: Record<string, unknown>,
    sanitized: Record<string, unknown>,
  ): Record<string, { original: unknown; sanitized: unknown }> {
    const diff: Record<string, { original: unknown; sanitized: unknown }> = {};

    for (const key of Object.keys(original)) {
      const origVal = typeof original[key] === 'string' ? original[key] : JSON.stringify(original[key]);
      const sanVal = typeof sanitized[key] === 'string' ? sanitized[key] : JSON.stringify(sanitized[key]);

      if (origVal !== sanVal) {
        diff[key] = { original: original[key], sanitized: sanitized[key] };
      }
    }

    return diff;
  }

  // ── List / Get ────────────────────────────────────────────────────────

  /**
   * List pending items awaiting approval.
   */
  async function listPending(options?: {
    limit?: number;
    offset?: number;
    dataType?: 'relationship' | 'memory' | 'rule';
  }): Promise<{ items: PendingItem[]; total: number }> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let query = supabase
      .from('federation_pending')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('queued_at', { ascending: false });

    if (options?.dataType) {
      query = query.eq('data_type', options.dataType);
    }

    const { data, count } = await query.range(offset, offset + limit - 1);

    return {
      items: (data || []) as PendingItem[],
      total: count ?? 0,
    };
  }

  /**
   * Get a single pending item with full details.
   */
  async function getItem(itemId: string): Promise<PendingItem | null> {
    const { data } = await supabase
      .from('federation_pending')
      .select('*')
      .eq('id', itemId)
      .eq('organization_id', organizationId)
      .single();

    return data as PendingItem | null;
  }

  // ── Approve / Reject ──────────────────────────────────────────────────

  /**
   * Approve a pending item — promotes it to the core brain.
   */
  async function approve(decision: ApprovalDecision): Promise<ApprovalResult> {
    const item = await getItem(decision.itemId);
    if (!item) {
      return { itemId: decision.itemId, decision: 'approved', promotedToCore: false, promotionError: 'Item not found' };
    }

    if (item.status !== 'pending') {
      return { itemId: decision.itemId, decision: 'approved', promotedToCore: false, promotionError: `Item already ${item.status}` };
    }

    // Promote to core brain
    let promotedToCore = false;
    let promotionError: string | undefined;

    try {
      await promoteToCore(item.data_type, item.sanitized_data as Record<string, unknown>);
      promotedToCore = true;
    } catch (err) {
      promotionError = err instanceof Error ? err.message : 'Unknown error';
    }

    // Update pending item
    await supabase
      .from('federation_pending')
      .update({
        status: 'approved',
        decided_at: new Date().toISOString(),
        decided_by: decision.decidedBy,
        decision_reason: decision.reason || null,
      })
      .eq('id', decision.itemId);

    // Audit log
    await supabase.from('federation_approval_log').insert({
      organization_id: organizationId,
      pending_item_id: decision.itemId,
      data_type: item.data_type,
      original_record_id: item.original_record_id,
      decision: 'approved',
      decided_by: decision.decidedBy,
      decision_reason: decision.reason || null,
      sanitization_report: item.sanitization_report,
      promoted_to_core: promotedToCore,
      promotion_error: promotionError || null,
    });

    // Update federation settings counter
    if (promotedToCore) {
      try {
        await supabase.rpc('increment_federation_counter', {
          org_id: organizationId,
          increment_by: 1,
        });
      } catch {
        // Non-critical — RPC may not exist yet
      }
    }

    log(`Approved item ${decision.itemId} (${item.data_type}) — promoted=${promotedToCore}`);

    return {
      itemId: decision.itemId,
      decision: 'approved',
      promotedToCore,
      promotionError,
    };
  }

  /**
   * Reject a pending item.
   */
  async function reject(decision: ApprovalDecision): Promise<ApprovalResult> {
    const item = await getItem(decision.itemId);
    if (!item) {
      return { itemId: decision.itemId, decision: 'rejected', promotedToCore: false, promotionError: 'Item not found' };
    }

    // Update pending item
    await supabase
      .from('federation_pending')
      .update({
        status: 'rejected',
        decided_at: new Date().toISOString(),
        decided_by: decision.decidedBy,
        decision_reason: decision.reason || null,
      })
      .eq('id', decision.itemId);

    // Audit log
    await supabase.from('federation_approval_log').insert({
      organization_id: organizationId,
      pending_item_id: decision.itemId,
      data_type: item.data_type,
      original_record_id: item.original_record_id,
      decision: 'rejected',
      decided_by: decision.decidedBy,
      decision_reason: decision.reason || null,
      sanitization_report: item.sanitization_report,
      promoted_to_core: false,
    });

    log(`Rejected item ${decision.itemId} (${item.data_type})`);

    return { itemId: decision.itemId, decision: 'rejected', promotedToCore: false };
  }

  /**
   * Bulk approve all pending items matching criteria.
   */
  async function bulkApprove(decidedBy: string, options?: {
    dataType?: 'relationship' | 'memory' | 'rule';
    minConfidence?: number;
    riskLevel?: 'safe';
  }): Promise<{ approved: number; failed: number }> {
    let query = supabase
      .from('federation_pending')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    if (options?.dataType) query = query.eq('data_type', options.dataType);
    if (options?.minConfidence) query = query.gte('confidence', options.minConfidence);
    if (options?.riskLevel) query = query.eq('risk_level', options.riskLevel);

    const { data: pendingIds } = await query;
    if (!pendingIds || pendingIds.length === 0) return { approved: 0, failed: 0 };

    let approved = 0;
    let failed = 0;

    for (const { id } of pendingIds) {
      const result = await approve({ itemId: id, decision: 'approved', decidedBy, reason: 'Bulk approval' });
      if (result.promotedToCore) {
        approved++;
      } else {
        failed++;
      }
    }

    return { approved, failed };
  }

  // ── History ───────────────────────────────────────────────────────────

  /**
   * Get federation promotion history.
   */
  async function getHistory(options?: {
    limit?: number;
    offset?: number;
  }): Promise<FederationHistory> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const { data, count } = await supabase
      .from('federation_approval_log')
      .select('id, data_type, decision, decided_by, decision_reason, promoted_to_core, created_at', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return {
      items: (data || []) as FederationHistory['items'],
      total: count ?? 0,
    };
  }

  // ── Expire ────────────────────────────────────────────────────────────

  /**
   * Expire old pending items that haven't been reviewed.
   */
  async function expirePending(): Promise<number> {
    const { data } = await supabase
      .from('federation_pending')
      .update({ status: 'expired', decided_at: new Date().toISOString(), decided_by: 'system' })
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('id');

    const expired = data?.length ?? 0;

    // Log expirations
    if (data && data.length > 0) {
      const logs = data.map((item: any) => ({
        organization_id: organizationId,
        pending_item_id: item.id,
        data_type: 'unknown', // We'd need a join, but this is for audit only
        decision: 'expired',
        decided_by: 'system',
        decision_reason: 'Expired after 7 days without review',
        promoted_to_core: false,
      }));
      await supabase.from('federation_approval_log').insert(logs);
    }

    log(`Expired ${expired} pending items`);
    return expired;
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  /**
   * Get federation stats for dashboard.
   */
  async function getStats(): Promise<{
    pendingCount: number;
    approvedToday: number;
    rejectedToday: number;
    autoApprovedToday: number;
    totalPromotedAllTime: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const [pending, approvedToday, rejectedToday, autoApproved, settings] = await Promise.all([
      supabase.from('federation_pending').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('status', 'pending'),
      supabase.from('federation_approval_log').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('decision', 'approved').gte('created_at', todayStr),
      supabase.from('federation_approval_log').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('decision', 'rejected').gte('created_at', todayStr),
      supabase.from('federation_approval_log').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('decision', 'auto_approved').gte('created_at', todayStr),
      getSettings(),
    ]);

    return {
      pendingCount: pending.count ?? 0,
      approvedToday: approvedToday.count ?? 0,
      rejectedToday: rejectedToday.count ?? 0,
      autoApprovedToday: autoApproved.count ?? 0,
      totalPromotedAllTime: settings.upstreamItemsContributed,
    };
  }

  // ── Core Promotion ────────────────────────────────────────────────────

  /**
   * Promote a sanitized item to the core brain.
   */
  async function promoteToCore(
    dataType: string,
    sanitizedData: Record<string, unknown>,
  ): Promise<void> {
    const data: Record<string, unknown> = { ...sanitizedData, organization_id: CORE_BRAIN_ORG_ID };

    // Remove fields that shouldn't transfer
    delete data.id;
    delete data._source;

    switch (dataType) {
      case 'relationship':
        await supabase
          .from('causal_relationships_statistical')
          .upsert(
            { ...data, last_computed_at: new Date().toISOString() },
            { onConflict: 'organization_id,source_domain,target_domain' }
          );
        break;

      case 'memory':
        await supabase
          .from('ai_memory')
          .insert({ ...data, created_at: new Date().toISOString() });
        break;

      case 'rule':
        await supabase
          .from('brain_grammar_rules')
          .insert({ ...data, created_at: new Date().toISOString() });
        break;
    }

    // Log to existing upstream log for backwards compatibility
    await supabase.from('federation_upstream_log').insert({
      source_organization_id: organizationId,
      data_type: dataType,
      original_record_id: (sanitizedData as any).original_record_id || null,
      sanitization_report: {},
    });
  }

  return {
    // Settings
    getSettings,
    updateSettings,
    // Queue
    queueForApproval,
    // List / Get
    listPending,
    getItem,
    // Approve / Reject
    approve,
    reject,
    bulkApprove,
    // History
    getHistory,
    // Maintenance
    expirePending,
    // Stats
    getStats,
  };
}
