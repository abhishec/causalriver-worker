/**
 * Core Metrics Library — VC/PE-Grade Financial Intelligence
 *
 * Comprehensive business metrics knowledge encoded as training packs.
 * Covers: SaaS/VC metrics, Financial Statements (P&L, Balance Sheet, Cash Flow),
 * Revenue/Growth, HR/People, Client Success, Engineering/Product, and PE Valuation.
 *
 * This knowledge enables Nexus Brain to analyze any company like a
 * VC Principal or PE Manager — understanding every metric, its calculation,
 * benchmarks, and causal relationships to other metrics.
 *
 * Sources: Industry-standard definitions from Investopedia, Wall Street Prep,
 * Corporate Finance Institute, a16z, Bessemer, SaaStr, DORA, Wikipedia.
 */

import type { TrainingPack } from './brain-trainer';

// ============================================================================
// 1. SAAS UNIT ECONOMICS — ARR, MRR, LTV, CAC
// ============================================================================

const saasUnitEconomics: TrainingPack = {
  id: 'core-saas-unit-economics',
  title: 'SaaS Unit Economics: ARR, MRR, LTV, CAC, Payback',
  source: 'Industry-standard SaaS metrics (a16z, Bessemer, SaaStr)',
  industry: 'SaaS',
  domains: ['finance', 'revenue', 'cs', 'executive'],
  confidence: 0.95,
  tags: ['unit-economics', 'arr', 'mrr', 'ltv', 'cac', 'core-metrics'],

  causalChains: [
    // CAC efficiency drives runway
    { source: 'revenue', target: 'finance', metric: 'cac_payback_months', effectSize: -0.70, lagDays: 90, pValue: 0.001 },
    // LTV:CAC ratio predicts business viability
    { source: 'cs', target: 'finance', metric: 'ltv_cac_ratio', effectSize: 0.65, lagDays: 180, pValue: 0.002 },
    // NRR drives ARR growth without new logos
    { source: 'cs', target: 'revenue', metric: 'arr_growth', effectSize: 0.80, lagDays: 30, pValue: 0.001 },
    // Churn rate destroys LTV
    { source: 'cs', target: 'finance', metric: 'ltv', effectSize: -0.85, lagDays: 30, pValue: 0.001 },
    // High CAC reduces gross margin
    { source: 'revenue', target: 'finance', metric: 'gross_margin', effectSize: -0.40, lagDays: 60, pValue: 0.01 },
  ],

  businessRules: [
    {
      title: 'LTV:CAC Ratio Health Check',
      entityType: 'company',
      when: {
        logic: 'OR',
        conditions: [
          { field: 'metrics.ltv_cac_ratio', operator: 'less_than', value: 3 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'LTV:CAC ratio below 3x — unit economics unhealthy. Target: 3x-5x.' } },
      ],
      naturalLanguage: 'LTV:CAC ratio below 3x signals unhealthy unit economics. Ideal range is 3x-5x. Below 1x means losing money on every customer.',
      priority: 95,
    },
    {
      title: 'CAC Payback Period Warning',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.cac_payback_months', operator: 'greater_than', value: 18 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'CAC payback >18 months — sales efficiency needs improvement. Target: 12-18 months.' } },
      ],
      naturalLanguage: 'CAC payback period exceeding 18 months indicates poor sales efficiency. Enterprise SaaS benchmark: 12-18 months. SMB: 6-12 months.',
      priority: 85,
    },
    {
      title: 'Net Revenue Retention Excellence',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.nrr', operator: 'greater_than', value: 120 },
        ],
      },
      then: [
        { type: 'set_flag', params: { flag: 'nrr_excellent', value: true } },
      ],
      naturalLanguage: 'NRR >120% is world-class (Snowflake, Twilio territory). Revenue grows from existing customers alone. Median public SaaS: 114%.',
      priority: 70,
    },
  ],

  cascades: [
    { source: 'revenue', target: 'finance', type: 'impacts', severity: 'critical', keywords: { source: ['cac', 'acquisition', 'sales_cost'], target: ['runway', 'burn', 'cash'] } },
    { source: 'cs', target: 'revenue', type: 'enables', severity: 'high', keywords: { source: ['retention', 'expansion', 'nrr'], target: ['arr_growth', 'revenue'] } },
    { source: 'cs', target: 'finance', type: 'impacts', severity: 'critical', keywords: { source: ['churn', 'contraction'], target: ['ltv', 'revenue_loss'] } },
  ],

  patterns: [
    { name: 'LTV:CAC Below 3x Warning', domains: ['finance', 'revenue'], observed: 78, expected: 30, total: 100, description: 'Companies with LTV:CAC <3x have 2.6x higher failure rate' },
    { name: 'NRR Above 120% Compounds Growth', domains: ['cs', 'revenue'], observed: 85, expected: 40, total: 100, description: 'NRR >120% compounds ARR growth even with zero new customers' },
    { name: 'Payback Under 12 Months Signal', domains: ['revenue', 'finance'], observed: 70, expected: 35, total: 100, description: 'CAC payback <12 months correlates with 2x faster path to profitability' },
  ],

  outcomes: [
    { predicted: 'sustainable_growth', predictedConfidence: 0.85, actual: 'sustainable_growth', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'revenue' },
    { predicted: 'cash_crisis', predictedConfidence: 0.75, actual: 'cash_crisis', wasCorrect: true, sourceDomain: 'revenue', targetDomain: 'finance' },
  ],

  narrative: `SaaS Unit Economics Formulas:
• MRR = Sum of all monthly subscription revenue (ARPU × # subscribers)
• ARR = MRR × 12
• ARR Components = Beginning ARR + New ARR + Expansion ARR - Contraction ARR - Churned ARR
• LTV = (ARPU × Gross Margin) ÷ Monthly Churn Rate  [for SaaS]
• LTV (simple) = Average Revenue Per Account × Average Customer Lifetime
• CAC = Total Sales & Marketing Spend ÷ Number of New Customers Acquired
• LTV:CAC Ratio = LTV ÷ CAC  [Target: 3x-5x; Below 1x = losing money per customer]
• CAC Payback = CAC ÷ (Monthly ARPU × Gross Margin)  [Target: 12-18 months]
• NRR = (Starting MRR + Expansion - Contraction - Churn) ÷ Starting MRR × 100
• GRR = (Starting MRR - Contraction - Churn) ÷ Starting MRR × 100  [Always ≤100%]

Benchmarks: Median public SaaS NRR: 114%. Enterprise NRR >120% is elite (Snowflake 158%, Twilio 131%). GRR >90% is healthy. LTV:CAC 3x-5x optimal. CAC Payback 12-18 months enterprise, 6-12 months SMB.`,
};

// ============================================================================
// 2. SAAS GROWTH & EFFICIENCY METRICS
// ============================================================================

