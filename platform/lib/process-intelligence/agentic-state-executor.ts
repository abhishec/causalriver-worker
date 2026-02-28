/**
 * Agentic State Executor
 * ======================
 * The ONE generic executor for ALL FSM process states.
 * Replaces all hardcoded task-specific logic (product-workflow-executor, etc.).
 *
 * At each FSM state:
 * 1. Reads state_instructions from the process definition (DB)
 * 2. Builds tool schemas from workspace's connected connectors
 * 3. Calls Claude with tool_use
 * 4. Executes the tool calls via writeback_queue
 * 5. Returns the FSM event to fire
 *
 * Adding a new process type? Insert a row in bpaas_process_definitions.
 * No code changes needed.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {
  getWorkspaceTools,
  toAnthropicTools,
  executeToolCall,
} from "@/lib/connectors/tools-registry";
import type { ProcessDefinition } from "./process-registry";

const _anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";

/** Default instruction per state when no state_instructions entry exists in DB */
const DEFAULT_STATE_INSTRUCTIONS: Record<string, string> = {
  DECOMPOSE:
    "Analyze the input payload. Identify all key entities, data, and what this process needs to accomplish. Produce a structured execution plan.",
  ASSESS:
    "Review the plan and gather supporting data using available tools. Identify risks, missing info, and blockers.",
  COMPUTE:
    "Perform all calculations and business logic. Apply policy rules to the data. Identify what policy checks are needed.",
  POLICY_CHECK:
    "Evaluate policy rules against computed values. Decide: auto_approve, require_approval, or escalate.",
  APPROVAL_GATE:
    "Human approval required. Prepare a concise approval request with key facts and your recommendation.",
  MUTATE:
    "Execute all output actions using available tools. Create records, send notifications, update systems. Note anything skipped due to missing connectors.",
  SCHEDULE_NOTIFY:
    "Notify relevant stakeholders using available messaging tools. Tailor messages to each audience.",
  COMPLETE:
    "Summarize the process outcome: what succeeded, what was skipped, any follow-up needed.",
  ESCALATE:
    "Escalate this process. Explain why, identify the escalation path, notify decision-makers using available tools.",
  FRAUD_REVIEW:
    "Conduct a fraud risk assessment. Review for anomalies and suspicious patterns. Provide a risk score and recommendation.",
  DUPLICATE_CHECK:
    "Check for duplicate records. Search existing data for matches. Flag duplicates for review.",
  RECONCILE:
    "Reconcile discrepancies between data sources. Calculate variances. Flag items requiring manual review.",
  RCA: "Conduct root cause analysis. Trace symptoms to underlying causes. Recommend preventive actions.",
  GATHER:
    "Collect all required data from available sources using tools. Note any data that could not be retrieved.",
  EVIDENCE_REVIEW:
    "Review all evidence and supporting documents. Assess completeness and credibility. Summarize key findings.",
};

export interface AgenticStateParams {
  processType: string;
  currentState: string;
  processDefinition: ProcessDefinition;
  inputPayload: Record<string, unknown>;
  stateHistory: Array<{ state: string; outcome?: string; summary?: string }>;
  brainContext?: string;
  organizationId: string;
  jobId: string;
  processInstanceId: string;
}

export interface AgenticStateResult {
  /** The FSM event to fire to advance to the next state */
  nextEvent: string;
  /** Human-readable summary of what happened in this state */
  summary: string;
  /** Tool calls that were executed */
  toolCallsExecuted: Array<{ tool: string; success: boolean; error?: string }>;
  /** Key findings / computed values to carry forward in FSM context */
  findings: Record<string, unknown>;
  /** Whether this state needed human review (HITL) */
  requiresApproval?: boolean;
  /** Approval request details if requiresApproval=true */
  approvalDetails?: string;
}

