-- Scale hardening: DB-level deduplication for cross_domain_signals
-- Prevents the same Jira ticket or Confluence page from being re-ingested between syncs.
--
-- Strategy: create a PARTIAL unique index scoped to jira_issue and confluence_page only.
-- These are the two entity types that the incremental sync writes today.
-- Pre-existing rows in other entity_type buckets (metric, github_repo, etc.) are untouched.

CREATE UNIQUE INDEX IF NOT EXISTS cross_domain_signals_jira_confluence_unique
  ON cross_domain_signals (organization_id, entity_type, entity_id)
  WHERE entity_type IN ('jira_issue', 'confluence_page');
