-- ============================================================================
-- Org-Level OAuth Credentials (Optional Override)
-- ============================================================================
-- Allows organizations to optionally provide their own OAuth apps instead
-- of using platform-level credentials. Falls back to platform defaults.
-- ============================================================================

-- Add custom OAuth credentials column to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS custom_oauth_apps JSONB DEFAULT '{}';

-- Structure: 
-- {
--   "slack": {
--     "client_id": "xxx",
--     "client_secret": "xxx",
--     "enabled": true,
--     "scopes": ["channels:read", "chat:write", ...]
--   },
--   "github": { ... },
--   "jira": { ... }
-- }

-- Add index for querying orgs with custom OAuth
CREATE INDEX IF NOT EXISTS idx_organizations_custom_oauth
  ON organizations ((custom_oauth_apps::text))
  WHERE custom_oauth_apps != '{}';

-- ============================================================================
-- Helper Functions for Org-Level OAuth
-- ============================================================================

/**
 * Get OAuth credentials for a connector (org-level or platform-level)
 * Returns org's custom credentials if configured, otherwise NULL (use platform)
 */
CREATE OR REPLACE FUNCTION get_org_oauth_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_custom_oauth JSONB;
  v_connector_config JSONB;
BEGIN
  -- Get org's custom OAuth apps
  SELECT custom_oauth_apps INTO v_custom_oauth
  FROM organizations
  WHERE id = p_organization_id;

  -- Extract connector-specific config
  v_connector_config := v_custom_oauth->p_connector_type;

  -- Return if enabled and has credentials
  IF v_connector_config IS NOT NULL 
     AND (v_connector_config->>'enabled')::boolean = true 
     AND v_connector_config->>'client_id' IS NOT NULL
     AND v_connector_config->>'client_secret' IS NOT NULL
  THEN
    RETURN v_connector_config;
  END IF;

  -- Return NULL to indicate "use platform credentials"
  RETURN NULL;
END;
$$;

/**
 * Store org-level OAuth credentials for a connector
 */
CREATE OR REPLACE FUNCTION store_org_oauth_credentials(
  p_organization_id UUID,
  p_connector_type TEXT,
  p_client_id TEXT,
  p_client_secret TEXT,
  p_scopes TEXT[] DEFAULT NULL,
  p_enabled BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_custom_oauth JSONB;
  v_connector_config JSONB;
BEGIN
  -- Get current custom OAuth apps
  SELECT custom_oauth_apps INTO v_custom_oauth
  FROM organizations
  WHERE id = p_organization_id;

  -- If NULL, initialize as empty object
  IF v_custom_oauth IS NULL THEN
    v_custom_oauth := '{}'::jsonb;
  END IF;

  -- Build connector config
  v_connector_config := jsonb_build_object(
    'client_id', p_client_id,
    'client_secret', p_client_secret,
    'enabled', p_enabled,
    'scopes', COALESCE(p_scopes, ARRAY[]::TEXT[]),
    'configured_at', NOW()
  );

  -- Update the custom OAuth apps
  v_custom_oauth := v_custom_oauth || jsonb_build_object(p_connector_type, v_connector_config);

  -- Save back to organizations table
  UPDATE organizations
  SET custom_oauth_apps = v_custom_oauth,
      updated_at = NOW()
  WHERE id = p_organization_id;

  RETURN FOUND;
END;
$$;

/**
 * Remove org-level OAuth credentials for a connector
 */
CREATE OR REPLACE FUNCTION remove_org_oauth_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_custom_oauth JSONB;
BEGIN
  -- Get current custom OAuth apps
  SELECT custom_oauth_apps INTO v_custom_oauth
  FROM organizations
  WHERE id = p_organization_id;

  IF v_custom_oauth IS NULL THEN
    RETURN false;
  END IF;

  -- Remove the connector
  v_custom_oauth := v_custom_oauth - p_connector_type;

  -- Save back
  UPDATE organizations
  SET custom_oauth_apps = v_custom_oauth,
      updated_at = NOW()
  WHERE id = p_organization_id;

  RETURN FOUND;
END;
$$;

/**
 * Test org-level OAuth credentials (validation helper)
 */
CREATE OR REPLACE FUNCTION validate_org_oauth_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS TABLE (
  is_valid BOOLEAN,
  has_client_id BOOLEAN,
  has_client_secret BOOLEAN,
  is_enabled BOOLEAN,
  message TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSONB;
BEGIN
  v_config := get_org_oauth_credentials(p_organization_id, p_connector_type);

  IF v_config IS NULL THEN
    RETURN QUERY SELECT 
      false AS is_valid,
      false AS has_client_id,
      false AS has_client_secret,
      false AS is_enabled,
      'No custom OAuth credentials configured for this connector' AS message;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    (v_config->>'client_id' IS NOT NULL 
     AND v_config->>'client_secret' IS NOT NULL 
     AND (v_config->>'enabled')::boolean = true) AS is_valid,
    (v_config->>'client_id' IS NOT NULL) AS has_client_id,
    (v_config->>'client_secret' IS NOT NULL) AS has_client_secret,
    (v_config->>'enabled')::boolean AS is_enabled,
    CASE 
      WHEN v_config->>'client_id' IS NULL THEN 'Missing client_id'
      WHEN v_config->>'client_secret' IS NULL THEN 'Missing client_secret'
      WHEN (v_config->>'enabled')::boolean = false THEN 'OAuth app is disabled'
      ELSE 'Valid credentials'
    END AS message;
END;
$$;

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_org_oauth_credentials(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION store_org_oauth_credentials(UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_org_oauth_credentials(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_org_oauth_credentials(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN organizations.custom_oauth_apps IS 
  'Optional org-level OAuth apps. Structure: {"slack": {"client_id": "xxx", "client_secret": "xxx", "enabled": true}}. Falls back to platform credentials if not set.';

COMMENT ON FUNCTION get_org_oauth_credentials(UUID, TEXT) IS
  'Returns org custom OAuth credentials for a connector, or NULL to use platform defaults.';

COMMENT ON FUNCTION store_org_oauth_credentials(UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN) IS
  'Stores org-level OAuth credentials for a specific connector (Slack, GitHub, Jira).';

COMMENT ON FUNCTION validate_org_oauth_credentials(UUID, TEXT) IS
  'Validates org-level OAuth credentials and returns detailed validation results.';
