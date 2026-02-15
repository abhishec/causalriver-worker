-- Cognitive LEAP State Persistence
-- Stores serialized state for cognitive layers L3-L15 so they survive restarts.
-- Each LEAP (Deep Dreaming, Hierarchical Memory, Theory of Mind, etc.) stores
-- its internal state as JSONB, upserted by (organization_id, leap_type).

CREATE TABLE IF NOT EXISTS cognitive_leap_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  leap_type TEXT NOT NULL,
  state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_org_leap UNIQUE (organization_id, leap_type)
);

CREATE INDEX IF NOT EXISTS idx_leap_state_org
  ON cognitive_leap_state (organization_id);

ALTER TABLE cognitive_leap_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON cognitive_leap_state
  FOR ALL USING (auth.role() = 'service_role');
