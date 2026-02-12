/**
 * Training Library — Pre-Built Training Packs
 *
 * A community-ready collection of business knowledge encoded as
 * training packs. These capture widely-known organizational patterns
 * from SaaS, enterprise, fintech, and general business operations.
 *
 * Anyone can create and contribute training packs:
 * - Case studies from HBS, Wharton, Stanford GSB, etc.
 * - Internal post-mortems and lessons learned
 * - Industry benchmarks and best practices
 * - Domain expert knowledge
 * - Historical data analysis
 *
 * Load the entire library with:
 * ```typescript
 * import { createBrainTrainer, TRAINING_LIBRARY } from '@nexus-ai/memory-stack';
 * const trainer = createBrainTrainer();
 * for (const pack of TRAINING_LIBRARY) { trainer.trainInMemory(pack); }
 * ```
 */

import type { TrainingPack } from './brain-trainer';
import { CORE_METRICS_LIBRARY } from './core-metrics-library';

// ============================================================================
// 1. SAAS PRICING CHANGE CASCADE
// ============================================================================

const saasPricingCascade: TrainingPack = {
  id: 'saas-pricing-cascade',
  title: 'SaaS Pricing Change Cascade',
  source: 'Common SaaS industry pattern',
  industry: 'SaaS',
  domains: ['finance', 'cs', 'product', 'marketing'],
  confidence: 0.85,
  tags: ['pricing', 'churn', 'communication'],

  causalChains: [
    { source: 'finance', target: 'cs', metric: 'ticket_volume', effectSize: 0.65, lagDays: 7, pValue: 0.005 },
    { source: 'cs', target: 'product', metric: 'feature_requests', effectSize: 0.40, lagDays: 14, pValue: 0.02 },
    { source: 'finance', target: 'marketing', metric: 'social_sentiment', effectSize: -0.55, lagDays: 3, pValue: 0.01 },
    { source: 'cs', target: 'finance', metric: 'churn_rate', effectSize: 0.50, lagDays: 30, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Price Increase Churn Guard',
      entityType: 'client',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'pricing.increase_percent', operator: 'greater_than', value: 20 },
          { field: 'client.tenure_months', operator: 'less_than', value: 12 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'New client facing >20% price increase — high churn risk' } },
        { type: 'require_approval', params: { level: 'VP_CS', reason: 'Price increase for new client' } },
      ],
      naturalLanguage: 'Clients under 12 months tenure facing >20% price increase require VP CS approval',
      priority: 90,
    },
  ],

  cascades: [
    {
      source: 'finance', target: 'cs', type: 'triggers', severity: 'high',
      keywords: { source: ['price', 'increase', 'billing'], target: ['complaint', 'ticket', 'escalation'] },
    },
    {
      source: 'cs', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['churn', 'cancellation', 'downgrade'], target: ['revenue', 'mrr', 'arr'] },
    },
  ],

  patterns: [
    { name: 'Price Hike Churn Spike', domains: ['finance', 'cs'], observed: 72, expected: 30, total: 100, description: 'Price increases >15% correlate with 2.4x churn rate' },
    { name: 'Communication Buffer Effect', domains: ['marketing', 'cs'], observed: 15, expected: 45, total: 100, description: 'Pre-announcing price changes 60+ days ahead reduces complaints by 67%' },
  ],

  outcomes: [
    { predicted: 'churn_spike', predictedConfidence: 0.82, actual: 'churn_spike', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'cs' },
    { predicted: 'ticket_surge', predictedConfidence: 0.75, actual: 'ticket_surge', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'cs' },
    { predicted: 'revenue_recovery', predictedConfidence: 0.60, actual: 'revenue_decline', wasCorrect: false, sourceDomain: 'finance', targetDomain: 'finance' },
  ],

  narrative: 'When SaaS companies raise prices without adequate communication and grandfathering, billing complaints surge within 1 week, support ticket volume increases 2-3x within 2 weeks, social media sentiment drops, and churn spikes within 30-60 days. Companies that pre-announce 60+ days ahead see 67% fewer complaints.',
};

// ============================================================================
// 2. PAYMENT DELINQUENCY SPIRAL
// ============================================================================

const paymentDelinquencySpiral: TrainingPack = {
  id: 'payment-delinquency-spiral',
  title: 'Payment Delinquency Spiral',
  source: 'B2B SaaS collection patterns',
  industry: 'SaaS',
  domains: ['finance', 'cs', 'account-management'],
  confidence: 0.90,
  tags: ['payments', 'collections', 'churn', 'proactive'],

  causalChains: [
    { source: 'finance', target: 'cs', metric: 'health_score', effectSize: -0.45, lagDays: 14, pValue: 0.003 },
    { source: 'finance', target: 'account-management', metric: 'expansion_probability', effectSize: -0.60, lagDays: 21, pValue: 0.001 },
    { source: 'cs', target: 'account-management', metric: 'renewal_probability', effectSize: 0.55, lagDays: 7, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Payment Delay Expansion Freeze',
      entityType: 'client',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'invoice.days_overdue', operator: 'greater_than', value: 45 },
          { field: 'deal.type', operator: 'equals', value: 'expansion' },
        ],
      },
      then: [
        { type: 'require_approval', params: { level: 'CFO', reason: 'Payment overdue — expansion risk' } },
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Expansion deal for delinquent account requires CFO approval' } },
      ],
      naturalLanguage: 'Expansion deals for accounts with 45+ days overdue invoices require CFO approval',
      priority: 95,
    },
    {
      title: 'Early Delinquency CSM Alert',
      entityType: 'client',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'invoice.days_overdue', operator: 'greater_than', value: 15 },
          { field: 'client.tier', operator: 'in', value: ['enterprise', 'strategic'] },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Enterprise account payment delay — proactive outreach needed' } },
        { type: 'set_flag', params: { flag: 'needs_csm_outreach', value: true } },
      ],
      naturalLanguage: 'Enterprise/strategic accounts with 15+ day payment delays trigger CSM outreach',
    },
  ],

  cascades: [
    {
      source: 'finance', target: 'account-management', type: 'blocks', severity: 'critical',
      keywords: { source: ['overdue', 'collection', 'payment', 'delinquent'], target: ['expansion', 'upsell', 'growth'] },
    },
    {
      source: 'finance', target: 'cs', type: 'impacts', severity: 'high',
      keywords: { source: ['payment', 'invoice', 'overdue'], target: ['health', 'satisfaction', 'engagement'] },
    },
  ],

  patterns: [
    { name: 'Delinquency to Churn Pipeline', domains: ['finance', 'cs', 'account-management'], observed: 68, expected: 25, total: 100, description: 'Accounts 60+ days overdue churn at 2.7x the normal rate' },
    { name: 'Proactive Outreach Recovery', domains: ['cs', 'finance'], observed: 78, expected: 40, total: 100, description: 'CSM outreach within 7 days of first missed payment recovers 78% of accounts' },
  ],

  outcomes: [
    { predicted: 'churn', predictedConfidence: 0.78, actual: 'churn', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'account-management' },
    { predicted: 'expansion_blocked', predictedConfidence: 0.85, actual: 'expansion_blocked', wasCorrect: true },
    { predicted: 'recovery_after_outreach', predictedConfidence: 0.70, actual: 'recovery_after_outreach', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
  ],

  narrative: 'Payment delinquency follows a predictable spiral: missed payments signal deeper issues. Within 14 days, customer health scores decline. Within 21 days, expansion opportunities freeze. Proactive CSM outreach within the first 7 days recovers 78% of accounts.',
};

