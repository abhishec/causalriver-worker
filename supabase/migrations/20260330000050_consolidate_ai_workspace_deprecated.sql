-- Consolidation: ai_workspace → ai_worker_config
-- =====================================================
-- ai_worker_config is the canonical table (one row per AI Worker / org).
-- ai_workspace is the legacy duplicate. We add the three columns that were
-- exclusive to ai_workspace so all callers can migrate, then mark
-- ai_workspace as deprecated.  The table is NOT dropped here — a future
-- migration will remove it once we have confirmed no live traffic.
--
-- Columns being added to ai_worker_config:
--   activated_services  TEXT[]   — which service types are enabled (SE-aaS, A-aaS, …)
--   aaas_config         JSONB    — AaaS-specific configuration
--   writeback_enabled   BOOLEAN  — whether post-execution write-back dispatch is on

ALTER TABLE ai_worker_config
  ADD COLUMN IF NOT EXISTS activated_services TEXT[] NOT NULL DEFAULT ARRAY['SE-aaS'],
  ADD COLUMN IF NOT EXISTS aaas_config JSONB NOT NULL DEFAULT '{"enabled": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS writeback_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_worker_config.activated_services IS
  'Which service types this AI Worker runs. Migrated from ai_workspace.activated_services.';
COMMENT ON COLUMN ai_worker_config.aaas_config IS
  'AaaS-specific config. Migrated from ai_workspace.aaas_config.';
COMMENT ON COLUMN ai_worker_config.writeback_enabled IS
  'Toggle for post-execution write-back dispatch. Migrated from ai_workspace.writeback_enabled.';

-- Copy existing data from ai_workspace into ai_worker_config where a
-- matching row exists (best-effort — nulls stay as column defaults).
UPDATE ai_worker_config wc
SET
  activated_services = COALESCE(ws.activated_services, ARRAY['SE-aaS']),
  aaas_config        = COALESCE(ws.aaas_config, '{"enabled": false}'::jsonb),
  writeback_enabled  = COALESCE(ws.writeback_enabled, false)
FROM ai_workspace ws
WHERE ws.organization_id = wc.organization_id;

-- Mark ai_workspace as deprecated — do NOT drop yet.
COMMENT ON TABLE ai_workspace IS
  'DEPRECATED: Use ai_worker_config instead. All code has been migrated. This table will be dropped in a future migration once confirmed safe.';
