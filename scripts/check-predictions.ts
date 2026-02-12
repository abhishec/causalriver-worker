import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): void {
  try {
    const envPath = resolve(import.meta.dirname || __dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* ignore */ }
}
loadEnv();

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Check prediction_records structure
  const { data: preds } = await supabase
    .from('prediction_records')
    .select('id, domain, prediction_type, entity_type, was_correct, confidence, source_rule_id')
    .not('was_correct', 'is', null)
    .limit(5);

  console.log('=== PREDICTION RECORDS (verified) ===');
  console.log(JSON.stringify(preds, null, 2));

  // Check if predictions have source_domain and target_domain columns
  const { data: cols } = await supabase.rpc('get_column_info', { table_name: 'prediction_records' }).select('*');
  if (!cols) {
    // Try raw query approach
    const { data: sample } = await supabase
      .from('prediction_records')
      .select('*')
      .limit(1);
    console.log('\n=== FULL ROW (all columns) ===');
    console.log(JSON.stringify(sample?.[0], null, 2));
  }

  // Check bayesian_posteriors
  const { data: posteriors } = await supabase
    .from('bayesian_posteriors')
    .select('*')
    .limit(3);
  console.log('\n=== BAYESIAN POSTERIORS ===');
  console.log(JSON.stringify(posteriors, null, 2));
}

main().catch(console.error);
