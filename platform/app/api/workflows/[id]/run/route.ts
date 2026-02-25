export const dynamic = "force-dynamic";
/**
 * Workflow Run API — Execute a workflow
 * ======================================
 *
 * POST /api/workflows/[id]/run
 *   Triggers workflow execution. Creates a workflow_run and
 *   executes steps sequentially/in-parallel via the engine.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { executeWorkflow } from "@/lib/workflows/engine";
import { logger } from "@/lib/logger";

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id: workflowId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    // Load workflow
    const { data: workflow, error } = await service
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("organization_id", workspaceId)
      .single();

    if (error || !workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));

    // Execute (this can take a while)
    const result = await executeWorkflow(service, {
      workflow,
      organizationId: workspaceId,
      userId: user.id,
      inputPayload: body.input || null,
      conversationId: body.conversationId || null,
    });

    return NextResponse.json({
      success: result.status === "completed",
      runId: result.runId,
      status: result.status,
      completedSteps: result.completedSteps,
      failedSteps: result.failedSteps,
      durationMs: result.durationMs,
    });
  } catch (error: any) {
    logger.error("[WorkflowRun] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
