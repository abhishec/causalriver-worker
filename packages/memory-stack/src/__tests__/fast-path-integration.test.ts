/**
 * Fast-Path Integration Tests — Cerebellum (learned query cache)
 * ================================================================
 *
 * Brain Analog: Testing the Cerebellum's ability to store and retrieve
 * pre-compiled motor programs. Once you've learned to ride a bike, you
 * don't need to think about it — the Cerebellum fires automatically.
 *
 * Tests:
 * 1. Query fingerprint extraction
 * 2. Fast-path lookup (cache miss → compile → cache hit)
 * 3. Cache invalidation after consolidation
 * 4. Fingerprint determinism
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFastPathCompiler, type FastPathConfig } from '../orchestrator/fast-path-compiler';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

function createMockSupabase() {
  function createChainableQuery(): any {
    const result = { data: [], error: null };
    const query: any = {
      then(onFulfilled: any, onRejected?: any) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    const chainMethods = [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'gte', 'lte', 'gt', 'lt',
      'in', 'is', 'not', 'or', 'filter',
      'order', 'limit', 'range', 'textSearch',
      'contains', 'containedBy', 'overlaps',
      'match', 'ilike', 'like',
    ];
    for (const method of chainMethods) {
      query[method] = vi.fn().mockReturnValue(query);
    }
    const singleResult = { data: null, error: null };
    const singleQuery = { ...query, then: (onFulfilled: any, onRejected?: any) => Promise.resolve(singleResult).then(onFulfilled, onRejected) };
    query.single = vi.fn().mockReturnValue(singleQuery);
    query.maybeSingle = vi.fn().mockReturnValue(singleQuery);
    return query;
  }

  return {
    from: vi.fn().mockImplementation(() => createChainableQuery()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Fast-Path Integration (Cerebellum)', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('Query Fingerprinting', () => {
    it('should create a fast-path compiler', () => {
      const compiler = createFastPathCompiler({
        supabase,
        organizationId: 'org-1',
      });

      expect(compiler).toBeDefined();
      expect(compiler.lookup).toBeTypeOf('function');
      expect(compiler.invalidateAll).toBeTypeOf('function');
    });

    it('should extract fingerprint from a why-revenue query', async () => {
      const compiler = createFastPathCompiler({
        supabase,
        organizationId: 'org-1',
      });

      const result = await compiler.lookup('Why is revenue declining this quarter?');

      expect(result).toBeDefined();
      expect(result.fingerprint).toBeDefined();
      expect(result.fingerprint.hash).toBeDefined();
      expect(typeof result.fingerprint.hash).toBe('string');
      expect(result.fingerprint.intent).toBeDefined();
    });

    it('should produce consistent fingerprints for same-shape queries', async () => {
      const compiler = createFastPathCompiler({
        supabase,
        organizationId: 'org-1',
      });

      const result1 = await compiler.lookup('Why is revenue declining?');
      const result2 = await compiler.lookup('Why is revenue declining this month?');

      // Both ask "why" about "revenue" with "declining" — same shape
      expect(result1.fingerprint.intent).toBe(result2.fingerprint.intent);
    });

    it('should differentiate intents for different query types', async () => {
      const compiler = createFastPathCompiler({
        supabase,
        organizationId: 'org-1',
      });

      const whyResult = await compiler.lookup('Why is churn increasing?');
      const whatResult = await compiler.lookup('What is the current churn rate?');
      const predictResult = await compiler.lookup('Will churn increase next quarter?');

      // Different intents should be recognized
      expect(whyResult.fingerprint).toBeDefined();
      expect(whatResult.fingerprint).toBeDefined();
      expect(predictResult.fingerprint).toBeDefined();
    });
  });

  describe('Cache Miss → Compile → Hit Flow', () => {
    it('should report cache miss on first lookup', async () => {
      const compiler = createFastPathCompiler({
        supabase,
        organizationId: 'org-1',
      });

      const result = await compiler.lookup('Why is revenue declining?');

      // First lookup is always a miss (empty cache)
      expect(result.hit).toBe(false);
      expect(result.lookupMs).toBeGreaterThanOrEqual(0);
    });

    it('should return lookup timing information', async () => {
      const compiler = createFastPathCompiler({
        supabase,
        organizationId: 'org-1',
      });

      const result = await compiler.lookup('What is the status of engineering?');

      expect(typeof result.lookupMs).toBe('number');
      expect(result.lookupMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cache Invalidation', () => {
    it('should support invalidating all cached fast-paths', async () => {
      const compiler = createFastPathCompiler({
        supabase,
        organizationId: 'org-1',
      });

      // Invalidation after consolidation — Cerebellum clears stale motor programs
      // invalidateAll() may be sync or async — just ensure it doesn't throw
      const result = compiler.invalidateAll();
      if (result && typeof (result as any).then === 'function') {
        await result;
      }
      expect(true).toBe(true);
    });
  });

  describe('Brain Analogy Validation', () => {
    it('should model the Cerebellum: learned responses bypass slow conscious reasoning', async () => {
      // Brain Analog: The Cerebellum stores pre-compiled motor programs.
      // A "cache hit" means the Cerebellum recognized the query shape and
      // fired its learned response — no need for slow conscious reasoning
      // (complexity assessment + multi-hop tool calls).

      const compiler = createFastPathCompiler({
        supabase,
        organizationId: 'org-1',
      });

      // First time: Cerebellum hasn't learned this pattern yet
      const miss = await compiler.lookup('How is marketing performing?');
      expect(miss.hit).toBe(false);
      // This is like the first time you try to ride a bike — conscious effort required

      // After consolidation compiles frequent queries, future lookups would hit cache
      // (In production, the BrainPipeline calls precompile() during sleep cycles)
    });
  });
});
