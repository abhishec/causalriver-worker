-- ============================================================================
-- Add storage_config to organizations table
-- ============================================================================
-- Stores per-org storage configuration (S3 bucket, region, prefix, etc.)
-- Schema: { s3: { bucket, region, prefix, enabled } }
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS storage_config JSONB DEFAULT '{}';

COMMENT ON COLUMN organizations.storage_config IS
  'Org-level storage configuration: { s3: { bucket, region, prefix, enabled } }';
