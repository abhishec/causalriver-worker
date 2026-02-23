export const dynamic = "force-dynamic";
/**
 * Suggestion Feedback API
 *
 * POST /api/suggestions/feedback
 *   Records user feedback on a smart suggestion (accept, dismiss, helpful, not_relevant).
 *   Emits RL signals for the brain to learn from.
 *
 * Body: {
 *   organizationId: string,
 *   suggestionType: string,
 *   action: "accepted" | "dismissed" | "helpful" | "not_relevant",
 *   suggestionData?: object
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordSuggestionFeedback } from "@/lib/suggestions/suggestion-learner";
import type { FeedbackAction } from "@/lib/suggestions/suggestion-learner";

const VALID_ACTIONS: FeedbackAction[] = ["accepted", "dismissed", "helpful", "not_relevant"];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, suggestionType, action, suggestionData } = body;

    // Validate required fields
    if (!organizationId || !suggestionType || !action) {
      return NextResponse.json(
        { error: "Missing required fields: organizationId, suggestionType, action" },
        { status: 400 },
      );
    }

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await recordSuggestionFeedback(supabase, {
      organizationId,
      userId: user.id,
      suggestionType,
      action,
      suggestionData,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
