/**
 * COPILOT QUERY SIMULATION — FinanceJarvis Brain
 * ================================================
 *
 * Simulates the FULL copilot query pipeline for:
 *   "Build me a model for startup cash flow forecasting"
 *
 * Traces through ALL brain regions:
 *   1. Sensory Cortex — Query intake & domain extraction
 *   2. Hippocampus — Knowledge retrieval (causes, effects, patterns, rules)
 *   3. Basal Ganglia — Causal graph traversal (cascade paths)
 *   4. Amygdala — Impact estimation (risk analysis)
 *   5. Prefrontal Cortex — What-If scenarios
 *   6. Cerebellum — Pattern cache (grouped finance patterns)
 *   7. Corpus Callosum — Integration & copilot response assembly
 *
 * IMPORTANT: This uses ONLY what the brain's trained data structures contain.
 * No external LLM calls, no hallucination — pure brain retrieval.
 */

import { createBrainTrainer, type TrainingPack } from '../packages/memory-stack/src/learning/brain-trainer';
import { createTrainedKnowledgeQuerier } from '../packages/memory-stack/src/learning/trained-knowledge-querier';
import { createContextManager } from '../packages/memory-stack/src/orchestrator/context-manager';
import { createKnowledgeDependencyGraph } from '../packages/memory-stack/src/core/knowledge-dependency-graph';

// ── Import ALL training packs (same as finance-jarvis-certification.test.ts) ──
import { REAL_SEC_EDGAR_PACKS } from './training-data/real-sec-edgar-packs';
import { REAL_GITHUB_CODEBASE_PACKS } from './training-data/real-github-codebase-packs';
import { REAL_ARXIV_SCIENTIFIC_PACKS } from './training-data/real-arxiv-scientific-packs';
import { REAL_WORLD_ECONOMY_PACKS } from './training-data/real-world-economy-packs';
import { MACRO_ECONOMIC_PACKS } from './training-data/macro-economic-packs';
import { VC_METRICS_PACKS } from './training-data/vc-metrics-packs';
import { BUSINESS_CASE_STUDY_PACKS } from './training-data/business-case-study-packs';
import { DERIVATIVES_OPTIONS_PRICING_PACKS } from './training-data/derivatives-options-pricing-packs';
import { SALES_AND_REVENUE_PACKS } from './training-data/sales-and-revenue-packs';
import { ADVANCED_CAUSAL_PACKS } from './training-data/advanced-causal-packs';
import { VC_METRICS_LOGIC_DEEP_PACKS } from './training-data/vc-metrics-logic-deep-packs';
import { ACCOUNTING_FINANCE_PACKS } from './training-data/accounting-finance-packs';
import { FINANCIAL_STATEMENTS_DEEP_DIVE_PACKS } from './training-data/financial-statements-deep-dive-packs';
import { STRATEGY_AND_SCALING_PACKS } from './training-data/strategy-and-scaling-packs';
import { OPERATIONS_DEEP_DIVE_PACKS } from './training-data/operations-deep-dive-packs';
import { PEOPLE_AND_CULTURE_PACKS } from './training-data/people-and-culture-packs';
import { TECH_INDUSTRY_PACKS } from './training-data/tech-industry-packs';

// ============================================================================
// HELPERS
// ============================================================================

