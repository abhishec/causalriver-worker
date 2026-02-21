/**
 * Brain Agent Tasks API — Poll, Approve, Reject, Rate
 * =====================================================
 *
 * GET /api/agents/tasks
 *   List tasks (with optional filters). Poll for status updates.
 *   Query params:
 *     - organizationId (required)
 *     - taskId (optional — get single task with steps)
 *     - status (optional — filter by status)
 *     - limit (optional — default 20)
 *
 * PATCH /api/agents/tasks
 *   Approve, reject, or rate a task.
 *   Body: {
 *     taskId: string,
 *     action: 'approve' | 'reject' | 'rate',
 *     note?: string,        // for approve/reject
 *     rating?: string,      // for rate: 'helpful' | 'not_helpful' | 'incorrect'
 *     correction?: string,  // for rate: user correction text
 *   }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================================
// GET — Poll agent tasks
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const organizationId = params.get("organizationId");
    const taskId = params.get("taskId");
    const status = params.get("status");
    const includeSteps = params.get("includeSteps") === "true";
    const limit = Math.min(parseInt(params.get("limit") || "20"), 50);

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId required" },
        { status: 400 }
      );
    }

    // Verify membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 }
      );
    }

    const service = await createServiceClient();

    // ── Single task with steps ───────────────────────────────────
    if (taskId) {
      const [{ data: task }, { data: steps }] = await Promise.all([
        service
          .from("brain_agent_tasks")
          .select("*")
          .eq("id", taskId)
          .eq("organization_id", organizationId)
          .single(),
        service
          .from("brain_agent_steps")
          .select("*")
          .eq("task_id", taskId)
          .order("step_number", { ascending: true }),
      ]);

      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        task,
        steps: steps || [],
      });
    }

    // ── List tasks ───────────────────────────────────────────────
    let query = service
      .from("brain_agent_tasks")
      .select(
        "id, prompt, agent_type, status, confidence_score, result_summary, result_artifacts, user_rating, error_message, created_at, completed_at, started_at, result_metadata, proposed_action"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tasks, error: listError } = await query;

    if (listError) {
      return NextResponse.json(
        { error: listError.message },
        { status: 500 }
      );
    }

    // Count tasks needing attention
    const { count: awaitingCount } = await service
      .from("brain_agent_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "awaiting_approval");

    const { count: runningCount } = await service
      .from("brain_agent_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "running");

    // If includeSteps is requested, load steps for each task
    let tasksWithSteps = tasks || [];
    if (includeSteps && tasksWithSteps.length > 0) {
      const taskIds = tasksWithSteps.map((t: any) => t.id);
      const { data: allSteps } = await service
        .from("brain_agent_steps")
        .select("*")
        .in("task_id", taskIds)
        .order("step_number", { ascending: true });

      const stepsByTask = new Map<string, any[]>();
      for (const step of allSteps || []) {
        const existing = stepsByTask.get(step.task_id) || [];
        existing.push(step);
        stepsByTask.set(step.task_id, existing);
      }

      tasksWithSteps = tasksWithSteps.map((t: any) => ({
        ...t,
        steps: stepsByTask.get(t.id) || [],
      }));
    }

    return NextResponse.json({
      success: true,
      tasks: tasksWithSteps,
      counts: {
        awaiting: awaitingCount || 0,
        running: runningCount || 0,
        total: tasksWithSteps.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// PATCH — Approve, Reject, or Rate a task
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, action, note, rating, correction } = body;

    if (!taskId || !action) {
      return NextResponse.json(
        { error: "taskId and action required" },
        { status: 400 }
      );
    }

    if (!["approve", "reject", "rate"].includes(action)) {
      return NextResponse.json(
        { error: "action must be: approve, reject, or rate" },
        { status: 400 }
      );
    }

    const service = await createServiceClient();

    // Get user's org memberships first (before loading task data)
    const { data: memberships } = await supabase
      .from("org_members")
      .select("organization_id, role")
      .eq("user_id", user.id);

    const memberOrgIds = (memberships || []).map((m) => m.organization_id);

    if (memberOrgIds.length === 0) {
      return NextResponse.json(
        { error: "Not a member of any organization" },
        { status: 403 }
      );
    }

    // Load the task — filter by org_id to prevent cross-tenant data access
    const { data: task } = await service
      .from("brain_agent_tasks")
      .select("id, organization_id, status, prompt, result_artifacts, confidence_score")
      .eq("id", taskId)
      .in("organization_id", memberOrgIds)
      .single();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // ── APPROVE ──────────────────────────────────────────────────
    if (action === "approve") {
      if (task.status !== "awaiting_approval") {
        return NextResponse.json(
          { error: "Task is not awaiting approval" },
          { status: 400 }
        );
      }

      await service
        .from("brain_agent_tasks")
        .update({
          status: "completed",
          approval_note: note || null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);

      // Emit approval signal for brain learning
      await service.from("cross_domain_signals").insert({
        organization_id: task.organization_id,
        source_domain: "brain.agents",
        signal_type: "agent_task_approved",
        signal_value: task.confidence_score || 0.5,
        entity_type: "brain_agent_task",
        entity_id: taskId,
        signal_metadata: {
          prompt: task.prompt?.slice(0, 200),
          userId: user.id,
          hasNote: !!note,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Task approved and completed",
      });
    }

    // ── REJECT ───────────────────────────────────────────────────
    if (action === "reject") {
      if (task.status !== "awaiting_approval") {
        return NextResponse.json(
          { error: "Task is not awaiting approval" },
          { status: 400 }
        );
      }

      await service
        .from("brain_agent_tasks")
        .update({
          status: "rejected",
          approval_note: note || null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);

      // Emit rejection signal — Brain learns what NOT to do
      await service.from("cross_domain_signals").insert({
        organization_id: task.organization_id,
        source_domain: "brain.agents",
        signal_type: "agent_task_rejected",
        signal_value: -1,
        entity_type: "brain_agent_task",
        entity_id: taskId,
        signal_metadata: {
          prompt: task.prompt?.slice(0, 200),
          userId: user.id,
          rejectionNote: note || null,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Task rejected",
      });
    }

    // ── RATE (feedback for reinforcement learning) ───────────────
    if (action === "rate") {
      if (!["helpful", "not_helpful", "incorrect"].includes(rating)) {
        return NextResponse.json(
          { error: "rating must be: helpful, not_helpful, or incorrect" },
          { status: 400 }
        );
      }

      await service
        .from("brain_agent_tasks")
        .update({
          user_rating: rating,
          user_correction: correction || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);

      // If correction provided, learn from it (same as copilot feedback)
      if (correction && rating === "incorrect") {
        await service.from("ai_memory").insert({
          organization_id: task.organization_id,
          content: correction,
          memory_type: "correction",
          cognitive_layer: "L4",
          domain: "agent",
          importance: 0.95, // Agent corrections are very high priority
          metadata: {
            source: "agent_feedback",
            taskId,
            prompt: task.prompt?.slice(0, 200),
            learnedAt: new Date().toISOString(),
            feedbackType: "agent_correction",
          },
        });
      }

      // Emit feedback signal
      await service.from("cross_domain_signals").insert({
        organization_id: task.organization_id,
        source_domain: "brain.agents",
        signal_type: `agent_feedback_${rating}`,
        signal_value: rating === "helpful" ? 1 : rating === "not_helpful" ? 0 : -1,
        entity_type: "brain_agent_task",
        entity_id: taskId,
        signal_metadata: {
          prompt: task.prompt?.slice(0, 200),
          userId: user.id,
          hasCorrection: !!correction,
          confidence: task.confidence_score,
        },
      });

      // Mark feedback as processed
      await service
        .from("brain_agent_tasks")
        .update({ feedback_processed: true })
        .eq("id", taskId);

      return NextResponse.json({
        success: true,
        message:
          rating === "incorrect" && correction
            ? "Correction saved — the Brain will learn from this"
            : "Feedback recorded — the Brain is listening",
        learningImpact: rating === "incorrect" ? "high" : rating === "helpful" ? "medium" : "low",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
