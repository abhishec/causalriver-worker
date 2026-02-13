/**
 * FinanceJarvis Full Knowledge Extraction Script
 *
 * Trains ALL packs in-memory, then extracts and prints the complete
 * knowledge base: summary, causal graph, rules, patterns, company
 * financials, causal reasoning demos, rule firing simulations, and stats.
 */

import { createBrainTrainer } from '../packages/memory-stack/src/learning/brain-trainer';
import { createTrainedKnowledgeQuerier } from '../packages/memory-stack/src/learning/trained-knowledge-querier';
import { REAL_SEC_EDGAR_PACKS, SEC_EDGAR_COMPANIES } from './training-data/real-sec-edgar-packs';
import { REAL_GITHUB_CODEBASE_PACKS } from './training-data/real-github-codebase-packs';
import { REAL_ARXIV_SCIENTIFIC_PACKS } from './training-data/real-arxiv-scientific-packs';
import { REAL_WORLD_ECONOMY_PACKS } from './training-data/real-world-economy-packs';
import { MACRO_ECONOMIC_PACKS } from './training-data/macro-economic-packs';
import { VC_METRICS_PACKS } from './training-data/vc-metrics-packs';
import { BUSINESS_CASE_STUDY_PACKS } from './training-data/business-case-study-packs';
import { DERIVATIVES_OPTIONS_PRICING_PACKS } from './training-data/derivatives-options-pricing-packs';

// ============================================================================
// SECTION HELPER
// ============================================================================

function section(title: string) {
  const line = '='.repeat(80);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(`${line}\n`);
}

function subsection(title: string) {
  console.log(`\n--- ${title} ${'─'.repeat(Math.max(0, 70 - title.length))}\n`);
}

// ============================================================================
// 1. TRAIN ALL PACKS
// ============================================================================

section('STEP 1: TRAINING ALL PACKS');

const ALL_PACKS = [
  ...REAL_SEC_EDGAR_PACKS,
  ...REAL_GITHUB_CODEBASE_PACKS,
  ...REAL_ARXIV_SCIENTIFIC_PACKS,
  ...REAL_WORLD_ECONOMY_PACKS,
  ...MACRO_ECONOMIC_PACKS,
  ...VC_METRICS_PACKS,
  ...BUSINESS_CASE_STUDY_PACKS,
  ...DERIVATIVES_OPTIONS_PRICING_PACKS,
];

const trainer = createBrainTrainer();

for (const pack of ALL_PACKS) {
  const result = trainer.trainInMemory(pack);
  console.log(
    `  [${result.success ? 'OK' : 'FAIL'}] ${pack.id} — edges: ${result.causalEdges}, rules: ${result.rules}, patterns: ${result.patterns}, cascades: ${result.cascades}, outcomes: ${result.outcomes}` +
    (result.errors.length > 0 ? ` | errors: ${result.errors.join('; ')}` : ''),
  );
}

console.log(`\n  Total packs trained: ${ALL_PACKS.length}`);

// ============================================================================
// 2. CREATE QUERIER
// ============================================================================

const graph = trainer.getTrainedGraph();
const patterns = trainer.getTrainedPatterns();
const rules = trainer.getTrainedRules();
const querier = createTrainedKnowledgeQuerier(graph, patterns, rules);

// ============================================================================
// 3a. FULL KNOWLEDGE SUMMARY
// ============================================================================

section('3a. FULL KNOWLEDGE SUMMARY (summarize())');

const summary = querier.summarize();
console.log(`Total Domains: ${summary.totalDomains}`);
console.log(`Domains: ${summary.domains.join(', ')}`);
console.log(`Total Causal Edges: ${summary.totalEdges}`);
console.log(`Total Business Rules: ${summary.totalRules}`);
console.log(`Total Patterns: ${summary.totalPatterns}`);
console.log(`\nNarrative:\n${summary.narrative}`);

subsection('Root Causes (upstream drivers, no inbound edges)');
summary.rootCauses.forEach(rc => console.log(`  - ${rc}`));

subsection('Terminal Effects (downstream outcomes, no outbound edges)');
summary.terminalEffects.forEach(te => console.log(`  - ${te}`));

subsection('Most Influential Domains (by PageRank)');
summary.mostInfluentialDomains.forEach(d =>
  console.log(`  - ${d.domain}: influence=${d.influence.toFixed(4)}, pageRank=${d.pageRank.toFixed(4)}`),
);

subsection('Strongest Relationships (Top 10)');
summary.strongestRelationships.forEach((r, i) =>
  console.log(`  ${i + 1}. ${r.source} -> ${r.target} | effectSize=${(r.effectSize * 100).toFixed(1)}% | lag=${r.lagDays}d`),
);

subsection('Cascade Chains (Root -> Terminal)');
summary.cascadeChains.forEach((c, i) =>
  console.log(`  ${i + 1}. ${c.explanation}`),
);

// ============================================================================
// 3b. ALL CAUSAL EDGES
// ============================================================================

section('3b. ALL CAUSAL EDGES (graph nodes + edges)');

subsection('Graph Nodes');
const nodeEntries = Array.from(graph.nodes.entries());
nodeEntries.forEach(([id, node]) => {
  console.log(`  [${id}] inDegree=${node.inDegree}, outDegree=${node.outDegree}, pageRank=${node.pageRank.toFixed(4)}, totalCausalInfluence=${node.totalCausalInfluence.toFixed(4)}`);
});

subsection(`All Edges (${graph.edges.length} total)`);
graph.edges.forEach((e, i) => {
  console.log(`  ${i + 1}. ${e.source} -> ${e.target} | effect=${(e.effectSize * 100).toFixed(1)}% | lag=${e.lagDays}d | p=${e.pValue} | active=${e.isActive}`);
});

// ============================================================================
// 3c. ALL BUSINESS RULES
// ============================================================================

section('3c. ALL BUSINESS RULES');

