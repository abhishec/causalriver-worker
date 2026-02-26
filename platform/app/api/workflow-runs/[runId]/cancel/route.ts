export const dynamic = "force-dynamic";
/**
 * Workflow Run Cancel API — Cancel running/paused workflow
 * =========================================================
 *
 * POST /api/workflow-runs/[runId]/cancel
 *
 * Cancels a workflow run that is currently running or paused.
 * Marks all pending steps as skipped and the run as cancelled.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

interface Props {
  params: Promise<{ runId: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  try {
    const { runId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    // Fetch the run
    const { data: run, error: runError } = await supabase
      .from("workflow_runs")
      .select("id, status, workflow_id, organization_id")
      .eq("id", runId)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (runError || !run) {
      return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });
    }

    if (!["running", "paused", "pending"].includes(run.status)) {
      return NextResponse.json(
        { error: `Run is ${run.status}. Only running, paused, or pending runs can be cancelled.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Cancel all pending/running steps
    await service
      .from("workflow_run_steps")
      .update({
        status: "skipped",
        completed_at: now,
      })
      .eq("workflow_run_id", runId)
      .in("status", ["pending", "running"]);

    // Also cancel any associated brain_agent_tasks that are running/pending
    const { data: runningSteps } = await supabase
      .from("workflow_run_steps")
      .select("brain_task_id")
      .eq("workflow_run_id", runId)
      .not("brain_task_id", "is", null);

    if (runningSteps && runningSteps.length > 0) {
      const taskIds = runningSteps
        .map(s => s.brain_task_id)
        .filter(Boolean) as string[];

      if (taskIds.length > 0) {
        await service
          .from("brain_agent_tasks")
          .update({
            status: "failed",
            error_message: "Cancelled: parent workflow was cancelled",
            completed_at: now,
            updated_at: now,
          })
          .in("id", taskIds)
          .in("status", ["pending", "running", "awaiting_approval"]);
      }
    }

    // Mark the run as cancelled
    const { error: updateError } = await service
      .from("workflow_runs")
      .update({
        status: "cancelled",
        completed_at: now,
        error_message: `Cancelled by user ${user.id}`,
      })
      .eq("id", runId);

    if (updateError) {
      logger.error("[WorkflowCancel] Update error:", updateError.message);
      return NextResponse.json({ error: "Failed to cancel workflow run" }, { status: 500 });
    }

    // Emit cancellation signal for RL learning
    try {
      const _cancelNow = new Date().toISOString();
      await service.from("cross_domain_signals").insert({
        organization_id: run.organization_id,
        source_domain: "brain.workflows",
        signal_type: "workflow_cancelled",
        signal_value: -0.3,
        entity_type: "workflow_run",
        entity_id: runId,
        signal_metadata: {
          workflowId: run.workflow_id,
          cancelledBy: user.id,
          previousStatus: run.status,
        },
        // signal_timestamp required for rl-status hourly/daily/weekly window queries
        signal_timestamp: _cancelNow,
        created_at: _cancelNow,
      });
    } catch {
      // Non-critical — don't fail the cancellation
    }

    return NextResponse.json({
      success: true,
      status: "cancelled",
      runId,
    });
  } catch (error: any) {
    logger.error("[WorkflowCancel] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