const saasGrowthEfficiency: TrainingPack = {
  id: 'core-saas-growth-efficiency',
  title: 'SaaS Growth & Efficiency: Rule of 40, Magic Number, Burn Multiple',
  source: 'Industry-standard SaaS metrics (Brad Feld, Bessemer, a16z)',
  industry: 'SaaS',
  domains: ['finance', 'revenue', 'executive'],
  confidence: 0.95,
  tags: ['growth', 'efficiency', 'rule-of-40', 'magic-number', 'burn-rate', 'core-metrics'],

  causalChains: [
    // Burn rate inversely affects runway
    { source: 'finance', target: 'executive', metric: 'runway_months', effectSize: -0.90, lagDays: 1, pValue: 0.001 },
    // Revenue growth improves Rule of 40 score
    { source: 'revenue', target: 'executive', metric: 'rule_of_40_score', effectSize: 0.75, lagDays: 30, pValue: 0.001 },
    // Sales efficiency determines magic number
    { source: 'revenue', target: 'finance', metric: 'magic_number', effectSize: 0.70, lagDays: 90, pValue: 0.005 },
    // Burn multiple signals capital efficiency
    { source: 'finance', target: 'executive', metric: 'capital_efficiency', effectSize: -0.80, lagDays: 90, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'Rule of 40 Compliance',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.rule_of_40', operator: 'less_than', value: 40 },
          { field: 'metrics.arr', operator: 'greater_than', value: 1000000 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Rule of 40 score below target. Revenue Growth % + EBITDA Margin % < 40%. Address either growth or profitability.' } },
      ],
      naturalLanguage: 'Rule of 40: Revenue Growth Rate + EBITDA Margin should equal or exceed 40%. Median public SaaS: 34%. Score >40 indicates well-balanced growth-profitability tradeoff.',
      priority: 90,
    },
    {
      title: 'Runway Critical Warning',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.runway_months', operator: 'less_than', value: 12 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Runway below 12 months. Immediate action required: reduce burn or raise capital.' } },
      ],
      naturalLanguage: 'Runway below 12 months is critical. Seed/Series A target: 12-18 months. Post-Series A target: 18-24 months. Below 6 months is emergency.',
      priority: 99,
    },
    {
      title: 'Burn Multiple Efficiency Check',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.burn_multiple', operator: 'greater_than', value: 2 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Burn Multiple >2x: burning $2+ for every $1 of new ARR. Target: <1.5x.' } },
      ],
      naturalLanguage: 'Burn Multiple = Net Burn ÷ Net New ARR. Below 1x is excellent. 1-1.5x is good. 1.5-2x is concerning. >2x indicates poor capital efficiency.',
      priority: 88,
    },
    {
      title: 'Magic Number Sales Efficiency',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.magic_number', operator: 'less_than', value: 0.5 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'SaaS Magic Number <0.5: sales & marketing spend generating insufficient revenue. Evaluate GTM efficiency.' } },
      ],
      naturalLanguage: 'SaaS Magic Number = (Current Q Revenue - Prior Q Revenue) × 4 ÷ Prior Q S&M Spend. Below 0.5 is red flag. 0.75+ is healthy. 1.0+ means invest more in S&M.',
      priority: 85,
    },
  ],

  cascades: [
    { source: 'finance', target: 'executive', type: 'triggers', severity: 'critical', keywords: { source: ['burn', 'runway', 'cash'], target: ['survival', 'fundraise', 'cut'] } },
    { source: 'revenue', target: 'executive', type: 'impacts', severity: 'high', keywords: { source: ['growth', 'magic_number', 'efficiency'], target: ['valuation', 'fundraise'] } },
  ],

  patterns: [
    { name: 'Rule of 40 Valuation Premium', domains: ['executive', 'finance'], observed: 82, expected: 40, total: 100, description: 'Companies scoring >40 on Rule of 40 command 2x higher revenue multiples' },
    { name: 'Burn Multiple to Runway Warning', domains: ['finance', 'executive'], observed: 75, expected: 30, total: 100, description: 'Burn Multiple >2x correlates with runway <12 months in 75% of cases' },
    { name: 'Magic Number Scaling Signal', domains: ['revenue', 'finance'], observed: 80, expected: 40, total: 100, description: 'Magic Number >0.75 signals readiness to scale S&M investment' },
  ],

  outcomes: [
    { predicted: 'fundraise_needed', predictedConfidence: 0.90, actual: 'fundraise_needed', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'executive' },
    { predicted: 'growth_stall', predictedConfidence: 0.70, actual: 'growth_stall', wasCorrect: true, sourceDomain: 'revenue', targetDomain: 'executive' },
  ],

  narrative: `SaaS Growth & Efficiency Formulas:
• Rule of 40 = Revenue Growth Rate (%) + EBITDA Margin (%). Target: ≥40%. Median public SaaS: 34%.
• Burn Rate (Gross) = Total monthly operating expenses
• Burn Rate (Net) = Revenue - Total Expenses (or Starting Cash - Ending Cash for period)
• Runway (months) = Current Cash Balance ÷ Monthly Net Burn Rate. Target: 18-24 months post-Series A.
• Burn Multiple = Net Burn ÷ Net New ARR. Excellent: <1x. Good: 1-1.5x. Bad: >2x.
• SaaS Magic Number = (Current Q ARR - Prior Q ARR) × 4 ÷ Prior Q S&M Spend. Below 0.5 = red flag. >0.75 = healthy. >1.0 = invest more.
• SaaS Quick Ratio = (New MRR + Expansion MRR) ÷ (Churned MRR + Contraction MRR). Target: >4x.
• ARPU = Total Revenue ÷ Number of Active Customers
• Revenue per Employee = Total Revenue ÷ FTE Headcount. Benchmark: $200K-$400K for SaaS.
• T2D3 = Triple year 1, Triple year 2, Double year 3, Double year 4, Double year 5 (VC growth expectation).
• CAGR = (Ending Value ÷ Beginning Value)^(1/years) - 1
• Capital Efficiency = Total Revenue ÷ Total Capital Raised`,
};

// ============================================================================
// 3. FINANCIAL STATEMENTS — P&L / INCOME STATEMENT
// ============================================================================

