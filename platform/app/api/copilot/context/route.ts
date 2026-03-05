import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import { routeCallType } from "@/lib/se-aas/model-router";
import { captureStreamedResponse as _captureContextSummary } from "@/lib/brain/claude-learning-capture";
import { checkSessionRateLimit } from "@/lib/security-middleware";

// Must be force-dynamic: reads auth cookies per request
export const dynamic = "force-dynamic";

/**
 * GET /api/copilot/context?orgId=xxx
 *
 * Returns context stats for the current user's org:
 * - estimatedTokens: rough token count across recent conversations
 * - maxTokens: the configured limit (8000 for in-chat compression)
 * - usagePct: 0-1 ratio
 */

const MAX_TOKENS = 8_000;
// 15-second timeout for Anthropic summarization — prevents Lambda hang (audit C2)
const ANTHROPIC_TIMEOUT_MS = 15_000;
const CHARS_PER_TOKEN = 4;
const MODEL_FAST = routeCallType('context-compress').model;

function countTokens(messages: Array<{ role: string; content: string }>): number {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    // Verify the authenticated user is a member of this org before using admin client
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminClient();
    const { data: convos } = await admin
      .from("conversations")
      .select("messages")
      .eq("organization_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(5);

    const totalChars = (convos ?? []).reduce((sum: number, c: { messages?: unknown }) => {
      const msgs = Array.isArray(c.messages) ? c.messages : [];
      return sum + msgs.reduce((s: number, m: { content?: string }) => s + (m.content?.length ?? 0), 0);
    }, 0);
    const estimatedTokens = Math.floor(totalChars / CHARS_PER_TOKEN);
    const messageCount = (convos ?? []).reduce((s: number, c: { messages?: unknown }) => {
      return s + (Array.isArray(c.messages) ? c.messages.length : 0);
    }, 0);

    return NextResponse.json({
      maxTokens: MAX_TOKENS,
      estimatedTokens,
      usagePct: Math.min(estimatedTokens / MAX_TOKENS, 1),
      messageCount,
      canCompress: estimatedTokens > 2000,
    });
  } catch (err) {
    logger.error("[context/GET] Error:", { error: (err as Error)?.message ?? String(err), route: "/api/copilot/context" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/copilot/context/compress
 *
 * Body: { messages: Array<{role: string, content: string}>, orgId: string }
 *
 * Logic:
 *  - Count tokens (4 chars = 1 token)
 *  - If total > 8000:
 *    - Keep system message (first message if role === "system")
 *    - Keep last 6 messages (most recent context)
 *    - Summarize the pruned middle messages using Haiku
 *    - Return compressed array with summary injected as a system-style message
 *  - If total <= 8000: return messages unchanged
 *
 * Response: { compressed: Message[], summary: string, tokensSaved: number }
 */

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: context compression calls Anthropic — cap at 20 req/min per user
    const rateLimit = await checkSessionRateLimit(user.id, "/api/copilot/context");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before compressing again." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { messages, orgId } = body as {
      messages: Array<{ role: string; content: string }>;
      orgId: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
    }
    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    // Verify the authenticated user is a member of this org before any admin operations
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const originalTokens = countTokens(messages);

    // If under the threshold, return unchanged
    if (originalTokens <= MAX_TOKENS) {
      return NextResponse.json({
        compressed: messages,
        summary: "",
        tokensSaved: 0,
      });
    }

    // Partition: system message (first if role==="system"), last 6, and the middle
    const systemMsg = messages[0]?.role === "system" ? messages[0] : null;
    const nonSystemMessages = systemMsg ? messages.slice(1) : messages;
    const KEEP_RECENT = 6;
    const recentMessages = nonSystemMessages.slice(-KEEP_RECENT);
    const middleMessages = nonSystemMessages.slice(0, nonSystemMessages.length - KEEP_RECENT);

    let summary = "";
    let compressed: Array<{ role: string; content: string }>;

    if (middleMessages.length === 0) {
      // Nothing to compress — return unchanged even though over limit
      return NextResponse.json({
        compressed: messages,
        summary: "",
        tokensSaved: 0,
      });
    }

    // Try to summarize with Claude Haiku — graceful fallback if unavailable
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      try {
        const anthropic = new Anthropic({ apiKey: anthropicKey });
        const historyText = middleMessages.map((m) => {
          const role = m.role === "user" ? "User" : "Assistant";
          const content = typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content);
          return `${role}: ${content.slice(0, 600)}${content.length > 600 ? "..." : ""}`;
        }).join("\n\n");

        const summaryResponse = await Promise.race([
          anthropic.messages.create({
          model: MODEL_FAST,
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: `Summarize the following conversation excerpt into a concise context block (max 200 words). Preserve:
1. Key questions and goals the user had
2. Important facts, metrics, or data points
3. Decisions or conclusions reached
4. Any tasks or items still in progress

Conversation excerpt:
${historyText}

Write a compact summary that lets the conversation continue with full context.`,
            },
          ],
        }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Anthropic context compress timeout")), ANTHROPIC_TIMEOUT_MS)
          ),
        ]);

        summary = summaryResponse.content[0]?.type === "text"
          ? summaryResponse.content[0].text
          : "";

        // Capture the compression summary as a learning signal (fire-and-forget)
        if (summary && summary.length > 50) {
          const _adminCapture = getAdminClient();
          _captureContextSummary(summary, 0, {
            supabase: _adminCapture,
            organizationId: orgId,
            domain: 'copilot.context-compress',
            inputSummary: `${middleMessages.length} messages compressed`,
            qualityThreshold: 0.4,
          });
        }
      } catch (claudeErr) {
        logger.warn("[context/compress] Claude summarization failed, falling back to prune-only:", { error: (claudeErr as Error)?.message ?? String(claudeErr), route: "/api/copilot/context" });
        summary = "";
      }
    } else {
      logger.warn("[context/compress] ANTHROPIC_API_KEY not set — compressing without summary");
    }

    // Build compressed message array
    const summaryMessage: { role: string; content: string } = {
      role: "system",
      content: summary
        ? `[Earlier conversation summary — ${middleMessages.length} messages compressed]\n\n${summary}`
        : `[${middleMessages.length} earlier messages were removed to stay within context limits]`,
    };

    compressed = [
      ...(systemMsg ? [systemMsg] : []),
      summaryMessage,
      ...recentMessages,
    ];

    const newTokens = countTokens(compressed);
    const tokensSaved = Math.max(0, originalTokens - newTokens);

    logger.warn("[context/compress] Compressed conversation", {
      originalTokens,
      newTokens,
      tokensSaved,
      middleCollapsed: middleMessages.length,
      recentKept: recentMessages.length,
    });

    return NextResponse.json({
      compressed,
      summary,
      tokensSaved,
    });
  } catch (err) {
    logger.error("[context/compress] Error:", { error: (err as Error)?.message ?? String(err), route: "/api/copilot/context" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
