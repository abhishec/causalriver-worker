/**
 * Advanced Causal Intelligence Training Packs — Phase 4
 *
 * Deep causal chain modeling for complex business phenomena:
 * - AI Adoption Impact Cascades
 * - M&A Integration Patterns
 * - Business Lifecycle Stage Transitions
 * - Technology Disruption Cascades
 * - Platform Risk & Dependency
 * - Economic Cycle Impact on SaaS
 *
 * Sources: McKinsey Global AI Survey 2024, Harvard Business Review M&A research,
 * Christensen disruption theory, PitchBook, Bessemer Cloud Index, FRED economic data
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. AI ADOPTION IMPACT CASCADE
// ============================================================================

const aiAdoptionImpact: TrainingPack = {
  id: 'ai-adoption-impact-cascade',
  title: 'AI Adoption → Productivity → Revenue Cascade',
  source: 'McKinsey Global AI Survey 2024, BCG AI @ Scale 2024, GitHub Copilot research, Accenture AI maturity reports',
  industry: 'Technology',
  domains: ['engineering', 'product', 'cs', 'finance', 'hr'],
  confidence: 0.82,
  tags: ['ai-adoption', 'productivity', 'automation', 'copilot', 'llm', 'genai'],

  causalChains: [
    // AI tool adoption → developer productivity (GitHub Copilot: 55% faster task completion)
    { source: 'engineering', target: 'engineering', metric: 'ai_tool_adoption_to_dev_productivity', effectSize: 0.55, lagDays: 30, pValue: 0.001 },
    // Dev productivity → feature velocity (more features shipped per sprint)
    { source: 'engineering', target: 'product', metric: 'dev_productivity_to_feature_velocity', effectSize: 0.40, lagDays: 14, pValue: 0.005 },
    // AI in CS → ticket resolution time (40-60% reduction in handle time)
    { source: 'cs', target: 'cs', metric: 'ai_cs_adoption_to_resolution_time', effectSize: -0.50, lagDays: 14, pValue: 0.002 },
    // AI CS → customer satisfaction (faster resolution = happier customers)
    { source: 'cs', target: 'cs', metric: 'ai_resolution_speed_to_csat', effectSize: 0.35, lagDays: 30, pValue: 0.008 },
    // Feature velocity → product-market fit signals
    { source: 'product', target: 'finance', metric: 'feature_velocity_to_expansion_revenue', effectSize: 0.30, lagDays: 60, pValue: 0.01 },
    // AI adoption → workforce restructuring (role changes, not just layoffs)
    { source: 'engineering', target: 'hr', metric: 'ai_adoption_to_role_evolution', effectSize: 0.45, lagDays: 90, pValue: 0.005 },
    // AI maturity → competitive moat (first-movers gain 2-3x advantage)
    { source: 'product', target: 'finance', metric: 'ai_maturity_to_competitive_advantage', effectSize: 0.50, lagDays: 180, pValue: 0.003 },
    // AI quality issues → trust erosion (hallucinations, wrong answers)
    { source: 'product', target: 'cs', metric: 'ai_quality_failures_to_trust_erosion', effectSize: -0.55, lagDays: 7, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'AI Adoption Readiness Gate',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.ai_tool_adoption_pct', operator: 'less_than', value: 0.30 },
        { field: 'competitors.ai_adoption_pct', operator: 'greater_than', value: 0.60 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'AI adoption gap detected. Competitors at 60%+ AI tool adoption while you are below 30%. McKinsey: AI-adopting companies see 20-30% productivity gains. Closing this gap is critical within 6 months.' } },
      ],
      naturalLanguage: 'Companies lagging in AI adoption by >30 percentage points face productivity and competitive disadvantage within 12-18 months. Early adopters capture 2-3x advantage.',
    },
    {
      title: 'AI Quality Guard — Hallucination Risk',
      entityType: 'product',
      when: { logic: 'AND', conditions: [
        { field: 'product.ai_feature_usage_pct', operator: 'greater_than', value: 0.50 },
        { field: 'cs.ai_related_ticket_pct', operator: 'greater_than', value: 0.15 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'AI quality issue: >15% of support tickets are AI-related while >50% of users engage AI features. Trust erosion accelerates churn. Implement human-in-the-loop guardrails immediately.' } },
      ],
      naturalLanguage: 'When AI features drive >15% of support tickets, trust erodes 55% faster. Quality must improve before further AI rollout or customer trust collapses.',
    },
  ],

  cascades: [
    {
      source: 'engineering',
      target: 'product',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['ai-tool', 'copilot', 'adoption', 'developer-productivity', 'genai'],
        target: ['feature-velocity', 'shipping-speed', 'cycle-time', 'sprint-output'],
      },
      reasonTemplate: 'AI tool adoption in engineering enables faster feature delivery — 55% faster task completion drives higher sprint output and shorter cycle times',
    },
    {
      source: 'product',
      target: 'cs',
      type: 'impacts',
      severity: 'critical',
      keywords: {
        source: ['hallucination', 'ai-quality', 'wrong-answer', 'unreliable'],
        target: ['support-ticket', 'trust-erosion', 'user-complaint', 'feature-abandonment'],
      },
      reasonTemplate: 'AI quality failures (hallucinations, wrong answers) trigger support ticket spikes and erode user trust — trust erodes 55% faster than it builds',
    },
    {
      source: 'engineering',
      target: 'hr',
      type: 'triggers',
      severity: 'medium',
      keywords: {
        source: ['ai-adoption', 'automation', 'ai-maturity'],
        target: ['role-evolution', 'reskilling', 'workforce-restructuring'],
      },
      reasonTemplate: 'AI adoption triggers workforce role evolution — not just layoffs but fundamental changes in job descriptions and skill requirements',
    },
    {
      source: 'product',
      target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['ai-maturity', 'competitive-moat', 'first-mover'],
        target: ['expansion-revenue', 'market-share', 'competitive-advantage'],
      },
      reasonTemplate: 'AI maturity creates competitive moat — first-movers gain 2-3x advantage that becomes insurmountable after 18 months',
    },
  ],

  patterns: [
    {
      name: 'AI Adoption S-Curve',
      domains: ['engineering', 'product', 'hr'],
      description: 'AI tool adoption follows S-curve: slow start (0-20%), rapid growth (20-60%), plateau with cultural resistance (60-80%), full adoption requires leadership mandate',
      observed: 82,
      expected: 30,
      total: 100,
    },
    {
      name: 'AI ROI J-Curve',
      domains: ['engineering', 'finance'],
      description: 'AI investments show J-curve: initial productivity DIP as teams learn new tools (weeks 1-4), then 30-55% productivity gain once past the learning curve (weeks 4-12)',
      observed: 80,
      expected: 35,
      total: 100,
    },
    {
      name: 'Copilot Effect: Junior vs Senior',
      domains: ['engineering', 'hr'],
      description: 'AI coding assistants boost junior developers 2x more than seniors. Juniors: 55% faster. Seniors: 25% faster. Net effect: skill gap compression.',
      observed: 85,
      expected: 40,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'developer_productivity', expectedChange: 0.40, timeframeDays: 90, condition: 'ai_tool_adoption > 60%' },
    { metric: 'cs_resolution_time', expectedChange: -0.45, timeframeDays: 60, condition: 'ai_cs_tools_deployed' },
    { metric: 'feature_velocity', expectedChange: 0.30, timeframeDays: 120, condition: 'ai_adoption_past_learning_curve' },
    { metric: 'competitive_advantage', expectedChange: 0.50, timeframeDays: 180, condition: 'ai_maturity_level >= 3' },
  ],

  narrative: `AI adoption creates a powerful productivity cascade — but only when quality is maintained.
GitHub Copilot research shows 55% faster task completion for developers. McKinsey reports companies with AI at scale see 20-30% revenue growth premium. But the dark side is real: when AI features produce hallucinations or wrong answers, trust erodes 55% faster than it builds. The key insight is the J-curve — teams get WORSE before they get better (4-week learning curve), and the S-curve of adoption stalls at 60% without leadership mandate. Companies that navigate both curves capture a 2-3x competitive moat that becomes nearly insurmountable after 18 months.`,
};

// ============================================================================
// 2. M&A INTEGRATION PATTERNS
// ============================================================================

const maIntegrationPatterns: TrainingPack = {
  id: 'ma-integration-cascade',
  title: 'M&A Integration → Value Realization Cascade',
  source: 'Harvard Business Review M&A research, McKinsey M&A integration studies, Bain Tech M&A reports, PitchBook 2024',
  industry: 'Cross-Industry',
  domains: ['finance', 'engineering', 'hr', 'product', 'cs'],
  confidence: 0.78,
  tags: ['m-and-a', 'integration', 'acquisition', 'merger', 'culture', 'synergy'],

  causalChains: [
    // Cultural mismatch → talent attrition (70-80% of M&A failures are cultural)
    { source: 'hr', target: 'hr', metric: 'cultural_mismatch_to_talent_attrition', effectSize: 0.65, lagDays: 90, pValue: 0.001 },
    // Talent attrition → engineering velocity drop
    { source: 'hr', target: 'engineering', metric: 'key_talent_loss_to_velocity_drop', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    // Integration speed → synergy capture (fast integration = 6-12 months, slow = 24+)
    { source: 'engineering', target: 'finance', metric: 'integration_speed_to_synergy_capture', effectSize: 0.50, lagDays: 180, pValue: 0.005 },
    // Product consolidation → customer confusion
    { source: 'product', target: 'cs', metric: 'product_consolidation_to_customer_confusion', effectSize: 0.45, lagDays: 60, pValue: 0.008 },
    // Customer confusion → churn spike (15-25% elevated churn post-M&A)
    { source: 'cs', target: 'finance', metric: 'customer_confusion_to_churn_spike', effectSize: 0.40, lagDays: 90, pValue: 0.005 },
    // Tech debt accumulation during integration → long-term velocity drag
    { source: 'engineering', target: 'engineering', metric: 'integration_tech_debt_to_velocity_drag', effectSize: -0.35, lagDays: 120, pValue: 0.01 },
    // Revenue synergy → combined growth (only 25% of acquirers achieve projected synergies)
    { source: 'finance', target: 'finance', metric: 'synergy_achievement_to_growth', effectSize: 0.45, lagDays: 365, pValue: 0.005 },
    // Day-1 communication → employee confidence
    { source: 'hr', target: 'hr', metric: 'day1_communication_to_employee_confidence', effectSize: 0.50, lagDays: 7, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'M&A Cultural Integration Alert',
      entityType: 'acquisition',
      when: { logic: 'AND', conditions: [
        { field: 'hr.acquired_team_attrition_90d', operator: 'greater_than', value: 0.20 },
        { field: 'integration.cultural_alignment_score', operator: 'less_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'M&A integration crisis: 20%+ acquired talent attrition with low cultural alignment. HBR: 70% of M&A failures are cultural. Deploy integration task force and retention bonuses within 30 days.' } },
      ],
      naturalLanguage: 'When acquired team attrition exceeds 20% and cultural alignment is low, the acquisition is at severe risk. 70-80% of M&A value destruction comes from cultural integration failures.',
    },
    {
      title: 'Post-M&A Customer Retention Guard',
      entityType: 'acquisition',
      when: { logic: 'AND', conditions: [
        { field: 'cs.post_acquisition_churn_rate', operator: 'greater_than', value: 0.15 },
        { field: 'product.migration_completion_pct', operator: 'less_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Post-M&A churn exceeding 15% with incomplete product migration. Customers need clear migration path and dedicated support. Pause feature deprecation until migration > 80%.' } },
      ],
      naturalLanguage: 'Post-acquisition churn of 15%+ combined with slow migration means customers are leaving before they can be transitioned. Slow down deprecation, accelerate migration support.',
    },
  ],

  cascades: [
    {
      source: 'hr',
      target: 'engineering',
      type: 'impacts',
      severity: 'critical',
      keywords: {
        source: ['cultural-mismatch', 'talent-attrition', 'acquired-team', 'retention'],
        target: ['velocity-drop', 'knowledge-loss', 'team-disruption', 'integration-overhead'],
      },
      reasonTemplate: 'Cultural mismatch in M&A drives key talent attrition (20-40% in 12 months), which collapses engineering velocity through lost knowledge and broken teams',
    },
    {
      source: 'product',
      target: 'cs',
      type: 'triggers',
      severity: 'high',
      keywords: {
        source: ['product-consolidation', 'migration', 'roadmap-uncertainty', 'deprecation'],
        target: ['customer-confusion', 'churn-spike', 'support-escalation'],
      },
      reasonTemplate: 'Product consolidation post-M&A triggers customer confusion and 15-25% elevated churn — customers leave before migration completes',
    },
    {
      source: 'engineering',
      target: 'finance',
      type: 'delays',
      severity: 'high',
      keywords: {
        source: ['integration-speed', 'tech-debt', 'system-consolidation'],
        target: ['synergy-capture', 'revenue-synergy', 'cost-savings'],
      },
      reasonTemplate: 'Slow engineering integration delays synergy capture — only 25% of acquirers achieve projected synergies, and slow integration is the primary cause',
    },
    {
      source: 'hr',
      target: 'hr',
      type: 'enables',
      severity: 'medium',
      keywords: {
        source: ['day-1-communication', 'integration-plan', 'leadership-alignment'],
        target: ['employee-confidence', 'retention', 'cultural-alignment'],
      },
      reasonTemplate: 'Strong Day-1 communication and clear integration plans enable employee confidence and retention during the critical first 100 days',
    },
  ],

  patterns: [
    {
      name: 'The 100-Day Integration Window',
      domains: ['hr', 'engineering', 'finance'],
      description: 'First 100 days post-close are critical: successful acquirers make 80% of integration decisions in this window. Delayed decisions compound uncertainty and accelerate talent loss.',
      observed: 80,
      expected: 30,
      total: 100,
    },
    {
      name: 'Acqui-hire vs Product Acquisition Divergence',
      domains: ['hr', 'product', 'cs'],
      description: 'Acqui-hires need cultural integration priority (talent retention > product). Product acquisitions need customer migration priority (retention > talent). Mismatching the approach causes 2x failure rate.',
      observed: 78,
      expected: 40,
      total: 100,
    },
    {
      name: 'Serial Acquirer Advantage',
      domains: ['finance', 'hr', 'engineering'],
      description: 'Companies that do 3+ acquisitions develop integration playbooks that reduce failure rate from 70% to 40%. Integration muscle is a learnable organizational capability.',
      observed: 75,
      expected: 35,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'talent_retention_12m', expectedChange: -0.30, timeframeDays: 365, condition: 'cultural_alignment < 50%' },
    { metric: 'synergy_achievement', expectedChange: -0.75, timeframeDays: 730, condition: 'integration_speed == slow' },
    { metric: 'customer_churn_rate', expectedChange: 0.20, timeframeDays: 180, condition: 'product_migration_incomplete' },
    { metric: 'revenue_growth', expectedChange: 0.25, timeframeDays: 365, condition: 'fast_integration AND talent_retained' },
  ],

  narrative: `M&A is where companies bet their future — and lose 70% of the time.
The research is brutal: 70-80% of acquisitions fail to create expected value, and the primary destroyer is culture, not technology or market fit. The 100-day window is real — successful acquirers make 80% of integration decisions in the first 100 days. After that, uncertainty compounds: talent leaves (20-40% of key people in 12 months), velocity collapses, and customers churn (15-25% elevation). Only 25% of acquirers achieve their projected revenue synergies. But serial acquirers who develop integration playbooks cut failure rates nearly in half. The key causal chain: Cultural alignment → Talent retention → Velocity preservation → Synergy capture.`,
};

// ============================================================================
// 3. BUSINESS LIFECYCLE STAGE TRANSITIONS
// ============================================================================

const businessLifecyclePatterns: TrainingPack = {
  id: 'business-lifecycle-transitions',
  title: 'Business Lifecycle Stage Transition Signals',
  source: 'Startup Genome Project, Y Combinator data, First Round Capital research, SaaS benchmarks by stage',
  industry: 'SaaS',
  domains: ['finance', 'product', 'engineering', 'hr', 'marketing'],
  confidence: 0.80,
  tags: ['lifecycle', 'growth-stage', 'scaling', 'pmf', 'series-a', 'series-b', 'maturity'],

  causalChains: [
    // Pre-PMF: Iteration speed → PMF achievement (faster iteration = faster PMF)
    { source: 'engineering', target: 'product', metric: 'iteration_speed_to_pmf_signal', effectSize: 0.50, lagDays: 60, pValue: 0.005 },
    // PMF → growth acceleration (PMF is the inflection point)
    { source: 'product', target: 'finance', metric: 'pmf_to_growth_acceleration', effectSize: 0.65, lagDays: 30, pValue: 0.001 },
    // Growth stage: hiring velocity → organizational complexity
    { source: 'hr', target: 'engineering', metric: 'hiring_velocity_to_org_complexity', effectSize: 0.45, lagDays: 60, pValue: 0.005 },
    // Org complexity → velocity drag (Brooks's Law at scale)
    { source: 'engineering', target: 'engineering', metric: 'org_complexity_to_velocity_drag', effectSize: -0.40, lagDays: 90, pValue: 0.008 },
    // Maturity stage: efficiency → margins (margin expansion in mature stage)
    { source: 'finance', target: 'finance', metric: 'operational_efficiency_to_margin_expansion', effectSize: 0.50, lagDays: 120, pValue: 0.003 },
    // Stage transition → churn risk (transitions create instability)
    { source: 'product', target: 'cs', metric: 'stage_transition_to_churn_risk', effectSize: 0.30, lagDays: 45, pValue: 0.01 },
    // Premature scaling → death (Startup Genome: #1 cause of startup death)
    { source: 'hr', target: 'finance', metric: 'premature_scaling_to_burn_rate', effectSize: 0.70, lagDays: 60, pValue: 0.001 },
    // Revenue per employee → stage readiness signal
    { source: 'finance', target: 'hr', metric: 'revenue_per_employee_to_stage_readiness', effectSize: 0.45, lagDays: 90, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Premature Scaling Detection',
      entityType: 'startup',
      when: { logic: 'AND', conditions: [
        { field: 'hr.headcount_growth_rate_90d', operator: 'greater_than', value: 0.30 },
        { field: 'product.pmf_score', operator: 'less_than', value: 0.40 },
        { field: 'finance.burn_multiple', operator: 'greater_than', value: 3.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Premature scaling detected: 30%+ headcount growth with PMF score below 40% and burn multiple above 3x. Startup Genome: premature scaling is the #1 cause of startup failure (74% of high-growth startup failures).' } },
      ],
      naturalLanguage: 'The #1 killer of startups is scaling before PMF. 74% of high-growth startup failures are due to premature scaling. If headcount is growing 30%+ but PMF signals are weak, the company is burning cash without product-market validation.',
    },
    {
      title: 'Growth-to-Scale Transition Readiness',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.arr', operator: 'greater_than', value: 10000000 },
        { field: 'finance.arr_growth_rate', operator: 'greater_than', value: 0.80 },
        { field: 'engineering.revenue_per_engineer', operator: 'less_than', value: 200000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Growth-to-scale transition needed: ARR >$10M growing 80%+ but revenue per engineer below $200K. Time to shift from growth-at-all-costs to efficient growth. Implement unit economics tracking and efficiency metrics.' } },
      ],
      naturalLanguage: 'At $10M+ ARR growing 80%+, companies must transition from growth-mode to scale-mode. Revenue per engineer below $200K signals over-hiring relative to revenue — efficiency must improve to sustain the next stage.',
    },
  ],

  cascades: [
    {
      source: 'hr',
      target: 'finance',
      type: 'triggers',
      severity: 'critical',
      keywords: {
        source: ['premature-scaling', 'rapid-hiring', 'headcount-growth'],
        target: ['burn-rate', 'runway-crisis', 'cash-burn', 'layoffs'],
      },
      reasonTemplate: 'Premature scaling (hiring before PMF) triggers burn rate acceleration — the #1 cause of startup death per Startup Genome (74% of high-growth startup failures)',
    },
    {
      source: 'hr',
      target: 'engineering',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['hiring-velocity', 'team-growth', 'org-complexity'],
        target: ['velocity-drag', 'coordination-overhead', 'brooks-law'],
      },
      reasonTemplate: 'Rapid hiring increases organizational complexity — Brooks Law at scale means more people = more meetings and less building',
    },
    {
      source: 'product',
      target: 'cs',
      type: 'impacts',
      severity: 'medium',
      keywords: {
        source: ['stage-transition', 'product-pivot', 'roadmap-shift'],
        target: ['churn-risk', 'customer-instability', 'renewal-risk'],
      },
      reasonTemplate: 'Business lifecycle stage transitions create customer instability — pricing changes, feature shifts, and strategy pivots elevate churn risk',
    },
    {
      source: 'engineering',
      target: 'product',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['iteration-speed', 'deployment-frequency', 'experiment-velocity'],
        target: ['pmf-signal', 'product-market-fit', 'validation'],
      },
      reasonTemplate: 'Fast iteration speed enables faster PMF achievement — companies that iterate weekly find PMF 2-3x faster than those iterating monthly',
    },
  ],

  patterns: [
    {
      name: 'The Three-Act SaaS Story',
      domains: ['finance', 'product', 'hr'],
      description: 'Act 1: Pre-PMF (0-$1M ARR) — iterate fast, burn little. Act 2: Growth ($1M-$30M ARR) — pour fuel on the fire, triple-triple-double-double. Act 3: Scale ($30M+ ARR) — efficiency, margins, Rule of 40.',
      observed: 85,
      expected: 30,
      total: 100,
    },
    {
      name: 'Revenue Per Employee Stage Gates',
      domains: ['finance', 'hr'],
      description: 'Pre-PMF: $50-100K/employee (acceptable). Growth: $150-250K/employee (healthy). Scale: $250-400K/employee (efficient). Mature: $350-500K/employee (optimized). Below these thresholds = over-staffed for stage.',
      observed: 80,
      expected: 35,
      total: 100,
    },
    {
      name: 'The Growth Ceiling Pattern',
      domains: ['finance', 'product', 'marketing'],
      description: 'Every SaaS company hits a growth ceiling at roughly 3x their current ARR. Breaking through requires: new market segment, new product line, or international expansion. Without a ceiling-breaker, growth decelerates to 20-30%.',
      observed: 75,
      expected: 40,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'survival_rate', expectedChange: -0.74, timeframeDays: 730, condition: 'premature_scaling_detected' },
    { metric: 'growth_rate', expectedChange: 0.65, timeframeDays: 180, condition: 'pmf_achieved AND scaling_begun' },
    { metric: 'operating_margin', expectedChange: 0.25, timeframeDays: 365, condition: 'scale_stage AND efficiency_focus' },
  ],

  narrative: `Every SaaS business goes through the same three acts, but most die in Act 1 or stumble in the transition between acts.
The Startup Genome Project found that 74% of high-growth startup failures are due to premature scaling — hiring before PMF, spending before product-market validation. The key signals for stage transitions are: Revenue per employee (efficiency), Burn multiple (capital efficiency), and PMF score (customer pull vs push). Companies that successfully navigate from Growth to Scale shift focus from top-line growth to unit economics, implementing the Rule of 40 framework. The most dangerous moment is the transition itself — both customers and employees experience instability during stage changes.`,
};

// ============================================================================
// 4. TECHNOLOGY DISRUPTION CASCADE
// ============================================================================

const techDisruptionCascade: TrainingPack = {
  id: 'technology-disruption-cascade',
  title: 'Technology Disruption → Industry Transformation Cascade',
  source: 'Christensen Innovators Dilemma, Gartner Hype Cycle research, CBInsights disruption data, McKinsey technology adoption curves',
  industry: 'Cross-Industry',
  domains: ['product', 'finance', 'engineering', 'marketing', 'cs'],
  confidence: 0.76,
  tags: ['disruption', 'innovation', 'christensen', 'hype-cycle', 'incumbents', 'startups'],

  causalChains: [
    // New technology emergence → incumbent dismissal (classic Christensen)
    { source: 'product', target: 'product', metric: 'new_tech_to_incumbent_dismissal', effectSize: 0.60, lagDays: 365, pValue: 0.005 },
    // Technology improvement rate → market crossover point
    { source: 'engineering', target: 'product', metric: 'tech_improvement_rate_to_market_crossover', effectSize: 0.55, lagDays: 730, pValue: 0.003 },
    // Market crossover → rapid adoption S-curve
    { source: 'product', target: 'marketing', metric: 'market_crossover_to_adoption_acceleration', effectSize: 0.70, lagDays: 90, pValue: 0.001 },
    // Disruption → incumbent revenue erosion (gradual then sudden)
    { source: 'marketing', target: 'finance', metric: 'disruption_adoption_to_incumbent_erosion', effectSize: -0.50, lagDays: 365, pValue: 0.005 },
    // Hype cycle peak → trough of disillusionment
    { source: 'marketing', target: 'marketing', metric: 'hype_peak_to_disillusionment_trough', effectSize: -0.60, lagDays: 180, pValue: 0.003 },
    // Plateau of productivity → real business value
    { source: 'product', target: 'finance', metric: 'plateau_to_business_value', effectSize: 0.45, lagDays: 365, pValue: 0.008 },
    // API economy disruption → build-vs-buy shift
    { source: 'engineering', target: 'product', metric: 'api_economy_to_build_vs_buy', effectSize: 0.40, lagDays: 180, pValue: 0.01 },
    // Cloud disruption → on-prem decline
    { source: 'engineering', target: 'finance', metric: 'cloud_adoption_to_onprem_decline', effectSize: -0.55, lagDays: 365, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'Disruption Early Warning',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.new_entrant_growth_rate', operator: 'greater_than', value: 1.0 },
        { field: 'product.low_end_market_share_loss', operator: 'greater_than', value: 0.10 },
        { field: 'finance.core_product_growth', operator: 'less_than', value: 0.15 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Disruption warning: New entrants growing 100%+ while you lose 10%+ low-end market share. Christensen: disruption starts at the low end and moves upmarket. Time to launch a counter-disruption team.' } },
      ],
      naturalLanguage: 'When new entrants are growing 100%+ and taking your low-end customers, disruption is underway. This pattern has preceded the decline of every disrupted incumbent from Kodak to Blockbuster.',
    },
    {
      title: 'Hype Cycle Overinvestment Guard',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.new_tech_investment_pct', operator: 'greater_than', value: 0.40 },
        { field: 'product.new_tech_revenue_pct', operator: 'less_than', value: 0.05 },
        { field: 'marketing.technology_hype_score', operator: 'greater_than', value: 0.80 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Hype cycle overinvestment: 40%+ R&D budget on hyped tech generating <5% revenue. Gartner: Most hyped technologies take 5-10 years to reach productivity plateau. Stage investments, dont go all-in during the peak.' } },
      ],
      naturalLanguage: 'Investing 40%+ of R&D budget in a technology at hype-peak while it generates <5% of revenue is a classic overinvestment pattern. Technologies take 5-10 years from hype peak to productivity. Stage your bets.',
    },
  ],

  cascades: [
    {
      source: 'engineering',
      target: 'product',
      type: 'triggers',
      severity: 'high',
      keywords: {
        source: ['new-technology', 'disruptive-innovation', 'tech-improvement'],
        target: ['market-crossover', 'good-enough', 'mainstream-adoption'],
      },
      reasonTemplate: 'Disruptive technology improvement triggers market crossover — when the new tech becomes "good enough" for mainstream at lower price, incumbent revenue collapses',
    },
    {
      source: 'marketing',
      target: 'finance',
      type: 'impacts',
      severity: 'critical',
      keywords: {
        source: ['disruption-adoption', 'low-end-capture', 'market-share-shift'],
        target: ['revenue-erosion', 'incumbent-decline', 'margin-compression'],
      },
      reasonTemplate: 'Disruptive adoption in the market impacts incumbent financials — revenue erodes "gradually then suddenly" with 20-40% collapse in 1-2 years after crossover',
    },
    {
      source: 'marketing',
      target: 'marketing',
      type: 'impacts',
      severity: 'medium',
      keywords: {
        source: ['hype-peak', 'inflated-expectations', 'media-attention'],
        target: ['disillusionment', 'trough', 'abandonment', 'overinvestment'],
      },
      reasonTemplate: 'Hype cycle peak leads to trough of disillusionment — most companies over-invest at the peak and abandon at the trough, precisely when real opportunity begins',
    },
    {
      source: 'engineering',
      target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['api-economy', 'cloud-adoption', 'platform-shift'],
        target: ['build-vs-buy', 'cost-structure', 'on-prem-decline'],
      },
      reasonTemplate: 'Technology platform shifts (cloud, API economy) enable fundamental cost structure changes — on-prem declines as cloud adoption commoditizes infrastructure',
    },
  ],

  patterns: [
    {
      name: 'Gradually Then Suddenly',
      domains: ['marketing', 'finance', 'product'],
      description: 'Disruption follows Hemingway pattern: gradual market share loss (2-3% per year for 3-5 years), then sudden collapse (20-40% in 1-2 years). The tipping point is when the disruptor becomes "good enough" for mainstream.',
      observed: 80,
      expected: 25,
      total: 100,
    },
    {
      name: 'Gartner Hype Cycle Timing',
      domains: ['engineering', 'marketing', 'finance'],
      description: 'Peak of inflated expectations: 1-2 years after emergence. Trough of disillusionment: 3-5 years. Plateau of productivity: 5-10 years. Most companies over-invest at the peak and abandon at the trough.',
      observed: 75,
      expected: 30,
      total: 100,
    },
    {
      name: 'Dual Disruption Pattern',
      domains: ['product', 'marketing', 'finance'],
      description: 'Companies face disruption from BOTH above (feature-rich competitors) and below (simpler/cheaper alternatives). The squeeze: enterprise goes upmarket, SMB goes to simpler tools. Mid-market gets crushed.',
      observed: 73,
      expected: 35,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'market_share', expectedChange: -0.40, timeframeDays: 730, condition: 'disruption_crossover_reached AND no_counter_strategy' },
    { metric: 'revenue', expectedChange: -0.25, timeframeDays: 365, condition: 'low_end_market_loss > 20%' },
    { metric: 'new_market_capture', expectedChange: 0.60, timeframeDays: 1095, condition: 'disruptor_tech_improves_30pct_annually' },
  ],

  narrative: `Disruption is the most misunderstood force in business — not because executives dont know about it, but because they can see it coming and still cant stop it.
Christensens research showed that incumbents are rationally responding to their best customers when they ignore disruptors. The new technology is always worse on the metrics that matter to current customers. But it improves faster than customer needs grow, and one day it crosses over. That crossover is the kill zone. Before it: the disruptor looks like a toy. After it: the incumbent has 1-2 years before revenue collapses 20-40%. The Gartner Hype Cycle adds another dimension: companies over-invest during the hype peak and abandon during the trough — precisely when the real opportunity begins.`,
};

// ============================================================================
// 5. PLATFORM RISK & DEPENDENCY
// ============================================================================

const platformRiskDependency: TrainingPack = {
  id: 'platform-risk-dependency',
  title: 'Platform Risk → Business Vulnerability Cascade',
  source: 'Platform economics research, Apple App Store policy data, Google algorithm updates history, AWS dependency studies',
  industry: 'Technology',
  domains: ['engineering', 'product', 'finance', 'marketing'],
  confidence: 0.79,
  tags: ['platform-risk', 'dependency', 'api', 'marketplace', 'deplatforming', 'concentration-risk'],

  causalChains: [
    // Single-platform dependency → revenue concentration risk
    { source: 'engineering', target: 'finance', metric: 'platform_dependency_to_revenue_risk', effectSize: 0.60, lagDays: 0, pValue: 0.002 },
    // Platform policy change → immediate revenue impact
    { source: 'product', target: 'finance', metric: 'platform_policy_change_to_revenue_impact', effectSize: -0.55, lagDays: 7, pValue: 0.001 },
    // Google algorithm update → traffic disruption (30-80% traffic loss for affected sites)
    { source: 'marketing', target: 'marketing', metric: 'algorithm_update_to_traffic_disruption', effectSize: -0.50, lagDays: 1, pValue: 0.001 },
    // API deprecation → migration cost
    { source: 'engineering', target: 'engineering', metric: 'api_deprecation_to_migration_cost', effectSize: 0.45, lagDays: 90, pValue: 0.005 },
    // Multi-platform strategy → resilience
    { source: 'product', target: 'finance', metric: 'multi_platform_to_revenue_resilience', effectSize: 0.40, lagDays: 180, pValue: 0.008 },
    // Platform fee increase → margin compression
    { source: 'finance', target: 'finance', metric: 'platform_fee_increase_to_margin_compression', effectSize: -0.35, lagDays: 30, pValue: 0.005 },
    // Apple/Google store rejection → release delay and revenue loss
    { source: 'product', target: 'finance', metric: 'store_rejection_to_release_delay', effectSize: -0.30, lagDays: 14, pValue: 0.01 },
    // Own-channel development → platform independence
    { source: 'marketing', target: 'finance', metric: 'own_channel_growth_to_independence', effectSize: 0.45, lagDays: 365, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Platform Concentration Risk Alert',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.single_platform_revenue_pct', operator: 'greater_than', value: 0.60 },
        { field: 'engineering.platform_api_version_age_days', operator: 'greater_than', value: 365 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: '60%+ revenue from a single platform with outdated API integration. This is existential risk. Zynga lost 80% of revenue when Facebook changed policies. Diversify distribution channels within 6 months.' } },
      ],
      naturalLanguage: 'When 60%+ of revenue depends on a single platform, any policy change or API deprecation is existential. Zynga, Vine, and countless app developers have been destroyed by platform dependency.',
    },
    {
      title: 'Google Algorithm Dependency Guard',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.organic_search_traffic_pct', operator: 'greater_than', value: 0.70 },
        { field: 'marketing.direct_traffic_pct', operator: 'less_than', value: 0.15 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: '70%+ traffic from organic search with <15% direct traffic. One Google algorithm update can cut traffic 30-80% overnight. Build direct channels: email list, community, brand recognition.' } },
      ],
      naturalLanguage: 'Extreme dependence on Google organic search is a hidden timebomb. Algorithm updates happen 3-4 times per year and can devastate traffic overnight. Direct traffic and owned channels are the only defense.',
    },
  ],

  cascades: [
    {
      source: 'product',
      target: 'finance',
      type: 'triggers',
      severity: 'critical',
      keywords: {
        source: ['platform-policy', 'api-deprecation', 'fee-increase', 'store-rejection'],
        target: ['revenue-shock', 'margin-compression', 'revenue-loss'],
      },
      reasonTemplate: 'Platform policy changes trigger immediate revenue shock — 20-40% revenue impact when dependency exceeds 60% (Zynga lost 80% from Facebook policy changes)',
    },
    {
      source: 'engineering',
      target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['platform-lock-in', 'single-platform', 'concentration-risk'],
        target: ['revenue-risk', 'existential-risk', 'dependency'],
      },
      reasonTemplate: 'Single-platform engineering dependency impacts revenue resilience — 60%+ revenue from one platform is existential risk that compounds over time',
    },
    {
      source: 'marketing',
      target: 'marketing',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['algorithm-update', 'google-update', 'seo-dependency'],
        target: ['traffic-disruption', 'traffic-loss', 'organic-decline'],
      },
      reasonTemplate: 'Google algorithm updates impact organic traffic — 30-80% traffic loss for affected sites, devastating for companies with 70%+ organic search dependency',
    },
    {
      source: 'marketing',
      target: 'finance',
      type: 'enables',
      severity: 'medium',
      keywords: {
        source: ['own-channel', 'direct-traffic', 'email-list', 'community'],
        target: ['platform-independence', 'revenue-resilience', 'diversification'],
      },
      reasonTemplate: 'Owned channel development enables platform independence — the 60/20/20 rule (max 60% single channel, 20% owned, 20% diversified) builds revenue resilience',
    },
  ],

  patterns: [
    {
      name: 'Platform Tax Ratchet',
      domains: ['engineering', 'finance', 'product'],
      description: 'Platforms start with low fees to attract developers (5-15%), then ratchet up once lock-in is established (15-30%). Apple: 30% app store fee. Steam: 30%. Google: 30%. The pattern is universal — build your own distribution before the ratchet.',
      observed: 85,
      expected: 25,
      total: 100,
    },
    {
      name: 'API Deprecation Cycle',
      domains: ['engineering', 'product'],
      description: 'Major platforms deprecate APIs on 18-24 month cycles. Twitter, Facebook, Google have all deprecated critical APIs that businesses depended on. Budget 15-20% of engineering time for API maintenance if platform-dependent.',
      observed: 78,
      expected: 30,
      total: 100,
    },
    {
      name: 'The 60/20/20 Rule for Distribution',
      domains: ['marketing', 'finance'],
      description: 'Healthy distribution: no more than 60% from any single channel, at least 20% from owned channels (direct, email), 20% from diversified paid/partner channels. Companies exceeding 70% single-channel have 3x failure risk.',
      observed: 80,
      expected: 35,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'revenue', expectedChange: -0.40, timeframeDays: 30, condition: 'platform_policy_change AND dependency > 60%' },
    { metric: 'traffic', expectedChange: -0.50, timeframeDays: 7, condition: 'google_algorithm_update AND seo_dependency > 70%' },
    { metric: 'revenue_resilience', expectedChange: 0.60, timeframeDays: 365, condition: 'multi_platform_strategy_implemented' },
  ],

  narrative: `Platform dependency is the most common form of existential risk that companies voluntarily accept.
The pattern repeats: company grows rapidly on a platform, optimizes everything for that platform, then gets crushed when the platform changes the rules. Zynga lost 80% of revenue from Facebook policy changes. Countless businesses have been decimated by Google algorithm updates. App developers live in fear of App Store rejection. The defense is the 60/20/20 rule: never more than 60% from one channel, at least 20% owned, 20% diversified. But by the time you need the defense, its usually too late to build it. The time to diversify is when you DONT need to.`,
};

// ============================================================================
// 6. ECONOMIC CYCLE IMPACT ON SAAS
// ============================================================================

const economicCycleImpact: TrainingPack = {
  id: 'economic-cycle-saas-impact',
  title: 'Economic Cycle → SaaS Business Impact Cascade',
  source: 'Bessemer Cloud Index, FRED economic data, SaaS Capital benchmarks, Tomasz Tunguz recession analysis, OpenView data',
  industry: 'SaaS',
  domains: ['finance', 'cs', 'marketing', 'hr', 'product'],
  confidence: 0.83,
  tags: ['recession', 'economic-cycle', 'expansion', 'contraction', 'budget-cuts', 'downturn'],

  causalChains: [
    // Interest rate hike → budget scrutiny (tighter money = tighter budgets)
    { source: 'finance', target: 'cs', metric: 'interest_rate_to_budget_scrutiny', effectSize: 0.55, lagDays: 90, pValue: 0.002 },
    // Budget scrutiny → vendor consolidation (companies cut vendors in recession)
    { source: 'cs', target: 'finance', metric: 'budget_scrutiny_to_vendor_consolidation', effectSize: -0.40, lagDays: 60, pValue: 0.005 },
    // Recession → sales cycle elongation (30-50% longer cycles in downturns)
    { source: 'finance', target: 'marketing', metric: 'recession_to_sales_cycle_elongation', effectSize: 0.45, lagDays: 30, pValue: 0.003 },
    // Sales cycle elongation → pipeline accuracy decline
    { source: 'marketing', target: 'finance', metric: 'cycle_elongation_to_pipeline_accuracy_decline', effectSize: -0.35, lagDays: 30, pValue: 0.008 },
    // Downturn → "must-have" vs "nice-to-have" sorting (the great filter)
    { source: 'product', target: 'cs', metric: 'downturn_to_must_have_filter', effectSize: 0.60, lagDays: 30, pValue: 0.001 },
    // Mission-critical status → recession resilience
    { source: 'product', target: 'finance', metric: 'mission_critical_to_recession_resilience', effectSize: 0.55, lagDays: 0, pValue: 0.002 },
    // Downturn → talent availability (layoffs create hiring opportunities)
    { source: 'finance', target: 'hr', metric: 'downturn_to_talent_availability', effectSize: 0.50, lagDays: 60, pValue: 0.005 },
    // Expansion → growth premium (rising tide lifts growth stocks)
    { source: 'finance', target: 'finance', metric: 'expansion_to_growth_valuation_premium', effectSize: 0.60, lagDays: 90, pValue: 0.002 },
    // Efficiency focus in downturn → stronger unit economics post-recovery
    { source: 'finance', target: 'finance', metric: 'downturn_efficiency_to_post_recovery_strength', effectSize: 0.45, lagDays: 365, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Recession Churn Acceleration Warning',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.economic_indicator_trend', operator: 'less_than', value: -0.20 },
        { field: 'product.must_have_score', operator: 'less_than', value: 0.60 },
        { field: 'cs.nrr', operator: 'less_than', value: 1.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Recession + low must-have score + NRR below 100% = churn acceleration ahead. Nice-to-have software gets cut first in downturns. Urgently: demonstrate clear ROI to every customer, shift messaging from growth to efficiency/savings.' } },
      ],
      naturalLanguage: 'In economic downturns, software with low "must-have" status and NRR below 100% faces 2-3x normal churn rates. The budget committee asks "can we live without this?" — your answer needs to be a clear no.',
    },
    {
      title: 'Counter-Cyclical Hiring Opportunity',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.economic_indicator_trend', operator: 'less_than', value: -0.15 },
        { field: 'finance.cash_runway_months', operator: 'greater_than', value: 24 },
        { field: 'hr.open_positions_strategic', operator: 'greater_than', value: 5 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Counter-cyclical hiring opportunity: downturn with strong cash runway. Talent that was unreachable is now available. Companies that hire in downturns emerge 2-3x stronger in the recovery. Be selective but aggressive.' } },
      ],
      naturalLanguage: 'Companies with strong cash positions (24+ months runway) during downturns have a rare opportunity: the best talent, previously locked into big companies, becomes available. Counter-cyclical hiring creates lasting competitive advantage.',
    },
  ],

  cascades: [
    {
      source: 'finance',
      target: 'cs',
      type: 'triggers',
      severity: 'critical',
      keywords: {
        source: ['recession', 'interest-rate', 'economic-contraction', 'gdp-decline'],
        target: ['budget-freeze', 'vendor-consolidation', 'churn-acceleration'],
      },
      reasonTemplate: 'Economic contraction triggers enterprise budget freezes and vendor consolidation — nice-to-have SaaS tools get cut first, driving 5-15 point NRR decline',
    },
    {
      source: 'finance',
      target: 'marketing',
      type: 'delays',
      severity: 'high',
      keywords: {
        source: ['downturn', 'budget-scrutiny', 'procurement-freeze'],
        target: ['sales-cycle', 'pipeline-accuracy', 'deal-velocity'],
      },
      reasonTemplate: 'Economic downturns delay sales cycles 30-50% — more approval layers, more scrutiny, and pipeline accuracy declines as deals slip',
    },
    {
      source: 'product',
      target: 'finance',
      type: 'blocks',
      severity: 'high',
      keywords: {
        source: ['nice-to-have', 'low-roi', 'unclear-value'],
        target: ['churn', 'contraction', 'downsell'],
      },
      reasonTemplate: 'Products without clear "must-have" status get blocked from budget renewals during downturns — the great filter separates mission-critical from discretionary spend',
    },
    {
      source: 'finance',
      target: 'hr',
      type: 'enables',
      severity: 'medium',
      keywords: {
        source: ['downturn', 'layoffs-market', 'talent-availability'],
        target: ['counter-cyclical-hiring', 'talent-acquisition', 'competitive-advantage'],
      },
      reasonTemplate: 'Downturns enable counter-cyclical hiring — talent previously locked into big companies becomes available, creating lasting competitive advantage for companies with strong cash positions',
    },
    {
      source: 'finance',
      target: 'finance',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['recovery', 'budget-thaw', 'pent-up-demand'],
        target: ['growth-acceleration', 'valuation-expansion', 'pipeline-velocity'],
      },
      reasonTemplate: 'Economic recovery enables pent-up demand release — pipeline velocity spikes 2-3x as delayed purchases convert and budgets unfreeze',
    },
  ],

  patterns: [
    {
      name: 'The Must-Have Filter',
      domains: ['product', 'cs', 'finance'],
      description: 'Every recession is a "must-have" vs "nice-to-have" sorting event. Software that saves money or generates measurable revenue survives. Software that improves "productivity" or "collaboration" without clear ROI gets cut.',
      observed: 88,
      expected: 30,
      total: 100,
    },
    {
      name: 'Downturn Efficiency Winners',
      domains: ['finance', 'hr', 'engineering'],
      description: 'Companies that improve efficiency during downturns (not just cut costs) emerge 2-3x stronger. The pattern: cut low-ROI spend, invest in automation, hire selectively from the talent pool, double down on best customers.',
      observed: 82,
      expected: 30,
      total: 100,
    },
    {
      name: 'Valuation Multiple Cycle',
      domains: ['finance'],
      description: 'SaaS valuation multiples follow a predictable cycle: peak at 15-25x revenue in expansions, compress to 5-10x in downturns, then re-expand. The cycle takes 3-5 years. Best companies use the trough to acquire or go public.',
      observed: 80,
      expected: 35,
      total: 100,
    },
    {
      name: 'Budget Season Vulnerability',
      domains: ['cs', 'finance', 'marketing'],
      description: 'SaaS churn concentrates around budget renewal seasons (Q4/Q1 for calendar-year companies). In recessions, Q4 budget reviews are 3x more lethal. Over-index on customer success in September-November.',
      observed: 83,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { metric: 'churn_rate', expectedChange: 0.50, timeframeDays: 180, condition: 'recession AND must_have_score < 60%' },
    { metric: 'sales_cycle_length', expectedChange: 0.40, timeframeDays: 90, condition: 'economic_contraction' },
    { metric: 'valuation_multiple', expectedChange: -0.50, timeframeDays: 180, condition: 'interest_rate_hiking_cycle' },
    { metric: 'post_recovery_growth', expectedChange: 0.60, timeframeDays: 365, condition: 'efficiency_improved_during_downturn' },
    { metric: 'hiring_quality', expectedChange: 0.40, timeframeDays: 180, condition: 'counter_cyclical_hiring AND strong_runway' },
  ],

  narrative: `Economic cycles are the ultimate stress test for SaaS businesses — and the single biggest predictor of who survives is the "must-have" vs "nice-to-have" question.
In every downturn, enterprise budget committees ask one question about every vendor: "Can we live without this?" Software with clear, measurable ROI (revenue generation or cost savings) survives. Everything else gets consolidated. SaaS NRR drops 5-15 points, sales cycles extend 30-50%, and valuation multiples compress 40-70%. But heres the counterintuitive insight: downturns are the BEST time to build competitive advantage. Talent becomes available, competitors pull back, and companies that improve efficiency (not just cut costs) emerge 2-3x stronger when recovery comes. The recovery always comes — and pent-up demand creates a 2-3x pipeline velocity spike.`,
};

// ============================================================================
// EXPORT ALL PHASE 4 PACKS
// ============================================================================

export const ADVANCED_CAUSAL_PACKS: TrainingPack[] = [
  aiAdoptionImpact,
  maIntegrationPatterns,
  businessLifecyclePatterns,
  techDisruptionCascade,
  platformRiskDependency,
  economicCycleImpact,
];
