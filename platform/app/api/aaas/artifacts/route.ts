/**
 * GET /api/aaas/artifacts
 *
 * Returns recent AAS agent run artifacts for the authenticated user's org.
 * AAS artifacts are stored in the shared se_aas_artifacts table with
 * domain_type prefixed "aas-" (e.g. aas-tax, aas-audit, aas-bookkeep).
 *
 * Query params:
 *   limit   — max results (default 10, max 50)
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Human-readable label for each AAS domain type
const DOMAIN_LABELS: Record<string, string> = {
  "aas-tax":             "Tax Compliance (GST F5)",
  "aas-audit":           "Audit Preparation",
  "aas-statements":      "Financial Statements",
  "aas-reconcile":       "Month-End Reconciliation",
  "aas-bookkeep":        "Bookkeeping",
  "aas-anomaly":         "Anomaly Detection",
  "aas-causal-analysis": "Causal Analysis",
  "aas-full":            "Full Analysis (All Agents)",
};

export async function GET(request: Request) {
  try {
    // Auth
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve org
    const { data: memberships } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(5);

    const orgIds = memberships?.map((m) => m.organization_id) || [];
    if (orgIds.length === 0) {
      return NextResponse.json({ artifacts: [] });
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10), 50);

    // Use service client to query — LIKE filter for aas-* domain types
    // Batch query across all user orgs in a single IN clause (no N+1)
    const service = await createServiceClient();

    const { data, error } = await service
      .from("se_aas_artifacts")
      .select("id, domain_type, metadata, created_at")
      .in("organization_id", orgIds)
      .like("domain_type", "aas-%")
      .order("created_at", { ascending: false })
      .limit(limit);

    const artifacts = (!error && data)
      ? data.map((a) => ({
          ...a,
          label: DOMAIN_LABELS[a.domain_type as string] || a.domain_type,
        }))
      : [];

    return NextResponse.json({ artifacts });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
