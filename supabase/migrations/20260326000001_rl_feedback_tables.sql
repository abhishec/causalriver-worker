-- =============================================================================
-- Migration: RL Feedback Tables — Schema Fix
-- Date: 2026-03-26
-- Purpose:
--   1. Ensure copilot_response_feedback exists with correct schema
--   2. Add missing `status` column to brain_feedback_queue (was `processed boolean`)
--      so that /api/brain/rl-status can filter by status = 'pending'
--   3. Add missing indexes for performance
--   4. Ensure RLS policies exist
--
-- Both tables already exist in production but are missing columns/indexes.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. copilot_response_feedback — add missing columns if needed
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_response_feedback (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  message_id       TEXT        NOT NULL,
  conversation_id  TEXT,
  rating           TEXT        NOT NULL CHECK (rating IN ('helpful', 'not_helpful', 'incorrect')),
  correction       TEXT,
  command_id       TEXT,
  domain_id        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns defensively if table was created without them
ALTER TABLE copilot_response_feedback ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE copilot_response_feedback ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE copilot_response_feedback ADD COLUMN IF NOT EXISTS correction TEXT;
ALTER TABLE copilot_response_feedback ADD COLUMN IF NOT EXISTS command_id TEXT;
ALTER TABLE copilot_response_feedback ADD COLUMN IF NOT EXISTS domain_id TEXT;

-- Indexes for efficient rl-status queries
CREATE INDEX IF NOT EXISTS copilot_response_feedback_org_idx
  ON copilot_response_feedback (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS copilot_response_feedback_rating_idx
  ON copilot_response_feedback (organization_id, rating);

-- Enable RLS
ALTER TABLE copilot_response_feedback ENABLE ROW LEVEL SECURITY;

-- Members can read feedback for their org
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'copilot_response_feedback' AND policyname = 'org_members_read_feedback'
  ) THEN
    CREATE POLICY "org_members_read_feedback"
      ON copilot_response_feedback FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'copilot_response_feedback' AND policyname = 'org_members_insert_feedback'
  ) THEN
    CREATE POLICY "org_members_insert_feedback"
      ON copilot_response_feedback FOR INSERT
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'copilot_response_feedback' AND policyname = 'service_role_all_feedback'
  ) THEN
    CREATE POLICY "service_role_all_feedback"
      ON copilot_response_feedback FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. brain_feedback_queue — add status column (replaces processed boolean)
--    The table exists but uses `processed BOOLEAN` instead of `status TEXT`.
--    Add status column and backfill from processed for existing rows.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_feedback_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  message_id       TEXT,
  conversation_id  TEXT,
  rating           TEXT        NOT NULL CHECK (rating IN ('helpful', 'not_helpful', 'incorrect')),
  correction       TEXT,
  command_id       TEXT,
  domain_id        TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  error_message    TEXT,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add the status column if it doesn't exist yet
ALTER TABLE brain_feedback_queue ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Add the status check constraint if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_feedback_queue_status_check' AND conrelid = 'brain_feedback_queue'::regclass
  ) THEN
    ALTER TABLE brain_feedback_queue
      ADD CONSTRAINT brain_feedback_queue_status_check
      CHECK (status IN ('pending', 'processing', 'processed', 'failed'));
  END IF;
END $$;

-- Backfill: rows with processed=true should be status='processed'
UPDATE brain_feedback_queue
  SET status = 'processed'
  WHERE status = 'pending'
    AND processed IS NOT NULL
    AND processed = true;

-- Add other missing columns defensively
ALTER TABLE brain_feedback_queue ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE brain_feedback_queue ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE brain_feedback_queue ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE brain_feedback_queue ADD COLUMN IF NOT EXISTS command_id TEXT;
ALTER TABLE brain_feedback_queue ADD COLUMN IF NOT EXISTS domain_id TEXT;

-- Indexes for queue drain queries
CREATE INDEX IF NOT EXISTS brain_feedback_queue_pending_idx
  ON brain_feedback_queue (organization_id, status, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS brain_feedback_queue_org_created_idx
  ON brain_feedback_queue (organization_id, created_at DESC);

-- Enable RLS
ALTER TABLE brain_feedback_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brain_feedback_queue' AND policyname = 'org_members_read_queue'
  ) THEN
    CREATE POLICY "org_members_read_queue"
      ON brain_feedback_queue FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brain_feedback_queue' AND policyname = 'org_members_insert_queue'
  ) THEN
    CREATE POLICY "org_members_insert_queue"
      ON brain_feedback_queue FOR INSERT
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brain_feedback_queue' AND policyname = 'service_role_all_queue'
  ) THEN
    CREATE POLICY "service_role_all_queue"
      ON brain_feedback_queue FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
