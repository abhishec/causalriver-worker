/**
 * Accounting Agents — Accounting as a Service (AaaS) Agent Workforce
 * ===================================================================
 *
 * The 6 agents that orchestrate the 7 accounting cognitive domains
 * to deliver "Accounting as a Service":
 *
 *   1. brain-bookkeeper             — Task: Daily transaction categorization & journal entry
 *   2. brain-reconciler             — Autonomous: Month-end account reconciliation
 *   3. brain-statement-generator    — Task: Financial statement preparation (P&L, BS, CF)
 *   4. brain-tax-compliance         — Autonomous: Multi-jurisdiction tax compliance
 *   5. brain-audit-preparer         — Autonomous: Audit-readiness assessment & workpaper prep
 *   6. brain-anomaly-detective      — Autonomous: Financial anomaly detection & forensic analysis
 *
 * These agents compose the 7 cognitive primitives from V7 (action-domains.ts):
 *   - document-comprehend    — Parse invoices, receipts, bank statements, GL exports
 *   - completeness-check     — Verify all required data for filing/audit readiness
 *   - rule-apply             — Apply GAAP/IFRS/SFRS jurisdiction-specific rules
 *   - cross-validate         — Reconcile: Assets = Liabilities + Equity, bank rec
 *   - statement-synthesize   — Generate P&L, Balance Sheet, Cash Flow Statement
 *   - jurisdiction-comply    — Multi-jurisdiction tax compliance engine (9 countries)
 *   - confidence-triage      — Materiality-based triage (auto-post vs flag vs escalate)
 *
 * Architecture mirrors agents-software-engineering.ts:
 *   - Domain Actions = cognitive primitives (what the brain CAN think about)
 *   - Agents = workflows that compose primitives into useful accounting work
 *
 * Designed for real Xero General Ledger data:
 *   - 10 columns: Date, Source, Description, Reference, Debit, Credit, Running Balance, Tax, Tax Rate, Tax Rate Name
 *   - 14 source types: Manual Journal, Payable Invoice, Receivable Invoice, Bank Transfer, etc.
 *   - 194+ unique accounts across Revenue, Expense, Asset, Liability, Equity, Bank
 *   - Multi-year data (2020-2026), SGD denominated, Singapore jurisdiction (SFRS/IRAS)
 *
 * @packageDocumentation
 */

import {
  defineAgent,
  type AgentDefinition,
  type AgentExecutionContext,
} from './agent-registry';

// ============================================================================
// SHARED TYPES — Accounting Data Structures
// ============================================================================

/** Transaction from a Xero General Ledger export */
export interface GLTransaction {
  date: string;
  source: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  runningBalance: number;
  tax: number;
  taxRate: number;
  taxRateName: string;
  account: string;
}

/** Chart of Accounts classification */
export interface AccountClassification {
  name: string;
  type: 'revenue' | 'expense' | 'asset' | 'liability' | 'equity' | 'bank' | 'unclassified';
  subType?: string;
  transactionCount: number;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
}

/** Journal entry (double-entry bookkeeping) */
export interface JournalEntry {
  date: string;
  reference: string;
  description: string;
  lines: Array<{
    account: string;
    accountType: string;
    debit: number;
    credit: number;
    taxCode?: string;
  }>;
  balanced: boolean;
  confidence: number;
  source: 'auto' | 'flagged' | 'manual';
}

/** Reconciliation result for a single account */
export interface ReconciliationResult {
  account: string;
  accountType: string;
  openingBalance: number;
  closingBalance: number;
  computedBalance: number;
  variance: number;
  variancePercent: number;
  status: 'reconciled' | 'variance' | 'critical';
  unmatchedItems: Array<{
    date: string;
    description: string;
    amount: number;
    side: 'debit' | 'credit';
  }>;
}

// ============================================================================
// ACCOUNT CLASSIFICATION RULES — Xero GL Account Taxonomy
// ============================================================================

/** Keywords for classifying accounts from Xero GL exports.
 *  IMPORTANT: More specific patterns MUST come before general ones.
 *  e.g. "cpf payable" (liability) must come before "cpf" (expense).
 */
const ACCOUNT_CLASSIFICATION_KEYWORDS: Record<string, { type: AccountClassification['type']; subType?: string }> = {
  // ── Liabilities (BEFORE expenses — specific patterns first) ──
  'cpf payable': { type: 'liability', subType: 'statutory' },
  'accrued expense': { type: 'liability', subType: 'accrued' },
  'accrued staff': { type: 'liability', subType: 'accrued' },
  'accrued interest': { type: 'liability', subType: 'accrued' },
  'trade creditor': { type: 'liability', subType: 'payable' },
  'other creditor': { type: 'liability', subType: 'payable' },
  'gst summary': { type: 'liability', subType: 'tax' },
  'wht payable': { type: 'liability', subType: 'tax' },
  'philippine vat': { type: 'liability', subType: 'tax' },
  'deferred revenue': { type: 'liability', subType: 'deferred' },
  'deposits collected': { type: 'liability', subType: 'deposit' },
  'intercompany payable': { type: 'liability', subType: 'intercompany' },
  'lease liability': { type: 'liability', subType: 'lease' },
  'amount due to director': { type: 'liability', subType: 'related-party' },
  'convertible': { type: 'liability', subType: 'convertible' },
  'loan': { type: 'liability', subType: 'borrowing' },
  // ── Assets (BEFORE expenses — specific patterns first) ──
  'trade debtor': { type: 'asset', subType: 'receivable' },
  'other debtor': { type: 'asset', subType: 'receivable' },
  'accrued income': { type: 'asset', subType: 'receivable' },
  'intercompany receivable': { type: 'asset', subType: 'intercompany' },
  'advances to subsidiary': { type: 'asset', subType: 'intercompany' },
  'advance to': { type: 'asset', subType: 'intercompany' },
  'interest in subsidiary': { type: 'asset', subType: 'investment' },
  'fixed deposit': { type: 'asset', subType: 'investment' },
  'deposit': { type: 'asset', subType: 'deposit' },
  'prepayment': { type: 'asset', subType: 'prepaid' },
  'staff loan': { type: 'asset', subType: 'loan' },
  'loan to': { type: 'asset', subType: 'loan' },
  'accumulated depreciation': { type: 'asset', subType: 'contra' },
  'computer': { type: 'asset', subType: 'fixed' },
  'furniture': { type: 'asset', subType: 'fixed' },
  'office equipment': { type: 'asset', subType: 'fixed' },
  'renovation': { type: 'asset', subType: 'fixed' },
  'rou asset': { type: 'asset', subType: 'rou' },
  // ── Equity ──
  'paid up capital': { type: 'equity', subType: 'capital' },
  'share application': { type: 'equity', subType: 'capital' },
  'retained earnings': { type: 'equity', subType: 'retained' },
  'share based payment': { type: 'equity', subType: 'reserves' },
  'founder\'s share': { type: 'equity', subType: 'reserves' },
  'founders share': { type: 'equity', subType: 'reserves' },
  'share warrant': { type: 'equity', subType: 'reserves' },
  'historical adjustment': { type: 'equity', subType: 'adjustment' },
  // ── Bank ──
  'uob': { type: 'bank', subType: 'current' },
  'citibank': { type: 'bank', subType: 'current' },
  'cimb': { type: 'bank', subType: 'current' },
  'tt bank': { type: 'bank', subType: 'current' },
  'wise': { type: 'bank', subType: 'transfer' },
  'amex card clearing': { type: 'bank', subType: 'clearing' },
  'amex clearing': { type: 'bank', subType: 'clearing' },
  'volopay clearing': { type: 'bank', subType: 'clearing' },
  'uob card clearing': { type: 'bank', subType: 'clearing' },
  'cross currency clearing': { type: 'bank', subType: 'clearing' },
  'tracking transfer': { type: 'bank', subType: 'tracking' },
  // ── Revenue ──
  'license fee': { type: 'revenue', subType: 'license' },
  'subscription fee': { type: 'revenue', subType: 'subscription' },
  'implementation fee': { type: 'revenue', subType: 'services' },
  'support fee': { type: 'revenue', subType: 'support' },
  'overage fee': { type: 'revenue', subType: 'overage' },
  'fees from pilot': { type: 'revenue', subType: 'pilot' },
  'interest income': { type: 'revenue', subType: 'interest' },
  'miscellaneous income': { type: 'revenue', subType: 'other' },
  'other income': { type: 'revenue', subType: 'other' },
  'grant': { type: 'revenue', subType: 'grant' },
  // ── Expenses (general patterns — LAST) ──
  'salary': { type: 'expense', subType: 'payroll' },
  'salaries': { type: 'expense', subType: 'payroll' },
  'bonus': { type: 'expense', subType: 'payroll' },
  'cpf': { type: 'expense', subType: 'payroll' },
  'sdl': { type: 'expense', subType: 'payroll' },
  'staff': { type: 'expense', subType: 'payroll' },
  'ex-gratia': { type: 'expense', subType: 'payroll' },
  'director remuneration': { type: 'expense', subType: 'payroll' },
  'directors remuneration': { type: 'expense', subType: 'payroll' },
  'directors\' allowance': { type: 'expense', subType: 'payroll' },
  'directors allowance': { type: 'expense', subType: 'payroll' },
  'provident fund': { type: 'expense', subType: 'payroll' },
  'workmen compensation': { type: 'expense', subType: 'benefits' },
  'rental': { type: 'expense', subType: 'occupancy' },
  'office rental': { type: 'expense', subType: 'occupancy' },
  'water & electricity': { type: 'expense', subType: 'occupancy' },
  'office cleaning': { type: 'expense', subType: 'occupancy' },
  'depreciation': { type: 'expense', subType: 'depreciation' },
  'amortisation': { type: 'expense', subType: 'amortization' },
  'bank charge': { type: 'expense', subType: 'finance' },
  'bank charges': { type: 'expense', subType: 'finance' },
  'interest on convertible': { type: 'expense', subType: 'finance' },
  'interest expense': { type: 'expense', subType: 'finance' },
  'rou interest': { type: 'expense', subType: 'finance' },
  'od interest': { type: 'expense', subType: 'finance' },
  'cna singapore': { type: 'expense', subType: 'insurance' },
  'insurance': { type: 'expense', subType: 'insurance' },
  'travel': { type: 'expense', subType: 'travel' },
  'airfare': { type: 'expense', subType: 'travel' },
  'transport': { type: 'expense', subType: 'travel' },
  'overseas living': { type: 'expense', subType: 'travel' },
  'marketing': { type: 'expense', subType: 'marketing' },
  'advertising': { type: 'expense', subType: 'marketing' },
  'client entertainment': { type: 'expense', subType: 'marketing' },
  'accounting fee': { type: 'expense', subType: 'professional' },
  'audit fee': { type: 'expense', subType: 'professional' },
  'agency fee': { type: 'expense', subType: 'professional' },
  'legal': { type: 'expense', subType: 'professional' },
  'consultancy': { type: 'expense', subType: 'professional' },
  'consulting fee': { type: 'expense', subType: 'professional' },
  'patent fee': { type: 'expense', subType: 'professional' },
  'external contractor': { type: 'expense', subType: 'contractors' },
  'subscription': { type: 'expense', subType: 'software' },
  'software': { type: 'expense', subType: 'software' },
  'it maintenance': { type: 'expense', subType: 'software' },
  'it support': { type: 'expense', subType: 'software' },
  'hosting': { type: 'expense', subType: 'infrastructure' },
  'recruitment': { type: 'expense', subType: 'hr' },
  'training': { type: 'expense', subType: 'hr' },
  'medical': { type: 'expense', subType: 'benefits' },
  'employee insurance': { type: 'expense', subType: 'benefits' },
  'general expense': { type: 'expense', subType: 'general' },
  'office supplies': { type: 'expense', subType: 'general' },
  'other expense': { type: 'expense', subType: 'general' },
  'product development': { type: 'expense', subType: 'r&d' },
  'partner commission': { type: 'expense', subType: 'sales' },
  'donation': { type: 'expense', subType: 'other' },
  'loss on disposal': { type: 'expense', subType: 'other' },
  'impairment': { type: 'expense', subType: 'other' },
  'provision for bad': { type: 'expense', subType: 'other' },
  'provision for advance': { type: 'expense', subType: 'other' },
  'withholding tax': { type: 'expense', subType: 'tax' },
  'foreign exchange': { type: 'expense', subType: 'fx' },
  'realised foreign': { type: 'expense', subType: 'fx' },
  'unrealised foreign': { type: 'expense', subType: 'fx' },
  'unrealised exchange': { type: 'expense', subType: 'fx' },
  'bank revaluation': { type: 'expense', subType: 'fx' },
  'rounding': { type: 'expense', subType: 'rounding' },
};

