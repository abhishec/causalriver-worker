-- ============================================================================
-- federated_knowledge Table (ADR-019)
-- ============================================================================
--
-- Stores domain-specific learnings extracted after every SE-aaS/AaaS/BPaaS
-- execution (via knowledge-extractor.ts).
--
-- Two row types:
--   organization_id IS NOT NULL → workspace-specific insight (one org)
--   organization_id IS NULL     → universal insight (promoted via federate-knowledge cron)
--
-- Columns:
--   content     — the insight text (1-2 sentences, max ~200 words)
--   confidence  — 0.0-1.0 quality/confidence score (direct column, not JSONB)
--   promoted_at — set when promoted to universal; NULL while workspace-specific
--   metadata    — JSONB bag for ancillary data (task_type, ai_worker_id, source, etc.)
--
-- The federate-knowledge cron (weekly Sunday 3 AM) promotes rows with 3+
-- distinct workspaces sharing the same domain+content pattern to universal.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.federated_knowledge (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID        REFERENCES public.ai_workspaces(id) ON DELETE CASCADE,
  domain           TEXT        NOT NULL,
  content          TEXT        NOT NULL,
  confidence       FLOAT       NOT NULL DEFAULT 0.7,
  promoted_at      TIMESTAMPTZ,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: workspace-scoped reads (worker-bootstrap, brain-context org rows)
CREATE INDEX IF NOT EXISTS idx_federated_knowledge_org
  ON public.federated_knowledge (organization_id, domain, created_at DESC)
  WHERE organization_id IS NOT NULL;

-- Index: universal rows (brain-context universal pull, ordered by promoted_at)
CREATE INDEX IF NOT EXISTS idx_federated_knowledge_universal
  ON public.federated_knowledge (domain, promoted_at DESC)
  WHERE organization_id IS NULL;

-- Index: confidence filter for org-specific high-quality rows
CREATE INDEX IF NOT EXISTS idx_federated_knowledge_org_confidence
  ON public.federated_knowledge (organization_id, confidence DESC)
  WHERE organization_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.federated_knowledge ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read universal rows (org IS NULL) and their own org's rows
CREATE POLICY "federated_knowledge_select"
  ON public.federated_knowledge FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
    )
  );

-- Service role can do everything (used by knowledge-extractor + federate-knowledge cron)
CREATE POLICY "federated_knowledge_service_all"
  ON public.federated_knowledge FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can insert into their own org
CREATE POLICY "federated_knowledge_insert"
  ON public.federated_knowledge FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.org_members WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.federated_knowledge IS
  'Domain-specific learnings extracted from AI domain executions (ADR-019). '
  'Workspace-specific rows (org IS NOT NULL) are promoted to universal (org IS NULL) '
  'by the weekly federate-knowledge cron when 3+ workspaces share the same insight.';
