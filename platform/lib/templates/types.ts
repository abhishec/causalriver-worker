/**
 * Agent Template Types & Conversion Utilities
 * =============================================
 *
 * Defines the database row shape for `agent_templates` and provides
 * converters to the SlashCommand / CommandGathering interfaces used
 * by the copilot UI layer.
 */

import type { SlashCommand } from "@/components/copilot/SlashCommandPicker";
import type { CommandGathering, GatheringParam } from "@/components/copilot/command-gathering";

// ── Database Row Shape ─────────────────────────────────────────────────────────

export interface AgentTemplate {
  id: string;
  org_id: string;
  created_by: string;

  command_id: string;
  label: string;
  description: string;
  icon: string;
  prompt: string;
  category: string;
  service: string;

  gathering_schema: GatheringSchema | null;
  agent_config: AgentConfig | null;

  source_artifact_id: string | null;
  source_domain_id: string | null;

  is_public: boolean;
  is_archived: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape of the gathering_schema JSONB column */
export interface GatheringSchema {
  params: GatheringParam[];
  confirmationMessage: string;
  gatheringPrompts: Record<string, string>;
  promptBuilder?: string;
  multiArtifact?: boolean;
  subArtifactIds?: string[];
}

/** Shape of the agent_config JSONB column (for composed agents) */
export interface AgentConfig {
  persona: string;
  tools: string[];
  executionPlan: string[];
  complexity?: "light" | "medium" | "heavy";
}

// ── Create Template Request ────────────────────────────────────────────────────

export interface CreateTemplateRequest {
  label: string;
  description: string;
  icon?: string;
  prompt: string;
  category?: string;
  gatheringSchema?: GatheringSchema;
  agentConfig?: AgentConfig;
  sourceArtifactId?: string;
  sourceDomainId?: string;
  isPublic?: boolean;
}

export interface UpdateTemplateRequest {
  label?: string;
  description?: string;
  icon?: string;
  prompt?: string;
  category?: string;
  gatheringSchema?: GatheringSchema | null;
  agentConfig?: AgentConfig | null;
  isPublic?: boolean;
}

// ── Converters ─────────────────────────────────────────────────────────────────

/** Convert a DB template row to a SlashCommand for the picker UI. */
export function templateToSlashCommand(t: AgentTemplate): SlashCommand {
  return {
    id: t.command_id,
    label: t.label.toLowerCase().replace(/[\s/]+/g, "-"),
    description: t.description.slice(0, 80),
    icon: t.icon,
    prompt: t.prompt,
    service: "custom" as SlashCommand["service"],
    category: t.category || "Custom",
  };
}

/** Convert a DB template's gathering_schema to a CommandGathering entry. */
export function templateToGathering(t: AgentTemplate): CommandGathering | null {
  if (!t.gathering_schema) return null;
  return {
    commandId: t.command_id,
    params: t.gathering_schema.params,
    confirmationMessage: t.gathering_schema.confirmationMessage,
    gatheringPrompts: t.gathering_schema.gatheringPrompts,
    multiArtifact: t.gathering_schema.multiArtifact,
    subArtifactIds: t.gathering_schema.subArtifactIds,
  };
}

/**
 * Generate a unique command_id from a label.
 * Prefix with "custom-" to avoid collisions with system commands.
 */
export function labelToCommandId(label: string): string {
  return (
    "custom-" +
    label
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)
  );
}
