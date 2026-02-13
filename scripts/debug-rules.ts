import { createBrainKnowledgeContext } from '../packages/memory-stack/src/orchestrator/brain-knowledge-context';
import { REAL_SEC_EDGAR_PACKS } from './training-data/real-sec-edgar-packs';
import { VC_METRICS_PACKS } from './training-data/vc-metrics-packs';
import { BUSINESS_CASE_STUDY_PACKS } from './training-data/business-case-study-packs';
import { ACCOUNTING_FINANCE_PACKS } from './training-data/accounting-finance-packs';
import type { TrainingPack } from '../packages/memory-stack/src/learning/brain-trainer';

const ALL: TrainingPack[] = [
  ...REAL_SEC_EDGAR_PACKS, ...VC_METRICS_PACKS,
  ...BUSINESS_CASE_STUDY_PACKS, ...ACCOUNTING_FINANCE_PACKS,
];

const ctx = createBrainKnowledgeContext({
  mode: 'in-memory',
  packs: ALL,
  trainerConfig: { defaultSampleSize: 200, defaultFStatistic: 12.0, autoActivateRules: true },
});

const entityState = {
  finance: {
    arr: 2000000, arr_growth_rate: 0.6, burn_multiple: 1.8,
    gross_margin: 0.72, cac_payback_months: 14, ltv_cac_ratio: 4.2,
    cash_runway_months: 11, rule_of_40_score: 45,
    revenue_per_employee: 180000,
  },
  cs: { nrr: 1.08, logo_churn_rate_annual: 0.12 },
  marketing: { magic_number: 0.8, plg_revenue_pct: 0.15 },
  nrr: { trailing_12m: 108, current: 108 },
  grr: { trailing_12m: 92 },
  runway_months: 11,
};

const result = ctx.queryBrainKnowledge('Build me a model for startup cash flow forecasting', entityState);

// Analyze matched rules
const triggered = result.matchedRules.filter(r => r.triggered);
const notTriggered = result.matchedRules.filter(r => r.triggered === false);

console.log(`Triggered: ${triggered.length}`);
for (const r of triggered) {
  console.log(`  ✅ ${r.title}`);
}

console.log(`\nNot triggered: ${notTriggered.length}`);
for (const r of notTriggered.slice(0, 15)) {
  const mr = r as any;
  console.log(`\n  ❌ ${mr.title || 'Unknown'}`);
  console.log(`     Conditions: ${mr.conditions ? mr.conditions.join(' | ') : 'N/A'}`);
}

// Also check what the querier.matchRules returns for normalized state
const normalized = ctx.normalizeEntityState(entityState);
const querier = ctx.getQuerier();
const rawMatch = querier.matchRules(normalized);
const rawTriggered = rawMatch.filter((r: any) => r.triggered);
console.log(`\n\nDirect querier.matchRules with normalized state:`);
console.log(`Total: ${rawMatch.length}, Triggered: ${rawTriggered.length}`);
for (const r of rawTriggered) {
  console.log(`  ✅ ${(r as any).title}`);
}

// Show what entity types the rules expect vs what we have
const entityTypes = new Set<string>();
for (const r of rawMatch) {
  const rt = r as any;
  if (rt.entityType) entityTypes.add(rt.entityType);
}
console.log(`\nEntity types in rules: ${[...entityTypes].join(', ')}`);
console.log('Our entityState top keys:', Object.keys(normalized).join(', '));
