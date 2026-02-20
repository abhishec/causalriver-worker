/**
 * Agent Composer — LLM-powered agent composition from natural language
 * =====================================================================
 *
 * Takes a user's natural language description and composes an agent by:
 *   1. Selecting relevant tools from the registry
 *   2. Generating a persona/system prompt
 *   3. Inferring interactive gathering params
 *   4. Creating a step-by-step execution plan
 *
 * Uses Claude's structured output (JSON mode) for reliable composition.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  type ToolDescriptor,
  getAvailableTools,
  getToolCatalogueForLLM,
} from "./tool-registry";
import type { GatheringParam } from "@/components/copilot/command-gathering";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentComposition {
  /** Auto-generated agent name */
  name: string;
  /** Persona / system prompt for the composed agent */
  persona: string;
  /** Selected tools from the registry */
  selectedTools: ToolDescriptor[];
  /** Inferred gathering params (for interactive input, null if none needed) */
  inferredGathering: GatheringParam[] | null;
  /** The final execution prompt template */
  executionPrompt: string;
  /** Step-by-step execution plan */
  executionPlan: string[];
  /** Estimated complexity */
  complexity: "light" | "medium" | "heavy";
}

export interface CompositionProgress {
  phase:
    | "analyzing"
    | "selecting-tools"
    | "building-persona"
    | "inferring-params"
    | "planning"
    | "ready";
  title: string;
  detail?: string;
}

// ── Composer ───────────────────────────────────────────────────────────────────

const COMPOSITION_SYSTEM_PROMPT = `You are an AI Agent Composer for NexusBrain — a causal intelligence platform.
Your job is to take a user's natural language description of what they want an agent to do,
and compose an agent specification by selecting tools and creating an execution plan.

You MUST respond with a JSON object (no markdown, no code fences) matching this exact schema:

{
  "name": "Short agent name (2-4 words)",
  "persona": "A system prompt persona for the agent (2-3 sentences describing its role and expertise)",
  "selectedToolIds": ["tool_id_1", "tool_id_2"],
  "gatheringParams": [
    {
      "id": "param_id",
      "label": "Human Label",
      "type": "text|number|select|date|chips",
      "required": true,
      "description": "What this param is for"
    }
  ] OR null,
  "executionPrompt": "The prompt template to execute. Use {{param_id}} for gathered params.",
  "executionPlan": [
    "Step 1: What happens first",
    "Step 2: What happens next"
  ],
  "complexity": "light|medium|heavy"
}

Rules:
- Select ONLY the tools that are actually needed for the task
- If the task requires user-specific input (ticket ID, repo name, etc.), define gatheringParams
- If no user input is needed, set gatheringParams to null
- The executionPrompt should be complete and actionable
- The executionPlan should be 2-6 concrete steps
- complexity: "light" = 1-2 tools, "medium" = 3-5 tools, "heavy" = 6+ tools`;

/**
 * Compose an agent from a natural language description.
 */
export async function composeAgent(
  description: string,
  anthropicApiKey: string,
  hasOpenClawGateway: boolean = false,
  onProgress?: (progress: CompositionProgress) => void
): Promise<AgentComposition> {
  const availableTools = getAvailableTools(hasOpenClawGateway);
  const toolCatalogue = getToolCatalogueForLLM(hasOpenClawGateway);

  // Phase 1: Analyzing
  onProgress?.({
    phase: "analyzing",
    title: "Analyzing your request",
    detail: description.slice(0, 60),
  });

  // Phase 2: Selecting tools
  onProgress?.({
    phase: "selecting-tools",
    title: "Selecting relevant tools",
    detail: `${availableTools.length} tools available`,
  });

  const client = new Anthropic({ apiKey: anthropicApiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: COMPOSITION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Available tools:\n${toolCatalogue}\n\n---\n\nUser request: "${description}"\n\nCompose an agent specification as JSON.`,
      },
    ],
  });

  // Extract text content
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse JSON response (strip markdown fences if present)
  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let parsed: {
    name: string;
    persona: string;
    selectedToolIds: string[];
    gatheringParams: GatheringParam[] | null;
    executionPrompt: string;
    executionPlan: string[];
    complexity: "light" | "medium" | "heavy";
  };

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("Failed to parse agent composition — invalid JSON from LLM");
  }

  // Phase 3: Building persona
  onProgress?.({
    phase: "building-persona",
    title: "Building agent persona",
    detail: parsed.name,
  });

  // Phase 4: Inferring params
  onProgress?.({
    phase: "inferring-params",
    title: "Inferring parameters",
    detail: parsed.gatheringParams
      ? `${parsed.gatheringParams.length} parameters`
      : "No parameters needed",
  });

  // Resolve tool IDs to full descriptors
  const selectedTools = parsed.selectedToolIds
    .map((id) => availableTools.find((t) => t.id === id))
    .filter(Boolean) as ToolDescriptor[];

  // Phase 5: Planning
  onProgress?.({
    phase: "planning",
    title: "Creating execution plan",
    detail: `${parsed.executionPlan.length} steps`,
  });

  // Phase 6: Ready
  onProgress?.({
    phase: "ready",
    title: "Agent composed",
    detail: `${selectedTools.length} tools, ${parsed.executionPlan.length} steps`,
  });

  return {
    name: parsed.name,
    persona: parsed.persona,
    selectedTools,
    inferredGathering: parsed.gatheringParams,
    executionPrompt: parsed.executionPrompt,
    executionPlan: parsed.executionPlan,
    complexity: parsed.complexity || "medium",
  };
}
