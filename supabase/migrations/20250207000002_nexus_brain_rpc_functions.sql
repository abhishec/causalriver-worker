-- =============================================================================
-- NexusBrain RPC Functions Migration
--
-- Server-side functions called by the memory-stack library:
--   1. search_embeddings        - pgvector similarity search
--   2. get_rag_context          - context retrieval for agents
--   3. get_rag_context_with_memory - memory-weighted retrieval
--   4. search_memory_weighted   - importance-ranked search
--   5. record_cascade_rule_trigger - audit logging for cascade rules
--   6. track_rule_evaluation    - brain rule execution tracking
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. search_embeddings
--    Performs cosine similarity search on entity_embeddings using pgvector
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding extensions.vector(1536),
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

-- -----------------------------------------------------------------------------
-- 2. get_rag_context
--    Retrieves relevant context for agent queries (embeddings + recent signals)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_rag_context(
  query_embedding extensions.vector(1536),
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

-- -----------------------------------------------------------------------------
-- 3. get_rag_context_with_memory
--    Memory-weighted retrieval: boosts results based on access patterns
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_rag_context_with_memory(
  query_embedding extensions.vector(1536),
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

-- -----------------------------------------------------------------------------
-- 4. search_memory_weighted
--    Importance-ranked search across memory entries
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_memory_weighted(
  query_embedding extensions.vector(1536),
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

-- -----------------------------------------------------------------------------
-- 5. record_cascade_rule_trigger
--    Audit logging when a cascade rule fires
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_cascade_rule_trigger(
  p_organization_id UUID,
  p_rule_id UUID,
  p_rule_name TEXT,
  p_trigger_domain TEXT,
  p_trigger_signal_type TEXT,
  p_trigger_value NUMERIC,
  p_propagation_result JSONB DEFAULT '{}',
  p_actions_taken JSONB DEFAULT '[]'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO brain_execution_log (
    organization_id,
    rule_id,
    rule_type,
    input_signals,
    output_actions,
    execution_result,
    confidence_at_execution,
    duration_ms,
    created_at
  ) VALUES (
    p_organization_id,
    p_rule_id,
    'cascade',
    jsonb_build_object(
      'trigger_domain', p_trigger_domain,
      'trigger_signal_type', p_trigger_signal_type,
      'trigger_value', p_trigger_value,
      'propagation_result', p_propagation_result
    ),
    p_actions_taken,
    'fired',
    NULL,
    NULL,
    NOW()
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. track_rule_evaluation
--    Records brain grammar rule evaluation results
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_rule_evaluation(
  p_organization_id UUID,
  p_rule_id UUID,
  p_rule_type TEXT,
  p_input_signals JSONB,
  p_output_actions JSONB,
  p_execution_result TEXT,
  p_confidence NUMERIC DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  log_id UUID;
BEGIN
  -- Insert execution log entry
  INSERT INTO brain_execution_log (
    organization_id,
    rule_id,
    rule_type,
    input_signals,
    output_actions,
    execution_result,
    confidence_at_execution,
    duration_ms,
    created_at
  ) VALUES (
    p_organization_id,
    p_rule_id,
    p_rule_type,
    p_input_signals,
    p_output_actions,
    p_execution_result,
    p_confidence,
    p_duration_ms,
    NOW()
  )
  RETURNING id INTO log_id;

  -- Update rule execution count if the rule fired
  IF p_execution_result = 'fired' THEN
    UPDATE brain_grammar_rules
    SET
      execution_count = execution_count + 1,
      last_executed_at = NOW()
    WHERE id = p_rule_id;
  END IF;

  RETURN log_id;
END;
$$;
