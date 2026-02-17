import { config as loadEnv } from 'dotenv';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(url, key);
const orgId = '00000000-0000-4000-b000-000000000001';

async function paginateAll(table: string, select: string, filters: Record<string, any> = {}, inFilters: Record<string, string[]> = {}) {
  const results: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    let q = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    for (const [k, v] of Object.entries(inFilters)) q = q.in(k, v);
    q = q.order('signal_timestamp', { ascending: true });
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    results.push(...data);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  return results;
}

function formatDate(ts: string): string {
  return new Date(ts).toISOString().replace('T', ' ').substring(0, 19);
}

function dayKey(ts: string): string {
  return new Date(ts).toISOString().split('T')[0];
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   TIMELINE: GIT COMMITS → JIRA TICKETS                                  ║');
  console.log('║   Showing every commit and correlated Jira activity over time            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  // ── Fetch all commit signals ──────────────────────────────────────
  const commits = await paginateAll('cross_domain_signals',
    'signal_type, signal_value, signal_timestamp, entity_id, entity_type, signal_metadata, source_domain',
    { organization_id: orgId },
    { signal_type: ['commit_pushed', 'commit_volume', 'commits_merged'] }
  );

  // ── Fetch all PR signals ──────────────────────────────────────────
  const prs = await paginateAll('cross_domain_signals',
    'signal_type, signal_value, signal_timestamp, entity_id, entity_type, signal_metadata, source_domain',
    { organization_id: orgId },
    { signal_type: ['pr_opened', 'pr_merged', 'prs_merged', 'pr_abandoned', 'pr_closed', 'pr_review_submitted'] }
  );

  // ── Fetch all Jira signals ────────────────────────────────────────
  const jiraSignals = await paginateAll('cross_domain_signals',
    'signal_type, signal_value, signal_timestamp, entity_id, entity_type, signal_metadata, source_domain',
    { organization_id: orgId, source_domain: 'engineering.jira' },
    { signal_type: ['jira_issue_created', 'jira_issue_resolved', 'bug_opened', 'bug_closed'] }
  );

  // ── Fetch CI/CD signals (deploy → jira link) ─────────────────────
  const deploys = await paginateAll('cross_domain_signals',
    'signal_type, signal_value, signal_timestamp, entity_id, signal_metadata, source_domain',
    { organization_id: orgId },
    { signal_type: ['deploy_success', 'deploy_failure', 'deploy_rollback'] }
  );

  console.log(`Loaded: ${commits.length} commits, ${prs.length} PRs, ${jiraSignals.length} Jira signals, ${deploys.length} deploys\n`);

  // ══════════════════════════════════════════════════════════════════
  // SECTION 1: DAILY TIMELINE — Git Activity alongside Jira Activity
  // ══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(110));
  console.log('  DAILY TIMELINE — Git Commits, PRs, Deploys, and Jira Tickets side by side');
  console.log('═'.repeat(110));

  // Build daily buckets
  interface DayBucket {
    commits: number;
    commitAuthors: Set<string>;
    prsOpened: number;
    prsMerged: number;
    prsReviewed: number;
    deploysOk: number;
    deploysFail: number;
    jiraCreated: number;
    jiraResolved: number;
    bugsOpened: number;
    bugsClosed: number;
    jiraProjects: Set<string>;
    commitMessages: string[];
    jiraKeys: string[];
  }

  const days = new Map<string, DayBucket>();
  function getDay(ts: string): DayBucket {
    const d = dayKey(ts);
    if (!days.has(d)) days.set(d, {
      commits: 0, commitAuthors: new Set(),
      prsOpened: 0, prsMerged: 0, prsReviewed: 0,
      deploysOk: 0, deploysFail: 0,
      jiraCreated: 0, jiraResolved: 0, bugsOpened: 0, bugsClosed: 0,
      jiraProjects: new Set(), commitMessages: [], jiraKeys: [],
    });
    return days.get(d)!;
  }

  for (const c of commits) {
    const b = getDay(c.signal_timestamp);
    b.commits += (c.signal_type === 'commit_volume' ? (c.signal_value || 1) : 1);
    const meta = c.signal_metadata as any;
    if (meta?.author) b.commitAuthors.add(meta.author);
    if (meta?.message) b.commitMessages.push(meta.message.substring(0, 60));
  }

  for (const p of prs) {
    const b = getDay(p.signal_timestamp);
    if (p.signal_type === 'pr_opened') b.prsOpened++;
    else if (p.signal_type === 'pr_merged' || p.signal_type === 'prs_merged') b.prsMerged += (p.signal_value || 1);
    else if (p.signal_type === 'pr_review_submitted') b.prsReviewed++;
  }

  for (const d of deploys) {
    const b = getDay(d.signal_timestamp);
    if (d.signal_type === 'deploy_success') b.deploysOk++;
    else b.deploysFail++;
  }

  for (const j of jiraSignals) {
    const b = getDay(j.signal_timestamp);
    const meta = j.signal_metadata as any;
    if (j.signal_type === 'jira_issue_created') {
      b.jiraCreated++;
      if (meta?.project) b.jiraProjects.add(meta.project);
      if (meta?.issue_key) b.jiraKeys.push(meta.issue_key);
    }
    else if (j.signal_type === 'jira_issue_resolved') b.jiraResolved++;
    else if (j.signal_type === 'bug_opened') b.bugsOpened++;
    else if (j.signal_type === 'bug_closed') b.bugsClosed++;
  }

  const sortedDays = Array.from(days.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Header
  console.log('\n  Date        │ Commits │ Authors │ PRs Open │ PR Merge │ Deploy │ Deploy Fail │ Jira Created │ Jira Done │ Bugs │ Bug Fix');
  console.log('  ────────────┼─────────┼─────────┼──────────┼──────────┼────────┼─────────────┼──────────────┼───────────┼──────┼────────');

  let runningCommits = 0, runningJiraCreated = 0, runningJiraResolved = 0;
  let firstGitDay = '', lastGitDay = '', firstJiraDay = '', lastJiraDay = '';

  for (const [day, b] of sortedDays) {
    // Only show days with activity
    if (b.commits === 0 && b.prsOpened === 0 && b.prsMerged === 0 &&
        b.jiraCreated === 0 && b.jiraResolved === 0 && b.deploysOk === 0 && b.deploysFail === 0 &&
        b.bugsOpened === 0 && b.bugsClosed === 0) continue;

    runningCommits += b.commits;
    runningJiraCreated += b.jiraCreated;
    runningJiraResolved += b.jiraResolved;

    if (b.commits > 0 || b.prsOpened > 0 || b.prsMerged > 0) {
      if (!firstGitDay) firstGitDay = day;
      lastGitDay = day;
    }
    if (b.jiraCreated > 0 || b.jiraResolved > 0) {
      if (!firstJiraDay) firstJiraDay = day;
      lastJiraDay = day;
    }

    // Visual bars
    const commitBar = '█'.repeat(Math.min(b.commits, 20));
    const jiraBar = '▓'.repeat(Math.min(Math.floor(b.jiraCreated / 10), 20));

    console.log(
      `  ${day}  │ ${String(b.commits).padStart(7)} │ ${String(b.commitAuthors.size).padStart(7)} │ ${String(b.prsOpened).padStart(8)} │ ${String(b.prsMerged).padStart(8)} │ ${String(b.deploysOk).padStart(6)} │ ${String(b.deploysFail).padStart(11)} │ ${String(b.jiraCreated).padStart(12)} │ ${String(b.jiraResolved).padStart(9)} │ ${String(b.bugsOpened).padStart(4)} │ ${String(b.bugsClosed).padStart(6)}`
    );

    // Show commit details on heavy commit days
    if (b.commits > 0 && b.commitMessages.length > 0) {
      const msgs = b.commitMessages.slice(0, 3);
      for (const msg of msgs) {
        console.log(`              │         │  └─ ${msg}`);
      }
    }

    // Show Jira ticket keys on heavy Jira days (sample)
    if (b.jiraCreated > 5 && b.jiraKeys.length > 0) {
      const sample = b.jiraKeys.slice(0, 5).join(', ');
      const projects = Array.from(b.jiraProjects).join(', ');
      console.log(`              │         │  └─ Jira [${projects}]: ${sample}${b.jiraKeys.length > 5 ? ` +${b.jiraKeys.length - 5} more` : ''}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION 2: CAUSAL LAG — What happens in Jira N days after commits
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n═'.repeat(110));
  console.log('  CAUSAL LAG ANALYSIS — What happens in Jira after code commits?');
  console.log('═'.repeat(110));

  // For each day with commits, look at Jira activity 0-7 days later
  const gitDays = sortedDays.filter(([_, b]) => b.commits > 0 || b.prsOpened > 0 || b.prsMerged > 0);
  const allDayMap = new Map(sortedDays);

  console.log('\n  Commit Day   │ Commits │ PRs │ → +0d Jira │ → +1d Jira │ → +2d Jira │ → +3d Jira │ → +7d Jira (cumul)');
  console.log('  ─────────────┼─────────┼─────┼────────────┼────────────┼────────────┼────────────┼───────────────────');

  for (const [day, b] of gitDays) {
    const commitCount = b.commits + b.prsOpened + b.prsMerged;
    if (commitCount === 0) continue;

    // Look ahead 0-7 days for Jira activity
    const jiraAhead: number[] = [];
    let cumulative = 0;
    for (let lag = 0; lag <= 7; lag++) {
      const futureDate = new Date(new Date(day).getTime() + lag * 86400000).toISOString().split('T')[0];
      const futureBucket = allDayMap.get(futureDate);
      const jiraCount = futureBucket ? futureBucket.jiraCreated + futureBucket.bugsOpened : 0;
      cumulative += jiraCount;
      jiraAhead.push(jiraCount);
    }

    console.log(
      `  ${day}  │ ${String(b.commits).padStart(7)} │ ${String(b.prsOpened + b.prsMerged).padStart(3)} │ ${String(jiraAhead[0]).padStart(10)} │ ${String(jiraAhead[1]).padStart(10)} │ ${String(jiraAhead[2]).padStart(10)} │ ${String(jiraAhead[3]).padStart(10)} │ ${String(cumulative).padStart(17)}`
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION 3: DISCOVERED CAUSAL LINK
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n═'.repeat(110));
  console.log('  BRAIN CAUSAL DISCOVERY — engineering.github → engineering.jira');
  console.log('═'.repeat(110));

  const { data: edges } = await sb.from('causal_relationships_statistical')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_significant', true);

  const jiraGitEdges = (edges || []).filter(e =>
    (e.source_domain.includes('jira') || e.target_domain.includes('jira')) &&
    (e.source_domain.includes('github') || e.target_domain.includes('github') ||
     e.source_domain.includes('commit') || e.target_domain.includes('commit') ||
     e.source_domain.includes('deploy') || e.target_domain.includes('deploy'))
  );

  for (const e of jiraGitEdges) {
    console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  ${e.source_domain}  →  ${e.target_domain}
  │
  │  Effect Size:    ${e.effect_size?.toFixed(4)} (${e.effect_size > 0.5 ? 'STRONG' : e.effect_size > 0.3 ? 'MODERATE' : 'WEAK'})
  │  Optimal Lag:    ${e.optimal_lag_days} day(s)
  │  F-statistic:    ${e.granger_f_statistic?.toFixed(2)}
  │  p-value:        ${e.granger_p_value?.toFixed(8)} ${e.granger_p_value < 0.001 ? '(highly significant)' : ''}
  │  Sample Size:    ${e.sample_size} observations
  │  Evidence:       ${e.evidence_weight?.toFixed(2)} / 1.00
  │  Method:         ${e.discovery_method}
  │
  │  ${e.natural_language}
  └─────────────────────────────────────────────────────────────┘`);
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION 4: SUMMARY STATS
  // ══════════════════════════════════════════════════════════════════
  console.log('\n\n═'.repeat(110));
  console.log('  TIMELINE SUMMARY');
  console.log('═'.repeat(110));

  console.log(`
  GIT ACTIVITY:
    Period:          ${firstGitDay} → ${lastGitDay}
    Total Commits:   ${runningCommits}
    Total PRs:       ${prs.length} (opened + merged + reviewed)
    Total Deploys:   ${deploys.length} (${deploys.filter(d => d.signal_type === 'deploy_success').length} success, ${deploys.filter(d => d.signal_type !== 'deploy_success').length} fail/rollback)

  JIRA ACTIVITY:
    Period:          ${firstJiraDay} → ${lastJiraDay}
    Tickets Created: ${runningJiraCreated.toLocaleString()}
    Tickets Resolved:${runningJiraResolved.toLocaleString()}
    Resolution Rate: ${runningJiraCreated > 0 ? ((runningJiraResolved / runningJiraCreated) * 100).toFixed(1) : 0}%

  CAUSAL LINKS FOUND:  ${jiraGitEdges.length}
    The brain discovered that GitHub activity Granger-causes
    Jira activity with a ${jiraGitEdges[0]?.optimal_lag_days || 'N/A'}-day lag.
    This means code changes PREDICT ticket creation ${jiraGitEdges[0]?.optimal_lag_days || 'N/A'} days later.

  TOTAL SIGNALS:   ${(commits.length + prs.length + jiraSignals.length + deploys.length).toLocaleString()} in this query
  `);
}

main().catch(console.error);
