-- Add unique constraint on (organization_id, source_id) for knowledge_chunks
-- This enables upsert-based deduplication in commit ingestion pipelines.
-- source_id is nullable; only non-null pairs are constrained (partial unique index).
--
-- DEDUP STEP: Before creating the unique index, remove duplicate (organization_id, source_id)
-- pairs by keeping only the most recently ingested row for each pair.
-- This is safe because duplicate rows represent the same logical chunk ingested multiple times.
-- NOTE: knowledge_chunks uses ingested_at (not created_at) as the timestamp column.

DELETE FROM knowledge_chunks
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY organization_id, source_id
             ORDER BY ingested_at DESC
           ) AS rn
    FROM knowledge_chunks
    WHERE source_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_chunks_org_source_id_unique
  ON knowledge_chunks (organization_id, source_id)
  WHERE source_id IS NOT NULL;
