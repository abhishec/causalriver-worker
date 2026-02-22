-- ============================================================================
-- Deprecate copilot_conversations — migrate remaining data to conversations
-- ============================================================================
-- The old `copilot_conversations` table (from 20250218) is superseded by
-- `conversations` (from 20260303). This migration:
--   1. Copies any orphaned rows into the new table
--   2. Drops old RLS policies
--   3. Marks the table as deprecated (but does NOT drop it for safety)
-- ============================================================================

-- Guard: only run if both tables exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'copilot_conversations')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations')
  THEN
    -- Migrate data that exists in old table but not in new
    INSERT INTO conversations (id, org_id, user_id, title, messages, created_at, updated_at)
    SELECT
      cc.id,
      cc.organization_id,
      cc.user_id,
      COALESCE(cc.title, 'New conversation'),
      COALESCE(cc.messages, '[]'::jsonb),
      cc.created_at,
      COALESCE(cc.updated_at, cc.created_at)
    FROM copilot_conversations cc
    WHERE cc.id NOT IN (SELECT id FROM conversations)
    ON CONFLICT (id) DO NOTHING;

    -- Drop old RLS policies (safe: IF EXISTS)
    DROP POLICY IF EXISTS "copilot_read_own" ON copilot_conversations;
    DROP POLICY IF EXISTS "copilot_insert_own" ON copilot_conversations;
    DROP POLICY IF EXISTS "copilot_update_own" ON copilot_conversations;
    DROP POLICY IF EXISTS "copilot_delete_own" ON copilot_conversations;
    -- Generic policy names that might exist
    DROP POLICY IF EXISTS "copilot_conversations_org_isolation" ON copilot_conversations;
    DROP POLICY IF EXISTS "Enable read for org members" ON copilot_conversations;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON copilot_conversations;
    DROP POLICY IF EXISTS "Enable update for own rows" ON copilot_conversations;

    -- Mark deprecated
    COMMENT ON TABLE copilot_conversations IS 'DEPRECATED — use conversations table. Data migrated via 20260314000002.';
  END IF;
END $$;
