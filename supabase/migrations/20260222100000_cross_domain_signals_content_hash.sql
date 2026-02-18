-- ============================================================================
-- NB-023: Add content_hash column to cross_domain_signals for deduplication
-- ============================================================================
-- StreamProcessor.deduplicateSignals() falls back to querying cross_domain_signals
-- by content_hash when Redis is unavailable. Without this column the fallback
-- query fails and duplicate signals can be inserted at scale.
-- ============================================================================

ALTER TABLE cross_domain_signals
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Fast lookup by hash (sparse index — only rows that have a hash)
CREATE INDEX IF NOT EXISTS idx_cds_content_hash
  ON cross_domain_signals (content_hash)
  WHERE content_hash IS NOT NULL;

-- Composite index for the exact query pattern used in StreamProcessor:
--   .select('content_hash').in('content_hash', hashes).eq('organization_id', orgId)
CREATE INDEX IF NOT EXISTS idx_cds_org_content_hash
  ON cross_domain_signals (organization_id, content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON COLUMN cross_domain_signals.content_hash IS
  'SHA-256 hash of source_domain:signal_type:entity_id:signal_timestamp[:branch_name]. '
  'Used by StreamProcessor for DB-level deduplication when Redis is unavailable.';
