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

// ── Exponential backoff (same pattern as general-worker) ─────────────────────

type AnthropicMessage = {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  stop_reason: string;
};

async function callApexWithRetry(payload: unknown, maxRetries = 3): Promise<AnthropicMessage> {
  const delays = [1000, 2000, 4000];
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (resp.ok) return resp.json() as Promise<AnthropicMessage>;
    if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) {
      const jitter = Math.random() * 300;
      await new Promise((r) => setTimeout(r, delays[attempt] + jitter));
      lastErr = new Error(`Anthropic API ${resp.status} (attempt ${attempt + 1})`);
      continue;
    }
    throw new Error(`Anthropic API error: ${resp.status}`);
  }
  throw lastErr ?? new Error("callApexWithRetry: max retries exceeded");
}

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
      name: "keyword_search",
      description: "Fast exact/keyword search in the knowledge base. Use when you need to find specific terms, product names, dates, or exact phrases. Faster and more precise than search_corpus for known terms.",
      input_schema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Exact term or phrase to find (case-insensitive)" },
          limit: { type: "number", description: "Max results (1-15)", default: 10 },
        },
        required: ["keyword"],
      },
    },
    {
      name: "write_memory",
      description: "Persist an important finding, fact, or insight to the workspace knowledge base so it is available in future queries and sessions.",
      input_schema: {
        type: "object",
        properties: {
          content: { type: "string", description: "The fact or insight to store (max 1000 chars)" },
          domain: { type: "string", description: "Domain: product, competitive, finance, delivery, general, research", default: "research" },
          importance: { type: "number", description: "Importance 0.0–1.0", default: 0.8 },
          title: { type: "string", description: "Short title (max 100 chars)" },
        },
        required: ["content", "title"],
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
      // Mark as running — guard with status='pending' to prevent double-claim
      await supabase.from("agent_queue")
        .update({ status: "running", started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("status", "pending");

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
              output: apexResult.synthesis?.slice(0, 15000),
              subtasksCompleted: apexResult.subtasksCompleted,
              toolCalls: apexResult.toolCallCount,
              durationMs,
              chainDepth,
            },
          })
          .eq("id", job.id);

        // RL + federated knowledge write-back — use actual gate scores, not heuristic
        const apexQuality = apexResult.averageScore ?? (apexResult.subtasksCompleted > 0 ? 0.75 : 0.3);
        void import("@/lib/brain/agent-rl").then(({ recordAgentOutcome }) =>
          recordAgentOutcome(supabase, {
            agentId: job.id,
            organizationId: job.organization_id,
            userId: job.organization_id,
            aiWorkerId: job.ai_worker_id ?? undefined,
            domain: "apex",
            taskDescription,
            resultSummary: apexResult.synthesis?.slice(0, 500) ?? "",
            quality: apexQuality,
            executionMs: durationMs,
            modelId: "claude-haiku-4-5-20251001",
          })
        ).catch(() => {});
        // Federated knowledge write-back — APEX synthesis feeds Brain L25-L29
        if (apexResult.synthesis && apexQuality >= 0.5) {
          supabase.from("federated_knowledge").insert({
            organization_id: job.organization_id,
            domain: `apex-agent.${String(job.task_type ?? "research")}`,
            content: apexResult.synthesis.slice(0, 4000),
            confidence: apexQuality,
            metadata: {
              jobId: job.id,
              task: taskDescription.slice(0, 300),
              subtasksCompleted: apexResult.subtasksCompleted,
              toolCallCount: apexResult.toolCallCount,
              source: "apex-worker",
              aiWorkerId: job.ai_worker_id ?? null,
            },
          }).then(() => {}, () => {}); // fire-and-forget, non-fatal
        }
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
  averageScore?: number; // mean quality gate score across completed subtasks
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

    // Heartbeat: write current FSM state so AgentJobWidget shows live progress
    try {
      await adminSupabase
        .from("agent_queue")
        .update({
          heartbeat_at: new Date().toISOString(),
          checkpoint_data: {
            currentStep: currentSubtaskIndex + 1,
            totalSteps: subtasks.length,
            phase: `EXECUTING_SUBTASK_${currentSubtaskIndex + 1}`,
            currentSubtaskGoal: subtask.goal.slice(0, 100),
            totalToolCalls: toolCallCount,
            lastTool: null,
          },
        })
        .eq("id", job.id);
    } catch { /* non-fatal */ }

    // Execute the subtask in a fresh mini agentic loop
    const subtaskResult = await executeSubtask(
      subtask, job, tools, compressedContext,
    );
    toolCallCount += subtaskResult.toolCallCount;
    turnsSinceCompression += subtaskResult.turnCount;

    // Update heartbeat with lastTool from subtask execution (not null)
    if (subtaskResult.lastToolUsed) {
      try {
        await adminSupabase
          .from("agent_queue")
          .update({
            heartbeat_at: new Date().toISOString(),
            checkpoint_data: {
              currentStep: currentSubtaskIndex + 1,
              totalSteps: subtasks.length,
              phase: `EXECUTING_SUBTASK_${currentSubtaskIndex + 1}`,
              currentSubtaskGoal: subtask.goal.slice(0, 100),
              totalToolCalls: toolCallCount,
              lastTool: subtaskResult.lastToolUsed,
            },
          })
          .eq("id", job.id);
      } catch { /* non-fatal */ }
    }

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
      // Persist escalation event to checkpoint_data for observability + SLA tracking
      try {
        await adminSupabase.from("agent_queue").update({
          checkpoint_data: {
            currentStep: currentSubtaskIndex + 1,
            totalSteps: subtasks.length,
            phase: "ESCALATED",
            currentSubtaskGoal: subtask.goal.slice(0, 100),
            totalToolCalls: toolCallCount,
            lastTool: subtaskResult.lastToolUsed,
            escalationAt: new Date().toISOString(),
            escalationReason: gateResult.feedback?.slice(0, 200) ?? "quality gate failure",
          },
        }).eq("id", job.id);
      } catch { /* non-fatal */ }
      currentSubtaskIndex++;
    }
  }

  // ── SYNTHESIZING phase ────────────────────────────────────────────────────
  if (fsmState === "EXECUTING_SUBTASK" && currentSubtaskIndex >= subtasks.length) {
    fsmState = "SYNTHESIZING";
  }

  if (fsmState === "SYNTHESIZING" && !synthesis) {
    // Persist all subtask results before synthesis — if synthesis crashes, partial results survive in DB
    try {
      await adminSupabase.from("agent_queue").update({
        checkpoint_data: {
          currentStep: subtasks.length,
          totalSteps: subtasks.length,
          phase: "SYNTHESIZING",
          totalToolCalls: toolCallCount,
          subtaskResults: subtasks.map((s) => ({
            index: s.index, goal: s.goal.slice(0, 100),
            verdict: s.verdict, score: s.score,
            result: (s.result ?? "").slice(0, 500),
          })),
        },
      }).eq("id", job.id);
    } catch { /* non-fatal */ }

    synthesis = await synthesizeResults(task, subtasks, job);
    fsmState = "COMPLETED";
  }

  // Compute average quality score from subtask gate evaluations
  const scoredSubtasks = subtasks.filter((s) => s.score != null && s.score > 0);
  const averageScore = scoredSubtasks.length > 0
    ? scoredSubtasks.reduce((sum, s) => sum + (s.score ?? 0), 0) / scoredSubtasks.length
    : undefined;

  return {
    synthesis,
    subtasksCompleted: currentSubtaskIndex,
    toolCallCount,
    averageScore,
  };
}

