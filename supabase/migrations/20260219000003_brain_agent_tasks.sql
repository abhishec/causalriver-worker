-- =============================================================================
-- Brain Agent Tasks — Semi-Autonomous Agent Execution System
-- =============================================================================
-- This migration creates the infrastructure for user-spawned brain agents:
--   1. brain_agent_tasks — tracks each agent run (spawn → execute → complete)
--   2. brain_agent_steps — individual steps within a task (for multi-step agents)
--   3. Indexes for fast polling + org-scoped queries
-- =============================================================================

-- ── 1. Brain Agent Tasks ────────────────────────────────────────────────────
-- Each row = one agent run. A user says "diagnose churn increase" →
-- one task is created. The agent runs async, producing artifacts + results.

CREATE TABLE IF NOT EXISTS brain_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  created_by UUID NOT NULL,

  -- What the user asked
  prompt TEXT NOT NULL,
  agent_type TEXT NOT NULL DEFAULT 'general',
  -- e.g. 'diagnose', 'build', 'analyze', 'predict', 'investigate'

  -- Brain context snapshot (what layers were injected)
  brain_layers_used JSONB DEFAULT '{}',
  -- e.g. { "L2": 0.9, "L4": 0.8, "L5": 0.7, ... }

  -- Execution state
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',           -- Created, waiting to execute
      'running',           -- Claude is processing
      'awaiting_approval', -- Agent paused — low confidence, needs human OK
      'approved',          -- Human approved, resuming execution
      'rejected',          -- Human rejected the proposed action
      'completed',         -- Successfully finished
      'failed'             -- Error during execution
    )),

  -- Confidence scoring (semi-autonomous logic)
  confidence_score NUMERIC(4,3) DEFAULT NULL,
  -- 0.000 - 1.000. If > auto_execute_threshold → auto-execute
  auto_execute_threshold NUMERIC(4,3) DEFAULT 0.800,

  -- Results
  result_summary TEXT,           -- Human-readable summary
  result_artifacts JSONB DEFAULT '[]',
  -- Array of { id, type, title, language, content, createdAt }
  result_metadata JSONB DEFAULT '{}',
  -- { tokensUsed, costUsd, durationMs, brainRegionsUsed, ... }

  -- For awaiting_approval: what the agent proposes to do
  proposed_action JSONB DEFAULT NULL,
  -- { actionType, description, impact, reversible }
  approval_note TEXT,            -- User's note when approving/rejecting

  -- Feedback (reinforcement learning)
  user_rating TEXT DEFAULT NULL CHECK (user_rating IN ('helpful', 'not_helpful', 'incorrect')),
  user_correction TEXT DEFAULT NULL,
  feedback_processed BOOLEAN DEFAULT FALSE,

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Brain Agent Steps ────────────────────────────────────────────────────
-- For multi-step agents (chain-of-thought visible to user).
-- Each step = one reasoning or action the agent took.

CREATE TABLE IF NOT EXISTS brain_agent_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES brain_agent_tasks(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL DEFAULT 'reasoning',
  -- 'reasoning', 'query', 'action', 'artifact', 'approval_request'

  title TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- ── 3. Indexes ──────────────────────────────────────────────────────────────

-- Fast polling: user checks "what are my running tasks?"
CREATE INDEX IF NOT EXISTS idx_agent_tasks_org_status
  ON brain_agent_tasks(organization_id, status, created_at DESC);

-- Fast lookup for tasks needing approval
CREATE INDEX IF NOT EXISTS idx_agent_tasks_awaiting_approval
  ON brain_agent_tasks(organization_id, status)
  WHERE status = 'awaiting_approval';

-- User's task history
CREATE INDEX IF NOT EXISTS idx_agent_tasks_user
  ON brain_agent_tasks(created_by, created_at DESC);

-- Steps by task (ordered)
CREATE INDEX IF NOT EXISTS idx_agent_steps_task
  ON brain_agent_steps(task_id, step_number);

-- Unprocessed feedback for reinforcement learning
CREATE INDEX IF NOT EXISTS idx_agent_tasks_feedback
  ON brain_agent_tasks(organization_id, feedback_processed)
  WHERE user_rating IS NOT NULL AND feedback_processed = FALSE;

-- ── 4. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE brain_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_agent_steps ENABLE ROW LEVEL SECURITY;

-- Service role full access (API routes use service client)
CREATE POLICY "Service role full access on brain_agent_tasks"
  ON brain_agent_tasks FOR ALL USING (true);

CREATE POLICY "Service role full access on brain_agent_steps"
  ON brain_agent_steps FOR ALL USING (true);
