/**
 * Automated Prediction Verification API
 * ========================================
 *
 * POST /api/brain/verify-predictions
 *
 * Runs the automated outcome resolver for all due predictions in an
 * organization. Uses the full resolver registry with direct API calls
 * to Jira, GitHub, Xero, and PagerDuty for ground truth.
 *
 * This is the server-side complement to:
 * - OutcomeCollector (openclaw-plugin): uses signal-based resolution
 * - VerificationPromptCard (UI): user-driven verification
 *
 * Called by: brain cycle scheduler, admin dashboard, or manual trigger.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    // Verify membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const service = await createServiceClient();

    // Import the resolver registry and feedback loop from causality module
    // Note: requires `pnpm --filter @nexus-ai/memory-stack build` after adding new resolvers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const causality = await import("@nexus-ai/memory-stack/causality") as any;

    const registry = causality.createResolverRegistry();
    const feedbackLoop = causality.createFeedbackLoop();

    // Fetch all pending verifications that are due
    const now = new Date().toISOString();
    const { data: pendingVerifications, error: fetchError } = await service
      .from("scheduled_verifications")
      .select("id, prediction_id, scheduled_for, status")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (fetchError || !pendingVerifications) {
      return NextResponse.json({
        resolved: 0,
        deferred: 0,
        errors: 0,
        message: fetchError?.message || "No pending verifications",
      });
    }

    let resolved = 0;
    let deferred = 0;
    let errors = 0;
    const results: Array<{
      predictionId: string;
      status: string;
      source?: string;
      direction?: string;
    }> = [];

    for (const verification of pendingVerifications) {
      try {
        // Fetch the prediction details
        const { data: prediction } = await service
          .from("prediction_records")
          .select("*")
          .eq("id", verification.prediction_id)
          .eq("organization_id", organizationId)
          .single();

        if (!prediction || prediction.status !== "pending") {
          continue;
        }

        // Try automated resolution
        const domain = prediction.domain || prediction.target_domain || "unknown";
        const resolver = registry.getResolver(domain, prediction.target_metric);

        if (resolver) {
          const ctx = {
            predictionId: prediction.id,
            organizationId,
            domain,
            targetMetric: prediction.target_metric || "health_score",
            entityType: prediction.entity_type || "unknown",
            entityId: prediction.entity_id || "unknown",
            predictedDirection: prediction.predicted_direction || "stable",
            predictedMagnitude: prediction.predicted_magnitude || 0,
            predictedValue: prediction.predicted_value,
            predictedAt: new Date(prediction.predicted_at || prediction.created_at),
            confidence: prediction.confidence || 0.5,
            featureSnapshot: prediction.feature_snapshot,
          };

          const outcome = await resolver.resolve(ctx, service);

          if (outcome) {
            // Verify prediction using feedback loop (adjusts weights)
            await feedbackLoop.verifyPrediction(service, prediction.id, {
              direction: outcome.actualDirection,
              magnitude: outcome.actualMagnitude,
            });

            // Update scheduled verification
            await service
              .from("scheduled_verifications")
              .update({
                status: "verified",
                processed_at: now,
                resolution_source: outcome.source,
              })
              .eq("id", verification.id);

            resolved++;
            results.push({
              predictionId: prediction.id,
              status: "resolved",
              source: outcome.source,
              direction: outcome.actualDirection,
            });
            continue;
          }
        }

        // No resolver or resolver returned null — defer to user verification
        await service
          .from("scheduled_verifications")
          .update({
            status: "awaiting_user_verification",
            resolution_note: `No automated resolver for domain "${domain}"`,
          })
          .eq("id", verification.id);

        deferred++;
        results.push({
          predictionId: prediction.id,
          status: "deferred_to_user",
        });
      } catch (err) {
        errors++;
        console.error(
          `[verify-predictions] Error processing ${verification.prediction_id}:`,
          err,
        );
      }
    }

    return NextResponse.json({
      resolved,
      deferred,
      errors,
      total: pendingVerifications.length,
      results,
      automatedDomains: registry.getAutomatedDomains(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
