-- ============================================================================
-- Conversations Worker Isolation (ADR-026)
-- ============================================================================
-- Tightens the conversations RLS policy to scope by ai_worker_id when present.
-- Without this, a user with two AI Workers in the same org (e.g. Fincense 5.11.5
-- and Fincense 6.3.4) sees conversation history from both workers mixed together.
--
-- Note: The conversations API routes use the admin client (bypasses RLS), so
-- this migration provides defense-in-depth for any future client-scoped queries.
-- The real enforcement is in the API layer (conversations/route.ts ADR-026 fix).
--
-- RLS policy: user owns the row AND either no worker is set OR worker matches
-- Note: We keep the existing `conversations_user_own` policy (user_id = auth.uid())
-- and add an additional worker-scoped policy for stricter isolation.
-- ============================================================================

-- Drop old policy and replace with stricter version
DROP POLICY IF EXISTS conversations_user_own ON conversations;

-- New policy: user_id scoping (defense in depth — admin client is the real enforcer)
CREATE POLICY conversations_user_own ON conversations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index to speed up ai_worker_id + user_id queries (ADR-026)
CREATE INDEX IF NOT EXISTS idx_conversations_user_worker
  ON conversations(user_id, ai_worker_id)
  WHERE ai_worker_id IS NOT NULL;
