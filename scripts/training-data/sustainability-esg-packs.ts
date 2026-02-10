/**
 * Sustainability & ESG Training Packs
 *
 * Environmental, Social, and Governance intelligence:
 * - ESG Scoring, Reporting & Regulatory Frameworks
 * - Carbon Accounting, Net-Zero Strategy & Green Finance
 *
 * Sources: ISSB/IFRS S1&S2, TCFD, EU CSRD, GRI Standards, MSCI ESG,
 * McKinsey Sustainability, CDP Climate, SBTi
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. ESG SCORING, REPORTING & REGULATORY
// ============================================================================

const esgScoringRegulatory: TrainingPack = {
  id: 'esg-scoring-reporting-regulatory',
  title: 'ESG Scoring — Frameworks, Ratings, Regulatory Compliance',
  source: 'ISSB IFRS S1/S2, EU CSRD, TCFD, GRI Standards, MSCI ESG, Sustainalytics, McKinsey',
  industry: 'Cross-Industry',
  domains: ['strategy', 'finance', 'engineering', 'hr'],
  confidence: 0.82,
  tags: ['esg', 'sustainability', 'reporting', 'tcfd', 'csrd', 'gri', 'msci', 'ratings', 'compliance'],

  causalChains: [
    // ESG rating improvement → cost of capital reduction (20-30 bps)
    { source: 'strategy', target: 'finance', metric: 'esg_rating_to_cost_of_capital', effectSize: -0.35, lagDays: 365, pValue: 0.003 },
    // ESG disclosure quality → investor confidence → capital access
    { source: 'strategy', target: 'finance', metric: 'esg_disclosure_to_investor_confidence', effectSize: 0.45, lagDays: 180, pValue: 0.002 },
    // EU CSRD compliance → market access for European operations
    { source: 'strategy', target: 'strategy', metric: 'csrd_compliance_to_eu_market_access', effectSize: 0.50, lagDays: 365, pValue: 0.002 },
    // Social pillar (DEI, labor) → talent attraction → competitive hiring advantage
    { source: 'hr', target: 'hr', metric: 'social_pillar_to_talent_attraction', effectSize: 0.40, lagDays: 90, pValue: 0.005 },
    // Governance quality → scandal probability reduction → brand protection
    { source: 'strategy', target: 'finance', metric: 'governance_quality_to_scandal_prevention', effectSize: -0.45, lagDays: 365, pValue: 0.003 },
    // Greenwashing exposure → reputational damage → ESG rating downgrade
    { source: 'strategy', target: 'strategy', metric: 'greenwashing_to_reputational_damage', effectSize: -0.55, lagDays: 30, pValue: 0.001 },
  ],

  businessRules: [
    {
      title: 'ESG Reporting Gap for Institutional Investors',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'strategy.esg_report_published', operator: 'equals', value: false },
        { field: 'finance.institutional_investor_pct', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'No ESG report published with 30%+ institutional ownership. BlackRock, Vanguard, State Street now require ESG disclosure. $35T+ in AUM follows ESG mandates. Companies without ESG reporting face: capital access restrictions, proxy vote risks, and investor engagement pressure.' } },
      ],
      naturalLanguage: 'Institutional investors managing $35T+ in assets require ESG disclosure. Companies without reporting face increasing capital access challenges as ESG mandates tighten globally.',
    },
    {
      title: 'ESG Rating Divergence Warning',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'strategy.msci_esg_rating', operator: 'less_than', value: 3 },
        { field: 'strategy.sustainalytics_risk_score', operator: 'greater_than', value: 30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Low MSCI ESG rating (below BBB) and high Sustainalytics risk (> 30). ESG rating agencies have 60% correlation (vs 99% for credit ratings) — but consistently low scores across agencies signals genuine ESG risk. Focus on: material ESG factors for your industry, data quality improvements, and stakeholder engagement.' } },
      ],
      naturalLanguage: 'When multiple ESG rating agencies score a company poorly, the signal is more reliable. Unlike credit ratings (99% correlated), ESG ratings diverge (60% correlation), making multi-agency lows a stronger warning.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['esg', 'sustainability', 'disclosure', 'reporting', 'rating'], target: ['cost-of-capital', 'investor-access', 'green-bonds', 'capital-markets'] },
      reasonTemplate: 'McKinsey: top-quintile ESG companies achieve 20-30 bps lower cost of capital. ESG-focused funds now manage $35T+ globally. Strong ESG disclosure enables access to green bonds (2-5x oversubscribed), sustainability-linked loans, and preferential institutional capital.' },
    { source: 'strategy', target: 'strategy', type: 'impacts', severity: 'critical',
      keywords: { source: ['greenwashing', 'false-claims', 'misleading-disclosure'], target: ['reputation', 'trust', 'regulatory-action', 'litigation'] },
      reasonTemplate: 'Greenwashing exposure creates cascading reputational damage. SEC and EU regulators are actively pursuing greenwashing cases. DWS (Deutsche Bank subsidiary) faced regulatory investigation and CEO resignation over ESG fund misrepresentation. The reputational cost far exceeds compliance cost.' },
  ],

  patterns: [
    { name: 'ESG Framework Landscape', domains: ['strategy', 'finance'], description: 'ISSB (IFRS S1/S2): emerging global baseline. EU CSRD: mandatory for EU companies (50K+ affected). TCFD: climate-specific financial disclosure (11 recommendations). GRI: impact-focused reporting. SASB: industry-specific materiality. CDP: carbon and environmental disclosure. Convergence is happening: ISSB absorbing TCFD and SASB.', observed: 85, expected: 25, total: 100 },
    { name: 'ESG Rating Agency Divergence', domains: ['strategy'], description: 'MSCI, Sustainalytics, S&P CSA, ISS, CDP — ESG rating agencies have only 60% average correlation (vs 99% for credit ratings). The divergence comes from: different materiality frameworks, different weights, different data sources. Companies must engage all major agencies individually.', observed: 80, expected: 30, total: 100 },
    { name: 'Materiality-First ESG Strategy', domains: ['strategy', 'finance'], description: 'SASB identifies industry-specific material ESG factors. Tech: data privacy, energy management. Healthcare: drug safety, access. Finance: systemic risk, business ethics. Focusing on material factors yields 3-5x more impact per dollar than broad ESG programs.', observed: 78, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'cost_of_capital', expectedChange: -0.003, timeframeDays: 365, condition: 'esg_rating_improved_by_2_notches' },
    { metric: 'institutional_capital_access', expectedChange: 0.25, timeframeDays: 365, condition: 'esg_report_published AND tcfd_aligned' },
    { metric: 'regulatory_risk', expectedChange: -0.30, timeframeDays: 365, condition: 'csrd_compliant AND no_greenwashing' },
  ],

  narrative: `ESG is no longer optional — it is a financial and regulatory imperative. With $35T+ in AUM following ESG mandates, companies without ESG reporting face capital access restrictions. The regulatory landscape is converging: ISSB's IFRS S1/S2 is becoming the global baseline, EU CSRD mandates disclosure for 50K+ companies, and TCFD is now required in multiple jurisdictions. ESG rating divergence (60% correlation across agencies) means companies must engage all major raters. The financial case: top-quintile ESG companies achieve 20-30 bps lower cost of capital. The risk case: greenwashing exposure creates cascading reputational damage far exceeding compliance costs. Materiality-first ESG strategy (SASB framework) yields 3-5x better return than broad, unfocused ESG programs.`,
};

// ============================================================================
// 2. CARBON ACCOUNTING & NET-ZERO STRATEGY
// ============================================================================

const carbonNetZero: TrainingPack = {
  id: 'carbon-accounting-net-zero-strategy',
  title: 'Carbon Accounting — Scope 1/2/3, Net-Zero, Carbon Markets',
  source: 'GHG Protocol, SBTi, CDP Climate, IEA Net Zero, McKinsey Decarbonization',
  industry: 'Cross-Industry',
  domains: ['engineering', 'finance', 'strategy'],
  confidence: 0.80,
  tags: ['carbon', 'emissions', 'scope-1-2-3', 'net-zero', 'sbti', 'carbon-credits', 'decarbonization'],

  causalChains: [
    // Carbon pricing → operating cost increase → margin pressure for high emitters
    { source: 'strategy', target: 'finance', metric: 'carbon_price_to_cost_increase', effectSize: -0.45, lagDays: 365, pValue: 0.002 },
    // Scope 3 measurement → supply chain transparency → procurement optimization
    { source: 'engineering', target: 'strategy', metric: 'scope3_measurement_to_supply_chain_transparency', effectSize: 0.40, lagDays: 365, pValue: 0.005 },
    // SBTi commitment → investor confidence → green finance access
    { source: 'strategy', target: 'finance', metric: 'sbti_commitment_to_green_finance', effectSize: 0.45, lagDays: 180, pValue: 0.003 },
    // Energy efficiency investment → Scope 1+2 reduction → operating cost savings
    { source: 'engineering', target: 'finance', metric: 'energy_efficiency_to_cost_savings', effectSize: -0.35, lagDays: 365, pValue: 0.005 },
    // Renewable energy procurement → Scope 2 reduction → PPA savings
    { source: 'engineering', target: 'finance', metric: 'renewable_ppa_to_scope2_reduction', effectSize: -0.50, lagDays: 365, pValue: 0.002 },
    // Carbon border adjustment (CBAM) → trade flow disruption → supply chain restructuring
    { source: 'strategy', target: 'strategy', metric: 'cbam_to_supply_chain_restructuring', effectSize: 0.40, lagDays: 365, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Scope 3 Emissions Unmeasured',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'strategy.scope3_measured', operator: 'equals', value: false },
        { field: 'finance.revenue', operator: 'greater_than', value: 50000000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Scope 3 emissions unmeasured at $50M+ revenue. GHG Protocol: Scope 3 typically represents 70-90% of total emissions. EU CSRD and SEC Climate Rule require Scope 3 disclosure. Companies without Scope 3 data face: regulatory non-compliance, investor scrutiny, and inability to set credible net-zero targets. Start with: supplier surveys, spend-based estimation, and category prioritization.' } },
      ],
      naturalLanguage: 'Scope 3 emissions (supply chain + product use) are typically 70-90% of a company\'s total carbon footprint. Without measuring them, any net-zero claim is incomplete and potentially misleading.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['carbon-price', 'emissions-trading', 'cbam', 'carbon-tax'], target: ['operating-cost', 'margin', 'competitiveness', 'capex'] },
      reasonTemplate: 'Carbon pricing is expanding globally: EU ETS at EUR 60-90/tCO2, with prices projected to reach EUR 130+ by 2030. At $100/tCO2, a company emitting 100K tCO2 faces $10M annual carbon cost. Early decarbonization locks in competitive advantage before carbon costs escalate.' },
    { source: 'engineering', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['energy-efficiency', 'renewable-energy', 'electrification', 'decarbonization'], target: ['cost-savings', 'energy-independence', 'margin-improvement', 'resilience'] },
      reasonTemplate: 'Decarbonization investments often generate positive ROI through energy cost savings. Solar PPAs now cheaper than grid electricity in most markets. LED retrofits pay back in 2-3 years. Heat pumps save 30-50% on heating costs. The environmental benefit is increasingly a financial co-benefit.' },
  ],

  patterns: [
    { name: 'GHG Protocol Scope Definition', domains: ['engineering', 'strategy'], description: 'Scope 1: Direct emissions (owned/controlled sources — combustion, processes). Scope 2: Indirect energy emissions (purchased electricity, heat, steam). Scope 3: All other indirect emissions (supply chain, employee commuting, product use, end-of-life). Scope 3 is typically 70-90% of total but hardest to measure.', observed: 88, expected: 20, total: 100 },
    { name: 'Net-Zero Target Quality (SBTi)', domains: ['strategy'], description: 'SBTi net-zero standard requires: (1) Near-term targets: 5-10 year science-based reduction (1.5C pathway), (2) Long-term target: 90%+ reduction by 2050, (3) Carbon removal only for residual 5-10%. Offsets cannot substitute for decarbonization. 4,000+ companies committed to SBTi targets.', observed: 82, expected: 25, total: 100 },
    { name: 'Carbon Market Mechanics', domains: ['finance', 'strategy'], description: 'Compliance markets (EU ETS, CA Cap-and-Trade): mandatory, liquid, $100B+/year. Voluntary markets: $2B/year, quality varies widely. Carbon credits range from $5/tCO2 (avoidance) to $600+/tCO2 (direct air capture). Integrity initiatives (ICVCM, VCMI) establishing quality standards for voluntary markets.', observed: 78, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'carbon_emissions_reduction', expectedChange: -0.30, timeframeDays: 365, condition: 'renewable_procurement AND energy_efficiency_program' },
    { metric: 'energy_cost_savings', expectedChange: -0.15, timeframeDays: 365, condition: 'solar_ppa AND led_retrofit AND hvac_optimization' },
    { metric: 'green_finance_access', expectedChange: 0.40, timeframeDays: 365, condition: 'sbti_commitment AND scope123_measured' },
  ],

  narrative: `Carbon accounting is the foundation of climate strategy. The GHG Protocol defines three scopes: Scope 1 (direct), Scope 2 (energy), and Scope 3 (everything else — typically 70-90% of total). SBTi sets the gold standard for net-zero targets: 90%+ real reduction by 2050, with offsets only for the residual 5-10%. Carbon pricing is expanding globally — EU ETS at EUR 60-90/tCO2 projected to reach EUR 130+ by 2030. For a company emitting 100K tCO2, that is $10M+ annual cost. Decarbonization investments increasingly generate positive ROI: renewable PPAs are cheaper than grid power, LED retrofits pay back in 2-3 years, and heat pumps save 30-50% on heating. The companies that decarbonize first lock in competitive advantage before carbon costs escalate.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const SUSTAINABILITY_ESG_PACKS: TrainingPack[] = [
  esgScoringRegulatory,
  carbonNetZero,
];
