/**
 * Financial Statements Deep Dive Training Packs
 *
 * Real-world logic of how financial statements interconnect:
 * - Balance Sheet mechanics (Assets = Liabilities + Equity)
 * - P&L / Income Statement cascading effects
 * - Cash Flow Statement (Operating, Investing, Financing)
 * - Financial Ratio Analysis & DuPont decomposition
 *
 * Sources: CFA Institute, IFRS/GAAP frameworks, McKinsey Valuation,
 * Damodaran Online, S&P/Moody's rating methodologies
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. BALANCE SHEET MECHANICS & INTERCONNECTIONS
// ============================================================================

const balanceSheetMechanics: TrainingPack = {
  id: 'balance-sheet-mechanics-deep',
  title: 'Balance Sheet Mechanics — Assets = Liabilities + Equity',
  source: 'CFA Institute Level 1, IFRS/GAAP frameworks, Damodaran Corporate Finance',
  industry: 'Cross-Industry',
  domains: ['finance', 'strategy', 'cs'],
  confidence: 0.88,
  tags: ['balance-sheet', 'assets', 'liabilities', 'equity', 'working-capital', 'dupont', 'roa', 'roe'],

  causalChains: [
    // Working capital cycle: AR + Inventory - AP = Cash tied up
    { source: 'finance', target: 'finance', metric: 'working_capital_cycle_to_cash_available', effectSize: -0.60, lagDays: 30, pValue: 0.001 },
    // Current ratio decline → short-term liquidity crisis
    { source: 'finance', target: 'finance', metric: 'current_ratio_decline_to_liquidity_crisis', effectSize: -0.55, lagDays: 14, pValue: 0.002 },
    // Fixed asset investment → depreciation → tax shield → cash flow
    { source: 'finance', target: 'finance', metric: 'capex_to_depreciation_tax_shield', effectSize: 0.35, lagDays: 365, pValue: 0.005 },
    // Goodwill accumulation → impairment risk → shareholder value destruction
    { source: 'strategy', target: 'finance', metric: 'ma_goodwill_to_impairment_risk', effectSize: -0.45, lagDays: 365, pValue: 0.003 },
    // Retained earnings growth → equity strengthens → lower cost of capital
    { source: 'finance', target: 'finance', metric: 'retained_earnings_to_equity_strength', effectSize: 0.50, lagDays: 90, pValue: 0.002 },
    // Inventory days increase → working capital pressure → cash burn
    { source: 'finance', target: 'finance', metric: 'inventory_days_to_cash_burn', effectSize: -0.45, lagDays: 30, pValue: 0.003 },
    // AP days increase → free cash from suppliers → working capital relief
    { source: 'finance', target: 'finance', metric: 'ap_days_increase_to_wc_relief', effectSize: 0.40, lagDays: 0, pValue: 0.005 },
    // Share buyback → equity reduction → EPS boost → ROE inflation
    { source: 'finance', target: 'finance', metric: 'buyback_to_roe_inflation', effectSize: 0.35, lagDays: 0, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Working Capital Cycle Exceeds Industry Benchmark',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.cash_conversion_cycle_days', operator: 'greater_than', value: 90 },
        { field: 'finance.revenue_growth_yoy', operator: 'greater_than', value: 0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Cash Conversion Cycle > 90 days while growing 20%+. Growth is consuming cash faster than operations generate it. Formula: CCC = DSO + DIO - DPO. Amazon achieves negative CCC (-30 days) by collecting before paying suppliers. Reduce DSO (collect faster), reduce DIO (lean inventory), increase DPO (negotiate terms).' } },
      ],
      naturalLanguage: 'A long cash conversion cycle during rapid growth creates a cash trap: revenue grows on paper but cash is locked in receivables and inventory. Companies growing 20%+ need CCC under 60 days.',
    },
    {
      title: 'Negative Tangible Book Value Warning',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.tangible_book_value', operator: 'less_than', value: 0 },
        { field: 'finance.goodwill_to_total_assets_pct', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Tangible book value is negative with goodwill > 30% of assets. If goodwill is impaired, equity could turn negative. This company is an M&A rollup with inflated assets. Test goodwill for impairment annually per ASC 350/IAS 36.' } },
      ],
      naturalLanguage: 'When tangible book value is negative and goodwill exceeds 30% of total assets, the company is essentially a house of cards — one impairment charge could wipe out equity.',
    },
    {
      title: 'DuPont ROE Decomposition Alert',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.roe', operator: 'greater_than', value: 0.25 },
        { field: 'finance.equity_multiplier', operator: 'greater_than', value: 5.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'ROE above 25% but driven by 5x+ leverage (DuPont: ROE = Net Margin × Asset Turnover × Equity Multiplier). High ROE from leverage is fragile — a margin decline will cascade into equity destruction. Preferred: ROE driven by margins and asset efficiency, not leverage.' } },
      ],
      naturalLanguage: 'DuPont analysis reveals whether high ROE comes from operational excellence (good) or excessive leverage (dangerous). Leverage-driven ROE is a ticking time bomb.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['ar-increase', 'inventory-buildup', 'dso-rising', 'working-capital'], target: ['cash-flow', 'liquidity', 'cash-burn', 'runway'] },
      reasonTemplate: 'Working capital expansion consumes cash: every $1M increase in AR or inventory is $1M less cash available. CCC = DSO + DIO - DPO. Companies growing revenue 30%+ with CCC > 60 days face acute cash pressure.' },
    { source: 'strategy', target: 'finance', type: 'triggers', severity: 'high',
      keywords: { source: ['acquisition', 'merger', 'goodwill', 'intangibles'], target: ['impairment', 'writedown', 'equity-destruction', 'book-value'] },
      reasonTemplate: 'M&A creates goodwill on the balance sheet. 70% of acquisitions destroy value. When expected synergies fail to materialize, goodwill impairment charges destroy equity and trigger stock declines of 10-30%.' },
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['strong-balance-sheet', 'net-cash', 'low-leverage', 'equity-growth'], target: ['strategic-flexibility', 'counter-cyclical', 'acquisition-capacity', 'talent'] },
      reasonTemplate: 'A strong balance sheet (net cash, D/E < 1.0, current ratio > 2.0) enables counter-cyclical strategy. Apple, Google, Microsoft used $100B+ cash reserves for strategic M&A during downturns when competitors were retrenching.' },
  ],

  patterns: [
    { name: 'Cash Conversion Cycle Benchmarks', domains: ['finance'], description: 'Amazon: -30 days (collects before paying). Apple: -60 days. SaaS companies: 30-60 days. Manufacturing: 60-120 days. A 10-day CCC improvement at $100M revenue frees ~$2.7M cash. CCC = DSO + DIO - DPO.', observed: 85, expected: 25, total: 100 },
    { name: 'DuPont Framework — The ROE X-Ray', domains: ['finance'], description: 'ROE = Net Margin × Asset Turnover × Equity Multiplier. Luxury brands: high margin, low turnover. Retailers: low margin, high turnover. Banks: low margin, extreme leverage. The source of ROE determines its quality and sustainability.', observed: 82, expected: 25, total: 100 },
    { name: 'Balance Sheet Quality Signals', domains: ['finance', 'strategy'], description: 'Quality signals: growing retained earnings, declining debt-to-equity, rising tangible book value, current ratio > 2.0. Red flags: growing goodwill > 40% of assets, negative tangible equity, current ratio < 1.0, rising off-balance-sheet liabilities.', observed: 80, expected: 30, total: 100 },
    { name: 'Working Capital as Growth Tax', domains: ['finance'], description: 'For asset-heavy companies growing 30%+, working capital expansion can consume 20-40% of operating cash flow. This "growth tax" means profitable companies can still run out of cash. SaaS avoids this via negative working capital (annual prepayments).', observed: 78, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'cash_conversion_improvement', expectedChange: 0.25, timeframeDays: 180, condition: 'working_capital_optimization_implemented' },
    { metric: 'equity_strength', expectedChange: 0.30, timeframeDays: 365, condition: 'retained_earnings_positive AND debt_reduction' },
    { metric: 'impairment_probability', expectedChange: 0.40, timeframeDays: 365, condition: 'goodwill_exceeds_40pct_assets AND acquisition_underperforming' },
  ],

  narrative: `The balance sheet is the financial DNA of a company — Assets = Liabilities + Equity, and every transaction touches at least two lines. Working capital management (CCC = DSO + DIO - DPO) determines whether growth creates or consumes cash. Amazon's negative CCC (-30 days) means customers fund its growth. Manufacturing companies with 90+ day cycles face acute cash pressure during expansion. DuPont analysis (ROE = Margin × Turnover × Leverage) separates genuinely profitable companies from leverage-dependent ones. Goodwill from M&A is the silent balance sheet risk — 70% of acquisitions destroy value, and impairment charges devastate equity. A strong balance sheet (net cash, low leverage, growing retained earnings) is the foundation of strategic flexibility.`,
};

// ============================================================================
// 2. P&L / INCOME STATEMENT CASCADE LOGIC
// ============================================================================

const pnlCascadeLogic: TrainingPack = {
  id: 'pnl-income-statement-cascade-logic',
  title: 'P&L Income Statement — Revenue to Net Income Cascade',
  source: 'CFA Institute, McKinsey Valuation, SaaS benchmarks, Bessemer Cloud Index',
  industry: 'Cross-Industry',
  domains: ['finance', 'marketing', 'engineering', 'hr'],
  confidence: 0.87,
  tags: ['income-statement', 'pnl', 'revenue', 'cogs', 'gross-margin', 'opex', 'ebitda', 'net-income'],

  causalChains: [
    // Revenue mix shift → gross margin change (product vs services)
    { source: 'finance', target: 'finance', metric: 'revenue_mix_to_gross_margin', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    // COGS increase → gross margin compression → operating leverage loss
    { source: 'finance', target: 'finance', metric: 'cogs_increase_to_margin_compression', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    // R&D spend → product differentiation → pricing power → margin expansion
    { source: 'engineering', target: 'finance', metric: 'rd_spend_to_pricing_power', effectSize: 0.40, lagDays: 365, pValue: 0.005 },
    // SG&A as % of revenue → operating efficiency signal
    { source: 'marketing', target: 'finance', metric: 'sga_efficiency_to_operating_margin', effectSize: -0.50, lagDays: 30, pValue: 0.003 },
    // Operating leverage → EBITDA margin expansion as revenue scales
    { source: 'finance', target: 'finance', metric: 'revenue_scale_to_ebitda_margin', effectSize: 0.50, lagDays: 90, pValue: 0.002 },
    // Headcount growth faster than revenue → margin destruction
    { source: 'hr', target: 'finance', metric: 'headcount_outpacing_revenue_to_margin_destruction', effectSize: -0.55, lagDays: 60, pValue: 0.002 },
    // Gross margin threshold → operating profitability feasibility
    { source: 'finance', target: 'finance', metric: 'gross_margin_threshold_to_profitability', effectSize: 0.60, lagDays: 90, pValue: 0.001 },
    // Interest expense rise → net income squeeze → dividend risk
    { source: 'finance', target: 'finance', metric: 'interest_expense_to_net_income_squeeze', effectSize: -0.45, lagDays: 30, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Gross Margin Below Viability Floor',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.gross_margin', operator: 'less_than', value: 0.50 },
        { field: 'finance.opex_as_pct_revenue', operator: 'greater_than', value: 0.40 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Gross margin below 50% with OpEx at 40%+ of revenue. Only 10% margin left for operating profit. SaaS benchmark: 70-80% GM. Below 50% means the business model has structural unit economics problems — either COGS too high (hosting, support, services) or pricing too low.' } },
      ],
      naturalLanguage: 'When gross margin falls below 50% and operating expenses exceed 40% of revenue, the P&L arithmetic makes profitability nearly impossible without fundamental model changes.',
    },
    {
      title: 'Revenue Per Employee Declining',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.revenue_per_employee_yoy_change', operator: 'less_than', value: -0.10 },
        { field: 'hr.headcount_growth_yoy', operator: 'greater_than', value: 0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Revenue per employee declining 10%+ while headcount grows 20%+. Hiring is outpacing revenue — classic pre-layoff signal. At scale, best SaaS achieves $350K+/employee. Below $150K signals over-hiring or undermonetization.' } },
      ],
      naturalLanguage: 'Revenue per employee declining during rapid hiring means the company is adding cost faster than value. This pattern precedes 80% of startup layoffs.',
    },
    {
      title: 'EBITDA Margin Inflection Point',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.ebitda_margin', operator: 'greater_than', value: 0.0 },
        { field: 'finance.ebitda_margin_prior_quarter', operator: 'less_than', value: 0.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'low', message: 'EBITDA turned positive — profitability inflection achieved. This is a critical milestone for SaaS companies. The market rewards this transition with 20-40% valuation premium. Maintain discipline: Rule of 40 score should now trend upward.' } },
      ],
      naturalLanguage: 'The quarter EBITDA turns positive marks the profitability inflection — where the P&L proves the business model works at scale. The market rewards this with significant valuation uplift.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['cogs', 'cost-of-revenue', 'hosting', 'infrastructure'], target: ['gross-margin', 'operating-leverage', 'profitability-path'] },
      reasonTemplate: 'Every 1% gross margin improvement drops directly to operating income. SaaS companies moving from 65% to 75% GM unlock 10 percentage points of operating margin. GM is the ceiling of profitability — you cannot have 30% operating margin with 50% GM.' },
    { source: 'hr', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['hiring', 'headcount', 'compensation', 'payroll'], target: ['opex', 'burn-rate', 'operating-margin', 'cash-flow'] },
      reasonTemplate: 'People costs are 60-80% of SaaS OpEx. When headcount grows faster than revenue, operating margins compress — creating a "profitability gap" that requires either layoffs or hypergrowth to close.' },
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['operating-leverage', 'margin-expansion', 'ebitda-positive', 'profitability'], target: ['self-funding', 'strategic-investment', 'independence', 'optionality'] },
      reasonTemplate: 'Operating leverage means each incremental dollar of revenue generates more profit than the last. SaaS at scale achieves 70-80% incremental margins, enabling self-funded growth without external capital.' },
  ],

  patterns: [
    { name: 'P&L Waterfall Logic', domains: ['finance'], description: 'Revenue → minus COGS = Gross Profit → minus OpEx (R&D + S&M + G&A) = Operating Income → minus Interest/Tax = Net Income. Each stage is a cascade. Gross margin sets the ceiling; OpEx discipline determines how much falls through to profit.', observed: 90, expected: 20, total: 100 },
    { name: 'SaaS P&L Benchmarks', domains: ['finance', 'marketing', 'engineering'], description: 'Median SaaS at scale: 72% GM, 22% R&D, 35% S&M, 12% G&A = -3% operating margin. Best-in-class: 80% GM, 18% R&D, 25% S&M, 8% G&A = 29% operating margin. The 32-point gap is the efficiency opportunity.', observed: 85, expected: 25, total: 100 },
    { name: 'Operating Leverage Inflection', domains: ['finance'], description: 'SaaS operating leverage typically inflects at $30-50M ARR when fixed costs are absorbed and incremental revenue has 70-80% flow-through. Before inflection: every $1M ARR requires $0.80-1.20 in new spend. After: requires $0.20-0.40.', observed: 82, expected: 30, total: 100 },
    { name: 'Revenue Mix Margin Impact', domains: ['finance', 'cs'], description: 'Services revenue has 20-40% GM vs software at 75-85% GM. A company with 30% services revenue has blended GM ~15 points lower than pure software. IPO investors penalize high services mix with 30-50% valuation discount.', observed: 80, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'gross_margin_improvement', expectedChange: 0.05, timeframeDays: 365, condition: 'infrastructure_optimization AND pricing_increase' },
    { metric: 'operating_leverage_inflection', expectedChange: 0.15, timeframeDays: 365, condition: 'arr_exceeds_30m AND hiring_discipline' },
    { metric: 'revenue_per_employee', expectedChange: 0.25, timeframeDays: 365, condition: 'hiring_freeze AND revenue_growing' },
  ],

  narrative: `The P&L tells the story of value creation in a single period. Revenue is vanity, gross profit is sanity, net income is reality. The cascade is mechanical: Revenue minus COGS equals Gross Profit, which sets the ceiling for everything below. SaaS gross margins of 70-80% enable 25-30% operating margins at scale. Below 50% GM, the math makes profitability nearly impossible. Operating leverage is the SaaS superpower — once fixed costs are absorbed at $30-50M ARR, each incremental dollar of revenue flows through at 70-80% to operating income. But hiring is the margin killer: people are 60-80% of OpEx, and hiring faster than revenue growth is the #1 predictor of future layoffs. The best P&L metric? Revenue per employee — it captures both top-line growth and cost discipline in a single number.`,
};

// ============================================================================
// 3. CASH FLOW STATEMENT — THE TRUTH DETECTOR
// ============================================================================

const cashFlowAnalysis: TrainingPack = {
  id: 'cash-flow-statement-truth-detector',
  title: 'Cash Flow Statement — Operating, Investing, Financing Truth',
  source: 'CFA Institute Level 2, Damodaran Valuation, McKinsey Corporate Finance',
  industry: 'Cross-Industry',
  domains: ['finance', 'strategy', 'engineering'],
  confidence: 0.86,
  tags: ['cash-flow', 'ocf', 'fcf', 'capex', 'operating-cash-flow', 'free-cash-flow', 'financing'],

  causalChains: [
    // OCF positive + Net Income negative → working capital manipulation or non-cash charges
    { source: 'finance', target: 'finance', metric: 'ocf_ni_divergence_to_quality_signal', effectSize: 0.50, lagDays: 0, pValue: 0.003 },
    // Capex intensity → FCF generation capacity
    { source: 'finance', target: 'finance', metric: 'capex_intensity_to_fcf_capacity', effectSize: -0.55, lagDays: 90, pValue: 0.002 },
    // Positive FCF → strategic optionality (acquisitions, buybacks, debt paydown)
    { source: 'finance', target: 'strategy', metric: 'fcf_to_strategic_optionality', effectSize: 0.60, lagDays: 0, pValue: 0.001 },
    // Stock-based compensation → cash flow inflation (SBC adds back to OCF)
    { source: 'finance', target: 'finance', metric: 'sbc_to_ocf_inflation', effectSize: 0.35, lagDays: 0, pValue: 0.005 },
    // Debt issuance → financing cash flow positive → future interest burden
    { source: 'finance', target: 'finance', metric: 'debt_issuance_to_interest_burden', effectSize: -0.40, lagDays: 365, pValue: 0.005 },
    // Revenue growth + negative OCF → cash burn acceleration
    { source: 'finance', target: 'finance', metric: 'growth_with_negative_ocf_to_cash_crisis', effectSize: -0.60, lagDays: 90, pValue: 0.001 },
  ],

  businessRules: [
    {
      title: 'Cash Flow Quality Alert',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.net_income', operator: 'greater_than', value: 0 },
        { field: 'finance.operating_cash_flow', operator: 'less_than', value: 0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Net income positive but operating cash flow negative — the most dangerous divergence. This signals aggressive accrual accounting: revenue recognized but cash not collected. Common in channel stuffing, bill-and-hold, and percentage-of-completion abuse. Investigate immediately.' } },
      ],
      naturalLanguage: 'When a company reports positive earnings but negative operating cash flow, the earnings quality is suspect. Cash flow is the truth detector — you cannot fake cash receipts.',
    },
    {
      title: 'Free Cash Flow Margin Excellence',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.fcf_margin', operator: 'greater_than', value: 0.20 },
        { field: 'finance.arr_growth_rate', operator: 'greater_than', value: 0.25 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'low', message: 'FCF margin > 20% with 25%+ growth — exceptional cash generation at scale. This is the Rule of 40 premium zone. Companies here can self-fund growth, pursue acquisitions, and command 2x+ valuation premiums.' } },
      ],
      naturalLanguage: 'A SaaS company generating 20%+ FCF margin while growing 25%+ has achieved the holy grail of software economics — compounding growth funded by the business itself.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['operating-cash-flow', 'collections', 'ar-increase', 'ocf'], target: ['cash-position', 'runway', 'survival', 'payroll'] },
      reasonTemplate: 'Operating cash flow is the lifeline. Companies die from cash starvation, not from losses. OCF = Net Income + Non-Cash Charges + Working Capital Changes. When OCF diverges from NI, investigate working capital and accruals.' },
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['fcf', 'free-cash-flow', 'cash-generation', 'fcf-margin'], target: ['self-funding', 'acquisition', 'buyback', 'independence'] },
      reasonTemplate: 'Free Cash Flow (OCF - CapEx) determines strategic independence. FCF-positive companies can grow without external capital, pursue acquisitions during downturns, and return cash to shareholders.' },
  ],

  patterns: [
    { name: 'Three-Section Cash Flow Logic', domains: ['finance'], description: 'Operating (day-to-day business), Investing (long-term assets: CapEx, M&A), Financing (capital structure: debt, equity, dividends). Healthy pattern: OCF positive, Investing negative (growing), Financing varies. Red flag: OCF negative, Financing positive (survival mode).', observed: 88, expected: 20, total: 100 },
    { name: 'SBC Cash Flow Distortion', domains: ['finance'], description: 'Stock-based compensation is a real cost but a non-cash expense. It adds back to OCF, inflating cash flow by 10-30% at tech companies. True owner earnings = OCF - CapEx - SBC. Ignoring SBC overstates cash generation by $millions at scale companies.', observed: 80, expected: 30, total: 100 },
    { name: 'FCF Yield as Valuation Anchor', domains: ['finance', 'strategy'], description: 'FCF Yield = FCF / Enterprise Value. Public SaaS: 2-5% FCF yield is normal, > 8% is deep value, < 1% is growth premium. Warren Buffett uses FCF (owner earnings) as the primary valuation metric, not P/E.', observed: 78, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'cash_flow_quality_score', expectedChange: 0.30, timeframeDays: 180, condition: 'accrual_cleanup AND collections_improvement' },
    { metric: 'fcf_margin', expectedChange: 0.10, timeframeDays: 365, condition: 'operating_leverage_achieved AND capex_declining' },
  ],

  narrative: `The cash flow statement is the truth detector of financial reporting. You can manipulate earnings through accruals, but you cannot fake cash. The three sections tell different stories: Operating (is the core business generating cash?), Investing (is management investing in growth?), Financing (how is the company funded?). The most dangerous signal: positive net income with negative operating cash flow — this screams earnings manipulation. SBC distortion is endemic in tech: adding back stock compensation inflates OCF by 10-30%, creating an illusion of cash generation that doesn't exist for shareholders. Free Cash Flow (OCF - CapEx) is the ultimate measure of value creation and the foundation of DCF valuation.`,
};

// ============================================================================
// 4. FINANCIAL RATIO ANALYSIS — CONNECTED INTELLIGENCE
// ============================================================================

const financialRatioIntelligence: TrainingPack = {
  id: 'financial-ratio-connected-intelligence',
  title: 'Financial Ratio Analysis — Liquidity, Profitability, Solvency, Efficiency',
  source: 'CFA Level 1-2, Moody\'s Ratings, S&P Credit Analysis, Bloomberg Terminal benchmarks',
  industry: 'Cross-Industry',
  domains: ['finance', 'strategy', 'marketing'],
  confidence: 0.85,
  tags: ['ratios', 'liquidity', 'profitability', 'solvency', 'efficiency', 'quick-ratio', 'roa', 'roe', 'roic'],

  causalChains: [
    // ROIC above WACC → value creation → stock premium
    { source: 'finance', target: 'finance', metric: 'roic_wacc_spread_to_value_creation', effectSize: 0.65, lagDays: 90, pValue: 0.001 },
    // Quick ratio decline → refinancing risk → credit spread widening
    { source: 'finance', target: 'finance', metric: 'quick_ratio_to_refinancing_risk', effectSize: -0.50, lagDays: 30, pValue: 0.003 },
    // Inventory turnover decline → obsolescence risk → margin pressure
    { source: 'finance', target: 'finance', metric: 'inventory_turnover_to_obsolescence', effectSize: -0.40, lagDays: 60, pValue: 0.005 },
    // Operating margin trend → sustainable competitive advantage signal
    { source: 'finance', target: 'strategy', metric: 'operating_margin_to_moat_strength', effectSize: 0.50, lagDays: 365, pValue: 0.002 },
    // Debt service coverage decline → covenant breach risk
    { source: 'finance', target: 'finance', metric: 'dscr_decline_to_covenant_breach', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    // Asset turnover improvement → capital efficiency → ROIC improvement
    { source: 'finance', target: 'finance', metric: 'asset_turnover_to_roic', effectSize: 0.45, lagDays: 90, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'ROIC Below WACC — Value Destruction',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.roic', operator: 'less_than', value: 0.08 },
        { field: 'finance.wacc', operator: 'greater_than', value: 0.10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'ROIC (8%) below WACC (10%): the company is destroying value with every dollar invested. Every new investment earns less than the cost of capital. Divest low-ROIC segments, improve capital efficiency, or increase pricing power. Value = f(ROIC - WACC) × Invested Capital.' } },
      ],
      naturalLanguage: 'When ROIC falls below WACC, the company destroys shareholder value with every dollar of invested capital. The ROIC-WACC spread is the single most important metric in corporate finance.',
    },
    {
      title: 'Quick Ratio Liquidity Warning',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.quick_ratio', operator: 'less_than', value: 0.80 },
        { field: 'finance.current_ratio', operator: 'less_than', value: 1.2 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Quick ratio below 0.8 and current ratio below 1.2 — short-term liquidity at risk. Quick ratio excludes inventory (harder to liquidate). Below 0.8 means the company cannot cover current liabilities with liquid assets. Negotiate extended payment terms or credit facility immediately.' } },
      ],
      naturalLanguage: 'The quick ratio strips out inventory to reveal true short-term liquidity. Below 0.8 means the company is one delayed payment from a cash crisis.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['roic', 'return-on-capital', 'capital-efficiency', 'wacc'], target: ['value-creation', 'competitive-advantage', 'market-premium', 'investment'] },
      reasonTemplate: 'ROIC above WACC is the single condition for economic value creation. Companies with durable ROIC-WACC spreads of 10%+ (Apple, Google, Visa) command persistent market premiums because every dollar invested creates more than a dollar of value.' },
    { source: 'finance', target: 'finance', type: 'triggers', severity: 'critical',
      keywords: { source: ['quick-ratio', 'current-ratio', 'cash-ratio', 'liquidity'], target: ['covenant-breach', 'refinancing', 'credit-downgrade', 'insolvency'] },
      reasonTemplate: 'Liquidity ratios below critical thresholds trigger cascading failures: covenant breaches → credit downgrades → higher borrowing costs → further liquidity pressure → potential insolvency. The spiral accelerates once creditors lose confidence.' },
  ],

  patterns: [
    { name: 'The Ratio Family Tree', domains: ['finance'], description: 'Liquidity (Current, Quick, Cash ratios) — can we pay bills? Profitability (GM, OM, NM, ROA, ROE, ROIC) — are we profitable? Solvency (D/E, Interest Coverage, DSCR) — can we survive long-term? Efficiency (Asset Turnover, Inventory Turnover, DSO) — are we using resources well?', observed: 88, expected: 20, total: 100 },
    { name: 'ROIC as North Star Metric', domains: ['finance', 'strategy'], description: 'McKinsey: ROIC is the single best measure of value creation. ROIC > WACC = value creation. ROIC < WACC = value destruction. Top quartile companies maintain 20%+ ROIC for decades (Visa: 30%, Apple: 40%, Google: 25%). This is the economic moat in numbers.', observed: 85, expected: 25, total: 100 },
    { name: 'Altman Z-Score Bankruptcy Prediction', domains: ['finance'], description: 'Z = 1.2(WC/TA) + 1.4(RE/TA) + 3.3(EBIT/TA) + 0.6(MV Equity/BV Debt) + 1.0(Sales/TA). Z > 2.99: safe. 1.81-2.99: gray zone. < 1.81: distress. The model accurately predicted 72% of corporate bankruptcies in validation studies.', observed: 80, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'value_creation', expectedChange: 0.20, timeframeDays: 365, condition: 'roic_exceeds_wacc_by_5pct AND capital_discipline' },
    { metric: 'credit_stability', expectedChange: 0.30, timeframeDays: 180, condition: 'quick_ratio_above_1 AND interest_coverage_above_3x' },
  ],

  narrative: `Financial ratios transform raw numbers into intelligence. The ratio family covers four dimensions: Liquidity (can we pay bills?), Profitability (are we earning?), Solvency (can we survive?), and Efficiency (are we using resources well?). ROIC vs WACC is the ultimate test — companies that consistently earn above their cost of capital create compounding value. The Altman Z-Score uses five ratios to predict bankruptcy with 72% accuracy. DuPont analysis decomposes ROE into margin, turnover, and leverage components. Quick ratio below 0.8 signals imminent liquidity risk. The interconnections between ratios tell a story: declining margins → reduced ROIC → higher leverage → lower coverage → covenant breach → insolvency cascade.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const FINANCIAL_STATEMENTS_DEEP_DIVE_PACKS: TrainingPack[] = [
  balanceSheetMechanics,
  pnlCascadeLogic,
  cashFlowAnalysis,
  financialRatioIntelligence,
];
