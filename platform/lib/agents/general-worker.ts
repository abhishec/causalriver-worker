/**
 * General-Purpose Agent Worker
 * ============================
 *
 * Processes agent_queue jobs with agent_type='general'.
 * Unlike SE-aaS domain executors (which are constrained to specific domains),
 * general workers handle arbitrary tasks via Claude tool_use agentic loops.
 *
 * The worker:
 *   1. Claims pending general jobs from agent_queue
 *   2. Loads workspace connector tools from the tools registry
 *   3. Includes web_search + browser primitives as tools
 *   4. Runs Claude tool_use loop until the task is complete or budget exhausted
 *   5. Records outcome via recordJobOutcome for RL feedback
 *
 * Lambda-safe: uses shouldChain() for 75s budget, checkpointAndChain() for 12h+ sessions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { shouldChain, checkpointAndChain, isCostBudgetExceeded, LAMBDA_BUDGET_MS } from "@/lib/brain/chain-invoker";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// General worker uses a tighter budget than full LAMBDA_BUDGET_MS to fit within cron windows.
// Cron gives ~25s; we stop at 20s and chain to next Lambda invocation.
const GENERAL_WORKER_BUDGET_MS = 20_000;

// ── Exponential backoff for Anthropic API (pattern from SOTA research) ────────
// 429/500 → retry with 1s/2s/4s + jitter. Prevents silent cascade failures.

async function callAnthropicWithRetry(
  payload: unknown,
  maxRetries = 3,
): Promise<{ content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>; stop_reason: string }> {
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
    if (resp.ok) return resp.json() as Promise<{ content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>; stop_reason: string }>;
    if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) {
      const jitter = Math.random() * 300;
      await new Promise((r) => setTimeout(r, delays[attempt] + jitter));
      lastErr = new Error(`Anthropic API ${resp.status} (attempt ${attempt + 1})`);
      continue;
    }
    throw new Error(`Anthropic API error: ${resp.status}`);
  }
  throw lastErr ?? new Error("callAnthropicWithRetry: max retries exceeded");
}

// ── Goal-check quality evaluator (Haiku) ─────────────────────────────────────
// Replaces naive output.length heuristic with a fast semantic evaluation.
// Returns 0.0–1.0 quality score. Graceful degradation on API failure.

async function evaluateOutputQuality(task: string, output: string, toolCallCount: number): Promise<number> {
  if (!ANTHROPIC_API_KEY || !output.trim()) return 0.2;
  // Quick heuristic pre-check: if agent made tool calls AND has substantive output, already promising
  if (toolCallCount >= 2 && output.length >= 200) {
    try {
      const data = await callAnthropicWithRetry({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 128,
        system: "You are a task completion evaluator. Respond ONLY with a JSON object: {\"score\": 0.0-1.0, \"reason\": \"brief\"}. Score 0.9+ if task fully completed with sources/evidence. Score 0.6-0.8 if partially done. Score <0.5 if task not addressed.",
        messages: [{
          role: "user",
          content: `TASK: ${task.slice(0, 300)}\n\nAGENT OUTPUT (first 1000 chars):\n${output.slice(0, 1000)}\n\nScore the completion quality.`,
        }],
      });
      const text = data.content?.find((b) => b.type === "text")?.text ?? "";
      const match = text.match(/"score"\s*:\s*([0-9.]+)/);
      if (match) return Math.min(1.0, Math.max(0.0, parseFloat(match[1])));
    } catch { /* fallback to heuristic */ }
  }
  // Heuristic fallback: tool calls + output length
  if (toolCallCount >= 3 && output.length >= 500) return 0.75;
  if (toolCallCount >= 1 && output.length >= 100) return 0.60;
  if (output.length >= 50) return 0.40;
  return 0.20;
}

export interface GeneralWorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  jobIds: string[];
}

