-- Rate Limiting Infrastructure for SE-aaS
-- Sliding window rate limiting with configurable limits per organization

-- Rate limit tracking table
CREATE TABLE IF NOT EXISTS se_aas_rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  limit_type TEXT NOT NULL CHECK (limit_type IN ('jobs', 'tokens', 'claude_calls')),
  count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_rate_limit_org_type_time
  ON se_aas_rate_limit_tracking(organization_id, limit_type, created_at DESC);

CREATE INDEX idx_rate_limit_cleanup
  ON se_aas_rate_limit_tracking(created_at);

-- Add rate_limits column to organization_settings if not exists
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS rate_limits JSONB DEFAULT '{
  "jobsPerHour": 100,
  "jobsPerDay": 1000,
  "tokensPerDay": 100000,
  "claudeCallsPerHour": 500
}'::jsonb;

-- Domain confidence scores table (for feedback loop)
CREATE TABLE IF NOT EXISTS domain_confidence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain_type TEXT NOT NULL,
  score FLOAT NOT NULL DEFAULT 0.8 CHECK (score >= 0 AND score <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, domain_type)
);

-- Domain feedback table
CREATE TABLE IF NOT EXISTS domain_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain_type TEXT NOT NULL,
  result_id TEXT NOT NULL,
  feedback TEXT NOT NULL CHECK (feedback IN ('helpful', 'not_helpful')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SE-aaS metrics table (for observability)
CREATE TABLE IF NOT EXISTS se_aas_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain_type TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  execution_time_ms INTEGER NOT NULL,
  claude_powered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_se_aas_metrics_org_time
  ON se_aas_metrics(organization_id, created_at DESC);

CREATE INDEX idx_se_aas_metrics_domain
  ON se_aas_metrics(domain_type, created_at DESC);

-- Brain query logs table (for orchestrator)
CREATE TABLE IF NOT EXISTS brain_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  routes JSONB NOT NULL,
  confidence FLOAT NOT NULL,
  execution_time_ms INTEGER NOT NULL,
  claude_powered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brain_query_logs_org_time
  ON brain_query_logs(organization_id, created_at DESC);

-- Notifications table (for inbox)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, read, created_at DESC);

CREATE INDEX idx_notifications_org
  ON notifications(organization_id, created_at DESC);

-- Alerts table (for incident alerts)
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_org_status
  ON alerts(organization_id, status, created_at DESC);

-- Monitoring rules table
CREATE TABLE IF NOT EXISTS monitoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  threshold INTEGER,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  auto_created BOOLEAN NOT NULL DEFAULT false,
  created_from TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_monitoring_rules_org_enabled
  ON monitoring_rules(organization_id, enabled);

-- Discovered patterns table (continuous learner)
CREATE TABLE IF NOT EXISTS discovered_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  discovered_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  validated BOOLEAN DEFAULT false,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pattern evaluation queue (for async pattern re-evaluation)
CREATE TABLE IF NOT EXISTS pattern_evaluation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_pattern_eval_queue_status
  ON pattern_evaluation_queue(status, created_at);

-- Anomaly thresholds table (threshold optimizer)
CREATE TABLE IF NOT EXISTS anomaly_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  threshold FLOAT NOT NULL DEFAULT 0.5 CHECK (threshold >= 0 AND threshold <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_reason TEXT,
  UNIQUE(organization_id, domain)
);

-- Row-level security policies
ALTER TABLE se_aas_rate_limit_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_confidence_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE se_aas_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_query_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_evaluation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_thresholds ENABLE ROW LEVEL SECURITY;

-- Policies (users can only access their organization's data)
CREATE POLICY "Users can view their org's rate limits"
  ON se_aas_rate_limit_tracking FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view their org's metrics"
  ON se_aas_metrics FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view their notifications"
  ON notifications FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can view their org's alerts"
  ON alerts FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

-- Function to automatically clean up old rate limit records (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_rate_limit_tracking()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM se_aas_rate_limit_tracking
  WHERE created_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE se_aas_rate_limit_tracking IS 'Tracks API usage for sliding window rate limiting';
COMMENT ON TABLE se_aas_metrics IS 'Stores SE-aaS domain execution metrics for observability';
COMMENT ON TABLE brain_query_logs IS 'Logs all queries to the unified brain orchestrator';
COMMENT ON TABLE notifications IS 'In-app notifications for users';
COMMENT ON TABLE alerts IS 'System alerts for incidents and high-risk events';
