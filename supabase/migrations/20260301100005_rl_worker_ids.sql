-- Add ai_worker_id to RL tables for per-worker quality tracking
-- ADR-020: RL tracking is per Worker

ALTER TABLE prediction_records
  ADD COLUMN IF NOT EXISTS ai_worker_id uuid REFERENCES ai_workers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prediction_records_worker
  ON prediction_records(ai_worker_id) WHERE ai_worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prediction_records_worker_domain
  ON prediction_records(ai_worker_id, domain) WHERE ai_worker_id IS NOT NULL;

-- cross_domain_signals: add ai_worker_id if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cross_domain_signals') THEN
    ALTER TABLE cross_domain_signals
      ADD COLUMN IF NOT EXISTS ai_worker_id uuid REFERENCES ai_workers(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_cross_domain_signals_worker
      ON cross_domain_signals(ai_worker_id) WHERE ai_worker_id IS NOT NULL;
  END IF;
END $$;
