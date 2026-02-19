-- ============================================================================
-- Partner Activation — add missing columns for design partner features
-- ============================================================================
-- Adds:
--   1. is_design_partner on organizations (mirrored from customers for fast reads)
--   2. partner_activation JSONB on org_settings (checklist state, dismiss, feedback)
--   3. config JSONB on org_settings (digest / notification config)
--
-- These columns are consumed by:
--   - /api/partner/activation  (read/write partner_activation + config)
--   - /api/partner/feedback    (read/write partner_activation.feedback_history)
--   - overview/page.tsx        (read is_design_partner)
--   - settings/page.tsx        (read is_design_partner)
--   - /api/org/provision       (write is_design_partner)
-- ============================================================================

-- ── 1. is_design_partner on organizations ────────────────────────────────────
-- Mirrors customers.is_design_partner for direct reads without joins.
-- Set during provisioning or manually via admin.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_design_partner BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_organizations_design_partner
  ON organizations (is_design_partner) WHERE is_design_partner = true;

-- Backfill: sync is_design_partner from parent customer for existing orgs
UPDATE organizations o
SET is_design_partner = c.is_design_partner
FROM customers c
WHERE o.customer_id = c.id
  AND c.is_design_partner = true
  AND o.is_design_partner IS DISTINCT FROM true;

-- ── 2. partner_activation JSONB on org_settings ──────────────────────────────
-- Stores: { checklist_dismissed, dismissed_at, dismissed_by, feedback_history[] }
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS partner_activation JSONB DEFAULT '{}';

-- ── 3. config JSONB on org_settings ──────────────────────────────────────────
-- Stores: { digest_slack_channel, digest_email_recipients, email_digest, ... }
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- ── Done ─────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN organizations.is_design_partner IS
  'Mirrored from customers.is_design_partner for fast reads. '
  'Set during provisioning when user toggles Design Partner in onboarding.';

COMMENT ON COLUMN org_settings.partner_activation IS
  'JSONB storing design partner activation state: checklist_dismissed, '
  'dismissed_at, dismissed_by, feedback_history[]. '
  'Read/written by /api/partner/activation and /api/partner/feedback.';

COMMENT ON COLUMN org_settings.config IS
  'JSONB storing org-level config: digest_slack_channel, '
  'digest_email_recipients, email_digest, and other feature flags.';
