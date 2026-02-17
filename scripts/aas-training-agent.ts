/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AAS Training Agent — Unified Brain Training for Accounting as a Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The AAS Training Agent is the single unified orchestrator that trains the
 * NexusBrain CORE brain with accounting intelligence from 5 public data sources.
 *
 * Each sub-trainer maps to specific AAS product requirements:
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ AAS TRAINING AGENT                                                           │
 * │                                                                              │
 * │  Sub-Trainers:                      AAS Requirements Served:                 │
 * │  ─────────────                      ──────────────────────────               │
 * │  1. aas-trainer (core)              → AAS-P0-1: Trial Balance (GL → TB)     │
 * │     SEC EDGAR (20 SaaS cos)           AAS-P0-2: P&L Derivation (TB → P&L)  │
 * │     FASB GAAP taxonomy (450+ accts)   AAS-P0-3: Balance Sheet Derivation    │
 * │     Damodaran SaaS benchmarks         AAS-P0-4: GST Computation (SG base)   │
 * │     22 Synthetic scenarios            AAS-P0-5: Transaction Interpretation  │
 * │     ERPNext SG/AU CoA                 AAS-P1-4: SaaS Benchmarks (SG/APAC)  │
 * │                                                                              │
 * │  2. aas-sg-deep-trainer (RW1)       → AAS-P0-4: GST 7%→8%→9% rate history │
 * │     IRAS GST announcements            AAS-P1-1: Statutory Accounts           │
 * │     ACRA XBRL taxonomy                         (CPF/SDL/FWL/WHT/SFRS 16)   │
 * │     SFRS(I) 16 lease rules            AAS-P1-2: SFRS 16 Lease Accounting    │
 * │     IRAS Form C-S mapping             AAS-P1-3: IRAS Form C-S Box Mapping   │
 * │     CPF Board rates                                                          │
 * │                                                                              │
 * │  3. aas-my-trainer (RW2)            → AAS-P2-1: Malaysia SST-02             │
 * │     RMCD SST-02 structure                       (no input credit)           │
 * │     EPF/SOCSO/EIS rates               MFRS CoA, LHDN 24%, BNM benchmarks   │
 * │                                                                              │
 * │  4. aas-ph-trainer (RW2)            → AAS-P2-2: Philippines BIR VAT 12%    │
 * │     BIR VAT + EWT rates                         Withholding, 13th Month Pay │
 * │     SSS/PhilHealth/Pag-IBIG           PFRS CoA, PSE benchmarks              │
 * │                                                                              │
 * │  5. aas-in-trainer (RW2)            → AAS-P2-3: India GSTR-3B Dual GST     │
 * │     GSTN GSTR-3B structure                      TDS (194C/J/H/195)          │
 * │     CBDT TDS rates                              Tookitaki IN↔SG intercompany│
 * │     EPFO/ESIC rates                   IndAS CoA, BSE/NASSCOM benchmarks     │
 * │                                                                              │
 * │  Design partner: ph-accounting (uses SG SFRS/IRAS Xero data for testing)   │
 * │  GL data: 49,684 Xero transactions, SGD, 2020-2026, GST 7%/8%/9%          │
 * │                                                                              │
 * │  Total: 12 AAS requirements, 5 sub-trainers, 3 priority tiers (P0/P1/P2)  │
 * │  P0 = Phase 1 deliverables · P1 = SG accuracy (RW1) · P2 = Multi-jur (RW2)│
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * NIGHTLY SCHEDULE (UTC):
 *   3 AM  → aas-trainer          (core: EDGAR, FASB, synthetic — daily)
 *   4 AM  → aas-sg-deep-trainer  (SG deep: GST history, ACRA, Form C-S — Mon)
 *   5 AM  → aas-my-trainer       (Malaysia: SST-02, EPF/SOCSO/EIS — Tue)
 *   6 AM  → aas-ph-trainer       (Philippines: BIR VAT, 13th month — Wed)
 *   7 AM  → aas-in-trainer       (India: GSTR-3B, TDS, intercompany — Thu)
 *   ──────────────────────────────────────────────────────
 *   Federation runs every 6 hours → pushes learned patterns to all org brains
 *
 * USAGE:
 *   # Dry-run all sub-trainers
 *   SEAS_DRY_RUN=true pnpm exec tsx scripts/aas-training-agent.ts
 *
 *   # Run single sub-trainer (dry)
 *   AAS_TRAINER=aas-sg-deep-trainer SEAS_DRY_RUN=true pnpm exec tsx scripts/aas-training-agent.ts
 *
 *   # Full production run (all 5)
 *   pnpm exec tsx scripts/aas-training-agent.ts
 *
 *   # Full run, single sub-trainer
 *   AAS_TRAINER=aas-trainer pnpm exec tsx scripts/aas-training-agent.ts
 *
 * ENV VARS:
 *   SUPABASE_URL              — Required
 *   SUPABASE_SERVICE_ROLE_KEY — Required
 *   AAS_TRAINER               — Optional: run only one named sub-trainer
 *   SEAS_DRY_RUN=true         — Dry-run all (uses same convention as SE-aaS)
 *   AAS_DRY_RUN=true          — Alias for SEAS_DRY_RUN
 *   AAS_CORE_DRY_RUN          — Dry-run only aas-trainer
 *   AAS_SG_DEEP_DRY_RUN       — Dry-run only aas-sg-deep-trainer
 *   AAS_MY_DRY_RUN            — Dry-run only aas-my-trainer
 *   AAS_PH_DRY_RUN            — Dry-run only aas-ph-trainer
 *   AAS_IN_DRY_RUN            — Dry-run only aas-in-trainer
 */

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
  } catch { /* ECS env via SSM */ }
}
loadEnv();

