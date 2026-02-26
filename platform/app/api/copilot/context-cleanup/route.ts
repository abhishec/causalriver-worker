import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import Anthropic from "@anthropic-ai/sdk";

// Must be force-dynamic: reads auth cookies + workspace context per request
export const dynamic = "force-dynamic";

/**
 * POST /api/copilot/context-cleanup
 *
 * Triggered when a conversation's token count approaches the model limit.
 * Summarizes the conversation history into a compact context block, then
 * stores the summary so subsequent turns use it instead of the full history.
 *
 * Body: { conversationId: string, strategy?: "summarize" }
 *
 * Response: { ok: true, summary: string, messagesCollapsed: number, newTokenEstimate: number }
 *
 * Uses MODEL_FAST (Haiku) for cost-efficient summarization.
 */

const MODEL_FAST = "claude-haiku-4-5-20251001";
// Token threshold: summarize when conversation exceeds 80K tokens (Haiku 200K context)
export const CLEANUP_THRESHOLD_TOKENS = 80_000;
// Rough estimate: average tokens per message (system + user + assistant combined)
const AVG_TOKENS_PER_MESSAGE = 300;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    const { conversationId, strategy = "summarize" } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    // Fetch the conversation (scoped to this user + org)
    const admin = getAdminClient();
    const { data: convo, error: fetchError } = await admin
      .from("conversations")
      .select("id, messages, token_count, context_summary, org_id, user_id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError || !convo) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Only run cleanup if this conversation belongs to the current workspace
    if (convo.org_id !== workspaceId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const messages: { role: string; content: string }[] = convo.messages ?? [];
    if (messages.length < 4) {
      return NextResponse.json({ ok: false, reason: "Conversation too short for cleanup" });
    }

    // Build a text representation for summarization
    const historyText = messages.map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      const content = typeof m.content === "string"
        ? m.content
        : JSON.stringify(m.content);
      return `${role}: ${content.slice(0, 500)}${content.length > 500 ? "..." : ""}`;
    }).join("\n\n");

    // Run Haiku summarization
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const summaryResponse = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Summarize the following conversation into a concise context block (max 300 words). Focus on:
1. The user's key questions and goals
2. Key facts, metrics, and data points mentioned
3. Decisions or recommendations made
4. Any ongoing tasks or follow-up items

Conversation:
${historyText}

Write a compact, dense summary that preserves all important context for continuing this conversation.`,
        },
      ],
    });

    const summary = summaryResponse.content[0]?.type === "text"
      ? summaryResponse.content[0].text
      : "";

    if (!summary) {
      return NextResponse.json({ error: "Summarization produced no output" }, { status: 500 });
    }

    // Store the summary and reset token count estimate
    const newTokenEstimate = Math.round(summary.split(" ").length * 1.3); // rough estimate
    const messagesCollapsed = messages.length;

    const contextSummary = {
      summary,
      summarized_at: new Date().toISOString(),
      messages_collapsed: messagesCollapsed,
      original_token_count: convo.token_count || (messagesCollapsed * AVG_TOKENS_PER_MESSAGE),
    };

    const { error: updateError } = await admin
      .from("conversations")
      .update({
        context_summary: contextSummary,
        token_count: newTokenEstimate,
      })
      .eq("id", conversationId);

    if (updateError) {
      logger.error("[context-cleanup] Failed to store summary:", updateError);
      return NextResponse.json({ error: "Failed to save summary" }, { status: 500 });
    }

    logger.warn("[context-cleanup] Cleaned conversation", {
      conversationId,
      messagesCollapsed,
      originalTokens: contextSummary.original_token_count,
      newTokenEstimate,
    });

    return NextResponse.json({
      ok: true,
      summary,
      messagesCollapsed,
      newTokenEstimate,
    });
  } catch (err) {
    logger.error("[context-cleanup] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