// ── Task Decomposer ───────────────────────────────────────────────────────────

async function decomposeTask(task: string, job: ApexJob): Promise<Subtask[]> {
  if (!ANTHROPIC_API_KEY) {
    return [{ index: 0, goal: task, acceptanceCriteria: ["Complete the task"], attempts: 0 }];
  }

  const prompt = `You are a research project manager. Break this task into 3-7 research phases that will produce a comprehensive, executive-ready deliverable.

TASK: ${task}

Respond ONLY with valid JSON (no markdown):
{
  "subtasks": [
    {
      "goal": "specific research objective",
      "acceptanceCriteria": ["criterion 1", "criterion 2"]
    }
  ]
}

Guidelines:
- Each phase should answer a distinct question or cover a distinct angle
- Phase 1 should always be foundational research (gather baseline facts)
- Later phases should build on earlier findings (competitive analysis, gap analysis, etc.)
- Include a phase for "cross-referencing and validation" if the task involves claims or comparisons
- Acceptance criteria should be evidence-based: "Found at least 3 data points about X", "Identified pricing for Y"
- Order phases so earlier ones provide context for later ones
- Maximum 7 phases`;

  try {
    const data = await callApexWithRetry({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = data.content.find((b) => b.type === "text")?.text ?? "{}";
    const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { subtasks?: Array<{ goal: string; acceptanceCriteria: string[] }> };

    if (!parsed.subtasks?.length) throw new Error("No subtasks");

    // Cap at 7 subtasks — prompt says max 7 but Claude can ignore; enforce here
    return parsed.subtasks.slice(0, 7).map((s, i) => ({
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
  lastToolUsed: string | null;
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
  let lastToolUsed: string | null = null;
  const MAX_SUBTASK_TURNS = 8;

  for (let turn = 0; turn < MAX_SUBTASK_TURNS; turn++) {
    turnCount++;

    const data = await callApexWithRetry({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: `You are a research analyst completing one phase of a multi-phase investigation. Be thorough, precise, and evidence-based.

## Available Tools
- **search_corpus**: Semantic search in the workspace knowledge base (PDFs, Confluence, Google Drive) — use FIRST
- **search_knowledge**: Search structured knowledge (product features, pricing, capabilities)
- **keyword_search**: Fast exact/phrase search for specific terms, names, dates, numbers
- **web_search**: Search the web for current information, news, pricing, competitors
- **browser_extract**: Navigate to a URL and extract page content
- **write_memory**: Save important findings to the knowledge base for future use
- **compress_context**: Summarize accumulated findings when context is growing long

## Research Strategy
1. Search internal knowledge first, then external sources
2. Cross-reference claims across multiple sources
3. Save key findings with **write_memory**
4. Always cite sources: (Source: document name) or (Source: URL)

## Output Standards
- Lead with facts and evidence, not descriptions of your search process
- Include specific numbers, dates, percentages, names — not vague statements
- If you cannot find information, say so explicitly rather than guessing
- Structure findings with bullet points and bold key phrases`,
      messages,
      tools,
    });

    const textBlocks = data.content.filter((b) => b.type === "text");
    if (textBlocks.length > 0) {
      output = textBlocks.map((b) => b.text ?? "").join("");
    }

    const toolUseBlocks = data.content.filter((b) => b.type === "tool_use");
    if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") break;

    messages.push({ role: "assistant", content: data.content });

    // Cap tool calls per turn to prevent runaway cost
    const MAX_TOOL_CALLS_PER_TURN = 5;
    const cappedToolCalls = toolUseBlocks.slice(0, MAX_TOOL_CALLS_PER_TURN);
    const skippedToolCalls = toolUseBlocks.slice(MAX_TOOL_CALLS_PER_TURN);
    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
    for (const toolCall of cappedToolCalls) {
      toolCallCount++;
      if (toolCall.name) lastToolUsed = toolCall.name;
      const toolResult = await executeApexTool(toolCall.name ?? "", toolCall.input ?? {}, job);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolCall.id ?? "",
        content: JSON.stringify(toolResult).slice(0, 8000),
      });
    }
    // Anthropic API requires tool_result for every tool_use — stub skipped calls
    for (const skipped of skippedToolCalls) {
      toolResults.push({
        type: "tool_result",
        tool_use_id: skipped.id ?? "",
        content: JSON.stringify({ error: "Tool call skipped (max 5 per turn). Request fewer tools at once." }),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { output, toolCallCount, turnCount, lastToolUsed };
}

// ── Context Compressor ────────────────────────────────────────────────────────

async function compressSubtaskResults(completedSubtasks: Subtask[], originalTask: string): Promise<string> {
  const resultsText = completedSubtasks
    .map((s) => `Subtask ${s.index + 1} (${s.verdict ?? "PASS"}): ${s.goal}\nResult: ${(s.result ?? "").slice(0, 500)}`)
    .join("\n\n");

  if (!ANTHROPIC_API_KEY) return resultsText.slice(0, 2000);

  try {
    const data = await callApexWithRetry({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `Compress these completed subtask results into a concise context summary (max 400 words). Preserve all key facts and findings.\n\nOriginal task: ${originalTask}\n\nCompleted work:\n${resultsText}`,
      }],
    });
    return data.content.find((b) => b.type === "text")?.text ?? resultsText.slice(0, 2000);
  } catch {
    return resultsText.slice(0, 2000);
  }
}

// ── Synthesizer ───────────────────────────────────────────────────────────────

async function synthesizeResults(task: string, subtasks: Subtask[], job: ApexJob): Promise<string> {
  const completed = subtasks.filter((s) => s.verdict === "PASS");
  const escalated = subtasks.filter((s) => s.verdict === "ESCALATE");

  const completedWork = subtasks
    .map((s) => {
      const statusLabel = s.verdict === "ESCALATE"
        ? `⚠ Partial coverage (${s.attempts} attempts)`
        : `✓ Complete`;
      return `## Research Phase ${s.index + 1}: ${s.goal}\nStatus: ${statusLabel}\n${s.result ?? "No result"}`;
    })
    .join("\n\n---\n\n");

  const coverageNote = escalated.length > 0
    ? `\n\nIMPORTANT: ${escalated.length} of ${subtasks.length} research phases had incomplete coverage. For those areas, provide the best available analysis and clearly note what remains uncertain.`
    : "";

  if (!ANTHROPIC_API_KEY) return completedWork;

  try {
    const synthesisModel = String(job.payload.synthesisModel ?? "claude-haiku-4-5-20251001");
    const data = await callApexWithRetry({
      model: synthesisModel,
      max_tokens: 4096,
      system: `You are a senior strategy analyst producing an executive-ready research report. Your output will be displayed directly to enterprise customers. It must be polished, insightful, and actionable.

## Report Template (follow this structure exactly)

# [Report Title — derived from the task]

## Executive Summary
2-3 sentences answering the core question with the most important conclusion.

## Key Findings
- Bullet points with the most significant discoveries
- Each finding should include a specific fact, number, or insight
- Bold the most important phrases

## Detailed Analysis
Organized by topic with headers (### Topic Name). Include:
- Evidence and data points from research
- Comparisons where relevant (use markdown tables for side-by-side comparisons)
- Citations: (Source: document/URL name)

## Recommendations
Numbered, actionable next steps. Each should be specific enough to act on.

## Sources
Bullet list of all documents, URLs, and knowledge base items referenced.

## Quality Rules
- Lead with insights, not process descriptions
- Use markdown formatting extensively: **bold**, tables, bullet lists
- Be specific — include numbers, percentages, dates, names
- If any area has gaps, say "Further investigation needed for..." rather than guessing
- Write for C-suite audience — clear, concise, high-impact`,
      messages: [{
        role: "user",
        content: `Synthesize these research results into a polished executive report.${coverageNote}\n\nORIGINAL TASK: ${task}\n\n${completedWork}\n\nProduce the final report following the template in your instructions. Make it comprehensive and actionable.`,
      }],
    });
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
      case "keyword_search": {
        // Fast text search — hierarchical retrieval (A-RAG pattern)
        const { getAdminClient } = await import("@/lib/supabase/admin");
        const supabase = getAdminClient();
        const keyword = String(input.keyword ?? "");
        const limit = Math.min(Number(input.limit ?? 10), 15);
        if (!keyword) return { error: "keyword is required" };
        const { data } = await supabase
          .from("document_chunks")
          .select("chunk_text, chunk_index, document_id")
          .eq("organization_id", job.organization_id)
          .ilike("chunk_text", `%${keyword}%`)
          .limit(limit);
        if (!data?.length) return { results: [], message: `No chunks containing "${keyword}" found.` };
        return { results: data.map((c) => ({ text: c.chunk_text, chunk: c.chunk_index })), count: data.length };
      }
      case "write_memory": {
        const { getAdminClient } = await import("@/lib/supabase/admin");
        const supabase = getAdminClient();
        const content = String(input.content ?? "").slice(0, 1000);
        const title = String(input.title ?? "APEX finding").slice(0, 100);
        const domain = String(input.domain ?? "research");
        const importance = Math.min(1.0, Math.max(0.0, Number(input.importance ?? 0.8)));
        if (!content) return { error: "content is required" };
        const { data, error } = await supabase.from("ai_memory").insert({
          organization_id: job.organization_id,
          content,
          memory_type: "knowledge",
          domain: `apex.${domain}`,
          importance,
          metadata: { title, source: "apex-agent", jobId: job.id, discoveredAt: new Date().toISOString() },
        }).select("id").single();
        if (error) return { error: error.message };
        return { success: true, memoryId: data?.id, message: `Finding "${title}" saved.` };
      }
      case "compress_context": {
        // Compress context: use Haiku to summarize the prior_findings passed by the caller.
        // This gives Claude a compact summary it can reference instead of re-reading full history.
        const priorFindings = String(input.prior_findings ?? input.context ?? "");
        const reason = String(input.reason ?? "context growing");
        if (!priorFindings || priorFindings.length < 200) {
          return { compressed: false, message: "Not enough context to compress yet." };
        }
        try {
          const summaryResp = await callApexWithRetry({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 400,
            system: "Summarize the following research findings into a compact 3-5 bullet summary. Keep key facts, URLs, numbers, and conclusions. Discard reasoning chains and intermediate steps.",
            messages: [{ role: "user", content: `FINDINGS TO COMPRESS:\n${priorFindings.slice(0, 3000)}` }],
          });
          const summary = summaryResp.content.find((b) => b.type === "text")?.text ?? priorFindings.slice(0, 500);
          return { compressed: true, summary, reason, message: `Context compressed (${priorFindings.length} → ${summary.length} chars). Use the summary above for subsequent steps.` };
        } catch {
          return { compressed: false, message: "Compression failed — continue with existing context." };
        }
      }
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