export async function executeAgenticState(
  supabase: SupabaseClient,
  params: AgenticStateParams
): Promise<AgenticStateResult> {
  const {
    processType,
    currentState,
    processDefinition,
    inputPayload,
    stateHistory,
    brainContext,
    organizationId,
    jobId,
  } = params;

  // 1. Get state instruction (from DB definition, fallback to defaults)
  const stateInstruction =
    processDefinition.stateInstructions?.[currentState] ??
    DEFAULT_STATE_INSTRUCTIONS[currentState] ??
    `Execute the ${currentState} phase for this ${processType} process.`;

  // 2. Get workspace tools from connected connectors
  const tools = await getWorkspaceTools(supabase, organizationId);
  const anthropicTools = toAnthropicTools(tools);

  // 3. Get valid next events from FSM transitions
  const validEvents = processDefinition.transitions
    .filter((t) => t.from === currentState)
    .map((t) => t.on);

  // 4. Build the prompt
  const systemPrompt = buildSystemPrompt(
    processType,
    currentState,
    stateInstruction,
    validEvents,
    brainContext
  );
  const userMessage = buildUserMessage(inputPayload, stateHistory, tools);

  // 5. Call Claude with tool_use
  logger.warn("[AgenticExecutor] Calling Claude", {
    processType,
    currentState,
    toolCount: anthropicTools.length,
    validEvents,
    jobId,
  });

  const anthropic = new Anthropic({ apiKey: _anthropicApiKey });

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      ...(anthropicTools.length > 0
        ? {
            tools: anthropicTools as Anthropic.Tool[],
            tool_choice: { type: "auto" as const },
          }
        : {}),
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });
  } catch (err) {
    logger.warn("[AgenticExecutor] Claude call failed", {
      err,
      processType,
      currentState,
    });
    const fallbackEvent =
      validEvents.find(
        (e) => e.includes("fail") || e === "error" || e === "escalate"
      ) ??
      validEvents[0] ??
      "failed";
    return {
      nextEvent: fallbackEvent,
      summary: `State execution failed: ${err instanceof Error ? err.message : String(err)}`,
      toolCallsExecuted: [],
      findings: {},
    };
  }

  // 6. Execute tool calls
  const toolCallsExecuted: Array<{
    tool: string;
    success: boolean;
    pendingExecution?: boolean;
    writebackQueueId?: string | null;
    error?: string;
  }> = [];

  for (const block of response.content) {
    if (block.type === "tool_use") {
      const result = await executeToolCall(
        supabase,
        organizationId,
        jobId,
        block.name,
        block.input as Record<string, unknown>
      );
      const resultData = result.result as Record<string, unknown> | undefined;
      toolCallsExecuted.push({
        tool: block.name,
        success: result.success,
        pendingExecution: resultData?.pendingExecution === true,
        writebackQueueId: (resultData?.writebackQueueId as string | null | undefined) ?? null,
        error: result.error,
      });
    }
  }

  // 7. Extract text response for summary and next event
  const textContent = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("\n");

  const parsed = parseAgenticResponse(textContent, validEvents, toolCallsExecuted);

  // Reduce RL quality score for pending (unconfirmed) tool executions
  const pendingCount = toolCallsExecuted.filter((t) => t.pendingExecution).length;
  if (pendingCount > 0) {
    const penalty = pendingCount * 0.1;
    const existingQuality = typeof parsed.findings.agenticQualityScore === "number"
      ? parsed.findings.agenticQualityScore
      : 1.0;
    parsed.findings.agenticQualityScore = Math.max(0.3, existingQuality - penalty);
    parsed.findings.pendingToolCount = pendingCount;
    // Inject warning so the FSM context carries forward the uncertainty
    if (!Array.isArray(parsed.findings.warnings)) parsed.findings.warnings = [];
    (parsed.findings.warnings as string[]).push(
      "Note: Some tool calls are pending confirmation (connector execution queued)"
    );
  }

  logger.warn("[AgenticExecutor] State complete", {
    processType,
    currentState,
    nextEvent: parsed.nextEvent,
    toolCallsCount: toolCallsExecuted.length,
    requiresApproval: parsed.requiresApproval,
    jobId,
  });

  return parsed;
}

