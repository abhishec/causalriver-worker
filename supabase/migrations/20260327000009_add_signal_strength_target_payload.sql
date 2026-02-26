-- Add missing columns to cross_domain_signals identified in CTO audit (2026-02-27).
--
-- Three columns are used in application code but were never added to the schema:
--
-- 1. signal_strength FLOAT — RL intensity of the signal (distinct from signal_value,
--    which is the raw connector metric). Used by:
--    - brain/feedback/route.ts (inserts 0.3 dopamine, -0.5 norepinephrine, -0.2 gaba)
--    - lib/brain/agent-orchestrator.ts (inserts RL outcome signals)
--    - lib/connectors/writeback-dispatcher.ts (inserts writeback attempt signals)
--    - lib/brain/brain-context.ts (reads for top 3 recent signal context)
--
-- 2. target_domain TEXT — the domain the signal is directed at (e.g. "general", "pod-match").
--    Used by brain/feedback/route.ts and agent-orchestrator.ts.
--
-- 3. payload JSONB — additional structured data attached to RL signals.
--    Used by brain/feedback/route.ts for feedback context.
--
-- Without these columns, Supabase silently ignores the fields on INSERT
-- and returns NULL on SELECT, making the RL strength data invisible.

ALTER TABLE cross_domain_signals
  ADD COLUMN IF NOT EXISTS signal_strength FLOAT,
  ADD COLUMN IF NOT EXISTS target_domain   TEXT,
  ADD COLUMN IF NOT EXISTS payload         JSONB DEFAULT '{}';

-- Index for brain-context top signals query — orders by signal_strength DESC
CREATE INDEX IF NOT EXISTS idx_cds_org_strength
  ON cross_domain_signals (organization_id, signal_strength DESC NULLS LAST)
  WHERE signal_strength IS NOT NULL;