// ============================================================================
// 3. GROWTH AT ALL COSTS COLLAPSE
// ============================================================================

const growthCollapse: TrainingPack = {
  id: 'growth-at-all-costs-collapse',
  title: 'Growth at All Costs Collapse',
  source: 'Common startup scaling pattern',
  industry: 'Technology',
  domains: ['people', 'product', 'cs', 'finance'],
  confidence: 0.80,
  tags: ['hiring', 'culture', 'quality', 'scaling'],

  causalChains: [
    { source: 'people', target: 'product', metric: 'code_quality', effectSize: -0.50, lagDays: 60, pValue: 0.01 },
    { source: 'product', target: 'cs', metric: 'bug_reports', effectSize: 0.55, lagDays: 14, pValue: 0.008 },
    { source: 'cs', target: 'finance', metric: 'churn_rate', effectSize: 0.40, lagDays: 30, pValue: 0.02 },
    { source: 'people', target: 'people', metric: 'voluntary_turnover', effectSize: 0.35, lagDays: 90, pValue: 0.03 },
  ],

  businessRules: [
    {
      title: 'Rapid Hiring Quality Gate',
      entityType: 'organization',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'people.hiring_rate_monthly', operator: 'greater_than', value: 15 },
          { field: 'people.avg_onboarding_days', operator: 'less_than', value: 14 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Hiring pace exceeds onboarding capacity — quality risk' } },
      ],
      naturalLanguage: 'Hiring >15 people/month with <14 day onboarding creates culture and quality risks',
    },
  ],

  cascades: [
    {
      source: 'people', target: 'product', type: 'impacts', severity: 'high',
      keywords: { source: ['hiring', 'turnover', 'onboarding'], target: ['quality', 'bugs', 'velocity'] },
    },
    {
      source: 'product', target: 'cs', type: 'triggers', severity: 'medium',
      keywords: { source: ['bugs', 'outage', 'regression'], target: ['tickets', 'escalation', 'complaints'] },
    },
  ],

  patterns: [
    { name: 'Hypergrowth Quality Decay', domains: ['people', 'product'], observed: 65, expected: 30, total: 100 },
    { name: 'Bug-to-Churn Pipeline', domains: ['product', 'cs', 'finance'], observed: 55, expected: 25, total: 100 },
  ],

  outcomes: [
    { predicted: 'quality_decline', predictedConfidence: 0.75, actual: 'quality_decline', wasCorrect: true, sourceDomain: 'people', targetDomain: 'product' },
    { predicted: 'support_surge', predictedConfidence: 0.70, actual: 'support_surge', wasCorrect: true, sourceDomain: 'product', targetDomain: 'cs' },
  ],

  narrative: 'Rapid scaling without proportional investment in onboarding leads to code quality drops within 60 days, bug report spikes within 2 weeks, and customer churn within 30-90 days.',
};

// ============================================================================
// 4. SUPPORT ESCALATION CHAIN
// ============================================================================

const supportEscalation: TrainingPack = {
  id: 'support-escalation-chain',
  title: 'Support Escalation Chain',
  source: 'Customer support operations pattern',
  industry: 'SaaS',
  domains: ['cs', 'product', 'people', 'finance'],
  confidence: 0.88,
  tags: ['support', 'burnout', 'nps', 'escalation'],

  causalChains: [
    { source: 'cs', target: 'people', metric: 'agent_burnout', effectSize: 0.50, lagDays: 21, pValue: 0.005 },
    { source: 'people', target: 'cs', metric: 'resolution_time', effectSize: 0.45, lagDays: 7, pValue: 0.01 },
    { source: 'cs', target: 'finance', metric: 'nps_score', effectSize: -0.55, lagDays: 14, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Escalation Volume Alert',
      entityType: 'organization',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'cs.escalation_rate', operator: 'greater_than', value: 0.25 },
          { field: 'cs.avg_resolution_hours', operator: 'greater_than', value: 48 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Support escalation rate >25% with >48hr resolution — systemic issue' } },
        { type: 'escalate', params: { to: 'VP_CS', reason: 'Systemic support quality degradation' } },
      ],
      naturalLanguage: 'Escalation rate above 25% with slow resolution indicates systemic support failure',
    },
  ],

  cascades: [
    { source: 'cs', target: 'people', type: 'impacts', severity: 'high', keywords: { source: ['ticket_volume', 'escalation', 'backlog'], target: ['burnout', 'turnover', 'morale'] } },
    { source: 'cs', target: 'finance', type: 'impacts', severity: 'critical', keywords: { source: ['nps', 'csat', 'resolution_time'], target: ['churn', 'retention', 'revenue'] } },
  ],

  patterns: [
    { name: 'Burnout Spiral', domains: ['cs', 'people'], observed: 70, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'agent_turnover', predictedConfidence: 0.72, actual: 'agent_turnover', wasCorrect: true },
    { predicted: 'nps_decline', predictedConfidence: 0.80, actual: 'nps_decline', wasCorrect: true },
  ],

  narrative: 'High ticket volumes create a reinforcing loop: overloaded agents burn out, increasing resolution times, which increases escalations. NPS drops within 14 days of resolution time spikes.',
};

// ============================================================================
// 5. PRODUCT-LED GROWTH FLYWHEEL
// ============================================================================

