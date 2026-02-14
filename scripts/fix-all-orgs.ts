/**
 * Fix All Organizations - CTO-Level Execution
 *
 * Repairs all organizations in the database to ensure:
 * - All 93+ brain systems initialized
 * - Autonomous learning enabled
 * - Continuous learning enabled
 * - Calibration loop active
 * - Core Brain federation configured
 * - Health status: HEALTHY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load .env
try {
  const envPath = readFileSync('platform/.env.local', 'utf-8') || readFileSync('platform/.env', 'utf-8');
  for (const line of envPath.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length && !process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
} catch (e) {
  console.error('Could not load .env:', e);
}

async function fixAllOrgs() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log('═'.repeat(70));
  console.log('  🔧 FIXING ALL ORGANIZATIONS');
  console.log('═'.repeat(70));
  console.log('');

  // Get all non-Core Brain orgs
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, slug, is_core_brain')
    .eq('is_core_brain', false)
    .order('created_at');

  if (error) {
    console.error('Error fetching orgs:', error);
    process.exit(1);
  }

  console.log(`Found ${orgs.length} organizations to fix:\n`);

  const results: Array<{ name: string; status: string }> = [];

  for (const org of orgs) {
    console.log(`\n── Fixing: ${org.name} (${org.id}) ──\n`);

    // Use dynamic import to run the agent
    const { execSync } = await import('child_process');

    try {
      const output = execSync(
        `npx tsx scripts/run-org-agent.ts fix --org-id ${org.id} --reinit-brain --recalibrate --full-audit`,
        {
          encoding: 'utf-8',
          timeout: 120000,
        }
      );

      // Check if output contains "HEALTHY"
      if (output.includes('Health: HEALTHY')) {
        console.log(`✅ ${org.name}: HEALTHY`);
        results.push({ name: org.name, status: '✅ HEALTHY' });
      } else if (output.includes('Health: DEGRADED')) {
        console.log(`⚠️  ${org.name}: DEGRADED`);
        results.push({ name: org.name, status: '⚠️  DEGRADED' });
      } else {
        console.log(`❌ ${org.name}: CRITICAL`);
        results.push({ name: org.name, status: '❌ CRITICAL' });
      }
    } catch (err: any) {
      console.error(`❌ ${org.name}: ERROR`);
      if (err.stderr) console.error('STDERR:', err.stderr.toString());
      if (err.stdout) console.error('STDOUT:', err.stdout.toString());
      if (err.message) console.error('MESSAGE:', err.message);
      results.push({ name: org.name, status: '❌ ERROR' });
    }
  }

  console.log('\n');
  console.log('═'.repeat(70));
  console.log('  📊 FINAL STATUS');
  console.log('═'.repeat(70));
  console.log('');

  for (const result of results) {
    console.log(`  ${result.status}  ${result.name}`);
  }

  console.log('');
  console.log('═'.repeat(70));

  const healthy = results.filter(r => r.status.includes('HEALTHY')).length;
  const degraded = results.filter(r => r.status.includes('DEGRADED')).length;
  const critical = results.filter(r => r.status.includes('CRITICAL') || r.status.includes('ERROR')).length;

  console.log(`\n  Total: ${results.length} orgs`);
  console.log(`  ✅ Healthy: ${healthy}`);
  console.log(`  ⚠️  Degraded: ${degraded}`);
  console.log(`  ❌ Critical: ${critical}`);
  console.log('');
}

fixAllOrgs();
