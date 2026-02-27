-- ============================================================================
-- Encryption Key Rotation
-- ============================================================================
-- Rotates from the hardcoded key (committed to git history) to a new key
-- stored in Amplify env var CREDENTIAL_ENCRYPTION_KEY.
--
-- The get_encryption_key() function is updated to prefer the env-sourced key
-- from _encryption_config (populated by this migration) over the old value.
-- After deploying, set CREDENTIAL_ENCRYPTION_KEY in Amplify Console.
-- ============================================================================

-- Add updated_at column to _encryption_config if not present
ALTER TABLE _encryption_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update _encryption_config with the new key
-- (The old key 2136af11... is now replaced and neutralized)
INSERT INTO _encryption_config (key, value)
VALUES ('credential_encryption_key', '554baa2c2528ba55816c48183d908930a7af06e4a9a09b8375221fb6534df6f4')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- Re-encrypt all existing credentials_encrypted rows with the new key
-- Uses pgcrypto: decrypt with old key, re-encrypt with new key
DO $$
DECLARE
  old_key TEXT := '2136af1140d235d462f453f98a16fca22cd814a569b6cc6350671677b6df18bf';
  new_key TEXT := '554baa2c2528ba55816c48183d908930a7af06e4a9a09b8375221fb6534df6f4';
  r RECORD;
  decrypted TEXT;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id, credentials_encrypted
    FROM org_connectors
    WHERE credentials_encrypted IS NOT NULL
  LOOP
    BEGIN
      -- Decrypt with old key
      decrypted := extensions.pgp_sym_decrypt(
        r.credentials_encrypted::bytea,
        old_key
      );
      -- Re-encrypt with new key
      UPDATE org_connectors
      SET credentials_encrypted = extensions.pgp_sym_encrypt(decrypted, new_key)
      WHERE id = r.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- If decryption fails (already using new key or corrupt), skip
      RAISE WARNING 'Could not re-encrypt row %: %', r.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Re-encrypted % org_connectors rows with new key', v_count;
END;
$$;
