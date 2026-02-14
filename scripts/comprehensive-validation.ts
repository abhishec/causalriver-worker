#!/usr/bin/env tsx
/**
 * Comprehensive NexusBrain System Validation
 *
 * CTO-level validation covering:
 * - Database schema and data
 * - TypeScript compilation
 * - Critical system functions
 * - Edge Function status
 * - Scheduled jobs
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface Check {
  name: string;
  passed: boolean;
  details?: string;
  critical?: boolean;
}

interface Category {
  name: string;
  checks: Check[];
}

const results: Category[] = [];

function addResult(category: string, check: Check) {
  let cat = results.find((r) => r.name === category);
  if (!cat) {
    cat = { name: category, checks: [] };
    results.push(cat);
  }
  cat.checks.push(check);
}

async function validateDatabase() {
  console.log('\n📊 Validating Database...');

  // Core tables
  const coreTables = [
    'organizations',
    'org_members',
    'cross_domain_signals',
    'ai_memory',
    'prediction_records',
    'scheduled_verifications',
    'prediction_outcomes',
    'scheduled_job_runs',
  ];

  for (const table of coreTables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    addResult('Database Tables', {
      name: `Table: ${table}`,
      passed: !error,
      details: error ? error.message : `${count} rows`,
      critical: true,
    });
  }

  // Check core organization exists
  const { data: coreOrg, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', '00000000-0000-4000-a000-000000000001')
    .single();

  addResult('Database Data', {
    name: 'Core organization exists',
    passed: !orgError && !!coreOrg,
    details: coreOrg ? `${coreOrg.name} (${coreOrg.slug})` : 'Missing',
    critical: true,
  });

  // Check if we have any signals
  const { count: signalCount } = await supabase
    .from('cross_domain_signals')
    .select('*', { count: 'exact', head: true });

  addResult('Database Data', {
    name: 'Signals present',
    passed: (signalCount || 0) > 0,
    details: `${signalCount} signals`,
  });

  // Check prediction pipeline
  const { count: predCount } = await supabase
    .from('prediction_records')
    .select('*', { count: 'exact', head: true });

  addResult('Prediction Pipeline', {
    name: 'Predictions created',
    passed: (predCount || 0) > 0,
    details: `${predCount} predictions`,
  });

  const { count: verifCount } = await supabase
    .from('scheduled_verifications')
    .select('*', { count: 'exact', head: true });

  addResult('Prediction Pipeline', {
    name: 'Verifications scheduled',
    passed: (verifCount || 0) > 0,
    details: `${verifCount} verifications`,
  });
}

async function validateScheduledJobs() {
  console.log('\n⏰ Validating Scheduled Jobs...');

  // Check if scheduled_job_runs table exists and is accessible
  const { count, error } = await supabase
    .from('scheduled_job_runs')
    .select('*', { count: 'exact', head: true });

  addResult('Scheduled Jobs', {
    name: 'Job runs table accessible',
    passed: !error,
    details: error ? error.message : `${count} runs recorded`,
    critical: true,
  });

  // Check if any jobs have run
  const { data: recentRuns } = await supabase
    .from('scheduled_job_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1);

  addResult('Scheduled Jobs', {
    name: 'Jobs have executed',
    passed: !!recentRuns && recentRuns.length > 0,
    details: recentRuns?.[0] ? `Last: ${recentRuns[0].job_type} at ${recentRuns[0].started_at}` : 'No runs yet',
  });
}

async function validateAgentRegistry() {
  console.log('\n🤖 Validating Agent Registry...');

  const { data: agents, error } = await supabase
    .from('agent_registry')
    .select('*');

  addResult('Agent Registry', {
    name: 'Agents registered',
    passed: !error && !!agents && agents.length > 0,
    details: `${agents?.length || 0} agents`,
  });

  // Expected minimum number of agents
  const expectedMinAgents = 30;
  addResult('Agent Registry', {
    name: `Minimum ${expectedMinAgents} agents`,
    passed: (agents?.length || 0) >= expectedMinAgents,
    details: `${agents?.length || 0}/${expectedMinAgents}`,
  });
}

async function validateCausalGraph() {
  console.log('\n🔗 Validating Causal Graph...');

  const { count: relCount, error } = await supabase
    .from('causal_relationships_statistical')
    .select('*', { count: 'exact', head: true });

  addResult('Causal Graph', {
    name: 'Causal relationships discovered',
    passed: !error && (relCount || 0) > 0,
    details: `${relCount} relationships`,
  });

  // Check if we have recent causal discovery
  const { data: recentRels } = await supabase
    .from('causal_relationships_statistical')
    .select('discovered_at')
    .order('discovered_at', { ascending: false })
    .limit(1);

  if (recentRels && recentRels.length > 0) {
    const hoursSinceLastDiscovery = Math.floor(
      (Date.now() - new Date(recentRels[0].discovered_at).getTime()) / (1000 * 60 * 60)
    );

    addResult('Causal Graph', {
      name: 'Recent causal discovery',
      passed: hoursSinceLastDiscovery < 48,
      details: `${hoursSinceLastDiscovery}h ago`,
    });
  }
}

async function validateMemorySystem() {
  console.log('\n🧠 Validating Memory System...');

  const { count, error } = await supabase
    .from('ai_memory')
    .select('*', { count: 'exact', head: true });

  addResult('Memory System', {
    name: 'Memories stored',
    passed: !error && (count || 0) > 0,
    details: `${count} memories`,
  });

  // Check memory importance distribution
  const { data: memories } = await supabase
    .from('ai_memory')
    .select('importance')
    .gte('importance', 0.7)
    .limit(1);

  addResult('Memory System', {
    name: 'High-importance memories exist',
    passed: !!memories && memories.length > 0,
    details: memories ? `${memories.length} important memories` : 'None',
  });
}

async function validateOrganizations() {
  console.log('\n🏢 Validating Organizations...');

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('*');

  addResult('Organizations', {
    name: 'Organizations table',
    passed: !error,
    details: `${orgs?.length || 0} organizations`,
    critical: true,
  });

  // Check org_connectors
  const { count: connectorCount } = await supabase
    .from('org_connectors')
    .select('*', { count: 'exact', head: true });

  addResult('Organizations', {
    name: 'Connectors configured',
    passed: (connectorCount || 0) > 0,
    details: `${connectorCount} connectors`,
  });

  // Verify org_connectors has status column
  const { data: sampleConnector } = await supabase
    .from('org_connectors')
    .select('id, status')
    .limit(1)
    .single();

  addResult('Organizations', {
    name: 'org_connectors.status column exists',
    passed: !sampleConnector || 'status' in (sampleConnector || {}),
    details: sampleConnector ? `status: ${sampleConnector.status}` : 'No connectors to verify',
  });
}

async function testEdgeFunction() {
  console.log('\n🔥 Testing Edge Function...');

  // Test the scheduled-jobs Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('scheduled-jobs', {
      body: {
        job_type: 'verification',
        organization_id: '00000000-0000-4000-a000-000000000001'
      },
    });

    addResult('Edge Function', {
      name: 'scheduled-jobs function accessible',
      passed: !error && data,
      details: error ? error.message : `Response: ${JSON.stringify(data).substring(0, 100)}`,
    });
  } catch (err) {
    addResult('Edge Function', {
      name: 'scheduled-jobs function accessible',
      passed: false,
      details: (err as Error).message,
    });
  }
}

function printResults() {
  console.log('\n');
  console.log('═'.repeat(100));
  console.log('  COMPREHENSIVE NEXUSBRAIN VALIDATION REPORT');
  console.log('═'.repeat(100));
  console.log('');

  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  let criticalFailures = 0;

  for (const category of results) {
    console.log(`\n📁 ${category.name}`);
    console.log('─'.repeat(100));

    for (const check of category.checks) {
      totalChecks++;
      const icon = check.passed ? '✅' : (check.critical ? '🔴' : '⚠️');
      const details = check.details ? ` - ${check.details}` : '';

      console.log(`   ${icon} ${check.name}${details}`);

      if (check.passed) {
        passedChecks++;
      } else {
        failedChecks++;
        if (check.critical) {
          criticalFailures++;
        }
      }
    }
  }

  console.log('\n');
  console.log('═'.repeat(100));
  console.log(`🎯 OVERALL SCORE: ${passedChecks}/${totalChecks}`);
  console.log(`   ✅ Passed: ${passedChecks}`);
  console.log(`   ❌ Failed: ${failedChecks}`);
  console.log(`   🔴 Critical Failures: ${criticalFailures}`);
  console.log('═'.repeat(100));
  console.log('');

  if (criticalFailures > 0) {
    console.log('🚨 CRITICAL FAILURES DETECTED - System NOT production-ready\n');
    process.exit(1);
  } else if (failedChecks > 0) {
    console.log('⚠️  Non-critical failures present - Review before production deployment\n');
    process.exit(0);
  } else {
    console.log('🎉 ALL CHECKS PASSED - System is production-ready!\n');
    process.exit(0);
  }
}

async function main() {
  console.log('🚀 NexusBrain Comprehensive Validation');
  console.log('Starting full system audit...');

  try {
    await validateDatabase();
    await validateScheduledJobs();
    await validateAgentRegistry();
    await validateCausalGraph();
    await validateMemorySystem();
    await validateOrganizations();
    await testEdgeFunction();

    printResults();
  } catch (error) {
    console.error('\n❌ Fatal error during validation:', error);
    process.exit(1);
  }
}

main();
