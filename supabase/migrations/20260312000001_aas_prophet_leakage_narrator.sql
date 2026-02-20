-- =============================================================================
-- AAA-S: Cash Flow Prophet + Revenue Leakage Detector + Causal P&L Narrator
--
-- Creates tables for 3 high-impact financial intelligence features:
--   1. cash_flow_forecasts  — Weekly forecast snapshots for accuracy tracking
--   2. contract_terms       — Contract billing terms for leakage detection
--   3. revenue_leakage_findings — Detected leakage items
--   4. pl_variance_analysis — Causal P&L narratives per period
--
-- Prerequisites: organizations table, org_members table exist
-- =============================================================================

-- =============================================================================
-- 1. CASH FLOW FORECASTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cash_flow_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  horizon_weeks INT NOT NULL DEFAULT 13,
  -- Array of {weekStart, weekEnd, projectedInflow, projectedOutflow, netCashPosition, lower95, upper95, riskLevel, drivers[]}
  forecast_data JSONB NOT NULL DEFAULT '[]',
  -- Previous forecast for accuracy comparison
  comparison_data JSONB,
  -- {mape, directionalAccuracy, biasDirection, weeklyErrors[]}
  accuracy_metrics JSONB,
  -- {criticalWeeks[], risks[], totalRiskScore, overallConfidence, causalNarrative}
  risk_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_cf_forecasts_org_date
  ON public.cash_flow_forecasts(organization_id, forecast_date DESC);

COMMENT ON TABLE public.cash_flow_forecasts IS 'Weekly 13-week cash flow forecast snapshots with accuracy tracking for the Cash Flow Prophet feature';

-- =============================================================================
-- 2. CONTRACT TERMS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contract_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_name TEXT,
  contract_start DATE,
  contract_end DATE,
  renewal_date DATE,
  billing_frequency TEXT NOT NULL DEFAULT 'monthly', -- monthly, quarterly, annual
  -- [{tierName, unitPrice, volumeMin, volumeMax, metric}]
  pricing_tiers JSONB DEFAULT '[]',
  contracted_value NUMERIC,
  currency TEXT NOT NULL DEFAULT 'SGD',
  auto_renewal BOOLEAN NOT NULL DEFAULT false,
  -- Annual price increase clause (e.g. 5.0 = 5%)
  price_escalation_pct NUMERIC DEFAULT 0,
  last_price_increase_date DATE,
  status TEXT NOT NULL DEFAULT 'active', -- active, expired, cancelled, pending
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_terms_org_client
  ON public.contract_terms(organization_id, client_id);
CREATE INDEX IF NOT EXISTS idx_contract_terms_renewal
  ON public.contract_terms(organization_id, renewal_date)
  WHERE renewal_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contract_terms_status
  ON public.contract_terms(organization_id, status);

COMMENT ON TABLE public.contract_terms IS 'Contract billing terms for Revenue Leakage Detector — pricing tiers, renewal dates, escalation clauses';

-- =============================================================================
-- 3. REVENUE LEAKAGE FINDINGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.revenue_leakage_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- under_billing, missed_renewal, unapplied_escalation, overage_gap, pricing_error
  finding_type TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT,
  amount_leaked NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SGD',
  -- {contractRate, billedRate, usage, gapDescription, affectedInvoices[], affectedPeriod}
  evidence JSONB NOT NULL DEFAULT '{}',
  corrective_action TEXT,
  urgency TEXT NOT NULL DEFAULT 'medium', -- critical, high, medium, low
  status TEXT NOT NULL DEFAULT 'open', -- open, acknowledged, resolved, dismissed
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

CREATE INDEX IF NOT EXISTS idx_leakage_org_status
  ON public.revenue_leakage_findings(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leakage_org_type
  ON public.revenue_leakage_findings(organization_id, finding_type);
CREATE INDEX IF NOT EXISTS idx_leakage_org_client
  ON public.revenue_leakage_findings(organization_id, client_id);

COMMENT ON TABLE public.revenue_leakage_findings IS 'Detected revenue leakage items — under-billing, missed renewals, pricing gaps';

-- =============================================================================
-- 4. P&L VARIANCE ANALYSIS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pl_variance_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  comparative_from DATE,
  comparative_to DATE,
  -- Array of {lineItem, accountType, currentAmount, priorAmount, varianceAmount, variancePct, direction, materiality}
  variances JSONB NOT NULL DEFAULT '[]',
  -- Array of {lineItem, totalVariance, attributions[{cause, domain, contribution, contributionPct, causalPath[], evidenceStrength, evidence}], residualUnexplained}
  causal_attributions JSONB DEFAULT '[]',
  summary_narrative TEXT,
  confidence_score NUMERIC DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pl_variance_org_period
  ON public.pl_variance_analysis(organization_id, period_to DESC);

COMMENT ON TABLE public.pl_variance_analysis IS 'Causal P&L variance analysis — line-item variances with causal attributions and narratives';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.cash_flow_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_leakage_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pl_variance_analysis ENABLE ROW LEVEL SECURITY;

-- Cash Flow Forecasts
CREATE POLICY "cf_forecasts_select_own_org" ON public.cash_flow_forecasts
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );
CREATE POLICY "cf_forecasts_insert_own_org" ON public.cash_flow_forecasts
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );

-- Contract Terms
CREATE POLICY "contract_terms_select_own_org" ON public.contract_terms
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );
CREATE POLICY "contract_terms_insert_own_org" ON public.contract_terms
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );
CREATE POLICY "contract_terms_update_own_org" ON public.contract_terms
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );

-- Revenue Leakage Findings
CREATE POLICY "leakage_select_own_org" ON public.revenue_leakage_findings
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );
CREATE POLICY "leakage_insert_own_org" ON public.revenue_leakage_findings
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );
CREATE POLICY "leakage_update_own_org" ON public.revenue_leakage_findings
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );

-- P&L Variance Analysis
CREATE POLICY "pl_variance_select_own_org" ON public.pl_variance_analysis
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );
CREATE POLICY "pl_variance_insert_own_org" ON public.pl_variance_analysis
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.org_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- SERVICE ROLE BYPASS (for agent execution via service key)
-- =============================================================================

CREATE POLICY "cf_forecasts_service_all" ON public.cash_flow_forecasts
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "contract_terms_service_all" ON public.contract_terms
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "leakage_service_all" ON public.revenue_leakage_findings
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "pl_variance_service_all" ON public.pl_variance_analysis
  FOR ALL USING (auth.role() = 'service_role');
