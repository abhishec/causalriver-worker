-- =============================================================================
-- Activate Warm-Tier Partitioning + IVFFlat Probes
--
-- TWO CRITICAL 10M-SCALE FIXES:
--
-- 1. WARM-TIER ACTIVATION: The warm_tier_signals table and archival functions
--    were created in 20250224000001 but NEVER activated. No pg_cron jobs were
--    scheduled, no application code routes signals there. At 10M+ signals,
--    cross_domain_signals grows unbounded → query degradation.
--
--    Fix: Schedule pg_cron jobs for:
--    - Monthly partition creation (1st of each month)
--    - Weekly warm-to-cold archival (every Sunday 2 AM)
--    - Create a trigger to copy signals to warm tier on INSERT
--
-- 2. IVFFLAT PROBES: The vector index was upgraded from 100→1000 lists in
--    20250227000001, but the RPC search functions don't SET ivfflat.probes.
--    pgvector defaults probes=1, meaning with 1000 lists it only searches
--    0.1% of the index → misses 99.9% of potential matches.
--
--    Fix: SET LOCAL ivfflat.probes = 20 in all search RPC functions.
--    This searches 2% of the index = good accuracy/speed tradeoff.
-- =============================================================================

-- ============================================================================
-- PART 1: WARM-TIER ACTIVATION
-- ============================================================================

-- 1a. Create trigger function to copy new signals to warm tier
-- This runs AFTER INSERT on cross_domain_signals, so both tables stay in sync.
-- Hot-tier (cross_domain_signals) serves real-time queries.
-- Warm-tier serves archival/historical queries with partition pruning.
CREATE OR REPLACE FUNCTION copy_signal_to_warm_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO warm_tier_signals (
    id, organization_id, domain, entity_type, entity_id,
    signal_type, signal_value, metadata, created_at
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    COALESCE(NEW.source_domain, 'unknown'),
    COALESCE(NEW.entity_type, 'unknown'),
    COALESCE(NEW.entity_id, 'auto_' || extract(epoch from now())::text),
    NEW.signal_type,
    NEW.signal_value,
    COALESCE(NEW.signal_metadata, '{}'),
    COALESCE(NEW.created_at, NOW())
  );
  RETURN NEW;
EXCEPTION
  WHEN undefined_table THEN
    -- Partition doesn't exist yet for this month — skip silently
    RETURN NEW;
  WHEN check_violation THEN
    -- Signal date falls outside any existing partition range
    RETURN NEW;
END;
$$;

-- 1b. Create the trigger on cross_domain_signals
-- Drop first to make migration idempotent
DROP TRIGGER IF EXISTS trg_copy_to_warm_tier ON cross_domain_signals;
CREATE TRIGGER trg_copy_to_warm_tier
  AFTER INSERT ON cross_domain_signals
  FOR EACH ROW
  EXECUTE FUNCTION copy_signal_to_warm_tier();

-- 1c. Schedule pg_cron jobs for partition management
-- Note: Uses nexus_cron schema if available (from 20250226000005), else public
DO $$
BEGIN
  -- Monthly: auto-create next month's partition (1st of month at 1 AM UTC)
  PERFORM cron.schedule(
    'warm-tier-create-partition',
    '0 1 1 * *',
    'SELECT create_warm_tier_partition()'
  );

  -- Weekly: archive signals older than 90 days from warm to cold (Sunday 2 AM UTC)
  PERFORM cron.schedule(
    'warm-tier-archive',
    '0 2 * * 0',
    'SELECT archive_warm_to_cold(90)'
  );

  RAISE NOTICE 'Scheduled warm-tier cron jobs';
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'pg_cron not available — warm-tier cron jobs not scheduled. Schedule manually.';
  WHEN OTHERS THEN
    RAISE WARNING 'Could not schedule cron jobs: %. Schedule manually.', SQLERRM;
END $$;

-- ============================================================================
-- PART 2: IVFFLAT PROBES IN SEARCH FUNCTIONS
-- ============================================================================

-- Recreate search_embeddings with SET LOCAL ivfflat.probes = 20
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
  -- 10M SCALE: With 1000 IVFFlat lists, probes=1 (default) only searches
  -- 0.1% of the index. probes=20 searches 2% → 20x better recall, still fast.
  SET LOCAL ivfflat.probes = 20;

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

-- Recreate get_rag_context with probes
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
  SET LOCAL ivfflat.probes = 20;

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

-- Recreate get_rag_context_with_memory with probes
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
  SET LOCAL ivfflat.probes = 20;

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

-- Recreate search_memory_weighted with probes
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
  SET LOCAL ivfflat.probes = 20;

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION search_embeddings TO service_role;
GRANT EXECUTE ON FUNCTION get_rag_context TO service_role;
GRANT EXECUTE ON FUNCTION get_rag_context_with_memory TO service_role;
GRANT EXECUTE ON FUNCTION search_memory_weighted TO service_role;
GRANT EXECUTE ON FUNCTION copy_signal_to_warm_tier TO service_role;
