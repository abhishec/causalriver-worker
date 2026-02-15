-- Connector Signals Table
-- =======================
-- Stores raw connector signals from GitHub, Stripe, HubSpot, etc.
-- The velocity tracker and early warning system query this table
-- for PR merges, deployments, and other engineering signals.
--
-- This is the source of truth for:
--   - velocity-tracker.ts → buildVelocityTimeSeries(), predictVelocityCollapse()
--   - early-warning-system.ts → runEarlyWarningSystem()

CREATE TABLE IF NOT EXISTS public.connector_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  source TEXT NOT NULL,              -- 'github', 'stripe', 'hubspot', etc.
  signal_type TEXT NOT NULL,         -- 'pr_merged', 'pr_opened', 'deployment', etc.
  signal_value NUMERIC DEFAULT 0,   -- numeric value (1 for events, metric value for metrics)
  signal_timestamp TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',      -- additional context (pr_id, author, files, etc.)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Primary query index: velocity tracker queries by (org, source, type, timestamp)
CREATE INDEX IF NOT EXISTS idx_connector_signals_org_source_type_ts
  ON public.connector_signals (organization_id, source, signal_type, signal_timestamp);

-- Timestamp index for time-range queries
CREATE INDEX IF NOT EXISTS idx_connector_signals_timestamp
  ON public.connector_signals (signal_timestamp);

-- Enable RLS
ALTER TABLE public.connector_signals ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "connector_signals_select_own_org" ON public.connector_signals
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "connector_signals_insert_service_role" ON public.connector_signals
  FOR INSERT WITH CHECK (true);

-- Grant access
GRANT ALL ON public.connector_signals TO authenticated;
GRANT ALL ON public.connector_signals TO service_role;

COMMENT ON TABLE public.connector_signals IS 'Raw connector signals from GitHub, Stripe, HubSpot, etc. Queried by velocity-tracker and early-warning-system.';
