-- ============================================================================
-- Suggestion Feedback Table
--
-- Tracks user interactions with smart suggestions (accept, dismiss, helpful,
-- not_relevant) to close the RL loop for the suggestion engine.
-- ============================================================================

CREATE TABLE IF NOT EXISTS suggestion_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  suggestion_type TEXT NOT NULL,
  suggestion_data JSONB,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('accepted', 'dismissed', 'helpful', 'not_relevant')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cooldown queries (recent feedback per org + type)
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_org_type
  ON suggestion_feedback(organization_id, suggestion_type, created_at DESC);

-- Index for user-specific feedback
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_user
  ON suggestion_feedback(user_id, created_at DESC);

-- RLS
ALTER TABLE suggestion_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_feedback" ON suggestion_feedback FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "service_role_all_feedback" ON suggestion_feedback FOR ALL
  USING (auth.role() = 'service_role');
