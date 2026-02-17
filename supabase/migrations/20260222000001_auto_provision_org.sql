-- ============================================================================
-- Auto-Provision New Organizations
-- ============================================================================
-- When any org is created (signup trigger, seed script, API, admin panel),
-- this trigger automatically provisions:
--   1. storage_config (S3 bucket, region, prefix)
--   2. brain_cortex_state (cycle counter = 0, mode = awake_full)
--   3. org_settings (all defaults)
--   4. federation_config (linked to Core Brain as upstream)
--   5. scheduled_jobs (autonomous-learning, consolidation, calibration-review)
--
-- Also backfills existing orgs that are missing any of these records.
-- ============================================================================

-- ── Trigger Function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION provision_new_org()
RETURNS TRIGGER AS $$
DECLARE
  v_core_org_id UUID := '00000000-0000-4000-a000-000000000001';
BEGIN
  -- 1. Set default storage_config (S3 org-scoped prefix)
  UPDATE organizations
  SET storage_config = jsonb_build_object(
    's3', jsonb_build_object(
      'bucket', 'nexusbrain-org-data',
      'region', 'ap-southeast-1',
      'prefix', NEW.id::TEXT,
      'enabled', true
    )
  )
  WHERE id = NEW.id
    AND (storage_config IS NULL OR storage_config = '{}'::jsonb);

  -- 2. Brain cortex state (cycle counter persisted across restarts)
  INSERT INTO brain_cortex_state (organization_id, cycle_count, last_mode)
  VALUES (NEW.id, 0, 'awake_full')
  ON CONFLICT (organization_id) DO NOTHING;

  -- 3. Org settings (all column defaults apply: learning, calibration, etc.)
  INSERT INTO org_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;

  -- 4. Federation config (non-core orgs link to Core Brain as upstream)
  IF NEW.id != v_core_org_id THEN
    INSERT INTO federation_config (
      organization_id, enabled, upstream_org_id,
      auto_pull_enabled, auto_pull_interval_hours,
      auto_promote_enabled, auto_promote_threshold
    )
    VALUES (NEW.id, true, v_core_org_id, true, 24, true, 0.75)
    ON CONFLICT (organization_id) DO NOTHING;
  END IF;

  -- 5. Scheduled jobs (same 3 as Core Brain)
  INSERT INTO scheduled_jobs (organization_id, job_name, job_type, schedule, enabled)
  VALUES
    (NEW.id, 'autonomous-learning', 'learning',      '0 */6 * * *', true),
    (NEW.id, 'consolidation',       'consolidation',  '0 2 * * 0',  true),
    (NEW.id, 'calibration-review',  'calibration',    '0 3 * * 1',  true)
  ON CONFLICT (organization_id, job_name) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never block org creation — log warning and continue
  RAISE WARNING 'provision_new_org failed for org %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger (fires on every org INSERT) ──────────────────────────────────────

DROP TRIGGER IF EXISTS on_org_created_provision ON organizations;
CREATE TRIGGER on_org_created_provision
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION provision_new_org();


-- ============================================================================
-- Backfill existing orgs that are missing provisioned records
-- ============================================================================

-- Backfill: brain_cortex_state
INSERT INTO brain_cortex_state (organization_id, cycle_count, last_mode)
SELECT id, 0, 'awake_full'
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM brain_cortex_state)
ON CONFLICT (organization_id) DO NOTHING;

-- Backfill: org_settings
INSERT INTO org_settings (organization_id)
SELECT id
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM org_settings)
ON CONFLICT (organization_id) DO NOTHING;

-- Backfill: federation_config (non-core orgs → Core Brain upstream)
INSERT INTO federation_config (
  organization_id, enabled, upstream_org_id,
  auto_pull_enabled, auto_pull_interval_hours,
  auto_promote_enabled, auto_promote_threshold
)
SELECT
  id, true, '00000000-0000-4000-a000-000000000001',
  true, 24, true, 0.75
FROM organizations
WHERE id != '00000000-0000-4000-a000-000000000001'
  AND id NOT IN (SELECT organization_id FROM federation_config)
ON CONFLICT (organization_id) DO NOTHING;

-- Backfill: scheduled_jobs (3 per org)
INSERT INTO scheduled_jobs (organization_id, job_name, job_type, schedule, enabled)
SELECT o.id, j.job_name, j.job_type, j.schedule, true
FROM organizations o
CROSS JOIN (VALUES
  ('autonomous-learning', 'learning',      '0 */6 * * *'),
  ('consolidation',       'consolidation', '0 2 * * 0'),
  ('calibration-review',  'calibration',   '0 3 * * 1')
) AS j(job_name, job_type, schedule)
WHERE NOT EXISTS (
  SELECT 1 FROM scheduled_jobs sj
  WHERE sj.organization_id = o.id AND sj.job_name = j.job_name
)
ON CONFLICT (organization_id, job_name) DO NOTHING;

-- Backfill: storage_config for orgs that don't have it set
UPDATE organizations
SET storage_config = jsonb_build_object(
  's3', jsonb_build_object(
    'bucket', 'nexusbrain-org-data',
    'region', 'ap-southeast-1',
    'prefix', id::TEXT,
    'enabled', true
  )
)
WHERE storage_config IS NULL OR storage_config = '{}'::jsonb;
