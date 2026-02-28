-- Code audit complete: all routes verified to use get-credentials.ts helpers
-- To complete Phase 2 (null plaintext credentials), run manually in Supabase Dashboard:
-- SELECT finalize_credential_encryption(true);  -- dry run first
-- SELECT finalize_credential_encryption(false); -- execute if dry run looks good
-- 
-- DO NOT run this migration automatically. Manual DBA step required.
-- This file serves as a code audit checkpoint only.

-- Add a comment to the org_connectors table documenting the encryption status
COMMENT ON COLUMN org_connectors.credentials IS 'DEPRECATED: plaintext credentials — use credentials_encrypted instead. Run finalize_credential_encryption() to null this column after code audit.';
