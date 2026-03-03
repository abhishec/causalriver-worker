/**
 * Tool Registry — ADR-027 Dynamic Tool Synthesis (PART 7)
 *
 * Registry for dynamically synthesized tools. Each tool is:
 * - Generated from capability-regret analysis
 * - Stored with metadata for RL tracking
 * - Versioned and quality-scored
 *
 * All public functions are fire-and-forget safe: they never throw.
 * They use `ai_memory` with memory_type = 'synthesized_tool' as the backing store
 * so no new tables are required.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SynthesizedTool {
  id: string;
  name: string;
  description: string;
  /** The JS/TS function body (sandboxed execution) */
  implementation: string;
  /** Domain this tool serves */
  domain: string;
  /** Quality score from RL feedback (0-1) */
  qualityScore: number;
  /** How many times this tool has been invoked */
  invocationCount: number;
  /** Success rate from invocations */
  successRate: number;
  /** When this tool was synthesized */
  createdAt: string;
  /** Source capability gap that triggered synthesis */
  sourceGapId: string | null;
}

export interface ToolInvocationRecord {
  toolId: string;
  domain: string;
  success: boolean;
  executionMs: number;
  timestamp: string;
}

// ── Internal helper types ─────────────────────────────────────────────────────

interface CapabilityGapRecord {
  id: string;
  domain: string;
  query: string;
  qualityScore: number;
  source: string;
  occurrences: number;
  detectedAt: string;
}

// ── Registry Functions ────────────────────────────────────────────────────────

/**
 * Fetch all synthesized tools for a given domain from ai_memory.
 *
 * Looks for rows with memory_type = 'synthesized_tool' and domain matching
 * either an exact match or the prefix `tool:{domain}`.
 *
 * Returns [] on any error — never throws.
 */
export async function getToolsForDomain(
  supabase: SupabaseClient,
  orgId: string,
  domain: string
): Promise<SynthesizedTool[]> {
  try {
    const { data, error } = await supabase
      .from("ai_memory")
      .select("id, content, metadata, created_at")
      .eq("organization_id", orgId)
      .eq("memory_type", "synthesized_tool")
      .or(`domain.eq.${domain},domain.eq.tool:${domain}`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error || !data) return [];

    const tools: SynthesizedTool[] = [];
    for (const row of data) {
      try {
        const parsed = JSON.parse(row.content as string) as Partial<SynthesizedTool>;
        tools.push({
          id: row.id as string,
          name: parsed.name ?? "unnamed_tool",
          description: parsed.description ?? "",
          implementation: parsed.implementation ?? "",
          domain: parsed.domain ?? domain,
          qualityScore: parsed.qualityScore ?? 0.5,
          invocationCount: parsed.invocationCount ?? 0,
          successRate: parsed.successRate ?? 0,
          createdAt: (row.created_at as string) ?? new Date().toISOString(),
          sourceGapId: parsed.sourceGapId ?? null,
        });
      } catch {
        // Skip malformed rows — never throw
      }
    }

    return tools;
  } catch (err) {
    logger.warn("[tool-registry] getToolsForDomain failed (non-fatal)", {
      domain,
      orgId,
      error: String(err),
    });
    return [];
  }
}

/**
 * Record a tool invocation outcome to ai_memory for RL tracking.
 *
 * Writes a single row with memory_type = 'tool_invocation' capturing
 * the outcome so the RL loop can update the tool's quality score over time.
 *
 * Fire-and-forget safe: never throws.
 */
export async function recordToolInvocation(
  supabase: SupabaseClient,
  orgId: string,
  record: ToolInvocationRecord
): Promise<void> {
  try {
    await supabase.from("ai_memory").insert({
      organization_id: orgId,
      domain: `tool-invocation:${record.domain}`,
      memory_type: "tool_invocation",
      content: JSON.stringify({
        toolId: record.toolId,
        domain: record.domain,
        success: record.success,
        executionMs: record.executionMs,
        timestamp: record.timestamp,
      }),
      importance: record.success ? 0.7 : 0.5,
      metadata: {
        toolId: record.toolId,
        domain: record.domain,
        success: record.success,
        executionMs: record.executionMs,
        recordedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.warn("[tool-registry] recordToolInvocation failed (non-fatal)", {
      toolId: record.toolId,
      domain: record.domain,
      error: String(err),
    });
    // fire-and-forget — never throw
  }
}

/**
 * Retrieve capability-regret records that are candidates for tool synthesis.
 *
 * Reads rows from ai_memory with memory_type = 'capability-regret', then
 * groups them by domain+query to surface gaps that have occurred N+ times.
 * Sorted by occurrence count descending so highest-impact gaps bubble to top.
 *
 * Returns [] on any error — never throws.
 *
 * @param supabase         - Supabase client (service-role recommended)
 * @param orgId            - Workspace/organization ID
 * @param options.limit    - Max number of distinct gaps to return (default: 20)
 * @param options.minOccurrences - Minimum occurrences to be a synthesis candidate (default: 1)
 */
export async function getCapabilityGaps(
  supabase: SupabaseClient,
  orgId: string,
  options?: { limit?: number; minOccurrences?: number }
): Promise<CapabilityGapRecord[]> {
  const limit = options?.limit ?? 20;
  const minOccurrences = options?.minOccurrences ?? 1;

  try {
    const { data, error } = await supabase
      .from("ai_memory")
      .select("id, domain, content, metadata, created_at")
      .eq("organization_id", orgId)
      .eq("memory_type", "capability-regret")
      .order("created_at", { ascending: false })
      // Fetch enough rows to aggregate — 5× the requested limit is a safe ceiling
      .limit(limit * 5);

    if (error || !data) return [];

    // Group by domain+query to count occurrences
    const grouped = new Map<
      string,
      { record: CapabilityGapRecord; count: number }
    >();

    for (const row of data) {
      try {
        const parsed = JSON.parse(row.content as string) as {
          domain?: string;
          query?: string;
          qualityScore?: number;
          source?: string;
          detectedAt?: string;
        };

        const domain = parsed.domain ?? (row.domain as string).replace("capability-gap:", "");
        const query = (parsed.query ?? "").slice(0, 300);
        const key = `${domain}||${query}`;

        if (grouped.has(key)) {
          grouped.get(key)!.count += 1;
        } else {
          grouped.set(key, {
            count: 1,
            record: {
              id: row.id as string,
              domain,
              query,
              qualityScore: parsed.qualityScore ?? 0.5,
              source: parsed.source ?? "unknown",
              occurrences: 1,
              detectedAt: (row.created_at as string) ?? new Date().toISOString(),
            },
          });
        }
      } catch {
        // Skip malformed rows
      }
    }

    // Flatten, apply minOccurrences filter, sort by count desc, truncate
    const results: CapabilityGapRecord[] = [];
    for (const { record, count } of grouped.values()) {
      if (count >= minOccurrences) {
        results.push({ ...record, occurrences: count });
      }
    }

    results.sort((a, b) => b.occurrences - a.occurrences);
    return results.slice(0, limit);
  } catch (err) {
    logger.warn("[tool-registry] getCapabilityGaps failed (non-fatal)", {
      orgId,
      error: String(err),
    });
    return [];
  }
}
