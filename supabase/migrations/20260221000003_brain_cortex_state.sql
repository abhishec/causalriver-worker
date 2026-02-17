-- =============================================================================
-- CTO Audit Fix (P0): brain_cortex_state table
-- =============================================================================
-- Persists the neural cortex cycle counter and mode across process restarts.
-- Without this, _cycleCount resets to 0 on every restart, which means deep
-- layers (L16-L30) only run once at cycle 0 and then never again until
-- the counter climbs back to their runEveryNthCycle interval.
-- =============================================================================

CREATE TABLE IF NOT EXISTS brain_cortex_state (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cycle_count integer NOT NULL DEFAULT 0,
  last_mode text NOT NULL DEFAULT 'awake_full',
  last_cycle_duration_ms integer DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

-- Index for fast lookup by org
CREATE INDEX IF NOT EXISTS idx_brain_cortex_state_org
  ON brain_cortex_state (organization_id);

-- RLS: org members can read their own state
ALTER TABLE brain_cortex_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own org cortex state" ON brain_cortex_state
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role can do everything (used by the brain engine)
CREATE POLICY "Service role full access to cortex state" ON brain_cortex_state
  FOR ALL USING (
    auth.role() = 'service_role'
  );
