/**
 * Brain Feedback API — User Feedback Loop
 * ========================================
 *
 * POST /api/brain/feedback
 *   Records user feedback on Brain responses (helpful, not_helpful, incorrect).
 *   This feeds into the closed-loop learning engine (Loop 3).
 *
 * The feedback flows:
 *   UI thumbs-up/down → this API → brain_feedback_queue table
 *   → Closed-loop engine drains queue → RL signal + correction memory
 *
 * Body: {
 *   messageId: string,         // The copilot message being rated
 *   rating: "helpful" | "not_helpful" | "incorrect",
 *   correction?: string,       // User's correction text (for "incorrect")
 *   conversationId?: string,   // Chat conversation ID
 *   commandId?: string,        // Slash command that generated the response
 *   domainId?: string,         // Domain context (se-aas, aaas, etc.)
 * }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { recordAgentOutcome } from "@/lib/brain/agent-rl";

export const dynamic = "force-dynamic";

const VALID_RATINGS = ["helpful", "not_helpful", "incorrect"] as const;
type Rating = typeof VALID_RATINGS[number];

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse body ───────────────────────────────────────────────
    const body = await request.json();
    const {
      messageId,
      rating,
      correction,
      conversationId,
      commandId,
      domainId,
    } = body as {
      messageId?: string;
      rating?: string;
      correction?: string;
      conversationId?: string;
      commandId?: string;
      domainId?: string;
    };

    if (!messageId) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    if (!rating || !VALID_RATINGS.includes(rating as Rating)) {
      return NextResponse.json(
        { error: `rating must be one of: ${VALID_RATINGS.join(", ")}` },
        { status: 400 }
      );
    }

    if (correction && (typeof correction !== "string" || correction.length > 5000)) {
      return NextResponse.json(
        { error: "correction must be a string under 5000 characters" },
        { status: 400 }
      );
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace context" }, { status: 400 });
    }

    // ── Insert into brain_feedback_queue ─────────────────────────
    // This is the fire-and-forget queue that the closed-loop learning
    // engine (Loop 3) drains during each learning cycle.
    const service = await createServiceClient();

    const feedbackEntry = {
      organization_id: workspaceId,
      user_id: user.id,
      message_id: messageId,
      conversation_id: conversationId || null,
      rating: rating as Rating,
      correction: correction || null,
      command_id: commandId || null,
      domain_id: domainId || null,
      status: "pending" as const,
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await service
      .from("brain_feedback_queue")
      .insert(feedbackEntry);

    // Also write to copilot_response_feedback for RL stats queries
    // (fire-and-forget — never block the response on this)
    void (async () => {
      try {
        await service.from("copilot_response_feedback").insert({
          organization_id: workspaceId,
          user_id: user.id,
          message_id: messageId,
          conversation_id: conversationId || null,
          rating: rating as Rating,
          correction: correction || null,
          command_id: commandId || null,
          domain_id: domainId || null,
          created_at: new Date().toISOString(),
        });
      } catch { /* non-critical */ }
    })();

    // ── Close the RL flywheel: user feedback → prediction_records ──────────
    // Maps 👍/👎 into a quality score and writes to prediction_records so
    // getBrainContext() can read it back and inform every subsequent LLM decision.
    void (async () => {
      try {
        // Map rating → quality score: helpful=1.0, not_helpful=0.2, incorrect=0.0
        const qualityFromFeedback =
          rating === "helpful" ? 1.0 : rating === "incorrect" ? 0.0 : 0.2;

        await recordAgentOutcome(service, {
          agentId: messageId,
          domain: domainId ?? "copilot",
          taskDescription: `User feedback on message ${messageId}`,
          resultSummary: correction
            ? `${rating}: ${correction.slice(0, 200)}`
            : rating,
          quality: qualityFromFeedback,
          executionMs: 0,
          organizationId: workspaceId,
          userId: user.id,
        });
      } catch { /* non-critical — feedback already saved above */ }
    })();

    if (insertError) {
      // If brain_feedback_queue doesn't exist yet, fall back to ai_memory
      if (insertError.code === "42P01") {
        logger.warn("[BrainFeedback] brain_feedback_queue table not found, storing in ai_memory");

        await service.from("ai_memory").insert({
          organization_id: workspaceId,
          memory_type: "user_feedback",
          content: JSON.stringify(feedbackEntry),
          source: "copilot-feedback",
          confidence: rating === "helpful" ? 1.0 : rating === "not_helpful" ? 0.3 : 0.1,
          created_at: new Date().toISOString(),
        });
      } else {
        logger.error("[BrainFeedback] Insert error:", insertError);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
      }
    }

    // ── Emit immediate RL signal for fast feedback ───────────────
    // Positive feedback → small dopamine reward to relevant layers
    // Negative feedback → norepinephrine alert signal
    try {
      const signalType = rating === "helpful"
        ? "dopamine"
        : rating === "incorrect"
          ? "norepinephrine"
          : "gaba"; // not_helpful → inhibitory

      const signalStrength = rating === "helpful" ? 0.3 : rating === "incorrect" ? -0.5 : -0.2;

      await service.from("cross_domain_signals").insert({
        organization_id: workspaceId,
        source_domain: "user_feedback",
        target_domain: domainId || "general",
        signal_type: signalType,
        // signal_value is NOT NULL — use the strength as the numeric value for RL signals
        signal_value: signalStrength,
        signal_strength: signalStrength,
        entity_type: "feedback",
        entity_id: messageId,
        signal_timestamp: new Date().toISOString(),
        payload: {
          feedback_rating: rating,
          message_id: messageId,
          command_id: commandId,
          user_correction: correction ? true : false,
        },
        created_at: new Date().toISOString(),
      });
    } catch (signalErr) {
      // Non-fatal: feedback is saved, RL signal is bonus
      logger.warn("[BrainFeedback] RL signal emission failed:", signalErr);
    }

    logger.info(
      `[BrainFeedback] ${rating} feedback from user ${user.id} on message ${messageId}`
    );

    return NextResponse.json({
      success: true,
      message: rating === "helpful"
        ? "Thank you! This helps the Brain learn."
        : rating === "incorrect"
          ? "Thanks for the correction. The Brain will learn from this."
          : "Noted. The Brain will adjust its approach.",
    });
  } catch (error: unknown) {
    logger.error("[BrainFeedback] Error:", error);
    return NextResponse.json({ error: "Failed to process feedback" }, { status: 500 });
  }
}
