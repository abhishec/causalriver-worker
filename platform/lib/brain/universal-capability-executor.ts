/**
 * Universal Capability Executor (UCE) — ADR-030
 * ==============================================
 *
 * Single entry point for executing ANY capability from capability_library.
 * Replaces the hardcoded reflex-dispatcher switch statement and all TypeScript
 * agent template files.
 *
 * Design principles:
 *   1. capability_library is the SINGLE source of truth — no hardcoded logic here
 *   2. UCE reads tool_type + workflow_definition from DB at runtime
 *   3. All execution is delegated to the Primitive Registry
 *   4. $params.X and $steps.Y.Z references are resolved dynamically
 *   5. Results are returned in a standard shape for SSE emission
 *
 * Supported tool_types:
 *   compute      — run capability_library.implementation as JS (tool-maker artifacts)
 *   workflow     — execute workflow_definition.steps sequentially
 *   fsm_workflow — execute workflow_definition.states as a finite state machine
 *
 * Capability lookup order (most specific wins):
 *   1. Org-specific promoted row matching name
 *   2. System template row (org_id = 00000000-0000-0000-0000-000000000001)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { executePrimitive, type PrimitiveContext } from "./primitive-registry";

// ── System org sentinel (seeds use this as their organization_id) ─────────────

const SYSTEM_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ── Types ────────────────────────────────────────────────────────────────────

export interface UCEParams {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  aiWorkerId?: string;
  /** Name of the capability to execute (matches capability_library.name) */
  capabilityName: string;
  /** Parameters extracted from the user's message */
  params: Record<string, unknown>;
  /** Raw user message (for parameter extraction fallback) */
  userMessage?: string;
  /** Detected URLs from the user message */
  detectedUrls?: string[];
}

export interface UCEResult {
  success: boolean;
  capabilityName: string;
  /** Primary narrative / summary to stream back to user */
  narrative?: string;
  /** Structured result data for SSE emission */
  result?: Record<string, unknown>;
  /** Messages to inject into the LLM context (for inject-type workflows) */
  injectedMessages?: Array<{ role: string; content: string }>;
  /** Metadata from injection step */
  injectMetadata?: Record<string, unknown>;
  /** Error message */
  error?: string;
}

// ── Workflow definition types ─────────────────────────────────────────────────

interface WorkflowStep {
  id: string;
  primitive: string;
  action?: string;         // for session primitive sub-actions
  condition?: string;      // "$params.X.length > 0" — skip step if false
  params: Record<string, unknown>;
  outputKey: string;
  forEach?: string;        // iterate over an array, run step per item
  forEachKey?: string;     // variable name for current item
}

interface WorkflowDefinition {
  steps: WorkflowStep[];
  outputMapping?: Record<string, string>;
  requiresActiveSession?: boolean;
}

interface FSMState {
  description: string;
  steps: WorkflowStep[];
  next?: string;
  terminal?: boolean;
}

interface FSMWorkflowDefinition {
  states: Record<string, FSMState>;
  initialState: string;
  outputMapping?: Record<string, string>;
}

// ── Capability row from DB ────────────────────────────────────────────────────

interface CapabilityRow {
  id: string;
  name: string;
  description: string;
  tool_type: string;
  implementation: string;
  workflow_definition: unknown;
  parameter_extraction: unknown;
  quality_score: number;
  status: string;
}

// ── Reference resolution ─────────────────────────────────────────────────────

type PrimitiveResult = Record<string, unknown>;

/**
 * Serialize a resolved value to a human-readable string for LLM prompt injection.
 * Arrays of page objects are formatted as labelled sections.
 * Objects are JSON-stringified. Primitives are String()-cast.
 */
function serializeForTemplate(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    return val.map((item, i) => {
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        // Page objects from crawl primitive: { url, title, textContent }
        if (obj["textContent"]) {
          const label = (obj["title"] as string | undefined) ?? (obj["url"] as string | undefined) ?? `Page ${i + 1}`;
          return `--- ${label} ---\n${obj["textContent"]}`;
        }
        return JSON.stringify(item, null, 2);
      }
      return String(item);
    }).join("\n\n");
  }
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}

/**
 * Resolve a single path like "params", "steps.crawl.totalPages", "states.ingest.x.jobId"
 * Returns the resolved value (any type) or undefined if not found.
 */
