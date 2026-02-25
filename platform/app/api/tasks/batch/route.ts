/**
 * Batch Task Operations API
 * ==========================
 *
 * POST /api/tasks/batch
 *   Approve or reject multiple tasks at once.
 *   Body: {
 *     action: "approve" | "reject",
 *     taskIds: string[],
 *     note?: string  // rejection note (optional, for reject only)
 *   }
 *
 * Returns: { results: { taskId, success, error? }[] }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, taskIds, note } = body as {
      action?: "approve" | "reject";
      taskIds?: string[];
      note?: string;
    };

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: "taskIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (taskIds.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 tasks per batch operation" },
        { status: 400 }
      );
    }

    const service = await createServiceClient();
    const results: { taskId: string; success: boolean; error?: string }[] = [];

    // Fetch all tasks in one query
    const { data: tasks } = await service
      .from("brain_agent_tasks")
      .select("id, status, organization_id, agent_type, confidence_score, auto_execute_threshold, result_metadata")
      .in("id", taskIds);

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ error: "No tasks found" }, { status: 404 });
    }

    // Verify user access: check membership for all unique orgs
    const orgIds = [...new Set(tasks.map(t => t.organization_id))];
    const { data: memberships } = await supabase
      .from("org_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .in("organization_id", orgIds);

    const authorizedOrgs = new Set(memberships?.map(m => m.organization_id) || []);
    const membershipMap = new Map(memberships?.map(m => [m.organization_id, m.role]) || []);

    const newStatus = action === "approve" ? "completed" : "rejected";
    const signalType = action === "approve" ? "task_approved" : "task_rejected";
    const now = new Date().toISOString();

    // Process each task
    const signalInserts: Record<string, unknown>[] = [];

    for (const task of tasks) {
      const taskResult: { taskId: string; success: boolean; error?: string } = {
        taskId: task.id,
        success: false,
      };

      // Check authorization
      if (!authorizedOrgs.has(task.organization_id)) {
        taskResult.error = "Not authorized for this organization";
        results.push(taskResult);
        continue;
      }

      // Check status
      if (task.status !== "awaiting_approval") {
        taskResult.error = `Task is ${task.status}, not awaiting approval`;
        results.push(taskResult);
        continue;
      }

      // Update task
      const { error: updateError } = await service
        .from("brain_agent_tasks")
        .update({
          status: newStatus,
          completed_at: now,
          updated_at: now,
        })
        .eq("id", task.id);

      if (updateError) {
        taskResult.error = updateError.message;
        results.push(taskResult);
        continue;
      }

      taskResult.success = true;
      results.push(taskResult);

      // Prepare RL signal
      const confidenceDelta = task.confidence_score && task.auto_execute_threshold
        ? task.auto_execute_threshold - task.confidence_score
        : null;

      signalInserts.push({
        organization_id: task.organization_id,
        source_domain: "brain.agents",
        signal_type: signalType,
        signal_value: action === "approve"
          ? (task.confidence_score || 1)
          : -(task.confidence_score || 0.5),
        entity_type: "brain_agent_task",
        entity_id: task.id,
        signal_metadata: {
          [`${action}dBy`]: user.id,
          role: membershipMap.get(task.organization_id) || "member",
          agentType: task.agent_type,
          confidenceScore: task.confidence_score,
          autoExecuteThreshold: task.auto_execute_threshold,
          confidenceDelta,
          batchOperation: true,
          batchSize: taskIds.length,
          ...(action === "reject" && note ? { rejectionNote: note.slice(0, 500) } : {}),
          closedLoopTrackingId: task.result_metadata?.closedLoopTrackingId || null,
        },
      });
    }

    // Batch insert RL signals
    if (signalInserts.length > 0) {
      try {
        await service.from("cross_domain_signals").insert(signalInserts);
      } catch (err) {
        logger.warn("[BatchTasks] Failed to insert RL signals:", err);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      action,
      total: taskIds.length,
      succeeded: successCount,
      failed: failCount,
      results,
    });
  } catch (error: unknown) {
    logger.error("[BatchTasks] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
