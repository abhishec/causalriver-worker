-- ============================================================================
-- Organization Update Policy + Onboarding Support
-- ============================================================================
-- Allows org owners/admins to update their organization details (name, slug, etc.)
-- Required for the post-OAuth onboarding flow where users name their org.
-- ============================================================================

-- ── Org owners and admins can update their organizations ──
CREATE POLICY "org_owner_update" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── Platform admins can update any organization ──
CREATE POLICY "platform_admin_update_orgs" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );
