export const dynamic = "force-dynamic";
/**
 * GET /api/connectors/writeback/queue
 *
 * Read-only view of recent write-back executions from `writeback_queue`
 * for the current org.
 *
 * Query params:
 *   ?status=pending|completed|failed   (optional filter)
 *   ?limit=20                          (default 20, max 100)
 *
 * Response: {
 *   items: WritebackQueueItem[],
 *   stats: { pending: number, completed: number, failed: number }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WritebackQueueItem {
  id: string;
  organization_id: string;
  rule_id: string | null;
  status: "pending" | "completed" | "failed";
  connector_type: string;
  action_type: string;
  external_ref: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface WritebackQueueStats {
  pending: number;
  completed: number;
  failed: number;
}

const VALID_STATUSES = ["pending", "completed", "failed"] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// GET /api/connectors/writeback/queue
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        {
          items: [],
          stats: { pending: 0, completed: 0, failed: 0 },
        },
        { status: 200 }
      );
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;

    const statusParam = searchParams.get("status");
    const status =
      statusParam && VALID_STATUSES.includes(statusParam as (typeof VALID_STATUSES)[number])
        ? (statusParam as (typeof VALID_STATUSES)[number])
        : null;

    const limitParam = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit = isNaN(limitParam) || limitParam < 1
      ? DEFAULT_LIMIT
      : Math.min(limitParam, MAX_LIMIT);

    // ---------------------------------------------------------------------------
    // Fetch filtered items
    // ---------------------------------------------------------------------------

    let itemsQuery = supabase
      .from("writeback_queue")
      .select(
        "id, organization_id, rule_id, status, connector_type, action_type, external_ref, created_at, completed_at"
      )
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      itemsQuery = itemsQuery.eq("status", status);
    }

    const { data: itemsData, error: itemsError } = await itemsQuery;

    if (itemsError) {
      logger.warn("[writeback/queue/GET] Items query error:", itemsError.message);
      return NextResponse.json(
        {
          items: [],
          stats: { pending: 0, completed: 0, failed: 0 },
        },
        { status: 200 }
      );
    }

    const items: WritebackQueueItem[] = (itemsData ?? []).map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      rule_id: row.rule_id ?? null,
      status: row.status as WritebackQueueItem["status"],
      connector_type: row.connector_type ?? "",
      action_type: row.action_type ?? "",
      external_ref: row.external_ref ?? null,
      created_at: row.created_at,
      completed_at: row.completed_at ?? null,
    }));

    // ---------------------------------------------------------------------------
    // Fetch aggregate stats (always the full org counts, regardless of status filter)
    // ---------------------------------------------------------------------------

    let pending = 0;
    let completed = 0;
    let failed = 0;

    try {
      // Run three count queries in parallel
      const [pendingResult, completedResult, failedResult] = await Promise.all([
        supabase
          .from("writeback_queue")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", workspaceId)
          .eq("status", "pending"),
        supabase
          .from("writeback_queue")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", workspaceId)
          .eq("status", "completed"),
        supabase
          .from("writeback_queue")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", workspaceId)
          .eq("status", "failed"),
      ]);

      pending = pendingResult.count ?? 0;
      completed = completedResult.count ?? 0;
      failed = failedResult.count ?? 0;
    } catch (statsErr) {
      // Stats are best-effort — don't fail the whole response
      logger.warn("[writeback/queue/GET] Stats query error:", statsErr);
    }

    const stats: WritebackQueueStats = { pending, completed, failed };

    return NextResponse.json({ items, stats });
  } catch (err) {
    logger.error("[writeback/queue/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
