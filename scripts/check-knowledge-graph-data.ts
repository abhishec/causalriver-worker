#!/usr/bin/env tsx
/**
 * Check Knowledge Graph Data
 *
 * This script checks if the knowledge graph layers (8-15) have actual data
 * or if they're just empty tables.
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const KNOWLEDGE_GRAPH_TABLES = [
  'concepts',
  'entities',
  'entity_types',
  'semantic_relationships',
  'relationship_types',
  'patterns',
  'pattern_instances',
  'contexts',
  'context_triggers',
  'insights',
  'observations',
  'hypotheses',
  'evidence',
  'knowledge_quality',
  'knowledge_provenance',
  'strategic_insights',
  'decision_frameworks',
];

async function getRowCount(supabase: any, tableName: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) return null;
    return count || 0;
  } catch (err) {
    return null;
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔍 Knowledge Graph Data Check\n');
  console.log('━'.repeat(80));
  console.log('');

  const results: Record<string, number | null> = {};
  let totalRows = 0;
  let emptyTables = 0;
  let populatedTables = 0;

  for (const tableName of KNOWLEDGE_GRAPH_TABLES) {
    const count = await getRowCount(supabase, tableName);
    results[tableName] = count;

    if (count === null) {
      console.log(`  ❌ ${tableName}: ERROR (table may not exist)`);
    } else if (count === 0) {
      console.log(`  ⚠️  ${tableName}: EMPTY (0 rows)`);
      emptyTables++;
    } else {
      console.log(`  ✅ ${tableName}: ${count.toLocaleString()} rows`);
      totalRows += count;
      populatedTables++;
    }
  }

  // Summary
  console.log('\n\n📊 SUMMARY:');
  console.log('━'.repeat(80));
  console.log(`Total tables: ${KNOWLEDGE_GRAPH_TABLES.length}`);
  console.log(`Populated tables: ${populatedTables}`);
  console.log(`Empty tables: ${emptyTables}`);
  console.log(`Total rows: ${totalRows.toLocaleString()}`);

  // Assessment
  console.log('\n\n🎯 ASSESSMENT:');
  console.log('━'.repeat(80));

  if (populatedTables === 0) {
    console.log('🔴 CRITICAL: Knowledge graph is EMPTY!');
    console.log('');
    console.log('   The tables exist but have NO data.');
    console.log('   This means:');
    console.log('   - ❌ No concepts extracted');
    console.log('   - ❌ No entities identified');
    console.log('   - ❌ No semantic relationships built');
    console.log('   - ❌ No patterns recognized');
    console.log('   - ❌ No insights generated');
    console.log('');
    console.log('   LIKELY CAUSE:');
    console.log('   - Knowledge graph extraction not running');
    console.log('   - Consolidation cycle not executed');
    console.log('   - No signals ingested yet');
    console.log('');
    console.log('   REQUIRED ACTIONS:');
    console.log('   1. Ingest some signals (pnpm run ingest:slack)');
    console.log('   2. Run consolidation job (pnpm run job:consolidation)');
    console.log('   3. Wait for knowledge graph to build');
    console.log('   4. Re-check this script');
  } else if (populatedTables < KNOWLEDGE_GRAPH_TABLES.length) {
    console.log('⚠️  WARNING: Knowledge graph is PARTIALLY populated');
    console.log('');
    console.log(`   ${populatedTables}/${KNOWLEDGE_GRAPH_TABLES.length} tables have data`);
    console.log(`   ${emptyTables} tables are still empty`);
    console.log('');
    console.log('   This may be normal if:');
    console.log('   - System is still building the graph');
    console.log('   - Not enough signals ingested yet');
    console.log('   - Some layers require more data to activate');
  } else {
    console.log('✅ Knowledge graph is FULLY populated!');
    console.log('');
    console.log(`   All ${KNOWLEDGE_GRAPH_TABLES.length} tables have data`);
    console.log(`   Total: ${totalRows.toLocaleString()} knowledge entities`);
    console.log('');
    console.log('   ✅ Concepts extracted');
    console.log('   ✅ Entities identified');
    console.log('   ✅ Semantic relationships built');
    console.log('   ✅ Patterns recognized');
    console.log('   ✅ Insights generated');
    console.log('   ✅ Knowledge graph operational');
  }

  console.log('');
  process.exit(populatedTables > 0 ? 0 : 1);
}

main();