import { AgentRegistry } from './agent-framework/agent-registry';
import { AgentManager } from './agent-framework/agent-manager';

// Import all 5 sub-trainers
import { AASTrainerAgent } from './agents/aas-trainer';
import { AASSGDeepTrainerAgent } from './agents/aas-sg-deep-trainer';
import { AASMYTrainerAgent } from './agents/aas-my-trainer';
import { AASPHTrainerAgent } from './agents/aas-ph-trainer';
import { AASINTrainerAgent } from './agents/aas-in-trainer';

// ============================================================================
// AAS REQUIREMENT → TRAINER MAPPING
// ============================================================================

interface AASRequirement {
  id: string;
  name: string;
  priority: 'P0' | 'P1' | 'P2';
  trainers: string[];          // Which sub-trainers feed this requirement
  signalTypes: string[];       // Which signal types are relevant
  coverage: 'full' | 'partial' | 'none';
  notes: string;
}

export const AAS_REQUIREMENTS: AASRequirement[] = [
  // ── P0: Phase 1 Validation Deliverables (design partner needs NOW) ──────────
  {
    id: 'AAS-P0-1',
    name: 'Trial Balance Computation (GL → TB)',
    priority: 'P0',
    trainers: ['aas-trainer'],
    signalTypes: ['acc_trial_balance_balance', 'acc_account_classification', 'acc_debit_credit_normal'],
    coverage: 'full',
    notes: 'FASB GAAP taxonomy (450+ accounts, hardcoded debit/credit normal) + 22 synthetic double-entry scenarios. Brain learns exact computation: sum all debit-normal accounts = total debits; sum all credit-normal = total credits; must equal. Target: 99%+ accuracy vs ~85% Claude alone.',
  },
  {
    id: 'AAS-P0-2',
    name: 'P&L Derivation (Trial Balance → P&L)',
    priority: 'P0',
    trainers: ['aas-trainer'],
    signalTypes: ['acc_gross_margin_ratio', 'acc_opex_ratio', 'acc_net_profit_margin', 'acc_revenue_recognition'],
    coverage: 'full',
    notes: '50 SEC EDGAR SaaS company income statements + synthetic scenarios. Causal chain: TB → revenue accounts (credit-normal) → COGS → gross profit → OpEx → net income. Target: 96%+ vs ~88% Claude alone.',
  },
  {
    id: 'AAS-P0-3',
    name: 'Balance Sheet Derivation (Trial Balance → BS)',
    priority: 'P0',
    trainers: ['aas-trainer'],
    signalTypes: ['acc_balance_sheet_equation', 'acc_working_capital_ratio', 'acc_ar_turnover'],
    coverage: 'full',
    notes: '50 EDGAR SaaS balance sheets + ERPNext SG/AU CoA. Causal chain: TB → asset accounts (debit-normal) = liabilities + equity (credit-normal); retained earnings = prior + net income. Target: 96%+ vs ~85% Claude alone.',
  },
  {
    id: 'AAS-P0-4',
    name: 'GST Computation (SG 7% / 8% / 9% rate history)',
    priority: 'P0',
    trainers: ['aas-trainer', 'aas-sg-deep-trainer'],
    signalTypes: ['acc_gst_output_tax_rate', 'acc_gst_input_tax_rate', 'acc_gst_net_payable'],
    coverage: 'full',
    notes: 'Base trainer: SG 9% + AU 10% GST rules. SG-deep trainer: rate HISTORY (7% pre-2023, 8% in 2023, 9% 2024+). Critical: design partner Xero GL contains "GST 8%" entries — must read taxRateName per row, not assume single rate. Target: 94%+ vs ~82% Claude alone.',
  },
  {
    id: 'AAS-P0-5',
    name: 'Transaction Interpretation (description → natural language)',
    priority: 'P0',
    trainers: ['aas-trainer'],
    signalTypes: ['acc_transaction_classification', 'acc_journal_entry_validity'],
    coverage: 'full',
    notes: '150 SaaS-specific transaction interpretation examples. Maps Xero GL description + account name + DR/CR + amount → business event in plain English. Target: 92%+ vs ~80% Claude alone.',
  },

  // ── P1: SG Accuracy Improvements — RW1 (design partner benefit) ─────────────
  {
    id: 'AAS-P1-1',
    name: 'SG Statutory Accounts (CPF / SDL / FWL / WHT / intercompany)',
    priority: 'P1',
    trainers: ['aas-sg-deep-trainer'],
    signalTypes: ['acc_account_classification', 'acc_transaction_classification'],
    coverage: 'full',
    notes: '20 ACRA XBRL statutory accounts not in FASB taxonomy: Employer CPF (17%), Employee CPF (20%), CPF Payable, SDL (0.25%), FWL, GST Input/Output Tax, IRAS GST Payable, WHT Payable, Stamp Duty, ROU Asset (SFRS 16), Lease Liability (current + non-current), Interest on Lease, Intercompany accounts.',
  },
  {
    id: 'AAS-P1-2',
    name: 'SFRS 16 Lease Accounting (Right-of-Use Asset + Lease Liability)',
    priority: 'P1',
    trainers: ['aas-sg-deep-trainer'],
    signalTypes: ['acc_account_classification', 'acc_journal_entry_validity'],
    coverage: 'full',
    notes: 'SFRS(I) 16 (identical to IFRS 16): recognize ROU Asset + Lease Liability for leases >12 months. Journal: Dr ROU Asset / Cr Lease Liability at PV. Depreciate ROU; split payments into interest + principal. Affects BS (non-current assets + liabilities) and P&L (depreciation + interest, NOT rent expense).',
  },
  {
    id: 'AAS-P1-3',
    name: 'IRAS Form C-S Box Mapping (GL accounts → annual return boxes)',
    priority: 'P1',
    trainers: ['aas-sg-deep-trainer'],
    signalTypes: ['acc_transaction_classification'],
    coverage: 'full',
    notes: '8 Form C-S boxes mapped to GL accounts: Box 1 (Revenue), Box 2 (COGS), Box 3 (Gross Profit = Box 1 - Box 2), Box 7 (Staff Costs = Salaries+CPF+SDL+FWL), Box 8 (Rental), Box 15 (Other Expenses), Box 16 (Net Profit), Box 20 (Capital Allowance). Enables automated Form C-S pre-population from Xero data.',
  },
  {
    id: 'AAS-P1-4',
    name: 'SaaS Industry Benchmarks (gross margin, payroll, AR turnover — SG/APAC)',
    priority: 'P1',
    trainers: ['aas-trainer'],
    signalTypes: ['acc_gross_margin_ratio', 'acc_opex_ratio', 'acc_ar_turnover', 'acc_working_capital_ratio'],
    coverage: 'full',
    notes: 'Damodaran 2024 SaaS benchmarks + 50 EDGAR SaaS companies. SG adjustments: GST 9%, staff costs 55-65% of OpEx, R&D 15-25% of revenue, gross margin >65% healthy. Cross-domain: finance → product (NRR), finance → hr (payroll ratio), finance → customer_health (AR aging).',
  },

  // ── P2: Multi-Jurisdiction Expansion — RW2 (future orgs) ────────────────────
  {
    id: 'AAS-P2-1',
    name: 'Malaysia SST-02 (Service Tax 8%, NO input tax credit)',
    priority: 'P2',
    trainers: ['aas-my-trainer'],
    signalTypes: ['acc_gst_output_tax_rate', 'acc_gst_input_tax_rate', 'acc_account_classification'],
    coverage: 'full',
    notes: 'CRITICAL: Malaysia SST is SINGLE-STAGE — no input tax credit (unlike SG GST, PH VAT, IN GST). SST paid on purchases is a direct cost. Service Tax 8% (from Mar 2024), bi-monthly SST-02 filing. EPF 12-13%, SOCSO 1.75%, EIS 0.4%, LHDN 24% corp tax.',
  },
  {
    id: 'AAS-P2-2',
    name: 'Philippines BIR VAT 12% + Expanded Withholding Tax + 13th Month Pay',
    priority: 'P2',
    trainers: ['aas-ph-trainer'],
    signalTypes: ['acc_gst_output_tax_rate', 'acc_gst_input_tax_rate', 'acc_transaction_classification', 'acc_account_classification'],
    coverage: 'full',
    notes: 'PH VAT 12% WITH input credit (unlike MY SST). EWT on professional fees 10%/15%. Mandatory 13th month pay (1/12 annual salary, tax-exempt up to ₱90k). SSS 9.5% + PhilHealth 5% + Pag-IBIG 2% employer burden. BIR Form 2550M/2550Q VAT return.',
  },
  {
    id: 'AAS-P2-3',
    name: 'India GSTR-3B Dual GST (IGST/CGST+SGST) + TDS + Intercompany',
    priority: 'P2',
    trainers: ['aas-in-trainer'],
    signalTypes: ['acc_gst_output_tax_rate', 'acc_gst_input_tax_rate', 'acc_transaction_classification', 'acc_journal_entry_validity', 'acc_account_classification'],
    coverage: 'full',
    notes: 'India GST DUAL: interstate = IGST (18%), intrastate = CGST+SGST (9%+9%). TDS on B2B payments: 194J (professional 10%/2%), 194C (contractors 2%), 194H (commission 5%), 195 (non-resident 10% per India-SG DTAA). Intercompany India↔SG: zero-rated export + WHT s.195 + RCM GST. PF 12% + ESI 3.25%.',
  },
];

