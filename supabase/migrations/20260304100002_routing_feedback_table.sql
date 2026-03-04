-- ADR-027 Bug 4: Formalize routing_feedback as a dedicated table
-- Previously stored as pattern rows in ai_memory with domain matching —
-- fragile and unindexed. This table makes the federation loop explicit.

CREATE TABLE IF NOT EXISTS public.routing_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id TEXT,
  capability_name TEXT,
  handler TEXT,
  matched_by TEXT CHECK (matched_by IN ('system1', 'system1.5', 'system2', 'none')),
  rl_quality FLOAT CHECK (rl_quality BETWEEN 0 AND 1),
  response_length INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.routing_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.routing_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Query pattern: recent routing decisions for an org, newest first
CREATE INDEX IF NOT EXISTS routing_feedback_org_created_idx
  ON public.routing_feedback (organization_id, created_at DESC);

-- Query pattern: filter by capability for quality analysis
CREATE INDEX IF NOT EXISTS routing_feedback_capability_idx
  ON public.routing_feedback (organization_id, capability_name, created_at DESC);

COMMENT ON TABLE public.routing_feedback IS
  'ADR-027: Explicit routing decision log for the Reflex Engine federation loop. '
  'Replaces implicit ai_memory pattern rows with orchestration.routing_feedback.* domain.';
