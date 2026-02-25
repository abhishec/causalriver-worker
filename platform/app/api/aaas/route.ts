/**
 * AAAS API — Brain-Connected Accounting Intelligence
 *
 * GET  /api/aaas — Raw GL analysis (deterministic in-memory)
 * POST /api/aaas — Brain-connected agent execution via SSE streaming
 *
 * POST runs the 6 accounting agents + V9 causal accountant against GL data:
 *   1. brain-bookkeeper       → Categorize & create journal entries
 *   2. brain-reconciler       → Month-end account reconciliation
 *   3. brain-statement-gen    → P&L, Balance Sheet, Cash Flow
 *   4. brain-tax-compliance   → GST/tax computation
 *   5. brain-audit-preparer   → Audit readiness & workpapers
 *   6. brain-anomaly-detect   → Transaction pattern analysis, duplicates, vendor concentration
 *   7. brain-causal-accountant → V9: Standard accounting + NexusBrain causal overlay
 *
 * Every execution feeds back into the Brain (signal + prediction + evolution).
 * Cross-service intelligence: AAS anomalies show up in Copilot context.
 *
 * Design Partner: Tookitaki Holding Pte. Ltd. (Singapore, SFRS/IRAS)
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { executeAccountingAgent, type AccountingAction } from "@/lib/aas/domain-executor";
import { saveArtifact } from "@/lib/se-aas/job-queue";
import { generateTransactionInterpretations as generateInterpretations } from "@/lib/aas/transaction-interpretations";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 120s for agent execution

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
  // ── Sort transactions by date for period splitting ─────────────────────────
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  // ── Split into current vs prior period ────────────────────────────────────
  // Current period = last 12 months of data; Prior period = 12 months before that.
  // If less than 24 months of data exist, split in half for the comparison.
  const allDates = sorted.map(t => t.date.slice(0, 7)); // YYYY-MM
  const uniqueMonths = [...new Set(allDates)].sort();
  const halfIdx = Math.floor(uniqueMonths.length / 2);
  const splitMonth = uniqueMonths[halfIdx] || '';
  const priorTxns = splitMonth ? sorted.filter(t => t.date.slice(0, 7) < splitMonth) : [];
  const currentTxns = splitMonth ? sorted.filter(t => t.date.slice(0, 7) >= splitMonth) : sorted;

  // Helper: aggregate a set of transactions into account balances
  function aggregateBalances(txns: GLTransaction[]) {
    const map = new Map<string, { type: string; debit: number; credit: number; count: number }>();
    for (const txn of txns) {
      const key = txn.account;
      if (!map.has(key)) map.set(key, { type: classifyAccount(key), debit: 0, credit: 0, count: 0 });
      const bal = map.get(key)!;
      bal.debit += txn.debit;
      bal.credit += txn.credit;
      bal.count++;
    }
    return map;
  }

  // Aggregate by account (full dataset for backward-compatible outputs)
  const accountBalances = aggregateBalances(sorted);
  const currentBalances = aggregateBalances(currentTxns);
  const priorBalances = aggregateBalances(priorTxns);

  // Helper: compute P&L from a balances map
  function computePnL(balances: Map<string, { type: string; debit: number; credit: number; count: number }>) {
    const rev = Array.from(balances.entries())
      .filter(([_, b]) => b.type === 'revenue')
      .map(([name, b]) => ({ account: name, amount: b.credit - b.debit }))
      .filter(a => a.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
    const exp = Array.from(balances.entries())
      .filter(([_, b]) => b.type === 'expense')
      .map(([name, b]) => ({ account: name, amount: b.debit - b.credit }))
      .filter(a => a.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
    const totalRev = rev.reduce((s, a) => s + a.amount, 0);
    const totalExp = exp.reduce((s, a) => s + a.amount, 0);
    return { revenueAccounts: rev, expenseAccounts: exp, totalRevenue: totalRev, totalExpenses: totalExp, netProfit: totalRev - totalExp };
  }

  const currentPnL = computePnL(currentBalances);
  const priorPnL = computePnL(priorBalances);

  // ── Prior-period comparison ────────────────────────────────────────────────
  const revenueVariance = currentPnL.totalRevenue - priorPnL.totalRevenue;
  const revenueVariancePct = priorPnL.totalRevenue > 0 ? (revenueVariance / priorPnL.totalRevenue) * 100 : 0;
  const expenseVariance = currentPnL.totalExpenses - priorPnL.totalExpenses;
  const expenseVariancePct = priorPnL.totalExpenses > 0 ? (expenseVariance / priorPnL.totalExpenses) * 100 : 0;
  const profitVariance = currentPnL.netProfit - priorPnL.netProfit;
  const profitVariancePct = priorPnL.netProfit !== 0 ? (profitVariance / Math.abs(priorPnL.netProfit)) * 100 : 0;

  // Auto-commentary on significant movements (≥20% threshold per spec)
  const autoCommentary: string[] = [];
  if (Math.abs(revenueVariancePct) >= 20) {
    autoCommentary.push(`Revenue ${revenueVariancePct > 0 ? 'grew' : 'declined'} ${Math.abs(revenueVariancePct).toFixed(1)}% vs prior period — ${revenueVariancePct > 0 ? 'positive momentum in ARR/licensing' : 'investigate customer churn or timing of renewals'}.`);
  }
  if (Math.abs(expenseVariancePct) >= 20) {
    autoCommentary.push(`Expenses ${expenseVariancePct > 0 ? 'increased' : 'decreased'} ${Math.abs(expenseVariancePct).toFixed(1)}% vs prior period — ${expenseVariancePct > 0 ? 'review headcount, vendor or one-time costs' : 'cost efficiencies achieved'}.`);
  }
  if (Math.abs(profitVariancePct) >= 20 && priorPnL.netProfit !== 0) {
    autoCommentary.push(`Net profit ${profitVariancePct > 0 ? 'improved' : 'declined'} ${Math.abs(profitVariancePct).toFixed(1)}% vs prior period.`);
  }
  if (autoCommentary.length === 0) {
    autoCommentary.push('Financial performance is broadly consistent with the prior period. No significant movements (≥20%) detected.');
  }

  const priorPeriodComparison = {
    currentPeriodMonths: uniqueMonths.slice(halfIdx),
    priorPeriodMonths: uniqueMonths.slice(0, halfIdx),
    current: {
      totalRevenue: currentPnL.totalRevenue,
      totalExpenses: currentPnL.totalExpenses,
      netProfit: currentPnL.netProfit,
    },
    prior: {
      totalRevenue: priorPnL.totalRevenue,
      totalExpenses: priorPnL.totalExpenses,
      netProfit: priorPnL.netProfit,
    },
    variance: {
      revenue: revenueVariance,
      revenuePct: revenueVariancePct,
      expenses: expenseVariance,
      expensesPct: expenseVariancePct,
      netProfit: profitVariance,
      netProfitPct: profitVariancePct,
    },
    autoCommentary,
    hasEnoughData: priorTxns.length > 0,
  };

  // P&L (full dataset — backward compatible)
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
  // Gross margin: (Revenue - COGS) / Revenue. We approximate COGS as direct cost-of-sales
  // accounts (hosting, infrastructure, third-party services). Fall back to 0 if no COGS found.
  const cogsAccounts = expenseAccounts.filter(a =>
    /hosting|infrastructure|server|cloud|cogs|cost.of.sale|third.party|aws|gcp|azure/i.test(a.account)
  );
  const totalCOGS = cogsAccounts.reduce((s, a) => s + a.amount, 0);
  const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCOGS) / totalRevenue) * 100 : 0;

  // ── EBITDA: Net Profit + Depreciation + Amortisation + Interest/Finance Costs ──
  const depreciationAmount = expenseAccounts
    .filter(a => /depreciation/i.test(a.account))
    .reduce((s, a) => s + a.amount, 0);
  const amortisationAmount = expenseAccounts
    .filter(a => /amortis/i.test(a.account))
    .reduce((s, a) => s + a.amount, 0);
  const interestExpense = expenseAccounts
    .filter(a => /interest expense|bank charge|finance cost/i.test(a.account))
    .reduce((s, a) => s + a.amount, 0);
  const ebitda = netProfit + depreciationAmount + amortisationAmount + interestExpense;

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

  // Anomaly detection — Transaction Pattern Analysis
  const amounts = transactions
    .map(t => Math.max(t.debit, t.credit))
    .filter(a => a >= 10);
  const firstDigits = amounts.map(a => parseInt(String(a)[0]));
  const digitCounts = new Array(9).fill(0);
  for (const d of firstDigits) {
    if (d >= 1 && d <= 9) digitCounts[d - 1]++;
  }
  const totalAmounts = firstDigits.length;
  const expected = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
  let chiSquare = 0;
  let benfordsConforming = true;
  const observed = totalAmounts > 0
    ? digitCounts.map((c: number) => c / totalAmounts)
    : new Array(9).fill(0);
  if (totalAmounts > 0) {
    for (let i = 0; i < 9; i++) {
      chiSquare += Math.pow(digitCounts[i] - expected[i] * totalAmounts, 2) / (expected[i] * totalAmounts);
    }
    benfordsConforming = chiSquare < 15.51;
  }

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

  // ── 20% Balance Movement Alerts (Spec: Function 01 automated check) ────────
  // Compare current-period vs prior-period account balances.
  // Flag any account where balance moved ≥20% — requires human review.
  const balanceMovementAlerts: Array<{
    account: string;
    accountType: string;
    currentBalance: number;
    priorBalance: number;
    movementPct: number;
    direction: 'increase' | 'decrease';
    severity: 'critical' | 'high' | 'medium';
    narrative: string;
  }> = [];

  if (priorTxns.length > 0) {
    for (const [acct, curBal] of currentBalances) {
      const priorBal = priorBalances.get(acct);
      if (!priorBal) continue;

      const type = curBal.type;
      // Net balance by account type (assets/bank: debit-credit; liabilities/equity/rev: credit-debit)
      const curNet = (type === 'asset' || type === 'bank' || type === 'expense')
        ? curBal.debit - curBal.credit
        : curBal.credit - curBal.debit;
      const priorNet = (type === 'asset' || type === 'bank' || type === 'expense')
        ? priorBal.debit - priorBal.credit
        : priorBal.credit - priorBal.debit;

      if (Math.abs(priorNet) < 100) continue; // skip dust balances

      const movPct = ((curNet - priorNet) / Math.abs(priorNet)) * 100;
      if (Math.abs(movPct) < 20) continue;

      const direction = movPct > 0 ? 'increase' : 'decrease';
      const absPct = Math.abs(movPct);
      const severity: 'critical' | 'high' | 'medium' = absPct >= 100 ? 'critical' : absPct >= 50 ? 'high' : 'medium';

      // Build alert narrative
      const fmtAmt = (n: number) => `SGD ${Math.abs(n).toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      let narrative = '';
      if (type === 'revenue') {
        narrative = direction === 'increase'
          ? `Revenue account "${acct}" increased ${absPct.toFixed(0)}% vs prior period (${fmtAmt(priorNet)} → ${fmtAmt(curNet)}). Verify against invoices and deferred revenue schedule.`
          : `Revenue account "${acct}" declined ${absPct.toFixed(0)}% vs prior period. Investigate customer churn, delayed renewals, or recognition timing.`;
      } else if (type === 'expense') {
        narrative = direction === 'increase'
          ? `Expense account "${acct}" increased ${absPct.toFixed(0)}% — review for new headcount, one-time costs, or vendor price changes.`
          : `Expense account "${acct}" decreased ${absPct.toFixed(0)}% — confirm this reflects genuine savings, not missed accruals.`;
      } else if (type === 'asset' || type === 'bank') {
        narrative = `Asset/bank account "${acct}" moved ${absPct.toFixed(0)}% ${direction}. ${severity === 'critical' ? 'Significant cash movement — verify against bank statement.' : 'Review supporting documentation.'}`;
      } else if (type === 'liability') {
        narrative = direction === 'increase'
          ? `Liability "${acct}" increased ${absPct.toFixed(0)}% — verify new obligations are properly authorised and disclosed.`
          : `Liability "${acct}" decreased ${absPct.toFixed(0)}% — confirm settlement is complete and no residual obligations remain.`;
      } else {
        narrative = `Account "${acct}" (${type}) moved ${absPct.toFixed(0)}% ${direction} vs prior period. Review for completeness and accuracy.`;
      }

      balanceMovementAlerts.push({
        account: acct,
        accountType: type,
        currentBalance: curNet,
        priorBalance: priorNet,
        movementPct: movPct,
        direction,
        severity,
        narrative,
      });
    }

    // Sort: critical first, then high, then medium; within each, largest absolute movement first
    balanceMovementAlerts.sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2 };
      if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
      return Math.abs(b.movementPct) - Math.abs(a.movementPct);
    });
  }

  // ── Transaction Interpretations — natural-language narrative per transaction ─
  // Top 30 transactions by value, each with a plain-English explanation of what
  // the transaction means in business terms. This is the key Req 1 deliverable
  // that the design partner will specifically look for.
  const transactionInterpretations = generateInterpretations(transactions as any, accountBalances);

  return {
    summary: {
      totalTransactions: transactions.length,
      totalAccounts: accountBalances.size,
      dateRange: {
        from: sorted[0]?.date.slice(0, 10) || '',
        to: sorted[sorted.length - 1]?.date.slice(0, 10) || '',
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
      ebitda,
      depreciationAmount,
      amortisationAmount,
      interestExpense,
      grossMargin,
      topExpenseCategories,
    },
    priorPeriodComparison,
    balanceMovementAlerts: balanceMovementAlerts.slice(0, 20), // Top 20 alerts
    balanceSheet: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
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
      transactionPatternAnalysis: { expected, observed, patternConformityScore: chiSquare, conforming: benfordsConforming },
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
    transactionInterpretations,
  };
}

// ── Transaction Interpretation Engine ───────────────────────────────────────
// Generates plain-English narratives per transaction — what it means in
// business terms, not just what the GL says. Top 30 by value are returned.

function generateTransactionInterpretations(
  transactions: GLTransaction[],
  accountBalances: Map<string, { type: string; debit: number; credit: number; count: number }>
): Array<{
  date: string;
  account: string;
  description: string;
  reference: string;
  amount: number;
  direction: 'debit' | 'credit';
  accountType: string;
  narrative: string;
  businessImpact: 'positive' | 'neutral' | 'watch';
  category: string;
}> {
  // Take top 30 transactions by absolute value, deduplicated by reference+account
  const sorted = [...transactions]
    .sort((a, b) => Math.max(b.debit, b.credit) - Math.max(a.debit, a.credit))
    .slice(0, 30);

  return sorted.map(txn => {
    const amount = Math.max(txn.debit, txn.credit);
    const direction: 'debit' | 'credit' = txn.debit >= txn.credit ? 'debit' : 'credit';
    const accountType = classifyAccount(txn.account);
    const acctLower = txn.account.toLowerCase();
    const descLower = (txn.description || '').toLowerCase();
    const amtFmt = `SGD ${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    let narrative = '';
    let businessImpact: 'positive' | 'neutral' | 'watch' = 'neutral';
    let category = accountType;

    // ── Revenue narratives ──
    if (accountType === 'revenue') {
      businessImpact = 'positive';
      if (acctLower.includes('license fee') || acctLower.includes('subscription')) {
        narrative = `Recurring software license/subscription revenue of ${amtFmt} — core ARR contribution. ${txn.reference ? `Ref: ${txn.reference}.` : ''} Customer billing recorded; check deferred revenue schedule if multi-period.`;
        category = 'ARR Revenue';
      } else if (acctLower.includes('implementation') || acctLower.includes('professional')) {
        narrative = `Professional services / implementation revenue of ${amtFmt}. One-time in nature; should not be projected as recurring ARR. Verify POC delivery confirmation in supporting documents.`;
        category = 'Services Revenue';
      } else if (acctLower.includes('grant')) {
        narrative = `Grant income of ${amtFmt} recognised. Verify grant conditions met and no clawback risk. Not reflective of commercial revenue traction — should be excluded from ARR metrics.`;
        category = 'Grant Income';
        businessImpact = 'neutral';
      } else if (acctLower.includes('interest')) {
        narrative = `Interest income of ${amtFmt} earned on cash deposits or fixed deposits. Non-operating income; positive but not a revenue quality indicator.`;
        category = 'Interest Income';
      } else if (acctLower.includes('overage')) {
        narrative = `Overage / usage-based revenue of ${amtFmt}. Positive signal of product adoption beyond contracted limits — consider upsell opportunity.`;
        category = 'Usage Revenue';
      } else {
        narrative = `Revenue of ${amtFmt} from "${txn.account}". ${txn.description ? `Transaction note: ${txn.description}.` : ''} Classify further by revenue stream for accurate ARR tracking.`;
        category = 'Other Revenue';
      }
    }
    // ── Payroll / salary narratives ──
    else if (acctLower.includes('salary') || acctLower.includes('salaries') || acctLower.includes('payroll') || acctLower.includes('bonus')) {
      businessImpact = 'watch';
      category = 'Payroll';
      const isBonus = acctLower.includes('bonus');
      narrative = isBonus
        ? `Bonus / variable compensation payment of ${amtFmt}. One-time cash outflow — verify this is accrual release and performance justification documented. Check CPF contribution computed on bonus amount.`
        : `Payroll disbursement of ${amtFmt}. ${txn.reference ? `Ref: ${txn.reference}. ` : ''}Largest recurring operating expense. Verify headcount matches HR records and CPF contributions filed timely with IRAS.`;
    }
    // ── CPF narratives ──
    else if (acctLower.includes('cpf')) {
      businessImpact = 'neutral';
      category = 'Statutory';
      narrative = `CPF contribution of ${amtFmt} — statutory employer + employee CPF. Must be paid by 14th of following month to avoid IRAS penalty. Verify allocation: OA/SA/MA rates correct for employee age band.`;
    }
    // ── Tax / GST narratives ──
    else if (acctLower.includes('gst') || txn.taxRateName === 'GST on Expenses (9%)' || txn.taxRateName === 'GST on Income (9%)') {
      businessImpact = 'neutral';
      category = 'GST/Tax';
      narrative = direction === 'debit'
        ? `GST input tax of ${amtFmt} (claimable). Recorded as debit to GST Summary — will net against output tax in F5 return. Ensure tax invoice from registered supplier on file.`
        : `GST output tax of ${amtFmt} collected from customer. Credit to GST Summary — payable to IRAS in next filing period. Ensure corresponding tax invoice issued.`;
    }
    // ── Rent / lease narratives ──
    else if (acctLower.includes('rental') || acctLower.includes('lease') || acctLower.includes('rou')) {
      businessImpact = 'neutral';
      category = 'Occupancy';
      narrative = acctLower.includes('rou')
        ? `Right-of-Use asset movement of ${amtFmt} under SFRS(I) 16 lease accounting. Ensure corresponding lease liability amortisation schedule updated. Review for any lease modification events.`
        : `Office rental / occupancy cost of ${amtFmt}. Fixed recurring overhead — verify lease agreement current and renewal date tracked in commitments schedule.`;
    }
    // ── Depreciation narratives ──
    else if (acctLower.includes('depreciation') || acctLower.includes('amortis')) {
      businessImpact = 'neutral';
      category = 'Non-Cash';
      narrative = `Depreciation / amortisation charge of ${amtFmt}. Non-cash expense — adds back in cash flow from operations. Verify fixed asset register updated and method (straight-line/reducing balance) consistently applied under SFRS(I) 16.`;
    }
    // ── Bank / transfer narratives ──
    else if (accountType === 'bank') {
      businessImpact = direction === 'credit' ? 'positive' : 'neutral';
      category = 'Cash Movement';
      narrative = direction === 'credit'
        ? `Cash inflow of ${amtFmt} to ${txn.account}. ${txn.description ? `Source: ${txn.description}.` : ''} Trace to source document (invoice / bank advice) to confirm completeness.`
        : `Cash outflow of ${amtFmt} from ${txn.account}. ${txn.description ? `Purpose: ${txn.description}.` : ''} Verify approved payment mandate and supporting invoice on file.`;
    }
    // ── Intercompany / related party ──
    else if (acctLower.includes('advance to') || acctLower.includes('due to') || acctLower.includes('intercompany')) {
      businessImpact = 'watch';
      category = 'Related Party';
      narrative = `Related-party / intercompany transaction of ${amtFmt}. Auditors will scrutinise: ensure transfer pricing documentation prepared, arm's-length basis confirmed, and IRAS Form C disclosure complete. ${txn.description ? `Note: ${txn.description}.` : ''}`;
    }
    // ── Asset purchases ──
    else if (accountType === 'asset' && direction === 'debit') {
      businessImpact = 'neutral';
      category = 'Capital Expenditure';
      narrative = `Capital expenditure / asset acquisition of ${amtFmt} in ${txn.account}. Verify capitalization policy met (useful life >1 year, cost >materiality threshold). Add to fixed asset register with depreciation start date.`;
    }
    // ── Liabilities ──
    else if (accountType === 'liability') {
      businessImpact = direction === 'credit' ? 'watch' : 'neutral';
      category = 'Liability';
      if (acctLower.includes('deferred revenue')) {
        narrative = `Deferred revenue movement of ${amtFmt}. ${direction === 'credit' ? 'Contract liability increasing — cash received ahead of revenue recognition.' : 'Revenue being recognised from deferred balance — verify delivery milestone met per SFRS(I) 15.'} Update revenue recognition schedule.`;
      } else if (acctLower.includes('accrued')) {
        narrative = `Accrued liability of ${amtFmt} in ${txn.account}. ${direction === 'credit' ? 'Expense incurred but not yet paid — ensure reversing entry scheduled.' : 'Accrual being settled in cash — match to original accrual entry.'} Review for completeness at period close.`;
      } else {
        narrative = `Liability movement of ${amtFmt} in ${txn.account}. ${direction === 'credit' ? 'Obligation increasing.' : 'Obligation being settled.'} ${txn.description ? `Context: ${txn.description}.` : ''} Confirm balance matches counterparty confirmation.`;
      }
    }
    // ── Foreign exchange ──
    else if (acctLower.includes('foreign exchange') || acctLower.includes('forex') || acctLower.includes('fx')) {
      businessImpact = Math.max(txn.debit, txn.credit) > 10000 ? 'watch' : 'neutral';
      category = 'FX';
      narrative = `Foreign exchange ${direction === 'debit' ? 'loss' : 'gain'} of ${amtFmt}. ${direction === 'debit' ? 'USD/SGD or other currency movement created a loss — review hedging policy.' : 'FX gain recorded.'} Ensure proper mark-to-market at period end for all foreign-currency balances.`;
    }
    // ── Software / SaaS subscriptions ──
    else if (acctLower.includes('software') || acctLower.includes('subscription') && accountType === 'expense') {
      businessImpact = 'neutral';
      category = 'Technology';
      narrative = `Software / SaaS subscription expense of ${amtFmt}. ${txn.description ? `Service: ${txn.description}.` : ''} Verify annual vs monthly billing — prepayments should be captured in prepaid expenses and amortised monthly.`;
    }
    // ── Fallback ──
    else {
      const typeLabel = accountType === 'expense' ? 'operating expense' : accountType === 'equity' ? 'equity movement' : 'transaction';
      narrative = `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} ${typeLabel} of ${amtFmt} in "${txn.account}". ${txn.description ? `Description: ${txn.description}.` : ''} ${txn.source ? `Source: ${txn.source}.` : ''} Review for correct classification and period allocation.`;
      businessImpact = accountType === 'expense' ? 'neutral' : accountType === 'equity' ? 'neutral' : 'neutral';
    }

    return {
      date: txn.date.slice(0, 10),
      account: txn.account,
      description: txn.description,
      reference: txn.reference,
      amount,
      direction,
      accountType,
      narrative,
      businessImpact,
      category,
    };
  });
}

// ── Load GL data (S3 primary → Supabase Storage fallback) ───────────────────
// GL data lives in S3 at {orgId}/gl-data.json (or Supabase Storage as fallback).
// In-memory cache avoids re-downloading 12MB on every request within the same
// serverless invocation.
import { getOrgStorage, isS3Configured } from "@/lib/storage/org-storage";
import { logger } from "@/lib/logger";

const glCache = new Map<string, GLTransaction[]>();

async function getGLDataFromStorage(orgId: string): Promise<GLTransaction[]> {
  if (glCache.has(orgId)) return glCache.get(orgId)!;

  // Try S3 first (primary storage)
  if (isS3Configured()) {
    try {
      const storage = getOrgStorage();
      const transactions = await storage.downloadJSON<GLTransaction[]>(orgId, "gl-data.json");
      glCache.set(orgId, transactions);
      logger.info(`[GL] Loaded ${transactions.length} txns from S3 for org ${orgId}`);
      return transactions;
    } catch (s3Err: any) {
      logger.warn(`[GL] S3 load failed for org ${orgId}, falling back to Supabase:`, s3Err?.message);
    }
  }

  // Fallback: Supabase Storage
  const service = await createServiceClient();
  const storagePath = `${orgId}/gl-data.json`;

  const { data, error } = await service.storage
    .from("org-data")
    .download(storagePath);

  if (error || !data) {
    logger.warn(`[GL] No data in storage for org ${orgId}:`, error?.message);
    return [];
  }

  const text = await data.text();
  let transactions: GLTransaction[];
  try {
    transactions = JSON.parse(text) as GLTransaction[];
  } catch {
    logger.warn(`[GL] Malformed JSON in storage for org ${orgId}`);
    return [];
  }
  glCache.set(orgId, transactions);
  logger.info(`[GL] Loaded ${transactions.length} txns from Supabase Storage for org ${orgId}`);
  return transactions;
}

export async function GET(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve org — check query param or find user's org with GL data
    const url = new URL(request.url);
    let orgId = url.searchParams.get("orgId");

    if (!orgId) {
      // Find user's org memberships and try each for GL data
      const { data: memberships } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id);

      // Also check if platform admin
      const { data: adminCheck } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1);

      const orgIds = memberships?.map((m) => m.organization_id) || [];

      // If platform admin, also include PH Accounting org
      if (adminCheck && adminCheck.length > 0) {
        const { data: phOrg } = await supabase
          .from("organizations")
          .select("id")
          .eq("slug", "ph-accounting")
          .maybeSingle();
        if (phOrg && !orgIds.includes(phOrg.id)) {
          orgIds.push(phOrg.id);
        }
      }

      // Try each org until we find one with GL data
      for (const oid of orgIds) {
        const txns = await getGLDataFromStorage(oid);
        if (txns.length > 0) {
          orgId = oid;
          break;
        }
      }
    }

    if (!orgId) {
      return NextResponse.json({
        error: "No GL data found. Upload Xero GL data first.",
        analysis: null,
      }, { status: 200 });
    }

    const transactions = await getGLDataFromStorage(orgId);
    if (transactions.length === 0) {
      return NextResponse.json({
        error: "No GL data found in storage.",
        analysis: null,
      }, { status: 200 });
    }

    const analysis = processGLData(transactions);

    // Look up org name dynamically (not hardcoded)
    const service = await createServiceClient();
    const { data: org } = await service
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();

    // Check brain availability (non-blocking)
    let brainMetadata: Record<string, unknown> = { connected: false };
    try {
      const { createBrainContextMesh } = await import("@nexus-ai/memory-stack");
      const mesh = createBrainContextMesh({ supabase, organizationId: orgId });
      const universal = await mesh.getUniversalContext();
      brainMetadata = {
        connected: true,
        coldStart: universal.coldStartDetected,
        causalEdges: universal.causalEdges.length,
        patterns: universal.patterns.length,
        intelligenceScore: universal.brainEvolution.intelligenceScore,
        accuracy: universal.brainAccuracy.accuracy,
        isLearning: universal.brainEvolution.isLearning,
      };
    } catch {
      // Brain unavailable — GET still works without it
    }

    return NextResponse.json({
      analysis,
      company: org?.name || "Unknown",
      organizationId: orgId,
      brainMetadata,
      summary: {
        transactions: transactions.length,
        accounts: analysis.summary.totalAccounts,
        dateRange: analysis.summary.dateRange,
        doubleEntryBalanced: analysis.summary.doubleEntryBalanced,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ============================================================================
// POST — Brain-Connected Agent Execution (SSE Streaming)
// ============================================================================

/**
 * POST /api/aaas
 *
 * Body: {
 *   action: 'bookkeep' | 'reconcile' | 'statements' | 'tax' | 'audit' | 'anomaly' | 'causal-analysis' | 'full',
 *   period?: { from: string, to: string },
 *   jurisdiction?: string,
 *   orgId?: string
 * }
 *
 * Response: SSE stream with progress events and final result.
 */
