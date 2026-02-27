/**
 * GET /api/brain/approvals
 *
 * Returns all pending (non-expired) HITL approval requests for the
 * authenticated org. Used by dashboard to show the approval queue.
 *
 * Response:
 *   {
 *     approvals: Array<HitlApproval>;
 *     total: number;
 *   }
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export async function GET() {
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

  // ── Step 4: Fetch pending approvals ──────────────────────────────────────
  try {
    const { data: approvals, error } = await supabase
      .from("hitl_approvals")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("requested_at", { ascending: false });

    if (error) {
      logger.warn("[approvals/GET] DB query failed", {
        orgId: organizationId,
        error: error.message,
      });
      return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
    }

    return NextResponse.json({
      approvals: approvals ?? [],
      total: (approvals ?? []).length,
    });
  } catch (err) {
    logger.warn("[approvals/GET] Unexpected error", {
      orgId: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
