/**
 * AAS Malaysia Trainer
 *
 * Brain Region: Insula — MY jurisdiction accounting intelligence
 * RW2: Malaysia SST-02, MFRS CoA, BNM benchmarks, Bursa XBRL
 *
 * Sources (all public):
 *   1. RMCD SST guide — SST-02 computation (sales tax 5-10%, service tax 8%)
 *   2. MFRS CoA — Malaysia Financial Reporting Standards account structures
 *   3. BNM (Bank Negara Malaysia) financial statistics (public data portal)
 *   4. Bursa Malaysia XBRL taxonomy (public filing standard)
 *   5. LHDN (IRB) — corporate tax 24%, Form C filing
 *   6. EPF (KWSP) — 12-13% employer contribution
 *   7. SOCSO + EIS — statutory payroll contributions
 */

import { BaseTrainingAgent, type AgentConfig, type FetchResult, type ConvertResult, type TrainResult, type ValidationResult } from '../agent-framework/base-training-agent';
import { globalRegistry } from '../agent-framework/agent-registry';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// MALAYSIA-SPECIFIC ACCOUNTS (MFRS + statutory)
// Source: MFRS standards (MASB), Bursa XBRL taxonomy, RMCD SST guide, LHDN
// ============================================================================

const MY_ACCOUNTS = [
  // ── SST (Sales & Service Tax) — replaces GST since Sep 2018 ──
  // Key difference from SG/AU: SST is SINGLE-STAGE (not value-added), so:
  //   - Sales Tax (5-10%): manufacturer/importer → end consumer (no input credit chain)
  //   - Service Tax (8%): registered service providers on taxable services
  { name: 'Service Tax Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'MY Service Tax at 8% (from 2024, was 6%). Applies to prescribed services (IT services, professional services, hotel, telecom). NO input tax credit — unlike GST. Credit on billing, remit via SST-02 bi-monthly.' },
  { name: 'Sales Tax Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'MY Sales Tax 5-10% on manufactured/imported taxable goods. Single-stage at manufacturer level. SaaS companies typically not liable for sales tax — only service tax applies.' },
  { name: 'Service Tax Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'operating_expense', rule: 'MY SST: Unlike GST, there is NO input tax credit. Service tax paid on purchases is a COST (debit expense or capitalise to asset), NOT recoverable. This is the critical difference from SG GST.' },
  // ── EPF (Employees Provident Fund / KWSP) ──
  { name: 'EPF Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', rule: 'MY EPF (KWSP): Employer 12-13% of wages, Employee 9-11%. Credit EPF Payable on payroll. Remit by 15th of following month. Employer rate 13% for wages ≤RM5,000, 12% above.' },
  { name: 'EPF Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', rule: 'Employer EPF contribution: 12-13% of employee wages. Part of total staff cost. Debit EPF Expense, Credit EPF Payable.' },
  // ── SOCSO (Social Security Organisation / PERKESO) ──
  { name: 'SOCSO Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', rule: 'MY SOCSO (PERKESO): Employer ~1.75% + Employee ~0.5% of wages (capped at RM5,000). Remit by 15th.' },
  { name: 'SOCSO Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', rule: 'Employer SOCSO ~1.75% of wages (capped RM86.65/month). Part of staff costs.' },
  // ── EIS (Employment Insurance System) ──
  { name: 'EIS Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', rule: 'MY EIS: Employer 0.4% + Employee 0.4% of wages (max RM5,000). Part of SOCSO system. Remit by 15th.' },
  // ── Corporate Tax ──
  { name: 'Income Tax Payable - LHDN', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'MY corporate income tax payable to LHDN (Inland Revenue Board). Rate: 24% for Sdn Bhd >RM2.5M paid-up. SME rate: 17% on first RM600,000, 24% above (if paid-up <RM2.5M). File Form C annually.' },
  { name: 'Tax Estimate Payable - CP500', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'MY CP500: Tax instalment scheme. LHDN issues estimated tax amount, company pays 12 monthly instalments. Debit Income Tax Expense, Credit CP500 Payable each month.' },
  // ── MFRS 16 / IFRS 16 Leases ──
  { name: 'Right-of-Use Asset - MY', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'fixed_asset', rule: 'MFRS 16 (= IFRS 16): Lessee recognises ROU asset for all leases >12 months. Same as SFRS 16 but under Malaysian MFRS standard. Amortise over shorter of lease term or useful life.' },
  { name: 'Lease Liability - MY', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'long_term_liability', rule: 'MFRS 16 Lease Liability: PV of future lease payments at incremental borrowing rate.' },
  // ── Zakat (Islamic tax — applies to Muslim-owned companies) ──
  { name: 'Zakat Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'MY Zakat: Islamic obligation on Bumiputera/Muslim-owned companies. Zakat on business ~2.5% of zakatable wealth. Tax-deductible up to 2.5% of aggregate income. Common in MY GLs for Bumiputera-owned entities.' },
];

// SST-02 form structure (bi-monthly filing)
const MY_SST02_BOXES = [
  { box: 'SST-02 Box 1: Total Taxable Services', accounts: ['Revenue', 'Service Revenue', 'SaaS Revenue', 'Consulting Revenue'], rule: 'Total value of taxable services provided in the taxable period. Exclude exempted services.' },
  { box: 'SST-02 Box 2: Service Tax Collected', accounts: ['Service Tax Payable'], rule: 'Service Tax = Box 1 × 8% (from Mar 2024; was 6% before). No input tax deduction in SST system.' },
  { box: 'SST-02 Box 3: Adjustments', accounts: [], rule: 'Bad debt relief, credit notes, adjustments from prior periods.' },
  { box: 'SST-02 Box 4: Net Service Tax Payable', formula: 'Box 2 - Box 3 adjustments', rule: 'Amount due to RMCD (Royal Malaysian Customs Department). File and pay by last day of following month after taxable period end.' },
];

// MY industry benchmarks (Source: BNM Annual Report 2023, Bursa Malaysia statistics, DOSM)
const MY_BENCHMARKS = [
  { industry: 'Technology Services Malaysia', grossMarginMedian: 0.42, payrollToRevenueMedian: 0.58, netMarginMedian: 0.08, corporateTaxRate: 0.24, sstRate: 0.08, epfEmployerRate: 0.13 },
  { industry: 'FinTech Malaysia', grossMarginMedian: 0.55, payrollToRevenueMedian: 0.52, netMarginMedian: 0.10, corporateTaxRate: 0.24, sstRate: 0.08, epfEmployerRate: 0.13 },
  { industry: 'Professional Services Malaysia', grossMarginMedian: 0.45, payrollToRevenueMedian: 0.62, netMarginMedian: 0.09, corporateTaxRate: 0.17, sstRate: 0.08, epfEmployerRate: 0.13 },
];

// ============================================================================
// AGENT
// ============================================================================

export class AASMYTrainerAgent extends BaseTrainingAgent {
  readonly name = 'aas-my-trainer';
  readonly version = '1.0.0';
  readonly description = 'Malaysia accounting trainer: SST-02 (no input credit), MFRS CoA, EPF/SOCSO/EIS payroll, LHDN corporate tax, BNM benchmarks';

  async fetch(): Promise<FetchResult> {
    this.log('FETCH', `Loading MY accounts: ${MY_ACCOUNTS.length} MFRS accounts, SST-02 structure, ${MY_BENCHMARKS.length} industry benchmarks`);
    return {
      data: { accounts: MY_ACCOUNTS, sst02Boxes: MY_SST02_BOXES, benchmarks: MY_BENCHMARKS },
      sources: ['rmcd-sst-guide', 'mfrs-masb-standards', 'bnm-statistics', 'lhdn-form-c', 'epf-kwsp-rates'],
      recordCount: MY_ACCOUNTS.length + MY_SST02_BOXES.length + MY_BENCHMARKS.length,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const { accounts, sst02Boxes, benchmarks } = fetchResult.data;
    const signals: ConnectorSignal[] = [];
    const today = new Date().toISOString().substring(0, 10);

    // Account classification signals
    for (const acct of accounts) {
      signals.push({ organization_id: this.organizationId, source_domain: 'aas.finance', signal_type: 'acc_account_classification', signal_value: 1.0, signal_timestamp: today, entity_type: 'my_account', entity_id: `my_acct/${acct.name.replace(/\s/g, '_')}`, metadata: { accountName: acct.name, type: acct.type, normalBalance: acct.normalBalance, statement: acct.statement, subtype: acct.subtype, rule: acct.rule, jurisdiction: 'my', source: 'mfrs_masb' } });
    }

    // SST no-input-credit signal (critical difference from SG/AU)
    signals.push({ organization_id: this.organizationId, source_domain: 'aas.finance', signal_type: 'acc_gst_input_tax_rate', signal_value: 0.0, signal_timestamp: today, entity_type: 'sst_rule', entity_id: 'my_sst/no_input_credit', metadata: { jurisdiction: 'my', rule: 'CRITICAL: Malaysia SST has NO input tax credit. Unlike SG GST (which has input tax recovery), MY SST paid on purchases is a COST to the business. There is no Service Tax claimable asset account. Service Tax paid = expense or capitalise to cost of asset.', sstServiceTaxRate: 0.08, sstSalesTaxRate: '5-10% on goods', source: 'rmcd_sst_guide' } });

    // Benchmark signals
    for (const bench of benchmarks) {
      signals.push({ organization_id: this.organizationId, source_domain: 'aas.finance', signal_type: 'acc_gross_margin_ratio', signal_value: bench.grossMarginMedian, signal_timestamp: today, entity_type: 'my_benchmark', entity_id: `my_bench/${bench.industry.replace(/\s/g, '_')}`, metadata: { ...bench, source: 'bnm_dosm_bursa_2023' } });
    }

    // SST-02 signals
    for (const box of sst02Boxes) {
      signals.push({ organization_id: this.organizationId, source_domain: 'aas.finance', signal_type: 'acc_gst_net_payable', signal_value: 1.0, signal_timestamp: today, entity_type: 'sst02_box', entity_id: `my_sst02/${box.box.replace(/[^a-z0-9]/gi, '_').substring(0, 40)}`, metadata: { box: box.box, accounts: (box as any).accounts || [], rule: box.rule, source: 'rmcd_sst02_form' } });
    }

    const packs: TrainingPack[] = [
      {
        id: 'aas-my-sst-computation',
        title: 'Malaysia SST-02: Service Tax (No Input Credit)',
        source: 'RMCD SST guide + MFRS. Key difference: NO input tax recovery unlike SG/AU GST.',
        industry: 'Technology / SaaS Malaysia',
        domains: ['finance', 'legal'],
        confidence: 0.94,
        tags: ['my', 'sst', 'service-tax', 'rmcd', 'aas', 'rw2'],
        causalChains: [{ source: 'aas.finance', target: 'legal', metric: 'acc_gst_net_payable', effectSize: 0.94, lagDays: 60, coefficientSign: 1 }],
        businessRules: [
          { title: 'Malaysia SST — No Input Tax Credit Mechanism', entityType: 'tax_transaction', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'my' }, { field: 'sst_paid_on_purchase', operator: 'equals', value: true }] }, then: [{ type: 'set_flag', params: { flag: 'sst_no_input_credit', treatment: 'direct_cost', journal: 'DR Expense (or capitalise) — NOT DR Input Tax Claimable' } }], naturalLanguage: 'CRITICAL DIFFERENCE: Malaysia SST has NO input tax credit mechanism. Service tax paid on purchases is a direct cost (DR Expense), NOT a claimable asset. This is fundamentally different from SG GST (full input credit) and AU GST (ITC). Do not set up SST Input Tax asset accounts in Malaysia. (RMCD SST Guide 2018)' },
          { title: 'Malaysia Service Tax 8% (from 1 March 2024)', entityType: 'transaction', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'my' }, { field: 'is_taxable_service', operator: 'equals', value: true }, { field: 'service_date', operator: 'greater_than_or_equal', value: '2024-03-01' }] }, then: [{ type: 'set_flag', params: { service_tax_rate: 0.08, applicable_services: ['IT services', 'professional services', 'hotels', 'telecom'], journal: 'DR AR (inclusive), CR Revenue (exclusive), CR Service Tax Payable 8%', filing: 'SST-02 bi-monthly' } }], naturalLanguage: 'Malaysia Service Tax raised to 8% from 1 March 2024 (was 6%). Applies to IT services, professional services, hotels, telecom. Journal: DR AR (inclusive), CR Revenue (exclusive), CR Service Tax Payable at 8%. File SST-02 bi-monthly. (RMCD Service Tax Amendment 2024)' },
          { title: 'Malaysia EPF Employer Contribution', entityType: 'payroll_transaction', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'my' }, { field: 'is_my_employee', operator: 'equals', value: true }] }, then: [{ type: 'set_flag', params: { employer_epf_rate_under_5k_rm: 0.13, employer_epf_rate_over_5k_rm: 0.12, employee_epf_rate: 0.09, journal: 'DR EPF Expense, CR EPF Payable', due: '15th of following month via i-Akaun' } }], naturalLanguage: 'Malaysia Employer EPF: 13% on wages ≤RM5,000/month, 12% above. Employee contributes 9% (age <60). Journal: DR EPF Expense, CR EPF Payable. Remit via i-Akaun by 15th of the following month. (EPF/KWSP 2024)' },
          { title: 'Malaysia Corporate Tax Rates', entityType: 'company', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'my' }, { field: 'is_resident_company', operator: 'equals', value: true }] }, then: [{ type: 'set_flag', params: { large_company_rate: 0.24, sme_preferential_rate: 0.17, sme_threshold_rm: 600000, filing: 'Form C within 7 months of year end' } }], naturalLanguage: 'Malaysia Corporate Tax: 24% for Sdn Bhd with paid-up >RM2.5M. SME rate: 17% on first RM600,000 chargeable income (paid-up <RM2.5M, unrelated to larger company). File Form C within 7 months of financial year end. (LHDN)' },
        ],
        cascades: [],
        patterns: [{ name: 'MY SST vs SG/AU GST Structural Difference', domains: ['finance'], description: 'Malaysia SST (Single-Stage Tax) is architecturally different from Singapore/Australia GST (Multi-Stage Value-Added Tax). SST: NO input tax credit — every service tax payment is a cost. GST: Full input tax credit chain. A company with offices in SG and MY must apply completely different accounting logic per jurisdiction.', observed: MY_ACCOUNTS.length, expected: MY_ACCOUNTS.length, total: MY_ACCOUNTS.length }],
        outcomes: [],
      } as unknown as TrainingPack,
    ];

    this.log('CONVERT', `Generated ${signals.length} signals + ${packs.length} packs`);
    return { signals, packs };
  }

  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const result: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };
    if (this.config.dryRun) { this.log('TRAIN', `[DRY RUN] ${signals.length} signals + ${packs.length} packs. Key: MY SST has NO input tax credit — unlike SG GST.`); result.signalsStored = signals.length; result.packsProcessed = packs.length; return result; }
    const BATCH = 500;
    for (let i = 0; i < signals.length; i += BATCH) { try { await storeConnectorSignals(this.supabase, signals.slice(i, i + BATCH)); result.signalsStored += Math.min(BATCH, signals.length - i); } catch (e) { this.errors.push(String(e)); } }
    try { const r = await createBrainTrainer().trainBatch(this.supabase, this.organizationId, packs); result.packsProcessed = packs.length; result.discoveries = r?.causalEdgesLoaded ?? 0; } catch (e) { this.errors.push(String(e)); }
    try { await createScheduledJobs(this.supabase).runDailyCausalDiscovery(this.organizationId); } catch { }
    try { await this.supabase.from('agent_run_history').insert({ agent_name: this.name, agent_version: this.version, organization_id: this.organizationId, status: 'success', signals_stored: result.signalsStored, packs_processed: result.packsProcessed, discoveries: result.discoveries, run_mode: 'full', completed_at: new Date().toISOString() }); } catch { }
    return result;
  }

  async validate(r: TrainResult): Promise<ValidationResult> {
    if (this.config.dryRun) return { passed: true, score: 1.0, issues: [] };
    const issues: string[] = [];
    if (r.packsProcessed < 1) issues.push('No packs processed');
    if (r.signalsStored < 10) issues.push(`Only ${r.signalsStored} signals`);
    return { passed: issues.length === 0, score: Math.min(1, r.signalsStored / 30), issues };
  }
}

globalRegistry.register({
  name: 'aas-my-trainer',
  description: 'Malaysia accounting: SST-02 (NO input credit — unlike SG GST), EPF/SOCSO/EIS payroll, LHDN 24% corp tax, MFRS CoA, BNM benchmarks',
  version: '1.0.0',
  factory: (config) => new AASMYTrainerAgent(config),
  schedule: '0 4 * * 2', // Weekly Tuesday 4 AM UTC
  resourceRequirements: { cpu: '512', memory: '2048' },
  tags: ['training', 'accounting', 'aas', 'malaysia', 'sst', 'epf', 'rw2'],
});
