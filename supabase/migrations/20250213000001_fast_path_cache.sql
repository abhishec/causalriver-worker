-- ============================================================================
-- Fast-Path Cache (Cerebellum)
-- Brain Analog: The Cerebellum stores learned motor programs. Once you've
-- learned to ride a bike, you don't need conscious thought — the Cerebellum
-- fires the pre-compiled program. This table caches pre-compiled query
-- contexts so repeated queries bypass slow conscious reasoning.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fast_path_cache (
  fingerprint_hash TEXT PRIMARY KEY,
  organization_id UUID NOT NULL,
  fingerprint JSONB NOT NULL,            -- { intent, domains, metric, direction, timeContext }
  compiled_context TEXT NOT NULL,         -- Pre-built LLM system prompt
  relevant_edges JSONB DEFAULT '[]',     -- Cached causal edges for this query shape
  hit_count INTEGER NOT NULL DEFAULT 0,
  compiled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graph_version_at TIMESTAMPTZ,          -- Graph state when compiled (for invalidation)
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookups by org + hash
CREATE INDEX IF NOT EXISTS idx_fast_path_cache_org
  ON fast_path_cache (organization_id, fingerprint_hash);

-- Index for cache invalidation: find all cache entries for an org
CREATE INDEX IF NOT EXISTS idx_fast_path_cache_org_compiled
  ON fast_path_cache (organization_id, compiled_at DESC);

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_fast_path_cache_expires
  ON fast_path_cache (expires_at);

-- RLS
ALTER TABLE fast_path_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to fast_path_cache"
  ON fast_path_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);
