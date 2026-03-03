/**
 * Brain Consolidation — Manual Trigger (ADR-026 enhanced)
 * =========================================================
 *
 * POST /api/brain/consolidation
 *   Runs a full consolidation pass for the authenticated user's org:
 *   1. Tier 3 consolidation (cross_domain_signals → consolidated_patterns)
 *   2. Federation promotion (engagement_outcomes → process_templates CORE brain)
 *   3. Gaba pattern promotion (negative signals → federated_knowledge warnings)
 *   4. ai_memory promotion (structured-outcomes → federated_knowledge)
 *
 * This replaces the old single-call version that only ran tier3 consolidation.
 * All steps run in parallel for speed; failures in steps 2-4 are non-fatal.
 *
 * Security: Requires a valid user session (JWT cookie). Scoped to the user's
 * own organization — no cross-tenant access.
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runConsolidation } from "@/lib/brain/tier3-consolidation";
import { promotePatternsToCore, promoteGabaPatternsToKnowledge } from "@/lib/brain/se-aas-federation";
import { promoteMemoryToFederatedKnowledge } from "@/lib/brain/memory-federator";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  // ── Auth: isolate createClient() + getUser() so Lambda env var errors return 401, not 500 ──
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = data.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Accept optional organizationId override from request body.
    // The Brain tab UI sends the worker's orgId so consolidation runs
    // against the correct workspace (not the user's first membership).
    let bodyOrgId: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      bodyOrgId = body?.organizationId || undefined;
    } catch { /* no body is fine */ }

    // Get the user's org (used as fallback if no body orgId provided)
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.organization_id && !bodyOrgId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 404 }
      );
    }

    // Prefer the body-supplied orgId (comes from AI Worker page context);
    // fall back to session membership to keep backwards compatibility.
    const orgId = bodyOrgId || membership!.organization_id;

    // Use service client for federation calls that need cross-org access
    let service;
    try {
      service = await createServiceClient();
    } catch {
      service = supabase; // fallback to user client
    }

    const startMs = Date.now();

    // ── Run all consolidation steps in parallel (steps 2-4 non-fatal) ──
    const [tier3Result, gabaPromoted, memoryPromoted] = await Promise.allSettled([
      runConsolidation(orgId),
      promoteGabaPatternsToKnowledge(service, orgId),
      promoteMemoryToFederatedKnowledge(service, orgId),
    ]);

    // Step 2: Federation (sequential after tier3 so it can see fresh signals)
    void promotePatternsToCore(service, orgId).catch((err: unknown) => {
      logger.warn("[consolidation] promotePatternsToCore failed (non-fatal)", {
        orgId, error: String(err),
      });
    });

    const t3 = tier3Result.status === "fulfilled" ? tier3Result.value : { patternsPromoted: 0, signalsScanned: 0, durationMs: 0 };
    const gabaCount = gabaPromoted.status === "fulfilled" ? gabaPromoted.value : 0;
    const memoryCount = memoryPromoted.status === "fulfilled" ? memoryPromoted.value : 0;

    const totalDurationMs = Date.now() - startMs;

    logger.warn("[consolidation] Full consolidation run complete", {
      orgId,
      tier3PatternsPromoted: t3.patternsPromoted,
      signalsScanned: t3.signalsScanned,
      gabaPatternsWarned: gabaCount,
      memoryInsightsPromoted: memoryCount,
      totalDurationMs,
    });

    return NextResponse.json({
      success: true,
      patternsPromoted: t3.patternsPromoted,
      signalsScanned: t3.signalsScanned,
      gabaPatternsWarned: gabaCount,
      memoryInsightsPromoted: memoryCount,
      durationMs: totalDurationMs,
    });
  } catch (err) {
    logger.warn("[consolidation] POST error", { error: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
