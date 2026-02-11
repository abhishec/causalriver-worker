/**
 * Context Manager Tests — Working Memory (Prefrontal Cortex)
 * ===========================================================
 *
 * Brain Analog: The PFC maintains working memory — what you're actively
 * thinking about. If you've been focused on churn all morning and someone
 * says "the numbers are down", your brain interprets it as churn-related.
 *
 * Tests:
 * 1. Query recording and retrieval
 * 2. User focus detection (dominant domain)
 * 3. Domain hot-topic detection
 * 4. Org context aggregation
 * 5. Query enrichment with working memory context
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContextManager } from '../orchestrator/context-manager';

function createMockSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  } as any;
}

describe('Context Manager (Working Memory)', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('Query Recording', () => {
    it('should record queries and retrieve user context', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      ctx.recordQuery('user-1', 'Why is churn increasing?', 'churn');
      ctx.recordQuery('user-1', 'What caused churn to spike?', 'churn');
      ctx.recordQuery('user-1', 'How is revenue this quarter?', 'revenue');

      const userCtx = ctx.getContextForUser('user-1');

      expect(userCtx.userId).toBe('user-1');
      expect(userCtx.queryCount).toBe(3);
      expect(userCtx.focusDomains).toContain('churn');
      expect(userCtx.focusDomains).toContain('revenue');
      // Churn asked about twice → dominant
      expect(userCtx.dominantDomain).toBe('churn');
    });

    it('should limit queries to maxRecentQueries', () => {
      const ctx = createContextManager({
        supabase,
        organizationId: 'org-1',
        maxRecentQueries: 3,
      });

      for (let i = 0; i < 5; i++) {
        ctx.recordQuery('user-1', `query ${i}`, 'domain');
      }

      const userCtx = ctx.getContextForUser('user-1');
      // Should only keep the 3 most recent
      expect(userCtx.queryCount).toBeLessThanOrEqual(3);
    });

    it('should return empty context for unknown users', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      const userCtx = ctx.getContextForUser('unknown-user');

      expect(userCtx.queryCount).toBe(0);
      expect(userCtx.focusDomains).toHaveLength(0);
      expect(userCtx.dominantDomain).toBeUndefined();
    });
  });

  describe('Domain Context (Hot Topics)', () => {
    it('should detect hot topics when queried 3+ times', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      // 3 queries about churn → hot topic
      ctx.recordQuery('user-1', 'churn q1', 'churn');
      ctx.recordQuery('user-2', 'churn q2', 'churn');
      ctx.recordQuery('user-1', 'churn q3', 'churn');

      const domainCtx = ctx.getContextForDomain('churn');

      expect(domainCtx.domain).toBe('churn');
      expect(domainCtx.recentQueryCount).toBe(3);
      expect(domainCtx.isHotTopic).toBe(true);
      expect(domainCtx.activeUsers).toContain('user-1');
      expect(domainCtx.activeUsers).toContain('user-2');
    });

    it('should detect hot topics when 2+ users query the same domain', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      ctx.recordQuery('user-1', 'revenue q1', 'revenue');
      ctx.recordQuery('user-2', 'revenue q2', 'revenue');

      const domainCtx = ctx.getContextForDomain('revenue');
      expect(domainCtx.isHotTopic).toBe(true);
    });

    it('should not flag a domain as hot with only 1 query from 1 user', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      ctx.recordQuery('user-1', 'engineering q1', 'engineering');

      const domainCtx = ctx.getContextForDomain('engineering');
      expect(domainCtx.isHotTopic).toBe(false);
    });
  });

  describe('Org Context', () => {
    it('should aggregate org-wide attention state', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      // Multiple users querying different domains
      ctx.recordQuery('user-1', 'churn q1', 'churn');
      ctx.recordQuery('user-1', 'churn q2', 'churn');
      ctx.recordQuery('user-1', 'churn q3', 'churn');
      ctx.recordQuery('user-2', 'revenue q1', 'revenue');
      ctx.recordQuery('user-3', 'engineering q1', 'engineering');

      // Record insights and cascades
      ctx.recordInsight('Unexpected correlation: marketing → churn');
      ctx.recordCascade('Support ticket surge → churn cascade');

      const orgCtx = ctx.getOrgContext();

      expect(orgCtx.organizationId).toBe('org-1');
      expect(orgCtx.activeUserCount).toBe(3);
      expect(orgCtx.hotDomains).toContain('churn'); // 3 queries
      expect(orgCtx.recentInsights).toHaveLength(1);
      expect(orgCtx.activeCascades).toHaveLength(1);
    });

    it('should clear cascades when resolved', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      ctx.recordCascade('Support cascade');
      expect(ctx.getOrgContext().activeCascades).toHaveLength(1);

      ctx.clearCascade('Support cascade');
      expect(ctx.getOrgContext().activeCascades).toHaveLength(0);
    });
  });

  describe('Query Enrichment (Context Injection)', () => {
    it('should enrich queries with user focus context', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      // User has been asking about churn 3 times
      ctx.recordQuery('user-1', 'Why is churn increasing?', 'churn');
      ctx.recordQuery('user-1', 'What drives churn?', 'churn');
      ctx.recordQuery('user-1', 'Churn by segment', 'churn');

      // Now they ask a vague question
      const enriched = ctx.enrichQuery('the numbers are down', 'user-1');

      // Brain Analog: "Working Memory: user focused on churn → interpret vaguely"
      expect(enriched.contextHint).toContain('churn');
      expect(enriched.suggestedDomains).toContain('churn');
      expect(enriched.userFocus).toBe('churn');
    });

    it('should include org-level context in enrichment', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      // Multiple users making churn a hot topic
      ctx.recordQuery('user-1', 'churn q1', 'churn');
      ctx.recordQuery('user-2', 'churn q2', 'churn');
      ctx.recordQuery('user-3', 'churn q3', 'churn');

      ctx.recordCascade('Support → churn cascade active');

      const enriched = ctx.enrichQuery('what is happening?', 'user-4');

      // Should include org focus even though user-4 has no history
      expect(enriched.contextHint).toContain('churn');
      expect(enriched.contextHint).toContain('cascade');
      expect(enriched.orgFocus).toBe('churn');
    });

    it('should return empty context for fresh users with no org activity', () => {
      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      const enriched = ctx.enrichQuery('hello world', 'new-user');

      expect(enriched.contextHint).toBe('');
      expect(enriched.suggestedDomains).toHaveLength(0);
      expect(enriched.userFocus).toBeUndefined();
    });
  });

  describe('Brain Analogy Validation', () => {
    it('should model Working Memory: context determines interpretation', () => {
      // Brain Analog:
      // Working Memory holds: user asked about churn 3x,
      // org priority is NRR, active cascade in support→churn.
      //
      // When user says "the numbers are down", Working Memory provides context:
      // "This user is focused on churn. The org has churn as a hot topic.
      // There's an active support→churn cascade. Interpret accordingly."

      const ctx = createContextManager({ supabase, organizationId: 'org-1' });

      ctx.recordQuery('user-1', 'churn metrics', 'churn');
      ctx.recordQuery('user-1', 'churn by cohort', 'churn');
      ctx.recordQuery('user-1', 'churn prediction', 'churn');
      ctx.recordCascade('support→churn cascade');
      ctx.recordInsight('Churn spike correlates with support ticket surge');

      const enriched = ctx.enrichQuery('the numbers are down', 'user-1');

      // Working Memory should provide rich context
      expect(enriched.contextHint.length).toBeGreaterThan(0);
      expect(enriched.suggestedDomains.length).toBeGreaterThan(0);
      expect(enriched.userFocus).toBe('churn');
    });
  });
});
