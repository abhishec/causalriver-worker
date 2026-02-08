-- =============================================================================
-- Sync Cursors Table
--
-- Tracks last sync time per connector per organization.
-- Used by the SyncManager to determine full vs incremental sync.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sync_cursors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  connector_id TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL,
  last_sync_type TEXT DEFAULT 'full',
  cursor_data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_cursors_org
  ON sync_cursors (organization_id);
