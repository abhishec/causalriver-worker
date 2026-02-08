/**
 * Sales & Revenue Training Packs — GTM Knowledge from Industry Research
 *
 * Hand-crafted TrainingPacks encoding causal relationships from:
 * - Gartner B2B Buying Behavior Research (2024-2025)
 * - RevOps alignment studies (McKinsey, Forrester)
 * - SaaS sales cycle benchmarks (Benchmarkit, SaaS Capital)
 * - Product-Led Sales (OpenView, Kyle Poyar)
 * - Onboarding → Retention pipeline research
 *
 * These encode sales, marketing, and go-to-market causal patterns.
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. B2B BUYING COMMITTEE DYNAMICS — Gartner Research
// ============================================================================

const b2bBuyingCommittee: TrainingPack = {
  id: 'b2b-buying-committee-dynamics',
  title: 'B2B Buying Committee Decision Dynamics',
  source: 'Gartner B2B Buying Research 2024-2025, Corporate Visions',
  industry: 'B2B SaaS',
  domains: ['marketing', 'cs', 'finance', 'product'],
  confidence: 0.82,
  tags: ['b2b', 'buying-committee', 'sales-cycle', 'consensus', 'gartner'],

  causalChains: [
    {
      source: 'marketing', target: 'marketing',
      metric: 'committee_size_to_cycle_length',
      effectSize: 0.65,   // 6-10 stakeholders → longer cycles
      lagDays: 30,
      pValue: 0.002,
    },
    {
      source: 'marketing', target: 'finance',
      metric: 'consensus_quality_to_deal_quality',
      effectSize: 0.60,   // Consensus-reaching groups → 2.5x higher quality deals
      lagDays: 14,
      pValue: 0.003,
    },
    {
      source: 'marketing', target: 'marketing',
      metric: 'conflict_to_deal_stall',
      effectSize: 0.55,   // 74% of buying teams show "unhealthy conflict"
      lagDays: 30,
      pValue: 0.005,
    },
    {
      source: 'marketing', target: 'finance',
      metric: 'cfo_involvement_to_cycle_delay',
      effectSize: 0.50,   // 79% require CFO approval → added approval step
      lagDays: 14,
      pValue: 0.005,
    },
    {
      source: 'product', target: 'marketing',
      metric: 'self_serve_to_rep_free_preference',
      effectSize: 0.45,   // 61% of B2B buyers prefer rep-free experience
      lagDays: 0,
      pValue: 0.008,
    },
  ],

  businessRules: [
    {
      title: 'Enterprise Deal Committee Alert',
      entityType: 'deal',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'deal.stakeholders_identified', operator: 'less_than', value: 3 },
          { field: 'deal.acv', operator: 'greater_than', value: 50000 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Enterprise deal with <3 stakeholders mapped — Gartner shows 6-10 decision makers are typical. Map the full committee to avoid surprises.' } },
        { type: 'set_flag', params: { flag: 'incomplete_committee_map' } },
      ],
      naturalLanguage: 'Enterprise deals with fewer than 3 identified stakeholders are at risk — typical committees have 6-10 members, and 79% require CFO approval',
      priority: 80,
    },
    {
      title: 'Sales Cycle Length Warning',
      entityType: 'deal',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'deal.days_in_pipeline', operator: 'greater_than', value: 120 },
          { field: 'deal.last_activity_days', operator: 'greater_than', value: 14 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Deal stalled >120 days with no recent activity — 74% of buying teams have unhealthy conflict that stalls decisions. Re-engage with consensus-building content.' } },
      ],
      naturalLanguage: 'Deals stalled past 120 days with no activity likely have internal committee conflict — re-engage with consensus-building materials',
      priority: 75,
    },
  ],

  cascades: [
    {
      source: 'marketing', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['committee', 'stakeholder', 'consensus', 'approval', 'champion'],
        target: ['deal', 'revenue', 'pipeline', 'close-rate', 'cycle'],
      },
      reasonTemplate: 'Gartner: buying groups that reach consensus are 2.5x more likely to report high-quality deals. Sales cycles lengthened 22% since 2022 due to committee buying.',
    },
    {
      source: 'product', target: 'marketing',
      type: 'enables',
      severity: 'medium',
      keywords: {
        source: ['self-serve', 'product-led', 'demo', 'trial', 'freemium'],
        target: ['buyer', 'acquisition', 'conversion', 'pipeline'],
      },
      reasonTemplate: '61% of B2B buyers prefer rep-free buying. Product-led experiences reduce committee friction by letting buyers validate before involving procurement.',
    },
  ],

  patterns: [
    {
      name: 'Committee Size Sales Impact',
      domains: ['marketing', 'finance'],
      description: 'B2B deals involve 6-10 stakeholders (sometimes 20+ for enterprise), each bringing 4-5 independent research sources. 79% need CFO approval. Sales cycles lengthened 22% since 2022.',
      observed: 75,
      expected: 30,
      total: 100,
    },
    {
      name: 'Buying Conflict Stall Pattern',
      domains: ['marketing'],
      description: '74% of B2B buying teams show unhealthy conflict. Consensus-reaching groups have 2.5x higher deal quality. Content that enables internal consensus-building accelerates deals.',
      observed: 74,
      expected: 30,
      total: 100,
    },
    {
      name: 'Rep-Free Buying Preference',
      domains: ['marketing', 'product'],
      description: '61% of B2B buyers prefer rep-free buying experience. 73% avoid suppliers sending irrelevant outreach. Product-led acquisition aligns with modern buyer preferences.',
      observed: 68,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'deal_stall', predictedConfidence: 0.75, actual: 'deal_stalled', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
    { predicted: 'consensus_improves_quality', predictedConfidence: 0.72, actual: 'higher_deal_quality', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
  ],

  narrative: 'Gartner\'s 2024-2025 research reveals that B2B buying has fundamentally changed. Typical buying committees now include 6-10 decision makers (20+ for enterprise), each bringing 4-5 independent research sources. 79% of purchases require CFO approval. 74% of buying teams exhibit unhealthy conflict during decisions. But groups that achieve consensus are 2.5x more likely to complete high-quality deals. Sales cycles lengthened 22% since 2022 due to committee complexity. Meanwhile, 61% of buyers prefer rep-free experiences and 73% avoid irrelevant outreach. The implication: sales teams must map full committees, provide consensus-enabling content, and offer self-serve product experiences to align with modern buyer behavior.',
};

// ============================================================================
// 2. REVOPS ALIGNMENT ENGINE — Sales + Marketing + CS
// ============================================================================

const revopsAlignment: TrainingPack = {
  id: 'revops-alignment-engine',
  title: 'Revenue Operations Alignment Engine',
  source: 'McKinsey Revenue Growth, Forrester RevOps, Gartner 2024-2025',
  industry: 'B2B SaaS',
  domains: ['marketing', 'cs', 'finance', 'people'],
  confidence: 0.82,
  tags: ['revops', 'alignment', 'sales', 'marketing', 'revenue', 'pipeline'],

  causalChains: [
    {
      source: 'marketing', target: 'finance',
      metric: 'alignment_to_revenue_growth',
      effectSize: 0.65,   // RevOps → 19% faster growth, 15% higher profitability
      lagDays: 90,
      pValue: 0.002,
    },
    {
      source: 'marketing', target: 'marketing',
      metric: 'alignment_to_cac_reduction',
      effectSize: -0.50,  // Misalignment increases CAC by 36%
      lagDays: 60,
      pValue: 0.005,
    },
    {
      source: 'marketing', target: 'marketing',
      metric: 'alignment_to_cycle_length',
      effectSize: -0.45,  // Misalignment → 30% longer cycles
      lagDays: 30,
      pValue: 0.008,
    },
    {
      source: 'marketing', target: 'finance',
      metric: 'journey_optimization_to_conversion',
      effectSize: 0.55,   // McKinsey: semi-annual journey optimization → 27% higher conversion
      lagDays: 180,
      pValue: 0.005,
    },
    {
      source: 'people', target: 'finance',
      metric: 'revops_leader_to_performance',
      effectSize: 0.50,   // VP RevOps role 300% growth in adoption
      lagDays: 90,
      pValue: 0.005,
    },
  ],

  businessRules: [
    {
      title: 'Sales-Marketing Misalignment Alert',
      entityType: 'organization',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'lead_handoff.acceptance_rate', operator: 'less_than', value: 0.50 },
          { field: 'pipeline.sales_cycle_days', operator: 'greater_than', value: 90 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Low lead acceptance + long sales cycles indicate sales-marketing misalignment. RevOps alignment drives 19% faster growth. Audit handoff criteria.' } },
        { type: 'set_flag', params: { flag: 'revops_misalignment' } },
      ],
      naturalLanguage: 'When sales accepts fewer than 50% of marketing leads and cycles exceed 90 days, misalignment is costing 30% cycle length and 36% CAC premium',
      priority: 80,
    },
  ],

  cascades: [
    {
      source: 'marketing', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['revops', 'alignment', 'handoff', 'pipeline', 'funnel'],
        target: ['revenue', 'growth', 'efficiency', 'conversion'],
      },
      reasonTemplate: 'RevOps alignment drives 19% faster revenue growth and 15% higher profitability. Even moderate alignment improvements yield 5-10% revenue growth within 6-12 months.',
    },
    {
      source: 'marketing', target: 'marketing',
      type: 'impacts',
      severity: 'medium',
      keywords: {
        source: ['misalignment', 'silo', 'handoff', 'lead-quality'],
        target: ['cac', 'sales-cycle', 'conversion', 'pipeline-leak'],
      },
      reasonTemplate: 'Misaligned sales and marketing creates 30% longer sales cycles and 36% higher CAC. Lead handoff friction is the #1 pipeline leak.',
    },
  ],

  patterns: [
    {
      name: 'RevOps Revenue Impact',
      domains: ['marketing', 'finance'],
      description: 'Companies with RevOps alignment achieve 19% faster growth, 15% higher profitability, and 21% improvement in sales productivity. 75% of high-growth companies will adopt RevOps by 2025 (Gartner).',
      observed: 75,
      expected: 30,
      total: 100,
    },
    {
      name: 'Misalignment Tax',
      domains: ['marketing', 'finance'],
      description: 'Poor sales-marketing alignment costs: 30% longer sales cycles, 36% higher CAC, and reduced pipeline velocity. The "misalignment tax" compounds with scale.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'Journey Optimization ROI',
      domains: ['marketing', 'cs'],
      description: 'McKinsey: companies optimizing customer journeys semi-annually see 27% higher lead-to-customer conversion. Continuous journey mapping is the highest-ROI RevOps activity.',
      observed: 65,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'revenue_acceleration', predictedConfidence: 0.78, actual: 'revenue_acceleration', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
    { predicted: 'cac_reduction', predictedConfidence: 0.70, actual: 'cac_reduction', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'marketing' },
  ],

  narrative: 'Revenue Operations unifies sales, marketing, and CS under shared metrics and processes. The data is compelling: RevOps-aligned companies grow 19% faster with 15% higher profitability, while misaligned companies pay a 30% sales cycle tax and 36% CAC premium. McKinsey shows that semi-annual customer journey optimization drives 27% higher conversion. Gartner predicts 75% of high-growth companies will adopt RevOps by 2025. The VP RevOps title grew 300% in 18 months. The key mechanics: shared pipeline definitions, unified metrics (revenue productivity +21%), and cross-functional handoff automation eliminate the "alignment tax" that siloed organizations pay.',
};

// ============================================================================
// 3. SALES CYCLE AND DEAL VELOCITY — ACV Segmentation
// ============================================================================

const salesCycleVelocity: TrainingPack = {
  id: 'sales-cycle-velocity-by-segment',
  title: 'Sales Cycle Velocity by Segment',
  source: 'Benchmarkit 2025, SaaS Capital, Gartner, Optifai',
  industry: 'B2B SaaS',
  domains: ['marketing', 'finance', 'product', 'cs'],
  confidence: 0.80,
  tags: ['sales-cycle', 'velocity', 'acv', 'close-rate', 'segment', 'deal'],

  causalChains: [
    {
      source: 'marketing', target: 'finance',
      metric: 'acv_to_cycle_length',
      effectSize: 0.70,   // Higher ACV → longer cycle
      lagDays: 0,
      pValue: 0.001,
    },
    {
      source: 'marketing', target: 'finance',
      metric: 'win_rate_to_pipeline_efficiency',
      effectSize: 0.60,   // Win rate 20-30% average, best-in-class 35-40%
      lagDays: 30,
      pValue: 0.003,
    },
    {
      source: 'finance', target: 'finance',
      metric: 'deal_size_to_stakeholder_count',
      effectSize: 0.55,   // Larger deals → more stakeholders
      lagDays: 0,
      pValue: 0.005,
    },
    {
      source: 'marketing', target: 'marketing',
      metric: 'sales_velocity_formula',
      effectSize: 0.50,   // Velocity = (deals × win rate × ACV) / cycle length
      lagDays: 30,
      pValue: 0.005,
    },
    {
      source: 'product', target: 'marketing',
      metric: 'product_led_to_cycle_compression',
      effectSize: -0.45,  // PLG shortens cycles via self-serve validation
      lagDays: 14,
      pValue: 0.008,
    },
  ],

  businessRules: [
    {
      title: 'Cycle Length Exceeds Segment Benchmark',
      entityType: 'pipeline',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'avg_cycle_days', operator: 'greater_than', value: 90 },
          { field: 'avg_acv', operator: 'less_than', value: 15000 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'SMB cycle >90 days exceeds 14-30 day benchmark. Simplify buying process, reduce friction, or add PLG self-serve.' } },
      ],
      naturalLanguage: 'SMB deals (<$15K ACV) should close in 14-30 days. Cycles over 90 days indicate process friction or wrong-segment targeting.',
      priority: 75,
    },
    {
      title: 'Win Rate Below Threshold',
      entityType: 'pipeline',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'win_rate', operator: 'less_than', value: 0.20 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Win rate below 20% industry average — review qualification criteria, competitive positioning, and demo effectiveness.' } },
      ],
      naturalLanguage: 'Win rates below 20% are below industry average (20-30%). Best-in-class teams achieve 35-40%. Review pipeline quality and qualification.',
      priority: 80,
    },
  ],

  cascades: [
    {
      source: 'marketing', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['velocity', 'cycle', 'pipeline', 'deal', 'conversion'],
        target: ['revenue', 'forecast', 'growth', 'cash-flow'],
      },
      reasonTemplate: 'Sales velocity = (deals × win rate × ACV) / cycle length. Improving any lever accelerates revenue. Cycle reduction has the fastest impact.',
    },
  ],

  patterns: [
    {
      name: 'ACV-Cycle Length Correlation',
      domains: ['marketing', 'finance'],
      description: 'SMB (<$15K ACV): 14-30 day cycles. Mid-market ($15-100K): 30-90 days. Enterprise (>$100K): 90-180+ days. Median across B2B SaaS: 84 days. CFO involvement adds 14+ days.',
      observed: 75,
      expected: 30,
      total: 100,
    },
    {
      name: 'Win Rate Benchmarks',
      domains: ['marketing', 'finance'],
      description: 'Average B2B win rate: 20-30%. Best-in-class: 35-40%+. Mid-market typically 25-30% with 60-90 day cycles. Win rate × deal count × ACV / cycle = revenue velocity.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'Cycle Length Drift 2022-2025',
      domains: ['marketing'],
      description: 'Sales cycles lengthened 22% since 2022. Average deal now involves 6.8 stakeholders (up from 5.4 in 2020). CFO involvement in software purchases increased 40%.',
      observed: 72,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'cycle_compression', predictedConfidence: 0.72, actual: 'cycle_compressed', wasCorrect: true, sourceDomain: 'product', targetDomain: 'marketing' },
    { predicted: 'velocity_improvement', predictedConfidence: 0.68, actual: 'velocity_improved', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
  ],

  narrative: 'Sales velocity is the heartbeat of B2B revenue. The formula (deals × win rate × ACV / cycle length) reveals four levers. Current benchmarks: SMB cycles average 14-30 days, mid-market 30-90, enterprise 90-180+. Win rates average 20-30%, with best-in-class at 35-40%. Since 2022, cycles lengthened 22% as committees grew to 6.8 stakeholders and CFO involvement increased 40%. The antidote is product-led sales: self-serve validation compresses cycles by letting buyers experience value before involving procurement. Companies that optimize all four velocity levers simultaneously see 2-3x revenue acceleration.',
};

// ============================================================================
// 4. ONBOARDING TO RETENTION PIPELINE
// ============================================================================

const onboardingRetentionPipeline: TrainingPack = {
  id: 'onboarding-retention-pipeline',
  title: 'Onboarding to Retention Pipeline',
  source: 'Amplitude 2024, UserGuiding, Product Fruits, Vitally Benchmarks',
  industry: 'SaaS',
  domains: ['product', 'cs', 'finance', 'engineering'],
  confidence: 0.83,
  tags: ['onboarding', 'activation', 'retention', 'time-to-value', 'ttv', 'churn'],

  causalChains: [
    {
      source: 'product', target: 'cs',
      metric: 'ttv_reduction_to_retention',
      effectSize: 0.70,   // Cutting TTV 20% → 18% ARR growth lift
      lagDays: 30,
      pValue: 0.002,
    },
    {
      source: 'product', target: 'cs',
      metric: 'activation_to_week1_retention',
      effectSize: 0.65,   // 90% churn without clear value in first week
      lagDays: 7,
      pValue: 0.002,
    },
    {
      source: 'cs', target: 'finance',
      metric: 'structured_onboarding_to_year1_retention',
      effectSize: 0.55,   // Structured onboarding → 25% first-year retention lift
      lagDays: 90,
      pValue: 0.005,
    },
    {
      source: 'product', target: 'product',
      metric: 'interactive_tours_to_activation',
      effectSize: 0.50,   // Interactive tours → 50% activation increase
      lagDays: 7,
      pValue: 0.005,
    },
    {
      source: 'cs', target: 'cs',
      metric: 'dedicated_specialist_to_ttv',
      effectSize: -0.55,  // Dedicated specialist → 70% faster TTV
      lagDays: 14,
      pValue: 0.005,
    },
    {
      source: 'product', target: 'cs',
      metric: 'day7_retention_to_long_term',
      effectSize: 0.60,   // 7% D7 retention threshold = early value signal
      lagDays: 7,
      pValue: 0.003,
    },
  ],

  businessRules: [
    {
      title: 'First Week Churn Risk',
      entityType: 'customer',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'onboarding.day7_sessions', operator: 'less_than', value: 2 },
          { field: 'onboarding.activation_complete', operator: 'equals', value: false },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: '75% of new users abandon in the first week. This user has not activated by day 7 — trigger personalized outreach immediately.' } },
        { type: 'set_flag', params: { flag: 'onboarding_at_risk' } },
      ],
      naturalLanguage: '75% of users abandon in the first week and 90% churn without clear value. Users not activated by day 7 need immediate intervention.',
      priority: 95,
    },
    {
      title: 'Onboarding Health Score Alert',
      entityType: 'customer',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'onboarding.health_score', operator: 'less_than', value: 50 },
          { field: 'onboarding.days_since_start', operator: 'greater_than', value: 14 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Low onboarding health score after 14 days — onboarding health predicts 85% of churn risk. Assign dedicated onboarding specialist.' } },
      ],
      naturalLanguage: 'Onboarding health scores below 50 after 14 days predict churn with 85% accuracy. Dedicated specialists cut TTV by 70%.',
      priority: 90,
    },
  ],

  cascades: [
    {
      source: 'product', target: 'cs',
      type: 'triggers',
      severity: 'critical',
      keywords: {
        source: ['activation', 'onboarding', 'first-use', 'setup', 'ttv'],
        target: ['retention', 'churn', 'abandonment', 'engagement'],
      },
      reasonTemplate: '90% of users churn without clear value in the first week. Cutting TTV by 20% lifts ARR growth by 18%. First week is make-or-break.',
    },
    {
      source: 'cs', target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['onboarding', 'activation', 'specialist', 'success'],
        target: ['retention', 'arr', 'revenue', 'lifetime-value'],
      },
      reasonTemplate: 'Structured onboarding programs boost first-year retention by 25%. Customers who meet teams during onboarding renew 65% more.',
    },
  ],

  patterns: [
    {
      name: 'First Week Abandonment',
      domains: ['product', 'cs'],
      description: '75% of new users abandon within the first week. 90% churn without clear value. Personalized onboarding boosts retention by 40%. Interactive tours increase activation by 50%.',
      observed: 82,
      expected: 30,
      total: 100,
    },
    {
      name: 'TTV to ARR Growth',
      domains: ['product', 'finance'],
      description: 'Amplitude 2024: cutting time-to-value by 20% lifted ARR growth 18% for mid-market SaaS. TTV is the highest-leverage product metric for growth.',
      observed: 72,
      expected: 30,
      total: 100,
    },
    {
      name: 'Onboarding Specialist Impact',
      domains: ['cs', 'product'],
      description: 'Dedicated onboarding specialists cut TTV by 70%. Onboarding health scores predict 85% of churn risk. Customers meeting teams during onboarding renew 65% more.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: '7% Day-7 Retention Rule',
      domains: ['product'],
      description: 'Amplitude: when 7%+ of original cohort returns on day 7, the product has demonstrated early value that correlates strongly with long-term success.',
      observed: 65,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'retention_improvement', predictedConfidence: 0.80, actual: 'retention_improvement', wasCorrect: true, sourceDomain: 'product', targetDomain: 'cs' },
    { predicted: 'arr_growth_lift', predictedConfidence: 0.75, actual: 'arr_growth_lift', wasCorrect: true, sourceDomain: 'product', targetDomain: 'finance' },
    { predicted: 'churn_reduction', predictedConfidence: 0.70, actual: 'moderate_reduction', wasCorrect: false, sourceDomain: 'cs', targetDomain: 'finance' },
  ],

  narrative: 'Onboarding is the single highest-leverage moment in the customer lifecycle. 75% of new users abandon within the first week and 90% churn without experiencing clear value. The first 7 days determine long-term retention: Amplitude\'s 7% rule shows that products retaining 7%+ of a cohort at day 7 have strong long-term potential. Cutting time-to-value by 20% lifted ARR growth by 18% in mid-market SaaS (Amplitude 2024). Dedicated onboarding specialists cut TTV by 70%, and structured programs boost first-year retention by 25%. Onboarding health scores predict 85% of churn risk. The cascade: poor onboarding → no activation → no value realization → churn within 30-90 days.',
};

// ============================================================================
// EXPORT
// ============================================================================

export const SALES_AND_REVENUE_PACKS: TrainingPack[] = [
  b2bBuyingCommittee,
  revopsAlignment,
  salesCycleVelocity,
  onboardingRetentionPipeline,
];
