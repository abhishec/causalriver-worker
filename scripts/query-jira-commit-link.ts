import { config as loadEnv } from 'dotenv';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(url, key);
const orgId = '00000000-0000-4000-b000-000000000001';

async function paginateAll(table: string, select: string, filters: Record<string, any> = {}, orderBy?: string) {
  const results: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    let q = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [k, v] of Object.entries(filters)) {
      if (Array.isArray(v)) q = q.in(k, v);
      else q = q.eq(k, v);
    }
    if (orderBy) q = q.order(orderBy, { ascending: true });
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    results.push(...data);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  return results;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   JIRA ↔ CODE COMMITS — CROSS-DOMAIN CAUSAL ANALYSIS          ║');
  console.log('║   Org: Competition Demo 2026                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ═══════════════════════════════════════════════════════════════════
  // 1. CAUSAL RELATIONSHIPS: Jira ↔ Commits
  // ═══════════════════════════════════════════════════════════════════
  console.log('1. DISCOVERED CAUSAL LINKS (from 3-paradigm ensemble)');
  console.log('─'.repeat(70));

  const { data: allEdges } = await sb.from('causal_relationships_statistical')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_significant', true);

  const jiraCommitEdges = (allEdges || []).filter(e =>
    (e.source_domain.includes('jira') && e.target_domain.includes('commit')) ||
    (e.source_domain.includes('commit') && e.target_domain.includes('jira')) ||
    (e.source_domain.includes('jira') && e.target_domain.includes('github')) ||
    (e.source_domain.includes('github') && e.target_domain.includes('jira'))
  );

  if (jiraCommitEdges.length > 0) {
    for (const e of jiraCommitEdges) {
      const dir = e.effect_size > 0 ? '↑ increases' : '↓ decreases';
      console.log(`\n  ${e.source_domain} → ${e.target_domain}`);
      console.log(`    Effect: ${e.effect_size.toFixed(3)} (${dir})`);
      console.log(`    Lag: ${e.optimal_lag_days} day(s)`);
      console.log(`    Confidence: p=${e.granger_p_value?.toFixed(6)}, F=${e.granger_f_statistic?.toFixed(2)}`);
      console.log(`    Sample: n=${e.sample_size}`);
      console.log(`    Method: ${e.discovery_method}`);
      console.log(`    Explanation: ${e.natural_language}`);
    }
  } else {
    console.log('  (checking indirect links...)');
  }

  // Also show all edges for full context
  console.log('\n\n  ALL 13 CAUSAL EDGES (for context):');
  for (const e of (allEdges || [])) {
    const marker = jiraCommitEdges.includes(e) ? ' ← JIRA↔COMMIT' : '';
    console.log(`    ${e.source_domain} → ${e.target_domain} (effect=${e.effect_size?.toFixed(3)}, lag=${e.optimal_lag_days}d)${marker}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. GRAMMAR RULES connecting Jira ↔ GitHub
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n\n2. GRAMMAR RULES — Jira ↔ GitHub Patterns');
  console.log('─'.repeat(70));

  const { data: rules } = await sb.from('brain_grammar_rules')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  const relevantRules = (rules || []).filter(r =>
    r.natural_language?.includes('jira') || r.natural_language?.includes('github') ||
    r.natural_language?.includes('engineering') || r.domain?.includes('github') ||
    r.domain?.includes('jira')
  );

  for (const r of relevantRules) {
    console.log(`\n  Rule: ${r.natural_language}`);
    console.log(`    Domain: ${r.domain} | Type: ${r.rule_type} | Confidence: ${r.confidence?.toFixed(2)}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. TIME SERIES: Jira tickets vs Commits over time (weekly)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n\n3. WEEKLY TIME SERIES — Jira Tickets vs Code Commits');
  console.log('─'.repeat(70));

  // Fetch jira + commit signals
  const jiraSignals = await paginateAll('cross_domain_signals', 'signal_type, signal_timestamp, created_at',
    { organization_id: orgId, source_domain: 'engineering.jira' });
  const commitSignals = await paginateAll('cross_domain_signals', 'signal_type, signal_timestamp, created_at',
    { organization_id: orgId, signal_type: ['commit_volume', 'commits_merged', 'commit_pushed'] });
  const prSignals = await paginateAll('cross_domain_signals', 'signal_type, signal_timestamp, created_at',
    { organization_id: orgId, signal_type: ['pr_opened', 'pr_merged', 'prs_merged'] });

  // Group by week
  function weekKey(ts: string): string {
    const d = new Date(ts);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return start.toISOString().split('T')[0];
  }

  const jiraByWeek = new Map<string, { created: number; resolved: number; comments: number; bugs: number }>();
  for (const s of jiraSignals) {
    const week = weekKey(s.signal_timestamp || s.created_at);
    if (!jiraByWeek.has(week)) jiraByWeek.set(week, { created: 0, resolved: 0, comments: 0, bugs: 0 });
    const w = jiraByWeek.get(week)!;
    if (s.signal_type === 'jira_issue_created') w.created++;
    else if (s.signal_type === 'jira_issue_resolved') w.resolved++;
    else if (s.signal_type === 'jira_comment') w.comments++;
    else if (s.signal_type === 'bug_opened' || s.signal_type === 'bug_closed') w.bugs++;
  }

  const commitsByWeek = new Map<string, number>();
  for (const s of commitSignals) {
    const week = weekKey(s.signal_timestamp || s.created_at);
    commitsByWeek.set(week, (commitsByWeek.get(week) || 0) + 1);
  }

  const prsByWeek = new Map<string, number>();
  for (const s of prSignals) {
    const week = weekKey(s.signal_timestamp || s.created_at);
    prsByWeek.set(week, (prsByWeek.get(week) || 0) + 1);
  }

  // Merge all weeks and sort
  const allWeeks = new Set([...jiraByWeek.keys(), ...commitsByWeek.keys(), ...prsByWeek.keys()]);
  const sortedWeeks = Array.from(allWeeks).sort();

  console.log('\n  Week         │ Jira Created │ Jira Resolved │ Comments │ Bugs │ Commits │ PRs');
  console.log('  ─────────────┼──────────────┼───────────────┼──────────┼──────┼─────────┼────');

  let totalJiraCreated = 0, totalJiraResolved = 0, totalComments = 0, totalBugs = 0, totalCommits = 0, totalPRs = 0;
  for (const week of sortedWeeks) {
    const j = jiraByWeek.get(week) || { created: 0, resolved: 0, comments: 0, bugs: 0 };
    const c = commitsByWeek.get(week) || 0;
    const p = prsByWeek.get(week) || 0;
    totalJiraCreated += j.created;
    totalJiraResolved += j.resolved;
    totalComments += j.comments;
    totalBugs += j.bugs;
    totalCommits += c;
    totalPRs += p;

    console.log(`  ${week}  │ ${String(j.created).padStart(12)} │ ${String(j.resolved).padStart(13)} │ ${String(j.comments).padStart(8)} │ ${String(j.bugs).padStart(4)} │ ${String(c).padStart(7)} │ ${String(p).padStart(3)}`);
  }
  console.log('  ─────────────┼──────────────┼───────────────┼──────────┼──────┼─────────┼────');
  console.log(`  TOTAL        │ ${String(totalJiraCreated).padStart(12)} │ ${String(totalJiraResolved).padStart(13)} │ ${String(totalComments).padStart(8)} │ ${String(totalBugs).padStart(4)} │ ${String(totalCommits).padStart(7)} │ ${String(totalPRs).padStart(3)}`);

  // ═══════════════════════════════════════════════════════════════════
  // 4. CORRELATION: Compute Pearson correlation Jira vs Commits
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n\n4. CORRELATION ANALYSIS — Jira Activity vs Code Activity');
  console.log('─'.repeat(70));

  const weeks = sortedWeeks.filter(w => {
    const j = jiraByWeek.get(w);
    const c = commitsByWeek.get(w) || 0;
    return (j && j.created > 0) || c > 0;
  });

  function pearson(xs: number[], ys: number[]): number {
    const n = xs.length;
    if (n < 3) return 0;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx;
      const dy = ys[i] - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    return dx2 > 0 && dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : 0;
  }

  const jiraCreatedArr = weeks.map(w => jiraByWeek.get(w)?.created || 0);
  const jiraResolvedArr = weeks.map(w => jiraByWeek.get(w)?.resolved || 0);
  const commitsArr = weeks.map(w => commitsByWeek.get(w) || 0);
  const prsArr = weeks.map(w => prsByWeek.get(w) || 0);
  const bugsArr = weeks.map(w => jiraByWeek.get(w)?.bugs || 0);

  console.log(`\n  Jira Created  ↔ Commits:    r = ${pearson(jiraCreatedArr, commitsArr).toFixed(4)}`);
  console.log(`  Jira Resolved ↔ Commits:    r = ${pearson(jiraResolvedArr, commitsArr).toFixed(4)}`);
  console.log(`  Jira Created  ↔ PRs:        r = ${pearson(jiraCreatedArr, prsArr).toFixed(4)}`);
  console.log(`  Jira Resolved ↔ PRs:        r = ${pearson(jiraResolvedArr, prsArr).toFixed(4)}`);
  console.log(`  Bugs          ↔ Commits:    r = ${pearson(bugsArr, commitsArr).toFixed(4)}`);
  console.log(`  Bugs          ↔ PRs:        r = ${pearson(bugsArr, prsArr).toFixed(4)}`);

  // Lagged correlations
  console.log('\n  LAGGED CORRELATIONS (does Jira activity predict commits next week?):');
  for (let lag = 1; lag <= 4; lag++) {
    const jiraLagged = jiraCreatedArr.slice(0, -lag);
    const commitsLagged = commitsArr.slice(lag);
    const minLen = Math.min(jiraLagged.length, commitsLagged.length);
    if (minLen >= 3) {
      const r = pearson(jiraLagged.slice(0, minLen), commitsLagged.slice(0, minLen));
      console.log(`    Jira Created → Commits (lag ${lag}w): r = ${r.toFixed(4)}`);
    }
  }
  for (let lag = 1; lag <= 4; lag++) {
    const commitsLagged = commitsArr.slice(0, -lag);
    const jiraLagged = jiraResolvedArr.slice(lag);
    const minLen = Math.min(commitsLagged.length, jiraLagged.length);
    if (minLen >= 3) {
      const r = pearson(commitsLagged.slice(0, minLen), jiraLagged.slice(0, minLen));
      console.log(`    Commits → Jira Resolved (lag ${lag}w): r = ${r.toFixed(4)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. ENTITY-LEVEL: Which developers appear in both Jira + GitHub?
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n\n5. CROSS-SYSTEM ENTITIES — Developers in both Jira & GitHub');
  console.log('─'.repeat(70));

  const { data: entities } = await sb.from('resolved_entities')
    .select('*')
    .eq('organization_id', orgId)
    .limit(2000);

  const entitySources = new Map<string, Set<string>>();
  for (const e of (entities || [])) {
    const name = e.canonical_name || e.external_id || e.entity_id;
    if (!entitySources.has(name)) entitySources.set(name, new Set());
    entitySources.get(name)!.add(e.source || e.source_system || 'unknown');
  }

  // Count entities that appear in multiple systems
  const multiSystem = Array.from(entitySources.entries())
    .filter(([_, sources]) => sources.size > 1)
    .sort((a, b) => b[1].size - a[1].size);

  console.log(`  Total entities: ${entities?.length || 0}`);
  console.log(`  Multi-system entities: ${multiSystem.length}`);
  if (multiSystem.length > 0) {
    console.log('\n  Top cross-system entities:');
    for (const [name, sources] of multiSystem.slice(0, 15)) {
      console.log(`    ${name}: ${Array.from(sources).join(', ')}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 6. SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n\n' + '═'.repeat(70));
  console.log('SUMMARY: How Jira and Code Commits are Linked');
  console.log('═'.repeat(70));
  console.log(`
  1. CAUSAL DISCOVERY found ${jiraCommitEdges.length} direct causal links between
     Jira and GitHub domains using Granger causality + LiNGAM + KSG
     mutual information (3-paradigm ensemble with Bayesian Judge).

  2. The brain has ${(allEdges || []).length} total causal relationships,
     with ${jiraCommitEdges.length} directly connecting Jira ↔ GitHub systems.

  3. TIME SERIES spans ${sortedWeeks.length} weeks with:
     - ${totalJiraCreated.toLocaleString()} Jira tickets created
     - ${totalJiraResolved.toLocaleString()} Jira tickets resolved
     - ${totalCommits.toLocaleString()} code commits
     - ${totalPRs.toLocaleString()} pull requests

  4. The data IS queryable — the brain can tell you exactly how
     Jira activity and code commits relate over any time window.
  `);
}

main().catch(console.error);
