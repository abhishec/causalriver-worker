-- ADR-029: Trained Capability Agents — Accounting Persistence Tables
--
-- Three tables that complete the AAS (Accounting-as-a-Service) data layer:
-- 1. journal_entries — Double-entry posting ledger (GL backbone)
-- 2. bank_reconciliations — Transaction-level matching (bank ↔ book)
-- 3. entity_financials — Multi-entity consolidation (for group reporting)
--
-- These enable AAS agents to persist results instead of operating in-memory only.

-- ═══════════════════════════════════════════════════════
-- 1. Journal Entries — Double-entry posting ledger
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Entry details
  entry_date DATE NOT NULL,
  reference_number TEXT,           -- invoice #, GL ref, etc.
  description TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SGD',

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'voided')),

  -- Line items (JSONB array — flexible for any chart of accounts)
  line_items JSONB NOT NULL DEFAULT '[]',
  -- [{ account_code, account_name, debit, credit, description, tax_code }]

  -- Totals (denormalized for quick validation)
  total_debit NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Provenance
  source TEXT DEFAULT 'manual',    -- 'manual' | 'agent' | 'import' | 'reconciliation'
  agent_job_id UUID,               -- FK to agent_queue if created by agent
  source_document_id UUID,         -- FK to document_chunks source file

  -- Metadata
  metadata JSONB DEFAULT '{}',     -- { period, entityCode, tags, ... }
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date
  ON journal_entries (organization_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_status
  ON journal_entries (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_journal_entries_reference
  ON journal_entries (organization_id, reference_number)
  WHERE reference_number IS NOT NULL;

-- ═══════════════════════════════════════════════════════
-- 2. Bank Reconciliations — Transaction-level matching
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Reconciliation period
  bank_account_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'reviewed')),

  -- Balances
  bank_statement_balance NUMERIC(15,2),
  book_balance NUMERIC(15,2),
  reconciled_balance NUMERIC(15,2),
  difference NUMERIC(15,2) DEFAULT 0,

  -- Matched items
  matched_transactions JSONB DEFAULT '[]',
  -- [{ bankTxnId, bankDate, bankAmount, bookTxnId, bookDate, bookAmount,
  --    matchConfidence, matchMethod: 'exact'|'fuzzy'|'manual' }]

  unreconciled_items JSONB DEFAULT '[]',
  -- [{ type: 'bank'|'book', date, amount, description, reason }]

  -- Provenance
  agent_job_id UUID,
  reconciled_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bank_recon_org_period
  ON bank_reconciliations (organization_id, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_bank_recon_org_status
  ON bank_reconciliations (organization_id, status);

-- ═══════════════════════════════════════════════════════
-- 3. Entity Financials — Multi-entity consolidation
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entity_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Entity identity
  entity_name TEXT NOT NULL,       -- "Singapore Ops", "US Holding", etc.
  entity_code TEXT NOT NULL,       -- "SG-OPS", "US-HOLD"
  period DATE NOT NULL,            -- month-end date

  -- Currency
  currency TEXT NOT NULL DEFAULT 'SGD',
  exchange_rate NUMERIC(10,6) DEFAULT 1.0,  -- to reporting currency

  -- Financial data (flexible structure for any reporting framework)
  financial_data JSONB NOT NULL DEFAULT '{}',
  -- { revenue, expenses, grossProfit, netIncome, assets, liabilities, equity,
  --   cashFromOperations, cashFromInvesting, cashFromFinancing, ... }

  -- Consolidation
  intercompany_eliminations JSONB DEFAULT '[]',
  -- [{ counterparty, account, amount, description }]
  consolidation_adjustments JSONB DEFAULT '[]',
  -- [{ type, account, amount, description }]

  -- Status
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'final', 'audited')),

  -- Provenance
  agent_job_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entity_financials_org_period
  ON entity_financials (organization_id, period DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_financials_org_entity_period
  ON entity_financials (organization_id, entity_code, period);

-- ═══════════════════════════════════════════════════════
-- RLS for all three tables
-- ═══════════════════════════════════════════════════════

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_financials ENABLE ROW LEVEL SECURITY;

-- Journal Entries
CREATE POLICY "journal_entries_select_own_org" ON journal_entries
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "journal_entries_insert_own_org" ON journal_entries
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Bank Reconciliations
CREATE POLICY "bank_recon_select_own_org" ON bank_reconciliations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "bank_recon_insert_own_org" ON bank_reconciliations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Entity Financials
CREATE POLICY "entity_financials_select_own_org" ON entity_financials
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "entity_financials_insert_own_org" ON entity_financials
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Grants
GRANT SELECT, INSERT, UPDATE ON journal_entries TO authenticated;
GRANT SELECT, INSERT ON bank_reconciliations TO authenticated;
GRANT SELECT, INSERT ON entity_financials TO authenticated;
GRANT ALL ON journal_entries TO service_role;
GRANT ALL ON bank_reconciliations TO service_role;
GRANT ALL ON entity_financials TO service_role;
