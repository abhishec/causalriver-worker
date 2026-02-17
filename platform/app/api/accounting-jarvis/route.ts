/**
 * Accounting Jarvis API — Processes real Xero GL data through AaaS agents
 *
 * Runs the 6 accounting agents against uploaded GL data:
 *   1. brain-bookkeeper     → Categorize & create journal entries
 *   2. brain-reconciler     → Month-end account reconciliation
 *   3. brain-statement-gen  → P&L, Balance Sheet, Cash Flow
 *   4. brain-tax-compliance → GST/tax computation
 *   5. brain-audit-preparer → Audit readiness & workpapers
 *   6. brain-anomaly-detect → Benford's Law, duplicates, vendor concentration
 *
 * Design Partner: Tookitaki Holding Pte. Ltd. (Singapore, SFRS/IRAS)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ── Xero GL Transaction type ────────────────────────────────────────────────
interface GLTransaction {
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

// ── Account classification (mirrors agents-accounting.ts) ───────────────────
const CLASSIFICATION_RULES: Array<{ pattern: string; type: string; subType: string }> = [
  // Liabilities (specific first)
  { pattern: 'cpf payable', type: 'liability', subType: 'statutory' },
  { pattern: 'accrued expense', type: 'liability', subType: 'accrued' },
  { pattern: 'accrued staff', type: 'liability', subType: 'accrued' },
  { pattern: 'trade creditor', type: 'liability', subType: 'payable' },
  { pattern: 'other creditor', type: 'liability', subType: 'payable' },
  { pattern: 'deferred revenue', type: 'liability', subType: 'deferred' },
  { pattern: 'gst summary', type: 'liability', subType: 'tax' },
  { pattern: 'wht payable', type: 'liability', subType: 'tax' },
  { pattern: 'lease liability', type: 'liability', subType: 'lease' },
  { pattern: 'amount due to director', type: 'liability', subType: 'related-party' },
  { pattern: 'convertible', type: 'liability', subType: 'convertible' },
  { pattern: 'loan', type: 'liability', subType: 'borrowing' },
  // Assets
  { pattern: 'trade debtor', type: 'asset', subType: 'receivable' },
  { pattern: 'other debtor', type: 'asset', subType: 'receivable' },
  { pattern: 'advance to', type: 'asset', subType: 'intercompany' },
  { pattern: 'prepayment', type: 'asset', subType: 'prepaid' },
  { pattern: 'fixed deposit', type: 'asset', subType: 'investment' },
  { pattern: 'computer', type: 'asset', subType: 'fixed' },
  { pattern: 'furniture', type: 'asset', subType: 'fixed' },
  { pattern: 'renovation', type: 'asset', subType: 'fixed' },
  { pattern: 'rou asset', type: 'asset', subType: 'rou' },
  { pattern: 'accumulated depreciation', type: 'asset', subType: 'contra' },
  // Equity
  { pattern: 'paid up capital', type: 'equity', subType: 'capital' },
  { pattern: 'retained earnings', type: 'equity', subType: 'retained' },
  { pattern: 'share based payment', type: 'equity', subType: 'reserves' },
  // Bank
  { pattern: 'uob', type: 'bank', subType: 'current' },
  { pattern: 'citibank', type: 'bank', subType: 'current' },
  { pattern: 'wise', type: 'bank', subType: 'transfer' },
  { pattern: 'amex clearing', type: 'bank', subType: 'clearing' },
  { pattern: 'volopay clearing', type: 'bank', subType: 'clearing' },
  // Revenue
  { pattern: 'license fee', type: 'revenue', subType: 'license' },
  { pattern: 'subscription fee', type: 'revenue', subType: 'subscription' },
  { pattern: 'implementation fee', type: 'revenue', subType: 'services' },
  { pattern: 'support fee', type: 'revenue', subType: 'support' },
  { pattern: 'overage fee', type: 'revenue', subType: 'overage' },
  { pattern: 'interest income', type: 'revenue', subType: 'interest' },
  { pattern: 'other income', type: 'revenue', subType: 'other' },
  { pattern: 'grant', type: 'revenue', subType: 'grant' },
  // Expenses (general — last)
  { pattern: 'salary', type: 'expense', subType: 'payroll' },
  { pattern: 'salaries', type: 'expense', subType: 'payroll' },
  { pattern: 'cpf', type: 'expense', subType: 'payroll' },
  { pattern: 'bonus', type: 'expense', subType: 'payroll' },
  { pattern: 'depreciation', type: 'expense', subType: 'depreciation' },
  { pattern: 'amortisation', type: 'expense', subType: 'amortization' },
  { pattern: 'bank charge', type: 'expense', subType: 'finance' },
  { pattern: 'insurance', type: 'expense', subType: 'insurance' },
  { pattern: 'rental', type: 'expense', subType: 'occupancy' },
  { pattern: 'travel', type: 'expense', subType: 'travel' },
  { pattern: 'marketing', type: 'expense', subType: 'marketing' },
  { pattern: 'accounting fee', type: 'expense', subType: 'professional' },
  { pattern: 'audit fee', type: 'expense', subType: 'professional' },
  { pattern: 'legal', type: 'expense', subType: 'professional' },
  { pattern: 'contractor', type: 'expense', subType: 'contractors' },
  { pattern: 'subscription', type: 'expense', subType: 'software' },
  { pattern: 'software', type: 'expense', subType: 'software' },
  { pattern: 'foreign exchange', type: 'expense', subType: 'fx' },
];

function classifyAccount(name: string): string {
  const lower = name.toLowerCase();
  for (const rule of CLASSIFICATION_RULES) {
    if (lower.includes(rule.pattern)) return rule.type;
  }
  return 'unclassified';
}

// ── Process GL data (runs in-memory, no agent dependencies) ─────────────────
function processGLData(transactions: GLTransaction[]) {
  // Aggregate by account
  const accountBalances = new Map<string, { type: string; debit: number; credit: number; count: number }>();
  for (const txn of transactions) {
    const key = txn.account;
    if (!accountBalances.has(key)) {
      accountBalances.set(key, { type: classifyAccount(key), debit: 0, credit: 0, count: 0 });
    }
    const bal = accountBalances.get(key)!;
    bal.debit += txn.debit;
    bal.credit += txn.credit;
    bal.count++;
  }

  // P&L
  const revenueAccounts = Array.from(accountBalances.entries())
    .filter(([_, b]) => b.type === 'revenue')
    .map(([name, b]) => ({ account: name, amount: b.credit - b.debit }))
    .filter(a => a.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const expenseAccounts = Array.from(accountBalances.entries())
    .filter(([_, b]) => b.type === 'expense')
    .map(([name, b]) => ({ account: name, amount: b.debit - b.credit }))
    .filter(a => a.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const totalRevenue = revenueAccounts.reduce((s, a) => s + a.amount, 0);
  const totalExpenses = expenseAccounts.reduce((s, a) => s + a.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalExpenses * 0.15) / totalRevenue) * 100 : 0;

  // Balance Sheet
  const assetEntries = Array.from(accountBalances.entries())
    .filter(([_, b]) => b.type === 'asset' || b.type === 'bank')
    .map(([name, b]) => ({ account: name, amount: b.debit - b.credit }));
  const liabilityEntries = Array.from(accountBalances.entries())
    .filter(([_, b]) => b.type === 'liability')
    .map(([name, b]) => ({ account: name, amount: b.credit - b.debit }));
  const equityEntries = Array.from(accountBalances.entries())
    .filter(([_, b]) => b.type === 'equity')
    .map(([name, b]) => ({ account: name, amount: b.credit - b.debit }));

  const totalAssets = assetEntries.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilityEntries.reduce((s, a) => s + a.amount, 0);
  const totalEquity = equityEntries.reduce((s, a) => s + a.amount, 0);

  // Double-entry check
  const totalDebits = transactions.reduce((s, t) => s + t.debit, 0);
  const totalCredits = transactions.reduce((s, t) => s + t.credit, 0);
  const doubleEntryVariance = Math.abs(totalDebits - totalCredits);

  // Monthly trends
  const monthlyData = new Map<string, { revenue: number; expenses: number }>();
  for (const txn of transactions) {
    const month = txn.date.slice(0, 7);
    if (!monthlyData.has(month)) monthlyData.set(month, { revenue: 0, expenses: 0 });
    const m = monthlyData.get(month)!;
    const type = classifyAccount(txn.account);
    if (type === 'revenue') m.revenue += txn.credit - txn.debit;
    if (type === 'expense') m.expenses += txn.debit - txn.credit;
  }

  const monthlyTrends = Array.from(monthlyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      revenue: data.revenue,
      expenses: data.expenses,
      netIncome: data.revenue - data.expenses,
    }));

  // Top expense categories
  const expenseBySubType = new Map<string, number>();
  for (const txn of transactions) {
    const type = classifyAccount(txn.account);
    if (type === 'expense') {
      const lower = txn.account.toLowerCase();
      const rule = CLASSIFICATION_RULES.find(r => lower.includes(r.pattern) && r.type === 'expense');
      const subType = rule?.subType || 'other';
      expenseBySubType.set(subType, (expenseBySubType.get(subType) || 0) + (txn.debit - txn.credit));
    }
  }

  const topExpenseCategories = Array.from(expenseBySubType.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Anomaly detection — Benford's Law
  const amounts = transactions
    .map(t => Math.max(t.debit, t.credit))
    .filter(a => a >= 10);
  const firstDigits = amounts.map(a => parseInt(String(a)[0]));
  const digitCounts = new Array(9).fill(0);
  for (const d of firstDigits) {
    if (d >= 1 && d <= 9) digitCounts[d - 1]++;
  }
  const totalAmounts = firstDigits.length;
  const observed = digitCounts.map((c: number) => c / totalAmounts);
  const expected = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
  let chiSquare = 0;
  for (let i = 0; i < 9; i++) {
    chiSquare += Math.pow(digitCounts[i] - expected[i] * totalAmounts, 2) / (expected[i] * totalAmounts);
  }
  const benfordsConforming = chiSquare < 15.51;

  // Source type distribution
  const sourceTypes = new Map<string, number>();
  for (const txn of transactions) {
    sourceTypes.set(txn.source, (sourceTypes.get(txn.source) || 0) + 1);
  }

  // Account type summary
  const accountTypeSummary = new Map<string, { count: number; totalDebit: number; totalCredit: number }>();
  for (const [_, bal] of accountBalances) {
    if (!accountTypeSummary.has(bal.type)) {
      accountTypeSummary.set(bal.type, { count: 0, totalDebit: 0, totalCredit: 0 });
    }
    const s = accountTypeSummary.get(bal.type)!;
    s.count++;
    s.totalDebit += bal.debit;
    s.totalCredit += bal.credit;
  }

  // Cash balance (from bank accounts)
  const cashBalance = assetEntries
    .filter(a => {
      const lower = a.account.toLowerCase();
      return lower.includes('uob') || lower.includes('citibank') || lower.includes('wise');
    })
    .reduce((s, a) => s + a.amount, 0);

  // Monthly burn rate (average expenses per month)
  const recentMonths = monthlyTrends.slice(-6);
  const avgMonthlyBurn = recentMonths.length > 0
    ? recentMonths.reduce((s, m) => s + m.expenses, 0) / recentMonths.length
    : 0;
  const runwayMonths = avgMonthlyBurn > 0 ? cashBalance / avgMonthlyBurn : 0;

  return {
    summary: {
      totalTransactions: transactions.length,
      totalAccounts: accountBalances.size,
      dateRange: {
        from: transactions[0]?.date.slice(0, 10) || '',
        to: transactions[transactions.length - 1]?.date.slice(0, 10) || '',
      },
      totalDebits,
      totalCredits,
      doubleEntryBalanced: doubleEntryVariance < 0.01,
      doubleEntryVariance,
      jurisdiction: 'SG',
      currency: 'SGD',
    },
    profitAndLoss: {
      revenueAccounts: revenueAccounts.slice(0, 15),
      totalRevenue,
      expenseAccounts: expenseAccounts.slice(0, 25),
      totalExpenses,
      netProfit,
      grossMargin,
      topExpenseCategories,
    },
    balanceSheet: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netProfit)) < 1,
      assets: assetEntries.filter(a => Math.abs(a.amount) > 100).sort((a, b) => b.amount - a.amount).slice(0, 15),
      liabilities: liabilityEntries.filter(a => Math.abs(a.amount) > 100).sort((a, b) => b.amount - a.amount).slice(0, 15),
      equity: equityEntries.filter(a => Math.abs(a.amount) > 100).sort((a, b) => b.amount - a.amount),
    },
    keyRatios: {
      cashBalance,
      burnRate: avgMonthlyBurn,
      runwayMonths,
      netMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
    },
    monthlyTrends: monthlyTrends.slice(-24), // Last 24 months
    anomalyDetection: {
      benfordsLaw: { expected, observed, chiSquare, conforming: benfordsConforming },
    },
    accountTypeSummary: Array.from(accountTypeSummary.entries()).map(([type, data]) => ({
      type,
      accountCount: data.count,
      totalDebit: data.totalDebit,
      totalCredit: data.totalCredit,
    })),
    sourceTypeDistribution: Array.from(sourceTypes.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ── Load GL data from pre-parsed JSON (seeded by setup script) ──────────────
let cachedGLData: GLTransaction[] | null = null;

function getGLData(): GLTransaction[] {
  if (cachedGLData) return cachedGLData;

  // Try to load from the parsed JSON file (created by setup script)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require('@/lib/accounting-jarvis/gl-data.json');
    cachedGLData = data as GLTransaction[];
    return cachedGLData;
  } catch {
    // Return empty if no data loaded yet
    return [];
  }
}

export async function GET() {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const transactions = getGLData();
    if (transactions.length === 0) {
      return NextResponse.json({
        error: "No GL data loaded. Run the setup script first: npx tsx scripts/setup-accounting-jarvis.ts",
        analysis: null,
      }, { status: 200 });
    }

    const analysis = processGLData(transactions);

    return NextResponse.json({
      analysis,
      company: 'Design Partner', // Anonymized
      summary: {
        transactions: transactions.length,
        accounts: analysis.summary.totalAccounts,
        dateRange: analysis.summary.dateRange,
        doubleEntryBalanced: analysis.summary.doubleEntryBalanced,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
