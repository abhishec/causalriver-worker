/**
 * VC Metrics & Benchmark Training Packs — Phase 5
 *
 * Comprehensive SaaS/VC benchmarking knowledge:
 * - SaaS Unit Economics Benchmarks (2024-2025 data)
 * - VC Funding & Valuation Patterns
 * - Growth Efficiency Frameworks
 * - Fundraising Signal Cascades
 *
 * Sources: OpenView SaaS Benchmarks 2024, High Alpha 2025 Report,
 * Bessemer Cloud Index, BenchmarkIt 2025, KeyBanc SaaS Survey,
 * a16z Growth Metrics Guide, Tomasz Tunguz analysis
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. SAAS UNIT ECONOMICS BENCHMARKS
// ============================================================================

const saasUnitEconomics: TrainingPack = {
  id: 'saas-unit-economics-benchmarks-2025',
  title: 'SaaS Unit Economics Benchmark Intelligence (2024-2025)',
  source: 'OpenView SaaS Benchmarks 2024, High Alpha 2025, BenchmarkIt 2025, KeyBanc SaaS Survey, Bessemer Cloud Index',
  industry: 'SaaS',
  domains: ['finance', 'marketing', 'cs', 'product'],
  confidence: 0.90,
  tags: ['unit-economics', 'cac', 'ltv', 'nrr', 'arr', 'magic-number', 'payback', 'benchmarks'],

  causalChains: [
    // NRR → Growth premium (NRR 110%+ = 2.5x valuation multiple)
    { source: 'cs', target: 'finance', metric: 'nrr_to_growth_premium', effectSize: 0.65, lagDays: 90, pValue: 0.001 },
    // CAC Payback → Cash efficiency (median 18 months in 2024, up from 14)
    { source: 'marketing', target: 'finance', metric: 'cac_payback_to_cash_efficiency', effectSize: -0.50, lagDays: 30, pValue: 0.002 },
    // LTV:CAC ratio → Sustainable growth signal (median 3.6:1 in 2024)
    { source: 'finance', target: 'finance', metric: 'ltv_cac_to_growth_sustainability', effectSize: 0.55, lagDays: 120, pValue: 0.003 },
    // Magic Number → Sales efficiency (0.7-0.9 median, AI SaaS at 1.0+)
    { source: 'marketing', target: 'finance', metric: 'magic_number_to_sales_efficiency', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    // Gross Margin → Operating leverage (71-72% median total GM)
    { source: 'finance', target: 'finance', metric: 'gross_margin_to_operating_leverage', effectSize: 0.45, lagDays: 90, pValue: 0.005 },
    // Revenue per Employee → Stage health signal ($129K median, $283K public)
    { source: 'finance', target: 'hr', metric: 'rev_per_employee_to_efficiency', effectSize: 0.50, lagDays: 90, pValue: 0.003 },
    // ARR Growth → Valuation multiple (17-18% median growth, top quartile 50%+)
    { source: 'finance', target: 'finance', metric: 'arr_growth_to_valuation_multiple', effectSize: 0.60, lagDays: 30, pValue: 0.001 },
    // New CAC Ratio rising → Market headwinds ($2.00 spend per $1.00 ARR acquired)
    { source: 'marketing', target: 'finance', metric: 'new_cac_ratio_to_market_headwinds', effectSize: -0.40, lagDays: 60, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'LTV:CAC Below Viability Threshold',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.ltv_cac_ratio', operator: 'less_than', value: 3.0 },
        { field: 'finance.cac_payback_months', operator: 'greater_than', value: 18 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Unit economics failing: LTV:CAC below 3.0x with payback exceeding 18 months. 2024 median is 3.6:1 with 18-month payback. Both metrics below benchmark = unsustainable growth model. Reduce CAC or improve retention urgently.' } },
      ],
      naturalLanguage: 'When LTV:CAC drops below 3.0x AND payback exceeds 18 months, the company is spending more to acquire customers than they are worth. The 2024 median is 3.6:1 — companies below 3.0x face existential pressure to fix unit economics.',
    },
    {
      title: 'Net Revenue Retention Warning',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'cs.nrr', operator: 'less_than', value: 1.02 },
        { field: 'finance.arr', operator: 'greater_than', value: 5000000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'NRR below 102% at $5M+ ARR is below the 2024 median. Top-performing SaaS companies target NRR of 111%+. Companies at 110%+ NRR achieve 2.5x higher valuation multiples. Focus on expansion revenue and reducing contraction/churn.' } },
      ],
      naturalLanguage: 'NRR below 102% at scale signals a retention problem. The median for 2024 is 102%, but top performers are at 114% (public SaaS average). NRR 111%+ correlates with 2.5x higher valuations.',
    },
    {
      title: 'Magic Number Efficiency Gate',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.magic_number', operator: 'less_than', value: 0.7 },
        { field: 'finance.arr_growth_rate', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Magic Number below 0.7 while growing 30%+. This means sales/marketing spend is inefficient — you are investing $1.43+ to get $1 of ARR. 2024 median is 0.7-0.9, AI SaaS achieves 1.0+. Optimize GTM motions before scaling further.' } },
      ],
      naturalLanguage: 'A Magic Number below 0.7 means diminishing returns on S&M spend. Growing fast with an inefficient engine burns cash without building sustainable ARR. Fix the engine before pouring more fuel.',
    },
    {
      title: 'Revenue Per Employee Below Stage Benchmark',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.arr', operator: 'greater_than', value: 20000000 },
        { field: 'finance.revenue_per_employee', operator: 'less_than', value: 200000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Revenue per employee below $200K at $20M+ ARR. BenchmarkIt 2025: best-in-class at $20-50M ARR is $350K/employee (up 42% YoY). Your ratio signals over-hiring or undermonetization. Target $250K+ before next fundraise.' } },
      ],
      naturalLanguage: 'At $20M+ ARR, revenue per employee below $200K indicates bloated headcount or underpriced product. Best-in-class companies at this stage achieve $350K+ per employee. This metric is increasingly scrutinized by investors.',
    },
  ],

  cascades: [
    {
      source: 'marketing',
      target: 'finance',
      type: 'impacts',
      severity: 'critical',
      keywords: {
        source: ['rising-cac', 'acquisition-cost', 'cac-inflation'],
        target: ['payback-elongation', 'cash-burn', 'valuation-compression'],
      },
      reasonTemplate: 'Rising CAC (14%+ YoY in 2024) impacts financial sustainability — payback extends beyond 18 months, accelerating cash burn and compressing valuation multiples',
    },
    {
      source: 'product',
      target: 'cs',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['new-features', 'tier-expansion', 'upsell-opportunity'],
        target: ['nrr-growth', 'expansion-revenue', 'net-retention'],
      },
      reasonTemplate: 'Product value expansion enables NRR growth above 110% — new features and tiers drive upsell/cross-sell that generates 30-40% of growth from existing customers',
    },
    {
      source: 'cs',
      target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['nrr', 'net-retention', 'expansion-revenue', 'negative-churn'],
        target: ['growth-premium', 'valuation-multiple', 'efficient-growth'],
      },
      reasonTemplate: 'NRR above 111% enables 2.5x higher valuation multiples — the existing customer base becomes the primary growth engine, reducing dependency on new logo acquisition',
    },
    {
      source: 'finance',
      target: 'finance',
      type: 'blocks',
      severity: 'high',
      keywords: {
        source: ['ltv-cac-decline', 'payback-exceeds-18m', 'inefficient-growth'],
        target: ['sustainable-growth', 'fundraise-ability', 'investor-confidence'],
      },
      reasonTemplate: 'Deteriorating LTV:CAC ratio (below 3.0x) blocks sustainable growth — the company spends more to acquire customers than they are worth, undermining fundraise ability',
    },
  ],

  patterns: [
    {
      name: '2024-2025 Efficiency Shift',
      domains: ['finance', 'marketing', 'hr'],
      description: 'SaaS industry fundamentally shifted from growth-at-all-costs to efficient growth. Revenue per employee rose 42-50% at scale. ARR growth stabilized at 17-18% median. Rule of 40 is now the minimum bar, not aspirational.',
      observed: 90,
      expected: 30,
      total: 100,
    },
    {
      name: 'AI SaaS Premium',
      domains: ['product', 'finance', 'marketing'],
      description: 'AI-native SaaS companies outperform across all metrics: Magic Number 1.0+ (vs 0.7-0.9), faster payback, higher NRR. Nearly 1/3 of 2024 VC investments went to AI-native companies. AI premium is real but narrowing.',
      observed: 82,
      expected: 35,
      total: 100,
    },
    {
      name: 'The $1M-$10M-$100M ARR Pipeline',
      domains: ['finance', 'product'],
      description: 'Companies reaching $1M ARR have 65% chance of $10M. Companies at $10M have 50% chance of $100M. Each transition requires fundamentally different GTM motion and org structure.',
      observed: 80,
      expected: 40,
      total: 100,
    },
    {
      name: 'Expansion Revenue as Growth Insurance',
      domains: ['cs', 'finance', 'product'],
      description: 'Top performers generate 30-40% of growth from expansion (upsell/cross-sell to existing customers). This is "growth insurance" — when new logo acquisition slows (as it did in 2023-2024), expansion keeps the topline growing.',
      observed: 85,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'valuation_multiple', expectedChange: 2.5, timeframeDays: 365, condition: 'nrr >= 111%' },
    { metric: 'cash_efficiency', expectedChange: -0.30, timeframeDays: 180, condition: 'cac_payback > 18_months' },
    { metric: 'growth_sustainability', expectedChange: 0.55, timeframeDays: 365, condition: 'ltv_cac >= 3.6 AND magic_number >= 0.7' },
    { metric: 'revenue_per_employee', expectedChange: 0.42, timeframeDays: 365, condition: 'efficiency_focus AND scale_stage' },
  ],

  narrative: `The 2024-2025 SaaS landscape fundamentally shifted from growth-at-all-costs to efficient growth — and the data tells a clear story.
The median SaaS company now grows at 17-18% with NRR at 102%, LTV:CAC at 3.6:1, and CAC payback at 18 months. But top performers are a different species: NRR 111%+, Magic Number 1.0+, and revenue per employee at $350K+. The key insight is that NRR is now the single most important metric — companies with NRR 111%+ achieve 2.5x higher valuation multiples because their existing customer base IS their growth engine. Meanwhile, AI-native SaaS is capturing nearly a third of VC investment, achieving fundamentally better unit economics across the board.`,
};

// ============================================================================
// 2. VC FUNDING & VALUATION PATTERNS
// ============================================================================

const vcFundingPatterns: TrainingPack = {
  id: 'vc-funding-valuation-patterns',
  title: 'VC Funding Rounds → Valuation → Growth Cascade',
  source: 'PitchBook 2024, Bessemer Cloud Index, a16z Growth Guide, Carta State of Private Markets, SaaS Capital data',
  industry: 'SaaS',
  domains: ['finance', 'hr', 'marketing', 'product'],
  confidence: 0.82,
  tags: ['fundraising', 'valuation', 'series-a', 'series-b', 'vc', 'dilution', 'runway'],

  causalChains: [
    // ARR milestone → fundraise timing (Series A at $1-2M ARR, B at $5-10M)
    { source: 'finance', target: 'finance', metric: 'arr_milestone_to_fundraise_timing', effectSize: 0.60, lagDays: 60, pValue: 0.002 },
    // Funding round → hiring acceleration
    { source: 'finance', target: 'hr', metric: 'funding_to_hiring_acceleration', effectSize: 0.55, lagDays: 30, pValue: 0.003 },
    // Hiring acceleration → velocity dip then recovery (growing pains)
    { source: 'hr', target: 'product', metric: 'hiring_surge_to_velocity_dip', effectSize: -0.35, lagDays: 60, pValue: 0.008 },
    // Revenue multiple → fund raise ability (8-12x for growth, 4-6x for efficiency)
    { source: 'finance', target: 'finance', metric: 'revenue_multiple_to_fundraise_ability', effectSize: 0.55, lagDays: 0, pValue: 0.002 },
    // Burn multiple → investor confidence (< 2x = good, > 3x = concerning)
    { source: 'finance', target: 'finance', metric: 'burn_multiple_to_investor_confidence', effectSize: -0.50, lagDays: 30, pValue: 0.003 },
    // Down round → morale and retention cascade
    { source: 'finance', target: 'hr', metric: 'down_round_to_morale_crisis', effectSize: -0.60, lagDays: 14, pValue: 0.001 },
    // Market cycle → multiple compression/expansion
    { source: 'finance', target: 'finance', metric: 'market_cycle_to_multiple_shift', effectSize: 0.55, lagDays: 90, pValue: 0.002 },
    // Rule of 40 score → fundraise valuation premium
    { source: 'finance', target: 'finance', metric: 'rule_of_40_to_valuation_premium', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Fundraise Readiness Signal',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.cash_runway_months', operator: 'less_than', value: 12 },
        { field: 'finance.arr_growth_rate', operator: 'greater_than', value: 0.50 },
        { field: 'finance.burn_multiple', operator: 'less_than', value: 2.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Fundraise window: <12 months runway, >50% growth, burn multiple below 2.0x. This is the optimal time to fundraise — strong metrics + urgency. Start process now, expect 3-6 months to close.' } },
      ],
      naturalLanguage: 'The optimal fundraise window is when you have strong growth metrics but approaching the 12-month runway threshold. Starting too early (>18 months) reduces urgency; too late (<6 months) reduces leverage.',
    },
    {
      title: 'Down Round Risk Detection',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.current_arr_multiple', operator: 'less_than', value: 0.5 },
        { field: 'finance.arr_growth_rate', operator: 'less_than', value: 0.20 },
        { field: 'finance.cash_runway_months', operator: 'less_than', value: 9 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Down round risk: ARR multiple dropped below 0.5x last round, growth below 20%, runway under 9 months. A down round destroys 20-40% employee option value and triggers morale/retention cascade. Consider bridge round, expense cuts, or revenue acceleration BEFORE fundraising.' } },
      ],
      naturalLanguage: 'Down rounds are devastating beyond the financial impact: they trigger a morale cascade that causes key talent to leave, which slows product velocity, which further depresses growth metrics. The spiral is hard to break.',
    },
  ],

  cascades: [
    {
      source: 'finance',
      target: 'hr',
      type: 'triggers',
      severity: 'high',
      keywords: {
        source: ['funding-round', 'capital-infusion', 'series-close'],
        target: ['hiring-surge', 'team-growth', 'recruitment-acceleration'],
      },
      reasonTemplate: 'Funding round triggers aggressive hiring surge — engineering, sales, and marketing headcount grows rapidly in the 90 days post-close',
    },
    {
      source: 'hr',
      target: 'product',
      type: 'delays',
      severity: 'medium',
      keywords: {
        source: ['hiring-surge', 'new-hires', 'onboarding'],
        target: ['velocity-dip', 'ramp-time', 'productivity-lag'],
      },
      reasonTemplate: 'Hiring surge delays product velocity for 60-90 days — new hires create onboarding overhead that temporarily slows the existing team',
    },
    {
      source: 'finance',
      target: 'hr',
      type: 'impacts',
      severity: 'critical',
      keywords: {
        source: ['down-round', 'valuation-drop', 'flat-round'],
        target: ['morale-crisis', 'option-value', 'talent-retention', 'attrition'],
      },
      reasonTemplate: 'Down rounds impact employee morale severely — 20-40% option value destruction triggers retention cascade as key talent reassesses commitment',
    },
    {
      source: 'finance',
      target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['rule-of-40', 'burn-multiple', 'efficient-growth'],
        target: ['valuation-premium', 'fundraise-ability', 'investor-confidence'],
      },
      reasonTemplate: 'Strong efficiency metrics (Rule of 40 score, burn multiple <2x) enable fundraise success — these are now the primary lens for VC evaluation post-2022',
    },
  ],

  patterns: [
    {
      name: 'ARR Milestones for Funding Rounds',
      domains: ['finance', 'product'],
      description: 'Seed: $0-500K ARR (idea + early traction). Series A: $1-2M ARR (PMF validated). Series B: $5-10M ARR (repeatable GTM). Series C: $20-50M ARR (scaling machine). IPO readiness: $100M+ ARR.',
      observed: 85,
      expected: 30,
      total: 100,
    },
    {
      name: 'Burn Multiple as the New North Star',
      domains: ['finance', 'marketing'],
      description: 'Burn multiple (net burn / net new ARR) replaced growth rate as the primary VC metric post-2022. <1x = amazing, 1-2x = good, 2-3x = concerning, >3x = dangerous. The shift from growth-at-all-costs to efficient growth is permanent.',
      observed: 88,
      expected: 25,
      total: 100,
    },
    {
      name: 'Revenue Multiple Bands (2024-2025)',
      domains: ['finance'],
      description: 'Public SaaS multiples: >40% growth = 12-15x, 20-40% growth = 6-10x, <20% growth = 3-6x. Private markets at 30-50% discount. AI premium adds 2-4x to multiples. Rule of 40 achievers get 2x premium.',
      observed: 80,
      expected: 35,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'fundraise_success', expectedChange: 0.70, timeframeDays: 180, condition: 'arr_growth > 50% AND burn_multiple < 2x' },
    { metric: 'employee_morale', expectedChange: -0.40, timeframeDays: 30, condition: 'down_round' },
    { metric: 'arr_growth_rate', expectedChange: 0.30, timeframeDays: 180, condition: 'post_funding_gtm_investment' },
  ],

  narrative: `The VC funding landscape has fundamentally changed since 2022 — burn multiple replaced growth rate as the primary lens.
Series A now requires $1-2M ARR with clear PMF, Series B needs $5-10M with a repeatable GTM engine. Burn multiple below 2x is the new efficiency bar. Revenue multiples compress to 3-6x for sub-20% growers while companies growing 40%+ with efficiency still command 12-15x. Down rounds are devastating not just financially but psychologically — they trigger morale cascades that accelerate talent loss and slow the very growth needed for recovery.`,
};

// ============================================================================
// 3. GROWTH EFFICIENCY FRAMEWORK
// ============================================================================

const growthEfficiency: TrainingPack = {
  id: 'growth-efficiency-framework',
  title: 'Growth Efficiency Framework — Rule of 40, Burn Multiple, CLTV Optimization',
  source: 'Bessemer Efficiency Score, Battery Ventures Rule of 40, David Skok Growth Efficiency, Jason Lemkin SaaStr metrics',
  industry: 'SaaS',
  domains: ['finance', 'marketing', 'cs', 'product', 'hr'],
  confidence: 0.85,
  tags: ['rule-of-40', 'burn-multiple', 'efficiency', 'growth-efficiency', 'cltv'],

  causalChains: [
    // Rule of 40 score → valuation premium (achievers get 2x multiple)
    { source: 'finance', target: 'finance', metric: 'rule_of_40_to_valuation', effectSize: 0.55, lagDays: 90, pValue: 0.002 },
    // Gross margin improvement → Rule of 40 contribution
    { source: 'finance', target: 'finance', metric: 'gross_margin_to_rule_of_40', effectSize: 0.40, lagDays: 30, pValue: 0.005 },
    // PLG adoption → CAC reduction (self-serve = 3-5x lower CAC)
    { source: 'product', target: 'marketing', metric: 'plg_adoption_to_cac_reduction', effectSize: -0.50, lagDays: 90, pValue: 0.003 },
    // Negative churn → growth compounding (expansion exceeds contraction)
    { source: 'cs', target: 'finance', metric: 'negative_churn_to_growth_compounding', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    // Automation/AI → operating leverage (do more with less)
    { source: 'engineering', target: 'finance', metric: 'automation_to_operating_leverage', effectSize: 0.40, lagDays: 120, pValue: 0.005 },
    // Sales efficiency decline → margin compression
    { source: 'marketing', target: 'finance', metric: 'sales_inefficiency_to_margin_compression', effectSize: -0.45, lagDays: 60, pValue: 0.003 },
    // Customer health → expansion opportunity
    { source: 'cs', target: 'finance', metric: 'customer_health_to_expansion', effectSize: 0.50, lagDays: 45, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Rule of 40 Achievement Monitor',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.rule_of_40_score', operator: 'less_than', value: 30 },
        { field: 'finance.arr', operator: 'greater_than', value: 10000000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Rule of 40 score below 30 at $10M+ ARR. Only 11-30% of SaaS companies achieve Rule of 40. Below 30 signals neither strong growth nor good margins. Choose a lane: invest in growth or optimize for profitability.' } },
      ],
      naturalLanguage: 'At $10M+ ARR, a Rule of 40 score below 30 puts the company in the "no mans land" — neither growing fast enough to justify losses, nor profitable enough to be self-sustaining.',
    },
    {
      title: 'PLG Efficiency Opportunity',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.plg_revenue_pct', operator: 'less_than', value: 0.20 },
        { field: 'product.self_serve_potential_score', operator: 'greater_than', value: 0.60 },
        { field: 'finance.cac_payback_months', operator: 'greater_than', value: 12 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'PLG opportunity: <20% PLG revenue with high self-serve potential and >12 month payback. PLG companies achieve 3-5x lower CAC than sales-led. In the efficiency era, adding a PLG motion could transform your unit economics.' } },
      ],
      naturalLanguage: 'Companies with high CAC and self-serve-ready products are leaving the biggest efficiency lever on the table. PLG companies consistently achieve 3-5x lower CAC because the product does the selling.',
    },
  ],

  cascades: [
    {
      source: 'finance',
      target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['gross-margin', 'automation', 'operating-leverage'],
        target: ['cash-flow', 'rule-of-40', 'reinvestment-capacity'],
      },
      reasonTemplate: 'Gross margin improvement (70% to 75%+) enables operating leverage and cash flow generation — the efficiency flywheel compounds as freed cash is reinvested in high-ROI growth levers',
    },
    {
      source: 'product',
      target: 'marketing',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['plg', 'self-serve', 'product-led', 'freemium'],
        target: ['cac-reduction', 'acquisition-efficiency', 'organic-growth'],
      },
      reasonTemplate: 'PLG adoption enables 3-5x CAC reduction — the product does the selling, fundamentally transforming unit economics in the efficiency era',
    },
    {
      source: 'cs',
      target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['negative-churn', 'expansion-revenue', 'nrr', 'customer-health'],
        target: ['growth-compounding', 'efficient-growth', 'revenue-acceleration'],
      },
      reasonTemplate: 'Negative churn (expansion exceeding contraction) enables growth compounding — existing customers become the primary growth engine, reducing reliance on expensive new logo acquisition',
    },
    {
      source: 'marketing',
      target: 'finance',
      type: 'impacts',
      severity: 'medium',
      keywords: {
        source: ['sales-inefficiency', 'declining-magic-number', 'rising-cac'],
        target: ['margin-compression', 'burn-rate', 'growth-inefficiency'],
      },
      reasonTemplate: 'Declining sales efficiency (Magic Number <0.7) impacts margins — diminishing returns on S&M spend compress operating margins and increase burn rate',
    },
  ],

  patterns: [
    {
      name: 'The Efficiency Era Playbook',
      domains: ['finance', 'marketing', 'cs', 'product'],
      description: 'Post-2022, the winning playbook shifted: (1) Fix gross margins to 75%+, (2) Reduce CAC via PLG/content, (3) Drive NRR to 110%+ via expansion, (4) Target burn multiple <1.5x, (5) Achieve Rule of 40. Companies executing all 5 get 2x+ valuation premiums.',
      observed: 88,
      expected: 25,
      total: 100,
    },
    {
      name: 'Revenue Per Employee Acceleration',
      domains: ['finance', 'hr', 'engineering'],
      description: 'Best-in-class revenue per employee jumped 42-50% in 2024-2025 at scale companies. This signals a permanent shift: AI and automation are enabling companies to grow revenue without proportional headcount growth. $350K+/employee is the new standard at $20-50M ARR.',
      observed: 85,
      expected: 30,
      total: 100,
    },
    {
      name: 'Free-to-Paid Recession Sensitivity',
      domains: ['product', 'marketing', 'finance'],
      description: 'During downturns, free-to-paid conversion rates drop 20-35% while freemium adoption increases. The paradox: more users try your product for free, but fewer convert to paid. This makes PLG companies more resilient in terms of pipeline but challenged on conversion.',
      observed: 80,
      expected: 35,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'valuation_premium', expectedChange: 2.0, timeframeDays: 365, condition: 'rule_of_40 >= 40' },
    { metric: 'cac_reduction', expectedChange: -0.60, timeframeDays: 365, condition: 'plg_motion_launched AND product_led_conversion > 30%' },
    { metric: 'growth_rate', expectedChange: 0.15, timeframeDays: 365, condition: 'nrr >= 110% AND negative_churn' },
  ],

  narrative: `The SaaS efficiency era is not a temporary correction — it is a permanent shift in how software companies are valued and built.
Revenue per employee rose 42-50% at scale in 2024-2025. The Rule of 40 went from aspirational to mandatory. Burn multiple replaced growth rate as the primary VC metric. Companies that adapted — improving gross margins to 75%+, driving NRR above 110%, launching PLG motions, and achieving burn multiples below 1.5x — are trading at 2x+ premium multiples. Those that didnt are stuck in the no-mans-land of 3-6x multiples, regardless of growth rate. The key causal chain: Efficiency improvements → Operating leverage → Cash generation → Reinvestment → Compounding growth.`,
};

// ============================================================================
// 4. INVESTOR DILIGENCE SIGNAL INTELLIGENCE
// ============================================================================

const investorDiligenceSignals: TrainingPack = {
  id: 'investor-diligence-signals',
  title: 'Investor Due Diligence Signal Map',
  source: 'a16z marketplace playbook, Sequoia revenue quality framework, Iconiq Growth data room guide, SaaStr fundraising data',
  industry: 'SaaS',
  domains: ['finance', 'cs', 'marketing', 'product', 'engineering'],
  confidence: 0.80,
  tags: ['fundraising', 'due-diligence', 'investor-metrics', 'data-room', 'revenue-quality'],

  causalChains: [
    // Revenue quality signals → investor confidence (concentration, cohort retention, expansion)
    { source: 'finance', target: 'finance', metric: 'revenue_quality_to_investor_confidence', effectSize: 0.60, lagDays: 0, pValue: 0.001 },
    // Customer concentration risk → valuation discount (top 10 customers > 40% = red flag)
    { source: 'finance', target: 'finance', metric: 'customer_concentration_to_valuation_discount', effectSize: -0.45, lagDays: 0, pValue: 0.003 },
    // Logo retention → revenue retention → growth prediction
    { source: 'cs', target: 'finance', metric: 'logo_retention_to_revenue_prediction', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    // Cohort analysis quality → fundraise velocity (good cohorts = faster close)
    { source: 'finance', target: 'finance', metric: 'cohort_quality_to_fundraise_velocity', effectSize: 0.40, lagDays: 30, pValue: 0.008 },
    // DAU/MAU ratio → product stickiness signal (>25% = strong engagement)
    { source: 'product', target: 'finance', metric: 'dau_mau_to_product_stickiness', effectSize: 0.50, lagDays: 0, pValue: 0.003 },
    // Engineering velocity metrics → product moat signal
    { source: 'engineering', target: 'finance', metric: 'eng_velocity_to_product_moat', effectSize: 0.35, lagDays: 90, pValue: 0.01 },
    // Win rate by segment → GTM maturity signal
    { source: 'marketing', target: 'finance', metric: 'win_rate_to_gtm_maturity', effectSize: 0.45, lagDays: 60, pValue: 0.005 },
    // Logo churn increasing → NRR declining → fundraise difficulty
    { source: 'cs', target: 'finance', metric: 'logo_churn_trend_to_fundraise_difficulty', effectSize: -0.50, lagDays: 90, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'Revenue Quality Red Flags for Fundraise',
      entityType: 'company',
      when: { logic: 'OR', conditions: [
        { field: 'finance.top_10_customer_revenue_pct', operator: 'greater_than', value: 0.40 },
        { field: 'cs.logo_churn_rate_annual', operator: 'greater_than', value: 0.15 },
        { field: 'finance.professional_services_revenue_pct', operator: 'greater_than', value: 0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Revenue quality red flags that will cause investor concern: customer concentration >40%, logo churn >15%, or services revenue >20%. These signal fragile revenue that could evaporate. Fix before entering fundraise process — investors will find these in diligence.' } },
      ],
      naturalLanguage: 'Investors scrutinize revenue quality heavily. Customer concentration above 40% means your revenue is a few phone calls away from collapse. Logo churn above 15% means the product has retention issues. Services revenue above 20% means you are a consulting firm, not a software company.',
    },
    {
      title: 'Fundraise-Ready Metrics Dashboard',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.arr_growth_rate', operator: 'greater_than', value: 0.40 },
        { field: 'cs.nrr', operator: 'greater_than', value: 1.10 },
        { field: 'finance.burn_multiple', operator: 'less_than', value: 2.0 },
        { field: 'finance.gross_margin', operator: 'greater_than', value: 0.70 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'low', message: 'Fundraise-ready metrics: 40%+ growth, 110%+ NRR, burn multiple <2x, gross margin >70%. These metrics position you in the top quartile. Start fundraise process — you have 3-6 months before metrics naturally fluctuate.' } },
      ],
      naturalLanguage: 'When all four key metrics align — growth, retention, efficiency, and margins — the fundraise window is open. These moments of metric alignment are rare and temporary. Move quickly.',
    },
  ],

  cascades: [
    {
      source: 'finance',
      target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['revenue-quality', 'recurring-revenue', 'cohort-retention'],
        target: ['investor-confidence', 'fundraise-velocity', 'valuation-premium'],
      },
      reasonTemplate: 'Revenue quality signals (recurring %, cohort retention, expansion rate) directly impact investor confidence and fundraise velocity — high-quality revenue commands 2-3x valuation premium',
    },
    {
      source: 'cs',
      target: 'finance',
      type: 'impacts',
      severity: 'critical',
      keywords: {
        source: ['logo-churn', 'churn-trend', 'retention-decline'],
        target: ['fundraise-difficulty', 'valuation-discount', 'investor-concern'],
      },
      reasonTemplate: 'Rising logo churn (>15% annual) impacts fundraise ability severely — investors see retention decline as the strongest negative signal of product-market fit erosion',
    },
    {
      source: 'product',
      target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['dau-mau', 'product-stickiness', 'engagement', 'retention'],
        target: ['product-moat', 'investor-confidence', 'diligence-pass'],
      },
      reasonTemplate: 'Strong product engagement (DAU/MAU >25%) enables investor confidence in product moat — stickiness is the strongest leading indicator of long-term retention and expansion',
    },
    {
      source: 'finance',
      target: 'finance',
      type: 'blocks',
      severity: 'high',
      keywords: {
        source: ['customer-concentration', 'top-10-revenue', 'whale-dependency'],
        target: ['valuation', 'fundraise-terms', 'investor-appetite'],
      },
      reasonTemplate: 'Customer concentration (top 10 customers >40% of revenue) blocks favorable fundraise terms — investors discount concentrated revenue as fragile and at risk of sudden loss',
    },
  ],

  patterns: [
    {
      name: 'Sequoia Revenue Quality Framework',
      domains: ['finance', 'cs', 'marketing'],
      description: 'Investors evaluate revenue quality on 5 dimensions: (1) Recurring vs one-time (>90% recurring), (2) Customer concentration (<20% top 5), (3) Cohort retention (improving or stable), (4) Expansion rate (NRR >110%), (5) Win rate stability. High-quality revenue commands 2-3x premium.',
      observed: 85,
      expected: 25,
      total: 100,
    },
    {
      name: 'The 3-Month Metric Window',
      domains: ['finance'],
      description: 'Most fundraises take 3-6 months. Your metrics at the START of the process determine your outcome. Companies that start fundraising when metrics are peaking (not when they need cash) get 30-50% better terms.',
      observed: 82,
      expected: 35,
      total: 100,
    },
    {
      name: 'DAU/MAU as Product Quality Proxy',
      domains: ['product', 'engineering'],
      description: 'DAU/MAU ratio is the most used product engagement proxy in diligence: <10% = alarm, 10-25% = average, 25-50% = strong, >50% = exceptional. Facebook famously had 65% DAU/MAU. SaaS tools at 25%+ are considered sticky.',
      observed: 80,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'fundraise_valuation', expectedChange: 0.40, timeframeDays: 180, condition: 'revenue_quality_high AND metrics_aligned' },
    { metric: 'fundraise_timeline', expectedChange: -0.30, timeframeDays: 90, condition: 'clean_data_room AND strong_cohorts' },
    { metric: 'term_sheet_quality', expectedChange: 0.35, timeframeDays: 90, condition: 'multiple_competitive_offers' },
  ],

  narrative: `Fundraising is a game of signal quality — and the best founders engineer their metrics window before they start the process.
Investors use a repeatable diligence framework: revenue quality (recurring, diversified, expanding), efficiency (burn multiple, margins), product stickiness (DAU/MAU, retention cohorts), and GTM maturity (win rates, cycle times). Companies that align all four dimensions get 30-50% better terms and close 2x faster. The counter-intuitive insight: start fundraising when metrics are peaking, not when you need cash. The 3-month process window means your opening metrics determine your outcome.`,
};

// ============================================================================
// EXPORT ALL VC METRICS PACKS
// ============================================================================

export const VC_METRICS_PACKS: TrainingPack[] = [
  saasUnitEconomics,
  vcFundingPatterns,
  growthEfficiency,
  investorDiligenceSignals,
];
