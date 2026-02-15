-- ============================================================================
-- Connector Checkpoints & Signal Deduplication
-- ============================================================================
-- Adds checkpoint tracking for resumable ingestion and content hashing
-- for deduplication at 10M+ scale.
-- ============================================================================

-- ── Connector Checkpoints Table ─────────────────────────────────────────────
-- Tracks ingestion progress for each organization + connector type
-- Enables resume capability when jobs fail mid-ingestion

CREATE TABLE IF NOT EXISTS connector_checkpoints (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, completed, failed
  progress_pct INTEGER DEFAULT 0,
  signals_ingested INTEGER DEFAULT 0,

  -- Connector-specific state (varies by connector)
  state JSONB DEFAULT '{}',

  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (organization_id, connector_type)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_status
  ON connector_checkpoints (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkpoints_org
  ON connector_checkpoints (organization_id);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_checkpoint_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER connector_checkpoints_updated_at
  BEFORE UPDATE ON connector_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_checkpoint_timestamp();

-- ── Add Content Hash to Connector Signals ──────────────────────────────────
-- Used for deduplication - avoids re-processing same signals

ALTER TABLE connector_signals
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_connector_signals_content_hash
  ON connector_signals (content_hash)
  WHERE content_hash IS NOT NULL;

-- Composite index for fast lookup
CREATE INDEX IF NOT EXISTS idx_connector_signals_org_hash
  ON connector_signals (organization_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- ── Increment Connector Signals RPC ─────────────────────────────────────────
-- Atomic increment for org_connectors.signals_count

CREATE OR REPLACE FUNCTION increment_connector_signals(
  p_organization_id UUID,
  p_connector_type TEXT,
  p_increment INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE org_connectors
  SET
    signals_count = COALESCE(signals_count, 0) + p_increment,
    last_sync_at = NOW()
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION increment_connector_signals(UUID, TEXT, INTEGER) TO authenticated;

-- ── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get active checkpoints (for monitoring dashboard)
 */
CREATE OR REPLACE FUNCTION get_active_checkpoints()
RETURNS TABLE (
  organization_id UUID,
  connector_type TEXT,
  progress_pct INTEGER,
  signals_ingested INTEGER,
  started_at TIMESTAMPTZ,
  duration_seconds INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.organization_id,
    cp.connector_type,
    cp.progress_pct,
    cp.signals_ingested,
    cp.started_at,
    EXTRACT(EPOCH FROM (NOW() - cp.started_at))::INTEGER as duration_seconds
  FROM connector_checkpoints cp
  WHERE cp.status = 'in_progress'
  ORDER BY cp.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

/**
 * Calculate ETA for a checkpoint
 */
CREATE OR REPLACE FUNCTION calculate_checkpoint_eta(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_checkpoint connector_checkpoints;
  v_elapsed_seconds INTEGER;
  v_total_estimated_seconds INTEGER;
  v_remaining_seconds INTEGER;
BEGIN
  SELECT * INTO v_checkpoint
  FROM connector_checkpoints
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type;

  IF NOT FOUND OR v_checkpoint.progress_pct = 0 THEN
    RETURN NULL;
  END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - v_checkpoint.started_at))::INTEGER;
  v_total_estimated_seconds := (v_elapsed_seconds / v_checkpoint.progress_pct) * 100;
  v_remaining_seconds := v_total_estimated_seconds - v_elapsed_seconds;

  RETURN GREATEST(0, v_remaining_seconds);
END;
$$ LANGUAGE plpgsql;

-- ── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE connector_checkpoints ENABLE ROW LEVEL SECURITY;

-- Users can see checkpoints for their organizations
CREATE POLICY "checkpoint_read" ON connector_checkpoints
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
  );

-- Platform admins can see all checkpoints
CREATE POLICY "checkpoint_admin_read" ON connector_checkpoints
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
  );

-- ── Comments ────────────────────────────────────────────────────────────────

COMMENT ON TABLE connector_checkpoints IS
  'Tracks ingestion progress for resumable jobs. Enables recovery from failures at 10M+ scale.';

COMMENT ON COLUMN connector_signals.content_hash IS
  'SHA-256 hash of signal content for deduplication. Format: sha256(source:type:content:timestamp)';

COMMENT ON FUNCTION increment_connector_signals(UUID, TEXT, INTEGER) IS
  'Atomically increments signals_count for a connector and updates last_sync_at';

COMMENT ON FUNCTION get_active_checkpoints() IS
  'Returns all in-progress ingestion jobs with duration for monitoring dashboard';

COMMENT ON FUNCTION calculate_checkpoint_eta(UUID, TEXT) IS
  'Calculates estimated time remaining (seconds) for an ingestion job based on progress';
