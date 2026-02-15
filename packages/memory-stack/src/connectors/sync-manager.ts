/**
 * Sync Manager — Incremental Sync with Cursor Tracking
 *
 * Manages connector sync lifecycle:
 *   - Tracks last sync time per connector per organization
 *   - Chooses full vs incremental sync automatically
 *   - Persists sync cursors to database
 *   - Provides sync status dashboard data
 *
 * @example
 * ```typescript
 * const sync = createSyncManager({
 *   connectors: [github, stripe, support, document],
 * });
 *
 * // Sync all connectors (incremental if previously synced)
 * const results = await sync.syncAll(supabase, 'org_123');
 *
 * // Check status
 * const status = await sync.getStatus(supabase, 'org_123');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NexusConnector, ConnectorSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface SyncCursor {
  connectorId: string;
  organizationId: string;
  lastSyncedAt: Date;
  lastSyncType: 'full' | 'incremental';
  cursorData?: Record<string, unknown>;
}

export interface SyncManagerConfig {
  /** Registered connectors */
  connectors: NexusConnector[];
  /** Default interval in minutes (default: 15) */
  defaultIntervalMinutes?: number;
  /** Per-connector intervals (minutes) */
  intervals?: Record<string, number>;
  /** Max connectors to sync in parallel (default: 5) */
  concurrency?: number;
  /** Global rate limit: max API calls per minute across all connectors (default: unlimited) */
  globalRateLimitPerMinute?: number;
}

export interface SyncStatus {
  connectorId: string;
  connectorName: string;
  domain: string;
  lastSynced?: Date;
  status: 'never_synced' | 'synced' | 'error';
  lastError?: string;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a sync manager for all connectors.
 */
export function createSyncManager(config: SyncManagerConfig) {
  const connectorMap = new Map<string, NexusConnector>();
  for (const connector of config.connectors) {
    connectorMap.set(connector.id, connector);
  }

  const CONCURRENCY = config.concurrency ?? 5;
  const GLOBAL_RATE_LIMIT = config.globalRateLimitPerMinute ?? 0; // 0 = unlimited

  // ── Global Rate Limiter (Token Bucket) ────────────────────────
  // Prevents thundering herd when multiple connectors sync in parallel.
  // Each connector can call `acquireToken()` before making API requests.
  let _tokenBucket = GLOBAL_RATE_LIMIT;
  let _lastRefill = Date.now();

  function _refillBucket(): void {
    const now = Date.now();
    const elapsed = now - _lastRefill;
    if (elapsed > 0 && GLOBAL_RATE_LIMIT > 0) {
      const tokensToAdd = Math.floor((elapsed / 60_000) * GLOBAL_RATE_LIMIT);
      _tokenBucket = Math.min(GLOBAL_RATE_LIMIT, _tokenBucket + tokensToAdd);
      _lastRefill = now;
    }
  }

  /**
   * Acquire a rate-limit token. Returns immediately if tokens available,
   * or waits up to `timeoutMs` for a token to become available.
   * When GLOBAL_RATE_LIMIT is 0 (unlimited), always returns true immediately.
   */
  async function acquireToken(timeoutMs: number = 5000): Promise<boolean> {
    if (GLOBAL_RATE_LIMIT <= 0) return true; // unlimited
    _refillBucket();
    if (_tokenBucket > 0) {
      _tokenBucket--;
      return true;
    }
    // Wait for a token
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
      _refillBucket();
      if (_tokenBucket > 0) {
        _tokenBucket--;
        return true;
      }
    }
    return false; // timeout
  }

  /**
   * Get the sync cursor for a connector
   */
  async function getCursor(
    supabase: SupabaseClient,
    connectorId: string,
    orgId: string
  ): Promise<SyncCursor | null> {
    const { data, error } = await supabase
      .from('sync_cursors')
      .select('*')
      .eq('organization_id', orgId)
      .eq('connector_id', connectorId)
      .single();

    if (error || !data) return null;

    return {
      connectorId: data.connector_id,
      organizationId: data.organization_id,
      lastSyncedAt: new Date(data.last_synced_at),
      lastSyncType: data.last_sync_type || 'full',
      cursorData: data.cursor_data || {},
    };
  }