export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const action = (body.action || 'full') as AccountingAction;
    const jurisdiction = body.jurisdiction || 'SG';
    const period = body.period;

    // Resolve org
    let orgId = body.orgId as string | null;
    if (!orgId) {
      const { data: memberships } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id);

      const orgIds = memberships?.map((m) => m.organization_id) || [];
      for (const oid of orgIds) {
        const txns = await getGLDataFromStorage(oid);
        if (txns.length > 0) {
          orgId = oid;
          break;
        }
      }
    }

    if (!orgId) {
      return NextResponse.json({
        error: "No GL data found. Upload Xero GL data first.",
      }, { status: 400 });
    }

    // Load GL transactions
    const transactions = await getGLDataFromStorage(orgId);
    if (transactions.length === 0) {
      return NextResponse.json({
        error: "No GL data found.",
      }, { status: 400 });
    }

    // SSE streaming setup
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });

    const send = (data: string) => {
      controller?.enqueue(encoder.encode(`data: ${data}\n\n`));
    };

    // Run agent execution asynchronously while streaming
    (async () => {
      try {
        send(JSON.stringify({
          type: 'progress',
          progress: 0.05,
          message: `Starting ${action} analysis with Brain context...`,
        }));

        const result = await executeAccountingAgent(supabase, {
          action,
          organizationId: orgId!,
          userId: user.id,
          transactions: transactions as unknown as Array<Record<string, unknown>>,
          period,
          jurisdiction,
          onProgress: (progress: number, message: string) => {
            send(JSON.stringify({ type: 'progress', progress, message }));
          },
        });

        send(JSON.stringify({
          type: 'result',
          data: result.result,
          agentName: result.agentName,
          action: result.action,
          timing: result.timing,
          brainMetadata: result.brainMetadata,
        }));

        // ── Persist artifact to se_aas_artifacts (same framework as SE-AAS) ──
        // Fire-and-forget — never block the SSE stream for artifact persistence
        (async () => {
          try {
            const serviceSupabase = await createServiceClient();
            await saveArtifact(serviceSupabase, {
              organizationId: orgId!,
              domainType: `aas-${action}`,          // e.g. aas-tax, aas-audit, aas-bookkeep
              artifactData: result.result as Record<string, unknown>,
              metadata: {
                agentName: result.agentName,
                action: result.action,
                durationMs: result.timing?.totalMs ?? 0,
                brainAugmented: result.brainMetadata?.brainAugmented ?? false,
                causalEdgesUsed: result.brainMetadata?.causalEdgesUsed ?? 0,
                patternsUsed: result.brainMetadata?.patternsUsed ?? 0,
                intelligenceScore: result.brainMetadata?.intelligenceScore ?? 0,
                federationEnabled: result.brainMetadata?.federationEnabled ?? false,
                jurisdiction,
                service: "AAS",
              },
              createdBy: user.id,
            });
            // ── Notify: AAS analysis complete ──────────────────────────────
            // Insert notification so CFO / stakeholders see it in NotificationBell.
            // The notification API reads cascade_alerts → auto-surfaces within 60s.
            const anomalyCount = ((result.result as any)?.anomalies?.length ??
              (result.result as any)?.causalAnomalies?.length ?? 0);
            const actionLabel = action === 'full' ? 'Full Financial Analysis' :
              action === 'tax' ? 'GST Compliance Review' :
              action === 'audit' ? 'Audit Preparation' :
              action === 'statements' ? 'Financial Statements' :
              action === 'anomaly' ? 'Risk Factor Detection' :
              action.charAt(0).toUpperCase() + action.slice(1);

            const { error: notifErr } = await serviceSupabase.from('cascade_alerts').insert({
              organization_id: orgId!,
              alert_type: 'accounting_report',
              severity: anomalyCount > 3 ? 'high' : anomalyCount > 0 ? 'medium' : 'low',
              message: `${actionLabel} complete. ${
                anomalyCount > 0
                  ? `${anomalyCount} risk factor${anomalyCount > 1 ? 's' : ''} detected — review recommended.`
                  : 'No risk factors detected.'
              } Completed in ${((result.timing?.totalMs ?? 0) / 1000).toFixed(1)}s.`,
              is_read: false,
              metadata: {
                action: result.action,
                agentName: result.agentName,
                durationMs: result.timing?.totalMs ?? 0,
                anomalyCount,
                jurisdiction,
              },
            });
            if (notifErr) {
              logger.warn("[AAS] Notification insert failed (non-fatal):", notifErr?.message);
            }
          } catch (artifactErr: any) {
            // Non-fatal — artifact persistence failure should never break the stream
            logger.warn("[AAS] Artifact persistence failed (non-fatal):", artifactErr?.message);
          }
        })();

        send("[DONE]");
        controller!.close();
      } catch (err) {
        send(JSON.stringify({ type: 'error', error: "Agent execution failed" }));
        send("[DONE]");
        controller!.close();
      }
    })();

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
