-- ============================================================================
-- Agent Templates — Persistent custom command definitions for NexusBrain Copilot
-- ============================================================================
-- Enables users to save agent workflows as reusable slash commands,
-- compose agents on-the-fly, and share templates across teams.

-- ── Table ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Command definition (maps to SlashCommand interface)
  command_id        TEXT NOT NULL,                    -- e.g. "custom-weekly-report"
  label             TEXT NOT NULL,                    -- display label for / picker
  description       TEXT NOT NULL,
  icon              TEXT NOT NULL DEFAULT '🔧',
  prompt            TEXT NOT NULL,                    -- execution prompt template
  category          TEXT NOT NULL DEFAULT 'Custom',
  service           TEXT NOT NULL DEFAULT 'custom',   -- "custom" service type

  -- Gathering schema (nullable — commands without interactive params have NULL)
  gathering_schema  JSONB,                            -- CommandGathering shape (sans commandId)

  -- Agent composition metadata (for on-the-fly composed agents)
  agent_config      JSONB,                            -- { persona, tools[], executionPlan[] }

  -- Provenance
  source_artifact_id UUID,                            -- artifact that triggered save
  source_domain_id   TEXT,                            -- domain that produced original result

  -- Sharing and visibility
  is_public         BOOLEAN NOT NULL DEFAULT false,   -- visible across all orgs
  is_archived       BOOLEAN NOT NULL DEFAULT false,   -- soft-deleted

  -- Usage tracking
  usage_count       INTEGER NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate command IDs within an org
  UNIQUE(org_id, command_id)
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_templates_org
  ON agent_templates (org_id, is_archived, usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_agent_templates_public
  ON agent_templates (is_public, is_archived)
  WHERE is_public = true AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_agent_templates_user
  ON agent_templates (created_by, created_at DESC);

-- ── Auto-update updated_at trigger ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_agent_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_templates_updated_at ON agent_templates;
CREATE TRIGGER trg_agent_templates_updated_at
  BEFORE UPDATE ON agent_templates
  FOR EACH ROW EXECUTE FUNCTION update_agent_templates_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────────

ALTER TABLE agent_templates ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's templates + all public templates
CREATE POLICY agent_templates_read ON agent_templates
  FOR SELECT USING (
    is_archived = false AND (
      org_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
      OR is_public = true
    )
  );

-- Org members can create/update/delete templates in their org
CREATE POLICY agent_templates_write ON agent_templates
  FOR ALL USING (
    org_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Service role bypass
CREATE POLICY agent_templates_service_role ON agent_templates
  FOR ALL USING (auth.role() = 'service_role');

-- ── Grants ─────────────────────────────────────────────────────────────────────

GRANT ALL ON agent_templates TO service_role;
GRANT SELECT, INSERT, UPDATE ON agent_templates TO authenticated;
