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
  /** Free-text rules/constraints (e.g. "Never auto-deploy", "Always check for aria-labels") */
  rules?: string;
  /** Which service vertical this agent belongs to */
  service_vertical?: "seaas" | "aas" | "general";
  /** Model configuration overrides */
  model_config?: {
    model: string;
    temperature?: number;
    max_tokens?: number;
  };
  /** How much autonomy the agent has */
  autonomy_level?: "supervised" | "semi-autonomous" | "autonomous";
  /** Confidence threshold for auto-execution (0.0-1.0) */
  auto_execute_threshold?: number;
  /** Connected external services (e.g. ["github", "jira"]) */
  connected_services?: string[];
  /** How this agent was created */
  source_type?: "template" | "composed" | "copilot-saved" | "manual";
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

// ── Workflow Converters ─────────────────────────────────────────────────────

/** Minimal workflow shape needed for conversion (matches DB row subset) */
export interface WorkflowSlashCommandInput {
  id: string;
  name: string;
  description: string | null;
  service_vertical: string;
  steps: Array<{ label: string }>;
  gathering_schema?: Record<string, unknown> | null;
}

/**
 * Convert a workflow DB row to a SlashCommand for the picker UI.
 * Uses "workflow-{id}" prefix to distinguish from template commands.
 */
export function workflowToSlashCommand(w: WorkflowSlashCommandInput): SlashCommand {
  const stepCount = w.steps?.length || 0;
  const stepSummary = stepCount > 0
    ? ` (${stepCount} steps: ${w.steps.map(s => s.label).slice(0, 3).join(" → ")}${stepCount > 3 ? "..." : ""})`
    : "";

  return {
    id: `workflow-${w.id}`,
    label: w.name.toLowerCase().replace(/[\s/]+/g, "-"),
    description: (w.description || `Run ${w.name} workflow`).slice(0, 80) + stepSummary,
    icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
    prompt: `Run workflow: ${w.name}`,
    service: "workflows" as SlashCommand["service"],
    category: "Workflows",
  };
}

/**
 * Convert a workflow's gathering_schema to a CommandGathering entry.
 * Allows workflows to have their own interactive gathering params.
 */
export function workflowToGathering(w: WorkflowSlashCommandInput): CommandGathering | null {
  if (!w.gathering_schema) return null;
  const gs = w.gathering_schema as {
    params?: GatheringParam[];
    confirmationMessage?: string;
    gatheringPrompts?: Record<string, string>;
  };
  if (!gs.params || gs.params.length === 0) return null;

  return {
    commandId: `workflow-${w.id}`,
    params: gs.params,
    confirmationMessage: gs.confirmationMessage || `Run ${w.name}?`,
    gatheringPrompts: gs.gatheringPrompts || {},
  };
}
