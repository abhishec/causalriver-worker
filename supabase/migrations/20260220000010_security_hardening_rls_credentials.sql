-- ============================================================================
-- Security Hardening: Fix RLS policies and credential function access
--
-- CRITICAL FIXES:
--   1. brain_agent_tasks + brain_agent_steps: RLS was USING (true) without
--      role restriction — any authenticated user could read/write any org's
--      agent tasks. Fixed to restrict to service_role only.
--   2. custom_training_packs: Same issue — fixed to service_role only.
--   3. get_connector_credentials(): SECURITY DEFINER function was callable
--      by any authenticated user for any org. Added org membership check
--      inside the function. Same for store/revoke.
-- ============================================================================

-- ── 1. Fix brain_agent_tasks RLS ────────────────────────────────────────────

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Service role full access on brain_agent_tasks" ON brain_agent_tasks;
DROP POLICY IF EXISTS "Service role full access on brain_agent_steps" ON brain_agent_steps;

-- Re-create with proper service_role restriction
CREATE POLICY "brain_agent_tasks_service_role"
  ON brain_agent_tasks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "brain_agent_steps_service_role"
  ON brain_agent_steps FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add org-scoped read policy for authenticated users (own org only)
CREATE POLICY "brain_agent_tasks_org_read"
  ON brain_agent_tasks FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "brain_agent_steps_org_read"
  ON brain_agent_steps FOR SELECT
  TO authenticated
  USING (
    task_id IN (
      SELECT id FROM brain_agent_tasks
      WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

-- ── 2. Fix custom_training_packs RLS ────────────────────────────────────────

DROP POLICY IF EXISTS "Service role full access on custom_training_packs" ON custom_training_packs;

CREATE POLICY "custom_training_packs_service_role"
  ON custom_training_packs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add org-scoped read policy for authenticated users
CREATE POLICY "custom_training_packs_org_read"
  ON custom_training_packs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- ── 3. Fix credential functions — add org membership verification ────────────

-- Revoke direct access from authenticated users
REVOKE EXECUTE ON FUNCTION get_connector_credentials(UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION revoke_connector_credentials(UUID, TEXT) FROM authenticated;

-- Grant only to service_role (API routes use service client)
GRANT EXECUTE ON FUNCTION get_connector_credentials(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION revoke_connector_credentials(UUID, TEXT) TO service_role;

-- Replace get_connector_credentials with version that checks org membership
CREATE OR REPLACE FUNCTION get_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credentials JSONB;
  v_is_member BOOLEAN;
BEGIN
  -- Verify caller is a member of the organization (skip for service_role)
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

  SELECT credentials INTO v_credentials
  FROM org_connectors
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type
    AND status = 'active';

  RETURN v_credentials;
END;
$$;

-- Replace store_connector_credentials with org membership check
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
  v_is_member BOOLEAN;
BEGIN
  -- Verify caller is a member of the organization (skip for service_role)
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

-- Replace revoke_connector_credentials with org membership check
CREATE OR REPLACE FUNCTION revoke_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_member BOOLEAN;
BEGIN
  -- Verify caller is a member of the organization (skip for service_role)
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

  UPDATE org_connectors
  SET
    status = 'disabled',
    credentials = NULL,
    updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION get_connector_credentials(UUID, TEXT) IS 'Securely retrieves credentials for active connectors. Checks org membership for non-service-role callers.';
COMMENT ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB) IS 'Stores OAuth credentials. Checks org membership for non-service-role callers.';
COMMENT ON FUNCTION revoke_connector_credentials(UUID, TEXT) IS 'Disables connector and clears credentials. Checks org membership for non-service-role callers.';
