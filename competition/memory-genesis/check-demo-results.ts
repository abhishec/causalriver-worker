import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://zmlqvuzoodcgmkgkivfw.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? (() => { throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY"); })()
);

const DEMO_ORG_ID = '00000000-0000-4000-b000-000000000001';

async function checkResults() {
  const { count: signalsCount } = await supabase
    .from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', DEMO_ORG_ID);

  const { count: relationshipsCount } = await supabase
    .from('causal_relationships_statistical')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', DEMO_ORG_ID);

  const { data: relationships } = await supabase
    .from('causal_relationships_statistical')
    .select('*')
    .eq('organization_id', DEMO_ORG_ID)
    .order('evidence_weight', { ascending: false });

  console.log('✅ Demo Statistics:');
  console.log('  Signals:', signalsCount);
  console.log('  Causal Relationships:', relationshipsCount);
  console.log('');

  if (relationshipsCount && relationshipsCount > 0) {
    console.log('🔗 Discovered Relationships:');
    relationships?.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.source_domain} → ${r.target_domain}`);
      console.log(`     Weight: ${r.evidence_weight?.toFixed(3)}, Lag: ${r.optimal_lag_days}d, p-value: ${r.granger_p_value?.toFixed(4)}`);
      if (r.natural_language) {
        console.log(`     "${r.natural_language}"`);
      }
    });
  } else {
    console.log('⚠️ No causal relationships discovered yet');
  }
}

checkResults().catch(console.error);
