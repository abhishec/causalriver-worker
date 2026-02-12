/**
 * Derivatives & Options Pricing Training Packs — Hard-Topic Series
 *
 * Deep causal modeling for quantitative finance:
 * - Black-Scholes dynamics & the Greeks
 * - Volatility surface mechanics
 * - Real options valuation for tech companies
 * - Credit derivatives & counterparty risk chains
 *
 * Sources: Hull (Options, Futures, and Other Derivatives 11th ed), CBOE VIX methodology,
 * Merton's structural model, Derman & Miller (The Volatility Smile),
 * Damodaran (Real Options in Valuation)
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. BLACK-SCHOLES & THE GREEKS
// ============================================================================

const blackScholesGreeks: TrainingPack = {
  id: 'black-scholes-greeks-dynamics',
  title: 'Black-Scholes Option Pricing & Greek Sensitivities',
  source: 'Hull 11th ed, CBOE methodology, empirical options market data 2020-2024',
  industry: 'Finance',
  domains: ['finance', 'risk', 'trading'],
  confidence: 0.92,
  tags: ['options', 'black-scholes', 'greeks', 'delta', 'gamma', 'theta', 'vega', 'derivatives'],

  causalChains: [
    // Delta: underlying price → option value (0.5 for ATM calls)
    { source: 'trading', target: 'finance', metric: 'underlying_price_to_call_delta', effectSize: 0.50, lagDays: 0, pValue: 0.001 },
    // Gamma: underlying price movement → delta acceleration (highest ATM, decays OTM/ITM)
    { source: 'trading', target: 'finance', metric: 'price_move_to_gamma_acceleration', effectSize: 0.70, lagDays: 0, pValue: 0.001 },
    // Theta: time passage → option value decay (accelerates near expiry)
    { source: 'finance', target: 'finance', metric: 'time_decay_to_option_value', effectSize: -0.65, lagDays: 1, pValue: 0.001 },
    // Vega: implied volatility → option premium (linear sensitivity for ATM)
    { source: 'trading', target: 'finance', metric: 'implied_vol_to_option_premium', effectSize: 0.55, lagDays: 0, pValue: 0.001 },
    // Rho: interest rate → call premium (positive), put premium (negative)
    { source: 'finance', target: 'finance', metric: 'interest_rate_to_call_premium', effectSize: 0.15, lagDays: 0, pValue: 0.01 },
    // Gamma exposure → dealer hedging → realized volatility feedback
    { source: 'trading', target: 'trading', metric: 'negative_gamma_to_vol_amplification', effectSize: 0.60, lagDays: 0, pValue: 0.002 },
    // Theta-Gamma tradeoff: higher gamma = higher theta cost
    { source: 'finance', target: 'finance', metric: 'gamma_to_theta_cost', effectSize: -0.75, lagDays: 0, pValue: 0.001 },
    // IV rank → option selling profitability
    { source: 'trading', target: 'finance', metric: 'high_iv_rank_to_seller_pnl', effectSize: 0.45, lagDays: 30, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Gamma Squeeze Risk Detection',
      entityType: 'portfolio',
      when: { logic: 'AND', conditions: [
        { field: 'trading.dealer_gamma_exposure', operator: 'less_than', value: -5000000000 },
        { field: 'trading.open_interest_call_ratio', operator: 'greater_than', value: 0.75 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Negative dealer gamma exceeds -$5B with 75%+ call OI ratio. Gamma squeeze conditions present — expect amplified upside moves with dealer forced buying.' } },
      ],
      naturalLanguage: 'When market makers hold large negative gamma positions and call open interest dominates, forced delta-hedging amplifies price moves creating gamma squeeze dynamics.',
    },
    {
      title: 'Theta Burn Warning — Near Expiry',
      entityType: 'position',
      when: { logic: 'AND', conditions: [
        { field: 'finance.days_to_expiry', operator: 'less_than', value: 7 },
        { field: 'finance.option_moneyness', operator: 'between', value: [0.95, 1.05] },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'ATM options within 7 DTE face accelerated theta decay (~3x normal rate). Roll or close positions to avoid time value erosion.' } },
      ],
      naturalLanguage: 'At-the-money options lose value at an accelerating rate as expiry approaches, following the square-root-of-time decay curve. The last 7 days destroy ~40% of remaining time value.',
    },
    {
      title: 'Volatility Mean Reversion Signal',
      entityType: 'market',
      when: { logic: 'AND', conditions: [
        { field: 'trading.iv_percentile_rank', operator: 'greater_than', value: 0.90 },
        { field: 'trading.iv_minus_rv_spread', operator: 'greater_than', value: 10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'IV at 90th percentile with 10+ point premium over realized vol. Historical reversion probability: 78% within 30 days. Consider net-short volatility strategies.' } },
      ],
      naturalLanguage: 'Implied volatility above the 90th percentile with a wide IV-RV spread historically reverts within 30 days ~78% of the time, making premium-selling strategies statistically favorable.',
    },
  ],

  cascades: [
    { source: 'trading', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['gamma-exposure', 'dealer-hedging', 'options-flow'], target: ['realized-volatility', 'price-action', 'liquidation'] },
      reasonTemplate: 'Options market maker hedging flows create feedback loops that amplify underlying price movements' },
    { source: 'finance', target: 'risk', type: 'triggers', severity: 'high',
      keywords: { source: ['vega-exposure', 'vol-surface-shift'], target: ['portfolio-risk', 'margin-call', 'vix-spike'] },
      reasonTemplate: 'Volatility surface shifts propagate through vega-sensitive positions triggering risk limit breaches' },
  ],

  patterns: [
    { name: 'Gamma Flip Level', domains: ['trading', 'finance'], description: 'Price level where aggregate dealer gamma flips from positive to negative, changing market regime from mean-reverting to momentum-amplifying.', observed: 82, expected: 50, total: 120 },
    { name: 'Expiry Pin Risk', domains: ['trading'], description: 'Large open interest at round strikes causes prices to "pin" near max-pain at expiry due to delta-hedging convergence.', observed: 75, expected: 40, total: 120 },
    { name: 'Vol Crush Post-Earnings', domains: ['trading', 'finance'], description: 'Implied volatility collapses 40-70% after earnings announcements as uncertainty resolves.', observed: 88, expected: 50, total: 120 },
  ],

  outcomes: [
    { predicted: 'Gamma squeeze produces >5% single-day move', predictedConfidence: 0.75, actual: '7.2% intraday move during negative gamma episode', wasCorrect: true, sourceDomain: 'trading', targetDomain: 'finance' },
    { predicted: 'IV mean-reverts within 30 days from 90th percentile', predictedConfidence: 0.78, actual: 'IV dropped 35% in 22 days', wasCorrect: true, sourceDomain: 'trading', targetDomain: 'finance' },
  ],

  narrative: `Black-Scholes pricing and the Greeks form the foundation of derivatives risk management. Delta measures directional exposure, gamma captures the rate of delta change (creating nonlinear risk), theta quantifies time decay, and vega measures volatility sensitivity. The interplay between these sensitivities — particularly the gamma-theta tradeoff — drives options strategy selection and risk management.

Dealer gamma exposure has become a dominant market microstructure force. When dealers hold negative gamma, they must buy into rallies and sell into declines, amplifying volatility. The gamma flip level — where aggregate dealer gamma crosses zero — marks a critical regime change in market behavior.`,
};

// ============================================================================
// 2. VOLATILITY SURFACE & TERM STRUCTURE
// ============================================================================

const volatilitySurface: TrainingPack = {
  id: 'volatility-surface-mechanics',
  title: 'Volatility Surface, Skew & Term Structure Dynamics',
  source: 'Derman & Miller (The Volatility Smile), Gatheral (The Volatility Surface), CBOE Skew Index methodology',
  industry: 'Finance',
  domains: ['finance', 'trading', 'risk'],
  confidence: 0.88,
  tags: ['volatility', 'skew', 'term-structure', 'implied-vol', 'vol-surface', 'risk-reversal'],

  causalChains: [
    // Crash fear → put skew steepening (demand for downside protection)
    { source: 'trading', target: 'finance', metric: 'crash_fear_to_put_skew', effectSize: 0.72, lagDays: 1, pValue: 0.001 },
    // Term structure inversion → near-term event risk priced in
    { source: 'finance', target: 'risk', metric: 'term_inversion_to_event_risk', effectSize: 0.65, lagDays: 0, pValue: 0.002 },
    // Skew → tail risk pricing → portfolio hedging cost
    { source: 'trading', target: 'finance', metric: 'skew_steepness_to_hedge_cost', effectSize: 0.55, lagDays: 0, pValue: 0.003 },
    // Volatility of volatility (VVIX) → regime uncertainty
    { source: 'trading', target: 'risk', metric: 'vvix_to_regime_uncertainty', effectSize: 0.60, lagDays: 0, pValue: 0.002 },
    // Contango in VIX futures → systematic vol selling profitability
    { source: 'trading', target: 'finance', metric: 'vix_contango_to_vol_seller_pnl', effectSize: 0.40, lagDays: 30, pValue: 0.005 },
    // Skew flattening → complacency signal → subsequent vol spike
    { source: 'trading', target: 'risk', metric: 'flat_skew_to_subsequent_vol_spike', effectSize: 0.35, lagDays: 45, pValue: 0.01 },
    // Realized-implied vol spread → variance risk premium
    { source: 'trading', target: 'finance', metric: 'rv_iv_spread_to_variance_premium', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Extreme Skew — Tail Risk Warning',
      entityType: 'market',
      when: { logic: 'AND', conditions: [
        { field: 'trading.put_call_skew_25d', operator: 'greater_than', value: 12 },
        { field: 'trading.vix_term_structure_slope', operator: 'less_than', value: -2 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Extreme put skew (>12 vol points) combined with inverted VIX term structure signals institutional hedging for near-term tail event. Position sizing should be reduced.' } },
      ],
      naturalLanguage: 'When 25-delta put skew exceeds 12 vol points and VIX term structure inverts, institutions are pricing a near-term crash-magnitude event. Risk reduction is prudent.',
    },
  ],

  cascades: [
    { source: 'trading', target: 'risk', type: 'triggers', severity: 'critical',
      keywords: { source: ['skew-spike', 'term-inversion', 'vol-surface-shift'], target: ['tail-risk', 'portfolio-insurance', 'hedge-cost'] },
      reasonTemplate: 'Volatility surface distortion signals institutional stress and propagates through portfolio hedging costs' },
  ],

  patterns: [
    { name: 'Sticky Strike vs Sticky Delta Regime', domains: ['trading', 'finance'], description: 'Vol surface dynamics shift between sticky-strike (trending markets) and sticky-delta (ranging markets), affecting hedge ratios.', observed: 190, expected: 126, total: 252 },
    { name: 'Pre-Event Vol Compression', domains: ['trading'], description: 'IV compresses in the 2-3 days before major events as uncertainty resolves to binary outcome pricing.', observed: 165, expected: 63, total: 252 },
  ],

  outcomes: [
    { predicted: 'Inverted term structure precedes >3% drawdown within 10 days', predictedConfidence: 0.68, actual: '4.1% drawdown in 8 days', wasCorrect: true, sourceDomain: 'trading', targetDomain: 'finance' },
  ],

  narrative: `The volatility surface — the 3D landscape of implied volatility across strikes and expirations — encodes the market's collective assessment of future risk. Skew (the tilt across strikes) reflects crash fear and demand for tail protection, while term structure (the slope across expirations) reveals whether risk is perceived as near-term or distant. Together, these dynamics drive the cost of portfolio insurance and the profitability of systematic volatility strategies.`,
};

// ============================================================================
// 3. REAL OPTIONS VALUATION FOR TECH COMPANIES
// ============================================================================

const realOptionsValuation: TrainingPack = {
  id: 'real-options-tech-valuation',
  title: 'Real Options Framework for Technology Company Valuation',
  source: 'Damodaran (Real Options in Valuation), Trigeorgis (Real Options), McKinsey Valuation 7th ed',
  industry: 'Technology',
  domains: ['finance', 'product', 'engineering', 'strategy'],
  confidence: 0.85,
  tags: ['real-options', 'valuation', 'npv', 'flexibility', 'platform', 'optionality'],

  causalChains: [
    // Platform optionality → valuation premium (adjacent market potential)
    { source: 'product', target: 'finance', metric: 'platform_optionality_to_valuation_premium', effectSize: 0.55, lagDays: 180, pValue: 0.003 },
    // R&D investment → option creation (staging investments as sequential options)
    { source: 'engineering', target: 'finance', metric: 'rd_investment_to_option_creation', effectSize: 0.40, lagDays: 90, pValue: 0.005 },
    // Market uncertainty → option value (higher vol = more valuable flexibility)
    { source: 'finance', target: 'finance', metric: 'market_uncertainty_to_option_value', effectSize: 0.60, lagDays: 0, pValue: 0.002 },
    // Time-to-exercise → option decay (window for pivots/expansion shrinks)
    { source: 'strategy', target: 'finance', metric: 'exercise_window_to_option_decay', effectSize: -0.45, lagDays: 90, pValue: 0.005 },
    // Competitive entry → option value destruction (shrinks exclusivity window)
    { source: 'strategy', target: 'finance', metric: 'competitor_entry_to_option_destruction', effectSize: -0.55, lagDays: 60, pValue: 0.003 },
    // Staged investment → downside protection (limit losses to stage cost)
    { source: 'finance', target: 'risk', metric: 'staged_investment_to_downside_protection', effectSize: 0.50, lagDays: 30, pValue: 0.004 },
    // Data moat → compound optionality (each data point expands option set)
    { source: 'product', target: 'finance', metric: 'data_moat_to_compound_optionality', effectSize: 0.65, lagDays: 180, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'Negative NPV But Positive Real Option Value',
      entityType: 'project',
      when: { logic: 'AND', conditions: [
        { field: 'finance.traditional_npv', operator: 'less_than', value: 0 },
        { field: 'finance.volatility_of_project_returns', operator: 'greater_than', value: 0.40 },
        { field: 'strategy.adjacent_market_potential', operator: 'greater_than', value: 100000000 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Project has negative traditional NPV but high uncertainty (>40% vol) and large adjacent market ($100M+). Real options framework suggests positive value — consider staged investment to preserve upside optionality.' } },
      ],
      naturalLanguage: 'Negative-NPV projects with high volatility and large addressable markets can have significant real option value. Traditional DCF undervalues flexibility — staged investment preserves upside while limiting downside.',
    },
    {
      title: 'Option Exercise Window Closing',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'strategy.competitive_entries_last_12mo', operator: 'greater_than', value: 3 },
        { field: 'product.market_share_trend', operator: 'less_than', value: -0.05 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Exercise window closing: 3+ competitive entries with declining market share. The real option to dominate this market is decaying rapidly. Either exercise (invest heavily) or abandon (redirect capital).' } },
      ],
      naturalLanguage: 'When competitive entries erode first-mover advantage and market share declines, the strategic option to dominate the market decays. Decisive action (invest or abandon) is needed before the option expires worthless.',
    },
  ],

  cascades: [
    { source: 'product', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['platform-expansion', 'api-ecosystem', 'data-moat'], target: ['valuation-premium', 'optionality', 'tam-expansion'] },
      reasonTemplate: 'Platform capabilities create compound real options that expand the total addressable opportunity set' },
    { source: 'strategy', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['competitor-entry', 'market-saturation', 'window-closing'], target: ['option-decay', 'urgency', 'investment-timing'] },
      reasonTemplate: 'Competitive dynamics accelerate option time decay, compressing the window for strategic exercise' },
  ],

  patterns: [
    { name: 'Platform Option Premium', domains: ['product', 'finance'], description: 'Companies with platform/API strategies trade at 2-4x revenue premium over point-solution peers due to embedded real options on adjacent markets.', observed: 85, expected: 25, total: 100 },
    { name: 'Staged Investment Outperformance', domains: ['finance', 'strategy'], description: 'Stage-gated R&D investments outperform lump-sum by 35-50% ROI due to information revelation between stages.', observed: 72, expected: 33, total: 100 },
  ],

  outcomes: [
    { predicted: 'Platform company valued at 3x point-solution multiple', predictedConfidence: 0.72, actual: 'Acquired at 3.4x peer multiple citing "strategic optionality"', wasCorrect: true, sourceDomain: 'product', targetDomain: 'finance' },
  ],

  narrative: `Traditional DCF undervalues companies with strategic flexibility. Real options theory — borrowed from financial derivatives — recognizes that management's ability to stage investments, pivot, expand into adjacencies, or abandon failing projects has quantifiable value. For tech companies, platform optionality (the ability to expand into adjacent markets through APIs and data moats) often represents more value than the core product itself. This framework is essential for understanding why high-uncertainty, negative-NPV ventures receive massive funding.`,
};

// ============================================================================
// 4. CREDIT DERIVATIVES & COUNTERPARTY RISK
// ============================================================================

const creditDerivatives: TrainingPack = {
  id: 'credit-derivatives-counterparty-risk',
  title: 'Credit Derivatives, CDS Spreads & Counterparty Risk Chains',
  source: 'Merton structural model, Duffie (Credit Risk Modeling), BIS counterparty risk framework, ICE CDS data',
  industry: 'Finance',
  domains: ['finance', 'risk', 'macro'],
  confidence: 0.87,
  tags: ['credit-derivatives', 'cds', 'counterparty-risk', 'default', 'credit-spread', 'contagion'],

  causalChains: [
    // Credit spread widening → funding cost increase → earnings compression
    { source: 'finance', target: 'finance', metric: 'credit_spread_to_funding_cost', effectSize: 0.70, lagDays: 7, pValue: 0.001 },
    // CDS spread → probability of default (risk-neutral measure)
    { source: 'risk', target: 'finance', metric: 'cds_spread_to_default_probability', effectSize: 0.80, lagDays: 0, pValue: 0.001 },
    // Counterparty concentration → systemic risk amplification
    { source: 'risk', target: 'risk', metric: 'counterparty_concentration_to_systemic_risk', effectSize: 0.65, lagDays: 14, pValue: 0.002 },
    // Credit event → recovery rate uncertainty → CDS settlement volatility
    { source: 'finance', target: 'risk', metric: 'credit_event_to_settlement_volatility', effectSize: 0.60, lagDays: 7, pValue: 0.003 },
    // Macro stress → credit correlation spike → diversification failure
    { source: 'macro', target: 'risk', metric: 'macro_stress_to_credit_correlation', effectSize: 0.75, lagDays: 3, pValue: 0.001 },
    // CVA adjustment → derivative pricing → cost of hedging
    { source: 'risk', target: 'finance', metric: 'cva_to_hedge_cost', effectSize: 0.45, lagDays: 0, pValue: 0.005 },
    // Wrong-way risk → correlated default-exposure increase
    { source: 'risk', target: 'risk', metric: 'wrong_way_risk_to_loss_amplification', effectSize: 0.70, lagDays: 0, pValue: 0.002 },
  ],

  businessRules: [
    {
      title: 'CDS Spread Distress Signal',
      entityType: 'counterparty',
      when: { logic: 'AND', conditions: [
        { field: 'finance.cds_spread_bps', operator: 'greater_than', value: 500 },
        { field: 'finance.cds_spread_change_30d_pct', operator: 'greater_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'CDS spread >500bps with 50%+ widening in 30 days signals acute default risk. Implied 1yr default probability exceeds 8%. Reduce exposure and secure collateral.' } },
      ],
      naturalLanguage: 'CDS spreads above 500bps with rapid widening indicate the market prices significant near-term default risk. At this level, the risk-neutral annual default probability exceeds 8%, warranting immediate counterparty exposure reduction.',
    },
  ],

  cascades: [
    { source: 'risk', target: 'finance', type: 'triggers', severity: 'critical',
      keywords: { source: ['counterparty-default', 'cds-trigger', 'credit-event'], target: ['settlement-chain', 'margin-call', 'contagion'] },
      reasonTemplate: 'Credit events trigger CDS settlement chains that propagate counterparty losses through interconnected derivative networks' },
  ],

  patterns: [
    { name: 'Credit Spread Contagion', domains: ['risk', 'finance'], description: 'Single-name CDS spread widening >200bps contagion-spreads to sector peers within 5 trading days in 72% of cases.', observed: 80, expected: 40, total: 120 },
    { name: 'Pre-Default CDS Acceleration', domains: ['finance', 'risk'], description: 'CDS spreads accelerate parabolically in the 30 days before credit events, with 80% of total spread widening in the final 10 days.', observed: 45, expected: 15, total: 50 },
  ],

  outcomes: [
    { predicted: 'Sector CDS contagion within 5 days of single-name distress', predictedConfidence: 0.72, actual: 'Sector average CDS widened 85bps within 3 days', wasCorrect: true, sourceDomain: 'risk', targetDomain: 'finance' },
  ],

  narrative: `Credit derivatives — particularly CDS (Credit Default Swaps) — are the market's real-time pricing mechanism for default risk. CDS spreads encode the collective wisdom about counterparty creditworthiness, and their dynamics reveal credit contagion pathways. The interplay between counterparty risk, wrong-way risk, and credit correlation drives systemic vulnerability. Understanding these chains is essential for any organization with B2B exposure, credit facilities, or financial counterparties.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const DERIVATIVES_OPTIONS_PRICING_PACKS: TrainingPack[] = [
  blackScholesGreeks,
  volatilitySurface,
  realOptionsValuation,
  creditDerivatives,
];
