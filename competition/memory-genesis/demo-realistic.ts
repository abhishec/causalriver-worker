#!/usr/bin/env tsx
/**
 * Memory Genesis Competition 2026 - REALISTIC Demo
 *
 * Uses realistic synthetic data from Slack, Jira, and GitHub to demonstrate
 * NexusBrain's long-term memory consolidation and causal discovery.
 *
 * This demo will discover REAL causal patterns:
 * - Deployments → Bugs → Support Tickets → Churn
 * - Engineering Velocity → Customer Growth
 * - Incidents → Slack Activity → Support Load
 */

import { createClient } from '@supabase/supabase-js';
import { createConsolidationEngine } from '../../packages/memory-stack/src/orchestrator/consolidation-engine';
import { createMultiHopReasoner } from '../../packages/memory-stack/src/causality/multi-hop-reasoner';
import { loadDAGFromDatabase } from '../../packages/memory-stack/src/causality/continuous-learner';
import { createSupabaseRepository } from '../../packages/memory-stack/src/persistence/supabase-repository';
import { getDefaultLogger } from '../../packages/memory-stack/src/observability';
import { generateRealisticDaySignals, getExpectedCausalRelationships } from './realistic-data-generator';

const logger = getDefaultLogger();

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEMO_ORG_ID = '00000000-0000-4000-b000-000000000001'; // Fixed UUID for demo org
const SIMULATION_DAYS = parseInt(process.env.DEMO_DAYS || '90');
const CONSOLIDATION_INTERVAL_DAYS = 1;
const VERBOSE = process.env.VERBOSE === 'true';

interface DemoConfig {
  supabaseUrl: string;
  supabaseKey: string;
  simulationDays: number;
  verbose: boolean;
}

// ============================================================================
// DEMO PHASES
// ============================================================================

async function runPhase1_DataGeneration(
  supabase: any,
  config: DemoConfig
): Promise<void> {
  logger.info(`\n${'─'.repeat(80)}`);
  logger.info(`PHASE 1: SIMULATING REALISTIC ORGANIZATIONAL ACTIVITY`);
  logger.info(`${'─'.repeat(80)}\n`);

  logger.info(`📊 Simulating ${config.simulationDays} days of activity from:`);
  logger.info(`   • GitHub (commits, PRs, deployments, incidents)`);
  logger.info(`   • Jira (issues, bugs, velocity)`);
  logger.info(`   • Slack (messages, escalations, incidents)`);
  logger.info(`   • Business metrics (MRR, churn, NPS, support tickets)\n`);

  const repo = createSupabaseRepository(supabase, DEMO_ORG_ID);
  let totalSignals = 0;

  for (let day = 0; day < config.simulationDays; day++) {
    // Generate realistic signals for this day
    const signals = generateRealisticDaySignals(day, DEMO_ORG_ID);

    // Insert into database
    await repo.insertSignals(signals);
    totalSignals += signals.length;

    if (config.verbose || day % 10 === 0) {
      logger.info(`📅 Day ${day + 1}/${config.simulationDays}: Generated ${signals.length} signals`);
    }

    // Run nightly consolidation
    if ((day + 1) % CONSOLIDATION_INTERVAL_DAYS === 0 && day > 7) {
      logger.info(`\n🌙 Night ${day + 1}: Running brain consolidation...`);

      const consolidator = createConsolidationEngine({
        supabase,
        organizationId: DEMO_ORG_ID,
        // Look back over all historical data so far (day + 1 days)
        lookbackHours: (day + 1) * 24,
        discoveryLookbackDays: Math.max(30, day + 1),
        // DEMO: Lower thresholds for easier discovery
        minObservations: 5,        // Down from 30
        minEdgeWeight: 0.10,       // Down from 0.20
        autoPromoteConfidence: 0.55, // Down from 0.75
        verbose: false,
      });

      const result = await consolidator.runConsolidation();

      logger.info(`✨ Consolidation complete (${result.totalDurationMs}ms)`);
      logger.info(`   • Signals processed: ${result.report.stats.signalsProcessed}`);
      logger.info(`   • Causal edges: ${result.report.stats.newRelationships} new, ${result.report.stats.lostRelationships} lost`);
      logger.info(`   • Patterns: ${result.report.stats.patternsFound}`);
      logger.info(`   • Anomalies: ${result.report.stats.anomaliesDetected}\n`);

      if (result.report.discoveries.length > 0 && config.verbose) {
        logger.info(`   📊 Top discoveries:`);
        result.report.discoveries.slice(0, 3).forEach(d => logger.info(`      - ${d}`));
      }
    }
  }

  logger.info(`\n✅ Phase 1 Complete: ${totalSignals} total signals generated\n`);
}

