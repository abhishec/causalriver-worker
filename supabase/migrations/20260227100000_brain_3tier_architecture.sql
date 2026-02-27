-- Brain 3-Tier Architecture
-- ========================
-- Tier 1: Raw Knowledge Store  — knowledge_chunks (git, conversations, code, tickets)
-- Tier 2: Semantic Signals     — knowledge_embeddings, cross_domain_signals (existing)
-- Tier 3: Consolidated Patterns — consolidated_patterns (RL-gated, stable knowledge)

-- ─── TIER 1: Raw Knowledge Store ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_type            TEXT NOT NULL CHECK (source_type IN (
                           'git_commit', 'conversation_turn', 'code_file',
                           'ticket', 'pr_description', 'slack_message'
                         )),
  source_id              TEXT,
  source_url             TEXT,
  verbatim_text          TEXT NOT NULL CHECK (length(verbatim_text) > 0),
  embedding              extensions.vector(1536),
  metadata               JSONB NOT NULL DEFAULT '{}',
  reference_count        INTEGER NOT NULL DEFAULT 0,
  avg_quality            FLOAT NOT NULL DEFAULT 0.0,
  consolidation_candidate BOOLEAN NOT NULL DEFAULT FALSE,
  last_referenced_at     TIMESTAMPTZ,
  ingested_by            TEXT,
  ingested_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutability trigger: verbatim_text is append-only, never modified
CREATE OR REPLACE FUNCTION knowledge_chunks_protect_verbatim()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.verbatim_text IS DISTINCT FROM NEW.verbatim_text THEN
    RAISE EXCEPTION 'knowledge_chunks.verbatim_text is immutable — raw knowledge cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_chunks_immutable_trigger ON knowledge_chunks;
CREATE TRIGGER knowledge_chunks_immutable_trigger
  BEFORE UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION knowledge_chunks_protect_verbatim();

-- ─── TIER 1: Enhance document_chunks with utility tracking ────────────────────

DO $$ BEGIN
  ALTER TABLE document_chunks ADD COLUMN reference_count INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE document_chunks ADD COLUMN avg_quality FLOAT NOT NULL DEFAULT 0.0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE document_chunks ADD COLUMN consolidation_candidate BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE document_chunks ADD COLUMN last_referenced_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ─── TIER 3: Consolidated Knowledge Base ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS consolidated_patterns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern_type     TEXT NOT NULL CHECK (pattern_type IN (
                     'behavioral_rule', 'domain_expertise', 'routing_pattern',
                     'user_preference', 'failure_pattern', 'success_pattern'
                   )),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  confidence       FLOAT NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count   INTEGER NOT NULL DEFAULT 1,
  source_signal_ids UUID[],
  source_chunk_ids  UUID[],
  last_updated     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── Consolidation audit log ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS consolidation_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  patterns_promoted  INTEGER NOT NULL DEFAULT 0,
  signals_scanned    INTEGER NOT NULL DEFAULT 0,
  duration_ms        INTEGER,
  triggered_by       TEXT NOT NULL DEFAULT 'cron'
);

-- ─── Tier tag on ai_memory ────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE ai_memory ADD COLUMN memory_tier INTEGER NOT NULL DEFAULT 2
    CHECK (memory_tier IN (2, 3));
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ai_memory ADD COLUMN reference_count INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE knowledge_chunks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE consolidated_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE consolidation_runs    ENABLE ROW LEVEL SECURITY;

-- knowledge_chunks policies
DROP POLICY IF EXISTS "org members read knowledge_chunks"   ON knowledge_chunks;
DROP POLICY IF EXISTS "org members insert knowledge_chunks" ON knowledge_chunks;

CREATE POLICY "org members read knowledge_chunks" ON knowledge_chunks
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org members insert knowledge_chunks" ON knowledge_chunks
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- consolidated_patterns policies
DROP POLICY IF EXISTS "org members read consolidated_patterns" ON consolidated_patterns;

CREATE POLICY "org members read consolidated_patterns" ON consolidated_patterns
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- consolidation_runs policies
DROP POLICY IF EXISTS "org members read consolidation_runs" ON consolidation_runs;

CREATE POLICY "org members read consolidation_runs" ON consolidation_runs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON knowledge_chunks      TO authenticated;
GRANT SELECT         ON consolidated_patterns TO authenticated;
GRANT SELECT         ON consolidation_runs    TO authenticated;
GRANT ALL            ON knowledge_chunks      TO service_role;
GRANT ALL            ON consolidated_patterns TO service_role;
GRANT ALL            ON consolidation_runs    TO service_role;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS knowledge_chunks_org_source_time
  ON knowledge_chunks (organization_id, source_type, ingested_at DESC);

CREATE INDEX IF NOT EXISTS knowledge_chunks_consolidation_candidates
  ON knowledge_chunks (organization_id, avg_quality DESC)
  WHERE consolidation_candidate = TRUE;

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_ivfflat
  ON knowledge_chunks USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS consolidated_patterns_org_type_confidence
  ON consolidated_patterns (organization_id, pattern_type, confidence DESC);

CREATE INDEX IF NOT EXISTS consolidated_patterns_active
  ON consolidated_patterns (organization_id)
  WHERE is_active = TRUE;

-- ─── RPC: vector search over knowledge_chunks ─────────────────────────────────

CREATE OR REPLACE FUNCTION search_knowledge_chunks(
  p_organization_id  UUID,
  query_embedding    extensions.vector(1536),
  match_count        INTEGER DEFAULT 5
)
RETURNS TABLE (
  id            UUID,
  source_type   TEXT,
  verbatim_text TEXT,
  metadata      JSONB,
  similarity    FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.source_type,
    kc.verbatim_text,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE
    kc.organization_id = p_organization_id
    AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION search_knowledge_chunks(UUID, extensions.vector(1536), INTEGER)
  TO authenticated, service_role;
