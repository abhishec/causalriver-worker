-- ============================================================================
-- Semantic Federation Infrastructure
-- ============================================================================
-- Enables embedding-based cross-domain discovery, semantic dedup, and
-- novelty detection for the Knowledge Federation system.
--
-- Key enhancements:
--   1. GIN index on signal_metadata.semantic_domains for fast cross-domain queries
--   2. domain_embedding column on ai_memory for persisted semantic search
--   3. federation_semantic_log for observability of semantic operations
--
-- The semantic federation module (semantic-federation.ts) computes embeddings
-- in-memory at query time. This migration adds database-level support for:
--   - Persisting domain embeddings for heavy-use patterns
--   - Querying signals by their semantically-related domains
--   - Tracking semantic dedup effectiveness
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. GIN INDEX on cross_domain_signals.signal_metadata for semantic_domains
--
-- When semantic domain routing is enabled, each signal gets a metadata field:
--   signal_metadata.semantic_domains = [
--     { "domain": "churn_risk",      "similarity": 0.82 },
--     { "domain": "customer_health", "similarity": 0.78 }
--   ]
--
-- This GIN index enables fast queries like:
--   WHERE signal_metadata @> '{"semantic_domains": [{"domain": "churn_risk"}]}'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cross_domain_signals_semantic_domains
  ON cross_domain_signals USING gin ((signal_metadata -> 'semantic_domains'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DOMAIN EMBEDDING CACHE TABLE
--
-- Persists pre-computed domain embeddings for frequently-accessed domains.
-- The in-memory cache handles hot path; this table provides persistence
-- across restarts and enables SQL-level similarity queries.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS federation_domain_embeddings (
  domain TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  embedding extensions.vector(384) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IVFFlat index for cosine similarity search on domain embeddings
-- (small table, 50-100 rows, so lists=10 is sufficient)
CREATE INDEX IF NOT EXISTS idx_federation_domain_embeddings_vector
  ON federation_domain_embeddings USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 10);

-- RLS: Read-only for org members, write for service_role
ALTER TABLE federation_domain_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "federation_domain_embeddings_read" ON federation_domain_embeddings;
CREATE POLICY "federation_domain_embeddings_read"
  ON federation_domain_embeddings FOR SELECT
  USING (true);  -- Domain embeddings are public (shared across all orgs)

DROP POLICY IF EXISTS "federation_domain_embeddings_service_role" ON federation_domain_embeddings;
CREATE POLICY "federation_domain_embeddings_service_role"
  ON federation_domain_embeddings FOR ALL
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SEMANTIC FEDERATION LOG
--
-- Observability table for semantic federation operations.
-- Tracks dedup effectiveness, domain routing accuracy, and novelty detection.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS federation_semantic_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN (
    'semantic_dedup',        -- Semantic deduplication during federated query
    'semantic_routing',      -- Semantic domain routing during signal enrichment
    'semantic_novelty',      -- Semantic novelty check during upstream promotion
    'domain_similarity'      -- Domain similarity computation
  )),
  -- Metrics
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_deduplicated INTEGER NOT NULL DEFAULT 0,
  domains_discovered INTEGER NOT NULL DEFAULT 0,
  novelty_score NUMERIC(5,4),
  avg_similarity NUMERIC(5,4),
  duration_ms INTEGER,
  -- Context
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying semantic operation stats
CREATE INDEX IF NOT EXISTS idx_federation_semantic_log_org_recent
  ON federation_semantic_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_federation_semantic_log_operation
  ON federation_semantic_log (operation, created_at DESC);

-- RLS
ALTER TABLE federation_semantic_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "federation_semantic_log_service_role" ON federation_semantic_log;
CREATE POLICY "federation_semantic_log_service_role"
  ON federation_semantic_log FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "federation_semantic_log_org_read" ON federation_semantic_log;
CREATE POLICY "federation_semantic_log_org_read"
  ON federation_semantic_log FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SEMANTIC FEDERATION DASHBOARD VIEW
--
-- Aggregated view for monitoring semantic federation effectiveness.
-- Shows dedup rates, routing coverage, and novelty trends.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW federation_semantic_dashboard AS
SELECT
  organization_id,
  operation,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS operation_count,
  SUM(items_processed) AS total_items_processed,
  SUM(items_deduplicated) AS total_items_deduplicated,
  SUM(domains_discovered) AS total_domains_discovered,
  AVG(novelty_score) AS avg_novelty_score,
  AVG(avg_similarity) AS avg_similarity,
  AVG(duration_ms) AS avg_duration_ms,
  -- Dedup effectiveness rate (only for dedup operations)
  CASE
    WHEN SUM(items_processed) > 0 AND operation = 'semantic_dedup'
    THEN ROUND(SUM(items_deduplicated)::NUMERIC / SUM(items_processed) * 100, 1)
    ELSE NULL
  END AS dedup_rate_pct
FROM federation_semantic_log
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY organization_id, operation, DATE_TRUNC('day', created_at)
ORDER BY day DESC, operation;