function resolvePath(
  path: string[],
  params: Record<string, unknown>,
  stepOutputs: Record<string, PrimitiveResult>,
  stateOutputs?: Record<string, PrimitiveResult>,
): unknown {
  // $params.X
  if (path[0] === "params" && path.length >= 2) {
    let val: unknown = params;
    for (const key of path.slice(1)) {
      if (val == null || typeof val !== "object") return undefined;
      val = (val as Record<string, unknown>)[key];
    }
    return val;
  }

  // $steps.stepId.outputKey
  if (path[0] === "steps" && path.length >= 3) {
    const stepId = path[1];
    const outputKey = path.slice(2).join(".");
    const stepOut = stepOutputs[stepId];
    if (!stepOut) return undefined;
    const keys = outputKey.split(".");
    let val: unknown = stepOut;
    for (const key of keys) {
      if (val == null || typeof val !== "object") return undefined;
      val = (val as Record<string, unknown>)[key];
    }
    return val;
  }

  // $states.stateName.outputKey (FSM)
  if (path[0] === "states" && path.length >= 3 && stateOutputs) {
    const stateName = path[1];
    const outputKey = path.slice(2).join(".");
    const stateOut = stateOutputs[stateName];
    if (!stateOut) return undefined;
    const keys = outputKey.split(".");
    let val: unknown = stateOut;
    for (const key of keys) {
      if (val == null || typeof val !== "object") return undefined;
      val = (val as Record<string, unknown>)[key];
    }
    return val;
  }

  return undefined;
}

/**
 * Resolve a reference string like "$params.urls" or "$steps.crawl.totalPages"
 * against the current execution state.
 *
 * Two modes:
 *   1. Pure reference: "$steps.crawl.crawledPages"
 *      → returns the raw value (array, object, etc.)
 *   2. Template string: "Analyze pages:\n$steps.crawl.crawledPages\nTotal: $steps.crawl.totalPages"
 *      → substitutes each $ref inline, serializing values to strings
 */
function resolveRef(
  ref: unknown,
  params: Record<string, unknown>,
  stepOutputs: Record<string, PrimitiveResult>,
  stateOutputs?: Record<string, PrimitiveResult>,
): unknown {
  if (typeof ref !== "string") return ref;

  // Pure reference: entire string is a single $ref
  if (/^\$[\w.]+$/.test(ref)) {
    const path = ref.slice(1).split(".");
    const resolved = resolvePath(path, params, stepOutputs, stateOutputs);
    return resolved ?? ref; // return raw value (preserves arrays/objects)
  }

  // Template string: contains embedded $ref patterns — substitute inline
  if (ref.includes("$")) {
    return ref.replace(/\$[\w.]+/g, (match) => {
      const path = match.slice(1).split(".");
      const resolved = resolvePath(path, params, stepOutputs, stateOutputs);
      return serializeForTemplate(resolved);
    });
  }

  return ref; // no references — return as-is
}

/**
 * Recursively resolve all $ref strings within an object/array.
 */
function resolveAllRefs(
  obj: unknown,
  params: Record<string, unknown>,
  stepOutputs: Record<string, PrimitiveResult>,
  stateOutputs?: Record<string, PrimitiveResult>,
): unknown {
  if (typeof obj === "string") {
    return resolveRef(obj, params, stepOutputs, stateOutputs);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveAllRefs(item, params, stepOutputs, stateOutputs));
  }
  if (obj !== null && typeof obj === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      resolved[key] = resolveAllRefs(val, params, stepOutputs, stateOutputs);
    }
    return resolved;
  }
  return obj;
}

/**
 * Evaluate a simple condition string like "$params.urls.length > 0".
 * Very limited: only supports array.length comparisons and truthy checks.
 * Returns true for unrecognised conditions (don't block execution).
 */
function evaluateCondition(
  condition: string,
  params: Record<string, unknown>,
  stepOutputs: Record<string, PrimitiveResult>,
): boolean {
  try {
    // Pattern: "$params.X.length > N" or "$steps.Y.Z.length > N"
    const lengthMatch = condition.match(/^(\$[\w.]+)\.length\s*([><=!]+)\s*(\d+)$/);
    if (lengthMatch) {
      const refStr = lengthMatch[1];
      const op = lengthMatch[2];
      const n = parseInt(lengthMatch[3], 10);
      const val = resolveRef(refStr, params, stepOutputs);
      const len = Array.isArray(val) ? val.length : (typeof val === "string" ? val.length : 0);
      if (op === ">") return len > n;
      if (op === ">=") return len >= n;
      if (op === "<") return len < n;
      if (op === "<=") return len <= n;
      if (op === "===") return len === n;
      if (op === "!==") return len !== n;
    }
    // Truthy reference check
    if (condition.startsWith("$")) {
      const val = resolveRef(condition, params, stepOutputs);
      return !!val;
    }
    return true;
  } catch {
    return true; // don't block on evaluation error
  }
}

