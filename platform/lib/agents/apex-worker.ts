/**
 * APEX Worker — Agent Pipeline with Execution Gates
 * ==================================================
 *
 * Perplexity/Devin-style long-running agent framework with:
 *   1. Task Decomposer      — breaks complex tasks into subtasks with acceptance criteria
 *   2. Execute-Evaluate     — runs each subtask in a fresh tool_use loop
 *   3. Quality Gate         — Haiku evaluator scores each subtask (PASS/RETRY/ESCALATE)
 *   4. Context Compression  — every 10 turns compress history to prevent context overflow
 *   5. Synthesis FSM        — combines all subtask results into a final answer
 *
 * FSM States:
 *   PLANNING → EXECUTING_SUBTASK_{n} → EVALUATING → PASS → EXECUTING_SUBTASK_{n+1}
 *                                               ↘ RETRY → re-run subtask (up to 3×)
 *                                               ↘ ESCALATE → mark partial + move on
 *   All subtasks done → SYNTHESIZING → COMPLETED
 *
 * Chain-safe: uses shouldChain() + checkpointAndChain() for 12h+ jobs.
 * Lambda budget: 20s per tick (fits inside 25s cron window).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { shouldChain, checkpointAndChain, isCostBudgetExceeded } from "@/lib/brain/chain-invoker";
import { evaluateSubtask } from "./quality-gate";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const APEX_BUDGET_MS = 20_000;
const MAX_RETRY_ATTEMPTS = 3;
const COMPRESSION_TURN_INTERVAL = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ApexWorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  jobIds: string[];
}

type ApexFsmState =
  | "PLANNING"
  | "EXECUTING_SUBTASK"
  | "EVALUATING"
  | "SYNTHESIZING"
  | "COMPLETED"
  | "FAILED";

interface Subtask {
  index: number;
  goal: string;
  acceptanceCriteria: string[];
  result?: string;
  score?: number;
  verdict?: "PASS" | "RETRY" | "ESCALATE";
  attempts: number;
}

interface ApexCheckpoint {
  task: string;
  fsmState: ApexFsmState;
  subtasks: Subtask[];
  currentSubtaskIndex: number;
  toolCallCount: number;
  chainDepth: number;
  synthesis?: string;
  compressedContext?: string;
  turnsSinceCompression: number;
}

interface ApexJob {
  id: string;
  organization_id: string;
  task_type: string;
  payload: Record<string, unknown>;
  ai_worker_id: string | null;
  agent_id: string | null;
}

// ── Tool definitions (same as general-worker + memory tools) ────────────────

function buildApexTools() {
  return [
    {
      name: "web_search",
      description: "Search the web for current information.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (1-10)", default: 5 },
        },
        required: ["query"],
      },
    },
    {
      name: "browser_extract",
      description: "Navigate to a URL and extract the full page text content.",
      input_schema: {
        type: "object",
        properties: { url: { type: "string", description: "URL to navigate to" } },
        required: ["url"],
      },
    },
    {
      name: "search_corpus",
      description: "Search the workspace knowledge base (PDFs, Confluence, Google Drive docs) using semantic similarity.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for in the knowledge base" },
          limit: { type: "number", description: "Max chunks (1-20)", default: 8 },
        },
        required: ["query"],
      },
    },
    {
      name: "search_knowledge",
      description: "Search absorbed structured knowledge (product features, pricing, capabilities).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What knowledge to retrieve" },
          domain_filter: { type: "string", description: "Optional domain filter", default: "" },
        },
        required: ["query"],
      },
    },
    {
      name: "compress_context",
      description: "Compress the conversation history into a summary to free up context window.",
      input_schema: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why compression is needed" },
        },
        required: ["reason"],
      },
    },
  ];
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function processApexJobs(
  supabase: SupabaseClient,
  limit = 1,
): Promise<ApexWorkerResult> {
  const result: ApexWorkerResult = { processed: 0, succeeded: 0, failed: 0, jobIds: [] };

  if (!ANTHROPIC_API_KEY) {
    logger.warn("[apex-worker] ANTHROPIC_API_KEY not configured, skipping");
    return result;
  }

  // Claim pending APEX jobs AND apex-continuation jobs
  const { data: jobs, error } = await supabase
    .from("agent_queue")
    .select("id, organization_id, task_type, payload, ai_worker_id, agent_id")
    .in("agent_type", ["apex", "apex-continuation"])
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !jobs?.length) return result;

  for (const job of jobs as ApexJob[]) {
    result.processed++;
    result.jobIds.push(job.id);
    const startMs = Date.now();

    try {
      // Mark as running
      await supabase.from("agent_queue")
        .update({ status: "running", started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() })
        .eq("id", job.id);

      // Restore from checkpoint if continuation
      const checkpoint = job.payload.checkpoint as ApexCheckpoint | undefined;
      const isResume = !!checkpoint;
      const chainDepth = Number(job.payload.chainDepth ?? job.payload.chain_depth ?? 0);
      const taskDescription = String(
        checkpoint?.task ?? job.payload.task ?? job.payload.description ?? job.task_type
      );

      // Run the APEX FSM
      const apexResult = await runApexFsm(
        taskDescription,
        job,
        startMs,
        chainDepth,
        isResume ? checkpoint : undefined,
      );

      const durationMs = Date.now() - startMs;

      if (apexResult.chained) {
        logger.warn(`[apex-worker] Job ${job.id} chained → ${apexResult.childJobId} (depth ${chainDepth + 1})`);
        // Parent is 'paused' via checkpointAndChain — don't mark completed
      } else {
        await supabase.from("agent_queue")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            result: {
              output: apexResult.synthesis?.slice(0, 5000),
              subtasksCompleted: apexResult.subtasksCompleted,
              toolCalls: apexResult.toolCallCount,
              durationMs,
              chainDepth,
            },
          })
          .eq("id", job.id);

        // RL outcome recording
        void import("@/lib/brain/agent-rl").then(({ recordAgentOutcome }) =>
          recordAgentOutcome(supabase, {
            agentId: job.id,
            organizationId: job.organization_id,
            userId: job.organization_id,
            aiWorkerId: job.ai_worker_id ?? undefined,
            domain: "apex",
            taskDescription,
            resultSummary: apexResult.synthesis?.slice(0, 500) ?? "",
            quality: apexResult.subtasksCompleted > 0 ? 0.85 : 0.3,
            executionMs: durationMs,
            modelId: "claude-haiku-4-5-20251001",
          })
        ).catch(() => {});
      }

      result.succeeded++;
      logger.warn(`[apex-worker] Job ${job.id} ${apexResult.chained ? "chained" : "completed"} in ${Date.now() - startMs}ms`);
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);

      await supabase.from("agent_queue")
        .update({ status: "failed", error_message: errorMsg.slice(0, 500), completed_at: new Date().toISOString() })
        .eq("id", job.id);

      result.failed++;
      logger.error(`[apex-worker] Job ${job.id} failed after ${durationMs}ms: ${errorMsg}`);
    }
  }

  return result;
}

// ── APEX FSM ─────────────────────────────────────────────────────────────────

interface ApexFsmResult {
  synthesis?: string;
  subtasksCompleted: number;
  toolCallCount: number;
  chained?: boolean;
  childJobId?: string;
}

async function runApexFsm(
  task: string,
  job: ApexJob,
  startMs: number,
  chainDepth: number,
  resumeCheckpoint?: ApexCheckpoint,
): Promise<ApexFsmResult> {
  // Restore or initialize FSM state
  let fsmState: ApexFsmState = resumeCheckpoint?.fsmState ?? "PLANNING";
  let subtasks: Subtask[] = resumeCheckpoint?.subtasks ?? [];
  let currentSubtaskIndex = resumeCheckpoint?.currentSubtaskIndex ?? 0;
  let toolCallCount = resumeCheckpoint?.toolCallCount ?? 0;
  let synthesis = resumeCheckpoint?.synthesis;
  let compressedContext = resumeCheckpoint?.compressedContext;
  let turnsSinceCompression = resumeCheckpoint?.turnsSinceCompression ?? 0;

  const tools = buildApexTools();
  const { getAdminClient } = await import("@/lib/supabase/admin");
  const adminSupabase = getAdminClient();

  // ── PLANNING phase ────────────────────────────────────────────────────────
  if (fsmState === "PLANNING") {
    subtasks = await decomposeTask(task, job);
    fsmState = "EXECUTING_SUBTASK";
    currentSubtaskIndex = 0;
    logger.warn(`[apex-worker] Decomposed "${task.slice(0, 60)}" into ${subtasks.length} subtasks`);
  }

  // ── EXECUTION + EVALUATION loop ───────────────────────────────────────────
  while (fsmState === "EXECUTING_SUBTASK" && currentSubtaskIndex < subtasks.length) {
    // Chain check: save state and spin up a continuation Lambda if needed
    if (shouldChain(startMs, APEX_BUDGET_MS)) {
      try {
        const checkpoint: ApexCheckpoint = {
          task, fsmState, subtasks, currentSubtaskIndex,
          toolCallCount, chainDepth, synthesis, compressedContext, turnsSinceCompression,
        };
        const childJobId = await checkpointAndChain(adminSupabase, job.id, checkpoint, chainDepth);
        return { synthesis, subtasksCompleted: currentSubtaskIndex, toolCallCount, chained: true, childJobId };
      } catch (chainErr) {
        logger.error("[apex-worker] Chain failed, finishing in current Lambda", { error: chainErr });
      }
    }

    // Cost check
    const maxCostUsd = Number(job.payload.maxCostUsd ?? 0);
    const estimatedCost = toolCallCount * 0.001;
    if (isCostBudgetExceeded(estimatedCost, maxCostUsd || undefined)) {
      logger.warn("[apex-worker] Cost budget exceeded, moving to synthesis");
      break;
    }

    const subtask = subtasks[currentSubtaskIndex];

    // Execute the subtask in a fresh mini agentic loop
    const subtaskResult = await executeSubtask(
      subtask, job, tools, compressedContext,
    );
    toolCallCount += subtaskResult.toolCallCount;
    turnsSinceCompression += subtaskResult.turnCount;

    // Context compression every N turns
    if (turnsSinceCompression >= COMPRESSION_TURN_INTERVAL) {
      compressedContext = await compressSubtaskResults(subtasks.slice(0, currentSubtaskIndex + 1), task);
      turnsSinceCompression = 0;
    }

    // Quality gate
    const gateResult = await evaluateSubtask({
      subtaskGoal: subtask.goal,
      acceptanceCriteria: subtask.acceptanceCriteria,
      result: subtaskResult.output,
      attemptNumber: subtask.attempts,
      maxAttempts: MAX_RETRY_ATTEMPTS,
    });

    subtask.attempts++;
    subtask.result = subtaskResult.output;
    subtask.score = gateResult.score;
    subtask.verdict = gateResult.verdict;

    logger.warn(`[apex-worker] Subtask ${currentSubtaskIndex + 1}/${subtasks.length} → ${gateResult.verdict} (score=${gateResult.score.toFixed(2)})`);

    if (gateResult.verdict === "PASS") {
      // Move to next subtask
      currentSubtaskIndex++;
    } else if (gateResult.verdict === "RETRY" && subtask.attempts < MAX_RETRY_ATTEMPTS) {
      // Retry same subtask — inject evaluator feedback into goal
      subtask.goal = `${subtask.goal}\n\nPREVIOUS ATTEMPT FEEDBACK: ${gateResult.feedback}\nIMPROVEMENTS NEEDED: ${gateResult.improvements?.join("; ")}`;
      // Don't increment currentSubtaskIndex
    } else {
      // ESCALATE: mark partial and move on
      subtask.verdict = "ESCALATE";
      subtask.result = subtaskResult.output + `\n\n[Quality gate: ESCALATED after ${subtask.attempts} attempts. Feedback: ${gateResult.feedback}]`;
      currentSubtaskIndex++;
    }
  }

  // ── SYNTHESIZING phase ────────────────────────────────────────────────────
  if (fsmState === "EXECUTING_SUBTASK" && currentSubtaskIndex >= subtasks.length) {
    fsmState = "SYNTHESIZING";
  }

  if (fsmState === "SYNTHESIZING" && !synthesis) {
    synthesis = await synthesizeResults(task, subtasks, job);
    fsmState = "COMPLETED";
  }

  return {
    synthesis,
    subtasksCompleted: currentSubtaskIndex,
    toolCallCount,
  };
}

// ── Task Decomposer ───────────────────────────────────────────────────────────

async function decomposeTask(task: string, job: ApexJob): Promise<Subtask[]> {
  if (!ANTHROPIC_API_KEY) {
    return [{ index: 0, goal: task, acceptanceCriteria: ["Complete the task"], attempts: 0 }];
  }

  const prompt = `Decompose this complex task into 3-7 concrete subtasks. Each subtask must be independently executable and have measurable acceptance criteria.

TASK: ${task}

Respond ONLY with valid JSON (no markdown):
{
  "subtasks": [
    {
      "goal": "specific thing to do",
      "acceptanceCriteria": ["criterion 1", "criterion 2"]
    }
  ]
}

Guidelines:
- Keep subtasks focused and achievable in 2-5 tool calls each
- Acceptance criteria should be specific and verifiable
- Order subtasks by dependency (research before synthesis)
- Maximum 7 subtasks`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`API error ${resp.status}`);

    const data = await resp.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content.find((b) => b.type === "text")?.text ?? "{}";
    const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { subtasks?: Array<{ goal: string; acceptanceCriteria: string[] }> };

    if (!parsed.subtasks?.length) throw new Error("No subtasks");

    return parsed.subtasks.map((s, i) => ({
      index: i,
      goal: s.goal,
      acceptanceCriteria: s.acceptanceCriteria ?? ["Complete the subtask"],
      attempts: 0,
    }));
  } catch {
    // Fallback: single subtask = original task
    return [{ index: 0, goal: task, acceptanceCriteria: ["Complete the task thoroughly"], attempts: 0 }];
  }
}

// ── Subtask Executor ──────────────────────────────────────────────────────────

interface SubtaskExecutionResult {
  output: string;
  toolCallCount: number;
  turnCount: number;
}

async function executeSubtask(
  subtask: Subtask,
  job: ApexJob,
  tools: ReturnType<typeof buildApexTools>,
  compressedContext?: string,
): Promise<SubtaskExecutionResult> {
  const messages: Array<{ role: string; content: unknown }> = [
    {
      role: "user",
      content: `${compressedContext ? `## Prior context summary:\n${compressedContext}\n\n` : ""}Your task: ${subtask.goal}\n\nAcceptance criteria:\n${subtask.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    },
  ];

  let output = "";
  let toolCallCount = 0;
  let turnCount = 0;
  const MAX_SUBTASK_TURNS = 8;

  for (let turn = 0; turn < MAX_SUBTASK_TURNS; turn++) {
    turnCount++;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: `You are a focused AI agent completing a specific subtask. Be thorough and meet the acceptance criteria. Organization: ${job.organization_id}`,
        messages,
        tools,
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status}`);

    const data = await resp.json() as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason: string;
    };

    const textBlocks = data.content.filter((b) => b.type === "text");
    if (textBlocks.length > 0) {
      output = textBlocks.map((b) => b.text ?? "").join("");
    }

    const toolUseBlocks = data.content.filter((b) => b.type === "tool_use");
    if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") break;

    messages.push({ role: "assistant", content: data.content });

    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
    for (const toolCall of toolUseBlocks) {
      toolCallCount++;
      const toolResult = await executeApexTool(toolCall.name ?? "", toolCall.input ?? {}, job);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolCall.id ?? "",
        content: JSON.stringify(toolResult).slice(0, 8000),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { output, toolCallCount, turnCount };
}

// ── Context Compressor ────────────────────────────────────────────────────────

async function compressSubtaskResults(completedSubtasks: Subtask[], originalTask: string): Promise<string> {
  const resultsText = completedSubtasks
    .map((s) => `Subtask ${s.index + 1} (${s.verdict ?? "PASS"}): ${s.goal}\nResult: ${(s.result ?? "").slice(0, 500)}`)
    .join("\n\n");

  if (!ANTHROPIC_API_KEY) return resultsText.slice(0, 2000);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `Compress these completed subtask results into a concise context summary (max 400 words). Preserve all key facts and findings.\n\nOriginal task: ${originalTask}\n\nCompleted work:\n${resultsText}`,
        }],
      }),
    });

    if (!resp.ok) return resultsText.slice(0, 2000);

    const data = await resp.json() as { content: Array<{ type: string; text?: string }> };
    return data.content.find((b) => b.type === "text")?.text ?? resultsText.slice(0, 2000);
  } catch {
    return resultsText.slice(0, 2000);
  }
}

// ── Synthesizer ───────────────────────────────────────────────────────────────

async function synthesizeResults(task: string, subtasks: Subtask[], job: ApexJob): Promise<string> {
  const completedWork = subtasks
    .map((s) => `## Subtask ${s.index + 1}: ${s.goal}\nStatus: ${s.verdict ?? "PASS"} (score: ${s.score?.toFixed(2) ?? "N/A"})\n${s.result ?? "No result"}`)
    .join("\n\n---\n\n");

  if (!ANTHROPIC_API_KEY) return completedWork;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: `You are a senior analyst synthesizing research into a final, comprehensive report. Be structured, insightful, and actionable. Organization: ${job.organization_id}`,
        messages: [{
          role: "user",
          content: `Synthesize these subtask results into a comprehensive final answer for the original task.\n\nORIGINAL TASK: ${task}\n\n${completedWork}\n\nProvide a well-structured, comprehensive synthesis that directly answers the original task.`,
        }],
      }),
    });

    if (!resp.ok) return completedWork;

    const data = await resp.json() as { content: Array<{ type: string; text?: string }> };
    return data.content.find((b) => b.type === "text")?.text ?? completedWork;
  } catch {
    return completedWork;
  }
}

// ── Tool execution dispatcher ─────────────────────────────────────────────────

async function executeApexTool(
  toolName: string,
  input: Record<string, unknown>,
  job: ApexJob,
): Promise<Record<string, unknown>> {
  try {
    switch (toolName) {
      case "web_search": {
        const { executePrimitive } = await import("@/lib/brain/primitive-registry");
        const ctx = { supabase: null as any, organizationId: job.organization_id, userId: "" };
        return executePrimitive(ctx, "web_search", input);
      }
      case "browser_extract": {
        const { executePrimitive } = await import("@/lib/brain/primitive-registry");
        const ctx = { supabase: null as any, organizationId: job.organization_id, userId: "" };
        return executePrimitive(ctx, "browser", { action: "extract", ...input });
      }
      case "search_corpus": {
        const { getAdminClient } = await import("@/lib/supabase/admin");
        const supabase = getAdminClient();
        const { searchDocumentChunks } = await import("@/lib/connectors/document-ingester");
        const limit = Math.min(Number(input.limit ?? 8), 20);
        const chunks = await searchDocumentChunks(supabase, job.organization_id, String(input.query ?? ""), limit);
        if (!chunks?.length) return { results: [], message: "No relevant documents found." };
        return {
          results: chunks.map((c) => ({
            source: c.document_title ?? "Document",
            chunk: c.chunk_index,
            text: c.chunk_text,
          })),
          count: chunks.length,
        };
      }
      case "search_knowledge": {
        const { getAdminClient } = await import("@/lib/supabase/admin");
        const supabase = getAdminClient();
        const domainFilter = String(input.domain_filter ?? "");
        let query = supabase
          .from("ai_memory")
          .select("content, metadata, domain, importance")
          .eq("organization_id", job.organization_id)
          .eq("memory_type", "knowledge")
          .like("domain", "document.%")
          .order("importance", { ascending: false })
          .limit(10);
        if (domainFilter) {
          query = query.like("domain", `document.${domainFilter}%`);
        }
        const { data } = await query;
        if (!data?.length) return { results: [], message: "No structured knowledge found." };
        return {
          results: data.map((row: { content: string; metadata: unknown; domain: string }) => {
            const meta = (row.metadata as Record<string, unknown> | null) ?? {};
            return {
              content: row.content,
              domain: row.domain,
              productFeatures: meta.productFeatures ?? [],
              pricingTiers: meta.pricingTiers ?? [],
              capabilities: meta.capabilities ?? [],
            };
          }),
          count: data.length,
        };
      }
      case "compress_context":
        // This tool is handled externally in the FSM; return ack
        return { compressed: true, message: "Context compression requested." };
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
