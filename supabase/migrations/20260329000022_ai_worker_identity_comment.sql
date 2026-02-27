-- Clarify that organization_id IS the AI Worker identity.
-- One AI Worker per AI Worker Space. The two IDs are mathematically equivalent
-- (enforced by UNIQUE constraint). Use organization_id as the canonical AI Worker ID
-- everywhere — in RLS, in API responses, in Brain context queries.
--
-- No schema change needed. This is documentation-level alignment.

COMMENT ON COLUMN ai_worker_config.organization_id IS
  'The AI Worker identity. One AI Worker per AI Worker Space (organizations). '
  'Use this as the AI Worker ID in all API responses, RLS policies, and Brain queries. '
  'The 1:1 relationship is enforced by the UNIQUE constraint on this column.';

COMMENT ON TABLE ai_worker_config IS
  'Per-AI-Worker configuration. One row per AI Worker Space (organizations). '
  'organization_id here IS the AI Worker ID — not a foreign key to a parent entity '
  'but the worker''s own identity within the platform.';
