/**
 * Connector Signal Bridge Tests
 *
 * Validates:
 * 1. Transactional RPC dual-write (ACID-guaranteed)
 * 2. Fallback to parallel Promise.all when RPC doesn't exist
 * 3. Error propagation works correctly in both paths
 * 4. Domain enrichment mapping
 * 5. Scale test with large batches
 */
import { describe, it, expect, vi } from 'vitest';
import { storeDualWriteConnectorSignals } from '../ingestion/connector-signal-bridge';

/**
 * Creates a mock Supabase client that simulates either the RPC path
 * or the fallback path (when RPC function doesn't exist).
 */
function createMockSupabase(options?: {
  rawDelay?: number;
  enrichedDelay?: number;
  rawError?: string;
  enrichedError?: string;
  rpcAvailable?: boolean;  // true = RPC function exists
  rpcError?: string;       // simulate RPC failure
}) {
  const rawDelay = options?.rawDelay ?? 0;
  const enrichedDelay = options?.enrichedDelay ?? 0;
  const rawError = options?.rawError;
  const enrichedError = options?.enrichedError;
  const rpcAvailable = options?.rpcAvailable ?? false;
  const rpcErrorMsg = options?.rpcError;

  const insertCalls: { table: string; rows: unknown[]; timestamp: number }[] = [];
  const rpcCalls: { fn: string; params: unknown }[] = [];

  const mockFrom = (table: string) => ({
    insert: (rows: unknown[]) => {
      const callTimestamp = Date.now();
      insertCalls.push({ table, rows: Array.isArray(rows) ? rows : [rows], timestamp: callTimestamp });

      const delay = table === 'connector_signals' ? rawDelay : enrichedDelay;
      const error = table === 'connector_signals' ? rawError : enrichedError;

      return new Promise((resolve) => {
        setTimeout(() => {
          if (error) {
            resolve({ error: { message: error } });
          } else {
            resolve({ error: null });
          }
        }, delay);
      });
    },
  });

  const mockRpc = (fn: string, params: unknown) => {
    rpcCalls.push({ fn, params });

    if (!rpcAvailable) {
      // Simulate function not existing
      return Promise.resolve({
        data: null,
        error: { message: `function insert_dual_signals(uuid, jsonb, jsonb) does not exist` },
      });
    }

    if (rpcErrorMsg) {
      return Promise.resolve({
        data: null,
        error: { message: rpcErrorMsg },
      });
    }

    // Simulate successful RPC — return counts
    const rawSignals = (params as any).p_raw_signals;
    const enrichedSignals = (params as any).p_enriched_signals;
    return Promise.resolve({
      data: {
        raw_count: Array.isArray(rawSignals) ? rawSignals.length : 0,
        enriched_count: Array.isArray(enrichedSignals) ? enrichedSignals.length : 0,
      },
      error: null,
    });
  };

  return {
    from: vi.fn(mockFrom),
    rpc: vi.fn(mockRpc),
    _insertCalls: insertCalls,
    _rpcCalls: rpcCalls,
  };
}

