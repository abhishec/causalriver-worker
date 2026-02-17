/**
 * Company Jarvis Org Setup — Seed Synthetic Data to Supabase
 *
 * This script:
 * 1. Creates the Company Jarvis org in Supabase
 * 2. Generates all synthetic data (Slack, HubSpot, Google Docs, Customers)
 * 3. Runs the brain analyzer to produce training packs + signals
 * 4. Trains the brain via createBrainTrainer() (causal edges, rules, cascades)
 * 5. Inserts signals into cross_domain_signals
 * 6. Creates org_connectors records for the 4 data sources
 * 7. Logs sync to connector_sync_log
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-company-jarvis.ts
 *
 * Flags:
 *   --verify   Read-only check of existing data counts
 *   --clean    Remove all Company Jarvis data before seeding
 *
 * After running, the generic /api/copilot/chat works for this org automatically.
 */

import { createClient } from '@supabase/supabase-js';
import { createBrainTrainer, type TrainingPack } from '../packages/memory-stack/src/learning/brain-trainer';
import {
  getCompanyJarvisData,
  COMPANY_JARVIS_ORG_ID,
  buildTrainingPacks,
  buildSignals,
} from '../platform/lib/company-jarvis';

// ============================================================================
// Configuration
// ============================================================================

const ORG_NAME = 'Company Jarvis';
const ORG_SLUG = 'company-jarvis';

const CONNECTOR_TYPES = ['slack', 'hubspot', 'google-docs', 'customer-platform'] as const;

// ============================================================================
// Environment
// ============================================================================

function getEnv(): { url: string; key: string } {
  // Try env vars directly first
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fall back to .env file parsing
  if (!url || !key) {
    try {
      const fs = require('fs');
      const path = require('path');
      const platformDir = path.resolve(__dirname, '..', 'platform');
      // Try .env.local first (Next.js convention), then .env
      const envPath = fs.existsSync(path.join(platformDir, '.env.local'))
        ? path.join(platformDir, '.env.local')
        : path.join(platformDir, '.env');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const eqIdx = trimmed.indexOf('=');
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (k === 'NEXT_PUBLIC_SUPABASE_URL' && !url) url = v;
        if (k === 'SUPABASE_URL' && !url) url = v;
        if (k === 'SUPABASE_SERVICE_ROLE_KEY' && !key) key = v;
      }
    } catch {
      // ignore
    }
  }

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('Set these env vars or ensure platform/.env exists.');
    process.exit(1);
  }

  return { url, key };
}

// ============================================================================
// Clean (optional --clean flag)
// ============================================================================

async function cleanOrgData(supabase: ReturnType<typeof createClient>) {
  console.log('Cleaning existing Company Jarvis data...');

  const tables = [
    'cross_domain_signals',
    'causal_relationships_statistical',
    'ai_memory',
    'org_cascade_rules',
    'prediction_records',
    'connector_sync_log',
    'org_connectors',
  ];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('organization_id', COMPANY_JARVIS_ORG_ID);
    if (error) {
      console.log(`  ${table}: ${error.message}`);
    } else {
      console.log(`  ${table}: cleaned`);
    }
  }

  console.log();
}

// ============================================================================
// Verify (--verify flag)
// ============================================================================

async function verifyOrgData(supabase: ReturnType<typeof createClient>) {
  console.log('Verifying Company Jarvis data in Supabase...');
  console.log(`  Org ID: ${COMPANY_JARVIS_ORG_ID}`);
  console.log();

  // Check org exists
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, plan')
    .eq('id', COMPANY_JARVIS_ORG_ID)
    .single();

  if (org) {
    console.log(`  Organization: ${org.name} (${org.slug}) [${org.plan}]`);
  } else {
    console.log('  Organization: NOT FOUND');
  }

  // Count rows in each table
  const tables = [
    'causal_relationships_statistical',
    'ai_memory',
    'org_cascade_rules',
    'cross_domain_signals',
    'prediction_records',
    'connector_sync_log',
    'org_connectors',
  ];

  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', COMPANY_JARVIS_ORG_ID);
    console.log(`  ${table.padEnd(38)} ${count || 0}`);
  }

  console.log();
}

