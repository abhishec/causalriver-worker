-- ═══════════════════════════════════════════════════════════════════════════
-- Scheduled Job Counters — Atomic Counter Increment RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem: Agent framework needs to increment run_count and error_count in
-- scheduled_jobs atomically. Simple UPDATE with read-modify-write has race
-- conditions when multiple agents run concurrently.
--
-- Solution: This RPC uses SQL SET column = column + 1 for atomic increment.
--
-- Called by: scripts/agent-framework/brain-native-agent-v5-manus.ts
--   ManusNativeAgent.run() → after successful agent execution
--
-- Migration: 20260218000003
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_scheduled_job_counters(
  p_organization_id UUID,
  p_job_name TEXT,
  p_increment_errors BOOLEAN DEFAULT false
) RETURNS VOID AS $$
BEGIN
  UPDATE scheduled_jobs
  SET
    run_count = run_count + 1,
    error_count = CASE WHEN p_increment_errors THEN error_count + 1 ELSE error_count END,
    last_run_at = NOW(),
    updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND job_name = p_job_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role (used by agent framework via Supabase client)
GRANT EXECUTE ON FUNCTION increment_scheduled_job_counters(UUID, TEXT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION increment_scheduled_job_counters IS
  'Atomically increments run_count (and optionally error_count) for a scheduled job. '
  'Called by ManusNativeAgent.run() after each agent execution.';
