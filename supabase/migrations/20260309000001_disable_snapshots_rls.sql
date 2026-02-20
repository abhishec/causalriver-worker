-- =============================================================================
-- Fix v3: Disable RLS on brain_daily_snapshots entirely
-- =============================================================================
-- This table contains non-sensitive, aggregate brain health stats used by the
-- public website (usebrainos.com). It has no PII, no secrets, no user data.
-- The RLS policies were causing infinite recursion via org_members dependency.
-- Since this is public dashboard data, RLS adds no value — disable it.
-- Write access is still controlled via service role key (only nightly pipeline).
-- =============================================================================

ALTER TABLE brain_daily_snapshots DISABLE ROW LEVEL SECURITY;
