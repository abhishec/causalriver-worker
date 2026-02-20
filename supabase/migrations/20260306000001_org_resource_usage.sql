-- ============================================================================
-- Org Resource Usage + Scoped API Key Permissions (Week 7)
-- ============================================================================
--
-- Tracks per-org resource consumption for multi-tenancy enforcement.
-- Also extends api_keys with scoped permissions and connection limits.
-- ============================================================================

-- Extend api_keys with scoped permissions and connection limits
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS max_concurrent_connections INTEGER DEFAULT 5;

-- Per-org resource tracking
CREATE TABLE IF NOT EXISTS org_resource_usage (
  organization_id UUID PRIMARY KEY,
  active_mcp_connections INTEGER DEFAULT 0,
  active_agent_tasks INTEGER DEFAULT 0,
  daily_tool_calls INTEGER DEFAULT 0,
  daily_tool_calls_reset_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_usage_updated
  ON org_resource_usage(updated_at);

COMMENT ON TABLE org_resource_usage IS 'Per-org resource consumption counters for multi-tenancy limits. Counters are updated via application logic, not triggers.';
COMMENT ON COLUMN org_resource_usage.active_mcp_connections IS 'Current number of open MCP SSE connections for this org.';
COMMENT ON COLUMN org_resource_usage.active_agent_tasks IS 'Current number of running brain_agent_tasks for this org.';
COMMENT ON COLUMN org_resource_usage.daily_tool_calls IS 'Tool calls made today. Reset daily via daily_tool_calls_reset_at check.';
