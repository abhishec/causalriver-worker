"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AccountingDomainData } from "@/components/copilot/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSGD(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${formatted})` : formatted;
}

function AmountCell({ value, colored = false }: { value: number; colored?: boolean }) {
  const isNeg = value < 0;
  return (
    <span className={cn(
      "tabular-nums font-mono text-[12px]",
      colored && isNeg ? "text-danger" : colored && !isNeg ? "text-success" : "text-foreground"
    )}>
      {formatSGD(value)}
    </span>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 bg-surface/50 border-y border-border-subtle">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{children}</span>
    </div>
  );
}

function Row({ label, value, indent = 0, bold = false, colored = false }: {
  label: string; value: number; indent?: number; bold?: boolean; colored?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-1.5 hover:bg-surface/30 transition-colors",
      bold && "border-t border-border-subtle mt-1"
    )}>
      <span className={cn(
        "text-[12px] text-muted-foreground flex-1 truncate",
        bold && "font-semibold text-foreground",
        indent === 1 && "pl-3",
        indent === 2 && "pl-6"
      )}>
        {label}
      </span>
      <AmountCell value={value} colored={colored || bold} />
    </div>
  );
}

// ─── Tab: P&L ────────────────────────────────────────────────────────────────

function PLTab({ pl, period }: { pl: AccountingDomainData["profitAndLoss"]; period?: string }) {
  if (!pl) return <EmptyState message="No P&L data available. Ask: 'Show me the P&L for 2025'" />;
  return (
    <div className="flex flex-col gap-0">
      {period && (
        <div className="px-3 py-2 border-b border-border-subtle">
          <span className="text-[11px] text-muted">Period: <span className="text-foreground font-medium">{period}</span></span>
        </div>
      )}

      <SectionHeader>Revenue</SectionHeader>
      {pl.revenueBreakdown?.map((r) => (
        <Row key={r.account} label={r.account} value={r.amount} indent={1} />
      ))}
      <Row label="Total Revenue" value={pl.revenue} bold />

      <SectionHeader>Expenses</SectionHeader>
      {pl.expenseBreakdown?.map((e) => (
        <Row key={e.account} label={e.account} value={e.amount} indent={1} />
      ))}
      <Row label="Total Expenses" value={pl.expenses} bold />

      <div className="mx-3 my-2 h-px bg-border-subtle" />
      <div className="flex items-center justify-between px-3 py-2 bg-surface/30 rounded-lg mx-2 mb-1">
        <span className="text-[13px] font-semibold text-foreground">Net Income / (Loss)</span>
        <span className={cn(
          "text-[14px] font-bold tabular-nums font-mono",
          pl.netIncome < 0 ? "text-danger" : "text-success"
        )}>
          SGD {formatSGD(pl.netIncome)}
        </span>
      </div>

      {/* EBITDA */}
      {pl.ebitda !== undefined && (
        <div className="mx-2 mb-2">
          <div className="flex items-center justify-between px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
            <span className="text-[12px] font-semibold text-foreground">EBITDA</span>
            <span className={cn(
              "text-[13px] font-bold tabular-nums font-mono",
              pl.ebitda < 0 ? "text-danger" : "text-emerald-400"
            )}>
              SGD {formatSGD(pl.ebitda)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Balance Sheet ───────────────────────────────────────────────────────

function BalanceSheetTab({ bs, period }: { bs: AccountingDomainData["balanceSheet"]; period?: string }) {
  if (!bs) return <EmptyState message="No balance sheet data available. Ask: 'Generate the balance sheet'" />;
  const checkBalance = Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)) < 1;
  return (
    <div className="flex flex-col gap-0">
      {period && (
        <div className="px-3 py-2 border-b border-border-subtle">
          <span className="text-[11px] text-muted">As at: <span className="text-foreground font-medium">{period}</span></span>
        </div>
      )}

      <SectionHeader>Assets</SectionHeader>
      {bs.assets?.map((a) => (
        <Row key={a.account} label={a.account} value={a.balance} indent={1} />
      ))}
      <Row label="Total Assets" value={bs.totalAssets} bold />

      <SectionHeader>Liabilities</SectionHeader>
      {bs.liabilities?.map((l) => (
        <Row key={l.account} label={l.account} value={l.balance} indent={1} />
      ))}
      <Row label="Total Liabilities" value={bs.totalLiabilities} bold />

      <SectionHeader>Equity</SectionHeader>
      {bs.equity?.map((e) => (
        <Row key={e.account} label={e.account} value={e.balance} indent={1} />
      ))}
      <Row label="Total Equity" value={bs.totalEquity} bold />

      <div className="mx-3 my-2 h-px bg-border-subtle" />
      <div className="flex items-center justify-between px-3 py-2 bg-surface/30 rounded-lg mx-2 mb-2">
        <span className="text-[13px] font-semibold text-foreground">Liabilities + Equity</span>
        <span className="text-[14px] font-bold tabular-nums font-mono text-foreground">
          SGD {formatSGD(bs.totalLiabilities + bs.totalEquity)}
        </span>
      </div>
      <div className={cn(
        "mx-3 mb-3 px-3 py-1.5 rounded-lg flex items-center gap-2 text-[11px] font-medium",
        checkBalance ? "bg-success/10 text-success border border-success/20" : "bg-danger/10 text-danger border border-danger/20"
      )}>
        <span>{checkBalance ? "✓" : "✗"}</span>
        <span>{checkBalance ? "Balance sheet is balanced" : "Balance sheet is NOT balanced — check retained earnings"}</span>
      </div>
    </div>
  );
}

// ─── Tab: Trial Balance ───────────────────────────────────────────────────────

function TrialBalanceTab({ tb }: { tb: AccountingDomainData["trialBalance"] }) {
  const [search, setSearch] = useState("");
  if (!tb) return <EmptyState message="No trial balance data available. Ask: 'Generate the trial balance'" />;

  const filtered = tb.accounts.filter(
    (a) => !search || a.account.toLowerCase().includes(search.toLowerCase()) || a.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header info */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between shrink-0">
        <span className="text-[11px] text-muted">Period: <span className="text-foreground font-medium">{tb.period}</span></span>
        <span className={cn(
          "text-[10px] font-medium px-2 py-0.5 rounded-full",
          tb.balanced ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
        )}>
          {tb.balanced ? "✓ Balanced" : "✗ Unbalanced"}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <input
          type="text"
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 text-[12px] bg-surface border border-border-subtle rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
        />
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1 border-b border-border-subtle shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Account</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted text-right w-20">Type</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted text-right w-24">Debit</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted text-right w-24">Credit</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((acc) => (
          <div key={acc.account} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1 hover:bg-surface/30 transition-colors border-b border-border-subtle/30">
            <span className="text-[11px] text-foreground truncate">{acc.account}</span>
            <span className="text-[10px] text-muted text-right w-20 capitalize">{acc.type}</span>
            <span className="text-[11px] tabular-nums font-mono text-right w-24 text-foreground">
              {acc.netDebit > 0 ? formatSGD(acc.netDebit) : "—"}
            </span>
            <span className="text-[11px] tabular-nums font-mono text-right w-24 text-foreground">
              {acc.netCredit > 0 ? formatSGD(acc.netCredit) : "—"}
            </span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="shrink-0 border-t border-border-subtle bg-surface/30">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2">
          <span className="text-[12px] font-semibold text-foreground">Total</span>
          <span className="w-20" />
          <span className="text-[12px] font-semibold tabular-nums font-mono text-right w-24 text-foreground">
            {formatSGD(tb.totalDebits)}
          </span>
          <span className="text-[12px] font-semibold tabular-nums font-mono text-right w-24 text-foreground">
            {formatSGD(tb.totalCredits)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: GST F5 ─────────────────────────────────────────────────────────────

function GSTF5Tab({ gst }: { gst: AccountingDomainData["gstF5"] }) {
  if (!gst) return <EmptyState message="No GST data available. Ask: 'Check GST F5 compliance'" />;

  const netRefund = gst.box8_netTaxPayable < 0;
  const boxes = [
    { box: "Box 1", label: "Standard-Rated Supplies", value: gst.box1_standardRatedSupplies, note: "7% / 9% GST" },
    { box: "Box 2", label: "Zero-Rated Supplies", value: gst.box2_zeroRatedSupplies, note: "International SaaS" },
    { box: "Box 3", label: "Exempt Supplies", value: gst.box3_exemptSupplies, note: "" },
    { box: "Box 4", label: "Total Supplies (1+2+3)", value: gst.box4_totalSupplies, note: "", separator: true },
    { box: "Box 5", label: "Taxable Supplies (1+2)", value: gst.box5_taxableSupplies, note: "" },
    { box: "Box 6", label: "Output Tax (on Box 1)", value: gst.box6_outputTax, note: "Tax collected" },
    { box: "Box 7", label: "Input Tax Claimable", value: gst.box7_inputTax, note: "Tax paid on expenses" },
    { box: "Box 8", label: "Net Tax Payable / (Refund)", value: gst.box8_netTaxPayable, note: "", highlight: true },
  ];

  return (
    <div className="flex flex-col gap-0 pb-3">
      <div className="px-3 py-2 border-b border-border-subtle">
        <span className="text-[11px] text-muted">IRAS GST F5 Return — Singapore</span>
      </div>

      {boxes.map((b) => (
        <div key={b.box}>
          {b.separator && <div className="h-px bg-border-subtle mx-3 my-1" />}
          <div className={cn(
            "flex items-center justify-between px-3 py-2 hover:bg-surface/30 transition-colors",
            b.highlight && "bg-surface/50 border-t border-border-subtle mt-1"
          )}>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-muted shrink-0">{b.box}</span>
                <span className={cn("text-[12px]", b.highlight ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {b.label}
                </span>
              </div>
              {b.note && <span className="text-[10px] text-muted ml-12">{b.note}</span>}
            </div>
            <span className={cn(
              "tabular-nums font-mono text-[12px] shrink-0 ml-4",
              b.highlight && b.value < 0 ? "text-success font-bold" : b.highlight ? "text-danger font-bold" : "text-foreground"
            )}>
              SGD {formatSGD(b.value)}
            </span>
          </div>
        </div>
      ))}

      <div className={cn(
        "mx-3 mt-3 px-3 py-2 rounded-lg border text-[11px] font-medium flex items-center gap-2",
        netRefund
          ? "bg-success/10 border-success/20 text-success"
          : "bg-amber-500/10 border-amber-500/20 text-amber-400"
      )}>
        <span>{netRefund ? "💰" : "⚠️"}</span>
        <span>
          {netRefund
            ? `Net GST Refund of SGD ${formatSGD(Math.abs(gst.box8_netTaxPayable))} — input tax exceeds output tax`
            : `Net GST Payable of SGD ${formatSGD(gst.box8_netTaxPayable)} — due to IRAS`}
        </span>
      </div>
    </div>
  );
}

// ─── Tab: Transactions ────────────────────────────────────────────────────────

function TransactionsTab({ txns }: { txns: AccountingDomainData["transactionSummary"] }) {
  if (!txns) return <EmptyState message="No transaction data available. Ask: 'Show me the transaction summary'" />;
  return (
    <div className="flex flex-col gap-0">
      {/* Summary header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="text-[11px] text-muted">Period: <span className="text-foreground font-medium">{txns.period}</span></span>
        <span className="text-[12px] font-semibold text-foreground tabular-nums">{txns.totalTransactions.toLocaleString()} txns</span>
      </div>

      {/* By Source */}
      {txns.bySource && txns.bySource.length > 0 && (
        <>
          <SectionHeader>By Source</SectionHeader>
          {txns.bySource.map((s) => (
            <div key={s.source} className="flex items-center justify-between px-3 py-1.5 hover:bg-surface/30 border-b border-border-subtle/30">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[12px] text-foreground truncate">{s.source}</span>
                <span className="text-[10px] text-muted shrink-0">{s.count.toLocaleString()} txns</span>
              </div>
              <span className="text-[11px] tabular-nums font-mono text-foreground ml-3 shrink-0">
                SGD {formatSGD(Math.abs(s.totalAmount))}
              </span>
            </div>
          ))}
        </>
      )}

      {/* Top transactions */}
      {txns.topTransactions && txns.topTransactions.length > 0 && (
        <>
          <SectionHeader>Top Transactions</SectionHeader>
          {txns.topTransactions.map((t, i) => (
            <div key={i} className="px-3 py-2 hover:bg-surface/30 border-b border-border-subtle/30">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-foreground truncate">{t.account}</div>
                  <div className="text-[10px] text-muted truncate">{t.description} · {t.date}</div>
                  <div className="text-[10px] text-muted/70 capitalize">{t.classification}</div>
                </div>
                <div className="text-right shrink-0">
                  {t.debit > 0 && (
                    <div className="text-[11px] tabular-nums font-mono text-foreground">
                      Dr {formatSGD(t.debit)}
                    </div>
                  )}
                  {t.credit > 0 && (
                    <div className="text-[11px] tabular-nums font-mono text-muted-foreground">
                      Cr {formatSGD(t.credit)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      </div>
      <p className="text-[12px] text-muted leading-relaxed">{message}</p>
    </div>
  );
}

// ─── Tab: Anomalies ─────────────────────────────────────────────────────────

function AnomaliesTab({ anomalies }: { anomalies: AccountingDomainData["anomalies"] }) {
  if (!anomalies || anomalies.length === 0) return <EmptyState message="No anomalies detected. Ask: 'Detect unusual transaction patterns'" />;

  const sevColors: Record<string, string> = {
    critical: "bg-red-600/10 text-red-500 border-red-600/20",
    high: "bg-danger/10 text-danger border-danger/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };

  const sevDots: Record<string, string> = {
    critical: "bg-red-500",
    high: "bg-danger",
    medium: "bg-yellow-400",
    low: "bg-blue-400",
  };

  return (
    <div className="flex flex-col gap-0 pb-3">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="text-[11px] text-muted">Anomaly Detection</span>
        <span className="text-[12px] font-semibold text-foreground tabular-nums">{anomalies.length} detected</span>
      </div>
      {anomalies.map((a, i) => {
        const sev = a.severity?.toLowerCase() || "medium";
        return (
          <div key={i} className="px-3 py-2.5 border-b border-border-subtle/40 hover:bg-surface/20 transition-colors">
            <div className="flex items-start gap-2.5">
              <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 mt-0.5", sevColors[sev] || sevColors.medium)}>
                <span className={cn("w-1.5 h-1.5 rounded-full", sevDots[sev] || sevDots.medium)} />
                {sev.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-foreground leading-snug">{a.type}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{a.description}</p>
              </div>
            </div>
          </div>
        );
      })}
      {/* Insight box — highlight the most critical anomaly */}
      {anomalies.length > 0 && (
        <div className="mx-3 mt-3 px-3 py-2.5 rounded-[10px] border border-amber-500/15 bg-amber-500/4 text-[12px] text-amber-400 leading-relaxed">
          <strong>Action:</strong> {anomalies.find((a) => a.severity?.toLowerCase() === "critical")?.description
            || anomalies[0]?.description
            || "Review flagged anomalies for potential billing errors or compliance issues."}
        </div>
      )}
    </div>
  );
}

// ─── KPI Summary Header ────────────────────────────────────────────────────

function formatMillions(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "(" : ""}${(abs / 1_000_000).toFixed(1)}M${n < 0 ? ")" : ""}`;
  if (abs >= 1_000) return `${n < 0 ? "(" : ""}${(abs / 1_000).toFixed(0)}K${n < 0 ? ")" : ""}`;
  return formatSGD(n);
}

