/**
 * Copilot Session Memory (ADR-027)
 * =================================
 * Reads per-user routing patterns and preference memories from ai_memory
 * to inject as context into the copilot system prompt.
 *
 * This bridges the post-flight routing patterns (which WRITE to ai_memory)
 * with the copilot inference path (which needs to READ them back).
 *
 * Pattern:
 *   post-flight.ts writes: routing.{domain} AND orchestration.routing_feedback.{domain} patterns with quality scores
 *   copilot-memory.ts reads: top N routing patterns + user preferences
 *   chat/route.ts injects: "## USER CONTEXT MEMORY" block into system prompt
 *
 * Fire-and-forget safe — never throws, returns empty string on failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

type RoutingPatternRow = {
  domain: string;
  content: string;
  importance: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Recall routing patterns and user preferences for this workspace/worker.
 *
 * Returns a pre-formatted prompt block ready for injection into effectiveSystemPrompt.
 * Returns empty string if no memories found or on error.
 */
export async function recallCopilotMemory(
  supabase: SupabaseClient,
  orgId: string,
  options: {
    aiWorkerId?: string;
    userMessage?: string;
    limit?: number;
  } = {}
): Promise<string> {
  try {
    const limit = options.limit ?? 8;

    // Fetch recent routing decision patterns (written by post-flight.ts)
    let query = supabase
      .from("ai_memory")
      .select("domain, content, importance, metadata, created_at")
      .eq("organization_id", orgId)
      .eq("memory_type", "pattern")
      .or("domain.like.routing.%,domain.like.orchestration.routing_feedback.%")
      .gte("importance", 0.6)
      .order("importance", { ascending: false })
      .limit(limit);

    // ADR-027: If worker-scoped, include worker-specific + workspace-wide memories
    if (options.aiWorkerId) {
      query = query.or(`ai_worker_id.eq.${options.aiWorkerId},ai_worker_id.is.null`);
    }

    const { data: routingPatterns } = await query;

    if (!routingPatterns?.length) return "";

    const rows = routingPatterns as RoutingPatternRow[];

    // Score patterns by relevance to current message
    const userWords = (options.userMessage ?? "").toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const scored = rows.map(row => {
      const domainName = row.domain.replace(/^(routing\.|orchestration\.routing_feedback\.)/, "");
      const contentLower = row.content.toLowerCase();
      const relevance = userWords.filter(w => contentLower.includes(w) || domainName.includes(w)).length;
      return { ...row, relevance };
    });

    // Sort: message-relevant first, then by importance
    scored.sort((a, b) => {
      if (a.relevance !== b.relevance) return b.relevance - a.relevance;
      return b.importance - a.importance;
    });

    // Take top 5 for prompt injection
    const top = scored.slice(0, 5);
    if (!top.length) return "";

    const lines = top.map(p => {
      const domain = p.domain.replace(/^(routing\.|orchestration\.routing_feedback\.)/, "");
      const quality = Math.round(p.importance * 100);
      return `- ${domain}: ${p.content.slice(0, 120)} (quality: ${quality}%)`;
    });

    return `## USER CONTEXT MEMORY
Past routing decisions and preferences for this workspace:
${lines.join("\n")}
Use these patterns to inform your response style and routing accuracy.`;
  } catch (err) {
    logger.warn("[copilot-memory] recallCopilotMemory failed (non-fatal):", String(err));
    return "";
  }
}