// ── Output mapping ────────────────────────────────────────────────────────────

/**
 * Apply outputMapping to build the final result object.
 * e.g. { "summary": "$steps.compare.text" }
 */
function applyOutputMapping(
  mapping: Record<string, string> | undefined,
  stepOutputs: Record<string, PrimitiveResult>,
  params: Record<string, unknown>,
  stateOutputs?: Record<string, PrimitiveResult>,
): Record<string, unknown> {
  if (!mapping) return {};
  const result: Record<string, unknown> = {};
  for (const [key, refStr] of Object.entries(mapping)) {
    result[key] = resolveRef(refStr, params, stepOutputs, stateOutputs);
  }
  return result;
}

// ── Workflow execution ────────────────────────────────────────────────────────

/**
 * Execute a linear workflow (tool_type = 'workflow').
 */
async function executeWorkflow(
  ctx: PrimitiveContext,
  def: WorkflowDefinition,
  params: Record<string, unknown>,
): Promise<UCEResult> {
  const stepOutputs: Record<string, PrimitiveResult> = {};
  const allInjectedMessages: Array<{ role: string; content: string }> = [];
  let injectMetadata: Record<string, unknown> = {};

  for (const step of def.steps) {
    // Evaluate condition guard
    if (step.condition && !evaluateCondition(step.condition, params, stepOutputs)) {
      logger.warn("[uce] Skipping step (condition false)", {
        stepId: step.id,
        condition: step.condition,
      });
      stepOutputs[step.id] = { skipped: true };
      continue;
    }

    // Resolve all param refs
    const resolvedParams = resolveAllRefs(
      step.params,
      params,
      stepOutputs,
    ) as Record<string, unknown>;

    // Inject action sub-type into session params
    if (step.primitive === "session" && step.action) {
      resolvedParams["action"] = step.action;
    }

    logger.warn("[uce] Executing step", {
      stepId: step.id,
      primitive: step.primitive,
      hasForEach: !!step.forEach,
    });

    let output: PrimitiveResult;

    if (step.forEach) {
      // Batch mode: execute step for each item in the array
      const items = resolveRef(step.forEach, params, stepOutputs);
      if (!Array.isArray(items)) {
        logger.warn("[uce] forEach target is not an array", {
          stepId: step.id,
          forEach: step.forEach,
        });
        output = { results: [], error: "forEach target is not an array" };
      } else {
        const results: PrimitiveResult[] = [];
        for (const item of items) {
          const itemParams = {
            ...resolvedParams,
            ...(step.forEachKey ? { [step.forEachKey]: item } : {}),
          };
          const itemResult = await executePrimitive(ctx, step.primitive, itemParams);
          results.push(itemResult);
        }
        output = { results };
      }
    } else {
      output = await executePrimitive(ctx, step.primitive, resolvedParams);
    }

    stepOutputs[step.id] = output;

    // Collect injected messages from inject steps
    if (step.primitive === "inject") {
      const msgs = output["injectedMessages"];
      if (Array.isArray(msgs)) {
        allInjectedMessages.push(...(msgs as Array<{ role: string; content: string }>));
      }
      if (output["metadata"]) {
        injectMetadata = { ...injectMetadata, ...(output["metadata"] as Record<string, unknown>) };
      }
    }
  }

  const mappedResult = applyOutputMapping(def.outputMapping, stepOutputs, params);

  // If this is an inject-only workflow, return inject result
  if (allInjectedMessages.length > 0 && def.steps.every((s) => s.primitive === "inject")) {
    return {
      success: true,
      capabilityName: "",
      injectedMessages: allInjectedMessages,
      injectMetadata,
      result: mappedResult,
    };
  }

  return {
    success: true,
    capabilityName: "",
    result: mappedResult,
    injectedMessages: allInjectedMessages.length > 0 ? allInjectedMessages : undefined,
    injectMetadata: Object.keys(injectMetadata).length > 0 ? injectMetadata : undefined,
    narrative: (mappedResult["summary"] ?? mappedResult["narrative"] ?? mappedResult["message"] ?? mappedResult["output"]) as string | undefined,
  };
}

