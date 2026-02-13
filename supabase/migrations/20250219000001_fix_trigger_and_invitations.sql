-- ============================================================================
-- Fix signup trigger + Add org_invitations table + Fix RLS policies
-- ============================================================================

-- Enable pgcrypto for gen_random_bytes (needed for invite tokens)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 1. Fix the signup trigger with better error handling ────────────────────

CREATE OR REPLACE FUNCTION handle_new_platform_user()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_org_name TEXT;
  v_org_slug TEXT;
  v_is_admin BOOLEAN DEFAULT false;
  v_admin_emails TEXT[] := ARRAY['abhishek@tookitaki.com', 'abhishek@monetiz3.com'];
  v_invite RECORD;
BEGIN
  -- Check if this email should be a platform admin
  IF NEW.email = ANY(v_admin_emails) THEN
    v_is_admin := true;
  END IF;

  -- Get org name from user metadata
  v_org_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'org_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(NEW.email, '@', 1) || '''s Brain'
  );

  -- Generate slug: sanitize + append user ID prefix for uniqueness
  v_org_slug := LOWER(REGEXP_REPLACE(v_org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_org_slug := TRIM(BOTH '-' FROM v_org_slug);
  IF v_org_slug = '' THEN
    v_org_slug := 'org';
  END IF;
  v_org_slug := v_org_slug || '-' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 8);

  -- Create personal organization
  INSERT INTO public.organizations (name, slug)
  VALUES (v_org_name, v_org_slug)
  RETURNING id INTO v_org_id;

  -- Add user as owner of their personal org
  INSERT INTO public.org_members (organization_id, user_id, role, is_platform_admin)
  VALUES (v_org_id, NEW.id, 'owner', v_is_admin);

  -- If platform admin, also add to Core Brain org
  IF v_is_admin THEN
    INSERT INTO public.org_members (organization_id, user_id, role, is_platform_admin)
    VALUES ('00000000-0000-4000-a000-000000000001', NEW.id, 'admin', true)
    ON CONFLICT (organization_id, user_id) DO UPDATE SET is_platform_admin = true;
  END IF;

  -- Auto-accept any pending invitations for this email
  FOR v_invite IN
    SELECT id, organization_id, role, inviter_id
    FROM public.org_invitations
    WHERE invitee_email = NEW.email
      AND status = 'pending'
      AND expires_at > NOW()
  LOOP
    INSERT INTO public.org_members (organization_id, user_id, role, invited_by)
    VALUES (v_invite.organization_id, NEW.id, v_invite.role, v_invite.inviter_id)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    UPDATE public.org_invitations
    SET status = 'accepted', updated_at = NOW()
    WHERE id = v_invite.id;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't prevent user creation
  RAISE WARNING 'handle_new_platform_user failed for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created_platform ON auth.users;
CREATE TRIGGER on_auth_user_created_platform
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_platform_user();


-- ── 2. Create org_invitations table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inviter_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_email   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',
  status          TEXT NOT NULL DEFAULT 'pending',
  token           TEXT UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_org ON public.org_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.org_invitations(invitee_email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.org_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.org_invitations(status);

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- Org owners/admins can view invitations for their orgs
CREATE POLICY "invitation_read_by_org_admin" ON public.org_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Users can view invitations sent to their email
CREATE POLICY "invitation_read_by_invitee" ON public.org_invitations
  FOR SELECT USING (
    invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Org owners/admins can create invitations
CREATE POLICY "invitation_insert_by_admin" ON public.org_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Org owners/admins can update invitations (revoke/expire)
CREATE POLICY "invitation_update_by_admin" ON public.org_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Platform admins can see all invitations
CREATE POLICY "invitation_admin_read_all" ON public.org_invitations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
  );

-- Service role / trigger can insert (for auto-accept)
CREATE POLICY "invitation_service_update" ON public.org_invitations
  FOR UPDATE USING (true)
  WITH CHECK (true);


-- ── 3. Fix org_members CRUD RLS policies ───────────────────────────────────

-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "member_insert_by_trigger" ON public.org_members;

-- INSERT: Service role (trigger) + org owners/admins
CREATE POLICY "member_insert_by_org_admin" ON public.org_members
  FOR INSERT WITH CHECK (
    -- Org owners/admins can add members
    organization_id IN (
      SELECT om.organization_id FROM public.org_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
    -- OR service role (trigger uses SECURITY DEFINER, bypasses RLS anyway)
    -- But we need a fallback for the trigger when it runs in non-SECURITY-DEFINER context
    OR auth.uid() IS NULL
  );

-- Drop platform-admin-only update policy
DROP POLICY IF EXISTS "admin_update_members" ON public.org_members;

-- UPDATE: Org owners can change any role; admins can change member/viewer roles
CREATE POLICY "member_update_by_org_admin" ON public.org_members
  FOR UPDATE USING (
    -- Platform admins can update any member
    EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.is_platform_admin = true)
    OR
    -- Org owners can update members in their org
    organization_id IN (
      SELECT om.organization_id FROM public.org_members om
      WHERE om.user_id = auth.uid() AND om.role = 'owner'
    )
    OR
    -- Org admins can update non-owner, non-admin members
    (
      organization_id IN (
        SELECT om.organization_id FROM public.org_members om
        WHERE om.user_id = auth.uid() AND om.role = 'admin'
      )
      AND role NOT IN ('owner', 'admin')
    )
  );

-- DELETE: Org owners can remove anyone; admins can remove non-owners; users can leave
CREATE POLICY "member_delete_by_org_admin" ON public.org_members
  FOR DELETE USING (
    -- Platform admins
    EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.is_platform_admin = true)
    OR
    -- Org owners can remove anyone
    organization_id IN (
      SELECT om.organization_id FROM public.org_members om
      WHERE om.user_id = auth.uid() AND om.role = 'owner'
    )
    OR
    -- Org admins can remove non-owner members
    (
      organization_id IN (
        SELECT om.organization_id FROM public.org_members om
        WHERE om.user_id = auth.uid() AND om.role = 'admin'
      )
      AND role NOT IN ('owner', 'admin')
    )
    OR
    -- Users can leave any org (remove themselves)
    user_id = auth.uid()
  );
