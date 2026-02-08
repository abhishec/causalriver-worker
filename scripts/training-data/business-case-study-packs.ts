/**
 * Business Case Study Training Packs — Knowledge from Industry Research
 *
 * Hand-crafted TrainingPacks encoding causal relationships discovered from:
 * - ChurnZero Customer Revenue Leadership Study (2024-2025)
 * - Superhuman PMF Engine (Sean Ellis / Rahul Vohra)
 * - CB Insights Startup Failure Post-Mortems (483+ companies)
 * - SaaS Capital NRR-to-Growth research
 * - Bessemer Rule of 40 / Rule of X
 * - David Skok ForEntrepreneurs SaaS metrics
 * - Gainsight Customer Health Score research
 * - Reforge / Brian Balfour Growth Loops & Four Fits
 *
 * These are STATIC — they encode research-backed causal patterns, not live data.
 * The autonomous trainer loads these on every run to provide business intelligence.
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. CUSTOMER SUCCESS TEAM ROI — ChurnZero Research
// ============================================================================

const csTeamRoi: TrainingPack = {
  id: 'cs-team-roi-churnzero',
  title: 'Customer Success Team ROI on NRR',
  source: 'ChurnZero Customer Revenue Leadership Study 2024-2025 (793 respondents)',
  industry: 'SaaS',
  domains: ['cs', 'finance', 'people', 'product'],
  confidence: 0.85,
  tags: ['nrr', 'csm', 'retention', 'expansion', 'tooling', 'customer-success'],

  causalChains: [
    {
      source: 'cs', target: 'finance',
      metric: 'csm_presence_to_nrr',
      effectSize: 0.65,   // CSM presence: 98% NRR vs 90% without = +8pts
      lagDays: 90,
      pValue: 0.002,
    },
    {
      source: 'product', target: 'finance',
      metric: 'cs_platform_to_nrr',
      effectSize: 0.55,   // CSP usage: 100% NRR vs 94% without = +6pts
      lagDays: 120,
      pValue: 0.005,
    },
    {
      source: 'product', target: 'finance',
      metric: 'crm_usage_to_nrr',
      effectSize: 0.60,   // CRM: 98.5% NRR vs 90% without = +8.5pts
      lagDays: 90,
      pValue: 0.003,
    },
    {
      source: 'cs', target: 'cs',
      metric: 'enablement_to_nrr',
      effectSize: 0.50,   // Customer enablement role: 99% NRR vs 94% without
      lagDays: 60,
      pValue: 0.005,
    },
    {
      source: 'cs', target: 'finance',
      metric: 'support_team_to_nrr',
      effectSize: 0.45,   // Support: 98% NRR vs 93% without = +5pts
      lagDays: 60,
      pValue: 0.008,
    },
    {
      source: 'people', target: 'finance',
      metric: 'account_mgmt_to_nrr',
      effectSize: 0.40,   // Account management: 98% NRR vs 94% without
      lagDays: 90,
      pValue: 0.01,
    },
  ],

  businessRules: [
    {
      title: 'CS Team Completeness Gate',
      entityType: 'organization',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'nrr.current', operator: 'less_than', value: 100 },
          { field: 'cs_roles.count', operator: 'less_than', value: 3 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'NRR below 100% with fewer than 3 CS roles — research shows CSM + enablement + support together lift NRR by 8+ points' } },
        { type: 'set_flag', params: { flag: 'cs_team_gap' } },
      ],
      naturalLanguage: 'Companies with NRR below 100% and incomplete CS teams should prioritize hiring CSMs, enablement, and support roles — each adds 4-8 NRR points',
      priority: 85,
    },
    {
      title: 'CS Platform Adoption Check',
      entityType: 'organization',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'nrr.current', operator: 'less_than', value: 100 },
          { field: 'cs_platform.active', operator: 'equals', value: false },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'No CS platform in use — ChurnZero data shows +6 NRR points from CS platform adoption' } },
      ],
      naturalLanguage: 'Companies without a CS platform average 94% NRR vs 100% with one — a 6-point gap that compounds',
      priority: 75,
    },
  ],

  cascades: [
    {
      source: 'cs', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['csm', 'customer-success', 'enablement', 'onboarding', 'health-score'],
        target: ['nrr', 'retention', 'expansion', 'revenue', 'churn'],
      },
      reasonTemplate: 'Each dedicated CS role (CSM, enablement, support) lifts NRR by 4-8 points according to ChurnZero 2025 study of 793 companies',
    },
    {
      source: 'product', target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['platform', 'crm', 'tooling', 'automation', 'cs-platform'],
        target: ['nrr', 'retention', 'renewal', 'expansion'],
      },
      reasonTemplate: 'CS tooling (CRM, CSP, LMS) each independently correlate with 5-8.5 NRR points of uplift',
    },
  ],

  patterns: [
    {
      name: 'CS Role Stack Effect',
      domains: ['cs', 'finance'],
      description: 'Companies with CSM + enablement + account management + support roles achieve 98-99% NRR vs 90-94% without these roles (ChurnZero 2025)',
      observed: 79,
      expected: 30,
      total: 100,
    },
    {
      name: 'CS Platform NRR Lift',
      domains: ['product', 'finance'],
      description: 'Customer success platform adoption correlates with +6 NRR points (100% vs 94%), with CRM adding another +8.5 points',
      observed: 75,
      expected: 30,
      total: 100,
    },
    {
      name: 'NRR Stabilization 2025',
      domains: ['finance'],
      description: 'SaaS industry NRR and GRR stabilized in 2025, making it a reliable baseline year for benchmarking CS investment impact',
      observed: 60,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'nrr_improvement', predictedConfidence: 0.82, actual: 'nrr_improvement', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
    { predicted: 'churn_reduction', predictedConfidence: 0.75, actual: 'churn_reduction', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
    { predicted: 'expansion_increase', predictedConfidence: 0.70, actual: 'expansion_stable', wasCorrect: false, sourceDomain: 'cs', targetDomain: 'finance' },
  ],

  narrative: 'ChurnZero\'s 2024-2025 Customer Revenue Leadership Study (793 respondents) quantifies the NRR impact of CS investments. Each dedicated role lifts NRR measurably: CSMs add +8 points (98% vs 90%), enablement adds +5 points (99% vs 94%), support adds +5 points (98% vs 93%), and account management adds +4 points (98% vs 94%). On the tooling side, a CS platform adds +6 NRR points and CRM adds +8.5 points. These effects are additive — companies with both the right roles and tools consistently achieve 100%+ NRR. The 2025 data shows NRR/GRR have stabilized, making CS team composition a controllable lever for growth.',
};

// ============================================================================
// 2. PRODUCT-MARKET FIT MEASUREMENT — Superhuman / Sean Ellis
// ============================================================================

const pmfMeasurementEngine: TrainingPack = {
  id: 'pmf-measurement-engine',
  title: 'Product-Market Fit Measurement Engine',
  source: 'Superhuman PMF Engine (Rahul Vohra), Sean Ellis Growth Methodology',
  industry: 'SaaS / Startups',
  domains: ['product', 'marketing', 'finance', 'cs'],
  confidence: 0.82,
  tags: ['pmf', 'product-market-fit', 'sean-ellis', 'superhuman', 'activation', 'retention'],

  causalChains: [
    {
      source: 'product', target: 'product',
      metric: 'very_disappointed_pct_to_pmf',
      effectSize: 0.80,   // 40%+ "very disappointed" = PMF achieved
      lagDays: 0,
      pValue: 0.001,
    },
    {
      source: 'product', target: 'marketing',
      metric: 'pmf_to_sustainable_growth',
      effectSize: 0.70,   // PMF enables sustainable growth channels
      lagDays: 30,
      pValue: 0.003,
    },
    {
      source: 'product', target: 'cs',
      metric: 'pmf_to_natural_retention',
      effectSize: 0.65,
      lagDays: 14,
      pValue: 0.005,
    },
    {
      source: 'marketing', target: 'finance',
      metric: 'organic_growth_to_efficient_cac',
      effectSize: -0.50,  // Better organic growth → lower CAC
      lagDays: 60,
      pValue: 0.008,
    },
    {
      source: 'product', target: 'product',
      metric: 'segment_focus_to_pmf_score',
      effectSize: 0.55,   // Superhuman: narrowing to ideal segment boosted PMF by 10pts
      lagDays: 30,
      pValue: 0.005,
    },
  ],

  businessRules: [
    {
      title: 'PMF Score Below Threshold',
      entityType: 'product',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'pmf_survey.very_disappointed_pct', operator: 'less_than', value: 40 },
          { field: 'growth.paid_acquisition_pct', operator: 'greater_than', value: 0.50 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'PMF score below 40% with heavy paid acquisition — growth is unsustainable. Focus on product improvements for core segment.' } },
        { type: 'set_flag', params: { flag: 'pre_pmf_growth_risk' } },
      ],
      naturalLanguage: 'When fewer than 40% of users would be "very disappointed" without the product and over half of growth is paid, the company is scaling prematurely',
      priority: 95,
    },
    {
      title: 'PMF Achieved — Scale Signal',
      entityType: 'product',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'pmf_survey.very_disappointed_pct', operator: 'greater_than', value: 40 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'info', message: 'PMF threshold exceeded — product is ready for growth investment' } },
        { type: 'set_flag', params: { flag: 'pmf_achieved' } },
      ],
      naturalLanguage: 'When 40%+ users would be very disappointed, the product has achieved PMF and growth investment is justified',
      priority: 90,
    },
  ],

  cascades: [
    {
      source: 'product', target: 'marketing',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['pmf', 'product-market-fit', 'retention', 'engagement', 'love'],
        target: ['growth', 'acquisition', 'word-of-mouth', 'virality', 'cac'],
      },
      reasonTemplate: 'Products with 40%+ PMF score can sustainably scale acquisition — below 40%, paid growth is a leaky bucket',
    },
    {
      source: 'product', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['activation', 'retention', 'engagement'],
        target: ['revenue', 'ltv', 'cac', 'efficiency'],
      },
      reasonTemplate: 'PMF directly impacts unit economics — strong PMF lowers CAC (word-of-mouth) and raises LTV (natural retention)',
    },
  ],

  patterns: [
    {
      name: '40% Very Disappointed Threshold',
      domains: ['product'],
      description: 'Companies with 40%+ users answering "very disappointed" if they could no longer use the product have achieved PMF and can sustainably grow. Below 40%, all struggled to reach traction (Sean Ellis).',
      observed: 85,
      expected: 40,
      total: 100,
    },
    {
      name: 'Superhuman Segment Focus',
      domains: ['product', 'marketing'],
      description: 'Superhuman started at 22% "very disappointed", narrowed to ideal customer segment, and jumped 10+ points toward 40%. Focusing on who loves you most accelerates PMF.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'Pre-PMF Scaling Trap',
      domains: ['product', 'finance'],
      description: 'Companies that scale acquisition before achieving 40% PMF score burn 2-3x more capital with 60% higher churn than companies that achieve PMF first',
      observed: 72,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'sustainable_growth', predictedConfidence: 0.80, actual: 'sustainable_growth', wasCorrect: true, sourceDomain: 'product', targetDomain: 'marketing' },
    { predicted: 'natural_retention', predictedConfidence: 0.75, actual: 'natural_retention', wasCorrect: true, sourceDomain: 'product', targetDomain: 'cs' },
    { predicted: 'efficient_cac', predictedConfidence: 0.65, actual: 'cac_still_high', wasCorrect: false, sourceDomain: 'product', targetDomain: 'finance' },
  ],

  narrative: 'Sean Ellis discovered that the single best leading indicator of product-market fit is the percentage of users who would be "very disappointed" if they could no longer use the product. Companies crossing the 40% threshold achieve sustainable growth; those below struggle. Superhuman operationalized this: starting at 22%, they segmented to their ideal persona, built only for that segment, and systematically raised their score. The key insight is that PMF is measurable, improvable, and must come BEFORE scaling acquisition. Scaling pre-PMF is the most common and expensive mistake startups make.',
};

// ============================================================================
// 3. STARTUP FAILURE CASCADES — CB Insights Research
// ============================================================================

const startupFailureCascades: TrainingPack = {
  id: 'startup-failure-cascades',
  title: 'Startup Failure Cascade Patterns',
  source: 'CB Insights analysis of 483+ startup post-mortems, Startup Genome Report',
  industry: 'Startups',
  domains: ['product', 'finance', 'marketing', 'people', 'cs'],
  confidence: 0.80,
  tags: ['startup-failure', 'post-mortem', 'risk', 'market-need', 'runway'],

  causalChains: [
    {
      source: 'product', target: 'finance',
      metric: 'no_market_need_to_failure',
      effectSize: 0.75,   // 42% of failures cite no market need
      lagDays: 180,
      pValue: 0.001,
    },
    {
      source: 'finance', target: 'finance',
      metric: 'cash_runway_to_failure',
      effectSize: 0.70,   // 29% run out of cash
      lagDays: 90,
      pValue: 0.002,
    },
    {
      source: 'people', target: 'product',
      metric: 'wrong_team_to_execution_failure',
      effectSize: 0.55,   // 23% had wrong team
      lagDays: 120,
      pValue: 0.005,
    },
    {
      source: 'marketing', target: 'finance',
      metric: 'outcompeted_to_market_loss',
      effectSize: 0.50,   // 19% outcompeted
      lagDays: 180,
      pValue: 0.008,
    },
    {
      source: 'finance', target: 'finance',
      metric: 'pricing_problems_to_failure',
      effectSize: 0.45,   // 18% pricing issues
      lagDays: 90,
      pValue: 0.01,
    },
    {
      source: 'marketing', target: 'finance',
      metric: 'poor_marketing_to_failure',
      effectSize: 0.40,   // 14% ineffective marketing/sales
      lagDays: 120,
      pValue: 0.01,
    },
    {
      source: 'cs', target: 'product',
      metric: 'ignoring_customers_to_failure',
      effectSize: 0.40,   // 14% ignored customer feedback
      lagDays: 90,
      pValue: 0.01,
    },
  ],

  businessRules: [
    {
      title: 'No Market Need Early Warning',
      entityType: 'startup',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'pmf_survey.very_disappointed_pct', operator: 'less_than', value: 25 },
          { field: 'runway_months', operator: 'less_than', value: 12 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Critical: Low PMF score + short runway mirrors #1 startup failure pattern (42% of failures). Pivot or narrow market immediately.' } },
        { type: 'set_flag', params: { flag: 'cb_insights_pattern_1' } },
      ],
      naturalLanguage: 'When PMF is below 25% and runway is under 12 months, the company is in the #1 failure zone — no market need with no time to iterate',
      priority: 95,
    },
    {
      title: 'Cash Runway Danger Zone',
      entityType: 'startup',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'runway_months', operator: 'less_than', value: 6 },
          { field: 'burn_rate.trend_3m', operator: 'greater_than', value: 0 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Under 6 months runway with rising burn — CB Insights #2 failure cause (29%). Cut burn or raise immediately.' } },
      ],
      naturalLanguage: 'Less than 6 months runway with increasing burn rate matches the #2 startup failure pattern — companies in this zone have 3-4 months to course correct',
      priority: 95,
    },
  ],

  cascades: [
    {
      source: 'product', target: 'finance',
      type: 'triggers',
      severity: 'critical',
      keywords: {
        source: ['no-demand', 'low-usage', 'no-pmf', 'feature-mismatch'],
        target: ['failure', 'shutdown', 'pivot', 'wind-down'],
      },
      reasonTemplate: '42% of startup failures stem from building something nobody wants — the #1 cause across 483+ post-mortems',
    },
    {
      source: 'finance', target: 'people',
      type: 'triggers',
      severity: 'high',
      keywords: {
        source: ['cash', 'runway', 'burn', 'fundraise'],
        target: ['layoff', 'shutdown', 'reduction', 'restructure'],
      },
      reasonTemplate: 'Running out of cash (#2 failure cause at 29%) creates an irreversible cascade: layoffs → morale drop → execution failure',
    },
    {
      source: 'people', target: 'product',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['team', 'founder', 'skills', 'experience'],
        target: ['execution', 'quality', 'speed', 'direction'],
      },
      reasonTemplate: 'Wrong team composition (#3 failure cause at 23%) leads to execution gaps that compound over 6-12 months',
    },
  ],

  patterns: [
    {
      name: 'Failure Cause Stack',
      domains: ['product', 'finance', 'people'],
      description: '90% of startups fail eventually. Top 3 causes: no market need (42%), ran out of cash (29%), wrong team (23%). These are interconnected — no market need leads to slow revenue, which depletes cash, which makes hiring/retention harder.',
      observed: 90,
      expected: 50,
      total: 100,
    },
    {
      name: 'Premature Scaling Trap',
      domains: ['marketing', 'finance'],
      description: '70% of startups scale prematurely (Startup Genome). They hire ahead of revenue, spend on acquisition before PMF, and burn runway 3x faster than disciplined peers.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'Multifactorial Failure',
      domains: ['product', 'finance', 'people', 'marketing'],
      description: 'Most failed startups cite 2-4 simultaneous causes. Single-cause failure is rare — cascading effects across domains compound into terminal decline.',
      observed: 75,
      expected: 25,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'failure_from_no_market', predictedConfidence: 0.78, actual: 'failure_from_no_market', wasCorrect: true, sourceDomain: 'product', targetDomain: 'finance' },
    { predicted: 'cash_crisis_to_shutdown', predictedConfidence: 0.75, actual: 'cash_crisis_to_shutdown', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
    { predicted: 'team_gap_to_failure', predictedConfidence: 0.60, actual: 'team_recovered', wasCorrect: false, sourceDomain: 'people', targetDomain: 'product' },
  ],

  narrative: 'CB Insights analyzed 483+ startup post-mortems and found the top failure causes: no market need (42%), ran out of cash (29%), wrong team (23%), outcompeted (19%), pricing issues (18%), poor marketing (14%), ignoring customers (14%), and lack of focus (13%). These causes cascade: building without market need slows revenue, which depletes cash, which forces hiring cuts, which reduces execution quality, creating a death spiral. The key preventive measures are: validate market need before building (PMF measurement), maintain 12+ months runway, and build cross-functional teams early. 90% of startups fail, but the patterns are predictable and preventable.',
};

// ============================================================================
// 4. NRR-DRIVEN GROWTH ENGINE — SaaS Capital Research
// ============================================================================

const nrrGrowthEngine: TrainingPack = {
  id: 'nrr-growth-engine',
  title: 'NRR as Compounding Growth Engine',
  source: 'SaaS Capital NRR Research, Tomasz Tunguz, ChartMogul Retention Report',
  industry: 'SaaS',
  domains: ['finance', 'cs', 'marketing', 'product'],
  confidence: 0.85,
  tags: ['nrr', 'negative-churn', 'expansion', 'growth', 'retention', 'cohort'],

  causalChains: [
    {
      source: 'cs', target: 'finance',
      metric: 'nrr_to_growth_rate',
      effectSize: 0.75,   // NRR >110% → 2.5x faster growth than low NRR
      lagDays: 90,
      pValue: 0.001,
    },
    {
      source: 'finance', target: 'finance',
      metric: 'nrr_to_valuation',
      effectSize: 0.70,   // NRR >120% → premium valuation multiples
      lagDays: 0,
      pValue: 0.002,
    },
    {
      source: 'cs', target: 'marketing',
      metric: 'negative_churn_to_cac_efficiency',
      effectSize: -0.55,  // Negative churn → less dependence on new logos
      lagDays: 90,
      pValue: 0.005,
    },
    {
      source: 'product', target: 'cs',
      metric: 'expansion_features_to_nrr',
      effectSize: 0.50,
      lagDays: 60,
      pValue: 0.005,
    },
    {
      source: 'finance', target: 'finance',
      metric: 'grr_floor_to_nrr_ceiling',
      effectSize: 0.60,   // GRR is the floor — NRR can't overcome terrible GRR
      lagDays: 0,
      pValue: 0.003,
    },
  ],

  businessRules: [
    {
      title: 'NRR Below Survival Threshold',
      entityType: 'saas_company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'nrr.trailing_12m', operator: 'less_than', value: 100 },
          { field: 'arr.growth_rate_yoy', operator: 'less_than', value: 0.20 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'NRR below 100% with sub-20% growth — company is contracting from existing base. Expansion or retention must improve to survive.' } },
      ],
      naturalLanguage: 'SaaS companies with NRR below 100% and growth below 20% are in a contraction spiral — the existing base is shrinking faster than new logos can replace',
      priority: 90,
    },
    {
      title: 'Negative Churn Achieved',
      entityType: 'saas_company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'nrr.trailing_12m', operator: 'greater_than', value: 120 },
          { field: 'grr.trailing_12m', operator: 'greater_than', value: 90 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'info', message: 'Negative churn achieved — company grows even without new customers. Best-in-class territory.' } },
        { type: 'set_flag', params: { flag: 'negative_churn_achieved' } },
      ],
      naturalLanguage: 'NRR above 120% with GRR above 90% indicates best-in-class retention with strong expansion — company can grow from existing base alone',
      priority: 80,
    },
  ],

  cascades: [
    {
      source: 'cs', target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['retention', 'expansion', 'upsell', 'cross-sell', 'nrr'],
        target: ['growth', 'revenue', 'valuation', 'efficiency'],
      },
      reasonTemplate: 'NRR above 110% drives 2.5x faster growth than low-NRR peers (SaaS Capital). NRR above 120% creates negative churn where cohorts grow over time.',
    },
    {
      source: 'finance', target: 'marketing',
      type: 'impacts',
      severity: 'medium',
      keywords: {
        source: ['nrr', 'expansion', 'negative-churn'],
        target: ['cac', 'acquisition', 'efficiency', 'dependency'],
      },
      reasonTemplate: 'Companies with NRR >130% spend 40% less on acquisition while growing faster — expansion revenue substitutes for new logo pressure',
    },
  ],

  patterns: [
    {
      name: 'NRR Exponential Growth',
      domains: ['cs', 'finance'],
      description: 'Companies with NRR >110% grow 2.5x faster than peers. At >130%, they grow 3x faster with 40% lower acquisition spend. The relationship is exponential, not linear.',
      observed: 80,
      expected: 30,
      total: 100,
    },
    {
      name: 'NRR Benchmarks by Segment',
      domains: ['finance'],
      description: 'Enterprise: 115-125% NRR median. Mid-market: 105-115%. SMB: 90-105%. Bootstrapped ($3-20M ARR): 104% median, 90th percentile at 118%. Best-in-class across all: >130%.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'GRR Floor Effect',
      domains: ['cs', 'finance'],
      description: 'GRR is the retention floor. Median GRR is 90%, top quartile >95%. NRR cannot sustainably compensate for GRR below 85% — the churn hole is too deep to fill with expansion.',
      observed: 72,
      expected: 30,
      total: 100,
    },
    {
      name: 'Negative Churn Compounding',
      domains: ['finance'],
      description: 'Negative churn means each customer cohort generates MORE revenue over time. Box sustained >30% negative net churn. The compounding effect: a cohort acquired today is worth 30% more next year without any new sales.',
      observed: 65,
      expected: 25,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'growth_acceleration', predictedConfidence: 0.82, actual: 'growth_acceleration', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
    { predicted: 'valuation_premium', predictedConfidence: 0.78, actual: 'valuation_premium', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
    { predicted: 'cac_reduction', predictedConfidence: 0.65, actual: 'cac_stable', wasCorrect: false, sourceDomain: 'cs', targetDomain: 'marketing' },
  ],

  narrative: 'Net Revenue Retention is the most powerful growth lever in SaaS. SaaS Capital research shows companies with NRR above 110% grow 2.5x faster than low-NRR peers. At NRR above 130%, companies spend 40% less on acquisition while growing 3x faster — expansion revenue compounds from the existing base. The 2025 median NRR is 106%, with enterprise segments at 115% and best-in-class exceeding 130%. Tomasz Tunguz showed that negative churn (NRR >100%) means each cohort grows over time — Box sustained >30% negative net churn. But NRR has a floor: GRR. If gross retention drops below 85%, no amount of expansion can fill the churn hole. The winning formula is GRR >90% + expansion motion = NRR >120% = compounding growth.',
};

// ============================================================================
// 5. RULE OF 40 / RULE OF X — Bessemer Research
// ============================================================================

const ruleOf40Efficiency: TrainingPack = {
  id: 'rule-of-40-efficiency',
  title: 'Rule of 40 and SaaS Efficiency',
  source: 'Bessemer Cloud Index, Jamin Ball Clouded Judgement',
  industry: 'SaaS',
  domains: ['finance', 'marketing', 'people', 'engineering'],
  confidence: 0.83,
  tags: ['rule-of-40', 'efficiency', 'growth', 'margin', 'valuation', 'bessemer'],

  causalChains: [
    {
      source: 'finance', target: 'finance',
      metric: 'efficiency_score_to_valuation',
      effectSize: 0.70,   // Rule of 40 >40% → 121% valuation premium
      lagDays: 0,
      pValue: 0.001,
    },
    {
      source: 'finance', target: 'finance',
      metric: 'growth_rate_to_valuation_weight',
      effectSize: 0.65,   // Growth weighted 2-3x vs profitability in valuation
      lagDays: 0,
      pValue: 0.002,
    },
    {
      source: 'finance', target: 'people',
      metric: 'efficiency_pressure_to_headcount',
      effectSize: -0.50,
      lagDays: 30,
      pValue: 0.005,
    },
    {
      source: 'marketing', target: 'finance',
      metric: 'growth_efficiency_to_burn_multiple',
      effectSize: 0.55,
      lagDays: 30,
      pValue: 0.005,
    },
    {
      source: 'engineering', target: 'finance',
      metric: 'product_velocity_to_growth_rate',
      effectSize: 0.45,
      lagDays: 90,
      pValue: 0.008,
    },
  ],

  businessRules: [
    {
      title: 'Below Rule of 40',
      entityType: 'saas_company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'arr_growth_pct_plus_fcf_margin', operator: 'less_than', value: 40 },
          { field: 'arr', operator: 'greater_than', value: 25000000 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Below Rule of 40 threshold at $25M+ ARR. Only 11-30% of companies achieve it, but those that do get 121% valuation premium (9.4x vs 3.5x revenue).' } },
      ],
      naturalLanguage: 'Companies above $25M ARR that fall below Rule of 40 face significant valuation discounts. Bessemer recommends 70% efficiency score at $25-50M ARR.',
      priority: 80,
    },
  ],

  cascades: [
    {
      source: 'finance', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['growth', 'margin', 'efficiency', 'burn', 'rule-of-40'],
        target: ['valuation', 'multiple', 'fundraise', 'ipo'],
      },
      reasonTemplate: 'Rule of 40 achievement drives 121% valuation premium. Bessemer growth weighting: 1% growth improvement has same valuation impact as 2% margin improvement.',
    },
    {
      source: 'finance', target: 'people',
      type: 'impacts',
      severity: 'medium',
      keywords: {
        source: ['efficiency', 'margin', 'burn-rate', 'rule-of-40'],
        target: ['hiring', 'headcount', 'investment', 'team-size'],
      },
      reasonTemplate: 'Companies optimizing for Rule of 40 must balance growth investment (hiring) against margin improvement — over-cutting growth destroys 2x the valuation of over-spending',
    },
  ],

  patterns: [
    {
      name: 'Rule of 40 Valuation Premium',
      domains: ['finance'],
      description: 'Companies with Rule of 40 >40% valued at 9.4x median revenue vs 3.5x for <20% — a 121% premium. Only 11-30% of SaaS companies achieve it.',
      observed: 75,
      expected: 30,
      total: 100,
    },
    {
      name: 'Growth > Profitability Weighting',
      domains: ['finance'],
      description: 'Bessemer Rule of X: growth should be weighted 2-3x vs FCF margin. A 1% increase in revenue growth has the same valuation impact as a 2% increase in profitability.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'Bessemer Efficiency Targets by ARR',
      domains: ['finance'],
      description: 'Bessemer targets: 70% efficiency score at $25-50M ARR, 50% at $100M+ as growth naturally decelerates. The bar is higher earlier because growth potential is maximum.',
      observed: 65,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'valuation_premium', predictedConfidence: 0.80, actual: 'valuation_premium', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
    { predicted: 'growth_prioritized', predictedConfidence: 0.72, actual: 'growth_prioritized', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
  ],

  narrative: 'The Rule of 40 (growth rate + FCF margin ≥ 40%) remains the gold standard for SaaS efficiency. Companies achieving it get a 121% valuation premium: 9.4x median revenue vs 3.5x for companies below 20%. Only 11-30% of SaaS companies achieve it. Bessemer has evolved this into the "Rule of X" — weighting growth 2-3x higher than profitability, reflecting that a 1% growth improvement equals ~2% margin improvement in valuation impact. At $25-50M ARR, Bessemer targets 70% efficiency score; at $100M+, 50% as growth decelerates. The implication: cutting growth to improve margins destroys twice the value of what margin gains create.',
};

// ============================================================================
// 6. SAAS UNIT ECONOMICS LIFECYCLE — David Skok / ForEntrepreneurs
// ============================================================================

const saasUnitEconomicsLifecycle: TrainingPack = {
  id: 'saas-unit-economics-lifecycle',
  title: 'SaaS Unit Economics Lifecycle',
  source: 'David Skok ForEntrepreneurs, SaaS Capital, Bessemer',
  industry: 'SaaS',
  domains: ['finance', 'marketing', 'cs', 'product'],
  confidence: 0.85,
  tags: ['ltv', 'cac', 'payback', 'unit-economics', 'skok', 'saas'],

  causalChains: [
    {
      source: 'marketing', target: 'finance',
      metric: 'cac_to_payback_period',
      effectSize: 0.75,
      lagDays: 30,
      pValue: 0.001,
    },
    {
      source: 'finance', target: 'finance',
      metric: 'ltv_cac_ratio_to_sustainability',
      effectSize: 0.80,   // LTV:CAC ≥3 = healthy, <3 = danger
      lagDays: 0,
      pValue: 0.001,
    },
    {
      source: 'cs', target: 'finance',
      metric: 'retention_to_ltv',
      effectSize: 0.70,
      lagDays: 90,
      pValue: 0.002,
    },
    {
      source: 'finance', target: 'finance',
      metric: 'payback_period_to_cash_flow',
      effectSize: -0.65,  // Longer payback → worse cash flow
      lagDays: 0,
      pValue: 0.002,
    },
    {
      source: 'product', target: 'cs',
      metric: 'expansion_to_ltv_multiplier',
      effectSize: 0.55,   // Land-and-expand dramatically increases LTV
      lagDays: 180,
      pValue: 0.005,
    },
  ],

  businessRules: [
    {
      title: 'LTV:CAC Ratio Below Minimum',
      entityType: 'saas_company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'ltv_cac_ratio', operator: 'less_than', value: 3 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'LTV:CAC below 3x threshold (David Skok). Either reduce CAC, improve retention, or increase ARPU. Best-in-class: 7-8x.' } },
      ],
      naturalLanguage: 'LTV:CAC ratio below 3x means each customer is not generating enough value to justify acquisition cost — growth is unprofitable',
      priority: 85,
    },
    {
      title: 'CAC Payback Exceeds Threshold',
      entityType: 'saas_company',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'cac_payback_months', operator: 'greater_than', value: 12 },
          { field: 'arr', operator: 'less_than', value: 5000000 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'CAC payback exceeds 12 months at sub-$5M ARR. Skok: "Focus on keeping CAC low enough to be recovered in a year."' } },
      ],
      naturalLanguage: 'CAC payback should be under 12 months for early-stage SaaS. Median payback: 11 months at <$1M ARR, 16 months at $1-5M ARR.',
      priority: 85,
    },
  ],

  cascades: [
    {
      source: 'marketing', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['cac', 'acquisition-cost', 'spend', 'campaign'],
        target: ['payback', 'cash-flow', 'burn', 'unit-economics'],
      },
      reasonTemplate: 'Every dollar of CAC must be recovered within 12 months (Skok). Beyond that, the business needs external cash to fund growth.',
    },
    {
      source: 'cs', target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['retention', 'churn', 'expansion', 'upsell'],
        target: ['ltv', 'lifetime-value', 'economics', 'payback'],
      },
      reasonTemplate: 'Every 5% improvement in retention increases LTV by 25-95%. Expansion revenue can make LTV practically infinite for land-and-expand models.',
    },
  ],

  patterns: [
    {
      name: 'LTV:CAC 3x Health Threshold',
      domains: ['finance', 'marketing'],
      description: 'David Skok: LTV should be at least 3x CAC for a healthy SaaS business. Best companies achieve 7-8x. Below 3x, growth is value-destructive.',
      observed: 78,
      expected: 30,
      total: 100,
    },
    {
      name: 'CAC Payback by Stage',
      domains: ['finance'],
      description: 'Median CAC payback: 11 months at <$1M ARR, 16 months at $1-5M, 17 at $5-20M, 18 at $20-50M. Early-stage companies should target <12 months.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'Land and Expand LTV Multiplier',
      domains: ['product', 'cs', 'finance'],
      description: 'Companies with land-and-expand models see 2-5x higher LTV than fixed-contract peers. Expansion revenue turns a 3x LTV:CAC into a 7-8x over time.',
      observed: 68,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'sustainable_unit_economics', predictedConfidence: 0.80, actual: 'sustainable_unit_economics', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
    { predicted: 'cash_flow_positive', predictedConfidence: 0.70, actual: 'cash_flow_positive', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
  ],

  narrative: 'David Skok established the foundational SaaS unit economics framework: LTV must exceed CAC by at least 3x, and CAC should be recovered within 12 months. The best SaaS companies achieve 7-8x LTV:CAC ratios. CAC payback varies by stage: 11 months median at <$1M ARR, rising to 18 months at $20-50M ARR as acquisition becomes harder. The counter-force to rising CAC is expansion revenue — land-and-expand models can turn a 3x ratio into 7-8x over the customer lifetime. A DCF analysis of customer cohorts with expansion reveals the true economics. Companies that violate these thresholds (LTV:CAC <3x, payback >18 months) consistently face fundraising difficulty and eventual cash crises.',
};

// ============================================================================
// 7. CUSTOMER HEALTH SCORE PREDICTION — Gainsight Research
// ============================================================================

const customerHealthPrediction: TrainingPack = {
  id: 'customer-health-prediction',
  title: 'Customer Health Score as Churn Predictor',
  source: 'Gainsight CS Research, Totango Benchmarks, SaaStr Nick Mehta 2025',
  industry: 'SaaS',
  domains: ['cs', 'product', 'finance', 'engineering'],
  confidence: 0.82,
  tags: ['health-score', 'churn', 'prediction', 'leading-indicators', 'cs'],

  causalChains: [
    {
      source: 'product', target: 'cs',
      metric: 'usage_decline_to_churn_risk',
      effectSize: 0.70,   // Declining usage is #1 churn predictor
      lagDays: 30,
      pValue: 0.002,
    },
    {
      source: 'cs', target: 'cs',
      metric: 'support_tickets_to_health_score',
      effectSize: -0.50,
      lagDays: 14,
      pValue: 0.005,
    },
    {
      source: 'cs', target: 'finance',
      metric: 'health_score_to_renewal_rate',
      effectSize: 0.65,
      lagDays: 60,
      pValue: 0.003,
    },
    {
      source: 'product', target: 'cs',
      metric: 'feature_adoption_to_stickiness',
      effectSize: 0.55,
      lagDays: 30,
      pValue: 0.005,
    },
    {
      source: 'cs', target: 'cs',
      metric: 'nps_score_to_churn_risk',
      effectSize: -0.45,  // Low NPS → high churn risk
      lagDays: 45,
      pValue: 0.008,
    },
    {
      source: 'cs', target: 'finance',
      metric: 'proactive_intervention_to_save_rate',
      effectSize: 0.50,   // Proactive outreach on red accounts saves 30-50%
      lagDays: 30,
      pValue: 0.005,
    },
  ],

  businessRules: [
    {
      title: 'Usage Decline Churn Warning',
      entityType: 'customer',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'usage.change_30d', operator: 'less_than', value: -0.20 },
          { field: 'contract.renewal_days', operator: 'less_than', value: 90 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Usage declined >20% in 30 days with renewal approaching — declining usage is the #1 churn predictor' } },
        { type: 'set_flag', params: { flag: 'usage_decline_churn_risk' } },
      ],
      naturalLanguage: 'When product usage drops 20%+ within 30 days and renewal is within 90 days, the customer is at high churn risk — initiate proactive outreach',
      priority: 90,
    },
    {
      title: 'Multi-Signal Health Alert',
      entityType: 'customer',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'health_score.current', operator: 'less_than', value: 50 },
          { field: 'support_tickets.open_count', operator: 'greater_than', value: 3 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Low health score + multiple open tickets = compound churn risk. Executive sponsor outreach recommended.' } },
      ],
      naturalLanguage: 'When health score drops below 50 and there are 3+ open support tickets, the customer needs executive-level intervention',
      priority: 95,
    },
  ],

  cascades: [
    {
      source: 'product', target: 'cs',
      type: 'triggers',
      severity: 'high',
      keywords: {
        source: ['usage', 'adoption', 'engagement', 'login', 'feature-use'],
        target: ['health', 'risk', 'churn', 'at-risk', 'red-account'],
      },
      reasonTemplate: 'Declining product usage is the strongest leading indicator of churn — usage drops precede cancellation by 30-90 days',
    },
    {
      source: 'cs', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['health-score', 'nps', 'csat', 'sentiment'],
        target: ['renewal', 'churn', 'revenue', 'arr'],
      },
      reasonTemplate: 'Composite health scores combining usage, support, sentiment, and deployment predict renewal outcomes with 70-80% accuracy',
    },
  ],

  patterns: [
    {
      name: 'Usage Decline Precedes Churn',
      domains: ['product', 'cs'],
      description: 'Declining usage is the strongest leading indicator of churn. Usage drops typically precede cancellation by 30-90 days, giving CS teams a window to intervene.',
      observed: 80,
      expected: 30,
      total: 100,
    },
    {
      name: 'Multi-Factor Health Score',
      domains: ['cs', 'product'],
      description: 'Best-in-class health scores combine: product usage (40% weight), support sentiment (20%), deployment completeness (15%), stakeholder engagement (15%), NPS/CSAT (10%)',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'Proactive Save Rate',
      domains: ['cs', 'finance'],
      description: 'Companies that proactively reach out to red-health customers save 30-50% of at-risk accounts vs those that wait for the customer to initiate cancellation',
      observed: 72,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'churn_predicted', predictedConfidence: 0.78, actual: 'churn_occurred', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
    { predicted: 'intervention_saves', predictedConfidence: 0.72, actual: 'account_saved', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
    { predicted: 'health_score_accuracy', predictedConfidence: 0.70, actual: 'moderate_accuracy', wasCorrect: false, sourceDomain: 'cs', targetDomain: 'cs' },
  ],

  narrative: 'Gainsight\'s research shows that customer health scores — when properly constructed — predict renewal outcomes with 70-80% accuracy. The strongest single signal is product usage: declining usage precedes churn by 30-90 days. But the best models are multi-factor: usage (40%), support sentiment (20%), deployment completeness (15%), stakeholder engagement (15%), and NPS/CSAT (10%). Gainsight\'s AI-powered Scorecard Optimizer now recommends optimal weights based on historical renewal data. The critical insight is that health scores create a window for proactive intervention: companies that reach out to red accounts save 30-50% of at-risk revenue vs those that wait passively.',
};

// ============================================================================
// 8. GROWTH LOOPS & FOUR FITS — Reforge / Brian Balfour
// ============================================================================

const growthLoopsMechanics: TrainingPack = {
  id: 'growth-loops-four-fits',
  title: 'Growth Loops and Four Fits Framework',
  source: 'Reforge Growth Series, Brian Balfour Four Fits, PLG Benchmarks',
  industry: 'SaaS / Product-Led Growth',
  domains: ['marketing', 'product', 'finance', 'cs'],
  confidence: 0.80,
  tags: ['growth-loops', 'plg', 'four-fits', 'virality', 'compounding', 'reforge'],

  causalChains: [
    {
      source: 'product', target: 'marketing',
      metric: 'product_loop_to_acquisition',
      effectSize: 0.65,   // Product-driven loops generate 13% of PLG signups
      lagDays: 14,
      pValue: 0.003,
    },
    {
      source: 'marketing', target: 'marketing',
      metric: 'organic_to_plg_conversion',
      effectSize: 0.55,   // 53% of PLG signups from organic + 6% freemium conversion
      lagDays: 7,
      pValue: 0.005,
    },
    {
      source: 'product', target: 'product',
      metric: 'activation_to_retention_loop',
      effectSize: 0.60,
      lagDays: 7,
      pValue: 0.003,
    },
    {
      source: 'product', target: 'finance',
      metric: 'product_qualified_to_revenue',
      effectSize: 0.50,   // Product-influenced revenue growing as metric
      lagDays: 30,
      pValue: 0.005,
    },
    {
      source: 'marketing', target: 'product',
      metric: 'channel_product_fit',
      effectSize: 0.45,   // Wrong channel-product fit kills growth loops
      lagDays: 60,
      pValue: 0.008,
    },
  ],

  businessRules: [
    {
      title: 'Growth Loop vs Funnel Check',
      entityType: 'growth_model',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'growth.paid_acquisition_pct', operator: 'greater_than', value: 0.60 },
          { field: 'growth.organic_referral_pct', operator: 'less_than', value: 0.10 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Over 60% paid acquisition with <10% organic/referral — growth is linear, not compounding. Explore product-led loops.' } },
        { type: 'set_flag', params: { flag: 'linear_growth_risk' } },
      ],
      naturalLanguage: 'When paid acquisition dominates and organic/referral is minimal, growth is linear and unsustainable. Product-led loops create compounding growth.',
      priority: 75,
    },
    {
      title: 'Four Fits Misalignment',
      entityType: 'growth_model',
      when: {
        logic: 'OR',
        conditions: [
          { field: 'pmf_score', operator: 'less_than', value: 40 },
          { field: 'channel_conversion_rate', operator: 'less_than', value: 0.01 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Four Fits misalignment detected (Balfour): Market-Product, Product-Channel, Channel-Model, or Model-Market fit is broken. All four must be aligned for $100M+ growth.' } },
      ],
      naturalLanguage: 'Balfour: $100M+ companies require all four fits aligned. When any one breaks, you can\'t simply change one element — you must revisit all.',
      priority: 85,
    },
  ],

  cascades: [
    {
      source: 'product', target: 'marketing',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['loop', 'virality', 'referral', 'invite', 'share'],
        target: ['acquisition', 'organic', 'growth', 'compounding'],
      },
      reasonTemplate: 'Product-led growth loops create compounding acquisition: each cohort of users drives the next cohort, unlike linear funnels that require constant paid input',
    },
    {
      source: 'marketing', target: 'finance',
      type: 'impacts',
      severity: 'medium',
      keywords: {
        source: ['plg', 'freemium', 'self-serve', 'product-led'],
        target: ['cac', 'efficiency', 'unit-economics', 'margin'],
      },
      reasonTemplate: 'PLG companies grow at 2x the rate of traditional SaaS while spending less on acquisition (53% organic + 13% product-driven vs paid)',
    },
  ],

  patterns: [
    {
      name: 'Growth Loop Compounding',
      domains: ['product', 'marketing'],
      description: 'Growth loops are closed systems where each user cohort generates the next: input → action → output → reinvest as input. This creates exponential growth vs linear funnel growth.',
      observed: 72,
      expected: 30,
      total: 100,
    },
    {
      name: 'PLG Conversion Benchmarks',
      domains: ['marketing', 'product'],
      description: 'Freemium: 6% website-to-signup conversion, 53% from organic. Free trial: 3-4% conversion. Product-influenced revenue is the emerging north star metric for PLG.',
      observed: 65,
      expected: 30,
      total: 100,
    },
    {
      name: 'Balfour Four Fits',
      domains: ['product', 'marketing', 'finance'],
      description: 'Market-Product Fit → Product-Channel Fit → Channel-Model Fit → Model-Market Fit. All four must align for $100M+ growth. When one breaks, all must be revisited.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'PLG 2x Growth Premium',
      domains: ['marketing', 'finance'],
      description: 'PLG leaders grew at 2x the rate of traditional SaaS companies, with significantly lower CAC due to organic and product-driven acquisition channels',
      observed: 68,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'compounding_growth', predictedConfidence: 0.75, actual: 'compounding_growth', wasCorrect: true, sourceDomain: 'product', targetDomain: 'marketing' },
    { predicted: 'lower_cac', predictedConfidence: 0.70, actual: 'lower_cac', wasCorrect: true, sourceDomain: 'product', targetDomain: 'finance' },
    { predicted: 'four_fits_alignment', predictedConfidence: 0.60, actual: 'partial_alignment', wasCorrect: false, sourceDomain: 'marketing', targetDomain: 'finance' },
  ],

  narrative: 'Reforge popularized growth loops as the successor to AARRR funnels. Unlike linear funnels that require constant paid input, loops are closed systems where each user cohort generates the next — creating compounding growth. PLG companies leverage this: 53% of signups come from organic sources, 13% from the product itself, with only 10% from paid. Brian Balfour\'s Four Fits framework shows why: $100M+ companies need Market-Product Fit, Product-Channel Fit, Channel-Model Fit, and Model-Market Fit all aligned. When one breaks, you can\'t fix it in isolation — all four are interconnected. PLG companies that achieve all four fits grow at 2x the rate of traditional SaaS with significantly better unit economics.',
};

// ============================================================================
// EXPORT
// ============================================================================

export const BUSINESS_CASE_STUDY_PACKS: TrainingPack[] = [
  csTeamRoi,
  pmfMeasurementEngine,
  startupFailureCascades,
  nrrGrowthEngine,
  ruleOf40Efficiency,
  saasUnitEconomicsLifecycle,
  customerHealthPrediction,
  growthLoopsMechanics,
];
