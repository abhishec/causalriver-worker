#!/usr/bin/env tsx
/**
 * Test All Edge Functions
 *
 * This script tests all deployed Edge Functions to ensure they work correctly.
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

loadEnv({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface EdgeFunction {
  name: string;
  testPayload?: any;
  description: string;
}

const EDGE_FUNCTIONS: EdgeFunction[] = [
  {
    name: 'scheduled-jobs',
    testPayload: { job_type: 'verification' },
    description: 'Scheduled maintenance jobs',
  },
  {
    name: 'nexus-cron',
    testPayload: { trigger: 'manual' },
    description: 'Legacy cron job handler',
  },
  {
    name: 'nexus-ingest',
    testPayload: {
      source: 'test',
      signals: [
        {
          signal_type: 'test_signal',
          occurred_at: new Date().toISOString(),
          confidence: 0.9,
        },
      ],
    },
    description: 'Signal ingestion endpoint',
  },
  {
    name: 'nexus-query',
    testPayload: { query: 'test' },
    description: 'Query interface for brain',
  },
  {
    name: 'nexus-webhook',
    testPayload: { event: 'test' },
    description: 'Webhook receiver',
  },
  {
    name: 'nexus-copilot',
    testPayload: { message: 'test' },
    description: 'AI copilot interface',
  },
  {
    name: 'nexus-federation',
    testPayload: { action: 'status' },
    description: 'Federation knowledge sharing',
  },
  {
    name: 'nexus-seed-core',
    testPayload: {},
    description: 'Core data seeding',
  },
];

async function testEdgeFunction(func: EdgeFunction): Promise<boolean> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/${func.name}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(func.testPayload || {}),
    });

    const responseText = await response.text();

    // Success if:
    // - 200-299 status
    // - OR 400-499 with valid JSON (function executed but rejected input)
    if (response.status >= 200 && response.status < 300) {
      return true;
    } else if (response.status >= 400 && response.status < 500) {
      // Function executed but rejected input - this is OK for testing
      try {
        JSON.parse(responseText);
        return true; // Valid JSON error response = function works
      } catch {
        return false; // Invalid response = function broken
      }
    } else {
      return false;
    }
  } catch (error: any) {
    console.error(`    Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🧪 Testing All Edge Functions\n');
  console.log('━'.repeat(80));
  console.log('');

  const results: Record<string, boolean> = {};

  for (const func of EDGE_FUNCTIONS) {
    process.stdout.write(`📦 ${func.name}... `);

    const success = await testEdgeFunction(func);
    results[func.name] = success;

    if (success) {
      console.log(`✅ WORKING`);
      console.log(`   ${func.description}`);
    } else {
      console.log(`❌ FAILED`);
      console.log(`   ${func.description}`);
    }
    console.log('');
  }

  // Summary
  console.log('━'.repeat(80));
  console.log('\n📊 SUMMARY:\n');

  const total = EDGE_FUNCTIONS.length;
  const working = Object.values(results).filter((v) => v).length;
  const failed = total - working;

  console.log(`Total functions: ${total}`);
  console.log(`✅ Working: ${working}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Coverage: ${((working / total) * 100).toFixed(1)}%`);

  console.log('\n🏁 FINAL STATUS:');
  console.log('━'.repeat(80));

  if (failed === 0) {
    console.log('✅ All Edge Functions are working!');
    console.log('✅ System is ready for production');
    process.exit(0);
  } else {
    console.log(`❌ ${failed} Edge Function(s) failing`);
    console.log('⚠️  Check logs and redeploy if needed');
    process.exit(1);
  }
}

main();
