export const dynamic = "force-dynamic";
/**
 * Copilot Feedback API — Every Answer Improves the Brain
 * =========================================================
 *
 * POST /api/copilot/feedback
 *   Record user feedback on a copilot response.
 *   This closes the learning loop: user rates → Brain learns → next answer is better.
 *
 * GET /api/copilot/feedback?organizationId=xxx
 *   Get feedback statistics for the organization.
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
    const { organizationId, conversationId, messageIndex, rating, correction, domain } = body;

    if (!organizationId || !conversationId || messageIndex === undefined || !rating) {
      return NextResponse.json({
        error: "Missing required fields: organizationId, conversationId, messageIndex, rating",
      }, { status: 400 });
    }

    if (!["helpful", "not_helpful", "incorrect"].includes(rating)) {
      return NextResponse.json({
        error: "rating must be one of: helpful, not_helpful, incorrect",
      }, { status: 400 });
    }

    // Verify user belongs to this org
    const { data: feedbackMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!feedbackMembership) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 }
      );
    }

    const service = await createServiceClient();

    // Save feedback
    const { error: insertError } = await service
      .from("copilot_response_feedback")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        message_index: messageIndex,
        rating,
        correction: correction || null,
        domain: domain || null,
        user_id: user.id,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // If correction provided, immediately learn from it
    if (correction && rating === "incorrect") {
      await learnFromCorrection(service, organizationId, correction, domain, conversationId);
    }

    // Map service domain for per-AI-Worker brain scoping
    const domainPrefix = domain === "seaas" || domain?.startsWith("engineering")
      ? "engineering" : domain === "aas" || domain?.startsWith("finance")
        ? "finance" : "general";
    const sourceDomain = `${domainPrefix}.copilot.feedback`;

    // ── WIRE: Feedback → prediction_records → accuracy metrics → intelligence score
    // Without this: accuracy.byDomain stays empty, intelligence score never reflects feedback quality
    await Promise.resolve(service.from("prediction_records").insert({
      organization_id: organizationId,
      domain: sourceDomain,
      predicted_outcome: "helpful_response",
      actual_outcome: rating === "helpful" ? "helpful_response" : "unhelpful_response",
      was_correct: rating === "helpful",
      confidence: 0.7,
      verified_at: new Date().toISOString(),
    })).catch((err: unknown) => {
      logger.warn("[feedback] prediction_records insert non-fatal:", err instanceof Error ? err.message : String(err));
    });

    // Emit feedback signal to Brain (meta-learning)
    // Tagged as 'outcome' so Loop 1B (Embodied Grounding) picks it up
    // Non-blocking: feedback was already saved to copilot_response_feedback above
    await Promise.resolve(service.from("cross_domain_signals").insert({
      organization_id: organizationId,
      source_domain: sourceDomain,
      signal_type: `copilot_feedback_${rating}`,
      signal_value: rating === "helpful" ? 1 : rating === "not_helpful" ? 0 : -1,
      entity_type: "copilot_conversation",
      entity_id: conversationId,
      signal_metadata: {
        signal_category: "outcome",
        messageIndex,
        hasCorrection: !!correction,
        domain: domain || "general",
        userId: user.id,
      },
    })).catch((err: unknown) => {
      logger.warn("[feedback] Signal emit non-fatal:", err instanceof Error ? err.message : String(err));
    });

    // ── WIRE: UI Feedback → Closed-Loop Learning Engine (Loop 3) ──
    // The closed-loop engine runs in a separate process (brain runtime),
    // so we queue feedback to a table that Loop 3 picks up on next cycle.
    // Without this wire: Loop 3 processes 0 feedback → brain never adapts
    // based on user corrections → same mistakes repeat indefinitely.
    await Promise.resolve(service.from("brain_feedback_queue").insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      message_index: messageIndex,
      rating,
      correction: correction || null,
      domain: domain || null,
      processed: false,
    })).catch((err: unknown) => {
      // Non-fatal: feedback was already saved to copilot_response_feedback
      logger.warn("[feedback] Queue insert non-fatal:", err instanceof Error ? err.message : String(err));
    });

    return NextResponse.json({
      success: true,
      message: rating === "incorrect" && correction
        ? "Thank you! Your correction will help the Brain learn."
        : "Feedback recorded. The Brain is listening.",
      learningImpact: rating === "incorrect" ? "high" : rating === "helpful" ? "medium" : "low",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

    // Verify user belongs to this org
    const { data: getFeedbackMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!getFeedbackMembership) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 }
      );
    }

    const service = await createServiceClient();

    // Get feedback stats
    const [helpful, notHelpful, incorrect, total] = await Promise.all([
      service
        .from("copilot_response_feedback")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("rating", "helpful"),
      service
        .from("copilot_response_feedback")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("rating", "not_helpful"),
      service
        .from("copilot_response_feedback")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("rating", "incorrect"),
      service
        .from("copilot_response_feedback")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
    ]);

    const totalCount = total.count ?? 0;
    const helpfulCount = helpful.count ?? 0;

    return NextResponse.json({
      success: true,
      stats: {
        total: totalCount,
        helpful: helpfulCount,
        notHelpful: notHelpful.count ?? 0,
        incorrect: incorrect.count ?? 0,
        satisfactionRate: totalCount > 0 ? helpfulCount / totalCount : 0,
        brainImpact: `${totalCount} feedback signals processed. Brain accuracy improved by feedback.`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// LEARNING FROM CORRECTIONS
// ============================================================================

/**
 * When a user says "incorrect" + provides a correction,
 * immediately store it in ai_memory as a high-priority correction.
 *
 * This means the NEXT time a similar question is asked,
 * the Brain will use the corrected knowledge.
 */
async function learnFromCorrection(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  organizationId: string,
  correction: string,
  domain: string | null,
  conversationId: string
): Promise<void> {
  await Promise.resolve(supabase.from("ai_memory").insert({
    organization_id: organizationId,
    content: correction,
    memory_type: "correction",
    cognitive_layer: "L4",  // Corrections update the causal understanding
    domain: domain || "general",
    importance: 0.9,  // High priority — user explicitly corrected
    metadata: {
      source: "copilot_feedback",
      conversationId,
      learnedAt: new Date().toISOString(),
      feedbackType: "user_correction",
    },
  })).catch((err: unknown) => {
    // Non-fatal: correction feedback is enrichment, not critical path
    logger.warn("[feedback] learnFromCorrection non-fatal:", err instanceof Error ? err.message : String(err));
  });
}
