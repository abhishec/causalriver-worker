#!/usr/bin/env tsx
/**
 * Check Knowledge Graph Layers
 *
 * This script checks if all 15 memory layers exist in Supabase,
 * specifically layers 8-15 which form the knowledge graph.
 *
 * Memory Layers:
 * Layers 1-7: Raw data and processing (signals, predictions, etc.)
 * Layers 8-15: Knowledge graph (concepts, relationships, patterns)
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// All tables by memory layer
const MEMORY_LAYERS = {
  // LAYERS 1-7: Raw data and causal processing
  'Layers 1-7 (Raw Data & Causal)': {
    description: 'Signal processing, predictions, causal relationships',
    tables: [
      // Layer 1-2: Raw signals
      'signals',
      'signal_types',
      'events',

      // Layer 3-4: Predictions
      'predictions',
      'prediction_outcomes',

      // Layer 5-6: Causal graph
      'causal_relationships',
      'weight_history',

      // Layer 7: Learning state
      'learning_state',
      'threshold_history',
    ],
  },

  // LAYERS 8-15: Knowledge graph
  'Layers 8-15 (Knowledge Graph)': {
    description: 'Concepts, entities, semantic relationships, insights',
    tables: [
      // Layer 8: Concepts & entities
      'concepts',
      'entities',
      'entity_types',

      // Layer 9: Semantic relationships
      'semantic_relationships',
      'relationship_types',

      // Layer 10: Patterns & templates
      'patterns',
      'pattern_instances',

      // Layer 11: Context & situations
      'contexts',
      'context_triggers',

      // Layer 12: Insights & observations
      'insights',
      'observations',

      // Layer 13: Hypotheses & theories
      'hypotheses',
      'evidence',

      // Layer 14: Meta-knowledge
      'knowledge_quality',
      'knowledge_provenance',

      // Layer 15: Strategic knowledge
      'strategic_insights',
      'decision_frameworks',
    ],
  },
};

async function checkTable(supabase: any, tableName: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .limit(1);

    return !error;
  } catch (err) {
    return false;
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🧠 Knowledge Graph Layer Verification\n');
  console.log('━'.repeat(80));
  console.log('');

  const layerResults: Record<string, { total: number; existing: number; missing: string[] }> = {};

  for (const [layerName, layerInfo] of Object.entries(MEMORY_LAYERS)) {
    console.log(`\n📦 ${layerName}`);
    console.log(`   ${layerInfo.description}`);
    console.log('─'.repeat(80));

    const missing: string[] = [];
    let existing = 0;

    for (const tableName of layerInfo.tables) {
      const exists = await checkTable(supabase, tableName);

      if (exists) {
        existing++;
        console.log(`  ✅ ${tableName}`);
      } else {
        missing.push(tableName);
        console.log(`  ❌ ${tableName} - MISSING`);
      }
    }

    layerResults[layerName] = {
      total: layerInfo.tables.length,
      existing,
      missing,
    };
  }

  // Summary
  console.log('\n\n📊 SUMMARY BY LAYER:');
  console.log('━'.repeat(80));

  for (const [layerName, result] of Object.entries(layerResults)) {
    const coverage = ((result.existing / result.total) * 100).toFixed(1);
    const status = result.existing === result.total ? '✅' : '❌';

    console.log(`\n${status} ${layerName}:`);
    console.log(`   Tables: ${result.existing}/${result.total} (${coverage}%)`);

    if (result.missing.length > 0) {
      console.log(`   Missing: ${result.missing.join(', ')}`);
    }
  }

  // Critical assessment
  console.log('\n\n🎯 CRITICAL ASSESSMENT:');
  console.log('━'.repeat(80));

  const layers17 = layerResults['Layers 1-7 (Raw Data & Causal)'];
  const layers815 = layerResults['Layers 8-15 (Knowledge Graph)'];

  if (layers17.existing === layers17.total) {
    console.log('✅ Layers 1-7 (Raw Data & Causal): COMPLETE');
  } else {
    console.log('❌ Layers 1-7 (Raw Data & Causal): INCOMPLETE');
  }

  if (layers815.existing === layers815.total) {
    console.log('✅ Layers 8-15 (Knowledge Graph): COMPLETE');
  } else {
    console.log('❌ Layers 8-15 (Knowledge Graph): INCOMPLETE');
    console.log(`   Missing ${layers815.missing.length} tables`);
  }

  // Recommendations
  console.log('\n\n💡 RECOMMENDATIONS:');
  console.log('━'.repeat(80));

  if (layers815.existing === 0) {
    console.log('🔴 CRITICAL: Knowledge graph tables (layers 8-15) are completely missing!');
    console.log('');
    console.log('   The system currently only has:');
    console.log('   - Raw signal processing (layers 1-7) ✅');
    console.log('   - NO semantic understanding (layers 8-15) ❌');
    console.log('   - NO concept extraction ❌');
    console.log('   - NO pattern recognition ❌');
    console.log('   - NO insight generation ❌');
    console.log('');
    console.log('   REQUIRED ACTIONS:');
    console.log('   1. Create knowledge graph schema migrations');
    console.log('   2. Apply migrations to Supabase');
    console.log('   3. Wire up knowledge graph extraction in Edge Functions');
    console.log('   4. Enable semantic layer processing');
  } else if (layers815.existing < layers815.total) {
    console.log('⚠️  WARNING: Knowledge graph is partially implemented');
    console.log('');
    console.log(`   Missing ${layers815.missing.length} tables:`);
    layers815.missing.forEach(table => console.log(`   - ${table}`));
    console.log('');
    console.log('   REQUIRED ACTIONS:');
    console.log('   1. Review which knowledge graph features are needed');
    console.log('   2. Create migrations for missing tables');
    console.log('   3. Apply migrations to Supabase');
  } else {
    console.log('✅ All memory layers (1-15) are complete!');
    console.log('✅ Knowledge graph is fully implemented');
    console.log('✅ System can perform semantic understanding');
  }

  console.log('');

  const allComplete = layers17.existing === layers17.total && layers815.existing === layers815.total;
  process.exit(allComplete ? 0 : 1);
}

main();
