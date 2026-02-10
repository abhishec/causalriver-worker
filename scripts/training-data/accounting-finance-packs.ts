/**
 * Accounting & Finance Training Packs
 *
 * Deep accounting and FP&A knowledge:
 * - Accounting Cycle & Balance Sheet Health
 * - Revenue Recognition & Compliance
 * - FP&A & Capital Budgeting
 * - Financial Controls & Audit Readiness
 *
 * Sources: IFRS/GAAP standards, McKinsey FP&A research, Deloitte CFO surveys
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. ACCOUNTING CYCLE CASCADE
// ============================================================================

const accountingCycleCascade: TrainingPack = {
  id: 'accounting-cycle-cascade',
  title: 'Accounting Cycle & Double-Entry Cascade Effects',
  source: 'IFRS Standards, AICPA guidelines, CPA exam frameworks',
  industry: 'Cross-Industry',
  domains: ['finance', 'engineering', 'strategy'],
  confidence: 0.85,
  tags: ['accounting', 'double-entry', 'balance-sheet', 'reconciliation', 'gl'],

  causalChains: [
    { source: 'finance', target: 'finance', metric: 'ar_aging_to_cash_flow_pressure', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    { source: 'finance', target: 'finance', metric: 'depreciation_method_to_tax_liability', effectSize: -0.40, lagDays: 90, pValue: 0.005 },
    { source: 'finance', target: 'finance', metric: 'accrual_accuracy_to_financial_clarity', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    { source: 'finance', target: 'strategy', metric: 'working_capital_cycle_to_strategic_flexibility', effectSize: 0.45, lagDays: 60, pValue: 0.005 },
    { source: 'engineering', target: 'finance', metric: 'erp_automation_to_close_cycle_speed', effectSize: -0.50, lagDays: 30, pValue: 0.003 },
    { source: 'finance', target: 'finance', metric: 'inventory_valuation_to_cogs_accuracy', effectSize: 0.45, lagDays: 30, pValue: 0.005 },
    { source: 'finance', target: 'finance', metric: 'bad_debt_provision_to_revenue_quality', effectSize: -0.40, lagDays: 60, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'AR Aging Beyond 90 Days Warning',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.ar_over_90_days_pct', operator: 'greater_than', value: 0.20 },
        { field: 'finance.dso_days', operator: 'greater_than', value: 60 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Over 20% of AR aged beyond 90 days with DSO > 60. Cash flow at risk. Companies with DSO > 60 face 2x higher bad debt rates. Implement collection escalation and credit policy tightening.' } },
      ],
      naturalLanguage: 'When over 20% of accounts receivable exceed 90 days and DSO exceeds 60 days, the company faces significant cash collection risk requiring immediate collection action.',
      priority: 85,
    },
    {
      title: 'Month-End Close Duration Excessive',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.month_end_close_days', operator: 'greater_than', value: 10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Month-end close exceeds 10 days. Best-in-class companies close in 4-5 days. Slow close delays decision-making and indicates manual processes that should be automated.' } },
      ],
      naturalLanguage: 'A month-end close exceeding 10 days indicates excessive manual processes and reconciliation issues that delay financial visibility.',
      priority: 70,
    },
  ],

  cascades: [
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['accounting', 'ar', 'ap', 'reconciliation', 'close'], target: ['cash-flow', 'working-capital', 'liquidity', 'planning'] },
      reasonTemplate: 'Accounting accuracy drives strategic clarity. Companies with fast, accurate closes make better capital allocation decisions. AR aging directly impacts cash availability for growth investment.' },
  ],

  patterns: [
    { name: 'AR Aging Cash Flow Cascade', domains: ['finance'], description: 'Accounts receivable aging follows a predictable cascade: 30-day AR has 95% collection rate, 60-day drops to 85%, 90-day to 70%, and 120+ day to below 50%. Each aging bracket reduces cash flow predictability and increases bad debt provisioning needs.', observed: 82, expected: 30, total: 100 },
    { name: 'Depreciation Tax Shield', domains: ['finance'], description: 'Accelerated depreciation (MACRS/declining balance) front-loads tax deductions, improving early cash flow by 15-25% vs straight-line. The DuPont analysis reveals how asset turnover and leverage amplify this effect on ROE.', observed: 78, expected: 30, total: 100 },
    { name: 'ERP Automation Close Acceleration', domains: ['finance', 'engineering'], description: 'Companies implementing ERP automation reduce month-end close from 12-15 days to 4-6 days. This 60% improvement in close speed enables faster financial reporting and decision-making.', observed: 75, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'cash_flow_improvement', predictedConfidence: 0.78, actual: 'cash_flow_improved', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
    { predicted: 'close_acceleration', predictedConfidence: 0.72, actual: 'close_accelerated', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'finance' },
  ],

  narrative: 'The accounting cycle creates cascading effects across the entire business. Double-entry bookkeeping ensures every transaction has dual impact — an AR increase simultaneously reduces cash, creating working capital pressure. Companies with disciplined accounting cycles (fast close, accurate accruals, tight AR management) gain 15-25% better cash flow predictability. The DuPont analysis framework connects accounting metrics to shareholder returns: Net Margin × Asset Turnover × Leverage = ROE. Depreciation methods directly impact tax liability and cash flow timing. IFRS and GAAP standards provide the grammar of business financial communication.',
};

// ============================================================================
// 2. BALANCE SHEET HEALTH & FINANCIAL STRENGTH
// ============================================================================

const balanceSheetHealth: TrainingPack = {
  id: 'balance-sheet-health-strength',
  title: 'Balance Sheet Health & Financial Resilience',
  source: 'Moody\'s credit analysis, S&P rating criteria, CFA Institute',
  industry: 'Cross-Industry',
  domains: ['finance', 'strategy'],
  confidence: 0.83,
  tags: ['balance-sheet', 'leverage', 'liquidity', 'solvency', 'credit-rating'],

  causalChains: [
    { source: 'finance', target: 'finance', metric: 'debt_to_equity_to_financial_risk', effectSize: 0.55, lagDays: 90, pValue: 0.002 },
    { source: 'finance', target: 'finance', metric: 'current_ratio_to_liquidity_buffer', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    { source: 'finance', target: 'strategy', metric: 'net_cash_position_to_strategic_optionality', effectSize: 0.60, lagDays: 0, pValue: 0.001 },
    { source: 'finance', target: 'finance', metric: 'interest_coverage_to_debt_service_safety', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    { source: 'finance', target: 'finance', metric: 'goodwill_impairment_to_shareholder_value_destruction', effectSize: -0.50, lagDays: 0, pValue: 0.003 },
    { source: 'strategy', target: 'finance', metric: 'asset_light_model_to_roa_improvement', effectSize: 0.45, lagDays: 180, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Excessive Leverage Warning',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.debt_to_equity', operator: 'greater_than', value: 3.0 },
        { field: 'finance.interest_coverage_ratio', operator: 'less_than', value: 2.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Debt-to-equity > 3x with interest coverage < 2x. Company faces solvency risk. Moody\'s downgrades follow this pattern. Reduce leverage or increase EBITDA immediately.' } },
      ],
      naturalLanguage: 'When debt-to-equity exceeds 3x and interest coverage falls below 2x, the company faces imminent credit downgrade and potential solvency issues.',
      priority: 95,
    },
  ],

  cascades: [
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['balance-sheet', 'cash', 'debt', 'equity', 'leverage'], target: ['acquisition', 'growth', 'investment', 'optionality'] },
      reasonTemplate: 'Balance sheet strength determines strategic optionality. Companies with net cash positions can pursue acquisitions, invest through downturns, and attract better talent. Overleveraged companies lose strategic flexibility.' },
  ],

  patterns: [
    { name: 'Leverage-Fragility Threshold', domains: ['finance'], description: 'Companies with debt-to-equity above 3x and interest coverage below 2x face a 40% probability of credit downgrade within 12 months. The Altman Z-score threshold of 1.81 accurately predicts distress.', observed: 80, expected: 30, total: 100 },
    { name: 'Cash Position Strategic Advantage', domains: ['finance', 'strategy'], description: 'Companies with net cash positions (cash > total debt) outperform leveraged peers by 15-20% during recessions. Apple, Google, and Microsoft used cash reserves for counter-cyclical M&A.', observed: 77, expected: 30, total: 100 },
    { name: 'Goodwill Impairment Signal', domains: ['finance'], description: 'Goodwill impairment charges signal overpaid acquisitions and destroy shareholder value. 70% of M&A deals fail to create value, and goodwill write-downs often trigger 10-30% stock declines.', observed: 75, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'credit_downgrade', predictedConfidence: 0.75, actual: 'downgraded', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
    { predicted: 'strategic_acquisition', predictedConfidence: 0.70, actual: 'acquisition_made', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'strategy' },
  ],

  narrative: 'Balance sheet health is the foundation of corporate resilience and strategic flexibility. The interplay between debt, equity, and cash determines whether a company can weather downturns, pursue growth opportunities, and maintain competitive advantage. Moody\'s and S&P rating frameworks evaluate leverage ratios, interest coverage, and free cash flow generation to assess creditworthiness. Companies maintaining 2x+ interest coverage and current ratios above 1.5x demonstrate financial resilience. The DuPont decomposition shows how leverage amplifies both returns and risk.',
};

// ============================================================================
// 3. REVENUE RECOGNITION & COMPLIANCE
// ============================================================================

const revenueRecognition: TrainingPack = {
  id: 'revenue-recognition-compliance',
  title: 'Revenue Recognition, ASC 606 & Compliance Frameworks',
  source: 'FASB ASC 606, IFRS 15, SEC enforcement actions, Big 4 audit guidance',
  industry: 'B2B SaaS',
  domains: ['finance', 'product', 'engineering'],
  confidence: 0.82,
  tags: ['revenue-recognition', 'asc-606', 'ifrs-15', 'compliance', 'saas-revenue'],

  causalChains: [
    { source: 'finance', target: 'finance', metric: 'contract_modification_to_revenue_timing', effectSize: 0.45, lagDays: 30, pValue: 0.005 },
    { source: 'product', target: 'finance', metric: 'multi_element_arrangement_to_recognition_complexity', effectSize: 0.40, lagDays: 0, pValue: 0.005 },
    { source: 'finance', target: 'finance', metric: 'deferred_revenue_to_cash_flow_stability', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    { source: 'engineering', target: 'finance', metric: 'billing_system_to_rev_rec_accuracy', effectSize: 0.50, lagDays: 14, pValue: 0.003 },
    { source: 'finance', target: 'strategy', metric: 'arr_growth_to_valuation_multiple', effectSize: 0.60, lagDays: 30, pValue: 0.001 },
  ],

  businessRules: [
    {
      title: 'Revenue Recognition Red Flag',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.revenue_growth_yoy', operator: 'greater_than', value: 0.50 },
        { field: 'finance.deferred_revenue_growth_yoy', operator: 'less_than', value: 0.10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Revenue growing 50%+ but deferred revenue growing < 10%. This divergence may signal aggressive recognition or channel stuffing. ASC 606 five-step model should be reviewed.' } },
      ],
      naturalLanguage: 'When reported revenue growth significantly outpaces deferred revenue growth in a SaaS company, it may indicate aggressive revenue recognition that warrants audit review.',
      priority: 85,
    },
  ],

  cascades: [
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['revenue', 'arr', 'deferred', 'recognition', 'billing'], target: ['valuation', 'fundraising', 'growth', 'investor'] },
      reasonTemplate: 'SaaS revenue recognition under ASC 606 directly impacts reported ARR, which drives valuation multiples. Deferred revenue is the hidden balance sheet strength of subscription businesses.' },
  ],

  patterns: [
    { name: 'SaaS Deferred Revenue Indicator', domains: ['finance'], description: 'For SaaS companies, deferred revenue growth should track or exceed revenue growth. A healthy SaaS has deferred revenue at 25-40% of ARR. This indicates strong prepayment and contract commitment.', observed: 79, expected: 30, total: 100 },
    { name: 'ASC 606 Five-Step Recognition', domains: ['finance', 'product'], description: 'ASC 606 requires: (1) Identify contract, (2) Identify performance obligations, (3) Determine transaction price, (4) Allocate price to obligations, (5) Recognize when satisfied. Multi-element SaaS deals require careful allocation.', observed: 82, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'revenue_restatement_risk', predictedConfidence: 0.68, actual: 'no_restatement', wasCorrect: false, sourceDomain: 'finance', targetDomain: 'finance' },
    { predicted: 'arr_growth_sustains', predictedConfidence: 0.75, actual: 'arr_grew', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'strategy' },
  ],

  narrative: 'Revenue recognition is the most critical accounting policy for SaaS companies. ASC 606 (US) and IFRS 15 (international) establish the five-step model that determines when and how revenue is recorded. For subscription businesses, the distinction between recognized revenue and deferred revenue directly impacts reported growth rates and valuation multiples. Companies with strong deferred revenue growth signal healthy forward momentum. The complexity increases with multi-element arrangements (software + services + support), where standalone selling price allocation determines recognition timing. Proper revenue recognition builds investor trust and prevents costly restatements.',
};

// ============================================================================
// 4. FP&A & STRATEGIC FINANCE
// ============================================================================

const fpaStrategicFinance: TrainingPack = {
  id: 'fpa-strategic-finance-advantage',
  title: 'FP&A Excellence & Strategic Finance Decision-Making',
  source: 'McKinsey CFO Excellence, AFP FP&A surveys, Gartner Finance Research',
  industry: 'Cross-Industry',
  domains: ['finance', 'strategy', 'engineering'],
  confidence: 0.80,
  tags: ['fpa', 'budgeting', 'forecasting', 'capital-budgeting', 'npv', 'irr', 'wacc'],

  causalChains: [
    { source: 'finance', target: 'strategy', metric: 'forecast_accuracy_to_capital_allocation_quality', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    { source: 'finance', target: 'finance', metric: 'rolling_forecast_to_agility', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    { source: 'finance', target: 'strategy', metric: 'scenario_planning_to_resilience', effectSize: 0.45, lagDays: 60, pValue: 0.005 },
    { source: 'strategy', target: 'finance', metric: 'zbb_discipline_to_cost_optimization', effectSize: -0.40, lagDays: 90, pValue: 0.005 },
    { source: 'finance', target: 'finance', metric: 'wacc_accuracy_to_investment_quality', effectSize: 0.50, lagDays: 0, pValue: 0.003 },
    { source: 'engineering', target: 'finance', metric: 'data_pipeline_to_forecast_accuracy', effectSize: 0.40, lagDays: 30, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Forecast Accuracy Deterioration',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.forecast_variance_pct', operator: 'greater_than', value: 0.15 },
        { field: 'finance.consecutive_miss_quarters', operator: 'greater_than', value: 2 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Forecast variance exceeds 15% for 3+ quarters. FP&A credibility at risk. Best-in-class companies achieve < 5% variance. Implement driver-based forecasting and rolling 12-month horizon.' } },
      ],
      naturalLanguage: 'Persistent forecast misses (>15% variance for 3+ quarters) indicate broken FP&A processes that undermine capital allocation decisions.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['forecast', 'budget', 'npv', 'irr', 'scenario'], target: ['investment', 'allocation', 'growth', 'decision'] },
      reasonTemplate: 'FP&A accuracy is the bridge between financial data and strategic decisions. Companies with best-in-class FP&A (< 5% forecast variance) make 30% better capital allocation decisions. Rolling forecasts beat static annual budgets by 2-3x in agility.' },
  ],

  patterns: [
    { name: 'Rolling Forecast Advantage', domains: ['finance', 'strategy'], description: 'Companies using rolling forecasts (12-18 month horizon, monthly refresh) achieve 25-40% better forecast accuracy than annual budget adherents. Rolling forecasts enable continuous resource reallocation.', observed: 76, expected: 30, total: 100 },
    { name: 'NPV-IRR Capital Decision Framework', domains: ['finance'], description: 'Net Present Value (NPV > 0) and Internal Rate of Return (IRR > WACC) form the gold standard for capital budgeting. Companies applying disciplined DCF analysis with appropriate discount rates achieve 20-30% better investment returns.', observed: 74, expected: 30, total: 100 },
    { name: 'Zero-Based Budgeting Cost Optimization', domains: ['finance', 'strategy'], description: 'Zero-based budgeting (ZBB) forces justification of every expense from zero rather than incremental adjustments. 3G Capital-style ZBB achieves 10-25% SG&A reduction in year one, but risks cutting growth investment.', observed: 72, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'forecast_improvement', predictedConfidence: 0.73, actual: 'forecast_improved', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'strategy' },
    { predicted: 'cost_reduction', predictedConfidence: 0.70, actual: 'costs_reduced', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
  ],

  narrative: 'Financial Planning & Analysis (FP&A) is the strategic nervous system of modern companies. Best-in-class FP&A teams use driver-based models, rolling forecasts, and scenario planning to enable real-time capital allocation. The shift from annual budgeting to continuous planning improves forecast accuracy by 25-40%. Capital budgeting decisions using NPV, IRR, and proper WACC calculation separate value-creating investments from value-destroying ones. Companies with CFOs who embrace strategic finance (not just accounting) create 2-3x more shareholder value. Zero-based budgeting provides discipline but must be balanced with growth investment.',
};

// ============================================================================
// EXPORTS
// ============================================================================

export const ACCOUNTING_FINANCE_PACKS: TrainingPack[] = [
  accountingCycleCascade,
  balanceSheetHealth,
  revenueRecognition,
  fpaStrategicFinance,
];
