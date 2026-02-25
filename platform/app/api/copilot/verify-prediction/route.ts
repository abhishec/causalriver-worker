export const dynamic = "force-dynamic";
/**
 * Verify Prediction API — User Confirms Whether Brain Was Right
 * ================================================================
 *
 * POST /api/copilot/verify-prediction
 *
 * Called when the user clicks "Yes, it happened" / "No, it didn't" / "Partially"
 * on a verification prompt card in the Copilot.
 *
 * This is the KEY reinforcement signal: it writes was_correct to prediction_records
 * and triggers the causal edge weight adjustment (+5% for correct, -10% for wrong).
 *
 * Without this endpoint, predictions accumulate forever with was_correct = null
 * and the brain never adjusts its causal edge weights based on reality.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { predictionId, organizationId, userVerdict, correction, verificationId } = body;

    if (!predictionId || !organizationId || !userVerdict) {
      return NextResponse.json({
        error: "Missing required fields: predictionId, organizationId, userVerdict",
      }, { status: 400 });
    }

    if (!["correct", "incorrect", "partial"].includes(userVerdict)) {
      return NextResponse.json({
        error: "userVerdict must be one of: correct, incorrect, partial",
      }, { status: 400 });
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

    // 1. Update prediction_records with user verdict
    const wasCorrect = userVerdict === "correct" ? true : userVerdict === "incorrect" ? false : null;
    const { error: updateError } = await service
      .from("prediction_records")
      .update({
        was_correct: wasCorrect,
        verified_at: new Date().toISOString(),
        actual_outcome: userVerdict === "partial"
          ? "partially_correct"
          : userVerdict,
        ...(correction ? { metadata: { user_correction: correction, verified_by: user.id } } : {}),
      })
      .eq("id", predictionId)
      .eq("organization_id", organizationId);

    if (updateError) {
      logger.warn("[verify-prediction] prediction_records update failed:", updateError.message);
    }

    // 2. Update scheduled_verifications if a verification ID was provided
    if (verificationId) {
      await service
        .from("scheduled_verifications")
        .update({
          status: "verified",
          completed_at: new Date().toISOString(),
          result: { userVerdict, correction: correction || null, verifiedBy: user.id },
        })
        .eq("id", verificationId)
        .eq("organization_id", organizationId);
    }

    // 3. Fetch the prediction to get its domain for weight adjustment
    const { data: prediction } = await service
      .from("prediction_records")
      .select("domain, entity_type, entity_id, confidence")
      .eq("id", predictionId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    // 4. Emit feedback signal to brain (for weight adjustment)
    // Tagged as outcome so the reinforcement loop picks it up
    await Promise.resolve(
      service.from("cross_domain_signals").insert({
        organization_id: organizationId,
        source_domain: `verification.${prediction?.domain || "unknown"}`,
        signal_type: `prediction_verified_${userVerdict}`,
        signal_value: wasCorrect === true ? 1 : wasCorrect === false ? -1 : 0.5,
        signal_timestamp: new Date().toISOString(),
        entity_type: prediction?.entity_type || "prediction",
        entity_id: predictionId,
        signal_metadata: {
          signal_category: "outcome",
          predictionId,
          userVerdict,
          hasCorrection: !!correction,
          domain: prediction?.domain,
          confidence: prediction?.confidence,
          verifiedBy: user.id,
        },
      })
    ).catch(() => {
      // Non-blocking
    });

    // 5. If user provided a correction, learn from it (same as copilot feedback)
    if (correction && userVerdict === "incorrect") {
      await Promise.resolve(
        service.from("ai_memory").insert({
          organization_id: organizationId,
          content: `Prediction correction (${prediction?.domain || "unknown"}): ${correction}`,
          memory_type: "correction",
          cognitive_layer: "L4",
          domain: prediction?.domain || "general",
          importance: 0.85,
          metadata: {
            source: "prediction_verification",
            predictionId,
            learnedAt: new Date().toISOString(),
          },
        })
      ).catch(() => {
        // Non-blocking
      });
    }

    // 6. Queue for brain feedback loop (weight adjustment)
    await Promise.resolve(
      service.from("brain_feedback_queue").insert({
        organization_id: organizationId,
        conversation_id: `prediction_${predictionId}`,
        message_index: 0,
        rating: userVerdict === "correct" ? "helpful" : userVerdict === "incorrect" ? "incorrect" : "not_helpful",
        correction: correction || null,
        domain: prediction?.domain || null,
        processed: false,
      })
    ).catch(() => {
      // Non-blocking
    });

    return NextResponse.json({
      success: true,
      predictionId,
      verdict: userVerdict,
      message: userVerdict === "correct"
        ? "Brain confidence boosted — edge weights strengthened."
        : userVerdict === "incorrect"
          ? "Brain learned from this — edge weights adjusted."
          : "Brain noted — partial accuracy recorded.",
      learningImpact: userVerdict === "incorrect" ? "high" : "medium",
    });
  } catch (error: unknown) {
    logger.error("[VerifyPrediction] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
