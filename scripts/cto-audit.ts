/**
 * CTO Production Data Audit - NexusBrain Supabase Database
 * Usage: npx tsx scripts/cto-audit.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zmlqvuzoodcgmkgkivfw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("Set SUPABASE_SERVICE_ROLE_KEY env var"); })();
const ORG_ID = '00000000-0000-4000-a000-000000000001';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function header(title: string) {
  const line = '='.repeat(70);
  console.log('\n' + line + '\n  ' + title + '\n' + line);
}
function subheader(title: string) { console.log('\n  --- ' + title + ' ---'); }
function row(label: string, value: unknown) { console.log('    ' + String(label).padEnd(45) + ' ' + value); }
function jsonBlock(data: unknown) { console.log(JSON.stringify(data, null, 2)); }
function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function fetchAll(table: string, select: string, filters: Record<string, string> = {}) {
  let all: any[] = [];
  let from = 0;
  const bs = 1000;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + bs - 1);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) { console.log('    ERROR fetching ' + table + ': ' + error.message); break; }
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < bs) break;
    from += bs;
  }
  return all;
}

async function auditSignals() {
  header('1. SIGNAL HEALTH (cross_domain_signals)');
  const { count: totalSignals } = await supabase
    .from('cross_domain_signals')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID);
  row('Total signals', totalSignals ?? 0);

  const allSignals = await fetchAll(
    'cross_domain_signals',
    'source_domain, signal_metadata, created_at',
    { organization_id: ORG_ID }
  );
  if (!allSignals.length) { console.log('    (no signals found)'); return; }

  subheader('Signals by source_domain');
  const dc: Record<string, number> = {};
  const sc: Record<string, number> = {};
  for (const s of allSignals) {
    const d = s.source_domain || '(null)';
    dc[d] = (dc[d] || 0) + 1;
    const m = s.signal_metadata as any;
    const src = m?.source || m?.connector_type || '(unknown)';
    sc[src] = (sc[src] || 0) + 1;
  }
  for (const [d, c] of Object.entries(dc).sort((a, b) => b[1] - a[1])) row(d, c);

  subheader('Signals by metadata source / connector_type');
  for (const [s, c] of Object.entries(sc).sort((a, b) => b[1] - a[1])) row(s, c);

  subheader('Date Range');
  const dates = allSignals
    .map((s: any) => new Date(s.created_at))
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());
  row('Oldest signal', dates[0].toISOString());
  row('Newest signal', dates[dates.length - 1].toISOString());
  const daySpan = Math.max(1, (dates[dates.length - 1].getTime() - dates[0].getTime()) / 86400000);
  row('Span (days)', daySpan.toFixed(1));
  row('Signals per day (avg)', (allSignals.length / daySpan).toFixed(1));

  subheader('Public Sources vs Org-Specific Sources');
  const pub = new Set([
    'wikipedia', 'fred', 'imf', 'bls', 'world_bank', 'uspto',
    'economics', 'macroeconomics', 'labor_market', 'technology',
    'patents', 'global_economics', 'innovation', 'trade',
    'demographics', 'public_health', 'energy',
  ]);
  const orgSet = new Set(['hubspot', 'github', 'jira', 'slack', 'salesforce', 'notion']);
  let pc = 0, oc = 0, ot = 0;
  for (const s of allSignals) {
    const d = (s.source_domain || '').toLowerCase();
    const m = s.signal_metadata as any;
    const src = ((m?.source as string) || '').toLowerCase();
    if (pub.has(d) || pub.has(src)) pc++;
    else if (orgSet.has(d) || orgSet.has(src)) oc++;
    else ot++;
  }
  row('Public source signals', pc);
  row('Org-specific source signals', oc);
  row('Other / unclassified', ot);
}

async function auditEdges() {
  header('2. CAUSAL EDGE QUALITY (causal_relationships_statistical)');
  const { count: totalEdges } = await supabase
    .from('causal_relationships_statistical')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID);
  row('Total edges', totalEdges ?? 0);

  const allEdges = await fetchAll(
    'causal_relationships_statistical',
    'source_signal_id, target_signal_id, effect_size, p_value, sample_size, is_likely_confounded, last_computed_at, created_at',
    { organization_id: ORG_ID }
  );
  if (!allEdges.length) { console.log('    (no edges found)'); return; }

  row('Significant edges (p < 0.05)', allEdges.filter((e: any) => e.p_value !== null && e.p_value < 0.05).length);

  // Map signal IDs to domains
  subheader('Fetching signal domains for edge mapping...');
  const sids = new Set<string>();
  for (const e of allEdges) {
    if (e.source_signal_id) sids.add(e.source_signal_id);
    if (e.target_signal_id) sids.add(e.target_signal_id);
  }
  const sidArr = Array.from(sids);
  const dm: Record<string, string> = {};
  for (let i = 0; i < sidArr.length; i += 200) {
    const ch = sidArr.slice(i, i + 200);
    const { data } = await supabase.from('cross_domain_signals').select('id, source_domain').in('id', ch);
    if (data) for (const s of data) dm[s.id] = s.source_domain || '(unknown)';
  }

  subheader('Top 15 Edge Domain Pairs (source -> target)');
  const pairC: Record<string, number> = {};
  for (const e of allEdges) {
    const k = (dm[e.source_signal_id] || '(?)') + ' -> ' + (dm[e.target_signal_id] || '(?)');
    pairC[k] = (pairC[k] || 0) + 1;
  }
  for (const [p, c] of Object.entries(pairC).sort((a, b) => b[1] - a[1]).slice(0, 15)) row(p, c);

  subheader('Effect Size Distribution');
  const es = allEdges.map((e: any) => e.effect_size).filter((v: any): v is number => v !== null && v !== undefined);
  if (es.length) {
    row('Count with effect_size', es.length);
    row('Min', Math.min(...es).toFixed(4));
    row('Max', Math.max(...es).toFixed(4));
    row('Mean', (es.reduce((a: number, b: number) => a + b, 0) / es.length).toFixed(4));
    row('Median', median(es).toFixed(4));
  }

  subheader('Sample Size Analysis');
  row('sample_size > 30', allEdges.filter((e: any) => e.sample_size != null && e.sample_size > 30).length);
  row('sample_size <= 30', allEdges.filter((e: any) => e.sample_size != null && e.sample_size <= 30).length);
  row('sample_size is null', allEdges.filter((e: any) => e.sample_size == null).length);
  row('Training pack edges (sample_size=100)', allEdges.filter((e: any) => e.sample_size === 100).length);
  row('Real / organic data edges', allEdges.length - allEdges.filter((e: any) => e.sample_size === 100).length);

  subheader('Confounding');
  row('is_likely_confounded = true', allEdges.filter((e: any) => e.is_likely_confounded === true).length);
  row('is_likely_confounded = false', allEdges.filter((e: any) => e.is_likely_confounded === false).length);
  row('is_likely_confounded = null', allEdges.filter((e: any) => e.is_likely_confounded == null).length);

  subheader('Edge Age (last_computed_at)');
  const cd = allEdges.filter((e: any) => e.last_computed_at).map((e: any) => new Date(e.last_computed_at));
  if (cd.length) {
    cd.sort((a: Date, b: Date) => a.getTime() - b.getTime());
    row('Oldest last_computed_at', cd[0].toISOString());
    row('Newest last_computed_at', cd[cd.length - 1].toISOString());
    const now = Date.now();
    const ages = cd.map((d: Date) => (now - d.getTime()) / 86400000);
    row('Mean age (days)', (ages.reduce((a: number, b: number) => a + b, 0) / ages.length).toFixed(1));
    row('Median age (days)', median(ages).toFixed(1));
  } else {
    const cd2 = allEdges.filter((e: any) => e.created_at).map((e: any) => new Date(e.created_at));
    if (cd2.length) {
      cd2.sort((a: Date, b: Date) => a.getTime() - b.getTime());
      row('(using created_at)', '');
      row('Oldest', cd2[0].toISOString());
      row('Newest', cd2[cd2.length - 1].toISOString());
    }
  }
}

async function auditMemories() {
  header('3. MEMORY QUALITY (ai_memory)');
  subheader('Total Memories by Type');
  const allMems = await fetchAll('ai_memory', 'memory_type, created_at, content, importance_score', { organization_id: ORG_ID });
  if (!allMems.length) { console.log('    (no memories found)'); return; }

  const tc: Record<string, number> = {};
  for (const m of allMems) { const t = m.memory_type || '(null)'; tc[t] = (tc[t] || 0) + 1; }
  for (const [t, c] of Object.entries(tc).sort((a, b) => b[1] - a[1])) row(t, c);
  row('TOTAL', allMems.length);

  subheader('Recent Memories (Last 7 Days) by Type');
  const cutoff = new Date(Date.now() - 7 * 86400000);
  const recent = allMems.filter((m: any) => new Date(m.created_at) > cutoff);
  const rtc: Record<string, number> = {};
  for (const m of recent) { const t = m.memory_type || '(null)'; rtc[t] = (rtc[t] || 0) + 1; }
  if (Object.keys(rtc).length) {
    for (const [t, c] of Object.entries(rtc).sort((a, b) => b[1] - a[1])) row(t, c);
    row('TOTAL (7d)', recent.length);
  } else {
    console.log('    (no memories in the last 7 days)');
  }

  for (const memType of ['brain_discovery', 'proactive_insight', 'consolidation_report']) {
    subheader('Latest 5 ' + JSON.stringify(memType) + ' memories');
    const { data: samples } = await supabase
      .from('ai_memory')
      .select('id, content, importance_score, created_at')
      .eq('organization_id', ORG_ID)
      .eq('memory_type', memType)
      .order('created_at', { ascending: false })
      .limit(5);
    if (samples && samples.length) {
      for (const s of samples) {
        console.log('\n    [' + s.created_at + '] importance=' + s.importance_score);
        const c = typeof s.content === 'string' ? s.content : JSON.stringify(s.content, null, 2);
        console.log('    ' + (c.length > 600 ? c.slice(0, 600) + '... (truncated)' : c));
      }
    } else {
      console.log('    (no ' + JSON.stringify(memType) + ' memories found)');
    }
  }
}

async function auditLearningRuns() {
  header('4. LEARNING RUNS');
  subheader('learning_runs');
  const { count: totalLR } = await supabase
    .from('learning_runs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID);
  row('Total learning runs', totalLR ?? 0);

  if (totalLR && totalLR > 0) {
    const allRuns = await fetchAll('learning_runs', 'run_type, status', { organization_id: ORG_ID });
    const rb: Record<string, Record<string, number>> = {};
    for (const r of allRuns) {
      const rt = r.run_type || '(null)';
      const st = r.status || '(null)';
      if (!rb[rt]) rb[rt] = {};
      rb[rt][st] = (rb[rt][st] || 0) + 1;
    }
    for (const [rt, sts] of Object.entries(rb)) {
      row('  ' + rt, Object.entries(sts).map(([s, c]) => s + '=' + c).join(', '));
    }

    subheader('Latest 3 learning runs');
    const { data: l3 } = await supabase
      .from('learning_runs')
      .select('*')
      .eq('organization_id', ORG_ID)
      .order('started_at', { ascending: false })
      .limit(3);
    if (l3) {
      for (const r of l3) {
        const dur = r.started_at && r.completed_at
          ? ((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000).toFixed(1) + 's'
          : '(no completed_at)';
        console.log('\n    [' + r.started_at + '] type=' + r.run_type + ' status=' + r.status + ' duration=' + dur);
        if (r.results_summary) {
          const s = typeof r.results_summary === 'string' ? r.results_summary : JSON.stringify(r.results_summary, null, 2);
          console.log('    Summary: ' + (s.length > 500 ? s.slice(0, 500) + '...' : s));
        }
      }
    }
  }

  subheader('consolidation_runs');
  try {
    const { count: totalCR, error } = await supabase
      .from('consolidation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ORG_ID);
    if (error) {
      row('consolidation_runs', 'Error: ' + error.message);
    } else {
      row('Total consolidation runs', totalCR ?? 0);
      if (totalCR && totalCR > 0) {
        const { data: cr } = await supabase
          .from('consolidation_runs')
          .select('*')
          .eq('organization_id', ORG_ID)
          .order('created_at', { ascending: false })
          .limit(3);
        if (cr) {
          subheader('Latest 3 consolidation runs');
          for (const r of cr) {
            console.log('\n    [' + r.created_at + '] status=' + r.status);
            const d = JSON.stringify(r, null, 2);
            console.log('    ' + (d.length > 500 ? d.slice(0, 500) + '...' : d));
          }
        }
      }
    }
  } catch {
    row('consolidation_runs', '(does not exist)');
  }
}

async function auditSnapshots() {
  header('5. BRAIN DAILY SNAPSHOTS');
  const { count: totalSnap } = await supabase
    .from('brain_daily_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID);
  row('Total snapshots', totalSnap ?? 0);
  if (!totalSnap) { console.log('    (no snapshots found)'); return; }

  const { data: first } = await supabase
    .from('brain_daily_snapshots')
    .select('*')
    .eq('organization_id', ORG_ID)
    .order('snapshot_date', { ascending: true })
    .limit(1);
  const { data: last } = await supabase
    .from('brain_daily_snapshots')
    .select('*')
    .eq('organization_id', ORG_ID)
    .order('snapshot_date', { ascending: false })
    .limit(1);

  if (first?.[0] && last?.[0]) {
    subheader('Date Range');
    row('First snapshot', first[0].snapshot_date);
    row('Last snapshot', last[0].snapshot_date);
    subheader('Growth Trend: First vs Last Snapshot');
    row('First -- connections', first[0].total_connections);
    row('First -- accuracy', first[0].accuracy_score);
    row('Last  -- connections', last[0].total_connections);
    row('Last  -- accuracy', last[0].accuracy_score);
    const g = last[0].total_connections && first[0].total_connections
      ? ((last[0].total_connections / first[0].total_connections - 1) * 100).toFixed(1) + '%'
      : 'N/A';
    row('Connection growth', g);
    subheader('Latest Snapshot (full data)');
    jsonBlock(last[0]);
  }
}

async function auditPredictions() {
  header('6. PREDICTION OUTCOMES');
  try {
    const { count, error } = await supabase
      .from('prediction_outcomes')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ORG_ID);
    if (error) { row('prediction_outcomes', 'Error: ' + error.message); }
    else {
      row('Total prediction_outcomes', count ?? 0);
      if (count && count > 0) {
        const { data } = await supabase.from('prediction_outcomes').select('*')
          .eq('organization_id', ORG_ID).order('created_at', { ascending: false }).limit(10);
        if (data?.length) {
          subheader('Recent prediction_outcomes');
          for (const p of data) console.log('    [' + p.created_at + '] accuracy=' + (p.accuracy_score ?? '?') + ' outcome=' + (p.outcome ?? '?'));
        }
      }
    }
  } catch { row('prediction_outcomes', '(table does not exist)'); }

  try {
    const { count, error } = await supabase
      .from('prediction_records')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ORG_ID);
    if (error) { row('prediction_records', 'Error: ' + error.message); }
    else {
      row('Total prediction_records', count ?? 0);
      if (count && count > 0) {
        const { data } = await supabase.from('prediction_records').select('*')
          .eq('organization_id', ORG_ID).order('created_at', { ascending: false }).limit(5);
        if (data?.length) {
          subheader('Latest 5 prediction_records');
          for (const p of data) {
            const d = JSON.stringify(p, null, 2);
            console.log('    ' + (d.length > 400 ? d.slice(0, 400) + '...' : d));
          }
        }
      }
    }
  } catch { row('prediction_records', '(table does not exist)'); }
}

async function auditTableCounts() {
  header('BONUS: KEY TABLE ROW COUNTS');
  const tables = [
    'cross_domain_signals', 'causal_relationships_statistical', 'ai_memory',
    'learning_runs', 'brain_daily_snapshots', 'consolidation_runs',
    'prediction_records', 'prediction_outcomes', 'causal_chains',
    'causal_chain_outcomes', 'causal_insights', 'active_cascades',
    'brain_execution_log', 'brain_grammar_rules', 'ai_agent_activity',
    'connector_sync_log', 'entity_embeddings', 'resolved_entities',
    'strategic_priorities', 'attention_policy_state', 'bayesian_posteriors',
    'temporal_memory_state', 'embedding_cache_state',
  ];
  for (const table of tables) {
    try {
      const { count: oc, error: oe } = await supabase
        .from(table).select('id', { count: 'exact', head: true }).eq('organization_id', ORG_ID);
      const { count: tc, error: te } = await supabase
        .from(table).select('id', { count: 'exact', head: true });
      if (oe && te) { row(table, 'ERROR: ' + oe.message); }
      else {
        row(table, 'org=' + (oe ? '(no org_id col)' : String(oc ?? 0)) + '  |  total=' + (te ? '?' : String(tc ?? 0)));
      }
    } catch (e: any) { row(table, 'EXCEPTION: ' + e.message); }
  }
}

async function main() {
  console.log('\n');
  console.log('######################################################################');
  console.log('#                                                                    #');
  console.log('#            NexusBrain Production Data Audit                        #');
  console.log('#            Organization: ' + ORG_ID + '   #');
  console.log('#            Date: ' + new Date().toISOString().slice(0, 19) + '                   #');
  console.log('#                                                                    #');
  console.log('######################################################################');
  await auditSignals();
  await auditEdges();
  await auditMemories();
  await auditLearningRuns();
  await auditSnapshots();
  await auditPredictions();
  await auditTableCounts();
  header('AUDIT COMPLETE');
  console.log('');
}

main().catch(err => { console.error('AUDIT FAILED:', err); process.exit(1); });
