/**
 * GET /api/aaas/export?sheet=pl|bs|tb|gst|txns|all
 *
 * Generates a downloadable CSV file from the GL analysis data.
 * This is the "Excel Output Package" from Spec Function 01:
 *   - Trial Balance (tb)
 *   - P&L with prior-period comparison (pl)
 *   - Balance Sheet (bs)
 *   - GST Schedule (gst)
 *   - Transaction Interpretations (txns)
 *   - All sheets combined (all) → multi-section CSV
 *
 * Returns Content-Type: text/csv with a filename header.
 * Opens natively in Excel / Numbers / Google Sheets.
 *
 * Design Partner: Tookitaki Holding Pte. Ltd. (Singapore, SFRS/IRAS)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrgStorage, isS3Configured } from "@/lib/storage/org-storage";

export const dynamic = "force-dynamic";

// ── Types (inline to avoid cross-import issues) ──────────────────────────────

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

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Escape quotes and wrap in quotes if needed
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: (string | number | boolean | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

function csvSection(title: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push(csvRow(headers));
  for (const row of rows) {
    lines.push(csvRow(row));
  }
  lines.push(''); // blank line between sections
  return lines.join('\r\n');
}

// ── Classification (mirrors route.ts) ────────────────────────────────────────

const CLASSIFICATION_RULES: Array<{ pattern: string; type: string }> = [
  { pattern: 'cpf payable', type: 'liability' },
  { pattern: 'accrued expense', type: 'liability' },
  { pattern: 'accrued staff', type: 'liability' },
  { pattern: 'trade creditor', type: 'liability' },
  { pattern: 'other creditor', type: 'liability' },
  { pattern: 'deferred revenue', type: 'liability' },
  { pattern: 'gst summary', type: 'liability' },
  { pattern: 'wht payable', type: 'liability' },
  { pattern: 'lease liability', type: 'liability' },
  { pattern: 'amount due to director', type: 'liability' },
  { pattern: 'convertible', type: 'liability' },
  { pattern: 'loan', type: 'liability' },
  { pattern: 'trade debtor', type: 'asset' },
  { pattern: 'other debtor', type: 'asset' },
  { pattern: 'advance to', type: 'asset' },
  { pattern: 'prepayment', type: 'asset' },
  { pattern: 'fixed deposit', type: 'asset' },
  { pattern: 'computer', type: 'asset' },
  { pattern: 'furniture', type: 'asset' },
  { pattern: 'renovation', type: 'asset' },
  { pattern: 'rou asset', type: 'asset' },
  { pattern: 'accumulated depreciation', type: 'asset' },
  { pattern: 'paid up capital', type: 'equity' },
  { pattern: 'retained earnings', type: 'equity' },
  { pattern: 'share based payment', type: 'equity' },
  { pattern: 'uob', type: 'bank' },
  { pattern: 'citibank', type: 'bank' },
  { pattern: 'wise', type: 'bank' },
  { pattern: 'amex clearing', type: 'bank' },
  { pattern: 'volopay clearing', type: 'bank' },
  { pattern: 'license fee', type: 'revenue' },
  { pattern: 'subscription fee', type: 'revenue' },
  { pattern: 'implementation fee', type: 'revenue' },
  { pattern: 'support fee', type: 'revenue' },
  { pattern: 'overage fee', type: 'revenue' },
  { pattern: 'interest income', type: 'revenue' },
  { pattern: 'other income', type: 'revenue' },
  { pattern: 'grant', type: 'revenue' },
  { pattern: 'salary', type: 'expense' },
  { pattern: 'salaries', type: 'expense' },
  { pattern: 'cpf', type: 'expense' },
  { pattern: 'bonus', type: 'expense' },
  { pattern: 'depreciation', type: 'expense' },
  { pattern: 'amortisation', type: 'expense' },
  { pattern: 'bank charge', type: 'expense' },
  { pattern: 'insurance', type: 'expense' },
  { pattern: 'rental', type: 'expense' },
  { pattern: 'travel', type: 'expense' },
  { pattern: 'marketing', type: 'expense' },
  { pattern: 'accounting fee', type: 'expense' },
  { pattern: 'audit fee', type: 'expense' },
  { pattern: 'legal', type: 'expense' },
  { pattern: 'contractor', type: 'expense' },
  { pattern: 'subscription', type: 'expense' },
  { pattern: 'software', type: 'expense' },
  { pattern: 'foreign exchange', type: 'expense' },
];

function classifyAccount(name: string): string {
  const lower = name.toLowerCase();
  for (const rule of CLASSIFICATION_RULES) {
    if (lower.includes(rule.pattern)) return rule.type;
  }
  return 'unclassified';
}

// ── Build all CSV sections from raw GL transactions ───────────────────────────

function buildCSVExport(transactions: GLTransaction[], company: string): string {
  const sections: string[] = [];
  const now = new Date().toLocaleDateString('en-SG');

  // Header meta
  sections.push([
    `# NexusBrain AAS — Financial Output Package`,
    `# Company: ${company}`,
    `# Generated: ${now}`,
    `# Jurisdiction: SG | Currency: SGD | Standard: SFRS(I)`,
    `# Generated by NexusBrain Accounting as a Service (AAS)`,
    '',
  ].join('\r\n'));

  // ── Aggregate by account ──────────────────────────────────────────────────
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const accountBalances = new Map<string, { type: string; debit: number; credit: number; count: number }>();
  for (const txn of sorted) {
    if (!accountBalances.has(txn.account)) {
      accountBalances.set(txn.account, { type: classifyAccount(txn.account), debit: 0, credit: 0, count: 0 });
    }
    const bal = accountBalances.get(txn.account)!;
    bal.debit += txn.debit;
    bal.credit += txn.credit;
    bal.count++;
  }

  // ── Prior period split ────────────────────────────────────────────────────
  const allMonths = [...new Set(sorted.map(t => t.date.slice(0, 7)))].sort();
  const halfIdx = Math.floor(allMonths.length / 2);
  const splitMonth = allMonths[halfIdx] || '';
  const priorTxns = sorted.filter(t => t.date.slice(0, 7) < splitMonth);
  const currentTxns = sorted.filter(t => t.date.slice(0, 7) >= splitMonth);

  const priorPrior = new Map<string, { debit: number; credit: number }>();
  const priorCurrent = new Map<string, { debit: number; credit: number }>();
  for (const t of priorTxns) {
    const e = priorPrior.get(t.account) || { debit: 0, credit: 0 };
    e.debit += t.debit; e.credit += t.credit;
    priorPrior.set(t.account, e);
  }
  for (const t of currentTxns) {
    const e = priorCurrent.get(t.account) || { debit: 0, credit: 0 };
    e.debit += t.debit; e.credit += t.credit;
    priorCurrent.set(t.account, e);
  }

  const priorLabel = allMonths.slice(0, halfIdx).join(' → ') || 'Prior Period';
  const currentLabel = allMonths.slice(halfIdx).join(' → ') || 'Current Period';

  // ── SECTION 1: Trial Balance ──────────────────────────────────────────────
  const tbRows: (string | number)[][] = [];
  let tbTotalDebit = 0, tbTotalCredit = 0;
  for (const [acct, bal] of accountBalances) {
    tbTotalDebit += bal.debit;
    tbTotalCredit += bal.credit;
    tbRows.push([acct, bal.type, bal.debit.toFixed(2), bal.credit.toFixed(2), (bal.debit - bal.credit).toFixed(2), bal.count]);
  }
  tbRows.push(['TOTAL', '', tbTotalDebit.toFixed(2), tbTotalCredit.toFixed(2), (tbTotalDebit - tbTotalCredit).toFixed(2), '']);
  sections.push(csvSection(
    'TRIAL BALANCE (SFRS)',
    ['Account', 'Type', 'Total Debits (SGD)', 'Total Credits (SGD)', 'Net Balance (SGD)', 'Transaction Count'],
    tbRows,
  ));

  // ── SECTION 2: P&L with Prior-Period Comparison ───────────────────────────
  const plRows: (string | number)[][] = [];

  const getNet = (map: Map<string, { debit: number; credit: number }>, acct: string, type: string) => {
    const b = map.get(acct);
    if (!b) return 0;
    return (type === 'revenue') ? b.credit - b.debit : b.debit - b.credit;
  };

  // Revenue
  plRows.push(['--- REVENUE ---', '', '', '']);
  let totalRevCurrent = 0, totalRevPrior = 0;
  for (const [acct, bal] of accountBalances) {
    if (bal.type !== 'revenue') continue;
    const cur = getNet(priorCurrent, acct, 'revenue');
    const pri = getNet(priorPrior, acct, 'revenue');
    const varPct = pri !== 0 ? ((cur - pri) / Math.abs(pri) * 100) : 0;
    totalRevCurrent += cur;
    totalRevPrior += pri;
    plRows.push([acct, cur.toFixed(2), pri.toFixed(2), `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%`]);
  }
  plRows.push(['TOTAL REVENUE', totalRevCurrent.toFixed(2), totalRevPrior.toFixed(2), `${(totalRevPrior !== 0 ? (totalRevCurrent - totalRevPrior) / Math.abs(totalRevPrior) * 100 : 0).toFixed(1)}%`]);
  plRows.push(['', '', '', '']);

  // Expenses
  plRows.push(['--- EXPENSES ---', '', '', '']);
  let totalExpCurrent = 0, totalExpPrior = 0;
  for (const [acct, bal] of accountBalances) {
    if (bal.type !== 'expense') continue;
    const cur = getNet(priorCurrent, acct, 'expense');
    const pri = getNet(priorPrior, acct, 'expense');
    const varPct = pri !== 0 ? ((cur - pri) / Math.abs(pri) * 100) : 0;
    totalExpCurrent += cur;
    totalExpPrior += pri;
    plRows.push([acct, cur.toFixed(2), pri.toFixed(2), `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%`]);
  }
  plRows.push(['TOTAL EXPENSES', totalExpCurrent.toFixed(2), totalExpPrior.toFixed(2), `${(totalExpPrior !== 0 ? (totalExpCurrent - totalExpPrior) / Math.abs(totalExpPrior) * 100 : 0).toFixed(1)}%`]);
  plRows.push(['', '', '', '']);

  const netCurrent = totalRevCurrent - totalExpCurrent;
  const netPrior = totalRevPrior - totalExpPrior;
  const netVarPct = netPrior !== 0 ? ((netCurrent - netPrior) / Math.abs(netPrior) * 100) : 0;
  plRows.push(['NET PROFIT / (LOSS)', netCurrent.toFixed(2), netPrior.toFixed(2), `${netVarPct >= 0 ? '+' : ''}${netVarPct.toFixed(1)}%`]);

  sections.push(csvSection(
    `PROFIT & LOSS STATEMENT — Prior-Period Comparison`,
    ['Account', `Current Period (${currentLabel}) SGD`, `Prior Period (${priorLabel}) SGD`, 'Variance %'],
    plRows,
  ));

  // ── SECTION 3: Balance Sheet ──────────────────────────────────────────────
  const bsRows: (string | number)[][] = [];
  const bsTypes = [
    { key: 'asset', label: 'ASSETS' },
    { key: 'bank', label: 'BANK / CASH' },
    { key: 'liability', label: 'LIABILITIES' },
    { key: 'equity', label: 'EQUITY' },
  ];
  for (const { key, label } of bsTypes) {
    bsRows.push([`--- ${label} ---`, '']);
    let total = 0;
    for (const [acct, bal] of accountBalances) {
      if (bal.type !== key) continue;
      const net = (key === 'asset' || key === 'bank') ? bal.debit - bal.credit : bal.credit - bal.debit;
      total += net;
      bsRows.push([acct, net.toFixed(2)]);
    }
    bsRows.push([`TOTAL ${label}`, total.toFixed(2)]);
    bsRows.push(['', '']);
  }
  sections.push(csvSection('BALANCE SHEET (SFRS)', ['Account', 'Balance (SGD)'], bsRows));

  // ── SECTION 4: GST F5 Schedule (IRAS) ────────────────────────────────────
  // Compute GST from transaction tax fields
  let outputTax = 0, inputTax = 0, totalTaxableSales = 0, totalTaxablePurchases = 0;
  for (const t of sorted) {
    const isExpense = classifyAccount(t.account) === 'expense';
    const isRevenue = classifyAccount(t.account) === 'revenue';
    if (t.tax > 0) {
      if (isRevenue || t.taxRateName?.toLowerCase().includes('income')) {
        outputTax += t.tax;
        totalTaxableSales += t.credit || t.debit;
      } else if (isExpense || t.taxRateName?.toLowerCase().includes('expense')) {
        inputTax += t.tax;
        totalTaxablePurchases += t.debit || t.credit;
      }
    }
  }

  // Fallback: derive from total revenue @ 9% if no tax fields populated
  const totalRev = Array.from(accountBalances.entries())
    .filter(([_, b]) => b.type === 'revenue')
    .reduce((s, [_, b]) => s + (b.credit - b.debit), 0);
  if (outputTax === 0 && totalRev > 0) {
    outputTax = totalRev * 0.09;
    totalTaxableSales = totalRev;
  }
  const totalExp = Array.from(accountBalances.entries())
    .filter(([_, b]) => b.type === 'expense')
    .reduce((s, [_, b]) => s + (b.debit - b.credit), 0);
  if (inputTax === 0 && totalExp > 0) {
    inputTax = totalExp * 0.09;
    totalTaxablePurchases = totalExp;
  }
  const netGST = outputTax - inputTax;
  const totalSupplies = totalTaxableSales;

  const gstRows: (string | number)[][] = [
    ['--- PART I: GST ON SUPPLIES ---', ''],
    ['Box 1: Standard-Rated Supplies', totalTaxableSales.toFixed(2)],
    ['Box 2: Zero-Rated Supplies', '0.00'],
    ['Box 3: Exempt Supplies', '0.00'],
    ['Box 4: Total Value of Supplies (Box 1+2+3)', totalSupplies.toFixed(2)],
    ['', ''],
    ['--- PART II: GST ON PURCHASES ---', ''],
    ['Box 5: Total Value of Taxable Purchases', totalTaxablePurchases.toFixed(2)],
    ['Box 6: Output Tax Due (9% × Box 1)', outputTax.toFixed(2)],
    ['Box 7: Input Tax Claimable (9% × Box 5)', inputTax.toFixed(2)],
    ['', ''],
    ['--- PART III: NET GST ---', ''],
    ['Box 8: Net GST Payable / (Refundable) [Box 6 − Box 7]', netGST.toFixed(2)],
    ['Box 9: Late Payment Penalty (if applicable)', '0.00'],
    ['', ''],
    ['NOTE: Filing frequency as per IRAS registration. GST rate: 9%.', ''],
    ['Ensure supporting tax invoices are retained for all taxable purchases.', ''],
  ];
  sections.push(csvSection('IRAS GST F5 RETURN SCHEDULE (SG 9%)', ['Box', 'Amount (SGD)'], gstRows));

  // ── SECTION 5: Transaction Interpretations (top 30) ──────────────────────
  const topTxns = [...sorted]
    .sort((a, b) => Math.max(b.debit, b.credit) - Math.max(a.debit, a.credit))
    .slice(0, 30);

  const txnRows: (string | number)[][] = topTxns.map(t => [
    t.date.slice(0, 10),
    t.account,
    classifyAccount(t.account),
    t.description || '',
    t.reference || '',
    t.debit > 0 ? 'Debit' : 'Credit',
    Math.max(t.debit, t.credit).toFixed(2),
    t.taxRateName || '',
    t.tax.toFixed(2),
  ]);

  sections.push(csvSection(
    'TRANSACTION INTERPRETATIONS — Top 30 by Value',
    ['Date', 'Account', 'Type', 'Description', 'Reference', 'Direction', 'Amount (SGD)', 'Tax Rate', 'Tax Amount (SGD)'],
    txnRows,
  ));

  // ── SECTION 6: 20% Balance Movement Alerts ───────────────────────────────
  const alertRows: (string | number)[][] = [];
  for (const [acct, curBal] of accountBalances) {
    const type = curBal.type;
    if (!splitMonth) continue;
    const pc = priorCurrent.get(acct);
    const pp = priorPrior.get(acct);
    if (!pc || !pp) continue;
    const curNet = (type === 'asset' || type === 'bank' || type === 'expense') ? pc.debit - pc.credit : pc.credit - pc.debit;
    const priNet = (type === 'asset' || type === 'bank' || type === 'expense') ? pp.debit - pp.credit : pp.credit - pp.debit;
    if (Math.abs(priNet) < 100) continue;
    const movPct = ((curNet - priNet) / Math.abs(priNet)) * 100;
    if (Math.abs(movPct) < 20) continue;
    const sev = Math.abs(movPct) >= 100 ? 'Critical' : Math.abs(movPct) >= 50 ? 'High' : 'Medium';
    alertRows.push([acct, type, priNet.toFixed(2), curNet.toFixed(2), `${movPct >= 0 ? '+' : ''}${movPct.toFixed(1)}%`, sev]);
  }

  if (alertRows.length > 0) {
    sections.push(csvSection(
      '20% BALANCE MOVEMENT ALERTS — Requires Review',
      ['Account', 'Type', 'Prior Balance (SGD)', 'Current Balance (SGD)', 'Movement %', 'Severity'],
      alertRows,
    ));
  }

  return sections.join('\r\n');
}

// ── GET Handler ───────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve org
    const url = new URL(request.url);
    let orgId = url.searchParams.get("orgId");

    if (!orgId) {
      const { data: memberships } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id);
      const orgIds = memberships?.map((m) => m.organization_id) || [];

      for (const oid of orgIds) {
        // Quick check: does this org have GL data?
        try {
          if (isS3Configured()) {
            const storage = getOrgStorage();
            await storage.downloadJSON(oid, "gl-data.json");
            orgId = oid;
            break;
          }
        } catch {
          // Try Supabase Storage
          const svc = await createServiceClient();
          const { data } = await svc.storage.from("org-data").download(`${oid}/gl-data.json`);
          if (data) { orgId = oid; break; }
        }
      }
    }

    if (!orgId) {
      return NextResponse.json({ error: "No GL data found for your organisation." }, { status: 404 });
    }

    // Load GL transactions
    let transactions: GLTransaction[] = [];
    try {
      if (isS3Configured()) {
        const storage = getOrgStorage();
        transactions = await storage.downloadJSON<GLTransaction[]>(orgId, "gl-data.json");
      }
    } catch {
      // fallback to Supabase
    }

    if (transactions.length === 0) {
      const svc = await createServiceClient();
      const { data } = await svc.storage.from("org-data").download(`${orgId}/gl-data.json`);
      if (data) {
        transactions = JSON.parse(await data.text()) as GLTransaction[];
      }
    }

    if (transactions.length === 0) {
      return NextResponse.json({ error: "No GL transactions found." }, { status: 404 });
    }

    // Get company name
    const svc = await createServiceClient();
    const { data: org } = await svc.from("organizations").select("name").eq("id", orgId).single();
    const company = org?.name || "Organisation";

    const csvContent = buildCSVExport(transactions, company);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `NexusBrain_AAS_${company.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.csv`;

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    console.error("[AAS Export] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
