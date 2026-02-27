-- ============================================================================
-- Phase 2 Completion: Nullify Plaintext Credentials
-- ============================================================================
-- Now that all callers use get_connector_credentials() RPC, we can safely
-- null out the plaintext credentials column.
--
-- Verification of caller migration status (as of 2026-03-28):
--   ✓ platform/app/api/connectors/github/sync/route.ts       — uses get-credentials helper
--   ✓ platform/app/api/connectors/slack/sync/route.ts        — uses get-credentials helper
--   ✓ platform/app/api/connectors/jira/sync/route.ts         — uses get-credentials helper
--   ✓ platform/app/api/connectors/jira/webhook/route.ts      — selects config only (no credentials read)
--   ✓ platform/app/api/connectors/freshworks/sync/route.ts   — uses get-credentials helper
--   ✓ platform/app/api/connectors/logs/sync/route.ts         — uses get-credentials helper
--   ✓ platform/app/api/connectors/linear/sync/route.ts       — uses get-credentials helper
--   ✓ platform/app/api/connectors/github/repos/route.ts      — uses get-credentials helper
--   ✓ platform/app/api/connectors/sync-all/route.ts          — delegates via HTTP (no direct cred read)
--   ✓ platform/app/api/copilot/chat/route.ts                 — uses getConnectorsWithCredentials
--   ✓ platform/lib/code-pipeline/pipeline.ts                 — uses getConnectorWithCredentials
-- ============================================================================

-- Only nullify rows where credentials_encrypted exists (safe to null plaintext)
UPDATE org_connectors
SET credentials = NULL
WHERE credentials_encrypted IS NOT NULL
  AND credentials IS NOT NULL;

-- Add comment documenting this is intentionally null
COMMENT ON COLUMN org_connectors.credentials IS
  'Deprecated: plaintext credentials. Nullified after Phase 2 encryption migration. '
  'Use get_connector_credentials() RPC to read decrypted credentials.';