interface GeneralJob {
  id: string;
  organization_id: string;
  task_type: string;
  payload: Record<string, unknown>;
  ai_worker_id: string | null;
  agent_id: string | null;
}

/**
 * Process pending general-purpose agent jobs.
 * Called from the cron/process-jobs endpoint.
 */
export async function processGeneralJobs(
  supabase: SupabaseClient,
  limit = 2,
): Promise<GeneralWorkerResult> {
  const result: GeneralWorkerResult = { processed: 0, succeeded: 0, failed: 0, jobIds: [] };

  if (!ANTHROPIC_API_KEY) {
    logger.warn("[general-worker] ANTHROPIC_API_KEY not configured, skipping");
    return result;
  }

  // Claim pending general jobs AND chain-continuation jobs (both handled here)
  const { data: jobs, error } = await supabase
    .from("agent_queue")
    .select("id, organization_id, task_type, payload, ai_worker_id, agent_id")
    .in("agent_type", ["general", "chain-continuation"])
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !jobs?.length) return result;

  for (const job of jobs as GeneralJob[]) {
    result.processed++;
    result.jobIds.push(job.id);
    const startMs = Date.now();

    try {
      // Mark as running — guard with status='pending' to prevent double-claim
      await supabase.from("agent_queue")
        .update({ status: "running", started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("status", "pending");

      // Restore from checkpoint if this is a chain-continuation
      const checkpoint = job.payload.checkpoint as Record<string, unknown> | undefined;
      const isResume = !!checkpoint;
      const chainDepth = Number(job.payload.chainDepth ?? job.payload.chain_depth ?? 0);

      // Resolve task description: new job uses payload.task, continuation uses checkpoint.task
      const taskDescription = String(
        checkpoint?.task ?? job.payload.task ?? job.payload.description ?? job.task_type
      );
      const maxTurns = Math.min(Number(job.payload.maxTurns ?? 20), 50);

      // Restore conversation history for continuation jobs
      const resumeMessages = isResume
        ? (checkpoint?.messages as Array<{ role: string; content: unknown }> | undefined) ?? []
        : undefined;

      // Build available tools
      const tools = buildGeneralTools();

      // Run the agentic loop (chain-aware)
      const agentResult = await runAgenticLoop(
        taskDescription, tools, maxTurns, job, startMs, chainDepth, resumeMessages
      );

      const durationMs = Date.now() - startMs;

      if (agentResult.chained) {
        // Job was checkpointed and chained — parent is now 'paused', child is 'pending'
        logger.warn(`[general-worker] Job ${job.id} chained → ${agentResult.childJobId} (depth ${chainDepth + 1})`);
        // Don't mark as completed — it's 'paused' from checkpointAndChain
      } else {
        // Job completed in this Lambda
        await supabase.from("agent_queue")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            result: { output: agentResult.output.slice(0, 5000), toolCalls: agentResult.toolCallCount, durationMs, chainDepth },
          })
          .eq("id", job.id);

        // Record RL outcome with actual quality evaluation (not length heuristic)
        void evaluateOutputQuality(taskDescription, agentResult.output, agentResult.toolCallCount).then(async (quality) => {
          // 1. RL feedback loop
          await import("@/lib/brain/agent-rl").then(({ recordAgentOutcome }) =>
            recordAgentOutcome(supabase, {
              agentId: job.id,
              organizationId: job.organization_id,
              userId: job.organization_id,
              aiWorkerId: job.ai_worker_id ?? undefined,
              domain: "general",
              taskDescription,
              resultSummary: agentResult.output.slice(0, 500),
              quality,
              executionMs: durationMs,
              modelId: "claude-haiku-4-5-20251001",
            })
          );
          // 2. Federated knowledge write-back — Brain L25-L29 learns from agent work
          if (quality >= 0.5 && agentResult.output.length > 100) {
            supabase.from("federated_knowledge").insert({
              organization_id: job.organization_id,
              domain: `general-agent.${String(job.task_type ?? "general")}`,
              content: agentResult.output.slice(0, 4000),
              confidence: quality,
              metadata: {
                jobId: job.id,
                task: taskDescription.slice(0, 300),
                toolsUsed: agentResult.toolsUsed,
                toolCallCount: agentResult.toolCallCount,
                source: "general-worker",
                aiWorkerId: job.ai_worker_id ?? null,
              },
            }).then(() => {}, () => {}); // fire-and-forget, non-fatal
          }
        }).catch(() => {});
      }

      result.succeeded++;
      logger.warn(`[general-worker] Job ${job.id} ${agentResult.chained ? "chained" : "completed"} in ${durationMs}ms (${agentResult.toolCallCount} tool calls)`);
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);

      await supabase.from("agent_queue")
        .update({ status: "failed", error_message: errorMsg.slice(0, 500), completed_at: new Date().toISOString() })
        .eq("id", job.id);

      result.failed++;
      logger.error(`[general-worker] Job ${job.id} failed after ${durationMs}ms: ${errorMsg}`);
    }
  }

  return result;
}

