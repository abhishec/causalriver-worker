-- ============================================================================
-- Brain Feedback Queue — UI → Brain Learning Bridge
-- ============================================================================
-- Phase 4 of Brain Evolution: "Feedback UI Integration"
--
-- Problem: The copilot feedback API (Next.js) and the brain runtime
--          (memory-stack) run in separate processes. When a user clicks
--          thumbs down, the feedback goes to copilot_response_feedback
--          and ai_memory, but the closed-loop learning engine (Loop 3)
--          never sees it — the brain can't process feedback it doesn't know about.
--
-- Solution: A queue table that bridges the gap. The UI writes to this table,
--           and Loop 3 drains it on each learning cycle.
--
-- Part of the "Feedback UI Integration" initiative.
-- ============================================================================

CREATE TABLE IF NOT EXISTS brain_feedback_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful', 'incorrect')),
  correction TEXT,
  domain TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient drain: unprocessed feedback for an org
CREATE INDEX IF NOT EXISTS idx_brain_feedback_queue_unprocessed
  ON brain_feedback_queue (organization_id, created_at ASC)
  WHERE processed = false;

-- Auto-cleanup: processed feedback older than 30 days
CREATE INDEX IF NOT EXISTS idx_brain_feedback_queue_cleanup
  ON brain_feedback_queue (created_at)
  WHERE processed = true;

-- RLS
ALTER TABLE brain_feedback_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_feedback_queue_service_role" ON brain_feedback_queue;
CREATE POLICY "brain_feedback_queue_service_role"
  ON brain_feedback_queue FOR ALL
  USING (auth.role() = 'service_role');

-- Allow authenticated users to INSERT (the feedback API runs with user auth)
DROP POLICY IF EXISTS "brain_feedback_queue_insert" ON brain_feedback_queue;
CREATE POLICY "brain_feedback_queue_insert"
  ON brain_feedback_queue FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );
