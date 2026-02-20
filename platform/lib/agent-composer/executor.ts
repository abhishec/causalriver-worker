/**
 * Composed Agent Executor — Runs composed agents through NexusBrain's tool ecosystem
 * ====================================================================================
 *
 * Receives an AgentComposition (selected tools, persona, execution plan) and
 * executes it step-by-step, delegating to the appropriate underlying executors:
 *
 *   - SE-aaS tools  → executeDomain() from domain-executor.ts
 *   - AAS tools      → executeAccountingAgent() from aas/domain-executor.ts
 *   - Brain tools    → Brain Context Mesh + direct queries
 *   - MCP tools      → Gateway RPC via openclaw gateway client
 *   - OpenClaw RPC   → Gateway RPC methods
 *
 * Streams AgentStep events back to the SSE consumer for real-time UI updates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentComposition, CompositionProgress } from "./composer";
import type { ToolDescriptor } from "./tool-registry";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ExecutionContext {
  organizationId: string;
  userId: string;
  supabase: SupabaseClient;
  anthropicApiKey: string;
  /** Gathered user params (from interactive gathering) */
  params?: Record<string, unknown>;
  /** Git branch for SE-aaS code intelligence */
  branch?: string;
}

export interface ExecutionStep {
  stepNumber: number;
  type: "thinking" | "querying" | "acting" | "observing" | "reflecting";
  title: string;
  content?: string;
  toolName?: string;
  durationMs?: number;
  status: "started" | "completed" | "failed";
}

export interface ExecutionArtifact {
  id: string;
  type: string;
  title: string;
  content: string;
  service: string;
  domainId?: string;
  rawData?: unknown;
}

export interface ExecutionResult {
  /** Final narrative/summary from the agent */
  narrative: string;
  /** All artifacts produced during execution */
  artifacts: ExecutionArtifact[];
  /** Total execution time in ms */
  totalDurationMs: number;
  /** Number of tools successfully executed */
  toolsExecuted: number;
  /** Number of tools that failed */
  toolsFailed: number;
}

export interface ExecutionCallbacks {
  onStep?: (step: ExecutionStep) => void;
  onArtifact?: (artifact: ExecutionArtifact) => void;
  onText?: (text: string) => void;
  onProgress?: (progress: CompositionProgress) => void;
}

// ── Tool Source → Executor Mapping ─────────────────────────────────────────────

/**
 * Map tool IDs to their corresponding domain types for executeDomain().
 * Tool IDs follow the pattern "source:domain-name".
 */
function toolIdToDomainType(toolId: string): string {
  // "seaas:pr-review" → "pr-review"
  // "aas:statements" → "statements"
  const parts = toolId.split(":");
  return parts[1] || parts[0];
}

// ── Executor ────────────────────────────────────────────────────────────────────

/**
 * Execute a composed agent — runs each tool in the execution plan sequentially,
 * streaming step events and collecting artifacts.
 */
