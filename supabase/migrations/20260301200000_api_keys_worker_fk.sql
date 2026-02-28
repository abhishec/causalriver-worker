-- ADR-008: API keys scoped to a specific AI Worker
-- Adds ai_worker_id FK to api_keys so a Bearer token can be tied to a specific worker.
-- Nullable: existing org-level keys (ai_worker_id IS NULL) continue to work as before.

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS ai_worker_id UUID REFERENCES ai_workers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_ai_worker
  ON api_keys(ai_worker_id) WHERE ai_worker_id IS NOT NULL;
