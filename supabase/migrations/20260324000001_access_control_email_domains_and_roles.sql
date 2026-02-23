-- ============================================================================
-- Access Control: Email Domain Restriction + Role-Based Route Access
-- ============================================================================
-- For design partner security (Tookitaki):
--   1. Only users from allowed email domains can access a workspace
--   2. Role-based access tiers: viewer/member see analytics,
--      admin/owner see brain, connectors, settings
--
-- This prevents:
--   - Credential sharing giving access to wrong people
--   - Even if someone logs in with a Tookitaki user's password,
--     they can only see what that user's role allows
-- ============================================================================

-- ── 1. Add allowed_email_domains to organizations ────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS allowed_email_domains TEXT[] DEFAULT '{}';

COMMENT ON COLUMN organizations.allowed_email_domains IS
  'Email domain allowlist (e.g. {"tookitaki.com", "monetiz3.com"}). '
  'Empty = no restriction (all authenticated users with membership can access). '
  'Non-empty = only users whose email ends with one of these domains can access.';

-- ── 2. Add allowed_email_domains to customers (parent level) ─────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS allowed_email_domains TEXT[] DEFAULT '{}';

COMMENT ON COLUMN customers.allowed_email_domains IS
  'Email domain allowlist at customer level. Inherited by all child workspaces '
  'unless the workspace overrides with its own list.';

-- ── 3. Create a function to check email domain access ────────────────────

CREATE OR REPLACE FUNCTION check_email_domain_access(
  p_organization_id UUID,
  p_user_email TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_domains TEXT[];
  v_customer_domains TEXT[];
  v_customer_id UUID;
  v_email_domain TEXT;
BEGIN
  -- Extract domain from email
  v_email_domain := lower(split_part(p_user_email, '@', 2));

  -- Get org-level domains
  SELECT allowed_email_domains, customer_id
    INTO v_org_domains, v_customer_id
  FROM organizations
  WHERE id = p_organization_id;

  -- If org has domain restrictions, check them
  IF v_org_domains IS NOT NULL AND array_length(v_org_domains, 1) > 0 THEN
    RETURN v_email_domain = ANY(v_org_domains);
  END IF;

  -- Fallback to customer-level domains
  IF v_customer_id IS NOT NULL THEN
    SELECT allowed_email_domains
      INTO v_customer_domains
    FROM customers
    WHERE id = v_customer_id;

    IF v_customer_domains IS NOT NULL AND array_length(v_customer_domains, 1) > 0 THEN
      RETURN v_email_domain = ANY(v_customer_domains);
    END IF;
  END IF;

  -- No restrictions configured — allow access
  RETURN true;
END;
$$;

COMMENT ON FUNCTION check_email_domain_access(UUID, TEXT) IS
  'Checks if a user email matches the workspace or customer domain allowlist. '
  'Returns true if no restrictions are configured (empty arrays).';

-- ── 4. Create a view for role-based access tiers ─────────────────────────
-- This maps roles to access tiers for easy querying from the app.

CREATE OR REPLACE FUNCTION get_user_access_tier(
  p_organization_id UUID,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_is_platform_admin BOOLEAN;
BEGIN
  SELECT role, is_platform_admin
    INTO v_role, v_is_platform_admin
  FROM org_members
  WHERE organization_id = p_organization_id
    AND user_id = p_user_id;

  -- Platform admins get full access
  IF v_is_platform_admin THEN
    RETURN 'full';
  END IF;

  -- Map roles to tiers
  CASE v_role
    WHEN 'owner' THEN RETURN 'full';
    WHEN 'admin' THEN RETURN 'full';
    WHEN 'member' THEN RETURN 'standard';
    WHEN 'viewer' THEN RETURN 'readonly';
    ELSE RETURN 'none';
  END CASE;
END;
$$;

COMMENT ON FUNCTION get_user_access_tier(UUID, UUID) IS
  'Returns access tier for a user in an org: '
  'full = owner/admin (brain, connectors, settings, all data), '
  'standard = member (copilot, analytics, predictions, SE-aaS), '
  'readonly = viewer (same as standard but read-only), '
  'none = no membership.';

-- ── 5. Set up Tookitaki domain restriction ───────────────────────────────
-- This will restrict Tookitaki workspaces to only @tookitaki.com and
-- @monetiz3.com (for BrainOS admin team access).

-- Note: This only runs if the customer exists. Safe for all environments.
-- Domains: tookitaki.com = design partner team, monetiz3.com = BrainOS admin team
DO $$
BEGIN
  UPDATE customers
  SET allowed_email_domains = ARRAY['tookitaki.com', 'monetiz3.com']
  WHERE slug = 'tookitaki'
    AND (allowed_email_domains IS NULL OR allowed_email_domains = '{}');

  IF FOUND THEN
    RAISE NOTICE 'Set Tookitaki email domain restrictions: tookitaki.com, monetiz3.com';
  END IF;
END;
$$;
