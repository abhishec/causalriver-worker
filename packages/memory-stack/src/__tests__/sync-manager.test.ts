import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSyncManager } from '../connectors/sync-manager';
import type { NexusConnector, ConnectorSyncResult } from '../connectors/connector-framework';

function createMockConnector(id: string, domain: string): NexusConnector {
  const result: ConnectorSyncResult = {
    success: true,
    signalsGenerated: 10,
    recordsProcessed: 5,
    errors: [],
    duration_ms: 100,
    lastSyncedAt: new Date(),
  };

  return {
    id,
    name: `Mock ${id}`,
    domain,
    fullSync: vi.fn().mockResolvedValue(result),
    incrementalSync: vi.fn().mockResolvedValue(result),
    handleWebhook: vi.fn().mockReturnValue([]),
  };
}

function createMockSupabase(cursorData: Record<string, any> | null = null) {
  const singleFn = vi.fn().mockResolvedValue({
    data: cursorData,
    error: cursorData ? null : { message: 'not found' },
  });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: singleFn,
          }),
        }),
      }),
      upsert: vi.fn().mockReturnValue({ error: null }),
      insert: vi.fn().mockReturnValue({ error: null }),
    }),
    _single: singleFn,
  } as any;
}

describe('Sync Manager', () => {
  let github: NexusConnector;
  let stripe: NexusConnector;

  beforeEach(() => {
    github = createMockConnector('github', 'engineering');
    stripe = createMockConnector('stripe', 'finance');
  });

  describe('createSyncManager', () => {
    it('should register connectors', () => {
      const manager = createSyncManager({ connectors: [github, stripe] });
      const registered = manager.getRegisteredConnectors();

      expect(registered).toContain('github');
      expect(registered).toContain('stripe');
      expect(registered.length).toBe(2);
    });

    it('should allow registering connectors at runtime', () => {
      const manager = createSyncManager({ connectors: [github] });
      expect(manager.getRegisteredConnectors()).toHaveLength(1);

      manager.registerConnector(stripe);
      expect(manager.getRegisteredConnectors()).toHaveLength(2);
      expect(manager.getRegisteredConnectors()).toContain('stripe');
    });
  });

  describe('syncOne', () => {
    it('should do full sync when no cursor exists', async () => {
      const supabase = createMockSupabase(null);
      const manager = createSyncManager({ connectors: [github] });

      const result = await manager.syncOne('github', supabase, 'org_123');

      expect(result.success).toBe(true);
      expect(github.fullSync).toHaveBeenCalledWith(supabase, 'org_123');
      expect(github.incrementalSync).not.toHaveBeenCalled();
    });

    it('should do incremental sync when cursor exists', async () => {
      const cursor = {
        connector_id: 'github',
        organization_id: 'org_123',
        last_synced_at: '2025-01-01T00:00:00Z',
        last_sync_type: 'full',
        cursor_data: {},
      };
      const supabase = createMockSupabase(cursor);
      const manager = createSyncManager({ connectors: [github] });

      const result = await manager.syncOne('github', supabase, 'org_123');

      expect(result.success).toBe(true);
      expect(github.incrementalSync).toHaveBeenCalled();
      expect(github.fullSync).not.toHaveBeenCalled();
    });

    it('should throw error for unknown connector', async () => {
      const supabase = createMockSupabase(null);
      const manager = createSyncManager({ connectors: [github] });

      await expect(
        manager.syncOne('unknown', supabase, 'org_123')
      ).rejects.toThrow("Connector 'unknown' not registered");
    });
  });

  describe('syncAll', () => {
    it('should sync all registered connectors', async () => {
      const supabase = createMockSupabase(null);
      const manager = createSyncManager({ connectors: [github, stripe] });

      const results = await manager.syncAll(supabase, 'org_123');

      expect(results.length).toBe(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(github.fullSync).toHaveBeenCalled();
      expect(stripe.fullSync).toHaveBeenCalled();
    });

    it('should handle individual connector failures', async () => {
      const failingConnector: NexusConnector = {
        id: 'failing',
        name: 'Failing',
        domain: 'test',
        fullSync: vi.fn().mockRejectedValue(new Error('API down')),
        incrementalSync: vi.fn().mockRejectedValue(new Error('API down')),
        handleWebhook: vi.fn().mockReturnValue([]),
      };

      const supabase = createMockSupabase(null);
      const manager = createSyncManager({ connectors: [github, failingConnector] });

      const results = await manager.syncAll(supabase, 'org_123');

      expect(results.length).toBe(2);
      // One should succeed, one should fail
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect(failures[0].errors[0]).toContain('API down');
    });
  });

  describe('getCursor', () => {
    it('should return null when no cursor exists', async () => {
      const supabase = createMockSupabase(null);
      const manager = createSyncManager({ connectors: [github] });

      const cursor = await manager.getCursor('github', supabase, 'org_123');
      expect(cursor).toBeNull();
    });

    it('should return parsed cursor when it exists', async () => {
      const cursorData = {
        connector_id: 'github',
        organization_id: 'org_123',
        last_synced_at: '2025-01-15T10:30:00Z',
        last_sync_type: 'incremental',
        cursor_data: { signalsGenerated: 42 },
      };
      const supabase = createMockSupabase(cursorData);
      const manager = createSyncManager({ connectors: [github] });

      const cursor = await manager.getCursor('github', supabase, 'org_123');

      expect(cursor).not.toBeNull();
      expect(cursor!.connectorId).toBe('github');
      expect(cursor!.lastSyncType).toBe('incremental');
      expect(cursor!.lastSyncedAt).toBeInstanceOf(Date);
    });
  });

  describe('getStatus', () => {
    it('should return never_synced for connectors without cursors', async () => {
      const supabase = createMockSupabase(null);
      const manager = createSyncManager({ connectors: [github, stripe] });

      const statuses = await manager.getStatus(supabase, 'org_123');

      expect(statuses.length).toBe(2);
      expect(statuses.every((s) => s.status === 'never_synced')).toBe(true);
    });

    it('should return synced status with last sync time', async () => {
      const cursorData = {
        connector_id: 'github',
        organization_id: 'org_123',
        last_synced_at: '2025-01-15T10:30:00Z',
        last_sync_type: 'full',
        cursor_data: { errors: [] },
      };
      const supabase = createMockSupabase(cursorData);
      const manager = createSyncManager({ connectors: [github] });

      const statuses = await manager.getStatus(supabase, 'org_123');

      expect(statuses.length).toBe(1);
      expect(statuses[0].status).toBe('synced');
      expect(statuses[0].connectorId).toBe('github');
      expect(statuses[0].domain).toBe('engineering');
      expect(statuses[0].lastSynced).toBeInstanceOf(Date);
    });
  });
});
