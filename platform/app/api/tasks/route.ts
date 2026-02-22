/**
 * Task Queue API — List tasks with filters
 * ==========================================
 *
 * GET /api/tasks?status=running&limit=50&agentType=code-review
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = request.nextUrl.searchParams.get("organizationId") || await getCurrentWorkspaceId();
    const status = request.nextUrl.searchParams.get("status");
    const agentType = request.nextUrl.searchParams.get("agentType");
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 200);

    const service = await createServiceClient();

    let query = service
      .from("brain_agent_tasks")
      .select("id, prompt, agent_type, status, confidence_score, result_summary, result_artifacts, error_message, created_at, completed_at, started_at, result_metadata, proposed_action")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      // Support comma-separated status values: ?status=running,awaiting_approval
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        query = query.eq("status", statuses[0]);
      } else if (statuses.length > 1) {
        query = query.in("status", statuses);
      }
    }
    if (agentType) query = query.eq("agent_type", agentType);

    const { data: tasks, error } = await query;

    if (error) {
      logger.error("[TaskQueue] Query error:", error.message);
      return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }

    return NextResponse.json({ tasks: tasks || [] });
  } catch (error: any) {
    logger.error("[TaskQueue] Error:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
