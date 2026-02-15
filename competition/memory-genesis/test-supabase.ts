#!/usr/bin/env tsx
/**
 * Quick Supabase Connection Test
 *
 * Tests that we can connect to Supabase and insert/retrieve signals
 * before running the full demo.
 */

import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../../packages/memory-stack/src/persistence/supabase-repository';
import { getDefaultLogger } from '../../packages/memory-stack/src/observability';

const logger = getDefaultLogger();

async function testSupabaseConnection() {
  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables:');
    console.error('   SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Not set');
    console.error('   SUPABASE_ANON_KEY:', supabaseKey ? '✓ Set' : '✗ Not set');
    console.error('\nPlease set these variables:');
    console.error('   export SUPABASE_URL="your_supabase_project_url"');
    console.error('   export SUPABASE_ANON_KEY="your_supabase_anon_key"');
    process.exit(1);
  }

  logger.info('✓ Environment variables are set');
  logger.info(`  SUPABASE_URL: ${supabaseUrl.substring(0, 30)}...`);
  logger.info(`  SUPABASE_ANON_KEY: ${supabaseKey.substring(0, 20)}...`);

  // Create Supabase client
  logger.info('\n🔌 Testing Supabase connection...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Test connection by querying a table
  try {
    const { data, error } = await supabase
      .from('cross_domain_signals')
      .select('id')
      .limit(1);

    if (error) {
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        console.error('❌ Table "cross_domain_signals" does not exist');
        console.error('\nPlease run the database migrations first:');
        console.error('   npm run db:migrate');
        process.exit(1);
      }
      throw error;
    }

    logger.info('✓ Successfully connected to Supabase');
    logger.info('✓ Table "cross_domain_signals" exists');
  } catch (err) {
    console.error('❌ Failed to connect to Supabase:', err);
    process.exit(1);
  }

  // Test repository operations
  logger.info('\n📝 Testing repository operations...');
  const testOrgId = 'test_connection_org';
  const repo = createSupabaseRepository(supabase, testOrgId);

  try {
    // Insert a test signal
    const testSignal = {
      organization_id: testOrgId,
      source_domain: 'test.connection',
      signal_type: 'test_signal',
      signal_value: 42,
      signal_timestamp: new Date().toISOString(),
      entity_type: 'test',
      entity_id: 'connection_test',
      metadata: { test: true }
    };

    await repo.insertSignals([testSignal]);
    logger.info('✓ Successfully inserted test signal');

    // Query it back
    const signals = await repo.getSignalsByDomain('test.connection', new Date(Date.now() - 60000));
    if (signals.length === 0) {
      throw new Error('Could not retrieve test signal');
    }
    logger.info(`✓ Successfully retrieved ${signals.length} signal(s)`);

    // Clean up test signal
    await supabase
      .from('cross_domain_signals')
      .delete()
      .eq('organization_id', testOrgId);
    logger.info('✓ Cleaned up test data');

  } catch (err) {
    console.error('❌ Repository operations failed:', err);
    process.exit(1);
  }

  // All tests passed
  logger.info('\n✅ All Supabase tests passed!');
  logger.info('\nYou can now run the full demo:');
  logger.info('   npm run demo:memory-genesis:quick  # 30-day quick test');
  logger.info('   npm run demo:memory-genesis        # Full 90-day demo');
}

testSupabaseConnection().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
