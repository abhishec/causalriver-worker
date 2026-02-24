-- ============================================================================
-- Encryption Config Table — workaround for ALTER DATABASE permission on Supabase
-- ============================================================================
-- Supabase hosted migrations don't have superuser access needed for:
--   ALTER DATABASE postgres SET app.settings.credential_encryption_key = '...';
--
-- Instead, we store the encryption key in a secure config table accessible
-- only to service_role. The encryption functions are updated to read from
-- this table if the database setting is not available.
-- ============================================================================

-- ── 0. Ensure pgcrypto extension is enabled ─────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 1. Create secure config table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS _encryption_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only service_role can access this table
ALTER TABLE _encryption_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "_encryption_config_service_only" ON _encryption_config;
CREATE POLICY "_encryption_config_service_only"
  ON _encryption_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE _encryption_config IS
  'Secure config store for encryption keys. Only service_role can access. '
  'Workaround for Supabase hosted where ALTER DATABASE is restricted.';

-- ── 2. Insert the encryption key ───────────────────────────────────────
INSERT INTO _encryption_config (key, value)
VALUES ('credential_encryption_key', '2136af1140d235d462f453f98a16fca22cd814a569b6cc6350671677b6df18bf')
ON CONFLICT (key) DO NOTHING;

-- ── 3. Create helper function to get encryption key ────────────────────
CREATE OR REPLACE FUNCTION get_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
BEGIN
  -- Try database setting first (traditional approach)
  v_key := current_setting('app.settings.credential_encryption_key', true);
  IF v_key IS NOT NULL AND v_key != '' THEN
    RETURN v_key;
  END IF;

  -- Fallback to config table
  SELECT value INTO v_key
  FROM _encryption_config
  WHERE key = 'credential_encryption_key';

  RETURN v_key;
END;
$$;

-- ── 4. Update store_connector_credentials to use new helper ────────────
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

  -- Encrypt credentials using helper function
  v_enc_key := get_encryption_key();
  IF v_enc_key IS NOT NULL AND v_enc_key != '' THEN
    v_encrypted := extensions.pgp_sym_encrypt(p_credentials::text, v_enc_key);
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
    p_credentials,
    v_encrypted,
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

-- ── 5. Update get_connector_credentials to use new helper ──────────────
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

  SELECT credentials, credentials_encrypted
    INTO v_credentials, v_encrypted
  FROM org_connectors
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type
    AND status = 'active';

  IF v_encrypted IS NOT NULL THEN
    v_enc_key := get_encryption_key();
    IF v_enc_key IS NOT NULL AND v_enc_key != '' THEN
      RETURN extensions.pgp_sym_decrypt(v_encrypted, v_enc_key)::jsonb;
    END IF;
  END IF;

  RETURN v_credentials;
END;
$$;

-- ── 6. Update trigger to use new helper ────────────────────────────────
CREATE OR REPLACE FUNCTION encrypt_credentials_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_enc_key TEXT;
BEGIN
  IF NEW.credentials IS NOT NULL THEN
    v_enc_key := get_encryption_key();
    IF v_enc_key IS NOT NULL AND v_enc_key != '' THEN
      NEW.credentials_encrypted := extensions.pgp_sym_encrypt(NEW.credentials::text, v_enc_key);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 7. Encrypt existing plaintext credentials ──────────────────────────
DO $$
DECLARE
  v_enc_key TEXT;
  v_count INTEGER := 0;
BEGIN
  SELECT value INTO v_enc_key FROM _encryption_config WHERE key = 'credential_encryption_key';

  IF v_enc_key IS NULL OR v_enc_key = '' THEN
    RAISE NOTICE 'No encryption key found — skipping existing credential encryption';
    RETURN;
  END IF;

  -- Only encrypt if pgcrypto is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    UPDATE org_connectors
    SET credentials_encrypted = extensions.pgp_sym_encrypt(credentials::text, v_enc_key)
    WHERE credentials IS NOT NULL
      AND credentials_encrypted IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Encrypted % existing credential rows', v_count;
  ELSE
    RAISE NOTICE 'pgcrypto not available — skipping existing credential encryption';
  END IF;
END;
$$;