const plgFlywheel: TrainingPack = {
  id: 'product-led-growth-flywheel',
  title: 'Product-Led Growth Flywheel',
  source: 'PLG SaaS growth pattern',
  industry: 'SaaS',
  domains: ['product', 'marketing', 'finance', 'cs'],
  confidence: 0.82,
  tags: ['plg', 'adoption', 'expansion', 'referral', 'growth'],

  causalChains: [
    { source: 'product', target: 'finance', metric: 'expansion_revenue', effectSize: 0.60, lagDays: 30, pValue: 0.005 },
    { source: 'product', target: 'marketing', metric: 'organic_referrals', effectSize: 0.50, lagDays: 45, pValue: 0.01 },
    { source: 'marketing', target: 'finance', metric: 'cac_reduction', effectSize: -0.35, lagDays: 60, pValue: 0.02 },
  ],

  businessRules: [
    {
      title: 'Expansion-Ready Account Detection',
      entityType: 'client',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'product.feature_adoption_rate', operator: 'greater_than', value: 0.7 },
          { field: 'product.active_users_growth', operator: 'greater_than', value: 0.15 },
          { field: 'cs.health_score', operator: 'greater_than', value: 80 },
        ],
      },
      then: [
        { type: 'set_flag', params: { flag: 'expansion_ready', value: true } },
        { type: 'trigger_alert', params: { severity: 'info', message: 'Account showing strong expansion signals' } },
      ],
      naturalLanguage: 'Clients with >70% feature adoption, 15%+ user growth, and health >80 are expansion-ready',
    },
  ],

  cascades: [
    { source: 'product', target: 'finance', type: 'enables', severity: 'medium', keywords: { source: ['adoption', 'engagement', 'usage'], target: ['expansion', 'upsell', 'revenue'] } },
    { source: 'product', target: 'marketing', type: 'enables', severity: 'medium', keywords: { source: ['satisfaction', 'nps', 'advocacy'], target: ['referral', 'organic', 'word_of_mouth'] } },
  ],

  patterns: [
    { name: 'Adoption-to-Expansion Pipeline', domains: ['product', 'finance'], observed: 72, expected: 35, total: 100 },
    { name: 'Viral Coefficient Trigger', domains: ['product', 'marketing'], observed: 55, expected: 25, total: 100 },
  ],

  outcomes: [
    { predicted: 'expansion', predictedConfidence: 0.78, actual: 'expansion', wasCorrect: true },
    { predicted: 'referral_increase', predictedConfidence: 0.65, actual: 'referral_increase', wasCorrect: true },
  ],

  narrative: 'Product-led growth creates a positive flywheel: high feature adoption drives expansion revenue within 30 days, satisfied users generate organic referrals within 45 days, reducing CAC over 60 days.',
};

// ============================================================================
// 6-10: ADDITIONAL TRAINING PACKS (Compact format for brevity)
// ============================================================================

const enterpriseExpansion: TrainingPack = {
  id: 'enterprise-expansion-playbook', title: 'Enterprise Land-and-Expand Playbook',
  source: 'Enterprise SaaS sales pattern', industry: 'Enterprise SaaS',
  domains: ['revenue', 'cs', 'account-management', 'product'], confidence: 0.85,
  tags: ['enterprise', 'expansion', 'land-expand'],
  causalChains: [
    { source: 'cs', target: 'account-management', metric: 'expansion_probability', effectSize: 0.65, lagDays: 30, pValue: 0.002 },
    { source: 'product', target: 'cs', metric: 'time_to_value', effectSize: -0.50, lagDays: 14, pValue: 0.008 },
    { source: 'account-management', target: 'revenue', metric: 'deal_velocity', effectSize: 0.45, lagDays: 21, pValue: 0.01 },
  ],
  businessRules: [{
    title: 'Executive Sponsor Required for Expansion', entityType: 'deal',
    when: { logic: 'AND', conditions: [
      { field: 'deal.amount', operator: 'greater_than', value: 100000 },
      { field: 'deal.type', operator: 'equals', value: 'expansion' },
      { field: 'deal.has_executive_sponsor', operator: 'equals', value: false },
    ]},
    then: [{ type: 'trigger_alert', params: { severity: 'high', message: 'Large expansion deal without executive sponsor — win rate drops 40%' } }],
    naturalLanguage: 'Expansion deals >$100K without executive sponsors have 40% lower win rates',
  }],
  cascades: [{ source: 'cs', target: 'account-management', type: 'enables', severity: 'high', keywords: { source: ['health', 'adoption'], target: ['expansion', 'growth'] } }],
  patterns: [{ name: 'Value-Prove-Expand Sequence', domains: ['product', 'cs', 'account-management'], observed: 75, expected: 35, total: 100 }],
  outcomes: [{ predicted: 'expansion_success', predictedConfidence: 0.80, actual: 'expansion_success', wasCorrect: true }],
  narrative: 'Enterprise land-and-expand: fast time-to-value drives health scores, enabling expansion within 30 days. Accounts with executive sponsors have 40% higher win rates.',
};

const revenueLeakage: TrainingPack = {
  id: 'revenue-leakage-pattern', title: 'Revenue Leakage Pattern',
  source: 'Finance operations pattern', industry: 'SaaS',
  domains: ['finance', 'account-management', 'services'], confidence: 0.83,
  tags: ['revenue', 'billing', 'renewal', 'leakage'],
  causalChains: [
    { source: 'services', target: 'finance', metric: 'billing_accuracy', effectSize: -0.40, lagDays: 30, pValue: 0.01 },
    { source: 'account-management', target: 'finance', metric: 'renewal_on_time', effectSize: 0.55, lagDays: 14, pValue: 0.005 },
  ],
  businessRules: [{
    title: 'Renewal Date Coverage', entityType: 'client',
    when: { logic: 'AND', conditions: [
      { field: 'account.days_to_renewal', operator: 'less_than', value: 60 },
      { field: 'account.renewal_owner_assigned', operator: 'equals', value: false },
    ]},
    then: [
      { type: 'trigger_alert', params: { severity: 'critical', message: 'Renewal in <60 days with no owner — revenue at risk' } },
      { type: 'require_approval', params: { level: 'VP_AM', reason: 'Unowned renewal approaching' } },
    ],
    naturalLanguage: 'Renewals within 60 days without assigned owner risk revenue leakage',
  }],
  cascades: [
    { source: 'services', target: 'finance', type: 'blocks', severity: 'medium', keywords: { source: ['delivery', 'milestone'], target: ['billing', 'invoice'] } },
    { source: 'account-management', target: 'finance', type: 'impacts', severity: 'high', keywords: { source: ['renewal', 'contract'], target: ['revenue', 'arr'] } },
  ],
  patterns: [{ name: 'Unowned Renewal Leakage', domains: ['account-management', 'finance'], observed: 62, expected: 30, total: 100 }],
  outcomes: [{ predicted: 'revenue_leakage', predictedConfidence: 0.75, actual: 'revenue_leakage', wasCorrect: true }],
  narrative: 'Revenue leakage occurs through missed renewals, billing errors from services misalignment, and delayed recognition. Assigning renewal owners 90+ days before expiry reduces leakage by 60%.',
};

