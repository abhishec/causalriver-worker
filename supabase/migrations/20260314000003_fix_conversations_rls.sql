-- ============================================================================
-- Fix conversations RLS — replace recursive org_members policy
-- ============================================================================
-- The original `conversations_org_isolation` policy causes infinite recursion
-- because it queries org_members which itself has RLS referencing similar
-- structures. Since all conversation operations use the admin client (service
-- role key that bypasses RLS), this simpler user_id-based policy provides
-- defense-in-depth without recursion risk.
-- ============================================================================

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS conversations_org_isolation ON conversations;

-- Create simpler user-owns-row policy with WITH CHECK for INSERT safety
CREATE POLICY conversations_user_own ON conversations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