const financialPnL: TrainingPack = {
  id: 'core-financial-pnl',
  title: 'P&L / Income Statement: Revenue Through Net Income',
  source: 'GAAP/IFRS accounting standards, Investopedia, Wikipedia',
  industry: 'General',
  domains: ['finance', 'executive'],
  confidence: 0.95,
  tags: ['pnl', 'income-statement', 'revenue', 'ebitda', 'margins', 'core-metrics'],

  causalChains: [
    // COGS directly impacts gross margin
    { source: 'finance', target: 'finance', metric: 'gross_margin', effectSize: -0.90, lagDays: 0, pValue: 0.001 },
    // OpEx impacts EBITDA margin
    { source: 'finance', target: 'finance', metric: 'ebitda_margin', effectSize: -0.80, lagDays: 0, pValue: 0.001 },
    // Gross margin impacts operating margin
    { source: 'finance', target: 'finance', metric: 'operating_margin', effectSize: 0.85, lagDays: 0, pValue: 0.001 },
    // Revenue growth with margin expansion is ideal
    { source: 'revenue', target: 'finance', metric: 'operating_leverage', effectSize: 0.60, lagDays: 90, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Gross Margin Below SaaS Benchmark',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.gross_margin_pct', operator: 'less_than', value: 70 },
          { field: 'company.industry', operator: 'equals', value: 'SaaS' },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'SaaS Gross Margin below 70%. Top quartile: 80%+. Review COGS composition (hosting, support, onboarding).' } },
      ],
      naturalLanguage: 'SaaS companies should have 70-85% gross margins. Below 70% signals high cost of delivery. Review hosting costs, professional services mix, and support costs.',
      priority: 85,
    },
    {
      title: 'EBITDA Margin Monitoring',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.ebitda_margin_pct', operator: 'less_than', value: -20 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'EBITDA margin below -20%. Ensure sufficient runway and path to profitability.' } },
      ],
      naturalLanguage: 'EBITDA = Net Income + Interest + Taxes + Depreciation + Amortization. Alternative: Operating Profit + D&A. Negative EBITDA acceptable for growth-stage if Rule of 40 met.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'finance', target: 'executive', type: 'impacts', severity: 'high', keywords: { source: ['cogs', 'cost', 'margin'], target: ['profitability', 'valuation'] } },
    { source: 'finance', target: 'revenue', type: 'impacts', severity: 'medium', keywords: { source: ['opex', 'sg&a', 'r&d'], target: ['growth', 'investment'] } },
  ],

  patterns: [
    { name: 'Margin Expansion with Scale', domains: ['finance', 'revenue'], observed: 70, expected: 35, total: 100, description: 'Revenue growing >40% YoY with stable COGS leads to natural margin expansion' },
    { name: 'SG&A Leverage at Scale', domains: ['finance', 'executive'], observed: 65, expected: 30, total: 100, description: 'SG&A as % of revenue decreases 5-10 points per doubling of revenue' },
  ],

  outcomes: [
    { predicted: 'margin_expansion', predictedConfidence: 0.75, actual: 'margin_expansion', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'executive' },
  ],

  narrative: `P&L (Income Statement) Line Items — Top to Bottom:
• Revenue (Net Revenue) = Gross Revenue - Returns - Discounts - Allowances
• COGS (Cost of Goods Sold / Cost of Revenue) = Direct costs to deliver product/service (hosting, support staff, onboarding for SaaS)
• Gross Profit = Revenue - COGS
• Gross Margin (%) = Gross Profit ÷ Revenue × 100  [SaaS benchmark: 70-85%]
• Operating Expenses (OpEx) = SG&A + R&D + Marketing (does NOT include COGS)
  - SG&A = Selling, General & Administrative (sales salaries, office, legal, accounting)
  - R&D = Research & Development (engineering, product)
• EBITDA = Revenue - COGS - OpEx + Depreciation + Amortization  [Non-GAAP]
  - Formula 1: Net Income + Interest + Taxes + D&A
  - Formula 2: Operating Income (EBIT) + D&A
• EBITDA Margin (%) = EBITDA ÷ Revenue × 100
• EBIT (Operating Income) = Revenue - COGS - OpEx = EBITDA - D&A
• Operating Margin (%) = EBIT ÷ Revenue × 100
• Interest Expense = Cost of debt
• EBT = EBIT - Interest Expense
• Tax Expense
• Net Income = EBT - Taxes
• Net Margin (%) = Net Income ÷ Revenue × 100
• EPS = Net Income ÷ Shares Outstanding`,
};

// ============================================================================
// 4. FINANCIAL STATEMENTS — BALANCE SHEET
// ============================================================================

const financialBalanceSheet: TrainingPack = {
  id: 'core-financial-balance-sheet',
  title: 'Balance Sheet: Assets, Liabilities, Equity, Ratios',
  source: 'GAAP/IFRS accounting standards, Investopedia, Wikipedia',
  industry: 'General',
  domains: ['finance', 'executive'],
  confidence: 0.95,
  tags: ['balance-sheet', 'assets', 'liabilities', 'equity', 'ratios', 'core-metrics'],

  causalChains: [
    // Working capital impacts operational flexibility
    { source: 'finance', target: 'executive', metric: 'operational_flexibility', effectSize: 0.70, lagDays: 0, pValue: 0.002 },
    // Debt-to-equity affects cost of capital
    { source: 'finance', target: 'finance', metric: 'wacc', effectSize: 0.55, lagDays: 0, pValue: 0.005 },
    // DSO impacts cash flow
    { source: 'finance', target: 'finance', metric: 'operating_cash_flow', effectSize: -0.65, lagDays: 30, pValue: 0.003 },
    // Current ratio signals short-term solvency
    { source: 'finance', target: 'executive', metric: 'solvency_risk', effectSize: -0.75, lagDays: 0, pValue: 0.001 },
  ],

  businessRules: [
    {
      title: 'Current Ratio Solvency Warning',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.current_ratio', operator: 'less_than', value: 1.0 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Current ratio below 1.0 — current liabilities exceed current assets. Short-term solvency risk. Target: 1.5-2.0.' } },
      ],
      naturalLanguage: 'Current Ratio = Current Assets ÷ Current Liabilities. Below 1.0 signals inability to cover short-term obligations. Healthy: 1.5-2.0.',
      priority: 95,
    },
    {
      title: 'DSO Collection Efficiency',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.dso', operator: 'greater_than', value: 90 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'DSO exceeds 90 days — collection efficiency poor. SaaS benchmark: 30-60 days. Review AR aging and collection processes.' } },
      ],
      naturalLanguage: 'DSO = (Accounts Receivable ÷ Revenue) × 365. SaaS benchmark: 30-60 days. Above 90 days signals collection problems or poor billing practices.',
      priority: 85,
    },
    {
      title: 'Debt-to-Equity High Leverage',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.debt_to_equity', operator: 'greater_than', value: 3 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Debt-to-Equity ratio above 3x — high leverage. Increased financial risk and cost of capital.' } },
      ],
      naturalLanguage: 'D/E Ratio = Total Liabilities ÷ Shareholders Equity. Below 1x is conservative. 1-2x is moderate. Above 3x is highly leveraged.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'finance', target: 'executive', type: 'triggers', severity: 'critical', keywords: { source: ['liquidity', 'current_ratio', 'solvency'], target: ['survival', 'emergency'] } },
    { source: 'finance', target: 'finance', type: 'impacts', severity: 'high', keywords: { source: ['dso', 'receivables', 'collection'], target: ['cash', 'working_capital'] } },
  ],

  patterns: [
    { name: 'DSO Above 90 Cash Crunch', domains: ['finance'], observed: 72, expected: 30, total: 100, description: 'DSO >90 days leads to cash flow problems in 72% of companies' },
    { name: 'Working Capital Squeeze', domains: ['finance', 'executive'], observed: 68, expected: 25, total: 100, description: 'Negative working capital predicts operational disruption in 68% of cases' },
  ],

  outcomes: [
    { predicted: 'cash_crunch', predictedConfidence: 0.80, actual: 'cash_crunch', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'executive' },
  ],

  narrative: `Balance Sheet Formula & Line Items:
• FUNDAMENTAL EQUATION: Assets = Liabilities + Shareholders' Equity

ASSETS (what the company owns):
• Current Assets (convertible to cash within 1 year):
  - Cash & Cash Equivalents
  - Accounts Receivable (AR) — money owed by customers
  - Inventory — goods ready for sale
  - Prepaid Expenses
• Non-Current Assets (long-term):
  - Property, Plant & Equipment (PP&E) — physical assets, net of depreciation
  - Goodwill — premium paid in acquisitions above fair value
  - Intangible Assets — patents, trademarks, software, customer relationships
  - Long-term Investments

LIABILITIES (what the company owes):
• Current Liabilities (due within 1 year):
  - Accounts Payable (AP) — money owed to suppliers
  - Short-term Debt / Current portion of long-term debt
  - Deferred Revenue / Unearned Revenue — customer prepayments for future service
  - Accrued Expenses — incurred but not yet paid
• Non-Current Liabilities:
  - Long-term Debt (bonds, term loans)
  - Deferred Tax Liabilities

EQUITY (owner's residual interest):
• Common Stock + Additional Paid-In Capital (APIC)
• Retained Earnings = Prior Retained Earnings + Net Income - Dividends
• Treasury Stock (shares repurchased — reduces equity)

KEY RATIOS:
• Current Ratio = Current Assets ÷ Current Liabilities  [Healthy: 1.5-2.0]
• Quick Ratio = (Cash + AR + Short-term Investments) ÷ Current Liabilities  [Healthy: >1.0]
• Working Capital = Current Assets - Current Liabilities
• Debt-to-Equity = Total Liabilities ÷ Total Equity  [Lower = less risk]
• Book Value Per Share = Total Equity ÷ Shares Outstanding
• DSO = (Average AR ÷ Revenue) × 365  [SaaS target: 30-60 days]
• DPO = (Average AP ÷ COGS) × 365
• Cash Conversion Cycle = DSO + DIO - DPO`,
};