/**
 * Execute an FSM workflow (tool_type = 'fsm_workflow').
 * Runs state by state, following next pointers until a terminal state.
 */
async function executeFSMWorkflow(
  ctx: PrimitiveContext,
  def: FSMWorkflowDefinition,
  params: Record<string, unknown>,
): Promise<UCEResult> {
  let currentStateName = def.initialState;
  // allStepOutputs accumulates across ALL states so $steps.X references work
  // across state boundaries (e.g. extract_style can reference ingest's step outputs)
  const allStepOutputs: Record<string, PrimitiveResult> = {};
  const stateOutputs: Record<string, PrimitiveResult> = {};
  const allInjectedMessages: Array<{ role: string; content: string }> = [];
  const MAX_STATES = 20; // safety guard against infinite loops
  let iterations = 0;

  while (currentStateName && iterations < MAX_STATES) {
    iterations++;
    const state = def.states[currentStateName];
    if (!state) {
      logger.warn("[uce:fsm] Unknown state", { currentStateName });
      break;
    }

    logger.warn("[uce:fsm] Entering state", {
      state: currentStateName,
      stepCount: state.steps.length,
    });

    const stateStepOutputs: Record<string, PrimitiveResult> = {};

    for (const step of state.steps) {
      // evaluateCondition uses allStepOutputs so cross-state conditions work
      if (step.condition && !evaluateCondition(step.condition, params, allStepOutputs)) {
        stateStepOutputs[step.id] = { skipped: true };
        allStepOutputs[step.id] = { skipped: true };
        continue;
      }

      // resolveAllRefs uses allStepOutputs (cross-state) + stateOutputs (per-state)
      const resolvedParams = resolveAllRefs(
        step.params,
        params,
        allStepOutputs,
        stateOutputs,
      ) as Record<string, unknown>;

      if (step.primitive === "session" && step.action) {
        resolvedParams["action"] = step.action;
      }

      const output = await executePrimitive(ctx, step.primitive, resolvedParams);
      stateStepOutputs[step.id] = output;
      allStepOutputs[step.id] = output; // accumulate globally

      if (step.primitive === "inject") {
        const msgs = output["injectedMessages"];
        if (Array.isArray(msgs)) {
          allInjectedMessages.push(...(msgs as Array<{ role: string; content: string }>));
        }
      }
    }

    // Merge this state's step outputs into state outputs (for $states.X.Y references)
    stateOutputs[currentStateName] = { ...stateStepOutputs };

    if (state.terminal) break;
    currentStateName = state.next ?? "";
    if (!currentStateName) break;
  }

  // Apply outputMapping — allStepOutputs for $steps.X, stateOutputs for $states.X.Y
  const mappedResult = applyOutputMapping(def.outputMapping, allStepOutputs, params, stateOutputs);

  return {
    success: true,
    capabilityName: "",
    result: mappedResult,
    injectedMessages: allInjectedMessages.length > 0 ? allInjectedMessages : undefined,
    narrative: (mappedResult["message"] ?? mappedResult["summary"] ?? mappedResult["narrative"]) as string | undefined,
  };
}

// ── Capability lookup ────────────────────────────────────────────────────────

/**
 * Look up a capability by name.
 * Tries org-specific promoted row first, then system template.
 */
async function lookupCapability(
  supabase: SupabaseClient,
  organizationId: string,
  capabilityName: string,
): Promise<CapabilityRow | null> {
  // 1. Try org-specific promoted row
  const { data: orgRow } = await supabase
    .from("capability_library")
    .select("id, name, description, tool_type, implementation, workflow_definition, parameter_extraction, quality_score, status")
    .eq("organization_id", organizationId)
    .eq("name", capabilityName)
    .in("status", ["validated", "promoted"])
    .order("quality_score", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orgRow) return orgRow as CapabilityRow;

  // 2. Fall back to system template
  const { data: sysRow } = await supabase
    .from("capability_library")
    .select("id, name, description, tool_type, implementation, workflow_definition, parameter_extraction, quality_score, status")
    .eq("organization_id", SYSTEM_ORG_ID)
    .eq("name", capabilityName)
    .in("status", ["validated", "promoted"])
    .limit(1)
    .maybeSingle();

  return (sysRow as CapabilityRow | null) ?? null;
}

