/**
 * Workflow Synthesizer — ADR-031 Dynamic Capability Factory
 * ==========================================================
 *
 * System 2 (Kahneman) — when the reflex engine (System 1) finds no matching
 * capability in capability_library, this synthesizer generates a workflow
 * definition on-the-fly using an LLM.
 *
 * Flow:
 *   1. Build a catalog of available primitives (static) + connectors (per-org)
 *   2. Fetch few-shot examples from existing capabilities
 *   3. Call Haiku to generate a workflow_definition + trigger_patterns + parameter_extraction
 *   4. Validate the generated workflow (all primitives exist, refs are valid)
 *   5. Store in capability_library with status='validated'
 *   6. Return for immediate execution by UCE
 *
 * Design principles:
 * - Never throws — returns null on any failure (System 2 is optional)
 * - 15s hard timeout on LLM call (user is waiting)
 * - Validated capabilities are immediately findable by the reflex engine
 * - Generated workflows improve over time via RL feedback + tool-maker evolution
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Static env capture (Amplify Lambda) ─────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Constants ────────────────────────────────────────────────────────────────

const SYNTHESIS_TIMEOUT_MS = 15_000; // 15s — user is waiting inline
const SYSTEM_ORG_ID = "00000000-0000-0000-0000-000000000001";
const SYNTHESIS_MODEL = "claude-haiku-4-5-20251001";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SynthesizedCapability {
  id: string;
  name: string;
  description: string;
  tool_type: "workflow" | "fsm_workflow";
  workflow_definition: Record<string, unknown>;
  trigger_patterns: string[];
  parameter_extraction: Record<string, unknown>;
  guards: Array<{ name: string; systemPromptAddition: string }>;
}

// ── Primitive Catalog (static — matches primitive-registry.ts) ──────────────

export const PRIMITIVE_CATALOG = `Available primitives (atomic operations you can compose):

1. crawl — BFS web crawl
   Input: { urls: string[], maxDepth?: number (default 2), maxPages?: number (default 30) }
   Output: { crawledPages: Array<{url, title, content}>, totalPages: number }

2. ingest — Create a bulk ingestion job for a connector
   Input: { connectorType: string ("confluence"|"google_drive"|"web_crawler"), sourceConfig: { spaceKeys?, folderId?, urls? } }
   Output: { jobId: string, created: boolean }

3. call_llm — Call Claude API for analysis/generation
   Input: { model?: string (default "claude-3-5-haiku-20241022", use "claude-3-5-sonnet-20241022" for complex reasoning), systemPrompt: string, userMessage: string, maxTokens?: number (default 1024) }
   Output: { text: string }

4. persist — Write a record to a database table
   Input: { table: string (usually "se_aas_artifacts"), data: { domain_type: string, artifact_data: object, metadata: object } }
   Output: { id: string }

5. search — Vector search over document chunks (scoped to a corpus)
   Input: { query: string, documentIds?: string[], ingestionJobIds?: string[], limit?: number }
   Output: { results: Array<{content, document_title, similarity}> }

6. session — Create or continue an interactive agent session
   Input: { action: "create"|"continue"|"create_corpus"|"extract_style", agentType?: string, sessionName?: string, knowledgeScope?: object, userInput?: string }
   Output: varies by action

7. inject — Return messages to inject into the LLM conversation (for context augmentation)
   Input: { messages: Array<{role: "system"|"user", content: string}>, metadata?: object }
   Output: { injectedMessages: Array<{role, content}> }

IMPORTANT RULES:
- Use $params.X to reference extracted parameters
- Use $steps.stepId.outputField to reference previous step outputs
- Every step needs: id (unique), primitive (from list above), params (object), outputKey (string)
- call_llm returns { text: "..." } — always use $steps.stepId.text to get its output
- crawl returns { crawledPages: [...], totalPages: N }
- persist returns { id: "uuid" }
- For multi-step analysis: crawl → call_llm (extract) → call_llm (synthesize) → persist`;

// ── Synthesis prompt builder ─────────────────────────────────────────────────

function buildSynthesisPrompt(
  userMessage: string,
  detectedUrls: string[],
  connectorInfo: string,
  exampleCapabilities: string,
): string {
  return `You are a workflow composer for BrainOS. Given a user request, compose a capability workflow using available primitives.

${PRIMITIVE_CATALOG}

${connectorInfo}

${exampleCapabilities}

USER REQUEST: "${userMessage}"
${detectedUrls.length > 0 ? `DETECTED URLS: ${JSON.stringify(detectedUrls)}` : "NO URLs detected in message."}

Generate a JSON capability definition. Return ONLY valid JSON (no markdown fences, no explanation):
{
  "name": "kebab-case-name (e.g. competitor-analysis, sales-pipeline-review)",
  "description": "One sentence describing what this capability does",
  "tool_type": "workflow",
  "trigger_patterns": ["keyword1", "keyword2", "keyword3", "phrase one", "phrase two"],
  "parameter_extraction": {
    "paramName": { "source": "detectedUrls"|"message", "filter"?: "substring", "exclude"?: "substring", "pattern"?: "regex with capture group", "default"?: "fallback value" }
  },
  "workflow_definition": {
    "steps": [
      { "id": "step_id", "primitive": "primitive_name", "params": { ... }, "outputKey": "step_id" }
    ],
    "outputMapping": {
      "summary": "$steps.last_step.text",
      "type": "capability-name"
    }
  },
  "guards": []
}

IMPORTANT:
- trigger_patterns should be 5-10 lowercase keywords/phrases that would match this type of request
- parameter_extraction defines HOW to extract params from the user message and URLs
- For URL-based params: use source "detectedUrls" with optional filter/exclude substrings
- For text params: use source "message" with a regex pattern (capture group 1 = value)
- workflow_definition.steps must use ONLY the available primitives listed above
- Each step's outputKey should match its id for clarity
- For analysis workflows: typically crawl/search → call_llm (extract) → call_llm (synthesize) → persist`;
}

// ── Connector catalog builder ────────────────────────────────────────────────

async function buildConnectorCatalog(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from("connectors")
      .select("connector_type, display_name, url_patterns")
      .eq("organization_id", orgId)
      .eq("status", "active");

    if (!data?.length) {
      return "Available connectors: None configured. Use 'crawl' primitive for web content.";
    }

    const lines = data.map((c) => {
      const patterns = (c.url_patterns as string[]) ?? [];
      return `- ${c.connector_type} (${c.display_name || c.connector_type})${patterns.length ? ` [URL patterns: ${patterns.join(", ")}]` : ""}`;
    });

    return `Available connectors for this organization:\n${lines.join("\n")}\n\nWhen URLs match a connector's patterns, use 'ingest' primitive with that connector type.`;
  } catch {
    return "Available connectors: Unable to load (use 'crawl' for web content).";
  }
}

// ── Few-shot example builder ─────────────────────────────────────────────────

async function buildExampleCapabilities(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from("capability_library")
      .select("name, description, workflow_definition, trigger_patterns, parameter_extraction")
      .in("organization_id", [orgId, SYSTEM_ORG_ID])
      .in("status", ["validated", "promoted"])
      .not("workflow_definition", "is", null)
      .order("quality_score", { ascending: false })
      .limit(2);

    if (!data?.length) {
      return "No existing capability examples available.";
    }

    const examples = data.map((cap, i) => {
      const wf = cap.workflow_definition as Record<string, unknown>;
      const steps = (wf?.steps as unknown[]) ?? [];
      return `Example ${i + 1}: "${cap.name}" — ${cap.description}\n  Triggers: ${JSON.stringify(cap.trigger_patterns)}\n  Steps: ${steps.length} step(s)\n  Params: ${JSON.stringify(cap.parameter_extraction)}`;
    });

    return `Example capabilities (use as reference for format):\n${examples.join("\n\n")}`;
  } catch {
    return "No existing capability examples available.";
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

const VALID_PRIMITIVES = new Set(["crawl", "ingest", "call_llm", "persist", "search", "session", "inject"]);

function validateWorkflow(spec: Record<string, unknown>): string | null {
  if (!spec.name || typeof spec.name !== "string") return "Missing or invalid 'name'";
  if (!spec.workflow_definition || typeof spec.workflow_definition !== "object") return "Missing 'workflow_definition'";

  const wfDef = spec.workflow_definition as Record<string, unknown>;
  const steps = wfDef.steps as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(steps) || steps.length === 0) return "workflow_definition.steps must be a non-empty array";

  const seenOutputKeys = new Set<string>();
  for (const step of steps) {
    if (!step.id || !step.primitive || !step.outputKey) {
      return `Step missing required fields (id, primitive, outputKey): ${JSON.stringify(step)}`;
    }
    if (!VALID_PRIMITIVES.has(step.primitive as string)) {
      return `Unknown primitive '${step.primitive}'. Valid: ${[...VALID_PRIMITIVES].join(", ")}`;
    }
    seenOutputKeys.add(step.outputKey as string);
  }

  // Validate $steps references point to earlier steps
  for (const step of steps) {
    const paramsStr = JSON.stringify(step.params ?? {});
    const refs = paramsStr.match(/\$steps\.(\w+)\./g) ?? [];
    for (const ref of refs) {
      const stepId = ref.replace("$steps.", "").replace(".", "");
      if (!seenOutputKeys.has(stepId)) {
        return `Step '${step.id}' references unknown step output '$steps.${stepId}'`;
      }
    }
  }

  if (!Array.isArray(spec.trigger_patterns) || spec.trigger_patterns.length === 0) {
    return "trigger_patterns must be a non-empty array";
  }

  return null; // valid
}

// ── Main: Synthesize a workflow ──────────────────────────────────────────────

/**
 * Synthesize a workflow capability from a user's natural language request.
 *
 * Called by the reflex engine when System 1 (pattern matching) finds no match.
 * Returns null if synthesis fails (never throws).
 */
