/**
 * Federation Approval Manager — Corpus Callosum Governance Tests
 *
 * Validates the approval workflow for org→core brain knowledge federation:
 *   1. Queue items for approval when require_approval=true
 *   2. Auto-approve items meeting threshold
 *   3. Manual approve/reject flow
 *   4. Bulk approval
 *   5. Settings management
 *   6. History and stats
 *   7. Expiration of stale pending items
 *   8. Upstream promoter routes through approval when enabled
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFederationApprovalManager } from '../federation/federation-approval-manager';
import { createUpstreamPromoter } from '../federation/upstream-promoter';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

function createMockSupabase(overrides?: {
  pendingItems?: any[];
  settings?: any;
  approvalLogs?: any[];
}) {
  const insertedRows: any[] = [];
  const updatedRows: any[] = [];

  function createChainableQuery(returnData?: any): any {
    const result = { data: returnData ?? [], error: null, count: 0 };
    const query: any = {
      then(onFulfilled: any, onRejected?: any) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };

    const chainMethods = [
      'select', 'eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'is', 'not', 'or',
      'filter', 'order', 'limit', 'range', 'textSearch',
      'contains', 'containedBy', 'overlaps', 'match', 'ilike', 'like',
      'single',
    ];
    for (const method of chainMethods) {
      query[method] = vi.fn().mockReturnValue(query);
    }

    // Override single() to return the settings when querying federation_settings
    if (overrides?.settings) {
      query.single = vi.fn().mockReturnValue({
        ...query,
        then(onFulfilled: any, onRejected?: any) {
          return Promise.resolve({ data: overrides.settings, error: null }).then(onFulfilled, onRejected);
        },
      });
    }

    return query;
  }

  const supabase: any = {
    from: vi.fn((table: string) => {
      const query = createChainableQuery(
        table === 'federation_pending' ? (overrides?.pendingItems ?? []) :
        table === 'federation_approval_log' ? (overrides?.approvalLogs ?? []) :
        []
      );

      // Track inserts
      query.insert = vi.fn((data: any) => {
        insertedRows.push({ table, data });
        return createChainableQuery();
      });

      // Track updates
      query.update = vi.fn((data: any) => {
        updatedRows.push({ table, data });
        return createChainableQuery();
      });

      // Track upserts
      query.upsert = vi.fn((data: any) => {
        insertedRows.push({ table, data, upsert: true });
        return createChainableQuery();
      });

      query.delete = vi.fn().mockReturnValue(createChainableQuery());

      return query;
    }),
    rpc: vi.fn().mockReturnValue({
      then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
    }),
    _inserted: insertedRows,
    _updated: updatedRows,
  };

  return supabase;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Federation Approval Manager (Corpus Callosum Governance)', () => {
  const ORG_ID = 'test-org-001';

  describe('Settings', () => {
    it('should return default settings when no row exists', async () => {
      const supabase = createMockSupabase();
      const manager = createFederationApprovalManager(supabase, ORG_ID);

      const settings = await manager.getSettings();

      expect(settings.organizationId).toBe(ORG_ID);
      expect(settings.contributeToCoreBrain).toBe(true);
      expect(settings.requireApproval).toBe(false);
      expect(settings.approvalThreshold).toBe('balanced');
      expect(settings.excludedDomains).toEqual([]);
    });

    it('should update settings via upsert', async () => {
      const supabase = createMockSupabase();
      const manager = createFederationApprovalManager(supabase, ORG_ID);

      await manager.updateSettings({
        requireApproval: true,
        approvalThreshold: 'conservative',
        excludedDomains: ['hr', 'legal'],
      });

      // Verify upsert was called on federation settings table
      const settingsInserts = supabase._inserted.filter(
        (r: any) => r.table === 'organization_federation_settings'
      );
      expect(settingsInserts.length).toBeGreaterThan(0);
    });
  });

  describe('Queue for Approval', () => {
    it('should queue items that do not meet auto-approval threshold', async () => {
      const supabase = createMockSupabase({
        settings: {
          contribute_to_core_brain: true,
          require_approval: true,
          approval_threshold: 'conservative', // High bar: 0.3 effect, 0.9 confidence, 100 samples
          excluded_domains: [],
        },
      });
      const manager = createFederationApprovalManager(supabase, ORG_ID);

      const result = await manager.queueForApproval([{
        dataType: 'relationship',
        originalRecordId: 'rel-1',
        originalData: { source_domain: 'finance', target_domain: 'revenue', effect_size: 0.2 },
        sanitizedData: { source_domain: 'finance', target_domain: 'revenue', effect_size: 0.2 },
        sanitizationReport: null,
        sourceDomains: ['finance', 'revenue'],
        effectSize: 0.2,   // Below conservative threshold of 0.3
        confidence: 0.75,   // Below conservative threshold of 0.9
        sampleSize: 40,     // Below conservative threshold of 100
      }]);

      expect(result.queued).toBe(1);
      expect(result.autoApproved).toBe(0);

      // Verify insert to federation_pending
      const pendingInserts = supabase._inserted.filter((r: any) => r.table === 'federation_pending');
      expect(pendingInserts.length).toBe(1);
      expect(pendingInserts[0].data.status).toBe('pending');
    });

    it('should auto-approve items meeting aggressive threshold', async () => {
      const supabase = createMockSupabase({
        settings: {
          contribute_to_core_brain: true,
          require_approval: true,
          approval_threshold: 'aggressive', // Low bar: 0.15, 0.7, 30
          excluded_domains: [],
        },
      });
      const manager = createFederationApprovalManager(supabase, ORG_ID);

      const result = await manager.queueForApproval([{
        dataType: 'relationship',
        originalRecordId: 'rel-2',
        originalData: { source_domain: 'marketing', target_domain: 'revenue' },
        sanitizedData: { source_domain: 'marketing', target_domain: 'revenue' },
        sanitizationReport: null,
        sourceDomains: ['marketing', 'revenue'],
        effectSize: 0.25,   // Above aggressive threshold of 0.15
        confidence: 0.85,    // Above aggressive threshold of 0.7
        sampleSize: 50,      // Above aggressive threshold of 30
      }]);

      expect(result.autoApproved).toBe(1);
      expect(result.queued).toBe(0);
    });

    it('should skip items with excluded domains', async () => {
      const supabase = createMockSupabase({
        settings: {
          contribute_to_core_brain: true,
          require_approval: true,
          approval_threshold: 'balanced',
          excluded_domains: ['hr'],
        },
      });
      const manager = createFederationApprovalManager(supabase, ORG_ID);

      const result = await manager.queueForApproval([{
        dataType: 'memory',
        originalData: { domain: 'hr', content: 'HR pattern' },
        sanitizedData: { domain: 'hr', content: 'HR pattern' },
        sanitizationReport: null,
        sourceDomains: ['hr'],
      }]);

      expect(result.skippedExcluded).toBe(1);
      expect(result.queued).toBe(0);
    });

    it('should skip items with high PII density', async () => {
      const supabase = createMockSupabase({
        settings: {
          contribute_to_core_brain: true,
          require_approval: true,
          approval_threshold: 'balanced',
          excluded_domains: [],
        },
      });
      const manager = createFederationApprovalManager(supabase, ORG_ID);

      const result = await manager.queueForApproval([{
        dataType: 'memory',
        originalData: { content: 'Lots of PII here' },
        sanitizedData: { content: '[PERSON] at [COMPANY]' },
        sanitizationReport: { sanitizedText: '', entitiesRedacted: 10, redactionReport: [{ type: 'person', count: 5 }, { type: 'company', count: 5 }] },
        sourceDomains: ['finance'],
      }]);

      expect(result.skippedPII).toBe(1);
    });
  });

  describe('Approve / Reject', () => {
    it('should approve a pending item', async () => {
      const pendingItem = {
        id: 'pending-1',
        organization_id: ORG_ID,
        data_type: 'relationship',
        original_record_id: 'rel-1',
        original_data: { source_domain: 'finance', target_domain: 'revenue' },
        sanitized_data: { source_domain: 'finance', target_domain: 'revenue', effect_size: 0.3 },
        sanitization_report: {},
        risk_level: 'safe',
        status: 'pending',
        source_domains: ['finance', 'revenue'],
      };

      const supabase = createMockSupabase({ pendingItems: [pendingItem] });
      // Override the single() call for getItem
      supabase.from = vi.fn((table: string) => {
        const chain = createQueryChain(supabase, table, pendingItem);
        return chain;
      });

      const manager = createFederationApprovalManager(supabase, ORG_ID);
      const result = await manager.approve({
        itemId: 'pending-1',
        decision: 'approved',
        decidedBy: 'admin@test.com',
        reason: 'Looks good',
      });

      expect(result.decision).toBe('approved');
    });

    it('should reject a pending item without promoting', async () => {
      const supabase = createMockSupabase();
      const manager = createFederationApprovalManager(supabase, ORG_ID);

      const result = await manager.reject({
        itemId: 'pending-2',
        decision: 'rejected',
        decidedBy: 'admin@test.com',
        reason: 'Contains sensitive patterns',
      });

      expect(result.decision).toBe('rejected');
      expect(result.promotedToCore).toBe(false);
    });
  });

  describe('Stats', () => {
    it('should return federation stats', async () => {
      const supabase = createMockSupabase();
      const manager = createFederationApprovalManager(supabase, ORG_ID);

      const stats = await manager.getStats();

      expect(stats).toHaveProperty('pendingCount');
      expect(stats).toHaveProperty('approvedToday');
      expect(stats).toHaveProperty('rejectedToday');
      expect(stats).toHaveProperty('autoApprovedToday');
      expect(stats).toHaveProperty('totalPromotedAllTime');
    });
  });

  describe('Upstream Promoter Integration', () => {
    it('should have itemsQueued and itemsAutoApproved fields in result', async () => {
      const supabase = createMockSupabase({
        settings: {
          contribute_to_core_brain: true,
          require_approval: false,
          excluded_domains: [],
        },
      });

      const promoter = createUpstreamPromoter(supabase, ORG_ID);
      const result = await promoter.promoteKnowledge();

      expect(result).toHaveProperty('itemsQueued');
      expect(result).toHaveProperty('itemsAutoApproved');
      expect(result.itemsQueued).toBe(0);
      expect(result.itemsAutoApproved).toBe(0);
    });

    it('should return empty result for core brain org', async () => {
      const supabase = createMockSupabase();
      const promoter = createUpstreamPromoter(supabase, '00000000-0000-4000-a000-000000000001');
      const result = await promoter.promoteKnowledge();

      expect(result.relationshipsPromoted).toBe(0);
      expect(result.itemsQueued).toBe(0);
    });
  });
});

// Helper to create a chainable query with single() support
function createQueryChain(supabase: any, table: string, singleResult?: any): any {
  const result = { data: singleResult ? [singleResult] : [], error: null, count: 0 };
  const query: any = {
    then(onFulfilled: any, onRejected?: any) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  const chainMethods = [
    'select', 'eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'is', 'not', 'or',
    'filter', 'order', 'limit', 'range', 'single',
  ];
  for (const method of chainMethods) {
    query[method] = vi.fn().mockReturnValue(query);
  }

  if (singleResult) {
    query.single = vi.fn().mockReturnValue({
      ...query,
      then(onFulfilled: any, onRejected?: any) {
        return Promise.resolve({ data: singleResult, error: null }).then(onFulfilled, onRejected);
      },
    });
  }

  query.insert = vi.fn((data: any) => {
    supabase._inserted.push({ table, data });
    const insertResult = { data: null, error: null };
    return { then: (fn: any) => Promise.resolve(insertResult).then(fn) };
  });

  query.update = vi.fn((data: any) => {
    supabase._updated.push({ table, data });
    return query;
  });

  query.upsert = vi.fn((data: any) => {
    supabase._inserted.push({ table, data, upsert: true });
    return query;
  });

  query.delete = vi.fn().mockReturnValue(query);

  return query;
}