/**
 * Find a capability by matching trigger_patterns against a message.
 * Checks org-specific rows first, then system templates.
 * Returns the highest-quality_score match.
 */
async function findCapabilityByTrigger(
  supabase: SupabaseClient,
  organizationId: string,
  message: string,
): Promise<CapabilityRow | null> {
  const lowerMessage = message.toLowerCase();

  // Fetch all promoted capabilities for this org + system templates
  const { data: rows } = await supabase
    .from("capability_library")
    .select("id, name, description, tool_type, implementation, workflow_definition, parameter_extraction, quality_score, status, trigger_patterns, organization_id")
    .in("organization_id", [organizationId, SYSTEM_ORG_ID])
    .in("status", ["validated", "promoted"])
    .not("trigger_patterns", "eq", "{}")
    .order("quality_score", { ascending: false })
    .limit(50);

  if (!rows?.length) return null;

  // Score each capability by number of trigger pattern matches
  type ScoredRow = { row: CapabilityRow & { trigger_patterns: string[]; organization_id: string }; score: number };
  const scored: ScoredRow[] = [];

  for (const row of rows as Array<CapabilityRow & { trigger_patterns: string[]; organization_id: string }>) {
    const patterns = row.trigger_patterns ?? [];
    const matchCount = patterns.filter((p) =>
      lowerMessage.includes(p.toLowerCase())
    ).length;

    if (matchCount > 0) {
      // Org-specific rows get a small boost over system templates
      const orgBonus = row.organization_id === organizationId ? 0.1 : 0;
      scored.push({ row, score: matchCount + orgBonus });
    }
  }

  if (scored.length === 0) return null;

  // Return highest score
  scored.sort((a, b) => b.score - a.score);
  return scored[0].row;
}

// ── Parameter extraction ──────────────────────────────────────────────────────

/**
 * Extract parameters from the user message based on the capability's
 * parameter_extraction config.
 *
 * Supports:
 *   source: "detectedUrls"  — grab from provided URLs
 *   source: "message"       — regex match against message
 *   filter: "substring"     — filter URLs containing this substring
 *   exclude: "substring"    — exclude URLs containing this
 *   default: value          — fallback when nothing matched
 */
function extractParams(
  paramExtraction: Record<string, unknown>,
  userMessage: string,
  detectedUrls: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [paramName, config] of Object.entries(paramExtraction)) {
    if (!config || typeof config !== "object") continue;
    const cfg = config as Record<string, unknown>;

    if (cfg["source"] === "detectedUrls") {
      let urls = [...detectedUrls];
      if (cfg["filter"]) {
        const filterStr = String(cfg["filter"]);
        const filterParts = filterStr.split("|");
        urls = urls.filter((u) => filterParts.some((f) => u.includes(f)));
      }
      if (cfg["exclude"]) {
        const excludeStr = String(cfg["exclude"]);
        const excludeParts = excludeStr.split("|");
        urls = urls.filter((u) => !excludeParts.some((e) => u.includes(e)));
      }
      result[paramName] = urls;
    } else if (cfg["source"] === "message") {
      if (cfg["pattern"]) {
        try {
          const re = new RegExp(String(cfg["pattern"]), "i");
          const match = userMessage.match(re);
          result[paramName] = match?.[1]?.trim() ?? cfg["default"] ?? null;
        } catch {
          result[paramName] = cfg["default"] ?? null;
        }
      } else {
        result[paramName] = cfg["default"] ?? null;
      }
    }

    // Apply default if param is empty/null
    if ((result[paramName] == null ||
        (Array.isArray(result[paramName]) && (result[paramName] as unknown[]).length === 0)) &&
        cfg["default"] != null) {
      result[paramName] = cfg["default"];
    }
  }

  // Post-process: extract space keys from Confluence URLs
  if (result["confluenceUrls"]) {
    const confluenceUrls = result["confluenceUrls"] as string[];
    result["confluenceSpaceKeys"] = confluenceUrls
      .map((url) => {
        const m = url.match(/\/wiki\/spaces\/([^/]+)/);
        return m?.[1];
      })
      .filter(Boolean);
  }

  // Post-process: extract folder ID from Google Drive URLs
  if (result["driveUrls"]) {
    const driveUrls = result["driveUrls"] as string[];
    result["driveFolderId"] = driveUrls
      .map((url) => {
        const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
        return m?.[1];
      })
      .find(Boolean) ?? null;
  }

  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Execute a capability by explicit name.
 *
 * Used by reflex-dispatcher when the reflex engine already knows which
 * capability to run.
 */
