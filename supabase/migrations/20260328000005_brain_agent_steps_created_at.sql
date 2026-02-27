-- brain_agent_steps is missing created_at — code in worker-memory/route.ts
-- queries .select("task_id, created_at") which fails with 42703.
-- Add created_at defaulting to started_at for existing rows.

DO $$ BEGIN
  ALTER TABLE brain_agent_steps
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Backfill existing rows: use started_at as created_at
UPDATE brain_agent_steps
  SET created_at = started_at
  WHERE created_at IS DISTINCT FROM started_at
    AND started_at IS NOT NULL;

-- Index for the order("created_at", { ascending: false }) query pattern
CREATE INDEX IF NOT EXISTS idx_brain_agent_steps_task_created
  ON brain_agent_steps (task_id, created_at DESC);