// ── Tool definitions for the general worker ──────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

function buildGeneralTools(): ToolDef[] {
  return [
    {
      name: "web_search",
      description: "Search the web for current information. Returns titles, URLs, and descriptions.",
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
      description: "Navigate to a URL and extract the full page text content. Use for reading web pages, product pages, documentation sites.",
      input_schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to navigate to" },
        },
        required: ["url"],
      },
    },
    {
      name: "browser_screenshot",
      description: "Take a screenshot of a web page. Returns base64 PNG.",
      input_schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to screenshot" },
          fullPage: { type: "boolean", description: "Capture full page", default: false },
        },
        required: ["url"],
      },
    },
    {
      name: "search_corpus",
      description: "Search the workspace knowledge base (uploaded PDFs, Confluence pages, Google Drive docs) using semantic similarity. Returns relevant text chunks with source document names. Use this to find information from ingested documents.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for in the knowledge base" },
          limit: { type: "number", description: "Max chunks to return (1-20)", default: 8 },
        },
        required: ["query"],
      },
    },
    {
      name: "search_knowledge",
      description: "Search absorbed structured knowledge extracted from documents — product features, pricing tiers, capabilities, integrations, and key facts. More structured than search_corpus. Use when you need organized product/domain knowledge.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What knowledge to retrieve (e.g. 'product features', 'pricing', 'integrations')" },
          domain_filter: { type: "string", description: "Optional domain filter: product, finance, hr, delivery, general", default: "" },
        },
        required: ["query"],
      },
    },
    {
      name: "keyword_search",
      description: "Fast exact/keyword search in the knowledge base. Use when you need to find specific terms, product names, dates, or exact phrases — faster and more precise than search_corpus for known terms.",
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
      description: "Persist an important finding, fact, or insight to the workspace knowledge base so it is available in future queries. Use when you discover key facts, competitive insights, pricing data, or product information worth preserving.",
      input_schema: {
        type: "object",
        properties: {
          content: { type: "string", description: "The fact, finding, or insight to store (max 1000 chars)" },
          domain: { type: "string", description: "Domain category: product, competitive, finance, delivery, general, research", default: "general" },
          importance: { type: "number", description: "Importance score 0.0–1.0 (0.8 for key facts, 0.5 for general info)", default: 0.7 },
          title: { type: "string", description: "Short title for this memory (max 100 chars)" },
        },
        required: ["content", "title"],
      },
    },
  ];
}

// ── System prompt builder (Gap C fix) ────────────────────────────────────────