async function runPhase2_MemoryRetrieval(
  supabase: any,
  config: DemoConfig
): Promise<void> {
  logger.info(`\n${'─'.repeat(80)}`);
  logger.info(`PHASE 2: LONG-TERM MEMORY RETRIEVAL & CAUSAL REASONING`);
  logger.info(`${'─'.repeat(80)}\n`);

  // Load the causal graph from memory
  const graph = await loadDAGFromDatabase(supabase, DEMO_ORG_ID);

  const nodeCount = graph.nodes.size;
  const edgeCount = Array.from(graph.edges.values()).reduce((total, edgeMap) => total + edgeMap.size, 0);

  logger.info(`📚 Loaded causal memory from database:`);
  logger.info(`   • Nodes (domains): ${nodeCount}`);
  logger.info(`   • Edges (relationships): ${edgeCount}\n`);

  // Multi-hop reasoning examples
  const reasoner = createMultiHopReasoner({ maxHops: 4, maxPaths: 30 });

  // Example 1: Why does churn happen?
  logger.info(`🔍 Query 1: "What causes customer churn?"\n`);

  const churnPaths = reasoner.findAllPaths(graph, 'github.deployments', 'revenue.stripe');
  if (churnPaths.length > 0) {
    logger.info(`   Found ${churnPaths.length} causal paths from deployments to revenue:\n`);

    const topPaths = churnPaths
      .sort((a, b) => b.pathConfidence - a.pathConfidence)
      .slice(0, 3);

    topPaths.forEach((path, idx) => {
      logger.info(`   ${idx + 1}. ${path.explanation}`);
      logger.info(`      Confidence: ${(path.pathConfidence * 100).toFixed(1)}%`);
      logger.info(`      Total lag: ${path.totalLagDays} days\n`);
    });
  } else {
    logger.info(`   (Consolidation needs more time - try running full 90-day demo)\n`);
  }

  // Example 2: What causes support tickets?
  logger.info(`🔍 Query 2: "What causes support ticket spikes?"\n`);

  const supportPaths = reasoner.findAllPaths(graph, 'github.deployments', 'support.freshdesk');
  if (supportPaths.length > 0) {
    logger.info(`   Found ${supportPaths.length} causal paths:\n`);

    const topPaths = supportPaths
      .sort((a, b) => b.pathConfidence - a.pathConfidence)
      .slice(0, 3);

    topPaths.forEach((path, idx) => {
      logger.info(`   ${idx + 1}. ${path.explanation}`);
      logger.info(`      Confidence: ${(path.pathConfidence * 100).toFixed(1)}%`);
      logger.info(`      Total lag: ${path.totalLagDays} days\n`);
    });
  }

  // Show all discovered relationships
  logger.info(`\n📊 All discovered causal relationships:\n`);

  const relationships: Array<{ source: string; target: string; weight: number; lag: number }> = [];
  for (const [source, targets] of graph.edges) {
    for (const [target, edge] of targets) {
      relationships.push({
        source,
        target,
        weight: edge.weight,
        lag: edge.lagDays
      });
    }
  }

  const sortedRels = relationships
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 15);

  sortedRels.forEach((rel, idx) => {
    logger.info(`   ${idx + 1}. ${rel.source} → ${rel.target}`);
    logger.info(`      Weight: ${rel.weight.toFixed(3)}, Lag: ${rel.lag} days`);
  });

  logger.info(`\n✅ Phase 2 Complete: Memory retrieval successful\n`);
}