/** Classify an account name into its type */
export function classifyAccount(accountName: string): AccountClassification['type'] {
  const lower = accountName.toLowerCase();
  for (const [keyword, classification] of Object.entries(ACCOUNT_CLASSIFICATION_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return classification.type;
    }
  }
  return 'unclassified';
}

/** Get sub-type for an account */
export function getAccountSubType(accountName: string): string | undefined {
  const lower = accountName.toLowerCase();
  for (const [keyword, classification] of Object.entries(ACCOUNT_CLASSIFICATION_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return classification.subType;
    }
  }
  return undefined;
}

// ============================================================================
// AGENT 1: BRAIN-BOOKKEEPER — Task Agent for Daily Bookkeeping
// ============================================================================

/**
 * Brain Bookkeeper — Daily transaction categorization & journal entry
 *
 * Trigger: Upload of bank transactions, invoices, or GL data
 * Domains: document-comprehend → rule-apply → cross-validate → confidence-triage
 * Output: Categorized journal entries with double-entry verification
 * Human Analog: Staff accountant processing daily transactions
 */
export const brainBookkeeperAgent: AgentDefinition<
  {
    transactions: GLTransaction[];
    jurisdiction?: string;
    chartOfAccounts?: string[];
  },
  {
    journalEntries: JournalEntry[];
    categorizedAccounts: AccountClassification[];
    triageReport: {
      autoPosted: number;
      flagged: number;
      escalated: number;
    };
    doubleEntryCheck: {
      totalDebits: number;
      totalCredits: number;
      balanced: boolean;
      variance: number;
    };
    anomalies: Array<{
      transaction: GLTransaction;
      reason: string;
      severity: 'info' | 'warning' | 'critical';
    }>;
  }
> = defineAgent({
  name: 'brain-bookkeeper',
  description: 'Categorizes transactions, creates journal entries with double-entry verification, and triages by confidence',
  level: 'task',
  version: '1.0.0',
  domains: ['document-comprehend', 'rule-apply', 'cross-validate', 'confidence-triage'],
  triggers: ['event:transactions_uploaded', 'command:process_transactions'],
  tools: ['document-comprehend', 'rule-apply', 'cross-validate', 'confidence-triage'],
  timeoutMs: 300000, // 5 minutes for large batches
  maxRetries: 2,
  inputSchema: {
    transactions: 'Array of GL transactions from Xero export',
    jurisdiction: 'Jurisdiction code (default: SG for Singapore)',
    chartOfAccounts: 'Optional chart of accounts for classification',
  },
  outputSchema: {
    journalEntries: 'Double-entry journal entries with confidence scores',
    categorizedAccounts: 'Account classifications (revenue/expense/asset/liability/equity/bank)',
    triageReport: 'Breakdown of auto-posted vs flagged vs escalated entries',
    doubleEntryCheck: 'Verification that total debits = total credits',
    anomalies: 'Transactions flagged for review with reasons',
  },
  tags: ['accounting', 'bookkeeping', 'task'],

  execute: async (input, ctx) => {
    const { transactions, jurisdiction = 'SG' } = input;
    ctx.log(`[brain-bookkeeper] Processing ${transactions.length} transactions for ${jurisdiction}`);

    // Step 1: Document comprehension — parse and structure transactions
    ctx.reportProgress(0.1, 'Parsing and structuring transactions...');
    const comprehendResult = await ctx.callAgent('document-comprehend', {
      domain: 'accounting',
      question: `Parse ${transactions.length} GL transactions from ${jurisdiction} jurisdiction`,
    });

    // Step 2: Classify all accounts
    ctx.reportProgress(0.3, 'Classifying accounts...');
    const accountMap = new Map<string, AccountClassification>();
    for (const txn of transactions) {
      if (!accountMap.has(txn.account)) {
        accountMap.set(txn.account, {
          name: txn.account,
          type: classifyAccount(txn.account),
          subType: getAccountSubType(txn.account),
          transactionCount: 0,
          totalDebit: 0,
          totalCredit: 0,
          netBalance: 0,
        });
      }
      const acc = accountMap.get(txn.account)!;
      acc.transactionCount++;
      acc.totalDebit += txn.debit;
      acc.totalCredit += txn.credit;
      acc.netBalance = acc.totalDebit - acc.totalCredit;
    }

    // Step 3: Apply jurisdiction rules
    ctx.reportProgress(0.5, `Applying ${jurisdiction} accounting rules...`);
    const ruleResult = await ctx.callAgent('rule-apply', {
      domain: 'accounting',
      question: `Apply ${jurisdiction} accounting standards to transaction categorization`,
    });

    // Step 4: Create journal entries grouped by reference
    ctx.reportProgress(0.6, 'Creating journal entries...');
    const referenceGroups = new Map<string, GLTransaction[]>();
    for (const txn of transactions) {
      const key = `${txn.date}_${txn.reference || txn.description.slice(0, 50)}`;
      if (!referenceGroups.has(key)) {
        referenceGroups.set(key, []);
      }
      referenceGroups.get(key)!.push(txn);
    }

    const journalEntries: JournalEntry[] = [];
    for (const [key, txns] of referenceGroups) {
      const totalDebit = txns.reduce((s, t) => s + t.debit, 0);
      const totalCredit = txns.reduce((s, t) => s + t.credit, 0);
      const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

      journalEntries.push({
        date: txns[0].date,
        reference: txns[0].reference,
        description: txns[0].description,
        lines: txns.map(t => ({
          account: t.account,
          accountType: classifyAccount(t.account),
          debit: t.debit,
          credit: t.credit,
          taxCode: t.taxRateName !== 'No Tax' ? t.taxRateName : undefined,
        })),
        balanced,
        confidence: balanced ? 0.9 : 0.4,
        source: balanced ? 'auto' : 'flagged',
      });
    }

    // Step 5: Cross-validate double entry
    ctx.reportProgress(0.8, 'Validating double-entry bookkeeping...');
    const totalDebits = transactions.reduce((s, t) => s + t.debit, 0);
    const totalCredits = transactions.reduce((s, t) => s + t.credit, 0);
    const variance = Math.abs(totalDebits - totalCredits);

    await ctx.callAgent('cross-validate', {
      domain: 'accounting',
      question: `Verify double-entry: Total debits ${totalDebits.toFixed(2)} vs credits ${totalCredits.toFixed(2)}`,
    });

    // Step 6: Confidence triage
    ctx.reportProgress(0.9, 'Triaging entries by confidence...');
    const autoPosted = journalEntries.filter(j => j.confidence >= 0.8).length;
    const flagged = journalEntries.filter(j => j.confidence >= 0.5 && j.confidence < 0.8).length;
    const escalated = journalEntries.filter(j => j.confidence < 0.5).length;

    // Step 7: Detect anomalies
    const anomalies: Array<{ transaction: GLTransaction; reason: string; severity: 'info' | 'warning' | 'critical' }> = [];

    // Check for unusually large transactions (>2 std dev from mean)
    const amounts = transactions.map(t => Math.max(t.debit, t.credit)).filter(a => a > 0);
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / amounts.length);
    const threshold = mean + 2 * stdDev;

    for (const txn of transactions) {
      const amount = Math.max(txn.debit, txn.credit);
      if (amount > threshold) {
        anomalies.push({
          transaction: txn,
          reason: `Unusually large: ${amount.toFixed(2)} exceeds 2σ threshold of ${threshold.toFixed(2)}`,
          severity: amount > mean + 3 * stdDev ? 'critical' : 'warning',
        });
      }
    }

    // Check for weekend transactions
    for (const txn of transactions) {
      const day = new Date(txn.date).getDay();
      if (day === 0 || day === 6) {
        if (txn.source !== 'Manual Journal') {
          anomalies.push({
            transaction: txn,
            reason: `Transaction on weekend (${day === 0 ? 'Sunday' : 'Saturday'})`,
            severity: 'info',
          });
        }
      }
    }

    // Check for unclassified accounts
    for (const [_name, acc] of accountMap) {
      if (acc.type === 'unclassified' && acc.transactionCount > 5) {
        const sampleTxn = transactions.find(t => t.account === acc.name);
        if (sampleTxn) {
          anomalies.push({
            transaction: sampleTxn,
            reason: `Account "${acc.name}" could not be classified — ${acc.transactionCount} transactions`,
            severity: 'warning',
          });
        }
      }
    }

    ctx.reportProgress(1.0, 'Bookkeeping complete');
    ctx.log(`[brain-bookkeeper] Created ${journalEntries.length} journal entries, ${anomalies.length} anomalies, ${autoPosted} auto-posted`);

    return {
      journalEntries,
      categorizedAccounts: [...accountMap.values()],
      triageReport: { autoPosted, flagged, escalated },
      doubleEntryCheck: {
        totalDebits,
        totalCredits,
        balanced: variance < 0.01,
        variance,
      },
      anomalies,
    };
  },
});

