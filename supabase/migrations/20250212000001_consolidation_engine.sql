-- ============================================================================
-- Consolidation Engine Tables
-- Tracks brain sleep cycles, graph snapshots, and consolidation history.
-- ============================================================================

-- Consolidation run records — one row per brain sleep cycle
CREATE TABLE IF NOT EXISTS consolidation_runs (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL,
  is_core_brain BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  total_duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  steps JSONB NOT NULL DEFAULT '[]',
  report JSONB NOT NULL DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying consolidation history per org
CREATE INDEX IF NOT EXISTS idx_consolidation_runs_org
  ON consolidation_runs (organization_id, created_at DESC);

-- Index for monitoring: recent runs across all orgs
CREATE INDEX IF NOT EXISTS idx_consolidation_runs_recent
  ON consolidation_runs (created_at DESC);

-- Index for status monitoring
CREATE INDEX IF NOT EXISTS idx_consolidation_runs_status
  ON consolidation_runs (status, created_at DESC);

-- Causal graph snapshots — periodic snapshots of the causal graph state
-- Enables graph diffing, rollback, and historical analysis
CREATE TABLE IF NOT EXISTS causal_graph_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  consolidation_run_id TEXT REFERENCES consolidation_runs(id),
  snapshot_type TEXT NOT NULL DEFAULT 'post_consolidation'
    CHECK (snapshot_type IN ('pre_consolidation', 'post_consolidation', 'manual')),
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  significant_edge_count INTEGER NOT NULL DEFAULT 0,
  avg_evidence_weight NUMERIC,
  graph_data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_snapshots_org
  ON causal_graph_snapshots (organization_id, created_at DESC);

-- RLS: consolidation_runs
ALTER TABLE consolidation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to consolidation_runs"
  ON consolidation_runs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS: causal_graph_snapshots
ALTER TABLE causal_graph_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to causal_graph_snapshots"
  ON causal_graph_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add last_consolidated_at to track when each org was last consolidated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'causal_relationships_statistical'
    AND column_name = 'last_consolidated_at'
  ) THEN
    ALTER TABLE causal_relationships_statistical
      ADD COLUMN last_consolidated_at TIMESTAMPTZ;
  END IF;
END $$;
