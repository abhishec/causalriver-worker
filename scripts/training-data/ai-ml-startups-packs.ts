/**
 * AI/ML & Startup Lifecycle Training Packs
 *
 * Modern AI business patterns and startup lifecycle:
 * - AI/ML Business Models & Unit Economics
 * - Startup Lifecycle Stages & Milestone Logic
 * - Product-Market Fit Detection & Measurement
 * - Pivot Patterns & Failure Mode Analysis
 *
 * Sources: a16z AI playbook, Y Combinator batch data, First Round Review,
 * Sequoia Arc, Lenny Rachitsky, Marc Andreessen, Paul Graham essays
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. AI/ML BUSINESS MODELS & UNIT ECONOMICS
// ============================================================================

const aiMlBusinessModels: TrainingPack = {
  id: 'ai-ml-business-models-unit-economics',
  title: 'AI/ML Business Models — Compute Economics, Inference Costs, Moat Analysis',
  source: 'a16z AI playbook, Bessemer AI Index, Sequoia AI report, OpenAI/Anthropic economics',
  industry: 'AI/ML',
  domains: ['engineering', 'finance', 'product', 'strategy'],
  confidence: 0.85,
  tags: ['ai', 'ml', 'llm', 'inference-cost', 'gpu', 'training-compute', 'ai-moat', 'ai-pricing'],

  causalChains: [
    { source: 'engineering', target: 'finance', metric: 'inference_cost_to_gross_margin', effectSize: -0.60, lagDays: 30, pValue: 0.001 },
    { source: 'engineering', target: 'product', metric: 'model_quality_to_user_retention', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    { source: 'product', target: 'finance', metric: 'ai_feature_adoption_to_pricing_power', effectSize: 0.50, lagDays: 90, pValue: 0.002 },
    { source: 'strategy', target: 'finance', metric: 'data_moat_to_competitive_durability', effectSize: 0.55, lagDays: 365, pValue: 0.002 },
    { source: 'finance', target: 'engineering', metric: 'gpu_cost_to_architecture_optimization', effectSize: -0.45, lagDays: 90, pValue: 0.003 },
    { source: 'engineering', target: 'strategy', metric: 'fine_tuning_to_vertical_moat', effectSize: 0.50, lagDays: 180, pValue: 0.003 },
    { source: 'product', target: 'strategy', metric: 'ai_workflow_integration_to_switching_cost', effectSize: 0.55, lagDays: 180, pValue: 0.002 },
    { source: 'finance', target: 'finance', metric: 'usage_based_pricing_to_revenue_volatility', effectSize: 0.35, lagDays: 30, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'AI Gross Margin Below Software Threshold',
      entityType: 'ai_company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.gross_margin', operator: 'less_than', value: 0.50 },
        { field: 'engineering.inference_cost_per_query', operator: 'greater_than', value: 0.01 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'AI gross margin below 50% — this is a services company, not a software company. a16z: AI companies average 50-60% GM vs 75-80% for traditional SaaS. Fix: (1) Distill to smaller models, (2) Cache common queries, (3) Move to usage-based pricing, (4) Optimize inference architecture. Target: 65%+ GM for venture-scale AI.' } },
      ],
      naturalLanguage: 'AI companies with sub-50% gross margins face the "AI cost trap" — GPU inference costs eat the margin advantage that makes software businesses attractive.',
    },
    {
      title: 'Data Moat Assessment',
      entityType: 'ai_company',
      when: { logic: 'AND', conditions: [
        { field: 'product.proprietary_data_advantage', operator: 'less_than', value: 0.30 },
        { field: 'engineering.model_differentiation_score', operator: 'less_than', value: 0.40 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Low proprietary data AND low model differentiation — wrapper risk. AI companies without data moats are vulnerable to: (1) Foundation model providers adding your feature, (2) Competitors replicating with same base model, (3) Open source catching up. Build moat via: proprietary datasets, user feedback loops, workflow integration, and domain fine-tuning.' } },
      ],
      naturalLanguage: 'AI companies without proprietary data or model differentiation are wrappers — the most vulnerable position in AI. The moat must come from data, workflow integration, or domain expertise.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['inference', 'gpu', 'compute', 'model-size', 'latency'], target: ['gross-margin', 'unit-economics', 'pricing', 'profitability'] },
      reasonTemplate: 'AI inference cost determines the entire business model viability. At $0.01/query with 1000 queries/user/month, thats $10/user/month in COGS alone. Traditional SaaS has ~$0.50/user/month COGS. The 20x cost gap means AI companies need fundamentally different pricing (usage-based) or fundamentally cheaper models (distillation, caching).' },
    { source: 'product', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['workflow', 'integration', 'embedding', 'ai-native'], target: ['switching-cost', 'moat', 'retention', 'defensibility'] },
      reasonTemplate: 'AI companies that embed into workflows (not just provide answers) build switching costs. Copilot-style integration (GitHub Copilot, AI in Figma, AI in Notion) creates 3-5x higher retention than standalone AI tools because the value is in the context, not the model.' },
  ],

  patterns: [
    { name: 'AI Company Margin Spectrum', domains: ['finance', 'engineering'], description: 'AI Infrastructure (NVIDIA, cloud): 60-75% GM. AI Platform (OpenAI API, Anthropic): 40-60% GM. AI Application (vertical SaaS + AI): 50-70% GM. AI Services (consulting + AI): 30-50% GM. The closer to raw compute, the lower the margin. Application layer captures most value.', observed: 85, expected: 25, total: 100 },
    { name: 'The AI Wrapper Problem', domains: ['strategy', 'product'], description: 'Thin wrappers around foundation models face existential risk: OpenAI adding features, open source closing gaps, zero switching costs. Defensible AI businesses need: (1) Proprietary training data, (2) Domain-specific fine-tuning, (3) Workflow integration, (4) Network effects from user data, (5) Regulatory/compliance moats.', observed: 82, expected: 30, total: 100 },
    { name: 'Usage-Based AI Pricing', domains: ['finance', 'product'], description: 'AI companies shifting to usage-based pricing: per-query, per-token, per-result. Benefits: aligns cost with value, scales with customer success. Risks: revenue volatility, hard to forecast, customer budget anxiety. Best practice: hybrid (base subscription + usage overage).', observed: 80, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'gross_margin_improvement', expectedChange: 0.15, timeframeDays: 365, condition: 'model_distillation AND inference_caching AND architecture_optimization' },
    { metric: 'competitive_moat', expectedChange: 0.30, timeframeDays: 365, condition: 'proprietary_data_flywheel AND workflow_integration' },
  ],

  narrative: `AI business models face a fundamental tension: the intelligence comes from expensive compute, but software investors expect 75%+ gross margins. a16z found AI companies average 50-60% GM — a structural disadvantage vs traditional SaaS. The moat question is existential: thin wrappers around foundation models face instant commoditization as providers add features and open source closes gaps. Defensible AI businesses need proprietary data, workflow integration, or domain fine-tuning. Usage-based pricing aligns cost with value but creates revenue volatility. The application layer captures the most value — AI-native vertical SaaS that embeds intelligence into workflows builds switching costs that pure model access cannot.`,
};

// ============================================================================
// 2. STARTUP LIFECYCLE & MILESTONE LOGIC
// ============================================================================

const startupLifecycle: TrainingPack = {
  id: 'startup-lifecycle-milestone-logic',
  title: 'Startup Lifecycle — Stage Gates, Milestone Logic, Scaling Transitions',
  source: 'Y Combinator, a16z, Sequoia Arc, Steve Blank, Eric Ries Lean Startup, Paul Graham',
  industry: 'Startups',
  domains: ['strategy', 'finance', 'product', 'marketing', 'hr'],
  confidence: 0.86,
  tags: ['startup', 'lifecycle', 'pmf', 'scaling', 'seed', 'series-a', 'growth', 'milestones'],

  causalChains: [
    { source: 'product', target: 'strategy', metric: 'pmf_signal_to_scaling_readiness', effectSize: 0.65, lagDays: 90, pValue: 0.001 },
    { source: 'strategy', target: 'marketing', metric: 'premature_scaling_to_resource_waste', effectSize: -0.60, lagDays: 90, pValue: 0.001 },
    { source: 'product', target: 'finance', metric: 'mvp_iteration_speed_to_runway_efficiency', effectSize: 0.50, lagDays: 30, pValue: 0.002 },
    { source: 'hr', target: 'product', metric: 'founding_team_strength_to_execution_speed', effectSize: 0.55, lagDays: 0, pValue: 0.002 },
    { source: 'finance', target: 'strategy', metric: 'runway_pressure_to_pivot_urgency', effectSize: 0.50, lagDays: 30, pValue: 0.002 },
    { source: 'marketing', target: 'finance', metric: 'channel_market_fit_to_scalable_growth', effectSize: 0.55, lagDays: 180, pValue: 0.002 },
    { source: 'strategy', target: 'hr', metric: 'stage_transition_to_org_redesign', effectSize: 0.45, lagDays: 90, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Premature Scaling Detection',
      entityType: 'startup',
      when: { logic: 'AND', conditions: [
        { field: 'hr.headcount_growth_quarterly', operator: 'greater_than', value: 0.30 },
        { field: 'product.pmf_score', operator: 'less_than', value: 0.50 },
        { field: 'marketing.repeatable_acquisition_channel', operator: 'equals', value: false },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Premature scaling: headcount growing 30%+ quarterly without PMF or repeatable channels. Startup Genome: premature scaling is the #1 cause of startup death (74% of failures). Stop hiring, find PMF first, then find a repeatable channel, THEN scale. The sequence matters: PMF → Channel-Market Fit → Scale.' } },
      ],
      naturalLanguage: 'Premature scaling — growing the team before finding product-market fit and a repeatable acquisition channel — kills more startups than any other cause. The fix is always the same: slow down, find fit, then scale.',
    },
    {
      title: 'Series A Readiness Check',
      entityType: 'startup',
      when: { logic: 'AND', conditions: [
        { field: 'finance.arr', operator: 'greater_than', value: 1000000 },
        { field: 'finance.arr_growth_rate_monthly', operator: 'greater_than', value: 0.15 },
        { field: 'cs.nrr', operator: 'greater_than', value: 1.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'low', message: 'Series A readiness signals present: $1M+ ARR, 15%+ monthly growth, positive NRR. YC benchmark: Series A requires $1-2M ARR with strong growth trajectory and evidence of repeatable GTM. Start fundraise process — the window is 3-6 months.' } },
      ],
      naturalLanguage: 'The Series A threshold has risen: $1-2M ARR with 15%+ monthly growth and positive NRR demonstrates product-market fit sufficient for institutional investment.',
    },
  ],

  cascades: [
    { source: 'product', target: 'strategy', type: 'enables', severity: 'critical',
      keywords: { source: ['pmf', 'product-market-fit', 'retention', 'organic-pull'], target: ['scaling', 'growth-mode', 'fundraise', 'hiring'] },
      reasonTemplate: 'PMF is the gate — everything before it is search, everything after is execution. Marc Andreessen: "You can always feel PMF — customers pulling the product out of your hands." Before PMF: iterate fast, stay lean. After PMF: pour fuel on the fire.' },
    { source: 'strategy', target: 'hr', type: 'triggers', severity: 'high',
      keywords: { source: ['stage-transition', 'seed-to-a', 'scaling-mode', 'growth-phase'], target: ['org-redesign', 'management-layer', 'process-formalization', 'specialization'] },
      reasonTemplate: 'Each startup stage transition requires org redesign. 5→15 people: first managers. 15→50: departments form. 50→150: middle management layer. 150→500: process formalization. Each transition breaks the previous org structure — "what got you here won\'t get you there."' },
  ],

  patterns: [
    { name: 'Startup Stage Gates', domains: ['strategy', 'finance', 'product'], description: 'Idea → MVP (3-6 months). MVP → PMF (6-18 months). PMF → Scale (12-24 months). Scale → Growth (ongoing). Each gate has requirements: MVP needs a testable hypothesis. PMF needs retention proof. Scale needs unit economics. Growth needs organizational capacity.', observed: 88, expected: 20, total: 100 },
    { name: 'PMF Measurement Framework', domains: ['product', 'cs'], description: 'Sean Ellis test: > 40% "very disappointed" if product disappeared. Retention curve flattening above 0% (users stick). Organic growth (word of mouth > 40% of new users). NPS > 50. Monthly engagement > 3x/week for daily-use products. No single metric is sufficient — use the portfolio.', observed: 85, expected: 25, total: 100 },
    { name: 'The Startup J-Curve', domains: ['finance', 'strategy'], description: 'Startup cash flow follows a J-curve: initial investment → deepening losses as product is built → inflection when revenue scales → profitability. The depth and duration of the valley depends on: burn rate, time to PMF, and capital efficiency. Most startups die in the valley.', observed: 82, expected: 30, total: 100 },
    { name: 'Pivot vs Persevere Framework', domains: ['strategy', 'product'], description: 'Pivot signals: < 40% retention at M3, flat growth despite marketing spend, zero organic referrals, unit economics worsening. Persevere signals: retention improving cohort-over-cohort, organic growth emerging, customers requesting features (not abandoning). The decision framework: are leading indicators improving or declining?', observed: 80, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'survival_rate', expectedChange: 0.30, timeframeDays: 365, condition: 'pmf_achieved_before_scaling' },
    { metric: 'fundraise_success', expectedChange: 0.50, timeframeDays: 180, condition: 'arr_above_1m AND growth_above_15pct_monthly' },
  ],

  narrative: `The startup lifecycle is a sequence of stage gates, each requiring fundamentally different skills and strategies. The #1 killer is premature scaling — growing before finding product-market fit (74% of failures per Startup Genome). PMF is the dividing line: before it, iterate fast and stay lean. After it, pour fuel on the fire. Measuring PMF requires a portfolio approach: Sean Ellis 40% test, retention curve flattening, organic growth, and NPS. Each stage transition (5→15→50→150→500 people) breaks the previous organization structure. The pivot/persevere decision hinges on leading indicators: improving retention and organic growth = persevere. Flat metrics despite effort = pivot.`,
};

// ============================================================================
// 3. GTM STRATEGY & GO-TO-MARKET
// ============================================================================

const gtmStrategy: TrainingPack = {
  id: 'gtm-strategy-go-to-market',
  title: 'GTM Strategy — PLG, Sales-Led, Channel, Community, Hybrid Motions',
  source: 'OpenView PLG Index, Tomasz Tunguz, Kyle Poyar, Lenny Rachitsky, SaaStr',
  industry: 'SaaS',
  domains: ['marketing', 'product', 'finance', 'cs', 'strategy'],
  confidence: 0.85,
  tags: ['gtm', 'plg', 'sales-led', 'channel', 'community-led', 'hybrid', 'motion', 'acquisition'],

  causalChains: [
    { source: 'product', target: 'marketing', metric: 'plg_motion_to_cac_reduction', effectSize: -0.55, lagDays: 180, pValue: 0.001 },
    { source: 'marketing', target: 'finance', metric: 'gtm_efficiency_to_burn_multiple', effectSize: -0.50, lagDays: 90, pValue: 0.002 },
    { source: 'marketing', target: 'marketing', metric: 'channel_market_fit_to_scalable_acquisition', effectSize: 0.60, lagDays: 180, pValue: 0.001 },
    { source: 'product', target: 'cs', metric: 'self_serve_onboarding_to_activation_rate', effectSize: 0.50, lagDays: 30, pValue: 0.002 },
    { source: 'marketing', target: 'finance', metric: 'multi_motion_to_market_coverage', effectSize: 0.45, lagDays: 365, pValue: 0.003 },
    { source: 'cs', target: 'marketing', metric: 'customer_advocacy_to_organic_referrals', effectSize: 0.50, lagDays: 90, pValue: 0.002 },
    { source: 'strategy', target: 'marketing', metric: 'icp_clarity_to_conversion_rate', effectSize: 0.55, lagDays: 60, pValue: 0.002 },
    { source: 'marketing', target: 'product', metric: 'sales_feedback_to_product_roadmap', effectSize: 0.40, lagDays: 60, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'GTM Motion Mismatch',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.avg_deal_size', operator: 'less_than', value: 5000 },
        { field: 'marketing.sales_rep_count', operator: 'greater_than', value: 10 },
        { field: 'product.self_serve_signup', operator: 'equals', value: false },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'GTM motion mismatch: ACV < $5K with 10+ sales reps but no self-serve. At < $5K ACV, human sales cannot be profitable (CAC too high relative to deal size). PLG required: self-serve signup, freemium/trial, in-product upgrade. Sales reps should focus on $25K+ deals. Below $5K = PLG. $5-25K = hybrid. $25K+ = sales-led.' } },
      ],
      naturalLanguage: 'Small deals need PLG; large deals need sales. Using expensive sales reps for <$5K deals destroys unit economics. The motion must match the deal size.',
    },
    {
      title: 'Channel-Market Fit Not Found',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.channels_tested', operator: 'greater_than', value: 5 },
        { field: 'marketing.cac_payback_months', operator: 'greater_than', value: 24 },
        { field: 'finance.arr', operator: 'greater_than', value: 2000000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Tested 5+ channels but CAC payback still > 24 months at $2M+ ARR. This signals missing channel-market fit — the GTM motion does not match the buyer journey. Re-evaluate: (1) Is the ICP correct? (2) Where does the buyer spend time? (3) Is the value proposition clear in 10 seconds? (4) Are you competing on features vs category creation?' } },
      ],
      naturalLanguage: 'Channel-market fit is as important as product-market fit. If multiple channels all produce poor CAC payback, the problem is positioning or ICP definition, not the channels.',
    },
  ],

  cascades: [
    { source: 'product', target: 'marketing', type: 'enables', severity: 'high',
      keywords: { source: ['plg', 'self-serve', 'freemium', 'trial', 'product-qualified-lead'], target: ['cac-reduction', 'organic-growth', 'viral-coefficient', 'lead-gen'] },
      reasonTemplate: 'PLG companies achieve 3-5x lower CAC because the product IS the marketing. Freemium creates top-of-funnel at near-zero marginal cost. Product-qualified leads (PQLs) convert 5-10x better than MQLs because the user has already experienced value.' },
    { source: 'marketing', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['gtm-motion', 'acquisition', 'channel', 'sales-cycle'], target: ['burn-multiple', 'efficiency', 'growth-rate', 'unit-economics'] },
      reasonTemplate: 'GTM efficiency directly determines burn multiple. Sales-led: 6-12 month payback at $50K+ ACV. PLG: 3-6 month payback. Community-led: 12-18 month ramp but lowest long-term CAC. The wrong motion for your price point destroys unit economics regardless of product quality.' },
  ],

  patterns: [
    { name: 'GTM Motion by ACV', domains: ['marketing', 'finance'], description: '< $5K ACV: PLG (must be self-serve). $5-25K ACV: PLG + inside sales hybrid. $25-100K ACV: inside sales-led. $100K+ ACV: field sales + enterprise. The motion must match the deal size — using expensive sales for cheap deals is the most common GTM mistake.', observed: 88, expected: 20, total: 100 },
    { name: 'PLG Metrics Framework', domains: ['product', 'marketing'], description: 'Key PLG metrics: Sign-up → Activation (< 10 minutes to value). Activation → Engagement (3+ sessions/week). Engagement → Conversion (free → paid, 2-5% typical). Conversion → Expansion (seat expansion, tier upgrade). PQL conversion: 5-10x MQL conversion rate.', observed: 85, expected: 25, total: 100 },
    { name: 'Hybrid GTM Maturity', domains: ['marketing', 'product', 'finance'], description: 'Best companies evolve to hybrid: PLG for SMB self-serve + Sales for enterprise. Slack, Zoom, Atlassian, Datadog all started PLG then added sales. The key: PLG generates pipeline that sales harvests at enterprise scale. PQLs feed the sales team with pre-qualified, product-experienced leads.', observed: 82, expected: 30, total: 100 },
    { name: 'Community-Led Growth', domains: ['marketing', 'product'], description: 'Community-led growth (CLG): dbt, Figma, Notion. Long ramp (12-18 months) but lowest long-term CAC and highest organic multiplier. Community creates: awareness, education, trust, feedback loop, and advocacy. CLG works best for developer tools and creative tools with strong network effects.', observed: 78, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'cac_reduction', expectedChange: -0.50, timeframeDays: 365, condition: 'plg_motion_launched AND self_serve_conversion_above_3pct' },
    { metric: 'sales_efficiency', expectedChange: 0.40, timeframeDays: 180, condition: 'pql_pipeline_feeding_sales AND icp_refined' },
  ],

  narrative: `Go-to-market strategy is the bridge between product and revenue. The #1 mistake is motion-ACV mismatch: using expensive sales reps for $5K deals or expecting enterprise self-serve at $100K+ ACV. PLG companies achieve 3-5x lower CAC because the product does the selling. Sales-led works for complex, high-ACV deals where the buyer needs consultative guidance. The best companies evolve to hybrid: PLG generates pipeline that sales harvests at enterprise scale. Channel-market fit is as important as product-market fit — if no channel produces good CAC payback, the problem is positioning, not distribution. Community-led growth has the longest ramp but the lowest long-term CAC and highest advocacy multiplier.`,
};

// ============================================================================
// 4. PMF DETECTION & MEASUREMENT
// ============================================================================

const pmfDetection: TrainingPack = {
  id: 'pmf-detection-measurement-signals',
  title: 'Product-Market Fit — Detection Signals, Measurement, False Positives',
  source: 'Marc Andreessen pmf essay, Rahul Vohra Superhuman PMF engine, Sean Ellis survey, Lenny Rachitsky, First Round',
  industry: 'Startups',
  domains: ['product', 'cs', 'marketing', 'finance', 'strategy'],
  confidence: 0.87,
  tags: ['pmf', 'product-market-fit', 'retention', 'engagement', 'sean-ellis', 'superhuman', 'activation'],

  causalChains: [
    { source: 'product', target: 'cs', metric: 'activation_rate_to_retention', effectSize: 0.65, lagDays: 30, pValue: 0.001 },
    { source: 'cs', target: 'marketing', metric: 'organic_referral_to_growth', effectSize: 0.55, lagDays: 60, pValue: 0.002 },
    { source: 'product', target: 'finance', metric: 'pmf_strength_to_pricing_power', effectSize: 0.50, lagDays: 90, pValue: 0.002 },
    { source: 'cs', target: 'finance', metric: 'retention_curve_shape_to_ltv', effectSize: 0.60, lagDays: 180, pValue: 0.001 },
    { source: 'marketing', target: 'product', metric: 'wrong_icp_to_false_pmf_signal', effectSize: -0.45, lagDays: 90, pValue: 0.003 },
    { source: 'product', target: 'strategy', metric: 'pmf_confirmation_to_scaling_decision', effectSize: 0.60, lagDays: 30, pValue: 0.001 },
  ],

  businessRules: [
    {
      title: 'PMF Score Below Threshold',
      entityType: 'startup',
      when: { logic: 'AND', conditions: [
        { field: 'product.sean_ellis_very_disappointed_pct', operator: 'less_than', value: 0.40 },
        { field: 'cs.month3_retention', operator: 'less_than', value: 0.40 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'PMF not achieved: Sean Ellis < 40% AND M3 retention < 40%. Do NOT scale. Iterate on: (1) Who is the ideal user? (segment analysis) (2) What is the core value? (Jobs-to-be-done) (3) Is the aha moment clear? (activation analysis) (4) What would make disappointed users very disappointed? (Superhuman method). Scaling without PMF is the #1 startup killer.' } },
      ],
      naturalLanguage: 'Below 40% on Sean Ellis with sub-40% M3 retention means the product does not create enough value for users to stick. The only correct action is to iterate, not scale.',
    },
  ],

  cascades: [
    { source: 'product', target: 'strategy', type: 'enables', severity: 'critical',
      keywords: { source: ['pmf', 'retention', 'engagement', 'organic-pull'], target: ['scaling', 'fundraise', 'growth-mode', 'hiring'] },
      reasonTemplate: 'PMF is binary for strategy: without it, every dollar spent on growth is wasted. With it, growth investment compounds. Andreessen: "You can always feel when PMF is happening — customers are buying as fast as you can produce, usage is growing as fast as you can add servers." Before PMF = search mode. After PMF = execution mode.' },
  ],

  patterns: [
    { name: 'PMF Signal Portfolio', domains: ['product', 'cs', 'marketing'], description: 'No single metric proves PMF. Use the portfolio: (1) Sean Ellis > 40% very disappointed, (2) M3 retention > 40% (B2B) or > 25% (consumer), (3) Organic referrals > 30% of new users, (4) NPS > 50, (5) Revenue retention > 100%, (6) Decreasing sales cycle length, (7) Inbound > outbound demand.', observed: 88, expected: 20, total: 100 },
    { name: 'False PMF Signals', domains: ['product', 'marketing'], description: 'Dangerous false positives: Growth from paid channels (not organic pull). High sign-ups but low activation. Enterprise pilot commitments (political, not value-driven). Press coverage without usage. Investor interest without customer pull. Revenue from one-off deals, not recurring patterns.', observed: 82, expected: 30, total: 100 },
    { name: 'Superhuman PMF Engine', domains: ['product'], description: 'Rahul Vohra method: (1) Survey users asking "How disappointed if product disappeared?" (2) Segment respondents by ICP fit. (3) For "very disappointed" users: what do they love? (4) For "somewhat disappointed": what would make them "very"? (5) Build features for #4 while protecting #3. (6) Repeat until > 40% in target segment.', observed: 85, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'sean_ellis_score', expectedChange: 0.15, timeframeDays: 180, condition: 'icp_refined AND activation_improved AND core_value_clarified' },
    { metric: 'retention_improvement', expectedChange: 0.20, timeframeDays: 180, condition: 'pmf_engine_running AND weekly_iteration' },
  ],

  narrative: `Product-market fit is the most important milestone in a startup's life. Before PMF, every dollar spent on growth is wasted. After PMF, growth investment compounds. The Sean Ellis test (> 40% "very disappointed") is the gold standard survey metric, but no single metric is sufficient. Use the portfolio: retention curve shape, organic referral rate, NPS, revenue retention, and sales cycle trends. The Superhuman PMF Engine provides a systematic method: segment users, understand what "very disappointed" users love, find what would convert "somewhat disappointed" to "very," build for that, repeat. False PMF signals are dangerous: paid growth masking organic weakness, press without usage, pilots without retention.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const AI_ML_STARTUPS_PACKS: TrainingPack[] = [
  aiMlBusinessModels,
  startupLifecycle,
  gtmStrategy,
  pmfDetection,
];
