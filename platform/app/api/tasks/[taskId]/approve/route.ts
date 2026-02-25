export const dynamic = "force-dynamic";
/**
 * Task Approval API
 * POST /api/tasks/[taskId]/approve
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

interface Props {
  params: Promise<{ taskId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { taskId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = await createServiceClient();

    // Verify task exists and is awaiting approval — fetch extended fields for RL signal
    const { data: task } = await service
      .from("brain_agent_tasks")
      .select("id, status, organization_id, agent_type, confidence_score, prompt, auto_execute_threshold, result_metadata")
      .eq("id", taskId)
      .maybeSingle();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status !== "awaiting_approval") {
      return NextResponse.json({ error: `Task is ${task.status}, not awaiting approval` }, { status: 400 });
    }

    // Verify user has access
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", task.organization_id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Approve
    await service
      .from("brain_agent_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    // Emit enriched RL signal with confidence context for closed-loop learning
    const confidenceDelta = task.confidence_score && task.auto_execute_threshold
      ? task.auto_execute_threshold - task.confidence_score
      : null;

    await service.from("cross_domain_signals").insert({
      organization_id: task.organization_id,
      source_domain: "brain.agents",
      signal_type: "task_approved",
      signal_value: task.confidence_score || 1,
      signal_timestamp: new Date().toISOString(),
      entity_type: "brain_agent_task",
      entity_id: taskId,
      signal_metadata: {
        approvedBy: user.id,
        approverRole: membership.role,
        agentType: task.agent_type,
        confidenceScore: task.confidence_score,
        autoExecuteThreshold: task.auto_execute_threshold,
        confidenceDelta,
        prompt: task.prompt?.slice(0, 200),
        closedLoopTrackingId: task.result_metadata?.closedLoopTrackingId || null,
        brainLayersUsed: task.result_metadata?.brainLayersUsed ? Object.keys(task.result_metadata.brainLayersUsed) : null,
        topLayerContributions: task.result_metadata?.topLayerContributions || null,
      },
    });

    return NextResponse.json({ success: true, status: "completed" });
  } catch (error: any) {
    logger.error("[TaskApprove] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