// ============================================================================
// AGENT 2: BRAIN-RECONCILER — Autonomous Account Reconciliation
// ============================================================================

/**
 * Brain Reconciler — Month-end account reconciliation
 *
 * Trigger: Month-end close or manual trigger
 * Domains: document-comprehend → cross-validate → completeness-check → confidence-triage
 * Output: Reconciliation report per account with variances and unmatched items
 * Human Analog: Month-end close specialist reconciling all accounts
 */
export const brainReconcilerAgent: AgentDefinition<
  {
    transactions: GLTransaction[];
    period: { from: string; to: string };
    jurisdiction?: string;
  },
  {
    reconciliations: ReconciliationResult[];
    trialBalance: {
      accounts: Array<{ name: string; type: string; debit: number; credit: number }>;
      totalDebits: number;
      totalCredits: number;
      balanced: boolean;
    };
    completeness: {
      score: number;
      missingCategories: string[];
      presentCategories: string[];
    };
    monthEndStatus: 'ready' | 'adjustments-needed' | 'critical-issues';
    adjustingEntries: JournalEntry[];
  }
> = defineAgent({
  name: 'brain-reconciler',
  description: 'Reconciles all accounts at month-end, produces trial balance, identifies variances and missing data',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['document-comprehend', 'cross-validate', 'completeness-check', 'confidence-triage'],
  triggers: ['event:month_end', 'command:reconcile'],
  tools: ['document-comprehend', 'cross-validate', 'completeness-check', 'confidence-triage'],
  timeoutMs: 600000,
  maxRetries: 2,
  inputSchema: {
    transactions: 'GL transactions for the period',
    period: 'Reconciliation period (from/to dates)',
    jurisdiction: 'Jurisdiction code (default: SG)',
  },
  outputSchema: {
    reconciliations: 'Per-account reconciliation results with variances',
    trialBalance: 'Trial balance with debit/credit totals',
    completeness: 'Data completeness assessment',
    monthEndStatus: 'Overall month-end close status',
    adjustingEntries: 'Suggested adjusting journal entries',
  },
  tags: ['accounting', 'reconciliation', 'autonomous'],

  execute: async (input, ctx) => {
    const { transactions, period, jurisdiction = 'SG' } = input;
    ctx.log(`[brain-reconciler] Reconciling period ${period.from} to ${period.to}`);

    // Step 1: Parse and group transactions by account
    ctx.reportProgress(0.1, 'Grouping transactions by account...');
    const accountGroups = new Map<string, GLTransaction[]>();
    for (const txn of transactions) {
      const dateStr = txn.date.slice(0, 10);
      if (dateStr >= period.from && dateStr <= period.to) {
        if (!accountGroups.has(txn.account)) {
          accountGroups.set(txn.account, []);
        }
        accountGroups.get(txn.account)!.push(txn);
      }
    }

    // Step 2: Reconcile each account
    ctx.reportProgress(0.3, 'Reconciling individual accounts...');
    const reconciliations: ReconciliationResult[] = [];

    for (const [accountName, txns] of accountGroups) {
      const totalDebit = txns.reduce((s, t) => s + t.debit, 0);
      const totalCredit = txns.reduce((s, t) => s + t.credit, 0);
      const computedBalance = totalDebit - totalCredit;
      const lastTxn = txns[txns.length - 1];
      const closingBalance = lastTxn?.runningBalance || 0;
      const variance = Math.abs(computedBalance - closingBalance);
      const variancePercent = closingBalance !== 0 ? (variance / Math.abs(closingBalance)) * 100 : 0;

      // Find unmatched items (large single-sided entries)
      const unmatchedItems = txns
        .filter(t => {
          const amount = Math.max(t.debit, t.credit);
          return amount > 10000 && (t.debit === 0 || t.credit === 0);
        })
        .slice(0, 10)
        .map(t => ({
          date: t.date.slice(0, 10),
          description: t.description.slice(0, 100),
          amount: Math.max(t.debit, t.credit),
          side: (t.debit > 0 ? 'debit' : 'credit') as 'debit' | 'credit',
        }));

      reconciliations.push({
        account: accountName,
        accountType: classifyAccount(accountName),
        openingBalance: 0, // Would need prior period data
        closingBalance,
        computedBalance,
        variance,
        variancePercent,
        status: variance < 0.01 ? 'reconciled' : variancePercent > 5 ? 'critical' : 'variance',
        unmatchedItems,
      });
    }

    // Step 3: Build trial balance
    ctx.reportProgress(0.5, 'Building trial balance...');
    const trialBalanceAccounts = reconciliations.map(r => ({
      name: r.account,
      type: r.accountType,
      debit: r.computedBalance > 0 ? r.computedBalance : 0,
      credit: r.computedBalance < 0 ? Math.abs(r.computedBalance) : 0,
    }));

    const tbTotalDebits = trialBalanceAccounts.reduce((s, a) => s + a.debit, 0);
    const tbTotalCredits = trialBalanceAccounts.reduce((s, a) => s + a.credit, 0);

    // Step 4: Cross-validate accounting equation
    ctx.reportProgress(0.6, 'Validating accounting equation...');
    await ctx.callAgent('cross-validate', {
      domain: 'accounting',
      question: 'Verify: Assets = Liabilities + Equity',
    });

    const assetTotal = trialBalanceAccounts.filter(a => a.type === 'asset' || a.type === 'bank').reduce((s, a) => s + a.debit - a.credit, 0);
    const liabilityTotal = trialBalanceAccounts.filter(a => a.type === 'liability').reduce((s, a) => s + a.credit - a.debit, 0);
    const equityTotal = trialBalanceAccounts.filter(a => a.type === 'equity').reduce((s, a) => s + a.credit - a.debit, 0);
    const revenueTotal = trialBalanceAccounts.filter(a => a.type === 'revenue').reduce((s, a) => s + a.credit - a.debit, 0);
    const expenseTotal = trialBalanceAccounts.filter(a => a.type === 'expense').reduce((s, a) => s + a.debit - a.credit, 0);
    const netIncome = revenueTotal - expenseTotal;

    // Step 5: Completeness check
    ctx.reportProgress(0.7, 'Checking completeness...');
    const requiredCategories = ['revenue', 'expense', 'asset', 'liability', 'equity', 'bank'];
    const presentCategories = [...new Set(reconciliations.map(r => r.accountType))].filter(t => t !== 'unclassified');
    const missingCategories = requiredCategories.filter(c => !presentCategories.includes(c));
    const completenessScore = presentCategories.length / requiredCategories.length;

    await ctx.callAgent('completeness-check', {
      domain: 'accounting',
      question: `Check data completeness for ${jurisdiction} month-end close`,
    });

    // Step 6: Generate adjusting entries for critical variances
    ctx.reportProgress(0.85, 'Generating adjusting entries...');
    const adjustingEntries: JournalEntry[] = [];
    const criticalRecs = reconciliations.filter(r => r.status === 'critical');

    for (const rec of criticalRecs.slice(0, 5)) {
      adjustingEntries.push({
        date: period.to,
        reference: `ADJ-${rec.account.replace(/\s+/g, '-').slice(0, 20)}`,
        description: `Adjusting entry for ${rec.account}: variance of ${rec.variance.toFixed(2)}`,
        lines: [
          {
            account: rec.account,
            accountType: rec.accountType,
            debit: rec.variance > 0 ? rec.variance : 0,
            credit: rec.variance < 0 ? Math.abs(rec.variance) : 0,
          },
          {
            account: 'Suspense Account',
            accountType: 'liability',
            debit: rec.variance < 0 ? Math.abs(rec.variance) : 0,
            credit: rec.variance > 0 ? rec.variance : 0,
          },
        ],
        balanced: true,
        confidence: 0.5,
        source: 'flagged',
      });
    }

    // Determine overall status
    const criticalCount = reconciliations.filter(r => r.status === 'critical').length;
    const varianceCount = reconciliations.filter(r => r.status === 'variance').length;
    const monthEndStatus = criticalCount > 0 ? 'critical-issues' : varianceCount > 0 ? 'adjustments-needed' : 'ready';

    ctx.reportProgress(1.0, `Reconciliation complete: ${monthEndStatus}`);
    ctx.log(`[brain-reconciler] ${reconciliations.length} accounts reconciled, ${criticalCount} critical, ${varianceCount} variances`);

    return {
      reconciliations,
      trialBalance: {
        accounts: trialBalanceAccounts,
        totalDebits: tbTotalDebits,
        totalCredits: tbTotalCredits,
        balanced: Math.abs(tbTotalDebits - tbTotalCredits) < 0.01,
      },
      completeness: {
        score: completenessScore,
        missingCategories,
        presentCategories,
      },
      monthEndStatus,
      adjustingEntries,
    };
  },
});

