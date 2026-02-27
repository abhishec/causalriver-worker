-- =============================================================================
-- Fix: invitation_service_update RLS policy — scope to service_role only
-- =============================================================================
-- Root cause: 20250219000001_fix_trigger_and_invitations.sql created
-- "invitation_service_update" as FOR UPDATE USING (true) WITH CHECK (true)
-- WITHOUT a TO role restriction. Since Supabase grants authenticated users
-- table-level access to all public schema tables by default, this policy
-- allows ANY authenticated user to UPDATE ANY org_invitations row — including
-- rows belonging to orgs they don't belong to.
--
-- Impact: Any authenticated user can:
--   - Mark any pending invitation as "accepted", "expired", or "rejected"
--   - Hijack invitations to other orgs (accept them on behalf of any user)
--   - Invalidate invitations sent to other users
--
-- Fix: Drop the unscoped policy and recreate it scoped to service_role only.
-- Authenticated user updates are handled via the existing
-- "invitation_update_by_admin" policy (org-membership-scoped).
-- =============================================================================

DROP POLICY IF EXISTS "invitation_service_update" ON public.org_invitations;

CREATE POLICY "invitation_service_update" ON public.org_invitations
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also fix learning_state_tables unscoped policies (bayesian_posteriors,
-- embedding_transforms, causal_model_state, attention_policy_state, learning_runs)
-- These tables have no explicit authenticated GRANTs so the risk is lower,
-- but best practice is to scope all service-role-only policies explicitly.
-- Note: These are internal ML model state tables — never written by user clients.

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_bayesian" ON bayesian_posteriors;
  CREATE POLICY "service_role_bayesian" ON bayesian_posteriors
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_embedding" ON embedding_transforms;
  CREATE POLICY "service_role_embedding" ON embedding_transforms
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_causal_model" ON causal_model_state;
  CREATE POLICY "service_role_causal_model" ON causal_model_state
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_attention" ON attention_policy_state;
  CREATE POLICY "service_role_attention" ON attention_policy_state
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_learning_runs" ON learning_runs;
  CREATE POLICY "service_role_learning_runs" ON learning_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;
