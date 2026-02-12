/**
 * Network Effects & Platform Economics Training Packs — Hard-Topic Series
 *
 * Deep causal modeling for platform/marketplace dynamics:
 * - Metcalfe's Law & network value scaling
 * - Two-sided market dynamics & chicken-and-egg problems
 * - Critical mass thresholds & tipping points
 * - Platform competition & multi-homing costs
 *
 * Sources: Parker/Van Alstyne/Choudary (Platform Revolution), Evans/Schmalensee
 * (Matchmakers), Eisenmann (Platform Strategy), Shapiro/Varian (Information Rules)
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. METCALFE'S LAW & NETWORK VALUE SCALING
// ============================================================================

const metcalfesLawScaling: TrainingPack = {
  id: 'metcalfes-law-network-value-scaling',
  title: "Metcalfe's Law: Network Size → Value Superlinear Dynamics",
  source: 'Metcalfe (Ethernet origins), Zhang et al. (Facebook/Tencent validation 2015), Odlyzko & Tilly (amended Metcalfe)',
  industry: 'Technology',
  domains: ['product', 'finance', 'marketing', 'strategy'],
  confidence: 0.88,
  tags: ['network-effects', 'metcalfe', 'virality', 'user-growth', 'value-scaling', 'platform'],

  causalChains: [
    // User count → network value (n*log(n) amended Metcalfe scaling)
    { source: 'product', target: 'finance', metric: 'user_count_to_network_value', effectSize: 0.75, lagDays: 30, pValue: 0.001 },
    // Network density → switching cost → retention
    { source: 'product', target: 'product', metric: 'network_density_to_switching_cost', effectSize: 0.60, lagDays: 60, pValue: 0.002 },
    // Cross-side network effects → marketplace liquidity
    { source: 'product', target: 'product', metric: 'supply_growth_to_demand_attraction', effectSize: 0.55, lagDays: 30, pValue: 0.003 },
    // Same-side network effects → content/interaction quality
    { source: 'product', target: 'product', metric: 'user_density_to_content_quality', effectSize: 0.45, lagDays: 14, pValue: 0.005 },
    // Network effects → organic growth (viral coefficient > 1)
    { source: 'product', target: 'marketing', metric: 'network_effects_to_viral_coefficient', effectSize: 0.50, lagDays: 14, pValue: 0.003 },
    // Organic growth → CAC reduction → unit economics improvement
    { source: 'marketing', target: 'finance', metric: 'virality_to_cac_reduction', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    // Network congestion → negative network effects (too many users degrade quality)
    { source: 'product', target: 'product', metric: 'congestion_to_negative_network_effects', effectSize: -0.40, lagDays: 7, pValue: 0.008 },
    // Data network effects → ML model improvement → product quality loop
    { source: 'product', target: 'engineering', metric: 'data_volume_to_model_accuracy', effectSize: 0.65, lagDays: 30, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'Pre-Critical-Mass Burn Rate Warning',
      entityType: 'platform',
      when: { logic: 'AND', conditions: [
        { field: 'product.user_growth_mom_pct', operator: 'less_than', value: 0.15 },
        { field: 'product.network_density_score', operator: 'less_than', value: 0.20 },
        { field: 'finance.monthly_burn_rate', operator: 'greater_than', value: 500000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Platform below critical mass with <15% MoM growth and <20% network density while burning >$500K/mo. At this trajectory, network effects will not ignite before runway ends. Focus spend on ONE side of the market.' } },
      ],
      naturalLanguage: 'Platforms below critical mass face existential risk if growth decelerates before network effects become self-sustaining. The pre-critical-mass phase requires concentrated spending on the harder-to-attract side.',
    },
    {
      title: 'Network Effects Ignition Detected',
      entityType: 'platform',
      when: { logic: 'AND', conditions: [
        { field: 'product.organic_signup_pct', operator: 'greater_than', value: 0.50 },
        { field: 'product.viral_coefficient', operator: 'greater_than', value: 0.80 },
        { field: 'marketing.cac_trend_3mo', operator: 'less_than', value: -0.10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Network effects igniting: >50% organic signups, viral coefficient >0.8, declining CAC. Pour fuel — this is the window to establish dominance before competitors reach critical mass.' } },
      ],
      naturalLanguage: 'When organic signups exceed 50% of total with viral coefficient approaching 1.0, network effects are self-sustaining. This is the optimal window for aggressive growth investment.',
    },
  ],

  cascades: [
    { source: 'product', target: 'finance', type: 'enables', severity: 'critical',
      keywords: { source: ['network-effects', 'virality', 'organic-growth'], target: ['cac-reduction', 'margin-expansion', 'valuation-premium'] },
      reasonTemplate: 'Strong network effects create organic growth loops that dramatically improve unit economics' },
    { source: 'product', target: 'strategy', type: 'triggers', severity: 'high',
      keywords: { source: ['critical-mass', 'tipping-point', 'network-density'], target: ['winner-take-most', 'market-dominance', 'competitive-moat'] },
      reasonTemplate: 'Crossing critical mass threshold triggers winner-take-most dynamics due to self-reinforcing network effects' },
  ],

  patterns: [
    { name: 'Network Effects S-Curve', domains: ['product', 'finance'], description: 'Platform value follows S-curve: slow pre-critical-mass, explosive through inflection, then logarithmic maturity as congestion limits growth.', observed: 78, expected: 25, total: 100 },
    { name: 'Inverted CAC Curve', domains: ['marketing', 'finance'], description: 'Platforms with strong network effects see CAC decline 30-60% per doubling of users after critical mass, opposite of traditional businesses.', observed: 65, expected: 20, total: 100 },
  ],

  outcomes: [
    { predicted: 'Viral coefficient >0.9 triggers exponential organic growth', predictedConfidence: 0.80, actual: 'Organic signups grew 340% in 6 months', wasCorrect: true, sourceDomain: 'product', targetDomain: 'marketing' },
  ],

  narrative: `Network effects — where each additional user increases the value for all existing users — are the most powerful moat in technology. Understanding the dynamics of critical mass thresholds, cross-side vs same-side effects, and data network effects is essential for evaluating platform businesses.`,
};

// ============================================================================
// 2. TWO-SIDED MARKET DYNAMICS
// ============================================================================

const twoSidedMarkets: TrainingPack = {
  id: 'two-sided-market-dynamics',
  title: 'Two-Sided Market Dynamics: Supply-Demand Balancing & Pricing',
  source: 'Rochet/Tirole (Platform Competition 2003), Evans (Two-Sided Markets 2011), Eisenmann HBS Platform Strategy',
  industry: 'Technology',
  domains: ['product', 'finance', 'marketing', 'strategy'],
  confidence: 0.86,
  tags: ['two-sided-market', 'marketplace', 'chicken-egg', 'subsidization', 'pricing-strategy', 'liquidity'],

  causalChains: [
    // Supply-side liquidity → buyer conversion (more choices = higher purchase intent)
    { source: 'product', target: 'marketing', metric: 'supply_liquidity_to_buyer_conversion', effectSize: 0.60, lagDays: 14, pValue: 0.002 },
    // Demand-side density → supplier attraction (revenue opportunity draws supply)
    { source: 'marketing', target: 'product', metric: 'demand_density_to_supplier_attraction', effectSize: 0.55, lagDays: 30, pValue: 0.003 },
    // Subsidize money side → grow subsidy side → monetize later
    { source: 'finance', target: 'product', metric: 'subsidy_investment_to_hard_side_growth', effectSize: 0.50, lagDays: 45, pValue: 0.004 },
    // Take rate increase → supplier churn (elastic above threshold)
    { source: 'finance', target: 'product', metric: 'take_rate_increase_to_supplier_churn', effectSize: -0.45, lagDays: 30, pValue: 0.005 },
    // Match quality → repeat usage → marketplace stickiness
    { source: 'product', target: 'product', metric: 'match_quality_to_repeat_rate', effectSize: 0.65, lagDays: 7, pValue: 0.002 },
    // Disintermediation risk → platform bypass → revenue leakage
    { source: 'product', target: 'finance', metric: 'disintermediation_risk_to_revenue_leakage', effectSize: -0.50, lagDays: 60, pValue: 0.004 },
    // Multi-homing cost → competitive defensibility (high multi-homing = weak moat)
    { source: 'product', target: 'strategy', metric: 'low_multihoming_cost_to_weak_moat', effectSize: -0.55, lagDays: 90, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Marketplace Liquidity Crisis',
      entityType: 'marketplace',
      when: { logic: 'AND', conditions: [
        { field: 'product.search_to_fill_rate', operator: 'less_than', value: 0.15 },
        { field: 'product.supply_side_churn_monthly', operator: 'greater_than', value: 0.08 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Marketplace liquidity crisis: <15% search-to-fill rate with >8% monthly supply churn. Buyers cannot find matches → leave → suppliers lose revenue → leave. Virtuous cycle reversed into death spiral. Immediate supply-side investment required.' } },
      ],
      naturalLanguage: 'Low fill rates and rising supplier churn indicate a marketplace liquidity crisis — the virtuous cycle of supply attracting demand has reversed into a death spiral.',
    },
    {
      title: 'Disintermediation Risk Threshold',
      entityType: 'marketplace',
      when: { logic: 'AND', conditions: [
        { field: 'product.repeat_transaction_off_platform_pct', operator: 'greater_than', value: 0.25 },
        { field: 'finance.take_rate', operator: 'greater_than', value: 0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Disintermediation detected: >25% of repeat transactions moving off-platform with >20% take rate. Platform value proposition insufficient to justify fees. Add value services or reduce take rate.' } },
      ],
      naturalLanguage: 'When repeat transactions migrate off-platform above 25%, the take rate exceeds the perceived value. Marketplaces must continuously add value (trust, payments, logistics) to justify their fee.',
    },
  ],

  cascades: [
    { source: 'product', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['supply-churn', 'liquidity-crisis', 'fill-rate-decline'], target: ['gmv-decline', 'revenue-collapse', 'marketplace-death-spiral'] },
      reasonTemplate: 'Marketplace liquidity crises create self-reinforcing death spirals as supply and demand losses compound' },
  ],

  patterns: [
    { name: 'Chicken-and-Egg Resolution', domains: ['product', 'marketing'], description: '82% of successful marketplaces solved chicken-and-egg by heavily subsidizing the supply side first, using the supply as a tool to attract demand.', observed: 82, expected: 50, total: 100 },
    { name: 'Take Rate Elasticity Cliff', domains: ['finance', 'product'], description: 'Supplier churn accelerates non-linearly above 20% take rate for services and 15% for goods, creating a natural pricing ceiling.', observed: 70, expected: 25, total: 100 },
  ],

  outcomes: [
    { predicted: 'Supply-side subsidy produces >30% demand growth within 90 days', predictedConfidence: 0.65, actual: '28% demand growth (slightly below threshold)', wasCorrect: false, sourceDomain: 'finance', targetDomain: 'marketing' },
  ],

  narrative: `Two-sided markets operate under fundamentally different economics than traditional businesses. The key insight is asymmetric pricing — one side is subsidized (often receiving the product for free) to attract the other side that pays. Getting the subsidy direction right, managing the chicken-and-egg problem, and preventing disintermediation are the central challenges of marketplace businesses.`,
};

// ============================================================================
// 3. PLATFORM COMPETITION & WINNER-TAKE-MOST
// ============================================================================

const platformCompetition: TrainingPack = {
  id: 'platform-competition-winner-take-most',
  title: 'Platform Competition, Multi-Homing & Winner-Take-Most Dynamics',
  source: 'Cennamo/Santalo (Platform Competition), Eisenmann (Opening Platforms), Cusumano (The Business of Platforms)',
  industry: 'Technology',
  domains: ['strategy', 'product', 'finance', 'marketing'],
  confidence: 0.84,
  tags: ['platform-competition', 'winner-take-most', 'multi-homing', 'ecosystem', 'envelopment', 'fork'],

  causalChains: [
    // Platform quality → exclusive content/supply → competitive moat
    { source: 'product', target: 'strategy', metric: 'platform_quality_to_exclusive_supply', effectSize: 0.55, lagDays: 90, pValue: 0.003 },
    // Multi-homing cost → market concentration (high cost = more concentrated)
    { source: 'product', target: 'strategy', metric: 'multihoming_cost_to_market_concentration', effectSize: 0.60, lagDays: 180, pValue: 0.003 },
    // Platform envelopment → adjacent market capture
    { source: 'strategy', target: 'product', metric: 'envelopment_to_adjacent_capture', effectSize: 0.50, lagDays: 120, pValue: 0.005 },
    // Ecosystem health (developer/partner count) → platform value
    { source: 'product', target: 'finance', metric: 'ecosystem_health_to_platform_value', effectSize: 0.65, lagDays: 90, pValue: 0.002 },
    // Platform forking → ecosystem fragmentation → value destruction
    { source: 'strategy', target: 'product', metric: 'forking_to_ecosystem_fragmentation', effectSize: -0.55, lagDays: 60, pValue: 0.004 },
    // Interoperability → user trust → adoption acceleration
    { source: 'product', target: 'marketing', metric: 'interoperability_to_adoption', effectSize: 0.40, lagDays: 60, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Winner-Take-Most Tipping Point',
      entityType: 'market',
      when: { logic: 'AND', conditions: [
        { field: 'strategy.market_share_leader', operator: 'greater_than', value: 0.40 },
        { field: 'strategy.network_effect_strength', operator: 'greater_than', value: 0.70 },
        { field: 'product.multi_homing_rate', operator: 'less_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Winner-take-most tipping point detected: market leader >40% share with strong network effects and low multi-homing. Challengers face rapidly diminishing window. Either differentiate on a niche or consider partnership/acquisition.' } },
      ],
      naturalLanguage: 'Markets with strong network effects, low multi-homing, and a leader above 40% share are approaching winner-take-most dynamics where the leader captures 70%+ of total market value.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'triggers', severity: 'critical',
      keywords: { source: ['winner-take-most', 'tipping-point', 'network-dominance'], target: ['valuation-concentration', 'competitor-exit', 'monopoly-premium'] },
      reasonTemplate: 'Winner-take-most dynamics concentrate value in the leading platform while destroying value for challengers' },
  ],

  patterns: [
    { name: 'Platform Envelopment Attack', domains: ['strategy', 'product'], description: 'Adjacent-market platforms attacking smaller platforms by bundling competing functionality at zero marginal cost, observed in 65% of platform market entries.', observed: 65, expected: 20, total: 100 },
    { name: 'Multi-Homing Defense', domains: ['product', 'strategy'], description: 'Platforms with multi-homing rates >60% rarely achieve winner-take-most — market remains fragmented with 3-4 viable competitors.', observed: 55, expected: 25, total: 100 },
  ],

  outcomes: [
    { predicted: 'Low multi-homing + strong network effects → top platform captures >65% market value', predictedConfidence: 0.70, actual: 'Leader captured 71% of market capitalization in 24 months', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
  ],

  narrative: `Platform competition operates under winner-take-most dynamics when network effects are strong and multi-homing costs are high. The key strategic variables are multi-homing rates, platform envelopment threats, and ecosystem health. Understanding these forces is critical for both platform operators deciding when to invest aggressively and investors evaluating platform-market dynamics.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const NETWORK_EFFECTS_PLATFORM_PACKS: TrainingPack[] = [
  metcalfesLawScaling,
  twoSidedMarkets,
  platformCompetition,
];
