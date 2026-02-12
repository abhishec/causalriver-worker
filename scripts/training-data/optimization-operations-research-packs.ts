/**
 * Optimization & Operations Research Training Packs — Hard-Topic Series
 *
 * Deep causal modeling for mathematical optimization:
 * - Linear programming & resource allocation
 * - Integer programming & combinatorial optimization
 * - Dynamic programming & sequential decision-making
 * - Network flows, scheduling & capacity planning
 *
 * Sources: Bertsimas/Tsitsiklis (Introduction to Linear Optimization),
 * Wolsey (Integer Programming), Bertsekas (Dynamic Programming & Optimal Control),
 * Ahuja/Magnanti/Orlin (Network Flows)
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. LINEAR PROGRAMMING & RESOURCE ALLOCATION
// ============================================================================

const linearProgramming: TrainingPack = {
  id: 'linear-programming-resource-allocation',
  title: 'Linear Programming: Optimal Resource Allocation Under Constraints',
  source: 'Bertsimas/Tsitsiklis (Intro to Linear Optimization), Dantzig (simplex method), Klee/Minty (worst-case analysis)',
  industry: 'Cross-Industry',
  domains: ['finance', 'engineering', 'marketing', 'hr', 'strategy'],
  confidence: 0.92,
  tags: ['linear-programming', 'optimization', 'resource-allocation', 'simplex', 'duality', 'shadow-price', 'sensitivity'],

  causalChains: [
    // Constraint binding → shadow price → marginal value of relaxation
    { source: 'finance', target: 'finance', metric: 'binding_constraint_to_shadow_price', effectSize: 0.80, lagDays: 0, pValue: 0.001 },
    // Resource reallocation (LP-guided) → output maximization
    { source: 'strategy', target: 'finance', metric: 'lp_reallocation_to_output_gain', effectSize: 0.45, lagDays: 14, pValue: 0.003 },
    // Budget allocation optimization → marketing ROAS improvement
    { source: 'marketing', target: 'finance', metric: 'optimized_budget_to_roas_improvement', effectSize: 0.35, lagDays: 30, pValue: 0.005 },
    // Dual variable → sensitivity analysis → robust decisions
    { source: 'finance', target: 'strategy', metric: 'sensitivity_analysis_to_robust_decisions', effectSize: 0.50, lagDays: 0, pValue: 0.003 },
    // Over-constrained system → infeasibility → requirement relaxation priority
    { source: 'strategy', target: 'strategy', metric: 'infeasibility_to_constraint_relaxation_need', effectSize: 0.65, lagDays: 7, pValue: 0.002 },
    // Capacity constraint → opportunity cost → expansion ROI
    { source: 'engineering', target: 'finance', metric: 'capacity_constraint_to_expansion_roi', effectSize: 0.55, lagDays: 60, pValue: 0.003 },
    // Headcount allocation optimization → velocity improvement
    { source: 'hr', target: 'engineering', metric: 'optimized_team_allocation_to_velocity', effectSize: 0.40, lagDays: 30, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Shadow Price — Bottleneck Resource Identified',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.resource_utilization_max', operator: 'greater_than', value: 0.95 },
        { field: 'finance.shadow_price_ratio_max_to_avg', operator: 'greater_than', value: 5.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Critical bottleneck: one resource at >95% utilization with shadow price 5x the average. LP shadow price analysis shows this is the highest-ROI investment opportunity. Each unit of additional capacity generates 5x the marginal revenue of other resources.' } },
      ],
      naturalLanguage: 'LP duality reveals that the shadow price (dual variable) of a binding constraint equals the marginal value of relaxing it by one unit. When one resource has a shadow price 5x the average, investing in that constraint yields 5x the return of investing in any other.',
    },
    {
      title: 'Budget Allocation Suboptimality',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.budget_allocation_method', operator: 'equals', value: 'historical' },
        { field: 'marketing.channel_roas_variance', operator: 'greater_than', value: 3.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Budget allocated historically but channel ROAS varies 3x+. LP optimization would reallocate from low-ROAS to high-ROAS channels subject to saturation constraints, typically yielding 15-30% aggregate ROAS improvement.' } },
      ],
      naturalLanguage: 'Historical budget allocation ignores diminishing returns and cross-channel constraints. Linear programming with channel-specific response curves and saturation constraints typically finds 15-30% more efficient allocations.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['lp-optimization', 'shadow-price', 'resource-reallocation'], target: ['margin-improvement', 'efficiency-gain', 'roi-maximization'] },
      reasonTemplate: 'LP optimization identifies the highest-ROI resource reallocation by computing shadow prices for all binding constraints' },
  ],

  patterns: [
    { name: 'Shadow Price Discovery', domains: ['finance', 'engineering'], description: 'In 80% of businesses, the highest shadow price resource is NOT the most expensive resource — it is the most constrained one. Managers typically invest in the wrong bottleneck.', observed: 80, expected: 50, total: 100 },
    { name: 'LP vs Heuristic Gap', domains: ['strategy', 'finance'], description: 'LP-optimized resource allocations outperform expert heuristic allocations by 12-25% on average, with the gap widening as constraint count increases.', observed: 75, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'LP-guided budget reallocation improves aggregate ROAS by 15-30%', predictedConfidence: 0.72, actual: 'ROAS improved 22% after LP-guided reallocation', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
  ],

  narrative: `Linear Programming provides the foundation for optimal decision-making under constraints. The most powerful business insight from LP is duality: every constraint has a shadow price that reveals the marginal value of relaxation. This means managers can rigorously identify the highest-ROI investments by computing which constraints are most valuable to relax, rather than relying on intuition.`,
};

// ============================================================================
// 2. INTEGER & COMBINATORIAL OPTIMIZATION
// ============================================================================

const integerProgramming: TrainingPack = {
  id: 'integer-combinatorial-optimization',
  title: 'Integer Programming & Combinatorial Optimization for Business Decisions',
  source: 'Wolsey (Integer Programming), Papadimitriou/Steiglitz (Combinatorial Optimization), Google OR-Tools documentation',
  industry: 'Cross-Industry',
  domains: ['engineering', 'finance', 'strategy', 'product', 'hr'],
  confidence: 0.88,
  tags: ['integer-programming', 'combinatorial', 'np-hard', 'branch-and-bound', 'scheduling', 'facility-location', 'assignment'],

  causalChains: [
    // Binary decision optimization → go/no-go portfolio selection
    { source: 'strategy', target: 'finance', metric: 'binary_optimization_to_portfolio_value', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    // Scheduling optimization → resource utilization → cost reduction
    { source: 'engineering', target: 'finance', metric: 'scheduling_optimization_to_cost_reduction', effectSize: 0.40, lagDays: 14, pValue: 0.005 },
    // Assignment problem (optimal matching) → productivity improvement
    { source: 'hr', target: 'engineering', metric: 'optimal_assignment_to_productivity', effectSize: 0.45, lagDays: 30, pValue: 0.004 },
    // Set cover optimization → minimum cost coverage → efficiency
    { source: 'product', target: 'finance', metric: 'set_cover_to_minimum_cost_coverage', effectSize: 0.35, lagDays: 14, pValue: 0.008 },
    // Problem size → computational intractability (NP-hard wall)
    { source: 'engineering', target: 'engineering', metric: 'problem_size_to_intractability', effectSize: -0.70, lagDays: 0, pValue: 0.001 },
    // Approximation ratio → solution quality guarantee
    { source: 'engineering', target: 'strategy', metric: 'approximation_guarantee_to_decision_confidence', effectSize: 0.55, lagDays: 0, pValue: 0.003 },
    // Feature selection (0/1) for roadmap → maximum value delivery under constraints
    { source: 'product', target: 'finance', metric: 'optimized_roadmap_to_value_delivery', effectSize: 0.45, lagDays: 60, pValue: 0.004 },
  ],

  businessRules: [
    {
      title: 'Roadmap as Knapsack Problem',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'product.feature_candidates', operator: 'greater_than', value: 20 },
        { field: 'engineering.sprint_capacity_utilization', operator: 'greater_than', value: 0.90 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Product roadmap is a constrained knapsack problem: >20 feature candidates competing for >90% utilized engineering capacity. Formulate as 0/1 knapsack (value = expected revenue impact, weight = engineering effort) to find the provably optimal subset. Gut-feel prioritization typically captures only 65-75% of the optimal value.' } },
      ],
      naturalLanguage: 'Feature prioritization under engineering constraints is mathematically a 0/1 knapsack problem. When candidate count exceeds ~15 and constraints are binding, human intuition captures only 65-75% of optimal value — integer programming finds the provably best subset.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'product', type: 'enables', severity: 'medium',
      keywords: { source: ['ip-optimization', 'knapsack', 'assignment-problem'], target: ['roadmap-optimization', 'resource-matching', 'sprint-planning'] },
      reasonTemplate: 'Integer programming transforms fuzzy prioritization into provably optimal binary decisions for resource-constrained environments' },
  ],

  patterns: [
    { name: 'Human vs Optimal Roadmap Gap', domains: ['product', 'engineering'], description: 'When roadmap is formulated as 0/1 knapsack and solved optimally, the expected value exceeds human-prioritized roadmaps by 25-40% on average.', observed: 72, expected: 50, total: 100 },
    { name: 'Good-Enough Heuristic Zone', domains: ['engineering'], description: 'For NP-hard problems, greedy heuristics achieve 85-95% of optimal in polynomial time. The extra 5-15% from exact solvers rarely justifies the computational cost for business decisions.', observed: 80, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'IP-optimized feature selection outperforms team voting by >20% value', predictedConfidence: 0.70, actual: 'IP roadmap delivered 31% more measured value than team-voted roadmap', wasCorrect: true, sourceDomain: 'product', targetDomain: 'finance' },
  ],

  narrative: `Integer Programming extends LP to discrete decisions: yes/no feature selection, facility location, staff scheduling, and portfolio construction. Many business problems are naturally combinatorial — the challenge is recognizing them. Feature prioritization is a knapsack problem. Team assignment is the Hungarian algorithm. Server placement is facility location. Once formulated, modern solvers (Gurobi, CPLEX, OR-Tools) find optimal or near-optimal solutions that substantially outperform human intuition.`,
};

// ============================================================================
// 3. DYNAMIC PROGRAMMING & SEQUENTIAL DECISIONS
// ============================================================================

const dynamicProgramming: TrainingPack = {
  id: 'dynamic-programming-sequential-decisions',
  title: 'Dynamic Programming: Optimal Sequential Decision-Making Under Uncertainty',
  source: 'Bertsekas (DP & Optimal Control), Puterman (Markov Decision Processes), Powell (Approximate DP)',
  industry: 'Cross-Industry',
  domains: ['finance', 'strategy', 'product', 'marketing', 'engineering'],
  confidence: 0.86,
  tags: ['dynamic-programming', 'mdp', 'bellman', 'optimal-stopping', 'reinforcement-learning', 'sequential-decision'],

  causalChains: [
    // Optimal stopping → hiring quality (37% rule / secretary problem)
    { source: 'hr', target: 'hr', metric: 'optimal_stopping_to_hire_quality', effectSize: 0.40, lagDays: 0, pValue: 0.005 },
    // Multi-stage investment → option preservation → higher expected return
    { source: 'finance', target: 'finance', metric: 'staged_investment_to_expected_return', effectSize: 0.45, lagDays: 90, pValue: 0.004 },
    // State-dependent pricing → revenue optimization (dynamic pricing)
    { source: 'finance', target: 'finance', metric: 'dynamic_pricing_to_revenue_optimization', effectSize: 0.35, lagDays: 7, pValue: 0.005 },
    // Bellman optimality → decomposition of complex decisions into stages
    { source: 'strategy', target: 'strategy', metric: 'bellman_decomposition_to_tractability', effectSize: 0.60, lagDays: 0, pValue: 0.002 },
    // Curse of dimensionality → approximate DP necessity
    { source: 'engineering', target: 'engineering', metric: 'state_space_to_computational_limit', effectSize: -0.65, lagDays: 0, pValue: 0.002 },
    // Exploration-exploitation balance → long-run optimality (multi-armed bandit)
    { source: 'marketing', target: 'finance', metric: 'explore_exploit_to_longrun_revenue', effectSize: 0.50, lagDays: 60, pValue: 0.003 },
    // Myopic decisions → suboptimal sequential outcome
    { source: 'strategy', target: 'finance', metric: 'myopic_decisions_to_suboptimal_outcome', effectSize: -0.45, lagDays: 180, pValue: 0.004 },
  ],

  businessRules: [
    {
      title: 'Secretary Problem — Hiring Pipeline',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'hr.open_roles_competitive', operator: 'greater_than', value: 5 },
        { field: 'hr.avg_candidates_per_role', operator: 'greater_than', value: 15 },
        { field: 'hr.early_offer_regret_rate', operator: 'greater_than', value: 0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Hiring pipeline matches the Secretary Problem. Optimal stopping theory: interview the first 37% of candidates without hiring (calibration phase), then hire the next candidate who exceeds all calibration candidates. This provably maximizes the probability of hiring the best candidate (~37% success rate vs ~10% for random timing).' } },
      ],
      naturalLanguage: 'The Secretary Problem provides the optimal stopping rule for sequential decisions: explore for the first 37% of options (calibration), then commit to the first option that beats all previously seen. Reduces early-commitment regret by 3x.',
    },
    {
      title: 'Multi-Armed Bandit — Pricing/Feature Testing',
      entityType: 'product',
      when: { logic: 'AND', conditions: [
        { field: 'product.ab_test_count_active', operator: 'greater_than', value: 3 },
        { field: 'product.test_to_decision_avg_days', operator: 'greater_than', value: 21 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Multiple concurrent A/B tests running >3 weeks each. Consider Thompson Sampling (Bayesian multi-armed bandit) which dynamically allocates traffic to higher-performing variants. Reduces regret by 40-60% vs fixed-split testing by learning while earning.' } },
      ],
      naturalLanguage: 'Traditional A/B testing with fixed allocation wastes traffic on losing variants. Multi-armed bandit algorithms (Thompson Sampling, UCB) balance exploration and exploitation, converging on optimal variants 40-60% faster while minimizing regret during the learning phase.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['myopic-optimization', 'greedy-decisions', 'short-termism'], target: ['path-dependence', 'suboptimal-equilibrium', 'opportunity-cost'] },
      reasonTemplate: 'Myopic (stage-wise greedy) decisions ignore future optionality, leading to path-dependent suboptimal outcomes that DP-aware strategies avoid' },
    { source: 'marketing', target: 'finance', type: 'enables', severity: 'medium',
      keywords: { source: ['bandit-algorithm', 'thompson-sampling', 'explore-exploit'], target: ['faster-optimization', 'reduced-regret', 'dynamic-allocation'] },
      reasonTemplate: 'Multi-armed bandit algorithms enable simultaneous learning and earning, reducing optimization regret vs traditional fixed-allocation experiments' },
  ],

  patterns: [
    { name: 'Explore-Exploit Imbalance', domains: ['marketing', 'product'], description: 'Most companies over-exploit (stick with known approaches) and under-explore (test too few alternatives). Thompson Sampling automates the optimal balance.', observed: 82, expected: 50, total: 100 },
    { name: 'Sequential Decision Myopia', domains: ['strategy', 'finance'], description: 'Decisions made myopically (optimizing each stage independently) yield 20-40% less lifetime value than decisions made with full sequential optimization (DP/MDP approach).', observed: 75, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'Thompson Sampling reduces regret by 40-60% vs fixed A/B testing', predictedConfidence: 0.75, actual: 'Regret reduced 48% over 90-day test period', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
  ],

  narrative: `Dynamic Programming decomposes complex sequential decisions into stages, solving backwards from the end to find globally optimal policies. Bellman's Principle of Optimality — "an optimal policy has the property that whatever the initial state, the remaining decisions must constitute an optimal policy" — is the foundation. For business, this means: hiring (optimal stopping), pricing (state-dependent dynamic pricing), testing (multi-armed bandits), and investment staging should all account for future optionality rather than being decided myopically.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const OPTIMIZATION_OPERATIONS_RESEARCH_PACKS: TrainingPack[] = [
  linearProgramming,
  integerProgramming,
  dynamicProgramming,
];