const csCompoundEffect: TrainingPack = {
  id: 'cs-compound-effect', title: 'Customer Success Compound Effect',
  source: 'Customer success operations pattern', industry: 'SaaS',
  domains: ['cs', 'account-management', 'finance', 'product'], confidence: 0.87,
  tags: ['cs', 'nrr', 'retention', 'proactive'],
  causalChains: [
    { source: 'cs', target: 'account-management', metric: 'nrr', effectSize: 0.60, lagDays: 30, pValue: 0.003 },
    { source: 'cs', target: 'finance', metric: 'ltv', effectSize: 0.50, lagDays: 90, pValue: 0.005 },
    { source: 'cs', target: 'product', metric: 'feature_feedback_quality', effectSize: 0.35, lagDays: 14, pValue: 0.02 },
  ],
  businessRules: [{
    title: 'At-Risk Account Intervention', entityType: 'client',
    when: { logic: 'AND', conditions: [
      { field: 'cs.health_score', operator: 'less_than', value: 40 },
      { field: 'client.arr', operator: 'greater_than', value: 25000 },
    ]},
    then: [
      { type: 'trigger_alert', params: { severity: 'critical', message: 'High-value account health critical — immediate intervention needed' } },
      { type: 'escalate', params: { to: 'VP_CS', reason: 'High-value account at risk' } },
    ],
    naturalLanguage: 'Accounts with >$25K ARR and health score <40 require immediate VP CS intervention',
  }],
  cascades: [{ source: 'cs', target: 'account-management', type: 'enables', severity: 'high', keywords: { source: ['health', 'nps', 'engagement'], target: ['expansion', 'renewal', 'nrr'] } }],
  patterns: [
    { name: 'Proactive Outreach ROI', domains: ['cs', 'finance'], observed: 80, expected: 40, total: 100 },
    { name: 'Health-to-NRR Pipeline', domains: ['cs', 'account-management', 'finance'], observed: 70, expected: 30, total: 100 },
  ],
  outcomes: [{ predicted: 'nrr_improvement', predictedConfidence: 0.80, actual: 'nrr_improvement', wasCorrect: true }],
  narrative: 'Customer success compounds: proactive outreach improves health scores, driving expansion revenue and NRR. Every 10-point health score improvement drives ~5% NRR increase over 90 days.',
};

const technicalDebtCascade: TrainingPack = {
  id: 'technical-debt-cascade', title: 'Technical Debt Cascade',
  source: 'Engineering operations pattern', industry: 'Technology',
  domains: ['product', 'cs', 'people', 'finance'], confidence: 0.80,
  tags: ['tech-debt', 'engineering', 'velocity', 'bugs'],
  causalChains: [
    { source: 'product', target: 'cs', metric: 'ticket_volume', effectSize: 0.50, lagDays: 14, pValue: 0.008 },
    { source: 'cs', target: 'product', metric: 'engineering_context_switching', effectSize: 0.40, lagDays: 7, pValue: 0.02 },
    { source: 'product', target: 'people', metric: 'engineer_satisfaction', effectSize: -0.45, lagDays: 60, pValue: 0.01 },
    { source: 'product', target: 'product', metric: 'shipping_velocity', effectSize: -0.35, lagDays: 30, pValue: 0.03 },
  ],
  businessRules: [{
    title: 'Tech Debt Threshold Alert', entityType: 'organization',
    when: { logic: 'AND', conditions: [
      { field: 'product.bug_rate_weekly', operator: 'greater_than', value: 10 },
      { field: 'product.deployment_frequency', operator: 'less_than', value: 2 },
    ]},
    then: [{ type: 'trigger_alert', params: { severity: 'high', message: 'Technical debt threshold exceeded — shipping velocity at risk' } }],
    naturalLanguage: 'High bug rate with low deployment frequency signals critical technical debt',
  }],
  cascades: [
    { source: 'product', target: 'cs', type: 'triggers', severity: 'high', keywords: { source: ['bug', 'outage', 'regression'], target: ['ticket', 'escalation'] } },
    { source: 'product', target: 'people', type: 'impacts', severity: 'medium', keywords: { source: ['debt', 'velocity', 'bugs'], target: ['morale', 'turnover'] } },
  ],
  patterns: [{ name: 'Debt-Bug-Ticket Loop', domains: ['product', 'cs'], observed: 65, expected: 30, total: 100 }],
  outcomes: [{ predicted: 'velocity_decline', predictedConfidence: 0.70, actual: 'velocity_decline', wasCorrect: true }],
  narrative: 'Technical debt creates a vicious cycle: bugs force engineers to context-switch, slowing velocity and creating more shortcuts. Within 60 days of sustained high bug rates, top performers start leaving.',
};

const marketDownturnTriage: TrainingPack = {
  id: 'market-downturn-triage', title: 'Market Downturn Triage Pattern',
  source: 'Economic recession response pattern', industry: 'SaaS',
  domains: ['finance', 'cs', 'account-management', 'people', 'marketing'], confidence: 0.78,
  tags: ['downturn', 'recession', 'retention', 'budget'],
  causalChains: [
    { source: 'finance', target: 'account-management', metric: 'downgrade_rate', effectSize: 0.55, lagDays: 30, pValue: 0.005 },
    { source: 'finance', target: 'marketing', metric: 'budget_cuts', effectSize: -0.60, lagDays: 14, pValue: 0.003 },
    { source: 'account-management', target: 'finance', metric: 'nrr', effectSize: -0.40, lagDays: 45, pValue: 0.01 },
    { source: 'finance', target: 'people', metric: 'hiring_freeze', effectSize: -0.70, lagDays: 7, pValue: 0.001 },
  ],
  businessRules: [
    {
      title: 'Downturn Revenue Protection', entityType: 'client',
      when: { logic: 'AND', conditions: [
        { field: 'client.industry_risk', operator: 'equals', value: 'high' },
        { field: 'account.contract_months_remaining', operator: 'less_than', value: 6 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'High-risk industry client with renewal approaching' } },
        { type: 'set_priority', params: { priority: 'P1', reason: 'Downturn retention priority' } },
      ],
      naturalLanguage: 'Clients in high-risk industries with <6 months to renewal need proactive retention',
    },
    {
      title: 'Budget Constraint Detection', entityType: 'client',
      when: { logic: 'OR', conditions: [
        { field: 'product.usage_decline_percent', operator: 'greater_than', value: 30 },
        { field: 'product.seats_reduced', operator: 'greater_than', value: 0 },
      ]},
      then: [
        { type: 'set_flag', params: { flag: 'budget_constrained', value: true } },
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Client showing budget constraint signals' } },
      ],
      naturalLanguage: 'Usage drops >30% or seat reductions signal budget constraints and downgrade risk',
    },
  ],
  cascades: [
    { source: 'finance', target: 'account-management', type: 'triggers', severity: 'critical', keywords: { source: ['downturn', 'budget', 'cuts'], target: ['downgrade', 'churn'] } },
    { source: 'finance', target: 'people', type: 'triggers', severity: 'high', keywords: { source: ['budget', 'cost'], target: ['freeze', 'layoff'] } },
  ],
  patterns: [
    { name: 'Usage-as-Leading-Indicator', domains: ['product', 'finance'], observed: 70, expected: 35, total: 100 },
    { name: 'Proactive Discount Retention', domains: ['account-management', 'finance'], observed: 60, expected: 30, total: 100 },
  ],
  outcomes: [
    { predicted: 'downgrade_wave', predictedConfidence: 0.75, actual: 'downgrade_wave', wasCorrect: true },
    { predicted: 'marketing_budget_cut', predictedConfidence: 0.85, actual: 'marketing_budget_cut', wasCorrect: true },
  ],
  narrative: 'Market downturns cascade predictably: budget cuts hit marketing first (14 days), then hiring freezes (7 days), then customer downgrades (30 days). Usage decline >30% is the strongest leading indicator.',
};