// ============================================================================
// 5. FINANCIAL STATEMENTS — CASH FLOW & DCF
// ============================================================================

const financialCashFlow: TrainingPack = {
  id: 'core-financial-cash-flow',
  title: 'Cash Flow Statement, FCF, DCF Valuation',
  source: 'GAAP/IFRS, Wall Street Prep, Corporate Finance Institute',
  industry: 'General',
  domains: ['finance', 'executive'],
  confidence: 0.95,
  tags: ['cash-flow', 'fcf', 'dcf', 'valuation', 'wacc', 'core-metrics'],

  causalChains: [
    // Operating cash flow drives company sustainability
    { source: 'finance', target: 'executive', metric: 'company_sustainability', effectSize: 0.85, lagDays: 0, pValue: 0.001 },
    // Negative FCF erodes equity value
    { source: 'finance', target: 'executive', metric: 'equity_value', effectSize: -0.75, lagDays: 90, pValue: 0.002 },
    // WACC impacts intrinsic valuation
    { source: 'finance', target: 'executive', metric: 'intrinsic_value', effectSize: -0.60, lagDays: 0, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Negative Free Cash Flow Alert',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.fcf', operator: 'less_than', value: 0 },
          { field: 'metrics.fcf_trend', operator: 'equals', value: 'declining' },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Negative and declining FCF. Assess burn rate and path to FCF positivity.' } },
      ],
      naturalLanguage: 'FCF = Operating Cash Flow - CapEx. Negative FCF acceptable during growth phase if funded by equity. Persistent negative FCF with declining trend is concerning.',
      priority: 88,
    },
  ],

  cascades: [
    { source: 'finance', target: 'executive', type: 'impacts', severity: 'critical', keywords: { source: ['cash_flow', 'fcf', 'operating_cf'], target: ['valuation', 'survival', 'investment'] } },
  ],

  patterns: [
    { name: 'FCF Positive Inflection', domains: ['finance', 'executive'], observed: 80, expected: 40, total: 100, description: 'FCF turning positive correlates with 3x valuation multiple expansion within 12 months' },
  ],

  outcomes: [
    { predicted: 'fcf_positive', predictedConfidence: 0.70, actual: 'fcf_positive', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'executive' },
  ],

  narrative: `Cash Flow Statement & Valuation:

THREE SECTIONS OF CASH FLOW STATEMENT:
1. Operating Cash Flow (CFO) = Net Income + Non-cash expenses (D&A, stock comp) + Changes in Working Capital
2. Investing Cash Flow (CFI) = Capital Expenditures + Acquisitions + Asset Sales + Investment Changes
3. Financing Cash Flow (CFF) = Debt Issuance/Repayment + Equity Issuance/Buybacks + Dividends

KEY METRICS:
• Free Cash Flow (FCF) = Operating Cash Flow - Capital Expenditures
• Unlevered FCF = EBIT(1-Tax) + D&A - CapEx - Change in Working Capital  [Used in DCF]
• FCF Margin = FCF ÷ Revenue × 100
• FCF Yield = FCF ÷ Market Cap × 100
• Cash Conversion = FCF ÷ Net Income  [>100% = earning more cash than reported income]

DCF VALUATION:
• DCF = Σ [FCFt ÷ (1+WACC)^t] + Terminal Value ÷ (1+WACC)^n
• WACC = (E/V × Re) + (D/V × Rd × (1-T))
  where E = equity, D = debt, V = E+D, Re = cost of equity, Rd = cost of debt, T = tax rate
• Terminal Value (Gordon Growth): FCFn × (1+g) ÷ (WACC - g)
• Terminal Value (Exit Multiple): EBITDAn × Exit Multiple
• Cost of Equity (Re) = Risk-Free Rate + Beta × Equity Risk Premium  [CAPM]
• Enterprise Value = Equity Value + Net Debt = Market Cap + Total Debt - Cash`,
};

// ============================================================================
// 6. PE/VC VALUATION METRICS
// ============================================================================

