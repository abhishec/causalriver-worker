-- Migration: Add resolved_at and resolved_by columns to scope_creep_alerts
-- These columns enable ground-truth RL validation:
--   when an alert is resolved, it confirms the prediction was correct (real scope creep occurred and was acted upon).

ALTER TABLE public.scope_creep_alerts
  ADD COLUMN IF NOT EXISTS resolved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by   UUID REFERENCES auth.users(id);

-- Index to speed up ground-truth validator queries filtering by resolved_at
CREATE INDEX IF NOT EXISTS idx_scope_alerts_resolved
  ON public.scope_creep_alerts (organization_id, created_at)
  WHERE resolved_at IS NOT NULL;

COMMENT ON COLUMN public.scope_creep_alerts.resolved_at IS
  'Timestamp when this scope creep alert was resolved/closed. Used by ground-truth RL validator to confirm prediction correctness.';
COMMENT ON COLUMN public.scope_creep_alerts.resolved_by IS
  'User who resolved/closed this alert.';
