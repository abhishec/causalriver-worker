-- =============================================================================
-- Training Packs + ai_memory Corrections Enhancement
-- =============================================================================
-- This migration:
-- 1. Creates the custom_training_packs table (used by /api/training-packs)
-- 2. Adds cognitive_layer column to ai_memory (used by learnFromCorrection)
-- 3. Adds index on ai_memory for fast correction lookups in chat context
-- =============================================================================

-- ── 1. Custom Training Packs ─────────────────────────────────────────────────
-- Users can teach the brain custom causal chains and business rules.
-- Packs are queued for execution via agent_queue.

CREATE TABLE IF NOT EXISTS custom_training_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  pack_data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  chain_count INTEGER DEFAULT 0,
  rule_count INTEGER DEFAULT 0,
  executed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_packs_org
  ON custom_training_packs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_packs_status
  ON custom_training_packs(organization_id, status)
  WHERE status = 'pending';

ALTER TABLE custom_training_packs ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (API routes use service client)
CREATE POLICY "Service role full access on custom_training_packs"
  ON custom_training_packs FOR ALL USING (true);


-- ── 2. Add cognitive_layer to ai_memory ──────────────────────────────────────
-- The learnFromCorrection function stores corrections with cognitive_layer = 'L4'.
-- This column enables layer-aware memory retrieval.

ALTER TABLE ai_memory ADD COLUMN IF NOT EXISTS cognitive_layer TEXT DEFAULT NULL;

COMMENT ON COLUMN ai_memory.cognitive_layer IS
  'Cognitive layer that produced or is targeted by this memory (L1-L15). '
  'Used for corrections (L4 = causal understanding) and routing.';


-- ── 3. Index for fast correction lookups in chat context ─────────────────────
-- The chat route queries: WHERE memory_type = 'correction' ORDER BY importance DESC
-- This composite index makes that query instant.

CREATE INDEX IF NOT EXISTS idx_ai_memory_corrections
  ON ai_memory(organization_id, memory_type, importance DESC)
  WHERE memory_type = 'correction';

-- Also index for domain-specific correction lookups
CREATE INDEX IF NOT EXISTS idx_ai_memory_corrections_domain
  ON ai_memory(organization_id, memory_type, domain, importance DESC)
  WHERE memory_type = 'correction';