function buildGeneralSystemPrompt(job: GeneralJob, task: string, chainDepth: number): string {
  const isResume = chainDepth > 0;
  return `You are a general-purpose AI agent running inside BrainOS — an enterprise intelligence platform.

## Your Mission
Complete the following task thoroughly and accurately using the available tools:
"${task.slice(0, 300)}"

## Available Tools
- **web_search**: Search the web for current information, news, pricing, features, competitors
- **browser_extract**: Navigate to a URL and extract full page text (product pages, docs, articles)
- **browser_screenshot**: Take a screenshot of a web page
- **search_corpus**: Search the workspace knowledge base (uploaded PDFs, Confluence, Google Drive docs) using semantic search — use this FIRST for internal knowledge
- **search_knowledge**: Search structured knowledge extracted from documents (product features, pricing tiers, capabilities, integrations)

## Instructions
1. Start with **search_corpus** and **search_knowledge** for internal knowledge before going external
2. Use **web_search** for current market data, competitor info, or anything not in the knowledge base
3. Use **browser_extract** to read specific pages in full depth
4. Be thorough — cover all angles of the task before responding
5. Cite sources (document names, URLs) when making factual claims
6. Structure your final answer clearly with headers, bullet points, tables where appropriate

## Context
- Organization: ${job.organization_id}
- Agent type: general-purpose${isResume ? ` (continuation — chain depth: ${chainDepth})` : ""}
- Task source: ${String(job.payload.source ?? "system")}

${isResume ? "## Resuming from checkpoint\nYou are continuing a task that was checkpointed. The conversation history above contains your prior work. Continue from where you left off.\n" : ""}
Always think step-by-step. Use multiple tools. Deliver a comprehensive, well-structured response.`;
}

// ── Agentic loop: Claude tool_use until done ─────────────────────────────────

interface AgentLoopResult {
  output: string;
  toolCallCount: number;
  toolsUsed: string[];
  chained?: boolean;
  childJobId?: string;
}

async function runAgenticLoop(
  task: string,
  tools: ToolDef[],
  maxTurns: number,
  job: GeneralJob,
  startMs: number = Date.now(),
  chainDepth: number = 0,
  resumeMessages?: Array<{ role: string; content: unknown }>,
): Promise<AgentLoopResult> {
  // Restore conversation history from checkpoint, or start fresh
  const messages: Array<{ role: string; content: unknown }> = resumeMessages?.length
    ? [...resumeMessages]
    : [{ role: "user", content: task }];

  let output = "";
  let toolCallCount = 0;
  const toolsUsed: string[] = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    // Chain-invoker: if Lambda budget is nearly exhausted, checkpoint and spawn continuation
    if (shouldChain(startMs, GENERAL_WORKER_BUDGET_MS)) {
      try {
        const { getAdminClient } = await import("@/lib/supabase/admin");
        const supabase = getAdminClient();
        const checkpoint = { task, messages, chainDepth, toolCallCount, toolsUsed, partialOutput: output };
        const childJobId = await checkpointAndChain(supabase, job.id, checkpoint, chainDepth);
        return { output, toolCallCount, toolsUsed, chained: true, childJobId };
      } catch (chainErr) {
        logger.error("[general-worker] Chain failed, continuing in current Lambda", { error: chainErr });
        // Don't chain — just finish what we can in the remaining time
      }
    }

    // Also check cost budget if specified in payload
    const maxCostUsd = Number(job.payload.maxCostUsd ?? 0);
    // Rough cost estimate: ~$0.001 per Haiku call
    const estimatedCost = toolCallCount * 0.001;
    if (isCostBudgetExceeded(estimatedCost, maxCostUsd || undefined)) {
      logger.warn(`[general-worker] Cost budget $${maxCostUsd} exceeded, stopping`);
      break;
    }

    const data = await callAnthropicWithRetry({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: buildGeneralSystemPrompt(job, task, chainDepth),
      messages,
      tools,
    });

    // Collect text output
    const textBlocks = data.content.filter((b) => b.type === "text");
    if (textBlocks.length > 0) {
      output = textBlocks.map((b) => b.text ?? "").join("");
    }

    // If no tool use, we're done
    const toolUseBlocks = data.content.filter((b) => b.type === "tool_use");
    if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") {
      break;
    }

    // Add assistant message to history
    messages.push({ role: "assistant", content: data.content });

    // Execute each tool call
    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
    for (const toolCall of toolUseBlocks) {
      toolCallCount++;
      if (toolCall.name && !toolsUsed.includes(toolCall.name)) {
        toolsUsed.push(toolCall.name);
      }

      const toolResult = await executeGeneralTool(toolCall.name ?? "", toolCall.input ?? {}, job);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolCall.id ?? "",
        content: JSON.stringify(toolResult).slice(0, 10000),
      });
    }

    messages.push({ role: "user", content: toolResults });

    // Heartbeat after every tool execution batch — lastTool is always current
    try {
      const { getAdminClient } = await import("@/lib/supabase/admin");
      await getAdminClient()
        .from("agent_queue")
        .update({
          heartbeat_at: new Date().toISOString(),
          checkpoint_data: {
            currentStep: turn + 1,
            totalToolCalls: toolCallCount,
            toolsUsed,
            lastTool: toolsUsed[toolsUsed.length - 1] ?? null,
            partialOutput: output.slice(0, 500),
          },
        })
        .eq("id", job.id);
    } catch { /* non-fatal */ }
  }

  return { output, toolCallCount, toolsUsed };
}

