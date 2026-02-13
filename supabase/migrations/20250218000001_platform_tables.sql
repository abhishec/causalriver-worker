-- ============================================================================
-- NexusBrain Platform Tables
-- ============================================================================
-- Multi-tenant platform tables for the admin dashboard.
-- Adds: organizations, org_members, org_connectors, copilot_conversations,
--        platform_events, and RLS policies for multi-tenant isolation.
-- ============================================================================

-- ── Organizations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  plan            TEXT DEFAULT 'free',        -- free, starter, pro, enterprise
  logo_url        TEXT,
  settings        JSONB DEFAULT '{}',
  is_core_brain   BOOLEAN DEFAULT false,      -- true for the platform's own brain
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the core brain organization (must match existing org ID across all tables)
INSERT INTO organizations (id, name, slug, is_core_brain, plan)
VALUES ('00000000-0000-4000-a000-000000000001', 'NexusBrain Core', 'core', true, 'enterprise')
ON CONFLICT (id) DO NOTHING;

-- ── Organization Membership ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              TEXT DEFAULT 'member',     -- owner, admin, member, viewer
  is_platform_admin BOOLEAN DEFAULT false,     -- super admin access to /admin
  invited_by        UUID,
  joined_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members (organization_id);

-- ── Organization Connectors ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_connectors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_type    TEXT NOT NULL,             -- stripe, hubspot, github, slack, etc.
  status            TEXT DEFAULT 'pending',    -- pending, active, error, disabled
  last_sync_at      TIMESTAMPTZ,
  signals_count     INTEGER DEFAULT 0,
  error_message     TEXT,
  config            JSONB DEFAULT '{}',        -- Non-sensitive config only
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_connectors_org ON org_connectors (organization_id);

-- ── Copilot Conversations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT,
  messages          JSONB DEFAULT '[]',
  context           JSONB DEFAULT '{}',        -- Brain context used for this conversation
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_conv_org ON copilot_conversations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_conv_user ON copilot_conversations (user_id, created_at DESC);

-- ── Platform Events / Error Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID,                      -- NULL for system-wide events
  event_type        TEXT NOT NULL,             -- error, warning, info, training_complete, anomaly
  source            TEXT,                      -- trainer, consolidation, dmn, connector, copilot, system
  title             TEXT NOT NULL,
  details           JSONB DEFAULT '{}',
  resolved          BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_events_org ON platform_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_type ON platform_events (event_type, created_at DESC);

-- ── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;

-- Organizations: users see orgs they belong to
CREATE POLICY "org_member_read" ON organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
  );

-- Platform admins see all orgs
CREATE POLICY "platform_admin_read_all_orgs" ON organizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
  );

-- Org members: users see their own memberships
CREATE POLICY "member_read_own" ON org_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Connectors: scoped to org membership
CREATE POLICY "connector_read" ON org_connectors
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
  );

-- Copilot conversations: scoped to user + org
CREATE POLICY "copilot_read_own" ON copilot_conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "copilot_insert_own" ON copilot_conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "copilot_update_own" ON copilot_conversations
  FOR UPDATE USING (user_id = auth.uid());

-- Platform events: org members see their org's events
CREATE POLICY "events_read_org" ON platform_events
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
    OR organization_id IS NULL  -- System events visible to all authenticated users
  );

-- Platform admins can see all events
CREATE POLICY "events_admin_read_all" ON platform_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
  );

-- ── Helper function: auto-create org on signup ──────────────────────────────
-- This function can be called from a Supabase trigger on auth.users insert
-- to automatically create an org and membership for new signups.

CREATE OR REPLACE FUNCTION handle_new_platform_user()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_org_name TEXT;
  v_org_slug TEXT;
BEGIN
  -- Get org name from user metadata (set during signup)
  v_org_name := COALESCE(NEW.raw_user_meta_data->>'org_name', split_part(NEW.email, '@', 1) || '''s Brain');
  v_org_slug := LOWER(REGEXP_REPLACE(v_org_name, '[^a-zA-Z0-9]', '-', 'g'));

  -- Ensure unique slug
  v_org_slug := v_org_slug || '-' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 8);

  -- Create organization
  INSERT INTO organizations (name, slug)
  VALUES (v_org_name, v_org_slug)
  RETURNING id INTO v_org_id;

  -- Add user as owner
  INSERT INTO org_members (organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: auto-create org on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created_platform ON auth.users;
CREATE TRIGGER on_auth_user_created_platform
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_platform_user();
