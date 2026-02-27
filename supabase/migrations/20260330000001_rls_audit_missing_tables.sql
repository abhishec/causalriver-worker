-- =============================================================================
-- RLS Completeness Audit — Enable RLS on 24 tables missing row-level security
-- =============================================================================
--
-- Identified by full-codebase audit (2026-03-30).
-- All DDL is wrapped in DO/IF EXISTS blocks so the migration is a no-op when
-- a table doesn't exist in a given environment.
--
-- ── Category A: Org-scoped tables (have organization_id) ──────────────────
--   18 tables: agent_episodic_memory, ai_domain_relationships,
--   causal_chain_outcomes, conversation_log, cost_budget_config,
--   entity_relationships, federation_approval_log, federation_config,
--   federation_pending, federation_upstream_log, llm_cost_log,
--   org_cascade_rules, org_resource_usage, org_settings,
--   organization_federation_settings, scheduled_jobs, sync_cursors,
--   threshold_optimization_history
--
-- ── Category B: System/platform tables (no org scope — service_role only) ─
--   5 tables: aws_cost_snapshots, daily_cost_summary, nexus_system_config,
--   obs_retention_policies, platform_cascade_rules
--
-- ── Category C: Task-scoped via FK (agent_checkpoints → brain_agent_tasks) ─
--   1 table: agent_checkpoints
--
-- =============================================================================

-- ── agent_episodic_memory ──────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_episodic_memory') THEN
    ALTER TABLE public.agent_episodic_memory ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "agent_episodic_memory_service" ON public.agent_episodic_memory;
    CREATE POLICY "agent_episodic_memory_service" ON public.agent_episodic_memory
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "agent_episodic_memory_org_select" ON public.agent_episodic_memory;
    CREATE POLICY "agent_episodic_memory_org_select" ON public.agent_episodic_memory
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── ai_domain_relationships ───────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_domain_relationships') THEN
    ALTER TABLE public.ai_domain_relationships ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "ai_domain_relationships_service" ON public.ai_domain_relationships;
    CREATE POLICY "ai_domain_relationships_service" ON public.ai_domain_relationships
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "ai_domain_relationships_org_select" ON public.ai_domain_relationships;
    CREATE POLICY "ai_domain_relationships_org_select" ON public.ai_domain_relationships
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── causal_chain_outcomes ─────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'causal_chain_outcomes') THEN
    ALTER TABLE public.causal_chain_outcomes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "causal_chain_outcomes_service" ON public.causal_chain_outcomes;
    CREATE POLICY "causal_chain_outcomes_service" ON public.causal_chain_outcomes
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "causal_chain_outcomes_org_select" ON public.causal_chain_outcomes;
    CREATE POLICY "causal_chain_outcomes_org_select" ON public.causal_chain_outcomes
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── conversation_log ──────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversation_log') THEN
    ALTER TABLE public.conversation_log ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "conversation_log_service" ON public.conversation_log;
    CREATE POLICY "conversation_log_service" ON public.conversation_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "conversation_log_org_select" ON public.conversation_log;
    CREATE POLICY "conversation_log_org_select" ON public.conversation_log
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── cost_budget_config ────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cost_budget_config') THEN
    ALTER TABLE public.cost_budget_config ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "cost_budget_config_service" ON public.cost_budget_config;
    CREATE POLICY "cost_budget_config_service" ON public.cost_budget_config
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "cost_budget_config_org_select" ON public.cost_budget_config;
    CREATE POLICY "cost_budget_config_org_select" ON public.cost_budget_config
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── entity_relationships ──────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'entity_relationships') THEN
    ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "entity_relationships_service" ON public.entity_relationships;
    CREATE POLICY "entity_relationships_service" ON public.entity_relationships
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "entity_relationships_org_select" ON public.entity_relationships;
    CREATE POLICY "entity_relationships_org_select" ON public.entity_relationships
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── federation_approval_log ───────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'federation_approval_log') THEN
    ALTER TABLE public.federation_approval_log ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "federation_approval_log_service" ON public.federation_approval_log;
    CREATE POLICY "federation_approval_log_service" ON public.federation_approval_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "federation_approval_log_org_select" ON public.federation_approval_log;
    CREATE POLICY "federation_approval_log_org_select" ON public.federation_approval_log
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── federation_config ─────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'federation_config') THEN
    ALTER TABLE public.federation_config ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "federation_config_service" ON public.federation_config;
    CREATE POLICY "federation_config_service" ON public.federation_config
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "federation_config_org_select" ON public.federation_config;
    CREATE POLICY "federation_config_org_select" ON public.federation_config
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── federation_pending ────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'federation_pending') THEN
    ALTER TABLE public.federation_pending ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "federation_pending_service" ON public.federation_pending;
    CREATE POLICY "federation_pending_service" ON public.federation_pending
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "federation_pending_org_select" ON public.federation_pending;
    CREATE POLICY "federation_pending_org_select" ON public.federation_pending
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── federation_upstream_log ───────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'federation_upstream_log') THEN
    ALTER TABLE public.federation_upstream_log ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "federation_upstream_log_service" ON public.federation_upstream_log;
    CREATE POLICY "federation_upstream_log_service" ON public.federation_upstream_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "federation_upstream_log_org_select" ON public.federation_upstream_log;
    CREATE POLICY "federation_upstream_log_org_select" ON public.federation_upstream_log
      FOR SELECT TO authenticated
      USING (source_organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── llm_cost_log ──────────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'llm_cost_log') THEN
    ALTER TABLE public.llm_cost_log ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "llm_cost_log_service" ON public.llm_cost_log;
    CREATE POLICY "llm_cost_log_service" ON public.llm_cost_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "llm_cost_log_org_select" ON public.llm_cost_log;
    CREATE POLICY "llm_cost_log_org_select" ON public.llm_cost_log
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── org_cascade_rules ─────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'org_cascade_rules') THEN
    ALTER TABLE public.org_cascade_rules ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "org_cascade_rules_service" ON public.org_cascade_rules;
    CREATE POLICY "org_cascade_rules_service" ON public.org_cascade_rules
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "org_cascade_rules_org_select" ON public.org_cascade_rules;
    CREATE POLICY "org_cascade_rules_org_select" ON public.org_cascade_rules
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── org_resource_usage ────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'org_resource_usage') THEN
    ALTER TABLE public.org_resource_usage ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "org_resource_usage_service" ON public.org_resource_usage;
    CREATE POLICY "org_resource_usage_service" ON public.org_resource_usage
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "org_resource_usage_org_select" ON public.org_resource_usage;
    CREATE POLICY "org_resource_usage_org_select" ON public.org_resource_usage
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── org_settings ──────────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'org_settings') THEN
    ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "org_settings_service" ON public.org_settings;
    CREATE POLICY "org_settings_service" ON public.org_settings
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "org_settings_org_select" ON public.org_settings;
    CREATE POLICY "org_settings_org_select" ON public.org_settings
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── organization_federation_settings ─────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_federation_settings') THEN
    ALTER TABLE public.organization_federation_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "org_fed_settings_service" ON public.organization_federation_settings;
    CREATE POLICY "org_fed_settings_service" ON public.organization_federation_settings
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "org_fed_settings_org_select" ON public.organization_federation_settings;
    CREATE POLICY "org_fed_settings_org_select" ON public.organization_federation_settings
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── scheduled_jobs ────────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'scheduled_jobs') THEN
    ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "scheduled_jobs_service" ON public.scheduled_jobs;
    CREATE POLICY "scheduled_jobs_service" ON public.scheduled_jobs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "scheduled_jobs_org_select" ON public.scheduled_jobs;
    CREATE POLICY "scheduled_jobs_org_select" ON public.scheduled_jobs
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── sync_cursors ──────────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sync_cursors') THEN
    ALTER TABLE public.sync_cursors ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "sync_cursors_service" ON public.sync_cursors;
    CREATE POLICY "sync_cursors_service" ON public.sync_cursors
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "sync_cursors_org_select" ON public.sync_cursors;
    CREATE POLICY "sync_cursors_org_select" ON public.sync_cursors
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- ── threshold_optimization_history ───────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'threshold_optimization_history') THEN
    ALTER TABLE public.threshold_optimization_history ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "threshold_optim_service" ON public.threshold_optimization_history;
    CREATE POLICY "threshold_optim_service" ON public.threshold_optimization_history
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "threshold_optim_org_select" ON public.threshold_optimization_history;
    CREATE POLICY "threshold_optim_org_select" ON public.threshold_optimization_history
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
      ));
  END IF;
