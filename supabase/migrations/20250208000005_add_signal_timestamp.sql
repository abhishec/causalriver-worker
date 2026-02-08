-- =============================================================================
-- Add signal_timestamp to cross_domain_signals
--
-- The signal_timestamp represents WHEN the signal data actually occurred
-- (e.g., FRED observation date, Wikipedia article timestamp, etc.),
-- as opposed to created_at which is when the row was inserted into the DB.
--
-- This is critical for Granger causality discovery, which needs the actual
-- temporal ordering of events, not the insertion order.
-- =============================================================================

-- Add the column (nullable, defaults to created_at for existing rows)
ALTER TABLE cross_domain_signals
ADD COLUMN IF NOT EXISTS signal_timestamp TIMESTAMPTZ;

-- Backfill existing rows: use signal_metadata->>'date' if available, else created_at
UPDATE cross_domain_signals
SET signal_timestamp = COALESCE(
  (signal_metadata->>'date')::TIMESTAMPTZ,
  (signal_metadata->>'timestamp')::TIMESTAMPTZ,
  created_at
)
WHERE signal_timestamp IS NULL;

-- Set default for future rows
ALTER TABLE cross_domain_signals
ALTER COLUMN signal_timestamp SET DEFAULT NOW();

-- Add index for temporal queries
CREATE INDEX IF NOT EXISTS idx_signals_timestamp
  ON cross_domain_signals (signal_timestamp DESC);

-- Composite index for org + timestamp (used by learner and scheduled jobs)
CREATE INDEX IF NOT EXISTS idx_signals_org_timestamp
  ON cross_domain_signals (organization_id, signal_timestamp ASC);
