/**
 * Data Science & Analytics Training Packs
 *
 * Deep data and analytics knowledge:
 * - Data-Driven Decision Making
 * - Experimentation Culture & A/B Testing
 * - Data Quality & Trust
 * - MLOps & Production ML Readiness
 *
 * Sources: Google data culture research, Optimizely experimentation, Gartner D&A
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. DATA-DRIVEN DECISIONS
// ============================================================================

const dataDrivenDecisions: TrainingPack = {
  id: 'data-driven-decision-making',
  title: 'Data-Driven Decision Making & Analytics Maturity',
  source: 'McKinsey Data-Driven Organizations, Gartner D&A Maturity Model, MIT CDOIQ',
  industry: 'Cross-Industry',
  domains: ['engineering', 'strategy', 'finance'],
  confidence: 0.82,
  tags: ['data-driven', 'analytics', 'bi', 'kpi', 'dashboards', 'data-warehouse'],

  causalChains: [
    { source: 'engineering', target: 'strategy', metric: 'analytics_maturity_to_decision_quality', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    { source: 'strategy', target: 'finance', metric: 'data_driven_culture_to_revenue_growth', effectSize: 0.45, lagDays: 90, pValue: 0.005 },
    { source: 'engineering', target: 'finance', metric: 'data_warehouse_to_reporting_efficiency', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    { source: 'engineering', target: 'product', metric: 'etl_reliability_to_data_freshness', effectSize: 0.45, lagDays: 7, pValue: 0.005 },
    { source: 'strategy', target: 'strategy', metric: 'kpi_framework_to_strategic_alignment', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    { source: 'engineering', target: 'strategy', metric: 'self_serve_analytics_to_time_to_insight', effectSize: -0.45, lagDays: 14, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Analytics Maturity Gap',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.analytics_maturity_level', operator: 'less_than', value: 3 },
        { field: 'finance.revenue', operator: 'greater_than', value: 5000000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Revenue > $5M with analytics maturity below level 3/5. Data-driven organizations are 23x more likely to acquire customers, 6x more likely to retain them. Invest in data warehouse, KPI frameworks, and self-serve BI.' } },
      ],
      naturalLanguage: 'Companies with $5M+ revenue but immature analytics capabilities miss the 23x customer acquisition and 6x retention advantage that data-driven competitors enjoy.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['data', 'analytics', 'warehouse', 'dashboard', 'kpi'], target: ['revenue', 'efficiency', 'growth', 'decision'] },
      reasonTemplate: 'McKinsey found data-driven organizations are 23x more likely to acquire customers, 6x more likely to retain them, and 19x more likely to be profitable. The modern data stack (ELT, cloud warehouse, BI tools) makes this accessible to mid-market companies.' },
  ],

  patterns: [
    { name: 'Analytics Maturity Curve', domains: ['engineering', 'strategy'], description: 'Analytics maturity follows a 5-stage curve: (1) Descriptive (what happened), (2) Diagnostic (why), (3) Predictive (what will happen), (4) Prescriptive (what to do), (5) Autonomous (self-optimizing). Most companies are stuck at stage 1-2. Stage 3+ delivers exponential ROI.', observed: 79, expected: 30, total: 100 },
    { name: 'Modern Data Stack ROI', domains: ['engineering', 'finance'], description: 'The modern data stack (Fivetran/Airbyte for ELT, Snowflake/BigQuery for warehouse, dbt for transformations, Looker/Metabase for BI) reduces time-to-insight from weeks to hours. Companies adopting this stack see 40-60% faster reporting cycles.', observed: 76, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'decision_quality_improvement', predictedConfidence: 0.75, actual: 'decisions_improved', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'strategy' },
    { predicted: 'revenue_attribution', predictedConfidence: 0.68, actual: 'attribution_improved', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'finance' },
  ],

  narrative: 'Data-driven decision making is the foundation of competitive advantage in the digital era. McKinsey research shows data-driven organizations outperform peers by 23x in customer acquisition and 6x in retention. The key is not just collecting data but building a culture where decisions are made based on evidence rather than intuition. The modern data stack has democratized analytics: cloud data warehouses, ELT pipelines, semantic layers, and self-serve BI tools make it possible for any company to build a world-class analytics capability. KPI frameworks (OKRs, balanced scorecards) ensure analytics effort aligns with strategic priorities.',
};

// ============================================================================
// 2. EXPERIMENTATION CULTURE & A/B TESTING
// ============================================================================

const experimentationCulture: TrainingPack = {
  id: 'experimentation-culture-ab-testing',
  title: 'Experimentation Culture, A/B Testing & Statistical Rigor',
  source: 'Optimizely experimentation reports, Booking.com testing at scale, Ron Kohavi research',
  industry: 'Technology',
  domains: ['product', 'engineering', 'marketing'],
  confidence: 0.81,
  tags: ['ab-testing', 'experimentation', 'statistical-significance', 'mde', 'multivariate'],

  causalChains: [
    { source: 'product', target: 'finance', metric: 'ab_testing_to_conversion_optimization', effectSize: 0.50, lagDays: 14, pValue: 0.003 },
    { source: 'engineering', target: 'product', metric: 'experimentation_platform_to_test_velocity', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    { source: 'product', target: 'product', metric: 'test_volume_to_compound_improvement', effectSize: 0.45, lagDays: 90, pValue: 0.005 },
    { source: 'product', target: 'strategy', metric: 'data_from_experiments_to_product_strategy', effectSize: 0.40, lagDays: 30, pValue: 0.005 },
    { source: 'engineering', target: 'product', metric: 'feature_flags_to_safe_deployment', effectSize: 0.45, lagDays: 7, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Experimentation Velocity Too Low',
      entityType: 'product_team',
      when: { logic: 'AND', conditions: [
        { field: 'product.experiments_per_month', operator: 'less_than', value: 5 },
        { field: 'product.monthly_active_users', operator: 'greater_than', value: 10000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Less than 5 experiments/month with 10K+ MAU. Booking.com runs 1,000+ experiments simultaneously. Each experiment is a learning opportunity. Companies running 10+ experiments/month see 2-3x faster product improvement.' } },
      ],
      naturalLanguage: 'Products with sufficient traffic but low experimentation velocity are leaving conversion and engagement improvements on the table.',
      priority: 70,
    },
  ],

  cascades: [
    { source: 'product', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['experiment', 'ab-test', 'hypothesis', 'variant', 'control'], target: ['conversion', 'revenue', 'optimization', 'growth'] },
      reasonTemplate: 'Experimentation compounds: each successful test improves metrics by 1-5%. Running 50+ experiments per year compounds to 20-50% annual improvement. Google runs 10,000+ experiments annually, each one a data point that informs product strategy.' },
  ],

  patterns: [
    { name: 'Experimentation Compound Effect', domains: ['product', 'finance'], description: 'Individual A/B tests yield small gains (1-5% improvements), but they compound. Running 50+ experiments/year at a 33% win rate with 3% average lift compounds to 20-50% annual improvement in key metrics.', observed: 78, expected: 30, total: 100 },
    { name: 'Statistical Rigor Requirements', domains: ['product', 'engineering'], description: 'Proper A/B testing requires: (1) pre-determined sample size (power analysis), (2) minimum detectable effect (MDE), (3) 95% confidence level, (4) no peeking, (5) guard rails for revenue metrics. Peeking inflates false positive rates from 5% to 30%+.', observed: 75, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'conversion_optimization', predictedConfidence: 0.76, actual: 'conversion_optimized', wasCorrect: true, sourceDomain: 'product', targetDomain: 'finance' },
    { predicted: 'test_velocity_increase', predictedConfidence: 0.72, actual: 'velocity_increased', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'product' },
  ],

  narrative: 'A culture of experimentation is the hallmark of world-class product organizations. Booking.com, Google, Netflix, and Amazon each run thousands of concurrent experiments. The key insight is that most ideas fail — Bing found that only 10-20% of experiments produce positive results. This means that without testing, most product decisions are wrong. Statistical rigor is critical: premature peeking inflates false positive rates from 5% to 30%+, leading to wrong conclusions. The experimentation flywheel (hypothesis → test → learn → iterate) creates a compound improvement curve that separates data-driven companies from opinion-driven ones.',
};

// ============================================================================
// 3. DATA QUALITY & TRUST
// ============================================================================

const dataQualityTrust: TrainingPack = {
  id: 'data-quality-trust-governance',
  title: 'Data Quality, Data Contracts & Trust Architecture',
  source: 'Gartner Data Quality, Monte Carlo Data Observability, dbt data reliability',
  industry: 'Technology',
  domains: ['engineering', 'strategy', 'product'],
  confidence: 0.80,
  tags: ['data-quality', 'data-contracts', 'observability', 'lineage', 'governance'],

  causalChains: [
    { source: 'engineering', target: 'strategy', metric: 'data_quality_to_decision_trust', effectSize: 0.55, lagDays: 14, pValue: 0.002 },
    { source: 'engineering', target: 'finance', metric: 'data_downtime_to_revenue_impact', effectSize: -0.45, lagDays: 1, pValue: 0.005 },
    { source: 'engineering', target: 'engineering', metric: 'data_observability_to_incident_detection', effectSize: -0.50, lagDays: 1, pValue: 0.003 },
    { source: 'engineering', target: 'product', metric: 'schema_drift_to_dashboard_breakage', effectSize: -0.40, lagDays: 1, pValue: 0.005 },
    { source: 'strategy', target: 'engineering', metric: 'data_governance_to_compliance_readiness', effectSize: 0.45, lagDays: 60, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Data Quality Below Threshold',
      entityType: 'data_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.data_quality_score', operator: 'less_than', value: 0.85 },
        { field: 'engineering.data_incident_count_monthly', operator: 'greater_than', value: 5 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Data quality score < 85% with 5+ incidents/month. Poor data quality costs organizations $12.9M per year on average (Gartner). Implement data observability, data contracts, and automated quality checks.' } },
      ],
      naturalLanguage: 'When data quality drops below 85% and incidents exceed 5 per month, the organization faces trust erosion in analytics and costly downstream errors.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'engineering', target: 'strategy', type: 'blocks', severity: 'high',
      keywords: { source: ['data-quality', 'schema', 'pipeline', 'freshness', 'completeness'], target: ['trust', 'decision', 'report', 'dashboard'] },
      reasonTemplate: 'Poor data quality creates a trust crisis: once stakeholders encounter wrong numbers, they revert to gut-based decisions. Gartner estimates poor data quality costs $12.9M/year on average. Data observability (freshness, volume, schema, distribution, lineage) prevents this.' },
  ],

  patterns: [
    { name: 'Data Trust Erosion Spiral', domains: ['engineering', 'strategy'], description: 'Data trust follows a spiral: one bad dashboard number → stakeholder questions all data → analysts spend 40-60% of time on ad-hoc validation → data team becomes bottleneck → decisions revert to gut instinct. Prevention (quality checks, observability) is 10x cheaper than restoration.', observed: 79, expected: 30, total: 100 },
    { name: 'Data Contract Pattern', domains: ['engineering'], description: 'Data contracts (schema agreements between producers and consumers) prevent 70% of data quality incidents. Like API contracts, they define expected schema, freshness, volume, and quality guarantees before data is consumed downstream.', observed: 74, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'trust_restoration', predictedConfidence: 0.72, actual: 'trust_improved', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'strategy' },
    { predicted: 'incident_reduction', predictedConfidence: 0.74, actual: 'incidents_reduced', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'engineering' },
  ],

  narrative: 'Data quality is the foundation upon which all analytics value rests. Gartner estimates that poor data quality costs organizations an average of $12.9M per year. The five dimensions of data quality — accuracy, completeness, freshness, consistency, and uniqueness — must all be monitored continuously. Data observability (inspired by software observability) detects anomalies in data freshness, volume, schema changes, and distribution shifts. Data contracts between producers and consumers prevent 70% of quality incidents by establishing expectations upfront. The modern data quality stack includes dbt tests, Great Expectations, Monte Carlo, and elementary for comprehensive coverage.',
};

// ============================================================================
// 4. MLOPS & PRODUCTION ML READINESS
// ============================================================================

const mlopsReadiness: TrainingPack = {
  id: 'mlops-production-readiness',
  title: 'MLOps Maturity, Model Monitoring & Production ML',
  source: 'Google MLOps Whitepaper, MLflow documentation, Uber Michelangelo, Airbnb Bighead',
  industry: 'Technology',
  domains: ['engineering', 'product', 'strategy'],
  confidence: 0.79,
  tags: ['mlops', 'model-monitoring', 'feature-store', 'model-drift', 'production-ml'],

  causalChains: [
    { source: 'engineering', target: 'product', metric: 'mlops_maturity_to_model_reliability', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    { source: 'engineering', target: 'finance', metric: 'model_drift_to_prediction_degradation', effectSize: -0.45, lagDays: 30, pValue: 0.005 },
    { source: 'engineering', target: 'engineering', metric: 'feature_store_to_training_efficiency', effectSize: 0.45, lagDays: 14, pValue: 0.005 },
    { source: 'engineering', target: 'product', metric: 'ab_testing_models_to_safe_rollout', effectSize: 0.40, lagDays: 7, pValue: 0.005 },
    { source: 'engineering', target: 'strategy', metric: 'ml_observability_to_model_trust', effectSize: 0.45, lagDays: 14, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Model Drift Not Monitored',
      entityType: 'ml_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.models_in_production', operator: 'greater_than', value: 3 },
        { field: 'engineering.model_monitoring_coverage_pct', operator: 'less_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Over 3 models in production with < 50% monitoring coverage. ML models degrade silently — without monitoring, prediction quality drops 10-30% within 3 months. Implement drift detection, performance monitoring, and automated retraining triggers.' } },
      ],
      naturalLanguage: 'Production ML models without monitoring degrade silently due to data drift, concept drift, and distribution shift, losing 10-30% accuracy within months.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'engineering', target: 'product', type: 'enables', severity: 'high',
      keywords: { source: ['mlops', 'model', 'feature-store', 'pipeline', 'drift'], target: ['prediction', 'recommendation', 'automation', 'intelligence'] },
      reasonTemplate: 'MLOps transforms ML from experiments to reliable production systems. Google\'s MLOps maturity model (Level 0-2) shows that most organizations are at Level 0 (manual). Level 2 (automated ML pipeline with CI/CD and monitoring) reduces model deployment time from months to hours.' },
  ],

  patterns: [
    { name: 'MLOps Maturity Levels', domains: ['engineering'], description: 'Google defines 3 MLOps levels: L0 (manual, notebook-driven), L1 (ML pipeline automation), L2 (CI/CD for ML + monitoring). 87% of ML projects never reach production. The gap between L0 and L2 determines whether ML creates value or just costs.', observed: 77, expected: 30, total: 100 },
    { name: 'Model Drift Detection', domains: ['engineering', 'product'], description: 'ML models degrade through data drift (input distribution shift), concept drift (relationship change), and covariate shift. Without monitoring, models lose 10-30% accuracy within 3 months. Statistical tests (KS test, PSI, JS divergence) detect drift before business impact.', observed: 75, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'model_reliability_improvement', predictedConfidence: 0.73, actual: 'reliability_improved', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'product' },
    { predicted: 'deployment_acceleration', predictedConfidence: 0.70, actual: 'deployment_faster', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'engineering' },
  ],

  narrative: 'MLOps is the practice of deploying and maintaining machine learning models in production reliably and efficiently. The hard truth: 87% of ML projects never reach production (Gartner). The gap between notebook experiments and production systems requires automated pipelines, feature stores, model registries, A/B testing infrastructure, and continuous monitoring. Model drift is the silent killer — input data distributions shift, relationships evolve, and model performance degrades without any obvious errors. Google, Uber (Michelangelo), and Airbnb (Bighead) built internal MLOps platforms to close this gap. Open-source tools (MLflow, Kubeflow, Feast) democratize production ML for smaller teams.',
};

// ============================================================================
// EXPORTS
// ============================================================================

export const DATA_SCIENCE_ANALYTICS_PACKS: TrainingPack[] = [
  dataDrivenDecisions,
  experimentationCulture,
  dataQualityTrust,
  mlopsReadiness,
];
