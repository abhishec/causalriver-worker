/**
 * Brain Consolidation — Manual Trigger
 * =====================================
 *
 * POST /api/brain/consolidation
 *   Runs a full Tier 3 consolidation pass for the authenticated user's org.
 *   Promotes stable, high-quality patterns from cross_domain_signals and
 *   prediction_records into the consolidated_patterns table.
 *
 * Security: Requires a valid user session (JWT cookie). Scoped to the user's
 * own organization — no cross-tenant access.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runConsolidation } from "@/lib/brain/tier3-consolidation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user's org
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.organization_id) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 404 }
      );
    }

    const result = await runConsolidation(membership.organization_id);

    logger.warn("[consolidation] Manual consolidation run", {
      orgId: membership.organization_id,
      ...result,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.warn("[consolidation] POST error", { error: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
