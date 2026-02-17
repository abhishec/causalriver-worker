#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { createCausalMethodBandit, createOutcomeOracle } from '../packages/memory-stack/src/index';

async function main() {
config({ path: resolve(__dirname, '../.env') });
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);
const { data } = await supabase.from('organizations').select('id').limit(1);
const orgId = data?.[0]?.id || '';
console.log('Org:', orgId);

const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);

const now = Date.now();
oracle.registerPrediction({
  predictionId: 'debug_apex_1',
  organizationId: orgId,
  sourceDomain: 'engineering',
  targetDomain: 'engineering',
  watchMetric: 'engineering.pr_merged',
  watchSignalType: 'pr_merged',
  watchDomain: 'engineering',
  baselineValue: 10,
  baselineTimestamp: new Date(now - 7 * 86400000),
  predictedDirection: 'increase',
  predictedMagnitude: 0.5,
  confidence: 0.8,
  verifyAfter: new Date(now - 60000),
  expiresAt: new Date(now + 48 * 3600000),
  discoveryMethod: 'apex',
  status: 'pending',
});

const signals = Array.from({ length: 5 }, (_, i) => ({
  source_domain: 'engineering',
  signal_type: 'pr_merged',
  signal_value: 30 + i,  // way above baseline=10 → should be 'increase'
  signal_timestamp: new Date(now - 30 * 60000).toISOString(),
  organization_id: orgId,
  entity_type: 'pr',
  entity_id: 'p' + i,
}));

console.log('\nSignals to process:', signals.length, '| values:', signals.map(s => s.signal_value));
const result = await oracle.processBatch(signals);
console.log('\nOracle result:', JSON.stringify(result, null, 2));

const lb = bandit.getMethodLeaderboard();
console.log('\nLeaderboard (top 5):');
lb.slice(0, 5).forEach(e => console.log(' ', e.method.padEnd(22), 'avgReward=', e.avgReward?.toFixed(4), 'pairsWon=', e.pairsWon));

// Direct pair state check
const allPairs = bandit.getAllPairs();
console.log('\nAll pairs with pulls:', allPairs.length);
allPairs.forEach(p => console.log(' ', p.sourceDomain, '->', p.targetDomain, 'pulls=', p.totalPulls, 'bestArm=', p.bestArm));

// Raw arm state
const pairState = bandit.getPairState('engineering', 'engineering');
if (pairState) {
  console.log('\nengineering::engineering pair state:');
  for (const [method, arm] of pairState.arms) {
    if (arm.pulls > 0 || arm.empiricalMean > 0) {
      console.log(' ', method.padEnd(22), 'pulls=', arm.pulls, 'totalReward=', arm.totalReward.toFixed(4), 'empiricalMean=', arm.empiricalMean.toFixed(4), 'lastReward=', arm.lastReward?.toFixed(4));
    }
  }
}
} // end main
main().catch(console.error);
