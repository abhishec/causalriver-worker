-- Document Chunks — Vector Search RPC
-- =====================================
-- Adds a server-side function for semantic similarity search over document_chunks.
-- Called by searchDocumentChunks() in document-ingester.ts when embeddings exist.
--
-- The embedding column is vector(1536) — n-gram embeddings are padded from 384 → 1536
-- using zero-padding before storage. This keeps all search in the same column.

CREATE OR REPLACE FUNCTION search_document_chunks(
  p_organization_id UUID,
  query_embedding   extensions.vector(1536),
  match_count       INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_text      TEXT,
  document_title  TEXT,
  chunk_index     INT,
  source_type     TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.chunk_text,
    dc.document_title,
    dc.chunk_index,
    dc.source_type
  FROM document_chunks dc
  WHERE
    dc.organization_id = p_organization_id
    AND dc.embedding IS NOT NULL
    AND (dc.expires_at IS NULL OR dc.expires_at > now())
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant RPC access to both roles
GRANT EXECUTE ON FUNCTION search_document_chunks(UUID, extensions.vector(1536), INTEGER)
  TO authenticated, service_role;
