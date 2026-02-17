import { config as loadEnv } from 'dotenv';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(url, key);
const orgId = '00000000-0000-4000-b000-000000000001';

async function main() {
  // Check PR metadata fields in detail
  console.log('=== PR MERGED — metadata fields available ===');
  const { data: prm } = await sb.from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', orgId)
    .eq('signal_type', 'pr_merged')
    .limit(1);
  if (prm?.[0]) console.log(JSON.stringify(prm[0].signal_metadata, null, 2));

  console.log('\n=== PR OPENED — metadata ===');
  const { data: pro } = await sb.from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', orgId)
    .eq('signal_type', 'pr_opened')
    .limit(1);
  if (pro?.[0]) console.log(JSON.stringify(pro[0].signal_metadata, null, 2));

  console.log('\n=== COMMIT — metadata ===');
  const { data: cm } = await sb.from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', orgId)
    .eq('signal_type', 'commit_pushed')
    .limit(1);
  if (cm?.[0]) console.log(JSON.stringify(cm[0].signal_metadata, null, 2));

  console.log('\n=== DEPLOY — metadata ===');
  const { data: dp } = await sb.from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', orgId)
    .eq('signal_type', 'deploy_success')
    .limit(1);
  if (dp?.[0]) console.log(JSON.stringify(dp[0].signal_metadata, null, 2));

  console.log('\n=== JIRA CREATED — metadata ===');
  const { data: jc } = await sb.from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', orgId)
    .eq('signal_type', 'jira_issue_created')
    .limit(1);
  if (jc?.[0]) console.log(JSON.stringify(jc[0].signal_metadata, null, 2));

  console.log('\n=== JIRA RESOLVED — metadata ===');
  const { data: jr } = await sb.from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', orgId)
    .eq('signal_type', 'jira_issue_resolved')
    .limit(1);
  if (jr?.[0]) console.log(JSON.stringify(jr[0].signal_metadata, null, 2));

  console.log('\n=== REVIEW — metadata ===');
  const { data: rv } = await sb.from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', orgId)
    .eq('signal_type', 'pr_review_submitted')
    .limit(1);
  if (rv?.[0]) console.log(JSON.stringify(rv[0].signal_metadata, null, 2));

  console.log('\n=== BUG OPENED — metadata ===');
  const { data: bo } = await sb.from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', orgId)
    .eq('signal_type', 'bug_opened')
    .limit(1);
  if (bo?.[0]) console.log(JSON.stringify(bo[0].signal_metadata, null, 2));

  // Check resolved entities breakdown
  console.log('\n=== RESOLVED ENTITIES BREAKDOWN ===');
  const { data: ents } = await sb.from('resolved_entities')
    .select('entity_type, canonical_name, domain')
    .eq('organization_id', orgId)
    .limit(50);
  if (ents) {
    const byType: Record<string, string[]> = {};
    ents.forEach(e => {
      if (!byType[e.entity_type]) byType[e.entity_type] = [];
      byType[e.entity_type].push(`${e.canonical_name} (${e.domain})`);
    });
    Object.entries(byType).forEach(([t, names]) => {
      console.log(`\n  ${t}: ${names.length} entities`);
      names.slice(0, 5).forEach(n => console.log(`    - ${n}`));
      if (names.length > 5) console.log(`    ... +${names.length - 5} more`);
    });
  }

  // Count unique signal types  
  console.log('\n=== SIGNAL TYPES WITH COUNTS ===');
  // Need to paginate
  let offset = 0;
  const typeCounts: Record<string, number> = {};
  while (true) {
    const { data } = await sb.from('cross_domain_signals')
      .select('signal_type')
      .eq('organization_id', orgId)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach(s => { typeCounts[s.signal_type] = (typeCounts[s.signal_type] || 0) + 1; });
    offset += 1000;
    if (data.length < 1000) break;
  }
  Object.entries(typeCounts).sort((a,b) => b[1] - a[1]).forEach(([t, c]) => {
    console.log(`  ${t.padEnd(30)} ${c}`);
  });

  // Check early warning / observability tables
  console.log('\n=== EARLY WARNING TABLE DATA ===');
  const { data: ew, count: ewc } = await sb.from('obs_layer_health')
    .select('*', { count: 'exact', head: false })
    .eq('organization_id', orgId)
    .limit(3);
  console.log(`obs_layer_health: ${ewc} rows`);
  if (ew?.[0]) console.log('  Sample:', JSON.stringify(ew[0]).substring(0, 200));

  const { count: fcnt } = await sb.from('obs_feedback_loops')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  console.log(`obs_feedback_loops: ${fcnt} rows`);

  const { count: ccnt } = await sb.from('obs_consolidation_cycles')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  console.log(`obs_consolidation_cycles: ${ccnt} rows`);
}

main().catch(console.error);