function KPISummary({ data }: { data: AccountingDomainData }) {
  const kpis: Array<{ label: string; value: string; sub?: string; color?: "green" | "red" | "amber" | "default" }> = [];

  if (data.profitAndLoss) {
    kpis.push({
      label: "Revenue",
      value: `SGD ${formatMillions(data.profitAndLoss.revenue)}`,
      color: "green",
    });
    kpis.push({
      label: "Net Income",
      value: `SGD ${formatMillions(data.profitAndLoss.netIncome)}`,
      sub: data.profitAndLoss.netIncome >= 0 ? "Profit" : "Loss",
      color: data.profitAndLoss.netIncome >= 0 ? "green" : "red",
    });
    if (data.profitAndLoss.ebitda !== undefined) {
      kpis.push({
        label: "EBITDA",
        value: `SGD ${formatMillions(data.profitAndLoss.ebitda)}`,
        color: data.profitAndLoss.ebitda >= 0 ? "green" : "red",
      });
    }
  }
  if (data.trialBalance) {
    kpis.push({
      label: "Accounts",
      value: String(data.trialBalance.accounts.length),
      sub: data.trialBalance.balanced ? "Balanced" : "Unbalanced",
      color: "default",
    });
  }
  if (data.gstF5) {
    kpis.push({
      label: "GST Net",
      value: `SGD ${formatMillions(data.gstF5.box8_netTaxPayable)}`,
      sub: data.gstF5.box8_netTaxPayable < 0 ? "Refund" : "Payable",
      color: "amber",
    });
  }

  if (kpis.length === 0) return null;

  const colorMap = {
    green: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", text: "text-emerald-400" },
    red: { border: "border-danger/30", bg: "bg-danger/5", text: "text-danger" },
    amber: { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-400" },
    default: { border: "border-border-subtle", bg: "bg-surface/40", text: "text-foreground" },
  };

  // Responsive: use flex-wrap so tiles flow naturally for any count
  return (
    <div className="px-3 py-3 border-b border-border-subtle bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent">
      <div className="flex flex-wrap gap-2">
        {kpis.map((kpi) => {
          const c = colorMap[kpi.color || "default"];
          return (
            <div key={kpi.label} className={cn("rounded-lg border p-2 flex flex-col gap-0.5 flex-1 min-w-[72px]", c.border, c.bg)}>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted">{kpi.label}</span>
              <span className={cn("text-[14px] font-bold tabular-nums leading-tight", c.text)}>{kpi.value}</span>
              {kpi.sub && <span className="text-[10px] text-muted">{kpi.sub}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = "pl" | "bs" | "tb" | "gst" | "txns" | "anomalies";

const TABS: Array<{ id: TabId; label: string; shortLabel: string }> = [
  { id: "pl", label: "P&L", shortLabel: "P&L" },
  { id: "bs", label: "Balance Sheet", shortLabel: "BS" },
  { id: "tb", label: "Trial Balance", shortLabel: "TB" },
  { id: "gst", label: "GST F5", shortLabel: "GST" },
  { id: "txns", label: "Transactions", shortLabel: "Txns" },
  { id: "anomalies", label: "Anomalies", shortLabel: "Anomalies" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

interface FinancialStatementsPanelProps {
  data: AccountingDomainData;
  /** Force a specific tab open (e.g. from /bs → "bs", /gst → "gst") */
  initialTab?: TabId;
}

/** Map AAS slash-command domainIds to tab IDs */
export const AAS_DOMAIN_TO_TAB: Record<string, TabId> = {
  "aas-pl": "pl",
  "aas-balance": "bs",
  "aas-trial": "tb",
  "aas-gst": "gst",
  "aas-anomaly": "anomalies",
  "aas-transactions": "txns",
};

export function FinancialStatementsPanel({ data, initialTab }: FinancialStatementsPanelProps) {
  // Auto-select: prefer initialTab, then first tab with data
  const getDefaultTab = (): TabId => {
    if (initialTab) return initialTab;
    if (data.profitAndLoss) return "pl";
    if (data.balanceSheet) return "bs";
    if (data.trialBalance) return "tb";
    if (data.gstF5) return "gst";
    if (data.transactionSummary) return "txns";
    if (data.anomalies && data.anomalies.length > 0) return "anomalies";
    return "pl";
  };

  const [activeTab, setActiveTab] = useState<TabId>(getDefaultTab);

  // Indicator dots — show which tabs have data
  const hasData: Record<TabId, boolean> = {
    pl: !!data.profitAndLoss,
    bs: !!data.balanceSheet,
    tb: !!data.trialBalance,
    gst: !!data.gstF5,
    txns: !!data.transactionSummary,
    anomalies: !!(data.anomalies && data.anomalies.length > 0),
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border-subtle overflow-hidden">
      {/* KPI Summary Header */}
      <KPISummary data={data} />

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border-subtle bg-surface/30">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-all relative flex-1 justify-center",
              activeTab === tab.id
                ? "text-emerald-400 bg-emerald-500/5"
                : "text-muted hover:text-foreground hover:bg-surface/50"
            )}
          >
            {tab.shortLabel}
            {hasData[tab.id] && (
              <span className={cn(
                "w-1 h-1 rounded-full shrink-0",
                activeTab === tab.id ? "bg-emerald-400" : "bg-emerald-500/50"
              )} />
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === "pl" && <PLTab pl={data.profitAndLoss} period={data.period} />}
        {activeTab === "bs" && <BalanceSheetTab bs={data.balanceSheet} period={data.period} />}
        {activeTab === "tb" && <TrialBalanceTab tb={data.trialBalance} />}
        {activeTab === "gst" && <GSTF5Tab gst={data.gstF5} />}
        {activeTab === "txns" && <TransactionsTab txns={data.transactionSummary} />}
        {activeTab === "anomalies" && <AnomaliesTab anomalies={data.anomalies} />}
      </div>

      {/* Footer — data currency */}
      {data.narrative && (
        <div className="shrink-0 border-t border-border-subtle px-3 py-2 bg-surface/20">
          <p className="text-[11px] text-muted leading-relaxed line-clamp-2">{data.narrative}</p>
        </div>
      )}
    </div>
  );
}
