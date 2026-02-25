/**
 * Agent Composer API Route — Compose & Execute agents from natural language
 * ==========================================================================
 *
 * POST /api/agent-composer
 *
 * Two modes:
 *   1. Compose-only: { description } → streams composition progress, returns AgentComposition
 *   2. Compose+Execute: { description, execute: true, params? } → compose then execute with SSE
 *
 * SSE Events:
 *   - compositionStep: { phase, title, detail }  — composition progress
 *   - compositionResult: AgentComposition         — composition complete
 *   - agentStep: ExecutionStep                    — execution progress
 *   - progressiveArtifact: ExecutionArtifact      — artifact produced
 *   - text: string                                — narrative text
 *   - error: string                               — error message
 *   - [DONE]                                      — stream end
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── SSE Stream Helper (mirrors copilot chat pattern) ────────────────────────

function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const send = (data: string) => {
    try {
      controller?.enqueue(encoder.encode(`data: ${data}\n\n`));
    } catch {
      // Stream may be closed
    }
  };

  const sendJSON = (obj: Record<string, unknown>) => {
    send(JSON.stringify(obj));
  };

  const close = () => {
    send("[DONE]");
    try {
      controller?.close();
    } catch {
      // Already closed
    }
  };

  return { stream, send, sendJSON, close };
}

// ── Main Route Handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Parse body ──────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const {
      description,
      execute,
      params,
      organizationId,
    } = body as {
      description: string;
      execute?: boolean;
      params?: Record<string, unknown>;
      organizationId?: string;
    };

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    // ── Auth ────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Org check ───────────────────────────────────────────────────────
    const orgId = organizationId || process.env.CORE_ORG_ID;
    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    // Verify org membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // ── Anthropic API Key ───────────────────────────────────────────────
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    // ── Check if OpenClaw gateway is connected ──────────────────────────
    let hasOpenClawGateway = false;
    try {
      const { gatewayManager } = await import("@/lib/openclaw/gateway-client");
      const conn = gatewayManager.getConnection(orgId);
      hasOpenClawGateway = !!(conn && conn.isConnected());
    } catch {
      // OpenClaw not available
    }

    // ── SSE Stream ──────────────────────────────────────────────────────
    const { stream, sendJSON, close } = createSSEStream();

    // Fire-and-stream: run async while SSE pushes events
    (async () => {
      try {
        // ── Phase 1: Compose the agent ────────────────────────────────
        const { composeAgent } = await import("@/lib/agent-composer/composer");

        const composition = await composeAgent(
          description,
          anthropicApiKey,
          hasOpenClawGateway,
          (progress) => {
            sendJSON({ compositionStep: progress });
          }
        );

        // Send the full composition result
        sendJSON({
          compositionResult: {
            name: composition.name,
            persona: composition.persona,
            selectedTools: composition.selectedTools,
            inferredGathering: composition.inferredGathering,
            executionPrompt: composition.executionPrompt,
            executionPlan: composition.executionPlan,
            complexity: composition.complexity,
          },
        });

        // ── Phase 2: Execute (if requested) ───────────────────────────
        if (execute) {
          const { executeComposedAgent } = await import("@/lib/agent-composer/executor");
          const service = await createServiceClient();

          const result = await executeComposedAgent(
            composition,
            {
              organizationId: orgId,
              userId: user.id,
              supabase: service,
              anthropicApiKey,
              params: params as Record<string, unknown> | undefined,
            },
            {
              onStep: (step) => {
                sendJSON({ agentStep: step });
              },
              onArtifact: (artifact) => {
                sendJSON({
                  progressiveArtifact: {
                    id: artifact.id,
                    type: artifact.type,
                    title: artifact.title,
                    content: artifact.content,
                    isPartial: false,
                    service: artifact.service,
                  },
                });
              },
              onText: (text) => {
                sendJSON({ text });
              },
            }
          );

          // Send execution summary
          sendJSON({
            executionResult: {
              narrative: result.narrative,
              totalDurationMs: result.totalDurationMs,
              toolsExecuted: result.toolsExecuted,
              toolsFailed: result.toolsFailed,
              artifactCount: result.artifacts.length,
            },
          });

          // Emit final agent-execution artifact
          sendJSON({
            agentExecutionArtifact: {
              id: `composer-${Date.now()}`,
              type: "agent-execution",
              title: `${composition.name} — Execution`,
              service: "agent",
              rawData: {
                composition: {
                  name: composition.name,
                  persona: composition.persona,
                  tools: composition.selectedTools.map((t) => t.name),
                  plan: composition.executionPlan,
                  complexity: composition.complexity,
                },
                result: {
                  narrative: result.narrative,
                  totalDurationMs: result.totalDurationMs,
                  toolsExecuted: result.toolsExecuted,
                  toolsFailed: result.toolsFailed,
                  artifactCount: result.artifacts.length,
                },
              },
            },
          });
        }
      } catch (err) {
        sendJSON({ error: "Composition failed" });
      } finally {
        close();
      }
    })();

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    logger.error("[AgentComposer] Route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
