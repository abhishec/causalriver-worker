/**
 * /api/agents/sessions/[id]/turn
 *
 * POST — Submit a new user input turn OR record feedback on an existing turn
 *
 * Two modes based on request body:
 *
 * Mode 1 — New turn (userInput provided):
 *   { userInput: string, agentType: string, organizationId: string, feedback?: { turnId, type, notes } }
 *   → Calls executeInteractiveAgent() and returns the agent's output
 *
 * Mode 2 — Feedback only (feedback provided, no userInput):
 *   { feedback: { turnId: string, type: 'approved'|'rejected'|'revised', notes?: string } }
 *   → Calls updateSessionFeedback() and returns success
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { updateSessionFeedback, recordSessionTurn, getSessionContext } from "@/lib/agents/session-manager";
import { executePrimitive } from "@/lib/brain/primitive-registry";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
    }

    // Auth
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    let body: {
      userInput?: string;
      agentType?: string;
      organizationId?: string;
      feedback?: {
        turnId?: string;
        type?: "approved" | "rejected" | "revised";
        notes?: string;
      };
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Verify session ownership via admin client
    const admin = getAdminClient();
    const { data: sessionRow, error: sessionFetchError } = await admin
      .from("agent_sessions")
      .select("organization_id, agent_type, status")
      .eq("id", sessionId)
      .single();

    if (sessionFetchError || !sessionRow) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const organizationId =
      (body.organizationId as string | undefined) ??
      (sessionRow.organization_id as string);

    // Verify org membership
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check session is not already completed
    if (sessionRow.status === "completed") {
      return NextResponse.json(
        { error: "Session is already completed. Create a new session to continue." },
        { status: 409 }
      );
    }

    // ── Mode 2: Feedback-only (no userInput) ──────────────────────────────────
    if (!body.userInput && body.feedback) {
      const { turnId, type, notes } = body.feedback;

      if (!turnId || !type) {
        return NextResponse.json(
          { error: "feedback.turnId and feedback.type are required" },
          { status: 400 }
        );
      }

      if (!["approved", "rejected", "revised"].includes(type)) {
        return NextResponse.json(
          { error: "feedback.type must be 'approved', 'rejected', or 'revised'" },
          { status: 400 }
        );
      }

      const success = await updateSessionFeedback(supabase, turnId, { type, notes });

      if (!success) {
        return NextResponse.json(
          { error: "Failed to record feedback" },
          { status: 500 }
        );
      }

      // ── Feedback → Few-shot bridge ─────────────────────────────────────────
      // When a turn is APPROVED, auto-add to the agent's few-shot corpus so
      // future turns improve from this example. Fire-and-forget (non-blocking).
      if (type === "approved") {
        void (async () => {
          try {
            // Fetch the approved turn to get input/output, and session to get corpusId
            const [turnResult, corpusResult] = await Promise.all([
              admin.from("agent_session_turns").select("user_input, agent_output").eq("id", turnId).single(),
              admin.from("agent_corpus").select("id").eq("session_id", sessionId).maybeSingle(),
            ]);

            const turnRow = turnResult.data;
            const corpusRow = corpusResult.data;

            if (turnRow?.agent_output && corpusRow?.id) {
              const { recordApprovedExample } = await import("@/lib/agents/few-shot-accumulator");
              await recordApprovedExample(admin, {
                corpusId: corpusRow.id,
                sessionId,
                turnId,
                input: String(turnRow.user_input ?? ""),
                output: String(turnRow.agent_output),
                quality: 0.9,
              });
              logger.warn("[turn] Approved output added to few-shot corpus", { sessionId, turnId, corpusId: corpusRow.id });
            }
          } catch (fsErr) {
            logger.warn("[turn] Few-shot accumulation failed (non-fatal)", { error: String(fsErr) });
          }
        })();
      }

      logger.warn("[/api/agents/sessions/[id]/turn POST] Feedback recorded", {
        sessionId,
        turnId,
        type,
      });

      return NextResponse.json({ success: true, turnId });
    }

    // ── Mode 1: New turn with userInput ───────────────────────────────────────
    if (!body.userInput) {
      return NextResponse.json(
        { error: "Either userInput or feedback is required" },
        { status: 400 }
      );
    }

    const agentType =
      (body.agentType as string | undefined) ??
      (sessionRow.agent_type as string) ??
      "custom";

    // Build feedback param with turnId if provided alongside userInput
    const feedbackWithTurnId =
      body.feedback?.type && body.feedback?.turnId
        ? {
            type: body.feedback.type,
            notes: body.feedback.notes,
            turnId: body.feedback.turnId,
          }
        : undefined;

    // Record any feedback on previous turn before running new turn
    if (feedbackWithTurnId) {
      await updateSessionFeedback(supabase, feedbackWithTurnId.turnId, {
        type: feedbackWithTurnId.type,
        notes: feedbackWithTurnId.notes,
      });
    }

    // Execute the session turn via the Primitive Registry
    const ctx = {
      supabase,
      organizationId,
      userId: user.id,
      aiWorkerId: undefined as string | undefined,
    };

    const result = await executePrimitive(ctx, "session", {
      action: "continue",
      userInput: body.userInput,
    });

    if (result["error"]) {
      return NextResponse.json({ error: result["error"] }, { status: 400 });
    }

    // If no active session was found, fall back to creating a new turn manually
    if (!result["sessionId"]) {
      logger.warn("[/api/agents/sessions/[id]/turn POST] No active session from primitive, using direct session", {
        sessionId,
      });
      // Direct fallback: record the session context manually
      const sessionCtx = await getSessionContext(supabase, sessionId);
      if (!sessionCtx) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      const turn = await recordSessionTurn(supabase, sessionId, {
        userInput: body.userInput,
        agentOutput: "Unable to process turn at this time.",
      });
      return NextResponse.json({
        output: "Unable to process turn at this time.",
        turnId: turn?.turnId ?? null,
        turnNumber: turn?.turnNumber ?? 0,
        sessionId,
        tokensUsed: 0,
      });
    }

    logger.warn("[/api/agents/sessions/[id]/turn POST] Turn executed", {
      sessionId: result["sessionId"],
      turnId: result["turnId"],
      turnNumber: result["turnNumber"],
    });

    return NextResponse.json({
      output: result["output"],
      turnId: result["turnId"],
      turnNumber: result["turnNumber"],
      sessionId: result["sessionId"],
      tokensUsed: 0,
    });
  } catch (err) {
    logger.error("[/api/agents/sessions/[id]/turn POST] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
