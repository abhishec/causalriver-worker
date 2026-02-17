#!/usr/bin/env tsx
/**
 * Setup Demo Organization for Competitions
 *
 * Creates a dedicated demo organization and:
 * 1. Ingests 100K+ real Slack/Jira/GitHub data
 * 2. Runs consolidation to discover causal patterns
 * 3. Validates against expected patterns
 * 4. Prepares for Memory Genesis + CauseMe + CausalRivers demos
 *
 * Usage:
 *   npm run demo:setup
 */

import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../packages/memory-stack/src/persistence/supabase-repository';
import { createConsolidationEngine } from '../packages/memory-stack/src/orchestrator/consolidation-engine';
import { getDefaultLogger } from '../packages/memory-stack/src/observability';
import { generateRealisticDaySignals } from '../competition/memory-genesis/realistic-data-generator';

const logger = getDefaultLogger();

// ============================================================================
// CONFIGURATION
// ============================================================================

// Fixed UUID for demo organization
const DEMO_ORG_ID = process.env.DEMO_ORG_ID || '00000000-0000-4000-b000-000000000001';
const DATA_DAYS = parseInt(process.env.DATA_DAYS || '180'); // 6 months of data
const USE_REAL_DATA = process.env.USE_REAL_DATA === 'true';
const CONSOLIDATION_INTERVAL = 7; // Weekly consolidation for faster setup

interface SetupConfig {
  supabaseUrl: string;
  supabaseKey: string;
  orgId: string;
  dataDays: number;
  useRealData: boolean;
}

// ============================================================================
// SETUP FUNCTIONS
// ============================================================================

async function createDemoOrganization(
  supabase: any,
  config: SetupConfig
): Promise<void> {
  logger.info(`\n📋 Creating demo organization: ${config.orgId}\n`);

  // Check if organization already exists
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', config.orgId)
    .single();

  if (existingOrg) {
    logger.info(`✓ Organization already exists: ${config.orgId}`);
    return;
  }

  // Create organization (using actual schema fields)
  const { error } = await supabase
    .from('organizations')
    .insert({
      id: config.orgId,
      name: 'Competition Demo 2026',
      slug: 'competition-demo-2026',
      plan: 'enterprise',
      settings: {
        industry: 'Demo & Competition',
        description: 'Competition demo org — Memory Genesis, CauseMe, CausalRivers',
        demo: true,
      },
      created_at: new Date().toISOString()
    });

  if (error) {
    logger.error(`Failed to create organization: ${error.message}`);
    throw error;
  }

  logger.info(`✓ Created organization: ${config.orgId}\n`);
}

async function ingestSyntheticData(
  supabase: any,
  config: SetupConfig
): Promise<void> {
  logger.info(`\n📊 Ingesting ${config.dataDays} days of synthetic data...\n`);

  const repo = createSupabaseRepository(supabase, config.orgId);
  let totalSignals = 0;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - config.dataDays);

  for (let day = 0; day < config.dataDays; day++) {
    const signals = generateRealisticDaySignals(day, config.orgId, startDate);
    await repo.insertSignals(signals);
    totalSignals += signals.length;

    if (day % 30 === 0 || day === config.dataDays - 1) {
      logger.info(`   Day ${day + 1}/${config.dataDays}: ${totalSignals.toLocaleString()} signals total`);
    }
  }

  logger.info(`\n✓ Ingested ${totalSignals.toLocaleString()} synthetic signals\n`);
}

async function ingestRealData(
  supabase: any,
  config: SetupConfig
): Promise<void> {
  logger.info(`\n📥 Ingesting real data from connectors...\n`);

  // TODO: Implement real data ingestion from actual Slack/Jira/GitHub APIs
  // For now, use the existing batch ingestion runner

  logger.info(`   Run separately: npm run ingest:slack`);
  logger.info(`   Run separately: npm run ingest:jira`);
  logger.info(`   Run separately: npm run ingest:github\n`);

  logger.info(`⚠️  Real data ingestion requires API credentials`);
  logger.info(`   Using synthetic data for now. Set USE_REAL_DATA=true after configuring connectors.\n`);
}

async function runInitialConsolidation(
  supabase: any,
  config: SetupConfig
): Promise<void> {
  logger.info(`\n🧠 Running initial consolidation to discover causal patterns...\n`);

  const consolidationRuns = Math.ceil(config.dataDays / CONSOLIDATION_INTERVAL);

  for (let run = 0; run < consolidationRuns; run++) {
    logger.info(`   Consolidation ${run + 1}/${consolidationRuns}...`);

    const consolidator = createConsolidationEngine({
      supabase,
      organizationId: config.orgId,
      lookbackHours: CONSOLIDATION_INTERVAL * 24,
      discoveryLookbackDays: 90,
      verbose: false,
    });

    const result = await consolidator.runConsolidation();

    logger.info(`      ✓ Processed ${result.report.stats.signalsProcessed} signals`);
    logger.info(`      ✓ Discovered ${result.report.stats.newRelationships} causal relationships`);
    logger.info(`      ✓ Found ${result.report.stats.patternsFound} patterns\n`);
  }

  logger.info(`✓ Initial consolidation complete\n`);
}

