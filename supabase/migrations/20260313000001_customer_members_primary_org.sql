-- ============================================================================
-- Migration: Add primary_org_id to customer_members
-- ============================================================================
-- Gives each user an explicit "home" workspace per customer.
-- getCurrentOrgId() uses this for deterministic org resolution on fresh login
-- instead of the fragile "first non-core org" heuristic.
-- ============================================================================

-- 1. Add the column
ALTER TABLE customer_members
  ADD COLUMN IF NOT EXISTS primary_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- 2. Backfill: set primary_org_id to the first non-core org the user belongs to
--    under that customer, ordered by org_members.joined_at (earliest first).
UPDATE customer_members cm
SET primary_org_id = sub.first_org_id
FROM (
  SELECT DISTINCT ON (cm2.customer_id, cm2.user_id)
    cm2.id   AS cm_id,
    o.id     AS first_org_id
  FROM customer_members cm2
  JOIN organizations o  ON o.customer_id = cm2.customer_id
  JOIN org_members   om ON om.organization_id = o.id AND om.user_id = cm2.user_id
  WHERE o.is_core_brain = false
  ORDER BY cm2.customer_id, cm2.user_id, om.joined_at ASC
) sub
WHERE cm.id = sub.cm_id
  AND cm.primary_org_id IS NULL;

-- 3. For any customer_members that still have NULL (e.g. only core brain orgs),
--    backfill with the first org they have under that customer (even if core).
UPDATE customer_members cm
SET primary_org_id = sub.first_org_id
FROM (
  SELECT DISTINCT ON (cm2.customer_id, cm2.user_id)
    cm2.id   AS cm_id,
    o.id     AS first_org_id
  FROM customer_members cm2
  JOIN organizations o  ON o.customer_id = cm2.customer_id
  JOIN org_members   om ON om.organization_id = o.id AND om.user_id = cm2.user_id
  ORDER BY cm2.customer_id, cm2.user_id, om.joined_at ASC
) sub
WHERE cm.id = sub.cm_id
  AND cm.primary_org_id IS NULL;

-- 4. Index for fast lookup by user_id (already indexed, but add covering index)
CREATE INDEX IF NOT EXISTS idx_customer_members_user_primary
  ON customer_members (user_id, primary_org_id)
  WHERE primary_org_id IS NOT NULL;

-- 5. Update the signup trigger to set primary_org_id on new user registration
CREATE OR REPLACE FUNCTION handle_new_platform_user()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id      UUID;
  v_customer_id UUID;
  v_org_name    TEXT;
  v_org_slug    TEXT;
  v_cust_name   TEXT;
  v_cust_slug   TEXT;
  v_slug_suffix TEXT;
BEGIN
  -- Derive names from metadata or email
  v_org_name   := COALESCE(NEW.raw_user_meta_data->>'org_name',
                           split_part(NEW.email, '@', 1) || '''s Brain');
  v_cust_name  := v_org_name;
  v_slug_suffix := SUBSTRING(NEW.id::TEXT FROM 1 FOR 8);
  v_org_slug   := LOWER(REGEXP_REPLACE(v_org_name, '[^a-zA-Z0-9]', '-', 'g'))
                  || '-' || v_slug_suffix;
  v_cust_slug  := v_org_slug;

  -- 1. Create customer
  INSERT INTO customers (name, slug, plan)
  VALUES (v_cust_name, v_cust_slug, 'free')
  RETURNING id INTO v_customer_id;

  -- 2. Create workspace (org) linked to customer
  INSERT INTO organizations (name, slug, customer_id)
  VALUES (v_org_name, v_org_slug, v_customer_id)
  RETURNING id INTO v_org_id;

  -- 3. Add user as owner of the customer WITH primary_org_id
  INSERT INTO customer_members (customer_id, user_id, role, primary_org_id)
  VALUES (v_customer_id, NEW.id, 'owner', v_org_id);

  -- 4. Add user as owner of the workspace
  INSERT INTO org_members (organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner');

  -- 5. Auto-accept any pending invitations for this email
  UPDATE org_invitations
  SET status = 'accepted'
  WHERE invitee_email = NEW.email
    AND status = 'pending'
    AND expires_at > NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
