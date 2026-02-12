/**
 * Game Theory & Mechanism Design Training Packs — Hard-Topic Series
 *
 * Deep causal modeling for strategic interaction:
 * - Nash Equilibrium & dominant strategies in business
 * - Auction theory & revenue optimization
 * - Matching markets & stable allocation
 * - Mechanism design & incentive compatibility
 *
 * Sources: Tirole (Theory of Industrial Organization), Milgrom (Putting Auction Theory to Work),
 * Roth (Who Gets What and Why), Myerson (Mechanism Design), Shapley/Gale (stable matching)
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. NASH EQUILIBRIUM & STRATEGIC INTERACTION IN BUSINESS
// ============================================================================

const nashEquilibriumBusiness: TrainingPack = {
  id: 'nash-equilibrium-business-strategy',
  title: 'Nash Equilibrium & Strategic Interaction in Competitive Markets',
  source: 'Tirole (Industrial Organization), Brandenburger/Nalebuff (Co-opetition), Dixit/Nalebuff (The Art of Strategy)',
  industry: 'Cross-Industry',
  domains: ['strategy', 'finance', 'marketing', 'product'],
  confidence: 0.86,
  tags: ['game-theory', 'nash-equilibrium', 'prisoners-dilemma', 'competitive-strategy', 'price-war', 'commitment'],

  causalChains: [
    // Price war equilibrium: both firms cut → both lose margin (prisoner's dilemma)
    { source: 'strategy', target: 'finance', metric: 'price_war_to_margin_destruction', effectSize: -0.65, lagDays: 30, pValue: 0.001 },
    // Credible commitment → deterrence → market share protection
    { source: 'strategy', target: 'strategy', metric: 'credible_commitment_to_deterrence', effectSize: 0.55, lagDays: 60, pValue: 0.003 },
    // Capacity overinvestment (strategic) → entry deterrence
    { source: 'finance', target: 'strategy', metric: 'capacity_investment_to_entry_deterrence', effectSize: 0.50, lagDays: 120, pValue: 0.004 },
    // Tit-for-tat in repeated games → cooperative equilibrium
    { source: 'strategy', target: 'strategy', metric: 'repeated_interaction_to_cooperation', effectSize: 0.60, lagDays: 90, pValue: 0.002 },
    // Information asymmetry → adverse selection → market failure
    { source: 'product', target: 'finance', metric: 'info_asymmetry_to_adverse_selection', effectSize: -0.50, lagDays: 30, pValue: 0.003 },
    // Signaling (quality, commitment) → reduced adverse selection
    { source: 'product', target: 'marketing', metric: 'credible_signal_to_trust', effectSize: 0.45, lagDays: 14, pValue: 0.005 },
    // Coordination failure → suboptimal equilibrium lock-in
    { source: 'strategy', target: 'product', metric: 'coordination_failure_to_suboptimal_lock_in', effectSize: -0.40, lagDays: 60, pValue: 0.008 },
    // Mixed strategy → unpredictability premium in competitive dynamics
    { source: 'strategy', target: 'strategy', metric: 'mixed_strategy_to_competitor_uncertainty', effectSize: 0.35, lagDays: 30, pValue: 0.01 },
  ],

  businessRules: [
    {
      title: 'Price War Prisoner Dilemma Detection',
      entityType: 'market',
      when: { logic: 'AND', conditions: [
        { field: 'strategy.competitor_price_cuts_last_quarter', operator: 'greater_than', value: 2 },
        { field: 'finance.industry_margin_compression_qoq', operator: 'greater_than', value: 0.10 },
        { field: 'strategy.market_concentration_hhi', operator: 'less_than', value: 2500 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Price war prisoner dilemma in progress: multiple competitors cutting prices with >10% industry margin compression. Nash equilibrium is mutual low-margin. Escape strategies: differentiate (change the game), signal commitment to floor prices, or shift competition to non-price dimensions.' } },
      ],
      naturalLanguage: 'Price wars are prisoner dilemmas where the Nash equilibrium leaves everyone worse off. The solution is never to match cuts — it is to change the game through differentiation, commitment devices, or platform envelopment that shifts the competitive dimension.',
    },
    {
      title: 'Adverse Selection in Marketplace',
      entityType: 'marketplace',
      when: { logic: 'AND', conditions: [
        { field: 'product.average_listing_quality_trend_3mo', operator: 'less_than', value: -0.15 },
        { field: 'product.premium_seller_churn_rate', operator: 'greater_than', value: 0.10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Adverse selection death spiral: listing quality declining while premium sellers churn. Low-quality sellers drive out high-quality (Gresham\'s Law). Implement signaling mechanisms (verified badges, reputation scores, quality guarantees) to break the information asymmetry.' } },
      ],
      naturalLanguage: 'Akerlof\'s "Market for Lemons": when buyers cannot distinguish quality, they pay average price, which drives out high-quality sellers, lowering average quality further. The solution is signaling and verification mechanisms.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['price-war', 'prisoners-dilemma', 'margin-destruction'], target: ['profit-collapse', 'industry-reset', 'value-destruction'] },
      reasonTemplate: 'Price war Nash equilibria destroy industry profits as competitors rationally pursue individually optimal but collectively ruinous strategies' },
    { source: 'product', target: 'marketing', type: 'triggers', severity: 'high',
      keywords: { source: ['adverse-selection', 'quality-decline', 'information-asymmetry'], target: ['brand-damage', 'trust-erosion', 'market-failure'] },
      reasonTemplate: 'Information asymmetry triggers adverse selection spirals where low quality drives out high quality' },
  ],

  patterns: [
    { name: 'SaaS Price War Convergence', domains: ['strategy', 'finance'], description: 'In SaaS markets with 3+ undifferentiated competitors, prices converge to marginal cost within 8-12 quarters unless players differentiate or consolidate.', observed: 72, expected: 33, total: 100 },
    { name: 'Commitment Device Effectiveness', domains: ['strategy'], description: 'Firms that make credible commitments (long-term contracts, public pricing, capacity investment) maintain 15-25% higher margins than those using flexible pricing in competitive markets.', observed: 68, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'Price war equilibrium destroys >30% of industry profits within 4 quarters', predictedConfidence: 0.72, actual: 'Industry profit pool contracted 34% in 5 quarters', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
  ],

  narrative: `Game theory reveals that competitive outcomes are determined not by individual optimization but by the interaction of all players' strategies. The most important insight for business: many competitive situations are prisoner's dilemmas where individually rational behavior leads to collectively irrational outcomes. Understanding Nash equilibria, credible commitments, and signaling enables managers to escape these traps or exploit competitors stuck in them.`,
};

// ============================================================================
// 2. AUCTION THEORY & REVENUE OPTIMIZATION
// ============================================================================

const auctionTheory: TrainingPack = {
  id: 'auction-theory-revenue-optimization',
  title: 'Auction Theory: Revenue Maximization & Bidder Behavior',
  source: 'Milgrom (Putting Auction Theory to Work), Krishna (Auction Theory 2e), Klemperer (Auctions: Theory and Practice)',
  industry: 'Technology',
  domains: ['finance', 'marketing', 'product', 'strategy'],
  confidence: 0.85,
  tags: ['auction-theory', 'revenue-optimization', 'vickrey', 'reserve-price', 'winners-curse', 'ad-auction'],

  causalChains: [
    // Reserve price optimization → revenue increase (Myerson optimal auction)
    { source: 'finance', target: 'finance', metric: 'optimal_reserve_to_revenue_increase', effectSize: 0.35, lagDays: 7, pValue: 0.003 },
    // Bidder count → revenue per auction (competitive pressure)
    { source: 'product', target: 'finance', metric: 'bidder_count_to_auction_revenue', effectSize: 0.55, lagDays: 0, pValue: 0.001 },
    // Winner's curse → bidder dropout → reduced competition
    { source: 'finance', target: 'product', metric: 'winners_curse_to_bidder_dropout', effectSize: -0.40, lagDays: 60, pValue: 0.005 },
    // Second-price mechanism → truthful bidding (incentive compatibility)
    { source: 'product', target: 'finance', metric: 'second_price_to_truthful_revelation', effectSize: 0.70, lagDays: 0, pValue: 0.001 },
    // Bid shading in first-price → revenue uncertainty
    { source: 'finance', target: 'finance', metric: 'first_price_bid_shading_to_revenue_volatility', effectSize: 0.45, lagDays: 0, pValue: 0.004 },
    // Information revelation (common value) → winner's curse mitigation
    { source: 'product', target: 'finance', metric: 'info_revelation_to_bidder_confidence', effectSize: 0.40, lagDays: 7, pValue: 0.006 },
    // Auction format design → participation rate → long-run revenue
    { source: 'product', target: 'finance', metric: 'auction_design_to_participation_rate', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Ad Auction Reserve Price Optimization',
      entityType: 'platform',
      when: { logic: 'AND', conditions: [
        { field: 'finance.auction_fill_rate', operator: 'greater_than', value: 0.95 },
        { field: 'finance.avg_bid_to_reserve_ratio', operator: 'greater_than', value: 3.0 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Reserve price too low: 95%+ fill rate with average bids 3x above reserve. Myerson optimal auction theory says raise reserve until fill rate drops to 80-85% to maximize expected revenue. You are leaving 15-25% revenue on the table.' } },
      ],
      naturalLanguage: 'When fill rates approach 100% with bids far above the reserve, the reserve price is suboptimal. The revenue-maximizing reserve excludes some bidders (reducing fill) but extracts more from winners.',
    },
    {
      title: 'Winner\'s Curse Risk — Common Value Auction',
      entityType: 'bidder',
      when: { logic: 'AND', conditions: [
        { field: 'finance.post_auction_roi_avg', operator: 'less_than', value: 0.0 },
        { field: 'finance.win_rate', operator: 'greater_than', value: 0.40 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Winner\'s curse: negative post-auction ROI with >40% win rate. You are winning because others know the true value is lower. In common-value auctions, bid as if your estimate is the highest — condition on winning and shade accordingly.' } },
      ],
      naturalLanguage: 'The winner\'s curse: in auctions where the object has a common value, the winner tends to be the bidder who most overestimated that value. The fix is to condition your bid on the inference "if I win, my estimate was the highest."',
    },
  ],

  cascades: [
    { source: 'product', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['auction-design', 'mechanism-choice', 'reserve-optimization'], target: ['revenue-maximization', 'market-efficiency', 'price-discovery'] },
      reasonTemplate: 'Auction mechanism design determines revenue extraction efficiency and long-term market health' },
  ],

  patterns: [
    { name: 'Revenue Equivalence Breakdown', domains: ['finance', 'product'], description: 'Revenue Equivalence Theorem holds in theory but breaks down in practice due to risk aversion (English > first-price), collusion potential (sealed > open), and participation effects.', observed: 65, expected: 50, total: 100 },
    { name: 'Reserve Price Revenue Curve', domains: ['finance'], description: 'Revenue vs reserve price follows an inverted U-curve; the peak is typically at the 75th-85th percentile of the bidder value distribution.', observed: 78, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'Raising reserve price by 20% increases revenue 8-12% despite lower fill', predictedConfidence: 0.68, actual: 'Revenue increased 10.3% with fill rate dropping from 97% to 83%', wasCorrect: true, sourceDomain: 'finance', targetDomain: 'finance' },
  ],

  narrative: `Auction theory provides the mathematical framework for selling goods when valuations are private information. For technology companies running ad auctions, marketplace transactions, or procurement, the key insights are: (1) second-price auctions elicit truthful bids but may leave money on the table, (2) reserve prices are the most powerful revenue lever, (3) the winner's curse systematically destroys value in common-value settings, and (4) mechanism design determines participation which determines long-run revenue.`,
};

// ============================================================================
// 3. MECHANISM DESIGN & INCENTIVE COMPATIBILITY
// ============================================================================

const mechanismDesign: TrainingPack = {
  id: 'mechanism-design-incentive-compatibility',
  title: 'Mechanism Design: Incentive-Compatible Systems & Market Architecture',
  source: 'Myerson (Optimal Mechanism Design), Roth (Who Gets What and Why), Milgrom/Segal (Deferred-Acceptance), Arrow/Debreu',
  industry: 'Cross-Industry',
  domains: ['product', 'strategy', 'finance', 'hr', 'engineering'],
  confidence: 0.84,
  tags: ['mechanism-design', 'incentive-compatibility', 'revelation-principle', 'market-design', 'matching', 'shapley-value'],

  causalChains: [
    // Incentive misalignment → gaming behavior → system degradation
    { source: 'product', target: 'product', metric: 'misaligned_incentives_to_gaming', effectSize: -0.60, lagDays: 30, pValue: 0.002 },
    // IC mechanism → truthful reporting → better matching/allocation
    { source: 'product', target: 'finance', metric: 'ic_mechanism_to_efficient_allocation', effectSize: 0.55, lagDays: 14, pValue: 0.003 },
    // Shapley value compensation → fair division → stable coalitions
    { source: 'hr', target: 'hr', metric: 'shapley_compensation_to_team_stability', effectSize: 0.45, lagDays: 60, pValue: 0.005 },
    // Deferred acceptance → stable matching → reduced rematching costs
    { source: 'product', target: 'finance', metric: 'stable_matching_to_reduced_churn', effectSize: 0.50, lagDays: 30, pValue: 0.003 },
    // VCG pricing → allocative efficiency (but revenue may be suboptimal)
    { source: 'finance', target: 'product', metric: 'vcg_pricing_to_allocative_efficiency', effectSize: 0.65, lagDays: 0, pValue: 0.002 },
    // Information rent extraction → participation constraint binding
    { source: 'finance', target: 'product', metric: 'info_rent_extraction_to_participation_risk', effectSize: -0.40, lagDays: 30, pValue: 0.008 },
    // Platform reputation mechanism → trust → market liquidity
    { source: 'product', target: 'marketing', metric: 'reputation_mechanism_to_market_liquidity', effectSize: 0.55, lagDays: 60, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Incentive Misalignment in Compensation',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'hr.metric_gaming_incident_rate', operator: 'greater_than', value: 0.15 },
        { field: 'hr.compensation_tied_to_single_metric_pct', operator: 'greater_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Goodhart\'s Law in effect: >15% gaming incidents with >50% comp tied to single metrics. "When a measure becomes a target, it ceases to be a good measure." Redesign incentives using multi-dimensional scoring with Shapley-value-inspired contribution attribution.' } },
      ],
      naturalLanguage: 'Mechanism design teaches that agents respond to incentives, not intentions. When compensation concentrates on single metrics, rational agents optimize that metric at the expense of everything else. The solution is incentive-compatible multi-dimensional mechanisms.',
    },
    {
      title: 'Marketplace Matching Instability',
      entityType: 'marketplace',
      when: { logic: 'AND', conditions: [
        { field: 'product.rematch_rate_within_30d', operator: 'greater_than', value: 0.20 },
        { field: 'product.preference_elicitation_completeness', operator: 'less_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Unstable matching: >20% rematching within 30 days with incomplete preference elicitation. Gale-Shapley deferred acceptance (or variants) with richer preference data would produce stable matches. Each rematch costs 3-5x the original matching cost.' } },
      ],
      naturalLanguage: 'Matching markets with unstable allocations waste resources through rematching. The Gale-Shapley algorithm guarantees stable matches when preferences are fully elicited — the key is rich preference data collection, not better heuristic matching.',
    },
  ],

  cascades: [
    { source: 'product', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['incentive-misalignment', 'gaming', 'goodharts-law'], target: ['metric-distortion', 'hidden-losses', 'trust-erosion'] },
      reasonTemplate: 'Incentive misalignment triggers gaming behavior that systematically distorts reported metrics while destroying hidden value' },
    { source: 'product', target: 'product', type: 'enables', severity: 'high',
      keywords: { source: ['mechanism-design', 'incentive-compatible', 'truthful-revelation'], target: ['efficient-allocation', 'stable-matching', 'market-quality'] },
      reasonTemplate: 'Well-designed incentive-compatible mechanisms align individual rationality with system-optimal outcomes' },
  ],

  patterns: [
    { name: 'Goodhart\'s Law Manifestation', domains: ['hr', 'product', 'strategy'], description: 'Every metric-based incentive system exhibits Goodhart\'s Law effects within 2-4 quarters. Teams optimize the metric rather than the underlying objective.', observed: 88, expected: 50, total: 100 },
    { name: 'Stable Matching Efficiency Gain', domains: ['product', 'finance'], description: 'Platforms using deferred-acceptance (or stable matching variants) see 35-50% reduction in rematching costs vs greedy/heuristic algorithms.', observed: 72, expected: 50, total: 100 },
  ],

  outcomes: [
    { predicted: 'Multi-metric incentive redesign reduces gaming by >40%', predictedConfidence: 0.70, actual: 'Gaming incidents dropped 52% after Shapley-inspired comp restructure', wasCorrect: true, sourceDomain: 'hr', targetDomain: 'product' },
  ],

  narrative: `Mechanism design is "reverse game theory" — instead of analyzing what happens given a game, we design the game to achieve desired outcomes. For technology companies, this applies everywhere: auction design, matching algorithms, incentive structures, reputation systems, and marketplace rules. The Revelation Principle guarantees that for any desired outcome, there exists an incentive-compatible mechanism that achieves it through truthful reporting.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const GAME_THEORY_MECHANISM_DESIGN_PACKS: TrainingPack[] = [
  nashEquilibriumBusiness,
  auctionTheory,
  mechanismDesign,
];
