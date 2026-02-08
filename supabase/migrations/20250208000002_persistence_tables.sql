-- =============================================================================
-- Persistence Tables for NexusBrain
--
-- Adds tables for:
--   1. Embedding cache state persistence (LRU cache → DB backup)
--   2. Temporal memory state persistence (memory decay/reinforcement → DB)
--   3. Conversation log (multi-turn LLM conversation history)
-- =============================================================================

-- Embedding cache state (persists EmbeddingCache.exportState() data)
CREATE TABLE IF NOT EXISTS embedding_cache_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  cache_key TEXT NOT NULL,
  cache_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE (organization_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_cache_state_org
  ON embedding_cache_state (organization_id);
CREATE INDEX IF NOT EXISTS idx_cache_state_expires
  ON embedding_cache_state (expires_at) WHERE expires_at IS NOT NULL;

-- Temporal memory state (persists temporal memory decay/reinforcement)
CREATE TABLE IF NOT EXISTS temporal_memory_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  memory_id TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'observation',
  content JSONB NOT NULL,
  base_relevance NUMERIC DEFAULT 1.0,
  current_relevance NUMERIC DEFAULT 1.0,
  reinforcement_score NUMERIC DEFAULT 0,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, memory_id)
);

CREATE INDEX IF NOT EXISTS idx_temporal_memory_org
  ON temporal_memory_state (organization_id);
CREATE INDEX IF NOT EXISTS idx_temporal_memory_relevance
  ON temporal_memory_state (organization_id, current_relevance DESC);

-- Conversation log (multi-turn LLM conversation history)
CREATE TABLE IF NOT EXISTS conversation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,  -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  context_snapshot JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_org_id
  ON conversation_log (organization_id, conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_recent
  ON conversation_log (organization_id, created_at DESC);
