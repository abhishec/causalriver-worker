#!/usr/bin/env npx tsx
/**
 * Org Agent CLI Runner
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Interactive and command-line interface for the Org Creation Agent.
 *
 * **Usage**:
 * ```bash
 * # Interactive mode — prompts for all details
 * npx tsx scripts/run-org-agent.ts create
 *
 * # Command-line mode — all flags provided
 * npx tsx scripts/run-org-agent.ts create \
 *   --name="Sales Intelligence" \
 *   --slug="sales-intel" \
 *   --industry="SaaS" \
 *   --purpose="Sales forecasting and pipeline intelligence" \
 *   --connectors="hubspot,stripe,slack" \
 *   --schedule="0 2 * * *"
 *
 * # Fix existing org
 * npx tsx scripts/run-org-agent.ts fix \
 *   --org-id="22222222-2222-4000-a000-222222222222" \
 *   --reinit-brain \
 *   --reset-learning \
 *   --rebuild-graph \
 *   --recalibrate
 *
 * # Fix all existing Jarvis orgs
 * npx tsx scripts/run-org-agent.ts fix-all-jarvis
 * ```
 */

import * as readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import { OrgCreationAgent, type OrgCreationRequest, type OrgFixRequest } from './agents/org-creation-agent';
import type { BrainNativeAgentConfig } from './agent-framework/brain-native-agent-template';

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════

function loadEnv(): { supabaseUrl: string; supabaseKey: string } {
  let supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Try loading from platform/.env
  if (!supabaseUrl || !supabaseKey) {
    try {
      const fs = require('fs');
      const path = require('path');
      const platformDir = path.resolve(__dirname, '..', 'platform');
      const envPath = fs.existsSync(path.join(platformDir, '.env.local'))
        ? path.join(platformDir, '.env.local')
        : path.join(platformDir, '.env');

      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          if (key === 'NEXT_PUBLIC_SUPABASE_URL' && !supabaseUrl) supabaseUrl = value;
          if (key === 'SUPABASE_URL' && !supabaseUrl) supabaseUrl = value;
          if (key === 'SUPABASE_SERVICE_ROLE_KEY' && !supabaseKey) supabaseKey = value;
        }
      }
    } catch (err) {
      // Ignore file read errors
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars or add to platform/.env');
    process.exit(1);
  }

  return { supabaseUrl, supabaseKey };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTIVE PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

async function promptForOrgCreation(): Promise<OrgCreationRequest> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🤖 ORG CREATION AGENT — Interactive Setup');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const name = await ask('Organization name (e.g., "Sales Intelligence"): ');
  const slug = await ask('URL slug (e.g., "sales-intel"): ');
  const industry = await ask('Industry (e.g., "SaaS", "E-commerce", "Finance"): ');
  const purpose = await ask('Primary use case (e.g., "Sales forecasting", "Finance tracking"): ');

  console.log('\nAvailable connectors:');
  console.log('  - slack, hubspot, github, stripe, xero, volopay, google-docs');
  console.log('  - jira, pagerduty, linear, notion, intercom, zendesk');
  console.log('  - salesforce, postgresql, mongodb, rest-api\n');

  const connectorsInput = await ask('Connectors (comma-separated, e.g., "hubspot,slack,stripe"): ');
  const connectors = connectorsInput.split(',').map(c => c.trim()).filter(Boolean);

  const autonomousLearning = await ask('Enable autonomous learning? (Y/n): ');
  const enableAutonomousLearning = autonomousLearning.toLowerCase() !== 'n';

  const scheduleInput = await ask('ECS cron schedule (optional, e.g., "0 2 * * 0" for Sunday 2 AM UTC): ');
  const schedule = scheduleInput.trim() || undefined;

  rl.close();

  return {
    name,
    slug,
    industry,
    purpose,
    connectors,
    enableAutonomousLearning,
    schedule,
    plan: 'pro',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND PARSERS
// ═══════════════════════════════════════════════════════════════════════════

function parseCreateArgs(args: string[]): Partial<OrgCreationRequest> {
  const request: Partial<OrgCreationRequest> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = nextArg && !nextArg.startsWith('--') ? nextArg : '';

      switch (key) {
        case 'name':
          request.name = value;
          i++;
          break;
        case 'slug':
          request.slug = value;
          i++;
          break;
        case 'industry':
          request.industry = value;
          i++;
          break;
        case 'purpose':
          request.purpose = value;
          i++;
          break;
        case 'connectors':
          request.connectors = value.split(',').map(c => c.trim());
          i++;
          break;
        case 'schedule':
          request.schedule = value;
          i++;
          break;
        case 'cpu':
          request.cpu = value;
          i++;
          break;
        case 'memory':
          request.memory = value;
          i++;
          break;
        case 'no-autonomous-learning':
          request.enableAutonomousLearning = false;
          break;
      }
    }
  }

  return request;
}

