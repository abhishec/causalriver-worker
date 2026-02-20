-- ============================================================================
-- Multi-Instance Connectors
-- ============================================================================
-- Allows multiple connector instances of the same type per organization.
-- e.g. multiple GitHub repos, multiple Jira instances, multiple Slack
-- workspaces, multiple Freshdesk accounts per org.
--
-- Changes:
--   1. Adds instance_name + display_name columns
--   2. Drops old unique index on (org_id, connector_type)
--   3. Creates new unique index on (org_id, connector_type, instance_name)
--   4. Backfills existing rows with sensible instance names
--   5. Replaces SQL functions to accept instance_name parameter
-- ============================================================================

-- 1. Add new columns
ALTER TABLE org_connectors
  ADD COLUMN IF NOT EXISTS instance_name TEXT NOT NULL DEFAULT 'default';

ALTER TABLE org_connectors
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- 2. Backfill existing rows with meaningful instance_name values
UPDATE org_connectors
SET
  instance_name = COALESCE(config->>'repoFullName', (config->>'owner') || '/' || (config->>'repo'), 'default'),
  display_name  = COALESCE(config->>'repoFullName', 'GitHub')
WHERE connector_type = 'github' AND instance_name = 'default';

UPDATE org_connectors
SET
  instance_name = COALESCE(metadata->>'site_name', config->>'site_name', config->>'site_url', 'default'),
  display_name  = COALESCE(metadata->>'site_name', config->>'site_name', 'Jira')
WHERE connector_type = 'jira' AND instance_name = 'default';

UPDATE org_connectors
SET
  instance_name = COALESCE(metadata->>'team_name', 'default'),
  display_name  = COALESCE(metadata->>'team_name', 'Slack')
WHERE connector_type = 'slack' AND instance_name = 'default';

UPDATE org_connectors
SET display_name = COALESCE(display_name, initcap(connector_type))
WHERE display_name IS NULL;

-- 3. Drop old unique index, create new one
DROP INDEX IF EXISTS idx_org_connectors_unique;

CREATE UNIQUE INDEX idx_org_connectors_unique
  ON org_connectors (organization_id, connector_type, instance_name);

-- 4. Replace store_connector_credentials to accept instance_name
-- First drop old function signature, then create the new overloaded version
CREATE OR REPLACE FUNCTION store_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT,
  p_credentials JSONB,
  p_metadata JSONB DEFAULT '{}',
  p_instance_name TEXT DEFAULT 'default'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_connector_id UUID;
  v_is_member BOOLEAN;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    SELECT EXISTS(
      SELECT 1 FROM org_members
      WHERE organization_id = p_organization_id
        AND user_id = auth.uid()
    ) INTO v_is_member;
    IF NOT v_is_member THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  INSERT INTO org_connectors (
    organization_id, connector_type, instance_name,
    credentials, metadata, status, created_at, updated_at
  )
  VALUES (
    p_organization_id, p_connector_type, p_instance_name,
    p_credentials, p_metadata, 'active', NOW(), NOW()
  )
  ON CONFLICT (organization_id, connector_type, instance_name)
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

-- 5. Replace revoke_connector_credentials to accept optional instance_name
CREATE OR REPLACE FUNCTION revoke_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT,
  p_instance_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_member BOOLEAN;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    SELECT EXISTS(
      SELECT 1 FROM org_members
      WHERE organization_id = p_organization_id
        AND user_id = auth.uid()
    ) INTO v_is_member;
    IF NOT v_is_member THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  IF p_instance_name IS NOT NULL THEN
    UPDATE org_connectors
    SET status = 'disabled', credentials = NULL, updated_at = NOW()
    WHERE organization_id = p_organization_id
      AND connector_type = p_connector_type
      AND instance_name = p_instance_name;
  ELSE
    UPDATE org_connectors
    SET status = 'disabled', credentials = NULL, updated_at = NOW()
    WHERE organization_id = p_organization_id
      AND connector_type = p_connector_type;
  END IF;

  RETURN FOUND;
END;
$$;

-- 6. Update get_connector_credentials to accept optional instance_name
CREATE OR REPLACE FUNCTION get_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT,
  p_instance_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credentials JSONB;
  v_is_member BOOLEAN;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    SELECT EXISTS(
      SELECT 1 FROM org_members
      WHERE organization_id = p_organization_id
        AND user_id = auth.uid()
    ) INTO v_is_member;
    IF NOT v_is_member THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  IF p_instance_name IS NOT NULL THEN
    SELECT credentials INTO v_credentials
    FROM org_connectors
    WHERE organization_id = p_organization_id
      AND connector_type = p_connector_type
      AND instance_name = p_instance_name
      AND status = 'active';
  ELSE
    SELECT credentials INTO v_credentials
    FROM org_connectors
    WHERE organization_id = p_organization_id
      AND connector_type = p_connector_type
      AND status = 'active'
    LIMIT 1;
  END IF;

  RETURN v_credentials;
END;
$$;

-- 7. Update grant permissions for new function signatures
REVOKE EXECUTE ON FUNCTION get_connector_credentials(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION revoke_connector_credentials(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_connector_credentials(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION revoke_connector_credentials(UUID, TEXT, TEXT) TO service_role;

COMMENT ON COLUMN org_connectors.instance_name IS 'Unique instance identifier within (org, connector_type). e.g. "owner/repo" for GitHub, "site.atlassian.net" for Jira.';
COMMENT ON COLUMN org_connectors.display_name IS 'User-facing label for this connector instance. e.g. "Backend API Repo", "Engineering Jira".';
