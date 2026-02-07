/**
 * Example: Causal Discovery
 *
 * Discover causal relationships between business domains using
 * Granger causality, causal graphs, and intervention effects.
 *
 * Run: npx tsx index.ts
 */

import {
  computeGrangerCausality,
  runCausalDiscovery,
  summarizeDiscovery,
  buildCausalGraph,
  computeATE,
  interpretResult,
} from '@nexus-ai/memory-stack';

// =============================================================================
// 1. BASIC GRANGER CAUSALITY
// =============================================================================

console.log('=== 1. Granger Causality: Do payment delays cause support tickets? ===\n');

// Simulated weekly time series data (52 weeks)
// Finance: average days to collect payment
const paymentDelays = Array.from({ length: 80 }, (_, i) =>
  15 + 5 * Math.sin(i / 10) + (Math.random() - 0.5) * 3
);

// CS: support ticket volume (correlates with payment delays, lagged by ~3 weeks)
const ticketVolume = Array.from({ length: 80 }, (_, i) => {
  const laggedDelay = i >= 3 ? paymentDelays[i - 3] : 15;
  return 50 + 2 * laggedDelay + (Math.random() - 0.5) * 10;
});

const grangerResult = computeGrangerCausality(paymentDelays, ticketVolume, 10, {
  alpha: 0.05,
  minObservations: 50,
});

console.log('  Payment delays -> Ticket volume:');
console.log(`    Significant: ${grangerResult.significant}`);
console.log(`    F-statistic: ${grangerResult.fStatistic.toFixed(2)}`);
console.log(`    p-value: ${grangerResult.pValue.toFixed(4)}`);
console.log(`    Optimal lag: ${grangerResult.optimalLag} periods`);
console.log(`    Interpretation: ${interpretResult(grangerResult)}`);
console.log();

// =============================================================================
// 2. FULL CAUSAL DISCOVERY PIPELINE
// =============================================================================

console.log('=== 2. Full Causal Discovery: Multi-domain signal analysis ===\n');

// Generate realistic cross-domain signals
const now = new Date();
const signals: Array<{
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp: string;
}> = [];

for (let day = 0; day < 120; day++) {
  const date = new Date(now.getTime() - (120 - day) * 86400000);
  const dateStr = date.toISOString().split('T')[0];

  // Finance signal: payment delays with seasonal pattern
  signals.push({
    source_domain: 'finance',
    signal_type: 'collection_days',
    signal_value: 30 + 10 * Math.sin(day / 30) + (Math.random() - 0.5) * 5,
    signal_timestamp: dateStr,
  });

  // CS signal: escalation rate (driven by finance delays, ~7 day lag)
  const laggedFinance = day >= 7 ? 30 + 10 * Math.sin((day - 7) / 30) : 30;
  signals.push({
    source_domain: 'cs',
    signal_type: 'escalation_rate',
    signal_value: 0.1 + 0.005 * laggedFinance + (Math.random() - 0.5) * 0.02,
    signal_timestamp: dateStr,
  });

  // Revenue signal: pipeline velocity (driven by CS escalations)
  signals.push({
    source_domain: 'revenue',
    signal_type: 'pipeline_velocity',
    signal_value: 100 - 0.3 * laggedFinance + (Math.random() - 0.5) * 10,
    signal_timestamp: dateStr,
  });
}

const discovery = runCausalDiscovery(signals, 'example-org', {
  granger: { maxLag: 14, alpha: 0.05 },
  minObservations: 30,
});

console.log(`  Domains analyzed: ${discovery.domains_analyzed.join(', ')}`);
console.log(`  Pairs tested: ${discovery.pairs_tested}`);
console.log(`  Significant relationships: ${discovery.significant_count}`);
console.log();

if (discovery.discovered_relationships.length > 0) {
  console.log('  Discovered causal relationships:');
  discovery.discovered_relationships.forEach((rel) => {
    console.log(`    ${rel.source_domain} -> ${rel.target_domain}`);
    console.log(`      F-statistic: ${rel.f_statistic.toFixed(2)}, p-value: ${rel.p_value.toFixed(4)}, lag: ${rel.optimal_lag}`);
  });
} else {
  console.log('  (No significant causal relationships found with current data)');
}

console.log();
console.log('  Summary:');
console.log(`  ${summarizeDiscovery(discovery)}`);
console.log();

// =============================================================================
// 3. CAUSAL GRAPH
// =============================================================================

console.log('=== 3. Causal Graph: Build and analyze ===\n');

const relationships = [
  { source: 'finance', target: 'cs', strength: 0.72, lag: 7 },
  { source: 'cs', target: 'revenue', strength: 0.58, lag: 3 },
  { source: 'revenue', target: 'am', strength: 0.45, lag: 5 },
  { source: 'marketing', target: 'revenue', strength: 0.65, lag: 10 },
];

const graph = buildCausalGraph(
  relationships.map((r) => ({
    source_domain: r.source,
    target_domain: r.target,
    strength: r.strength,
    optimal_lag: r.lag,
    f_statistic: 4.0,
    p_value: 0.01,
    significant: true,
  }))
);

console.log(`  Nodes: ${graph.nodes.join(', ')}`);
console.log(`  Edges: ${graph.edges.length}`);
console.log(`  Root causes (no incoming edges): ${graph.rootCauses.join(', ')}`);
console.log(`  Terminal effects: ${graph.terminalEffects.join(', ')}`);
console.log(`  PageRank scores:`);
Object.entries(graph.pageRank).forEach(([node, score]) => {
  console.log(`    ${node}: ${(score as number).toFixed(3)}`);
});
console.log();

// =============================================================================
// 4. INTERVENTION EFFECTS
// =============================================================================

console.log('=== 4. Intervention Effects: What if we fix payment delays? ===\n');

// Simulated treated vs control groups
const treated = [10, 12, 8, 11, 9, 13, 10, 12, 11, 10]; // faster collections
const control = [25, 28, 22, 30, 27, 26, 29, 24, 28, 25]; // normal delays

const ate = computeATE(treated, control);
console.log(`  Average Treatment Effect (ATE): ${ate.ate.toFixed(2)} days`);
console.log(`  95% CI: [${ate.ci95Lower.toFixed(2)}, ${ate.ci95Upper.toFixed(2)}]`);
console.log(`  Significant: ${ate.significant}`);
console.log(`  Interpretation: Reducing collection effort cuts delays by ~${Math.abs(ate.ate).toFixed(0)} days`);
console.log();

console.log('Done! These are real statistical methods running in TypeScript.');
console.log('No Python. No GPU. No external services required.');