// ============================================================================
// ENGINEERING TRAINING PACKS
// ============================================================================

const engineeringVelocityCascade: TrainingPack = {
  id: 'engineering-velocity-cascade',
  title: 'Engineering Velocity Cascade',
  source: 'DORA research + industry patterns',
  industry: 'Technology',
  domains: ['engineering', 'product', 'cs', 'finance'],
  confidence: 0.85,
  tags: ['engineering', 'velocity', 'cicd', 'dora', 'deployment', 'productivity'],
  causalChains: [
    { source: 'engineering', target: 'product', metric: 'feature_delivery_rate', effectSize: 0.65, lagDays: 14, pValue: 0.005 },
    { source: 'engineering', target: 'cs', metric: 'bug_report_volume', effectSize: -0.50, lagDays: 7, pValue: 0.01 },
    { source: 'engineering', target: 'engineering', metric: 'developer_productivity', effectSize: 0.40, lagDays: 30, pValue: 0.02 },
    { source: 'engineering', target: 'finance', metric: 'cost_per_feature', effectSize: -0.35, lagDays: 30, pValue: 0.03 },
  ],
  businessRules: [
    {
      title: 'Deploy Frequency Drop Alert',
      entityType: 'team',
      when: { logic: 'AND', conditions: [{ field: 'engineering.deploy_frequency_drop_pct', operator: 'greater_than', value: 30 }] },
      then: [{ type: 'trigger_alert', params: { severity: 'high', message: 'Deployment frequency drop >30% signals velocity degradation' } }],
      naturalLanguage: 'Deployment frequency drop signals velocity degradation',
    },
    {
      title: 'CI Failure Rate Alert',
      entityType: 'team',
      when: { logic: 'AND', conditions: [{ field: 'engineering.ci_failure_rate_pct', operator: 'greater_than', value: 25 }] },
      then: [{ type: 'trigger_alert', params: { severity: 'high', message: 'CI failure rate above 25% blocks shipping' } }],
      naturalLanguage: 'CI failure rate above 25% blocks shipping',
    },
    {
      title: 'PR Review Time Alert',
      entityType: 'team',
      when: { logic: 'AND', conditions: [{ field: 'engineering.pr_review_time_days', operator: 'greater_than', value: 3 }] },
      then: [{ type: 'trigger_alert', params: { severity: 'medium', message: 'Slow PR reviews bottleneck delivery' } }],
      naturalLanguage: 'Slow PR reviews bottleneck delivery',
    },
  ],
  cascades: [
    { source: 'engineering', target: 'product', type: 'triggers', severity: 'high', keywords: { source: ['velocity', 'deploy', 'sprint'], target: ['roadmap', 'delivery', 'feature'] } },
    { source: 'engineering', target: 'cs', type: 'blocks', severity: 'medium', keywords: { source: ['quality', 'testing', 'ci'], target: ['bug', 'ticket', 'regression'] } },
  ],
  patterns: [
    { name: 'DORA-Elite-Cascade', domains: ['engineering', 'product', 'cs'], description: 'Elite DORA metrics correlate with faster feature delivery and fewer customer issues', observed: 75, expected: 30, total: 100 },
    { name: 'CI-Health-Leading-Indicator', domains: ['engineering', 'product'], description: 'CI pass rate is a 7-day leading indicator of shipping velocity', observed: 68, expected: 35, total: 100 },
  ],
  outcomes: [
    { predicted: 'feature_delay', predictedConfidence: 0.8, actual: 'feature_delay', wasCorrect: true },
    { predicted: 'bug_volume_increase', predictedConfidence: 0.7, actual: 'bug_volume_increase', wasCorrect: true },
  ],
  narrative: 'Engineering velocity cascades predictably: deployment frequency drops signal upcoming feature delays (14 days). CI failure rates above 25% correlate with 50% more support tickets within 7 days. Code review turnaround above 3 days bottlenecks the entire pipeline.',
};

const incidentResponseCascade: TrainingPack = {
  id: 'incident-response-cascade',
  title: 'Incident Response Cascade',
  source: 'SRE operations pattern',
  industry: 'Technology',
  domains: ['engineering', 'cs', 'finance', 'people'],
  confidence: 0.85,
  tags: ['engineering', 'incidents', 'mttr', 'sre', 'oncall', 'burnout'],
  causalChains: [
    { source: 'engineering', target: 'cs', metric: 'ticket_volume', effectSize: 0.70, lagDays: 1, pValue: 0.001 },
    { source: 'cs', target: 'finance', metric: 'churn_rate', effectSize: 0.35, lagDays: 30, pValue: 0.02 },
    { source: 'engineering', target: 'people', metric: 'team_burnout', effectSize: 0.45, lagDays: 60, pValue: 0.015 },
    { source: 'engineering', target: 'engineering', metric: 'mttr_degradation', effectSize: 0.55, lagDays: 14, pValue: 0.008 },
  ],
  businessRules: [
    {
      title: 'High Incident Frequency Alert',
      entityType: 'team',
      when: { logic: 'AND', conditions: [{ field: 'engineering.incident_frequency_per_week', operator: 'greater_than', value: 5 }] },
      then: [{ type: 'trigger_alert', params: { severity: 'critical', message: 'High incident frequency indicates systemic reliability issues' } }],
      naturalLanguage: 'High incident frequency indicates systemic reliability issues',
    },
    {
      title: 'MTTR Degradation Alert',
      entityType: 'team',
      when: { logic: 'AND', conditions: [{ field: 'engineering.mttr_minutes', operator: 'greater_than', value: 120 }] },
      then: [{ type: 'trigger_alert', params: { severity: 'high', message: 'MTTR above 2 hours indicates on-call process issues' } }],
      naturalLanguage: 'MTTR above 2 hours indicates on-call process issues',
    },
    {
      title: 'Escalation Rate Alert',
      entityType: 'team',
      when: { logic: 'AND', conditions: [{ field: 'engineering.escalation_rate_pct', operator: 'greater_than', value: 30 }] },
      then: [{ type: 'trigger_alert', params: { severity: 'high', message: 'High escalation rate signals knowledge gaps' } }],
      naturalLanguage: 'High escalation rate signals knowledge gaps',
    },
  ],
  cascades: [
    { source: 'engineering', target: 'cs', type: 'triggers', severity: 'critical', keywords: { source: ['incident', 'outage', 'degradation'], target: ['ticket', 'complaint', 'escalation'] } },
    { source: 'engineering', target: 'people', type: 'triggers', severity: 'high', keywords: { source: ['oncall', 'page', 'incident'], target: ['burnout', 'attrition', 'morale'] } },
  ],
  patterns: [
    { name: 'Incident-Ticket-Cascade', domains: ['engineering', 'cs'], description: 'Production incidents drive a 70% increase in support tickets within 24 hours', observed: 82, expected: 30, total: 100 },
    { name: 'Oncall-Burnout-Spiral', domains: ['engineering', 'people'], description: 'Frequent paging leads to burnout and MTTR degradation within 60 days', observed: 65, expected: 25, total: 100 },
  ],
  outcomes: [
    { predicted: 'support_spike', predictedConfidence: 0.85, actual: 'support_spike', wasCorrect: true },
    { predicted: 'oncall_burnout', predictedConfidence: 0.65, actual: 'oncall_burnout', wasCorrect: true },
  ],
  narrative: 'Incident cascades flow rapidly: production outages trigger 70% more support tickets within 24 hours. Sustained high incident frequency (>5/week) leads to team burnout within 60 days, which degrades MTTR by 55% — creating a vicious cycle. Escalation rate above 30% indicates knowledge silos.',
};

