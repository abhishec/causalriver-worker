-- =============================================================================
-- Fix RPC Parameter Name Mismatch
--
-- CRITICAL BUG: The TypeScript code passes parameter names like:
--   filter_organization_id, filter_entity_types, context_limit
-- But the RPC functions expect:
--   p_organization_id, p_entity_type, match_count
--
-- Supabase RPC maps parameters by name, so the mismatch means the
-- organization filter was SILENTLY IGNORED in all search operations.
-- This is a cross-tenant data leak.
--
-- This migration recreates all 4 search RPC functions with parameter names
-- that match what the TypeScript code passes.
--
-- Affected functions:
--   1. search_embeddings     (filter_organization_id, filter_entity_types)
--   2. get_rag_context       (filter_organization_id, context_limit)
--   3. get_rag_context_with_memory (filter_organization_id)
--   4. search_memory_weighted      (filter_organization_id)
-- =============================================================================

-- Drop existing functions (they will be recreated with correct parameter names)
DROP FUNCTION IF EXISTS search_embeddings(extensions.vector(384), NUMERIC, INTEGER, UUID, TEXT);
DROP FUNCTION IF EXISTS get_rag_context(extensions.vector(384), UUID, TEXT, NUMERIC, INTEGER);
DROP FUNCTION IF EXISTS get_rag_context_with_memory(extensions.vector(384), UUID, TEXT, NUMERIC, INTEGER, NUMERIC);
DROP FUNCTION IF EXISTS search_memory_weighted(extensions.vector(384), UUID, TEXT, INTEGER, NUMERIC, NUMERIC);

-- =============================================================================
-- 1. search_embeddings
--    Parameters match TypeScript: filter_organization_id, filter_entity_types
-- =============================================================================
CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding extensions.vector(384),
  match_threshold NUMERIC DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
  filter_entity_types TEXT DEFAULT NULL,
  filter_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  entity_type TEXT,
  entity_id TEXT,
  content TEXT,
  content_text TEXT,
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
    ee.content AS content_text,
    ee.metadata,
    ee.importance_score,
    (1 - (ee.embedding <=> query_embedding))::NUMERIC AS similarity
  FROM entity_embeddings ee
  WHERE
    (filter_organization_id IS NULL OR ee.organization_id = filter_organization_id)
    AND (filter_entity_types IS NULL OR ee.entity_type = filter_entity_types)
    AND (1 - (ee.embedding <=> query_embedding)) > match_threshold
  ORDER BY ee.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =============================================================================
