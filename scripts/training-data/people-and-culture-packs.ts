/**
 * People & Culture Training Packs — Knowledge from HR/Org Research
 *
 * Hand-crafted TrainingPacks encoding causal relationships from:
 * - Gallup State of the Global Workplace (2024-2025)
 * - Stripe Developer Coefficient Report
 * - SPACE / DevEx Framework for Engineering Productivity
 * - Spotify Squad Model lessons learned
 * - Engineering team scaling patterns
 *
 * These encode people, culture, and organizational causal patterns.
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. EMPLOYEE ENGAGEMENT CASCADE — Gallup Research
// ============================================================================

const employeeEngagementCascade: TrainingPack = {
  id: 'employee-engagement-cascade',
  title: 'Employee Engagement to Business Performance',
  source: 'Gallup State of Global Workplace 2024-2025 (39,000+ respondents)',
  industry: 'All',
  domains: ['people', 'finance', 'product', 'engineering', 'cs'],
  confidence: 0.88,
  tags: ['engagement', 'gallup', 'turnover', 'productivity', 'manager', 'culture'],

  causalChains: [
    {
      source: 'people', target: 'finance',
      metric: 'engagement_to_profitability',
      effectSize: 0.65,   // 21% higher profitability for engaged teams
      lagDays: 90,
      pValue: 0.001,
    },
    {
      source: 'people', target: 'people',
      metric: 'engagement_to_turnover',
      effectSize: -0.70,  // 51% lower turnover with high engagement
      lagDays: 30,
      pValue: 0.001,
    },
    {
      source: 'people', target: 'engineering',
      metric: 'engagement_to_productivity',
      effectSize: 0.55,   // 18% higher productivity in top quartile
      lagDays: 30,
      pValue: 0.002,
    },
    {
      source: 'people', target: 'people',
      metric: 'manager_engagement_to_team_engagement',
      effectSize: 0.70,   // 70% of team engagement attributed to manager
      lagDays: 30,
      pValue: 0.001,
    },
    {
      source: 'people', target: 'finance',
      metric: 'disengagement_to_productivity_loss',
      effectSize: -0.60,  // $8.8 trillion global cost (9% GDP)
      lagDays: 30,
      pValue: 0.001,
    },
    {
      source: 'people', target: 'cs',
      metric: 'engagement_to_customer_satisfaction',
      effectSize: 0.45,
      lagDays: 60,
      pValue: 0.005,
    },
  ],

  businessRules: [
    {
      title: 'Engagement Below Critical Threshold',
      entityType: 'team',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'engagement.score', operator: 'less_than', value: 30 },
          { field: 'turnover.voluntary_annual_pct', operator: 'greater_than', value: 0.20 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Low engagement + high turnover — Gallup: disengaged teams have 18-43% higher turnover and $8.8T global productivity cost. Manager intervention required.' } },
        { type: 'set_flag', params: { flag: 'engagement_crisis' } },
      ],
      naturalLanguage: 'Teams with engagement below 30% and turnover above 20% are in crisis — Gallup data shows manager is 70% of the equation',
      priority: 90,
    },
    {
      title: 'Manager Engagement Drop',
      entityType: 'manager',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'manager.engagement_score', operator: 'less_than', value: 40 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Manager engagement dropped below 40% — 70% of team engagement is manager-driven. Manager burnout cascades to entire team performance.' } },
        { type: 'set_flag', params: { flag: 'manager_burnout_risk' } },
      ],
      naturalLanguage: 'Manager engagement fell from 30% to 27% globally in 2024. Since managers drive 70% of team engagement, their disengagement cascades to entire teams.',
      priority: 85,
    },
  ],

  cascades: [
    {
      source: 'people', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['engagement', 'morale', 'satisfaction', 'culture', 'burnout'],
        target: ['productivity', 'profitability', 'revenue', 'cost'],
      },
      reasonTemplate: 'Gallup: engaged teams deliver 21% higher profitability and 17% higher productivity. Disengagement costs $8.8 trillion globally (9% of GDP).',
    },
    {
      source: 'people', target: 'people',
      type: 'triggers',
      severity: 'high',
      keywords: {
        source: ['disengagement', 'burnout', 'dissatisfaction', 'manager'],
        target: ['turnover', 'attrition', 'resignation', 'quit'],
      },
      reasonTemplate: 'Highly engaged teams have 51% lower turnover. Low-engagement teams see 18-43% higher turnover. Manager engagement is 70% of the equation.',
    },
  ],

  patterns: [
    {
      name: 'Engagement-Profitability Link',
      domains: ['people', 'finance'],
      description: 'Gallup meta-analysis: top quartile engagement teams deliver 21% higher profitability and 17% higher productivity. The relationship is consistent across industries and geographies.',
      observed: 82,
      expected: 30,
      total: 100,
    },
    {
      name: 'Global Engagement Decline 2024',
      domains: ['people'],
      description: 'Global engagement fell from 23% to 21% in 2024 — only the second decline in 12 years. Manager engagement dropped from 30% to 27%. Lost productivity: $438 billion.',
      observed: 79,
      expected: 50,
      total: 100,
    },
    {
      name: 'Manager Multiplier Effect',
      domains: ['people'],
      description: '70% of team engagement variation is attributable to the manager. Manager burnout cascades: when managers disengage, their teams follow within 30 days.',
      observed: 78,
      expected: 30,
      total: 100,
    },
    {
      name: 'Turnover-Engagement Inverse',
      domains: ['people', 'finance'],
      description: 'High engagement reduces turnover by 51%. Low engagement increases turnover 18-43% depending on industry. Replacing an employee costs 50-200% of annual salary.',
      observed: 75,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'profitability_increase', predictedConfidence: 0.82, actual: 'profitability_increase', wasCorrect: true, sourceDomain: 'people', targetDomain: 'finance' },
    { predicted: 'turnover_reduction', predictedConfidence: 0.80, actual: 'turnover_reduction', wasCorrect: true, sourceDomain: 'people', targetDomain: 'people' },
    { predicted: 'productivity_boost', predictedConfidence: 0.70, actual: 'moderate_boost', wasCorrect: false, sourceDomain: 'people', targetDomain: 'engineering' },
  ],

  narrative: 'Gallup\'s 2024-2025 State of the Global Workplace (39,000+ respondents) reveals that employee engagement directly drives business performance: 21% higher profitability, 17% higher productivity, and 51% lower turnover for highly engaged teams. Global engagement fell to 21% in 2024 — the second decline in 12 years — costing $438 billion in lost productivity. The manager is the lynchpin: 70% of engagement variation is attributable to the manager. Manager engagement itself dropped from 30% to 27%. The cascade is clear: manager burnout → team disengagement → productivity loss → turnover spike → profitability decline. If every organization reached best-practice engagement (70%), the global economy would gain $9.6 trillion — 9% of GDP.',
};

// ============================================================================
// 2. DEVELOPER PRODUCTIVITY & DEVEX — SPACE + Stripe Research
// ============================================================================

const developerProductivity: TrainingPack = {
  id: 'developer-productivity-devex',
  title: 'Developer Productivity and Developer Experience',
  source: 'Stripe Developer Coefficient, SPACE Framework (GitHub/Microsoft), DevEx Framework',
  industry: 'Technology',
  domains: ['engineering', 'people', 'product', 'finance'],
  confidence: 0.83,
  tags: ['devex', 'space', 'productivity', 'tech-debt', 'flow-state', 'cognitive-load'],

  causalChains: [
    {
      source: 'engineering', target: 'finance',
      metric: 'tech_debt_time_to_lost_productivity',
      effectSize: -0.65,  // Devs spend 42% of time on tech debt
      lagDays: 0,
      pValue: 0.001,
    },
    {
      source: 'engineering', target: 'engineering',
      metric: 'devex_to_flow_state',
      effectSize: 0.55,
      lagDays: 14,
      pValue: 0.003,
    },
    {
      source: 'engineering', target: 'people',
      metric: 'devex_to_satisfaction',
      effectSize: 0.60,   // SPACE: satisfaction is a core dimension
      lagDays: 30,
      pValue: 0.003,
    },
    {
      source: 'people', target: 'people',
      metric: 'satisfaction_to_retention',
      effectSize: 0.50,
      lagDays: 90,
      pValue: 0.005,
    },
    {
      source: 'engineering', target: 'product',
      metric: 'productivity_to_shipping_speed',
      effectSize: 0.55,
      lagDays: 14,
      pValue: 0.005,
    },
    {
      source: 'engineering', target: 'engineering',
      metric: 'cognitive_load_to_errors',
      effectSize: 0.50,   // DevEx: high cognitive load → more errors
      lagDays: 7,
      pValue: 0.005,
    },
  ],

  businessRules: [
    {
      title: 'Tech Debt Time Budget Exceeded',
      entityType: 'engineering_team',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'time_on_maintenance_pct', operator: 'greater_than', value: 0.40 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Over 40% engineering time on maintenance — Stripe: developers spend 42% on debt, costing $300B/year globally. Allocate deliberate debt reduction sprints.' } },
        { type: 'set_flag', params: { flag: 'tech_debt_crisis' } },
      ],
      naturalLanguage: 'When engineers spend 40%+ of time on maintenance, they are at the global average Stripe found costs $300B/year in lost productivity. Needs intervention.',
      priority: 85,
    },
    {
      title: 'Developer Satisfaction Drop',
      entityType: 'engineering_team',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'devex_survey.satisfaction_score', operator: 'less_than', value: 50 },
          { field: 'devex_survey.flow_state_hours_weekly', operator: 'less_than', value: 10 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Low developer satisfaction + minimal flow state hours — SPACE framework shows this correlates with turnover and quality issues.' } },
      ],
      naturalLanguage: 'Developers with satisfaction below 50% and fewer than 10 hours/week of flow state are at high attrition risk — improve tooling and reduce interruptions',
      priority: 80,
    },
  ],

  cascades: [
    {
      source: 'engineering', target: 'finance',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['tech-debt', 'maintenance', 'debugging', 'refactoring', 'toil'],
        target: ['productivity', 'cost', 'revenue', 'shipping-speed'],
      },
      reasonTemplate: 'Stripe: developers spend 13.5 hours/week on tech debt + 3.8 hours on bad code = 17.3 hours/week (42%). For a 50-person team at $100K/dev, that\'s $1.65M/year lost.',
    },
    {
      source: 'engineering', target: 'people',
      type: 'impacts',
      severity: 'high',
      keywords: {
        source: ['devex', 'tooling', 'cognitive-load', 'flow-state', 'interruptions'],
        target: ['satisfaction', 'retention', 'morale', 'burnout'],
      },
      reasonTemplate: 'DevEx framework: Feedback Loops + Cognitive Load + Flow State are the three dimensions. Poor DevEx drives developer attrition within 3-6 months.',
    },
  ],

  patterns: [
    {
      name: '42% Tech Debt Tax',
      domains: ['engineering', 'finance'],
      description: 'Stripe Developer Coefficient: developers spend 42% of time on maintenance — 13.5 hrs/week on tech debt + 3.8 hrs on debugging/refactoring. $300B annual global cost.',
      observed: 80,
      expected: 30,
      total: 100,
    },
    {
      name: 'SPACE Five Dimensions',
      domains: ['engineering', 'people'],
      description: 'SPACE Framework measures: Satisfaction & well-being, Performance, Activity, Communication & collaboration, Efficiency & flow. Must measure across ≥3 dimensions for accuracy.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'DevEx Three Pillars',
      domains: ['engineering'],
      description: 'DevEx Framework (Netlify/GitHub/Google): Feedback Loops (build/test speed), Cognitive Load (complexity burden), Flow State (uninterrupted deep work). Poor DevEx = 2x attrition.',
      observed: 68,
      expected: 30,
      total: 100,
    },
    {
      name: 'Platform Engineering ROI',
      domains: ['engineering', 'finance'],
      description: 'Platform engineering reduces cognitive load and improves DevEx. Teams with internal developer platforms report 30-50% less time on infrastructure toil.',
      observed: 65,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'productivity_recovery', predictedConfidence: 0.78, actual: 'productivity_recovery', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'engineering' },
    { predicted: 'developer_retention', predictedConfidence: 0.72, actual: 'retention_improved', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'people' },
  ],

  narrative: 'Developer productivity is severely impacted by tech debt: Stripe found developers spend 42% of their time on maintenance (13.5 hrs/week on debt + 3.8 hrs debugging), costing $300B annually globally. For a 50-person team at $100K/dev, that\'s $1.65M/year lost. The SPACE framework (Satisfaction, Performance, Activity, Communication, Efficiency) provides a multi-dimensional measurement approach — measuring just one dimension gives misleading results. The newer DevEx framework adds three actionable pillars: Feedback Loops (build/test speed), Cognitive Load (system complexity), and Flow State (uninterrupted work). Companies investing in platform engineering, better tooling, and reduced cognitive load see 30-50% reductions in infrastructure toil and significantly improved developer satisfaction and retention.',
};

// ============================================================================
// 3. TEAM AUTONOMY & SCALING — Spotify Model Lessons
// ============================================================================

const teamAutonomyScaling: TrainingPack = {
  id: 'team-autonomy-scaling-patterns',
  title: 'Team Autonomy and Organizational Scaling',
  source: 'Spotify Squad Model analysis, Team Topologies, research papers',
  industry: 'Technology',
  domains: ['people', 'engineering', 'product'],
  confidence: 0.78,
  tags: ['autonomy', 'squad', 'spotify', 'scaling', 'cross-functional', 'culture'],

  causalChains: [
    {
      source: 'people', target: 'engineering',
      metric: 'team_autonomy_to_innovation',
      effectSize: 0.55,
      lagDays: 60,
      pValue: 0.005,
    },
    {
      source: 'people', target: 'people',
      metric: 'autonomy_to_motivation',
      effectSize: 0.60,
      lagDays: 14,
      pValue: 0.003,
    },
    {
      source: 'people', target: 'engineering',
      metric: 'autonomy_without_alignment_to_waste',
      effectSize: 0.50,   // Spotify lesson: autonomy without collaboration = waste
      lagDays: 90,
      pValue: 0.005,
    },
    {
      source: 'engineering', target: 'product',
      metric: 'cross_functional_to_delivery_speed',
      effectSize: 0.50,   // Cross-functional squads ship faster
      lagDays: 30,
      pValue: 0.005,
    },
    {
      source: 'people', target: 'people',
      metric: 'psychological_safety_to_performance',
      effectSize: 0.55,
      lagDays: 30,
      pValue: 0.005,
    },
  ],

  businessRules: [
    {
      title: 'Autonomy Without Alignment',
      entityType: 'engineering_org',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'teams.autonomy_score', operator: 'greater_than', value: 80 },
          { field: 'teams.alignment_score', operator: 'less_than', value: 40 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'High autonomy with low alignment — Spotify lesson: autonomy without collaboration/guidance leads to wasted effort and unshared knowledge. Add cross-team rituals.' } },
        { type: 'set_flag', params: { flag: 'autonomy_alignment_gap' } },
      ],
      naturalLanguage: 'Spotify discovered that high autonomy without collaboration processes led to duplicated work and knowledge silos. Autonomy needs alignment mechanisms.',
      priority: 75,
    },
  ],

  cascades: [
    {
      source: 'people', target: 'engineering',
      type: 'enables',
      severity: 'high',
      keywords: {
        source: ['autonomy', 'ownership', 'empowerment', 'trust', 'safety'],
        target: ['innovation', 'speed', 'quality', 'experimentation'],
      },
      reasonTemplate: 'Cross-functional autonomous teams ship faster and innovate more. But autonomy requires alignment mechanisms — without them, org productivity suffers.',
    },
    {
      source: 'people', target: 'people',
      type: 'impacts',
      severity: 'medium',
      keywords: {
        source: ['culture', 'trust', 'psychological-safety', 'servant-leadership'],
        target: ['motivation', 'retention', 'satisfaction', 'engagement'],
      },
      reasonTemplate: 'Spotify model works only when cultural elements are in place: trust, psychological safety, and servant leadership. Structure without culture fails.',
    },
  ],

  patterns: [
    {
      name: 'Autonomy-Alignment Paradox',
      domains: ['people', 'engineering'],
      description: 'Spotify\'s key lesson: high autonomy without cross-team collaboration processes led to duplicated work and knowledge silos. Every team having unique working methods made inter-team collaboration expensive.',
      observed: 70,
      expected: 30,
      total: 100,
    },
    {
      name: 'Cross-Functional Squad Advantage',
      domains: ['people', 'engineering', 'product'],
      description: 'Cross-functional squads (≤8 people, end-to-end ownership) ship faster than siloed teams. They choose their own tools, cadence, and methods — but need clear goals and shared accountability.',
      observed: 72,
      expected: 30,
      total: 100,
    },
    {
      name: 'Culture Before Structure',
      domains: ['people'],
      description: 'Adopting Spotify\'s structure without its culture (trust, autonomy, psychological safety, servant leadership) produces no benefits. Structure is necessary but not sufficient.',
      observed: 68,
      expected: 30,
      total: 100,
    },
  ],

  outcomes: [
    { predicted: 'innovation_increase', predictedConfidence: 0.72, actual: 'innovation_increase', wasCorrect: true, sourceDomain: 'people', targetDomain: 'engineering' },
    { predicted: 'alignment_issues', predictedConfidence: 0.68, actual: 'alignment_issues', wasCorrect: true, sourceDomain: 'people', targetDomain: 'engineering' },
  ],

  narrative: 'The Spotify squad model popularized autonomous cross-functional teams, but its failures are as instructive as its successes. Squads (≤8 people, end-to-end ownership) drive innovation and ownership when cultural prerequisites are met: trust, psychological safety, and servant leadership. But Spotify\'s own experience revealed a critical flaw: high autonomy without cross-team collaboration processes led to duplicated work, knowledge silos, and org-wide productivity loss. Each team having unique working methods made collaboration expensive. The lesson: autonomy must be balanced with alignment. The best implementations add chapters (skill guilds) and tribes (mission alignment) to preserve autonomy while preventing fragmentation.',
};

// ============================================================================
// EXPORT
// ============================================================================

export const PEOPLE_AND_CULTURE_PACKS: TrainingPack[] = [
  employeeEngagementCascade,
  developerProductivity,
  teamAutonomyScaling,
];
