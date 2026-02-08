-- =============================================================================
-- Fix Embedding Dimensions: 1536 → 384
--
-- The embedding engine (embedding-engine.ts) generates 384-dimensional vectors
-- using n-gram hashing, but the original schema and all RPC functions were
-- created with 1536-dimensional vectors. This migration fixes the mismatch.
--
-- Changes:
--   1. Alter entity_embeddings.embedding column from vector(1536) to vector(384)
--   2. Drop and recreate the IVFFlat index for 384 dimensions
--   3. Add content_hash column (used by embedding engine for dedup)
--   4. Recreate all 4 RPC functions to accept vector(384)
-- =============================================================================

-- Step 1: Drop the existing IVFFlat index (depends on vector dimension)
DROP INDEX IF EXISTS idx_embeddings_vector;

-- Step 2: Alter the column type
ALTER TABLE entity_embeddings
  ALTER COLUMN embedding TYPE extensions.vector(384);

-- Step 3: Recreate the IVFFlat index for 384 dimensions
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON entity_embeddings USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- Step 4: Add content_hash column (the engine writes content_hash for dedup)
ALTER TABLE entity_embeddings
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_embeddings_content_hash
  ON entity_embeddings (organization_id, content_hash);

-- =============================================================================
-- Recreate RPC Functions with vector(384)
-- =============================================================================

-- 1. search_embeddings
CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding extensions.vector(384),
  match_threshold NUMERIC DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
  p_organization_id UUID DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  entity_type TEXT,
  entity_id TEXT,
  content TEXT,
  metadata JSONB,
  importance_score NUMERIC,
  similarity NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ee.id,
    ee.organization_id,
    ee.entity_type,
    ee.entity_id,
    ee.content,
    ee.metadata,
    ee.importance_score,
    (1 - (ee.embedding <=> query_embedding))::NUMERIC AS similarity
  FROM entity_embeddings ee
  WHERE
    (p_organization_id IS NULL OR ee.organization_id = p_organization_id)
    AND (p_entity_type IS NULL OR ee.entity_type = p_entity_type)
    AND (1 - (ee.embedding <=> query_embedding)) > match_threshold
  ORDER BY ee.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 2. get_rag_context
CREATE OR REPLACE FUNCTION get_rag_context(
  query_embedding extensions.vector(384),
  p_organization_id UUID,
  p_domain TEXT DEFAULT NULL,
  match_threshold NUMERIC DEFAULT 0.6,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  source TEXT,
  content TEXT,
  metadata JSONB,
  relevance_score NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Return matching embeddings
  RETURN QUERY
  SELECT
    'embedding'::TEXT AS source,
    ee.content,
    jsonb_build_object(
      'entity_type', ee.entity_type,
      'entity_id', ee.entity_id,
      'importance', ee.importance_score
    ) AS metadata,
    (1 - (ee.embedding <=> query_embedding))::NUMERIC AS relevance_score
  FROM entity_embeddings ee
  WHERE
    ee.organization_id = p_organization_id
    AND (1 - (ee.embedding <=> query_embedding)) > match_threshold
  ORDER BY ee.embedding <=> query_embedding
  LIMIT match_count;

  -- Return relevant memories
  RETURN QUERY
  SELECT
    'memory'::TEXT AS source,
    m.content,
    jsonb_build_object(
      'domain', m.domain,
      'memory_type', m.memory_type,
      'importance', m.importance
    ) AS metadata,
    m.importance AS relevance_score
  FROM ai_memory m
  WHERE
    m.organization_id = p_organization_id
    AND (p_domain IS NULL OR m.domain = p_domain)
    AND m.importance > 0.3
  ORDER BY m.importance DESC, m.last_accessed_at DESC NULLS LAST
  LIMIT match_count;
END;
$$;

-- 3. get_rag_context_with_memory
CREATE OR REPLACE FUNCTION get_rag_context_with_memory(
  query_embedding extensions.vector(384),
  p_organization_id UUID,
  p_domain TEXT DEFAULT NULL,
  match_threshold NUMERIC DEFAULT 0.6,
  match_count INTEGER DEFAULT 5,
  memory_weight NUMERIC DEFAULT 0.3
)
RETURNS TABLE (
  source TEXT,
  content TEXT,
  metadata JSONB,
  relevance_score NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    'embedding'::TEXT AS source,
    ee.content,
    jsonb_build_object(
      'entity_type', ee.entity_type,
      'entity_id', ee.entity_id,
      'importance', ee.importance_score
    ) AS metadata,
    (
      (1 - memory_weight) * (1 - (ee.embedding <=> query_embedding))::NUMERIC +
      memory_weight * COALESCE(ee.importance_score, 0.5)
    ) AS relevance_score
  FROM entity_embeddings ee
  WHERE
    ee.organization_id = p_organization_id
    AND (1 - (ee.embedding <=> query_embedding)) > match_threshold
  ORDER BY relevance_score DESC
  LIMIT match_count;
END;
$$;

-- 4. search_memory_weighted
CREATE OR REPLACE FUNCTION search_memory_weighted(
  query_embedding extensions.vector(384),
  p_organization_id UUID,
  p_domain TEXT DEFAULT NULL,
  match_count INTEGER DEFAULT 10,
  importance_weight NUMERIC DEFAULT 0.4,
  recency_weight NUMERIC DEFAULT 0.2
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  domain TEXT,
  memory_type TEXT,
  importance NUMERIC,
  composite_score NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  similarity_weight NUMERIC;
BEGIN
  similarity_weight := 1.0 - importance_weight - recency_weight;

  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.domain,
    m.memory_type,
    m.importance,
    (
      similarity_weight * GREATEST(0, (1 - (ee.embedding <=> query_embedding))::NUMERIC) +
      importance_weight * COALESCE(m.importance, 0.5) +
      recency_weight * CASE
        WHEN m.last_accessed_at IS NULL THEN 0.1
        WHEN m.last_accessed_at > NOW() - INTERVAL '1 day' THEN 1.0
        WHEN m.last_accessed_at > NOW() - INTERVAL '7 days' THEN 0.7
        WHEN m.last_accessed_at > NOW() - INTERVAL '30 days' THEN 0.4
        ELSE 0.1
      END
    ) AS composite_score
  FROM ai_memory m
  LEFT JOIN entity_embeddings ee
    ON ee.organization_id = m.organization_id
    AND ee.entity_type = 'memory'
    AND ee.entity_id = m.id::TEXT
  WHERE
    m.organization_id = p_organization_id
    AND (p_domain IS NULL OR m.domain = p_domain)
  ORDER BY composite_score DESC
  LIMIT match_count;
END;
$$;