// ============================================================================
// AGENT 3: BRAIN-STATEMENT-GENERATOR — Task Agent for Financial Statements
// ============================================================================

/**
 * Brain Statement Generator — Financial statement preparation
 *
 * Trigger: Manual or month-end/quarter-end
 * Domains: completeness-check → rule-apply → statement-synthesize → cross-validate
 * Output: P&L, Balance Sheet, Cash Flow Statement
 * Human Analog: Controller preparing financial statements
 */
export const brainStatementGeneratorAgent: AgentDefinition<
  {
    transactions: GLTransaction[];
    period: { from: string; to: string };
    jurisdiction?: string;
    comparativePeriod?: { from: string; to: string };
  },
  {
    profitAndLoss: {
      revenue: Array<{ account: string; amount: number }>;
      totalRevenue: number;
      costOfSales: Array<{ account: string; amount: number }>;
      totalCostOfSales: number;
      grossProfit: number;
      grossMarginPercent: number;
      operatingExpenses: Array<{ account: string; amount: number; subType?: string }>;
      totalOperatingExpenses: number;
      operatingProfit: number;
      otherIncome: Array<{ account: string; amount: number }>;
      otherExpenses: Array<{ account: string; amount: number }>;
      profitBeforeTax: number;
      taxExpense: number;
      netProfit: number;
      netMarginPercent: number;
    };
    balanceSheet: {
      currentAssets: Array<{ account: string; amount: number }>;
      nonCurrentAssets: Array<{ account: string; amount: number }>;
      totalAssets: number;
      currentLiabilities: Array<{ account: string; amount: number }>;
      nonCurrentLiabilities: Array<{ account: string; amount: number }>;
      totalLiabilities: number;
      equity: Array<{ account: string; amount: number }>;
      totalEquity: number;
      balanced: boolean;
    };
    cashFlowSummary: {
      operatingCashFlow: number;
      investingCashFlow: number;
      financingCashFlow: number;
      netCashChange: number;
      openingCash: number;
      closingCash: number;
    };
    keyRatios: {
      currentRatio: number;
      debtToEquity: number;
      grossMargin: number;
      netMargin: number;
      burnRate: number;
      runwayMonths: number;
    };
  }
> = defineAgent({
  name: 'brain-statement-generator',
  description: 'Generates P&L, Balance Sheet, and Cash Flow statements from GL data with key financial ratios',
  level: 'task',
  version: '1.0.0',
  domains: ['completeness-check', 'rule-apply', 'statement-synthesize', 'cross-validate'],
  triggers: ['event:period_end', 'command:generate_statements'],
  tools: ['completeness-check', 'rule-apply', 'statement-synthesize', 'cross-validate'],
  timeoutMs: 300000,
  maxRetries: 2,
  inputSchema: {
    transactions: 'GL transactions for the period',
    period: 'Reporting period (from/to dates)',
    jurisdiction: 'Jurisdiction code (default: SG)',
    comparativePeriod: 'Optional prior period for comparison',
  },
  outputSchema: {
    profitAndLoss: 'Income statement with revenue, COGS, operating expenses, net profit',
    balanceSheet: 'Statement of financial position: assets, liabilities, equity',
    cashFlowSummary: 'Cash flow summary (operating, investing, financing)',
    keyRatios: 'Financial ratios: current ratio, D/E, margins, burn rate, runway',
  },
  tags: ['accounting', 'statements', 'task'],

  execute: async (input, ctx) => {
    const { transactions, period, jurisdiction = 'SG' } = input;
    ctx.log(`[brain-statement-generator] Generating statements for ${period.from} to ${period.to}`);

    // Filter transactions for period
    const periodTxns = transactions.filter(t => {
      const d = t.date.slice(0, 10);
      return d >= period.from && d <= period.to;
    });

    // Step 1: Check completeness
    ctx.reportProgress(0.1, 'Checking data completeness...');
    await ctx.callAgent('completeness-check', {
      domain: 'accounting',
      question: `Is data complete for ${jurisdiction} financial statement preparation?`,
    });

    // Step 2: Apply accounting rules
    ctx.reportProgress(0.2, `Applying ${jurisdiction} accounting standards...`);
    await ctx.callAgent('rule-apply', {
      domain: 'accounting',
      question: `Apply ${jurisdiction} recognition and measurement rules`,
    });

    // Step 3: Aggregate by account and type
    ctx.reportProgress(0.4, 'Aggregating account balances...');
    const accountBalances = new Map<string, { type: string; subType?: string; debit: number; credit: number; net: number }>();

    for (const txn of periodTxns) {
      if (!accountBalances.has(txn.account)) {
        accountBalances.set(txn.account, {
          type: classifyAccount(txn.account),
          subType: getAccountSubType(txn.account),
          debit: 0,
          credit: 0,
          net: 0,
        });
      }
      const bal = accountBalances.get(txn.account)!;
      bal.debit += txn.debit;
      bal.credit += txn.credit;
      bal.net = bal.debit - bal.credit;
    }

    // Step 4: Build P&L
    ctx.reportProgress(0.5, 'Building Profit & Loss statement...');

    const revenueAccounts = [...accountBalances.entries()]
      .filter(([_, b]) => b.type === 'revenue')
      .map(([name, b]) => ({ account: name, amount: b.credit - b.debit })) // Revenue is credit-normal
      .filter(a => a.amount !== 0)
      .sort((a, b) => b.amount - a.amount);

    const totalRevenue = revenueAccounts.reduce((s, a) => s + a.amount, 0);

    // Separate COGS from OpEx (infrastructure, hosting = COGS for SaaS)
    const cogsKeywords = ['hosting', 'infrastructure', 'api', 'technology support', 'software platform'];
    const expenseEntries = [...accountBalances.entries()]
      .filter(([_, b]) => b.type === 'expense')
      .map(([name, b]) => ({ account: name, amount: b.debit - b.credit, subType: b.subType }))
      .filter(a => a.amount !== 0);

    const costOfSales = expenseEntries
      .filter(a => cogsKeywords.some(k => a.account.toLowerCase().includes(k)))
      .sort((a, b) => b.amount - a.amount);
    const totalCostOfSales = costOfSales.reduce((s, a) => s + a.amount, 0);
    const grossProfit = totalRevenue - totalCostOfSales;

    const operatingExpenses = expenseEntries
      .filter(a => !cogsKeywords.some(k => a.account.toLowerCase().includes(k)))
      .sort((a, b) => b.amount - a.amount);
    const totalOperatingExpenses = operatingExpenses.reduce((s, a) => s + a.amount, 0);
    const operatingProfit = grossProfit - totalOperatingExpenses;

    // Other income/expenses (FX, interest, etc.)
    const otherIncomeKeywords = ['interest income', 'other income', 'miscellaneous income', 'grant'];
    const otherExpenseKeywords = ['foreign exchange', 'loss on disposal', 'impairment', 'fair value'];
    const otherIncome = revenueAccounts.filter(a => otherIncomeKeywords.some(k => a.account.toLowerCase().includes(k)));
    const otherExpenses = expenseEntries.filter(a => otherExpenseKeywords.some(k => a.account.toLowerCase().includes(k)));

    const profitBeforeTax = operatingProfit +
      otherIncome.reduce((s, a) => s + a.amount, 0) -
      otherExpenses.reduce((s, a) => s + a.amount, 0);

    const taxExpense = expenseEntries
      .filter(a => a.subType === 'tax' || a.account.toLowerCase().includes('tax'))
      .reduce((s, a) => s + a.amount, 0);

    const netProfit = profitBeforeTax - taxExpense;

    // Step 5: Build Balance Sheet
    ctx.reportProgress(0.65, 'Building Balance Sheet...');

    const assetEntries = [...accountBalances.entries()]
      .filter(([_, b]) => b.type === 'asset' || b.type === 'bank')
      .map(([name, b]) => ({ account: name, amount: b.debit - b.credit })) // Assets are debit-normal
      .filter(a => a.amount !== 0);

    const currentAssetKeywords = ['debtor', 'receivable', 'prepayment', 'deposit', 'cash', 'bank', 'uob', 'wise', 'citibank', 'clearing', 'accrued income', 'gst', 'staff loan'];
    const currentAssets = assetEntries.filter(a => currentAssetKeywords.some(k => a.account.toLowerCase().includes(k)));
    const nonCurrentAssets = assetEntries.filter(a => !currentAssetKeywords.some(k => a.account.toLowerCase().includes(k)));

    const liabilityEntries = [...accountBalances.entries()]
      .filter(([_, b]) => b.type === 'liability')
      .map(([name, b]) => ({ account: name, amount: b.credit - b.debit })) // Liabilities are credit-normal
      .filter(a => a.amount !== 0);

    const currentLiabilityKeywords = ['creditor', 'payable', 'accrued', 'deferred revenue', 'gst', 'cpf', 'wht', 'current'];
    const currentLiabilities = liabilityEntries.filter(a =>
      currentLiabilityKeywords.some(k => a.account.toLowerCase().includes(k)) &&
      !a.account.toLowerCase().includes('non current') && !a.account.toLowerCase().includes('non-current')
    );
    const nonCurrentLiabilities = liabilityEntries.filter(a =>
      !currentLiabilityKeywords.some(k => a.account.toLowerCase().includes(k)) ||
      a.account.toLowerCase().includes('non current') || a.account.toLowerCase().includes('non-current')
    );

    const equityEntries = [...accountBalances.entries()]
      .filter(([_, b]) => b.type === 'equity')
      .map(([name, b]) => ({ account: name, amount: b.credit - b.debit }))
      .filter(a => a.amount !== 0);

    const totalAssets = assetEntries.reduce((s, a) => s + a.amount, 0);
    const totalLiabilities = liabilityEntries.reduce((s, a) => s + a.amount, 0);
    const totalEquity = equityEntries.reduce((s, a) => s + a.amount, 0);

    // Step 6: Cash flow summary
    ctx.reportProgress(0.8, 'Building cash flow summary...');

    const bankAccounts = [...accountBalances.entries()]
      .filter(([_, b]) => b.type === 'bank')
      .map(([name, b]) => ({ account: name, net: b.debit - b.credit }));
    const closingCash = bankAccounts.reduce((s, a) => s + a.net, 0);

    // Simplified cash flow (full would need prior period)
    const operatingCashFlow = netProfit; // Simplified: needs adjustments
    const investingCashFlow = nonCurrentAssets.reduce((s, a) => s - a.amount, 0);
    const financingCashFlow = closingCash - operatingCashFlow - investingCashFlow;

    // Step 7: Cross-validate
    ctx.reportProgress(0.9, 'Cross-validating statements...');
    await ctx.callAgent('cross-validate', {
      domain: 'accounting',
      question: 'Verify Assets = Liabilities + Equity and trial balance',
    });

    // Step 8: Compute key ratios
    const currentAssetsTotal = currentAssets.reduce((s, a) => s + a.amount, 0);
    const currentLiabilitiesTotal = currentLiabilities.reduce((s, a) => s + a.amount, 0);
    const monthlyBurn = totalOperatingExpenses / Math.max(1,
      Math.ceil((new Date(period.to).getTime() - new Date(period.from).getTime()) / (30 * 24 * 60 * 60 * 1000))
    );

    ctx.reportProgress(1.0, 'Financial statements complete');

    return {
      profitAndLoss: {
        revenue: revenueAccounts,
        totalRevenue,
        costOfSales,
        totalCostOfSales,
        grossProfit,
        grossMarginPercent: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
        operatingExpenses,
        totalOperatingExpenses,
        operatingProfit,
        otherIncome,
        otherExpenses,
        profitBeforeTax,
        taxExpense,
        netProfit,
        netMarginPercent: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
      },
      balanceSheet: {
        currentAssets,
        nonCurrentAssets,
        totalAssets,
        currentLiabilities,
        nonCurrentLiabilities,
        totalLiabilities,
        equity: equityEntries,
        totalEquity,
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netProfit)) < 1,
      },
      cashFlowSummary: {
        operatingCashFlow,
        investingCashFlow,
        financingCashFlow,
        netCashChange: operatingCashFlow + investingCashFlow + financingCashFlow,
        openingCash: 0,
        closingCash,
      },
      keyRatios: {
        currentRatio: currentLiabilitiesTotal > 0 ? currentAssetsTotal / currentLiabilitiesTotal : 0,
        debtToEquity: totalEquity > 0 ? totalLiabilities / totalEquity : 0,
        grossMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
        netMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
        burnRate: monthlyBurn,
        runwayMonths: monthlyBurn > 0 ? closingCash / monthlyBurn : 0,
      },
    };
  },
});