// ============================================================================
// COVERAGE REPORT
// ============================================================================

function printCoverageReport(): void {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  AAS TRAINING AGENT — REQUIREMENT COVERAGE REPORT');
  console.log('════════════════════════════════════════════════════════════\n');

  const p0Full = AAS_REQUIREMENTS.filter(r => r.priority === 'P0' && r.coverage === 'full');
  const p0Partial = AAS_REQUIREMENTS.filter(r => r.priority === 'P0' && r.coverage === 'partial');
  const p1Full = AAS_REQUIREMENTS.filter(r => r.priority === 'P1' && r.coverage === 'full');
  const p2Full = AAS_REQUIREMENTS.filter(r => r.priority === 'P2' && r.coverage === 'full');
  const none = AAS_REQUIREMENTS.filter(r => r.coverage === 'none');

  console.log(`  🎯 P0 — PHASE 1 DELIVERABLES (${p0Full.length + p0Partial.length}/5 — design partner needs NOW):`);
  for (const r of AAS_REQUIREMENTS.filter(req => req.priority === 'P0')) {
    const icon = r.coverage === 'full' ? '✅' : r.coverage === 'partial' ? '⚠️ ' : '❌';
    console.log(`     ${icon} ${r.id}  ${r.name}`);
    console.log(`        Trainers: ${r.trainers.join(', ')}`);
  }

  console.log(`\n  🔶 P1 — SG ACCURACY IMPROVEMENTS (${p1Full.length}/4 — design partner RW1):`);
  for (const r of AAS_REQUIREMENTS.filter(req => req.priority === 'P1')) {
    const icon = r.coverage === 'full' ? '✅' : r.coverage === 'partial' ? '⚠️ ' : '❌';
    console.log(`     ${icon} ${r.id}  ${r.name}`);
    console.log(`        Trainers: ${r.trainers.join(', ')}`);
  }

  console.log(`\n  🌏 P2 — MULTI-JURISDICTION EXPANSION (${p2Full.length}/3 — RW2 future orgs):`);
  for (const r of AAS_REQUIREMENTS.filter(req => req.priority === 'P2')) {
    const icon = r.coverage === 'full' ? '✅' : r.coverage === 'partial' ? '⚠️ ' : '❌';
    console.log(`     ${icon} ${r.id}  ${r.name}`);
    console.log(`        Trainers: ${r.trainers.join(', ')}`);
  }

  if (none.length > 0) {
    console.log(`\n  ❌ NO COVERAGE (${none.length}):`);
    for (const r of none) { console.log(`     ${r.id} ${r.name}`); }
  }

  const totalSignalTypes = new Set(AAS_REQUIREMENTS.flatMap(r => r.signalTypes));
  const totalTrainers = new Set(AAS_REQUIREMENTS.flatMap(r => r.trainers));
  const fullCount = AAS_REQUIREMENTS.filter(r => r.coverage === 'full').length;
  const total = AAS_REQUIREMENTS.length;

  console.log(`\n  SUMMARY:`);
  console.log(`    Total Signal Types: ${totalSignalTypes.size}`);
  console.log(`    Total Sub-Trainers: ${totalTrainers.size}`);
  console.log(`    Full Coverage:    ${fullCount}/${total} (${Math.round(fullCount / total * 100)}%)`);
  console.log(`    P0 Full (critical): ${p0Full.length}/5`);
  console.log(`    P1 Full (RW1):      ${p1Full.length}/4`);
  console.log(`    P2 Full (RW2):      ${p2Full.length}/3`);
  console.log('════════════════════════════════════════════════════════════\n');
}

