/**
 * Tool Registry — ADR-027 Dynamic Tool Synthesis (PART 7)
 *
 * @deprecated ADR-028: This module is a backward-compat wrapper. New code should use:
 *   - tool-maker.ts for synthesis
 *   - tool-retrieval.ts for retrieval
 *   - tool-lifecycle.ts for quality updates
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

// ── Module-level dedup guard ────────────────────────────────────────────────
const _synthLastRunMs = new Map<string, number>();
const SYNTH_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between synthesis runs per org

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

    // ADR-028: Also query capability_library for newer tools
    try {
      const { data: clTools } = await supabase
        .from("capability_library")
        .select("id, name, description, domain, implementation, quality_score, invocation_count, success_rate, created_at, source_gap_id")
        .eq("organization_id", orgId)
        .in("status", ["validated", "promoted"])
        .or(`domain.eq.${domain},domain.like.${domain}.%`)
        .order("quality_score", { ascending: false })
        .limit(10);

      if (clTools?.length) {
        for (const row of clTools) {
          // Avoid duplicates by name
          if (!tools.some(t => t.name === (row.name as string))) {
            tools.push({
              id: row.id as string,
              name: row.name as string,
              description: (row.description as string) || "",
              implementation: (row.implementation as string) || "",
              domain: (row.domain as string) || domain,
              qualityScore: (row.quality_score as number) ?? 0.5,
              invocationCount: (row.invocation_count as number) ?? 0,
              successRate: (row.success_rate as number) ?? 0,
              createdAt: (row.created_at as string) ?? new Date().toISOString(),
              sourceGapId: (row.source_gap_id as string) ?? null,
            });
          }
        }
      }
    } catch {
      // capability_library may not exist yet — non-fatal
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

// ── 7D: Tool Synthesis Scheduler ────────────────────────────────────────────

/**
 * @deprecated ADR-028: Use tool-maker.ts synthesizeToolFromGap() instead.
 * This function is kept for backward compat — it still works but uses
 * Haiku-only synthesis without self-correction loops.
 *
 * Synthesize tools from recurring capability gaps (ADR-027 PART 7D).
 *
 * Reads capability-regret records with 3+ occurrences, checks if a tool
 * already exists for that domain, and if not, creates a synthesized tool
 * entry in ai_memory. Uses Haiku for cheap function generation.
 *
 * Called from cognitive-cycle cron. TTL-guarded to max once per 30 min per org.
 * Fire-and-forget safe: never throws.
 *
 * @returns Number of tools synthesized (0 if none needed or on error)
 */
export async function synthesizeToolsFromGaps(
  supabase: SupabaseClient,
  orgId: string,
  anthropicApiKey?: string,
): Promise<number> {
  // TTL guard — max once per 30 min per org
  const lastRun = _synthLastRunMs.get(orgId) ?? 0;
  if (Date.now() - lastRun < SYNTH_COOLDOWN_MS) return 0;
  _synthLastRunMs.set(orgId, Date.now());

  try {
    // 1. Find recurring gaps (3+ occurrences = strong synthesis signal)
    const gaps = await getCapabilityGaps(supabase, orgId, {
      limit: 5,
      minOccurrences: 3,
    });

    if (!gaps.length) return 0;

    let synthesized = 0;

    for (const gap of gaps) {
      // 2. Check if tool already exists for this domain
      const existing = await getToolsForDomain(supabase, orgId, gap.domain);
      const alreadyExists = existing.some(
        (t) => t.domain === gap.domain && t.qualityScore > 0.3
      );
      if (alreadyExists) continue;

      // 3. Synthesize a tool spec (cheap Haiku call if API key available,
      //    otherwise create a descriptive stub)
      let toolSpec: Partial<SynthesizedTool>;

      if (anthropicApiKey) {
        try {
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const client = new Anthropic({ apiKey: anthropicApiKey });
          const resp = await client.messages.create({
            model: "claude-3-5-haiku-latest",
            max_tokens: 800,
            messages: [
              {
                role: "user",
                content: `Generate a JavaScript helper function for this capability gap:
Domain: ${gap.domain}
Recurring query pattern: ${gap.query.slice(0, 200)}
Quality score when this gap was hit: ${gap.qualityScore}

Return ONLY valid JSON with these fields:
{
  "name": "function_name",
  "description": "what it does in 1 sentence",
  "implementation": "function body as a single string"
}`,
              },
            ],
          });

          const text =
            resp.content[0]?.type === "text" ? resp.content[0].text : "";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            toolSpec = {
              name: parsed.name ?? `tool_${gap.domain.replace(/[^a-z0-9]/gi, "_")}`,
              description: parsed.description ?? `Synthesized tool for ${gap.domain}`,
              implementation: parsed.implementation ?? "",
              domain: gap.domain,
              qualityScore: 0.5,
              invocationCount: 0,
              successRate: 0,
              sourceGapId: gap.id,
            };
          } else {
            toolSpec = _createStubTool(gap);
          }
        } catch {
          toolSpec = _createStubTool(gap);
        }
      } else {
        toolSpec = _createStubTool(gap);
      }

      // 4. Store synthesized tool in ai_memory
      try {
        await supabase.from("ai_memory").insert({
          organization_id: orgId,
          domain: `tool:${gap.domain}`,
          memory_type: "synthesized_tool",
          content: JSON.stringify(toolSpec),
          importance: 0.6,
          metadata: {
            synthesizedAt: new Date().toISOString(),
            sourceGapId: gap.id,
            gapOccurrences: gap.occurrences,
            domain: gap.domain,
          },
        });
        synthesized++;
      } catch {
        // Non-fatal: single tool write failure doesn't block others
      }
    }

    if (synthesized > 0) {
      logger.info("[tool-registry] Synthesized tools from capability gaps", {
        orgId,
        synthesized,
        gapsEvaluated: gaps.length,
      });
    }

    return synthesized;
  } catch (err) {
    logger.warn("[tool-registry] synthesizeToolsFromGaps failed (non-fatal)", {
      orgId,
      error: String(err),
    });
    return 0;
  }
}