// ── Tool execution dispatcher ────────────────────────────────────────────────

async function executeGeneralTool(
  toolName: string,
  input: Record<string, unknown>,
  job: GeneralJob,
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
      case "browser_screenshot": {
        const { executePrimitive } = await import("@/lib/brain/primitive-registry");
        const ctx = { supabase: null as any, organizationId: job.organization_id, userId: "" };
        return executePrimitive(ctx, "browser", { action: "screenshot", ...input });
      }
      case "search_corpus": {
        const { getAdminClient } = await import("@/lib/supabase/admin");
        const supabase = getAdminClient();
        const { searchDocumentChunks } = await import("@/lib/connectors/document-ingester");
        const limit = Math.min(Number(input.limit ?? 8), 20);
        const chunks = await searchDocumentChunks(supabase, job.organization_id, String(input.query ?? ""), limit);
        if (!chunks?.length) return { results: [], message: "No relevant documents found in knowledge base." };
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
        if (!data?.length) return { results: [], message: "No structured knowledge found. Documents may not be ingested yet." };
        return {
          results: data.map((row: { content: string; metadata: unknown; domain: string }) => {
            const meta = (row.metadata as Record<string, unknown> | null) ?? {};
            return {
              content: row.content,
              domain: row.domain,
              productFeatures: meta.productFeatures ?? [],
              pricingTiers: meta.pricingTiers ?? [],
              capabilities: meta.capabilities ?? [],
              integrations: meta.integrations ?? [],
              userStories: meta.userStories ?? [],
            };
          }),
          count: data.length,
        };
      }
      case "keyword_search": {
        // Fast text search — A-RAG hierarchical retrieval (for known terms)
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
        // Persist agent-discovered facts to ai_memory so they survive session boundaries
        const { getAdminClient } = await import("@/lib/supabase/admin");
        const supabase = getAdminClient();
        const domain = String(input.domain ?? "general");
        const importance = Math.min(1.0, Math.max(0.0, Number(input.importance ?? 0.7)));
        const content = String(input.content ?? "").slice(0, 1000);
        const title = String(input.title ?? "Agent finding").slice(0, 100);
        if (!content) return { error: "content is required" };
        const { data, error } = await supabase.from("ai_memory").insert({
          organization_id: job.organization_id,
          content,
          memory_type: "knowledge",
          domain: `agent.${domain}`,
          importance,
          metadata: { title, source: "general-agent", jobId: job.id, discoveredAt: new Date().toISOString() },
        }).select("id").single();
        if (error) return { error: error.message };
        return { success: true, memoryId: data?.id, message: `Fact "${title}" saved to knowledge base.` };
      }
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
