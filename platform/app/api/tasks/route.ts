export const dynamic = "force-dynamic";
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

/**
 * Resolve workspace ID — prefers query param, falls back to
 * getCurrentWorkspaceId(), then uses service client as last resort
 * (avoids RLS recursion on org_members in user client).
 */
async function resolveWorkspaceId(
  request: NextRequest,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const fromParam = request.nextUrl.searchParams.get("organizationId");
  if (fromParam) {
    // Security: verify user is a member of the requested org (prevents IDOR)
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("organization_id", fromParam)
      .maybeSingle();
    if (membership) return fromParam;
    // Fall through to cookie-based resolution if not a member
  }

  try {
    return await getCurrentWorkspaceId();
  } catch {
    // getCurrentWorkspaceId may fail due to RLS recursion on org_members.
    // Fall back to service client lookup.
    try {
      const service = await createServiceClient();
      const { data } = await service
        .from("org_members")
        .select("organization_id")
        .eq("user_id", userId)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data?.organization_id ?? null;
    } catch {
      return null;
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await resolveWorkspaceId(request, user.id, supabase);
    if (!workspaceId) {
      return NextResponse.json({ tasks: [] });
    }

    const status = request.nextUrl.searchParams.get("status");
    const agentType = request.nextUrl.searchParams.get("agentType");
    const limit = Math.min(Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 50), 200);

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
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
