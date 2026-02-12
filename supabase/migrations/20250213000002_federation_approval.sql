-- =============================================================================
-- Federation Approval Queue & Audit Log
--
-- Closes the Corpus Callosum governance gap:
--   1. federation_pending: queued items awaiting admin review before promotion
--   2. federation_approval_log: full audit trail of approve/reject decisions
--   3. Adds require_approval flag to organization_federation_settings
-- =============================================================================

-- Add approval mode flag to existing federation settings
ALTER TABLE organization_federation_settings
  ADD COLUMN IF NOT EXISTS require_approval BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_threshold TEXT DEFAULT 'balanced'
    CHECK (approval_threshold IN ('conservative', 'balanced', 'aggressive'));

-- Pending items queue — items staged for promotion but awaiting approval
CREATE TABLE IF NOT EXISTS federation_pending (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('relationship', 'memory', 'rule')),
  original_record_id UUID,
  original_data JSONB NOT NULL,           -- Raw org data (before sanitization)
  sanitized_data JSONB NOT NULL,          -- Anonymized data (what would go to core)
  sanitization_report JSONB DEFAULT '{}', -- PII redaction details
  preview_diff JSONB DEFAULT '{}',        -- Side-by-side original vs sanitized
  risk_level TEXT NOT NULL DEFAULT 'safe'
    CHECK (risk_level IN ('safe', 'warn', 'block')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'auto_approved', 'expired')),
  source_domains TEXT[] DEFAULT '{}',     -- Domains involved (for filtering)
  effect_size NUMERIC,                    -- For relationships
  confidence NUMERIC,                     -- For memories/rules
  sample_size INTEGER,                    -- For relationships
  natural_language TEXT,                   -- Human-readable description
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,                        -- Admin user ID or 'auto'
  decision_reason TEXT,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_federation_pending_org_status
  ON federation_pending (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_federation_pending_status
  ON federation_pending (status, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_federation_pending_expires
  ON federation_pending (expires_at)
  WHERE status = 'pending';

-- Approval audit log — immutable record of every decision
CREATE TABLE IF NOT EXISTS federation_approval_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  pending_item_id UUID REFERENCES federation_pending(id),
  data_type TEXT NOT NULL,
  original_record_id UUID,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'auto_approved', 'expired')),
  decided_by TEXT,                        -- Admin user ID, 'auto', or 'system'
  decision_reason TEXT,
  sanitization_report JSONB DEFAULT '{}',
  promoted_to_core BOOLEAN DEFAULT false, -- Whether it actually made it to core brain
  promotion_error TEXT,                   -- Error if promotion failed after approval
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_federation_approval_org
  ON federation_approval_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_federation_approval_decision
  ON federation_approval_log (decision, created_at DESC);
