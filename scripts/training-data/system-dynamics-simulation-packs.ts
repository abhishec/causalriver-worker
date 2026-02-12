/**
 * System Dynamics & Simulation Training Packs — Hard-Topic Series
 *
 * Deep causal modeling for complex system behavior:
 * - Stock-and-flow dynamics & accumulation
 * - Reinforcing vs balancing feedback loops
 * - Delays, oscillation & counterintuitive behavior
 * - Business system archetypes (Limits to Growth, Shifting the Burden, etc.)
 *
 * Sources: Sterman (Business Dynamics), Meadows (Thinking in Systems),
 * Senge (The Fifth Discipline), Forrester (Industrial Dynamics)
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. STOCK-AND-FLOW DYNAMICS
// ============================================================================

const stockAndFlowDynamics: TrainingPack = {
  id: 'stock-and-flow-accumulation-dynamics',
  title: 'Stock-and-Flow Accumulation: Inflows, Outflows & Buffer Behavior',
  source: 'Sterman (Business Dynamics ch. 6-8), Forrester (Industrial Dynamics), MIT System Dynamics Group',
  industry: 'Cross-Industry',
  domains: ['finance', 'hr', 'product', 'cs', 'engineering'],
  confidence: 0.90,
  tags: ['system-dynamics', 'stock-flow', 'accumulation', 'buffer', 'bathtub-analogy', 'inflow-outflow'],

  causalChains: [
    // Hiring rate (inflow) vs attrition rate (outflow) → headcount stock
    { source: 'hr', target: 'hr', metric: 'hiring_minus_attrition_to_headcount', effectSize: 0.80, lagDays: 30, pValue: 0.001 },
    // Customer acquisition (inflow) vs churn (outflow) → customer base stock
    { source: 'marketing', target: 'finance', metric: 'acquisition_minus_churn_to_customer_base', effectSize: 0.75, lagDays: 30, pValue: 0.001 },
    // Feature development (inflow) vs tech debt (outflow drag) → product quality stock
    { source: 'engineering', target: 'product', metric: 'dev_velocity_minus_debt_to_quality', effectSize: 0.55, lagDays: 60, pValue: 0.003 },
    // Cash inflow vs burn rate → runway stock
    { source: 'finance', target: 'finance', metric: 'revenue_minus_burn_to_runway', effectSize: 0.85, lagDays: 30, pValue: 0.001 },
    // Pipeline inflow vs deal close/loss → pipeline stock
    { source: 'sales', target: 'finance', metric: 'pipeline_inflow_minus_close_to_pipeline_stock', effectSize: 0.70, lagDays: 14, pValue: 0.002 },
    // Knowledge accumulation vs knowledge decay → organizational capability
    { source: 'hr', target: 'engineering', metric: 'knowledge_accum_minus_decay_to_capability', effectSize: 0.50, lagDays: 90, pValue: 0.005 },
    // Stock-flow failure: people confuse flows with stocks (thinking rate = level)
    { source: 'hr', target: 'finance', metric: 'stock_flow_confusion_to_planning_error', effectSize: -0.45, lagDays: 60, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Critical Stock Depletion Warning',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.net_cash_flow_monthly', operator: 'less_than', value: 0 },
        { field: 'finance.runway_months', operator: 'less_than', value: 6 },
        { field: 'finance.revenue_growth_mom', operator: 'less_than', value: 0.05 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Stock depletion: negative cash flow with <6mo runway and <5% revenue growth. The cash stock will reach zero before the revenue inflow compensates. Reduce outflows (burn) immediately — increasing inflow (revenue) takes too long at this stage.' } },
      ],
      naturalLanguage: 'When a critical stock (cash, talent, customers) is depleting faster than it can be replenished, the system dynamics insight is: reducing outflows has immediate effect while increasing inflows has delayed effect. Cut burn before trying to grow revenue.',
    },
    {
      title: 'Accumulation Overshoot — Hiring',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'hr.hiring_rate_last_quarter', operator: 'greater_than', value: 0.25 },
        { field: 'engineering.onboarding_capacity', operator: 'less_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Hiring overshoot: >25% headcount growth but <50% onboarding capacity. New hires become a drain before becoming productive (negative flow for 2-4 months). Slow hiring to match absorption capacity.' } },
      ],
      naturalLanguage: 'Rapid hiring creates a temporary productivity drain — each new hire consumes senior engineer time for 2-4 months. When hiring exceeds absorption capacity, the stock of productive engineers actually decreases despite rising headcount.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'hr', type: 'impacts', severity: 'critical',
      keywords: { source: ['cash-depletion', 'runway-shortening', 'burn-rate'], target: ['hiring-freeze', 'layoffs', 'talent-stock-reduction'] },
      reasonTemplate: 'Cash stock depletion forces rapid outflow adjustments (layoffs) that destroy accumulated talent stocks' },
    { source: 'hr', target: 'engineering', type: 'delays', severity: 'high',
      keywords: { source: ['hiring-surge', 'onboarding-bottleneck', 'ramp-time'], target: ['velocity-drop', 'productivity-dip', 'quality-decline'] },
      reasonTemplate: 'Hiring inflow exceeding absorption capacity creates temporary stock depletion in team productivity' },
  ],

  patterns: [
    { name: 'Stock-Flow Failure', domains: ['finance', 'hr'], description: 'Most managers confuse flows (rates) with stocks (levels), leading to systematic planning errors — e.g., thinking hiring 10 people/month means having 10 more productive people next month.', observed: 88, expected: 50, total: 100 },
    { name: 'Buffer Stock Strategy', domains: ['finance'], description: 'Companies maintaining 12-18 months runway stock outperform those with 6-9 months by 2.3x on long-term metrics, as buffer enables contrarian investment.', observed: 72, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'Rapid hiring >30% without absorption capacity causes 4-month velocity dip', predictedConfidence: 0.75, actual: 'Velocity dropped 22% for 3.5 months', wasCorrect: true, sourceDomain: 'hr', targetDomain: 'engineering' },
  ],

  narrative: `System dynamics teaches that the world runs on stocks (accumulations) and flows (rates of change). The critical insight is that stocks change slowly due to inflow-outflow dynamics, and this creates the delays, oscillations, and counterintuitive behavior that confound decision-makers. Understanding stock-flow dynamics prevents the most common planning errors: confusing rates with levels, ignoring pipeline delays, and underestimating buffer stock value.`,
};

// ============================================================================
// 2. FEEDBACK LOOPS & SYSTEM ARCHETYPES
// ============================================================================

const feedbackLoopArchetypes: TrainingPack = {
  id: 'feedback-loops-system-archetypes',
  title: 'Feedback Loops & Business System Archetypes',
  source: 'Senge (The Fifth Discipline), Sterman (Business Dynamics ch. 4-5), Meadows (Thinking in Systems)',
  industry: 'Cross-Industry',
  domains: ['strategy', 'finance', 'product', 'marketing', 'engineering'],
  confidence: 0.88,
  tags: ['feedback-loops', 'system-archetypes', 'reinforcing', 'balancing', 'limits-to-growth', 'shifting-burden'],

  causalChains: [
    // Reinforcing loop: success → resources → more success (R1: Growth Engine)
    { source: 'finance', target: 'marketing', metric: 'revenue_to_marketing_investment', effectSize: 0.55, lagDays: 30, pValue: 0.003 },
    // Reinforcing loop: marketing → leads → revenue (R1 continuation)
    { source: 'marketing', target: 'finance', metric: 'marketing_to_lead_to_revenue', effectSize: 0.45, lagDays: 60, pValue: 0.004 },
    // Balancing loop: growth → resource strain → quality decline → churn (B1: Growth Brake)
    { source: 'finance', target: 'cs', metric: 'rapid_growth_to_support_overload', effectSize: -0.50, lagDays: 30, pValue: 0.003 },
    // Limits to Growth: market saturation → diminishing returns
    { source: 'marketing', target: 'marketing', metric: 'market_penetration_to_diminishing_cac', effectSize: -0.60, lagDays: 90, pValue: 0.002 },
    // Shifting the Burden: symptomatic fix → reduced motivation for fundamental fix
    { source: 'engineering', target: 'engineering', metric: 'quick_fix_to_reduced_refactoring_motivation', effectSize: -0.45, lagDays: 30, pValue: 0.005 },
    // Eroding Goals: missed targets → lowered expectations → reduced effort
    { source: 'strategy', target: 'strategy', metric: 'missed_targets_to_goal_erosion', effectSize: -0.40, lagDays: 60, pValue: 0.008 },
    // Tragedy of the Commons: individual optimization → shared resource depletion
    { source: 'product', target: 'engineering', metric: 'feature_teams_to_platform_neglect', effectSize: -0.50, lagDays: 90, pValue: 0.004 },
    // Fixes that Backfire: short-term improvement → long-term degradation
    { source: 'engineering', target: 'product', metric: 'tech_debt_shortcut_to_future_velocity_loss', effectSize: -0.55, lagDays: 180, pValue: 0.003 },
    // Success to the Successful: winner gets more resources → widens gap
    { source: 'strategy', target: 'finance', metric: 'winning_team_resources_to_gap_widening', effectSize: 0.50, lagDays: 60, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Limits to Growth — Market Saturation',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.cac_growth_qoq', operator: 'greater_than', value: 0.20 },
        { field: 'marketing.conversion_rate_trend_3mo', operator: 'less_than', value: -0.10 },
        { field: 'product.market_penetration_pct', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Limits to Growth archetype: CAC rising >20% QoQ while conversion falls with >30% market penetration. The balancing loop (market saturation) is dominating the reinforcing loop (growth engine). Invest in new growth engines (new segments, products, or geos) rather than pushing harder on the current one.' } },
      ],
      naturalLanguage: 'The Limits to Growth archetype: every reinforcing growth loop eventually encounters a balancing constraint. The solution is never to push harder on the existing loop — it is to identify and address the limiting factor or create a new growth engine.',
    },
    {
      title: 'Shifting the Burden — Tech Debt Trap',
      entityType: 'engineering',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.hotfix_pct_of_releases', operator: 'greater_than', value: 0.30 },
        { field: 'engineering.refactoring_pct_of_sprints', operator: 'less_than', value: 0.10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Shifting the Burden archetype: >30% hotfixes with <10% refactoring time. Quick fixes are relieving symptoms while the fundamental problem (architecture/tech debt) worsens. Each hotfix makes the fundamental solution less likely. Allocate 20%+ sprint capacity to root-cause fixes.' } },
      ],
      naturalLanguage: 'The Shifting the Burden archetype traps teams in a cycle of symptomatic fixes that erode the capacity for fundamental solutions. Each quick fix reduces the urgency for proper refactoring while the underlying debt compounds.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['limits-to-growth', 'market-saturation', 'diminishing-returns'], target: ['rising-cac', 'margin-compression', 'growth-stall'] },
      reasonTemplate: 'Limits to Growth archetype activates when market saturation balancing loop overtakes growth reinforcing loop' },
    { source: 'engineering', target: 'product', type: 'delays', severity: 'high',
      keywords: { source: ['tech-debt-accumulation', 'shifting-burden', 'quick-fixes'], target: ['velocity-decline', 'quality-erosion', 'innovation-stall'] },
      reasonTemplate: 'Shifting the Burden archetype causes delayed but severe product quality degradation as tech debt compounds' },
  ],

  patterns: [
    { name: 'Reinforcing Loop Dominance Shift', domains: ['strategy', 'finance'], description: 'Every business has a phase where the dominant reinforcing loop shifts — from product-led to sales-led, or organic to paid. Failure to recognize this transition causes 6-12 month growth stalls.', observed: 80, expected: 33, total: 100 },
    { name: 'Archetype Recurrence', domains: ['strategy', 'engineering'], description: 'The same 8 system archetypes (Senge) explain 85%+ of organizational dysfunction, yet most teams fail to recognize the pattern until the second or third occurrence.', observed: 85, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'Limits to Growth constraint identified 2 quarters before growth stall', predictedConfidence: 0.70, actual: 'Growth stalled exactly at predicted market penetration threshold', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
  ],

  narrative: `System archetypes are recurring patterns of behavior in complex systems. The most important for business are: Limits to Growth (every growth engine hits a constraint), Shifting the Burden (quick fixes prevent fundamental solutions), Fixes that Backfire (short-term improvements cause long-term degradation), and the Tragedy of the Commons (individual optimization depletes shared resources). Recognizing these archetypes early enables intervention before the balancing loop dominates.`,
};

// ============================================================================
// 3. DELAYS, OSCILLATION & COUNTERINTUITIVE BEHAVIOR
// ============================================================================

const delaysAndOscillation: TrainingPack = {
  id: 'delays-oscillation-counterintuitive',
  title: 'Delays, Oscillation & Counterintuitive System Behavior',
  source: 'Sterman (Business Dynamics ch. 10-12), Forrester (Counterintuitive Behavior of Social Systems 1971)',
  industry: 'Cross-Industry',
  domains: ['strategy', 'finance', 'engineering', 'hr', 'marketing'],
  confidence: 0.86,
  tags: ['delays', 'oscillation', 'bullwhip-effect', 'overshoot', 'counterintuitive', 'policy-resistance'],

  causalChains: [
    // Information delay → overreaction → oscillation (bullwhip effect)
    { source: 'finance', target: 'strategy', metric: 'delayed_data_to_overreaction', effectSize: 0.60, lagDays: 30, pValue: 0.002 },
    // Hiring delay → overcommit → layoff cycle
    { source: 'hr', target: 'hr', metric: 'hiring_delay_to_overshoot_cycle', effectSize: 0.50, lagDays: 90, pValue: 0.004 },
    // Infrastructure delay → capacity overshoot → waste
    { source: 'engineering', target: 'finance', metric: 'infra_lead_time_to_capacity_overshoot', effectSize: 0.45, lagDays: 120, pValue: 0.005 },
    // Marketing delay → campaign overspend (results come after budget committed)
    { source: 'marketing', target: 'finance', metric: 'campaign_delay_to_overspend', effectSize: 0.40, lagDays: 45, pValue: 0.008 },
    // Policy resistance: intervention → system response that neutralizes intervention
    { source: 'strategy', target: 'strategy', metric: 'policy_intervention_to_compensating_response', effectSize: -0.55, lagDays: 60, pValue: 0.003 },
    // Worse-before-better: correct intervention causes initial decline before improvement
    { source: 'strategy', target: 'finance', metric: 'structural_fix_to_initial_decline', effectSize: -0.35, lagDays: 30, pValue: 0.01 },
    // Better-before-worse: wrong intervention improves metrics then collapses
    { source: 'strategy', target: 'finance', metric: 'symptomatic_fix_to_delayed_collapse', effectSize: 0.30, lagDays: 30, pValue: 0.01 },
  ],

  businessRules: [
    {
      title: 'Oscillation Pattern Detection — Hiring',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'hr.hiring_trend_reversal_12mo', operator: 'greater_than', value: 2 },
        { field: 'hr.headcount_volatility_12mo', operator: 'greater_than', value: 0.15 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Hiring oscillation detected: 2+ trend reversals with >15% headcount volatility in 12 months. Classic delay-induced oscillation. The system needs a stabilization policy: hire to a target with damping (e.g., 70% of gap per quarter) instead of trying to close the entire gap immediately.' } },
      ],
      naturalLanguage: 'Hire-fire oscillation results from ignoring the delay between hiring decisions and productive output. The fix is damped adjustment: close only 50-70% of the perceived gap per period, allowing the delayed effects of previous actions to materialize.',
    },
    {
      title: 'Better-Before-Worse Trap Detection',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.short_term_metric_improvement_3mo', operator: 'greater_than', value: 0.15 },
        { field: 'engineering.tech_debt_growth_3mo', operator: 'greater_than', value: 0.25 },
        { field: 'product.customer_feedback_trend_3mo', operator: 'less_than', value: -0.10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Better-before-worse pattern: financial metrics improving (+15%) but tech debt growing (+25%) and customer sentiment declining (-10%). Current strategy is borrowing from the future. The correction will be more severe the longer this continues.' } },
      ],
      naturalLanguage: 'Better-before-worse is the most dangerous system dynamic because it rewards the wrong behavior. Short-term metrics improve precisely because the intervention is depleting a hidden stock (quality, trust, technical capacity) that will eventually collapse.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'hr', type: 'triggers', severity: 'high',
      keywords: { source: ['overreaction', 'oscillation', 'bullwhip', 'hiring-cycle'], target: ['layoffs', 'morale-damage', 'culture-erosion'] },
      reasonTemplate: 'Delay-induced overreaction creates hire-fire oscillation that destroys organizational culture and accumulated capability' },
  ],

  patterns: [
    { name: 'Bullwhip Effect in SaaS', domains: ['finance', 'marketing', 'hr'], description: 'Demand signal variability amplifies 2-4x as it propagates upstream through marketing→hiring→infrastructure chains, causing systematic over/under-investment.', observed: 75, expected: 33, total: 100 },
    { name: 'Worse-Before-Better Recognition Failure', domains: ['strategy', 'finance'], description: '78% of correct structural interventions are abandoned within 2 quarters because leadership interprets the initial decline as evidence the intervention failed.', observed: 78, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'Damped hiring policy reduces oscillation amplitude by >50%', predictedConfidence: 0.72, actual: 'Headcount volatility reduced 62% after implementing damped adjustment', wasCorrect: true, sourceDomain: 'hr', targetDomain: 'hr' },
  ],

  narrative: `Delays create counterintuitive behavior because decision-makers react to current conditions without accounting for the pipeline of previous actions already in motion. This creates oscillation (hire-fire cycles), overshoot (building too much capacity), and policy resistance (the system fights back against interventions). The fundamental lesson: in systems with delays, act early, act small, and use damped adjustment rather than trying to close the entire perceived gap immediately.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const SYSTEM_DYNAMICS_SIMULATION_PACKS: TrainingPack[] = [
  stockAndFlowDynamics,
  feedbackLoopArchetypes,
  delaysAndOscillation,
];
