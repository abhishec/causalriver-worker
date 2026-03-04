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
 *   agent-rl.ts writes: structured-outcome memories (Haiku-extracted {worked, failed, pattern})
 *   copilot-memory.ts reads: top N routing patterns + structured-outcome agent learnings
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

type StructuredOutcomeRow = {
  id: string;
  domain: string;
  content: string;
  importance: number;
  created_at: string;
};

/**
 * Recall routing patterns, agent learnings, and user preferences for this workspace/worker.
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

    // ── Two parallel queries: routing patterns + structured-outcome agent learnings ──
    let routingQuery = supabase
      .from("ai_memory")
      .select("domain, content, importance, metadata, created_at")
      .eq("organization_id", orgId)
      .eq("memory_type", "pattern")
      .or("domain.like.routing.%,domain.like.orchestration.routing_feedback.%")
      .gte("importance", 0.6)
      .order("importance", { ascending: false })
      .limit(limit);

    let outcomeQuery = supabase
      .from("ai_memory")
      .select("id, domain, content, importance, created_at")
      .eq("organization_id", orgId)
      .eq("memory_type", "structured-outcome")
      .order("importance", { ascending: false })
      .limit(5);

    // ADR-027: If worker-scoped, include worker-specific + workspace-wide memories
    if (options.aiWorkerId) {
      routingQuery = routingQuery.or(`ai_worker_id.eq.${options.aiWorkerId},ai_worker_id.is.null`);
      outcomeQuery = outcomeQuery.or(`ai_worker_id.eq.${options.aiWorkerId},ai_worker_id.is.null`);
    }

    const [routingResult, outcomeResult] = await Promise.allSettled([
      routingQuery,
      outcomeQuery,
    ]);

    const routingPatterns = routingResult.status === "fulfilled"
      ? (routingResult.value.data as RoutingPatternRow[] | null) ?? []
      : [];
    const structuredOutcomes = outcomeResult.status === "fulfilled"
      ? (outcomeResult.value.data as StructuredOutcomeRow[] | null) ?? []
      : [];

    if (!routingPatterns.length && !structuredOutcomes.length) return "";

    // ── Build routing patterns section ──────────────────────────────────────
    let routingBlock = "";
    if (routingPatterns.length > 0) {
      const userWords = (options.userMessage ?? "").toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const scored = routingPatterns.map(row => {
        const domainName = row.domain.replace(/^(routing\.|orchestration\.routing_feedback\.)/, "");
        const contentLower = row.content.toLowerCase();
        const relevance = userWords.filter(w => contentLower.includes(w) || domainName.includes(w)).length;
        return { ...row, relevance };
      });

      scored.sort((a, b) => {
        if (a.relevance !== b.relevance) return b.relevance - a.relevance;
        return b.importance - a.importance;
      });

      const top = scored.slice(0, 5);
      if (top.length) {
        const lines = top.map(p => {
          const domain = p.domain.replace(/^(routing\.|orchestration\.routing_feedback\.)/, "");
          const quality = Math.round(p.importance * 100);
          return `- ${domain}: ${p.content.slice(0, 120)} (quality: ${quality}%)`;
        });
        routingBlock = `Past routing decisions and preferences for this workspace:\n${lines.join("\n")}`;
      }
    }

    // ── Build agent learnings section (structured-outcome) ──────────────────
    let learningsBlock = "";
    if (structuredOutcomes.length > 0) {
      const lines = structuredOutcomes.map(row => {
        try {
          const parsed = JSON.parse(row.content) as { worked?: string; failed?: string; pattern?: string };
          const parts = [
            parsed.worked ? `Worked: ${parsed.worked}` : null,
            parsed.failed && parsed.failed !== "nothing failed" ? `Failed: ${parsed.failed}` : null,
            parsed.pattern ? `Pattern: ${parsed.pattern}` : null,
          ].filter(Boolean).join(". ");
          return `- [${row.domain}] ${parts}`;
        } catch {
          return `- [${row.domain}] ${row.content.slice(0, 120)}`;
        }
      });
      learningsBlock = `Agent learnings from prior executions:\n${lines.join("\n")}`;

      // ── Fire-and-forget: update last_accessed_at for accessed memories ────
      const ids = structuredOutcomes.map(r => r.id);
      if (ids.length > 0) {
        void supabase
          .from("ai_memory")
          .update({ last_accessed_at: new Date().toISOString() })
          .in("id", ids)
          .then(() => {}, () => {}); // fire-and-forget
      }
    }

    // ── Assemble final prompt block ─────────────────────────────────────────
    const sections = [routingBlock, learningsBlock].filter(Boolean);
    if (!sections.length) return "";

    return `## USER CONTEXT MEMORY
${sections.join("\n\n")}
Use these patterns to inform your response style and routing accuracy.`;
  } catch (err) {
    logger.warn("[copilot-memory] recallCopilotMemory failed (non-fatal):", String(err));
    return "";
  }
}
