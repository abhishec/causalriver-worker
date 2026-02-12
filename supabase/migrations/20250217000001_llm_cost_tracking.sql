-- ============================================================================
-- LLM & Infrastructure Cost Tracking
-- ============================================================================
-- Tracks every LLM API call with token counts, model used, estimated cost,
-- and the component that made the call. Enables real-time cost dashboards,
-- budget alerts, and historical analysis.
--
-- Also tracks AWS infrastructure costs (Fargate, CloudWatch, ECR, data transfer)
-- via periodic cost snapshots from the Cost Explorer API.
-- ============================================================================

-- ── LLM Call Log ─────────────────────────────────────────────────────────────
-- Every single LLM API call is logged here for cost tracking and audit.
CREATE TABLE IF NOT EXISTS llm_cost_log (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001',

  -- What made the call
  component      TEXT NOT NULL,         -- 'knowledge-distiller', 'brain-amplifier', 'response-layer', 'copilot', 'edge-function'
  function_name  TEXT NOT NULL,         -- 'distill', 'amplifyInsight', 'interpretAnomaly', 'generateConsolidationBriefing', etc.

  -- LLM details
  provider       TEXT NOT NULL,         -- 'anthropic' or 'openai'
  model          TEXT NOT NULL,         -- 'claude-3-5-haiku-20241022', 'claude-sonnet-4-20250514', 'gpt-4o-mini', etc.

  -- Token usage
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_tokens   INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

  -- Cost estimation (in USD, calculated at insert time based on model pricing)
  estimated_cost_usd  NUMERIC(10, 6) NOT NULL DEFAULT 0,

  -- Context
  content_title  TEXT,                  -- What was being processed (e.g., article title, insight summary)
  success        BOOLEAN DEFAULT true,  -- Did the call succeed?
  duration_ms    INTEGER DEFAULT 0,     -- How long the call took

  -- Metadata
  metadata       JSONB DEFAULT '{}',    -- Extra context (batch_id, session_id, etc.)
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for cost queries
CREATE INDEX IF NOT EXISTS idx_llm_cost_log_created_at ON llm_cost_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_cost_log_component ON llm_cost_log (component, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_cost_log_model ON llm_cost_log (model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_cost_log_org ON llm_cost_log (organization_id, created_at DESC);

-- ── AWS Infrastructure Cost Snapshots ────────────────────────────────────────
-- Periodic snapshots of AWS costs from Cost Explorer / CloudWatch billing.
CREATE TABLE IF NOT EXISTS aws_cost_snapshots (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Time period
  period_start   DATE NOT NULL,         -- Start of billing period
  period_end     DATE NOT NULL,         -- End of billing period

  -- Cost breakdown by service
  fargate_cost   NUMERIC(10, 4) DEFAULT 0,  -- ECS Fargate
  cloudwatch_cost NUMERIC(10, 4) DEFAULT 0, -- CloudWatch Logs
  ecr_cost       NUMERIC(10, 4) DEFAULT 0,  -- ECR storage
  data_transfer_cost NUMERIC(10, 4) DEFAULT 0, -- Data transfer
  codebuild_cost NUMERIC(10, 4) DEFAULT 0,  -- CodeBuild
  other_cost     NUMERIC(10, 4) DEFAULT 0,  -- Other services
  total_aws_cost NUMERIC(10, 4) GENERATED ALWAYS AS (
    fargate_cost + cloudwatch_cost + ecr_cost + data_transfer_cost + codebuild_cost + other_cost
  ) STORED,

  -- Metadata
  raw_response   JSONB DEFAULT '{}',    -- Raw AWS Cost Explorer response
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aws_cost_period ON aws_cost_snapshots (period_start DESC);

-- ── Daily Cost Summary (Materialized View) ──────────────────────────────────
-- Aggregated daily costs for quick dashboard queries.
CREATE TABLE IF NOT EXISTS daily_cost_summary (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cost_date      DATE NOT NULL UNIQUE,

  -- LLM costs by component
  distiller_cost      NUMERIC(10, 6) DEFAULT 0,
  amplifier_cost      NUMERIC(10, 6) DEFAULT 0,
  response_layer_cost NUMERIC(10, 6) DEFAULT 0,
  copilot_cost        NUMERIC(10, 6) DEFAULT 0,
  edge_function_cost  NUMERIC(10, 6) DEFAULT 0,
  total_llm_cost      NUMERIC(10, 6) DEFAULT 0,

  -- LLM usage stats
  total_llm_calls     INTEGER DEFAULT 0,
  total_input_tokens  BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  -- AWS costs (from snapshots)
  total_aws_cost      NUMERIC(10, 4) DEFAULT 0,

  -- Combined
  total_cost          NUMERIC(10, 4) DEFAULT 0,

  -- Budget tracking
  daily_budget        NUMERIC(10, 4) DEFAULT 2.00,  -- Default $2/day budget
  budget_remaining    NUMERIC(10, 4) DEFAULT 2.00,
  budget_alert_sent   BOOLEAN DEFAULT false,

  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_cost_date ON daily_cost_summary (cost_date DESC);

-- ── Monthly Budget Config ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_budget_config (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001',

  monthly_llm_budget  NUMERIC(10, 2) DEFAULT 50.00,   -- $50/month LLM budget
  monthly_aws_budget  NUMERIC(10, 2) DEFAULT 20.00,   -- $20/month AWS budget
  daily_llm_budget    NUMERIC(10, 2) DEFAULT 2.00,    -- $2/day LLM budget
  alert_threshold_pct INTEGER DEFAULT 80,              -- Alert at 80% of budget
  hard_stop_pct       INTEGER DEFAULT 100,             -- Hard stop at 100%

  -- Notification settings
  alert_email         TEXT,
  slack_webhook       TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id)
);

-- Insert default budget config
INSERT INTO cost_budget_config (organization_id, monthly_llm_budget, monthly_aws_budget, daily_llm_budget)
VALUES ('00000000-0000-4000-a000-000000000001', 50.00, 20.00, 2.00)
ON CONFLICT (organization_id) DO NOTHING;

-- ── RPC: Get cost summary for a date range ──────────────────────────────────
CREATE OR REPLACE FUNCTION get_cost_summary(
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  period TEXT,
  component TEXT,
  model TEXT,
  total_calls BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(l.created_at::DATE, 'YYYY-MM-DD') as period,
    l.component,
    l.model,
    COUNT(*)::BIGINT as total_calls,
    SUM(l.input_tokens)::BIGINT as total_input_tokens,
    SUM(l.output_tokens)::BIGINT as total_output_tokens,
    SUM(l.estimated_cost_usd)::NUMERIC as total_cost
  FROM llm_cost_log l
  WHERE l.created_at::DATE BETWEEN p_start_date AND p_end_date
  GROUP BY TO_CHAR(l.created_at::DATE, 'YYYY-MM-DD'), l.component, l.model
  ORDER BY period DESC, total_cost DESC;
END;
$$ LANGUAGE plpgsql;

-- ── RPC: Get today's cost with budget status ─────────────────────────────────
CREATE OR REPLACE FUNCTION get_today_cost_status()
RETURNS TABLE (
  total_cost_today NUMERIC,
  total_calls_today BIGINT,
  daily_budget NUMERIC,
  budget_used_pct NUMERIC,
  top_component TEXT,
  top_component_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH today_costs AS (
    SELECT
      SUM(estimated_cost_usd) as total_cost,
      COUNT(*) as total_calls
    FROM llm_cost_log
    WHERE created_at::DATE = CURRENT_DATE
  ),
  top_comp AS (
    SELECT
      component as comp,
      SUM(estimated_cost_usd) as comp_cost
    FROM llm_cost_log
    WHERE created_at::DATE = CURRENT_DATE
    GROUP BY component
    ORDER BY comp_cost DESC
    LIMIT 1
  ),
  budget AS (
    SELECT daily_llm_budget FROM cost_budget_config LIMIT 1
  )
  SELECT
    COALESCE(tc.total_cost, 0)::NUMERIC,
    COALESCE(tc.total_calls, 0)::BIGINT,
    COALESCE(b.daily_llm_budget, 2.00)::NUMERIC,
    CASE WHEN COALESCE(b.daily_llm_budget, 2.00) > 0
      THEN ROUND((COALESCE(tc.total_cost, 0) / b.daily_llm_budget * 100)::NUMERIC, 1)
      ELSE 0
    END::NUMERIC,
    COALESCE(tp.comp, 'none')::TEXT,
    COALESCE(tp.comp_cost, 0)::NUMERIC
  FROM today_costs tc
  CROSS JOIN budget b
  LEFT JOIN top_comp tp ON true;
END;
$$ LANGUAGE plpgsql;
