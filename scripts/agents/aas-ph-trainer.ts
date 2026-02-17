/**
 * AAS Philippines Trainer
 *
 * Brain Region: Insula — PH jurisdiction accounting intelligence
 * RW2: BIR VAT 12%, withholding taxes, PFRS CoA, SSS/PhilHealth/Pag-IBIG
 *
 * Sources (all public):
 *   1. BIR (Bureau of Internal Revenue) — VAT 12%, withholding tax rates
 *   2. PFRS (Philippine Financial Reporting Standards) — IFRS-aligned CoA
 *   3. SSS/PhilHealth/Pag-IBIG — mandatory payroll contributions
 *   4. SEC Philippines XBRL taxonomy (public filing standard)
 *   5. PSE (Philippine Stock Exchange) — listed company benchmarks
 */

import { BaseTrainingAgent, type AgentConfig, type FetchResult, type ConvertResult, type TrainResult, type ValidationResult } from '../agent-framework/base-training-agent';
import { globalRegistry } from '../agent-framework/agent-registry';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// PHILIPPINES-SPECIFIC ACCOUNTS (PFRS + BIR statutory)
// Source: BIR Tax Code, PFRS (=IFRS adopted), SSS/PhilHealth/Pag-IBIG
// ============================================================================

const PH_ACCOUNTS = [
  // ── VAT (Value-Added Tax) — 12% standard rate ──
  { name: 'Output VAT', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'PH VAT Output: 12% on sale of goods/services. Credit Output VAT on sales, Debit AR (VAT-inclusive). File BIR Form 2550M (monthly) or 2550Q (quarterly).' },
  { name: 'Input VAT', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'current_asset', rule: 'PH VAT Input: 12% on purchases from VAT-registered suppliers. Debit Input VAT (claimable), offset against Output VAT. Excess input VAT can be refunded or carried forward.' },
  { name: 'VAT Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'Net VAT payable = Output VAT - Input VAT. Pay to BIR by 20th of following month (monthly) or 25th of month after quarter end.' },
  // ── Withholding Taxes (BIR) — complex system, many types ──
  { name: 'Expanded Withholding Tax Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'EWT (Creditable WHT): Deducted by payor from certain income payments. Rates: professional fees 10%/15%, rent 5%, interest 20%, dividends 10%. File BIR Form 1601-EQ quarterly.' },
  { name: 'Withholding Tax on Compensation Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'WHT on employee salaries. Progressive rate 0-35% based on annual compensation. Deduct from payroll, remit to BIR monthly via Form 1601-C.' },
  { name: 'Final Withholding Tax Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'FWT on passive income (interest, dividends, royalties). Rate 20-25%. Full and final payment — no further tax on recipient.' },
  // ── SSS, PhilHealth, Pag-IBIG (mandatory employee benefits) ──
  { name: 'SSS Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', rule: 'SSS (Social Security System): Employer share ~9.5% of monthly salary (2024). Employee ~4.5%. Total: 14%. Capped at MSC ₱30,000/month. Remit by last day of following month.' },
  { name: 'SSS Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', rule: 'Employer SSS contribution ~9.5% of monthly salary credit (MSC). Part of total staff cost.' },
  { name: 'PhilHealth Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', rule: 'PhilHealth (Philippine Health Insurance Corp): Employer 5%, Employee 5% of basic monthly salary. Capped at ₱100,000/month. Total monthly premium = 10% of salary.' },
  { name: 'PhilHealth Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', rule: 'Employer PhilHealth: 5% of basic monthly salary.' },
  { name: 'Pag-IBIG Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', rule: 'HDMF/Pag-IBIG: Employer 2%, Employee 2% of monthly salary (max contribution ₱200 each = ₱400 total). Remit monthly.' },
  { name: 'Pag-IBIG Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', rule: 'Employer Pag-IBIG: 2% of monthly salary, max ₱200/month.' },
  // ── 13th Month Pay (mandatory in Philippines) ──
  { name: '13th Month Pay Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'operating_expense', rule: 'PH mandatory 13th month pay = 1/12 of basic annual salary. Due by Dec 24 each year. Tax-exempt up to ₱90,000. Accrue monthly (Debit 13th Month Pay Expense, Credit 13th Month Pay Payable).' },
  { name: '13th Month Pay Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_payroll', rule: 'Monthly accrual of 13th month pay. Pay out by Dec 24. Credit monthly, Debit when paid.' },
  // ── Corporate Income Tax ──
  { name: 'Income Tax Payable - BIR', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'PH corporate income tax: Regular rate 25% (domestic corp). CREATE Act: SMEs with net taxable income ≤₱5M AND total assets ≤₱100M pay 20%. File BIR Form 1702RT annually.' },
  { name: 'MCIT Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'Minimum Corporate Income Tax (MCIT): 2% of gross income (revenue - COGS), applicable when MCIT > regular corporate tax. Applies from 4th year of operations.' },
];

// BIR VAT filing structure (Form 2550M/2550Q)
const PH_VAT_BOXES = [
  { box: 'Box 1: Total Sales (VAT inclusive)', accounts: ['Revenue', 'Subscription Revenue', 'SaaS Revenue'], rule: 'All taxable sales including VAT.' },
  { box: 'Box 2: VAT on Sales (Output Tax)', accounts: ['Output VAT'], rule: 'Output VAT = Total VAT-inclusive sales × 12/112 (to extract tax from inclusive amount).' },
  { box: 'Box 3: Total Purchases (VAT inclusive)', accounts: ['Accounts Payable', 'Cloud Infrastructure'], rule: 'Total taxable purchases from VAT-registered suppliers.' },
  { box: 'Box 4: Input VAT from Purchases', accounts: ['Input VAT'], rule: 'Input VAT = VAT-inclusive purchases × 12/112. Claimable against Output VAT.' },
  { box: 'Box 5: Net VAT Payable / (Excess Input)', formula: 'Box 2 - Box 4', rule: 'If Output > Input: net VAT payable to BIR. If Input > Output: excess input VAT carried forward (or apply for refund after 2 years).' },
];

// PH benchmarks (PSE data + BIR SOI)
const PH_BENCHMARKS = [
  { industry: 'Technology Services Philippines', grossMarginMedian: 0.38, payrollToRevenueMedian: 0.55, netMarginMedian: 0.07, corporateTaxRate: 0.25, vatRate: 0.12, sssEmployerRate: 0.095 },
  { industry: 'BPO / IT-BPM Philippines', grossMarginMedian: 0.32, payrollToRevenueMedian: 0.65, netMarginMedian: 0.08, corporateTaxRate: 0.25, vatRate: 0.12, sssEmployerRate: 0.095 },
  { industry: 'FinTech Philippines', grossMarginMedian: 0.55, payrollToRevenueMedian: 0.50, netMarginMedian: 0.09, corporateTaxRate: 0.20, vatRate: 0.12, sssEmployerRate: 0.095 },
];

// ============================================================================
// AGENT
// ============================================================================

export class AASPHTrainerAgent extends BaseTrainingAgent {
  readonly name = 'aas-ph-trainer';
  readonly version = '1.0.0';
  readonly description = 'Philippines accounting trainer: BIR VAT 12% (input/output), expanded withholding tax, SSS/PhilHealth/Pag-IBIG payroll, 13th month pay, PFRS CoA';

  async fetch(): Promise<FetchResult> {
    this.log('FETCH', `Loading PH: ${PH_ACCOUNTS.length} PFRS accounts, BIR VAT structure, ${PH_BENCHMARKS.length} benchmarks`);
    return {
      data: { accounts: PH_ACCOUNTS, vatBoxes: PH_VAT_BOXES, benchmarks: PH_BENCHMARKS },
      sources: ['bir-tax-code-ph', 'pfrs-frsc-philippines', 'sss-philhealth-pagibig-rates', 'pse-benchmarks'],
      recordCount: PH_ACCOUNTS.length + PH_VAT_BOXES.length + PH_BENCHMARKS.length,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const { accounts, vatBoxes, benchmarks } = fetchResult.data;
    const signals: ConnectorSignal[] = [];
    const today = new Date().toISOString().substring(0, 10);

    for (const acct of accounts) {
      signals.push({ organization_id: this.organizationId, source_domain: 'finance', signal_type: 'acc_account_classification', signal_value: 1.0, signal_timestamp: today, entity_type: 'ph_account', entity_id: `ph_acct/${acct.name.replace(/\s/g, '_')}`, metadata: { accountName: acct.name, type: acct.type, normalBalance: acct.normalBalance, statement: acct.statement, rule: acct.rule, jurisdiction: 'ph', source: 'pfrs_bir' } });
    }

    // PH VAT has INPUT CREDIT (unlike MY SST) — important distinction
    signals.push({ organization_id: this.organizationId, source_domain: 'finance', signal_type: 'acc_gst_input_tax_rate', signal_value: 0.12, signal_timestamp: today, entity_type: 'ph_vat_rule', entity_id: 'ph_vat/input_credit', metadata: { jurisdiction: 'ph', vatRate: 0.12, rule: 'PH VAT: 12% standard rate WITH input tax credit (unlike Malaysia SST). Input VAT on purchases from VAT-registered suppliers is claimable against Output VAT. Net VAT = Output - Input. Similar structure to Singapore GST but at 12%.', source: 'bir_tax_code_ph' } });

    // Withholding tax signals (complex PH-specific system)
    signals.push({ organization_id: this.organizationId, source_domain: 'finance', signal_type: 'acc_transaction_classification', signal_value: 1.0, signal_timestamp: today, entity_type: 'ph_wht_rule', entity_id: 'ph_wht/ewt_professional', metadata: { jurisdiction: 'ph', whtType: 'Expanded Withholding Tax (EWT)', rate: 0.10, condition: 'Professional fees to individuals earning ≤₱3M/year = 10%. Above ₱3M = 15%.', account: 'Expanded Withholding Tax Payable', journalEntry: 'Debit Professional Fees (gross), Credit Cash (net paid), Credit EWT Payable (10% withheld)', source: 'bir_revenue_regulations_11_2018' } });

    // 13th month pay (unique to Philippines)
    signals.push({ organization_id: this.organizationId, source_domain: 'finance', signal_type: 'acc_transaction_classification', signal_value: 1.0, signal_timestamp: today, entity_type: 'ph_13th_month', entity_id: 'ph_payroll/13th_month', metadata: { jurisdiction: 'ph', rule: 'PH mandatory 13th month pay: Accrue 1/12 of basic salary monthly. Debit 13th Month Pay Expense, Credit 13th Month Pay Payable. Pay by Dec 24. Tax-exempt up to ₱90,000 (PH TRAIN Law).', account: '13th Month Pay Expense', source: 'ph_pd_851_13th_month_pay' } });

    for (const bench of benchmarks) {
      signals.push({ organization_id: this.organizationId, source_domain: 'finance', signal_type: 'acc_gross_margin_ratio', signal_value: bench.grossMarginMedian, signal_timestamp: today, entity_type: 'ph_benchmark', entity_id: `ph_bench/${bench.industry.replace(/\s/g, '_')}`, metadata: { ...bench, source: 'pse_bir_soi_2023' } });
    }

    const packs: TrainingPack[] = [
      {
        id: 'aas-ph-vat-computation',
        title: 'Philippines BIR VAT 12% + Withholding Tax System',
        source: 'BIR Tax Code + Revenue Regulations. PH VAT has input credit (unlike MY SST). Multiple WHT types (EWT, FWT, WTC).',
        industry: 'Technology / FinTech Philippines',
        domains: ['finance', 'legal', 'hr'],
        confidence: 0.92,
        tags: ['ph', 'vat', 'bir', 'withholding-tax', '13th-month', 'aas', 'rw2'],
        causalChains: [{ source: 'finance', target: 'legal', metric: 'acc_gst_net_payable', effectSize: 0.92, lagDays: 20, coefficientSign: 1 }],
        businessRules: [
          { id: 'ph-vat-12pct', condition: 'jurisdiction = ph AND is_vat_registered AND taxable_supply', action: 'PH VAT 12% on gross selling price. Output VAT = amount × 12%. Input VAT claimable on purchases. Net VAT payable = Output - Input. File Form 2550M monthly by 20th.', confidence: 1.0, source: 'bir_nirc_sec_106_108' },
          { id: 'ph-ewt-professional', condition: 'jurisdiction = ph AND payment_to = professional_individual', action: 'Expanded Withholding Tax on professional fees: 10% if income ≤₱3M/year, 15% if >₱3M. Payor withholds and remits. Issue BIR Form 2307 to payee.', confidence: 1.0, source: 'bir_rr_11_2018' },
          { id: 'ph-13th-month', condition: 'jurisdiction = ph AND employee_rank_and_file', action: 'Mandatory 13th month pay = total basic salary earned in year / 12. Accrue monthly. Pay by Dec 24. Tax-exempt up to ₱90,000 combined with other benefits under TRAIN Law.', confidence: 1.0, source: 'pd_851_dole_ph' },
          { id: 'ph-sss-philhealth-pagibig', condition: 'jurisdiction = ph AND ph_employee', action: 'Mandatory contributions: SSS 9.5% employer, PhilHealth 5% employer, Pag-IBIG 2% (max ₱200). All deducted from employee and matched by employer. Remit monthly.', confidence: 1.0, source: 'sss_philhealth_hdmf_ph' },
        ],
        cascades: [],
        patterns: [{ name: 'Philippines Payroll Complexity', domains: ['finance', 'hr'], description: `${PH_ACCOUNTS.length} PH-specific accounts. Payroll includes 5 mandatory contributions (SSS, PhilHealth, Pag-IBIG, WHT, 13th Month accrual). Total employer burden ~17% of basic salary beyond gross pay. Industry benchmarks: IT services gross margin 38%, BPO payroll-to-revenue 65%.`, observed: PH_ACCOUNTS.length, expected: PH_ACCOUNTS.length, total: PH_ACCOUNTS.length }],
        outcomes: [],
      } as unknown as TrainingPack,
    ];

    this.log('CONVERT', `Generated ${signals.length} signals + ${packs.length} packs`);
    return { signals, packs };
  }

  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const result: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };
    if (this.config.dryRun) { this.log('TRAIN', `[DRY RUN] ${signals.length} signals + ${packs.length} packs. Key: PH VAT 12% WITH input credit; mandatory 13th month pay; SSS/PhilHealth/Pag-IBIG.`); result.signalsStored = signals.length; result.packsProcessed = packs.length; return result; }
    const BATCH = 500;
    for (let i = 0; i < signals.length; i += BATCH) { try { await storeConnectorSignals(this.supabase, signals.slice(i, i + BATCH)); result.signalsStored += Math.min(BATCH, signals.length - i); } catch (e) { this.errors.push(String(e)); } }
    try { const r = await createBrainTrainer().trainBatch(this.supabase, this.organizationId, packs); result.packsProcessed = packs.length; result.discoveries = r?.casesLoaded ?? 0; } catch (e) { this.errors.push(String(e)); }
    try { await createScheduledJobs(this.supabase).runDailyCausalDiscovery(this.organizationId); } catch { }
    try { await this.supabase.from('agent_run_history').insert({ agent_name: this.name, agent_version: this.version, organization_id: this.organizationId, status: 'success', signals_stored: result.signalsStored, packs_processed: result.packsProcessed, discoveries: result.discoveries, run_mode: 'full', completed_at: new Date().toISOString() }); } catch { }
    return result;
  }

  async validate(r: TrainResult): Promise<ValidationResult> {
    if (this.config.dryRun) return { passed: true, score: 1.0, issues: [] };
    const issues: string[] = [];
    if (r.packsProcessed < 1) issues.push('No packs'); if (r.signalsStored < 10) issues.push(`Only ${r.signalsStored} signals`);
    return { passed: issues.length === 0, score: Math.min(1, r.signalsStored / 25), issues };
  }
}

globalRegistry.register({
  name: 'aas-ph-trainer',
  description: 'Philippines accounting: BIR VAT 12% (input credit), EWT/FWT withholding taxes, SSS/PhilHealth/Pag-IBIG payroll, mandatory 13th month pay, PFRS CoA',
  version: '1.0.0',
  factory: (config) => new AASPHTrainerAgent(config),
  schedule: '0 4 * * 3', // Weekly Wednesday 4 AM UTC
  resourceRequirements: { cpu: '512', memory: '2048' },
  tags: ['training', 'accounting', 'aas', 'philippines', 'vat', 'bir', 'rw2'],
});
