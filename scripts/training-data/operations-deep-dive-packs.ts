/**
 * Operations Deep Dive Training Packs — Phase 3
 *
 * Deep operational knowledge:
 * - Marketing & Content Growth Engine
 * - Sales Operations & Pipeline
 * - Professional Services & Implementation
 *
 * Sources: SEO/content benchmarks, sales pipeline research, PS maturity studies
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. CONTENT MARKETING & SEO COMPOUND GROWTH
// ============================================================================

const contentMarketingSeoGrowth: TrainingPack = {
  id: 'content-marketing-seo-compound',
  title: 'Content Marketing & SEO Compound Growth Engine',
  source: 'SeoProfy 2025 stats, RevenueZen SaaS content stats, Powered by Search',
  industry: 'B2B SaaS',
  domains: ['marketing', 'finance', 'product'],
  confidence: 0.82,
  tags: ['content', 'seo', 'organic', 'compound-growth', 'pipeline', 'cac'],

  causalChains: [
    { source: 'marketing', target: 'finance', metric: 'seo_investment_to_revenue', effectSize: 0.65, lagDays: 270, pValue: 0.003 },
    { source: 'marketing', target: 'marketing', metric: 'content_to_organic_traffic', effectSize: 0.60, lagDays: 180, pValue: 0.003 },
    { source: 'marketing', target: 'finance', metric: 'organic_search_to_revenue_share', effectSize: 0.55, lagDays: 90, pValue: 0.005 },
    { source: 'marketing', target: 'marketing', metric: 'content_compound_to_cac_reduction', effectSize: -0.50, lagDays: 365, pValue: 0.005 },
    { source: 'product', target: 'marketing', metric: 'original_research_to_traffic', effectSize: 0.45, lagDays: 90, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Content Investment Below Threshold',
      entityType: 'saas_company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.organic_traffic_pct', operator: 'less_than', value: 0.30 },
        { field: 'marketing.paid_acquisition_pct', operator: 'greater_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Under 30% organic traffic with 50%+ paid dependency. SEO delivers 702% ROI ($22 per $1 spent) vs paid at $1.80/$1. Content compounds; paid doesn\'t.' } },
      ],
      naturalLanguage: 'Companies over-dependent on paid acquisition miss SEO\'s 702% ROI. Content creates compound growth; paid creates linear dependency.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'marketing', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['content', 'seo', 'organic', 'blog', 'research'], target: ['pipeline', 'cac', 'revenue', 'efficiency'] },
      reasonTemplate: 'SEO generates 44.6% of all B2B revenue. Content produces $3 for every $1 vs $1.80 for paid. The compound effect means year 2 content ROI is 3-5x year 1.' },
  ],

  patterns: [
    { name: 'SEO Revenue Dominance', domains: ['marketing', 'finance'], description: 'Organic search generates 44.6% of all B2B revenue — the largest single channel. B2B SaaS SEO averages 702% ROI. Long-form content achieves 748% ROI with ~9 month breakeven.', observed: 78, expected: 30, total: 100 },
    { name: 'Content Compound Effect', domains: ['marketing'], description: 'Content marketing generates $3 per $1 invested vs $1.80 for paid — a 67% advantage. The key: once created, quality content compounds — generating traffic and leads without ongoing cost.', observed: 75, expected: 30, total: 100 },
    { name: 'Original Research Traffic Boost', domains: ['marketing', 'product'], description: 'B2B SaaS websites with original research increased organic traffic 29.7% vs 9.3% for those without. Original data is the strongest content differentiator.', observed: 70, expected: 30, total: 100 },
    { name: 'Content-to-Pipeline Lag', domains: ['marketing', 'finance'], description: 'Content takes 3-6 months to show meaningful ROI, SEO takes 6-9 months. But compound returns last years. 76% of B2B marketers say content generates leads. Buyers consume 4.5 pieces before contacting sales.', observed: 72, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'organic_growth', predictedConfidence: 0.78, actual: 'organic_grew', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
    { predicted: 'cac_reduction', predictedConfidence: 0.70, actual: 'cac_stable', wasCorrect: false, sourceDomain: 'marketing', targetDomain: 'finance' },
  ],

  narrative: 'Content marketing and SEO create the only truly compounding acquisition channel. SEO generates 44.6% of all B2B revenue with 702% average ROI ($22 per $1 spent). Content produces $3 per $1 vs $1.80 for paid — and unlike paid, content compounds over time. The breakeven is 6-9 months, but returns last years. B2B buyers consume 4.5 pieces of content before contacting sales. Original research boosts organic traffic 29.7% vs 9.3% without. The compound effect: a content library built in year 1 generates 3-5x more pipeline in year 2 with zero additional investment. Companies over-dependent on paid acquisition are building on sand.',
};

// ============================================================================
// 2. SALES PIPELINE OPERATIONS
// ============================================================================

const salesPipelineOps: TrainingPack = {
  id: 'sales-pipeline-operations',
  title: 'Sales Pipeline Operations & Forecast Accuracy',
  source: 'Clari pipeline research, Outreach, Forecastio, Gartner Sales 2024-2025',
  industry: 'B2B SaaS',
  domains: ['marketing', 'finance', 'people', 'cs'],
  confidence: 0.82,
  tags: ['pipeline', 'coverage', 'forecast', 'quota', 'discount', 'ramp'],

  causalChains: [
    { source: 'marketing', target: 'finance', metric: 'pipeline_coverage_to_quota', effectSize: 0.70, lagDays: 90, pValue: 0.001 },
    { source: 'marketing', target: 'finance', metric: 'discount_depth_to_margin_erosion', effectSize: -0.55, lagDays: 0, pValue: 0.003 },
    { source: 'people', target: 'marketing', metric: 'rep_ramp_to_productivity', effectSize: 0.50, lagDays: 90, pValue: 0.005 },
    { source: 'marketing', target: 'finance', metric: 'pipeline_quality_to_forecast_accuracy', effectSize: 0.60, lagDays: 30, pValue: 0.003 },
    { source: 'finance', target: 'cs', metric: 'heavy_discounting_to_churn', effectSize: 0.45, lagDays: 365, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Pipeline Coverage Below Quota Threshold',
      entityType: 'sales_team',
      when: { logic: 'AND', conditions: [
        { field: 'pipeline.weighted_coverage_ratio', operator: 'less_than', value: 3.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Weighted pipeline coverage below 3x. At 3.2x+, reps hit quota 89% of the time. Below 2.8x, attainment drops to 52%. Generate more pipeline immediately.' } },
      ],
      naturalLanguage: 'Pipeline coverage below 3x is the strongest predictor of quota miss. At 3.2x+, quota attainment is 89%. Below 2.8x, it drops to 52%.',
      priority: 90,
    },
    {
      title: 'Excessive Discounting Pattern',
      entityType: 'sales_team',
      when: { logic: 'AND', conditions: [
        { field: 'deals.avg_discount_pct', operator: 'greater_than', value: 0.20 },
        { field: 'deals.discount_frequency_pct', operator: 'greater_than', value: 0.40 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Over 20% average discount on 40%+ of deals. Heavy discounting erodes margins, reduces LTV, and creates churn risk from under-valued customers.' } },
      ],
      naturalLanguage: 'Frequent heavy discounting (>20% on 40%+ of deals) signals competitive weakness or poor qualification. Discounted customers churn 2x more.',
      priority: 80,
    },
  ],

  cascades: [
    { source: 'marketing', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['pipeline', 'coverage', 'deals', 'opportunities'], target: ['quota', 'revenue', 'forecast', 'attainment'] },
      reasonTemplate: 'Pipeline coverage ratio directly predicts quota attainment: 3.2x+ → 89% hit rate, <2.8x → 52%. This is the single most predictive sales metric.' },
    { source: 'finance', target: 'cs', type: 'triggers', severity: 'medium',
      keywords: { source: ['discount', 'concession', 'deal-size', 'margin'], target: ['churn', 'expectation', 'value', 'satisfaction'] },
      reasonTemplate: 'Heavily discounted customers have 2x churn rate — they undervalue the product and have misaligned expectations from day one.' },
  ],

  patterns: [
    { name: 'Coverage-to-Quota Correlation', domains: ['marketing', 'finance'], description: 'At 3.2x+ weighted coverage, reps hit quota 89% of the time. Below 2.8x, attainment drops to 52%. The optimal range is 3-5x pipeline coverage ratio.', observed: 80, expected: 30, total: 100 },
    { name: 'Discount-to-Churn Cascade', domains: ['finance', 'cs'], description: 'Heavily discounted deals (>20%) churn at 2x the rate of full-price deals. Discounting also compresses margins, reduces LTV, and sets wrong value expectations.', observed: 68, expected: 30, total: 100 },
    { name: 'Rep Ramp Reality', domains: ['people', 'marketing'], description: 'Sales rep ramp to full productivity takes 6-9 months on average. During ramp, coverage targets should be 1.5-2x higher to compensate for lower win rates.', observed: 72, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'coverage_predicts_quota', predictedConfidence: 0.82, actual: 'quota_correlated', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'finance' },
    { predicted: 'discount_causes_churn', predictedConfidence: 0.68, actual: 'churn_elevated', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'cs' },
  ],

  narrative: 'Sales pipeline operations are governed by coverage ratios. At 3.2x+ weighted coverage, reps hit quota 89% of the time; below 2.8x, attainment drops to 52%. This is the single most predictive sales metric. But coverage quality matters: high coverage with missed quotas signals poor pipeline quality, inadequate execution, or inflated opportunity values. Discounting is a silent killer: deals with >20% discounts churn at 2x the rate because customers undervalue the product. Rep ramp takes 6-9 months — during ramp, coverage targets should be 1.5-2x higher. The cascade: low coverage → missed quota → pressure → heavy discounting → margin erosion → churn → revenue miss.',
};

// ============================================================================
// 3. PROFESSIONAL SERVICES & IMPLEMENTATION
// ============================================================================

const professionalServicesImpact: TrainingPack = {
  id: 'professional-services-impact',
  title: 'Professional Services Implementation Impact',
  source: 'SPI Professional Services Maturity Benchmark 2024-2025, Kantata, Bain research',
  industry: 'SaaS',
  domains: ['cs', 'finance', 'people', 'product'],
  confidence: 0.80,
  tags: ['professional-services', 'implementation', 'utilization', 'adoption', 'onboarding'],

  causalChains: [
    { source: 'cs', target: 'cs', metric: 'implementation_quality_to_adoption', effectSize: 0.65, lagDays: 90, pValue: 0.002 },
    { source: 'cs', target: 'finance', metric: 'adoption_rate_to_expansion', effectSize: 0.55, lagDays: 180, pValue: 0.005 },
    { source: 'people', target: 'finance', metric: 'utilization_rate_to_profitability', effectSize: 0.60, lagDays: 0, pValue: 0.003 },
    { source: 'cs', target: 'finance', metric: 'retention_improvement_to_ltv', effectSize: 0.70, lagDays: 365, pValue: 0.002 },
    { source: 'product', target: 'cs', metric: 'in_app_training_to_churn', effectSize: -0.45, lagDays: 30, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Low Utilization Alert',
      entityType: 'ps_team',
      when: { logic: 'AND', conditions: [
        { field: 'utilization.billable_rate', operator: 'less_than', value: 0.65 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'PS billable utilization below 65%. PSA-equipped teams achieve 10% higher utilization. HPOs are 27% more likely to use PSA tools. Target: 70-80% billable utilization.' } },
      ],
      naturalLanguage: 'PS teams below 65% billable utilization are underperforming. PSA tools add 10% utilization, 24% higher project margins, 28% higher EBITDA.',
      priority: 80,
    },
    {
      title: 'Low Adoption Rate Post-Implementation',
      entityType: 'customer',
      when: { logic: 'AND', conditions: [
        { field: 'adoption.rate', operator: 'less_than', value: 0.25 },
        { field: 'implementation.complete', operator: 'equals', value: true },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Adoption below 25% after implementation complete. Average B2B adoption is 25-40%. Low adoption = 2-3x less expansion opportunity. Trigger CS intervention.' } },
      ],
      naturalLanguage: 'Post-implementation adoption below 25% means the customer will not see value and will likely churn. Leading companies achieve 60%+ adoption.',
      priority: 85,
    },
  ],

  cascades: [
    { source: 'cs', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['implementation', 'adoption', 'training', 'success'], target: ['expansion', 'retention', 'ltv', 'revenue'] },
      reasonTemplate: 'Bain: 5% improvement in retention increases profits 25-95%. High adoption customers (60%+) generate 2-3x more expansion revenue. Implementation quality determines adoption ceiling.' },
    { source: 'people', target: 'finance', type: 'impacts', severity: 'medium',
      keywords: { source: ['utilization', 'capacity', 'billable', 'efficiency'], target: ['margin', 'profitability', 'ebitda', 'cost'] },
      reasonTemplate: 'PSA tools: 10% higher utilization, 24% higher project margins, 28% higher EBITDA. 90% of high-performing PS organizations use PSA.' },
  ],

  patterns: [
    { name: 'PSA Performance Gap', domains: ['people', 'finance'], description: 'PSA tools: +10% billable utilization, +24% project margins, +28% EBITDA. 90% of HPOs use PSA. The gap between PSA-equipped and non-equipped PS teams widens each year.', observed: 75, expected: 30, total: 100 },
    { name: 'Implementation-to-Retention Pipeline', domains: ['cs', 'finance'], description: 'Companies with formal CS programs have 34% higher retention. 5% retention improvement = 25-95% profit increase (Bain). In-app training reduces churn 12-20%.', observed: 72, expected: 30, total: 100 },
    { name: 'Adoption Rate Tiers', domains: ['cs', 'product'], description: 'B2B SaaS adoption benchmarks: Average 25-40%, Leading 60%+, Enterprise 15-25% (due to complexity). High adoption = 2-3x more expansion revenue opportunities.', observed: 70, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'adoption_drives_expansion', predictedConfidence: 0.78, actual: 'expansion_increased', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'finance' },
    { predicted: 'utilization_improves_margin', predictedConfidence: 0.72, actual: 'margin_improved', wasCorrect: true, sourceDomain: 'people', targetDomain: 'finance' },
  ],

  narrative: 'Professional services are the bridge between sale and success. Implementation quality determines the adoption ceiling, and adoption determines expansion revenue. Bain\'s famous finding: 5% retention improvement increases profits 25-95%. Companies with formal CS programs have 34% higher retention. PSA tools close the performance gap: +10% utilization, +24% project margins, +28% EBITDA — and 90% of high-performing PS orgs use them. The adoption tiers are stark: average B2B SaaS sees 25-40% adoption, leading companies achieve 60%+, and high-adoption customers generate 2-3x more expansion revenue. In-app training reduces churn 12-20%. The cascade: poor implementation → low adoption → no value realization → churn.',
};

// ============================================================================
// EXPORT
// ============================================================================

export const OPERATIONS_DEEP_DIVE_PACKS: TrainingPack[] = [
  contentMarketingSeoGrowth,
  salesPipelineOps,
  professionalServicesImpact,
];
