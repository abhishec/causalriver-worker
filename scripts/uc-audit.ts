import { config as loadEnv } from 'dotenv';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(url, key);
const orgId = '00000000-0000-4000-b000-000000000001';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  USE CASE COVERAGE AUDIT — What can the brain answer today?     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ═══ USE CASE 1: VELOCITY COLLAPSE ═══
  console.log('━'.repeat(70));
  console.log('  USE CASE 1: DEPLOY VELOCITY COLLAPSE WARNING');
  console.log('━'.repeat(70));

  // Q1a: Do we have PR merge data?
  const { data: prSignals, count: prCount } = await sb.from('cross_domain_signals')
    .select('signal_type, signal_value, signal_metadata', { count: 'exact', head: false })
    .eq('organization_id', orgId)
    .in('signal_type', ['pr_merged', 'prs_merged', 'pr_opened', 'pr_closed', 'pr_abandoned', 'pr_review_submitted'])
    .limit(5);
  console.log(`\n  ✅/❌ PR Flow Data: ${prCount || 0} signals`);
  if (prSignals) prSignals.forEach(s => console.log(`     ${s.signal_type} = ${s.signal_value} | meta: ${JSON.stringify(s.signal_metadata || {}).substring(0,100)}`));

  // Q1b: PR cycle time (merged_at - created_at)?
  const { data: prMeta } = await sb.from('cross_domain_signals')
    .select('signal_type, signal_value, signal_metadata')
    .eq('organization_id', orgId)
    .in('signal_type', ['pr_merged', 'prs_merged'])
    .limit(3);
  console.log(`\n  ✅/❌ PR Cycle Time data:`);
  if (prMeta) prMeta.forEach(s => { const m = s.signal_metadata as any; console.log(`     cycle_time=${m?.avg_cycle_time_hours || m?.cycle_time || 'MISSING'} | meta keys: ${Object.keys(m||{}).join(', ')}`); });

  // Q1c: Commit volume / deploy velocity
  const { count: commitCount } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('signal_type', ['commit_pushed', 'commit_volume', 'commits_merged']);
  console.log(`\n  ✅/❌ Commit/Deploy velocity: ${commitCount || 0} signals`);

  const { count: deployCount } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('signal_type', ['deploy_success', 'deploy_failure', 'deploy_rollback']);
  console.log(`  ✅/❌ Deploy signals: ${deployCount || 0}`);

  // Q1d: Review latency / reviewer concentration?
  const { data: reviewSignals, count: reviewCount } = await sb.from('cross_domain_signals')
    .select('signal_type, signal_value, signal_metadata', { count: 'exact', head: false })
    .eq('organization_id', orgId)
    .in('signal_type', ['pr_review_submitted', 'review_turnaround'])
    .limit(3);
  console.log(`\n  ✅/❌ Review Metrics: ${reviewCount || 0} signals`);
  if (reviewSignals) reviewSignals.forEach(s => { const m = s.signal_metadata as any; console.log(`     ${s.signal_type} | meta keys: ${Object.keys(m||{}).join(', ')}`); });

  // Q1e: WIP / open PR count
  const { data: wipSignals, count: wipCount } = await sb.from('cross_domain_signals')
    .select('signal_type, signal_value, signal_metadata', { count: 'exact', head: false })
    .eq('organization_id', orgId)
    .in('signal_type', ['pr_opened', 'open_pr_count', 'wip_count'])
    .limit(3);
  console.log(`\n  ✅/❌ WIP / Open PRs: ${wipCount || 0} signals`);

  // Q1f: Jira tickets in progress / story points
  const { data: jiraInProgress } = await sb.from('cross_domain_signals')
    .select('signal_type, signal_value, signal_metadata')
    .eq('organization_id', orgId)
    .eq('source_domain', 'engineering.jira')
    .in('signal_type', ['jira_issue_created', 'jira_issue_resolved'])
    .limit(3);
  console.log(`\n  ✅/❌ Jira ticket cycle data (sample):`);
  if (jiraInProgress) jiraInProgress.forEach(s => { const m = s.signal_metadata as any; console.log(`     ${s.signal_type} | story_points=${m?.story_points||'MISSING'} | priority=${m?.priority||'MISSING'} | sprint=${m?.sprint||'MISSING'} | meta keys: ${Object.keys(m||{}).join(', ')}`); });

  // ═══ USE CASE 2: BOTTLENECK CONCENTRATION ═══
  console.log('\n\n' + '━'.repeat(70));
  console.log('  USE CASE 2: BOTTLENECK CONCENTRATION RISK');
  console.log('━'.repeat(70));

  // Q2a: Reviewer data — who reviews what?
  const { data: reviewerData } = await sb.from('cross_domain_signals')
    .select('signal_type, signal_value, entity_id, signal_metadata')
    .eq('organization_id', orgId)
    .eq('signal_type', 'pr_review_submitted')
    .limit(5);
  console.log(`\n  ✅/❌ Reviewer identity data:`);
  if (reviewerData && reviewerData.length > 0) {
    reviewerData.forEach(s => { const m = s.signal_metadata as any; console.log(`     entity=${s.entity_id} | reviewer=${m?.reviewer||m?.author||'MISSING'} | meta: ${Object.keys(m||{}).join(', ')}`); });
  } else { console.log('     ❌ NO pr_review_submitted signals found'); }

  // Q2b: Author → PR relationships
  const { data: authorPR } = await sb.from('cross_domain_signals')
    .select('signal_type, entity_id, entity_type, signal_metadata')
    .eq('organization_id', orgId)
    .in('signal_type', ['pr_opened', 'pr_merged'])
    .limit(5);
  console.log(`\n  ✅/❌ Author → PR edges:`);
  if (authorPR) authorPR.forEach(s => { const m = s.signal_metadata as any; console.log(`     ${s.signal_type} entity=${s.entity_id} type=${s.entity_type} | author=${m?.author||'MISSING'} | pr_number=${m?.pr_number||'MISSING'}`); });

  // Q2c: Resolved entities — do we have engineers/reviewers?
  const { data: entities } = await sb.from('resolved_entities')
    .select('canonical_name, entity_type, domain, aliases, confidence')
    .eq('organization_id', orgId)
    .limit(20);
  console.log(`\n  ✅/❌ Resolved Entities (engineers, repos):`);
  const typeGroups: Record<string, number> = {};
  if (entities) entities.forEach(e => { typeGroups[e.entity_type] = (typeGroups[e.entity_type] || 0) + 1; });
  Object.entries(typeGroups).forEach(([t, c]) => console.log(`     ${t}: ${c} entities`));
  
  // Show sample entities
  if (entities) {
    console.log('     Sample:');
    entities.slice(0, 10).forEach(e => console.log(`       ${e.entity_type}: "${e.canonical_name}" (${e.domain}) confidence=${e.confidence}`));
  }

  // Q2d: Causal edges — do we have velocity/bottleneck predictions?
  console.log('\n\n' + '━'.repeat(70));
  console.log('  CAUSAL EDGES (what the brain discovered)');
  console.log('━'.repeat(70));

  const { data: edges } = await sb.from('causal_relationships_statistical')
    .select('source_domain, target_domain, effect_size, optimal_lag_days, granger_p_value, natural_language, is_significant')
    .eq('organization_id', orgId)
    .eq('is_significant', true);
  
  console.log(`\n  Total significant edges: ${edges?.length || 0}\n`);
  if (edges) edges.forEach(e => {
    const strength = e.effect_size > 0.5 ? '🟢 STRONG' : e.effect_size > 0.3 ? '🟡 MODERATE' : '🔴 WEAK';
    console.log(`  ${e.source_domain} → ${e.target_domain}`);
    console.log(`     Effect: ${(e.effect_size*100).toFixed(1)}% | Lag: ${e.optimal_lag_days}d | p=${e.granger_p_value?.toFixed(6)} | ${strength}`);
    console.log(`     English: "${e.natural_language?.substring(0, 120)}"`);
    console.log('');
  });

  // Q2e: Early warning — velocity data
  const { data: earlyWarn } = await sb.from('cross_domain_signals')
    .select('signal_type, signal_value, signal_metadata')
    .eq('organization_id', orgId)
    .in('signal_type', ['velocity_trend', 'velocity_forecast', 'burndown_trend', 'sprint_velocity'])
    .limit(5);
  console.log('\n  ✅/❌ Velocity/Sprint signals: ' + (earlyWarn?.length || 0));

  // ═══ UNIQUE SIGNAL TYPES ═══
  console.log('\n\n' + '━'.repeat(70));
  console.log('  ALL SIGNAL TYPES IN THE BRAIN');
  console.log('━'.repeat(70));

  const { data: allTypes } = await sb.from('cross_domain_signals')
    .select('signal_type, source_domain')
    .eq('organization_id', orgId);
  
  const typeMap = new Map<string, { count: number; domains: Set<string> }>();
  if (allTypes) allTypes.forEach(s => {
    if (!typeMap.has(s.signal_type)) typeMap.set(s.signal_type, { count: 0, domains: new Set() });
    const entry = typeMap.get(s.signal_type)!;
    entry.count++;
    entry.domains.add(s.source_domain);
  });

  const sorted = Array.from(typeMap.entries()).sort((a, b) => b[1].count - a[1].count);
  console.log('\n  Signal Type                    │ Count   │ Domains');
  console.log('  ──────────────────────────────┼─────────┼──────────────────');
  sorted.forEach(([type, info]) => {
    console.log(`  ${type.padEnd(30)} │ ${String(info.count).padStart(7)} │ ${Array.from(info.domains).join(', ')}`);
  });

  // ═══ GRAMMAR RULES ═══
  console.log('\n\n' + '━'.repeat(70));
  console.log('  GRAMMAR RULES (learned patterns)');
  console.log('━'.repeat(70));
  const { data: rules } = await sb.from('brain_grammar_rules')
    .select('domain, rule_type, natural_language, confidence')
    .eq('organization_id', orgId);
  if (rules) rules.forEach(r => console.log(`\n  [${r.domain}] ${r.rule_type} (confidence=${r.confidence})\n     "${r.natural_language}"`));

  console.log('\n\nDone.');
}

main().catch(console.error);
