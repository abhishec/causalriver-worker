-- ============================================================================
-- Health Alerting Infrastructure
--
-- Adds the missing pieces for automated health monitoring & alerting:
-- 1. Missing columns on cascade_alerts (is_read, alert_type, message)
-- 2. notification_preferences table (per-user per-org)
-- 3. health_alert_thresholds table (per-org configurable thresholds)
-- 4. health_alert_log table (deduplication & delivery tracking)
-- ============================================================================

-- ── 1. Add missing columns to cascade_alerts ──────────────────────
ALTER TABLE cascade_alerts ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE cascade_alerts ADD COLUMN IF NOT EXISTS alert_type TEXT DEFAULT 'cascade';
ALTER TABLE cascade_alerts ADD COLUMN IF NOT EXISTS message TEXT;

-- ── 2. Notification Preferences (per-user per-org) ───────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  -- Category toggles
  cascade_alerts BOOLEAN DEFAULT TRUE,
  budget_warnings BOOLEAN DEFAULT TRUE,
  training_completions BOOLEAN DEFAULT TRUE,
  brain_health_alerts BOOLEAN DEFAULT TRUE,
  anomaly_detections BOOLEAN DEFAULT TRUE,
  -- Severity filter
  min_severity TEXT DEFAULT 'medium' CHECK (min_severity IN ('critical', 'high', 'medium', 'low')),
  -- Delivery channels
  email_digest BOOLEAN DEFAULT FALSE,
  digest_email_recipients TEXT DEFAULT '',
  digest_slack_channel TEXT DEFAULT '',
  slack_webhook_url TEXT DEFAULT '',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_prefs" ON notification_preferences FOR ALL
  USING (auth.uid() = user_id);
CREATE POLICY "service_role_all_prefs" ON notification_preferences FOR ALL
  USING (auth.role() = 'service_role');

-- ── 3. Health Alert Thresholds (per-org configurable) ─────────────
CREATE TABLE IF NOT EXISTS health_alert_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE,
  -- Dimension thresholds (score 0-100, alert when BELOW)
  min_prediction_score INTEGER DEFAULT 30,
  min_causal_graph_score INTEGER DEFAULT 20,
  min_signal_score INTEGER DEFAULT 20,
  min_connector_score INTEGER DEFAULT 30,
  min_job_score INTEGER DEFAULT 40,
  min_overall_score INTEGER DEFAULT 30,
  -- Cooldown: don't re-alert same dimension within N hours
  cooldown_hours INTEGER DEFAULT 4,
  -- Whether automated alerting is enabled
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE health_alert_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_thresholds" ON health_alert_thresholds FOR ALL
  USING (auth.role() = 'service_role');

-- ── 4. Health Alert Log (deduplication & delivery tracking) ───────
CREATE TABLE IF NOT EXISTS health_alert_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  dimension TEXT NOT NULL, -- 'predictions', 'causal_graph', 'signals', 'connectors', 'jobs', 'overall'
  score INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  message TEXT NOT NULL,
  -- Delivery tracking
  delivered_email BOOLEAN DEFAULT FALSE,
  delivered_slack BOOLEAN DEFAULT FALSE,
  delivered_in_app BOOLEAN DEFAULT TRUE,
  delivery_error TEXT,
  -- Cascade alert reference (if created)
  cascade_alert_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_alert_log_org_dim
  ON health_alert_log (organization_id, dimension, created_at DESC);

ALTER TABLE health_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_alert_log" ON health_alert_log FOR ALL
  USING (auth.role() = 'service_role');
