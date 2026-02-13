/**
 * Finance Jarvis API — Returns full analysis data for the dashboard
 *
 * Also seeds the finance data into the authenticated user's org DB tables
 * so the generic copilot can query it through standard brain queries.
 * This is the equivalent of a "connector ingest" — Xero/Volopay data
 * gets written to ai_memory + causal_relationships_statistical.
 */

import { getFinanceData } from "@/lib/finance-jarvis";
import { seedFinanceDataToDb } from "@/lib/finance-jarvis/seed-to-db";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { analysis, xero, volopay } = getFinanceData();

    // ── Seed finance data into the authenticated user's org ──────────────
    // This runs in the background — doesn't block the dashboard response.
    // Uses service client (bypasses RLS) for writes, user client for auth.
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Get the user's org
        const { data: membership } = await supabase
          .from("org_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (membership?.organization_id) {
          const service = await createServiceClient();
          // Fire-and-forget: seed in background, don't await
          seedFinanceDataToDb(service, membership.organization_id, analysis)
            .catch((err) => console.warn("[FinanceJarvis] Non-fatal seed error:", err));
        }
      }
    } catch {
      // Auth not available (e.g. unauthenticated request) — skip seeding
    }

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