/** Create a descriptive stub tool when Haiku synthesis is unavailable */
function _createStubTool(gap: CapabilityGapRecord): Partial<SynthesizedTool> {
  return {
    name: `tool_${gap.domain.replace(/[^a-z0-9]/gi, "_")}`,
    description: `Capability gap detected: ${gap.query.slice(0, 120)}. Needs human-guided synthesis.`,
    implementation: `// Stub: synthesized from ${gap.occurrences} occurrences of capability gap in domain "${gap.domain}"`,
    domain: gap.domain,
    qualityScore: 0.3,
    invocationCount: 0,
    successRate: 0,
    sourceGapId: gap.id,
  };
}

// ── 7E: Tool RL Feedback Aggregation ────────────────────────────────────────

/**
 * @deprecated ADR-028: Use tool-lifecycle.ts updateToolQualities() instead.
 *
 * Update a synthesized tool's quality metrics from recorded invocations.
 *
 * Reads recent tool_invocation records for a specific tool, computes
 * success rate and updates the tool's quality score in ai_memory.
 *
 * Fire-and-forget safe: never throws.
 */
export async function updateToolQualityFromInvocations(
  supabase: SupabaseClient,
  orgId: string,
  toolId: string,
  domain: string,
): Promise<void> {
  try {
    // Read recent invocations for this tool
    const { data: invocations } = await supabase
      .from("ai_memory")
      .select("content")
      .eq("organization_id", orgId)
      .eq("memory_type", "tool_invocation")
      .eq("domain", `tool-invocation:${domain}`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!invocations?.length) return;

    // Compute success rate
    let successes = 0;
    let total = 0;
    for (const row of invocations) {
      try {
        const parsed = JSON.parse(row.content as string);
        if (parsed.toolId === toolId) {
          total++;
          if (parsed.success) successes++;
        }
      } catch { /* skip malformed */ }
    }

    if (total === 0) return;

    const successRate = successes / total;
    const newQuality = Math.min(0.95, 0.3 + successRate * 0.6); // 0.3–0.9 range

    // Update the tool's quality score
    await supabase
      .from("ai_memory")
      .update({
        importance: newQuality,
        metadata: {
          lastRLUpdate: new Date().toISOString(),
          invocationCount: total,
          successRate,
          computedQuality: newQuality,
        },
      })
      .eq("id", toolId)
      .eq("memory_type", "synthesized_tool");

    logger.info("[tool-registry] Updated tool quality from invocations", {
      toolId: toolId.slice(0, 8),
      domain,
      successRate: Math.round(successRate * 100),
      newQuality: Math.round(newQuality * 100),
      invocations: total,
    });
  } catch (err) {
    logger.warn("[tool-registry] updateToolQualityFromInvocations failed", {
      toolId,
      error: String(err),
    });
  }
}