const peVcValuation: TrainingPack = {
  id: 'core-pe-vc-valuation',
  title: 'PE/VC Valuation: Multiples, IRR, MOIC, TVPI, DPI',
  source: 'Private equity industry standards, INSEAD, Carta',
  industry: 'General',
  domains: ['finance', 'executive', 'revenue'],
  confidence: 0.95,
  tags: ['valuation', 'pe', 'vc', 'multiples', 'irr', 'moic', 'core-metrics'],

  causalChains: [
    // Revenue growth drives EV/Revenue multiple
    { source: 'revenue', target: 'executive', metric: 'ev_revenue_multiple', effectSize: 0.80, lagDays: 90, pValue: 0.001 },
    // Margin improvement drives EV/EBITDA
    { source: 'finance', target: 'executive', metric: 'ev_ebitda_multiple', effectSize: 0.70, lagDays: 90, pValue: 0.002 },
    // NRR and growth together drive premium valuation
    { source: 'cs', target: 'executive', metric: 'valuation_premium', effectSize: 0.65, lagDays: 180, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Revenue Multiple Assessment',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.ev_revenue_multiple', operator: 'greater_than', value: 20 },
          { field: 'metrics.revenue_growth_yoy', operator: 'less_than', value: 50 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'EV/Revenue multiple >20x with growth <50% — potentially overvalued relative to growth. Review peer comparables.' } },
      ],
      naturalLanguage: 'EV/Revenue multiples above 20x typically require >50% YoY growth to justify. Median public SaaS: 6-10x. High-growth (>40%): 15-25x.',
      priority: 70,
    },
    {
      title: 'IRR Minimum Threshold',
      entityType: 'investment',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.projected_irr', operator: 'less_than', value: 20 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Projected IRR below 20% — below typical VC hurdle rate. Top quartile VC: 25%+. PE target: 20-25%.' } },
      ],
      naturalLanguage: 'VC target IRR: 25-35%. PE target IRR: 20-25%. IRR factors in time value — a 3x MOIC in 3 years ≈ 44% IRR, but in 7 years ≈ 17% IRR.',
      priority: 75,
    },
  ],

  cascades: [
    { source: 'revenue', target: 'executive', type: 'impacts', severity: 'high', keywords: { source: ['growth', 'arr', 'nrr'], target: ['valuation', 'multiple', 'ev'] } },
    { source: 'finance', target: 'executive', type: 'impacts', severity: 'high', keywords: { source: ['margin', 'ebitda', 'fcf'], target: ['valuation', 'exit'] } },
  ],

  patterns: [
    { name: 'Rule of 40 Valuation Correlation', domains: ['executive', 'finance'], observed: 78, expected: 35, total: 100, description: 'Every 10 points of Rule of 40 score correlates with ~2x EV/Revenue multiple premium' },
    { name: 'NRR Drives Premium Multiple', domains: ['cs', 'executive'], observed: 82, expected: 40, total: 100, description: 'NRR >130% correlates with top-decile EV/Revenue multiples' },
  ],

  outcomes: [
    { predicted: 'premium_valuation', predictedConfidence: 0.80, actual: 'premium_valuation', wasCorrect: true, sourceDomain: 'revenue', targetDomain: 'executive' },
  ],

  narrative: `PE/VC Valuation Metrics:

VALUATION MULTIPLES:
• Enterprise Value (EV) = Market Cap + Total Debt - Cash & Equivalents (or Equity Value + Net Debt)
• EV/Revenue = Enterprise Value ÷ Annual Revenue  [SaaS: 6-10x median, 15-25x high-growth]
• EV/EBITDA = Enterprise Value ÷ EBITDA  [General: 8-12x, Tech: 15-20x]
• P/E Ratio = Share Price ÷ Earnings Per Share  [Market: 15-25x typical]
• P/S Ratio = Market Cap ÷ Revenue
• P/B Ratio = Market Cap ÷ Book Value

PRE-MONEY & POST-MONEY:
• Pre-money Valuation = valuation of company BEFORE new investment
• Post-money Valuation = Pre-money + Investment Amount
• Ownership % = Investment Amount ÷ Post-money Valuation

PE/VC FUND METRICS:
• IRR = Internal Rate of Return (time-weighted, annualized). VC target: 25-35%. PE: 20-25%.
• MOIC = Total Value of Investment ÷ Total Capital Invested. 3x+ for VC is good. 2-3x for PE.
• TVPI = (Cumulative Distributions + Residual Value) ÷ Paid-In Capital = DPI + RVPI
• DPI = Total Distributions to LPs ÷ Total Capital Called. >1x means LPs got their money back.
• RVPI = Remaining Portfolio Value ÷ Total Capital Called. High early, should decline as fund matures.
• Dilution = (Pre-money Shares - Post-money Shares) ÷ Post-money Shares × 100

IRR vs MOIC RELATIONSHIP:
• 3x MOIC in 3 years ≈ 44% IRR
• 3x MOIC in 5 years ≈ 25% IRR
• 3x MOIC in 7 years ≈ 17% IRR
• 10x MOIC in 7 years ≈ 39% IRR`,
};

// ============================================================================
// 7. HR / PEOPLE METRICS
// ============================================================================

const hrPeopleMetrics: TrainingPack = {
  id: 'core-hr-people-metrics',
  title: 'HR/People: Turnover, Retention, Engagement, Cost',
  source: 'SHRM, BLS, HR industry standards',
  industry: 'General',
  domains: ['people', 'finance', 'executive'],
  confidence: 0.90,
  tags: ['hr', 'turnover', 'retention', 'engagement', 'headcount', 'core-metrics'],

  causalChains: [
    // High turnover increases cost per hire and recruitment spend
    { source: 'people', target: 'finance', metric: 'recruitment_cost', effectSize: 0.75, lagDays: 30, pValue: 0.002 },
    // Low engagement drives voluntary turnover
    { source: 'people', target: 'people', metric: 'voluntary_turnover', effectSize: -0.65, lagDays: 90, pValue: 0.003 },
    // Regretted attrition impacts team productivity
    { source: 'people', target: 'product', metric: 'team_velocity', effectSize: -0.55, lagDays: 30, pValue: 0.005 },
    // Revenue per employee signals operational efficiency
    { source: 'people', target: 'executive', metric: 'operational_efficiency', effectSize: 0.60, lagDays: 90, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'High Turnover Warning',
      entityType: 'department',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.annual_turnover_rate', operator: 'greater_than', value: 25 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Annual turnover rate >25% — significantly above 13% tech industry average. Investigate root causes.' } },
      ],
      naturalLanguage: 'Turnover Rate = (Separations ÷ Average Headcount) × 100. Tech industry avg: 13%. >20% is concerning. >25% indicates systemic issues.',
      priority: 85,
    },
    {
      title: 'Revenue Per Employee Benchmark',
      entityType: 'company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.revenue_per_employee', operator: 'less_than', value: 150000 },
          { field: 'company.stage', operator: 'in', value: ['growth', 'late'] },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Revenue per employee below $150K — below SaaS benchmark of $200K-$400K. Review hiring efficiency.' } },
      ],
      naturalLanguage: 'Revenue per Employee = Total Revenue ÷ FTE. SaaS benchmark: $200K-$400K. Top quartile: >$500K. Below $150K at growth stage indicates over-hiring.',
      priority: 75,
    },
  ],

  cascades: [
    { source: 'people', target: 'product', type: 'impacts', severity: 'high', keywords: { source: ['attrition', 'turnover', 'departure'], target: ['velocity', 'delivery', 'quality'] } },
    { source: 'people', target: 'finance', type: 'impacts', severity: 'high', keywords: { source: ['hiring', 'headcount', 'compensation'], target: ['burn', 'opex', 'cost'] } },
  ],

  patterns: [
    { name: 'Turnover Cost Multiplier', domains: ['people', 'finance'], observed: 75, expected: 30, total: 100, description: 'Each departure costs 33-200% of annual salary (BLS). Engineers cost closer to 200%.' },
    { name: 'Engagement Predicts Retention', domains: ['people'], observed: 80, expected: 40, total: 100, description: 'Low engagement scores (<7/10) predict 2.5x higher voluntary turnover within 6 months' },
  ],

  outcomes: [
    { predicted: 'attrition_spike', predictedConfidence: 0.75, actual: 'attrition_spike', wasCorrect: true, sourceDomain: 'people', targetDomain: 'executive' },
  ],

  narrative: `HR / People Metrics Formulas:
• Employee Turnover Rate = (# Separations ÷ Average # Employees) × 100  [Tech avg: 13%]
• Employee Retention Rate = (# Employees End of Period ÷ # Start of Period) × 100  [Target: >90%]
• Voluntary Turnover = (# Voluntary Separations ÷ Average Headcount) × 100
• Regretted Attrition = Departures of high-performers the company wanted to keep
• Cost per Hire = (Internal Costs + External Costs) ÷ # Hires  [Avg: $4,000-$7,000]
• Time to Fill = Days from job posting to offer acceptance  [Tech avg: 40-50 days]
• Quality of Hire = (Performance Rating + Ramp Time + Manager Satisfaction) ÷ 3
• eNPS = % Employee Promoters - % Employee Detractors  [Good: >20, Great: >50]
• Revenue per Employee = Total Revenue ÷ FTE  [SaaS: $200K-$400K]
• Profit per Employee = Net Income ÷ FTE
• Headcount / FTE = Full-Time Equivalent (part-time = 0.5 FTE)
• Span of Control = # Direct Reports per Manager  [Optimal: 5-8]
• Offer Acceptance Rate = Accepted Offers ÷ Total Offers × 100  [Target: >85%]
• 90-Day Turnover = New Hire Departures in first 90 days ÷ New Hires × 100  [Target: <10%]
• Compa-Ratio = Actual Salary ÷ Midpoint of Salary Range × 100  [Target: 95-105%]
• Benefits Cost = Total Benefits ÷ Revenue × 100  [Typical: 20-30% of salary]
• Human Capital ROI = (Revenue - OpEx - Compensation) ÷ Compensation`,
};

