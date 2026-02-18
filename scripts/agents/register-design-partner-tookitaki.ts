/**
 * register-design-partner-tookitaki.ts
 * ======================================
 * One-time (idempotent) onboarding script for Tookitaki — NexusBrain's
 * first design partner.
 *
 * WHAT THIS DOES (in order):
 *   1. Verifies the `customers` row for Tookitaki exists (seeded by migration)
 *   2. Creates two fully-wired workspace-orgs under that customer:
 *        - tookitaki-634   → Bao/Ravi team, release/6.3.4, target Apr 7 2026
 *        - tookitaki-5115  → Sandeep/Doan team, release/5.11.5-enterprise,
 *                            drops Feb 26 + Mar 15 2026
 *   3. Registers the GitHub connector for each org (branch-scoped)
 *   4. Registers the Jira connector for each org (fixVersion-scoped)
 *   5. Calls ReleaseTracker.registerRelease() for each release track
 *   6. Prints the org IDs so they can be recorded in Notion/Linear
 *
 * WHY TWO ORGS (not one):
 *   `causal_relationships_statistical` is scoped by organization_id.
 *   The 5.11.x enterprise release has fundamentally different velocity,
 *   QA gate, and customer-constraint patterns from the 6.x main track.
 *   Mixing their signals in one causal graph would pollute both teams'
 *   AI recommendations. Two orgs = two fully isolated brains, each
 *   federating independently to CORE.
 *
 * IDEMPOTENCY:
 *   All DB writes use upsert / ON CONFLICT DO NOTHING. Safe to re-run.
 *
 * USAGE:
 *   # Dry run (no writes)
 *   npx tsx scripts/agents/register-design-partner-tookitaki.ts --dry-run
 *
 *   # Full run (requires env vars below)
 *   npx tsx scripts/agents/register-design-partner-tookitaki.ts
 *
 * REQUIRED ENV VARS:
 *   SUPABASE_URL                    — your project URL
 *   SUPABASE_SERVICE_ROLE_KEY       — service role key (not anon key)
 *
 * REQUIRED — FILL IN BEFORE RUNNING:
 *   TOOKITAKI_GITHUB_REPO           — e.g. "tookitaki/aml-engine"
 *   TOOKITAKI_GITHUB_TOKEN          — GitHub PAT with repo read access
 *   TOOKITAKI_JIRA_BASE_URL         — e.g. "https://tookitaki.atlassian.net"
 *   TOOKITAKI_JIRA_EMAIL            — Jira account email
 *   TOOKITAKI_JIRA_API_TOKEN        — Jira API token
 *   TOOKITAKI_JIRA_PROJECT_KEY      — e.g. "TM" or "TKIT"
 *
 * @module scripts/agents/register-design-partner-tookitaki
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { OrgCreationAgent } from './org-creation-agent';
import { ReleaseTracker, type ReleaseConfig } from '../../packages/memory-stack/src/connectors/release-tracker';

// ============================================================================
// CONSTANTS — stable, predictable IDs (safe to hardcode for design partners)
// ============================================================================

const CUSTOMER_ID    = 'a1000000-0000-4000-a000-000000000001'; // Tookitaki — seeded by migration
const ORG_ID_634     = 'b1000000-0000-4000-a000-000000000001'; // Bao/Ravi — 6.3.4 main track
const ORG_ID_5115    = 'b2000000-0000-4000-a000-000000000001'; // Sandeep/Doan — 5.11.5 enterprise

// ============================================================================
// ENVIRONMENT — fill these before running
// ============================================================================

const SUPABASE_URL              = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ⬇⬇ FILL THESE IN — or set as env vars ⬇⬇
const GITHUB_REPO      = process.env.TOOKITAKI_GITHUB_REPO      || '<FILL: e.g. tookitaki/aml-engine>';
const GITHUB_TOKEN     = process.env.TOOKITAKI_GITHUB_TOKEN     || '<FILL: GitHub PAT>';
const JIRA_BASE_URL    = process.env.TOOKITAKI_JIRA_BASE_URL    || '<FILL: e.g. https://tookitaki.atlassian.net>';
const JIRA_EMAIL       = process.env.TOOKITAKI_JIRA_EMAIL       || '<FILL: jira account email>';
const JIRA_API_TOKEN   = process.env.TOOKITAKI_JIRA_API_TOKEN   || '<FILL: jira api token>';
const JIRA_PROJECT_KEY = process.env.TOOKITAKI_JIRA_PROJECT_KEY || '<FILL: e.g. TM>';

const DRY_RUN = process.argv.includes('--dry-run');

// ============================================================================
// WORKSPACE DEFINITIONS
// ============================================================================

const WORKSPACE_634 = {
  orgId:    ORG_ID_634,
  name:     'Tookitaki — 6.x Main Track',
  slug:     'tookitaki-634',
  purpose:  '6.3.4 release track — Bao/Ravi team (NexusBrain SE-AAS design partner)',
  teamLabel: 'team-634',
  teamMembers: ['bao', 'ravi'],     // ← ADD full GitHub logins when known
  branch:   'release/6.3.4',
  baseBranch: 'release/6.3.3',
  baseVersion: '6.3.3',
  releaseName: '6.3.4',
  releaseType: 'minor' as const,
  targetDate: '2026-04-07',
  jiraFixVersion: '6.3.4',
  drops: undefined,                 // main track: no drops
};

const WORKSPACE_5115 = {
  orgId:    ORG_ID_5115,
  name:     'Tookitaki — 5.11.x Enterprise',
  slug:     'tookitaki-5115',
  purpose:  '5.11.5 enterprise release track — Sandeep/Doan team (NexusBrain SE-AAS design partner)',
  teamLabel: 'team-5115',
  teamMembers: ['sandeep', 'doan'], // ← ADD full GitHub logins when known
  branch:   'release/5.11.5-enterprise',
  baseBranch: 'release/5.11.4.3',
  baseVersion: '5.11.4.3',
  releaseName: '5.11.5-enterprise',
  releaseType: 'enterprise' as const,
  targetDate: '2026-03-15',         // final drop date
  jiraFixVersion: '5.11.5',
  drops: [
    { dropNumber: 1, dropDate: '2026-02-26' },
    { dropNumber: 2, dropDate: '2026-03-15' },
  ],
};

// ============================================================================
// HELPERS
// ============================================================================

function log(step: string, msg: string) {
  const prefix = DRY_RUN ? '[DRY-RUN]' : '[RUN]';
  console.log(`${prefix} [${step}] ${msg}`);
}

function validateEnv() {
  const missing: string[] = [];
  if (!SUPABASE_URL)              missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (GITHUB_REPO.startsWith('<'))  missing.push('TOOKITAKI_GITHUB_REPO');
  if (GITHUB_TOKEN.startsWith('<')) missing.push('TOOKITAKI_GITHUB_TOKEN');
  if (JIRA_BASE_URL.startsWith('<'))  missing.push('TOOKITAKI_JIRA_BASE_URL');
  if (JIRA_EMAIL.startsWith('<'))     missing.push('TOOKITAKI_JIRA_EMAIL');
  if (JIRA_API_TOKEN.startsWith('<')) missing.push('TOOKITAKI_JIRA_API_TOKEN');
  if (JIRA_PROJECT_KEY.startsWith('<')) missing.push('TOOKITAKI_JIRA_PROJECT_KEY');

  if (missing.length > 0) {
    console.error('\n❌  Missing required config — fill these in before running:\n');
    missing.forEach(v => console.error(`   ${v}`));
    console.error('\nSet as env vars or edit the constants at the top of this file.\n');
    if (!DRY_RUN) process.exit(1);
    console.warn('⚠️  Continuing in dry-run mode despite missing values.\n');
  }
}

// ============================================================================
// STEP 1 — Verify Tookitaki customer row exists
// ============================================================================

async function verifyCustomer(supabase: ReturnType<typeof createClient>) {
  log('CUSTOMER', `Verifying customer row (id=${CUSTOMER_ID})`);
  if (DRY_RUN) return;

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, is_design_partner')
    .eq('id', CUSTOMER_ID)
    .maybeSingle();

  if (error) throw new Error(`Customer lookup failed: ${error.message}`);
  if (!data) {
    throw new Error(
      `Customer row not found (id=${CUSTOMER_ID}). ` +
      `Did you run migration 20260223000001_customers_and_workspaces.sql?`
    );
  }
  log('CUSTOMER', `✓ Customer "${data.name}" found (design_partner=${data.is_design_partner})`);
}

// ============================================================================
// STEP 2 — Provision workspace-orgs
// ============================================================================

async function provisionWorkspace(
  agent: OrgCreationAgent,
  ws: typeof WORKSPACE_634 | typeof WORKSPACE_5115
) {
  log('ORG', `Provisioning workspace: ${ws.name} (id=${ws.orgId})`);

  if (DRY_RUN) {
    log('ORG', `  Would create org with slug="${ws.slug}", customer_id=${CUSTOMER_ID}`);
    return;
  }

  const result = await agent.createOrganization({
    id:          ws.orgId,
    name:        ws.name,
    slug:        ws.slug,
    customerId:  CUSTOMER_ID,
    plan:        'enterprise',
    industry:    'FinTech',
    purpose:     ws.purpose,
    connectors:  ['github', 'jira'],
    enableAutonomousLearning:  true,
    enableContinuousLearning:  true,
    enableCalibrationLoop:     true,
  });

  if (!result.success) {
    console.error(`⚠️  Org provisioning reported issues for ${ws.name}:`);
    result.errors.forEach(e => console.error(`   error: ${e}`));
    result.warnings.forEach(w => console.warn(`   warn:  ${w}`));
  } else {
    log('ORG', `✓ Workspace "${ws.name}" provisioned (brain=${result.brainRegionsInitialized} systems)`);
  }

  return result;
}

// ============================================================================
// STEP 3 — Register GitHub connector (branch-scoped)
// ============================================================================

async function registerGitHubConnector(
  supabase: ReturnType<typeof createClient>,
  ws: typeof WORKSPACE_634 | typeof WORKSPACE_5115
) {
  log('GITHUB', `Registering GitHub connector for ${ws.slug}`);

  // Branch config: monitor this release branch + its base branch
  const branchConfig = {
    connector_type: 'github',
    status:         'active',
    config: {
      // ⚠️  githubToken is stored encrypted in oauth_connector_credentials.
      // We store the repo + branch config here in plain config (non-sensitive).
      githubRepo:         GITHUB_REPO,
      branches:           [ws.branch, ws.baseBranch],
      primaryBranch:      ws.branch,
      releaseVersionMap:  { [ws.branch]: ws.releaseName, [ws.baseBranch]: ws.baseVersion },
      teamBranchMap:      { [ws.branch]: ws.teamLabel },
      teamMembers:        ws.teamMembers,
      registeredAt:       new Date().toISOString(),
      registeredBy:       'register-design-partner-tookitaki',
    },
  };

  if (DRY_RUN) {
    log('GITHUB', `  Would upsert: ${JSON.stringify(branchConfig.config, null, 2)}`);
    return;
  }

  // Store GitHub PAT in oauth_connector_credentials (encrypted, separate table)
  const { error: credError } = await supabase
    .from('oauth_connector_credentials')
    .upsert({
      organization_id: ws.orgId,
      connector_type:  'github',
      credentials:     { accessToken: GITHUB_TOKEN },
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'organization_id,connector_type' });

  if (credError) {
    console.warn(`⚠️  GitHub credential upsert failed for ${ws.slug}: ${credError.message}`);
    console.warn('    You may need to run this step manually via the connector settings UI.');
  }

  // Register connector config in org_connectors
  const { error } = await supabase
    .from('org_connectors')
    .upsert({
      organization_id: ws.orgId,
      ...branchConfig,
    }, { onConflict: 'organization_id,connector_type' });

  if (error) throw new Error(`GitHub connector registration failed: ${error.message}`);
  log('GITHUB', `✓ GitHub connector registered for ${ws.slug} (branch=${ws.branch})`);
}

// ============================================================================
// STEP 4 — Register Jira connector (fixVersion-scoped)
// ============================================================================

async function registerJiraConnector(
  supabase: ReturnType<typeof createClient>,
  ws: typeof WORKSPACE_634 | typeof WORKSPACE_5115
) {
  log('JIRA', `Registering Jira connector for ${ws.slug}`);

  const jiraConfig = {
    connector_type: 'jira',
    status:         'active',
    config: {
      projectKey:     JIRA_PROJECT_KEY,
      fixVersion:     ws.jiraFixVersion,
      teamLabel:      ws.teamLabel,
      registeredAt:   new Date().toISOString(),
      registeredBy:   'register-design-partner-tookitaki',
    },
  };

  if (DRY_RUN) {
    log('JIRA', `  Would upsert: ${JSON.stringify(jiraConfig.config, null, 2)}`);
    return;
  }

  // Store Jira credentials encrypted
  const { error: credError } = await supabase
    .from('oauth_connector_credentials')
    .upsert({
      organization_id: ws.orgId,
      connector_type:  'jira',
      credentials: {
        baseUrl:  JIRA_BASE_URL,
        email:    JIRA_EMAIL,
        apiToken: JIRA_API_TOKEN,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,connector_type' });

  if (credError) {
    console.warn(`⚠️  Jira credential upsert failed for ${ws.slug}: ${credError.message}`);
  }

  const { error } = await supabase
    .from('org_connectors')
    .upsert({
      organization_id: ws.orgId,
      ...jiraConfig,
    }, { onConflict: 'organization_id,connector_type' });

  if (error) throw new Error(`Jira connector registration failed: ${error.message}`);
  log('JIRA', `✓ Jira connector registered for ${ws.slug} (fixVersion=${ws.jiraFixVersion})`);
}

// ============================================================================
// STEP 5 — Register releases via ReleaseTracker
// ============================================================================

async function registerRelease(
  supabase: ReturnType<typeof createClient>,
  ws: typeof WORKSPACE_634 | typeof WORKSPACE_5115
) {
  log('RELEASE', `Registering release ${ws.releaseName} for ${ws.slug}`);

  const config: ReleaseConfig = {
    organizationId:   ws.orgId,
    releaseName:      ws.releaseName,
    releaseType:      ws.releaseType,
    branchName:       ws.branch,
    baseVersion:      ws.baseVersion,
    targetDate:       ws.targetDate,
    drops:            ws.drops,
    teamLabel:        ws.teamLabel,
    teamMembers:      ws.teamMembers,
    githubRepo:       GITHUB_REPO,
    jiraProjectKey:   JIRA_PROJECT_KEY,
    jiraFixVersion:   ws.jiraFixVersion,
    // Credentials passed for initial sync — stored in oauth_connector_credentials
    githubToken:      GITHUB_TOKEN,
    jiraCredentials: {
      baseUrl:  JIRA_BASE_URL,
      email:    JIRA_EMAIL,
      apiToken: JIRA_API_TOKEN,
    },
  };

  if (DRY_RUN) {
    log('RELEASE', `  Would call ReleaseTracker.registerRelease() with:`);
    const safePrint = { ...config, githubToken: '***', jiraCredentials: '***' };
    console.log(JSON.stringify(safePrint, null, 4));
    return;
  }

  const tracker = new ReleaseTracker(supabase);
  const entity = await tracker.registerRelease(config);
  log('RELEASE', `✓ Release registered — id=${entity.id} status=${entity.status}`);
  return entity;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(72));
  console.log('  NexusBrain — Tookitaki Design Partner Registration');
  console.log('  ' + (DRY_RUN ? '🔍 DRY RUN — no writes will be made' : '🚀 LIVE RUN'));
  console.log('═'.repeat(72) + '\n');

  validateEnv();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const agent = new OrgCreationAgent({
    supabase,
    verbose: true,
  } as any);

  // ── Step 1: Verify customer ───────────────────────────────────────────────
  await verifyCustomer(supabase);

  // ── Steps 2–5 for each workspace (sequential — org creation can be slow) ─

  for (const ws of [WORKSPACE_634, WORKSPACE_5115]) {
    console.log('\n' + '─'.repeat(72));
    console.log(`  Workspace: ${ws.name}`);
    console.log('─'.repeat(72));

    await provisionWorkspace(agent, ws);
    await registerGitHubConnector(supabase, ws);
    await registerJiraConnector(supabase, ws);
    await registerRelease(supabase, ws);
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  REGISTRATION COMPLETE');
  console.log('═'.repeat(72));
  console.log('\n📋  Record these org IDs in Notion/Linear:\n');
  console.log(`  Tookitaki 6.x Main Track (Bao/Ravi):        ${ORG_ID_634}`);
  console.log(`  Tookitaki 5.11.x Enterprise (Sandeep/Doan): ${ORG_ID_5115}`);
  console.log(`  Parent Customer (Tookitaki):                 ${CUSTOMER_ID}`);
  console.log('\n📋  Next steps:');
  console.log('  1. Trigger initial GitHub sync for each org (connector settings → "Sync Now")');
  console.log('  2. Verify signals appear in cross_domain_signals (filter by organization_id)');
  console.log('  3. Run one SE-AAS domain (e.g. pr-review) per org to confirm real code signals');
  console.log('  4. Share the design-partner onboarding checklist with Bao/Ravi + Sandeep/Doan');
  console.log('  5. Record onboarded_at timestamp in customers table\n');
}

main().catch(err => {
  console.error('\n❌ Registration failed:', err);
  process.exit(1);
});