export async function executeCapability(params: UCEParams): Promise<UCEResult> {
  const { supabase, organizationId, userId, aiWorkerId, capabilityName, detectedUrls = [] } = params;

  // 1. Look up the capability
  const capability = await lookupCapability(supabase, organizationId, capabilityName);

  if (!capability) {
    logger.warn("[uce] Capability not found", { capabilityName, organizationId });
    return {
      success: false,
      capabilityName,
      error: `Capability '${capabilityName}' not found. It may need to be synthesized first.`,
    };
  }

  // 2. Extract parameters from user message
  const extractionConfig = (capability.parameter_extraction as Record<string, unknown>) ?? {};
  const extractedParams = extractParams(
    extractionConfig,
    params.userMessage ?? "",
    detectedUrls,
  );

  // Merge with explicitly passed params (explicit wins)
  const mergedParams = { ...extractedParams, ...params.params };

  logger.warn("[uce] Executing capability", {
    capabilityName,
    toolType: capability.tool_type,
    orgId: organizationId,
    paramKeys: Object.keys(mergedParams),
  });

  // 3. Track invocation
  void supabase.rpc("increment_tool_invocation", { p_tool_id: capability.id });

  const ctx: PrimitiveContext = { supabase, organizationId, userId, aiWorkerId };

  // 4. Dispatch to correct execution strategy
  let result: UCEResult;

  try {
    if (capability.tool_type === "workflow") {
      const workflowDef = capability.workflow_definition as WorkflowDefinition;
      result = await executeWorkflow(ctx, workflowDef, mergedParams);
    } else if (capability.tool_type === "fsm_workflow") {
      const fsmDef = capability.workflow_definition as FSMWorkflowDefinition;
      result = await executeFSMWorkflow(ctx, fsmDef, mergedParams);
    } else {
      // compute: run implementation as JS function
      // For safety, only allow pre-validated implementations
      logger.warn("[uce] compute type not supported in runtime (security boundary)", {
        capabilityName,
      });
      return {
        success: false,
        capabilityName,
        error: "Compute capabilities require server-side sandboxed execution (not yet implemented).",
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[uce] Capability execution threw", { capabilityName, error: msg });
    return { success: false, capabilityName, error: msg };
  }

  // 5. Attach capability name to result
  result.capabilityName = capabilityName;
  return result;
}

/**
 * Match a user message to a capability via trigger_patterns and execute it.
 *
 * Used by reflex-engine when doing DB-backed pattern matching.
 */
export async function matchAndExecuteCapability(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  aiWorkerId: string | undefined,
  userMessage: string,
  detectedUrls: string[],
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<UCEResult | null> {
  // Check if session-continue should take priority
  const recentMessages = conversationHistory.slice(-6).map((m) => m.content).join(" ");
  const hasActiveSession = recentMessages.includes("sessionId:") ||
    recentMessages.includes("Session ID:") ||
    recentMessages.includes("session is ready") ||
    recentMessages.includes("Product Analyst");

  const sessionContinueTriggers = [
    "write user story", "write story", "next story", "another story",
    "revise", "approved", "looks good", "lgtm", "try again", "redo",
    "write prd", "write requirement", "acceptance criteria",
  ];
  const lowerMsg = userMessage.toLowerCase();
  const wantsSessionContinue = sessionContinueTriggers.some((t) => lowerMsg.includes(t));

  if (hasActiveSession && wantsSessionContinue) {
    return executeCapability({
      supabase,
      organizationId,
      userId,
      aiWorkerId,
      capabilityName: "session-continue",
      params: { userInput: userMessage },
      userMessage,
      detectedUrls,
    });
  }

  // General trigger pattern matching
  const capability = await findCapabilityByTrigger(supabase, organizationId, userMessage);
  if (!capability) return null;

  return executeCapability({
    supabase,
    organizationId,
    userId,
    aiWorkerId,
    capabilityName: capability.name,
    params: {},
    userMessage,
    detectedUrls,
  });
}
