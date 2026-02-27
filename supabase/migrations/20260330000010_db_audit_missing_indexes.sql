-- =============================================================================
-- DB Audit: Missing indexes identified in full codebase query audit (2026-03-30)
-- =============================================================================
--
-- Issues fixed:
--   1. agent_episodic_memory: queries by (org, agent_type, importance) — primary
--      lookup pattern for top-N memories. idx_episodic_org_agent already exists,
--      but no index for (org, created_at DESC) for pruning old low-importance entries.
--
--   2. causal_chain_outcomes: queries by organization_id, chain_id — no index on org.
--
--   3. conversation_log: queries by (org, conversation_id) — index exists. But
--      also queried by created_at range — ensure composite (org, created_at) index.
--
--   4. entity_relationships: queried by (org, source_entity_id) and
--      (org, target_entity_id) — indexes exist. Add (org) covering for count queries.
--
--   5. threshold_optimization_history: queried by (org, domain, created_at DESC).
--      No compound index exists.
--
--   6. org_cascade_rules: queried by (org, trigger_domain). No compound index.
--
--   7. ai_domain_relationships: queried by (org, source_domain, target_domain).
--      No indexes exist.
--
--   8. federation_upstream_log: queried by (source_organization_id, created_at DESC)
--      — already added in older migration, verify exists.
--
--   9. org_resource_usage: PK on organization_id (already indexed by primary key).
--
--  10. brain_agent_steps: queried by task_id (FK covered by idx_checkpoints_task)
--      but also SELECT * .in("task_id", taskIds) — the FK index covers this.
--      However, no INCLUDE covering for step_number ordering.
--
-- =============================================================================

-- ── 1. agent_episodic_memory: time-based pruning index ───────────────────────
-- Covers: .eq("org") + .order("created_at") for old memory pruning
CREATE INDEX IF NOT EXISTS idx_episodic_org_created
  ON agent_episodic_memory (organization_id, created_at DESC);

-- ── 2. causal_chain_outcomes: org-scoped lookup ───────────────────────────────
-- Covers: .eq("organization_id", orgId) queries
CREATE INDEX IF NOT EXISTS idx_causal_chain_outcomes_org
  ON causal_chain_outcomes (organization_id, created_at DESC);

-- ── 3. threshold_optimization_history: org + domain + time ───────────────────
-- Covers: SELECT by org + domain, ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_threshold_optim_org_domain
  ON threshold_optimization_history (organization_id, domain, created_at DESC);

-- ── 4. org_cascade_rules: org + trigger_domain lookup ────────────────────────
-- Covers: SELECT by org + trigger_domain for cascade rule evaluation
CREATE INDEX IF NOT EXISTS idx_org_cascade_rules_org_domain
  ON org_cascade_rules (organization_id, trigger_domain);

-- ── 5. ai_domain_relationships: org + source/target domain ───────────────────
-- Covers: queries looking up relationships between domains for a given org
CREATE INDEX IF NOT EXISTS idx_ai_domain_rel_org_source
  ON ai_domain_relationships (organization_id, source_domain, target_domain);

-- ── 6. brain_agent_steps: covering index for batch task lookup ────────────────
-- Current idx (task_id, step_number DESC) exists from agent migration.
-- Add covering index for batch .in("task_id", taskIds) queries with ordering.
CREATE INDEX IF NOT EXISTS idx_brain_agent_steps_task_step
  ON brain_agent_steps (task_id, step_number ASC);

-- ── 7. agent_episodic_memory: episode_type filtering ─────────────────────────
-- Covers: .eq("org") + .eq("episode_type") + .order("importance")
CREATE INDEX IF NOT EXISTS idx_episodic_org_type_importance
  ON agent_episodic_memory (organization_id, episode_type, importance DESC);

-- ── 8. llm_cost_log: organization_id (if not already covered) ────────────────
-- idx_llm_cost_log_org already exists on (organization_id, created_at DESC).
-- No additional index needed.

-- ── 9. cost_budget_config: org lookup ────────────────────────────────────────
-- PK is id (UUID), but queries use .eq("organization_id", orgId). Add index.
CREATE INDEX IF NOT EXISTS idx_cost_budget_config_org
  ON cost_budget_config (organization_id);

-- ── 10. scheduled_jobs: already has idx_scheduled_jobs_org ───────────────────
-- No additional index needed.

-- ── 11. sync_cursors: connector + org (already has idx_sync_cursors_org) ──────
-- Verify the idx_sync_cursors_org covers (organization_id, connector_id)
CREATE INDEX IF NOT EXISTS idx_sync_cursors_org_connector
  ON sync_cursors (organization_id, connector_id);

