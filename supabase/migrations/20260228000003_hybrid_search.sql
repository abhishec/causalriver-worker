-- Hybrid Search: BM25 (keyword) + Vector (semantic) via Reciprocal Rank Fusion
-- =============================================================================
-- Production systems (OpenAI, Cursor, every major RAG) use hybrid search.
-- Vector alone misses exact names/IDs. BM25 alone misses concept matches.
-- Combined via RRF: universal recall improvement.
--
-- Note: document_chunks already has search_vector (tsvector GENERATED ALWAYS AS).
-- We add pg_trgm for trigram fuzzy matching and a hybrid search RPC.

-- Enable pg_trgm for fuzzy keyword matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index for trigram similarity (fuzzy matching on exact names, IDs, etc.)
-- search_vector GIN index already exists (document_chunks_search index)
CREATE INDEX IF NOT EXISTS idx_document_chunks_trgm
  ON document_chunks USING GIN (chunk_text gin_trgm_ops);

-- Hybrid search function: vector (semantic) + BM25 (keyword) combined
-- Uses Reciprocal Rank Fusion (RRF) to merge rankings without score normalization.
-- RRF formula: score = vector_weight*(1/(k+rank_v)) + bm25_weight*(1/(k+rank_b)), k=60
--
-- vector_weight=0.6, bm25_weight=0.4 (tunable)
-- Returns top p_limit chunks ordered by fused score.
CREATE OR REPLACE FUNCTION search_document_chunks_hybrid(
  query_text     TEXT,
  query_embedding extensions.vector(1536),
  p_org_id       UUID,
  p_limit        INT DEFAULT 10,
  vector_weight  FLOAT DEFAULT 0.6,
  bm25_weight    FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  id             UUID,
  document_title TEXT,
  chunk_text     TEXT,
  chunk_index    INT,
  source_type    TEXT,
  similarity     FLOAT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  WITH
  -- Vector search results (semantic similarity via cosine distance)
  vector_results AS (
    SELECT
      dc.id,
      dc.document_title,
      dc.chunk_text,
      dc.chunk_index,
      dc.source_type,
      1.0 - (dc.embedding <=> query_embedding) AS score,
      ROW_NUMBER() OVER (ORDER BY dc.embedding <=> query_embedding) AS rank
    FROM document_chunks dc
    WHERE dc.organization_id = p_org_id
      AND dc.embedding IS NOT NULL
      AND (dc.expires_at IS NULL OR dc.expires_at > now())
    ORDER BY dc.embedding <=> query_embedding
    LIMIT p_limit * 2
  ),
  -- BM25-style full-text search results (keyword/exact name matching)
  bm25_results AS (
    SELECT
      dc.id,
      dc.document_title,
      dc.chunk_text,
      dc.chunk_index,
      dc.source_type,
      ts_rank_cd(dc.search_vector, websearch_to_tsquery('english', query_text)) AS score,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(dc.search_vector, websearch_to_tsquery('english', query_text)) DESC
      ) AS rank
    FROM document_chunks dc
    WHERE dc.organization_id = p_org_id
      AND dc.search_vector @@ websearch_to_tsquery('english', query_text)
      AND (dc.expires_at IS NULL OR dc.expires_at > now())
    ORDER BY score DESC
    LIMIT p_limit * 2
  ),
  -- Reciprocal Rank Fusion: merge both ranked lists
  rrf AS (
    SELECT
      COALESCE(v.id, b.id)                         AS id,
      COALESCE(v.document_title, b.document_title)  AS document_title,
      COALESCE(v.chunk_text, b.chunk_text)           AS chunk_text,
      COALESCE(v.chunk_index, b.chunk_index)         AS chunk_index,
      COALESCE(v.source_type, b.source_type)         AS source_type,
      -- RRF score: sum of weighted reciprocal ranks (k=60 per original paper)
      COALESCE(vector_weight * (1.0 / (60.0 + v.rank)), 0.0) +
      COALESCE(bm25_weight   * (1.0 / (60.0 + b.rank)), 0.0) AS rrf_score
    FROM vector_results v
    FULL OUTER JOIN bm25_results b ON v.id = b.id
  )
  SELECT id, document_title, chunk_text, chunk_index, source_type, rrf_score AS similarity
  FROM rrf
  ORDER BY rrf_score DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION search_document_chunks_hybrid(TEXT, extensions.vector(1536), UUID, INT, FLOAT, FLOAT)
  TO authenticated, service_role;

COMMENT ON FUNCTION search_document_chunks_hybrid IS
  'Hybrid BM25+vector search via Reciprocal Rank Fusion. '
  'Eliminates false negatives on exact names (Alice Johnson, sprint-42, Jira-1234) '
  'while preserving semantic recall. vector_weight=0.6, bm25_weight=0.4 by default.';