export async function synthesizeWorkflow(
  supabase: SupabaseClient,
  orgId: string,
  userMessage: string,
  detectedUrls: string[],
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<SynthesizedCapability | null> {
  if (!ANTHROPIC_API_KEY) {
    logger.warn("[workflow-synthesizer] No ANTHROPIC_API_KEY — cannot synthesize");
    return null;
  }

  // Skip synthesis for very short / trivial messages
  if (userMessage.trim().length < 10) return null;

  // Skip if message looks like a greeting or simple question
  const trivialPatterns = /^(hi|hello|hey|thanks|ok|yes|no|how are you|what is|who is)\b/i;
  if (trivialPatterns.test(userMessage.trim())) return null;

  try {
    logger.warn("[workflow-synthesizer] System 2 engaged — synthesizing capability", {
      orgId: orgId.slice(0, 8),
      messageLen: userMessage.length,
      urlCount: detectedUrls.length,
    });

    // 1. Build context
    const [connectorInfo, exampleCapabilities] = await Promise.all([
      buildConnectorCatalog(supabase, orgId),
      buildExampleCapabilities(supabase, orgId),
    ]);

    // 2. Call LLM
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const prompt = buildSynthesisPrompt(userMessage, detectedUrls, connectorInfo, exampleCapabilities);

    const callPromise = anthropic.messages.create({
      model: SYNTHESIS_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Synthesis timeout")), SYNTHESIS_TIMEOUT_MS)
    );

    const response = await Promise.race([callPromise, timeoutPromise]);
    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    if (!text) {
      logger.warn("[workflow-synthesizer] Empty LLM response");
      return null;
    }

    // 3. Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("[workflow-synthesizer] No JSON found in LLM response", { text: text.slice(0, 200) });
      return null;
    }

    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(jsonMatch[0]);
    } catch {
      logger.warn("[workflow-synthesizer] Failed to parse JSON from LLM response");
      return null;
    }

    // 4. Validate
    const validationError = validateWorkflow(spec);
    if (validationError) {
      logger.warn("[workflow-synthesizer] Validation failed", { error: validationError });
      return null;
    }

    // 5. Store in capability_library
    const { data: inserted, error: insertError } = await supabase
      .from("capability_library")
      .insert({
        organization_id: orgId,
        name: spec.name as string,
        description: (spec.description as string) || "",
        domain: `synthesized:${(spec.name as string).split("-")[0]}`,
        tool_type: (spec.tool_type as string) || "workflow",
        workflow_definition: spec.workflow_definition,
        trigger_patterns: spec.trigger_patterns as string[],
        parameter_extraction: spec.parameter_extraction || {},
        guards: spec.guards || [],
        implementation: "",
        status: "validated", // immediately findable by reflex engine
        quality_score: 0.6, // moderate confidence — RL will adjust
        synthesized_by: SYNTHESIS_MODEL,
        tags: ["synthesized", "dynamic-factory"],
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      logger.warn("[workflow-synthesizer] Failed to store synthesized capability", {
        error: insertError?.message,
        name: spec.name,
      });
      return null;
    }

    logger.warn("[workflow-synthesizer] Successfully synthesized capability", {
      id: inserted.id,
      name: spec.name,
      steps: ((spec.workflow_definition as Record<string, unknown>)?.steps as unknown[])?.length ?? 0,
      triggers: (spec.trigger_patterns as string[])?.length ?? 0,
    });

    return {
      id: inserted.id as string,
      name: spec.name as string,
      description: (spec.description as string) || "",
      tool_type: (spec.tool_type as "workflow" | "fsm_workflow") || "workflow",
      workflow_definition: spec.workflow_definition as Record<string, unknown>,
      trigger_patterns: spec.trigger_patterns as string[],
      parameter_extraction: (spec.parameter_extraction as Record<string, unknown>) || {},
      guards: (spec.guards as Array<{ name: string; systemPromptAddition: string }>) || [],
    };
  } catch (err) {
    logger.warn("[workflow-synthesizer] Synthesis failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
