-- ============================================================================
-- Org Agent Support Tables
-- ============================================================================
-- Adds missing tables required by the org-creation-agent:
--   - federation_config (upstream knowledge sharing)
--   - scheduled_jobs (autonomous learning schedules)
--   - org_settings (org-level configuration)
-- ============================================================================

-- ── Federation Config (Core Brain → Org Brain knowledge sharing) ───────────
CREATE TABLE IF NOT EXISTS federation_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enabled               BOOLEAN DEFAULT true,
  upstream_org_id       UUID REFERENCES organizations(id) ON DELETE SET NULL,
  auto_pull_enabled     BOOLEAN DEFAULT true,
  auto_pull_interval_hours INTEGER DEFAULT 24,
  auto_promote_enabled  BOOLEAN DEFAULT true,
  auto_promote_threshold FLOAT DEFAULT 0.75,  -- Confidence threshold for auto-promotion
  last_pull_at          TIMESTAMPTZ,
  last_promote_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_federation_config_org ON federation_config (organization_id);
CREATE INDEX IF NOT EXISTS idx_federation_config_upstream ON federation_config (upstream_org_id);

-- ── Scheduled Jobs (for autonomous learning, consolidation, calibration) ───
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_name              TEXT NOT NULL,           -- e.g. 'autonomous-learning', 'consolidation', 'calibration-review'
  job_type              TEXT NOT NULL,           -- e.g. 'learning', 'consolidation', 'calibration'
  schedule              TEXT NOT NULL,           -- Cron expression (e.g. '0 */6 * * *' for every 6 hours)
  enabled               BOOLEAN DEFAULT true,
  last_run_at           TIMESTAMPTZ,
  next_run_at           TIMESTAMPTZ,
  run_count             INTEGER DEFAULT 0,
  error_count           INTEGER DEFAULT 0,
  last_error            TEXT,
  config                JSONB DEFAULT '{}',      -- Job-specific configuration
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, job_name)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_org ON scheduled_jobs (organization_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs (enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_type ON scheduled_jobs (job_type);

-- ── Org Settings (org-level brain configuration) ───────────────────────────
CREATE TABLE IF NOT EXISTS org_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Autonomous Learning Settings
  autonomous_learning_enabled     BOOLEAN DEFAULT true,
  autonomous_learning_interval_hours INTEGER DEFAULT 6,
  autonomous_learning_batch_size  INTEGER DEFAULT 1000,

  -- Continuous Learning Settings
  continuous_learning_enabled     BOOLEAN DEFAULT true,
  continuous_learning_batch_size  INTEGER DEFAULT 100,
  continuous_learning_decay_rate  FLOAT DEFAULT 0.95,

  -- Calibration Settings
  calibration_enabled             BOOLEAN DEFAULT true,
  calibration_review_interval_hours INTEGER DEFAULT 168,  -- Weekly (7 * 24)
  calibration_min_predictions     INTEGER DEFAULT 100,

  -- Consolidation Settings
  consolidation_enabled           BOOLEAN DEFAULT true,
  consolidation_interval_hours    INTEGER DEFAULT 168,    -- Weekly
  consolidation_prune_threshold   FLOAT DEFAULT 0.3,

  -- Brain Health Settings
  health_check_enabled            BOOLEAN DEFAULT true,
  health_check_interval_hours     INTEGER DEFAULT 24,
  min_brain_connectivity_pct      FLOAT DEFAULT 90.0,

  -- Growth Mechanisms
  growth_mechanisms_enabled       BOOLEAN DEFAULT true,

  -- Real-time Processing
  realtime_signal_processing      BOOLEAN DEFAULT true,
  realtime_batch_size             INTEGER DEFAULT 100,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_org_settings_org ON org_settings (organization_id);

-- ── Auto-update timestamps ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_federation_config_modtime ON federation_config;
CREATE TRIGGER update_federation_config_modtime
  BEFORE UPDATE ON federation_config
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_scheduled_jobs_modtime ON scheduled_jobs;
CREATE TRIGGER update_scheduled_jobs_modtime
  BEFORE UPDATE ON scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_org_settings_modtime ON org_settings;
CREATE TRIGGER update_org_settings_modtime
  BEFORE UPDATE ON org_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

-- ── Seed Core Brain federation, schedules, and settings ─────────────────────
-- Federation: Core Brain doesn't pull from upstream (it IS the upstream)
INSERT INTO federation_config (organization_id, enabled, upstream_org_id, auto_pull_enabled, auto_promote_enabled)
VALUES ('00000000-0000-4000-a000-000000000001', true, NULL, false, false)
ON CONFLICT (organization_id) DO NOTHING;

-- Scheduled Jobs for Core Brain
INSERT INTO scheduled_jobs (organization_id, job_name, job_type, schedule, enabled) VALUES
  ('00000000-0000-4000-a000-000000000001', 'autonomous-learning', 'learning', '0 */6 * * *', true),         -- Every 6 hours
  ('00000000-0000-4000-a000-000000000001', 'consolidation', 'consolidation', '0 2 * * 0', true),            -- Sunday 2 AM UTC
  ('00000000-0000-4000-a000-000000000001', 'calibration-review', 'calibration', '0 3 * * 1', true)          -- Monday 3 AM UTC
ON CONFLICT (organization_id, job_name) DO NOTHING;

-- Org Settings for Core Brain
INSERT INTO org_settings (organization_id) VALUES ('00000000-0000-4000-a000-000000000001')
ON CONFLICT (organization_id) DO NOTHING;
