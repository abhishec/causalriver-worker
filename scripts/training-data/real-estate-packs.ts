/**
 * Real Estate Training Packs
 *
 * Real estate markets, property investment, and PropTech:
 * - Property Valuation & Market Cycles
 * - Commercial Real Estate & REIT Analysis
 * - PropTech & Digital Transformation
 *
 * Sources: CBRE research, JLL Investor surveys, NAREIT, PwC ULI Trends,
 * CoStar data, Zillow/Redfin economics
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. PROPERTY VALUATION & MARKET CYCLES
// ============================================================================

const propertyValuationCycles: TrainingPack = {
  id: 'property-valuation-market-cycles',
  title: 'Property Valuation — Cap Rates, Market Cycles, Interest Rate Impact',
  source: 'CBRE Cap Rate Survey 2024, NCREIF, Federal Reserve, Case-Shiller, PwC Real Estate Trends',
  industry: 'Real Estate',
  domains: ['finance', 'strategy', 'marketing'],
  confidence: 0.84,
  tags: ['real-estate', 'cap-rate', 'noi', 'valuation', 'market-cycle', 'interest-rate', 'yield'],

  causalChains: [
    // Interest rate hikes → cap rate expansion → property value decline
    { source: 'finance', target: 'finance', metric: 'interest_rate_to_cap_rate_expansion', effectSize: 0.55, lagDays: 180, pValue: 0.001 },
    // Cap rate expansion → property valuation decline (V = NOI / cap rate)
    { source: 'finance', target: 'finance', metric: 'cap_rate_expansion_to_value_decline', effectSize: -0.60, lagDays: 90, pValue: 0.001 },
    // Economic growth → occupancy increase → NOI growth
    { source: 'strategy', target: 'finance', metric: 'gdp_growth_to_occupancy_improvement', effectSize: 0.45, lagDays: 180, pValue: 0.002 },
    // Remote work → office vacancy spike → rent pressure
    { source: 'strategy', target: 'finance', metric: 'remote_work_to_office_vacancy', effectSize: 0.55, lagDays: 365, pValue: 0.001 },
    // Housing supply shortage → price appreciation → affordability crisis
    { source: 'strategy', target: 'marketing', metric: 'supply_shortage_to_price_appreciation', effectSize: 0.50, lagDays: 365, pValue: 0.002 },
    // Demographic shift (millennials) → suburban demand → housing mix change
    { source: 'marketing', target: 'strategy', metric: 'demographic_shift_to_suburban_demand', effectSize: 0.40, lagDays: 365, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Negative Leverage Warning',
      entityType: 'property_investment',
      when: { logic: 'AND', conditions: [
        { field: 'finance.cap_rate', operator: 'less_than', value: 0.05 },
        { field: 'finance.debt_cost', operator: 'greater_than', value: 0.06 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Negative leverage: cap rate (< 5%) below debt cost (> 6%). Each dollar of debt destroys equity returns. In negative leverage scenarios: (1) Cash yield on equity declines as LTV increases, (2) NOI growth must exceed spread to recover, (3) Refinancing risk escalates. Solutions: reduce leverage, negotiate rate, or avoid acquisition.' } },
      ],
      naturalLanguage: 'When the cost of debt exceeds the property yield, leverage works in reverse — more debt means lower returns. This is the most dangerous position in real estate investing.',
    },
    {
      title: 'Office Sector Distress Signal',
      entityType: 'commercial_property',
      when: { logic: 'AND', conditions: [
        { field: 'finance.office_vacancy_rate', operator: 'greater_than', value: 0.20 },
        { field: 'finance.lease_expiry_within_2yr_pct', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Office sector distress: vacancy > 20% with 30%+ of leases expiring within 2 years. Post-COVID office occupancy averages 50-60% of pre-pandemic levels. Tenants downsizing 20-30% on renewal. Class B/C office at highest risk of obsolescence. Consider: conversion feasibility, tenant retention incentives, or disposal strategy.' } },
      ],
      naturalLanguage: 'High vacancy combined with near-term lease expirations in office buildings signals structural distress — not cyclical — particularly in post-COVID markets.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['interest-rate', 'fed-funds', 'monetary-policy', 'yield-curve'], target: ['cap-rate', 'valuation', 'refinancing', 'debt-service'] },
      reasonTemplate: 'Real estate values are inversely correlated with interest rates through the cap rate mechanism: Value = NOI / Cap Rate. A 100bp cap rate expansion on a 5% cap rate property causes a 17% value decline. The 2022-2024 rate cycle expanded US CRE cap rates 100-200bp, erasing $500B+ in commercial property value.' },
    { source: 'strategy', target: 'finance', type: 'triggers', severity: 'high',
      keywords: { source: ['remote-work', 'hybrid', 'return-to-office', 'space-utilization'], target: ['office-vacancy', 'rent-decline', 'conversion', 'obsolescence'] },
      reasonTemplate: 'The remote work structural shift has permanently altered office demand. Average office utilization: 50-60% of pre-COVID. Class A buildings with amenities: 70-80% recovery. Class B/C: 30-50% recovery. The bifurcation between trophy assets and commodity office is the defining CRE trend of the 2020s.' },
  ],

  patterns: [
    { name: 'Real Estate Valuation Formula Stack', domains: ['finance'], description: 'Cap Rate = NOI / Property Value. Property Value = NOI / Cap Rate. Cash-on-Cash = Annual Cash Flow / Total Cash Invested. DSCR = NOI / Annual Debt Service (> 1.25x required). GRM = Price / Gross Rent. IRR requires 5-10 year DCF modeling with exit cap rate assumption.', observed: 90, expected: 20, total: 100 },
    { name: 'Real Estate Cycle Phases', domains: ['finance', 'strategy'], description: 'Recovery → Expansion → Hyper-Supply → Recession. Each phase: 3-7 years. Leading indicators: building permits (supply pipeline), employment growth (demand), credit spreads (financing), absorption rate (market balance). Currently: post-rate-shock correction in office, late expansion in industrial/data centers.', observed: 85, expected: 25, total: 100 },
    { name: 'Asset Class Performance Divergence', domains: ['finance', 'strategy'], description: 'Post-2020 winners: Industrial/logistics (e-commerce), Data centers (AI/cloud), Multifamily (housing shortage). Losers: Office (remote work), Retail (except grocery-anchored). Mixed: Hotels (recovery but volatile). The "all real estate appreciates" era is over — asset selection is critical.', observed: 82, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'portfolio_return', expectedChange: 0.15, timeframeDays: 365, condition: 'cap_rate_spread_positive AND occupancy_above_90pct' },
    { metric: 'vacancy_rate_reduction', expectedChange: -0.10, timeframeDays: 365, condition: 'amenity_investment AND flexible_lease_terms' },
  ],

  narrative: `Real estate valuation is fundamentally about the relationship between net operating income and cap rates: V = NOI / Cap Rate. Interest rates drive cap rates — the 2022-2024 tightening cycle expanded CRE cap rates 100-200bp, destroying hundreds of billions in property value. The post-COVID structural shift bifurcated the market: industrial, data centers, and multifamily outperform while office faces secular decline with 50-60% utilization. Market cycles (recovery→expansion→hyper-supply→recession) last 3-7 years with leading indicators in permits, employment, and credit spreads. The critical investment decision is now asset class selection, not just location.`,
};

// ============================================================================
// 2. COMMERCIAL REAL ESTATE & REIT ANALYSIS
// ============================================================================

const creitAnalysis: TrainingPack = {
  id: 'commercial-reit-analysis',
  title: 'Commercial Real Estate & REIT Analysis — FFO, NAV, Sector Dynamics',
  source: 'NAREIT, CBRE Investor Survey 2024, Green Street Advisors, S&P Global, CoStar',
  industry: 'Real Estate',
  domains: ['finance', 'strategy'],
  confidence: 0.83,
  tags: ['reit', 'ffo', 'affo', 'nav', 'commercial-real-estate', 'occupancy', 'lease-structure'],

  causalChains: [
    // FFO growth → dividend growth → share price appreciation
    { source: 'finance', target: 'finance', metric: 'ffo_growth_to_dividend_growth', effectSize: 0.55, lagDays: 90, pValue: 0.002 },
    // NAV premium/discount → acquisition opportunity signal
    { source: 'finance', target: 'strategy', metric: 'nav_discount_to_acquisition_signal', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    // Same-store NOI growth → portfolio health → capital access
    { source: 'finance', target: 'finance', metric: 'same_store_noi_to_capital_access', effectSize: 0.45, lagDays: 180, pValue: 0.003 },
    // Tenant concentration risk → income volatility → credit downgrade
    { source: 'strategy', target: 'finance', metric: 'tenant_concentration_to_income_volatility', effectSize: 0.40, lagDays: 180, pValue: 0.005 },
    // Development pipeline → future supply → rent growth pressure
    { source: 'strategy', target: 'finance', metric: 'development_pipeline_to_rent_pressure', effectSize: -0.35, lagDays: 730, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'REIT Payout Ratio Sustainability',
      entityType: 'reit',
      when: { logic: 'AND', conditions: [
        { field: 'finance.affo_payout_ratio', operator: 'greater_than', value: 0.95 },
        { field: 'finance.debt_to_ebitda', operator: 'greater_than', value: 7.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'REIT payout ratio > 95% of AFFO with debt/EBITDA > 7x. This combination signals: (1) No retained cash for capex or acquisitions, (2) Dividend cut risk if NOI declines, (3) Refinancing risk given leverage. Healthy REITs: 70-85% AFFO payout, < 6x debt/EBITDA. Watch for: deferred maintenance, tenant improvement deferrals, and development pause.' } },
      ],
      naturalLanguage: 'REITs paying out nearly all AFFO with high leverage have zero margin for error — any NOI decline forces dividend cuts or asset sales.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'strategy', type: 'impacts', severity: 'high',
      keywords: { source: ['ffo', 'affo', 'noi', 'occupancy', 'rent-spread'], target: ['dividend', 'acquisition', 'development', 'disposition'] },
      reasonTemplate: 'REIT value chain: Same-store NOI growth drives FFO/AFFO → which funds dividends (90% payout required) and growth capex. Key metrics: FFO (GAAP net income + depreciation - gains on sales), AFFO (FFO - recurring capex - tenant improvements). P/AFFO replaces P/E for REIT valuation. NAV = (properties at market value - debt) / shares.' },
  ],

  patterns: [
    { name: 'REIT Metric Framework', domains: ['finance'], description: 'FFO = Net Income + Depreciation + Amortization - Gains on Sales. AFFO = FFO - Recurring CapEx - Tenant Improvements. P/FFO (replaces P/E): sector average 15-20x. NAV = Sum(property values) - debt. Premium/discount to NAV signals market sentiment. Dividend yield: 3-6% typical, higher signals risk.', observed: 88, expected: 20, total: 100 },
    { name: 'CRE Sector Fundamentals (2024)', domains: ['finance', 'strategy'], description: 'Industrial: 3-5% vacancy, 5-7% rent growth, driven by e-commerce (25% of retail). Multifamily: 5-7% vacancy, 3-5% rent growth, driven by housing shortage. Office: 18-22% vacancy, negative rent growth, structural decline. Retail: 5-7% vacancy, bifurcated (grocery-anchored strong, malls weak). Data Centers: 3-5% vacancy, 10-15% rent growth, AI-driven demand.', observed: 85, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'total_return', expectedChange: 0.08, timeframeDays: 365, condition: 'sector_tailwind AND leverage_below_6x AND same_store_noi_growth_positive' },
  ],

  narrative: `REIT analysis centers on FFO (funds from operations) and AFFO (adjusted FFO) rather than GAAP net income, because real estate depreciation is a non-cash accounting convention that understates true economic income. REITs must distribute 90%+ of taxable income as dividends, making AFFO payout ratio the critical sustainability metric. P/AFFO replaces P/E for valuation. NAV (net asset value) provides a floor — trading at a discount signals opportunity or distress. Sector fundamentals are diverging sharply: industrial and data centers benefit from structural tailwinds while office faces secular decline.`,
};

// ============================================================================
// 3. PROPTECH & REAL ESTATE DIGITAL TRANSFORMATION
// ============================================================================

const proptechDigital: TrainingPack = {
  id: 'proptech-digital-transformation',
  title: 'PropTech & Real Estate Digital Transformation — Platforms, Data, Automation',
  source: 'KPMG PropTech Survey, Deloitte CRE Outlook, MetaProp VC, CREtech, JLL Spark',
  industry: 'Real Estate / Technology',
  domains: ['engineering', 'product', 'strategy', 'finance'],
  confidence: 0.80,
  tags: ['proptech', 'real-estate-tech', 'smart-building', 'digital-twin', 'tokenization', 'iot'],

  causalChains: [
    // Smart building IoT → energy reduction → NOI improvement
    { source: 'engineering', target: 'finance', metric: 'smart_building_to_energy_savings', effectSize: -0.30, lagDays: 365, pValue: 0.003 },
    // Digital twins → predictive maintenance → capex optimization
    { source: 'engineering', target: 'finance', metric: 'digital_twin_to_maintenance_optimization', effectSize: -0.25, lagDays: 365, pValue: 0.005 },
    // RE tokenization → liquidity improvement → investor access
    { source: 'strategy', target: 'finance', metric: 'tokenization_to_liquidity_premium', effectSize: 0.20, lagDays: 365, pValue: 0.010 },
    // Tenant experience platform → satisfaction → retention
    { source: 'product', target: 'finance', metric: 'tenant_experience_to_retention', effectSize: 0.35, lagDays: 180, pValue: 0.005 },
    // Data-driven leasing → pricing optimization → revenue per sqft
    { source: 'engineering', target: 'finance', metric: 'data_driven_leasing_to_revenue_optimization', effectSize: 0.25, lagDays: 180, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Building Technology ROI Below Threshold',
      entityType: 'commercial_property',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.smart_building_investment', operator: 'greater_than', value: 100000 },
        { field: 'finance.energy_cost_reduction_pct', operator: 'less_than', value: 0.10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Smart building investment > $100K with < 10% energy reduction. Industry benchmark: well-deployed building IoT delivers 15-30% energy savings. Check: (1) Sensor coverage complete? (2) BMS integration working? (3) Optimization algorithms tuned? (4) Tenant behavior change programs active? Most ROI comes from HVAC optimization (60%) and lighting (25%).' } },
      ],
      naturalLanguage: 'PropTech investment without measurable NOI improvement is a cost center. The ROI must be demonstrable through energy savings, occupancy improvement, or operational efficiency.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['iot', 'smart-building', 'digital-twin', 'automation'], target: ['energy-savings', 'noi-improvement', 'capex-reduction', 'tenant-retention'] },
      reasonTemplate: 'PropTech ROI flows through three channels: (1) Energy reduction 15-30% via smart HVAC/lighting, (2) Predictive maintenance reducing emergency capex by 20-40%, (3) Tenant experience driving 10-15% higher retention. Combined: 5-10% NOI improvement on a well-instrumented building.' },
  ],

  patterns: [
    { name: 'PropTech Stack Layers', domains: ['engineering', 'product'], description: 'Layer 1: IoT sensors and BMS (building management systems). Layer 2: Data platform (aggregation, normalization, storage). Layer 3: Analytics (energy optimization, space utilization, predictive maintenance). Layer 4: Tenant experience (mobile app, amenity booking, community). Layer 5: Investment platform (tokenization, crowdfunding, data-driven underwriting).', observed: 78, expected: 30, total: 100 },
    { name: 'PropTech Market Map', domains: ['strategy', 'finance'], description: 'Construction tech: $20B+ market (modular, 3D printing, project management). Property management: $15B+ (smart buildings, tenant platforms). Investment tech: $10B+ (crowdfunding, tokenization, data analytics). Brokerage tech: $8B+ (virtual tours, AI matching, transaction management). Climate tech: fastest growing segment (ESG compliance, carbon tracking).', observed: 75, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'noi_improvement', expectedChange: 0.08, timeframeDays: 365, condition: 'smart_building_deployed AND tenant_platform_active' },
  ],

  narrative: `PropTech is transforming real estate from the most analog industry to increasingly data-driven operations. Smart buildings with IoT deliver 15-30% energy savings — the clearest ROI. Digital twins enable predictive maintenance, reducing emergency capex 20-40%. Tenant experience platforms drive higher retention in competitive markets. The investment layer — tokenization and crowdfunding — promises liquidity for an illiquid asset class, though adoption is early. The biggest opportunity: using data to optimize leasing, pricing, and capital allocation across portfolios.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const REAL_ESTATE_PACKS: TrainingPack[] = [
  propertyValuationCycles,
  creitAnalysis,
  proptechDigital,
];
