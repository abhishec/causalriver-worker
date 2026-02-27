export const dynamic = "force-dynamic";
/**
 * GET /api/connectors/writeback/pending
 *
 * Returns all pending write-back approvals for the current org.
 * Auth: org member (any role can view).
 *
 * Response: { approvals: WritebackApproval[], total: number }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export interface WritebackApproval {
  id: string;
  organization_id: string;
  job_id: string | null;
  connector_type: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  requested_by: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export async function GET() {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ approvals: [], total: 0 }, { status: 200 });
    }

    const { data, error } = await supabase
      .from("writeback_approvals")
      .select(
        "id, organization_id, job_id, connector_type, action_type, action_payload, status, requested_by, reviewed_by, review_note, created_at, reviewed_at"
      )
      .eq("organization_id", workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      logger.warn("[writeback/pending/GET] Query error:", error.message);
      return NextResponse.json({ approvals: [], total: 0 }, { status: 200 });
    }

    const approvals: WritebackApproval[] = (data ?? []).map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      job_id: row.job_id ?? null,
      connector_type: row.connector_type,
      action_type: row.action_type,
      action_payload: (row.action_payload as Record<string, unknown>) ?? {},
      status: row.status as WritebackApproval["status"],
      requested_by: row.requested_by ?? null,
      reviewed_by: row.reviewed_by ?? null,
      review_note: row.review_note ?? null,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at ?? null,
    }));

    return NextResponse.json({ approvals, total: approvals.length });
  } catch (err) {
    logger.error("[writeback/pending/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