// ============================================================================
// SUB-TRAINER DEFINITIONS
// ============================================================================

const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001'; // CORE brain

const SUB_TRAINERS: Array<{
  name: string;
  description: string;
  factory: (config: any) => any;
  schedule: string;
  cpu: string;
  memory: string;
  requirements: string[];  // AAS requirement IDs served
  envKey: string;          // Per-trainer dry-run env var
}> = [
  {
    name: 'aas-trainer',
    description: 'Core accounting: FASB taxonomy, SEC EDGAR SaaS financials, synthetic double-entry scenarios',
    factory: (config) => new AASTrainerAgent(config),
    schedule: '0 3 * * *',   // Daily 3 AM UTC
    cpu: '1024', memory: '4096',
    requirements: ['AAS-P0-1', 'AAS-P0-2', 'AAS-P0-3', 'AAS-P0-4', 'AAS-P0-5', 'AAS-P1-4'],
    envKey: 'AAS_CORE_DRY_RUN',
  },
  {
    name: 'aas-sg-deep-trainer',
    description: 'Singapore deep: ACRA statutory accounts, GST rate history 7%→8%→9%, SFRS 16, Form C-S',
    factory: (config) => new AASSGDeepTrainerAgent(config),
    schedule: '0 4 * * 1',   // Monday 4 AM UTC
    cpu: '512', memory: '2048',
    requirements: ['AAS-P0-4', 'AAS-P1-1', 'AAS-P1-2', 'AAS-P1-3'],
    envKey: 'AAS_SG_DEEP_DRY_RUN',
  },
  {
    name: 'aas-my-trainer',
    description: 'Malaysia: SST-02 (no input credit), EPF/SOCSO/EIS, MFRS CoA, LHDN 24%',
    factory: (config) => new AASMYTrainerAgent(config),
    schedule: '0 5 * * 2',   // Tuesday 5 AM UTC
    cpu: '512', memory: '2048',
    requirements: ['AAS-P2-1'],
    envKey: 'AAS_MY_DRY_RUN',
  },
  {
    name: 'aas-ph-trainer',
    description: 'Philippines: BIR VAT 12% (input credit), EWT, SSS/PhilHealth/Pag-IBIG, 13th month pay',
    factory: (config) => new AASPHTrainerAgent(config),
    schedule: '0 6 * * 3',   // Wednesday 6 AM UTC
    cpu: '512', memory: '2048',
    requirements: ['AAS-P2-2'],
    envKey: 'AAS_PH_DRY_RUN',
  },
  {
    name: 'aas-in-trainer',
    description: 'India: GSTR-3B dual GST (IGST/CGST+SGST), TDS multi-section, intercompany TP + WHT + RCM',
    factory: (config) => new AASINTrainerAgent(config),
    schedule: '0 7 * * 4',   // Thursday 7 AM UTC
    cpu: '512', memory: '2048',
    requirements: ['AAS-P2-3'],
    envKey: 'AAS_IN_DRY_RUN',
  },
];

