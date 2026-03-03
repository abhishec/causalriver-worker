-- ADR-028: Dynamic Tool Synthesis Engine — capability_library table
--
-- Replaces ai_memory-backed tool storage with a dedicated table featuring:
-- - pgvector embedding (1536-dim, OpenAI text-embedding-3-small)
-- - Lifecycle management (gap → candidate → validated → promoted → deprecated)
-- - RL quality tracking (invocation_count, success_rate, quality_score)
-- - Self-correction provenance (revision_count, parent_tool_id)
-- - CRAFT multi-view retrieval via search_capability_library RPC
--
-- Research backing: LATM, Voyager, CREATOR, CRAFT, TOOLMAKER, ATLASS, ITR, SkillRL, SAGE

-- Ensure pgvector extension is available (already enabled for knowledge_chunks)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS capability_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,                        -- function_name (e.g. "compute_npv")
  description TEXT NOT NULL DEFAULT '',      -- NL description (Voyager: NL > code for retrieval)
  domain TEXT NOT NULL DEFAULT 'general',    -- domain this tool serves

  -- Implementation
  implementation TEXT NOT NULL DEFAULT '',   -- JS/TS function body
  input_schema JSONB DEFAULT '{}',           -- { param: type } for CREATOR abstract tools
  output_schema JSONB DEFAULT '{}',          -- expected return type
  test_cases JSONB DEFAULT '[]',             -- LATM: 5 test cases per tool

  -- Retrieval (CRAFT multi-view)
  embedding extensions.vector(1536),         -- OpenAI text-embedding-3-small (same as knowledge_chunks)
  tags TEXT[] DEFAULT '{}',                  -- semantic tags for faceted search

  -- Lifecycle (SkillRL)
  status TEXT NOT NULL DEFAULT 'gap'         -- gap -> candidate -> validated -> promoted -> deprecated
    CHECK (status IN ('gap', 'candidate', 'validated', 'promoted', 'deprecated')),
  quality_score REAL DEFAULT 0.5,            -- RL-updated (0-1)
  invocation_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0.0,
  revision_count INTEGER DEFAULT 0,          -- TOOLMAKER: how many self-correction rounds

  -- Provenance
  source_gap_id UUID,                        -- reference to the gap record that triggered synthesis
  parent_tool_id UUID REFERENCES capability_library(id) ON DELETE SET NULL, -- for tool revisions
  synthesized_by TEXT DEFAULT 'haiku',       -- 'haiku' | 'sonnet' | 'opus' | 'human'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_invoked_at TIMESTAMPTZ
);

-- Unique constraint: one active version per name per org per status
-- This allows having both a 'validated' and 'deprecated' version of the same tool
CREATE UNIQUE INDEX IF NOT EXISTS idx_capability_library_org_name_status
  ON capability_library (organization_id, name, status);

-- pgvector index for CRAFT retrieval (same ivfflat pattern as knowledge_chunks)
-- Note: ivfflat requires at least some rows to build. For empty tables, queries
-- still work (sequential scan) but are slower. The index activates once ~100 rows exist.
CREATE INDEX IF NOT EXISTS idx_capability_library_embedding
  ON capability_library USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 50);

-- Status + org index for lifecycle queries
CREATE INDEX IF NOT EXISTS idx_capability_library_org_status
  ON capability_library (organization_id, status);

-- Domain + org index for domain-scoped retrieval
CREATE INDEX IF NOT EXISTS idx_capability_library_org_domain
  ON capability_library (organization_id, domain);

-- RPC: vector search (mirrors search_knowledge_chunks pattern from tier2-signals)
CREATE OR REPLACE FUNCTION search_capability_library(
  p_org_id UUID,
  p_embedding extensions.vector(1536),
  p_match_threshold REAL DEFAULT 0.5,
  p_match_count INT DEFAULT 10,
  p_status_filter TEXT[] DEFAULT ARRAY['validated', 'promoted']
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  domain TEXT,
  implementation TEXT,
  input_schema JSONB,
  quality_score REAL,
  status TEXT,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cl.id, cl.name, cl.description, cl.domain,
    cl.implementation, cl.input_schema, cl.quality_score, cl.status,
    (1 - (cl.embedding <=> p_embedding))::REAL AS similarity
  FROM capability_library cl
  WHERE cl.organization_id = p_org_id
    AND cl.status = ANY(p_status_filter)
    AND cl.embedding IS NOT NULL
    AND (1 - (cl.embedding <=> p_embedding)) > p_match_threshold
  ORDER BY cl.embedding <=> p_embedding
  LIMIT p_match_count;
END;
$$;

-- RPC: increment invocation counter (atomic, avoids race conditions)
CREATE OR REPLACE FUNCTION increment_tool_invocation(p_tool_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE capability_library
  SET invocation_count = invocation_count + 1,
      last_invoked_at = now(),
      updated_at = now()
  WHERE id = p_tool_id;
END;
$$;

-- RLS
ALTER TABLE capability_library ENABLE ROW LEVEL SECURITY;

-- Users can read their org's tools
CREATE POLICY "capability_library_select_own_org" ON capability_library
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Service role has full access (for cron, tool-maker agent, RL updates)
-- Note: service_role bypasses RLS by default in Supabase, but explicit policy
-- ensures clarity if RLS behavior changes.

-- Grant authenticated users read-only
GRANT SELECT ON capability_library TO authenticated;
-- Service role needs full CRUD for synthesis + RL updates
GRANT ALL ON capability_library TO service_role;