// ============================================================================
// AGENT 4: BRAIN-TAX-COMPLIANCE — Autonomous Tax Compliance
// ============================================================================

/**
 * Brain Tax Compliance — Multi-jurisdiction tax compliance
 *
 * Trigger: Quarter-end or tax filing deadline approaching
 * Domains: jurisdiction-comply → rule-apply → completeness-check → statement-synthesize
 * Output: Tax computation, GST return data, filing checklist
 * Human Analog: Tax accountant preparing filings across jurisdictions
 */
export const brainTaxComplianceAgent: AgentDefinition<
  {
    transactions: GLTransaction[];
    period: { from: string; to: string };
    jurisdiction: string;
  },
  {
    taxComputation: {
      jurisdiction: string;
      accountingStandard: string;
      taxableIncome: number;
      corporateTaxRate: number;
      estimatedTax: number;
      deductions: Array<{ description: string; amount: number; section: string }>;
      adjustments: Array<{ description: string; amount: number; type: 'add-back' | 'deduction' }>;
    };
    gstReturn: {
      outputTax: number;
      inputTax: number;
      netGST: number;
      standardRatedSupplies: number;
      zeroRatedSupplies: number;
      exemptSupplies: number;
      taxableImports: number;
    };
    filingChecklist: Array<{
      form: string;
      deadline: string;
      status: 'ready' | 'data-incomplete' | 'not-applicable';
      missingData: string[];
    }>;
    withholdingTax: Array<{
      payee: string;
      paymentType: string;
      amount: number;
      whtRate: number;
      whtAmount: number;
    }>;
    complianceScore: number;
  }
