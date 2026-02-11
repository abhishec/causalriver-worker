-- ============================================================
-- NexusBrain Learning State Persistence Tables
-- ============================================================
-- These tables store the learned parameters between training runs
-- so the brain doesn't lose its knowledge when agents restart.
--
-- Tables:
--   bayesian_posteriors     — Beta(α,β) parameters per causal edge
--   embedding_transforms    — Learned domain transform matrices
--   causal_model_state      — Contrastive causal learner weights
--   attention_policy_state  — REINFORCE policy weights + threshold
--   learning_runs           — Audit log of every learning run
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. BAYESIAN POSTERIORS
-- Store full Beta(α,β) parameters so we don't reconstruct
-- them from weight×sample_size approximation
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayesian_posteriors (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  source_domain   TEXT NOT NULL,
  target_domain   TEXT NOT NULL,
  alpha           DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  beta            DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  mean            DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  variance        DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  entropy         DOUBLE PRECISION DEFAULT NULL,
  ci_lower        DOUBLE PRECISION DEFAULT NULL,
  ci_upper        DOUBLE PRECISION DEFAULT NULL,
  evidence_count  INTEGER NOT NULL DEFAULT 0,
  last_update_source TEXT DEFAULT 'consolidation',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, source_domain, target_domain)
);

CREATE INDEX IF NOT EXISTS idx_bayesian_posteriors_org
  ON bayesian_posteriors(organization_id);
CREATE INDEX IF NOT EXISTS idx_bayesian_posteriors_uncertainty
  ON bayesian_posteriors(organization_id, variance DESC);

-- ──────────────────────────────────────────────────────────
-- 2. EMBEDDING TRANSFORMS
-- Store the learned domain transform matrix W
-- For 384-dim embeddings, W is 384×384 = 147,456 floats
-- We store as JSONB array (compressed) — ~600KB per org
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embedding_transforms (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  dimension       INTEGER NOT NULL DEFAULT 384,
  weights         JSONB NOT NULL,
  loss_history    JSONB DEFAULT '[]'::jsonb,
  pairs_processed INTEGER NOT NULL DEFAULT 0,
  epochs_completed INTEGER NOT NULL DEFAULT 0,
  final_loss      DOUBLE PRECISION DEFAULT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id)
);

-- ──────────────────────────────────────────────────────────
-- 3. CAUSAL MODEL STATE
-- Store the contrastive causal learner's neural weights
-- Single-layer classifier: 768-dim weights + 1 bias
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS causal_model_state (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  model_type      TEXT NOT NULL DEFAULT 'contrastive_sigmoid',
  input_dimension INTEGER NOT NULL DEFAULT 768,
  weights         JSONB NOT NULL,
  bias            DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  examples_seen   INTEGER NOT NULL DEFAULT 0,
  avg_loss        DOUBLE PRECISION DEFAULT NULL,
  accuracy        DOUBLE PRECISION DEFAULT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, model_type)
);

-- ──────────────────────────────────────────────────────────
-- 4. ATTENTION POLICY STATE
-- Store the REINFORCE policy gradient weights + threshold
-- 4 component weights + learned alert threshold
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attention_policy_state (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  weights         JSONB NOT NULL DEFAULT '[0.25, 0.35, 0.25, 0.15]'::jsonb,
  alert_threshold DOUBLE PRECISION NOT NULL DEFAULT 40.0,
  feedback_count  INTEGER NOT NULL DEFAULT 0,
  avg_reward      DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  entropy         DOUBLE PRECISION DEFAULT NULL,
  reward_history  JSONB DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id)
);

-- ──────────────────────────────────────────────────────────
-- 5. LEARNING RUNS (Audit Log)
-- One row per learning run — tracks what happened
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_runs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  run_type        TEXT NOT NULL, -- 'trainer', 'consolidation', 'dmn', 'bayesian', 'embedding', 'contrastive', 'policy', 'public_data'
  status          TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ DEFAULT NULL,
  duration_ms     INTEGER DEFAULT NULL,
  metrics         JSONB DEFAULT '{}'::jsonb,
  error_message   TEXT DEFAULT NULL,
  signals_processed INTEGER DEFAULT 0,
  edges_updated   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_runs_org_type
  ON learning_runs(organization_id, run_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_runs_status
  ON learning_runs(status) WHERE status = 'running';

-- ──────────────────────────────────────────────────────────
-- RLS POLICIES
-- ──────────────────────────────────────────────────────────
ALTER TABLE bayesian_posteriors ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_transforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE causal_model_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_policy_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_runs ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by laptop agents)
CREATE POLICY "service_role_bayesian" ON bayesian_posteriors
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_embedding" ON embedding_transforms
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_causal_model" ON causal_model_state
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_attention" ON attention_policy_state
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_learning_runs" ON learning_runs
  FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────
-- AUTO-UPDATE TIMESTAMPS
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_learning_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bayesian_posteriors_updated
  BEFORE UPDATE ON bayesian_posteriors
  FOR EACH ROW EXECUTE FUNCTION update_learning_updated_at();

CREATE TRIGGER trg_embedding_transforms_updated
  BEFORE UPDATE ON embedding_transforms
  FOR EACH ROW EXECUTE FUNCTION update_learning_updated_at();

CREATE TRIGGER trg_causal_model_state_updated
  BEFORE UPDATE ON causal_model_state
  FOR EACH ROW EXECUTE FUNCTION update_learning_updated_at();

CREATE TRIGGER trg_attention_policy_state_updated
  BEFORE UPDATE ON attention_policy_state
  FOR EACH ROW EXECUTE FUNCTION update_learning_updated_at();