-- 2. get_rag_context
--    Parameters match TypeScript: filter_organization_id, context_limit
-- =============================================================================
CREATE OR REPLACE FUNCTION get_rag_context(
  query_embedding extensions.vector(384),
  filter_organization_id UUID DEFAULT NULL,
  context_limit INTEGER DEFAULT 5,
  match_threshold NUMERIC DEFAULT 0.6
)
RETURNS TABLE (
  source TEXT,
  entity_type TEXT,
  entity_id TEXT,
  content TEXT,
  content_text TEXT,
  metadata JSONB,
  relevance NUMERIC,
  relevance_score NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Return matching embeddings
  RETURN QUERY
  SELECT
    'embedding'::TEXT AS source,
    ee.entity_type,
    ee.entity_id,
    ee.content,
    ee.content AS content_text,
    jsonb_build_object(
      'entity_type', ee.entity_type,
      'entity_id', ee.entity_id,
      'importance', ee.importance_score
    ) AS metadata,
    ((1 - (ee.embedding <=> query_embedding))::NUMERIC * 100) AS relevance,
    (1 - (ee.embedding <=> query_embedding))::NUMERIC AS relevance_score
  FROM entity_embeddings ee
  WHERE
    (filter_organization_id IS NULL OR ee.organization_id = filter_organization_id)
    AND (1 - (ee.embedding <=> query_embedding)) > match_threshold
  ORDER BY ee.embedding <=> query_embedding
  LIMIT context_limit;

  -- Return relevant memories
  RETURN QUERY
  SELECT
    'memory'::TEXT AS source,
    'memory'::TEXT AS entity_type,
    m.id::TEXT AS entity_id,
    m.content,
    m.content AS content_text,
    jsonb_build_object(
      'domain', m.domain,
      'memory_type', m.memory_type,
      'importance', m.importance
    ) AS metadata,
    (m.importance * 100) AS relevance,
    m.importance AS relevance_score
  FROM ai_memory m
  WHERE
    (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
    AND m.importance > 0.3
  ORDER BY m.importance DESC, m.last_accessed_at DESC NULLS LAST
  LIMIT context_limit;
END;
$$;

-- =============================================================================
-- 3. get_rag_context_with_memory
--    Parameters match TypeScript: filter_organization_id
-- =============================================================================
CREATE OR REPLACE FUNCTION get_rag_context_with_memory(
  query_embedding extensions.vector(384),
  filter_organization_id UUID DEFAULT NULL,
  match_threshold NUMERIC DEFAULT 0.6,
  entity_limit INTEGER DEFAULT 5,
  memory_limit INTEGER DEFAULT 3,
  memory_weight NUMERIC DEFAULT 0.3
)
RETURNS TABLE (
  source_type TEXT,
  entity_type TEXT,
  entity_id TEXT,
  content_text TEXT,
  metadata JSONB,
  similarity NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Entity results
  RETURN QUERY
  SELECT
    'entity'::TEXT AS source_type,
    ee.entity_type,
    ee.entity_id,
    ee.content AS content_text,
    jsonb_build_object(
      'entity_type', ee.entity_type,
      'entity_id', ee.entity_id,
      'importance', ee.importance_score
    ) AS metadata,
    (
      (1 - memory_weight) * (1 - (ee.embedding <=> query_embedding))::NUMERIC +
      memory_weight * COALESCE(ee.importance_score, 0.5)
    ) AS similarity
  FROM entity_embeddings ee
  WHERE
    (filter_organization_id IS NULL OR ee.organization_id = filter_organization_id)
    AND (1 - (ee.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT entity_limit;

  -- Memory results
  RETURN QUERY
  SELECT
    'memory'::TEXT AS source_type,
    'memory'::TEXT AS entity_type,
    m.id::TEXT AS entity_id,
    m.content AS content_text,
    jsonb_build_object(
      'domain', m.domain,
      'memory_type', m.memory_type,
      'importance', m.importance,
      'confidence', m.importance
    ) AS metadata,
    m.importance AS similarity
  FROM ai_memory m
  WHERE
    (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
    AND m.importance > 0.3
  ORDER BY m.importance DESC, m.last_accessed_at DESC NULLS LAST
  LIMIT memory_limit;
END;
$$;

-- =============================================================================
-- 4. search_memory_weighted
--    Parameters match TypeScript: filter_organization_id
-- =============================================================================
CREATE OR REPLACE FUNCTION search_memory_weighted(
  query_embedding extensions.vector(384),
  match_threshold NUMERIC DEFAULT 0.4,
  match_count INTEGER DEFAULT 10,
  filter_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  entity_type TEXT,
  entity_id TEXT,
  content TEXT,
  content_text TEXT,
  domain TEXT,
  memory_type TEXT,
  importance NUMERIC,
  similarity NUMERIC,
  metadata JSONB,
  composite_score NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  importance_weight NUMERIC := 0.4;
  recency_weight NUMERIC := 0.2;
  similarity_weight NUMERIC;
BEGIN
  similarity_weight := 1.0 - importance_weight - recency_weight;

  RETURN QUERY
  SELECT
    m.id,
    'memory'::TEXT AS entity_type,
    m.id::TEXT AS entity_id,
    m.content,
    m.content AS content_text,
    m.domain,
    m.memory_type,
    m.importance,
    COALESCE(
      GREATEST(0, (1 - (ee.embedding <=> query_embedding))::NUMERIC),
      0.0
    ) AS similarity,
    jsonb_build_object(
      'confidence', m.importance,
      'access_count', COALESCE(m.access_count, 0)
    ) AS metadata,
    (
      similarity_weight * COALESCE(
        GREATEST(0, (1 - (ee.embedding <=> query_embedding))::NUMERIC),
        0.0
      ) +
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
    (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
  ORDER BY composite_score DESC
  LIMIT match_count;
END;
$$;

-- =============================================================================
-- Grant execute permissions
-- =============================================================================
GRANT EXECUTE ON FUNCTION search_embeddings TO service_role;
GRANT EXECUTE ON FUNCTION get_rag_context TO service_role;
GRANT EXECUTE ON FUNCTION get_rag_context_with_memory TO service_role;
GRANT EXECUTE ON FUNCTION search_memory_weighted TO service_role;