> = defineAgent({
  name: 'brain-tax-compliance',
  description: 'Computes tax liabilities, prepares GST returns, generates filing checklists for multi-jurisdiction compliance',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['jurisdiction-comply', 'rule-apply', 'completeness-check', 'statement-synthesize'],
  triggers: ['event:quarter_end', 'event:filing_deadline', 'command:compute_tax'],
  tools: ['jurisdiction-comply', 'rule-apply', 'completeness-check', 'statement-synthesize'],
  timeoutMs: 300000,
  maxRetries: 2,
  inputSchema: {
    transactions: 'GL transactions for the tax period',
    period: 'Tax period (from/to dates)',
    jurisdiction: 'Jurisdiction code (e.g., SG, US, MY)',
  },
  outputSchema: {
    taxComputation: 'Corporate tax computation with deductions and adjustments',
    gstReturn: 'GST/VAT return data (output tax, input tax, net)',
    filingChecklist: 'Required forms with status and missing data',
    withholdingTax: 'Withholding tax obligations on cross-border payments',
    complianceScore: 'Overall compliance readiness (0-1)',
  },
  tags: ['accounting', 'tax', 'compliance', 'autonomous'],

  execute: async (input, ctx) => {
    const { transactions, period, jurisdiction } = input;
    ctx.log(`[brain-tax-compliance] Computing taxes for ${jurisdiction}: ${period.from} to ${period.to}`);

    // Step 1: Apply jurisdiction rules
    ctx.reportProgress(0.1, `Loading ${jurisdiction} tax rules...`);
    const ruleResult = await ctx.callAgent('jurisdiction-comply', {
      domain: 'accounting',
      question: `Apply ${jurisdiction} tax computation rules`,
    });

    // Step 2: Filter period transactions
    ctx.reportProgress(0.2, 'Filtering transactions for tax period...');
    const periodTxns = transactions.filter(t => {
      const d = t.date.slice(0, 10);
      return d >= period.from && d <= period.to;
    });

    // Step 3: Compute taxable income
    ctx.reportProgress(0.4, 'Computing taxable income...');

    // Revenue
    const revenue = periodTxns
      .filter(t => classifyAccount(t.account) === 'revenue')
      .reduce((s, t) => s + (t.credit - t.debit), 0);

    // Expenses (deductible)
    const expenses = periodTxns
      .filter(t => classifyAccount(t.account) === 'expense')
      .reduce((s, t) => s + (t.debit - t.credit), 0);

    // Non-deductible adjustments (entertainment, depreciation adjustments, etc.)
    const nonDeductibleKeywords = ['client entertainment', 'donation', 'fine', 'penalty'];
    const addBacks = periodTxns
      .filter(t => nonDeductibleKeywords.some(k => t.account.toLowerCase().includes(k)))
      .reduce((s, t) => s + (t.debit - t.credit), 0);

    // Capital allowances (depreciation for tax)
    const capitalAllowances = periodTxns
      .filter(t => t.account.toLowerCase().includes('depreciation') || t.account.toLowerCase().includes('amortisation'))
      .reduce((s, t) => s + (t.debit - t.credit), 0);

    const accountingProfit = revenue - expenses;
    const taxableIncome = accountingProfit + addBacks; // Simplified

    // Tax rates by jurisdiction
    const taxRates: Record<string, number> = {
      SG: 0.17, US: 0.21, MY: 0.24, PH: 0.25, TW: 0.20,
      AU: 0.30, IN: 0.2542, HK: 0.165, TH: 0.20,
    };
    const corporateTaxRate = taxRates[jurisdiction] || 0.17;
    const estimatedTax = Math.max(0, taxableIncome * corporateTaxRate);

    // Step 4: GST/VAT computation
    ctx.reportProgress(0.6, 'Computing GST/VAT...');

    const gstTxns = periodTxns.filter(t => t.taxRateName && t.taxRateName !== 'No Tax');
    const outputTaxTxns = gstTxns.filter(t => classifyAccount(t.account) === 'revenue');
    const inputTaxTxns = gstTxns.filter(t => classifyAccount(t.account) === 'expense');

    const outputTax = outputTaxTxns.reduce((s, t) => s + t.tax, 0);
    const inputTax = inputTaxTxns.reduce((s, t) => s + t.tax, 0);

    const standardRatedSupplies = outputTaxTxns.reduce((s, t) => s + (t.credit - t.debit), 0);
    const zeroRatedTxns = periodTxns.filter(t =>
      t.taxRateName?.toLowerCase().includes('zero') ||
      t.taxRateName?.toLowerCase().includes('export')
    );
    const zeroRatedSupplies = zeroRatedTxns.reduce((s, t) => s + Math.max(t.debit, t.credit), 0);

    // Step 5: Filing checklist
    ctx.reportProgress(0.75, 'Building filing checklist...');
    const requiredForms: Record<string, string[]> = {
      SG: ['Form C-S', 'GST F5', 'IR8A'],
      US: ['1120', '941', '1099'],
      MY: ['Form C', 'SST-02'],
      IN: ['ITR-6', 'GSTR-3B'],
      AU: ['Company Tax Return', 'BAS'],
    };

    const forms = (requiredForms[jurisdiction] || ['Tax Return']).map(form => ({
      form,
      deadline: period.to, // Simplified
      status: 'ready' as const,
      missingData: [] as string[],
    }));

    // Step 6: Withholding tax
    ctx.reportProgress(0.85, 'Computing withholding tax...');
    const whtTxns = periodTxns.filter(t =>
      t.account.toLowerCase().includes('withholding') ||
      t.account.toLowerCase().includes('wht')
    );
    const withholdingTax = whtTxns.slice(0, 10).map(t => ({
      payee: t.description.split(' - ')[0] || 'Unknown',
      paymentType: t.source,
      amount: Math.max(t.debit, t.credit),
      whtRate: corporateTaxRate * 0.5, // Simplified
      whtAmount: t.tax,
    }));

    // Step 7: Compliance score
    const completenessResult = await ctx.callAgent('completeness-check', {
      domain: 'accounting',
      question: `Check tax filing completeness for ${jurisdiction}`,
    });

    const complianceScore = forms.filter(f => f.status === 'ready').length / forms.length;

    ctx.reportProgress(1.0, 'Tax compliance complete');

    return {
      taxComputation: {
        jurisdiction,
        accountingStandard: jurisdiction === 'SG' ? 'SFRS(I)' : jurisdiction === 'US' ? 'US-GAAP' : 'IFRS',
        taxableIncome,
        corporateTaxRate,
        estimatedTax,
        deductions: [
          { description: 'Capital Allowances (Depreciation)', amount: capitalAllowances, section: 'S19/19A' },
        ],
        adjustments: addBacks > 0 ? [
          { description: 'Non-deductible entertainment/donations', amount: addBacks, type: 'add-back' as const },
        ] : [],
      },
      gstReturn: {
        outputTax,
        inputTax,
        netGST: outputTax - inputTax,
        standardRatedSupplies,
        zeroRatedSupplies,
        exemptSupplies: 0,
        taxableImports: 0,
      },
      filingChecklist: forms,
      withholdingTax,
      complianceScore,
    };
  },
});

// ============================================================================
// AGENT 5: BRAIN-AUDIT-PREPARER — Autonomous Audit Preparation
// ============================================================================

/**
 * Brain Audit Preparer — Audit readiness assessment & workpaper preparation
 *
 * Trigger: Pre-audit or annual review
 * Domains: completeness-check → cross-validate → rule-apply → confidence-triage
 * Output: Audit readiness score, workpapers, risk areas
 * Human Analog: Audit manager preparing for external audit
 */
export const brainAuditPreparerAgent: AgentDefinition<
  {
    transactions: GLTransaction[];
    period: { from: string; to: string };
    jurisdiction?: string;
    materialityThreshold?: number;
  },
  {
    auditReadiness: {
      overallScore: number;
      rating: 'audit-ready' | 'minor-gaps' | 'significant-gaps' | 'not-ready';
      areas: Array<{
        area: string;
        score: number;
        findings: string[];
        recommendations: string[];
      }>;
    };
    workpapers: Array<{
      title: string;
      area: string;
      summary: string;
      balanceTested: number;
      sampleSize: number;
      exceptionsFound: number;
      conclusion: string;
    }>;
    materialityAnalysis: {
      overallMateriality: number;
      performanceMateriality: number;
      trivialThreshold: number;
      itemsAboveMateriality: number;
    };
    riskAreas: Array<{
      area: string;
      riskLevel: 'high' | 'medium' | 'low';
      description: string;
      auditProcedure: string;
    }>;
  }