// ============================================================================
// Main Seed Function
// ============================================================================

async function seedCompanyJarvis() {
  console.log();
  console.log('================================================================');
  console.log('  Company Jarvis Brain Setup — Synthetic AML Company Data');
  console.log('================================================================');
  console.log();

  const { url, key } = getEnv();
  const supabase = createClient(url, key);

  console.log(`Connected to Supabase: ${url.substring(0, 40)}...`);
  console.log(`Org ID: ${COMPANY_JARVIS_ORG_ID}`);
  console.log();

  // Handle flags
  const args = process.argv.slice(2);
  if (args.includes('--verify')) {
    await verifyOrgData(supabase);
    return;
  }
  if (args.includes('--clean')) {
    await cleanOrgData(supabase);
  }

  // ── Step 1: Create/upsert the organization ──────────────────────────
  console.log('Step 1: Creating organization...');

  const { error: orgError } = await supabase
    .from('organizations')
    .upsert({
      id: COMPANY_JARVIS_ORG_ID,
      name: ORG_NAME,
      slug: ORG_SLUG,
      plan: 'enterprise',
      is_core_brain: false,
      settings: {
        industry: 'AML Compliance Software',
        countries: ['SG', 'MY', 'TW', 'AU', 'PH'],
        arr: 10200000,
        headcount: 87,
        description: 'Series A AML compliance SaaS company selling across 5 APAC countries',
      },
      storage_config: {
        s3: {
          bucket: process.env.AWS_S3_BUCKET_NAME || 'nexusbrain-org-data',
          region: process.env.AWS_REGION || 'ap-southeast-1',
          prefix: COMPANY_JARVIS_ORG_ID,
          enabled: true,
        },
      },
    }, { onConflict: 'id' });

  if (orgError) {
    console.error(`  Failed to create org: ${orgError.message}`);
    process.exit(1);
  }
  console.log(`  Organization "${ORG_NAME}" created/updated.`);

  // Link platform admin to org (if exists)
  try {
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const adminUser = existingUsers?.users?.find((u: { email?: string }) => u.email === 'abhishek@monetiz3.com');
    if (adminUser) {
      const { data: existingMember } = await supabase
        .from('org_members')
        .select('id')
        .eq('organization_id', COMPANY_JARVIS_ORG_ID)
        .eq('user_id', adminUser.id)
        .single();

      if (!existingMember) {
        await supabase.from('org_members').insert({
          organization_id: COMPANY_JARVIS_ORG_ID,
          user_id: adminUser.id,
          role: 'admin',
          is_platform_admin: true,
        });
        console.log(`  Linked platform admin to org`);
      } else {
        console.log(`  Platform admin already linked`);
      }
    }
  } catch {
    console.log(`  Skipping org_members (run seed-users.ts first for user linking)`);
  }

  // Register S3 storage connector
  const { data: existingS3 } = await supabase
    .from('org_connectors')
    .select('id')
    .eq('organization_id', COMPANY_JARVIS_ORG_ID)
    .eq('connector_type', 's3-storage')
    .single();
  if (!existingS3) {
    await supabase.from('org_connectors').insert({
      organization_id: COMPANY_JARVIS_ORG_ID,
      connector_type: 's3-storage',
      status: 'active',
      config: {
        bucket: process.env.AWS_S3_BUCKET_NAME || 'nexusbrain-org-data',
        region: process.env.AWS_REGION || 'ap-southeast-1',
        prefix: COMPANY_JARVIS_ORG_ID,
        purpose: 'Org-level file storage (CSV, JSON, reports)',
      },
    });
    console.log('  [created] S3 storage connector');
  } else {
    console.log('  [exists] S3 storage connector');
  }
  console.log();

  // ── Step 2: Generate all synthetic data ─────────────────────────────
  console.log('Step 2: Generating synthetic data...');
  const t0 = Date.now();

  const { slack, hubspot, docs, customers, analysis } = getCompanyJarvisData();

  const genMs = Date.now() - t0;
  console.log(`  Generated in ${genMs}ms:`);
  console.log(`    Slack: ${slack.messages.length} messages, ${slack.channels.length} channels`);
  console.log(`    HubSpot: ${hubspot.deals.length} deals, ${hubspot.contacts.length} contacts`);
  console.log(`    Docs: ${docs.documents.length} documents`);
  console.log(`    Customers: ${customers.accounts.length} accounts, ${customers.tickets.length} tickets`);
  console.log(`    Insights: ${analysis.insights.length} (${analysis.insights.filter(i => i.severity === 'critical').length} critical)`);
  console.log(`    Reverse prompts: ${analysis.reversePrompts.length}`);
  console.log(`    Causal relationships: ${analysis.causalRelationships.length}`);
  console.log(`    Department scores: ${analysis.departmentScores.length}`);
  console.log(`    Country performance: ${analysis.countryPerformance.length}`);
  console.log();

  // ── Step 3: Train brain with training packs ─────────────────────────
  console.log('Step 3: Training brain...');

  const trainer = createBrainTrainer({
    defaultSampleSize: 150,
    defaultFStatistic: 10.0,
    autoActivateRules: true,
  });

  const trainingPacks = buildTrainingPacks(analysis);
  console.log(`  Training packs: ${trainingPacks.length}`);

  let totalEdges = 0, totalRules = 0, totalCascades = 0, totalOutcomes = 0;
  let trainErrors = 0;

  for (const pack of trainingPacks) {
    try {
      const result = await trainer.train(supabase, COMPANY_JARVIS_ORG_ID, pack as TrainingPack);
      totalEdges += result.causalEdges;
      totalRules += result.rules;
      totalCascades += result.cascades;
      totalOutcomes += result.outcomes;

      const icon = result.success ? 'OK' : 'WARN';
      console.log(`  [${icon}] ${pack.title}`);
      console.log(`       Edges: ${result.causalEdges} | Rules: ${result.rules} | Cascades: ${result.cascades} | Outcomes: ${result.outcomes}`);

      if (result.errors.length > 0) {
        trainErrors += result.errors.length;
        for (const err of result.errors) {
          console.log(`       ERROR: ${err}`);
        }
      }
    } catch (err) {
      trainErrors++;
      console.error(`  [FAIL] ${pack.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log();
  console.log('  Training summary:');
  console.log(`    Causal edges:    ${totalEdges}`);
  console.log(`    Business rules:  ${totalRules}`);
  console.log(`    Cascade rules:   ${totalCascades}`);
  console.log(`    Outcomes:        ${totalOutcomes}`);
  console.log(`    Errors:          ${trainErrors}`);
  console.log();

  // ── Step 4: Insert signals into cross_domain_signals ────────────────
  console.log('Step 4: Inserting signals...');

  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const signals = buildSignals(analysis, hubspot, customers, startDate);
  console.log(`  Generated ${signals.length} signals`);

  // Convert to DB rows (add organization_id, convert Date to ISO string)
  const signalRows = signals.map(s => ({
    organization_id: COMPANY_JARVIS_ORG_ID,
    source_domain: s.source_domain,
    signal_type: s.signal_type,
    signal_value: s.signal_value,
    signal_timestamp: s.signal_timestamp instanceof Date ? s.signal_timestamp.toISOString() : s.signal_timestamp,
    entity_type: s.entity_type,
    entity_id: s.entity_id,
    signal_metadata: s.signal_metadata,
  }));

  // Insert in batches of 200 to avoid payload limits
  const BATCH_SIZE = 200;
  let insertedSignals = 0;
  let signalErrors = 0;

  for (let i = 0; i < signalRows.length; i += BATCH_SIZE) {
    const batch = signalRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('cross_domain_signals').insert(batch);
    if (error) {
      signalErrors++;
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`);
    } else {
      insertedSignals += batch.length;
    }
  }

  console.log(`  Inserted ${insertedSignals}/${signalRows.length} signals (${signalErrors} batch errors)`);
  console.log();

  // ── Step 5: Create org_connectors records ───────────────────────────
  console.log('Step 5: Creating connector records...');

  const connectorData = [
    { type: 'slack', label: 'Slack', count: slack.messages.length },
    { type: 'hubspot', label: 'HubSpot', count: hubspot.deals.length + hubspot.contacts.length + hubspot.companies.length },
    { type: 'google-docs', label: 'Google Docs', count: docs.documents.length },
    { type: 'customer-platform', label: 'Customer Platform', count: customers.accounts.length + customers.tickets.length },
  ];

  for (const conn of connectorData) {
    const { error } = await supabase.from('org_connectors').insert({
      organization_id: COMPANY_JARVIS_ORG_ID,
      connector_type: conn.type,
      status: 'active',
      config: { synthetic: true, source: 'seed-company-jarvis' },
      signals_count: conn.count,
      last_sync_at: new Date().toISOString(),
    });

    if (error) {
      console.log(`  ${conn.label}: ${error.message}`);
    } else {
      console.log(`  ${conn.label}: active (${conn.count} records)`);
    }
  }
  console.log();

  // ── Step 6: Log sync ────────────────────────────────────────────────
  console.log('Step 6: Logging sync...');

  const totalMs = Date.now() - t0;
  const { error: syncError } = await supabase.from('connector_sync_log').insert({
    organization_id: COMPANY_JARVIS_ORG_ID,
    connector_id: 'seed-company-jarvis',
    sync_type: 'full',
    status: 'completed',
    signals_generated: insertedSignals,
    records_processed: slack.messages.length + hubspot.deals.length + docs.documents.length + customers.accounts.length,
    errors: trainErrors > 0 ? [{ type: 'training', count: trainErrors }] : [],
    duration_ms: totalMs,
    completed_at: new Date().toISOString(),
  });

  if (syncError) {
    console.log(`  Sync log: ${syncError.message}`);
  } else {
    console.log(`  Sync logged: ${totalMs}ms, ${insertedSignals} signals`);
  }
  console.log();

  // ── Step 7: Verification ────────────────────────────────────────────
  await verifyOrgData(supabase);

  // ── Done ────────────────────────────────────────────────────────────
  console.log('================================================================');
  console.log('  Company Jarvis Brain Setup COMPLETE');
  console.log(`  Org: ${COMPANY_JARVIS_ORG_ID}`);
  console.log();
  console.log('  The brain is now seeded with:');
  console.log(`  - ${slack.messages.length} Slack messages across ${slack.channels.length} channels`);
  console.log(`  - ${hubspot.deals.length} CRM deals, ${hubspot.contacts.length} contacts`);
  console.log(`  - ${docs.documents.length} internal documents`);
  console.log(`  - ${customers.accounts.length} customer accounts, ${customers.tickets.length} support tickets`);
  console.log(`  - ${analysis.insights.length} cross-domain insights`);
  console.log(`  - ${analysis.reversePrompts.length} reverse prompts`);
  console.log(`  - ${analysis.causalRelationships.length} causal relationships`);
  console.log();
  console.log('  Ready for copilot queries via /api/copilot/chat');
  console.log('================================================================');
}

// ── Run ──────────────────────────────────────────────────────────────────
seedCompanyJarvis().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export { COMPANY_JARVIS_ORG_ID, ORG_NAME, ORG_SLUG };