const codeReviewQualityCascade: TrainingPack = {
  id: 'code-review-quality-cascade',
  title: 'Code Review Quality Impact',
  source: 'Engineering best practices research',
  industry: 'Technology',
  domains: ['engineering', 'product', 'cs'],
  confidence: 0.80,
  tags: ['engineering', 'code-review', 'quality', 'bugs', 'technical-debt'],
  causalChains: [
    { source: 'engineering', target: 'engineering', metric: 'bug_density', effectSize: -0.55, lagDays: 14, pValue: 0.008 },
    { source: 'engineering', target: 'cs', metric: 'customer_reported_bugs', effectSize: -0.40, lagDays: 21, pValue: 0.015 },
    { source: 'engineering', target: 'product', metric: 'feature_stability', effectSize: 0.50, lagDays: 7, pValue: 0.01 },
    { source: 'engineering', target: 'engineering', metric: 'tech_debt_ratio', effectSize: -0.30, lagDays: 30, pValue: 0.04 },
  ],
  businessRules: [
    {
      title: 'Low Review Quality Alert',
      entityType: 'team',
      when: { logic: 'AND', conditions: [{ field: 'engineering.review_thoroughness_score', operator: 'less_than', value: 0.4 }] },
      then: [{ type: 'trigger_alert', params: { severity: 'medium', message: 'Low review quality increases bug escape rate' } }],
      naturalLanguage: 'Low review quality increases bug escape rate',
    },
    {
      title: 'Rubber-Stamp Review Alert',
      entityType: 'team',
      when: { logic: 'AND', conditions: [{ field: 'engineering.avg_review_comments', operator: 'less_than', value: 1 }] },
      then: [{ type: 'trigger_alert', params: { severity: 'medium', message: 'Rubber-stamp reviews correlate with higher defect rates' } }],
      naturalLanguage: 'Rubber-stamp reviews correlate with higher defect rates',
    },
    {
      title: 'Single Reviewer Alert',
      entityType: 'team',
      when: { logic: 'AND', conditions: [{ field: 'engineering.single_reviewer_prs_pct', operator: 'greater_than', value: 50 }] },
      then: [{ type: 'trigger_alert', params: { severity: 'medium', message: 'Single-reviewer PRs miss 40% more issues than multi-reviewer' } }],
      naturalLanguage: 'Single-reviewer PRs miss 40% more issues than multi-reviewer',
    },
  ],
  cascades: [
    { source: 'engineering', target: 'cs', type: 'blocks', severity: 'medium', keywords: { source: ['review', 'quality', 'testing'], target: ['bug', 'regression', 'complaint'] } },
    { source: 'engineering', target: 'product', type: 'enables', severity: 'medium', keywords: { source: ['review', 'architecture', 'refactor'], target: ['stability', 'reliability', 'uptime'] } },
  ],
  patterns: [
    { name: 'Review-Quality-Bug-Correlation', domains: ['engineering', 'cs'], description: 'Thorough code reviews reduce customer-reported bugs by 40% within 3 weeks', observed: 70, expected: 30, total: 100 },
    { name: 'Rubber-Stamp-Debt-Accumulation', domains: ['engineering'], description: 'Low-effort reviews correlate with 30% more tech debt accumulation', observed: 60, expected: 30, total: 100 },
  ],
  outcomes: [
    { predicted: 'bug_reduction', predictedConfidence: 0.75, actual: 'bug_reduction', wasCorrect: true },
    { predicted: 'tech_debt_increase', predictedConfidence: 0.7, actual: 'tech_debt_increase', wasCorrect: true },
  ],
  narrative: 'Code review quality has outsized downstream impact: thorough reviews reduce bug density by 55% within 14 days and customer-reported bugs by 40% within 3 weeks. Rubber-stamp reviews (single reviewer, <1 comment average) correlate with 30% higher tech debt accumulation. Multi-reviewer PRs catch 40% more issues.',
};

// ============================================================================
// 14. ENGINEERING ↔ CUSTOMER SUCCESS BRIDGE
// ============================================================================

