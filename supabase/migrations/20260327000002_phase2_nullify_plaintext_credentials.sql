-- ============================================================================
-- Credential Encryption Phase 2: Nullify plaintext credentials
-- ============================================================================
-- Phase 1 (20260323000003) added credentials_encrypted + trigger.
-- Phase 2 nulls out the plaintext credentials column once all TypeScript
-- reads have been migrated to use get_connector_credentials() RPC.
--
-- ⚠️  DO NOT AUTO-RUN this migration until all these files are updated
--    to use lib/connectors/get-credentials.ts helpers:
--      - platform/app/api/connectors/github/sync/route.ts
--      - platform/app/api/connectors/slack/sync/route.ts
--      - platform/app/api/connectors/jira/sync/route.ts
--      - platform/app/api/connectors/jira/webhook/route.ts
--      - platform/app/api/connectors/freshworks/sync/route.ts
--      - platform/app/api/connectors/logs/sync/route.ts
--      - platform/app/api/connectors/linear/sync/route.ts
--      - platform/app/api/connectors/github/repos/route.ts
--      - platform/app/api/connectors/sync-all/route.ts
--      - platform/app/api/copilot/chat/route.ts
--      - platform/lib/code-pipeline/pipeline.ts
--
-- To run safely:
--   1. Verify all files above use get_connector_credentials() RPC
--   2. Call: SELECT finalize_credential_encryption(true);  -- dry run first
--   3. Call: SELECT finalize_credential_encryption(false); -- execute
--
-- The actual nullification SQL is in the function below, NOT auto-applied.
-- ============================================================================

-- Dry-run safe finalization procedure
CREATE OR REPLACE FUNCTION finalize_credential_encryption(p_dry_run BOOLEAN DEFAULT true)
RETURNS TABLE(
  connector_id        UUID,
  org_id              UUID,
  connector_type      TEXT,
  action              TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enc_key TEXT;
BEGIN
  -- Verify encryption key is configured before allowing nullification
  v_enc_key := current_setting('app.settings.credential_encryption_key', true);
  IF v_enc_key IS NULL OR v_enc_key = '' THEN
    RAISE EXCEPTION 'Cannot finalize: app.settings.credential_encryption_key is not set. '
      'Nullifying plaintext before encrypted version is accessible would lose credentials.';
  END IF;

  IF NOT p_dry_run THEN
    -- Null out plaintext only for rows that have an encrypted version
    RETURN QUERY
    UPDATE org_connectors
    SET
      credentials = NULL,
      updated_at  = now()
    WHERE credentials IS NOT NULL
      AND credentials_encrypted IS NOT NULL
    RETURNING
      id          AS connector_id,
      organization_id AS org_id,
      connector_type,
      'NULLED plaintext credentials'::TEXT AS action;
  ELSE
    -- Dry run: show what would be affected
    RETURN QUERY
    SELECT
      id          AS connector_id,
      organization_id AS org_id,
      connector_type,
      'WOULD NULL plaintext credentials'::TEXT AS action
    FROM org_connectors
    WHERE credentials IS NOT NULL
      AND credentials_encrypted IS NOT NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION finalize_credential_encryption(BOOLEAN) IS
  'Phase 2: Nullifies plaintext credentials column for rows that have been encrypted. '
  'Call with p_dry_run=true first to see affected rows, then p_dry_run=false to execute. '
  'ONLY run after all TypeScript credential reads use get_connector_credentials() RPC.';

GRANT EXECUTE ON FUNCTION finalize_credential_encryption(BOOLEAN) TO service_role;
