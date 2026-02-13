-- ============================================================================
-- Platform Admin Seed & Auto-Promote
-- ============================================================================
-- 1. Updates the trigger function to handle Google OAuth signups properly
-- 2. Auto-promotes specific emails to platform admin
-- 3. Adds the first platform admin: abhishek@tookitaki.com
-- ============================================================================

-- ── Updated trigger: handles both email/password and OAuth signups ──
CREATE OR REPLACE FUNCTION handle_new_platform_user()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_org_name TEXT;
  v_org_slug TEXT;
  v_is_admin BOOLEAN DEFAULT false;
  v_admin_emails TEXT[] := ARRAY['abhishek@tookitaki.com', 'abhishek@monetiz3.com'];
BEGIN
  -- Check if this email should be a platform admin
  IF NEW.email = ANY(v_admin_emails) THEN
    v_is_admin := true;
  END IF;

  -- Get org name from user metadata (set during signup)
  -- For Google OAuth: use the user's name or email domain
  v_org_name := COALESCE(
    NEW.raw_user_meta_data->>'org_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1) || '''s Brain'
  );
  v_org_slug := LOWER(REGEXP_REPLACE(v_org_name, '[^a-zA-Z0-9]', '-', 'g'));

  -- Ensure unique slug by appending user ID prefix
  v_org_slug := v_org_slug || '-' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 8);

  -- Create organization
  INSERT INTO organizations (name, slug)
  VALUES (v_org_name, v_org_slug)
  RETURNING id INTO v_org_id;

  -- Add user as owner of their org + set platform admin if applicable
  INSERT INTO org_members (organization_id, user_id, role, is_platform_admin)
  VALUES (v_org_id, NEW.id, 'owner', v_is_admin);

  -- If platform admin, also add them to the Core Brain org
  IF v_is_admin THEN
    INSERT INTO org_members (organization_id, user_id, role, is_platform_admin)
    VALUES ('00000000-0000-4000-a000-000000000001', NEW.id, 'admin', true)
    ON CONFLICT (organization_id, user_id) DO UPDATE SET is_platform_admin = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Ensure trigger exists ──
DROP TRIGGER IF EXISTS on_auth_user_created_platform ON auth.users;
CREATE TRIGGER on_auth_user_created_platform
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_platform_user();

-- ── Add RLS policies for org_members insert (needed for the trigger) ──
-- Service role bypasses RLS, but let's add insert policy for completeness
CREATE POLICY "member_insert_by_trigger" ON org_members
  FOR INSERT WITH CHECK (true);

-- ── Add INSERT policy for organizations (needed for the trigger) ──
CREATE POLICY "org_insert_by_trigger" ON organizations
  FOR INSERT WITH CHECK (true);

-- ── Add UPDATE policy for org_members (for admin management) ──
CREATE POLICY "admin_update_members" ON org_members
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM org_members m WHERE m.user_id = auth.uid() AND m.is_platform_admin = true)
  );

-- ── Ensure platform admins can INSERT platform_events ──
CREATE POLICY "events_insert" ON platform_events
  FOR INSERT WITH CHECK (true);

-- ── Add org_connectors INSERT/UPDATE policies ──
CREATE POLICY "connector_insert" ON org_connectors
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "connector_update" ON org_connectors
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- ── Platform admin can read all connectors ──
CREATE POLICY "admin_connector_read_all" ON org_connectors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
  );

-- ── Platform admin can read all copilot conversations ──
CREATE POLICY "admin_copilot_read_all" ON copilot_conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
  );