// ============================================================================
// 8. CLIENT SUCCESS / CUSTOMER SUCCESS METRICS
// ============================================================================

const clientSuccessMetrics: TrainingPack = {
  id: 'core-client-success-metrics',
  title: 'Client Success: NPS, CSAT, Health Score, Renewal, Engagement',
  source: 'Gainsight, ChurnZero, Totango, industry standards',
  industry: 'SaaS',
  domains: ['cs', 'account-management', 'revenue', 'executive'],
  confidence: 0.92,
  tags: ['nps', 'csat', 'health-score', 'renewal', 'engagement', 'core-metrics'],

  causalChains: [
    // NPS predicts renewal rate
    { source: 'cs', target: 'account-management', metric: 'renewal_rate', effectSize: 0.70, lagDays: 90, pValue: 0.002 },
    // Health score predicts churn
    { source: 'cs', target: 'cs', metric: 'churn_probability', effectSize: -0.80, lagDays: 60, pValue: 0.001 },
    // Time to value impacts early churn
    { source: 'cs', target: 'cs', metric: 'early_churn', effectSize: -0.65, lagDays: 30, pValue: 0.003 },
    // Product adoption drives expansion
    { source: 'product', target: 'account-management', metric: 'expansion_probability', effectSize: 0.60, lagDays: 60, pValue: 0.005 },
    // Support ticket volume negatively impacts NPS
    { source: 'cs', target: 'cs', metric: 'nps', effectSize: -0.50, lagDays: 14, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'NPS Detractor Alert',
      entityType: 'client',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.nps_score', operator: 'less_than', value: 7 },
          { field: 'client.tier', operator: 'in', value: ['enterprise', 'strategic'] },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Enterprise client is NPS detractor (score <7). Immediate executive outreach required.' } },
      ],
      naturalLanguage: 'NPS = % Promoters (9-10) - % Detractors (0-6). Passives (7-8) excluded. Range: -100 to +100. SaaS benchmark: +30 to +50. Above 70 is world-class.',
      priority: 92,
    },
    {
      title: 'Health Score Critical',
      entityType: 'client',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.health_score', operator: 'less_than', value: 40 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Client health score below 40/100 — high churn risk. Activate retention playbook.' } },
        { type: 'set_flag', params: { flag: 'at_risk', value: true } },
      ],
      naturalLanguage: 'Health Score composite: Product Usage (40%) + Support Sentiment (20%) + Engagement (20%) + Business Outcomes (20%). Below 40 = red, 40-70 = yellow, >70 = green.',
      priority: 95,
    },
    {
      title: 'Renewal Risk Detection',
      entityType: 'client',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'client.days_to_renewal', operator: 'less_than', value: 90 },
          { field: 'metrics.health_score', operator: 'less_than', value: 60 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Renewal within 90 days with health score <60. Escalate to VP CS immediately.' } },
        { type: 'require_approval', params: { level: 'VP_CS', reason: 'At-risk renewal' } },
      ],
      naturalLanguage: 'Clients renewing within 90 days with low health scores need immediate intervention. Typical save rate: 30-50% with proactive outreach.',
      priority: 98,
    },
  ],

  cascades: [
    { source: 'cs', target: 'account-management', type: 'triggers', severity: 'critical', keywords: { source: ['churn', 'risk', 'detractor', 'unhappy'], target: ['renewal', 'save', 'retain'] } },
    { source: 'cs', target: 'revenue', type: 'impacts', severity: 'high', keywords: { source: ['expansion', 'adoption', 'engagement'], target: ['upsell', 'cross-sell', 'growth'] } },
  ],

  patterns: [
    { name: 'NPS Predicts Renewal', domains: ['cs', 'account-management'], observed: 82, expected: 40, total: 100, description: 'Promoters (NPS 9-10) renew at 95%+ rate vs 65% for passives and 30% for detractors' },
    { name: 'Time to Value Churn Window', domains: ['cs'], observed: 75, expected: 30, total: 100, description: 'Customers not achieving first value milestone within 30 days churn at 2.5x the rate' },
    { name: 'Usage Decline Churn Signal', domains: ['product', 'cs'], observed: 80, expected: 35, total: 100, description: 'DAU declining >30% over 2 weeks predicts churn within 60 days in 80% of cases' },
  ],

  outcomes: [
    { predicted: 'churn', predictedConfidence: 0.80, actual: 'churn', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'account-management' },
    { predicted: 'expansion', predictedConfidence: 0.70, actual: 'expansion', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'revenue' },
  ],

  narrative: `Client Success Metrics Formulas:
• NPS = % Promoters (9-10) - % Detractors (0-6). Passives (7-8) excluded. Range: -100 to +100. SaaS: +30 to +50 good, +70 world-class.
• CSAT = (# Satisfied Responses ÷ Total Responses) × 100  [Good: >80%]
• CES (Customer Effort Score) = Average score on 1-7 scale  [Low = good]
• Health Score = Weighted composite of Usage (40%) + Support (20%) + Engagement (20%) + Outcomes (20%)
• Customer Churn Rate = (# Customers Lost ÷ # Customers at Start) × 100  [SaaS: <5% annually is good]
• Revenue Churn = (MRR Lost from Churn ÷ Starting MRR) × 100
• Logo Retention = 1 - Logo Churn Rate
• NRR = (Start MRR + Expansion - Contraction - Churn) ÷ Start MRR × 100  [Target: >110%]
• GRR = (Start MRR - Contraction - Churn) ÷ Start MRR × 100  [Target: >90%]
• Time to Value (TTV) = Days from contract signed to first value realization  [Target: <30 days]
• Onboarding Completion Rate = Customers completing onboarding ÷ Total new customers × 100
• DAU/MAU Stickiness = Daily Active Users ÷ Monthly Active Users  [Good: >25%]
• Feature Adoption Rate = Users using feature ÷ Total active users × 100
• First Response Time = Avg time to first support response  [Target: <1 hour]
• First Contact Resolution = Issues resolved on first contact ÷ Total issues × 100  [Target: >70%]
• Renewal Rate = (# Renewed ÷ # Up for Renewal) × 100  [Enterprise target: >90%]
• Expansion Rate = Expansion Revenue ÷ Starting Revenue × 100
• Customer Engagement Score = Weighted average of login frequency, feature usage, session duration`,
};