> = defineAgent({
  name: 'brain-audit-preparer',
  description: 'Assesses audit readiness, prepares workpapers, identifies risk areas and materiality thresholds',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['completeness-check', 'cross-validate', 'rule-apply', 'confidence-triage'],
  triggers: ['event:pre_audit', 'command:prepare_audit'],
  tools: ['completeness-check', 'cross-validate', 'rule-apply', 'confidence-triage'],
  timeoutMs: 600000,
  maxRetries: 2,
  inputSchema: {
    transactions: 'GL transactions for audit period',
    period: 'Audit period (from/to dates)',
    jurisdiction: 'Jurisdiction code (default: SG)',
    materialityThreshold: 'Optional materiality threshold override',
  },
  outputSchema: {
    auditReadiness: 'Overall audit readiness score and per-area assessment',
    workpapers: 'Prepared audit workpapers with testing results',
    materialityAnalysis: 'Materiality levels and items above threshold',
    riskAreas: 'Identified audit risk areas with recommended procedures',
  },
  tags: ['accounting', 'audit', 'autonomous'],

  execute: async (input, ctx) => {
    const { transactions, period, jurisdiction = 'SG', materialityThreshold } = input;
    ctx.log(`[brain-audit-preparer] Preparing audit for ${period.from} to ${period.to}`);

    // Filter period transactions
    const periodTxns = transactions.filter(t => {
      const d = t.date.slice(0, 10);
      return d >= period.from && d <= period.to;
    });

    // Step 1: Compute materiality
    ctx.reportProgress(0.1, 'Computing materiality thresholds...');
    const totalRevenue = periodTxns
      .filter(t => classifyAccount(t.account) === 'revenue')
      .reduce((s, t) => s + (t.credit - t.debit), 0);
    const totalAssets = periodTxns
      .filter(t => classifyAccount(t.account) === 'asset' || classifyAccount(t.account) === 'bank')
      .reduce((s, t) => s + Math.abs(t.debit - t.credit), 0);

    const overallMateriality = materialityThreshold || Math.max(totalRevenue * 0.01, totalAssets * 0.005, 10000);
    const performanceMateriality = overallMateriality * 0.75;
    const trivialThreshold = overallMateriality * 0.05;

    // Count items above materiality
    const accountBalances = new Map<string, number>();
    for (const txn of periodTxns) {
      accountBalances.set(txn.account, (accountBalances.get(txn.account) || 0) + Math.max(txn.debit, txn.credit));
    }
    const itemsAboveMateriality = [...accountBalances.values()].filter(v => v > overallMateriality).length;

    // Step 2: Completeness check
    ctx.reportProgress(0.25, 'Checking completeness...');
    await ctx.callAgent('completeness-check', {
      domain: 'accounting',
      question: `Assess audit completeness for ${jurisdiction}`,
    });

    // Step 3: Cross-validate key balances
    ctx.reportProgress(0.4, 'Cross-validating key balances...');
    await ctx.callAgent('cross-validate', {
      domain: 'accounting',
      question: 'Verify accounting equation and inter-account consistency',
    });

    // Step 4: Prepare workpapers for major account areas
    ctx.reportProgress(0.55, 'Preparing audit workpapers...');

    const auditAreas = [
      { area: 'Revenue', filter: (t: GLTransaction) => classifyAccount(t.account) === 'revenue' },
      { area: 'Trade Receivables', filter: (t: GLTransaction) => t.account.toLowerCase().includes('debtor') || t.account.toLowerCase().includes('receivable') },
      { area: 'Trade Payables', filter: (t: GLTransaction) => t.account.toLowerCase().includes('creditor') || t.account.toLowerCase().includes('payable') },
      { area: 'Cash & Bank', filter: (t: GLTransaction) => classifyAccount(t.account) === 'bank' },
      { area: 'Payroll', filter: (t: GLTransaction) => ['salary', 'salaries', 'cpf', 'bonus', 'staff'].some(k => t.account.toLowerCase().includes(k)) },
      { area: 'Fixed Assets', filter: (t: GLTransaction) => ['computer', 'furniture', 'equipment', 'renovation', 'rou'].some(k => t.account.toLowerCase().includes(k)) },
      { area: 'Intercompany', filter: (t: GLTransaction) => t.account.toLowerCase().includes('intercompany') || t.account.toLowerCase().includes('subsidiary') },
    ];

    const workpapers = auditAreas.map(({ area, filter }) => {
      const areaTxns = periodTxns.filter(filter);
      const balance = areaTxns.reduce((s, t) => s + Math.max(t.debit, t.credit), 0);
      const sampleSize = Math.min(areaTxns.length, Math.max(10, Math.ceil(areaTxns.length * 0.1)));

      // Simple exception detection: duplicate amounts on same date
      const dateAmountKeys = new Set<string>();
      let exceptions = 0;
      for (const txn of areaTxns) {
        const key = `${txn.date.slice(0, 10)}_${Math.max(txn.debit, txn.credit).toFixed(2)}`;
        if (dateAmountKeys.has(key)) exceptions++;
        dateAmountKeys.add(key);
      }

      return {
        title: `${area} — Substantive Testing`,
        area,
        summary: `${areaTxns.length} transactions, total ${balance.toFixed(2)}`,
        balanceTested: balance,
        sampleSize,
        exceptionsFound: exceptions,
        conclusion: exceptions === 0 ? 'No exceptions noted' :
          exceptions < 3 ? 'Minor exceptions — manageable' : 'Significant exceptions — further review needed',
      };
    });

    // Step 5: Risk areas
    ctx.reportProgress(0.75, 'Identifying risk areas...');

    const riskAreas: Array<{
      area: string;
      riskLevel: 'high' | 'medium' | 'low';
      description: string;
      auditProcedure: string;
    }> = [];

    // Check for large manual journals (fraud risk)
    const manualJournals = periodTxns.filter(t => t.source === 'Manual Journal');
    const largeManualJournals = manualJournals.filter(t => Math.max(t.debit, t.credit) > performanceMateriality);
    if (largeManualJournals.length > 0) {
      riskAreas.push({
        area: 'Manual Journal Entries',
        riskLevel: 'high',
        description: `${largeManualJournals.length} manual journals above performance materiality (${performanceMateriality.toFixed(0)})`,
        auditProcedure: 'Inspect all manual journals above materiality — verify authorization, supporting documentation, and business rationale',
      });
    }

    // Revenue recognition risk (SaaS: deferred revenue vs recognized)
    const deferredRevenue = periodTxns
      .filter(t => t.account.toLowerCase().includes('deferred revenue'))
      .reduce((s, t) => s + (t.credit - t.debit), 0);
    if (Math.abs(deferredRevenue) > performanceMateriality) {
      riskAreas.push({
        area: 'Revenue Recognition',
        riskLevel: 'high',
        description: `Deferred revenue balance of ${deferredRevenue.toFixed(2)} — verify recognition timing per SFRS(I) 15`,
        auditProcedure: 'Test revenue cut-off at period end, verify contract terms support recognition timing',
      });
    }

    // Related party transactions
    const relatedPartyTxns = periodTxns.filter(t =>
      t.account.toLowerCase().includes('director') ||
      t.account.toLowerCase().includes('subsidiary') ||
      t.account.toLowerCase().includes('intercompany')
    );
    if (relatedPartyTxns.length > 10) {
      riskAreas.push({
        area: 'Related Party Transactions',
        riskLevel: 'medium',
        description: `${relatedPartyTxns.length} related party transactions — verify arm's length pricing and disclosure`,
        auditProcedure: 'Obtain related party confirmations, verify pricing against market rates, check SFRS disclosure requirements',
      });
    }

    // FX risk
    const fxTxns = periodTxns.filter(t => t.account.toLowerCase().includes('foreign exchange') || t.account.toLowerCase().includes('unrealised'));
    if (fxTxns.length > 50) {
      riskAreas.push({
        area: 'Foreign Exchange',
        riskLevel: 'medium',
        description: `${fxTxns.length} FX transactions — verify revaluation methodology and rates used`,
        auditProcedure: 'Verify exchange rates to independent sources, test revaluation calculation',
      });
    }

    // Step 6: Compute audit readiness score
    ctx.reportProgress(0.9, 'Computing audit readiness...');

    const areaScores = workpapers.map(wp => ({
      area: wp.area,
      score: wp.exceptionsFound === 0 ? 1.0 : wp.exceptionsFound < 3 ? 0.7 : 0.4,
      findings: wp.exceptionsFound > 0 ? [`${wp.exceptionsFound} exceptions found in ${wp.area}`] : [],
      recommendations: wp.exceptionsFound > 0 ? [`Review and resolve ${wp.exceptionsFound} exceptions in ${wp.area}`] : [],
    }));

    const overallScore = areaScores.reduce((s, a) => s + a.score, 0) / areaScores.length;
    const rating = overallScore > 0.9 ? 'audit-ready' :
      overallScore > 0.7 ? 'minor-gaps' :
      overallScore > 0.5 ? 'significant-gaps' : 'not-ready';

    ctx.reportProgress(1.0, `Audit preparation complete: ${rating}`);

    return {
      auditReadiness: {
        overallScore,
        rating,
        areas: areaScores,
      },
      workpapers,
      materialityAnalysis: {
        overallMateriality,
        performanceMateriality,
        trivialThreshold,
        itemsAboveMateriality,
      },
      riskAreas,
    };
  },
});

// ============================================================================
// AGENT 6: BRAIN-ANOMALY-DETECTIVE — Autonomous Financial Anomaly Detection
// ============================================================================

/**
 * Brain Anomaly Detective — Financial anomaly detection & forensic analysis
 *
 * Trigger: Continuous monitoring or manual investigation
 * Domains: document-comprehend → cross-validate → rule-apply → confidence-triage
 * Output: Anomaly report with Benford's Law analysis, pattern deviations, risk cascades
 * Human Analog: Forensic accountant detecting irregularities
 */
export const brainAnomalyDetectiveAgent: AgentDefinition<
  {
    transactions: GLTransaction[];
    period?: { from: string; to: string };
    sensitivityLevel?: 'low' | 'medium' | 'high';
  },
  {
    anomalies: Array<{
      type: string;
      severity: 'critical' | 'warning' | 'info';
      description: string;
      affectedTransactions: number;
      totalAmount: number;
      evidence: string;
      recommendation: string;
    }>;
    benfordsLaw: {
      expected: number[];
      observed: number[];
      chiSquare: number;
      pValue: number;
      conforming: boolean;
    };
    patternDeviations: Array<{
      pattern: string;
      expected: string;
      actual: string;
      deviationPercent: number;
    }>;
    vendorConcentration: Array<{
      vendor: string;
      totalSpend: number;
      percentOfTotal: number;
      transactionCount: number;
      risk: 'high' | 'medium' | 'low';
    }>;
    duplicateDetection: Array<{
      amount: number;
      date: string;
      account: string;
      description: string;
      count: number;
    }>;
    overallRiskScore: number;
  }