const engineeringCSBridge: TrainingPack = {
  id: 'engineering-cs-bridge',
  title: 'Engineering ↔ Customer Success Bridge — Deploy Impact on Retention',
  source: 'Cross-domain causal pattern: engineering decisions impact customer outcomes',
  industry: 'SaaS',
  domains: ['engineering', 'cs', 'product'],
  confidence: 0.82,
  tags: ['cross-domain', 'deploy', 'uptime', 'churn', 'reliability', 'customer-impact'],

  causalChains: [
    // Deploy failures → customer-facing incidents → churn risk
    { source: 'engineering', target: 'cs', metric: 'deploy_failure_to_customer_incident', effectSize: 0.60, lagDays: 1, pValue: 0.003 },
    // Uptime degradation → NPS drop → churn acceleration
    { source: 'engineering', target: 'cs', metric: 'uptime_degradation_to_nps_drop', effectSize: -0.55, lagDays: 7, pValue: 0.005 },
    // Slow incident MTTR → customer satisfaction decline → support ticket surge
    { source: 'engineering', target: 'cs', metric: 'slow_mttr_to_satisfaction_decline', effectSize: -0.45, lagDays: 3, pValue: 0.008 },
    // Feature velocity → product value perception → expansion revenue
    { source: 'engineering', target: 'product', metric: 'feature_velocity_to_product_value', effectSize: 0.40, lagDays: 30, pValue: 0.01 },
    // Bug density → support ticket volume → CS capacity strain
    { source: 'engineering', target: 'cs', metric: 'bug_density_to_support_volume', effectSize: 0.50, lagDays: 14, pValue: 0.005 },
    // CS escalation patterns → engineering priority signals
    { source: 'cs', target: 'engineering', metric: 'escalation_to_engineering_priority', effectSize: 0.35, lagDays: 3, pValue: 0.02 },
  ],

  businessRules: [
    {
      title: 'Deploy Failure Customer Impact',
      entityType: 'service',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.deploy_failure_count_7d', operator: 'greater_than', value: 3 },
        { field: 'cs.customer_incidents_7d', operator: 'greater_than', value: 0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Deploy instability causing customer incidents — coordinate with CS on customer communication' } },
      ],
      naturalLanguage: 'Multiple deploy failures in a week that coincide with customer incidents require immediate cross-team response.',
    },
    {
      title: 'Reliability-Churn Correlation',
      entityType: 'service',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.uptime_pct_30d', operator: 'less_than', value: 99.5 },
        { field: 'cs.churn_rate', operator: 'greater_than', value: 5 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Uptime below 99.5% correlating with elevated churn — reliability is a retention lever' } },
      ],
      naturalLanguage: 'When uptime drops below 99.5% and churn exceeds 5%, reliability becomes the #1 retention lever.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'cs', type: 'triggers', severity: 'high',
      keywords: { source: ['deploy-failure', 'outage', 'incident', 'regression'], target: ['customer-impact', 'escalation', 'churn-risk', 'nps-drop'] },
      reasonTemplate: 'Engineering instability cascades into customer success metrics' },
  ],

  patterns: [
    { name: 'Deploy-Stability-Retention-Correlation', domains: ['engineering', 'cs'], description: 'Teams with >99.9% deploy success rate see 40% lower customer churn', observed: 75, expected: 30, total: 100 },
    { name: 'MTTR-NPS-Inverse-Correlation', domains: ['engineering', 'cs'], description: 'Each 10-minute MTTR improvement correlates with 2-point NPS increase', observed: 68, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'deploy_failures → customer_churn_increase', predictedConfidence: 0.78, actual: 'Churn spiked 15% after 3 production outages in one week', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'cs' },
  ],

  narrative: 'Engineering reliability is the hidden driver of customer success. Deploy failures create customer-facing incidents within hours. Uptime degradation below 99.5% correlates with NPS drops within a week and measurable churn acceleration within 30 days. Teams that invest in deploy stability, incident response speed, and bug prevention see compound benefits in customer retention and expansion revenue.',
};

// ============================================================================
// 15. PEOPLE ↔ ENGINEERING BRIDGE
// ============================================================================

