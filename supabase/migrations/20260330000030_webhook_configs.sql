-- Enterprise Webhook Configurations
-- One row per webhook endpoint per organization.
-- Supports multiple events per endpoint and HMAC signing for security.

CREATE TABLE IF NOT EXISTS webhook_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES ai_worker_config(organization_id) ON DELETE CASCADE,
  endpoint_url     TEXT NOT NULL,
  secret           TEXT NOT NULL,           -- HMAC-SHA256 signing secret (stored encrypted at rest by Supabase)
  events           TEXT[] DEFAULT ARRAY['*']::TEXT[],  -- '*' = all events, or specific event types
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Enforce RLS: org members can only see/manage their own webhook configs
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_configs_select" ON webhook_configs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "webhook_configs_insert" ON webhook_configs
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "webhook_configs_update" ON webhook_configs
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "webhook_configs_delete" ON webhook_configs
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Service role bypass (for delivery system)
CREATE POLICY "webhook_configs_service_role" ON webhook_configs
  FOR ALL USING (auth.role() = 'service_role');

-- Grant access to authenticated users (RLS policies control what they can see)
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_configs TO authenticated;

-- Webhook delivery log — records every delivery attempt for debugging and auditing
CREATE TABLE IF NOT EXISTS webhook_delivery_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  webhook_id       UUID REFERENCES webhook_configs(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL,
  endpoint_url     TEXT NOT NULL,
  http_status      INTEGER,
  attempt_number   INTEGER NOT NULL DEFAULT 1,
  success          BOOLEAN NOT NULL DEFAULT false,
  error_message    TEXT,
  delivered_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE webhook_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_delivery_log_select" ON webhook_delivery_log
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "webhook_delivery_log_service_role" ON webhook_delivery_log
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT ON webhook_delivery_log TO authenticated;

-- Index for fast per-org lookups
CREATE INDEX IF NOT EXISTS webhook_configs_org_idx ON webhook_configs(organization_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS webhook_delivery_log_org_idx ON webhook_delivery_log(organization_id, delivered_at DESC);