// ============================================================================
// MAIN — AAS TRAINING AGENT
// ============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain AAS Training Agent');
  console.log('  Unified Brain Training for Accounting as a Service');
  console.log(`  Started:      ${new Date().toISOString()}`);
  console.log(`  Sub-Trainers: ${SUB_TRAINERS.length}`);
  console.log(`  Requirements: ${AAS_REQUIREMENTS.length} (5 P0 · 4 P1 · 3 P2)`);
  console.log(`  Design Partner: ph-accounting (SG Xero GL: 49,684 txns, SFRS/IRAS, SGD)`);
  console.log('════════════════════════════════════════════════════════════\n');

  // Print requirement coverage report
  printCoverageReport();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Missing required environment variables:');
    if (!supabaseUrl) console.error('  - SUPABASE_URL');
    if (!supabaseKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Determine which trainer(s) to run
  const targetTrainer = process.env.AAS_TRAINER;
  const globalDryRun = process.env.SEAS_DRY_RUN === 'true' || process.env.AAS_DRY_RUN === 'true';

  const trainers = targetTrainer
    ? SUB_TRAINERS.filter(t => t.name === targetTrainer)
    : SUB_TRAINERS;

  if (trainers.length === 0) {
    console.error(`ERROR: Unknown trainer '${targetTrainer}'`);
    console.error('Valid trainers: ' + SUB_TRAINERS.map(t => t.name).join(', '));
    process.exit(1);
  }

  const registry = new AgentRegistry();
  for (const t of trainers) {
    registry.register({
      name: t.name,
      description: t.description,
      version: '1.0.0',
      factory: t.factory,
      schedule: t.schedule,
      resourceRequirements: { cpu: t.cpu, memory: t.memory },
      tags: ['aas-training', ...t.requirements],
    });
  }

  const manager = new AgentManager(registry, {
    supabaseUrl,
    supabaseKey,
    organizationId: ORGANIZATION_ID,
  });

  const modeLabel = globalDryRun ? 'DRY RUN' : 'PRODUCTION';
  console.log(`Running ${trainers.length} sub-trainer(s) [${modeLabel}]...\n`);
  if (targetTrainer) console.log(`  Filtered to: ${targetTrainer}\n`);

  const results: Array<{
    name: string;
    signals: number;
    packs: number;
    errors: number;
    duration: number;
    requirements: string[];
  }> = [];

  for (const t of trainers) {
    const trainerStart = Date.now();
    try {
      const isDry = globalDryRun || process.env[t.envKey] === 'true';
      const result = await manager.runWithRetry(t.name, 2, { dryRun: isDry });
      results.push({
        name: t.name,
        signals: result.signalsGenerated,
        packs: result.packsProcessed,
        errors: result.errorsEncountered.length,
        duration: (Date.now() - trainerStart) / 1000,
        requirements: t.requirements,
      });
    } catch (err) {
      console.error(`[AAS] ${t.name} FAILED: ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        name: t.name,
        signals: 0, packs: 0, errors: 1,
        duration: (Date.now() - trainerStart) / 1000,
        requirements: t.requirements,
      });
    }
  }

  // Print summary table
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalSignals = results.reduce((s, r) => s + r.signals, 0);
  const totalPacks = results.reduce((s, r) => s + r.packs, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  AAS TRAINING AGENT — RUN SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  for (const r of results) {
    const icon = r.errors > 0 ? '⚠️ ' : '✅';
    const reqs = r.requirements.join(', ');
    console.log(`  ${icon} ${r.name.padEnd(25)} ${String(r.signals).padStart(4)} signals  ${String(r.packs).padStart(2)} packs  ${r.duration.toFixed(0)}s`);
    console.log(`       Serves: ${reqs}`);
  }
  console.log('────────────────────────────────────────────────────────────');
  console.log(`  TOTAL: ${totalSignals} signals, ${totalPacks} packs, ${totalErrors} errors in ${elapsed}s`);

  if (totalErrors === 0) {
    console.log('\n  ✓ CORE brain seeded with AAS intelligence:');
    console.log('    P0 (Phase 1 deliverables): Trial Balance · P&L · Balance Sheet · GST · Interpretations');
    console.log('    P1 (SG accuracy):          CPF/SDL/FWL · SFRS 16 · Form C-S · GST rate history');
    console.log('    P2 (multi-jurisdiction):   Malaysia SST · Philippines BIR · India GSTR-3B');
  }

  console.log('════════════════════════════════════════════════════════════\n');

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => { console.error('[FATAL]', err); process.exit(2); });