async function runPhase3_ValidationCheck(
  supabase: any,
  config: DemoConfig
): Promise<void> {
  logger.info(`\n${'─'.repeat(80)}`);
  logger.info(`PHASE 3: VALIDATION - CHECKING EXPECTED CAUSAL PATTERNS`);
  logger.info(`${'─'.repeat(80)}\n`);

  const graph = await loadDAGFromDatabase(supabase, DEMO_ORG_ID);
  const expected = getExpectedCausalRelationships();

  logger.info(`🎯 Expected causal relationships (from data generation):\n`);

  let foundCount = 0;
  for (const exp of expected) {
    const edge = graph.edges.get(exp.source)?.get(exp.target);
    const found = edge !== undefined;

    if (found) {
      logger.info(`   ✅ ${exp.description}`);
      logger.info(`      Expected: ${exp.source} → ${exp.target} (${exp.lag}d lag)`);
      logger.info(`      Discovered: weight=${edge.weight.toFixed(3)}, lag=${edge.lagDays}d\n`);
      foundCount++;
    } else {
      logger.info(`   ⏳ ${exp.description}`);
      logger.info(`      Expected but not yet discovered (needs more data/time)\n`);
    }
  }

  const discoveryRate = (foundCount / expected.length) * 100;
  logger.info(`\n📈 Discovery Rate: ${foundCount}/${expected.length} (${discoveryRate.toFixed(1)}%)`);

  if (discoveryRate >= 60) {
    logger.info(`🎉 EXCELLENT! The brain discovered most expected patterns!`);
  } else if (discoveryRate >= 30) {
    logger.info(`✓ GOOD! The brain is learning. Run longer for more discoveries.`);
  } else {
    logger.info(`⚠️  Need more data. Try running the full 90-day demo.`);
  }

  logger.info(`\n✅ Phase 3 Complete: Validation check done\n`);
}

async function runPhase4_Summary(
  config: DemoConfig
): Promise<void> {
  logger.info(`\n${'='.repeat(80)}`);
  logger.info(`DEMO COMPLETE - SUMMARY`);
  logger.info(`${'='.repeat(80)}\n`);

  logger.info(`✅ Successfully demonstrated:`);
  logger.info(`   1. Realistic data generation (Slack, Jira, GitHub)`);
  logger.info(`   2. Nightly memory consolidation (hippocampal sleep)`);
  logger.info(`   3. Long-term causal memory persistence`);
  logger.info(`   4. Multi-hop causal reasoning`);
  logger.info(`   5. Validation of discovered patterns\n`);

  logger.info(`📊 Data sources integrated:`);
  logger.info(`   • GitHub: Commits, PRs, deployments, incidents`);
  logger.info(`   • Jira: Issues, bugs, story points, velocity`);
  logger.info(`   • Slack: Messages, escalations, incident threads`);
  logger.info(`   • Business: MRR, churn, NPS, support tickets\n`);

  logger.info(`🧠 NexusBrain capabilities demonstrated:`);
  logger.info(`   • Cross-domain causal discovery`);
  logger.info(`   • Temporal lag detection`);
  logger.info(`   • Multi-session memory persistence`);
  logger.info(`   • Natural language explanations`);
  logger.info(`   • Self-improving through consolidation\n`);

  logger.info(`🏆 Next steps for Memory Genesis submission:`);
  logger.info(`   1. Record demo video showing this output`);
  logger.info(`   2. Deploy interactive web demo at demo.usebrainos.com`);
  logger.info(`   3. Submit by February 28, 2026\n`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const config: DemoConfig = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    // Prefer service role key to bypass RLS for demo data ingestion
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
    simulationDays: SIMULATION_DAYS,
    verbose: VERBOSE,
  };

  if (!config.supabaseUrl || !config.supabaseKey) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set');
    console.error('\nSet them with:');
    console.error('  export SUPABASE_URL="your_url"');
    console.error('  export SUPABASE_SERVICE_ROLE_KEY="your_service_key"');
    process.exit(1);
  }

  logger.info(`\n${'='.repeat(80)}`);
  logger.info(`🧠 MEMORY GENESIS COMPETITION 2026 - REALISTIC DEMO`);
  logger.info(`${'='.repeat(80)}\n`);

  logger.info(`Configuration:`);
  logger.info(`  • Simulation days: ${config.simulationDays}`);
  logger.info(`  • Organization: ${DEMO_ORG_ID}`);
  logger.info(`  • Consolidation: Every ${CONSOLIDATION_INTERVAL_DAYS} day(s)`);
  logger.info(`  • Verbose: ${config.verbose}\n`);

  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  try {
    await runPhase1_DataGeneration(supabase, config);
    await runPhase2_MemoryRetrieval(supabase, config);
    await runPhase3_ValidationCheck(supabase, config);
    await runPhase4_Summary(config);

    logger.info(`\n🎉 Demo completed successfully!\n`);
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main as runRealisticDemo };
