/**
 * Finance Jarvis API — Returns full analysis data for the dashboard
 */

import { getFinanceData } from "@/lib/finance-jarvis";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { analysis, xero, volopay } = getFinanceData();

    return NextResponse.json({
      analysis,
      summary: {
        xeroMonths: xero.monthlyPnL.length,
        xeroTransactions: xero.transactions.length,
        xeroInvoices: xero.invoices.length,
        xeroBills: xero.bills.length,
        volopayCardHolders: volopay.cardHolders.length,
        volopayTransactions: volopay.transactions.length,
        volopayBudgets: volopay.budgets.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
