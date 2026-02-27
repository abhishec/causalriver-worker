export const dynamic = "force-dynamic";
export const maxDuration = 30;
/**
 * POST /api/connectors/writeback/approve
 *
 * Approve or reject a pending write-back approval.
 * Admin/owner only.
 *
 * Body: { approvalId: string, action: 'approve' | 'reject', note?: string }
 *
 * On approve: updates status='approved', then executes the stored action_payload
 * On reject:  updates status='rejected' only
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { requireOrgRole } from "@/lib/auth/check-org-role";
import { executeApprovedWriteback } from "@/lib/connectors/writeback-dispatcher";

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: "No workspace found" }, { status: 403 });
    }

    // Admin/owner only
    const { allowed } = await requireOrgRole(supabase, user.id, workspaceId, ["admin", "owner"]);
    if (!allowed) {
      return NextResponse.json(
        { error: "Only workspace admins can approve write-backs" },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { approvalId, action, note } = body as {
      approvalId?: string;
      action?: string;
      note?: string;
    };

    if (!approvalId || typeof approvalId !== "string") {
      return NextResponse.json({ error: "Missing approvalId" }, { status: 400 });
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    // Fetch the approval record — must belong to this org
    const { data: approval, error: fetchError } = await supabase
      .from("writeback_approvals")
      .select("id, organization_id, connector_type, action_type, action_payload, status")
      .eq("id", approvalId)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (fetchError || !approval) {
      logger.warn("[writeback/approve] Approval not found:", {
        approvalId,
        workspaceId,
        error: fetchError?.message,
      });
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: `Approval already ${approval.status}` },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    if (action === "reject") {
      const { error: updateError } = await supabase
        .from("writeback_approvals")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          review_note: note ?? null,
          reviewed_at: now,
        })
        .eq("id", approvalId)
        .eq("organization_id", workspaceId);

      if (updateError) {
        logger.error("[writeback/approve] Failed to reject approval:", updateError.message);
        return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
      }

      logger.warn("[writeback/approve] Approval rejected:", {
        approvalId,
        workspaceId,
        userId: user.id,
      });

      return NextResponse.json({ success: true, action: "rejected", approvalId });
    }

    // action === "approve" — execute the write-back then update status based on result
    const execResult = await executeApprovedWriteback(supabase, {
      id: approval.id as string,
      organization_id: approval.organization_id as string,
      connector_type: approval.connector_type as string,
      action_type: approval.action_type as string,
      action_payload: approval.action_payload as Record<string, unknown>,
    });

    // Update approval status to reflect actual execution outcome.
    // If execution failed, mark as "failed" so admins know the action did not go through.
    // If execution succeeded, mark as "approved".
    const finalStatus = execResult.success ? "approved" : "failed";
    const { error: updateError } = await supabase
      .from("writeback_approvals")
      .update({
        status: finalStatus,
        reviewed_by: user.id,
        review_note: note ?? null,
        reviewed_at: now,
      })
      .eq("id", approvalId)
      .eq("organization_id", workspaceId);

    if (updateError) {
      logger.error("[writeback/approve] Failed to update approval status:", updateError.message);
      // Don't return error here — execution result is already determined
    }

    if (!execResult.success) {
      logger.warn("[writeback/approve] Write-back execution failed after approval:", {
        approvalId,
        connectorType: approval.connector_type,
        error: execResult.error,
      });
      return NextResponse.json(
        {
          success: false,
          action: "failed",
          approvalId,
          executionError: execResult.error,
        },
        { status: 207 } // 207 Multi-Status: approval reviewed but execution failed
      );
    }

    logger.warn("[writeback/approve] Write-back approved and executed:", {
      approvalId,
      connectorType: approval.connector_type,
      actionType: approval.action_type,
      workspaceId,
    });

    return NextResponse.json({
      success: true,
      action: "approved",
      approvalId,
      externalRef: execResult.externalRef ?? null,
    });
  } catch (err) {
    logger.error("[writeback/approve] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
