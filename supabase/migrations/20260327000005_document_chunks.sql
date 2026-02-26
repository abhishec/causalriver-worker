-- Document Chunks — large document ingestion pipeline
-- Supports PDF, Confluence pages, code files, markdown docs
-- Uses pgvector for semantic similarity search

-- Enable pgvector extension (must be in extensions schema for Supabase)
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS document_chunks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Source document metadata
  source_url       TEXT,           -- original URL or S3 key
  source_type      TEXT NOT NULL,  -- 'pdf', 'confluence', 'github', 'markdown', 'text'
  document_title   TEXT,
  document_id      TEXT,           -- external ID (e.g. Confluence page ID)

  -- Chunk content
  chunk_index      INT NOT NULL,   -- position within document (0-based)
  chunk_text       TEXT NOT NULL,  -- raw text content of this chunk
  chunk_tokens     INT,            -- estimated token count

  -- Semantic embedding (1536 dims = voyage-3 / OpenAI ada-002 compatible)
  embedding        extensions.vector(1536),   -- NULL until embedding job processes it

  -- Full-text search (always populated — used when embedding is NULL)
  search_vector    tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,

  -- Metadata
  metadata         JSONB DEFAULT '{}',  -- page number, section, headings, etc.

  -- Retention
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 days'),
  pinned           BOOLEAN NOT NULL DEFAULT false,  -- pinned chunks never expire

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS document_chunks_org_source
  ON document_chunks(organization_id, source_type, created_at DESC);

CREATE INDEX IF NOT EXISTS document_chunks_search
  ON document_chunks USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS document_chunks_embedding
  ON document_chunks USING ivfflat(embedding extensions.vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- Auto-delete expired, unpinned chunks
CREATE INDEX IF NOT EXISTS document_chunks_expiry
  ON document_chunks(expires_at)
  WHERE pinned = false;

-- RLS
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read document chunks"
  ON document_chunks FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role manages document chunks"
  ON document_chunks FOR ALL
  USING (true) WITH CHECK (true);

GRANT SELECT ON document_chunks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_chunks TO service_role;

COMMENT ON TABLE document_chunks IS
  'Chunked content from large documents (PDFs, Confluence, GitHub). '
  'Used by BrainContextMesh for semantic retrieval during domain execution. '
  'Chunks expire after 90 days unless pinned. Embedding populated async.';
