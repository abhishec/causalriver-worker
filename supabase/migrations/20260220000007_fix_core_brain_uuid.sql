-- ============================================================================
-- Fix CORE Brain UUID Mismatch
-- ============================================================================
-- CTO Audit Fix: The CORE Brain was seeded in migration 20260220000002 with
-- UUID '00000000-0000-0000-0000-000000000000', but the entire codebase
-- (98+ files, 16+ older migrations) uses '00000000-0000-4000-a000-000000000001'.
--
-- This caused a silent data black hole: federation queries looking for the
-- CORE brain at ...001 found nothing, because the org was seeded at ...000.
--
-- Fix: Delete the orphaned ...000 row (if it exists and has no FK dependents),
-- and ensure the canonical ...001 row exists.
-- ============================================================================

-- Step 1: Ensure the canonical CORE Brain org exists at the correct UUID.
-- The older migration 20250218000001_platform_tables.sql already seeds this,
-- but ON CONFLICT ensures idempotency.
INSERT INTO organizations (id, name, slug, created_at, updated_at)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'CORE Brain (Federated Collective Intelligence)',
  'core-brain',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name;

-- Step 2: Clean up the orphaned ...000 row if it exists and has no children.
-- We use a DO block to safely handle FK constraints — if any tables reference
-- the orphaned UUID, we skip deletion rather than cascading data loss.
DO $$
BEGIN
  -- Only delete if the orphaned row exists
  IF EXISTS (SELECT 1 FROM organizations WHERE id = '00000000-0000-0000-0000-000000000000') THEN
    BEGIN
      DELETE FROM organizations WHERE id = '00000000-0000-0000-0000-000000000000';
      RAISE NOTICE 'Deleted orphaned CORE Brain row (00000000-0000-0000-0000-000000000000)';
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE 'Cannot delete orphaned CORE Brain row — it has FK dependents. Manual cleanup needed.';
    END;
  END IF;
END $$;
