-- ============================================================================
-- Customer Members + Full Customer Backfill
-- ============================================================================
-- Users are now first-class members of CUSTOMERS, not just individual orgs.
-- An org (workspace) is a technical scoping boundary for the brain — it is NOT
-- the primary identity unit for a user.
--
-- Mental model:
--   Customer      = the company (Tookitaki, Demo, PH Accounting, etc.)
--   Workspace/Org = one isolated brain track under that customer
--   User          = belongs to a CUSTOMER, gets access to one or more workspaces
--
-- This migration:
--   1. Creates `customer_members` table (user ↔ customer, with role)
--   2. Creates remaining customers (Demo, PH Accounting, Company Jarvis, Finance Jarvis)
--   3. Links all existing orgs to their customers (customer_id backfill)
--   4. Backfills customer_members from existing org_members
--   5. Updates RLS so users see data via customer membership
--   6. Updates auto-provision trigger to also create customer_members on signup
-- ============================================================================

-- ── 1. Customer Members table ────────────────────────────────────────────────
-- Primary identity: user belongs to a customer.
-- Workspace access is derived from customer membership + explicit org grants.

CREATE TABLE IF NOT EXISTS customer_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member | viewer
  is_platform_admin BOOLEAN DEFAULT false,           -- mirrors org_members.is_platform_admin
  invited_by        UUID REFERENCES auth.users(id),
  joined_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (customer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_members_user     ON customer_members (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_members_customer ON customer_members (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_members_role     ON customer_members (customer_id, role);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_customer_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_members_updated_at ON customer_members;
CREATE TRIGGER trg_customer_members_updated_at
  BEFORE UPDATE ON customer_members
  FOR EACH ROW EXECUTE FUNCTION update_customer_members_updated_at();

-- ── 2. Seed all Customers ────────────────────────────────────────────────────
-- Tookitaki already exists (from 20260223000001). Add the rest.

-- NexusBrain Platform (internal — owns Core Brain)
INSERT INTO customers (id, name, slug, plan, industry, is_design_partner, settings)
VALUES (
  '00000000-0000-4000-c000-000000000001',
  'NexusBrain Platform',
  'nexusbrain',
  'enterprise',
  'AI Platform',
  false,
  jsonb_build_object(
    'description', 'Internal platform customer — owns Core Brain org',
    'internal', true
  )
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug,
  plan = EXCLUDED.plan, settings = EXCLUDED.settings, updated_at = NOW();

-- Demo (competition & demo environment)
INSERT INTO customers (id, name, slug, plan, industry, is_design_partner, settings)
VALUES (
  '00000000-0000-4000-c000-000000000002',
  'Demo',
  'demo',
  'enterprise',
  'Demo',
  false,
  jsonb_build_object(
    'description', 'Demo and competition environment',
    'internal', true
  )
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug,
  plan = EXCLUDED.plan, settings = EXCLUDED.settings, updated_at = NOW();

-- PH Accounting (design partner)
INSERT INTO customers (id, name, slug, plan, industry, is_design_partner, settings)
VALUES (
  '00000000-0000-4000-c000-000000000003',
  'PH Accounting',
  'ph-accounting',
  'enterprise',
  'Accounting & Advisory',
  true,
  jsonb_build_object(
    'description', 'Singapore accounting firm — design partner for Accounting-as-a-Service (AaaS)',
    'jurisdiction', 'SFRS/IRAS',
    'currency', 'SGD',
    'primary_contact', 'abhishek@tookitaki.com',
    'slack_channel', '#nexusbrain-ph-accounting'
  )
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug,
  plan = EXCLUDED.plan, industry = EXCLUDED.industry,
  is_design_partner = EXCLUDED.is_design_partner,
  settings = EXCLUDED.settings, updated_at = NOW();

-- Company Jarvis (AML compliance SaaS — synthetic)
INSERT INTO customers (id, name, slug, plan, industry, is_design_partner, settings)
VALUES (
  '00000000-0000-4000-c000-000000000004',
  'Company Jarvis',
  'company-jarvis',
  'enterprise',
  'AML Compliance',
  false,
  jsonb_build_object(
    'description', 'AML compliance SaaS — synthetic data environment',
    'synthetic', true
  )
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug,
  plan = EXCLUDED.plan, settings = EXCLUDED.settings, updated_at = NOW();

-- Finance Jarvis (SEC EDGAR + startup financial intelligence — synthetic)
INSERT INTO customers (id, name, slug, plan, industry, is_design_partner, settings)
VALUES (
  '00000000-0000-4000-c000-000000000005',
  'Finance Jarvis',
  'finance-jarvis',
  'enterprise',
  'Financial Intelligence',
  false,
  jsonb_build_object(
    'description', 'SEC EDGAR + startup financial intelligence — synthetic data environment',
    'synthetic', true
  )
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug,
  plan = EXCLUDED.plan, settings = EXCLUDED.settings, updated_at = NOW();

-- ── 3. Link all existing orgs to their customers (backfill customer_id) ──────

-- Core Brain → NexusBrain Platform customer
UPDATE organizations
SET customer_id = '00000000-0000-4000-c000-000000000001'
WHERE id = '00000000-0000-4000-a000-000000000001'
  AND customer_id IS NULL;

-- Demo Org → Demo customer
UPDATE organizations
SET customer_id = '00000000-0000-4000-c000-000000000002'
WHERE id = '00000000-0000-4000-b000-000000000001'
  AND customer_id IS NULL;

-- Company Jarvis org → Company Jarvis customer
UPDATE organizations
SET customer_id = '00000000-0000-4000-c000-000000000004'
WHERE id = '22222222-2222-4000-a000-222222222222'
  AND customer_id IS NULL;

-- Finance Jarvis org → Finance Jarvis customer
UPDATE organizations
SET customer_id = '00000000-0000-4000-c000-000000000005'
WHERE id = '11111111-1111-4000-a000-111111111111'
  AND customer_id IS NULL;

-- PH Accounting org → PH Accounting customer (match by slug)
UPDATE organizations
SET customer_id = '00000000-0000-4000-c000-000000000003'
WHERE slug = 'ph-accounting'
  AND customer_id IS NULL;

-- Tookitaki org(s) → Tookitaki customer (already seeded in 20260223000001)
-- customer_id = 'a1000000-0000-4000-a000-000000000001'
UPDATE organizations
SET customer_id = 'a1000000-0000-4000-a000-000000000001'
WHERE slug = 'tookitaki'
  AND customer_id IS NULL;

-- ── 4. Backfill customer_members from org_members ────────────────────────────
-- For every org_member, if that org belongs to a customer,
-- insert a customer_members row (idempotent via ON CONFLICT DO NOTHING).

INSERT INTO customer_members (customer_id, user_id, role, is_platform_admin, joined_at)
SELECT
  o.customer_id,
  m.user_id,
  -- Preserve highest role across workspaces: owner > admin > member > viewer
  CASE
    WHEN bool_or(m.role = 'owner')  THEN 'owner'
    WHEN bool_or(m.role = 'admin')  THEN 'admin'
    WHEN bool_or(m.role = 'member') THEN 'member'
    ELSE 'viewer'
  END AS role,
  bool_or(m.is_platform_admin) AS is_platform_admin,
  MIN(m.joined_at)             AS joined_at
FROM org_members m
JOIN organizations o ON o.id = m.organization_id
WHERE o.customer_id IS NOT NULL
GROUP BY o.customer_id, m.user_id
ON CONFLICT (customer_id, user_id) DO UPDATE SET
  role              = EXCLUDED.role,
  is_platform_admin = EXCLUDED.is_platform_admin,
  updated_at        = NOW();

-- ── 5. RLS for customer_members ──────────────────────────────────────────────
ALTER TABLE customer_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_member_read_own"                  ON customer_members;
DROP POLICY IF EXISTS "customer_owner_admin_read_all"             ON customer_members;
DROP POLICY IF EXISTS "platform_admin_read_all_customer_members"  ON customer_members;
DROP POLICY IF EXISTS "customer_owner_admin_insert"               ON customer_members;
DROP POLICY IF EXISTS "customer_owner_admin_update"               ON customer_members;
DROP POLICY IF EXISTS "customer_owner_admin_delete"               ON customer_members;

-- Users can see their own customer memberships
CREATE POLICY "customer_member_read_own" ON customer_members
  FOR SELECT USING (user_id = auth.uid());

-- Owners/admins of a customer can see all members of that customer
CREATE POLICY "customer_owner_admin_read_all" ON customer_members
  FOR SELECT USING (
    customer_id IN (
      SELECT customer_id FROM customer_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Platform admins see all
CREATE POLICY "platform_admin_read_all_customer_members" ON customer_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customer_members
      WHERE user_id = auth.uid()
        AND is_platform_admin = true
    )
  );

-- Only owners/admins can add members
CREATE POLICY "customer_owner_admin_insert" ON customer_members
  FOR INSERT WITH CHECK (
    customer_id IN (
      SELECT customer_id FROM customer_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM customer_members
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );

-- Only owners/admins can update roles
CREATE POLICY "customer_owner_admin_update" ON customer_members
  FOR UPDATE USING (
    customer_id IN (
      SELECT customer_id FROM customer_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM customer_members
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );

-- Owners/admins can remove members (users can also remove themselves)
CREATE POLICY "customer_owner_admin_delete" ON customer_members
  FOR DELETE USING (
    user_id = auth.uid()  -- self-remove
    OR customer_id IN (
      SELECT customer_id FROM customer_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM customer_members
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );

-- ── 6. Update auto-provision trigger to also create customer_member ──────────
-- When a new user signs up, they get a personal org AND a personal customer.
-- This replaces/extends handle_new_platform_user().

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
  -- Derive names
  v_org_name   := COALESCE(NEW.raw_user_meta_data->>'org_name', split_part(NEW.email, '@', 1) || '''s Brain');
  v_cust_name  := v_org_name;
  v_slug_suffix := SUBSTRING(NEW.id::TEXT FROM 1 FOR 8);
  v_org_slug   := LOWER(REGEXP_REPLACE(v_org_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || v_slug_suffix;
  v_cust_slug  := v_org_slug;  -- same slug for customer and its first workspace

  -- 1. Create customer
  INSERT INTO customers (name, slug, plan)
  VALUES (v_cust_name, v_cust_slug, 'free')
  RETURNING id INTO v_customer_id;

  -- 2. Create workspace org linked to customer
  INSERT INTO organizations (name, slug, customer_id)
  VALUES (v_org_name, v_org_slug, v_customer_id)
  RETURNING id INTO v_org_id;

  -- 3. Add user as owner of the customer
  INSERT INTO customer_members (customer_id, user_id, role)
  VALUES (v_customer_id, NEW.id, 'owner');

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

-- Ensure trigger is attached
DROP TRIGGER IF EXISTS on_auth_user_created_platform ON auth.users;
CREATE TRIGGER on_auth_user_created_platform
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_platform_user();

-- ── 7. Helper view: customer with members and workspaces ─────────────────────
CREATE OR REPLACE VIEW customer_overview AS
SELECT
  c.id              AS customer_id,
  c.name            AS customer_name,
  c.slug            AS customer_slug,
  c.plan            AS customer_plan,
  c.is_design_partner,
  c.industry,
  -- Workspace count
  COUNT(DISTINCT o.id)   AS workspace_count,
  -- Member count (at customer level)
  COUNT(DISTINCT cm.user_id) AS member_count
FROM customers c
LEFT JOIN organizations o   ON o.customer_id = c.id
LEFT JOIN customer_members cm ON cm.customer_id = c.id
GROUP BY c.id, c.name, c.slug, c.plan, c.is_design_partner, c.industry;

COMMENT ON VIEW customer_overview IS
  'One row per customer with aggregated workspace count and member count. '
  'Use for admin dashboard summary tiles.';

-- ── 8. Comments ──────────────────────────────────────────────────────────────
COMMENT ON TABLE customer_members IS
  'Primary user ↔ customer relationship. '
  'A user belongs to a CUSTOMER — not an org directly. '
  'Org (workspace) membership in org_members is used for brain/signal scoping only. '
  'customer_members drives auth, billing, and UI identity.';

COMMENT ON COLUMN customer_members.role IS
  'owner   → full control, can manage workspaces and members '
  'admin   → can manage members and connectors, cannot delete customer '
  'member  → read+write access to all customer workspaces '
  'viewer  → read-only access to all customer workspaces';
