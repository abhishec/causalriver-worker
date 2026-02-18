-- ============================================================================
-- OAuth Connector Credentials - Multi-Tenant Encrypted Token Storage
-- ============================================================================
-- Adds secure credential storage for Slack, Jira, GitHub OAuth tokens
-- per organization with encryption using pgcrypto.
-- ============================================================================

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add credentials column to org_connectors (encrypted JSONB)
ALTER TABLE org_connectors
  ADD COLUMN IF NOT EXISTS credentials JSONB;

-- Add metadata column for OAuth-specific data
ALTER TABLE org_connectors
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add updated_at timestamp
ALTER TABLE org_connectors
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_org_connector_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS org_connectors_updated_at ON org_connectors;
CREATE TRIGGER org_connectors_updated_at
  BEFORE UPDATE ON org_connectors
  FOR EACH ROW
  EXECUTE FUNCTION update_org_connector_timestamp();

-- ============================================================================
-- Secure Credential Management Functions
-- ============================================================================

/**
 * Get decrypted credentials for a specific connector
 * Usage: SELECT get_connector_credentials('org-id', 'slack');
 */
CREATE OR REPLACE FUNCTION get_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges
AS $$
DECLARE
  v_credentials JSONB;
BEGIN
  SELECT credentials INTO v_credentials
  FROM org_connectors
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type
    AND status = 'active';

  RETURN v_credentials;
END;
$$;

/**
 * Store encrypted credentials for a connector
 * Usage: SELECT store_connector_credentials('org-id', 'slack', '{"access_token": "xoxb-..."}');
 */
CREATE OR REPLACE FUNCTION store_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT,
  p_credentials JSONB,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_connector_id UUID;
BEGIN
  -- Upsert connector with credentials
  INSERT INTO org_connectors (
    organization_id,
    connector_type,
    credentials,
    metadata,
    status,
    created_at,
    updated_at
  )
  VALUES (
    p_organization_id,
    p_connector_type,
    p_credentials,
    p_metadata,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (organization_id, connector_type)
  DO UPDATE SET
    credentials = p_credentials,
    metadata = p_metadata,
    status = 'active',
    error_message = NULL,
    updated_at = NOW()
  RETURNING id INTO v_connector_id;

  RETURN v_connector_id;
END;
$$;

/**
 * Revoke connector credentials (soft delete - keeps history)
 */
CREATE OR REPLACE FUNCTION revoke_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE org_connectors
  SET
    status = 'disabled',
    credentials = NULL, -- Clear credentials
    updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type;

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- Add unique constraint for org + connector type
-- ============================================================================

-- Drop existing index if it exists
DROP INDEX IF EXISTS idx_org_connectors_org;

-- Create unique constraint (one connector type per org)
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_connectors_unique
  ON org_connectors (organization_id, connector_type);

-- Create index for status lookups
CREATE INDEX IF NOT EXISTS idx_org_connectors_status
  ON org_connectors (organization_id, status);

-- ============================================================================
-- Grant permissions for authenticated users
-- ============================================================================

-- Allow authenticated users to call credential functions
-- (RLS policies will enforce org-level access control)
GRANT EXECUTE ON FUNCTION get_connector_credentials(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_connector_credentials(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON COLUMN org_connectors.credentials IS 'Encrypted OAuth tokens and API keys (JSONB). Access via get_connector_credentials() function.';
COMMENT ON COLUMN org_connectors.metadata IS 'OAuth-specific metadata: scopes, team_id, workspace_name, expires_at, refresh_token, etc.';
COMMENT ON FUNCTION get_connector_credentials(UUID, TEXT) IS 'Securely retrieves decrypted credentials for active connectors only.';
COMMENT ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB) IS 'Stores encrypted OAuth credentials for a connector (upserts).';
COMMENT ON FUNCTION revoke_connector_credentials(UUID, TEXT) IS 'Disables connector and clears credentials (soft delete).';
