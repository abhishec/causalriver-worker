import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export const CORE_BRAIN_ORG_ID = "00000000-0000-4000-a000-000000000001";
export const CORE_BRAIN_ORG_NAME = "__CORE_BRAIN__";

/**
 * Ensure the CORE brain org exists. Creates it if missing.
 * Called at cron startup and from the health check.
 * Fire-and-forget safe — never throws.
 */
export async function ensureCoreBrain(supabase: SupabaseClient): Promise<boolean> {
  try {
    // Check if CORE brain exists
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", CORE_BRAIN_ORG_ID)
      .single();

    if (existing) return true;

    // Doesn't exist — recreate it
    logger.warn("[core-brain] CORE brain org missing — recreating");

    const { error } = await supabase
      .from("organizations")
      .upsert(
        {
          id: CORE_BRAIN_ORG_ID,
          name: CORE_BRAIN_ORG_NAME,
          created_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (error) {
      logger.warn("[core-brain] failed to recreate CORE brain org:", error);
      return false;
    }

    logger.warn("[core-brain] CORE brain org recreated successfully");
    return true;
  } catch (err) {
    logger.warn("[core-brain] ensureCoreBrain error:", err);
    return false;
  }
}

/**
 * Check CORE brain health: org exists, process_templates table has rows.
 */
export async function checkCoreBrainHealth(supabase: SupabaseClient): Promise<{
  healthy: boolean;
  orgExists: boolean;
  templateCount: number;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check org exists
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", CORE_BRAIN_ORG_ID)
    .single();

  const orgExists = !!org;
  if (!orgExists) issues.push("CORE brain org row is missing from organizations table");

  // Check process_templates
  const { count } = await supabase
    .from("process_templates")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", CORE_BRAIN_ORG_ID);

  const templateCount = count ?? 0;

  return {
    healthy: orgExists && issues.length === 0,
    orgExists,
    templateCount,
    issues,
  };
}
