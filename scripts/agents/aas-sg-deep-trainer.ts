/**
 * AAS Singapore Deep Trainer
 *
 * Brain Region: Insula — SG-specific statutory accounting depth
 * RW1 fix: Covers what the base aas-trainer misses for the design partner (Tookitaki SG)
 *
 * Trains on:
 *   1. GST rate change history: 7% (pre-2023) → 8% (2023) → 9% (2024+)
 *      Source: IRAS public announcements — critical because real Xero GL has "GST 8%" entries
 *   2. ACRA XBRL taxonomy — SG-specific statutory accounts missing from FASB
 *      Source: https://www.acra.gov.sg/xbrl (+ hardcoded authoritative list)
 *   3. SFRS 16 lease accounting — Right-of-Use Asset + Lease Liability
 *      Source: IFRS 16 / SFRS(I) 16 standard (free PDF)
 *   4. SG Form C-S account mapping — which GL accounts feed each IRAS Form C-S box
 *      Source: IRAS Form C-S guide (public)
 *   5. SG-specific payroll accounts — CPF (employer + employee), SDL, FWL, IR8A
 *      Source: CPF Board contribution rates (public)
 *   6. Tookitaki intercompany — SG parent ↔ India subsidiary patterns
 *      Source: test data in accounting-agents.test.ts
 */

import {
  BaseTrainingAgent,
  type AgentConfig,
  type FetchResult,
  type ConvertResult,
  type TrainResult,
  type ValidationResult,
} from '../agent-framework/base-training-agent';
import { globalRegistry } from '../agent-framework/agent-registry';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import { SG_GST_RATE_HISTORY, getSGGSTRate } from './aas-trainer-fetcher';

// ============================================================================
// SG-SPECIFIC STATUTORY ACCOUNTS
// Source: ACRA XBRL taxonomy + IRAS guides + CPF Board (all public)
// These are MISSING from FASB GAAP taxonomy — Claude does not know them
// ============================================================================