END $fix$;

-- =============================================================================
-- Category B: System/platform tables (no org scope — service_role only)
-- =============================================================================

-- ── aws_cost_snapshots ────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'aws_cost_snapshots') THEN
    ALTER TABLE public.aws_cost_snapshots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "aws_cost_snapshots_service" ON public.aws_cost_snapshots;
    CREATE POLICY "aws_cost_snapshots_service" ON public.aws_cost_snapshots
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- ── daily_cost_summary ────────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_cost_summary') THEN
    ALTER TABLE public.daily_cost_summary ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "daily_cost_summary_service" ON public.daily_cost_summary;
    CREATE POLICY "daily_cost_summary_service" ON public.daily_cost_summary
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- ── nexus_system_config ───────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'nexus_system_config') THEN
    ALTER TABLE public.nexus_system_config ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "nexus_system_config_service" ON public.nexus_system_config;
    CREATE POLICY "nexus_system_config_service" ON public.nexus_system_config
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- ── obs_retention_policies ────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'obs_retention_policies') THEN
    ALTER TABLE public.obs_retention_policies ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "obs_retention_policies_service" ON public.obs_retention_policies;
    CREATE POLICY "obs_retention_policies_service" ON public.obs_retention_policies
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- ── platform_cascade_rules ────────────────────────────────────────────────
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_cascade_rules') THEN
    ALTER TABLE public.platform_cascade_rules ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "platform_cascade_rules_service" ON public.platform_cascade_rules;
    CREATE POLICY "platform_cascade_rules_service" ON public.platform_cascade_rules
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- =============================================================================
-- Category C: Task-scoped via FK
-- =============================================================================

-- ── agent_checkpoints ─────────────────────────────────────────────────────
-- No organization_id column — scoped via task_id FK → brain_agent_tasks.
-- service_role writes; authenticated users can read their own org's tasks
-- through the brain_agent_tasks join (tasks are already org-scoped).
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_checkpoints') THEN
    ALTER TABLE public.agent_checkpoints ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "agent_checkpoints_service" ON public.agent_checkpoints;
    CREATE POLICY "agent_checkpoints_service" ON public.agent_checkpoints
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "agent_checkpoints_task_select" ON public.agent_checkpoints;
    CREATE POLICY "agent_checkpoints_task_select" ON public.agent_checkpoints
      FOR SELECT TO authenticated
      USING (
        task_id IN (
          SELECT id FROM public.brain_agent_tasks
          WHERE organization_id IN (
            SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $fix$;
