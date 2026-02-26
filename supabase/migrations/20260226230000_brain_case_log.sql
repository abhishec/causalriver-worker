-- Brain Case Log Table
-- Replaces filesystem .claude/case-log.md and .claude/cc-retro.md
-- AWS Lambda has a read-only bundle directory — file writes are silently discarded.
-- All case log and retro entries are now persisted to this table instead.

CREATE TABLE IF NOT EXISTS brain_case_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,  -- NULL = global/system level
  entry_type TEXT NOT NULL DEFAULT 'case',  -- 'case' | 'retro'
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_case_log_org_type_created
  ON brain_case_log(organization_id, entry_type, created_at DESC);

-- Allow service role full access (no user-level RLS needed — this is internal)
ALTER TABLE brain_case_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON brain_case_log
  USING (true)
  WITH CHECK (true);