function parseFixArgs(args: string[]): OrgFixRequest {
  const request: OrgFixRequest = {
    orgId: '',
    fixes: {},
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);

      switch (key) {
        case 'org-id':
          request.orgId = nextArg;
          i++;
          break;
        case 'reinit-brain':
          request.fixes!.reinitBrainRegions = true;
          break;
        case 'reset-learning':
          request.fixes!.resetAutonomousLearning = true;
          break;
        case 'rebuild-graph':
          request.fixes!.rebuildCausalGraph = true;
          break;
        case 'recalibrate':
          request.fixes!.recalibrateAccuracy = true;
          break;
        case 'reconnect-connectors':
          request.fixes!.reconnectConnectors = true;
          break;
        case 'full-audit':
          request.fixes!.fullHealthAudit = true;
          break;
      }
    }
  }

  return request;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

async function createOrg(args: string[]) {
  const { supabaseUrl, supabaseKey } = loadEnv();

  // Parse or prompt
  let request: OrgCreationRequest;
  const parsedArgs = parseCreateArgs(args);

  if (!parsedArgs.name || !parsedArgs.slug || !parsedArgs.connectors) {
    request = await promptForOrgCreation();
  } else {
    request = parsedArgs as OrgCreationRequest;
  }

  // Create agent
  const config: BrainNativeAgentConfig = {
    supabaseUrl,
    supabaseKey,
    verbose: true,
  };

  const agent = new OrgCreationAgent(config);
  const result = await agent.createOrganization(request);

  // Print result
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  ${result.success ? '✅' : '❌'} ORG CREATION ${result.success ? 'COMPLETE' : 'FAILED'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Organization: ${result.organizationName}`);
  console.log(`Org ID:       ${result.organizationId}`);
  console.log(`Brain Systems: ${result.brainRegionsInitialized}/93+`);
  console.log(`Autonomous Learning: ${result.autonomousLearningEnabled ? '✓' : '✗'}`);
  console.log(`Continuous Learning: ${result.continuousLearningEnabled ? '✓' : '✗'}`);
  console.log(`Calibration Loop: ${result.calibrationLoopEnabled ? '✓' : '✗'}`);
  console.log(`Motor Commands: ${result.motorCommandsRegistered}`);
  console.log(`Connectors: ${result.connectorsConfigured.join(', ') || 'none'}`);
  console.log(`Copilot Ready: ${result.copilotReady ? '✓' : '✗'}`);
  console.log(`Health: ${result.healthStatus.overall.toUpperCase()}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const warn of result.warnings) {
      console.log(`  - ${warn}`);
    }
  }

  if (result.nextSteps.length > 0) {
    console.log('\n📋 Next Steps:');
    for (const step of result.nextSteps) {
      console.log(`  - ${step}`);
    }
  }

  console.log('');
}