const SG_STATUTORY_ACCOUNTS = [
  // ── CPF (Central Provident Fund) ──
  { name: 'Employer CPF', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', jurisdiction: 'sg', rule: 'Employer CPF contribution rate 17% (age ≤55). Debit Employer CPF Expense, Credit CPF Payable. Remit to CPF Board by 14th of following month.' },
  { name: 'Employee CPF', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_payroll', jurisdiction: 'sg', rule: 'Employee CPF withheld from salary. Deduct from Salaries and Wages payable, Credit Employee CPF Payable. Rate: 20% (age ≤55).' },
  { name: 'CPF Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', jurisdiction: 'sg', rule: 'Total CPF payable = Employer CPF (17%) + Employee CPF (20%) for employees aged ≤55. Remit by 14th following month.' },
  { name: 'Employer CPF Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', jurisdiction: 'sg', rule: 'P&L expense: employer CPF 17% of ordinary wages. Part of staff costs / operating expense.' },
  // ── Skills Development Levy (SDL) ──
  { name: 'Skills Development Levy', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', jurisdiction: 'sg', rule: 'SDL = 0.25% of monthly wages (min $2, max $11.25/employee). Debit SDL Expense, Credit SDL Payable. Remit monthly with CPF.' },
  { name: 'SDL Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', jurisdiction: 'sg', rule: 'SDL payable to SkillsFuture Singapore (SSG). Due with CPF contribution by 14th.' },
  // ── Foreign Worker Levy (FWL) ──
  { name: 'Foreign Worker Levy', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'payroll_statutory', jurisdiction: 'sg', rule: 'FWL applies to Work Permit/S Pass holders. Rates vary: S Pass basic $550/month, higher levy $650/month.' },
  { name: 'FWL Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_statutory', jurisdiction: 'sg', rule: 'FWL payable to MOM (Ministry of Manpower). Due monthly.' },
  // ── GST accounts (rate-aware) ──
  { name: 'GST Input Tax', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'current_asset', jurisdiction: 'sg', rule: 'GST claimable on business purchases. Rate was 7% (pre-2023), 8% (2023), 9% (2024+). Debit on purchase, offset against GST Output Tax in F5.' },
  { name: 'GST Output Tax', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability', jurisdiction: 'sg', rule: 'GST collected on taxable supplies. Rate was 7% (pre-2023), 8% (2023), 9% (2024+). Credit on sale, remit net to IRAS via F5 quarterly.' },
  { name: 'IRAS Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', jurisdiction: 'sg', rule: 'Net GST payable to IRAS = Output Tax - Input Tax. Also includes income tax payable to IRAS.' },
  // ── Withholding Tax ──
  { name: 'Withholding Tax Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', jurisdiction: 'sg', rule: 'WHT on payments to non-residents (management fees, royalties, interest). Rate 10-17% depending on payment type. File via IRAS myTax Portal.' },
  { name: 'Withholding Tax Expense', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'tax_expense', jurisdiction: 'sg', rule: 'WHT borne by payer (not deducted from payee). Debit WHT Expense, Credit WHT Payable. Common for SaaS paying AWS/Stripe/foreign SaaS vendors.' },
  // ── Stamp Duty ──
  { name: 'Stamp Duty Payable', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability_tax', jurisdiction: 'sg', rule: 'Stamp duty on lease agreements (0.4% of total rent), share transfers (0.2%), property purchase (1-4% BSD + ABSD). Due within 14 days.' },
  // ── SFRS 16 Lease ──
  { name: 'Right-of-Use Asset', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'fixed_asset', jurisdiction: 'sg', rule: 'SFRS(I) 16 / IFRS 16: Lessee recognises ROU asset for leases >12 months. Debit ROU Asset, Credit Lease Liability at lease commencement. Amortise over lease term.' },
  { name: 'Lease Liability', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'long_term_liability', jurisdiction: 'sg', rule: 'SFRS(I) 16: Lease liability = PV of future lease payments at commencement. Split into current (within 12 months) and non-current. Unwind interest to P&L.' },
  { name: 'Lease Liability - Current', type: 'liability' as const, normalBalance: 'credit' as const, statement: 'balance_sheet' as const, subtype: 'current_liability', jurisdiction: 'sg', rule: 'Current portion of lease liability due within 12 months. Reclassify from non-current annually.' },
  { name: 'Interest on Lease', type: 'expense' as const, normalBalance: 'debit' as const, statement: 'income_statement' as const, subtype: 'other_expense', jurisdiction: 'sg', rule: 'SFRS(I) 16: Interest expense unwound from Lease Liability using effective interest method. Separate line below operating income.' },
  // ── Intercompany (Tookitaki SG ↔ India) ──
  { name: 'Intercompany Receivable - India', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'current_asset', jurisdiction: 'sg', rule: 'Receivable from Tookitaki Technologies Pvt Ltd (India subsidiary). Debit on recharge to India, Credit on cash receipt. Eliminate on consolidation.' },
  { name: 'Advances to Subsidiary', type: 'asset' as const, normalBalance: 'debit' as const, statement: 'balance_sheet' as const, subtype: 'fixed_asset', jurisdiction: 'sg', rule: 'Long-term advances to India subsidiary. Non-current asset. Subject to impairment review under SFRS(I) 9.' },
  { name: 'Management Fee Income', type: 'revenue' as const, normalBalance: 'credit' as const, statement: 'income_statement' as const, subtype: 'other_income', jurisdiction: 'sg', rule: 'Management fee charged to India subsidiary for shared services (finance, HR, tech). Subject to transfer pricing rules. Withholding tax may apply in India.' },
  { name: 'Intercompany Recharge', type: 'revenue' as const, normalBalance: 'credit' as const, statement: 'income_statement' as const, subtype: 'other_income', jurisdiction: 'sg', rule: 'Cost recharge to India for shared expenses (AWS, payroll for shared staff). Must be at arm\'s length price (IRAS transfer pricing).' },
];

// Form C-S box mapping — which accounts feed which boxes
const FORM_CS_BOX_MAPPING = [
  { box: 'Box 1 - Trade and Other Revenue', accounts: ['Revenue', 'Subscription Revenue', 'SaaS Revenue', 'Consulting Revenue', 'Service Revenue', 'Management Fee Income', 'Intercompany Recharge'], notes: 'Gross revenue before tax. Exclude GST.' },
  { box: 'Box 2 - Cost of Revenue/COGS', accounts: ['Cost of Revenue', 'Cost of Goods Sold', 'Cloud Infrastructure', 'Hosting Costs'], notes: 'Direct costs of revenue generation.' },
  { box: 'Box 3 - Gross Profit', formula: 'Box 1 - Box 2', notes: 'Derived automatically.' },
  { box: 'Box 7 - Staff Costs', accounts: ['Salaries and Wages', 'Employer CPF Expense', 'Skills Development Levy', 'Foreign Worker Levy', 'Recruitment', 'Training'], notes: 'All staff-related expenses including statutory contributions.' },
  { box: 'Box 8 - Rental', accounts: ['Office Rent', 'Interest on Lease'], notes: 'Under SFRS 16, show lease payments and interest separately.' },
  { box: 'Box 15 - Other Expenses', accounts: ['Bank Charges', 'Withholding Tax Expense', 'Foreign Exchange Loss', 'Stamp Duty'], notes: 'Miscellaneous allowable expenses.' },
  { box: 'Box 16 - Net Profit/(Loss) before tax', formula: 'Box 3 - (Boxes 4-15)', notes: 'Profit before Singapore corporate income tax.' },
  { box: 'Box 20 - Capital Allowance', accounts: ['Accumulated Depreciation', 'Amortisation'], notes: 'IRAS capital allowance on qualifying plant & machinery under S19/S19A ITA.' },
];

// ============================================================================
// SG GST RATE CHANGE TRAINING SCENARIOS
// These teach the brain that a single GL can contain 3 different GST rates
// ============================================================================

interface GSTRateChangeScenario {
  id: string;
  period: string;
  gstRate: number;
  rateLabel: string;
  scenario: string;
  debitAccount: string;
  creditAccount: string;
  taxAmount: number;
  rule: string;
}

function buildGSTRateChangeScenarios(): GSTRateChangeScenario[] {
  return [
    // Historical 7% (pre-2023) — design partner GL has these from 2020-2022
    { id: 'gst7_2022_q4', period: '2022-12', gstRate: 0.07, rateLabel: 'GST 7%', scenario: 'Sale $100,000 + GST 7% = $107,000 invoice', debitAccount: 'Accounts Receivable', creditAccount: 'GST Output Tax', taxAmount: 7000, rule: 'Pre-2023: GST rate was 7%. Xero GL shows "GST 7%" in taxRateName column. Output tax = Invoice Amount × 7/107.' },
    { id: 'gst7_input_2022', period: '2022-12', gstRate: 0.07, rateLabel: 'GST 7%', scenario: 'AWS bill $20,000 + GST 7% = $21,400', debitAccount: 'GST Input Tax', creditAccount: 'Accounts Payable', taxAmount: 1400, rule: 'Pre-2023: Input tax claimable at 7%.' },
    // 8% year (2023) — transition year, may appear alongside 7% in same GL
    { id: 'gst8_2023_q1', period: '2023-01', gstRate: 0.08, rateLabel: 'GST 8%', scenario: 'Sale $100,000 + GST 8% = $108,000 invoice (new rate)', debitAccount: 'Accounts Receivable', creditAccount: 'GST Output Tax', taxAmount: 8000, rule: '2023: GST rate increased to 8% from 1 Jan 2023. IRAS required businesses to update all tax codes in accounting systems. Output tax = Amount × 8/108.' },
    { id: 'gst8_transition', period: '2022-12-31', gstRate: 0.07, rateLabel: 'GST 7%', scenario: 'Dec 2022 invoice still at 7%, Jan 2023 invoice at 8% — same GL', debitAccount: 'Accounts Receivable', creditAccount: 'GST Output Tax', taxAmount: 7000, rule: 'Rate change on 1 Jan 2023. Invoices with tax date ≤31 Dec 2022 use 7%. Invoices with tax date ≥1 Jan 2023 use 8%. Mixed rates appear in same Xero GL export.' },
    // Current 9% (2024+)
    { id: 'gst9_2024_q1', period: '2024-01', gstRate: 0.09, rateLabel: 'GST 9%', scenario: 'Sale $100,000 + GST 9% = $109,000 invoice', debitAccount: 'Accounts Receivable', creditAccount: 'GST Output Tax', taxAmount: 9000, rule: '2024+: GST rate increased to 9% from 1 Jan 2024. Current rate. Output tax = Amount × 9/109.' },
    // Reverse charge at each rate
    { id: 'gst9_reverse_2024', period: '2024-06', gstRate: 0.09, rateLabel: 'GST 9% RC', scenario: 'AWS imported services $10,000 — reverse charge 9%', debitAccount: 'GST Input Tax', creditAccount: 'GST Output Tax', taxAmount: 900, rule: '2024: Imported services reverse charge at 9%. Self-assess: both DR GST Input Tax 9% AND CR GST Output Tax 9%. Net = $0 for fully-registered business.' },
  ];
}

// ============================================================================
// AAS SG DEEP TRAINER AGENT
// ============================================================================

export class AASSGDeepTrainerAgent extends BaseTrainingAgent {
  readonly name = 'aas-sg-deep-trainer';
  readonly version = '1.0.0';
  readonly description = 'Singapore deep accounting trainer: GST rate history (7%/8%/9%), ACRA statutory accounts, SFRS 16 leases, Form C-S mapping, CPF/SDL/FWL, intercompany SG↔India';

  async fetch(): Promise<FetchResult> {
    this.log('FETCH', 'Loading SG statutory accounts, GST rate history, SFRS 16, Form C-S data (all hardcoded — IRAS/ACRA/CPF Board public sources)');
    const gstScenarios = buildGSTRateChangeScenarios();
    return {
      data: { gstScenarios, statutoryAccounts: SG_STATUTORY_ACCOUNTS, formCSMapping: FORM_CS_BOX_MAPPING, gstRateHistory: SG_GST_RATE_HISTORY },
      sources: ['iras-gst-rate-change', 'acra-xbrl-taxonomy', 'sfrs16-standard', 'iras-form-cs', 'cpf-board-rates'],
      recordCount: SG_STATUTORY_ACCOUNTS.length + gstScenarios.length + FORM_CS_BOX_MAPPING.length,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const { gstScenarios, statutoryAccounts, formCSMapping, gstRateHistory } = fetchResult.data;
    const signals: ConnectorSignal[] = [];
    const today = new Date().toISOString().substring(0, 10);

    // ── GST Rate History Signals ──
    for (const rate of gstRateHistory) {
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'aas.finance',
        signal_type: 'acc_gst_output_tax_rate',
        signal_value: rate.rate,
        signal_timestamp: rate.effectiveFrom,
        entity_type: 'gst_rate_period',
        entity_id: `sg_gst_rate/${rate.rateLabel.replace(' ', '_')}`,
        metadata: { jurisdiction: 'sg', rate: rate.rate, rateLabel: rate.rateLabel, effectiveFrom: rate.effectiveFrom, effectiveTo: rate.effectiveTo, announcement: rate.irasAnnouncement, rule: `SG GST rate ${(rate.rate * 100).toFixed(0)}% applies to transactions dated ${rate.effectiveFrom} to ${rate.effectiveTo ?? 'present'}. Xero taxRateName field shows "${rate.rateLabel}".`, source: 'iras_gst_rate_change_announcement' },
      });
    }

    // GST transition signal (rate change on same GL)
    signals.push({
      organization_id: this.organizationId,
      source_domain: 'aas.finance',
      signal_type: 'acc_gst_output_tax_rate',
      signal_value: 0.09,
      signal_timestamp: today,
      entity_type: 'gst_rate_rule',
      entity_id: 'sg_gst_rate/multi_rate_gl',
      metadata: { rule: 'A single Xero GL export spanning multiple years will contain mixed GST rate labels: "GST 7%", "GST 8%", "GST 9%". Always use the taxRateName field from the GL to determine the actual rate — do not assume a single rate. Output tax = amount × rate/(1+rate) (tax-inclusive) or amount × rate (tax-exclusive).', source: 'iras_gst_rate_change', jurisdiction: 'sg' },
    });

    // ── GST Rate Change Scenario Signals ──
    for (const s of gstScenarios) {
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'aas.finance',
        signal_type: 'acc_gst_output_tax_rate',
        signal_value: s.gstRate,
        signal_timestamp: `${s.period}-15`,
        entity_type: 'gst_scenario',
        entity_id: `gst_scenario/${s.id}`,
        metadata: { ...s, source: 'iras_gst_rate_change' },
      });
    }

    // ── Statutory Account Signals ──
    for (const acct of statutoryAccounts) {
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'aas.finance',
        signal_type: 'acc_account_classification',
        signal_value: 1.0,
        signal_timestamp: today,
        entity_type: 'sg_statutory_account',
        entity_id: `sg_acct/${acct.name.replace(/\s/g, '_')}`,
        metadata: { accountName: acct.name, type: acct.type, normalBalance: acct.normalBalance, statement: acct.statement, subtype: acct.subtype, jurisdiction: acct.jurisdiction, rule: acct.rule, source: 'acra_xbrl_taxonomy_iras_cpfboard' },
      });
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'aas.finance',
        signal_type: 'acc_debit_credit_normal',
        signal_value: acct.normalBalance === 'debit' ? 1.0 : -1.0,
        signal_timestamp: today,
        entity_type: 'sg_statutory_account',
        entity_id: `sg_acct/${acct.name.replace(/\s/g, '_')}`,
        metadata: { accountName: acct.name, normalBalance: acct.normalBalance, rule: acct.rule, source: 'acra_xbrl_taxonomy' },
      });
    }

    // ── Form C-S Mapping Signals ──
    for (const box of formCSMapping) {
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'aas.finance',
        signal_type: 'acc_revenue_recognition',
        signal_value: 1.0,
        signal_timestamp: today,
        entity_type: 'form_cs_box',
        entity_id: `form_cs/${box.box.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`,
        metadata: { box: box.box, accounts: (box as any).accounts || [], formula: (box as any).formula, notes: box.notes, source: 'iras_form_cs_guide_sg' },
      });
    }

    // ── Training Packs ──
    const packs: TrainingPack[] = [
      {
        id: 'aas-sg-gst-rate-history',
        title: 'Singapore GST Rate History (7% → 8% → 9%)',
        source: 'IRAS GST rate change announcements (2022, 2023). 6 rate change scenarios + multi-rate GL rule.',
        industry: 'Technology / SaaS Singapore',
        domains: ['finance', 'legal'],
        confidence: 0.99,
        tags: ['sg', 'gst', 'rate-change', 'iras', 'aas', 'rw1'],
        causalChains: [{ source: 'aas.finance', target: 'legal', metric: 'acc_gst_output_tax_rate', effectSize: 0.99, lagDays: 0, coefficientSign: 1 }],
        businessRules: [
          { title: 'SG GST 7% — Pre-2023', entityType: 'transaction', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'sg' }, { field: 'transaction_date', operator: 'less_than', value: '2023-01-01' }] }, then: [{ type: 'set_flag', params: { gst_rate: 0.07, formula_exclusive: 'amount × 0.07', formula_inclusive: 'amount × 7/107', xero_tax_rate_name: 'GST 7%' } }], naturalLanguage: 'SG GST rate was 7% before 1 January 2023. For transactions before this date, apply 7%. Xero taxRateName = "GST 7%". (IRAS GST announcement 2002)' },
          { title: 'SG GST 8% — Full Year 2023', entityType: 'transaction', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'sg' }, { field: 'transaction_date', operator: 'greater_than_or_equal', value: '2023-01-01' }, { field: 'transaction_date', operator: 'less_than', value: '2024-01-01' }] }, then: [{ type: 'set_flag', params: { gst_rate: 0.08, formula_exclusive: 'amount × 0.08', formula_inclusive: 'amount × 8/108', xero_tax_rate_name: 'GST 8%' } }], naturalLanguage: 'SG GST was raised to 8% on 1 January 2023 (full year 2023). For transactions in 2023, apply 8%. (IRAS November 2022 announcement)' },
          { title: 'SG GST 9% — Current Rate (2024+)', entityType: 'transaction', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'sg' }, { field: 'transaction_date', operator: 'greater_than_or_equal', value: '2024-01-01' }] }, then: [{ type: 'set_flag', params: { gst_rate: 0.09, formula_exclusive: 'amount × 0.09', formula_inclusive: 'amount × 9/109', xero_tax_rate_name: 'GST 9%' } }], naturalLanguage: 'SG GST was raised to 9% on 1 January 2024. This is the current rate. For all 2024+ transactions, apply 9%. (IRAS November 2023 announcement)' },
          { title: 'Multi-Rate GST — Read Row-Level Rate from Xero GL', entityType: 'gl_transaction', when: { logic: 'AND', conditions: [{ field: 'xero_gl_multi_year', operator: 'equals', value: true }] }, then: [{ type: 'set_flag', params: { flag: 'row_level_gst_rate_required', warning: 'Do not assume single rate for multi-year GL — read taxRateName from each row' } }], naturalLanguage: 'CRITICAL: A Xero GL spanning multiple years (e.g. 2020-2026) will contain "GST 7%", "GST 8%", AND "GST 9%" rows. ALWAYS read the taxRateName from each individual GL row. Never assume a single GST rate applies to the entire GL. The design partner GL spans 2020-2026 and contains all 3 rates.' },
        ],
        cascades: [],
        patterns: [{ name: 'SG GST Rate Change History', domains: ['finance'], description: '3 GST rate periods: 7% (pre-2023, ~15 years), 8% (2023, 1 year), 9% (2024+, current). The design partner Xero GL spans 2020-2026 and contains all 3 rates. Incorrectly applying a single rate corrupts Trial Balance and GST F5 computation.', observed: 6, expected: 6, total: 6 }],
        outcomes: [],
      } as unknown as TrainingPack,

      {
        id: 'aas-sg-statutory-accounts',
        title: 'Singapore Statutory Accounts (CPF, SDL, FWL, WHT, SFRS 16)',
        source: `ACRA XBRL taxonomy + IRAS guides + CPF Board. ${SG_STATUTORY_ACCOUNTS.length} SG-specific accounts.`,
        industry: 'Technology / SaaS Singapore',
        domains: ['finance', 'legal', 'hr'],
        confidence: 0.97,
        tags: ['sg', 'cpf', 'sdl', 'fwl', 'sfrs16', 'acra', 'aas', 'rw1'],
        causalChains: [
          { source: 'aas.finance', target: 'hr', metric: 'acc_opex_ratio', effectSize: 0.82, lagDays: 0, coefficientSign: -1 },
          { source: 'aas.finance', target: 'legal', metric: 'acc_gst_net_payable', effectSize: 0.90, lagDays: 30, coefficientSign: 1 },
        ],
        businessRules: [
          { title: 'CPF Employer Contribution (SG)', entityType: 'payroll_transaction', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'sg' }, { field: 'employee_age', operator: 'less_than_or_equal', value: 55 }] }, then: [{ type: 'set_flag', params: { employer_cpf_rate: 0.17, ow_cap_sgd: 6800, journal: 'DR Employer CPF Expense, CR CPF Payable', due: '14th of following month' } }], naturalLanguage: 'SG Employer CPF contribution = 17% of ordinary wages (OW) for employees aged ≤55. OW cap S$6,800/month (2024). Journal: DR Employer CPF Expense, CR CPF Payable. Remit to CPF Board by 14th of following month. (CPF Board contribution rates 2024)' },
          { title: 'Skills Development Levy (SDL)', entityType: 'payroll_transaction', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'sg' }, { field: 'has_employees', operator: 'equals', value: true }] }, then: [{ type: 'set_flag', params: { sdl_rate: 0.0025, sdl_min_sgd: 2, sdl_max_sgd: 11.25, journal: 'DR SDL Expense, CR SDL Payable', due: '14th of following month with CPF' } }], naturalLanguage: 'SDL = 0.25% of monthly wages per employee. Minimum S$2, maximum S$11.25 per employee per month. Journal: DR SDL Expense, CR SDL Payable. Remit together with CPF by 14th. (SkillsFuture SDL guide)' },
          { title: 'SFRS 16 Lease Accounting — ROU Asset Recognition', entityType: 'lease', when: { logic: 'AND', conditions: [{ field: 'lease_term_months', operator: 'greater_than', value: 12 }, { field: 'is_short_term_lease_election', operator: 'equals', value: false }] }, then: [{ type: 'set_flag', params: { action: 'recognise_rou_asset_and_lease_liability', measurement: 'PV of lease payments', amortise_rou: 'straight-line over lease term', interest_unwind: 'effective interest rate on lease liability' } }], naturalLanguage: 'Under SFRS 16, leases >12 months must be capitalised. Recognise: (1) ROU Asset = PV of future lease payments + initial direct costs; (2) Lease Liability = same PV. Amortise ROU asset straight-line. Unwind lease liability interest to P&L. Prior "operating lease" expense is now split into depreciation + interest. (SFRS I-16)' },
          { title: 'Withholding Tax on Overseas Payments (SG)', entityType: 'transaction', when: { logic: 'AND', conditions: [{ field: 'payment_to_non_resident', operator: 'equals', value: true }, { field: 'payment_type', operator: 'in', value: ['management_fee', 'royalty', 'interest', 'service_fee'] }] }, then: [{ type: 'set_flag', params: { wht_rates: { management_fee: 0.17, royalty: 0.10, interest: 0.15 }, journal: 'DR WHT Expense (if payer bears), CR WHT Payable', filing: 'Form IR37 within 1 month of payment' } }], naturalLanguage: 'SG withholding tax on payments to non-residents: management fees 17%, royalties 10%, interest 15% (may be reduced by tax treaty). File Form IR37 with IRAS within 1 month of payment date. If the payer bears the WHT: DR WHT Expense, CR WHT Payable. (IRAS WHT guide)' },
        ],
        cascades: [{ source: 'aas.finance', target: 'legal', type: 'triggers', severity: 'critical', keywords: { source: ['cpf_payable', 'overdue', 'late_remittance'], target: ['iras_late_payment_penalty', 'cpf_board_prosecution'] }, reasonTemplate: 'CPF Payable overdue — late payment penalty and CPF Board prosecution risk' }],
        patterns: [{ name: 'SG Statutory Account Structure', domains: ['finance', 'hr'], description: `${SG_STATUTORY_ACCOUNTS.length} SG-specific accounts absent from FASB GAAP taxonomy. Key groups: CPF (employer+employee), SDL, FWL (foreign workers), Withholding Tax, SFRS 16 lease accounts, Intercompany (SG↔India). These appear in every Singapore company GL.`, observed: SG_STATUTORY_ACCOUNTS.length, expected: SG_STATUTORY_ACCOUNTS.length, total: SG_STATUTORY_ACCOUNTS.length }],
        outcomes: [],
      } as unknown as TrainingPack,

      {
        id: 'aas-sg-form-cs',
        title: 'Singapore Form C-S Account Mapping (IRAS)',
        source: `IRAS Form C-S guide. ${FORM_CS_BOX_MAPPING.length} box mappings.`,
        industry: 'Technology / SaaS Singapore',
        domains: ['finance', 'legal'],
        confidence: 0.95,
        tags: ['sg', 'form-cs', 'iras', 'corporate-tax', 'aas', 'rw2'],
        causalChains: [{ source: 'aas.finance', target: 'legal', metric: 'acc_net_profit_margin', effectSize: 0.90, lagDays: 90, coefficientSign: 1 }],
        businessRules: [
          { title: 'SG Form C-S Eligibility (Simplified Corporate Tax Return)', entityType: 'company', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'sg' }, { field: 'annual_revenue_sgd', operator: 'less_than_or_equal', value: 5000000 }, { field: 'capital_allowance_claim_over_100k', operator: 'equals', value: false }] }, then: [{ type: 'set_flag', params: { form: 'Form C-S (simplified)', due_date: '30 Nov each year', note: 'No financial statements required — key income/expense figures only' } }], naturalLanguage: 'SG companies with revenue ≤S$5M and not claiming capital allowances >S$100K can file Form C-S (simplified) instead of Form C. Due 30 November annually. No need to attach full financial statements. (IRAS Form C-S guide)' },
          { title: 'SG Corporate Tax Rate 17%', entityType: 'company', when: { logic: 'AND', conditions: [{ field: 'jurisdiction', operator: 'equals', value: 'sg' }, { field: 'year_of_assessment', operator: 'greater_than_or_equal', value: 2010 }] }, then: [{ type: 'set_flag', params: { corporate_tax_rate: 0.17, sme_rebate: '40% on first S$100,000 chargeable income (2024)', note: 'Effective rate for SMEs may be significantly lower after rebate' } }], naturalLanguage: 'Singapore corporate income tax rate is 17% flat (since YA 2010). SMEs benefit from 40% tax rebate on the first S$100,000 of chargeable income in 2024, reducing the effective rate. (IRAS corporate tax guide)' },
        ],
        cascades: [],
        patterns: [{ name: 'Form C-S Filing Structure', domains: ['finance', 'legal'], description: `${FORM_CS_BOX_MAPPING.length} Form C-S boxes mapped to GL accounts. Key: Box 1 Revenue (exclude GST), Box 7 Staff Costs (include CPF/SDL), Box 16 Net Profit (= taxable income before adjustments). NexusBrain can auto-populate Form C-S from Trial Balance.`, observed: FORM_CS_BOX_MAPPING.length, expected: FORM_CS_BOX_MAPPING.length, total: FORM_CS_BOX_MAPPING.length }],
        outcomes: [],
      } as unknown as TrainingPack,
    ];

    this.log('CONVERT', `Generated ${signals.length} signals + ${packs.length} training packs`);
    return { signals, packs };
  }

  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const result: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };
    if (this.config.dryRun) {
      this.log('TRAIN', `[DRY RUN] Would store ${signals.length} signals + ${packs.length} packs`);
      this.log('TRAIN', `[DRY RUN] Packs: ${packs.map(p => p.id).join(', ')}`);
      result.signalsStored = signals.length; result.packsProcessed = packs.length; return result;
    }
    const BATCH_SIZE = 500;
    for (let i = 0; i < signals.length; i += BATCH_SIZE) {
      try { await storeConnectorSignals(this.supabase, signals.slice(i, i + BATCH_SIZE)); result.signalsStored += Math.min(BATCH_SIZE, signals.length - i); } catch (err) { this.errors.push(`Batch failed: ${err}`); }
    }
    try { const trainer = createBrainTrainer(); const r = await trainer.trainBatch(this.supabase, this.organizationId, packs); result.packsProcessed = packs.length; result.discoveries = r?.causalEdgesLoaded ?? 0; } catch (err) { this.errors.push(`Brain trainer: ${err}`); }
    try { await createScheduledJobs(this.supabase).runDailyCausalDiscovery(this.organizationId); } catch { /* non-fatal */ }
    try { await this.supabase.from('agent_run_history').insert({ agent_name: this.name, agent_version: this.version, organization_id: this.organizationId, status: 'success', signals_stored: result.signalsStored, packs_processed: result.packsProcessed, discoveries: result.discoveries, run_mode: 'full', completed_at: new Date().toISOString() }); } catch { /* non-fatal */ }
    return result;
  }

  async validate(result: TrainResult): Promise<ValidationResult> {
    if (this.config.dryRun) return { passed: true, score: 1.0, issues: [] };
    const issues: string[] = [];
    if (result.packsProcessed < 3) issues.push(`Only ${result.packsProcessed}/3 packs`);
    if (result.signalsStored < 20) issues.push(`Only ${result.signalsStored} signals`);
    return { passed: issues.length === 0, score: Math.min(1, result.signalsStored / 50), issues };
  }
}

// ── Self-register ──
globalRegistry.register({
  name: 'aas-sg-deep-trainer',
  description: 'SG deep accounting: GST 7%/8%/9% history, ACRA statutory accounts (CPF/SDL/FWL/WHT), SFRS 16 leases, Form C-S mapping, SG↔India intercompany',
  version: '1.0.0',
  factory: (config) => new AASSGDeepTrainerAgent(config),
  schedule: '0 3 * * 1', // Weekly Monday 3 AM UTC (after daily aas-trainer)
  resourceRequirements: { cpu: '512', memory: '2048' },
  tags: ['training', 'accounting', 'aas', 'singapore', 'gst', 'cpf', 'sfrs16', 'rw1'],
});
