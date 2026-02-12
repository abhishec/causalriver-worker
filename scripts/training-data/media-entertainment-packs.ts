/**
 * Media & Entertainment Training Packs
 *
 * Media business models, content economics, and streaming dynamics:
 * - Streaming Economics & Content Investment
 * - Advertising Business Models & Attention Economy
 * - Creator Economy & Platform Dynamics
 *
 * Sources: Netflix IR, Spotify earnings, PwC Global E&M Outlook,
 * GroupM Global Ad Forecast, Deloitte TMT Predictions, Signal Fire Creator Economy
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. STREAMING ECONOMICS & CONTENT INVESTMENT
// ============================================================================

const streamingEconomics: TrainingPack = {
  id: 'streaming-economics-content-investment',
  title: 'Streaming Economics — Content Spend, Churn Dynamics, Profitability Path',
  source: 'Netflix IR, Disney+ earnings, Spotify economics, Ampere Analysis, MoffettNathanson',
  industry: 'Media & Entertainment',
  domains: ['finance', 'product', 'marketing', 'strategy'],
  confidence: 0.84,
  tags: ['streaming', 'content-spend', 'churn', 'svod', 'arpu', 'content-roi', 'subscriber'],

  causalChains: [
    // Content spend → subscriber acquisition → scale economics
    { source: 'finance', target: 'marketing', metric: 'content_spend_to_subscriber_growth', effectSize: 0.50, lagDays: 90, pValue: 0.002 },
    // Content library depth → engagement → retention
    { source: 'product', target: 'product', metric: 'library_depth_to_engagement_hours', effectSize: 0.55, lagDays: 30, pValue: 0.002 },
    // Subscriber churn → content amortization pressure → margin squeeze
    { source: 'marketing', target: 'finance', metric: 'churn_to_content_amortization_pressure', effectSize: -0.45, lagDays: 90, pValue: 0.003 },
    // Ad-tier introduction → ARPU lift → profitability acceleration
    { source: 'strategy', target: 'finance', metric: 'ad_tier_to_arpu_lift', effectSize: 0.35, lagDays: 180, pValue: 0.005 },
    // Content exclusivity → differentiation → pricing power
    { source: 'product', target: 'finance', metric: 'content_exclusivity_to_pricing_power', effectSize: 0.40, lagDays: 180, pValue: 0.003 },
    // Password sharing crackdown → paid sharing → subscriber conversion
    { source: 'strategy', target: 'finance', metric: 'password_crackdown_to_paid_conversion', effectSize: 0.30, lagDays: 90, pValue: 0.005 },
    // Multi-platform stacking → budget fatigue → selective churn
    { source: 'marketing', target: 'marketing', metric: 'platform_stacking_to_selective_churn', effectSize: 0.40, lagDays: 180, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'Content Spend Exceeds Revenue Growth',
      entityType: 'streaming_company',
      when: { logic: 'AND', conditions: [
        { field: 'finance.content_spend_growth_yoy', operator: 'greater_than', value: 0.15 },
        { field: 'finance.revenue_growth_yoy', operator: 'less_than', value: 0.10 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Content spend growing faster than revenue — unsustainable content economics. Netflix learned: content ROI must be measured per title. Key metrics: (1) Cost per viewing hour, (2) Subscriber acquisition per title, (3) Retention impact of exclusives, (4) International content arbitrage. The era of "spend to grow" is over — streaming must be profitable per subscriber.' } },
      ],
      naturalLanguage: 'When content investment outpaces revenue growth, every new subscriber becomes less profitable. The streaming war winners will be those with the best content-to-retention efficiency.',
    },
    {
      title: 'Monthly Churn Above Sustainability',
      entityType: 'streaming_company',
      when: { logic: 'AND', conditions: [
        { field: 'marketing.monthly_churn_rate', operator: 'greater_than', value: 0.05 },
        { field: 'finance.subscriber_acquisition_cost', operator: 'greater_than', value: 50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Monthly churn > 5% with SAC > $50 = negative subscriber unit economics. At 5% monthly churn, average subscriber lifetime = 20 months. If LTV (20 × ARPU) < SAC, growth destroys value. Fix: (1) Improve content discovery/personalization, (2) Add engagement features (social, gaming), (3) Bundle strategies, (4) Annual billing incentives (reduce churn 20-30%).' } },
      ],
      naturalLanguage: 'High churn with high acquisition costs means subscriber economics are underwater — each new subscriber costs more than they generate in lifetime value.',
    },
  ],

  cascades: [
    { source: 'finance', target: 'product', type: 'enables', severity: 'critical',
      keywords: { source: ['content-budget', 'content-spend', 'production', 'licensing'], target: ['library', 'originals', 'engagement', 'viewer-hours'] },
      reasonTemplate: 'Content is the product in streaming: Netflix spends $17B+ annually, Disney $30B+ across all platforms, Amazon $7B+. Content ROI varies 10x: hits cost $100-300M but drive millions of subscriber-hours. Most content is filler that completes the catalog. The key metric is cost per engaged subscriber-hour, not absolute spend.' },
    { source: 'product', target: 'marketing', type: 'impacts', severity: 'high',
      keywords: { source: ['content-quality', 'originals', 'library-depth', 'personalization'], target: ['churn', 'retention', 'word-of-mouth', 'brand'] },
      reasonTemplate: 'Content quality drives streaming retention through two mechanisms: (1) Tentpole originals create cultural moments that re-engage lapsed users, (2) Library depth provides daily viewing habits that prevent churn between tentpoles. Netflix churn drops 30% in months with major original releases.' },
  ],

  patterns: [
    { name: 'Streaming Business Model Evolution', domains: ['finance', 'strategy'], description: 'Phase 1: SVOD pure (Netflix 2013-2019) — subscription only, scale at all costs. Phase 2: Multi-tier (Netflix/Disney 2022+) — add ad-supported tier, ARPU optimization. Phase 3: Hybrid bundle (Disney+Hulu, Apple One) — reduce churn via ecosystem lock-in. Phase 4: Profitability focus — content ROI measurement, cost discipline, password crackdowns.', observed: 88, expected: 20, total: 100 },
    { name: 'Content Economics', domains: ['finance'], description: 'Original series: $5-15M per episode (premium drama). Original film: $50-200M. Licensed content: cheaper but not exclusive. Content amortization: 4-year straight-line typical. Cost per viewing hour: $0.50-$2.00 for hits, $5-20 for flops. Best ROI: international content (Korean, Spanish) at 10-20% of US production cost with global appeal.', observed: 85, expected: 25, total: 100 },
    { name: 'Streaming Churn Dynamics', domains: ['marketing', 'product'], description: 'Monthly churn: 3-5% (US SVOD average). Seasonal pattern: higher churn after tentpole ends. "Churn and return" cycle: 30% of churned subscribers return within 6 months. Annual subscriptions reduce churn 20-30% vs monthly. Bundling reduces churn 15-25%. Password sharing crackdown converts 15-20% of sharing households to paid.', observed: 82, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'subscriber_ltv', expectedChange: 0.25, timeframeDays: 365, condition: 'ad_tier_launched AND annual_billing_incentives AND content_personalization_improved' },
    { metric: 'content_roi', expectedChange: 0.20, timeframeDays: 365, condition: 'per_title_roi_tracking AND international_content_expansion' },
  ],

  narrative: `Streaming economics evolved from "grow at all costs" to "profitable per subscriber." Content is the product — Netflix spends $17B+ annually — but ROI varies 10x between hits and filler. The business model shifted to multi-tier (ad-supported + premium) and bundling to optimize ARPU and reduce churn. Monthly churn of 3-5% means the average subscriber stays 20-33 months. Content exclusivity drives differentiation but international content (Korean, Spanish) offers 5-10x better cost-per-viewing-hour than US productions. The streaming winners will have the best content-to-retention efficiency, not necessarily the biggest content budgets.`,
};

// ============================================================================
// 2. ADVERTISING & ATTENTION ECONOMY
// ============================================================================

const advertisingAttention: TrainingPack = {
  id: 'advertising-attention-economy',
  title: 'Advertising Business Models — Attention Economics, Ad Tech, Performance Marketing',
  source: 'GroupM Global Ad Forecast, eMarketer, IAB, Google/Meta earnings, The Trade Desk',
  industry: 'Media & Advertising',
  domains: ['marketing', 'finance', 'engineering', 'strategy'],
  confidence: 0.83,
  tags: ['advertising', 'ad-tech', 'attention', 'cpm', 'roas', 'programmatic', 'first-party-data'],

  causalChains: [
    // Privacy regulation → cookie deprecation → first-party data value increase
    { source: 'strategy', target: 'engineering', metric: 'privacy_regulation_to_first_party_data_value', effectSize: 0.55, lagDays: 365, pValue: 0.001 },
    // Attention quality → ad effectiveness → ROAS improvement
    { source: 'marketing', target: 'finance', metric: 'attention_quality_to_roas', effectSize: 0.50, lagDays: 30, pValue: 0.002 },
    // AI in ad creative → personalization → CTR improvement
    { source: 'engineering', target: 'marketing', metric: 'ai_creative_to_ctr_improvement', effectSize: 0.35, lagDays: 90, pValue: 0.005 },
    // Platform concentration → CPM inflation → advertiser margin pressure
    { source: 'strategy', target: 'finance', metric: 'platform_concentration_to_cpm_inflation', effectSize: 0.40, lagDays: 365, pValue: 0.003 },
    // Retail media rise → commerce-linked attribution → ad measurement improvement
    { source: 'marketing', target: 'finance', metric: 'retail_media_to_attribution_improvement', effectSize: 0.45, lagDays: 180, pValue: 0.003 },
  ],

  businessRules: [
    {
      title: 'ROAS Below Profitability',
      entityType: 'advertiser',
      when: { logic: 'AND', conditions: [
        { field: 'finance.blended_roas', operator: 'less_than', value: 3.0 },
        { field: 'marketing.paid_channel_dependency', operator: 'greater_than', value: 0.60 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Blended ROAS < 3x with 60%+ paid dependency. At < 3x ROAS and typical 50-70% COGS, paid marketing is marginally profitable or losing money. Fix: (1) Invest in organic channels (SEO, content, community), (2) Improve conversion rate (higher ROAS without more spend), (3) Focus on retention marketing vs acquisition, (4) Test retail media for better attribution.' } },
      ],
      naturalLanguage: 'Low ROAS combined with high paid dependency signals an advertising efficiency problem. Below 3x, the margin after COGS makes paid acquisition barely viable.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'marketing', type: 'triggers', severity: 'high',
      keywords: { source: ['privacy', 'cookie-deprecation', 'gdpr', 'att', 'regulation'], target: ['targeting', 'measurement', 'attribution', 'first-party'] },
      reasonTemplate: 'The privacy wave (GDPR, CCPA, Apple ATT, Chrome cookie deprecation) is restructuring digital advertising. Third-party cookie loss reduces retargeting effectiveness 30-50%. iOS ATT reduced Facebook ad revenue $10B+ in year one. Winners: platforms with first-party data (Google, Amazon, retailers). Losers: open web publishers dependent on third-party cookies.' },
  ],

  patterns: [
    { name: 'Global Ad Spend Distribution', domains: ['marketing', 'finance'], description: 'Digital: ~65% of total ad spend ($600B+). Search: 28% of digital (Google dominates). Social: 25% of digital (Meta, TikTok, Snap). Display/programmatic: 15%. CTV/streaming: 10% (fastest growing). Retail media: 12% (Amazon, Walmart — fastest growing channel). Traditional TV: declining 5-8% annually but still $150B+.', observed: 88, expected: 20, total: 100 },
    { name: 'Ad-Supported Revenue Benchmarks', domains: ['finance', 'marketing'], description: 'CPM ranges: premium video $25-50, social feed $5-15, display $2-8, programmatic open exchange $1-3. Revenue per user: Meta $40-50/year (US), Google $60-80/year (US), TikTok $10-15/year. eCPM drives platform economics — higher engagement = higher CPM = more revenue per user.', observed: 82, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'roas_improvement', expectedChange: 0.25, timeframeDays: 365, condition: 'first_party_data_strategy AND creative_testing_cadence AND channel_diversification' },
  ],

  narrative: `Digital advertising is a $600B+ market undergoing fundamental transformation. Privacy regulation (GDPR, Apple ATT, cookie deprecation) is destroying third-party targeting, shifting power to platforms with first-party data — Google Search, Amazon retail media, social platforms. Retail media is the fastest-growing channel because it connects ad spend to actual purchase data. The attention economy thesis: not all impressions are equal — a 30-second CTV view is worth 10x a scrolled-past banner. AI is reshaping creative production (personalization at scale) and media buying (algorithmic optimization). The winners are advertisers who own their data, optimize for attention quality over reach, and diversify across channels.`,
};

// ============================================================================
// 3. CREATOR ECONOMY & PLATFORM DYNAMICS
// ============================================================================

const creatorEconomy: TrainingPack = {
  id: 'creator-economy-platform-dynamics',
  title: 'Creator Economy — Monetization Models, Platform Takes, Scale Dynamics',
  source: 'Signal Fire Creator Economy Report, Linktree Creator Report, Goldman Sachs Creator Economy',
  industry: 'Media & Entertainment',
  domains: ['product', 'finance', 'marketing', 'strategy'],
  confidence: 0.80,
  tags: ['creator', 'creator-economy', 'platform', 'monetization', 'ugc', 'influencer', 'take-rate'],

  causalChains: [
    // Creator monetization tools → creator retention → platform content supply
    { source: 'product', target: 'product', metric: 'monetization_tools_to_creator_retention', effectSize: 0.50, lagDays: 180, pValue: 0.002 },
    // Platform take rate → creator economics → platform switching risk
    { source: 'finance', target: 'strategy', metric: 'take_rate_to_creator_switching_risk', effectSize: 0.40, lagDays: 365, pValue: 0.005 },
    // Audience portability → creator leverage → platform competition
    { source: 'marketing', target: 'strategy', metric: 'audience_portability_to_creator_leverage', effectSize: 0.45, lagDays: 180, pValue: 0.003 },
    // Short-form dominance → attention fragmentation → long-form pressure
    { source: 'product', target: 'marketing', metric: 'short_form_to_attention_fragmentation', effectSize: -0.35, lagDays: 365, pValue: 0.005 },
    // Creator-brand partnership → influencer marketing ROI → ad budget shift
    { source: 'marketing', target: 'finance', metric: 'creator_partnership_to_marketing_roi', effectSize: 0.40, lagDays: 90, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Creator Monetization Concentration Risk',
      entityType: 'creator_platform',
      when: { logic: 'AND', conditions: [
        { field: 'finance.top_1pct_creator_revenue_share', operator: 'greater_than', value: 0.80 },
        { field: 'product.monetization_tiers', operator: 'less_than', value: 3 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Top 1% of creators earn 80%+ of platform revenue with < 3 monetization tiers. This concentrates platform risk in a small creator cohort while the "middle class" churns. Platforms that democratize monetization (subscriptions, tipping, courses, merchandise, affiliate) across tiers retain more creators and build a more sustainable content supply.' } },
      ],
      naturalLanguage: 'Creator economy platforms with extreme revenue concentration face both supply risk (top creators leave) and demand risk (mid-tier creators have no path to sustainable income).',
    },
  ],

  cascades: [
    { source: 'product', target: 'strategy', type: 'enables', severity: 'high',
      keywords: { source: ['creator-tools', 'monetization', 'analytics', 'audience-ownership'], target: ['creator-retention', 'platform-moat', 'content-supply', 'differentiation'] },
      reasonTemplate: 'Creator economy platforms live or die by creator retention. Creators follow money and audience: platforms must offer competitive monetization (low take rate, diverse revenue streams) AND audience growth. YouTube retains creators via ad revenue sharing (55/45) and discoverability. TikTok retains via viral distribution. Patreon retains via direct subscription relationships.' },
  ],

  patterns: [
    { name: 'Creator Economy Scale', domains: ['finance', 'marketing'], description: 'Market size: $250B+ (Goldman Sachs estimate). 50M+ people identify as creators. Monetization breakdown: brand deals (70% of creator revenue), ad revenue share (15%), subscriptions/tips (10%), merchandise/other (5%). The "creator middle class" problem: median creator earns < $500/month. Only top 4% are full-time sustainable.', observed: 82, expected: 25, total: 100 },
    { name: 'Platform Take Rates', domains: ['finance', 'product'], description: 'YouTube: 45% take rate (ad revenue). TikTok: creator fund payouts ($0.02-0.04/1000 views). Apple (in-app): 30% (15% for small developers). Substack: 10%. Patreon: 5-12%. Spotify: ~$0.003-0.005 per stream. The take rate determines creator economics and thus content supply for the platform.', observed: 80, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'creator_retention', expectedChange: 0.20, timeframeDays: 365, condition: 'multiple_monetization_tiers AND audience_portability AND competitive_take_rate' },
  ],

  narrative: `The creator economy ($250B+) is reshaping media: 50M+ people identify as creators, but the economics are extremely top-heavy — the top 4% earn sustainable income while the median creator makes under $500/month. Platform dynamics center on the tension between creator retention (better monetization, audience ownership) and platform control (algorithmic distribution, take rates). YouTube's 55/45 ad revenue split set the benchmark. The shift from advertising-only to diversified monetization (subscriptions, merchandise, courses, tipping) is creating a more sustainable creator middle class. Brand partnerships remain 70% of creator revenue, making the creator economy deeply intertwined with the advertising ecosystem.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const MEDIA_ENTERTAINMENT_PACKS: TrainingPack[] = [
  streamingEconomics,
  advertisingAttention,
  creatorEconomy,
];
