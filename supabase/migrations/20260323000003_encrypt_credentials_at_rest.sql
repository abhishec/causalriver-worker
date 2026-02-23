-- ============================================================================
-- Encrypt Connector Credentials at Rest (Phase 1: Infrastructure)
-- ============================================================================
-- HIGH SEVERITY: OAuth tokens (GitHub PAT, Jira OAuth, Slack bot token) are
-- stored as plaintext JSONB in org_connectors.credentials. pgcrypto was
-- enabled but never actually used for encryption.
--
-- Strategy: Dual-column approach for zero-downtime migration
--   1. Add credentials_encrypted BYTEA column (pgp_sym_encrypt output)
--   2. Update store_connector_credentials() to encrypt on write
--   3. Update get_connector_credentials() to decrypt on read
--   4. Keep plaintext credentials column for backward compat during migration
--   5. Encrypt all existing credentials in-place
--
-- The encryption key is stored as a database setting:
--   ALTER DATABASE postgres SET app.settings.credential_encryption_key = '<key>';
-- This must be set BEFORE running this migration.
--
-- Phase 2 (future): Migrate all direct .select("credentials") reads in
-- TypeScript to use get_connector_credentials() RPC, then NULL out plaintext.
-- ============================================================================

-- ── 1. Add encrypted column ──────────────────────────────────────────────

ALTER TABLE org_connectors
  ADD COLUMN IF NOT EXISTS credentials_encrypted BYTEA;

COMMENT ON COLUMN org_connectors.credentials_encrypted IS
  'AES-encrypted OAuth tokens via pgp_sym_encrypt. Decrypt via get_connector_credentials(). '
  'During migration, both credentials (plaintext) and credentials_encrypted exist. '
  'Phase 2 will NULL out plaintext column once all reads use the function.';

-- ── 2. Update store function: encrypt on write ──────────────────────────

CREATE OR REPLACE FUNCTION store_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT,
  p_credentials JSONB,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_connector_id UUID;
  v_is_member BOOLEAN;
  v_enc_key TEXT;
  v_encrypted BYTEA;