export async function executeComposedAgent(
  composition: AgentComposition,
  context: ExecutionContext,
  callbacks?: ExecutionCallbacks
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const artifacts: ExecutionArtifact[] = [];
  let toolsExecuted = 0;
  let toolsFailed = 0;
  const narrativeParts: string[] = [];

  // ── Step 0: Initialize ──────────────────────────────────────────────────
  callbacks?.onStep?.({
    stepNumber: 0,
    type: "thinking",
    title: "Initializing composed agent",
    content: `Agent: ${composition.name} — ${composition.selectedTools.length} tools, ${composition.executionPlan.length} steps`,
    status: "started",
  });

  // Interpolate gathered params into the execution prompt
  let prompt = composition.executionPrompt;
  if (context.params) {
    for (const [key, value] of Object.entries(context.params)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    }
  }

  callbacks?.onStep?.({
    stepNumber: 0,
    type: "thinking",
    title: "Agent initialized",
    content: `Persona: ${composition.persona.slice(0, 100)}`,
    durationMs: Date.now() - startTime,
    status: "completed",
  });

  // ── Group tools by source for batched execution ────────────────────────
  const seaasTools = composition.selectedTools.filter((t) => t.source === "se-aas");
  const aasTools = composition.selectedTools.filter((t) => t.source === "aas");
  const brainTools = composition.selectedTools.filter((t) => t.source === "brain");
  const mcpTools = composition.selectedTools.filter((t) => t.source === "mcp");
  const rpcTools = composition.selectedTools.filter((t) => t.source === "openclaw-rpc");

  let stepNum = 1;

  // ── Execute SE-aaS domain tools ────────────────────────────────────────
  for (const tool of seaasTools) {
    const stepStart = Date.now();
    callbacks?.onStep?.({
      stepNumber: stepNum,
      type: "acting",
      title: `Running ${tool.name}...`,
      toolName: tool.id,
      status: "started",
    });

    try {
      const { executeDomain } = await import("@/lib/se-aas/domain-executor");
      const domainType = toolIdToDomainType(tool.id);

      const domainResult = await executeDomain(context.supabase, {
        domainType,
        request: {
          ...context.params,
          prompt,
          ...(context.branch ? { branch: context.branch } : {}),
        },
        organizationId: context.organizationId,
        userId: context.userId,
        anthropicApiKey: context.anthropicApiKey,
      });

      const artifact: ExecutionArtifact = {
        id: `composed-${tool.id}-${Date.now()}`,
        type: "engineering-analysis",
        title: `${tool.name} Result`,
        content: JSON.stringify(domainResult.result, null, 2),
        service: "seaas",
        domainId: domainType,
        rawData: domainResult.result,
      };
      artifacts.push(artifact);
      callbacks?.onArtifact?.(artifact);

      narrativeParts.push(`**${tool.name}**: Completed successfully (artifact: ${domainResult.artifactId})`);
      toolsExecuted++;

      callbacks?.onStep?.({
        stepNumber: stepNum,
        type: "acting",
        title: `${tool.name} — done`,
        toolName: tool.id,
        content: `Artifact saved: ${domainResult.artifactId}`,
        durationMs: Date.now() - stepStart,
        status: "completed",
      });
    } catch (err) {
      toolsFailed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      narrativeParts.push(`**${tool.name}**: Failed — ${errMsg}`);

      callbacks?.onStep?.({
        stepNumber: stepNum,
        type: "acting",
        title: `${tool.name} — failed`,
        toolName: tool.id,
        content: errMsg,
        durationMs: Date.now() - stepStart,
        status: "failed",
      });
    }
    stepNum++;
  }

  // ── Execute AAS domain tools ──────────────────────────────────────────
  for (const tool of aasTools) {
    const stepStart = Date.now();
    callbacks?.onStep?.({
      stepNumber: stepNum,
      type: "acting",
      title: `Running ${tool.name}...`,
      toolName: tool.id,
      status: "started",
    });

    try {
      const { executeAccountingAgent } = await import("@/lib/aas/domain-executor");
      const aasAction = toolIdToDomainType(tool.id);

      // Load GL data for accounting
      let glData: Array<Record<string, unknown>> = [];
      try {
        const storagePath = `${context.organizationId}/gl-data.json`;
        const { data: fileData } = await context.supabase.storage
          .from("org-data")
          .download(storagePath);
        if (fileData) {
          const text = await fileData.text();
          glData = JSON.parse(text);
        }
      } catch {
        // No GL data available
      }

      const aasResult = await executeAccountingAgent(context.supabase, {
        action: aasAction as any,
        organizationId: context.organizationId,
        userId: context.userId,
        transactions: glData,
        jurisdiction: "SG",
      });

      const artifact: ExecutionArtifact = {
        id: `composed-${tool.id}-${Date.now()}`,
        type: "financial-statement",
        title: `${tool.name} Result`,
        content: JSON.stringify(aasResult.result, null, 2),
        service: "aas",
        domainId: `aas-${aasAction}`,
        rawData: aasResult.result,
      };
      artifacts.push(artifact);
      callbacks?.onArtifact?.(artifact);

      narrativeParts.push(`**${tool.name}**: Completed successfully`);
      toolsExecuted++;

      callbacks?.onStep?.({
        stepNumber: stepNum,
        type: "acting",
        title: `${tool.name} — done`,
        toolName: tool.id,
        durationMs: Date.now() - stepStart,
        status: "completed",
      });
    } catch (err) {
      toolsFailed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      narrativeParts.push(`**${tool.name}**: Failed — ${errMsg}`);

      callbacks?.onStep?.({
        stepNumber: stepNum,
        type: "acting",
        title: `${tool.name} — failed`,
        toolName: tool.id,
        content: errMsg,
        durationMs: Date.now() - stepStart,
        status: "failed",
      });
    }
    stepNum++;
  }

  // ── Execute Brain tools ───────────────────────────────────────────────
  for (const tool of brainTools) {
    const stepStart = Date.now();
    callbacks?.onStep?.({
      stepNumber: stepNum,
      type: "querying",
      title: `Querying ${tool.name}...`,
      toolName: tool.id,
      status: "started",
    });

    try {
      const { createBrainContextMesh } = await import("@nexus-ai/memory-stack");
      const mesh = createBrainContextMesh({
        supabase: context.supabase,
        organizationId: context.organizationId,
        branch: context.branch,
      });

      const brainType = toolIdToDomainType(tool.id);
      const brainContext = await mesh.assemble(
        `${brainType}: ${prompt}`,
        "brain",
      );

      // Extract relevant brain data based on tool type
      let brainResult: Record<string, unknown>;
      switch (brainType) {
        case "query":
          brainResult = {
            causalEdges: brainContext.causalEdges?.slice(0, 10),
            patterns: brainContext.patterns?.slice(0, 5),
            summary: brainContext.fullPrompt?.slice(0, 500),
          };
          break;
        case "causal":
          brainResult = {
            causalEdges: brainContext.causalEdges,
            crossDomainInsights: brainContext.crossDomainInsights,
          };
          break;
        case "anomaly":
          brainResult = {
            anomalies: brainContext.patterns?.filter(
              (p: any) => p.type === "anomaly" || p.importance > 0.8
            ),
          };
          break;
        case "predict":
          brainResult = {
            predictions: brainContext.predictions,
            causalEdges: brainContext.causalEdges?.slice(0, 5),
          };
          break;
        case "what-if":
          brainResult = {
            cascadeEffects: brainContext.cascadeRules,
            causalEdges: brainContext.causalEdges,
          };
          break;
        default:
          brainResult = { context: brainContext.fullPrompt?.slice(0, 1000) };
      }

      const artifact: ExecutionArtifact = {
        id: `composed-${tool.id}-${Date.now()}`,
        type: "analysis",
        title: `${tool.name} — Brain Intelligence`,
        content: JSON.stringify(brainResult, null, 2),
        service: "core",
        rawData: brainResult,
      };
      artifacts.push(artifact);
      callbacks?.onArtifact?.(artifact);

      narrativeParts.push(`**${tool.name}**: Retrieved ${Object.keys(brainResult).length} brain regions`);
      toolsExecuted++;

      callbacks?.onStep?.({
        stepNumber: stepNum,
        type: "querying",
        title: `${tool.name} — done`,
        toolName: tool.id,
        durationMs: Date.now() - stepStart,
        status: "completed",
      });
    } catch (err) {
      toolsFailed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      narrativeParts.push(`**${tool.name}**: Failed — ${errMsg}`);

      callbacks?.onStep?.({
        stepNumber: stepNum,
        type: "querying",
        title: `${tool.name} — failed`,
        toolName: tool.id,
        content: errMsg,
        durationMs: Date.now() - stepStart,
        status: "failed",
      });
    }
    stepNum++;
  }

  // ── Execute MCP / OpenClaw RPC tools (gateway-dependent) ──────────────
  const gatewayTools = [...mcpTools, ...rpcTools];
  for (const tool of gatewayTools) {
    const stepStart = Date.now();
    callbacks?.onStep?.({
      stepNumber: stepNum,
      type: "acting",
      title: `Invoking ${tool.name} via gateway...`,
      toolName: tool.id,
      status: "started",
    });

    try {
      const { gatewayManager } = await import("@/lib/openclaw/gateway-client");
      const conn = gatewayManager.getConnection(context.organizationId);

      if (!conn || !conn.isConnected()) {
        throw new Error("OpenClaw gateway not connected");
      }

      const toolMethod = toolIdToDomainType(tool.id);

      // Execute via gateway RPC
      const rpcResult = await conn.rpc(toolMethod, {
        prompt,
        ...context.params,
      });

      const artifact: ExecutionArtifact = {
        id: `composed-${tool.id}-${Date.now()}`,
        type: "analysis",
        title: `${tool.name} — Gateway Result`,
        content: typeof rpcResult === "string" ? rpcResult : JSON.stringify(rpcResult, null, 2),
        service: "core",
        rawData: rpcResult,
      };
      artifacts.push(artifact);
      callbacks?.onArtifact?.(artifact);

      narrativeParts.push(`**${tool.name}**: Executed via gateway`);
      toolsExecuted++;

      callbacks?.onStep?.({
        stepNumber: stepNum,
        type: "acting",
        title: `${tool.name} — done`,
        toolName: tool.id,
        durationMs: Date.now() - stepStart,
        status: "completed",
      });
    } catch (err) {
      toolsFailed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      narrativeParts.push(`**${tool.name}**: Failed — ${errMsg}`);

      callbacks?.onStep?.({
        stepNumber: stepNum,
        type: "acting",
        title: `${tool.name} — failed`,
        toolName: tool.id,
        content: errMsg,
        durationMs: Date.now() - stepStart,
        status: "failed",
      });
    }
    stepNum++;
  }

  // ── Final: Synthesize narrative ───────────────────────────────────────
  callbacks?.onStep?.({
    stepNumber: stepNum,
    type: "reflecting",
    title: "Synthesizing results...",
    status: "started",
  });

  const totalDurationMs = Date.now() - startTime;

  // Build final narrative
  const narrative = [
    `## ${composition.name} — Execution Complete`,
    "",
    `**Persona:** ${composition.persona}`,
    "",
    `### Execution Summary`,
    `- **Tools executed:** ${toolsExecuted}/${composition.selectedTools.length}`,
    `- **Failed:** ${toolsFailed}`,
    `- **Artifacts produced:** ${artifacts.length}`,
    `- **Duration:** ${(totalDurationMs / 1000).toFixed(1)}s`,
    "",
    `### Results`,
    ...narrativeParts.map((p) => `- ${p}`),
    "",
    `### Execution Plan`,
    ...composition.executionPlan.map((step, i) => `${i + 1}. ${step}`),
  ].join("\n");

  callbacks?.onText?.(narrative);

  callbacks?.onStep?.({
    stepNumber: stepNum,
    type: "reflecting",
    title: "Execution complete",
    content: `${toolsExecuted} tools, ${artifacts.length} artifacts, ${(totalDurationMs / 1000).toFixed(1)}s`,
    durationMs: totalDurationMs,
    status: "completed",
  });

  return {
    narrative,
    artifacts,
    totalDurationMs,
    toolsExecuted,
    toolsFailed,
  };
}
