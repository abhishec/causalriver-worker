/**
 * AAS India Trainer
 *
 * Brain Region: Insula — IN jurisdiction accounting intelligence
 * RW2: GSTR-3B (IGST/CGST/SGST split), IndAS CoA, Tookitaki intercompany, TDS, PF/ESI
 *
 * Sources (all public):
 *   1. GSTN (Goods and Services Tax Network) — GSTR-3B form structure, rate slabs 0/5/12/18/28%
 *   2. ICAI (Institute of Chartered Accountants of India) — IndAS CoA (IFRS-aligned)
 *   3. EPFO + ESIC — PF 12% + ESI 3.25% employer contribution rates
 *   4. CBDT (Central Board of Direct Taxes) — TDS Section 194C/194J/194H, advance tax
 *   5. MCA (Ministry of Corporate Affairs) — Tookitaki Technologies Private Limited public filings
 *   6. BSE/NSE listed IT/SaaS company benchmarks (public annual reports)
 *
 * Key India-specific intelligence:
 *   - GST is DUAL: Interstate = IGST (full rate), Intrastate = CGST + SGST (50/50 split)
 *   - TDS deducted at source on most B2B payments (not a payroll-only concept like PAYE)
 *   - Advance tax quarterly: 15% by Jun 15, 45% by Sep 15, 75% by Dec 15, 100% by Mar 15
 *   - Tookitaki Technologies Pvt Ltd (India subsidiary) — intercompany recharges from SG parent
 *   - IndAS 116 (lease) identical to SFRS 16; IndAS 115 (revenue) identical to SFRS 15
 */

import { BaseTrainingAgent, type AgentConfig, type FetchResult, type ConvertResult, type TrainResult, type ValidationResult } from '../agent-framework/base-training-agent';
import { globalRegistry } from '../agent-framework/agent-registry';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// INDIA-SPECIFIC ACCOUNTS (IndAS + GSTN + CBDT statutory)
// Source: ICAI IndAS, GSTN portal, CBDT income tax, EPFO/ESIC
// ============================================================================

