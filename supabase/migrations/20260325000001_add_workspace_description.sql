-- Add description column to organizations (workspaces)
-- Used in the post-login dashboard to show workspace purpose/context
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN organizations.description IS 'Human-readable description of the workspace purpose';
