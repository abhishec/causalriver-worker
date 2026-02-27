-- Layer 5 Protocol: Webhook/Event Subscriptions
-- External systems can subscribe to BrainOS events via this table.
-- Complements webhook_configs (enterprise push) with a self-serve subscription model.

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',  -- ['brain.decision', 'agent.completed', 'rl.signal', 'flight_risk.detected']
  secret TEXT,                           -- HMAC signing secret (stored plaintext, used in HMAC computation)
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_subscription_delivery_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',         -- pending | delivered | failed
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_status INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_org ON webhook_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_sub_delivery_log ON webhook_subscription_delivery_log(subscription_id, created_at DESC);

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscription_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_subs" ON webhook_subscriptions
  FOR ALL USING (organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "org_members_read_sub_log" ON webhook_subscription_delivery_log
  FOR SELECT USING (
    subscription_id IN (SELECT id FROM webhook_subscriptions WHERE organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "service_role_write_sub_log" ON webhook_subscription_delivery_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_subscriptions TO authenticated;
GRANT SELECT ON webhook_subscription_delivery_log TO authenticated;
GRANT INSERT ON webhook_subscription_delivery_log TO service_role;