const IN_ACCOUNTS = [
  // ── GST — DUAL structure (IGST for interstate, CGST+SGST for intrastate) ──
  { name: 'IGST Output Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'Integrated GST (IGST): Applied on INTERSTATE supply of goods/services (supplier state ≠ customer state) or exports/imports. Full rate: 5%, 12%, 18%, or 28%. Revenue to CENTRAL government. Credit Output IGST when billing interstate customers. File GSTR-3B monthly.' },
  { name: 'CGST Output Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'Central GST (CGST): Applied on INTRASTATE supply (both parties in same state). Rate = HALF of standard GST slab (9% CGST + 9% SGST = 18% GST). Revenue to Central govt. Credit CGST Output when billing intrastate. File GSTR-3B.' },
  { name: 'SGST Output Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'State GST (SGST): Applied on INTRASTATE supply alongside CGST. Rate = HALF of GST slab. Revenue to State govt. Always equal to CGST. Credit SGST Output when billing intrastate. Cannot use IGST credit to offset SGST directly.' },
  { name: 'IGST Input Credit', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'current_asset', rule: 'Input Tax Credit (ITC) on IGST paid on interstate purchases/imports. IGST ITC can offset IGST, CGST, or SGST output (in that priority order). Debit IGST Input Credit on purchases.' },
  { name: 'CGST Input Credit', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'current_asset', rule: 'Input Tax Credit on CGST paid on intrastate purchases. CGST ITC offsets CGST first, then IGST. Cannot directly offset SGST. Debit CGST Input Credit on intrastate purchases.' },
  { name: 'SGST Input Credit', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'current_asset', rule: 'Input Tax Credit on SGST paid on intrastate purchases. SGST ITC offsets SGST first, then IGST. Cannot directly offset CGST. Debit SGST Input Credit on intrastate purchases.' },
  // ── TDS (Tax Deducted at Source) — applies to almost all B2B payments in India ──
  { name: 'TDS Payable - Section 194J', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'TDS u/s 194J: Deducted on payment for Professional/Technical services. Rate: 10% for professional services, 2% for technical/contract work. Threshold: ₹30,000/year. File TDS return quarterly (Form 26Q). Issue Form 16A to deductee.' },
  { name: 'TDS Payable - Section 194C', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'TDS u/s 194C: Deducted on payments to contractors. Rate: 1% (individual/HUF), 2% (companies). Threshold: ₹30,000 single payment or ₹1,00,000 aggregate/year. Covers software development outsourcing, maintenance contracts.' },
  { name: 'TDS Payable - Section 194H', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'TDS u/s 194H: Deducted on commission or brokerage payments. Rate: 5%. Threshold: ₹15,000/year. Applicable on reseller/channel partner commissions.' },
  { name: 'Advance Tax Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'India advance tax (self-assessment): Quarterly instalments. Jun 15: 15% of annual liability. Sep 15: 45%. Dec 15: 75%. Mar 15: 100%. Applicable if annual tax liability >₹10,000. Shortfall attracts interest u/s 234B/234C.' },
  // ── PF / ESI (India payroll statutory) ──
  { name: 'Provident Fund Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', rule: 'EPF (Employees Provident Fund): Employer 12% of basic+DA, Employee 12% of basic+DA. Total 24%. Employer 12% split: 8.33% → EPS (pension), 3.67% → EPF. Threshold: ≥20 employees mandatory. Remit by 15th of following month. File EPFO ECR monthly.' },
  { name: 'Provident Fund Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', rule: 'Employer PF contribution: 12% of basic+DA. Additionally, employer pays 0.5% EDLI + 0.50% admin charges. Total employer PF cost ≈ 13.15% of basic+DA.' },
  { name: 'ESI Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', rule: 'ESIC (Employee State Insurance Corp): Employer 3.25%, Employee 0.75% of gross wages. Applicable for employees earning ≤₹21,000/month. Remit by 15th of following month. Provides medical insurance for employees.' },
  { name: 'ESI Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', rule: 'Employer ESI: 3.25% of gross wages for employees earning ≤₹21,000/month.' },
  // ── Intercompany — Tookitaki Technologies Pvt Ltd ↔ Tookitaki Holding Pte Ltd (SG parent) ──
  { name: 'Intercompany Receivable - Tookitaki Holding', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'intercompany_receivable', rule: 'Intercompany receivable from SG parent (Tookitaki Holding Pte Ltd). Arises when India entity (Tookitaki Technologies Pvt Ltd) provides services to SG parent. Eliminate on consolidation. Subject to Transfer Pricing (TP) regulations — must be at arm\'s length. Document with intercompany service agreement.' },
  { name: 'Intercompany Payable - Tookitaki Holding', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'intercompany_payable', rule: 'Intercompany payable to SG parent — management fees, recharge of costs, IP licensing fees. In Xero GL for India entity: appears as "Management fees payable to Tookitaki Holding" or "Recharge - Technology services". Subject to WHT u/s 195 (FTS: 10%+cess = 10.66% if DTAA India-Singapore applies). File Form 15CA/15CB for foreign remittance.' },
  { name: 'Intercompany Revenue - Tookitaki Holding', type: 'revenue' as const, normalBalance: 'credit' as const, statement: 'income_statement' as const, subtype: 'intercompany_revenue', rule: 'Revenue from SG parent for development/technology services rendered by India entity. Typically export of services (ZERO-RATED for GST in India — not exempt, zero-rated means GST = 0% but Input Tax Credits are claimable). Subject to FEMA (Foreign Exchange Management Act) for forex receipt. FIRC required for each receipt.' },
  { name: 'Withholding Tax - Section 195 (Non-Resident)', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', rule: 'WHT u/s 195 on payments to non-residents. Applicable when India subsidiary pays management fees/IP royalties to SG parent. Rate: Per India-Singapore DTAA — FTS (Fees for Technical Services) 10%. Gross up if agreement says payment is net. File Form 15CA before remittance; CA certificate Form 15CB if >₹5 lakh.' },
  // ── IndAS specific accounts ──
  { name: 'Right-of-Use Asset (IndAS 116)', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'non_current_asset', rule: 'IndAS 116 (identical to SFRS 16 / IFRS 16): Recognize ROU asset for all leases >12 months. Debit ROU Asset (PV of future lease payments), Credit Lease Liability. Depreciate ROU Asset over shorter of lease term or useful life. Charge interest on lease liability.' },
  { name: 'Lease Liability (IndAS 116)', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'lease_liability', rule: 'IndAS 116 lease liability = present value of remaining lease payments, discounted at incremental borrowing rate. Split: current portion (due within 12 months) and non-current. Reduce by lease payments, increase by interest accretion.' },
  { name: 'Deferred Tax Asset / Liability (IndAS 12)', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'non_current_asset', rule: 'IndAS 12 (identical to IAS 12): Deferred tax on temporary differences between IndAS carrying amount and tax base. India corporate tax: 25% (base) + 10% surcharge + 4% cess = 25.168% effective for companies with turnover <₹400 Cr (opt-out of exemptions). Use DTA for deductible temp differences, DTL for taxable.' },
];

// GSTR-3B filing structure (monthly GST return — most important return)
const IN_GSTR3B_BOXES = [
  { box: '3.1(a) Outward taxable supplies (other than zero-rated/exempt)', accounts: ['IGST Output Payable', 'CGST Output Payable', 'SGST Output Payable'], rule: 'All taxable B2B and B2C sales within India. Report IGST (interstate) and CGST+SGST (intrastate) separately. Include: software services, SaaS subscriptions billed to India customers.' },
  { box: '3.1(b) Zero-rated supplies (exports)', accounts: ['Intercompany Revenue - Tookitaki Holding'], rule: 'Export of services to non-residents = ZERO-RATED (GST = 0% but ITC claimable). Tookitaki IN entity billing SG parent falls here. Supported by LUT (Letter of Undertaking) filed annually to avoid paying IGST upfront.' },
  { box: '3.1(c) Nil-rated/Exempt supplies', accounts: ['Revenue - Exempt Services'], rule: 'Genuinely exempt supplies (e.g., educational services). No ITC on inputs used for exempt supplies — must reverse under Rule 42.' },
  { box: '4(A) ITC Available — Inputs', accounts: ['IGST Input Credit', 'CGST Input Credit', 'SGST Input Credit'], rule: 'Input Tax Credit on business purchases. Conditions: Tax invoice from registered supplier, supply received, GSTR-2A reconciliation done, payment to supplier within 180 days. Match with GSTR-2B auto-populated data.' },
  { box: '5 Net GST Payable', formula: '3.1(a) output tax - 4(A) ITC', rule: 'Net GST payable = Total output tax - Total ITC available. Pay by 20th of following month via PMT-06 challan through GSTN portal. Offset order: IGST ITC → IGST output first, then CGST; CGST ITC → CGST first then IGST; SGST ITC → SGST first then IGST.' },
];

// Transfer pricing intercompany scenarios (Tookitaki IN ↔ SG)
const IN_INTERCOMPANY_SCENARIOS = [
  {
    scenario: 'India entity provides software development services to SG parent',
    indiaEntry: 'Dr: Intercompany Receivable - Tookitaki Holding ₹X | Cr: Intercompany Revenue - Tookitaki Holding ₹X',
    sgEntry: 'Dr: Management / Development Fees - India ₹X | Cr: Intercompany Payable - Tookitaki IN ₹X',
    gstTreatment: 'ZERO-RATED export of services (GST = 0%, ITC claimable). File LUT. Receive USD/SGD via wire. File FIRC.',
    transferPricingMethod: 'TNMM (Transactional Net Margin Method) or CUP. Document in TP study. File Form 3CEB if international transactions >₹1 Cr.',
    whtTreatment: 'No WHT from SG on payment to India — SG does not withhold on outbound payments for services (unlike India).',
  },
  {
    scenario: 'SG parent recharges management fees / corporate costs to India entity',
    indiaEntry: 'Dr: Management Fees Expense ₹X | Dr: IGST Input Credit (if applicable) | Cr: Intercompany Payable - Tookitaki Holding ₹X',
    sgEntry: 'Dr: Intercompany Receivable - Tookitaki IN SGD Y | Cr: Management Fee Income SGD Y',
    gstTreatment: 'Import of services from associated enterprise: India entity must pay GST on Reverse Charge Mechanism (RCM) u/s 5(3) IGST Act. Rate: 18% standard. Debit RCM GST Payable AND simultaneously Debit RCM Input Credit (if eligible, net effect = zero for eligible businesses).',
    transferPricingMethod: 'Cost Plus Method (CPM) or TNMM. Key risk: CBDT challenges if markup is not documented.',
    whtTreatment: 'India entity must deduct WHT u/s 195 at 10% (India-Singapore DTAA FTS rate) on management fee payment. File Form 15CA/15CB. Net remittance = gross amount - 10% WHT.',
  },
  {
    scenario: 'IP licensing from SG parent to India entity',
    indiaEntry: 'Dr: Royalty / License Fee Expense ₹X | Cr: Intercompany Payable - Tookitaki Holding ₹X',
    sgEntry: 'Dr: Intercompany Receivable - Tookitaki IN | Cr: Royalty Income',
    gstTreatment: 'RCM applies: India entity pays 18% IGST on royalty under RCM. If IP is used for zero-rated exports, full ITC claimable.',
    transferPricingMethod: 'CUP or Profit Split. Royalty rate must be benchmarked vs market comparable IP licenses.',
    whtTreatment: 'WHT u/s 195: Royalties taxed at 10% under India-SG DTAA (lower than 25% domestic rate). Deduct before remitting. Form 15CA/15CB mandatory.',
  },
];

// India IT/SaaS benchmarks (BSE/NSE public filings + NASSCOM data)
const IN_BENCHMARKS = [
  { industry: 'IT Services India (listed)', grossMarginMedian: 0.32, payrollToRevenueMedian: 0.58, netMarginMedian: 0.16, corporateTaxRate: 0.25168, gstRate: 0.18, pfEmployerRate: 0.12, esiEmployerRate: 0.0325 },
  { industry: 'SaaS / FinTech India', grossMarginMedian: 0.55, payrollToRevenueMedian: 0.52, netMarginMedian: 0.08, corporateTaxRate: 0.25168, gstRate: 0.18, pfEmployerRate: 0.12, esiEmployerRate: 0.0325 },
  { industry: 'Enterprise Software India', grossMarginMedian: 0.62, payrollToRevenueMedian: 0.45, netMarginMedian: 0.14, corporateTaxRate: 0.25168, gstRate: 0.18, pfEmployerRate: 0.12, esiEmployerRate: 0.0325 },
];

// ============================================================================
// AGENT
// ============================================================================

export class AASINTrainerAgent extends BaseTrainingAgent {
  readonly name = 'aas-in-trainer';
  readonly version = '1.0.0';
  readonly description = 'India accounting trainer: GSTR-3B (IGST/CGST/SGST dual structure), TDS multi-section, IndAS CoA, Tookitaki intercompany TP, PF/ESI payroll';

  async fetch(): Promise<FetchResult> {
    this.log('FETCH', `Loading IN: ${IN_ACCOUNTS.length} IndAS accounts, GSTR-3B structure, ${IN_INTERCOMPANY_SCENARIOS.length} intercompany scenarios, ${IN_BENCHMARKS.length} benchmarks`);
    return {
      data: { accounts: IN_ACCOUNTS, gstr3bBoxes: IN_GSTR3B_BOXES, intercompany: IN_INTERCOMPANY_SCENARIOS, benchmarks: IN_BENCHMARKS },
      sources: ['gstn-gstr3b-india', 'icai-indas-coa', 'cbdt-tds-rates', 'epfo-esic-india', 'mca-tookitaki-technologies', 'bse-nse-it-benchmarks'],
      recordCount: IN_ACCOUNTS.length + IN_GSTR3B_BOXES.length + IN_INTERCOMPANY_SCENARIOS.length + IN_BENCHMARKS.length,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const { accounts, gstr3bBoxes, intercompany, benchmarks } = fetchResult.data;
    const signals: ConnectorSignal[] = [];
    const today = new Date().toISOString().substring(0, 10);

    // Account classification signals
    for (const acct of accounts) {
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'aas.finance',
        signal_type: 'acc_account_classification',
        signal_value: 1.0,
        signal_timestamp: today,
        entity_type: 'in_account',
        entity_id: `in_acct/${acct.name.replace(/\s/g, '_')}`,
        metadata: { accountName: acct.name, type: acct.type, normalBalance: acct.normalBalance, statement: acct.statement, rule: acct.rule, jurisdiction: 'in', source: 'icai_indas_cbdt' },
      });
    }

    // India GST dual structure signal — CRITICAL distinction from SG/AU/PH
    signals.push({
      organization_id: this.organizationId,
      source_domain: 'aas.finance',
      signal_type: 'acc_gst_output_tax_rate',
      signal_value: 0.18,
      signal_timestamp: today,
      entity_type: 'in_gst_rule',
      entity_id: 'in_gst/dual_structure',
      metadata: {
        jurisdiction: 'in',
        gstSlabs: [0, 0.05, 0.12, 0.18, 0.28],
        standardRateSaaS: 0.18,
        criticalRule: 'India GST is DUAL: Interstate supply → IGST (single rate, e.g. 18%). Intrastate supply → CGST + SGST (9% + 9% = 18%). NEVER use a single GST account for India — always split by IGST vs CGST+SGST based on customer state vs supplier state.',
        offsetRules: 'IGST credit can offset IGST, then CGST, then SGST. CGST credit offsets CGST then IGST only. SGST credit offsets SGST then IGST only. Cross-state offset CGST↔SGST NOT allowed.',
        source: 'gstn_cgst_act_2017',
      },
    });

    // India GST WITH input credit (unlike Malaysia SST)
    signals.push({
      organization_id: this.organizationId,
      source_domain: 'aas.finance',
      signal_type: 'acc_gst_input_tax_rate',
      signal_value: 0.18,
      signal_timestamp: today,
      entity_type: 'in_gst_rule',
      entity_id: 'in_gst/input_credit_available',
      metadata: { jurisdiction: 'in', rule: 'India GST: Input Tax Credit (ITC) IS available (unlike Malaysia SST). ITC conditions: valid invoice, goods/services received, GSTR-2B reconciliation, supplier filed GSTR-1. No ITC on: personal consumption, motor vehicles, food/beverages.', source: 'gstn_cgst_section_16' },
    });

    // TDS signals — unique to India (B2B payments are subject to withholding)
    const tdsRules = [
      { section: '194J', type: 'Professional Services', rate: 0.10, threshold: 30000 },
      { section: '194J', type: 'Technical/Contract Services', rate: 0.02, threshold: 30000 },
      { section: '194C', type: 'Contractor Payments', rate: 0.02, threshold: 100000 },
      { section: '194H', type: 'Commission/Brokerage', rate: 0.05, threshold: 15000 },
      { section: '195', type: 'Payments to Non-Resident (DTAA India-SG, FTS)', rate: 0.10, threshold: 0 },
    ];
    for (const tds of tdsRules) {
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'aas.finance',
        signal_type: 'acc_transaction_classification',
        signal_value: 1.0,
        signal_timestamp: today,
        entity_type: 'in_tds_rule',
        entity_id: `in_tds/sec_${tds.section}_${tds.type.replace(/\W/g, '_')}`,
        metadata: { jurisdiction: 'in', tdsSection: tds.section, paymentType: tds.type, tdsRate: tds.rate, thresholdINR: tds.threshold, journalEntry: `Dr: Expense (gross) | Cr: Cash/Payable (net) | Cr: TDS Payable - Sec ${tds.section} (${(tds.rate * 100).toFixed(0)}% of gross)`, source: 'cbdt_income_tax_act' },
      });
    }

    // Intercompany / Transfer Pricing signals
    for (const ic of intercompany) {
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'aas.finance',
        signal_type: 'acc_journal_entry_validity',
        signal_value: 1.0,
        signal_timestamp: today,
        entity_type: 'in_intercompany',
        entity_id: `in_ic/${ic.scenario.replace(/\s/g, '_').substring(0, 50)}`,
        metadata: { jurisdiction: 'in', scenario: ic.scenario, indiaJournalEntry: ic.indiaEntry, sgJournalEntry: ic.sgEntry, gstTreatment: ic.gstTreatment, transferPricingMethod: ic.transferPricingMethod, whtTreatment: ic.whtTreatment, tookitakiEntity: 'Tookitaki Technologies Private Limited', sgParent: 'Tookitaki Holding Pte. Ltd.', source: 'mca_filings_tp_regulations' },
      });
    }

    // PF/ESI payroll signals
    signals.push({
      organization_id: this.organizationId,
      source_domain: 'hr',
      signal_type: 'acc_transaction_classification',
      signal_value: 1.0,
      signal_timestamp: today,
      entity_type: 'in_payroll_rule',
      entity_id: 'in_payroll/pf_esi',
      metadata: { jurisdiction: 'in', pfEmployerRate: 0.12, pfEmployeePensionSplit: '8.33% EPS + 3.67% EPF', esiEmployerRate: 0.0325, esiEmployeeRate: 0.0075, esiApplicableBelow: 21000, journalEntry: 'Dr: Salaries Expense (gross) | Dr: PF Expense (12%) | Dr: ESI Expense (3.25%) | Cr: Cash/Bank (net pay) | Cr: Employee TDS Payable | Cr: PF Payable (employee 12% + employer 12%) | Cr: ESI Payable (total)', totalPayrollBurden: '~130% of gross salary (12% PF + 3.25% ESI + gratuity accrual 4.81%)', source: 'epfo_esic_2024' },
    });

    // Advance tax signals
    signals.push({
      organization_id: this.organizationId,
      source_domain: 'aas.finance',
      signal_type: 'acc_transaction_classification',
      signal_value: 1.0,
      signal_timestamp: today,
      entity_type: 'in_advance_tax',
      entity_id: 'in_tax/advance_tax_schedule',
      metadata: { jurisdiction: 'in', instalments: [{ dueDate: 'Jun 15', cumulativePercent: 0.15 }, { dueDate: 'Sep 15', cumulativePercent: 0.45 }, { dueDate: 'Dec 15', cumulativePercent: 0.75 }, { dueDate: 'Mar 15', cumulativePercent: 1.00 }], effectiveTaxRate: 0.25168, journalEntry: 'Dr: Advance Tax Paid (asset) | Cr: Bank. At year end: Dr: Income Tax Expense | Cr: Advance Tax Paid | Cr: Income Tax Payable (balance)', source: 'cbdt_section_208_211' },
    });

    // Benchmark signals
    for (const bench of benchmarks) {
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'aas.finance',
        signal_type: 'acc_gross_margin_ratio',
        signal_value: bench.grossMarginMedian,
        signal_timestamp: today,
        entity_type: 'in_benchmark',
        entity_id: `in_bench/${bench.industry.replace(/\s/g, '_')}`,
        metadata: { ...bench, source: 'bse_nse_nasscom_2023' },
      });
    }

    const packs: TrainingPack[] = [
      {
        id: 'aas-in-gst-dual-structure',
        title: 'India GST Dual Structure: IGST (Interstate) vs CGST+SGST (Intrastate)',
        source: 'GSTN GSTR-3B documentation. CGST Act 2017, IGST Act 2017. Public GSTN portal guides.',
        industry: 'Technology / FinTech India',
        domains: ['finance', 'legal'],
        confidence: 0.97,
        tags: ['in', 'gst', 'igst', 'cgst', 'sgst', 'gstr3b', 'aas', 'rw2'],
        causalChains: [{ source: 'aas.finance', target: 'legal', metric: 'acc_gst_net_payable', effectSize: 0.97, lagDays: 20, coefficientSign: 1 }],
        businessRules: [
          { title: 'India GST — Dual Structure: IGST vs CGST+SGST', entityType: 'transaction', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'in' }, { field: 'has_gst_transaction', operator: 'equals', value: true }] }, then: [{ type: 'set_flag', params: { flag: 'determine_supply_type_first', interstate_tax: 'IGST only', intrastate_tax: 'CGST 50% + SGST 50%', warning: 'NEVER use single GST Payable account for India' } }], naturalLanguage: 'India GST has a dual structure. ALWAYS determine supply type first: if customer and supplier are in different states → INTERSTATE → use IGST only. If same state → INTRASTATE → split equally into CGST + SGST. Never use a single "GST Payable" account in India. (CGST/IGST Act 2017)' },
          { title: 'India GST 18% on SaaS/Software Services', entityType: 'transaction', when: { logic: 'OR', conditions: [{ field: 'supply_type', operator: 'equals', value: 'software_services' }, { field: 'supply_type', operator: 'equals', value: 'saas' }] }, then: [{ type: 'set_flag', params: { gst_rate: 0.18, sac_code: '998314/998315', export_treatment: 'ZERO-RATED — file LUT, charge 0% GST, claim ITC on inputs' } }], naturalLanguage: 'SaaS and software services are taxed at 18% GST (SAC 998314/998315). Interstate: IGST 18%. Intrastate: CGST 9% + SGST 9%. Export of services to non-resident (e.g. SG parent): ZERO-RATED — file Letter of Undertaking (LUT) annually, charge 0% GST, and claim ITC on inputs used.' },
          { title: 'India ITC Offset Order (Mandatory Sequence)', entityType: 'gst_period', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'in' }, { field: 'has_itc', operator: 'equals', value: true }] }, then: [{ type: 'set_flag', params: { offset_sequence: 'IGST ITC: offset IGST first → then CGST → then SGST. CGST ITC: offset CGST first → then IGST (NOT SGST). SGST ITC: offset SGST first → then IGST (NOT CGST). Cross CGST↔SGST offset NOT permitted.', reference: 'CGST Rule 88A' } }], naturalLanguage: 'India ITC offset order is MANDATORY (cannot choose your own order): IGST credit offsets IGST→CGST→SGST; CGST credit offsets CGST→IGST (NOT SGST); SGST credit offsets SGST→IGST (NOT CGST). Cross-offset of CGST to SGST or SGST to CGST is PROHIBITED. (CGST Rule 88A)' },
          { title: 'India Import of Services — Reverse Charge Mechanism (RCM)', entityType: 'transaction', when: { logic: 'OR', conditions: [{ field: 'payment_to_non_resident', operator: 'equals', value: true }, { field: 'payment_to_associated_enterprise_abroad', operator: 'equals', value: true }] }, then: [{ type: 'set_flag', params: { rcm_rate: 0.18, payment_method: 'cash_ledger_only_cannot_use_itc', subsequent_itc_claimable: true, reference: 'IGST Act Section 5(3)' } }], naturalLanguage: 'Import of services from non-resident: India entity must self-assess GST at 18% and pay via cash ledger (ITC cannot be used to pay RCM). If the service is used for zero-rated exports, the RCM paid becomes claimable as ITC in the following period. (IGST Act Section 5(3))' },
        ],
        cascades: [],
        patterns: [{ name: 'India GST GSTR-3B Computation', domains: ['finance', 'legal'], description: `${IN_GSTR3B_BOXES.length} GSTR-3B boxes. IGST (interstate) + CGST/SGST (intrastate). SaaS at 18%. Export = zero-rated (LUT). ITC available (unlike MY SST). Offset order: IGST→IGST/CGST/SGST, CGST→CGST/IGST, SGST→SGST/IGST. RCM on import of services from SG parent.`, observed: IN_GSTR3B_BOXES.length, expected: IN_GSTR3B_BOXES.length, total: IN_GSTR3B_BOXES.length }],
        outcomes: [],
      } as unknown as TrainingPack,
      {
        id: 'aas-in-tookitaki-intercompany',
        title: 'Tookitaki India ↔ Singapore Intercompany: Transfer Pricing, WHT s.195, RCM GST',
        source: 'CBDT Transfer Pricing Regulations (Section 92-92F). Income Tax Act 1961 s.195. IGST Act RCM. India-Singapore DTAA.',
        industry: 'FinTech / RegTech India',
        domains: ['finance', 'legal'],
        confidence: 0.95,
        tags: ['in', 'tookitaki', 'intercompany', 'transfer-pricing', 'wht-195', 'rcm', 'aas', 'rw2'],
        causalChains: [{ source: 'aas.finance', target: 'legal', metric: 'acc_journal_entry_validity', effectSize: 0.95, lagDays: 30, coefficientSign: 1 }],
        businessRules: [
          { title: 'India→SG Dev Services Export (Zero-Rated GST)', entityType: 'intercompany_transaction', when: { logic: 'AND', conditions: [{ field: 'entity', operator: 'equals', value: 'tookitaki_in' }, { field: 'payment_from', operator: 'equals', value: 'tookitaki_sg' }, { field: 'service_type', operator: 'equals', value: 'software_development' }] }, then: [{ type: 'set_flag', params: { gst_treatment: 'zero_rated_export', journal: 'DR Intercompany Receivable | CR Revenue', lut_required: true, firc_required: true, gstr3b_box: '3.1(b)', sg_wht: 'none' } }], naturalLanguage: 'India entity (Tookitaki Tech) renders dev services to SG parent (Tookitaki Holding) → Export of services, zero-rated GST. DR Intercompany Receivable, CR Revenue. File LUT each year. Receive USD/SGD, file FIRC with bank. Report zero-rated supply in GSTR-3B Box 3.1(b). SG side does not withhold from India. (IGST zero-rated exports + LUT)' },
          { title: 'India Pays Management Fee to SG — WHT s.195 + RCM GST', entityType: 'intercompany_transaction', when: { logic: 'AND', conditions: [{ field: 'entity', operator: 'equals', value: 'tookitaki_in' }, { field: 'payment_to', operator: 'equals', value: 'tookitaki_sg' }, { field: 'payment_type', operator: 'equals', value: 'management_fees' }] }, then: [{ type: 'set_flag', params: { wht_rate_s195_dtaa: 0.10, rcm_gst_rate: 0.18, journal: 'DR Mgmt Fee Expense (gross) | CR IC Payable (net) | CR WHT Payable-s195 (10%) | CR RCM IGST Payable (18%)', form_15ca_15cb: 'required before remitting', itc_claimable: 'next month if used for taxable supplies' } }], naturalLanguage: 'India paying management fee to SG parent: Step 1 - Deduct WHT u/s 195 at 10% (India-SG DTAA FTS rate), file Form 15CA/15CB before remitting. Step 2 - Pay RCM GST at 18% IGST via cash ledger. Step 3 - Claim RCM IGST as ITC next month if service used for taxable supplies. Journal: DR Mgmt Fee Expense (gross) | CR IC Payable (net) | CR WHT Payable-s195 10% | CR RCM IGST Payable 18%.' },
          { title: 'Transfer Pricing — Form 3CEB Mandatory above ₹1 Crore', entityType: 'company', when: { logic: 'AND', conditions: [{ field: 'entity', operator: 'equals', value: 'tookitaki_in' }, { field: 'total_international_transactions_inr', operator: 'greater_than', value: 10000000 }] }, then: [{ type: 'trigger_alert', params: { severity: 'high', requirements: ['TP study (arm\'s length price documentation)', 'Form 3CEB (CA certification)', 'File with ITR'], primary_tp_method: 'TNMM for services', risk: 'CBDT adjustment → higher tax + 2-14% penalty' } }], naturalLanguage: 'If total international transactions with Tookitaki Holding (SG) exceed ₹1 Crore in a year, Transfer Pricing compliance is mandatory: (1) TP study documenting the arm\'s length price, (2) Form 3CEB certified by CA, (3) Filed with ITR. Use TNMM (Transactional Net Margin Method) as the primary TP method for services. CBDT can add back if TP adjustment made. (CBDT Section 92E + Form 3CEB)' },
        ],
        cascades: [],
        patterns: [{ name: 'Tookitaki IN-SG Intercompany Flows', domains: ['finance', 'legal'], description: `${IN_INTERCOMPANY_SCENARIOS.length} intercompany scenarios. India→SG: zero-rated export, no WHT from SG. SG→India: 10% WHT s.195 (DTAA FTS) + 18% RCM GST. Form 15CA/15CB for every outbound remittance. Form 3CEB if total IC txns >₹1 Cr.`, observed: IN_INTERCOMPANY_SCENARIOS.length, expected: IN_INTERCOMPANY_SCENARIOS.length, total: IN_INTERCOMPANY_SCENARIOS.length }],
        outcomes: [],
      } as unknown as TrainingPack,
    ];

    this.log('CONVERT', `Generated ${signals.length} signals + ${packs.length} packs`);
    return { signals, packs };
  }

  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const result: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };
    if (this.config.dryRun) {
      this.log('TRAIN', `[DRY RUN] ${signals.length} signals + ${packs.length} packs. Key: India GST DUAL (IGST vs CGST+SGST); TDS multi-section; Tookitaki IN↔SG intercompany (WHT s.195 + RCM).`);
      result.signalsStored = signals.length;
      result.packsProcessed = packs.length;
      return result;
    }
    const BATCH = 500;
    for (let i = 0; i < signals.length; i += BATCH) {
      try { await storeConnectorSignals(this.supabase, signals.slice(i, i + BATCH)); result.signalsStored += Math.min(BATCH, signals.length - i); } catch (e) { this.errors.push(String(e)); }
    }
    try {
      const r = await createBrainTrainer().trainBatch(this.supabase, this.organizationId, packs);
      result.packsProcessed = packs.length;
      result.discoveries = r?.causalEdgesLoaded ?? 0;
    } catch (e) { this.errors.push(String(e)); }
    try { await createScheduledJobs(this.supabase).runDailyCausalDiscovery(this.organizationId); } catch { }
    try {
      await this.supabase.from('agent_run_history').insert({ agent_name: this.name, agent_version: this.version, organization_id: this.organizationId, status: 'success', signals_stored: result.signalsStored, packs_processed: result.packsProcessed, discoveries: result.discoveries, run_mode: 'full', completed_at: new Date().toISOString() });
    } catch { }
    return result;
  }

  async validate(r: TrainResult): Promise<ValidationResult> {
    if (this.config.dryRun) return { passed: true, score: 1.0, issues: [] };
    const issues: string[] = [];
    if (r.packsProcessed < 2) issues.push(`Only ${r.packsProcessed} packs (expected 2)`);
    if (r.signalsStored < 15) issues.push(`Only ${r.signalsStored} signals`);
    return { passed: issues.length === 0, score: Math.min(1, r.signalsStored / 30), issues };
  }
}

globalRegistry.register({
  name: 'aas-in-trainer',
  description: 'India accounting: GSTR-3B dual GST (IGST/CGST/SGST), TDS multi-section (194C/194J/194H/195), Tookitaki IN↔SG intercompany TP + WHT + RCM, PF/ESI payroll, IndAS CoA',
  version: '1.0.0',
  factory: (config) => new AASINTrainerAgent(config),
  schedule: '0 4 * * 4', // Weekly Thursday 4 AM UTC
  resourceRequirements: { cpu: '512', memory: '2048' },
  tags: ['training', 'accounting', 'aas', 'india', 'gst', 'igst', 'tds', 'tookitaki', 'intercompany', 'rw2'],
});
