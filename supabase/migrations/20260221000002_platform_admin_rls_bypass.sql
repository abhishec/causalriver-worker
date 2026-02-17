-- =============================================================================
-- Platform Admin RLS Bypass Policies
-- =============================================================================
-- Platform admins (is_platform_admin = true) should be able to read ALL org
-- members and connectors across every organization, not just their own orgs.
--
-- Without these policies, platform admins can see all ORGANIZATIONS
-- (via platform_admin_read_all_orgs) but cannot see the members or connectors
-- of orgs they aren't explicitly added to — breaking the admin experience.

-- Platform admins can read ALL org_members across all orgs
CREATE POLICY "platform_admin_read_all_members" ON org_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );

-- Platform admins can read ALL org_connectors across all orgs
CREATE POLICY "platform_admin_read_all_connectors" ON org_connectors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );

-- Platform admins can read ALL platform_events
CREATE POLICY "platform_admin_read_all_events" ON platform_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );
