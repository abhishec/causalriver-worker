/**
 * VC Metrics & Logic Deep Dive Training Packs
 *
 * The actual math and logic behind VC metrics:
 * - Unit Economics Math (CAC, LTV, payback formulas)
 * - Cohort Analysis & Retention Curves
 * - Cap Table, Dilution & Liquidation Preferences
 * - Fundraise Timing, Valuation & Term Sheets
 *
 * Sources: SaaS Capital, a16z, Bessemer, YC SAFE docs, Carta, PitchBook
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. UNIT ECONOMICS MATH — THE REAL FORMULAS
// ============================================================================

const unitEconomicsMath: TrainingPack = {
  id: 'unit-economics-math-formulas',
  title: 'Unit Economics Math — CAC, LTV, Payback, Magic Number Formulas',
  source: 'David Skok forentrepreneurs, SaaS Capital, a16z, Bessemer',
  industry: 'SaaS',
  domains: ['finance', 'marketing', 'cs', 'product'],
  confidence: 0.90,
  tags: ['cac', 'ltv', 'payback', 'magic-number', 'unit-economics', 'formulas', 'arpu', 'churn-math'],

  causalChains: [
    // CAC = (S&M Spend) / (New Customers). Rising CAC → longer payback → cash pressure
    { source: 'marketing', target: 'finance', metric: 'cac_rise_to_payback_extension', effectSize: -0.60, lagDays: 30, pValue: 0.001 },
    // LTV = ARPU / Monthly Churn Rate. Churn reduction → LTV explosion (nonlinear)
    { source: 'cs', target: 'finance', metric: 'churn_reduction_to_ltv_explosion', effectSize: 0.70, lagDays: 30, pValue: 0.001 },
    // LTV:CAC ratio → growth investment decision (> 3 = invest, < 1 = stop)
    { source: 'finance', target: 'strategy', metric: 'ltv_cac_to_investment_decision', effectSize: 0.60, lagDays: 30, pValue: 0.001 },
    // Payback months = CAC / (ARPU × Gross Margin). Payback > 18m → cash trap
    { source: 'finance', target: 'finance', metric: 'payback_to_cash_trap_risk', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    // Magic Number = (Current Q Rev - Prior Q Rev) × 4 / Prior Q S&M Spend
    { source: 'marketing', target: 'finance', metric: 'magic_number_to_sales_efficiency', effectSize: 0.55, lagDays: 90, pValue: 0.002 },
    // Blended CAC hides channel economics — segment to find truth
    { source: 'marketing', target: 'marketing', metric: 'blended_cac_masking_channel_inefficiency', effectSize: -0.40, lagDays: 30, pValue: 0.005 },
    // Net Dollar Retention = (Starting MRR + Expansion - Contraction - Churn) / Starting MRR
    { source: 'cs', target: 'finance', metric: 'ndr_to_compounding_growth', effectSize: 0.65, lagDays: 30, pValue: 0.001 },
    // Expansion revenue reduces effective CAC — existing customers are free pipeline
    { source: 'cs', target: 'marketing', metric: 'expansion_to_effective_cac_reduction', effectSize: -0.50, lagDays: 90, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'LTV:CAC Ratio Critical Threshold',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.ltv_cac_ratio', operator: 'less_than', value: 1.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'LTV:CAC below 1.0x — every customer acquired destroys value. LTV = ARPU / Monthly Churn. CAC = S&M Spend / New Customers. Payback = CAC / (Monthly ARPU × GM). Fix by: (1) Reduce CAC via PLG/content, (2) Reduce churn (biggest LTV lever), (3) Increase ARPU via pricing/upsell, (4) Improve GM by reducing COGS.' } },
      ],
      naturalLanguage: 'LTV:CAC below 1.0 means the company pays more to acquire a customer than that customer will ever generate. This is the death zone — stop acquiring and fix unit economics.',
    },
    {
      title: 'Churn Rate Impact on LTV — Nonlinear Alert',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'cs.monthly_churn_rate', operator: 'greater_than', value: 0.05 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Monthly churn > 5% (annual ~46%). LTV = ARPU / Churn. At 5% monthly churn, LTV = 20× ARPU. At 2% churn, LTV = 50× ARPU. Cutting churn from 5% to 2% increases LTV by 150% — the single biggest lever in unit economics.' } },
      ],
      naturalLanguage: 'Churn has a nonlinear impact on LTV because LTV = ARPU / Churn Rate. Halving churn doubles LTV. This makes churn reduction the highest-ROI activity in any SaaS company.',
    },
    {
      title: 'Magic Number Below Efficiency Floor',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.magic_number', operator: 'less_than', value: 0.5 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Magic Number below 0.5. Formula: (Current Q Revenue - Prior Q Revenue) × 4 / Prior Q S&M Spend. Below 0.5 means $2+ S&M spend to get $1 annualized revenue. > 0.75 = healthy, > 1.0 = efficient, > 1.5 = exceptional. Diagnose: is the problem lead volume, conversion rate, or deal size?' } },
      ],
      naturalLanguage: 'Magic Number below 0.5 means the go-to-market engine is broken — spending more than $2 to generate $1 of new ARR. The fix requires diagnosing which part of the funnel is leaking.',
    },
  ],

  cascades: [
    { source: 'cs', target: 'finance', type: 'enables', severity: 'critical',
      keywords: { source: ['churn-reduction', 'retention', 'ndr', 'expansion'], target: ['ltv', 'unit-economics', 'profitability', 'growth'] },
      reasonTemplate: 'Churn is the denominator in LTV = ARPU / Churn. Reducing monthly churn from 3% to 1.5% doubles LTV. Net Dollar Retention > 120% means the customer base grows without any new customers. This is the most powerful compounding engine in SaaS.' },
    { source: 'marketing', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['cac', 'acquisition-cost', 'sales-spend', 'marketing-spend'], target: ['payback', 'cash-efficiency', 'burn-rate', 'runway'] },
      reasonTemplate: 'CAC Payback = CAC / (Monthly ARPU × Gross Margin). At $50K CAC with $5K monthly ARPU and 80% GM, payback = 12.5 months. Each month of payback requires the company to front that cash — at 100 new customers/month, thats $5M in working capital.' },
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['ltv-cac', 'unit-economics', 'payback', 'magic-number'], target: ['growth-investment', 'scaling-decision', 'fundraise', 'hiring'] },
      reasonTemplate: 'Unit economics are the traffic light for growth: LTV:CAC > 3 and Payback < 18 months = green light (invest aggressively). LTV:CAC 1-3 = yellow (optimize first). LTV:CAC < 1 = red (stop and fix).' },
  ],

  patterns: [
    { name: 'The Unit Economics Formula Sheet', domains: ['finance', 'marketing', 'cs'], description: 'CAC = S&M Spend / New Customers. LTV = ARPU / Monthly Churn (simple) or ARPU × Gross Margin × (1/Churn) (margin-adjusted). Payback = CAC / (ARPU × GM). Magic Number = (Qn Rev - Qn-1 Rev) × 4 / Qn-1 S&M. LTV:CAC target: 3-5x. Payback target: < 18 months.', observed: 92, expected: 15, total: 100 },
    { name: 'Churn Math — The Nonlinear Lever', domains: ['cs', 'finance'], description: 'LTV = ARPU / Churn is a hyperbola. At 5% monthly churn: LTV = 20 months. At 3%: 33 months (+65%). At 1%: 100 months (+400%). Going from 5% to 1% churn increases LTV by 5x. This nonlinearity makes churn reduction the highest ROI activity in SaaS.', observed: 88, expected: 20, total: 100 },
    { name: 'Blended CAC Deception', domains: ['marketing', 'finance'], description: 'Blended CAC mixes organic (free) with paid (expensive). A company with 50% organic leads and $500 paid CAC reports $250 blended CAC. But marginal CAC (the next customer) is $500+. Investors want segmented CAC by channel and cohort.', observed: 82, expected: 30, total: 100 },
    { name: 'Expansion Revenue Math', domains: ['cs', 'finance'], description: 'NDR = (Start MRR + Expansion - Contraction - Churn) / Start MRR. At 120% NDR, revenue doubles every 3.8 years from existing customers alone — zero new sales needed. Expansion revenue has near-zero CAC, making it 5-10x more efficient than new logo acquisition.', observed: 85, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'ltv', expectedChange: 1.50, timeframeDays: 365, condition: 'monthly_churn_halved' },
    { metric: 'effective_cac', expectedChange: -0.40, timeframeDays: 365, condition: 'expansion_revenue_exceeds_30pct_of_new_arr' },
    { metric: 'cash_efficiency', expectedChange: 0.50, timeframeDays: 180, condition: 'payback_reduced_below_12_months' },
  ],

  narrative: `Unit economics are the physics of SaaS — they determine whether a business creates or destroys value at the unit level. The formulas are simple but the implications are profound. LTV = ARPU / Churn means churn reduction has a nonlinear, explosive impact on customer value. Halving churn doubles LTV. CAC = S&M / New Customers, but blended CAC masks channel economics — always segment by source. Payback = CAC / (ARPU × GM) determines how much cash the company must front for growth. Magic Number measures S&M efficiency: below 0.5 is broken, 0.75+ is healthy, 1.0+ is efficient. The golden rule: LTV:CAC > 3x with payback under 18 months means the business model works. Below 1x means every new customer destroys value.`,
};

// ============================================================================
// 2. COHORT ANALYSIS & RETENTION CURVES
// ============================================================================

const cohortRetentionCurves: TrainingPack = {
  id: 'cohort-analysis-retention-curves',
  title: 'Cohort Analysis — Retention Curves, NDR, Revenue Cohort Math',
  source: 'Lenny Rachitsky benchmarks, a16z retention analysis, Amplitude cohort data',
  industry: 'SaaS',
  domains: ['cs', 'finance', 'product', 'marketing'],
  confidence: 0.87,
  tags: ['cohort', 'retention', 'ndr', 'revenue-cohort', 'logo-retention', 'expansion', 'smiling-curve'],

  causalChains: [
    // Logo retention × expansion rate = NDR (the multiplicative relationship)
    { source: 'cs', target: 'finance', metric: 'logo_retention_times_expansion_to_ndr', effectSize: 0.70, lagDays: 30, pValue: 0.001 },
    // Month 2-3 retention cliff → long-term churn prediction (early signal)
    { source: 'product', target: 'cs', metric: 'early_retention_cliff_to_churn_prediction', effectSize: -0.60, lagDays: 60, pValue: 0.001 },
    // Cohort improvement trend → compounding revenue growth
    { source: 'cs', target: 'finance', metric: 'cohort_improvement_to_revenue_compounding', effectSize: 0.55, lagDays: 365, pValue: 0.002 },
    // Smiling retention curve (expansion > churn) → NDR > 100%
    { source: 'cs', target: 'finance', metric: 'smiling_curve_to_ndr_above_100', effectSize: 0.60, lagDays: 180, pValue: 0.001 },
    // Product activation rate → month 3 retention (the most predictive metric)
    { source: 'product', target: 'cs', metric: 'activation_to_month3_retention', effectSize: 0.65, lagDays: 90, pValue: 0.001 },
    // Cohort vintage degradation → market saturation or product decay signal
    { source: 'cs', target: 'strategy', metric: 'vintage_degradation_to_market_saturation', effectSize: -0.45, lagDays: 365, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Revenue Cohort Degradation',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'cs.latest_cohort_12m_ndr', operator: 'less_than', value: 0.85 },
        { field: 'cs.prior_year_cohort_12m_ndr', operator: 'greater_than', value: 0.95 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Revenue cohort degradation: latest cohort retains only 85% at 12 months vs 95%+ from prior year. This is the earliest signal of product-market fit erosion. Investigate: (1) Has ICP shifted? (2) Product quality declined? (3) Competitive displacement? (4) Onboarding broken? Fix before it compounds into ARR decline.' } },
      ],
      naturalLanguage: 'When newer cohorts retain worse than older cohorts, the business is silently deteriorating. This vintage degradation is the earliest warning of PMF erosion.',
    },
    {
      title: 'Smiling Revenue Curve Achievement',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'cs.avg_cohort_24m_ndr', operator: 'greater_than', value: 1.10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'low', message: 'Smiling curve achieved: cohorts at 110%+ NDR at 24 months. This means expansion exceeds churn — each cohort grows over time. This is the holy grail of SaaS and the primary driver of durable growth. Companies with smiling curves (Snowflake, Datadog, Twilio) achieve premium multiples.' } },
      ],
      naturalLanguage: 'A smiling retention curve means each customer cohort is worth more at 24 months than at month 0. Expansion exceeds churn, creating compounding revenue from existing customers.',
    },
  ],

  cascades: [
    { source: 'product', target: 'cs', type: 'enables', severity: 'critical',
      keywords: { source: ['activation', 'onboarding', 'aha-moment', 'time-to-value'], target: ['retention', 'month-3', 'cohort-health', 'logo-retention'] },
      reasonTemplate: 'Product activation rate is the strongest predictor of long-term retention. Customers who reach the aha-moment within 7 days retain at 2-3x the rate of those who dont. Month 2-3 retention predicts year 1 retention with 85% accuracy.' },
    { source: 'cs', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['cohort', 'retention', 'ndr', 'expansion', 'smiling-curve'], target: ['arr-growth', 'compounding', 'valuation', 'efficiency'] },
      reasonTemplate: 'Cohort analysis is the x-ray of a SaaS business. Improving cohorts signal strengthening PMF. Degrading cohorts signal erosion. NDR > 120% means the customer base doubles every 3.8 years without new sales. This is the most capital-efficient growth engine.' },
  ],

  patterns: [
    { name: 'Retention Curve Shapes', domains: ['cs', 'product'], description: 'Flat curve: stable retention after initial dropoff (acceptable). Declining curve: continuous erosion (fixable). Smiling curve: expansion exceeds churn, cohort grows over time (exceptional — Snowflake, Datadog). The shape determines the business trajectory.', observed: 85, expected: 20, total: 100 },
    { name: 'The Month 3 Retention Threshold', domains: ['product', 'cs'], description: 'Month 3 retention predicts year 1 retention with 85% accuracy. B2B SaaS benchmarks: <60% M3 retention = concerning, 60-80% = average, 80-90% = good, >90% = exceptional. Focus activation efforts on the first 30 days — this window determines the curve shape.', observed: 82, expected: 25, total: 100 },
    { name: 'NDR Compounding Math', domains: ['finance', 'cs'], description: 'At 120% NDR, a $10M cohort becomes $12M at year 1, $14.4M at year 2, $17.3M at year 3. At 90% NDR, same cohort shrinks to $7.3M by year 3. The 30% NDR gap creates a 2.4x revenue difference after 3 years from the same starting point.', observed: 88, expected: 20, total: 100 },
  ],

  outcomes: [
    { metric: 'ndr_improvement', expectedChange: 0.10, timeframeDays: 365, condition: 'activation_rate_improved AND expansion_motion_launched' },
    { metric: 'cohort_quality', expectedChange: 0.15, timeframeDays: 365, condition: 'onboarding_redesigned AND aha_moment_accelerated' },
  ],

  narrative: `Cohort analysis is the truth serum of SaaS. It reveals what aggregate metrics hide. A company can grow 50% while its cohorts degrade — masking deterioration with new customer acquisition. The retention curve shape tells the whole story: flat = stable, declining = leaking, smiling = compounding. The month 3 retention threshold predicts year 1 retention with 85% accuracy. NDR is the multiplicative output: logo retention × (1 + expansion rate). At 120% NDR, revenue doubles every 3.8 years from existing customers alone. The smiling curve (Snowflake, Datadog) is the holy grail — expansion exceeds churn, so every cohort grows over time. Vintage degradation (newer cohorts retaining worse) is the earliest signal of PMF erosion.`,
};

// ============================================================================
// 3. CAP TABLE, DILUTION & LIQUIDATION PREFERENCES
// ============================================================================

const capTableDilution: TrainingPack = {
  id: 'cap-table-dilution-liquidation',
  title: 'Cap Table Math — Dilution, SAFEs, Liquidation Preferences, Option Pool',
  source: 'YC SAFE documentation, Carta cap table data, Cooley LLP term sheet guides, Fred Wilson AVC',
  industry: 'Startups',
  domains: ['finance', 'hr', 'strategy'],
  confidence: 0.84,
  tags: ['cap-table', 'dilution', 'safe', 'convertible-note', 'liquidation-preference', 'option-pool', 'pro-rata'],

  causalChains: [
    // Each funding round → founder dilution (typically 15-25% per round)
    { source: 'finance', target: 'finance', metric: 'funding_round_to_founder_dilution', effectSize: -0.20, lagDays: 0, pValue: 0.001 },
    // SAFE/note cap vs priced round → dilution surprise at conversion
    { source: 'finance', target: 'finance', metric: 'safe_conversion_to_dilution_surprise', effectSize: -0.30, lagDays: 0, pValue: 0.003 },
    // Option pool shuffle → pre-money dilution (hidden founder tax)
    { source: 'finance', target: 'hr', metric: 'option_pool_shuffle_to_pre_money_dilution', effectSize: -0.15, lagDays: 0, pValue: 0.003 },
    // Liquidation preferences stack → common shareholder outcome degradation
    { source: 'finance', target: 'finance', metric: 'liq_pref_stack_to_common_dilution', effectSize: -0.40, lagDays: 0, pValue: 0.002 },
    // Down round → ratchet anti-dilution → massive founder dilution
    { source: 'finance', target: 'finance', metric: 'down_round_ratchet_to_founder_wipeout', effectSize: -0.60, lagDays: 0, pValue: 0.001 },
    // 409A valuation → option strike price → employee equity value
    { source: 'finance', target: 'hr', metric: 'four09a_to_employee_equity_value', effectSize: 0.50, lagDays: 0, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'Excessive Dilution Warning',
      entityType: 'startup',
      when: { logic: 'AND', conditions: [
        { field: 'finance.founder_ownership_pct', operator: 'less_than', value: 0.20 },
        { field: 'finance.funding_stage', operator: 'less_than', value: 3 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Founder ownership below 20% before Series C. Typical dilution: Seed 15-20%, Series A 20-25%, Series B 15-20%. By Series C founders should retain 15-30%. Below 20% pre-Series C signals over-dilution from excessive SAFEs, large option pools, or unfavorable terms. Future rounds will dilute further.' } },
      ],
      naturalLanguage: 'Founders below 20% ownership before Series C are over-diluted. Each future round will dilute by another 15-25%. At this trajectory, founders will own <5% at IPO, which de-motivates and can trigger talent retention cascades.',
    },
    {
      title: 'Liquidation Preference Stack Risk',
      entityType: 'startup',
      when: { logic: 'AND', conditions: [
        { field: 'finance.total_liquidation_preference', operator: 'greater_than', value: 0.80 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Total liquidation preferences exceed 80% of last valuation. In an exit below last round valuation, preferred shareholders take nearly everything before common (founders + employees) receive anything. 1x non-participating is standard. Watch for participating preferred, which double-dips.' } },
      ],
      naturalLanguage: 'When liquidation preferences exceed 80% of valuation, common shareholders (founders and employees) receive meaningful value only in exits significantly above the last round price.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'hr', type: 'impacts', severity: 'critical',
      keywords: { source: ['dilution', 'down-round', 'ratchet', 'liquidation-preference'], target: ['option-value', 'employee-equity', 'retention', 'morale'] },
      reasonTemplate: 'Excessive dilution and down rounds destroy employee option value. In a down round with full-ratchet anti-dilution, early employees can see 50-80% of their equity value evaporate overnight. This triggers a retention cascade as the equity compensation that kept talent becomes worthless.' },
    { source: 'finance', target: 'strategy', type: 'impacts', severity: 'high',
      keywords: { source: ['cap-table', 'ownership', 'dilution', 'control'], target: ['decision-making', 'board-control', 'exit-strategy', 'independence'] },
      reasonTemplate: 'Cap table structure determines governance. When founders fall below 50% (or lose board majority), strategic decisions — including exit timing, spending priorities, and hiring — shift to investors. Dual-class shares and voting agreements can preserve control despite dilution.' },
  ],

  patterns: [
    { name: 'Dilution Per Round Benchmarks', domains: ['finance'], description: 'Pre-Seed: 10-15% (on SAFE). Seed: 15-20%. Series A: 20-25% (includes option pool top-up). Series B: 15-20%. Series C+: 10-15%. By IPO, solo founders typically retain 10-25%. Co-founders: 5-15% each.', observed: 85, expected: 25, total: 100 },
    { name: 'Option Pool Shuffle Tax', domains: ['finance', 'hr'], description: 'The option pool shuffle creates the pool from pre-money, diluting founders but not investors. A 15% option pool top-up at Series A effectively reduces the pre-money valuation by 15%. On a $10M pre-money, this is a hidden $1.5M founder cost.', observed: 80, expected: 30, total: 100 },
    { name: 'SAFE vs Priced Round Math', domains: ['finance'], description: 'SAFEs convert at the next priced round at the lower of: (1) valuation cap, or (2) discount to round price. Multiple SAFEs with different caps create a conversion waterfall that can surprise founders with 30-40% dilution at Series A instead of expected 20%.', observed: 82, expected: 25, total: 100 },
    { name: 'Liquidation Preference Scenarios', domains: ['finance'], description: '1x non-participating (standard): investors get their money back OR convert to common, not both. 1x participating: investors get money back AND share in remaining (double dip). 2x+ liquidation preference: investors get 2x+ before common sees anything. In a modest exit, preferences can zero out common shareholders.', observed: 78, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'founder_ownership', expectedChange: -0.20, timeframeDays: 365, condition: 'series_a_raised_with_option_pool_topup' },
    { metric: 'employee_equity_value', expectedChange: -0.50, timeframeDays: 30, condition: 'down_round_with_anti_dilution' },
    { metric: 'common_shareholder_value', expectedChange: -0.40, timeframeDays: 0, condition: 'exit_below_liquidation_stack' },
  ],

  narrative: `The cap table is the economic constitution of a startup. Every SAFE, every round, every option grant rewrites it. Typical dilution per round: Seed 15-20%, Series A 20-25%, Series B 15-20%. By Series C, founders often own 15-30%. The option pool shuffle is a hidden tax — creating the pool from pre-money dilutes founders, not investors. SAFEs are simple but dangerous: multiple SAFEs with different caps create conversion waterfalls that can surprise founders with 30-40% dilution. Liquidation preferences determine who gets paid in an exit — 1x non-participating is standard, but participating preferred double-dips. Down rounds with full-ratchet anti-dilution can wipe out 50-80% of founder and employee equity overnight.`,
};

// ============================================================================
// 4. FUNDRAISE TIMING, VALUATION & TERM SHEET LOGIC
// ============================================================================

const fundraiseValuationLogic: TrainingPack = {
  id: 'fundraise-valuation-term-sheet-logic',
  title: 'Fundraise Timing, Valuation Multiples & Term Sheet Logic',
  source: 'PitchBook 2024-2025, SaaS Capital, NFX founder guides, YC Series A Guide',
  industry: 'SaaS',
  domains: ['finance', 'strategy', 'marketing'],
  confidence: 0.83,
  tags: ['fundraise', 'valuation', 'term-sheet', 'multiples', 'runway', 'bridge', 'inside-round'],

  causalChains: [
    // ARR milestone → fundraise readiness signal (A: $1-2M, B: $5-10M)
    { source: 'finance', target: 'finance', metric: 'arr_milestone_to_fundraise_readiness', effectSize: 0.60, lagDays: 30, pValue: 0.001 },
    // Growth rate → valuation multiple (power law relationship)
    { source: 'finance', target: 'finance', metric: 'growth_rate_to_valuation_multiple', effectSize: 0.65, lagDays: 0, pValue: 0.001 },
    // Runway < 6 months → desperation terms (30-50% worse)
    { source: 'finance', target: 'finance', metric: 'low_runway_to_term_deterioration', effectSize: -0.50, lagDays: 0, pValue: 0.002 },
    // Multiple term sheets → BATNA power → better terms
    { source: 'strategy', target: 'finance', metric: 'competitive_process_to_better_terms', effectSize: 0.40, lagDays: 30, pValue: 0.005 },
    // Bridge round signals weakness → next round at discount
    { source: 'finance', target: 'finance', metric: 'bridge_round_to_next_round_discount', effectSize: -0.30, lagDays: 180, pValue: 0.005 },
    // Rule of 40 achievement → valuation premium (2x+ multiple)
    { source: 'finance', target: 'finance', metric: 'rule_of_40_to_valuation_premium', effectSize: 0.55, lagDays: 0, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'Fundraise from Strength, Not Desperation',
      entityType: 'startup',
      when: { logic: 'AND', conditions: [
        { field: 'finance.cash_runway_months', operator: 'less_than', value: 6 },
        { field: 'finance.arr_growth_rate', operator: 'less_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Under 6 months runway with sub-30% growth. Fundraise will be from desperation = 30-50% worse terms. Options: (1) Cut burn to extend runway to 12+ months, then fundraise. (2) Revenue sprint to hit growth milestone. (3) Accept bridge round but know it signals weakness. (4) Explore strategic alternatives. Start fundraising at 12-18 months runway, not 6.' } },
      ],
      naturalLanguage: 'Fundraising with under 6 months runway eliminates negotiating leverage. VCs know desperation and extract 30-50% worse terms. Always raise from strength — 12-18 months runway.',
    },
    {
      title: 'Valuation Multiple Band Alert',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.arr_growth_rate', operator: 'greater_than', value: 0.50 },
        { field: 'finance.last_round_arr_multiple', operator: 'less_than', value: 10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Growing 50%+ but last round valued at < 10x ARR. In 2024-2025 private markets: 50%+ growth typically commands 12-20x ARR. You may be undervalued. Consider: (1) Is there a metric weakness suppressing valuation? (2) Was market timing poor? (3) Can you rebase with a new lead investor?' } },
      ],
      naturalLanguage: 'A SaaS company growing 50%+ at sub-10x ARR multiple may be undervalued. Market benchmarks suggest 12-20x for this growth tier. Understand the discount driver and address it before next raise.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['runway', 'cash-position', 'burn-rate', 'survival'], target: ['negotiation-leverage', 'term-quality', 'valuation', 'dilution'] },
      reasonTemplate: 'Runway directly impacts fundraise leverage. At 12+ months runway, founders dictate terms. At 6 months, investors dictate. At 3 months, founders accept whatever is offered. The 30-50% term deterioration from low runway costs more than the cash "saved" by waiting.' },
    { source: 'finance', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['arr-growth', 'rule-of-40', 'metrics-alignment', 'efficiency'], target: ['valuation-premium', 'term-quality', 'investor-choice', 'strategic-fundraise'] },
      reasonTemplate: 'Growth rate is the primary valuation driver, but Rule of 40 achievement unlocks a 2x+ premium. Companies that combine 40%+ growth with 10%+ FCF margin get the best of both worlds: high multiple AND competitive process.' },
  ],

  patterns: [
    { name: 'Private SaaS Valuation Bands (2024-2025)', domains: ['finance'], description: '< 20% growth: 3-6x ARR. 20-40% growth: 6-12x ARR. 40-80% growth: 12-20x ARR. > 80% growth: 15-30x ARR. AI premium: +2-5x. Rule of 40 premium: +2-3x. NRR > 120% premium: +2x. Medians compress 30-40% from 2021 peaks.', observed: 85, expected: 25, total: 100 },
    { name: 'The 18-Month Fundraise Cadence', domains: ['finance', 'strategy'], description: 'Optimal fundraise cadence: raise 18-24 months of runway, spend 12 months executing, start next raise at 12 months runway. The 3-6 month fundraise process means starting at 12+ months is critical. Companies that wait until 6 months lose all leverage.', observed: 82, expected: 30, total: 100 },
    { name: 'Term Sheet Red Flags', domains: ['finance'], description: 'Red flags: participating preferred, > 1x liquidation preference, full ratchet anti-dilution, > 20% option pool requirement, board seat majority, pay-to-play with harsh penalties, redemption rights. Green flags: 1x non-participating, weighted average anti-dilution, standard vesting, ROFR without drag-along.', observed: 80, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'fundraise_terms_quality', expectedChange: 0.40, timeframeDays: 180, condition: 'raised_from_strength_with_12m_runway AND competitive_process' },
    { metric: 'valuation_multiple', expectedChange: -0.35, timeframeDays: 0, condition: 'desperation_fundraise_under_6m_runway' },
  ],

  narrative: `Fundraise timing is the difference between diluting 20% and diluting 35%. The single most important variable is runway — raising with 12+ months gives leverage, under 6 months means accepting whatever terms are offered. Growth rate drives valuation multiples in a power law: 20% growth = 5x ARR, 50% growth = 15x, 100% growth = 25x+. Rule of 40 achievement adds a 2x premium. Multiple term sheets create BATNA (Best Alternative to Negotiated Agreement) that improves terms by 20-30%. Bridge rounds signal weakness and discount the next round. The optimal cadence: raise 18-24 months, execute for 12 months, start next raise at 12 months runway.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const VC_METRICS_LOGIC_DEEP_PACKS: TrainingPack[] = [
  unitEconomicsMath,
  cohortRetentionCurves,
  capTableDilution,
  fundraiseValuationLogic,
];