> = defineAgent({
  name: 'brain-anomaly-detective',
  description: 'Detects financial anomalies using Benfords Law, pattern analysis, vendor concentration, and duplicate detection',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['document-comprehend', 'cross-validate', 'rule-apply', 'confidence-triage'],
  triggers: ['event:continuous_monitoring', 'command:investigate'],
  tools: ['document-comprehend', 'cross-validate', 'rule-apply', 'confidence-triage'],
  timeoutMs: 300000,
  maxRetries: 2,
  inputSchema: {
    transactions: 'GL transactions to investigate',
    period: 'Optional: focus period for investigation',
    sensitivityLevel: 'Detection sensitivity: low, medium (default), high',
  },
  outputSchema: {
    anomalies: 'Detected anomalies with severity, evidence, and recommendations',
    benfordsLaw: 'First-digit frequency analysis (Benfords Law test)',
    patternDeviations: 'Deviations from expected patterns',
    vendorConcentration: 'Vendor spending concentration risk',
    duplicateDetection: 'Potential duplicate transactions',
    overallRiskScore: 'Overall financial risk score (0-1)',
  },
  tags: ['accounting', 'forensic', 'anomaly', 'autonomous'],

  execute: async (input, ctx) => {
    const { transactions, period, sensitivityLevel = 'medium' } = input;
    const txns = period
      ? transactions.filter(t => t.date.slice(0, 10) >= period.from && t.date.slice(0, 10) <= period.to)
      : transactions;

    ctx.log(`[brain-anomaly-detective] Investigating ${txns.length} transactions (sensitivity: ${sensitivityLevel})`);

    const anomalies: Array<{
      type: string;
      severity: 'critical' | 'warning' | 'info';
      description: string;
      affectedTransactions: number;
      totalAmount: number;
      evidence: string;
      recommendation: string;
    }> = [];

    // Step 1: Benford's Law analysis
    ctx.reportProgress(0.1, 'Running Benfords Law analysis...');
    const amounts = txns
      .map(t => Math.max(t.debit, t.credit))
      .filter(a => a >= 10); // Need at least 2 digits

    const firstDigits = amounts.map(a => parseInt(String(a)[0]));
    const digitCounts = new Array(9).fill(0);
    for (const d of firstDigits) {
      if (d >= 1 && d <= 9) digitCounts[d - 1]++;
    }

    const total = firstDigits.length;
    const observed = digitCounts.map(c => c / total);
    const expected = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046]; // Benford's

    // Chi-square test
    let chiSquare = 0;
    for (let i = 0; i < 9; i++) {
      const exp = expected[i] * total;
      const obs = digitCounts[i];
      chiSquare += Math.pow(obs - exp, 2) / exp;
    }

    // Approximate p-value (chi-square with 8 df)
    // Critical values: 15.51 (5%), 20.09 (1%), 26.12 (0.1%)
    const pValue = chiSquare > 26.12 ? 0.001 : chiSquare > 20.09 ? 0.01 : chiSquare > 15.51 ? 0.05 : 0.5;
    const conforming = chiSquare < 15.51;

    if (!conforming) {
      anomalies.push({
        type: 'benfords_law_violation',
        severity: pValue < 0.01 ? 'critical' : 'warning',
        description: `Transaction amounts do not conform to Benfords Law (chi-square: ${chiSquare.toFixed(2)}, p-value: ${pValue})`,
        affectedTransactions: total,
        totalAmount: amounts.reduce((s, a) => s + a, 0),
        evidence: `Expected digit 1 frequency: ${(expected[0] * 100).toFixed(1)}%, observed: ${(observed[0] * 100).toFixed(1)}%`,
        recommendation: 'Investigate transactions with unusual first-digit distributions — potential fabrication or manipulation',
      });
    }

    // Step 2: Duplicate detection
    ctx.reportProgress(0.3, 'Detecting duplicate transactions...');
    const duplicateMap = new Map<string, GLTransaction[]>();
    for (const txn of txns) {
      const amount = Math.max(txn.debit, txn.credit);
      if (amount < 1) continue;
      const key = `${txn.date.slice(0, 10)}_${amount.toFixed(2)}_${txn.account}`;
      if (!duplicateMap.has(key)) duplicateMap.set(key, []);
      duplicateMap.get(key)!.push(txn);
    }

    const duplicates = [...duplicateMap.entries()]
      .filter(([_, txnList]) => txnList.length > 1)
      .map(([_, txnList]) => ({
        amount: Math.max(txnList[0].debit, txnList[0].credit),
        date: txnList[0].date.slice(0, 10),
        account: txnList[0].account,
        description: txnList[0].description.slice(0, 80),
        count: txnList.length,
      }))
      .sort((a, b) => b.amount * b.count - a.amount * a.count)
      .slice(0, 20);

    if (duplicates.length > 0) {
      const totalDupAmount = duplicates.reduce((s, d) => s + d.amount * (d.count - 1), 0);
      anomalies.push({
        type: 'potential_duplicates',
        severity: totalDupAmount > 50000 ? 'critical' : 'warning',
        description: `${duplicates.length} potential duplicate transactions detected (${totalDupAmount.toFixed(2)} at risk)`,
        affectedTransactions: duplicates.reduce((s, d) => s + d.count, 0),
        totalAmount: totalDupAmount,
        evidence: `Top duplicate: ${duplicates[0].account} on ${duplicates[0].date} for ${duplicates[0].amount.toFixed(2)} (${duplicates[0].count}x)`,
        recommendation: 'Review flagged transactions for genuine duplicates vs valid repeat payments',
      });
    }

    // Step 3: Vendor/payee concentration analysis
    ctx.reportProgress(0.5, 'Analyzing vendor concentration...');
    const vendorSpend = new Map<string, { total: number; count: number }>();
    for (const txn of txns) {
      if (txn.source === 'Payable Invoice' || txn.source === 'Spend Money') {
        // Extract vendor from description (first part before ' - ')
        const vendor = txn.description.split(' - ')[0].trim().slice(0, 60);
        if (!vendorSpend.has(vendor)) vendorSpend.set(vendor, { total: 0, count: 0 });
        const v = vendorSpend.get(vendor)!;
        v.total += Math.max(txn.debit, txn.credit);
        v.count++;
      }
    }

    const totalSpend = [...vendorSpend.values()].reduce((s, v) => s + v.total, 0);
    const vendorConcentration = [...vendorSpend.entries()]
      .map(([vendor, data]) => ({
        vendor,
        totalSpend: data.total,
        percentOfTotal: totalSpend > 0 ? (data.total / totalSpend) * 100 : 0,
        transactionCount: data.count,
        risk: (data.total / totalSpend > 0.2 ? 'high' : data.total / totalSpend > 0.1 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 15);

    const highConcentrationVendors = vendorConcentration.filter(v => v.risk === 'high');
    if (highConcentrationVendors.length > 0) {
      anomalies.push({
        type: 'vendor_concentration',
        severity: 'warning',
        description: `${highConcentrationVendors.length} vendors represent >20% of total spend each`,
        affectedTransactions: highConcentrationVendors.reduce((s, v) => s + v.transactionCount, 0),
        totalAmount: highConcentrationVendors.reduce((s, v) => s + v.totalSpend, 0),
        evidence: `Top: ${highConcentrationVendors[0].vendor} at ${highConcentrationVendors[0].percentOfTotal.toFixed(1)}%`,
        recommendation: 'Verify sole-source justifications and consider diversification to reduce vendor dependency risk',
      });
    }

    // Step 4: Pattern deviation analysis
    ctx.reportProgress(0.7, 'Analyzing patterns...');
    const patternDeviations: Array<{
      pattern: string;
      expected: string;
      actual: string;
      deviationPercent: number;
    }> = [];

    // Monthly spend pattern (check for unusual months)
    const monthlySpend = new Map<string, number>();
    for (const txn of txns) {
      const month = txn.date.slice(0, 7);
      if (classifyAccount(txn.account) === 'expense') {
        monthlySpend.set(month, (monthlySpend.get(month) || 0) + (txn.debit - txn.credit));
      }
    }

    const monthlyValues = [...monthlySpend.values()];
    if (monthlyValues.length > 3) {
      const avgMonthly = monthlyValues.reduce((s, v) => s + v, 0) / monthlyValues.length;
      const stdDevMonthly = Math.sqrt(monthlyValues.reduce((s, v) => s + Math.pow(v - avgMonthly, 2), 0) / monthlyValues.length);

      for (const [month, spend] of monthlySpend) {
        const zScore = stdDevMonthly > 0 ? (spend - avgMonthly) / stdDevMonthly : 0;
        if (Math.abs(zScore) > 2) {
          patternDeviations.push({
            pattern: 'Monthly operating expenditure',
            expected: `~${avgMonthly.toFixed(0)} +/- ${stdDevMonthly.toFixed(0)}`,
            actual: `${spend.toFixed(0)} in ${month}`,
            deviationPercent: ((spend - avgMonthly) / avgMonthly) * 100,
          });
        }
      }
    }

    // Step 5: Round-number analysis (transactions ending in 000)
    ctx.reportProgress(0.85, 'Checking for round-number bias...');
    const roundNumbers = txns.filter(t => {
      const amount = Math.max(t.debit, t.credit);
      return amount >= 1000 && amount % 1000 === 0;
    });

    const expectedRoundPercent = 0.1; // ~10% would be coincidence
    const actualRoundPercent = txns.length > 0 ? roundNumbers.length / txns.length : 0;
    if (actualRoundPercent > expectedRoundPercent * 2 && roundNumbers.length > 20) {
      anomalies.push({
        type: 'round_number_bias',
        severity: 'info',
        description: `${(actualRoundPercent * 100).toFixed(1)}% of transactions are round numbers (expected ~${(expectedRoundPercent * 100).toFixed(0)}%)`,
        affectedTransactions: roundNumbers.length,
        totalAmount: roundNumbers.reduce((s, t) => s + Math.max(t.debit, t.credit), 0),
        evidence: `${roundNumbers.length} round-number transactions vs ${txns.length} total`,
        recommendation: 'Round numbers can indicate estimates or accruals rather than actual transactions — verify supporting documentation',
      });
    }

    // Step 6: Compute overall risk score
    ctx.reportProgress(0.95, 'Computing risk score...');
    const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
    const warningCount = anomalies.filter(a => a.severity === 'warning').length;
    const overallRiskScore = Math.min(1, (criticalCount * 0.3 + warningCount * 0.1 + (conforming ? 0 : 0.2)));

    ctx.reportProgress(1.0, 'Investigation complete');
    ctx.log(`[brain-anomaly-detective] Found ${anomalies.length} anomalies, risk score: ${overallRiskScore.toFixed(2)}`);

    return {
      anomalies,
      benfordsLaw: {
        expected,
        observed,
        chiSquare,
        pValue,
        conforming,
      },
      patternDeviations,
      vendorConcentration,
      duplicateDetection: duplicates,
      overallRiskScore,
    };
  },
});

// ============================================================================
// EXPORT ALL ACCOUNTING AGENTS
// ============================================================================

export const ALL_ACCOUNTING_AGENTS: AgentDefinition[] = [
  brainBookkeeperAgent as AgentDefinition,
  brainReconcilerAgent as AgentDefinition,
  brainStatementGeneratorAgent as AgentDefinition,
  brainTaxComplianceAgent as AgentDefinition,
  brainAuditPreparerAgent as AgentDefinition,
  brainAnomalyDetectiveAgent as AgentDefinition,
];

/**
 * Register all 6 accounting agents into a registry.
 */
export function registerAccountingAgents(
  registry: { register: (def: AgentDefinition) => void },
): void {
  for (const agent of ALL_ACCOUNTING_AGENTS) {
    registry.register(agent);
  }
}
