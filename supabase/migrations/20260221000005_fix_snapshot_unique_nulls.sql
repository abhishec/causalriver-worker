-- =============================================================================
-- FIX: Replace UNIQUE constraints with NULL-safe unique indexes
-- =============================================================================
-- Postgres treats NULL != NULL in UNIQUE constraints, so upserts with
-- onConflict fail when team_id/repo_id are NULL. We replace the plain UNIQUE
-- constraints with partial unique indexes using COALESCE to handle NULLs.
-- =============================================================================

-- velocity_snapshots: drop old constraint, add NULL-safe unique index
ALTER TABLE public.velocity_snapshots
  DROP CONSTRAINT IF EXISTS velocity_snapshots_organization_id_snapshot_date_window_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_velocity_snapshots_org_date_window_team_repo
  ON public.velocity_snapshots (
    organization_id,
    snapshot_date,
    COALESCE(window_type, '__null__'),
    COALESCE(team_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(repo_id, '00000000-0000-0000-0000-000000000000')
  );

-- bottleneck_snapshots: drop old constraint, add NULL-safe unique index
ALTER TABLE public.bottleneck_snapshots
  DROP CONSTRAINT IF EXISTS bottleneck_snapshots_organization_id_snapshot_date_team_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bottleneck_snapshots_org_date_team
  ON public.bottleneck_snapshots (
    organization_id,
    snapshot_date,
    COALESCE(team_id, '00000000-0000-0000-0000-000000000000')
  );
