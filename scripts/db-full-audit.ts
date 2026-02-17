import { config as loadEnv } from 'dotenv';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(url, key);
const orgId = '00000000-0000-4000-b000-000000000001';

async function paginatedQuery(table: string, selectCol: string, filter: Record<string, string> = {}) {
  const results: any[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let q = sb.from(table).select(selectCol).range(offset, offset + PAGE_SIZE - 1);
    for (const [k, v] of Object.entries(filter)) {
      q = q.eq(k, v);
    }
    const { data, error } = await q;
    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      results.push(...data);
      offset += PAGE_SIZE;
      if (data.length < PAGE_SIZE) hasMore = false;
    }
  }
  return results;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       NEXUS BRAIN — FULL DB AUDIT                          ║');
  console.log('║       Org: 00000000-0000-4000-b000-000000000001            ║');
  console.log('║       "Competition Demo 2026"                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Total signals (exact count)
  const { count: totalSignals } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  console.log(`TOTAL CROSS-DOMAIN SIGNALS: ${totalSignals?.toLocaleString()}\n`);

  // Paginate all signals to get domain + type breakdown
  console.log('Fetching full signal breakdown (paginated)...');
  const allSignals = await paginatedQuery('cross_domain_signals', 'source_domain, signal_type', { organization_id: orgId });
  console.log(`  Fetched ${allSignals.length.toLocaleString()} signal records\n`);

  // Domain breakdown
  const domainCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const domainTypeCounts = new Map<string, number>();

  for (const s of allSignals) {
    domainCounts.set(s.source_domain, (domainCounts.get(s.source_domain) || 0) + 1);
    typeCounts.set(s.signal_type, (typeCounts.get(s.signal_type) || 0) + 1);
    const key = `${s.source_domain}::${s.signal_type}`;
    domainTypeCounts.set(key, (domainTypeCounts.get(key) || 0) + 1);
  }

  console.log('SIGNALS BY DOMAIN:');
  console.log('─'.repeat(50));
  const sortedDomains = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [domain, count] of sortedDomains) {
    console.log(`  ${domain.padEnd(35)} ${count.toLocaleString().padStart(8)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(35)} ${allSignals.length.toLocaleString().padStart(8)}`);

  console.log('\nSIGNALS BY TYPE (all):');
  console.log('─'.repeat(50));
  const sortedTypes = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes) {
    console.log(`  ${type.padEnd(35)} ${count.toLocaleString().padStart(8)}`);
  }

  // GitHub-specific: PRs, commits, issues, reviews
  console.log('\n\nGITHUB ENGINEERING METRICS:');
  console.log('─'.repeat(50));
  const prTypes = ['pr_opened', 'pr_merged', 'pr_closed', 'pr_abandoned', 'pr_files_changed', 'pr_cycle_time', 'pr_size', 'prs_merged', 'pr_closed_unmerged'];
  const commitTypes = ['commit_pushed', 'commit_volume', 'commits_merged'];
  const reviewTypes = ['pr_review_submitted', 'pr_reviewed'];
  const issueTypes = ['issue_opened', 'issue_closed', 'bug_opened', 'bug_closed', 'bugs_reported', 'issues_created', 'issues_closed'];
  const ciTypes = ['ci_passed', 'ci_failed', 'ci_job_passed', 'ci_job_failed'];
  const deployTypes = ['deploy_success', 'deploy_failure', 'deploy_rollback'];

  const sumTypes = (types: string[]) => types.reduce((sum, t) => sum + (typeCounts.get(t) || 0), 0);

  console.log(`  PRs:        ${sumTypes(prTypes).toLocaleString()}`);
  console.log(`  Commits:    ${sumTypes(commitTypes).toLocaleString()}`);
  console.log(`  Reviews:    ${sumTypes(reviewTypes).toLocaleString()}`);
  console.log(`  Issues:     ${sumTypes(issueTypes).toLocaleString()}`);
  console.log(`  CI runs:    ${sumTypes(ciTypes).toLocaleString()}`);
  console.log(`  Deploys:    ${sumTypes(deployTypes).toLocaleString()}`);

  // Jira-specific
  console.log('\nJIRA ENGINEERING METRICS:');
  console.log('─'.repeat(50));
  const jiraCreated = typeCounts.get('jira_issue_created') || 0;
  const jiraResolved = typeCounts.get('jira_issue_resolved') || 0;
  const jiraComments = typeCounts.get('jira_comment') || 0;
  const jiraBugsOpened = typeCounts.get('bug_opened') || 0;
  const jiraBugsClosed = typeCounts.get('bug_closed') || 0;
  console.log(`  Tickets Created:  ${jiraCreated.toLocaleString()}`);
  console.log(`  Tickets Resolved: ${jiraResolved.toLocaleString()}`);
  console.log(`  Comments:         ${jiraComments.toLocaleString()}`);
  console.log(`  Bugs Opened:      ${jiraBugsOpened.toLocaleString()}`);
  console.log(`  Bugs Closed:      ${jiraBugsClosed.toLocaleString()}`);

  // Key tables
  console.log('\n\nCOGNITIVE LAYER DATA TABLES:');
  console.log('─'.repeat(60));
  const tables = [
    { name: 'cross_domain_signals',          layer: 'L1  Signal Ingestion' },
    { name: 'resolved_entities',              layer: 'L2  Entity Resolution' },
    { name: 'ai_memory',                      layer: 'L3  Semantic Memory' },
    { name: 'causal_relationships_statistical', layer: 'L4  Causal Graph Engine' },
    { name: 'brain_grammar_rules',            layer: 'L5  Pattern Memory' },
    { name: 'ai_agent_activity',              layer: 'L6  Self-Modifying Cognition' },
    { name: 'connector_sync_log',             layer: 'L7  Connector Sync' },
    { name: 'connector_signals',              layer: 'L24 Predictive Staffing (raw)' },
    { name: 'obs_signal_ingestion',           layer: 'L13 Immune System (obs)' },
    { name: 'obs_layer_health',               layer: 'L18 Org Topology (obs)' },
    { name: 'obs_feedback_loops',             layer: 'L19 Impact Cascade (obs)' },
    { name: 'obs_consolidation_cycles',       layer: 'L20 Strategic Synthesis (obs)' },
  ];

  for (const t of tables) {
    const { count, error } = await sb.from(t.name).select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
    const status = (count && count > 0) ? '✅' : '⬜';
    console.log(`  ${status} ${t.layer.padEnd(35)} ${(count?.toLocaleString() || 'N/A').padStart(10)} rows  (${t.name})`);
  }

  // Unique entities
  const { count: entityCount } = await sb.from('resolved_entities').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
  console.log(`\n\nENTITY RESOLUTION:  ${entityCount?.toLocaleString()} unique entities resolved`);

  // Causal edges
  const { data: edges } = await sb.from('causal_relationships_statistical')
    .select('source_domain, target_domain, effect_size, evidence_weight, is_significant')
    .eq('organization_id', orgId)
    .eq('is_significant', true);
  console.log(`CAUSAL EDGES:       ${edges?.length || 0} significant causal relationships`);
  if (edges && edges.length > 0) {
    for (const e of edges) {
      console.log(`  ${e.source_domain} → ${e.target_domain} (effect=${e.effect_size?.toFixed(3)}, weight=${e.evidence_weight?.toFixed(2)})`);
    }
  }

  // Grammar rules
  const { data: rules } = await sb.from('brain_grammar_rules')
    .select('domain, rule_type, confidence, natural_language')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .limit(20);
  console.log(`\nGRAMMAR RULES:      ${rules?.length || 0} active rules`);

  console.log('\n' + '═'.repeat(60));
  console.log('  AUDIT COMPLETE');
  console.log('═'.repeat(60));
}

main().catch(console.error);
