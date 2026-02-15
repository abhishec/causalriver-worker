-- ============================================================================
-- Brain User Context — Per-User Role & Department for Brain Commander
-- ============================================================================
-- Phase 3: Adds brain-specific context columns to org_members.
--
-- brain_role: Overrides the org role for brain interactions.
--   e.g., a member with org role "admin" might have brain_role "cfo"
--   to get finance-focused persona and data scoping.
--
-- department: Maps to business domain for data access filtering.
--   e.g., "engineering", "finance", "cs", "revenue"
--
-- These columns enable the User Context Resolver (user-context-resolver.ts)
-- to resolve per-user persona, permissions, and data access boundaries.
-- ============================================================================

-- Add brain_role column (nullable — null means use org role)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_members' AND column_name = 'brain_role'
  ) THEN
    ALTER TABLE org_members ADD COLUMN brain_role TEXT DEFAULT NULL;
    COMMENT ON COLUMN org_members.brain_role IS
      'Brain-specific role override. Maps to persona definitions in user-context-resolver.ts. '
      'Values: ceo, cfo, cro, cto, vp_finance, vp_sales, vp_cs, vp_engineering, vp_product, '
      'vp_marketing, vp_people, vp_services, vp_am, engineer, product_manager, csm, etc. '
      'NULL means use the org role (owner/admin/member/viewer).';
  END IF;
END $$;

-- Add department column (nullable — null means resolve from brain_role)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_members' AND column_name = 'department'
  ) THEN
    ALTER TABLE org_members ADD COLUMN department TEXT DEFAULT NULL;
    COMMENT ON COLUMN org_members.department IS
      'Business department for data access scoping. '
      'Values: finance, revenue, cs, am, services, marketing, product, engineering, people, executive. '
      'NULL means resolve from brain_role mapping.';
  END IF;
END $$;

-- Index for efficient user context resolution
CREATE INDEX IF NOT EXISTS idx_org_members_brain_role
  ON org_members(organization_id, brain_role)
  WHERE brain_role IS NOT NULL;
