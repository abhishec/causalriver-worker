-- Add unique constraint on (organization_id, source_id) for knowledge_chunks
-- This enables upsert-based deduplication in commit ingestion pipelines.
-- source_id is nullable; only non-null pairs are constrained (partial unique index).

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_chunks_org_source_id_unique
  ON knowledge_chunks (organization_id, source_id)
  WHERE source_id IS NOT NULL;
