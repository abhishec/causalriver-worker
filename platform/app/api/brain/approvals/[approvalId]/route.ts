/**
 * POST /api/brain/approvals/[approvalId]
 *
 * Approve or reject a pending HITL approval gate.
 *
 * Body: { action: 'approve' | 'reject', note?: string }
 *
 * - Updates hitl_approvals: status, resolved_at, resolved_by, resolution_note
 * - If approved and the approval has a job_id: sets agent_queue.status = 'pending'
 *   so the cron worker picks it up on the next cycle.
 *
 * Response:
 *   200: { approval: HitlApproval }
 *   400: { error: string }
 *   401: { error: 'Unauthorized' }
 *   404: { error: 'Approval not found or already resolved' }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { resolveHitlApproval } from "@/lib/brain/hitl-gate";
import { logger } from "@/lib/logger";

interface ResolveBody {
  action: "approve" | "reject";
  note?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> }
) {
  // ── Step 1: createClient — isolated try/catch (Amplify Lambda safety) ────
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Step 2: getUser — isolated try/catch ─────────────────────────────────
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Step 3: Resolve org ───────────────────────────────────────────────────
  let organizationId: string | null = null;
  try {
    organizationId = await getCurrentWorkspaceId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!organizationId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 401 });
  }

  // ── Step 4: Parse route param ─────────────────────────────────────────────
  const { approvalId } = await params;
  if (!approvalId || typeof approvalId !== "string") {
    return NextResponse.json({ error: "approvalId is required" }, { status: 400 });
  }

  // ── Step 5: Parse body ────────────────────────────────────────────────────
  let body: ResolveBody;
  try {
    body = (await req.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, note } = body;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 }
    );
  }

  // ── Step 6: Resolve the approval ─────────────────────────────────────────
  try {
    const approval = await resolveHitlApproval(supabase, {
      approvalId,
      orgId: organizationId,
      resolvedBy: user.id,
      action,
      note,
    });

    if (!approval) {
      // resolveHitlApproval returns null when the record wasn't found,
      // wasn't in 'pending' state, or org check failed.
      return NextResponse.json(
        { error: "Approval not found or already resolved" },
        { status: 404 }
      );
    }

    logger.warn("[approvals/POST] Approval resolved", {
      approvalId,
      orgId: organizationId,
      action,
      userId: user.id,
      jobId: approval.job_id,
    });

    return NextResponse.json({ approval });
  } catch (err) {
    logger.warn("[approvals/POST] Unexpected error resolving approval", {
      approvalId,
      orgId: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
