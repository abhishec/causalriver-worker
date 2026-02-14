-- SOC2 Compliance: Comprehensive Audit Logging
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Implements SOC2-compliant audit logging for all security events:
-- - Authentication events (login, logout, MFA)
-- - Data access events (read, write, delete)
-- - Permission changes
-- - Security settings changes
-- - API key usage
--
-- Migration: 20250214_audit_logging
-- Created: 2025-02-14
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- TABLE: audit_log
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Event details
  action VARCHAR(100) NOT NULL,  -- e.g., 'user.login', 'data.read', 'settings.update'
  resource_type VARCHAR(100),    -- e.g., 'ai_memory', 'organization', 'api_key'
  resource_id VARCHAR(255),      -- ID of affected resource

  -- Change tracking
  old_value JSONB,               -- Previous state (for updates)
  new_value JSONB,               -- New state (for updates/creates)

  -- Context
  ip_address INET,               -- Client IP address
  user_agent TEXT,               -- Client user agent
  session_id UUID,               -- Session identifier
  request_id UUID,               -- Request correlation ID

  -- Timestamp
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Additional metadata
  metadata JSONB,                -- Flexible field for event-specific data

  -- Status
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
  error_message TEXT             -- If status = 'failure'
);

-- ───────────────────────────────────────────────────────────────────────────
-- INDEXES for fast queries
-- ───────────────────────────────────────────────────────────────────────────

-- Primary access patterns
CREATE INDEX idx_audit_org_time ON audit_log(organization_id, timestamp DESC);
CREATE INDEX idx_audit_user_time ON audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_action ON audit_log(action, timestamp DESC);

-- For security investigations
CREATE INDEX idx_audit_ip ON audit_log(ip_address, timestamp DESC);
CREATE INDEX idx_audit_status_time ON audit_log(status, timestamp DESC) WHERE status = 'failure';

-- For compliance reporting
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users can only read audit logs for their organization
DROP POLICY IF EXISTS audit_log_select_org ON audit_log;
CREATE POLICY audit_log_select_org ON audit_log
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Only service role can insert audit logs
DROP POLICY IF EXISTS audit_log_insert_service ON audit_log;
CREATE POLICY audit_log_insert_service ON audit_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- No updates or deletes allowed (immutable audit trail)
-- (Service role can still do this for administrative purposes)

-- ───────────────────────────────────────────────────────────────────────────
-- FUNCTION: log_audit_event()
-- ───────────────────────────────────────────────────────────────────────────
--
-- Logs an audit event with all context
-- This is called from application code via service role
--

CREATE OR REPLACE FUNCTION log_audit_event(
  p_organization_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_action VARCHAR DEFAULT NULL,
  p_resource_type VARCHAR DEFAULT NULL,
  p_resource_id VARCHAR DEFAULT NULL,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id UUID DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_status VARCHAR DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO audit_log (
    organization_id,
    user_id,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    ip_address,
    user_agent,
    session_id,
    request_id,
    metadata,
    status,
    error_message
  ) VALUES (
    p_organization_id,
    p_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_value,
    p_new_value,
    p_ip_address,
    p_user_agent,
    p_session_id,
    p_request_id,
    p_metadata,
    p_status,
    p_error_message
  ) RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION log_audit_event(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, INET, TEXT, UUID, UUID, JSONB, VARCHAR, TEXT) TO service_role;

-- Add comment
COMMENT ON FUNCTION log_audit_event IS 'Logs an audit event. Called from application code via service role for SOC2 compliance.';

-- ───────────────────────────────────────────────────────────────────────────
-- FUNCTION: get_audit_trail()
-- ───────────────────────────────────────────────────────────────────────────
--
-- Retrieves audit trail for a specific resource
--

CREATE OR REPLACE FUNCTION get_audit_trail(
  p_resource_type VARCHAR,
  p_resource_id VARCHAR,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  id UUID,
  timestamp TIMESTAMPTZ,
  action VARCHAR,
  user_id UUID,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.timestamp,
    a.action,
    a.user_id,
    a.old_value,
    a.new_value,
    a.metadata
  FROM audit_log a
  WHERE a.resource_type = p_resource_type
    AND a.resource_id = p_resource_id
    AND a.organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  ORDER BY a.timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_audit_trail(VARCHAR, VARCHAR, INTEGER) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- FUNCTION: get_user_activity()
-- ───────────────────────────────────────────────────────────────────────────
--
-- Retrieves recent activity for current user
--

CREATE OR REPLACE FUNCTION get_user_activity(
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  id UUID,
  timestamp TIMESTAMPTZ,
  action VARCHAR,
  resource_type VARCHAR,
  resource_id VARCHAR,
  status VARCHAR,
  ip_address INET
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.timestamp,
    a.action,
    a.resource_type,
    a.resource_id,
    a.status,
    a.ip_address
  FROM audit_log a
  WHERE a.user_id = auth.uid()
  ORDER BY a.timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_user_activity(INTEGER) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- FUNCTION: get_security_events()
-- ───────────────────────────────────────────────────────────────────────────
--
-- Retrieves security-related events (failures, suspicious activity)
--

CREATE OR REPLACE FUNCTION get_security_events(
  p_organization_id UUID,
  p_hours INTEGER DEFAULT 24
) RETURNS TABLE (
  id UUID,
  timestamp TIMESTAMPTZ,
  action VARCHAR,
  user_id UUID,
  ip_address INET,
  status VARCHAR,
  error_message TEXT
) AS $$
BEGIN
  -- Check user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.timestamp,
    a.action,
    a.user_id,
    a.ip_address,
    a.status,
    a.error_message
  FROM audit_log a
  WHERE a.organization_id = p_organization_id
    AND a.timestamp > NOW() - (p_hours || ' hours')::INTERVAL
    AND (
      a.status = 'failure'
      OR a.action LIKE '%login%'
      OR a.action LIKE '%permission%'
      OR a.action LIKE '%api_key%'
    )
  ORDER BY a.timestamp DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_security_events(UUID, INTEGER) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- SAMPLE AUDIT EVENTS
-- ───────────────────────────────────────────────────────────────────────────

-- Authentication events:
--   'user.login.success'
--   'user.login.failure'
--   'user.logout'
--   'user.mfa.enabled'
--   'user.mfa.disabled'
--   'user.password.changed'

-- Data access events:
--   'data.read'
--   'data.create'
--   'data.update'
--   'data.delete'
--   'data.export'

-- Permission events:
--   'permission.grant'
--   'permission.revoke'
--   'role.assign'
--   'role.remove'

-- Security events:
--   'api_key.create'
--   'api_key.revoke'
--   'settings.security.update'
--   'rls.policy.change'

-- Organization events:
--   'organization.create'
--   'organization.update'
--   'organization.delete'
--   'member.add'
--   'member.remove'

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ───────────────────────────────────────────────────────────────────────────

-- View recent audit events
-- SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 20;

-- Count events by action
-- SELECT action, COUNT(*) FROM audit_log GROUP BY action ORDER BY COUNT(*) DESC;

-- Find failed events
-- SELECT * FROM audit_log WHERE status = 'failure' ORDER BY timestamp DESC;

-- Get audit trail for specific resource
-- SELECT * FROM get_audit_trail('ai_memory', 'some-uuid-here');

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