BEGIN
  -- Verify caller is a member of the organization (skip for service_role)
  IF current_setting('role', true) != 'service_role' THEN
    SELECT EXISTS(
      SELECT 1 FROM org_members
      WHERE organization_id = p_organization_id
        AND user_id = auth.uid()
    ) INTO v_is_member;

    IF NOT v_is_member THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  -- Encrypt credentials if key is configured
  v_enc_key := current_setting('app.settings.credential_encryption_key', true);
  IF v_enc_key IS NOT NULL AND v_enc_key != '' THEN
    v_encrypted := pgp_sym_encrypt(p_credentials::text, v_enc_key);
  END IF;

  INSERT INTO org_connectors (
    organization_id,
    connector_type,
    credentials,
    credentials_encrypted,
    metadata,
    status,
    created_at,
    updated_at
  )
  VALUES (
    p_organization_id,
    p_connector_type,
    p_credentials,          -- Keep plaintext for backward compat (Phase 1)
    v_encrypted,            -- Also store encrypted
    p_metadata,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (organization_id, connector_type)
  DO UPDATE SET
    credentials = p_credentials,
    credentials_encrypted = v_encrypted,
    metadata = p_metadata,
    status = 'active',
    error_message = NULL,
    updated_at = NOW()
  RETURNING id INTO v_connector_id;

  RETURN v_connector_id;
END;
$$;

-- ── 3. Update get function: prefer encrypted, fallback to plaintext ─────

CREATE OR REPLACE FUNCTION get_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credentials JSONB;
  v_encrypted BYTEA;
  v_is_member BOOLEAN;
  v_enc_key TEXT;
BEGIN
  -- Verify caller is a member of the organization (skip for service_role)
  IF current_setting('role', true) != 'service_role' THEN
    SELECT EXISTS(
      SELECT 1 FROM org_members
      WHERE organization_id = p_organization_id
        AND user_id = auth.uid()
    ) INTO v_is_member;

    IF NOT v_is_member THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  -- Read both columns
  SELECT credentials, credentials_encrypted
    INTO v_credentials, v_encrypted
  FROM org_connectors
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type
    AND status = 'active';

  -- Prefer encrypted if available
  IF v_encrypted IS NOT NULL THEN
    v_enc_key := current_setting('app.settings.credential_encryption_key', true);
    IF v_enc_key IS NOT NULL AND v_enc_key != '' THEN
      RETURN pgp_sym_decrypt(v_encrypted, v_enc_key)::jsonb;
    END IF;
  END IF;

  -- Fallback to plaintext (pre-migration rows or if key not configured)
  RETURN v_credentials;
END;
$$;

-- ── 4. Update revoke function (unchanged logic, just ensure consistency) ─

CREATE OR REPLACE FUNCTION revoke_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_member BOOLEAN;
BEGIN
  -- Verify caller is a member of the organization (skip for service_role)
  IF current_setting('role', true) != 'service_role' THEN
    SELECT EXISTS(
      SELECT 1 FROM org_members
      WHERE organization_id = p_organization_id
        AND user_id = auth.uid()
    ) INTO v_is_member;

    IF NOT v_is_member THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  UPDATE org_connectors
  SET
    status = 'disabled',
    credentials = NULL,
    credentials_encrypted = NULL,
    updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type;

  RETURN FOUND;
END;
$$;

-- ── 5. Encrypt existing plaintext credentials ───────────────────────────

-- Only run if encryption key is configured
DO $$
DECLARE
  v_enc_key TEXT;
  v_count INTEGER := 0;
BEGIN
  v_enc_key := current_setting('app.settings.credential_encryption_key', true);

  IF v_enc_key IS NULL OR v_enc_key = '' THEN
    RAISE NOTICE 'Skipping credential encryption: app.settings.credential_encryption_key not set. Set it with: ALTER DATABASE postgres SET app.settings.credential_encryption_key = ''<your-key>'';';
    RETURN;
  END IF;

  UPDATE org_connectors
  SET credentials_encrypted = pgp_sym_encrypt(credentials::text, v_enc_key)
  WHERE credentials IS NOT NULL
    AND credentials_encrypted IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Encrypted % existing credential rows', v_count;
END;
$$;

-- ── 6. Create trigger for direct inserts/updates (bypass function) ──────
-- Covers cases where TypeScript writes directly via .upsert() instead of
-- using the store_connector_credentials() function.

CREATE OR REPLACE FUNCTION encrypt_credentials_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_enc_key TEXT;
BEGIN
  IF NEW.credentials IS NOT NULL THEN
    v_enc_key := current_setting('app.settings.credential_encryption_key', true);
    IF v_enc_key IS NOT NULL AND v_enc_key != '' THEN
      NEW.credentials_encrypted := pgp_sym_encrypt(NEW.credentials::text, v_enc_key);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypt_creds_on_write ON org_connectors;
CREATE TRIGGER encrypt_creds_on_write
  BEFORE INSERT OR UPDATE OF credentials ON org_connectors
  FOR EACH ROW
  EXECUTE FUNCTION encrypt_credentials_trigger();

-- ── Comments ────────────────────────────────────────────────────────────

COMMENT ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB) IS
  'Stores OAuth credentials with pgcrypto encryption. Dual-writes to both credentials (plaintext) and credentials_encrypted (AES). Phase 2 will remove plaintext.';

COMMENT ON FUNCTION get_connector_credentials(UUID, TEXT) IS
  'Retrieves credentials, preferring encrypted column with auto-decrypt. Falls back to plaintext for pre-migration compatibility.';

COMMENT ON FUNCTION encrypt_credentials_trigger() IS
  'Trigger that auto-encrypts any direct writes to the credentials column, ensuring credentials_encrypted is always populated.';