function divider(title: string): void {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function subHeader(title: string): void {
  console.log(`\n--- ${title} ---`);
}

function json(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

// ============================================================================
// MAIN SIMULATION
// ============================================================================

async function main() {
  const startTime = Date.now();

  console.log('');
  console.log('#'.repeat(80));
  console.log('#');
  console.log('#  NEXUSBRAIN COPILOT QUERY SIMULATION');
  console.log('#  Query: "Build me a model for startup cash flow forecasting"');
  console.log('#');
  console.log('#  Tracing through ALL brain regions...');
  console.log('#');
  console.log('#'.repeat(80));

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 0: TRAIN THE BRAIN (load all knowledge)
  // ══════════════════════════════════════════════════════════════════════════

  divider('PHASE 0: BRAIN TRAINING (Loading All Knowledge Packs)');

  const ALL_PACKS: TrainingPack[] = [
    ...REAL_SEC_EDGAR_PACKS,
    ...REAL_GITHUB_CODEBASE_PACKS,
    ...REAL_ARXIV_SCIENTIFIC_PACKS,
    ...REAL_WORLD_ECONOMY_PACKS,
    ...MACRO_ECONOMIC_PACKS,
    ...VC_METRICS_PACKS,
    ...BUSINESS_CASE_STUDY_PACKS,
    ...DERIVATIVES_OPTIONS_PRICING_PACKS,
    ...SALES_AND_REVENUE_PACKS,
    ...ADVANCED_CAUSAL_PACKS,
    ...VC_METRICS_LOGIC_DEEP_PACKS,
    ...ACCOUNTING_FINANCE_PACKS,
    ...FINANCIAL_STATEMENTS_DEEP_DIVE_PACKS,
    ...STRATEGY_AND_SCALING_PACKS,
    ...OPERATIONS_DEEP_DIVE_PACKS,
    ...PEOPLE_AND_CULTURE_PACKS,
    ...TECH_INDUSTRY_PACKS,
  ];

  const trainer = createBrainTrainer({
    defaultSampleSize: 200,
    defaultFStatistic: 12.0,
    autoActivateRules: true,
  });

  let loadedCount = 0;
  for (const pack of ALL_PACKS) {
    const result = trainer.trainInMemory(pack);
    if (result.success) loadedCount++;
  }

  const stats = trainer.getTrainingStats();
  console.log(`  Packs loaded: ${loadedCount} / ${ALL_PACKS.length}`);
  console.log(`  Causal edges: ${stats.causalEdgesLoaded}`);
  console.log(`  Rules: ${stats.rulesLoaded}`);
  console.log(`  Patterns: ${stats.patternsLoaded}`);
  console.log(`  Cascades: ${stats.cascadesLoaded}`);
  console.log(`  Outcomes: ${stats.outcomesLoaded}`);
  console.log(`  Embeddings: ${stats.embeddingsGenerated}`);

  // Create the querier
  const querier = createTrainedKnowledgeQuerier(
    trainer.getTrainedGraph(),
    trainer.getTrainedPatterns(),
    trainer.getTrainedRules(),
  );

  const trainDuration = Date.now() - startTime;
  console.log(`  Training complete in ${trainDuration}ms`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1: SENSORY CORTEX — Query Intake
  // ══════════════════════════════════════════════════════════════════════════

  divider('STEP 1: SENSORY CORTEX -- Query Intake & Domain Extraction');

  const QUERY = 'Build me a model for startup cash flow forecasting';

  // Simulate domain extraction (keywords -> domains)
  const queryLower = QUERY.toLowerCase();
  const domainKeywords: Record<string, string[]> = {
    finance: ['cash flow', 'forecasting', 'model', 'financial', 'revenue', 'burn', 'runway'],
    product: ['build', 'model', 'product', 'self-serve'],
    growth: ['startup', 'growth', 'scaling', 'forecast'],
    marketing: ['marketing', 'acquisition', 'cac', 'magic number'],
    cs: ['retention', 'churn', 'nrr', 'customer success'],
    strategy: ['startup', 'strategy', 'model', 'forecasting'],
  };

  const extractedDomains: string[] = [];
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    for (const kw of keywords) {
      if (queryLower.includes(kw)) {
        if (!extractedDomains.includes(domain)) extractedDomains.push(domain);
        break;
      }
    }
  }

  console.log(`  Query: "${QUERY}"`);
  console.log(`  Extracted domains: [${extractedDomains.join(', ')}]`);

  // Also use context manager to simulate working memory
  const contextMgr = createContextManager({
    supabase: null as any,
    organizationId: 'sim-org',
  });
  contextMgr.recordQuery('cfo-user', QUERY, 'finance');
  contextMgr.recordQuery('cfo-user', 'What is our current burn rate?', 'finance');
  contextMgr.recordQuery('cfo-user', 'Show me NRR trends', 'cs');
  const enriched = contextMgr.enrichQuery(QUERY, 'cfo-user');
  console.log(`  Context enrichment: ${enriched.contextHint}`);
  console.log(`  Suggested domains from context: [${enriched.suggestedDomains.join(', ')}]`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2: HIPPOCAMPUS — Knowledge Retrieval
  // ══════════════════════════════════════════════════════════════════════════

  divider('STEP 2: HIPPOCAMPUS -- Knowledge Retrieval');

  // 2a. Direct causes of finance
  subHeader('2a. What DRIVES finance? (findDirectCauses("finance"))');
  const financeCauses = querier.findDirectCauses('finance');
  for (const c of financeCauses) {
    console.log(`  ${c.source} --> finance (effect: ${(c.effectSize * 100).toFixed(1)}%, lag: ${c.lagDays}d)`);
  }
  if (financeCauses.length === 0) console.log('  (no direct causes found)');

  // 2b. Direct effects of finance
  subHeader('2b. What does finance AFFECT? (findDirectEffects("finance"))');
  const financeEffects = querier.findDirectEffects('finance');
  for (const e of financeEffects) {
    console.log(`  finance --> ${e.target} (effect: ${(e.effectSize * 100).toFixed(1)}%, lag: ${e.lagDays}d)`);
  }
  if (financeEffects.length === 0) console.log('  (no direct effects found)');

  // 2c. Finance patterns
  subHeader('2c. Finance Patterns (findPatternsForDomain("finance"))');
  const financePatterns = querier.findPatternsForDomain('finance');
  for (const p of financePatterns) {
    console.log(`  [${p.significance.toFixed(2)}] ${p.name}: ${p.description}`);
    console.log(`         Domains: [${p.domains.join(', ')}]`);
  }
  if (financePatterns.length === 0) console.log('  (no finance patterns found)');

  // 2d. Marketing patterns
  subHeader('2d. Marketing Patterns (findPatternsForDomain("marketing"))');
  const marketingPatterns = querier.findPatternsForDomain('marketing');
  for (const p of marketingPatterns) {
    console.log(`  [${p.significance.toFixed(2)}] ${p.name}: ${p.description}`);
  }
  if (marketingPatterns.length === 0) console.log('  (no marketing patterns found)');

  // 2e. Product patterns
  subHeader('2e. Product Patterns (findPatternsForDomain("product"))');
  const productPatterns = querier.findPatternsForDomain('product');
  for (const p of productPatterns) {
    console.log(`  [${p.significance.toFixed(2)}] ${p.name}: ${p.description}`);
  }
  if (productPatterns.length === 0) console.log('  (no product patterns found)');

  // 2f. CS patterns
  subHeader('2f. CS Patterns (findPatternsForDomain("cs"))');
  const csPatterns = querier.findPatternsForDomain('cs');
  for (const p of csPatterns) {
    console.log(`  [${p.significance.toFixed(2)}] ${p.name}: ${p.description}`);
  }
  if (csPatterns.length === 0) console.log('  (no cs patterns found)');

  // 2g. Match rules against a startup entity state
  subHeader('2g. Rule Matching (startup entity state)');

  const startupState: Record<string, unknown> = {
    finance: {
      arr: 2000000,
      arr_growth_rate: 0.6,
      burn_multiple: 1.8,
      gross_margin: 0.72,
      cac_payback_months: 14,
      ltv_cac_ratio: 4.2,
      cash_runway_months: 11,
      rule_of_40_score: 45,
      revenue_per_employee: 180000,
    },
    cs: { nrr: 1.08, logo_churn_rate_annual: 0.12 },
    marketing: { magic_number: 0.8, plg_revenue_pct: 0.15 },
    product: { self_serve_potential_score: 0.7 },
    pmf_survey: { very_disappointed_pct: 48 },
    growth: { paid_acquisition_pct: 0.4, organic_referral_pct: 0.25 },
    nrr: { trailing_12m: 108, current: 108 },
    grr: { trailing_12m: 92 },
    runway_months: 11,
    burn_rate: { trend_3m: -0.05 },
  };

  const matchedRules = querier.matchRules(startupState);
  const triggeredRules = matchedRules.filter(r => r.triggered);
  const notTriggered = matchedRules.filter(r => !r.triggered);

  console.log(`  Total rules evaluated: ${matchedRules.length}`);
  console.log(`  TRIGGERED: ${triggeredRules.length}`);
  for (const r of triggeredRules) {
    console.log(`    [FIRED] ${r.title}`);
    console.log(`      NL: ${r.naturalLanguage}`);
    console.log(`      Conditions: ${r.conditions.join(' | ')}`);
  }

  console.log(`\n  NOT triggered: ${notTriggered.length}`);
  // Show first 10 non-triggered for context
  for (const r of notTriggered.slice(0, 10)) {
    console.log(`    [--] ${r.title}`);
    console.log(`      Conditions: ${r.conditions.join(' | ')}`);
  }
  if (notTriggered.length > 10) {
    console.log(`    ... and ${notTriggered.length - 10} more`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3: BASAL GANGLIA — Causal Graph Traversal
  // ══════════════════════════════════════════════════════════════════════════

  divider('STEP 3: BASAL GANGLIA -- Causal Graph Traversal (Cascade Paths)');

  // 3a. finance -> growth
  subHeader('3a. How does FINANCE cascade to GROWTH?');
  const finToGrowth = querier.findCascadePaths('finance', 'growth');
  for (const p of finToGrowth) {
    console.log(`  Path: ${p.path.join(' -> ')}`);
    console.log(`    Total effect: ${(p.totalEffectSize * 100).toFixed(1)}% | Lag: ${p.cumulativeLagDays}d | Prob: ${(p.probability * 100).toFixed(1)}%`);
    console.log(`    Explanation: ${p.explanation}`);
  }
  if (finToGrowth.length === 0) console.log('  (no cascade paths found)');

  // 3b. marketing -> finance
  subHeader('3b. How does MARKETING cascade to FINANCE?');
  const mktToFin = querier.findCascadePaths('marketing', 'finance');
  for (const p of mktToFin) {
    console.log(`  Path: ${p.path.join(' -> ')}`);
    console.log(`    Total effect: ${(p.totalEffectSize * 100).toFixed(1)}% | Lag: ${p.cumulativeLagDays}d | Prob: ${(p.probability * 100).toFixed(1)}%`);
    console.log(`    Explanation: ${p.explanation}`);
  }
  if (mktToFin.length === 0) console.log('  (no cascade paths found)');

  // 3c. product -> finance
  subHeader('3c. How does PRODUCT cascade to FINANCE?');
  const prodToFin = querier.findCascadePaths('product', 'finance');
  for (const p of prodToFin) {
    console.log(`  Path: ${p.path.join(' -> ')}`);
    console.log(`    Total effect: ${(p.totalEffectSize * 100).toFixed(1)}% | Lag: ${p.cumulativeLagDays}d | Prob: ${(p.probability * 100).toFixed(1)}%`);
    console.log(`    Explanation: ${p.explanation}`);
  }
  if (prodToFin.length === 0) console.log('  (no cascade paths found)');

  // 3d. cs -> finance
  subHeader('3d. How does CS (retention) cascade to FINANCE?');
  const csToFin = querier.findCascadePaths('cs', 'finance');
  for (const p of csToFin) {
    console.log(`  Path: ${p.path.join(' -> ')}`);
    console.log(`    Total effect: ${(p.totalEffectSize * 100).toFixed(1)}% | Lag: ${p.cumulativeLagDays}d | Prob: ${(p.probability * 100).toFixed(1)}%`);
    console.log(`    Explanation: ${p.explanation}`);
  }
  if (csToFin.length === 0) console.log('  (no cascade paths found)');

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4: AMYGDALA — Impact Estimation
  // ══════════════════════════════════════════════════════════════════════════

  divider('STEP 4: AMYGDALA -- Impact Estimation');

  // 4a. Finance impact
  subHeader('4a. Finance sector impact');
  const finImpact = querier.estimateImpact('finance');
  console.log(`  Risk Level: ${finImpact.riskLevel.toUpperCase()}`);
  console.log(`  Affected domains: [${finImpact.affectedDomains.join(', ')}]`);
  console.log(`  Max cascade depth: ${finImpact.maxCascadeDepth}`);
  console.log(`  Total effect magnitude: ${finImpact.totalEffectMagnitude.toFixed(2)}`);
  console.log(`  Time to full cascade: ${finImpact.timeToFullCascade}d`);

  // 4b. Marketing impact
  subHeader('4b. Marketing sector impact');
  const mktImpact = querier.estimateImpact('marketing');
  console.log(`  Risk Level: ${mktImpact.riskLevel.toUpperCase()}`);
  console.log(`  Affected domains: [${mktImpact.affectedDomains.join(', ')}]`);
  console.log(`  Max cascade depth: ${mktImpact.maxCascadeDepth}`);
  console.log(`  Total effect magnitude: ${mktImpact.totalEffectMagnitude.toFixed(2)}`);
  console.log(`  Time to full cascade: ${mktImpact.timeToFullCascade}d`);

  // 4c. Product impact
  subHeader('4c. Product sector impact');
  const prodImpact = querier.estimateImpact('product');
  console.log(`  Risk Level: ${prodImpact.riskLevel.toUpperCase()}`);
  console.log(`  Affected domains: [${prodImpact.affectedDomains.join(', ')}]`);
  console.log(`  Max cascade depth: ${prodImpact.maxCascadeDepth}`);
  console.log(`  Total effect magnitude: ${prodImpact.totalEffectMagnitude.toFixed(2)}`);
  console.log(`  Time to full cascade: ${prodImpact.timeToFullCascade}d`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5: PREFRONTAL CORTEX — What-If Scenarios
  // ══════════════════════════════════════════════════════════════════════════

  divider('STEP 5: PREFRONTAL CORTEX -- What-If Scenarios');

  // Scenario A: "What if ARR grows 80% next year?"
  subHeader('Scenario A: "What if ARR grows 80% next year?"');
  console.log('  Querying causes_of growth and effects_of growth...');
  const growthCauses = querier.findDirectCauses('growth');
  console.log(`  Causes of growth (${growthCauses.length}):`);
  for (const c of growthCauses) {
    console.log(`    ${c.source} -> growth (effect: ${(c.effectSize * 100).toFixed(1)}%, lag: ${c.lagDays}d)`);
  }
  const growthEffects = querier.findDirectEffects('growth');
  console.log(`  Effects of growth (${growthEffects.length}):`);
  for (const e of growthEffects) {
    console.log(`    growth -> ${e.target} (effect: ${(e.effectSize * 100).toFixed(1)}%, lag: ${e.lagDays}d)`);
  }

  // Simulate the high-growth state and check which rules fire
  const highGrowthState: Record<string, unknown> = {
    ...startupState,
    finance: {
      ...(startupState.finance as Record<string, unknown>),
      arr: 3600000,
      arr_growth_rate: 0.8,
    },
    growth: { paid_acquisition_pct: 0.5, organic_referral_pct: 0.3, revenue_growth_pct: 80 },
  };
  const scenarioARules = querier.matchRules(highGrowthState);
  const scenarioAFired = scenarioARules.filter(r => r.triggered);
  console.log(`  Rules fired in high-growth scenario: ${scenarioAFired.length}`);
  for (const r of scenarioAFired) {
    console.log(`    [FIRED] ${r.title}: ${r.naturalLanguage}`);
  }

  // Scenario B: "What if burn rate doubles?"
  subHeader('Scenario B: "What if burn rate doubles?"');
  const highBurnState: Record<string, unknown> = {
    ...startupState,
    finance: {
      ...(startupState.finance as Record<string, unknown>),
      burn_multiple: 3.6,
      cash_runway_months: 5.5,
    },
    runway_months: 5.5,
    burn_rate: { trend_3m: 0.5 },
  };
  const scenarioBRules = querier.matchRules(highBurnState);
  const scenarioBFired = scenarioBRules.filter(r => r.triggered);
  console.log(`  Rules fired in high-burn scenario: ${scenarioBFired.length}`);
  for (const r of scenarioBFired) {
    console.log(`    [FIRED] ${r.title}: ${r.naturalLanguage}`);
  }

  // Scenario C: "What if NRR drops to 95%?"
  subHeader('Scenario C: "What if NRR drops to 95%?"');
  const lowNRRState: Record<string, unknown> = {
    ...startupState,
    cs: { nrr: 0.95, logo_churn_rate_annual: 0.18 },
    nrr: { trailing_12m: 95, current: 95 },
    grr: { trailing_12m: 85 },
  };
  const scenarioCRules = querier.matchRules(lowNRRState);
  const scenarioCFired = scenarioCRules.filter(r => r.triggered);
  console.log(`  Rules fired in low-NRR scenario: ${scenarioCFired.length}`);
  for (const r of scenarioCFired) {
    console.log(`    [FIRED] ${r.title}: ${r.naturalLanguage}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6: CEREBELLUM — Pattern Cache
  // ══════════════════════════════════════════════════════════════════════════

  divider('STEP 6: CEREBELLUM -- Pattern Cache (Cash-Flow-Related Patterns)');

  // Gather all patterns from relevant domains
  const allRelevantPatterns = [
    ...financePatterns,
    ...marketingPatterns,
    ...productPatterns,
    ...csPatterns,
  ];

  // Deduplicate by name
  const seen = new Set<string>();
  const uniquePatterns = allRelevantPatterns.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  // Group by category
  const revenuePatterns = uniquePatterns.filter(p =>
    p.name.toLowerCase().includes('revenue') ||
    p.name.toLowerCase().includes('arr') ||
    p.name.toLowerCase().includes('sales') ||
    p.name.toLowerCase().includes('growth') ||
    p.domains.includes('revenue')
  );
  const costPatterns = uniquePatterns.filter(p =>
    p.name.toLowerCase().includes('cost') ||
    p.name.toLowerCase().includes('cac') ||
    p.name.toLowerCase().includes('burn') ||
    p.name.toLowerCase().includes('efficiency') ||
    p.name.toLowerCase().includes('payback')
  );
  const retentionPatterns = uniquePatterns.filter(p =>
    p.name.toLowerCase().includes('retention') ||
    p.name.toLowerCase().includes('churn') ||
    p.name.toLowerCase().includes('nrr') ||
    p.name.toLowerCase().includes('grr') ||
    p.domains.includes('cs')
  );
  const growthPatterns = uniquePatterns.filter(p =>
    p.name.toLowerCase().includes('growth') ||
    p.name.toLowerCase().includes('scaling') ||
    p.name.toLowerCase().includes('plg') ||
    p.name.toLowerCase().includes('expansion') ||
    p.domains.includes('growth')
  );

  subHeader('Revenue Patterns');
  for (const p of revenuePatterns) {
    console.log(`  [${p.significance.toFixed(2)}] ${p.name}`);
  }
  if (revenuePatterns.length === 0) console.log('  (none)');

  subHeader('Cost Patterns');
  for (const p of costPatterns) {
    console.log(`  [${p.significance.toFixed(2)}] ${p.name}`);
  }
  if (costPatterns.length === 0) console.log('  (none)');

  subHeader('Retention Patterns');
  for (const p of retentionPatterns) {
    console.log(`  [${p.significance.toFixed(2)}] ${p.name}`);
  }
  if (retentionPatterns.length === 0) console.log('  (none)');

  subHeader('Growth Patterns');
  for (const p of growthPatterns) {
    console.log(`  [${p.significance.toFixed(2)}] ${p.name}`);
  }
  if (growthPatterns.length === 0) console.log('  (none)');

  console.log(`\n  Total unique patterns across all cash-flow domains: ${uniquePatterns.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 7: CORPUS CALLOSUM — Integration & Final Response
  // ══════════════════════════════════════════════════════════════════════════

  divider('STEP 7: CORPUS CALLOSUM -- Integration & Final Copilot Response');

  // 7a. Full brain summary
  subHeader('7a. Brain Summary (summarize())');
  const summary = querier.summarize();
  console.log(`  Total domains: ${summary.totalDomains}`);
  console.log(`  Domains: [${summary.domains.join(', ')}]`);
  console.log(`  Total edges: ${summary.totalEdges}`);
  console.log(`  Total rules: ${summary.totalRules}`);
  console.log(`  Total patterns: ${summary.totalPatterns}`);
  console.log(`  Root causes: [${summary.rootCauses.join(', ')}]`);
  console.log(`  Terminal effects: [${summary.terminalEffects.join(', ')}]`);
  console.log(`  Most influential domains:`);
  for (const d of summary.mostInfluentialDomains) {
    console.log(`    ${d.domain}: influence=${d.influence.toFixed(2)}, pageRank=${d.pageRank.toFixed(4)}`);
  }
  console.log(`  Strongest relationships:`);
  for (const r of summary.strongestRelationships.slice(0, 10)) {
    console.log(`    ${r.source} -> ${r.target} (effect: ${(r.effectSize * 100).toFixed(1)}%, lag: ${r.lagDays}d)`);
  }
  console.log(`\n  Narrative:\n  ${summary.narrative}`);

  // 7b. Build the copilot response
  subHeader('7b. ASSEMBLED COPILOT RESPONSE');

  console.log('\n  ================================================================');
  console.log('  COPILOT: Startup Cash Flow Forecasting Model');
  console.log('  ================================================================\n');

  // Section 1: Current State Assessment
  console.log('  1. CURRENT STATE ASSESSMENT (from rules that fired)');
  console.log('  --------------------------------------------------');
  if (triggeredRules.length > 0) {
    for (const r of triggeredRules) {
      console.log(`    * ${r.title}`);
      console.log(`      ${r.naturalLanguage}`);
    }
  } else {
    console.log('    No business rules triggered for the given startup state.');
    console.log('    This means the startup metrics are within normal ranges for all trained rules.');
  }

  // Section 2: Cash Flow Model Components
  console.log('\n  2. CASH FLOW MODEL COMPONENTS (from causal graph + patterns)');
  console.log('  -----------------------------------------------------------');

  console.log('    REVENUE DRIVERS:');
  for (const c of financeCauses.slice(0, 5)) {
    console.log(`      ${c.source} --> finance (${(c.effectSize * 100).toFixed(1)}% effect, ${c.lagDays}d lag)`);
  }
  if (financeCauses.length === 0) console.log('      (see direct causes above)');

  console.log('    DOWNSTREAM EFFECTS:');
  for (const e of financeEffects.slice(0, 5)) {
    console.log(`      finance --> ${e.target} (${(e.effectSize * 100).toFixed(1)}% effect, ${e.lagDays}d lag)`);
  }
  if (financeEffects.length === 0) console.log('      (see direct effects above)');

  console.log('    KEY PATTERNS:');
  for (const p of uniquePatterns.slice(0, 8)) {
    console.log(`      [${p.significance.toFixed(2)}] ${p.name}`);
  }

  // Section 3: Risk Factors
  console.log('\n  3. RISK FACTORS (from impact estimation)');
  console.log('  ----------------------------------------');
  console.log(`    Finance disruption risk: ${finImpact.riskLevel.toUpperCase()}`);
  console.log(`      Cascade depth: ${finImpact.maxCascadeDepth} hops`);
  console.log(`      Affected domains: [${finImpact.affectedDomains.join(', ')}]`);
  console.log(`      Time to full cascade: ${finImpact.timeToFullCascade} days`);
  console.log(`    Marketing disruption risk: ${mktImpact.riskLevel.toUpperCase()}`);
  console.log(`      Affected: [${mktImpact.affectedDomains.join(', ')}]`);
  console.log(`    Product disruption risk: ${prodImpact.riskLevel.toUpperCase()}`);
  console.log(`      Affected: [${prodImpact.affectedDomains.join(', ')}]`);

  // Section 4: What-If Scenarios
  console.log('\n  4. WHAT-IF SCENARIOS (from prefrontal simulation)');
  console.log('  -------------------------------------------------');
  console.log(`    Scenario A (ARR +80%): ${scenarioAFired.length} rules fire`);
  for (const r of scenarioAFired.slice(0, 3)) {
    console.log(`      -> ${r.title}`);
  }
  console.log(`    Scenario B (Burn 2x): ${scenarioBFired.length} rules fire`);
  for (const r of scenarioBFired.slice(0, 3)) {
    console.log(`      -> ${r.title}`);
  }
  console.log(`    Scenario C (NRR=95%): ${scenarioCFired.length} rules fire`);
  for (const r of scenarioCFired.slice(0, 3)) {
    console.log(`      -> ${r.title}`);
  }

  // Section 5: Recommended Metrics
  console.log('\n  5. RECOMMENDED METRICS TO TRACK (from patterns)');
  console.log('  ------------------------------------------------');
  const metricDomains = ['finance', 'cs', 'marketing', 'product', 'growth'];
  for (const domain of metricDomains) {
    const domainPatterns = querier.findPatternsForDomain(domain);
    if (domainPatterns.length > 0) {
      console.log(`    ${domain.toUpperCase()}:`);
      for (const p of domainPatterns.slice(0, 3)) {
        console.log(`      - ${p.name} (significance: ${p.significance.toFixed(2)})`);
      }
    }
  }

  // Section 6: Cascade paths for the model
  console.log('\n  6. CROSS-DOMAIN CASCADE CHAINS');
  console.log('  ------------------------------');
  const allCascadePaths = [
    ...finToGrowth.map(p => ({ label: 'finance -> growth', ...p })),
    ...mktToFin.map(p => ({ label: 'marketing -> finance', ...p })),
    ...prodToFin.map(p => ({ label: 'product -> finance', ...p })),
    ...csToFin.map(p => ({ label: 'cs -> finance', ...p })),
  ];
  if (allCascadePaths.length > 0) {
    for (const p of allCascadePaths) {
      console.log(`    [${p.label}] ${p.path.join(' -> ')}`);
      console.log(`      Effect: ${(p.totalEffectSize * 100).toFixed(1)}% | Lag: ${p.cumulativeLagDays}d`);
    }
  } else {
    console.log('    No direct cascade paths found between these domain pairs.');
    console.log('    This indicates the domains may be connected through intermediary nodes.');
    // Show cascade chains from the brain summary
    if (summary.cascadeChains.length > 0) {
      console.log('    Brain-discovered cascade chains:');
      for (const c of summary.cascadeChains.slice(0, 5)) {
        console.log(`      ${c.explanation}`);
      }
    }
  }

  // Final timing
  const totalDuration = Date.now() - startTime;

  console.log('\n  ================================================================');
  console.log('  END OF COPILOT SIMULATION');
  console.log(`  Total duration: ${totalDuration}ms`);
  console.log(`  Brain size: ${summary.totalDomains} domains, ${summary.totalEdges} edges, ${summary.totalRules} rules, ${summary.totalPatterns} patterns`);
  console.log('  ================================================================');
}

main().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