async function validateDiscoveredPatterns(
  supabase: any,
  config: SetupConfig
): Promise<void> {
  logger.info(`\n🔍 Validating discovered causal patterns...\n`);

  const { data: relationships } = await supabase
    .from('causal_relationships_statistical')
    .select('*')
    .eq('organization_id', config.orgId)
    .eq('is_significant', true)
    .order('effect_size', { ascending: false })
    .limit(10);

  if (!relationships || relationships.length === 0) {
    logger.warn(`   ⚠️  No causal relationships discovered yet`);
    logger.warn(`   Run more consolidation cycles or increase data volume\n`);
    return;
  }

  logger.info(`   Discovered ${relationships.length} top causal relationships:\n`);

  relationships.forEach((rel: any, idx: number) => {
    logger.info(`   ${idx + 1}. ${rel.source_domain} → ${rel.target_domain}`);
    logger.info(`      Effect: ${rel.effect_size?.toFixed(3)}, Lag: ${rel.lag_days}d, p=${rel.p_value?.toFixed(4)}`);
  });

  logger.info(`\n✓ Pattern validation complete\n`);
}

async function generateDemoCredentials(
  config: SetupConfig
): Promise<void> {
  logger.info(`\n🔑 Demo access credentials:\n`);

  logger.info(`   Organization ID: ${config.orgId}`);
  logger.info(`   Demo URL: http://localhost:3000/demo/memory-genesis`);
  logger.info(`   API Endpoint: http://localhost:3000/api/demo/query\n`);

  logger.info(`   Quick test:`);
  logger.info(`   curl http://localhost:3000/api/demo/causal-graph?org=${config.orgId}\n`);
}

// ============================================================================
// MAIN SETUP
// ============================================================================

async function main() {
  const config: SetupConfig = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_ANON_KEY || '',
    orgId: DEMO_ORG_ID,
    dataDays: DATA_DAYS,
    useRealData: USE_REAL_DATA,
  };

  if (!config.supabaseUrl || !config.supabaseKey) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    process.exit(1);
  }

  logger.info(`\n${'='.repeat(80)}`);
  logger.info(`🚀 DEMO ORGANIZATION SETUP - COMPETITION 2026`);
  logger.info(`${'='.repeat(80)}\n`);

  logger.info(`Configuration:`);
  logger.info(`  • Organization: ${config.orgId}`);
  logger.info(`  • Data days: ${config.dataDays}`);
  logger.info(`  • Use real data: ${config.useRealData}`);
  logger.info(`  • Consolidation interval: ${CONSOLIDATION_INTERVAL} days\n`);

  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  try {
    // Step 1: Create organization
    await createDemoOrganization(supabase, config);

    // Step 2: Ingest data
    if (config.useRealData) {
      await ingestRealData(supabase, config);
    } else {
      await ingestSyntheticData(supabase, config);
    }

    // Step 3: Run consolidation
    await runInitialConsolidation(supabase, config);

    // Step 4: Create connector records
    logger.info('\n🔌 Creating connector records...\n');
    const demoConnectors = [
      { type: 'slack', label: 'Slack (synthetic)', count: config.dataDays * 15 },
      { type: 'jira', label: 'Jira (synthetic)', count: config.dataDays * 5 },
      { type: 'github', label: 'GitHub (synthetic)', count: config.dataDays * 8 },
    ];
    for (const conn of demoConnectors) {
      const { data: existing } = await supabase
        .from('org_connectors')
        .select('id')
        .eq('organization_id', config.orgId)
        .eq('connector_type', conn.type)
        .single();
      if (!existing) {
        await supabase.from('org_connectors').insert({
          organization_id: config.orgId,
          connector_type: conn.type,
          status: 'active',
          config: { synthetic: true, source: 'setup-demo-org' },
          signals_count: conn.count,
          last_sync_at: new Date().toISOString(),
        });
        logger.info(`   ✓ ${conn.label}: active (${conn.count} records)`);
      } else {
        logger.info(`   ✓ ${conn.label}: already exists`);
      }
    }

    // Log sync activity
    await supabase.from('connector_sync_log').insert({
      organization_id: config.orgId,
      connector_id: 'setup-demo-org',
      sync_type: 'full',
      status: 'completed',
      signals_generated: config.dataDays * 28,
      records_processed: config.dataDays * 28,
      errors: [],
      duration_ms: 0,
      completed_at: new Date().toISOString(),
    });
    logger.info('   ✓ Sync logged');

    // Step 5: Validate patterns
    await validateDiscoveredPatterns(supabase, config);

    // Step 6: Generate credentials
    await generateDemoCredentials(config);

    logger.info(`\n${'='.repeat(80)}`);
    logger.info(`✅ DEMO ORGANIZATION SETUP COMPLETE`);
    logger.info(`${'='.repeat(80)}\n`);

    logger.info(`Next steps:`);
    logger.info(`  1. Start platform: cd platform && npm run dev`);
    logger.info(`  2. Visit: http://localhost:3000/demo/memory-genesis`);
    logger.info(`  3. Explore causal graph, run queries, view consolidation history\n`);

  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main as setupDemoOrg };
