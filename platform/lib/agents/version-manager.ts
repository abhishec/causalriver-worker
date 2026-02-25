/**
 * Agent Template Version Manager
 * ==============================
 *
 * Manages semantic versioning for agent templates.
 * Every time a template is modified, a version snapshot is saved,
 * enabling rollback, comparison, and evolution tracking.
 *
 * Version scheme: <major>.<minor>.<patch>
 *   major = breaking prompt/schema change
 *   minor = new tool added, gathering param added
 *   patch = prompt wording tweak, description update
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TemplateVersion {
  id: string;
  template_id: string;
  version: string;
  created_by: string;
  created_at: string;
  changelog: string;
  snapshot: Record<string, unknown>; // Full template state at this version
  is_active: boolean;
  is_deprecated: boolean;
}

export interface VersionBump {
  type: "major" | "minor" | "patch";
  changelog: string;
}

// ── Version Utilities ──────────────────────────────────────────────────────

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map(Number);
  return [parts[0] || 1, parts[1] || 0, parts[2] || 0];
}

function bumpVersion(current: string, type: "major" | "minor" | "patch"): string {
  const [major, minor, patch] = parseVersion(current);
  switch (type) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Create a new version snapshot for a template.
 * Called automatically when a template is updated via the API.
 */
export async function createVersion(
  supabase: SupabaseClient,
  templateId: string,
  userId: string,
  bump: VersionBump,
): Promise<{ version: string; id: string } | null> {
  try {
    // 1. Get current template
    const { data: template, error: tplError } = await supabase
      .from("agent_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle();

    if (tplError || !template) {
      logger.error("[VersionManager] Template not found:", templateId);
      return null;
    }

    // 2. Determine current version
    const currentVersion = template.version || "1.0.0";
    const newVersion = bumpVersion(currentVersion, bump.type);

    // 3. Save version snapshot
    const snapshot = {
      command_id: template.command_id,
      label: template.label,
      description: template.description,
      prompt: template.prompt,
      service: template.service,
      gathering_schema: template.gathering_schema,
      agent_config: template.agent_config,
      is_public: template.is_public,
    };

    const { data: versionRecord, error: vErr } = await supabase
      .from("template_version_history")
      .insert({
        template_id: templateId,
        version: newVersion,
        created_by: userId,
        changelog: bump.changelog,
        snapshot,
        is_active: true,
        is_deprecated: false,
      })
      .select("id, version")
      .single();

    if (vErr) {
      // Table might not exist — store in ai_memory as fallback
      logger.warn("[VersionManager] version_history table not found, storing in ai_memory");
      await supabase.from("ai_memory").insert({
        organization_id: template.organization_id,
        memory_type: "template_version",
        content: JSON.stringify({ templateId, version: newVersion, changelog: bump.changelog, snapshot }),
        source: "version-manager",
        confidence: 1.0,
      });
      return { version: newVersion, id: templateId };
    }

    // 4. Update template's current version
    await supabase
      .from("agent_templates")
      .update({ version: newVersion })
      .eq("id", templateId);

    // 5. Mark previous versions as non-active
    await supabase
      .from("template_version_history")
      .update({ is_active: false })
      .eq("template_id", templateId)
      .neq("id", versionRecord.id);

    return { version: versionRecord.version, id: versionRecord.id };
  } catch (err) {
    logger.error("[VersionManager] createVersion error:", err);
    return null;
  }
}

/**
 * Get all versions for a template.
 */
export async function getVersionHistory(
  supabase: SupabaseClient,
  templateId: string,
): Promise<TemplateVersion[]> {
  try {
    const { data, error } = await supabase
      .from("template_version_history")
      .select("*")
      .eq("template_id", templateId)
      .order("created_at", { ascending: false });

    if (error) {
      // Fallback: check ai_memory
      const { data: fallback } = await supabase
        .from("ai_memory")
        .select("content, created_at")
        .eq("memory_type", "template_version")
        .order("created_at", { ascending: false })
        .limit(20);

      if (fallback) {
        return fallback
          .map((m: { content: string; created_at: string }) => {
            const parsed = JSON.parse(m.content);
            if (parsed.templateId !== templateId) return null;
            return {
              id: m.created_at,
              template_id: parsed.templateId,
              version: parsed.version,
              created_by: "",
              created_at: m.created_at,
              changelog: parsed.changelog || "",
              snapshot: parsed.snapshot || {},
              is_active: false,
              is_deprecated: false,
            } as TemplateVersion;
          })
          .filter(Boolean) as TemplateVersion[];
      }
      return [];
    }

    return data || [];
  } catch {
    return [];
  }
}

/**
 * Rollback a template to a specific version.
 */
export async function rollbackToVersion(
  supabase: SupabaseClient,
  templateId: string,
  versionId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { data: versionRecord } = await supabase
      .from("template_version_history")
      .select("snapshot, version")
      .eq("id", versionId)
      .eq("template_id", templateId)
      .maybeSingle();

    if (!versionRecord) return false;

    // Apply snapshot to template
    const { error: updateError } = await supabase
      .from("agent_templates")
      .update({
        ...versionRecord.snapshot,
        version: versionRecord.version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId);

    if (updateError) return false;

    // Create a new version entry for the rollback
    await createVersion(supabase, templateId, userId, {
      type: "patch",
      changelog: `Rolled back to version ${versionRecord.version}`,
    });

    return true;
  } catch (err) {
    logger.error("[VersionManager] rollback error:", err);
    return false;
  }
}

/**
 * Deprecate a specific version (mark it as no longer recommended).
 */
export async function deprecateVersion(
  supabase: SupabaseClient,
  templateId: string,
  versionId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("template_version_history")
      .update({ is_deprecated: true })
      .eq("id", versionId)
      .eq("template_id", templateId);

    return !error;
  } catch {
    return false;
  }
}