  /**
   * Update the sync cursor after a sync
   */
  async function updateCursor(
    supabase: SupabaseClient,
    connectorId: string,
    orgId: string,
    result: ConnectorSyncResult,
    syncType: 'full' | 'incremental'
  ): Promise<void> {
    await supabase.from('sync_cursors').upsert(
      {
        organization_id: orgId,
        connector_id: connectorId,
        last_synced_at: result.lastSyncedAt.toISOString(),
        last_sync_type: syncType,
        cursor_data: {
          signalsGenerated: result.signalsGenerated,
          recordsProcessed: result.recordsProcessed,
          success: result.success,
          errors: result.errors,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,connector_id' }
    );
  }

  return {
    /**
     * Sync all registered connectors in PARALLEL batches.
     *
     * 10M SCALE FIX: Previous implementation was sequential (for...of loop),
     * meaning 5 connectors with 5h sync each = 25h total wall-clock.
     * Now runs up to CONCURRENCY connectors in parallel using Promise.allSettled,
     * reducing wall-clock to max(individual sync times) per batch.
     *
     * Uses incremental sync if a cursor exists, full sync otherwise.
     */
    async syncAll(
      supabase: SupabaseClient,
      orgId: string
    ): Promise<ConnectorSyncResult[]> {
      const results: ConnectorSyncResult[] = [];
      const connectors = Array.from(connectorMap.values());

      // Process connectors in parallel batches
      for (let i = 0; i < connectors.length; i += CONCURRENCY) {
        const batch = connectors.slice(i, i + CONCURRENCY);

        const batchResults = await Promise.allSettled(
          batch.map(async (connector) => {
            // Acquire global rate-limit token before starting
            await acquireToken(10_000);
            return this.syncOne(connector.id, supabase, orgId);
          })
        );

        for (let j = 0; j < batchResults.length; j++) {
          const settled = batchResults[j];
          if (settled.status === 'fulfilled') {
            results.push(settled.value);
          } else {
            results.push({
              success: false,
              signalsGenerated: 0,
              recordsProcessed: 0,
              errors: [`${batch[j].id}: ${settled.reason?.message || 'Unknown error'}`],
              duration_ms: 0,
              lastSyncedAt: new Date(),
            });
          }
        }
      }

      return results;
    },

    /**
     * Sync a specific connector by ID.
     */
    async syncOne(
      connectorId: string,
      supabase: SupabaseClient,
      orgId: string
    ): Promise<ConnectorSyncResult> {
      const connector = connectorMap.get(connectorId);
      if (!connector) {
        throw new Error(`Connector '${connectorId}' not registered`);
      }

      // Check for existing cursor
      const cursor = await getCursor(supabase, connectorId, orgId);

      let result: ConnectorSyncResult;
      let syncType: 'full' | 'incremental';

      if (cursor) {
        // Incremental sync from last sync time
        result = await connector.incrementalSync(supabase, orgId, cursor.lastSyncedAt);
        syncType = 'incremental';
      } else {
        // First sync — full
        result = await connector.fullSync(supabase, orgId);
        syncType = 'full';
      }

      // Update cursor
      if (result.success) {
        await updateCursor(supabase, connectorId, orgId, result, syncType);
      }

      return result;
    },

    /**
     * Get cursor for a connector
     */
    async getCursor(
      connectorId: string,
      supabase: SupabaseClient,
      orgId: string
    ): Promise<SyncCursor | null> {
      return getCursor(supabase, connectorId, orgId);
    },

    /**
     * Register a new connector at runtime
     */
    registerConnector(connector: NexusConnector): void {
      connectorMap.set(connector.id, connector);
    },

    /**
     * List all registered connectors with sync status
     */
    async getStatus(
      supabase: SupabaseClient,
      orgId: string
    ): Promise<SyncStatus[]> {
      const statuses: SyncStatus[] = [];

      for (const connector of connectorMap.values()) {
        const cursor = await getCursor(supabase, connector.id, orgId);

        if (!cursor) {
          statuses.push({
            connectorId: connector.id,
            connectorName: connector.name,
            domain: connector.domain,
            status: 'never_synced',
          });
        } else {
          const hasErrors =
            cursor.cursorData?.errors &&
            (cursor.cursorData.errors as string[]).length > 0;

          statuses.push({
            connectorId: connector.id,
            connectorName: connector.name,
            domain: connector.domain,
            lastSynced: cursor.lastSyncedAt,
            status: hasErrors ? 'error' : 'synced',
            lastError: hasErrors
              ? (cursor.cursorData!.errors as string[])[0]
              : undefined,
          });
        }
      }

      return statuses;
    },

    /**
     * Get list of registered connector IDs
     */
    getRegisteredConnectors(): string[] {
      return Array.from(connectorMap.keys());
    },

    /**
     * Acquire a global rate-limit token.
     * Connectors should call this before each API request when
     * globalRateLimitPerMinute is configured.
     * Returns true if token acquired, false if timeout.
     */
    acquireToken,
  };
}
