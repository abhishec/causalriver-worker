/**
 * Workflow Run Resume API — Resume paused workflow
 * ==================================================
 *
 * POST /api/workflow-runs/[runId]/resume
 *
 * When a workflow pauses at a step (e.g., awaiting approval),
 * this endpoint resumes execution from the paused step.
 * Already-completed steps are skipped via the engine's resumeRunId support.
 * Typically called after a task is approved in the Task Queue.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { executeWorkflow } from "@/lib/workflows/engine";
import { logger } from "@/lib/logger";

interface Props {
  params: Promise<{ runId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { runId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 401 });
    const service = await createServiceClient();

    // Fetch the paused run
    const { data: run, error: runError } = await supabase
      .from("workflow_runs")
      .select("*")
      .eq("id", runId)
      .eq("organization_id", workspaceId)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });
    }

    if (run.status !== "paused") {
      return NextResponse.json(
        { error: `Run is ${run.status}, not paused. Only paused runs can be resumed.` },
        { status: 400 }
      );
    }

    // Fetch the workflow definition (org-scoped to prevent cross-org access)
    const { data: workflow } = await service
      .from("workflows")
      .select("*")
      .eq("id", run.workflow_id)
      .eq("organization_id", workspaceId)
      .single();

    if (!workflow) {
      return NextResponse.json({ error: "Workflow definition not found" }, { status: 404 });
    }

    // Resume workflow — the engine uses resumeRunId to skip completed steps
    const result = await executeWorkflow(service, {
      workflow,
      organizationId: workspaceId,
      userId: user.id,
      inputPayload: run.input_payload || undefined,
      conversationId: run.conversation_id || undefined,
      resumeRunId: runId,
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
    logger.error("[WorkflowResume] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
