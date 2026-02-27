/**
 * Brain Agent Run API — Full L1-L30 Cognitive Stack Execution
 * ============================================================
 *
 * POST /api/agents/run
 *   Spawn a brain agent that runs the FULL 30-layer cognitive stack.
 *   Delegates to the shared executeAgent() in lib/agents/execute.ts.
 *
 *   Body: {
 *     prompt: string,
 *     agentType?: string,
 *     autoExecuteThreshold?: number,
 *     organizationId?: string,
 *     priority?: string,
 *     source?: string,
 *     conversationId?: string,
 *   }
 *
 *   Returns: { taskId, status }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkSessionRateLimit } from "@/lib/security-middleware";
import { logger } from "@/lib/logger";
import { executeAgent } from "@/lib/agents/execute";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // ── Auth: 500→401 Lambda pattern (two isolated try/catch blocks) ──────────
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user: { id: string } | null = null;
  try {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = data.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {

    // ── Rate limiting: 10 req/min per user (full cognitive stack is expensive) ─
    const rateLimit = await checkSessionRateLimit(user.id, "/api/agents/run");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Agent execution is limited to 10 per minute." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      prompt,
      agentType = "general",
      autoExecuteThreshold = 0.8,
      organizationId,
      priority = "medium",
      source = "copilot",
      conversationId,
    } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "prompt is required (min 3 characters)" },
        { status: 400 }
      );
    }

    // ── Resolve org ──────────────────────────────────────────────
    let workspaceId = organizationId;
    if (!workspaceId) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      workspaceId = membership?.organization_id ?? null;
    }

    // Verify membership
    const { data: memberCheck } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // ── Execute via shared module ─────────────────────────────────
    const service = await createServiceClient();

    // Timeout guard: Amplify/Vercel Lambda max is 30s (maxDuration=120 for paid plans).
    // Guard at 25s to leave headroom for response serialization.
    const AGENT_TIMEOUT_MS = 25_000;
    const result = await Promise.race([
      executeAgent(service, {
        prompt: prompt.trim(),
        agentType,
        organizationId: workspaceId,
        userId: user.id,
        autoExecuteThreshold,
        priority,
        source: source as any,
        conversationId,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Agent execution timed out after 25s")), AGENT_TIMEOUT_MS)
      ),
    ]);

    return NextResponse.json({
      success: result.status !== "failed",
      taskId: result.taskId,
      status: result.status,
      message: "Agent task finished. GET /api/agents/tasks?taskId=" + result.taskId,
    });
  } catch (error: unknown) {
    logger.error("[AgentRun] Error:", { error: (error as Error)?.message ?? String(error), route: "/api/agents/run" });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