async function fixOrg(args: string[]) {
  const { supabaseUrl, supabaseKey } = loadEnv();
  const request = parseFixArgs(args);

  if (!request.orgId) {
    console.error('❌ Missing --org-id flag');
    console.error('Usage: npx tsx scripts/run-org-agent.ts fix --org-id=<uuid>');
    process.exit(1);
  }

  const config: BrainNativeAgentConfig = {
    supabaseUrl,
    supabaseKey,
    verbose: true,
  };

  const agent = new OrgCreationAgent(config);
  const result = await agent.fixOrganization(request);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  ${result.success ? '✅' : '❌'} ORG FIX ${result.success ? 'COMPLETE' : 'FAILED'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Organization: ${result.organizationName}`);
  console.log(`Health: ${result.healthStatus.overall.toUpperCase()}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const warn of result.warnings) {
      console.log(`  - ${warn}`);
    }
  }

  console.log('');
}

async function fixAllJarvis() {
  const { supabaseUrl, supabaseKey } = loadEnv();
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🔧 FIXING ALL JARVIS ORGANIZATIONS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const jarvisOrgs = [
    { id: '22222222-2222-4000-a000-222222222222', name: 'Company Jarvis' },
    { id: '33333333-3333-4000-a000-333333333333', name: 'Slack Jarvis (if dedicated)' },
    { id: '44444444-4444-4000-a000-444444444444', name: 'Finance Jarvis (if dedicated)' },
  ];

  const config: BrainNativeAgentConfig = {
    supabaseUrl,
    supabaseKey,
    verbose: true,
  };

  const agent = new OrgCreationAgent(config);

  for (const org of jarvisOrgs) {
    console.log(`\n── Fixing: ${org.name} (${org.id}) ──\n`);

    // Check if org exists
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', org.id)
      .single();

    if (!existing) {
      console.log(`⏭️  Skipping ${org.name} — org not found\n`);
      continue;
    }

    const request: OrgFixRequest = {
      orgId: org.id,
      fixes: {
        reinitBrainRegions: true,
        resetAutonomousLearning: true,
        recalibrateAccuracy: true,
        fullHealthAudit: true,
      },
    };

    try {
      const result = await agent.fixOrganization(request);
      console.log(`${result.success ? '✅' : '❌'} ${org.name}: ${result.healthStatus.overall}`);
    } catch (err) {
      console.error(`❌ ${org.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ALL JARVIS ORGS PROCESSED');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'create':
      await createOrg(args);
      break;

    case 'fix':
      await fixOrg(args);
      break;

    case 'fix-all-jarvis':
      await fixAllJarvis();
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log(`
Org Agent CLI — Create and fix NexusBrain organization databases

USAGE:
  npx tsx scripts/run-org-agent.ts <command> [options]

COMMANDS:
  create              Create a new organization (interactive or via flags)
  fix                 Fix an existing organization
  fix-all-jarvis      Fix all existing Jarvis organizations
  help                Show this help message

CREATE OPTIONS:
  --name="..."        Organization name
  --slug="..."        URL slug
  --industry="..."    Industry/vertical
  --purpose="..."     Primary use case
  --connectors="..."  Comma-separated connector list
  --schedule="..."    ECS cron schedule (optional)
  --cpu="2048"        ECS CPU units (optional)
  --memory="8192"     ECS memory in MB (optional)
  --no-autonomous-learning   Disable autonomous learning

FIX OPTIONS:
  --org-id="..."      Organization ID to fix
  --reinit-brain      Reinitialize all brain regions
  --reset-learning    Reset autonomous learning
  --rebuild-graph     Rebuild causal graph from signals
  --recalibrate       Recalibrate prediction accuracy
  --reconnect-connectors   Reset connector auth
  --full-audit        Run full brain health audit

EXAMPLES:
  # Interactive creation
  npx tsx scripts/run-org-agent.ts create

  # CLI creation
  npx tsx scripts/run-org-agent.ts create \\
    --name="Sales Intel" \\
    --slug="sales-intel" \\
    --connectors="hubspot,slack"

  # Fix org
  npx tsx scripts/run-org-agent.ts fix \\
    --org-id="22222222-2222-4000-a000-222222222222" \\
    --reinit-brain \\
    --recalibrate

  # Fix all Jarvis orgs
  npx tsx scripts/run-org-agent.ts fix-all-jarvis
      `);
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      console.error('Run "npx tsx scripts/run-org-agent.ts help" for usage');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