rules.forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.id}] "${r.title}"`);
  console.log(`     Entity: ${r.entity_type} | Priority: ${r.priority} | Active: ${r.is_active}`);
  console.log(`     NL: ${r.natural_language || '(none)'}`);
  if (r.when && (r.when as any).conditions) {
    const conds = (r.when as any).conditions as Array<{ field: string; operator: string; value: unknown }>;
    console.log(`     When (${(r.when as any).logic}): ${conds.map(c => `${c.field} ${c.operator} ${c.value}`).join(' & ')}`);
  }
  console.log('');
});

// ============================================================================
// 3d. ALL PATTERNS
// ============================================================================

section('3d. ALL PATTERNS');

patterns.forEach((p, i) => {
  console.log(`  ${i + 1}. "${p.name}"`);
  console.log(`     Domains: ${p.domainsInvolved.join(', ')}`);
  console.log(`     Description: ${p.description || p.naturalLanguage || '(none)'}`);
  if (p.evidence) {
    console.log(`     Evidence: testType=${p.evidence.testType}, testStat=${p.evidence.testStatistic.toFixed(2)}, p=${p.evidence.pValue.toFixed(6)}, effectSize=${p.evidence.effectSize.toFixed(4)}, CI=[${p.evidence.effectSizeCI[0].toFixed(3)}, ${p.evidence.effectSizeCI[1].toFixed(3)}], n=${p.evidence.sampleSize}, survivesCorrection=${p.evidence.survivesCorrection}`);
  }
  console.log('');
});

// ============================================================================
// 3e. KEY COMPANY FINANCIAL DATA (SEC_EDGAR_COMPANIES)
// ============================================================================

section('3e. KEY COMPANY FINANCIAL DATA (SEC EDGAR)');

SEC_EDGAR_COMPANIES.forEach(c => {
  const revYears = Object.keys(c.revenue).sort();
  const latestRev = c.revenue[revYears[revYears.length - 1]];
  const niYears = Object.keys(c.netIncome).sort();
  const latestNI = c.netIncome[niYears[niYears.length - 1]];
  const margin = latestRev > 0 ? ((latestNI / latestRev) * 100).toFixed(1) : 'N/A';

  console.log(`  ${c.name} (${c.ticker}) — CIK: ${c.cik}, Sector: ${c.sector}`);
  console.log(`    Revenue: ${JSON.stringify(c.revenue)}`);
  console.log(`    Net Income: ${JSON.stringify(c.netIncome)}`);
  console.log(`    Assets: ${JSON.stringify(c.assets)}`);
  if (c.equity) console.log(`    Equity: ${JSON.stringify(c.equity)}`);
  if (c.longTermDebt) console.log(`    LT Debt: ${JSON.stringify(c.longTermDebt)}`);
  if (c.operatingIncome) console.log(`    Operating Income: ${JSON.stringify(c.operatingIncome)}`);
  console.log(`    Latest Net Margin: ${margin}%`);

  // Revenue growth
  if (revYears.length >= 2) {
    const prev = c.revenue[revYears[revYears.length - 2]];
    const curr = c.revenue[revYears[revYears.length - 1]];
    const growth = ((curr - prev) / prev * 100).toFixed(1);
    console.log(`    Revenue Growth (${revYears[revYears.length - 2]} -> ${revYears[revYears.length - 1]}): ${growth}%`);
  }
  console.log('');
});

// ============================================================================
// 3f. CAUSAL REASONING DEMOS
// ============================================================================

section('3f. CAUSAL REASONING DEMOS');

subsection('What drives revenue? (findDirectCauses("revenue"))');
const revenueCauses = querier.findDirectCauses('revenue');
revenueCauses.forEach(c =>
  console.log(`  ${c.source} -> revenue | effect=${(c.effectSize * 100).toFixed(1)}% | lag=${c.lagDays}d`),
);

subsection('What does finance affect? (findDirectEffects("finance"))');
const financeEffects = querier.findDirectEffects('finance');
financeEffects.forEach(e =>
  console.log(`  finance -> ${e.target} | effect=${(e.effectSize * 100).toFixed(1)}% | lag=${e.lagDays}d`),
);

subsection('What happens if finance declines? (findDirectEffects("finance") + estimateImpact)');
const financeImpact = querier.estimateImpact('finance');
console.log(`  Affected domains: ${financeImpact.affectedDomains.join(', ')}`);
console.log(`  Max cascade depth: ${financeImpact.maxCascadeDepth}`);
console.log(`  Total effect magnitude: ${financeImpact.totalEffectMagnitude.toFixed(4)}`);
console.log(`  Time to full cascade: ${financeImpact.timeToFullCascade} days`);
console.log(`  Risk level: ${financeImpact.riskLevel}`);

subsection('Revenue -> growth cascade paths');
const revGrowthPaths = querier.findCascadePaths('revenue', 'growth', 5);
if (revGrowthPaths.length === 0) {
  console.log('  (No paths found from revenue -> growth)');
} else {
  revGrowthPaths.forEach((p, i) => console.log(`  ${i + 1}. ${p.explanation}`));
}

subsection('Policy -> finance cascade paths');
const policyFinancePaths = querier.findCascadePaths('policy', 'finance', 5);
if (policyFinancePaths.length === 0) {
  console.log('  (No paths found from policy -> finance)');
} else {
  policyFinancePaths.forEach((p, i) => console.log(`  ${i + 1}. ${p.explanation}`));
}

subsection('Impact estimation: finance');
const impactFinance = querier.estimateImpact('finance', 5);
console.log(`  Risk Level: ${impactFinance.riskLevel}`);
console.log(`  Affected: ${impactFinance.affectedDomains.join(', ')}`);
console.log(`  Max Depth: ${impactFinance.maxCascadeDepth}`);
console.log(`  Magnitude: ${impactFinance.totalEffectMagnitude.toFixed(4)}`);
console.log(`  Full Cascade: ${impactFinance.timeToFullCascade} days`);

subsection('Impact estimation: engineering');
const impactEng = querier.estimateImpact('engineering', 5);
console.log(`  Risk Level: ${impactEng.riskLevel}`);
console.log(`  Affected: ${impactEng.affectedDomains.join(', ')}`);
console.log(`  Max Depth: ${impactEng.maxCascadeDepth}`);
console.log(`  Magnitude: ${impactEng.totalEffectMagnitude.toFixed(4)}`);
console.log(`  Full Cascade: ${impactEng.timeToFullCascade} days`);

subsection('Impact estimation: macro');
const impactMacro = querier.estimateImpact('macro', 5);
console.log(`  Risk Level: ${impactMacro.riskLevel}`);
console.log(`  Affected: ${impactMacro.affectedDomains.join(', ')}`);
console.log(`  Max Depth: ${impactMacro.maxCascadeDepth}`);
console.log(`  Magnitude: ${impactMacro.totalEffectMagnitude.toFixed(4)}`);
console.log(`  Full Cascade: ${impactMacro.timeToFullCascade} days`);

// Additional cascade demos
subsection('real_estate -> macro cascade paths (Sornette 2008 crisis)');
const rePaths = querier.findCascadePaths('real_estate', 'macro', 5);
if (rePaths.length === 0) {
  console.log('  (No paths found)');
} else {
  rePaths.forEach((p, i) => console.log(`  ${i + 1}. ${p.explanation}`));
}

subsection('banking -> macro cascade paths');
const bankMacroPaths = querier.findCascadePaths('banking', 'macro', 5);
if (bankMacroPaths.length === 0) {
  console.log('  (No paths found)');
} else {
  bankMacroPaths.forEach((p, i) => console.log(`  ${i + 1}. ${p.explanation}`));
}

subsection('product -> finance cascade paths');
const prodFinPaths = querier.findCascadePaths('product', 'finance', 5);
if (prodFinPaths.length === 0) {
  console.log('  (No paths found)');
} else {
  prodFinPaths.forEach((p, i) => console.log(`  ${i + 1}. ${p.explanation}`));
}

// ============================================================================
// 3g. RULE FIRING SIMULATIONS
// ============================================================================

section('3g. RULE FIRING SIMULATIONS');

// Helper to print rule firing results
function printRuleResults(label: string, matchedRules: Array<{ title: string; naturalLanguage: string; triggered: boolean; conditions: string[] }>) {
  const triggered = matchedRules.filter(r => r.triggered);
  const notTriggered = matchedRules.filter(r => !r.triggered);
  console.log(`  Triggered (${triggered.length}):`);
  triggered.forEach(r => {
    console.log(`    [FIRED] "${r.title}"`);
    console.log(`      NL: ${r.naturalLanguage}`);
    r.conditions.forEach(c => console.log(`      ${c}`));
  });
  console.log(`  Not Triggered (${notTriggered.length}):`);
  notTriggered.forEach(r => {
    console.log(`    [SKIP] "${r.title}"`);
    r.conditions.forEach(c => console.log(`      ${c}`));
  });
}

subsection('NVIDIA state (114% growth, 55.8% margin, hyper-growth AI company)');
// Nested objects so getNestedValue can traverse dot-separated field paths
const nvidiaState: Record<string, unknown> = {
  growth: { revenue_growth_pct: 114.2, paid_acquisition_pct: 0.15, organic_referral_pct: 0.60 },
  profitability: { net_margin_pct: 55.8 },
  capex: { long_term_debt_growth_pct: -12.9 },
  leverage: { debt_growth_pct: -12.9, debt_to_equity_ratio: 0.17 },
  finance: {
    ltv_cac_ratio: 12.0, cac_payback_months: 4, arr_growth_rate: 1.14,
    arr: 60000000000, revenue_per_employee: 1800000, burn_multiple: 0.0,
    gross_margin: 0.76, rule_of_40_score: 160, cash_runway_months: 120,
    current_arr_multiple: 25, top_10_customer_revenue_pct: 0.35,
    professional_services_revenue_pct: 0.02,
  },
  cs: { nrr: 1.35, logo_churn_rate_annual: 0.02, grr: { trailing_12m: 97 } },
  nrr: { current: 135, trailing_12m: 135 },
  grr: { trailing_12m: 97 },
  arr: { growth_rate_yoy: 1.14 },
  marketing: { magic_number: 2.5, plg_revenue_pct: 0.05 },
  pmf_survey: { very_disappointed_pct: 75 },
  pmf_score: 85,
  runway_months: 120,
};
printRuleResults('NVIDIA', querier.matchRules(nvidiaState));

subsection('Tesla state (-2.9% growth, 4% margin, declining growth)');
const teslaState: Record<string, unknown> = {
  growth: { revenue_growth_pct: -2.9, paid_acquisition_pct: 0.45, organic_referral_pct: 0.25 },
  profitability: { net_margin_pct: 4.0 },
  capex: { long_term_debt_growth_pct: 18.8 },
  leverage: { debt_growth_pct: 18.8, debt_to_equity_ratio: 0.11 },
  finance: {
    ltv_cac_ratio: 2.5, cac_payback_months: 20, arr_growth_rate: -0.03,
    arr: 95000000000, revenue_per_employee: 750000, burn_multiple: 3.5,
    gross_margin: 0.18, rule_of_40_score: -7, cash_runway_months: 36,
    current_arr_multiple: 8, top_10_customer_revenue_pct: 0.05,
    professional_services_revenue_pct: 0.01,
  },
  cs: { nrr: 0.95, logo_churn_rate_annual: 0.08 },
  nrr: { current: 95, trailing_12m: 95 },
  grr: { trailing_12m: 88 },
  arr: { growth_rate_yoy: -0.03 },
  arr_growth_pct_plus_fcf_margin: 1,
  marketing: { magic_number: 0.4, plg_revenue_pct: 0.01 },
  pmf_survey: { very_disappointed_pct: 55 },
  pmf_score: 55,
  runway_months: 36,
  burn_rate: { trend_3m: 0.15 },
  usage: { change_30d: -0.10 },
  health_score: { current: 60 },
  ltv_cac_ratio: 2.5,
  cac_payback_months: 20,
};
printRuleResults('Tesla', querier.matchRules(teslaState));

subsection('JPMorgan state ($4T assets, 8.6% equity ratio, banking giant)');
const jpmState: Record<string, unknown> = {
  finance: {
    total_assets_trillion: 4.003, equity_to_assets_pct: 8.6,
    cds_spread_bps: 50, cds_spread_change_30d_pct: 0.05,
    national_debt_trillion: 38.6, debt_growth_monthly_billion: 60,
    tbill_rate: 3.76, tnote_rate: 3.17,
    ltv_cac_ratio: 8.0, cac_payback_months: 6, arr_growth_rate: 0.08,
    arr: 200000000000, revenue_per_employee: 550000, burn_multiple: 0.0,
    gross_margin: 0.55, rule_of_40_score: 48, cash_runway_months: 999,
    days_to_expiry: 365, option_moneyness: 1.0,
    traditional_npv: 500000000, volatility_of_project_returns: 0.15,
    top_10_customer_revenue_pct: 0.08, professional_services_revenue_pct: 0.15,
  },
  growth: { revenue_growth_pct: 8.3, paid_acquisition_pct: 0.30, organic_referral_pct: 0.20 },
  profitability: { net_margin_pct: 33.4 },
  revenue: { annual_revenue_billion: 200 },
  leverage: { debt_growth_pct: 5.0, debt_to_equity_ratio: 10.5 },
  trading: {
    dealer_gamma_exposure: 2000000000, open_interest_call_ratio: 0.55,
    iv_percentile_rank: 0.35, iv_minus_rv_spread: 3,
    put_call_skew_25d: 5, vix_term_structure_slope: 1.5,
  },
  strategy: { competitive_entries_last_12mo: 1, adjacent_market_potential: 50000000 },
  cs: { nrr: 1.05, logo_churn_rate_annual: 0.03 },
  nrr: { current: 105, trailing_12m: 105 },
  grr: { trailing_12m: 95 },
  arr: { growth_rate_yoy: 0.08 },
  marketing: { magic_number: 0.9, plg_revenue_pct: 0.10 },
  pmf_survey: { very_disappointed_pct: 50 },
  pmf_score: 60,
  runway_months: 999,
  fed_funds_rate: { change_3m: -0.25 },
  inflation: { annual_rate: 2.5 },
  company: { gross_margin: 0.55, contract_value: 100000 },
  client: { contract_value: 100000, contract_renewal_days: 365 },
  unemployment: { rate: 4.2 },
  open_positions: { count: 200 },
  gdp_growth: { quarterly: 2.5 },
};
printRuleResults('JPMorgan', querier.matchRules(jpmState));

subsection('Walmart state (2.9% margin, $681B revenue, retail giant)');
const walmartState: Record<string, unknown> = {
  profitability: { net_margin_pct: 2.9 },
  revenue: { annual_revenue_billion: 681 },
  growth: { revenue_growth_pct: 5.1, paid_acquisition_pct: 0.55, organic_referral_pct: 0.30 },
  leverage: { debt_growth_pct: 3.0, debt_to_equity_ratio: 0.60 },
  finance: {
    ltv_cac_ratio: 5.0, cac_payback_months: 8, arr_growth_rate: 0.05,
    arr: 681000000000, revenue_per_employee: 310000, burn_multiple: 0.0,
    gross_margin: 0.24, rule_of_40_score: 12, cash_runway_months: 999,
    top_10_customer_revenue_pct: 0.01, professional_services_revenue_pct: 0.0,
  },
  cs: { nrr: 1.02, logo_churn_rate_annual: 0.05 },
  nrr: { current: 102, trailing_12m: 102 },
  grr: { trailing_12m: 92 },
  arr: { growth_rate_yoy: 0.05 },
  arr_growth_pct_plus_fcf_margin: 12,
  marketing: { magic_number: 0.6, plg_revenue_pct: 0.30 },
  pmf_survey: { very_disappointed_pct: 35 },
  pmf_score: 35,
  runway_months: 999,
  ltv_cac_ratio: 5.0,
  cac_payback_months: 8,
  usage: { change_30d: 0.02 },
  health_score: { current: 72 },
  company: { gross_margin: 0.24 },
  inflation: { annual_rate: 2.5 },
  fed_funds_rate: { change_3m: -0.25 },
  client: { contract_value: 25000, contract_renewal_days: 365 },
  unemployment: { rate: 4.2 },
  open_positions: { count: 50000 },
  gdp_growth: { quarterly: 2.5 },
  ticket_volume: { change_7d: 0.10 },
  first_response_time: { current: 2 },
  burn_multiple: 0.0,
};
printRuleResults('Walmart', querier.matchRules(walmartState));

// ============================================================================
// 3h. TRAINING STATS
// ============================================================================

section('3h. TRAINING STATS');

const stats = trainer.getTrainingStats();
console.log(`  Cases Loaded:       ${stats.casesLoaded}`);
console.log(`  Causal Edges:       ${stats.causalEdgesLoaded}`);
console.log(`  Rules Loaded:       ${stats.rulesLoaded}`);
console.log(`  Cascades Loaded:    ${stats.cascadesLoaded}`);
console.log(`  Patterns Loaded:    ${stats.patternsLoaded}`);
console.log(`  Outcomes Loaded:    ${stats.outcomesLoaded}`);
console.log(`  Embeddings:         ${stats.embeddingsGenerated}`);
console.log(`  Errors:             ${stats.errors.length > 0 ? stats.errors.join('; ') : '(none)'}`);

// ============================================================================
// DOMAIN-SPECIFIC PATTERNS
// ============================================================================

section('BONUS: DOMAIN-SPECIFIC PATTERN LOOKUPS');

const domainList = ['finance', 'macro', 'engineering', 'product', 'cs', 'risk', 'trading', 'labor', 'banking', 'derivatives'];

for (const domain of domainList) {
  const domainPatterns = querier.findPatternsForDomain(domain);
  if (domainPatterns.length > 0) {
    subsection(`Patterns for domain: "${domain}" (${domainPatterns.length})`);
    domainPatterns.forEach(p => {
      console.log(`  - "${p.name}" (significance=${p.significance.toFixed(4)})`);
      console.log(`    Domains: ${p.domains.join(', ')}`);
      console.log(`    ${p.description}`);
    });
  }
}

// ============================================================================
// DONE
// ============================================================================

section('EXTRACTION COMPLETE');
console.log(`  Total domains: ${summary.totalDomains}`);
console.log(`  Total edges: ${summary.totalEdges}`);
console.log(`  Total rules: ${summary.totalRules}`);
console.log(`  Total patterns: ${summary.totalPatterns}`);
console.log(`  Training packs: ${ALL_PACKS.length}`);
console.log(`  SEC EDGAR companies: ${SEC_EDGAR_COMPANIES.length}`);
console.log('');
