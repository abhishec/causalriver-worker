-- ============================================================================
-- Customers + Workspace Scoping
-- ============================================================================
-- Introduces a `customers` table as the parent entity above `organizations`.
-- An organization is now a "workspace" — one release track, one causal graph.
-- A customer (e.g. Tookitaki) can have multiple workspaces (e.g. 6.x main +
-- 5.11.x enterprise) without any cross-pollination of causal graphs.
--
-- Why this matters:
--   - organizations.organization_id scopes ALL brain tables (causal graph,
--     ai_memory, signals, etc.) — so 2 orgs = 2 completely isolated brains.
--   - Federated learning sends each org's deltas independently to CORE.
--     The two orgs never share data directly; they only blend at CORE level
--     across ALL industry orgs.
--   - customer_id is purely for billing, reporting, and UI grouping.
--     It has zero influence on brain state or signal isolation.
--
-- Migration sequence:
--   1. Create customers table
--   2. Add customer_id to organizations (nullable for backwards compat)
--   3. Seed Tookitaki as first customer
--   4. RLS: platform admins see all; members see own customer's orgs
-- ============================================================================

-- ── 1. Customers table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,                    -- e.g. 'Tookitaki'
  slug         TEXT UNIQUE NOT NULL,             -- e.g. 'tookitaki'
  plan         TEXT DEFAULT 'enterprise',        -- free | starter | pro | enterprise
  logo_url     TEXT,
  website      TEXT,
  industry     TEXT,                             -- e.g. 'FinTech'
  settings     JSONB DEFAULT '{}',               -- flexible metadata (CSM notes, tags, etc.)
  is_design_partner BOOLEAN DEFAULT false,       -- flag for early design partner customers
  onboarded_at TIMESTAMPTZ,                      -- when they went live (not just provisioned)
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_slug ON customers (slug);
CREATE INDEX IF NOT EXISTS idx_customers_plan ON customers (plan);
CREATE INDEX IF NOT EXISTS idx_customers_design_partner ON customers (is_design_partner)
  WHERE is_design_partner = true;

-- ── 2. Add customer_id to organizations ─────────────────────────────────────
-- nullable: existing orgs (and CORE brain) are not customer-owned
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_customer ON organizations (customer_id)
  WHERE customer_id IS NOT NULL;

-- ── 3. Auto-update timestamps ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customers_updated_at();

-- ── 4. Seed Tookitaki as first design partner customer ───────────────────────
-- NOTE: org IDs are seeded in register-design-partner-tookitaki.ts (via
-- org-creation-agent). This only creates the parent customer record.
INSERT INTO customers (
  id,
  name,
  slug,
  plan,
  industry,
  is_design_partner,
  settings
) VALUES (
  'a1000000-0000-4000-a000-000000000001',   -- stable, predictable customer ID
  'Tookitaki',
  'tookitaki',
  'enterprise',
  'FinTech',
  true,
  jsonb_build_object(
    'description',    'AML/compliance SaaS — first NexusBrain design partner',
    'csm_notes',      'Two active release tracks: 6.x main (Bao/Ravi) and 5.11.x enterprise (Sandeep/Doan)',
    'primary_contact','<FILL: name + email>',
    'slack_channel',  '#nexusbrain-tookitaki'
  )
) ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  slug             = EXCLUDED.slug,
  plan             = EXCLUDED.plan,
  industry         = EXCLUDED.industry,
  is_design_partner= EXCLUDED.is_design_partner,
  settings         = EXCLUDED.settings,
  updated_at       = NOW();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Platform admins see all customers
CREATE POLICY "platform_admin_read_all_customers" ON customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid()
        AND is_platform_admin = true
    )
  );

-- Org members see the customer that owns their org
CREATE POLICY "org_member_read_own_customer" ON customers
  FOR SELECT USING (
    id IN (
      SELECT o.customer_id
      FROM organizations o
      JOIN org_members m ON m.organization_id = o.id
      WHERE m.user_id = auth.uid()
        AND o.customer_id IS NOT NULL
    )
  );

-- ── 6. Helper view: customer workspaces ─────────────────────────────────────
-- Convenience view for the admin dashboard: shows all orgs grouped by customer.
CREATE OR REPLACE VIEW customer_workspaces AS
SELECT
  c.id            AS customer_id,
  c.name          AS customer_name,
  c.slug          AS customer_slug,
  c.plan          AS customer_plan,
  c.is_design_partner,
  o.id            AS workspace_id,
  o.name          AS workspace_name,
  o.slug          AS workspace_slug,
  o.settings      AS workspace_settings,
  o.created_at    AS workspace_created_at
FROM customers c
JOIN organizations o ON o.customer_id = c.id
ORDER BY c.name, o.name;

COMMENT ON VIEW customer_workspaces IS
  'Flat view of all customer→workspace relationships. '
  'Each workspace is an isolated org with its own causal graph. '
  'Used by admin dashboard and design partner onboarding tooling.';

-- ── 7. Helpful comments ──────────────────────────────────────────────────────
COMMENT ON TABLE customers IS
  'Parent entity above organizations. '
  'One customer (e.g. Tookitaki) can have multiple workspace-orgs '
  '(e.g. tookitaki-634, tookitaki-5115) with fully isolated causal graphs. '
  'customer_id is for billing/reporting only — no brain state is shared across workspaces.';

COMMENT ON COLUMN organizations.customer_id IS
  'FK to customers. NULL for internal orgs (CORE brain, test orgs). '
  'Populated for all customer-facing workspace orgs. '
  'Isolation guarantee: two orgs with the same customer_id still have '
  'completely separate causal graphs, signals, and memory — customer_id '
  'never crosses brain boundaries.';