describe('Connector Signal Bridge', () => {
  const testSignals = [
    {
      source: 'github',
      signal_type: 'pr_merged',
      signal_value: 1,
      metadata: { pr_id: 'PR-123' },
    },
    {
      source: 'jira',
      signal_type: 'issue_created',
      signal_value: 1,
      metadata: { issue_id: 'JIRA-456' },
    },
  ];

  describe('Transactional RPC path (ACID-guaranteed)', () => {
    it('should use RPC for transactional dual-write when available', async () => {
      const supabase = createMockSupabase({ rpcAvailable: true });

      const result = await storeDualWriteConnectorSignals(
        supabase as any,
        testSignals,
        'org-test-123'
      );

      // Should call RPC, NOT individual table inserts
      expect(supabase.rpc).toHaveBeenCalledWith('insert_dual_signals', expect.objectContaining({
        p_organization_id: 'org-test-123',
      }));
      expect(supabase.from).not.toHaveBeenCalled();

      expect(result.rawCount).toBe(2);
      expect(result.enrichedCount).toBe(2);
    });

    it('should pass correctly mapped raw and enriched signals to RPC', async () => {
      const supabase = createMockSupabase({ rpcAvailable: true });

      await storeDualWriteConnectorSignals(
        supabase as any,
        [{
          source: 'github',
          signal_type: 'pr_merged',
          signal_value: 1,
          metadata: { pr_id: 'PR-42' },
        }],
        'org-test-123'
      );

      const rpcCall = supabase._rpcCalls[0];
      const params = rpcCall.params as any;

      // Check raw signal mapping
      expect(params.p_raw_signals[0].source).toBe('github');
      expect(params.p_raw_signals[0].signal_type).toBe('pr_merged');

      // Check enriched signal mapping
      expect(params.p_enriched_signals[0].source_domain).toBe('engineering.github');
      expect(params.p_enriched_signals[0].entity_type).toBe('pull_request');
      expect(params.p_enriched_signals[0].entity_id).toBe('PR-42');
    });

    it('should reject when RPC returns a non-function error', async () => {
      const supabase = createMockSupabase({
        rpcAvailable: false,
        rpcError: 'Permission denied',
      });

      // Override the rpc mock to return a permission error (not "function does not exist")
      supabase.rpc.mockImplementation(() =>
        Promise.resolve({
          data: null,
          error: { message: 'Permission denied for function insert_dual_signals' },
        })
      );

      await expect(
        storeDualWriteConnectorSignals(supabase as any, testSignals, 'org-test-123')
      ).rejects.toThrow('Dual-write transaction failed');
    });
  });

  describe('Fallback path (parallel Promise.all)', () => {
    it('should fall back to parallel writes when RPC function does not exist', async () => {
      const supabase = createMockSupabase({ rpcAvailable: false });

      const result = await storeDualWriteConnectorSignals(
        supabase as any,
        testSignals,
        'org-test-123'
      );

      // Should have tried RPC first
      expect(supabase.rpc).toHaveBeenCalled();

      // Then fallen back to table inserts
      expect(supabase.from).toHaveBeenCalledWith('connector_signals');
      expect(supabase.from).toHaveBeenCalledWith('cross_domain_signals');

      expect(result.rawCount).toBe(2);
      expect(result.enrichedCount).toBe(2);
    });

    it('should correctly enrich signals with domain mapping in fallback', async () => {
      const supabase = createMockSupabase({ rpcAvailable: false });

      await storeDualWriteConnectorSignals(
        supabase as any,
        [{
          source: 'github',
          signal_type: 'pr_merged',
          signal_value: 1,
          metadata: { pr_id: 'PR-42' },
        }],
        'org-test-123'
      );

      const enrichedCall = supabase._insertCalls.find(c => c.table === 'cross_domain_signals');
      expect(enrichedCall).toBeDefined();
      const enrichedRow = (enrichedCall!.rows as any[])[0];
      expect(enrichedRow.source_domain).toBe('engineering.github');
      expect(enrichedRow.entity_type).toBe('pull_request');
      expect(enrichedRow.entity_id).toBe('PR-42');
      expect(enrichedRow.organization_id).toBe('org-test-123');
    });

    it('should execute fallback writes in parallel, not sequentially', async () => {
      const supabase = createMockSupabase({
        rpcAvailable: false,
        rawDelay: 100,
        enrichedDelay: 100,
      });

      const start = performance.now();
      await storeDualWriteConnectorSignals(
        supabase as any,
        testSignals,
        'org-test-123'
      );
      const elapsed = performance.now() - start;

      console.log(`Fallback parallel dual-write: ${elapsed.toFixed(0)}ms (should be ~100ms, not ~200ms)`);

      // Parallel = ~100ms, Sequential would be ~200ms
      expect(elapsed).toBeLessThan(180);
    });
  });

  describe('Shared behavior', () => {
    it('should return zero counts for empty signals', async () => {
      const supabase = createMockSupabase({ rpcAvailable: true });

      const result = await storeDualWriteConnectorSignals(
        supabase as any,
        [],
        'org-test-123'
      );

      expect(result.rawCount).toBe(0);
      expect(result.enrichedCount).toBe(0);
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('Error propagation (fallback path)', () => {
    it('should reject if raw write fails in fallback', async () => {
      const supabase = createMockSupabase({
        rpcAvailable: false,
        rawError: 'RLS policy violation',
      });

      await expect(
        storeDualWriteConnectorSignals(supabase as any, testSignals, 'org-test-123')
      ).rejects.toThrow('raw connector signals');
    });

    it('should reject if enriched write fails in fallback', async () => {
      const supabase = createMockSupabase({
        rpcAvailable: false,
        enrichedError: 'Column not found',
      });

      await expect(
        storeDualWriteConnectorSignals(supabase as any, testSignals, 'org-test-123')
      ).rejects.toThrow('enriched cross-domain signals');
    });
  });

  describe('Scale test', () => {
    it('should handle 500 signals via RPC path', async () => {
      const supabase = createMockSupabase({ rpcAvailable: true });

      const largeSignalBatch = Array.from({ length: 500 }, (_, i) => ({
        source: ['github', 'jira', 'slack', 'hubspot', 'stripe'][i % 5],
        signal_type: `event_${i}`,
        signal_value: Math.random() * 100,
        metadata: { id: `id_${i}` },
      }));

      const start = performance.now();
      const result = await storeDualWriteConnectorSignals(
        supabase as any,
        largeSignalBatch,
        'org-test-123'
      );
      const elapsed = performance.now() - start;

      console.log(`500-signal RPC batch: ${elapsed.toFixed(0)}ms`);

      expect(result.rawCount).toBe(500);
      expect(result.enrichedCount).toBe(500);
      expect(elapsed).toBeLessThan(1000);
    });

    it('should handle 500 signals via fallback path', async () => {
      const supabase = createMockSupabase({
        rpcAvailable: false,
        rawDelay: 10,
        enrichedDelay: 10,
      });

      const largeSignalBatch = Array.from({ length: 500 }, (_, i) => ({
        source: ['github', 'jira', 'slack', 'hubspot', 'stripe'][i % 5],
        signal_type: `event_${i}`,
        signal_value: Math.random() * 100,
        metadata: { id: `id_${i}` },
      }));

      const start = performance.now();
      const result = await storeDualWriteConnectorSignals(
        supabase as any,
        largeSignalBatch,
        'org-test-123'
      );
      const elapsed = performance.now() - start;

      console.log(`500-signal fallback batch: ${elapsed.toFixed(0)}ms`);

      expect(result.rawCount).toBe(500);
      expect(result.enrichedCount).toBe(500);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