// ============================================================================
// 9. ENGINEERING / PRODUCT METRICS
// ============================================================================

const engineeringProductMetrics: TrainingPack = {
  id: 'core-engineering-product-metrics',
  title: 'Engineering: DORA, Velocity, Quality; Product: Adoption, Retention',
  source: 'DORA Research, Google DevOps, Atlassian, industry standards',
  industry: 'SaaS',
  domains: ['product', 'executive'],
  confidence: 0.90,
  tags: ['dora', 'velocity', 'quality', 'adoption', 'retention', 'engineering', 'core-metrics'],

  causalChains: [
    // Deployment frequency correlates with team performance
    { source: 'product', target: 'executive', metric: 'team_performance', effectSize: 0.65, lagDays: 30, pValue: 0.005 },
    // High change failure rate impacts stability
    { source: 'product', target: 'cs', metric: 'customer_incidents', effectSize: 0.60, lagDays: 7, pValue: 0.005 },
    // Technical debt slows velocity
    { source: 'product', target: 'product', metric: 'velocity', effectSize: -0.70, lagDays: 90, pValue: 0.002 },
    // Product adoption drives expansion revenue
    { source: 'product', target: 'revenue', metric: 'expansion_revenue', effectSize: 0.55, lagDays: 60, pValue: 0.008 },
    // Bug escape rate impacts customer satisfaction
    { source: 'product', target: 'cs', metric: 'customer_satisfaction', effectSize: -0.50, lagDays: 14, pValue: 0.01 },
  ],

  businessRules: [
    {
      title: 'DORA Deployment Frequency Check',
      entityType: 'team',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.deployment_frequency', operator: 'less_than', value: 1 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Deployment frequency below 1/week — elite teams deploy multiple times daily. Review CI/CD pipeline and batch sizes.' } },
      ],
      naturalLanguage: 'DORA deployment frequency: Elite = multiple/day, High = daily-weekly, Medium = weekly-monthly, Low = monthly+.',
      priority: 70,
    },
    {
      title: 'Change Failure Rate High',
      entityType: 'team',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.change_failure_rate_pct', operator: 'greater_than', value: 15 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Change failure rate >15% — elite teams: <5%. Review testing, code review, and rollback procedures.' } },
      ],
      naturalLanguage: 'DORA change failure rate: Elite <5%, High 5-10%, Medium 10-15%, Low >15%. Measures % of deployments causing failure.',
      priority: 80,
    },
    {
      title: 'Product Adoption Below Threshold',
      entityType: 'feature',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.feature_adoption_rate', operator: 'less_than', value: 20 },
          { field: 'feature.launch_days_ago', operator: 'greater_than', value: 30 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Feature adoption <20% after 30 days. Consider: poor discoverability, lack of user education, or feature-market mismatch.' } },
      ],
      naturalLanguage: 'Feature adoption rate target: >30% within first 30 days of launch. Below 20% after 30 days signals discovery or value problem.',
      priority: 65,
    },
  ],

  cascades: [
    { source: 'product', target: 'cs', type: 'impacts', severity: 'high', keywords: { source: ['bug', 'incident', 'outage', 'regression'], target: ['tickets', 'satisfaction', 'nps'] } },
    { source: 'product', target: 'revenue', type: 'enables', severity: 'high', keywords: { source: ['feature', 'adoption', 'usage'], target: ['expansion', 'upsell', 'differentiation'] } },
  ],

  patterns: [
    { name: 'DORA Elite Performer Correlation', domains: ['product', 'executive'], observed: 78, expected: 35, total: 100, description: 'Elite DORA performers 2x as likely to exceed organizational goals' },
    { name: 'Technical Debt Velocity Drain', domains: ['product'], observed: 72, expected: 30, total: 100, description: 'Tech debt >30% of backlog correlates with 40% velocity reduction over 2 quarters' },
    { name: 'Adoption Drives Expansion', domains: ['product', 'revenue'], observed: 75, expected: 35, total: 100, description: 'Feature adoption >60% correlates with 3x higher expansion probability' },
  ],

  outcomes: [
    { predicted: 'velocity_decline', predictedConfidence: 0.75, actual: 'velocity_decline', wasCorrect: true, sourceDomain: 'product', targetDomain: 'executive' },
    { predicted: 'feature_success', predictedConfidence: 0.65, actual: 'feature_success', wasCorrect: true, sourceDomain: 'product', targetDomain: 'revenue' },
  ],

  narrative: `Engineering & Product Metrics:

DORA METRICS (4 Key DevOps Metrics):
• Deployment Frequency: How often code deploys to production. Elite: multiple/day. High: daily-weekly. Low: monthly+.
• Lead Time for Changes: Time from commit to production. Elite: <1 hour. High: 1 day-1 week. Low: 1-6 months.
• Change Failure Rate: % of deployments causing failure. Elite: <5%. High: 5-10%. Low: >15%.
• Failed Deployment Recovery Time (MTTR): Time to restore service. Elite: <1 hour. High: <1 day. Low: >1 week.

ENGINEERING VELOCITY:
• Velocity = Story Points completed per sprint  [Track trend, not absolute number]
• Cycle Time = Time from work started to work delivered
• Throughput = # Stories/tickets completed per time period
• Sprint Burndown = Remaining work vs time in sprint
• Code Coverage = Lines tested ÷ Total lines × 100  [Target: >80%]
• Bug Escape Rate = Bugs found in production ÷ Total bugs × 100  [Target: <10%]
• Defect Density = Defects ÷ Lines of Code (or function points)
• Pull Request Cycle Time = Time from PR opened to merged  [Target: <24 hours]
• Code Review Turnaround = Time from PR submitted to first review  [Target: <4 hours]

PRODUCT METRICS:
• Product-Market Fit Score (Sean Ellis): % users who'd be "very disappointed" if product disappeared. Target: >40%.
• Activation Rate = Users completing key action ÷ Total signups × 100
• DAU/MAU Stickiness = Daily Active ÷ Monthly Active × 100  [Good: >25%]
• Retention Curve: Day 1 (>60%), Day 7 (>30%), Day 30 (>15%)
• AARRR Pirate Metrics: Acquisition → Activation → Retention → Revenue → Referral
• RICE Score = (Reach × Impact × Confidence) ÷ Effort  [Prioritization framework]
• Feature Adoption = Users of feature ÷ Total active users × 100
• Time to Value = Time from signup to first "aha moment"

QUALITY:
• System Uptime/SLA: 99.9% = 8.76h downtime/year, 99.99% = 52.6min/year
• P50/P90/P99 Latency: Median, 90th, 99th percentile response times
• Apdex Score = (Satisfied + Tolerating/2) ÷ Total. 1.0 = perfect, >0.94 = excellent.
• Error Rate = Errors ÷ Total Requests × 100  [Target: <0.1%]`,
};

