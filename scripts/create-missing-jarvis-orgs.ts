/**
 * Create Missing Jarvis Organizations
 * Creates Slack Jarvis and Finance Jarvis
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

// Load env
try {
  const env = readFileSync('platform/.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length && !process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
} catch {}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url!, key!);

  console.log('\n🔧 Creating Missing Jarvis Organizations...\n');

  const orgsToCreate = [
    {
      name: 'Slack Jarvis',
      slug: 'slack-jarvis',
      plan: 'pro',
      settings: {
        purpose: 'Slack workspace intelligence and team communication insights',
        connectors: ['slack'],
        autonomous_learning: true,
      },
    },
    {
      name: 'Finance Jarvis',
      slug: 'finance-jarvis',
      plan: 'pro',
      settings: {
        purpose: 'Financial intelligence, metrics tracking, and cost monitoring',
        connectors: ['stripe', 'xero', 'volopay'],
        autonomous_learning: true,
      },
    },
  ];

  for (const orgData of orgsToCreate) {
    console.log(`\n📦 Creating: ${orgData.name}...`);

    // Check if already exists
    const { data: existing } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('slug', orgData.slug)
      .single();

    if (existing) {
      console.log(`   ✓ Already exists: ${existing.name} (${existing.id})`);
      continue;
    }

    // Create organization
    const orgId = randomUUID();
    const { error: orgError } = await supabase
      .from('organizations')
      .insert({
        id: orgId,
        name: orgData.name,
        slug: orgData.slug,
        plan: orgData.plan,
        settings: orgData.settings,
        is_core_brain: false,
      });

    if (orgError) {
      console.error(`   ❌ Error creating org: ${orgError.message}`);
      continue;
    }

    console.log(`   ✓ Organization created: ${orgId}`);

    // Create federation_config
    const { error: fedError } = await supabase
      .from('federation_config')
      .insert({
        organization_id: orgId,
        enabled: true,
        upstream_org_id: '00000000-0000-4000-a000-000000000001', // Core Brain
        auto_pull_enabled: true,
        auto_pull_interval_hours: 24,
        auto_promote_enabled: true,
        auto_promote_threshold: 0.75,
      });

    if (fedError && !fedError.message.includes('duplicate')) {
      console.error(`   ⚠️  Federation config warning: ${fedError.message}`);
    } else {
      console.log(`   ✓ Federation configured`);
    }

    // Create org_settings
    const { error: settingsError } = await supabase
      .from('org_settings')
      .insert({
        organization_id: orgId,
        autonomous_learning_enabled: true,
        continuous_learning_enabled: true,
        calibration_enabled: true,
        consolidation_enabled: true,
        growth_mechanisms_enabled: true,
      });

    if (settingsError && !settingsError.message.includes('duplicate')) {
      console.error(`   ⚠️  Settings warning: ${settingsError.message}`);
    } else {
      console.log(`   ✓ Settings configured`);
    }

    // Create connectors
    for (const connectorType of (orgData.settings.connectors as string[])) {
      const { error: connError } = await supabase
        .from('org_connectors')
        .insert({
          organization_id: orgId,
          connector_type: connectorType,
          status: 'pending',
        });

      if (connError && !connError.message.includes('duplicate')) {
        console.error(`   ⚠️  Connector ${connectorType}: ${connError.message}`);
      } else {
        console.log(`   ✓ Connector configured: ${connectorType}`);
      }
    }

    console.log(`\n   ✅ ${orgData.name} created successfully!`);
    console.log(`      Now run: npx tsx scripts/run-org-agent.ts fix --org-id ${orgId} --reinit-brain --recalibrate\n`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

main();
