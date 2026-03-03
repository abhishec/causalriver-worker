-- ADR-029: Trained Capability Agents — ingestion_jobs table
--
-- Tracks bulk ingestion operations (batches of documents from a connector).
-- The existing document_chunks table stores results; this table tracks the JOB
-- of ingesting them. Supports Google Drive, Confluence, web crawling, S3, uploads.
--
-- Lambda-safe: cron resumes from last checkpoint if Lambda dies mid-batch.

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ai_worker_id UUID,              -- nullable: scoped to a worker, or workspace-global

  -- Source
  connector_type TEXT NOT NULL,    -- 'google_drive' | 'confluence' | 'web_crawler' | 's3' | 'upload'
  source_config JSONB NOT NULL DEFAULT '{}',
  -- Google Drive: { folderId, recursive, mimeTypes }
  -- Confluence: { spaceKeys, pageLimit, includeAttachments }
  -- Web Crawler: { seedUrls, maxDepth, maxPages, allowedDomains }
  -- S3: { bucket, prefix }
  -- Upload: { fileIds }

  -- Status + Progress
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  total_documents INTEGER DEFAULT 0,
  processed_documents INTEGER DEFAULT 0,
  failed_documents INTEGER DEFAULT 0,
  total_chunks_created INTEGER DEFAULT 0,

  -- Error tracking
  error_log JSONB DEFAULT '[]',    -- [{ documentTitle, error, timestamp }]

  -- Checkpoint (for Lambda resume)
  checkpoint JSONB DEFAULT '{}',   -- { lastPageToken, lastDocumentIndex, ... }

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_org_status
  ON ingestion_jobs (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_worker
  ON ingestion_jobs (ai_worker_id, status)
  WHERE ai_worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_pending
  ON ingestion_jobs (status, created_at)
  WHERE status IN ('pending', 'running');

-- RLS
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_jobs_select_own_org" ON ingestion_jobs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ingestion_jobs_insert_own_org" ON ingestion_jobs
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Grants
GRANT SELECT, INSERT ON ingestion_jobs TO authenticated;
GRANT ALL ON ingestion_jobs TO service_role;
