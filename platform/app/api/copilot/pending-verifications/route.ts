export const dynamic = "force-dynamic";
/**
 * Pending Verifications API — Surface Due Predictions for User Verification
 * ===========================================================================
 *
 * GET /api/copilot/pending-verifications?organizationId=xxx
 *
 * Returns predictions whose scheduled verification date has passed but haven't
 * been verified yet. The Copilot UI renders these as "check-in" cards that ask
 * the user: "I predicted X — was I right?"
 *
 * This closes the reinforcement learning loop for brain-only domains where
 * no automated API resolver exists (e.g. test generation, design docs, etc.)
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    // Verify membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const service = await createServiceClient();

    // Fetch predictions that are:
    // 1. Still unverified (was_correct IS NULL)
    // 2. Old enough to verify (created_at + reasonable timeframe has passed)
    // 3. Limited to recent predictions (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // Predictions need at least 24 hours before verification
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: pendingPredictions, error: fetchError } = await service
      .from("prediction_records")
      .select("id, domain, predicted_outcome, confidence, entity_type, entity_id, created_at")
      .eq("organization_id", organizationId)
      .is("was_correct", null)
      .is("verified_at", null)
      .gte("created_at", thirtyDaysAgo)
      .lte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(10);

    if (fetchError) {
      // Table might not exist yet — return empty
      return NextResponse.json({ verifications: [] });
    }

    // Also check scheduled_verifications for predictions with explicit schedules
    const { data: scheduledDue } = await service
      .from("scheduled_verifications")
      .select("id, prediction_id, verification_type, scheduled_for, created_at")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(10);

    // Merge: scheduled verifications get priority, then unverified predictions
    const scheduledPredictionIds = new Set(
      (scheduledDue || []).map((s: any) => s.prediction_id)
    );

    const verifications = [
      // Scheduled verifications that are due
      ...(scheduledDue || []).map((sv: any) => ({
        verificationId: sv.id,
        predictionId: sv.prediction_id,
        scheduledFor: sv.scheduled_for,
        source: "scheduled" as const,
      })),
      // Unverified predictions (exclude those already in scheduled list)
      ...(pendingPredictions || [])
        .filter((p: any) => !scheduledPredictionIds.has(p.id))
        .map((p: any) => ({
          predictionId: p.id,
          domain: p.domain,
          description: p.predicted_outcome,
          confidence: p.confidence,
          predictedAt: p.created_at,
          entityType: p.entity_type,
          entityId: p.entity_id,
          source: "prediction" as const,
        })),
    ];

    return NextResponse.json({
      verifications,
      count: verifications.length,
    });
  } catch (error: unknown) {
    logger.error("[PendingVerifications] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
