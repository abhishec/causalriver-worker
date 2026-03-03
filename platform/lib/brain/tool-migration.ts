/**
 * Tool Migration Utility (ADR-028)
 * =================================
 *
 * One-time migration: ai_memory (synthesized_tool rows) → capability_library table.
 *
 * Called from cognitive-cycle cron on first run. Idempotent — skips if
 * capability_library already has rows for this org.
 *
 * Fire-and-forget safe: never throws.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Migrate synthesized tools from ai_memory to capability_library.
 *
 * Reads ai_memory rows with memory_type = 'synthesized_tool' and inserts
 * them into capability_library with status='candidate' and embedding=null
 * (the next cron run will embed them).
 *
 * Idempotent: if capability_library already has rows for this org, returns 0.
 *
 * @returns Number of tools migrated (0 if none needed or on error)
 */
export async function migrateToolsFromAiMemory(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  try {
    // Check if capability_library already has rows for this org
    // If so, migration already happened — skip
    const { data: existing, error: existErr } = await supabase
      .from("capability_library")
      .select("id")
      .eq("organization_id", orgId)
      .limit(1);

    if (existErr) {
      // Table might not exist yet — not an error, just skip
      logger.info("[tool-migration] capability_library not available yet, skipping", {
        orgId,
        error: String(existErr),
      });
      return 0;
    }

    if (existing && existing.length > 0) {
      // Already migrated
      return 0;
    }

    // Read all synthesized_tool rows from ai_memory
    const { data: aiMemoryTools, error: readErr } = await supabase
      .from("ai_memory")
      .select("id, content, metadata, created_at")
      .eq("organization_id", orgId)
      .eq("memory_type", "synthesized_tool")
      .order("created_at", { ascending: false })
      .limit(100);

    if (readErr || !aiMemoryTools?.length) {
      return 0;
    }

    let migrated = 0;

    for (const row of aiMemoryTools) {
      try {
        const parsed = JSON.parse(row.content as string) as {
          name?: string;
          description?: string;
          implementation?: string;
          domain?: string;
          qualityScore?: number;
          invocationCount?: number;
          successRate?: number;
          sourceGapId?: string;
        };

        if (!parsed.name || !parsed.implementation) continue;

        const { error: insertErr } = await supabase
          .from("capability_library")
          .insert({
            organization_id: orgId,
            name: parsed.name,
            description: parsed.description || `Migrated tool: ${parsed.name}`,
            domain: parsed.domain || "general",
            implementation: parsed.implementation,
            input_schema: {},
            output_schema: {},
            test_cases: [],
            // embedding: null — will be filled by next cron run
            tags: [parsed.domain || "general", "migrated"],
            status: "candidate" as const,
            quality_score: parsed.qualityScore ?? 0.5,
            invocation_count: parsed.invocationCount ?? 0,
            success_rate: parsed.successRate ?? 0,
            revision_count: 0,
            source_gap_id: parsed.sourceGapId || null,
            synthesized_by: "haiku", // original tools were all Haiku-synthesized
          });

        if (!insertErr) {
          migrated++;
        }
      } catch {
        // Skip malformed rows — never throw
      }
    }

    if (migrated > 0) {
      logger.info("[tool-migration] Migrated tools from ai_memory to capability_library", {
        orgId,
        migrated,
        total: aiMemoryTools.length,
      });
    }

    return migrated;
  } catch (err) {
    logger.warn("[tool-migration] migrateToolsFromAiMemory failed (non-fatal)", {
      orgId,
      error: String(err),
    });
    return 0;
  }
}