function buildSystemPrompt(
  processType: string,
  currentState: string,
  stateInstruction: string,
  validEvents: string[],
  brainContext?: string
): string {
  const eventList =
    validEvents.length > 0
      ? validEvents.map((e) => `  - "${e}"`).join("\n")
      : '  - "completed"';

  return [
    `You are an AI Worker executing a business process automation.`,
    ``,
    `Process Type: ${processType}`,
    `Current State: ${currentState}`,
    ``,
    `Your instruction for this state:`,
    stateInstruction,
    ``,
    `After completing this state, you MUST fire exactly one of these FSM events to advance the process:`,
    eventList,
    ``,
    `Choose the event that best reflects what happened:`,
    `- If everything completed normally → fire the primary success event (usually the first one)`,
    `- If human approval is needed → fire the "requires_approval" or "policy_fail" event`,
    `- If there was a critical issue → fire the "failed" or "escalate" event`,
    brainContext ? `\nWorkspace Intelligence Context:\n${brainContext}` : "",
    ``,
    `Rules:`,
    `1. Use available tools to take real actions (create tickets, send messages, etc.)`,
    `2. If a needed connector is not available, note it clearly but continue with what you have`,
    `3. Be specific and actionable — generic outputs are not useful`,
    `4. At the end of your response, state the FSM event you're firing in format: FIRE_EVENT: <event_name>`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function buildUserMessage(
  inputPayload: Record<string, unknown>,
  stateHistory: Array<{ state: string; outcome?: string; summary?: string }>,
  tools: Array<{ name: string; connectorType: string }>
): string {
  const toolList =
    tools.length > 0
      ? `Available tools (${tools.length}): ${[...new Set(tools.map((t) => t.connectorType))].join(", ")}`
      : "No connectors active for this workspace — describe what actions would be taken if connectors were available.";

  const history =
    stateHistory.length > 0
      ? `\nProcess History:\n${stateHistory.map((h) => `  ${h.state}: ${h.summary ?? h.outcome ?? "completed"}`).join("\n")}`
      : "";

  return [
    `Input Data:`,
    JSON.stringify(inputPayload, null, 2).slice(0, 3000),
    history,
    ``,
    toolList,
    ``,
    `Execute this state now. Use tools where appropriate. End your response with FIRE_EVENT: <event_name>`,
  ]
    .filter((s) => s !== undefined)
    .join("\n");
}

function parseAgenticResponse(
  text: string,
  validEvents: string[],
  toolCallsExecuted: Array<{ tool: string; success: boolean }>
): AgenticStateResult {
  // Extract FIRE_EVENT
  const eventMatch = text.match(/FIRE_EVENT:\s*([a-z_]+)/i);
  let nextEvent = eventMatch?.[1]?.toLowerCase() ?? "";

  // Validate the event is in the valid list
  if (!validEvents.includes(nextEvent)) {
    // Try to find the closest match by scanning text
    const found = validEvents.find((e) => text.toLowerCase().includes(e));
    nextEvent = found ?? validEvents[0] ?? "completed";
  }

  // Check if approval is needed
  const requiresApproval =
    nextEvent.includes("approval") ||
    nextEvent.includes("policy_fail") ||
    text.toLowerCase().includes("requires approval") ||
    text.toLowerCase().includes("human approval");

  // Extract findings from the text (key facts)
  const findings: Record<string, unknown> = {
    stateSummary: text.slice(0, 500),
    toolsUsed: toolCallsExecuted.filter((t) => t.success).map((t) => t.tool),
  };

  return {
    nextEvent,
    summary: text.slice(0, 600),
    toolCallsExecuted,
    findings,
    requiresApproval,
    approvalDetails: requiresApproval ? text.slice(0, 1000) : undefined,
  };
}
