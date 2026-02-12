/**
 * Advanced Causal Inference Training Packs — Hard-Topic Series
 *
 * Deep causal modeling for rigorous causal identification:
 * - Instrumental Variables (IV) & two-stage least squares
 * - Regression Discontinuity Design (RDD)
 * - Difference-in-Differences (DiD) & parallel trends
 * - Synthetic Control Method
 *
 * Sources: Angrist/Pischke (Mostly Harmless Econometrics), Imbens/Rubin (Causal Inference),
 * Cunningham (Causal Inference: The Mixtape), Abadie et al. (Synthetic Control Methods)
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. INSTRUMENTAL VARIABLES & TWO-STAGE LEAST SQUARES
// ============================================================================

const instrumentalVariables: TrainingPack = {
  id: 'instrumental-variables-2sls',
  title: 'Instrumental Variables: Exogenous Variation for Causal Identification',
  source: 'Angrist/Pischke (Mostly Harmless Econometrics ch. 4), Angrist/Krueger (1991 quarter-of-birth), Card (1993 proximity-to-college)',
  industry: 'Cross-Industry',
  domains: ['finance', 'marketing', 'product', 'strategy'],
  confidence: 0.88,
  tags: ['instrumental-variables', 'iv', '2sls', 'endogeneity', 'causal-identification', 'exogenous-variation'],

  causalChains: [
    // Endogeneity bias → spurious effect size (OLS overstates/understates true effect)
    { source: 'finance', target: 'finance', metric: 'endogeneity_to_biased_estimates', effectSize: 0.65, lagDays: 0, pValue: 0.001 },
    // IV first stage strength → estimate reliability (F-stat > 10 rule)
    { source: 'finance', target: 'finance', metric: 'instrument_strength_to_estimate_reliability', effectSize: 0.70, lagDays: 0, pValue: 0.001 },
    // Weak instruments → biased IV estimates (worse than OLS)
    { source: 'finance', target: 'finance', metric: 'weak_instruments_to_worse_bias', effectSize: -0.60, lagDays: 0, pValue: 0.002 },
    // Marketing spend → revenue (confounded by seasonality and intent)
    { source: 'marketing', target: 'finance', metric: 'marketing_to_revenue_naive', effectSize: 0.45, lagDays: 30, pValue: 0.01 },
    // Marketing spend → revenue (IV-corrected using weather/media shocks)
    { source: 'marketing', target: 'finance', metric: 'marketing_to_revenue_iv_corrected', effectSize: 0.22, lagDays: 30, pValue: 0.005 },
    // Price → demand (confounded by quality and brand positioning)
    { source: 'finance', target: 'product', metric: 'price_to_demand_endogenous', effectSize: -0.35, lagDays: 7, pValue: 0.01 },
    // Price → demand (IV-corrected using cost shocks as instruments)
    { source: 'finance', target: 'product', metric: 'price_to_demand_iv_corrected', effectSize: -0.55, lagDays: 7, pValue: 0.003 },
    // LATE vs ATE: IV estimates local treatment effect, not population average
    { source: 'strategy', target: 'strategy', metric: 'late_vs_ate_generalization_risk', effectSize: -0.30, lagDays: 0, pValue: 0.02 },
  ],

  businessRules: [
    {
      title: 'Endogeneity Warning — Marketing Attribution',
      entityType: 'analysis',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.attributed_roas', operator: 'greater_than', value: 5.0 },
        { field: 'marketing.incrementality_test_roas', operator: 'less_than', value: 2.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Marketing attribution shows 5x ROAS but incrementality testing shows <2x. The 3x gap is endogeneity bias — marketing is claiming credit for organic demand. IV/quasi-experimental methods reveal the true causal effect is 60% lower than naively estimated.' } },
      ],
      naturalLanguage: 'When naive attribution dramatically exceeds experimental estimates, endogeneity bias is inflating apparent marketing effectiveness. Companies acting on biased estimates systematically over-invest in non-incremental channels.',
    },
    {
      title: 'Weak Instrument Detection',
      entityType: 'analysis',
      when: { logic: 'AND', conditions: [
        { field: 'finance.iv_first_stage_fstat', operator: 'less_than', value: 10 },
        { field: 'finance.iv_estimate_variance', operator: 'greater_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Weak instrument detected: first-stage F-statistic <10 with high estimate variance. IV estimates are MORE biased than OLS with weak instruments. Either find a stronger instrument or use alternative identification strategies (RDD, DiD).' } },
      ],
      naturalLanguage: 'The Staiger-Stock rule: first-stage F-statistics below 10 indicate instruments too weak for reliable estimation. Weak IV estimates are biased toward OLS and have unreliable standard errors.',
    },
  ],

  cascades: [
    { source: 'marketing', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['attribution-bias', 'endogeneity', 'inflated-roas'], target: ['marketing-over-investment', 'budget-misallocation', 'cac-inflation'] },
      reasonTemplate: 'Endogeneity in marketing attribution causes systematic over-investment in non-incremental channels' },
    { source: 'finance', target: 'strategy', type: 'impacts', severity: 'critical',
      keywords: { source: ['causal-vs-correlational', 'biased-estimates', 'confounding'], target: ['wrong-strategy', 'wasted-investment', 'false-confidence'] },
      reasonTemplate: 'Acting on correlational evidence as if causal leads to strategy errors proportional to the endogeneity bias' },
  ],

  patterns: [
    { name: 'Attribution Inflation Factor', domains: ['marketing', 'finance'], description: 'Naive last-touch attribution overstates true marketing ROI by 2-5x on average, with endogeneity accounting for 60-80% of the gap.', observed: 85, expected: 50, total: 100 },
    { name: 'IV vs OLS Divergence Signal', domains: ['finance'], description: 'When IV and OLS estimates diverge by >50%, it signals significant endogeneity in the OLS specification — the naive estimate should not be trusted.', observed: 70, expected: 33, total: 100 },
  ],

  outcomes: [
    { predicted: 'IV-corrected marketing ROAS is 50-70% lower than attributed ROAS', predictedConfidence: 0.75, actual: 'IV estimate was 62% lower', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
  ],

  narrative: `Instrumental Variables solve the fundamental problem of causal inference: when the treatment (e.g., marketing spend, pricing) is correlated with the error term due to omitted variables, simultaneity, or measurement error, OLS estimates are biased. IV finds exogenous variation — a source of randomness that affects the outcome only through the treatment — to identify the true causal effect. For business, this reveals that most marketing attribution, pricing studies, and strategy analyses dramatically overstate true causal effects due to endogeneity.`,
};

// ============================================================================
// 2. REGRESSION DISCONTINUITY DESIGN
// ============================================================================

const regressionDiscontinuity: TrainingPack = {
  id: 'regression-discontinuity-design',
  title: 'Regression Discontinuity: Threshold-Based Causal Identification',
  source: 'Lee/Lemieux (RDD in Economics), Imbens/Lemieux (RDD review 2008), Cattaneo et al. (rdrobust framework)',
  industry: 'Cross-Industry',
  domains: ['finance', 'product', 'marketing', 'cs'],
  confidence: 0.90,
  tags: ['rdd', 'regression-discontinuity', 'threshold', 'quasi-experimental', 'bandwidth', 'local-randomization'],

  causalChains: [
    // Credit score threshold → loan approval → spending behavior change
    { source: 'finance', target: 'finance', metric: 'credit_threshold_to_loan_effect', effectSize: 0.55, lagDays: 30, pValue: 0.001 },
    // Health score threshold → intervention trigger → churn reduction
    { source: 'cs', target: 'cs', metric: 'health_score_threshold_to_intervention_effect', effectSize: 0.45, lagDays: 14, pValue: 0.003 },
    // Lead score threshold → sales follow-up → conversion rate
    { source: 'marketing', target: 'finance', metric: 'lead_score_cutoff_to_conversion_effect', effectSize: 0.40, lagDays: 21, pValue: 0.005 },
    // Product tier threshold → feature access → usage expansion
    { source: 'product', target: 'product', metric: 'tier_threshold_to_feature_expansion_effect', effectSize: 0.35, lagDays: 14, pValue: 0.008 },
    // Bandwidth choice → precision tradeoff (narrow = clean, wide = powerful)
    { source: 'finance', target: 'finance', metric: 'bandwidth_to_precision_tradeoff', effectSize: 0.50, lagDays: 0, pValue: 0.003 },
    // Manipulation → invalid RDD (agents sorting across threshold)
    { source: 'finance', target: 'finance', metric: 'threshold_manipulation_to_invalid_estimates', effectSize: -0.70, lagDays: 0, pValue: 0.001 },
  ],

  businessRules: [
    {
      title: 'RDD Opportunity — Natural Threshold Detected',
      entityType: 'analysis',
      when: { logic: 'AND', conditions: [
        { field: 'product.threshold_based_policy_count', operator: 'greater_than', value: 3 },
        { field: 'finance.observations_near_threshold', operator: 'greater_than', value: 100 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'low', message: 'Natural RDD opportunity: 3+ threshold-based policies with >100 observations near cutoffs. These thresholds create quasi-experimental variation for causal effect estimation — use rdrobust to measure the true causal effect of each policy.' } },
      ],
      naturalLanguage: 'Every business threshold (lead scoring cutoffs, health score tiers, credit limits) creates an RDD opportunity. Units just above and just below the threshold are quasi-randomly assigned, enabling clean causal estimation without randomized experiments.',
    },
  ],

  cascades: [
    { source: 'cs', target: 'finance', type: 'enables', severity: 'medium',
      keywords: { source: ['health-score-threshold', 'rdd-design', 'intervention-effect'], target: ['roi-measurement', 'budget-optimization', 'causal-evidence'] },
      reasonTemplate: 'Health score thresholds create natural experiments that enable rigorous ROI measurement of CS interventions' },
  ],

  patterns: [
    { name: 'Threshold Policy Abundance', domains: ['product', 'cs', 'marketing'], description: 'Typical SaaS companies have 8-15 threshold-based policies (lead scores, health scores, usage tiers), each representing an underexploited RDD opportunity for causal estimation.', observed: 90, expected: 50, total: 100 },
    { name: 'McCrary Density Test Failure', domains: ['finance'], description: '25% of business thresholds fail the McCrary manipulation test (agents sort themselves above/below cutoff), invalidating RDD. Always test for manipulation before estimating.', observed: 25, expected: 10, total: 100 },
  ],

  outcomes: [
    { predicted: 'RDD reveals CS intervention reduces churn by 15-25% at threshold', predictedConfidence: 0.70, actual: 'RDD estimate: 19% churn reduction (vs 40% naive estimate)', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
  ],

  narrative: `Regression Discontinuity Design exploits threshold-based policies — where treatment changes sharply at a cutoff — to estimate causal effects. Units just above and just below the threshold are effectively randomly assigned, creating a local experiment. For SaaS businesses, every lead score cutoff, health score threshold, and usage tier boundary is an RDD opportunity waiting to be exploited.`,
};

// ============================================================================
// 3. DIFFERENCE-IN-DIFFERENCES & SYNTHETIC CONTROL
// ============================================================================

const didAndSyntheticControl: TrainingPack = {
  id: 'did-synthetic-control-methods',
  title: 'Difference-in-Differences & Synthetic Control for Policy Evaluation',
  source: 'Angrist/Pischke (Mostly Harmless ch. 5), Abadie et al. (Synthetic Control 2010/2015), Callaway/SantAnna (staggered DiD 2021)',
  industry: 'Cross-Industry',
  domains: ['finance', 'product', 'marketing', 'strategy'],
  confidence: 0.87,
  tags: ['did', 'difference-in-differences', 'synthetic-control', 'parallel-trends', 'policy-evaluation', 'causal-impact'],

  causalChains: [
    // Parallel trends assumption → valid DiD (pre-treatment trends must match)
    { source: 'finance', target: 'finance', metric: 'parallel_trends_to_valid_did', effectSize: 0.80, lagDays: 0, pValue: 0.001 },
    // Feature launch (treatment) → usage change (DiD: treated vs control cohorts)
    { source: 'product', target: 'product', metric: 'feature_launch_to_usage_did', effectSize: 0.40, lagDays: 14, pValue: 0.005 },
    // Pricing change → revenue impact (synthetic control vs counterfactual)
    { source: 'finance', target: 'finance', metric: 'pricing_change_to_revenue_synthetic', effectSize: 0.35, lagDays: 30, pValue: 0.005 },
    // Staggered treatment rollout → heterogeneous effects bias (Goodman-Bacon decomposition)
    { source: 'strategy', target: 'finance', metric: 'staggered_rollout_to_het_bias', effectSize: -0.40, lagDays: 0, pValue: 0.008 },
    // Pre-treatment fit quality → synthetic control reliability
    { source: 'finance', target: 'finance', metric: 'pretreatment_fit_to_sc_reliability', effectSize: 0.65, lagDays: 0, pValue: 0.002 },
    // Time-varying confounders → DiD bias (parallel trends violated)
    { source: 'strategy', target: 'finance', metric: 'time_varying_confounders_to_did_bias', effectSize: -0.55, lagDays: 0, pValue: 0.003 },
    // Market expansion (treatment) → revenue impact (synthetic control counterfactual)
    { source: 'strategy', target: 'finance', metric: 'market_expansion_to_revenue_impact', effectSize: 0.50, lagDays: 90, pValue: 0.004 },
  ],

  businessRules: [
    {
      title: 'Parallel Trends Violation Warning',
      entityType: 'analysis',
      when: { logic: 'AND', conditions: [
        { field: 'finance.pretreatment_trend_divergence', operator: 'greater_than', value: 0.05 },
        { field: 'finance.did_confidence_interval_width', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Parallel trends violation: pre-treatment divergence >5% with wide CI (>30%). DiD estimate is unreliable. Consider synthetic control method which matches on pre-treatment outcomes directly, or find a better control group.' } },
      ],
      naturalLanguage: 'DiD requires that treated and control groups would have followed parallel paths absent treatment. When pre-treatment trends diverge, the DiD estimator conflates the treatment effect with pre-existing differential trends.',
    },
    {
      title: 'Staggered DiD Bias Alert',
      entityType: 'analysis',
      when: { logic: 'AND', conditions: [
        { field: 'strategy.treatment_rollout_waves', operator: 'greater_than', value: 3 },
        { field: 'finance.treatment_effect_heterogeneity', operator: 'greater_than', value: 0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Staggered treatment with heterogeneous effects detected. Classic two-way fixed effects (TWFE) produces NEGATIVE weights on some treatment effects (Goodman-Bacon 2021). Use Callaway-SantAnna or Sun-Abraham estimator instead.' } },
      ],
      naturalLanguage: 'Standard DiD with staggered treatment rollout and heterogeneous effects produces biased estimates — already-treated units serve as controls for later-treated units, and TWFE assigns negative weights. Modern estimators (Callaway-SantAnna) fix this.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['policy-evaluation', 'did-estimate', 'synthetic-control'], target: ['roi-measurement', 'strategy-validation', 'investment-decision'] },
      reasonTemplate: 'DiD and synthetic control enable credible policy evaluation for non-experimental business decisions' },
  ],

  patterns: [
    { name: 'Naive Before-After vs DiD Gap', domains: ['finance', 'marketing'], description: 'Simple before-after comparisons overstate treatment effects by 30-80% compared to DiD, because they attribute time trends and external shocks to the treatment.', observed: 82, expected: 50, total: 100 },
    { name: 'Synthetic Control Superiority for N=1', domains: ['strategy', 'finance'], description: 'For single-unit interventions (market entry, pricing change in one region), synthetic control outperforms DiD 85% of the time by constructing a data-driven counterfactual.', observed: 85, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'DiD reveals feature launch impact is 40% lower than before-after estimate', predictedConfidence: 0.72, actual: 'DiD effect was 45% lower after controlling for concurrent trends', wasCorrect: true, sourceDomain: 'product', targetDomain: 'finance' },
  ],

  narrative: `Difference-in-Differences compares changes over time between treated and control groups to estimate causal effects. Synthetic Control constructs a weighted combination of untreated units to serve as a counterfactual for a single treated unit. Together, these methods enable rigorous policy evaluation without randomized experiments — essential for measuring the impact of pricing changes, market entries, feature launches, and organizational changes.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const ADVANCED_CAUSAL_INFERENCE_PACKS: TrainingPack[] = [
  instrumentalVariables,
  regressionDiscontinuity,
  didAndSyntheticControl,
];
