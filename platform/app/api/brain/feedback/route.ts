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
import { checkSessionRateLimit } from "@/lib/security-middleware";

export const dynamic = "force-dynamic";

const VALID_RATINGS = ["helpful", "not_helpful", "incorrect"] as const;
type Rating = typeof VALID_RATINGS[number];

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    // Step 1: createClient in isolated try-catch — throws when env vars missing in Lambda cold start
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 2: getUser in isolated try-catch
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limiting — 60 req/min per user ──────────────────────────────
    const rateLimit = await checkSessionRateLimit(user.id, "/api/brain/feedback");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before submitting more feedback." },
        { status: 429 }
      );
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
      organizationId: bodyOrgId,
      patternIds: bodyPatternIds,  // ADR-027: RL primer pattern IDs for feedback tracking
    } = body as {
      messageId?: string;
      rating?: string;
      correction?: string;
      conversationId?: string;
      commandId?: string;
      domainId?: string;
      organizationId?: string;
      patternIds?: string[];
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

    // Use server-resolved workspace first; fall back to org passed in the request body
    // (MessageFeedback sends organizationId for cases where session cookie resolution
    // returns an empty string — e.g., when the AI Worker belongs to a different org than
    // the user's primary workspace).
    const workspaceId = (await getCurrentWorkspaceId()) || bodyOrgId || "";
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace context" }, { status: 400 });
    }

    // ── Insert into brain_feedback_queue ─────────────────────────
    // This is the fire-and-forget queue that the closed-loop learning
    // engine (Loop 3) drains during each learning cycle.
    let service;
    try {
      service = await createServiceClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // ── Fuse feedback into existing domain-executor prediction_records ──────
    // The domain executor inserts prediction_records rows with heuristic quality
    // scores (quality >= 0.7 = was_correct). This block finds the most recent
    // unverified record for the same org + domain within a 5-minute window and
    // overwrites was_correct + actual_outcome with the actual user signal.
    // This is the authoritative close of the RL loop: user satisfaction overrides
    // the automated heuristic.
    void (async () => {
      try {
        const effectiveDomain = domainId ?? body.domain ?? body.domainType ?? body.serviceDomain ?? "";
        if (!effectiveDomain) return; // cannot match without a domain

        const isHelpful = rating === "helpful";
        const isNegative = rating === "not_helpful" || rating === "incorrect";

        const fiveMinutes = 5 * 60 * 1000;
        const now = Date.now();
        const windowStart = new Date(now - fiveMinutes).toISOString();
        const windowEnd = new Date(now + fiveMinutes).toISOString();

        // Find the most recent unverified prediction_record for this org + domain
        // within a ±5-minute window (covers the domain execution that produced the
        // response the user just rated).
        const { data: predictions } = await service
          .from("prediction_records")
          .select("id")
          .eq("organization_id", workspaceId)
          .eq("domain", effectiveDomain)
          .gte("created_at", windowStart)
          .lte("created_at", windowEnd)
          .is("verified_at", null) // only update records not yet user-verified
          .order("created_at", { ascending: false })
          .limit(1);

        if (predictions && predictions.length > 0) {
          await service
            .from("prediction_records")
            .update({
              was_correct: isHelpful,
              actual_outcome: isNegative
                ? (correction ? `negative: ${correction.slice(0, 200)}` : "negative")
                : "positive",
              verified_at: new Date().toISOString(),
            })
            .eq("id", predictions[0].id);
        }
      } catch (err) {
        logger.warn("[Feedback] Failed to fuse feedback into prediction_records", { err });
      }
    })();

    // ── ADR-027: RL Primer Feedback — adjust federated_knowledge confidence ──
    // When the frontend sends patternIds (from the rlPrimerPatternIds SSE event),
    // we can track which injected patterns led to good/bad outcomes and adjust their
    // confidence accordingly. This closes the primer feedback loop.
    if (bodyPatternIds?.length && VALID_RATINGS.includes(rating as Rating)) {
      void import("@/lib/brain/rl-primer").then(({ updatePatternConfidence }) => {
        updatePatternConfidence(bodyPatternIds, rating as Rating).catch((err: unknown) =>
          logger.warn("[Feedback] updatePatternConfidence failed (non-fatal)", { err: String(err) })
        );
      }).catch(() => {}); // fire-and-forget
    }

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
      } else if (insertError.code === "PGRST204") {
        // Schema mismatch — table exists but is on old schema (missing message_id, user_id, etc.)
        // Retry with only columns guaranteed by the original migration (20260220000005)
        logger.warn("[BrainFeedback] Schema mismatch (PGRST204), retrying with legacy columns");
        const { error: retryError } = await service.from("brain_feedback_queue").insert({
          organization_id: workspaceId,
          conversation_id: conversationId || "unknown",
          message_index: 0,
          rating: rating as Rating,
          correction: correction || null,
          domain: domainId || null,
          processed: false,
          created_at: new Date().toISOString(),
        });
        if (retryError && retryError.code !== "42P01") {
          logger.error("[BrainFeedback] Legacy schema insert also failed:", retryError);
          return NextResponse.json({ error: "Internal error" }, { status: 500 });
        }
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
