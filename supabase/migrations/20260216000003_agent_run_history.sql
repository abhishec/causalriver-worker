-- ============================================================================
-- Agent Run History — tracks progressive learning runs for nightly trainers
-- ============================================================================
-- This table enables incremental/progressive fetching: each agent records
-- its last successful run, so the next run can fetch only newer data.
-- Used by git-code-trainer v2.0.0+ for nightly incremental learning.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_run_history (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name    text NOT NULL,
  agent_version text NOT NULL,
  organization_id uuid NOT NULL,
  status        text NOT NULL DEFAULT 'success',
  signals_stored integer DEFAULT 0,
  packs_processed integer DEFAULT 0,
  discoveries   integer DEFAULT 0,
  run_mode      text DEFAULT 'full',          -- 'full' | 'incremental'
  completed_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Enforce referential integrity to organizations
  CONSTRAINT fk_agent_run_history_org
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- Index for fast lookup: "What was the last successful run for this agent?"
CREATE INDEX IF NOT EXISTS idx_agent_run_history_lookup
  ON public.agent_run_history (agent_name, status, completed_at DESC);

-- Index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_agent_run_history_org
  ON public.agent_run_history (organization_id, agent_name);

-- RLS: Enable row-level security
ALTER TABLE public.agent_run_history ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (ECS tasks use service role)
CREATE POLICY agent_run_history_service_all
  ON public.agent_run_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant access to service role
GRANT ALL ON public.agent_run_history TO service_role;
GRANT SELECT ON public.agent_run_history TO authenticated;

COMMENT ON TABLE public.agent_run_history IS 'Tracks agent training runs for progressive/incremental learning. Each successful run is recorded so the next run can fetch only newer data since the last completion.';
COMMENT ON COLUMN public.agent_run_history.run_mode IS 'full = fetched all available data; incremental = fetched only data since last successful run';