const peopleEngineeringBridge: TrainingPack = {
  id: 'people-engineering-bridge',
  title: 'People ↔ Engineering Bridge — Attrition Impact on Engineering Metrics',
  source: 'Cross-domain causal pattern: people decisions impact engineering velocity',
  industry: 'SaaS',
  domains: ['people', 'engineering', 'cs'],
  confidence: 0.80,
  tags: ['cross-domain', 'attrition', 'hiring', 'velocity', 'knowledge-loss', 'team-health'],

  causalChains: [
    // Senior engineer departure → knowledge loss → velocity drop
    { source: 'people', target: 'engineering', metric: 'senior_departure_to_velocity_drop', effectSize: -0.55, lagDays: 14, pValue: 0.005 },
    // Team attrition → code review bottleneck → deployment delays
    { source: 'people', target: 'engineering', metric: 'attrition_to_review_bottleneck', effectSize: -0.40, lagDays: 21, pValue: 0.01 },
    // Hiring pipeline slowdown → understaffing → incident MTTR increase
    { source: 'people', target: 'engineering', metric: 'understaffing_to_mttr_increase', effectSize: 0.45, lagDays: 60, pValue: 0.008 },
    // Engineering burnout → voluntary attrition → knowledge drain
    { source: 'engineering', target: 'people', metric: 'burnout_to_voluntary_attrition', effectSize: 0.50, lagDays: 90, pValue: 0.005 },
    // On-call overload → team satisfaction decline → departure intent
    { source: 'engineering', target: 'people', metric: 'oncall_overload_to_satisfaction_decline', effectSize: -0.35, lagDays: 30, pValue: 0.015 },
  ],

  businessRules: [
    {
      title: 'Knowledge Loss Risk',
      entityType: 'team',
      when: { logic: 'AND', conditions: [
        { field: 'people.senior_engineers_departed_90d', operator: 'greater_than', value: 1 },
        { field: 'engineering.velocity_change_pct', operator: 'less_than', value: -20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Knowledge loss detected: senior departures correlating with velocity decline — prioritize knowledge transfer and documentation' } },
      ],
      naturalLanguage: 'When senior engineers leave and velocity drops >20%, the team is experiencing knowledge drain that requires active intervention.',
    },
  ],

  cascades: [
    { source: 'people', target: 'engineering', type: 'triggers', severity: 'medium',
      keywords: { source: ['attrition', 'departure', 'understaffing', 'hiring-freeze'], target: ['velocity-drop', 'review-bottleneck', 'incident-mttr', 'tech-debt'] },
      reasonTemplate: 'People changes cascade into engineering capacity and quality metrics' },
    { source: 'engineering', target: 'people', type: 'triggers', severity: 'medium',
      keywords: { source: ['burnout', 'oncall-overload', 'tech-debt', 'incident-fatigue'], target: ['voluntary-attrition', 'satisfaction-decline', 'departure-intent'] },
      reasonTemplate: 'Engineering overload creates attrition pressure that amplifies capacity problems' },
  ],

  patterns: [
    { name: 'Senior-Departure-Velocity-Impact', domains: ['people', 'engineering'], description: 'Each senior engineer departure causes 15-25% velocity drop for 6-8 weeks in their domain', observed: 72, expected: 30, total: 100 },
    { name: 'Burnout-Attrition-Feedback-Loop', domains: ['engineering', 'people'], description: 'Teams with >2 incidents/week per person see 3x higher voluntary attrition within 90 days', observed: 65, expected: 25, total: 100 },
  ],

  outcomes: [
    { predicted: 'senior_departure → velocity_decline', predictedConfidence: 0.75, actual: 'Team velocity dropped 22% after lead architect left', wasCorrect: true, sourceDomain: 'people', targetDomain: 'engineering' },
  ],

  narrative: 'People and engineering form a bidirectional feedback loop: attrition degrades engineering capacity, while engineering overload drives attrition. Senior engineer departures cause 15-25% velocity drops lasting 6-8 weeks. On-call overload (>2 incidents/week/person) is the strongest predictor of voluntary attrition. Proactive knowledge transfer, documentation, and workload balancing are the key interventions.',
};

// ============================================================================
// 16. PRODUCT ↔ MARKETING BRIDGE
// ============================================================================

const productMarketingBridge: TrainingPack = {
  id: 'product-marketing-bridge',
  title: 'Product ↔ Marketing Bridge — Feature Adoption to Revenue Attribution',
  source: 'Cross-domain causal pattern: product decisions impact marketing effectiveness',
  industry: 'SaaS',
  domains: ['product', 'marketing', 'finance', 'cs'],
  confidence: 0.78,
  tags: ['cross-domain', 'adoption', 'attribution', 'feature-launch', 'campaign', 'conversion'],

  causalChains: [
    // Feature adoption → usage data → marketing testimonials → conversion
    { source: 'product', target: 'marketing', metric: 'feature_adoption_to_marketing_content', effectSize: 0.45, lagDays: 30, pValue: 0.01 },
    // Product stickiness → organic word-of-mouth → lower CAC
    { source: 'product', target: 'marketing', metric: 'stickiness_to_organic_growth', effectSize: 0.40, lagDays: 60, pValue: 0.012 },
    // Marketing campaign → MQL → product trial → revenue
    { source: 'marketing', target: 'product', metric: 'campaign_to_trial_activation', effectSize: 0.50, lagDays: 14, pValue: 0.005 },
    // Feature gap → lost deals → marketing message mismatch
    { source: 'product', target: 'marketing', metric: 'feature_gap_to_deal_loss', effectSize: -0.35, lagDays: 45, pValue: 0.02 },
    // Product NPS → referral rate → marketing attribution
    { source: 'product', target: 'finance', metric: 'nps_to_referral_revenue', effectSize: 0.55, lagDays: 90, pValue: 0.003 },
    // Marketing feature positioning → customer expectation → satisfaction gap
    { source: 'marketing', target: 'cs', metric: 'overpromise_to_satisfaction_gap', effectSize: -0.30, lagDays: 30, pValue: 0.025 },
  ],

  businessRules: [
    {
      title: 'Feature Launch Marketing Alignment',
      entityType: 'feature',
      when: { logic: 'AND', conditions: [
        { field: 'product.feature_launch_date_set', operator: 'equals', value: true },
        { field: 'marketing.launch_campaign_ready', operator: 'equals', value: false },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Feature launching without coordinated marketing campaign — missed adoption opportunity' } },
      ],
      naturalLanguage: 'Features launched without marketing coordination see 60% lower adoption in the first 30 days.',
    },
  ],

  cascades: [
    { source: 'product', target: 'marketing', type: 'enables', severity: 'medium',
      keywords: { source: ['feature-launch', 'adoption', 'stickiness', 'nps'], target: ['campaign-content', 'testimonials', 'conversion-rate', 'cac-reduction'] },
      reasonTemplate: 'Product success creates marketing assets and organic growth signals' },
    { source: 'marketing', target: 'product', type: 'triggers', severity: 'low',
      keywords: { source: ['campaign', 'positioning', 'messaging'], target: ['trial-activation', 'feature-expectation', 'onboarding-friction'] },
      reasonTemplate: 'Marketing campaigns shape user expectations that affect product experience' },
  ],

  patterns: [
    { name: 'Feature-Adoption-Marketing-Loop', domains: ['product', 'marketing'], description: 'Features with >40% 30-day adoption generate 3x more organic referrals than those below 20%', observed: 70, expected: 30, total: 100 },
    { name: 'Campaign-Trial-Conversion-Chain', domains: ['marketing', 'product', 'finance'], description: 'Coordinated feature-launch campaigns see 60% higher trial-to-paid conversion', observed: 65, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'feature_adoption → organic_growth', predictedConfidence: 0.72, actual: 'High-adoption features drove 35% of new signups via referrals', wasCorrect: true, sourceDomain: 'product', targetDomain: 'marketing' },
  ],

  narrative: 'Product and marketing form a virtuous cycle when aligned: high feature adoption creates marketing assets (testimonials, case studies, usage stats) that drive acquisition; targeted marketing drives qualified trials that improve feature adoption. The key metric is the adoption-to-referral ratio. Products with >40% 30-day feature adoption generate 3x more organic referrals. Misalignment (overpromising features, launching without marketing) creates satisfaction gaps that cascade into churn.',
};

// ============================================================================
// LIBRARY EXPORTS
// ============================================================================

/**
 * All pre-built training packs.
 * Load them all: `TRAINING_LIBRARY.forEach(p => trainer.trainInMemory(p))`
 */
export const TRAINING_LIBRARY: TrainingPack[] = [
  // Original business pattern training packs
  saasPricingCascade,
  paymentDelinquencySpiral,
  growthCollapse,
  supportEscalation,
  plgFlywheel,
  enterpriseExpansion,
  revenueLeakage,
  csCompoundEffect,
  technicalDebtCascade,
  marketDownturnTriage,
  // Engineering training packs
  engineeringVelocityCascade,
  incidentResponseCascade,
  codeReviewQualityCascade,
  // Cross-domain bridge training packs
  engineeringCSBridge,
  peopleEngineeringBridge,
  productMarketingBridge,
  // Core Metrics Library — VC/PE-grade financial intelligence
  ...CORE_METRICS_LIBRARY,
];

/** Get a training pack by ID */
export function getTrainingPackById(id: string): TrainingPack | undefined {
  return TRAINING_LIBRARY.find((p) => p.id === id);
}

/** Get all training packs for a given industry */
export function getTrainingPacksByIndustry(industry: string): TrainingPack[] {
  return TRAINING_LIBRARY.filter(
    (p) => p.industry.toLowerCase() === industry.toLowerCase(),
  );
}

/** Get all training packs involving a specific domain */
export function getTrainingPacksByDomain(domain: string): TrainingPack[] {
  return TRAINING_LIBRARY.filter((p) =>
    p.domains.some((d) => d.toLowerCase() === domain.toLowerCase()),
  );
}

/** Get all training packs matching a tag */
export function getTrainingPacksByTag(tag: string): TrainingPack[] {
  return TRAINING_LIBRARY.filter((p) =>
    (p.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase()),
  );
}

/** Get all available training packs */
export function getAllTrainingPacks(): TrainingPack[] {
  return [...TRAINING_LIBRARY];
}