// ============================================================================
// 10. REVENUE & DEAL INTELLIGENCE
// ============================================================================

const revenueDealMetrics: TrainingPack = {
  id: 'core-revenue-deal-metrics',
  title: 'Revenue: Pipeline, Win Rate, ACV, Sales Cycle, Forecasting',
  source: 'Salesforce, HubSpot, Gartner, industry standards',
  industry: 'SaaS',
  domains: ['revenue', 'account-management', 'finance', 'executive'],
  confidence: 0.92,
  tags: ['pipeline', 'win-rate', 'acv', 'forecast', 'sales', 'core-metrics'],

  causalChains: [
    // Pipeline coverage predicts quota attainment
    { source: 'revenue', target: 'revenue', metric: 'quota_attainment', effectSize: 0.75, lagDays: 90, pValue: 0.002 },
    // Win rate impacts revenue efficiency
    { source: 'revenue', target: 'finance', metric: 'sales_efficiency', effectSize: 0.65, lagDays: 60, pValue: 0.003 },
    // Sales cycle length impacts cash flow
    { source: 'revenue', target: 'finance', metric: 'cash_flow_timing', effectSize: -0.55, lagDays: 0, pValue: 0.005 },
    // Deal velocity impacts ARR growth
    { source: 'revenue', target: 'executive', metric: 'arr_growth', effectSize: 0.70, lagDays: 30, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'Pipeline Coverage Warning',
      entityType: 'team',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.pipeline_coverage', operator: 'less_than', value: 3 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Pipeline coverage below 3x — insufficient pipeline to hit quota. Target: 3x-4x coverage.' } },
      ],
      naturalLanguage: 'Pipeline Coverage = Total Pipeline Value ÷ Quota. Target: 3x-4x. Below 3x means high risk of missing target.',
      priority: 88,
    },
    {
      title: 'Win Rate Decline',
      entityType: 'team',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'metrics.win_rate', operator: 'less_than', value: 20 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Win rate below 20% — SaaS benchmark: 20-30%. Review deal qualification, competitive positioning, and sales process.' } },
      ],
      naturalLanguage: 'Win Rate = Closed Won ÷ (Closed Won + Closed Lost) × 100. SaaS benchmark: 20-30%. Enterprise: 15-25%. SMB/PLG: 25-40%.',
      priority: 82,
    },
  ],

  cascades: [
    { source: 'revenue', target: 'finance', type: 'impacts', severity: 'critical', keywords: { source: ['pipeline', 'deals', 'bookings'], target: ['revenue', 'forecast', 'cash'] } },
    { source: 'revenue', target: 'executive', type: 'impacts', severity: 'high', keywords: { source: ['growth', 'new_arr', 'win_rate'], target: ['valuation', 'target'] } },
  ],

  patterns: [
    { name: 'Pipeline Coverage to Attainment', domains: ['revenue'], observed: 78, expected: 35, total: 100, description: 'Teams with 3x+ pipeline coverage hit quota 78% of the time vs 35% for teams below 3x' },
    { name: 'Sales Cycle Lengthening Warning', domains: ['revenue', 'executive'], observed: 70, expected: 30, total: 100, description: 'Sales cycle lengthening >20% quarter-over-quarter predicts revenue miss in 70% of cases' },
  ],

  outcomes: [
    { predicted: 'quota_miss', predictedConfidence: 0.75, actual: 'quota_miss', wasCorrect: true, sourceDomain: 'revenue', targetDomain: 'executive' },
  ],

  narrative: `Revenue & Deal Intelligence Metrics:
• Pipeline Value = Sum of weighted deal values at each stage
• Pipeline Coverage = Total Pipeline ÷ Quota  [Target: 3x-4x]
• Win Rate = Closed Won ÷ (Closed Won + Closed Lost) × 100  [SaaS: 20-30%]
• Average Deal Size / ACV = Total Bookings ÷ # Deals Closed
• Total Contract Value (TCV) = ACV × Contract Length (years)
• Sales Cycle Length = Avg days from opportunity created to closed won  [Enterprise: 90-180 days, SMB: 14-45 days]
• Deal Velocity = (# Opportunities × Win Rate × ACV) ÷ Sales Cycle Length
• Bookings vs Revenue vs Billings:
  - Bookings = Total value of signed contracts (forward-looking commitment)
  - Revenue = Recognized revenue per ASC 606 (as service is delivered)
  - Billings = Amounts invoiced/collected (cash basis)
• Quota Attainment = Actual Bookings ÷ Quota × 100  [Target: >100%]
• Sales Productivity = Revenue per Sales Rep
• Forecast Accuracy = Actual Revenue ÷ Forecasted Revenue × 100  [Target: 90-110%]
• Pipeline-to-Close Ratio = Pipeline Created ÷ Revenue Closed
• Stage Conversion Rates = Opportunities advancing ÷ Opportunities at stage × 100
• Revenue Concentration Risk = Top 10 clients revenue ÷ Total revenue × 100  [<20% is healthy]
• Net New ARR = New ARR + Expansion ARR - Churned ARR - Contraction ARR`,
};

// ============================================================================
// CORE METRICS LIBRARY EXPORT
// ============================================================================

/**
 * Comprehensive VC/PE-grade business metrics knowledge.
 * 10 training packs covering all domains a VC Principal or PE Manager
 * would evaluate when analyzing a company.
 *
 * Load them all: `CORE_METRICS_LIBRARY.forEach(p => trainer.trainInMemory(p))`
 */
export const CORE_METRICS_LIBRARY: TrainingPack[] = [
  saasUnitEconomics,
  saasGrowthEfficiency,
  financialPnL,
  financialBalanceSheet,
  financialCashFlow,
  peVcValuation,
  hrPeopleMetrics,
  clientSuccessMetrics,
  engineeringProductMetrics,
  revenueDealMetrics,
];

/** Get a core metrics pack by ID */
export function getCoreMetricPackById(id: string): TrainingPack | undefined {
  return CORE_METRICS_LIBRARY.find((p) => p.id === id);
}

/** Get core metrics packs for a specific domain */
export function getCoreMetricsByDomain(domain: string): TrainingPack[] {
  return CORE_METRICS_LIBRARY.filter((p) =>
    p.domains.some((d) => d.toLowerCase() === domain.toLowerCase()),
  );
}

/** Get all core metric formulas as narrative text (for prompt injection) */
export function getAllCoreMetricNarratives(): string {
  return CORE_METRICS_LIBRARY.map((p) => `=== ${p.title} ===\n${p.narrative}`).join(
    '\n\n',
  );
}
